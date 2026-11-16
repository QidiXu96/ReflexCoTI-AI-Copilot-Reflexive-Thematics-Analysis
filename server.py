from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from workflow_modules.AzureUtils import make_completion
from workflow_modules.agents_prepare import (
    DEFAULT_AGENT_PROFILES as AGENT_PERSONAS,
    generate_project_agent_reflection,
)
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse
from http.cookies import SimpleCookie
import cgi, contextlib, hashlib, hmac, importlib, io, json, os, re, secrets, shutil, sqlite3, sys, threading, time, uuid, traceback

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

ROOT = Path(__file__).resolve().parent
WORKFLOW_DIR = ROOT / "workflow_modules"
DATA_DIR = ROOT / "server_data"
UPLOAD_DIR = DATA_DIR / "uploads"
RUNS_DIR = DATA_DIR / "runs"
THEME_CODEBOOK_DIR = DATA_DIR / "theme_codebooks"
PROJECTS_DIR = DATA_DIR / "projects"
DATABASE_PATH = DATA_DIR / "reflexcoti.sqlite3"
CALIBRATION_POOL_PATH = DATA_DIR / "calibration_code_pool.json"
SESSION_TTL_SECONDS = 12 * 60 * 60
USER_ROLES = {"student", "pi"}

AGENTS = [
    "caregiver_experience",
    "geriatrician",
    "social_worker",
    "qualitative_researcher"
]

AGENT_LABELS = {
    "caregiver_experience": "Caregiver experience",
    "geriatrician": "Geriatrician",
    "social_worker": "Social worker",
    "qualitative_researcher": "Qualitative researcher"
}

CODE_COLOR = "#fde68a"
WORKFLOW_MAX_ROUNDS = 4
PUBLIC_STATIC_FILES = {"index.html", "app.js", "styles.css"}


def transcript_analysis_status(snapshot):
    """Return workflow status, including coding revisions awaiting Finish."""
    if not isinstance(snapshot, dict) or snapshot.get("codeReviewStage") != "complete":
        return "in_progress"
    if "codingRevision" not in snapshot:
        return "finished"  # Backward compatibility for projects saved before revision tracking.
    coding_revision = max(1, int(snapshot.get("codingRevision") or 1))
    finished_revision = snapshot.get("lastFinishedCodingRevision")
    if finished_revision is None:
        finished_revision = snapshot.get("lastExportedCodingRevision")
    return "finished" if max(0, int(finished_revision or 0)) >= coding_revision else "needs_finish"


def reflexcoti_snapshot_counts(snapshot):
    """Return the totals shown in the transcript AI Coding workspace."""
    export_codes = []
    ai_coding_started = bool(snapshot.get("aiCodingStarted") or snapshot.get("analysisReady"))
    for code in snapshot.get("codes", []):
        if not isinstance(code, dict):
            continue
        if code.get("◇"):
            continue
        # Human codes created before AI Coding only become part of the final
        # collaborative result when the user explicitly includes them. Human
        # codes added inside AI Coding have createdFromSelection=false and are
        # part of that result automatically.
        if code.get("sourceClass") == "human" and code.get("createdFromSelection") and (
            not ai_coding_started or not code.get("includedAfterAiReview")
        ):
            continue
        if code.get("reviewStatus") not in {"accepted", "revised", "split", "merged"}:
            continue
        export_codes.append(code)

    excerpt_count = sum(len(_code_excerpts_for_comparison(code)) for code in export_codes)

    return len(export_codes), excerpt_count

EMPTY_AGENT_INITIAL_REFLECTIONS = {agent: {"assumptions": ""} for agent in AGENTS}

JOBS = {}
JOBS_LOCK = threading.Lock()
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()
PROJECT_CODEBOOK_LOCKS = {}
PROJECT_CODEBOOK_LOCKS_LOCK = threading.Lock()
PROJECT_CODEBOOK_UPDATES = {}
PROJECT_CODEBOOK_UPDATES_LOCK = threading.Lock()


def project_codebook_lock(project_id):
    """Serialize cumulative codebook updates for one project."""
    with PROJECT_CODEBOOK_LOCKS_LOCK:
        return PROJECT_CODEBOOK_LOCKS.setdefault(str(project_id), threading.Lock())


def begin_project_codebook_update(project_id, transcript_id=None):
    """Expose an in-flight cumulative codebook update to concurrent requests."""
    key = str(project_id)
    with PROJECT_CODEBOOK_UPDATES_LOCK:
        state = PROJECT_CODEBOOK_UPDATES.setdefault(key, {
            "count": 0,
            "started_at": time.time(),
            "transcript_ids": [],
        })
        state["count"] += 1
        transcript_key = str(transcript_id or "").strip()
        if transcript_key and transcript_key not in state["transcript_ids"]:
            state["transcript_ids"].append(transcript_key)


def end_project_codebook_update(project_id, transcript_id=None):
    key = str(project_id)
    with PROJECT_CODEBOOK_UPDATES_LOCK:
        state = PROJECT_CODEBOOK_UPDATES.get(key)
        if not state:
            return
        transcript_key = str(transcript_id or "").strip()
        if transcript_key in state["transcript_ids"]:
            state["transcript_ids"].remove(transcript_key)
        state["count"] = max(0, int(state.get("count") or 0) - 1)
        if state["count"] == 0:
            PROJECT_CODEBOOK_UPDATES.pop(key, None)


def project_codebook_update_status(project_id):
    with PROJECT_CODEBOOK_UPDATES_LOCK:
        state = PROJECT_CODEBOOK_UPDATES.get(str(project_id))
        if not state:
            return {"processing": False, "processing_started_at": None}
        return {
            "processing": True,
            "processing_started_at": state.get("started_at"),
        }


def reusable_identify_job(owner_id, project_id, transcript_id):
    if not project_id or not transcript_id:
        return None, None
    with JOBS_LOCK:
        matches = [
            (job_id, job)
            for job_id, job in JOBS.items()
            if job.get("owner_id") == owner_id
            and job.get("project_id") == project_id
            and job.get("persistent_transcript_id") == transcript_id
            and not job.get("invalidated")
            and job.get("status") in {"queued", "running", "completed"}
        ]
    if not matches:
        return None, None
    return max(matches, key=lambda item: item[1].get("created_at", 0))


def invalidate_identify_jobs(owner_id, project_id, transcript_id=None):
    with JOBS_LOCK:
        for job in JOBS.values():
            if job.get("owner_id") != owner_id or job.get("project_id") != project_id:
                continue
            if transcript_id is not None and job.get("persistent_transcript_id") != transcript_id:
                continue
            job["invalidated"] = True


def migrate_export_batch_scopes(connection):
    """Allow standalone Human Codes archives without losing existing exports."""
    row = connection.execute(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'export_batches'"
    ).fetchone()
    schema_sql = str(row["sql"] or "") if row else ""
    if not schema_sql or "human_coding" in schema_sql:
        return

    connection.commit()
    connection.execute("PRAGMA foreign_keys=OFF")
    try:
        connection.executescript(
            """
            BEGIN IMMEDIATE;
            CREATE TABLE export_batches_new (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                transcript_id TEXT REFERENCES transcripts(id) ON DELETE CASCADE,
                scope TEXT NOT NULL CHECK(scope IN ('coding', 'human_coding', 'themes')),
                created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                username_snapshot TEXT NOT NULL,
                project_name_snapshot TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            INSERT INTO export_batches_new(
                id, project_id, transcript_id, scope, created_by,
                username_snapshot, project_name_snapshot, relative_path, created_at
            )
            SELECT
                id, project_id, transcript_id, scope, created_by,
                username_snapshot, project_name_snapshot, relative_path, created_at
            FROM export_batches;
            DROP TABLE export_batches;
            ALTER TABLE export_batches_new RENAME TO export_batches;
            CREATE INDEX export_batches_project_idx
                ON export_batches(project_id, created_at DESC);
            COMMIT;
            """
        )
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
    finally:
        connection.execute("PRAGMA foreign_keys=ON")

    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise RuntimeError("Export schema migration introduced foreign-key violations.")
    connection.execute("PRAGMA optimize")

def ensure_dirs():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    THEME_CODEBOOK_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    with database() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'pi')),
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                research_question TEXT NOT NULL,
                interviewee TEXT NOT NULL,
                initial_reflections TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id, updated_at DESC);
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                word_count INTEGER NOT NULL DEFAULT 0,
                codes_count INTEGER NOT NULL DEFAULT 0,
                excerpts_count INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS transcripts_project_idx ON transcripts(project_id, created_at);
            CREATE TABLE IF NOT EXISTS transcript_analysis (
                transcript_id TEXT PRIMARY KEY REFERENCES transcripts(id) ON DELETE CASCADE,
                snapshot TEXT NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_analysis (
                project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
                snapshot TEXT NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_codebooks (
                project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
                codebook_id TEXT NOT NULL,
                current_size INTEGER NOT NULL DEFAULT 0,
                previous_size INTEGER NOT NULL DEFAULT 0,
                net_growth INTEGER NOT NULL DEFAULT 0,
                included_revisions TEXT NOT NULL DEFAULT '{}',
                update_history TEXT NOT NULL DEFAULT '[]',
                new_code_names TEXT NOT NULL DEFAULT '[]',
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS export_batches (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                transcript_id TEXT REFERENCES transcripts(id) ON DELETE CASCADE,
                scope TEXT NOT NULL CHECK(scope IN ('coding', 'human_coding', 'themes')),
                created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                username_snapshot TEXT NOT NULL,
                project_name_snapshot TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS export_batches_project_idx
                ON export_batches(project_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS export_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at REAL NOT NULL,
                UNIQUE(batch_id, filename)
            );
            CREATE TABLE IF NOT EXISTS pi_student_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pi_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'declined')),
                created_at REAL NOT NULL,
                responded_at REAL,
                UNIQUE(pi_id, student_id),
                CHECK(pi_id != student_id)
            );
            CREATE INDEX IF NOT EXISTS pi_student_connections_pi_idx
                ON pi_student_connections(pi_id, status, created_at DESC);
            CREATE INDEX IF NOT EXISTS pi_student_connections_student_idx
                ON pi_student_connections(student_id, status, created_at DESC);
            CREATE TABLE IF NOT EXISTS peer_review_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'declined')),
                created_at REAL NOT NULL,
                responded_at REAL,
                UNIQUE(reviewer_id, owner_id),
                CHECK(reviewer_id != owner_id)
            );
            CREATE INDEX IF NOT EXISTS peer_review_connections_reviewer_idx
                ON peer_review_connections(reviewer_id, status, created_at DESC);
            CREATE INDEX IF NOT EXISTS peer_review_connections_owner_idx
                ON peer_review_connections(owner_id, status, created_at DESC);
            CREATE TABLE IF NOT EXISTS senior_code_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                senior_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                senior_username TEXT NOT NULL,
                coding_revision INTEGER NOT NULL,
                modified_code_ids TEXT NOT NULL,
                memos TEXT NOT NULL,
                exported_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS senior_code_revisions_transcript_idx
                ON senior_code_revisions(transcript_id, exported_at DESC);
            CREATE TABLE IF NOT EXISTS senior_theme_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                senior_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                senior_username TEXT NOT NULL,
                theme_revision INTEGER NOT NULL,
                modified_theme_ids TEXT NOT NULL,
                memos TEXT NOT NULL,
                exported_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS senior_theme_revisions_project_idx
                ON senior_theme_revisions(project_id, exported_at DESC);
            CREATE TABLE IF NOT EXISTS peer_suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reviewer_username_snapshot TEXT NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                transcript_id TEXT REFERENCES transcripts(id) ON DELETE CASCADE,
                scope TEXT NOT NULL CHECK(scope IN ('coding', 'themes')),
                action TEXT NOT NULL CHECK(action IN ('accept', 'revise', 'reject', 'merge', 'split')),
                target_ids TEXT NOT NULL,
                proposed_value TEXT NOT NULL DEFAULT '{}',
                memo TEXT NOT NULL,
                base_revision INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
                created_at REAL NOT NULL,
                resolved_at REAL,
                CHECK(owner_id != reviewer_id),
                CHECK((scope = 'coding' AND transcript_id IS NOT NULL AND action != 'split') OR scope = 'themes')
            );
            CREATE INDEX IF NOT EXISTS peer_suggestions_owner_status_idx
                ON peer_suggestions(owner_id, status, created_at DESC);
            CREATE INDEX IF NOT EXISTS peer_suggestions_project_scope_idx
                ON peer_suggestions(project_id, scope, transcript_id, status);
            CREATE INDEX IF NOT EXISTS peer_suggestions_reviewer_idx
                ON peer_suggestions(reviewer_id, created_at DESC);
            """
        )
        user_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)")
        }
        if "role" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'pi'))"
            )
        export_batch_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(export_batches)")
        }
        if "project_name_snapshot" not in export_batch_columns:
            connection.execute(
                "ALTER TABLE export_batches ADD COLUMN project_name_snapshot TEXT NOT NULL DEFAULT ''"
            )
        migrate_export_batch_scopes(connection)
        project_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(projects)")
        }
        if "initial_reflections" not in project_columns:
            connection.execute(
                "ALTER TABLE projects ADD COLUMN initial_reflections TEXT NOT NULL DEFAULT '{}'"
            )
        project_codebook_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(project_codebooks)")
        }
        if "update_history" not in project_codebook_columns:
            connection.execute(
                "ALTER TABLE project_codebooks ADD COLUMN update_history TEXT NOT NULL DEFAULT '[]'"
            )
        if "new_code_names" not in project_codebook_columns:
            connection.execute(
                "ALTER TABLE project_codebooks ADD COLUMN new_code_names TEXT NOT NULL DEFAULT '[]'"
            )
        connection.execute(
            """UPDATE export_batches
               SET project_name_snapshot = COALESCE(
                   (SELECT name FROM projects WHERE projects.id = export_batches.project_id), ''
               )
               WHERE project_name_snapshot = ''"""
        )
        for row in connection.execute("SELECT transcript_id, snapshot FROM transcript_analysis"):
            try:
                codes_count, excerpts_count = reflexcoti_snapshot_counts(json.loads(row["snapshot"]))
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            connection.execute(
                "UPDATE transcripts SET codes_count=?, excerpts_count=? WHERE id=?",
                (codes_count, excerpts_count, row["transcript_id"]),
            )
        connection.execute("PRAGMA optimize")


def database():
    connection = sqlite3.connect(str(DATABASE_PATH), timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def json_body(handler, max_bytes=20 * 1024 * 1024):
    length = int(handler.headers.get("Content-Length", "0") or 0)
    if length > max_bytes:
        raise ValueError("Request is too large.")
    return json.loads(handler.rfile.read(length).decode("utf-8") or "{}")


def normalize_username(value):
    username = str(value or "").strip()
    if not username:
        raise ValueError("Username is required.")
    return username


def password_digest(password, salt):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


def validate_password(password):
    if len(password or "") < 8:
        raise ValueError("Password must contain at least 8 characters.")


def normalize_user_role(value):
    role = str(value or "").strip().lower()
    if role not in USER_ROLES:
        raise ValueError("Select Junior researcher or Senior researcher as your role.")
    return role


def session_cookie(token, max_age=SESSION_TTL_SECONDS):
    return f"reflexcoti_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}"


def create_session(user_row):
    token = secrets.token_urlsafe(32)
    with SESSIONS_LOCK:
        SESSIONS[token] = {
            "user_id": int(user_row["id"]),
            "username": user_row["username"],
            "role": user_row["role"],
            "expires_at": time.time() + SESSION_TTL_SECONDS,
        }
    return token


def session_user(handler):
    cookie = SimpleCookie()
    cookie.load(handler.headers.get("Cookie", ""))
    morsel = cookie.get("reflexcoti_session")
    if not morsel:
        return None
    token = morsel.value
    with SESSIONS_LOCK:
        session = SESSIONS.get(token)
        if not session or session["expires_at"] <= time.time():
            SESSIONS.pop(token, None)
            return None
        return dict(session, token=token)


def require_user(handler):
    user = session_user(handler)
    if not user:
        send_json(handler, 401, {"error": "Please sign in again."})
    return user


def create_pi_student_invitation(pi_id, student_username):
    username = normalize_username(student_username)
    with database() as connection:
        student = connection.execute(
            "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE AND role = 'student'",
            (username,),
        ).fetchone()
        if not student:
            raise ValueError("Junior researcher account not found. Check the exact username and try again.")
        existing = connection.execute(
            "SELECT id, status FROM pi_student_connections WHERE pi_id = ? AND student_id = ?",
            (pi_id, student["id"]),
        ).fetchone()
        if existing and existing["status"] == "active":
            raise ValueError("This junior researcher is already connected to you.")
        if existing and existing["status"] == "pending":
            raise ValueError("An invitation is already pending for this junior researcher.")
        now = time.time()
        if existing:
            connection.execute(
                "UPDATE pi_student_connections SET status = 'pending', created_at = ?, responded_at = NULL WHERE id = ?",
                (now, existing["id"]),
            )
            connection_id = existing["id"]
        else:
            cursor = connection.execute(
                "INSERT INTO pi_student_connections(pi_id, student_id, status, created_at) VALUES (?, ?, 'pending', ?)",
                (pi_id, student["id"], now),
            )
            connection_id = cursor.lastrowid
    return {"id": int(connection_id), "student_id": int(student["id"]), "username": student["username"], "status": "pending", "created_at": now}


def respond_to_pi_invitation(connection_id, student_id, action):
    if action not in {"accept", "decline"}:
        raise ValueError("Choose Accept or Decline.")
    with database() as connection:
        invitation = connection.execute(
            """SELECT c.id, c.status, c.pi_id, p.username AS pi_username
               FROM pi_student_connections c JOIN users p ON p.id = c.pi_id
               WHERE c.id = ? AND c.student_id = ?""",
            (connection_id, student_id),
        ).fetchone()
        if not invitation:
            raise ValueError("Invitation not found.")
        if invitation["status"] != "pending":
            raise ValueError("This invitation has already been answered.")
        status = "active" if action == "accept" else "declined"
        responded_at = time.time()
        connection.execute(
            "UPDATE pi_student_connections SET status = ?, responded_at = ? WHERE id = ?",
            (status, responded_at, connection_id),
        )
    return {"id": int(connection_id), "pi_id": int(invitation["pi_id"]), "username": invitation["pi_username"], "status": status, "responded_at": responded_at}


def create_peer_review_invitation(reviewer_id, owner_username):
    username = normalize_username(owner_username)
    with database() as connection:
        owner = connection.execute(
            "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE AND role = 'student'",
            (username,),
        ).fetchone()
        if not owner:
            raise ValueError("Junior researcher account not found. Check the exact username and try again.")
        if int(owner["id"]) == int(reviewer_id):
            raise ValueError("Choose another junior researcher for peer review.")
        existing = connection.execute(
            "SELECT id, status FROM peer_review_connections WHERE reviewer_id = ? AND owner_id = ?",
            (reviewer_id, owner["id"]),
        ).fetchone()
        if existing and existing["status"] == "active":
            raise ValueError("This junior researcher has already approved your peer-review access.")
        if existing and existing["status"] == "pending":
            raise ValueError("A peer-review request is already pending for this junior researcher.")
        now = time.time()
        if existing:
            connection.execute(
                "UPDATE peer_review_connections SET status = 'pending', created_at = ?, responded_at = NULL WHERE id = ?",
                (now, existing["id"]),
            )
            connection_id = existing["id"]
        else:
            cursor = connection.execute(
                "INSERT INTO peer_review_connections(reviewer_id, owner_id, status, created_at) VALUES (?, ?, 'pending', ?)",
                (reviewer_id, owner["id"], now),
            )
            connection_id = cursor.lastrowid
    return {"id": int(connection_id), "owner_id": int(owner["id"]), "username": owner["username"],
            "status": "pending", "created_at": now}


def respond_to_peer_review_invitation(connection_id, owner_id, action):
    if action not in {"accept", "decline"}:
        raise ValueError("Choose Accept or Decline.")
    with database() as connection:
        invitation = connection.execute(
            """SELECT c.id, c.status, c.reviewer_id, r.username AS reviewer_username
               FROM peer_review_connections c JOIN users r ON r.id = c.reviewer_id
               WHERE c.id = ? AND c.owner_id = ?""",
            (connection_id, owner_id),
        ).fetchone()
        if not invitation:
            raise ValueError("Peer-review request not found.")
        if invitation["status"] != "pending":
            raise ValueError("This peer-review request has already been answered.")
        status = "active" if action == "accept" else "declined"
        responded_at = time.time()
        connection.execute(
            "UPDATE peer_review_connections SET status = ?, responded_at = ? WHERE id = ?",
            (status, responded_at, connection_id),
        )
    return {"id": int(connection_id), "reviewer_id": int(invitation["reviewer_id"]),
            "username": invitation["reviewer_username"], "status": status, "responded_at": responded_at}


def peer_review_connections_for_user(user_id):
    with database() as connection:
        received_rows = connection.execute(
            """SELECT c.id, c.reviewer_id, c.status, c.created_at, r.username
               FROM peer_review_connections c JOIN users r ON r.id = c.reviewer_id
               WHERE c.owner_id = ? AND c.status = 'pending'
               ORDER BY c.created_at DESC""",
            (user_id,),
        ).fetchall()
        sent_rows = connection.execute(
            """SELECT c.id, c.owner_id, c.status, c.created_at, c.responded_at, o.username,
                      (SELECT COUNT(DISTINCT eb.project_id) FROM projects p
                       JOIN export_batches eb ON eb.project_id = p.id
                       WHERE p.owner_id = c.owner_id) AS exported_project_count
               FROM peer_review_connections c JOIN users o ON o.id = c.owner_id
               WHERE c.reviewer_id = ? AND c.status IN ('pending', 'active')
               ORDER BY CASE c.status WHEN 'active' THEN 0 ELSE 1 END,
                        COALESCE(c.responded_at, c.created_at) DESC""",
            (user_id,),
        ).fetchall()
    pending_received = [{
        "id": int(row["id"]), "reviewer_id": int(row["reviewer_id"]),
        "username": row["username"], "status": row["status"], "created_at": row["created_at"],
    } for row in received_rows]
    sent = [{
        "id": int(row["id"]), "owner_id": int(row["owner_id"]),
        "username": row["username"], "status": row["status"],
        "created_at": row["created_at"], "responded_at": row["responded_at"],
        "exported_project_count": int(row["exported_project_count"] or 0),
    } for row in sent_rows]
    return {
        "pending": pending_received,
        "pending_sent": [item for item in sent if item["status"] == "pending"],
        "approved": [item for item in sent if item["status"] == "active"],
    }


def projects_for_connected_student(pi_id, student_id):
    with database() as connection:
        student = connection.execute(
            """SELECT s.id, s.username
               FROM pi_student_connections c
               JOIN users s ON s.id = c.student_id
               WHERE c.pi_id = ? AND c.student_id = ? AND c.status = 'active'""",
            (pi_id, student_id),
        ).fetchone()
        if not student:
            raise PermissionError("This junior researcher is not connected to your Senior researcher account.")
        rows = connection.execute(
            """SELECT p.*, COUNT(t.id) AS transcript_count,
                      COALESCE(SUM(t.codes_count), 0) AS codes_count,
                      COALESCE(SUM(t.excerpts_count), 0) AS excerpts_count
               FROM projects p LEFT JOIN transcripts t ON t.project_id = p.id
               WHERE p.owner_id = ? GROUP BY p.id ORDER BY p.updated_at DESC""",
            (student_id,),
        ).fetchall()
    return {
        "student": {"id": int(student["id"]), "username": student["username"]},
        "projects": [
            {
                **public_project(row, row["transcript_count"], row["codes_count"], row["excerpts_count"]),
                **project_codebook_card_counts(row["id"]),
            }
            for row in rows
        ],
    }


def connected_student_project_review(pi_id, student_id, project_id):
    with database() as connection:
        project = connection.execute(
            """SELECT p.*, s.username AS student_username
               FROM pi_student_connections c
               JOIN users s ON s.id = c.student_id
               JOIN projects p ON p.owner_id = c.student_id
               WHERE c.pi_id = ? AND c.student_id = ? AND c.status = 'active' AND p.id = ?""",
            (pi_id, student_id, project_id),
        ).fetchone()
        if not project:
            raise PermissionError("This project is not available through your Senior researcher connection.")
        transcripts = connection.execute(
            """SELECT t.*, ta.snapshot AS analysis_snapshot
               FROM transcripts t LEFT JOIN transcript_analysis ta ON ta.transcript_id = t.id
               WHERE t.project_id = ? ORDER BY t.created_at""",
            (project_id,),
        ).fetchall()
        theme_row = connection.execute(
            "SELECT snapshot, updated_at FROM project_analysis WHERE project_id = ?",
            (project_id,),
        ).fetchone()
    theme_snapshot = json.loads(theme_row["snapshot"]) if theme_row else None
    themes = theme_snapshot.get("themes") if isinstance(theme_snapshot, dict) else []
    return {
        "student": {"id": int(student_id), "username": project["student_username"]},
        "project": public_project(
            project,
            len(transcripts),
            sum(row["codes_count"] for row in transcripts),
            sum(row["excerpts_count"] for row in transcripts),
        ),
        "transcripts": [public_transcript(row) for row in transcripts],
        "theme_count": len(themes or []),
        "has_theme_analysis": bool(theme_snapshot),
    }


def connected_student_analysis(pi_id, student_id, project_id, transcript_id=None):
    with database() as connection:
        project = connection.execute(
            """SELECT p.id FROM pi_student_connections c
               JOIN projects p ON p.owner_id = c.student_id
               WHERE c.pi_id = ? AND c.student_id = ? AND c.status = 'active' AND p.id = ?""",
            (pi_id, student_id, project_id),
        ).fetchone()
        if not project:
            raise PermissionError("This project is not available through your Senior researcher connection.")
        if transcript_id is None:
            row = connection.execute(
                "SELECT snapshot, updated_at FROM project_analysis WHERE project_id = ?",
                (project_id,),
            ).fetchone()
            has_theme_export = bool(connection.execute(
                "SELECT 1 FROM export_batches WHERE project_id = ? AND scope = 'themes' LIMIT 1",
                (project_id,),
            ).fetchone())
        else:
            transcript = connection.execute(
                "SELECT id FROM transcripts WHERE id = ? AND project_id = ?",
                (transcript_id, project_id),
            ).fetchone()
            if not transcript:
                raise PermissionError("This transcript is not part of the connected junior researcher project.")
            row = connection.execute(
                "SELECT snapshot, updated_at FROM transcript_analysis WHERE transcript_id = ?",
                (transcript_id,),
            ).fetchone()
            has_coding_export = bool(connection.execute(
                """SELECT 1 FROM export_batches
                   WHERE project_id = ? AND transcript_id = ? AND scope = 'coding'
                   LIMIT 1""",
                (project_id, transcript_id),
            ).fetchone())
    snapshot = json.loads(row["snapshot"]) if row else None
    response = {"snapshot": snapshot, "updated_at": row["updated_at"] if row else None}
    if transcript_id is None:
        senior_review = snapshot.get("seniorThemeReview") if isinstance(snapshot, dict) else None
        pending_for_pi = (
            isinstance(senior_review, dict) and senior_review.get("status") == "pending_export"
            and int(senior_review.get("senior_user_id") or 0) == int(pi_id)
        )
        response["analysis_status"] = theme_analysis_status(snapshot)
        response["can_modify_themes"] = bool(
            snapshot and has_theme_export
            and (theme_analysis_status(snapshot) == "finished" or pending_for_pi)
        )
    else:
        senior_review = snapshot.get("seniorCodeReview") if isinstance(snapshot, dict) else None
        pending_for_pi = (
            isinstance(senior_review, dict)
            and senior_review.get("status") == "pending_export"
            and int(senior_review.get("senior_user_id") or 0) == int(pi_id)
        )
        response["analysis_status"] = transcript_analysis_status(snapshot)
        response["can_modify_codes"] = bool(
            snapshot and has_coding_export
            and (transcript_analysis_status(snapshot) == "finished" or pending_for_pi)
        )
    return response


def _connected_student_code_snapshot(pi_id, student_id, project_id, transcript_id):
    with database() as connection:
        row = connection.execute(
            """SELECT ta.snapshot, s.username AS senior_username,
                      EXISTS(
                          SELECT 1 FROM export_batches eb
                          WHERE eb.project_id = p.id AND eb.transcript_id = t.id
                            AND eb.scope = 'coding'
                      ) AS has_coding_export
               FROM pi_student_connections c
               JOIN users s ON s.id = c.pi_id
               JOIN projects p ON p.owner_id = c.student_id
               JOIN transcripts t ON t.project_id = p.id
               LEFT JOIN transcript_analysis ta ON ta.transcript_id = t.id
               WHERE c.pi_id = ? AND c.student_id = ? AND c.status = 'active'
                 AND p.id = ? AND t.id = ?""",
            (pi_id, student_id, project_id, transcript_id),
        ).fetchone()
    if not row:
        raise PermissionError("This transcript is not available through your Senior researcher connection.")
    if not row["snapshot"]:
        raise ValueError("The junior researcher must finish and export this transcript before Senior modification.")
    if not row["has_coding_export"]:
        raise ValueError("The junior researcher must finish and export this transcript before Senior modification.")
    return json.loads(row["snapshot"]), row["senior_username"]


def _code_excerpts_for_comparison(code):
    values = []
    for field in ("excerpts", "quotes", "quote", "excerpt"):
        raw_value = code.get(field)
        if isinstance(raw_value, list):
            values.extend(raw_value)
        elif raw_value is not None and str(raw_value).strip():
            values.append(raw_value)

    excerpts = []
    seen = set()
    for value in values:
        text = re.sub(r'^"\s*|\s*"$', "", str(value or "")).strip()
        key = re.sub(r"\s+", " ", text).strip().casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        excerpts.append(text)
    return excerpts


def _code_revision_signature(code):
    return {
        "title": str(code.get("title") or ""),
        "excerpts": _code_excerpts_for_comparison(code),
        "reviewStatus": str(code.get("reviewStatus") or ""),
    }


def validate_connected_student_code_revision(pi_id, student_id, project_id, transcript_id, snapshot):
    if not isinstance(snapshot, dict):
        raise ValueError("Invalid coding analysis snapshot.")
    existing, senior_username = _connected_student_code_snapshot(
        pi_id, student_id, project_id, transcript_id
    )
    existing_review = existing.get("seniorCodeReview") or {}
    pending_for_pi = (
        existing_review.get("status") == "pending_export"
        and int(existing_review.get("senior_user_id") or 0) == int(pi_id)
    )
    if transcript_analysis_status(existing) != "finished" and not pending_for_pi:
        raise ValueError("The junior researcher must finish and export this transcript before Senior modification.")
    if (snapshot.get("originalAiCodes") or []) != (existing.get("originalAiCodes") or []):
        raise ValueError("Senior researchers cannot change the original AI coding record.")

    existing_codes = existing.get("codes") or []
    incoming_codes = snapshot.get("codes") or []
    existing_by_id = {str(code.get("id") or index): code for index, code in enumerate(existing_codes)}
    incoming_by_id = {str(code.get("id") or index): code for index, code in enumerate(incoming_codes)}

    modified_ids = []
    memos = {}
    removed = set(existing_by_id) - set(incoming_by_id)
    added = set(incoming_by_id) - set(existing_by_id)
    if removed or added:
        if not removed or not added:
            raise ValueError("Senior researchers can add or remove codes only by merging two or more existing codes.")
        covered_sources = []
        for code_id in added:
            merged_code = incoming_by_id[code_id]
            source_ids = [str(value) for value in merged_code.get("seniorSourceCodeIds") or []]
            if len(source_ids) < 2 or not set(source_ids).issubset(set(existing_by_id)):
                raise ValueError("Senior merged codes must identify at least two existing source codes.")
            if not merged_code.get("mergedFromCodes") or not any(
                isinstance(entry, dict)
                and entry.get("operation") == "merged"
                and entry.get("method") == "edit_myself"
                for entry in merged_code.get("transformationHistory") or []
            ):
                raise ValueError("Senior structural code changes must be recorded as a manual merge.")
            expected_excerpts = {
                re.sub(r"\s+", " ", excerpt).strip().casefold()
                for source_id in source_ids
                for excerpt in _code_excerpts_for_comparison(existing_by_id[source_id])
                if excerpt.strip()
            }
            received_excerpts = {
                re.sub(r"\s+", " ", excerpt).strip().casefold()
                for excerpt in _code_excerpts_for_comparison(merged_code)
                if excerpt.strip()
            }
            if received_excerpts != expected_excerpts:
                raise ValueError("Senior merged codes must preserve the source codes' supporting excerpts.")
            covered_sources.extend(source_ids)
        if len(covered_sources) != len(set(covered_sources)) or set(covered_sources) != removed:
            raise ValueError("Senior code merges must replace each removed source code exactly once.")

    for code_id in incoming_by_id:
        incoming_code = incoming_by_id[code_id]
        existing_code = existing_by_id.get(code_id)
        if existing_code is not None and _code_revision_signature(incoming_code) == _code_revision_signature(existing_code):
            continue
        audit = incoming_code.get("modifiedBySenior") or {}
        memo = str(audit.get("memo") or "").strip()
        if int(audit.get("user_id") or 0) != int(pi_id) or not memo:
            raise ValueError("Every Senior code modification requires a memo and Senior attribution.")
        if str(incoming_code.get("reviewStatus") or "") not in {"", "accepted", "revised", "merged", "rejected"}:
            raise ValueError("The Senior code decision is invalid.")
        old_history = (existing_code.get("transformationHistory") or []) if existing_code else []
        new_history = incoming_code.get("transformationHistory") or []
        for entry in new_history[len(old_history):]:
            if isinstance(entry, dict) and entry.get("method") != "edit_myself":
                raise ValueError("Senior code modifications must be completed manually without AI assistance.")
        modified_ids.append(code_id)
        memos[code_id] = memo

    if not modified_ids and not pending_for_pi:
        raise ValueError("No Senior code modification was found.")
    review = snapshot.get("seniorCodeReview") or {}
    if int(review.get("senior_user_id") or 0) != int(pi_id):
        raise ValueError("Senior review attribution is missing.")
    now = time.time()
    snapshot["seniorCodeReview"] = {
        **review,
        "status": "pending_export",
        "senior_user_id": int(pi_id),
        "senior_username": senior_username,
        "student_user_id": int(student_id),
        "started_at": existing_review.get("started_at") or review.get("started_at") or now,
        "updated_at": now,
        "modified_code_ids": sorted(set((existing_review.get("modified_code_ids") or []) + modified_ids)),
    }
    return snapshot, senior_username, memos


def save_connected_student_code_revision(pi_id, student_id, project_id, transcript_id, snapshot):
    snapshot, _, _ = validate_connected_student_code_revision(
        pi_id, student_id, project_id, transcript_id, snapshot
    )
    now = time.time()
    codes_count, excerpts_count = reflexcoti_snapshot_counts(snapshot)
    with database() as connection:
        connection.execute(
            "UPDATE transcript_analysis SET snapshot = ?, updated_at = ? WHERE transcript_id = ?",
            (json.dumps(snapshot, ensure_ascii=False), now, transcript_id),
        )
        connection.execute(
            "UPDATE transcripts SET codes_count = ?, excerpts_count = ?, updated_at = ? WHERE id = ?",
            (codes_count, excerpts_count, now, transcript_id),
        )
        connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
    return {
        "saved": True,
        "updated_at": now,
        "codes_count": codes_count,
        "excerpts_count": excerpts_count,
        "analysis_status": transcript_analysis_status(snapshot),
        "snapshot": snapshot,
    }


def export_connected_student_code_revision(
    pi_id, student_id, project_id, transcript_id, snapshot, filename, content
):
    snapshot, senior_username, _ = validate_connected_student_code_revision(
        pi_id, student_id, project_id, transcript_id, snapshot
    )
    if snapshot.get("codeReviewStage") != "complete":
        raise ValueError("Finish the Senior code amendment before exporting it.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}\.json", filename or "", re.IGNORECASE):
        raise ValueError("The reviewed coding export must be a JSON file.")
    if not isinstance(content, str) or len(content.encode("utf-8")) > 10 * 1024 * 1024:
        raise ValueError("The reviewed coding export is invalid or too large.")
    try:
        exported_payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("The reviewed coding export is not valid JSON.") from exc
    if not isinstance(exported_payload, dict) or not isinstance(exported_payload.get("codes"), list):
        raise ValueError("The reviewed coding export does not contain codes.")
    expected_export_codes = []
    for code in snapshot.get("codes") or []:
        if code.get("◇"):
            continue
        if code.get("sourceClass") == "human" and code.get("createdFromSelection") and not code.get("includedAfterAiReview"):
            continue
        if code.get("reviewStatus") not in {"accepted", "revised", "split", "merged"}:
            continue
        expected_export_codes.append({
            "name": str(code.get("title") or ""),
            "excerpts": _code_excerpts_for_comparison(code),
        })
    received_export_codes = [{
        "name": str(code.get("code name") or ""),
        "excerpts": [str(value).strip().strip('"') for value in code.get("excerpts") or []],
    } for code in exported_payload.get("codes") if isinstance(code, dict)]
    signature_key = lambda value: json.dumps(value, sort_keys=True, ensure_ascii=False)
    if sorted(map(signature_key, received_export_codes)) != sorted(map(signature_key, expected_export_codes)):
        raise ValueError("The reviewed coding export does not match the saved Senior revision.")

    now = time.time()
    coding_revision = max(1, int(snapshot.get("codingRevision") or 1))
    review = snapshot.get("seniorCodeReview") or {}
    modified_ids = [str(value) for value in review.get("modified_code_ids") or []]
    memos = {
        str(code.get("id")): str((code.get("modifiedBySenior") or {}).get("memo") or "")
        for code in snapshot.get("codes") or []
        if str(code.get("id")) in modified_ids
    }
    snapshot["lastExportedCodingRevision"] = coding_revision
    snapshot["codingExportedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
    snapshot["seniorCodeReview"] = {
        **review,
        "status": "exported",
        "senior_user_id": int(pi_id),
        "senior_username": senior_username,
        "student_user_id": int(student_id),
        "updated_at": now,
        "exported_at": now,
    }
    exported_payload["coding_revision"] = coding_revision
    exported_payload["senior_review"] = snapshot["seniorCodeReview"]
    encoded = json.dumps(exported_payload, indent=2, ensure_ascii=False).encode("utf-8")
    batch, stored_files = replace_reviewed_export_json_file(
        project_id,
        transcript_id,
        "coding",
        [(filename, "application/json; charset=utf-8", encoded)],
        now,
    )
    codes_count, excerpts_count = reflexcoti_snapshot_counts(snapshot)
    with database() as connection:
        connection.execute(
            "UPDATE transcript_analysis SET snapshot = ?, updated_at = ? WHERE transcript_id = ?",
            (json.dumps(snapshot, ensure_ascii=False), now, transcript_id),
        )
        connection.execute(
            "UPDATE transcripts SET codes_count = ?, excerpts_count = ?, updated_at = ? WHERE id = ?",
            (codes_count, excerpts_count, now, transcript_id),
        )
        connection.execute(
            """INSERT INTO senior_code_revisions(
                   project_id, transcript_id, student_id, senior_id, senior_username,
                   coding_revision, modified_code_ids, memos, exported_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                project_id, transcript_id, student_id, pi_id, senior_username,
                coding_revision, json.dumps(modified_ids), json.dumps(memos, ensure_ascii=False), now,
            ),
        )
        connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
    return {
        "saved": True,
        "replaced": True,
        "updated_at": now,
        "analysis_status": "finished",
        "snapshot": snapshot,
        "file": {"filename": filename, "content": encoded.decode("utf-8")},
        "export": public_export_batch(batch, stored_files),
    }


def theme_analysis_status(snapshot):
    if not isinstance(snapshot, dict) or snapshot.get("themeReviewStage") != "complete":
        return "in_progress" if snapshot else "not_started"
    revision = max(1, int(snapshot.get("themeRevision") or 1))
    finished = snapshot.get("lastFinishedThemeRevision")
    if finished is None:
        finished = snapshot.get("lastExportedThemeRevision")
    if finished is None:  # Saved projects created before revision tracking.
        return "finished"
    return "finished" if int(finished or 0) >= revision else "needs_finish"


def _connected_student_theme_snapshot(pi_id, student_id, project_id):
    with database() as connection:
        row = connection.execute(
            """SELECT pa.snapshot, s.username AS senior_username,
                      EXISTS(SELECT 1 FROM export_batches eb
                             WHERE eb.project_id = p.id AND eb.scope = 'themes') AS has_theme_export
               FROM pi_student_connections c
               JOIN users s ON s.id = c.pi_id
               JOIN projects p ON p.owner_id = c.student_id
               LEFT JOIN project_analysis pa ON pa.project_id = p.id
               WHERE c.pi_id = ? AND c.student_id = ? AND c.status = 'active' AND p.id = ?""",
            (pi_id, student_id, project_id),
        ).fetchone()
    if not row:
        raise PermissionError("This project is not available through your Senior researcher connection.")
    if not row["snapshot"] or not row["has_theme_export"]:
        raise ValueError("The junior researcher must finish and export themes before Senior modification.")
    return json.loads(row["snapshot"]), row["senior_username"]


def _theme_signature(theme):
    codes = theme.get("codes") or []
    return {
        "title": str(theme.get("title") or ""),
        "rationale": str(theme.get("rationale") or ""),
        "codes": sorted(str(code.get("codeName") or "") for code in codes if isinstance(code, dict)),
        "reviewStatus": str(theme.get("reviewStatus") or ""),
    }


def validate_connected_student_theme_revision(pi_id, student_id, project_id, snapshot):
    if not isinstance(snapshot, dict):
        raise ValueError("Invalid theme analysis snapshot.")
    existing, senior_username = _connected_student_theme_snapshot(pi_id, student_id, project_id)
    existing_review = existing.get("seniorThemeReview") or {}
    pending_for_pi = (
        existing_review.get("status") == "pending_export"
        and int(existing_review.get("senior_user_id") or 0) == int(pi_id)
    )
    if theme_analysis_status(existing) != "finished" and not pending_for_pi:
        raise ValueError("The junior researcher must finish and export themes before Senior modification.")
    if (snapshot.get("originalAiThemes") or []) != (existing.get("originalAiThemes") or []):
        raise ValueError("Senior researchers cannot change the original AI theme record.")
    if snapshot.get("latestCodebook") != existing.get("latestCodebook"):
        raise ValueError("Senior researchers cannot change the completed junior codebook.")

    old_themes = existing.get("themes") or []
    new_themes = snapshot.get("themes") or []
    old_by_id = {str(item.get("id")): item for item in old_themes if isinstance(item, dict)}
    new_by_id = {str(item.get("id")): item for item in new_themes if isinstance(item, dict)}
    removed = set(old_by_id) - set(new_by_id)
    added = set(new_by_id) - set(old_by_id)
    modified_ids, memos = [], {}

    for theme_id, incoming in new_by_id.items():
        changed = theme_id in added or _theme_signature(incoming) != _theme_signature(old_by_id[theme_id])
        if not changed:
            continue
        audit = incoming.get("modifiedBySenior") or {}
        memo = str(audit.get("memo") or "").strip()
        if int(audit.get("user_id") or 0) != int(pi_id) or not memo:
            raise ValueError("Every Senior theme modification requires a memo and Senior attribution.")
        if str(incoming.get("reviewStatus") or "") not in {"", "accepted", "revised", "merged", "split", "rejected"}:
            raise ValueError("The Senior theme decision is invalid.")
        baseline_history = [] if theme_id in added else (old_by_id[theme_id].get("transformationHistory") or [])
        for entry in (incoming.get("transformationHistory") or [])[len(baseline_history):]:
            if isinstance(entry, dict) and entry.get("method") != "edit_myself":
                raise ValueError("Senior theme modifications must be completed manually without AI assistance.")
        modified_ids.append(theme_id)
        memos[theme_id] = memo

    if removed or added:
        covered = set()
        for theme_id in added:
            sources = {str(value) for value in new_by_id[theme_id].get("seniorSourceThemeIds") or []}
            if not sources or not sources.issubset(set(old_by_id)):
                raise ValueError("Senior split and merge themes must identify their source themes.")
            covered.update(sources)
        if covered != removed:
            raise ValueError("Senior researchers cannot add or remove themes outside a split or merge.")

    if not modified_ids and not pending_for_pi:
        raise ValueError("No Senior theme modification was found.")
    review = snapshot.get("seniorThemeReview") or {}
    if int(review.get("senior_user_id") or 0) != int(pi_id):
        raise ValueError("Senior theme review attribution is missing.")
    now = time.time()
    snapshot["seniorThemeReview"] = {
        **review, "status": "pending_export", "senior_user_id": int(pi_id),
        "senior_username": senior_username, "student_user_id": int(student_id),
        "started_at": existing_review.get("started_at") or review.get("started_at") or now,
        "updated_at": now,
        "modified_theme_ids": sorted(set((existing_review.get("modified_theme_ids") or []) + modified_ids)),
    }
    return snapshot, senior_username, memos


def save_connected_student_theme_revision(pi_id, student_id, project_id, snapshot):
    snapshot, _, _ = validate_connected_student_theme_revision(pi_id, student_id, project_id, snapshot)
    now = time.time()
    with database() as connection:
        connection.execute(
            "UPDATE project_analysis SET snapshot = ?, updated_at = ? WHERE project_id = ?",
            (json.dumps(snapshot, ensure_ascii=False), now, project_id),
        )
        connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
    return {"saved": True, "updated_at": now, "analysis_status": theme_analysis_status(snapshot), "snapshot": snapshot}


def export_connected_student_theme_revision(pi_id, student_id, project_id, snapshot, filename, content):
    snapshot, senior_username, _ = validate_connected_student_theme_revision(
        pi_id, student_id, project_id, snapshot
    )
    if snapshot.get("themeReviewStage") != "complete":
        raise ValueError("Finish the Senior theme amendment before exporting it.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}\.json", filename or "", re.IGNORECASE):
        raise ValueError("The reviewed theme export must be a JSON file.")
    try:
        exported_payload = json.loads(content)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("The reviewed theme export is not valid JSON.") from exc
    expected = [{
        "name": str(theme.get("title") or ""),
        "definition": str(theme.get("rationale") or ""),
        "codes": sorted(str(code.get("codeName") or "") for code in theme.get("codes") or [] if isinstance(code, dict)),
    } for theme in snapshot.get("themes") or []
        if theme.get("reviewStatus") in {"accepted", "revised", "split", "merged"}]
    received = [{
        "name": str(theme.get("theme name") or ""),
        "definition": str(theme.get("definition") or ""),
        "codes": sorted(str(code.get("code name") or "") for code in theme.get("codes") or [] if isinstance(code, dict)),
    } for theme in exported_payload.get("themes") or [] if isinstance(theme, dict)]
    key = lambda value: json.dumps(value, sort_keys=True, ensure_ascii=False)
    if sorted(map(key, expected)) != sorted(map(key, received)):
        raise ValueError("The reviewed theme export does not match the saved Senior revision.")

    now = time.time()
    revision = max(1, int(snapshot.get("themeRevision") or 1))
    review = snapshot.get("seniorThemeReview") or {}
    modified_ids = [str(value) for value in review.get("modified_theme_ids") or []]
    memos = {str(theme.get("id")): str((theme.get("modifiedBySenior") or {}).get("memo") or "")
             for theme in snapshot.get("themes") or [] if str(theme.get("id")) in modified_ids}
    snapshot["lastExportedThemeRevision"] = revision
    snapshot["themesExportedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))
    snapshot["seniorThemeReview"] = {
        **review, "status": "exported", "senior_user_id": int(pi_id),
        "senior_username": senior_username, "student_user_id": int(student_id),
        "updated_at": now, "exported_at": now,
    }
    exported_payload["theme_revision"] = revision
    exported_payload["senior_review"] = snapshot["seniorThemeReview"]
    encoded = json.dumps(exported_payload, indent=2, ensure_ascii=False).encode("utf-8")
    batch, stored_files = replace_reviewed_export_json_file(
        project_id, None, "themes", [(filename, "application/json; charset=utf-8", encoded)], now
    )
    with database() as connection:
        connection.execute("UPDATE project_analysis SET snapshot = ?, updated_at = ? WHERE project_id = ?",
                           (json.dumps(snapshot, ensure_ascii=False), now, project_id))
        connection.execute(
            """INSERT INTO senior_theme_revisions(project_id, student_id, senior_id, senior_username,
                   theme_revision, modified_theme_ids, memos, exported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, student_id, pi_id, senior_username, revision,
             json.dumps(modified_ids), json.dumps(memos, ensure_ascii=False), now),
        )
        connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
    return {"saved": True, "replaced": True, "updated_at": now, "analysis_status": "finished",
            "snapshot": snapshot, "file": {"filename": filename, "content": encoded.decode("utf-8")},
            "export": public_export_batch(batch, stored_files)}


def _json_column(value, fallback):
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback
    return parsed


def public_peer_suggestion(row):
    return {
        "id": int(row["id"]),
        "owner_id": int(row["owner_id"]),
        "reviewer_id": int(row["reviewer_id"]),
        "reviewer_username": row["reviewer_username_snapshot"],
        "project_id": row["project_id"],
        "project_name": row["project_name"] if "project_name" in row.keys() else "",
        "transcript_id": row["transcript_id"],
        "transcript_name": row["transcript_name"] if "transcript_name" in row.keys() else "",
        "scope": row["scope"],
        "action": row["action"],
        "target_ids": _json_column(row["target_ids"], []),
        "proposed_value": _json_column(row["proposed_value"], {}),
        "memo": row["memo"],
        "base_revision": int(row["base_revision"]),
        "status": row["status"],
        "created_at": row["created_at"],
        "resolved_at": row["resolved_at"],
    }


def peer_review_projects(reviewer_id, owner_username):
    username = normalize_username(owner_username)
    if not username:
        raise ValueError("Enter a junior researcher username.")
    with database() as connection:
        projects = connection.execute(
            """SELECT p.*, u.username AS owner_username,
                      EXISTS(SELECT 1 FROM export_batches eb
                             WHERE eb.project_id = p.id AND eb.scope = 'themes') AS has_theme_export
               FROM projects p JOIN users u ON u.id = p.owner_id
               JOIN peer_review_connections c
                 ON c.owner_id = p.owner_id AND c.reviewer_id = ? AND c.status = 'active'
               WHERE p.owner_id != ? AND u.role = 'student'
                 AND u.username = ? COLLATE NOCASE
                 AND EXISTS(SELECT 1 FROM export_batches eb WHERE eb.project_id = p.id)
               ORDER BY p.updated_at DESC""",
            (reviewer_id, reviewer_id, username),
        ).fetchall()
        payload = []
        for project in projects:
            transcripts = connection.execute(
                """SELECT t.*, EXISTS(
                           SELECT 1 FROM export_batches eb
                           WHERE eb.project_id = t.project_id AND eb.transcript_id = t.id
                             AND eb.scope = 'coding'
                       ) AS has_coding_export
                   FROM transcripts t WHERE t.project_id = ? ORDER BY t.created_at""",
                (project["id"],),
            ).fetchall()
            eligible = [public_transcript(row) for row in transcripts if row["has_coding_export"]]
            payload.append({
                **public_project(project, len(transcripts),
                                 sum(row["codes_count"] for row in transcripts),
                                 sum(row["excerpts_count"] for row in transcripts)),
                "owner_id": int(project["owner_id"]),
                "owner_username": project["owner_username"],
                "has_theme_export": bool(project["has_theme_export"]),
                "transcripts": eligible,
            })
    return payload


def peer_review_analysis(reviewer_id, project_id, scope, transcript_id=None, owner_username=None):
    if scope not in {"coding", "themes"}:
        raise ValueError("Peer review scope must be coding or themes.")
    with database() as connection:
        username = normalize_username(owner_username) if owner_username is not None else None
        project = connection.execute(
            """SELECT p.*, u.username AS owner_username FROM projects p
               JOIN users u ON u.id = p.owner_id
               JOIN peer_review_connections c
                 ON c.owner_id = p.owner_id AND c.reviewer_id = ? AND c.status = 'active'
               WHERE p.id = ? AND p.owner_id != ? AND u.role = 'student'
                 AND (? IS NULL OR u.username = ? COLLATE NOCASE)""",
            (reviewer_id, project_id, reviewer_id, username, username),
        ).fetchone()
        if not project:
            raise PermissionError("This junior researcher project is not available for peer review. The owner must accept your peer-review request before results are available.")
        if scope == "coding":
            row = connection.execute(
                """SELECT ta.snapshot, ta.updated_at, t.name FROM transcripts t
                   JOIN transcript_analysis ta ON ta.transcript_id = t.id
                   WHERE t.id = ? AND t.project_id = ? AND EXISTS(
                       SELECT 1 FROM export_batches eb WHERE eb.project_id = ?
                         AND eb.transcript_id = t.id AND eb.scope = 'coding'
                   )""",
                (transcript_id, project_id, project_id),
            ).fetchone()
        else:
            row = connection.execute(
                """SELECT pa.snapshot, pa.updated_at, '' AS name FROM project_analysis pa
                   WHERE pa.project_id = ? AND EXISTS(
                       SELECT 1 FROM export_batches eb WHERE eb.project_id = pa.project_id
                         AND eb.scope = 'themes'
                   )""",
                (project_id,),
            ).fetchone()
    if not row:
        raise ValueError("The owner must finish and export these results before peer review.")
    snapshot = json.loads(row["snapshot"])
    revision = max(1, int(snapshot.get("codingRevision" if scope == "coding" else "themeRevision") or 1))
    return {
        "project": {**public_project(project), "owner_id": int(project["owner_id"]),
                    "owner_username": project["owner_username"]},
        "scope": scope,
        "transcript_id": transcript_id,
        "transcript_name": row["name"],
        "revision": revision,
        "items": snapshot.get("codes" if scope == "coding" else "themes") or [],
        "updated_at": row["updated_at"],
    }


def _peer_item_id(item, index):
    return str(item.get("id") if item.get("id") is not None else index)


def create_peer_suggestion(reviewer_id, reviewer_username, payload):
    scope = str(payload.get("scope") or "").strip().lower()
    action = str(payload.get("action") or "").strip().lower()
    project_id = str(payload.get("project_id") or "").strip()
    transcript_id = str(payload.get("transcript_id") or "").strip() or None
    memo = str(payload.get("memo") or "").strip()
    target_ids = [str(value) for value in payload.get("target_ids") or [] if str(value)]
    target_ids = list(dict.fromkeys(target_ids))
    proposed = payload.get("proposed_value") or {}
    allowed = {"coding": {"accept", "revise", "reject", "merge"},
               "themes": {"accept", "revise", "reject", "merge", "split"}}
    if scope not in allowed or action not in allowed[scope]:
        raise ValueError("Choose a supported peer-review action.")
    if scope == "coding" and not transcript_id:
        raise ValueError("Choose an exported transcript for code suggestions.")
    if scope == "themes":
        transcript_id = None
    if not memo:
        raise ValueError("Every peer suggestion requires an explanatory memo.")
    if len(memo) > 4000:
        raise ValueError("The peer suggestion memo is too long.")
    if not target_ids or (action in {"accept", "revise", "reject", "split"} and len(target_ids) != 1):
        raise ValueError("Choose the result this suggestion applies to.")
    if action == "merge" and len(target_ids) < 2:
        raise ValueError("A merge suggestion requires at least two results.")
    analysis = peer_review_analysis(reviewer_id, project_id, scope, transcript_id)
    items = analysis["items"]
    by_id = {_peer_item_id(item, index): item for index, item in enumerate(items) if isinstance(item, dict)}
    if any(target_id not in by_id for target_id in target_ids):
        raise ValueError("One or more suggested results are no longer available.")
    if any(str(by_id[target_id].get("reviewStatus") or "") == "rejected" for target_id in target_ids):
        raise ValueError("Peer suggestions can apply only to active exported results.")
    if action in {"revise", "merge"}:
        if not isinstance(proposed, dict) or not str(proposed.get("title") or "").strip():
            raise ValueError("A revised or merged suggestion requires a proposed name.")
        if scope == "themes" and not str(proposed.get("rationale") or "").strip():
            raise ValueError("A revised or merged theme requires a proposed description.")
    if action == "split":
        parts = proposed.get("parts") if isinstance(proposed, dict) else None
        if not isinstance(parts, list) or len(parts) < 2 or any(
            not isinstance(part, dict) or not str(part.get("title") or "").strip()
            or not str(part.get("rationale") or "").strip()
            or not isinstance(part.get("code_names"), list) or not part.get("code_names")
            for part in parts
        ):
            raise ValueError("A theme split requires at least two named, described parts with assigned codes.")
        source_names = [str(code.get("codeName") or "") for code in by_id[target_ids[0]].get("codes") or []]
        assigned_names = [str(name) for part in parts for name in part["code_names"]]
        if sorted(assigned_names) != sorted(source_names):
            raise ValueError("Every source code must be assigned to exactly one split theme.")
    now = time.time()
    with database() as connection:
        project = connection.execute("SELECT owner_id FROM projects WHERE id = ?", (project_id,)).fetchone()
        cursor = connection.execute(
            """INSERT INTO peer_suggestions(
                   owner_id, reviewer_id, reviewer_username_snapshot, project_id, transcript_id,
                   scope, action, target_ids, proposed_value, memo, base_revision, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project["owner_id"], reviewer_id, reviewer_username, project_id, transcript_id,
             scope, action, json.dumps(target_ids), json.dumps(proposed, ensure_ascii=False), memo,
             analysis["revision"], now),
        )
        row = connection.execute(
            """SELECT ps.*, p.name AS project_name, COALESCE(t.name, '') AS transcript_name
               FROM peer_suggestions ps JOIN projects p ON p.id = ps.project_id
               LEFT JOIN transcripts t ON t.id = ps.transcript_id WHERE ps.id = ?""",
            (cursor.lastrowid,),
        ).fetchone()
    return public_peer_suggestion(row)


def _peer_suggestion_details(connection, suggestion):
    scope = suggestion["scope"]
    if scope == "coding":
        analysis = connection.execute(
            "SELECT snapshot FROM transcript_analysis WHERE transcript_id = ?",
            (suggestion["transcript_id"],),
        ).fetchone()
        items_key, revision_key = "codes", "codingRevision"
    else:
        analysis = connection.execute(
            "SELECT snapshot FROM project_analysis WHERE project_id = ?",
            (suggestion["project_id"],),
        ).fetchone()
        items_key, revision_key = "themes", "themeRevision"
    if not analysis:
        return {"affected_items": [], "result_preview": [], "current_revision": None, "is_stale": True}

    snapshot = json.loads(analysis["snapshot"])
    items = json.loads(json.dumps(snapshot.get(items_key) or []))
    target_ids = _json_column(suggestion["target_ids"], [])
    proposed = _json_column(suggestion["proposed_value"], {})
    action = suggestion["action"]
    by_id = {_peer_item_id(item, index): item for index, item in enumerate(items) if isinstance(item, dict)}
    affected = json.loads(json.dumps([by_id[target_id] for target_id in target_ids if target_id in by_id]))
    preview = [item for item in items if str(item.get("reviewStatus") or "") != "rejected"]
    preview_by_id = {_peer_item_id(item, index): item for index, item in enumerate(preview) if isinstance(item, dict)}
    targets_available = all(target_id in preview_by_id for target_id in target_ids)

    if targets_available and action == "reject":
        preview = [item for index, item in enumerate(preview) if _peer_item_id(item, index) not in set(target_ids)]
    elif targets_available and action == "revise":
        item = preview_by_id[target_ids[0]]
        item["title"] = str(proposed.get("title") or item.get("title") or "").strip()
        if scope == "coding" and isinstance(proposed.get("excerpts"), list):
            excerpts = [str(value).strip() for value in proposed["excerpts"] if str(value).strip()]
            item["quotes"] = excerpts
            item["excerpts"] = excerpts
        elif scope == "themes":
            item["rationale"] = str(proposed.get("rationale") or item.get("rationale") or "").strip()
    elif targets_available and action == "merge":
        sources = [preview_by_id[target_id] for target_id in target_ids]
        if scope == "coding":
            excerpts, seen = [], set()
            for source in sources:
                for excerpt in _code_excerpts_for_comparison(source):
                    key = re.sub(r"\s+", " ", excerpt).strip().casefold()
                    if key and key not in seen:
                        seen.add(key)
                        excerpts.append(excerpt)
            merged = {"title": str(proposed.get("title") or "").strip(), "quotes": excerpts,
                      "excerpts": excerpts, "reviewStatus": "accepted"}
        else:
            codes, seen = [], set()
            for source in sources:
                for code in source.get("codes") or []:
                    key = str(code.get("codeName") or "").casefold() if isinstance(code, dict) else str(code).casefold()
                    if key not in seen:
                        seen.add(key)
                        codes.append(code)
            merged = {"title": str(proposed.get("title") or "").strip(),
                      "rationale": str(proposed.get("rationale") or "").strip(),
                      "codes": codes, "reviewStatus": "accepted"}
        target_set = set(target_ids)
        preview = [item for index, item in enumerate(preview) if _peer_item_id(item, index) not in target_set] + [merged]
    elif targets_available and action == "split":
        source = preview_by_id[target_ids[0]]
        code_by_name = {str(code.get("codeName") or ""): code for code in source.get("codes") or [] if isinstance(code, dict)}
        replacements = [{"title": str(part.get("title") or "").strip(),
                         "rationale": str(part.get("rationale") or "").strip(),
                         "codes": [code_by_name[name] for name in part.get("code_names") or [] if name in code_by_name],
                         "reviewStatus": "accepted"}
                        for part in proposed.get("parts") or [] if isinstance(part, dict)]
        preview = [item for index, item in enumerate(preview) if _peer_item_id(item, index) != target_ids[0]] + replacements

    current_revision = max(1, int(snapshot.get(revision_key) or 1))
    return {
        "affected_items": affected,
        "result_preview": preview,
        "current_revision": current_revision,
        "is_stale": not targets_available or current_revision != int(suggestion["base_revision"]),
    }


def peer_suggestions_for_user(user_id, project_id=None):
    predicates = ["(ps.owner_id = ? OR ps.reviewer_id = ?)"]
    values = [user_id, user_id]
    if project_id:
        predicates.append("ps.project_id = ?")
        values.append(project_id)
    with database() as connection:
        rows = connection.execute(
            f"""SELECT ps.*, p.name AS project_name, COALESCE(t.name, '') AS transcript_name
                FROM peer_suggestions ps JOIN projects p ON p.id = ps.project_id
                LEFT JOIN transcripts t ON t.id = ps.transcript_id
                WHERE {' AND '.join(predicates)} ORDER BY ps.created_at DESC""",
            values,
        ).fetchall()
    suggestions = []
    with database() as connection:
        for row in rows:
            suggestion = public_peer_suggestion(row)
            suggestion.update(_peer_suggestion_details(connection, row))
            suggestions.append(suggestion)
    return {
        "suggestions": suggestions,
        "pending_received": sum(item["status"] == "pending" and item["owner_id"] == user_id for item in suggestions),
    }


def pending_peer_suggestion_count(owner_id, project_id, scope=None, transcript_id=None):
    sql = "SELECT COUNT(*) FROM peer_suggestions WHERE owner_id = ? AND project_id = ? AND status = 'pending'"
    values = [owner_id, project_id]
    if scope:
        sql += " AND scope = ?"
        values.append(scope)
    if transcript_id is not None:
        sql += " AND transcript_id = ?"
        values.append(transcript_id)
    with database() as connection:
        return int(connection.execute(sql, values).fetchone()[0])


def _record_peer_history(item, suggestion, decision="accepted"):
    item["peerSuggestionHistory"] = [*(item.get("peerSuggestionHistory") or []), {
        "suggestion_id": int(suggestion["id"]),
        "reviewer_id": int(suggestion["reviewer_id"]),
        "reviewer_username": suggestion["reviewer_username_snapshot"],
        "action": suggestion["action"],
        "memo": suggestion["memo"],
        "owner_decision": decision,
        "resolved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }]


def resolve_peer_suggestion(owner_id, suggestion_id, decision):
    if decision not in {"accept", "reject"}:
        raise ValueError("Choose Agree or Disagree for this suggestion.")
    now = time.time()
    with database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        suggestion = connection.execute(
            "SELECT * FROM peer_suggestions WHERE id = ? AND owner_id = ?",
            (suggestion_id, owner_id),
        ).fetchone()
        if not suggestion:
            raise PermissionError("Peer suggestion not found.")
        if suggestion["status"] != "pending":
            raise ValueError("This peer suggestion has already been resolved.")
        if decision == "reject":
            connection.execute(
                "UPDATE peer_suggestions SET status = 'rejected', resolved_at = ? WHERE id = ?",
                (now, suggestion_id),
            )
            return {"id": int(suggestion_id), "status": "rejected", "resolved_at": now}

        scope, action = suggestion["scope"], suggestion["action"]
        target_ids = _json_column(suggestion["target_ids"], [])
        proposed = _json_column(suggestion["proposed_value"], {})
        if scope == "coding":
            analysis = connection.execute(
                "SELECT snapshot FROM transcript_analysis WHERE transcript_id = ?",
                (suggestion["transcript_id"],),
            ).fetchone()
            revision_key, items_key = "codingRevision", "codes"
        else:
            analysis = connection.execute(
                "SELECT snapshot FROM project_analysis WHERE project_id = ?",
                (suggestion["project_id"],),
            ).fetchone()
            revision_key, items_key = "themeRevision", "themes"
        if not analysis:
            raise ValueError("The original analysis is no longer available.")
        snapshot = json.loads(analysis["snapshot"])
        items = snapshot.get(items_key) or []
        by_id = {_peer_item_id(item, index): item for index, item in enumerate(items) if isinstance(item, dict)}
        if any(target_id not in by_id for target_id in target_ids):
            raise ValueError("The owner results changed and this suggestion can no longer be applied.")
        changed = True
        if action in {"accept", "reject", "revise"}:
            item = by_id[target_ids[0]]
            if action == "reject":
                item["reviewStatus"] = "rejected"
            elif action == "revise":
                item["title"] = str(proposed.get("title") or "").strip()
                if scope == "coding" and isinstance(proposed.get("excerpts"), list):
                    excerpts = [str(value).strip() for value in proposed["excerpts"] if str(value).strip()]
                    item["quotes"] = excerpts
                    item["excerpts"] = excerpts
                    item["quote"] = f'"{excerpts[0]}"' if excerpts else ""
                if scope == "themes":
                    item["rationale"] = str(proposed.get("rationale") or "").strip()
                item["source"] = "AI+Human"
                item["reviewStatus"] = "accepted"
            _record_peer_history(item, suggestion)
        elif action == "merge":
            sources = [by_id[target_id] for target_id in target_ids]
            source_set = set(target_ids)
            if scope == "coding":
                excerpts = []
                seen = set()
                for source in sources:
                    for excerpt in _code_excerpts_for_comparison(source):
                        key = re.sub(r"\s+", " ", excerpt).strip().casefold()
                        if key and key not in seen:
                            seen.add(key)
                            excerpts.append(excerpt)
                merged = {
                    "id": f"peer-merge-{suggestion_id}", "title": str(proposed.get("title") or "").strip(),
                    "source": "AI+Human", "sourceClass": "ai", "reviewStatus": "accepted",
                    "quotes": excerpts, "excerpts": excerpts, "quote": f'"{excerpts[0]}"' if excerpts else "",
                    "mergedFromCodes": True, "peerSourceCodeIds": target_ids,
                }
            else:
                merged_codes = []
                seen_codes = set()
                for source in sources:
                    for code in source.get("codes") or []:
                        key = str(code.get("codeName") or "").casefold() if isinstance(code, dict) else str(code).casefold()
                        if key not in seen_codes:
                            seen_codes.add(key)
                            merged_codes.append(code)
                merged = {
                    "id": f"peer-theme-merge-{suggestion_id}", "title": str(proposed.get("title") or "").strip(),
                    "rationale": str(proposed.get("rationale") or "").strip(), "codes": merged_codes,
                    "source": "AI+Human", "reviewStatus": "accepted", "peerSourceThemeIds": target_ids,
                }
            _record_peer_history(merged, suggestion)
            items = [item for index, item in enumerate(items) if _peer_item_id(item, index) not in source_set] + [merged]
        elif action == "split":
            source = by_id[target_ids[0]]
            code_by_name = {str(code.get("codeName") or ""): code for code in source.get("codes") or [] if isinstance(code, dict)}
            replacements = []
            for index, part in enumerate(proposed.get("parts") or [], start=1):
                replacement = {
                    "id": f"peer-theme-split-{suggestion_id}-{index}",
                    "title": str(part.get("title") or "").strip(),
                    "rationale": str(part.get("rationale") or "").strip(),
                    "codes": [code_by_name[name] for name in part.get("code_names") or []],
                    "source": "AI+Human", "reviewStatus": "accepted",
                    "peerSourceThemeIds": target_ids,
                }
                _record_peer_history(replacement, suggestion)
                replacements.append(replacement)
            items = [item for index, item in enumerate(items) if _peer_item_id(item, index) != target_ids[0]] + replacements

        if changed:
            snapshot[items_key] = items
            snapshot[revision_key] = max(1, int(snapshot.get(revision_key) or 1)) + 1
            if scope == "coding":
                snapshot["codeReviewStage"] = "complete"
                codes_count, excerpts_count = reflexcoti_snapshot_counts(snapshot)
                connection.execute(
                    "UPDATE transcript_analysis SET snapshot = ?, updated_at = ? WHERE transcript_id = ?",
                    (json.dumps(snapshot, ensure_ascii=False), now, suggestion["transcript_id"]),
                )
                connection.execute(
                    "UPDATE transcripts SET codes_count = ?, excerpts_count = ?, updated_at = ? WHERE id = ?",
                    (codes_count, excerpts_count, now, suggestion["transcript_id"]),
                )
            else:
                snapshot["themeReviewStage"] = "complete"
                connection.execute(
                    "UPDATE project_analysis SET snapshot = ?, updated_at = ? WHERE project_id = ?",
                    (json.dumps(snapshot, ensure_ascii=False), now, suggestion["project_id"]),
                )
            connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, suggestion["project_id"]))
        connection.execute(
            "UPDATE peer_suggestions SET status = 'accepted', resolved_at = ? WHERE id = ?",
            (now, suggestion_id),
        )
    return {"id": int(suggestion_id), "status": "accepted", "resolved_at": now,
            "applied": changed}


def connected_student_transcript_content(pi_id, student_id, project_id, transcript_id):
    with database() as connection:
        row = connection.execute(
            """SELECT t.* FROM pi_student_connections c
               JOIN projects p ON p.owner_id = c.student_id
               JOIN transcripts t ON t.project_id = p.id
               WHERE c.pi_id = ? AND c.student_id = ? AND c.status = 'active'
                 AND p.id = ? AND t.id = ?""",
            (pi_id, student_id, project_id, transcript_id),
        ).fetchone()
        if not row:
            raise PermissionError("This transcript is not available through your Senior researcher connection.")
    storage_dir = transcript_storage_dir(student_id, project_id, transcript_id)
    text_path = storage_dir / "transcript.txt"
    if text_path.exists():
        text = text_path.read_text(encoding="utf-8")
    else:
        source_path = storage_dir / row["stored_name"]
        if not source_path.is_file():
            raise ValueError("The junior researcher transcript file is unavailable.")
        text = get_paragraph_chunk_module().read_docx(str(source_path)).strip()
    chunks_dir = storage_dir / "chunks"
    chunk_count = len(list(chunks_dir.glob("*.docx"))) if chunks_dir.exists() else 1
    return {
        "text": text,
        "word_count": word_count(text),
        "chunk_count": max(1, chunk_count),
        "needs_chunking": chunk_count > 1,
    }


def project_row_for_user(project_id, user_id):
    with database() as connection:
        return connection.execute(
            "SELECT * FROM projects WHERE id = ? AND owner_id = ?",
            (project_id, user_id),
        ).fetchone()


def transcript_row_for_user(project_id, transcript_id, user_id):
    with database() as connection:
        return connection.execute(
            """SELECT t.* FROM transcripts t
               JOIN projects p ON p.id = t.project_id
               WHERE t.id = ? AND t.project_id = ? AND p.owner_id = ?""",
            (transcript_id, project_id, user_id),
        ).fetchone()


def public_project(row, transcript_count=0, codes_count=0, excerpts_count=0):
    return {
        "id": row["id"],
        "name": row["name"],
        "research_question": row["research_question"],
        "interviewee": row["interviewee"],
        "transcript_count": int(transcript_count or 0),
        "codes_count": int(codes_count or 0),
        "excerpts_count": int(excerpts_count or 0),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def project_codebook_card_counts(project_id):
    """Return dashboard counts from the current cumulative codebook."""
    with database() as connection:
        row = connection.execute(
            "SELECT codebook_id, current_size FROM project_codebooks WHERE project_id = ?",
            (project_id,),
        ).fetchone()
    if not row:
        return {"codebook_codes_count": 0, "codebook_excerpts_count": 0}

    code_count = int(row["current_size"] or 0)
    codebook_path = THEME_CODEBOOK_DIR / row["codebook_id"] / "ai_codebook.json"
    try:
        entries = json.loads(codebook_path.read_text(encoding="utf-8")).get("entries") or []
    except (OSError, TypeError, json.JSONDecodeError):
        return {"codebook_codes_count": code_count, "codebook_excerpts_count": 0}

    excerpt_count = sum(
        len(entry.get("clues") or [])
        for entry in entries
        if isinstance(entry, dict)
    )
    return {
        "codebook_codes_count": len(entries),
        "codebook_excerpts_count": excerpt_count,
    }


def project_initial_reflections(row):
    """Return project-generated profiles and assumptions with safe fallbacks."""
    try:
        stored = json.loads(row["initial_reflections"] or "{}")
    except (IndexError, KeyError, TypeError, json.JSONDecodeError):
        stored = {}
    if not isinstance(stored, dict):
        stored = {}
    reflections = {}
    for agent in AGENTS:
        raw = stored.get(agent) if isinstance(stored.get(agent), dict) else {}
        reflection = {
            "assumptions": str(raw.get("assumptions") or "").strip()
        }
        raw_profile = raw.get("profile")
        if isinstance(raw_profile, list):
            profile = [" ".join(str(item).strip().split()) for item in raw_profile if str(item).strip()]
        elif isinstance(raw_profile, str) and raw_profile.strip():
            profile = [line.strip(" -") for line in raw_profile.splitlines() if line.strip(" -")]
        else:
            profile = []
        if profile:
            reflection["profile"] = profile
        reflections[agent] = reflection
    return reflections


def project_agent_personas(row):
    """Return the generated project profiles used as coder identity prompts."""
    reflections = project_initial_reflections(row)
    personas = {}
    for agent in AGENTS:
        profile = reflections.get(agent, {}).get("profile")
        personas[agent] = "\n".join(profile) if profile else AGENT_PERSONAS[agent].strip()
    return personas


def saved_agent_assumptions(snapshot):
    """Extract coder assumptions from one successfully analyzed transcript snapshot."""
    if not isinstance(snapshot, dict) or not snapshot.get("analysisReady"):
        return {}
    reflections = snapshot.get("agentReflections")
    if not isinstance(reflections, dict):
        return {}
    assumptions = {}
    for agent in AGENTS:
        reflection = reflections.get(agent)
        if not isinstance(reflection, dict):
            continue
        assumption = str(reflection.get("assumptions") or "").strip()
        if assumption:
            assumptions[agent] = {"assumptions": assumption}
    return assumptions


def latest_project_agent_assumptions(project_id, current_transcript_id):
    """Load assumptions from the most recently saved successful prior analysis."""
    with database() as connection:
        rows = connection.execute(
            """SELECT ta.snapshot
               FROM transcript_analysis ta
               JOIN transcripts t ON t.id = ta.transcript_id
               WHERE t.project_id = ? AND t.id != ?
               ORDER BY ta.updated_at DESC""",
            (project_id, current_transcript_id),
        ).fetchall()
    for row in rows:
        try:
            snapshot = json.loads(row["snapshot"])
        except (TypeError, json.JSONDecodeError):
            continue
        assumptions = saved_agent_assumptions(snapshot)
        if assumptions:
            return assumptions
    return {}


def project_starting_reflections(project_row, current_transcript_id):
    """Use the latest prior collaboration assumptions, then project initial values."""
    starting = project_initial_reflections(project_row)
    latest = latest_project_agent_assumptions(project_row["id"], current_transcript_id)
    for agent, reflection in latest.items():
        starting.setdefault(agent, {})["assumptions"] = str(
            reflection.get("assumptions") or ""
        ).strip()
    return starting


def public_transcript(row):
    analysis_status = "not_started"
    if "analysis_snapshot" in row.keys() and row["analysis_snapshot"]:
        try:
            snapshot = json.loads(row["analysis_snapshot"])
            analysis_status = transcript_analysis_status(snapshot)
        except (TypeError, ValueError, json.JSONDecodeError):
            analysis_status = "in_progress"
    return {
        "id": row["id"],
        "name": row["name"],
        "size": int(row["size"] or 0),
        "word_count": int(row["word_count"] or 0),
        "codes_count": int(row["codes_count"] or 0),
        "excerpts_count": int(row["excerpts_count"] or 0),
        "analysis_status": analysis_status,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def transcript_storage_dir(user_id, project_id, transcript_id):
    return PROJECTS_DIR / str(user_id) / project_id / "transcripts" / transcript_id


def storage_label(value, fallback):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or fallback)).strip("._-") or fallback


def user_storage_key(username, user_id):
    cleaned = storage_label(username, "user")
    return f"{cleaned}-{int(user_id)}"


def export_project_dir(user, project_id, project_name):
    project_key = f"{storage_label(project_name, 'project')}-{project_id}"
    return PROJECTS_DIR / user_storage_key(user["username"], user["user_id"]) / project_key / "exports"


def legacy_export_project_dir(user, project_id):
    return PROJECTS_DIR / user_storage_key(user["username"], user["user_id"]) / project_id / "exports"


def finished_project_dir(user, project_name):
    """Readable latest-result storage: account / project / finished."""
    return (
        PROJECTS_DIR
        / storage_label(user["username"], "user")
        / storage_label(project_name, "project")
        / "finished"
    )


def migrate_legacy_finished_results(user, project_id, project_name, destination):
    """Flatten prior version/transcript folders, retaining the newest file by name."""
    legacy_root = export_project_dir(user, project_id, project_name) / "finished"
    if not legacy_root.is_dir() or legacy_root.resolve() == destination.resolve():
        return
    newest = {}
    for source in legacy_root.rglob("*"):
        if not source.is_file() or source.suffix.lower() not in {".json", ".csv"}:
            continue
        key = source.name.casefold()
        modified = source.stat().st_mtime_ns
        if key not in newest or modified > newest[key][0]:
            newest[key] = (modified, source)
    destination.mkdir(parents=True, exist_ok=True)
    for _, source in newest.values():
        target = destination / source.name
        temporary = destination / f".{source.name}.{uuid.uuid4().hex}.tmp"
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    shutil.rmtree(legacy_root)


def save_project_finished_results(user, project, payload):
    """Persist the latest project-level codebook and theme artifacts on Finish."""
    phase = str(payload.get("phase") or "").strip()
    if phase not in {"codebook", "human_themes", "themes"}:
        raise ValueError("The finished project-result phase is invalid.")
    revision = max(1, int(payload.get("revision") or 1))
    codebook_id = str(payload.get("codebook_id") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", codebook_id):
        raise ValueError("The finished project results require a valid codebook.")
    run_dir = THEME_CODEBOOK_DIR / codebook_id
    try:
        owner_id = int(json.loads((run_dir / "owner.json").read_text(encoding="utf-8")).get("owner_id"))
    except Exception:
        owner_id = None
    if owner_id != int(user["user_id"]):
        raise ValueError("Could not find this project's generated codebook.")

    codebook_sources = [
        ("ReflexCoTI_codebook_AI_original.json", run_dir / "ai_codebook.json"),
        ("ReflexCoTI_codebook_AI_Human.json", run_dir / "ai_human_codebook.json"),
    ]
    files = []
    for filename, source in codebook_sources:
        if not source.is_file():
            raise ValueError("Finish the codebook review before saving project results.")
        document = json.loads(source.read_text(encoding="utf-8"))
        document["account"] = {"username": user["username"]}
        document["project"] = {"id": project["id"], "name": project["name"]}
        document["codebook_revision"] = revision
        files.append((filename, json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8")))

    if phase in {"human_themes", "themes"}:
        raw_files = payload.get("files")
        expected_names = {
            "human_themes": {"reflexcoti_themes_human_version.json"},
            "themes": {
                "reflexcoti_themes.json",
                "reflexcoti_themes_ai_original.json",
                "reflexcoti_themes_human_version.json",
                "reflexcoti_themes_questionnaire.csv",
            },
        }[phase]
        if not isinstance(raw_files, list) or len(raw_files) != len(expected_names):
            raise ValueError("The finished theme-result file set is incomplete.")
        names = set()
        theme_files = []
        total_bytes = 0
        for item in raw_files:
            if not isinstance(item, dict):
                raise ValueError("Invalid finished theme-result file.")
            filename = str(item.get("filename") or "")
            content = item.get("content")
            if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}\.(?:json|csv)", filename, re.IGNORECASE):
                raise ValueError("Finished theme-result filenames must be JSON or CSV files.")
            if filename.casefold() in names or not isinstance(content, str):
                raise ValueError("Finished theme-result files must have unique names and text content.")
            if filename.lower().endswith(".json"):
                document = json.loads(content)
                if not isinstance(document, dict):
                    raise ValueError("Each finished theme JSON file must contain an object.")
                document["account"] = {"username": user["username"]}
                document["project"] = {"id": project["id"], "name": project["name"]}
                encoded = json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8")
            else:
                encoded = content.encode("utf-8")
            if len(encoded) > 10 * 1024 * 1024:
                raise ValueError(f'Finished theme-result file "{filename}" is too large.')
            names.add(filename.casefold())
            total_bytes += len(encoded)
            theme_files.append((filename, encoded))
        if names != expected_names:
            raise ValueError("The finished theme-result filenames are invalid.")
        json_count = sum(filename.lower().endswith(".json") for filename, _ in theme_files)
        csv_count = sum(filename.lower().endswith(".csv") for filename, _ in theme_files)
        expected_counts = (1, 0) if phase == "human_themes" else (3, 1)
        if (json_count, csv_count) != expected_counts:
            raise ValueError("Theme Finish requires three JSON files and one questionnaire CSV.")
        if total_bytes > 20 * 1024 * 1024:
            raise ValueError("The finished theme-result file set is too large.")
        files.extend(theme_files)

    result_dir = finished_project_dir(user, project["name"])
    migrate_legacy_finished_results(user, project["id"], project["name"], result_dir)
    result_dir.mkdir(parents=True, exist_ok=True)
    temporary_paths = []
    try:
        for filename, encoded in files:
            target = result_dir / filename
            temporary = result_dir / f".{filename}.{uuid.uuid4().hex}.tmp"
            temporary.write_bytes(encoded)
            temporary_paths.append(temporary)
            os.replace(temporary, target)
    finally:
        for temporary in temporary_paths:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
    return {
        "saved": True,
        "phase": phase,
        "revision": revision,
        "relative_path": str(result_dir.relative_to(DATA_DIR)),
        "files": [filename for filename, _ in files],
    }


def public_export_batch(batch, files):
    project_id = batch["project_id"]
    batch_id = batch["id"]
    return {
        "id": batch_id,
        "project_id": project_id,
        "project_name": batch["project_name_snapshot"],
        "scope": batch["scope"],
        "transcript_id": batch["transcript_id"],
        "created_at": batch["created_at"],
        "files": [{
            "filename": item["filename"],
            "content_type": item["content_type"],
            "size_bytes": item["size_bytes"],
            "download_url": f"/api/projects/{project_id}/exports/{batch_id}/{item['filename']}",
        } for item in files],
    }


def replace_reviewed_export_json_file(project_id, transcript_id, scope, files, now):
    """Replace only the reviewed ReflexCoTI JSON in the latest export batch."""
    if scope not in {"coding", "themes"}:
        raise ValueError("Only coding and theme exports support reviewed-file revisions.")
    with database() as connection:
        if scope == "coding":
            batch = connection.execute(
                """SELECT * FROM export_batches
                   WHERE project_id = ? AND transcript_id = ? AND scope = 'coding'
                   ORDER BY created_at DESC LIMIT 1""",
                (project_id, transcript_id),
            ).fetchone()
        else:
            batch = connection.execute(
                """SELECT * FROM export_batches
                   WHERE project_id = ? AND scope = 'themes'
                   ORDER BY created_at DESC LIMIT 1""",
                (project_id,),
            ).fetchone()
        if not batch:
            raise ValueError(f"Export the completed {scope} results before exporting an updated revision.")
        stored_files = connection.execute(
            "SELECT * FROM export_files WHERE batch_id = ? ORDER BY id",
            (batch["id"],),
        ).fetchall()

    existing_json_names = {
        item["filename"].casefold() for item in stored_files
        if item["filename"].lower().endswith(".json")
        and not item["filename"].lower().endswith(("_ai_original.json", "_human_version.json"))
    }
    incoming_names = {filename.casefold() for filename, _, _ in files}
    if incoming_names != existing_json_names:
        raise ValueError("The updated revision filename must match the existing reviewed ReflexCoTI JSON file.")

    data_root = DATA_DIR.resolve()
    target_dir = (DATA_DIR / batch["relative_path"]).resolve()
    if data_root not in target_dir.parents or not target_dir.is_dir():
        raise ValueError(f"Could not find the existing {scope} export to update.")

    temp_paths = []
    replacements = []
    try:
        for filename, _, encoded in files:
            target_path = target_dir / filename
            temp_path = target_dir / f".{filename}.{uuid.uuid4().hex}.tmp"
            temp_path.write_bytes(encoded)
            temp_paths.append(temp_path)
            replacements.append((temp_path, target_path))
        for temp_path, target_path in replacements:
            os.replace(temp_path, target_path)
    finally:
        for temp_path in temp_paths:
            temp_path.unlink(missing_ok=True)

    with database() as connection:
        for filename, content_type, encoded in files:
            connection.execute(
                """UPDATE export_files SET content_type = ?, size_bytes = ?, created_at = ?
                   WHERE batch_id = ? AND filename = ?""",
                (content_type, len(encoded), now, batch["id"], filename),
            )
        connection.execute("UPDATE export_batches SET created_at = ? WHERE id = ?", (now, batch["id"]))
        connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
        batch = connection.execute("SELECT * FROM export_batches WHERE id = ?", (batch["id"],)).fetchone()
        stored_files = connection.execute(
            "SELECT * FROM export_files WHERE batch_id = ? ORDER BY id", (batch["id"],)
        ).fetchall()
    return batch, stored_files


def replace_coding_export_json_file(project_id, transcript_id, files, now):
    """Backward-compatible coding revision helper."""
    return replace_reviewed_export_json_file(project_id, transcript_id, "coding", files, now)


def send_json(handler, status, payload, headers=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    for key, value in (headers or {}).items():
        handler.send_header(key, value)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def safe_filename(filename):
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", filename or "")
    return cleaned or "Interview_0000_chunk_001.docx"


def word_count(text):
    return len(re.findall(r"\S+", text or ""))


CHUNKING_MODEL = None


def get_paragraph_chunk_module():
    if str(WORKFLOW_DIR) not in sys.path:
        sys.path.insert(0, str(WORKFLOW_DIR))
    return importlib.import_module("paragraph_chunk")


def get_chunking_model(paragraph_chunk):
    global CHUNKING_MODEL
    if CHUNKING_MODEL is None:
        CHUNKING_MODEL = paragraph_chunk.SentenceTransformer(
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
    return CHUNKING_MODEL


def semantic_code_layout(items):
    """Embed code names plus excerpts and return deterministic 2D PCA coordinates."""
    import numpy as np

    texts = []
    for item in items:
        title = str(item.get("title") or "Untitled code").strip()
        excerpts = item.get("excerpts") if isinstance(item.get("excerpts"), list) else []
        support = " ".join(str(value or "").strip() for value in excerpts[:8] if str(value or "").strip())
        texts.append(f"Code: {title}. Supporting excerpts: {support}"[:6000])

    count = len(texts)
    if count == 1:
        return [{"id": str(items[0].get("id") or "0"), "x": 0.5, "y": 0.5}], "single-item"

    method = "semantic-pca"
    try:
        paragraph_chunk = get_paragraph_chunk_module()
        model = get_chunking_model(paragraph_chunk)
        vectors = np.asarray(model.encode(texts, normalize_embeddings=True), dtype=np.float32)
    except Exception as exc:
        print(f"Semantic layout embedding failed; using lexical fallback: {exc}", flush=True)
        from sklearn.feature_extraction.text import TfidfVectorizer
        method = "lexical-pca-fallback"
        vectors = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1).fit_transform(texts).toarray()

    if count == 2:
        projected = np.asarray([[-1.0, 0.0], [1.0, 0.0]], dtype=float)
    else:
        from sklearn.decomposition import PCA
        components = min(2, count, vectors.shape[1])
        projected = PCA(n_components=components).fit_transform(vectors)
        if components == 1:
            projected = np.column_stack([projected[:, 0], np.zeros(count)])

    if not np.isfinite(projected).all() or np.max(np.ptp(projected, axis=0)) < 1e-9:
        angles = np.linspace(0, 2 * np.pi, count, endpoint=False)
        projected = np.column_stack([np.cos(angles), np.sin(angles)])
        method += "-radial-degenerate"

    normalized = np.full((count, 2), 0.5, dtype=float)
    for axis in range(2):
        values = projected[:, axis]
        low, high = float(values.min()), float(values.max())
        if high - low > 1e-9:
            normalized[:, axis] = 0.10 + ((values - low) / (high - low)) * 0.80

    return [
        {"id": str(item.get("id") or index), "x": round(float(normalized[index, 0]), 6), "y": round(float(normalized[index, 1]), 6)}
        for index, item in enumerate(items)
    ], method


def semantic_code_merge_suggestions(items, threshold=0.8):
    """Embed reviewed codes and return non-destructive compact-style groups."""
    import numpy as np

    valid_items = [item for item in (items if isinstance(items, list) else []) if isinstance(item, dict)]
    if len(valid_items) < 2:
        return [], "not-enough-codes"

    entries = []
    for index, item in enumerate(valid_items):
        title = str(item.get("title") or "").strip()
        excerpts = item.get("excerpts") if isinstance(item.get("excerpts"), list) else []
        clues = list(dict.fromkeys(
            str(value or "").strip() for value in excerpts if str(value or "").strip()
        ))
        if not title:
            continue
        entries.append({
            "id": str(item.get("id") or index),
            "initial code": title,
            "clues": clues,
            "transcript_ids": [str(item.get("transcript_id") or "current-transcript")],
        })

    if len(entries) < 2:
        return [], "not-enough-codes"

    import_workflow_modules()
    workflow = importlib.import_module("RTA_workflow")
    texts = [
        workflow.build_embedding_text(
            code_name=entry["initial code"],
            clues=entry["clues"],
            retrieval_mode="code_clue",
        )[:6000]
        for entry in entries
    ]

    method = "semantic-compact"
    try:
        paragraph_chunk = get_paragraph_chunk_module()
        model = get_chunking_model(paragraph_chunk)
        vectors = np.asarray(model.encode(texts, normalize_embeddings=True), dtype=np.float32)
    except Exception as exc:
        print(f"Code merge suggestion embedding failed; using lexical fallback: {exc}", flush=True)
        from sklearn.feature_extraction.text import TfidfVectorizer
        method = "lexical-compact-fallback"
        vectors = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1).fit_transform(texts).toarray()

    for entry, vector in zip(entries, vectors):
        entry["embedding"] = np.asarray(vector, dtype=np.float32).tolist()

    raw_suggestions = workflow.suggest_code_merges(
        entries,
        model=None,
        threshold=float(threshold),
        retrieval_mode="code_clue",
    )
    suggestions = [{
        "id": suggestion["id"],
        "member_ids": suggestion["member_ids"],
        "codes": suggestion["codes"],
        "suggested_name": suggestion["suggested_name"],
        "similarities": suggestion["similarities"],
        "similarity_min": suggestion["similarity_min"],
        "similarity_max": suggestion["similarity_max"],
        "match_types": suggestion["match_types"],
    } for suggestion in raw_suggestions]
    return suggestions, method


def semantic_theme_matches(ai_themes, human_themes, threshold=0.8):
    """Return one-to-one Human–AI theme matches using cosine similarity."""
    ai_items = ai_themes if isinstance(ai_themes, list) else []
    human_items = human_themes if isinstance(human_themes, list) else []
    if not ai_items or not human_items:
        return []

    def theme_text(theme):
        if not isinstance(theme, dict):
            return ""
        title = str(theme.get("title") or "").strip()
        rationale = str(theme.get("rationale") or theme.get("description") or "").strip()
        codes = theme.get("codes") if isinstance(theme.get("codes"), list) else []
        code_names = []
        for code in codes:
            if isinstance(code, dict):
                code_names.append(str(code.get("codeName") or code.get("code_name") or "").strip())
            else:
                code_names.append(str(code or "").strip())
        return f"Theme: {title}. Description: {rationale}. Related codes: {'; '.join(filter(None, code_names))}"[:6000]

    texts = [theme_text(theme) for theme in ai_items] + [theme_text(theme) for theme in human_items]
    try:
        import numpy as np
        paragraph_chunk = get_paragraph_chunk_module()
        model = get_chunking_model(paragraph_chunk)
        vectors = np.asarray(model.encode(texts, normalize_embeddings=True), dtype=np.float32)
        similarities = vectors[:len(ai_items)] @ vectors[len(ai_items):].T
    except Exception as exc:
        print(f"Theme matching embedding failed; using lexical fallback: {exc}", flush=True)
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        vectors = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1).fit_transform(texts)
        similarities = cosine_similarity(vectors[:len(ai_items)], vectors[len(ai_items):])

    candidates = []
    for ai_index in range(len(ai_items)):
        for human_index in range(len(human_items)):
            score = float(similarities[ai_index, human_index])
            if score >= float(threshold):
                candidates.append((score, ai_index, human_index))
    candidates.sort(reverse=True)
    used_ai, used_human, matches = set(), set(), []
    for score, ai_index, human_index in candidates:
        if ai_index in used_ai or human_index in used_human:
            continue
        used_ai.add(ai_index)
        used_human.add(human_index)
        matches.append({
            "ai_index": ai_index,
            "human_index": human_index,
            "similarity": round(score, 6),
        })
    return matches


def review_codebook_relevance(entries, research_question, completion_fn):
    """Classify each final code against the research question and explain the decision."""
    items = entries if isinstance(entries, list) else []
    question = str(research_question or "").strip()
    if not items or not question:
        return []

    def review(item):
        index, entry = item
        code_name = str(entry.get("initial code") or "Untitled code").strip()
        excerpts = entry.get("clues") if isinstance(entry.get("clues"), list) else []
        evidence = "\n".join(f"- {str(excerpt).strip()}" for excerpt in excerpts if str(excerpt).strip())[:10000]
        prompt = f"""Research question: {question}
Final code: {code_name}
Associated excerpts:
{evidence or '- No excerpt available'}

Decide whether this final code and its associated excerpts directly help answer the research question.
Return only one JSON object in this exact shape:
{{"related": true, "reason": "One or two concise sentences grounded in the code and excerpts."}}
Use true when the evidence is relevant and false when deletion should be suggested. The reason must be specific, evidence-based, and 1-2 sentences."""
        response = completion_fn([{"role": "user", "content": prompt}], temperature=0)
        result = parse_ai_edit_json(response.choices[0].message.content)
        related = result.get("related")
        reason = re.sub(r"\s+", " ", str(result.get("reason") or "")).strip()
        if not isinstance(related, bool) or not reason:
            raise ValueError(f"AI returned an invalid relevance review for {code_name}.")
        sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", reason) if sentence.strip()]
        concise_reason = " ".join(sentences[:2]).strip()[:800]
        return {
            "entry_index": index,
            "related": related,
            "reason": concise_reason,
        }

    def safely_review(item):
        try:
            return review(item)
        except Exception as exc:
            index, entry = item
            print(f"Could not review relevance for final code {entry.get('initial code') or index}: {exc}", flush=True)
            return {"entry_index": index, "related": None, "reason": ""}

    with ThreadPoolExecutor(max_workers=min(4, len(items))) as executor:
        return list(executor.map(safely_review, enumerate(items)))


def prepare_docx_chunks(source_docx_path, out_dir, transcript_id):
    paragraph_chunk = get_paragraph_chunk_module()
    text = paragraph_chunk.read_docx(str(source_docx_path)).strip()
    words = word_count(text)
    out_dir.mkdir(parents=True, exist_ok=True)

    text_formatted = paragraph_chunk.speaker_content_to_newline(text)
    try:
        paragraphs = paragraph_chunk.paragraph_split(text_formatted)
        if len(paragraphs) <= 1:
            chunks, chunk_lengths = [text_formatted or text], [len(text_formatted or text)]
        else:
            model = get_chunking_model(paragraph_chunk)
            chunks, chunk_lengths = paragraph_chunk.paragraph_chunking_main(
                3500,
                80,
                True,
                text_formatted,
                model,
            )
    except Exception as exc:
        print(f"Semantic chunking failed; using one transcript chunk instead: {exc}", flush=True)
        chunks, chunk_lengths = [text_formatted or text], [len(text_formatted or text)]

    if not chunks:
        chunks = [text_formatted or text]
        chunk_lengths = [len(chunks[0])]

    paragraph_chunk.save_chunk_to_docx(
        chunks,
        str(out_dir),
        interview_name=f"Interview_{transcript_id}",
        base_name="chunk",
    )
    chunk_paths = sorted(out_dir.glob(f"Interview_{transcript_id}_chunk_*.docx"))
    return text, words, chunk_paths, chunk_lengths


def normalize_uploaded_name(filename):
    cleaned = safe_filename(filename)
    if re.match(r"^Interview_\d+_chunk_\d+\.docx$", cleaned, re.IGNORECASE):
        return cleaned
    stem = Path(cleaned).stem
    digit_match = re.search(r"(\d+)", stem)
    transcript_id = digit_match.group(1).zfill(4) if digit_match else "0000"
    return f"Interview_{transcript_id}_chunk_001.docx"


def parse_transcript_id(filename):
    match = re.match(r"^Interview_(\d+)_chunk_(\d+)\.docx$", filename, re.IGNORECASE)
    if match:
        return match.group(1)
    return "0000"


def import_workflow_modules():
    import distutils
    import distutils.version as distutils_version
    distutils.version = distutils_version

    required_modules = [
        "coder_agent.py",
        "coder_collaboration_reflection.py",
        "dedup.py",
        "evaluation.py",
        "RTA_workflow.py",
        "themer_agents_once.py",
        "new_consensus_cluster_distinctiveness.py",
    ]
    missing_modules = [name for name in required_modules if not (WORKFLOW_DIR / name).exists()]
    if missing_modules:
        raise FileNotFoundError(
            "ReflexCoTI workflow modules are missing from workflow_modules: "
            + ", ".join(missing_modules)
        )

    if str(WORKFLOW_DIR) not in sys.path:
        sys.path.insert(0, str(WORKFLOW_DIR))

    # Modules are imported once and receive all request-specific values through
    # function arguments. Never reload or monkeypatch their globals per job.
    return importlib.import_module("RTA_workflow")

def generate_project_initial_reflections(payload, research_question):
    """Generate four project-specific coder profiles and assumptions concurrently."""
    settings = {
        "azure_endpoint": str(payload.get("azure_endpoint") or "").strip(),
        "api_key": str(payload.get("api_key") or "").strip(),
        "api_version": str(payload.get("api_version") or "").strip(),
        "deployment_name": str(payload.get("model") or "").strip(),
    }
    missing = [
        key.replace("deployment_name", "model")
        for key, value in settings.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing Azure OpenAI setting: {', '.join(missing)}")

    def generate(agent_name):
        reflection = generate_project_agent_reflection(
            agent_name=agent_name,
            research_question=research_question,
            **settings,
        )
        return agent_name, reflection

    with ThreadPoolExecutor(max_workers=len(AGENTS)) as executor:
        return dict(executor.map(generate, AGENTS))


def parse_ai_edit_json(text):
    value = str(text or "").strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.IGNORECASE)
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        start, end = value.find("{"), value.rfind("}")
        if start >= 0 and end > start:
            return json.loads(value[start:end + 1])
        raise ValueError("AI returned an unreadable proposal. Please try again.")


def identified_ai_edit_items(items, entity_type):
    """Add stable, human-readable identifiers without changing stored analysis data."""
    identified = []
    for item_index, item in enumerate(items):
        value = dict(item)
        value["item_id"] = f"{entity_type}_{item_index + 1}"
        if entity_type == "code":
            excerpts = value.get("excerpts") if isinstance(value.get("excerpts"), list) else []
            value["excerpt_ids"] = [f"excerpt_{index + 1}" for index in range(len(excerpts))]
        else:
            codes = value.get("codes") if isinstance(value.get("codes"), list) else []
            identified_codes = []
            for code_index, code in enumerate(codes):
                identified_code = dict(code)
                identified_code["code_id"] = f"code_{code_index + 1}"
                excerpts = identified_code.get("excerpts") if isinstance(identified_code.get("excerpts"), list) else []
                identified_code["excerpt_ids"] = [
                    f"code_{code_index + 1}_excerpt_{index + 1}" for index in range(len(excerpts))
                ]
                identified_codes.append(identified_code)
            value["codes"] = identified_codes
        identified.append(value)
    return identified


def run_ai_edit_stage(completion, messages, stage_name):
    """Run one Ask AI stage and turn provider/format failures into useful guidance."""
    try:
        response = completion(messages)
        result = parse_ai_edit_json(response.choices[0].message.content)
    except Exception as exc:
        guidance = (
            "AI could not understand the instruction. Check your Azure OpenAI settings and connection, "
            "then try again. If the problem continues, describe the result you want in another way."
            if stage_name == "understanding" else
            "AI understood the instruction but could not create the proposal. Check your Azure OpenAI "
            "settings and connection, then try again. You can also edit the item yourself."
        )
        raise ValueError(guidance) from exc
    if not isinstance(result, dict):
        guidance = (
            "AI could not return a usable understanding. Try again, or describe the result you want in another way."
            if stage_name == "understanding" else
            "AI understood the instruction but did not return a usable proposal. Try again, or edit the item yourself."
        )
        raise ValueError(guidance)
    return result


def visible_ai_edit_request(request_content):
    understanding_request = dict(request_content)
    if request_content.get("entity_type") == "code":
        understanding_request["items"] = [
            {
                "item_id": item.get("item_id"),
                "code_name": item.get("title", ""),
                "excerpts": item.get("excerpts", []),
                "excerpt_ids": item.get("excerpt_ids", []),
            }
            for item in request_content.get("items", [])
            if isinstance(item, dict)
        ]
    elif request_content.get("entity_type") == "theme":
        understanding_request["items"] = []
        for item in request_content.get("items", []):
            if not isinstance(item, dict):
                continue
            understanding_item = {
                "item_id": item.get("item_id"),
                "theme_name": item.get("title", ""),
                "description": item.get("rationale", ""),
                "codes": [
                    {
                        "code_id": code.get("code_id"),
                        "code_name": code.get("code_name") or code.get("title", ""),
                    }
                    for code in item.get("codes", [])
                    if isinstance(code, dict)
                ],
            }
            understanding_request["items"].append(understanding_item)
    return understanding_request


def understand_ai_edit_request(completion, request_content):
    understanding_request = visible_ai_edit_request(request_content)
    system = (
        "Interpret the requested revise, split, or merge using the user's instruction and supplied visible "
        "code or theme content; resolve informal wording and delegated creative choices reasonably. "
        "State the interpreted request, what should change, and what should remain unchanged without performing "
        "the edit; ask one concise question only if materially different interpretations remain. "
        "Return JSON only: {\"status\":\"understood or needs_clarification\","
        "\"interpreted_request\":\"\",\"changes\":[],\"preserve\":[],\"clarification_question\":\"\"}."
    )
    raw = run_ai_edit_stage(completion, [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(understanding_request, ensure_ascii=False)},
    ], "understanding")
    status = str(raw.get("status") or "understood").strip().lower()
    question = str(raw.get("clarification_question") or "").strip()

    def clean_list(key):
        values = raw.get(key)
        return [str(value).strip() for value in values if str(value).strip()] \
            if isinstance(values, list) else []

    interpreted_request = str(raw.get("interpreted_request") or "").strip()
    changes = clean_list("changes")
    clarification_requested = status == "needs_clarification" or bool(question)
    clarification_is_blocking = clarification_requested and not (
        interpreted_request and changes)
    return {
        "status": "needs_clarification" if clarification_is_blocking else "understood",
        "interpreted_request": interpreted_request,
        "changes": changes,
        "preserve": clean_list("preserve"),
        "clarification_question": question if clarification_is_blocking else "",
    }


def perform_ai_edit_request(completion, request_content, understanding, result_shape):
    performing_request = visible_ai_edit_request(request_content)
    system = (
        "Perform the requested edit exactly as described in understanding, using only the visible content in "
        "request; preserve everything listed under preserve and return a complete editable proposal without "
        "unrelated changes. If the edit cannot be completed, use status \"unable\" and explain why in "
        "completion_note. Return JSON only in this shape: "
        "{\"status\":\"completed or unable\",\"revised_result\":" +
        json.dumps(result_shape, ensure_ascii=False) +
        ",\"applied_changes\":[],\"preserved_content\":[],\"completion_note\":\"\"}."
    )
    return run_ai_edit_stage(completion, [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({
            "request": performing_request,
            "understanding": understanding,
        }, ensure_ascii=False)},
    ], "performing")


def refine_ai_edit_request(completion, request_content, previous_understanding, rejected_proposal, result_shape):
    """Create a new alternative using the prior AI proposal as explicit negative feedback."""
    refining_request = visible_ai_edit_request(request_content)
    system = (
        "Create a materially different replacement for rejected_proposal using only the visible content in "
        "request; re-evaluate understanding, treat the rejected proposal as a negative example, and preserve "
        "factual source content. Do not ask for clarification; if no supported alternative can be produced, "
        "use status \"unable\" and explain why in completion_note. Return JSON only in this shape: "
        "{\"status\":\"completed or unable\",\"revised_result\":" +
        json.dumps(result_shape, ensure_ascii=False) +
        ",\"applied_changes\":[],\"preserved_content\":[],\"completion_note\":\"\"}."
    )
    return run_ai_edit_stage(completion, [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({
            "request": refining_request,
            "understanding": previous_understanding,
            "rejected_proposal": {
                "label": "Rejected AI proposal — the user does not want this answer",
                "content": rejected_proposal,
            },
        }, ensure_ascii=False)},
    ], "refining")


def ai_edit_metadata(understanding, performance=None):
    performance = performance or {}
    applied = performance.get("applied_changes")
    applied = [str(value).strip() for value in applied if str(value).strip()] \
        if isinstance(applied, list) else []
    note = str(performance.get("completion_note") or "").strip()
    summary = "; ".join(applied)
    if note:
        summary = f"{summary}. {note}" if summary else note
    return {
        "instruction_interpretation": understanding["interpreted_request"],
        "interpretation_requested_changes": understanding["changes"],
        "interpretation_preserved_content": understanding["preserve"],
        "performance_summary": summary,
    }


def ai_edit_proposal(payload):
    """Two-call Ask AI flow: understand the user's meaning, then perform it."""
    action = str(payload.get("action") or "").strip().lower()
    entity_type = str(payload.get("entity_type") or "").strip().lower()
    items = payload.get("items")
    instruction = str(payload.get("instruction") or "").strip()
    rejected_proposal = payload.get("rejected_proposal")
    prior_ai_context = payload.get("prior_ai_context")
    prior_ai_context = prior_ai_context if isinstance(prior_ai_context, dict) else {}
    raw_previous_understanding = prior_ai_context.get("ai_understanding")
    raw_previous_understanding = raw_previous_understanding if isinstance(raw_previous_understanding, dict) else {}

    def clean_context_list(key):
        values = raw_previous_understanding.get(key)
        return [str(value).strip() for value in values if str(value).strip()] \
            if isinstance(values, list) else []

    previous_understanding = {
        "interpreted_request": str(raw_previous_understanding.get("interpreted_request") or "").strip(),
        "changes": clean_context_list("changes"),
        "preserve": clean_context_list("preserve"),
    }
    original_user_instruction = str(prior_ai_context.get("original_user_instruction") or "").strip()
    is_refinement = isinstance(rejected_proposal, dict) and bool(rejected_proposal)
    if action not in {"revise", "split", "merge"} or entity_type not in {"code", "theme"}:
        raise ValueError("Unsupported AI editing request.")
    if not isinstance(items, list) or not items or len(items) > 20:
        raise ValueError("Select a valid item or set of items.")
    if action != "merge" and len(items) != 1:
        raise ValueError("Revise and split requests require exactly one item.")
    if action == "merge" and len(items) < 2:
        raise ValueError("Merge requests require at least two items.")
    if is_refinement and action not in {"revise", "split", "merge"}:
        raise ValueError("Only revision, split, and merge proposals can be refined without an instruction.")
    if not instruction and not is_refinement:
        raise ValueError("Tell AI what you want changed before generating a proposal.")

    shapes = {
        ("revise", "code"): {"code_name": "complete code name", "excerpts": ["complete resulting excerpt"]},
        ("revise", "theme"): {"theme_name": "complete theme name", "description": "complete theme description"},
        ("split", "code"): {"parts": [{"code_name": "new code name", "excerpt_indexes": [0]}]},
        ("split", "theme"): {"parts": [{"theme_name": "new theme name", "description": "description", "code_indexes": [0]}]},
        ("merge", "code"): {"code_name": "merged code name"},
        ("merge", "theme"): {"theme_name": "merged theme name", "description": "merged theme description"},
    }
    request_content = {
        "action": action,
        "entity_type": entity_type,
        "user_instruction": original_user_instruction if is_refinement else instruction,
        "items": identified_ai_edit_items(items, entity_type),
    }
    completion = make_completion(
        str(payload.get("azure_endpoint") or "").strip(),
        str(payload.get("api_key") or "").strip(),
        str(payload.get("api_version") or "").strip(),
        str(payload.get("model") or "").strip(),
    )
    understanding = ({
        "status": "understood",
        "interpreted_request": instruction or "Replace the rejected AI proposal with a materially different, evidence-grounded alternative.",
        "changes": ["Use a different central interpretation and framing from the rejected proposal."],
        "preserve": ["Preserve the original supporting evidence and factual source content."],
        "clarification_question": "",
    } if is_refinement else understand_ai_edit_request(completion, request_content))
    metadata = ai_edit_metadata(understanding)
    if understanding["status"] == "needs_clarification":
        return {
            **metadata,
            "needs_clarification": True,
            "clarification_question": understanding["clarification_question"] or
                "Could you clarify the result you want?",
        }

    performance = (refine_ai_edit_request(
        completion, request_content, previous_understanding, rejected_proposal,
        shapes[(action, entity_type)]) if is_refinement else
        perform_ai_edit_request(
            completion, request_content, understanding, shapes[(action, entity_type)]))
    metadata = ai_edit_metadata(understanding, performance)
    if str(performance.get("status") or "").strip().lower() != "completed":
        reason = str(performance.get("completion_note") or "").strip()
        return {
            **metadata,
            "proposal_failed": True,
            "failure_message": (
                (reason + " ") if reason else "AI could not complete the understood revision. "
            ) + "Try again with more context, or edit the item yourself.",
        }
    revised = performance.get("revised_result")
    if not isinstance(revised, dict):
        raise ValueError(
            "AI understood the instruction but did not return a usable proposal. Try again, or edit the item yourself."
        )
    proposal = {**metadata}
    original = items[0]

    if action == "revise":
        if entity_type == "code":
            proposal["code_name"] = str(
                revised.get("code_name") or original.get("title") or ""
            ).strip()
            excerpts = revised.get("excerpts")
            proposal["excerpts"] = [str(value) for value in excerpts if str(value).strip()] \
                if isinstance(excerpts, list) else [str(value) for value in original.get("excerpts", [])]
            proposal["changed_fields"] = [
                field for field, original_field in (("code_name", "title"), ("excerpts", "excerpts"))
                if proposal[field] != original.get(original_field)]
        else:
            proposal["theme_name"] = str(
                revised.get("theme_name") or original.get("title") or ""
            ).strip()
            proposal["description"] = str(
                revised.get("description") if revised.get("description") is not None
                else original.get("rationale") or ""
            ).strip()
            proposal["changed_fields"] = [
                field for field, original_field in (("theme_name", "title"), ("description", "rationale"))
                if proposal[field] != str(original.get(original_field) or "")]
        if not proposal["changed_fields"]:
            return {
                **metadata,
                "proposal_failed": True,
                "failure_message": "AI understood the instruction but returned no revision. Try again with more context, or edit the item yourself.",
            }
    elif action == "split":
        parts = revised.get("parts") if isinstance(revised.get("parts"), list) else []
        name_key = "code_name" if entity_type == "code" else "theme_name"
        index_key = "excerpt_indexes" if entity_type == "code" else "code_indexes"
        normalized_parts = []
        for part in parts:
            if not isinstance(part, dict):
                continue
            name = str(part.get(name_key) or "").strip()
            if not name:
                continue
            indexes = part.get(index_key)
            normalized_part = {
                name_key: name,
                index_key: indexes if isinstance(indexes, list) else [],
            }
            if entity_type == "theme":
                normalized_part["description"] = str(part.get("description") or "").strip()
            normalized_parts.append(normalized_part)
        proposal["parts"] = normalized_parts
        if len(proposal["parts"]) < 2:
            return {
                **metadata,
                "proposal_failed": True,
                "failure_message": "AI understood the instruction but did not create at least two usable parts. Try again with more context, or split it yourself.",
            }
    else:
        name_key = "code_name" if entity_type == "code" else "theme_name"
        proposal[name_key] = str(revised.get(name_key) or "").strip()
        if entity_type == "theme":
            proposal["description"] = str(revised.get("description") or "").strip()
        if not proposal[name_key]:
            return {
                **metadata,
                "proposal_failed": True,
                "failure_message": "AI understood the instruction but did not create a usable merged result. Try again, or merge the items yourself.",
            }
    return proposal


def parse_coding_text(text):
    block_pattern = re.compile(
        r"Initial Code:\s*(.*?)\n"
        r"\s*Clues?:\s*(.*?)\n"
        r"(?:\s*Importance Score:\s*(\d+)\s*)?"
        r"(?=\n\s*Initial Code:|\Z)",
        flags=re.DOTALL | re.IGNORECASE,
    )
    items = []
    for code_raw, clue_raw, score_raw in block_pattern.findall(text or ""):
        code = " ".join(code_raw.strip().split())
        clue_text = clue_raw.strip().replace("“", '"').replace("”", '"')
        quoted_clues = [match.strip() for match in re.findall(r'"([^"]+)"', clue_text) if match.strip()]
        clues = quoted_clues or [clue_text.strip('" ')]
        if not code:
            continue
        score = int(score_raw) if score_raw and score_raw.isdigit() else None
        for clue in clues:
            clue = " ".join(clue.strip().split())
            if clue:
                items.append({"code": code, "clue": clue, "score": score})
    return items


def normalize_words(value):
    return set(re.findall(r"[a-z0-9]+", str(value or "").lower()))


def normalized_string(value):
    return " ".join(re.findall(r"[a-z0-9]+", str(value or "").lower()))


def text_overlap(left, right):
    left_norm = normalized_string(left)
    right_norm = normalized_string(right)
    if not left_norm or not right_norm:
        return 0
    if left_norm in right_norm or right_norm in left_norm:
        return 1
    left_words = normalize_words(left_norm)
    right_words = normalize_words(right_norm)
    if not left_words or not right_words:
        return 0
    return len(left_words & right_words) / max(1, min(len(left_words), len(right_words)))


def average_score(scores):
    numeric_scores = [score for score in scores if isinstance(score, int)]
    if not numeric_scores:
        return None
    return round(sum(numeric_scores) / len(numeric_scores), 1)


def format_score(score):
    if isinstance(score, int):
        return str(score)
    if isinstance(score, float):
        return f"{score:g}"
    return ""


def agent_labels(agent_names):
    return [AGENT_LABELS.get(agent, agent.replace("_", " ").title()) for agent in agent_names]


def code_score_level(score):
    try:
        numeric_score = float(score)
    except (TypeError, ValueError):
        return ""
    if numeric_score >= 5:
        return "critical"
    if numeric_score >= 4:
        return "strong"
    return ""


def final_codebook_codes(snapshot):
    """Return the reviewed code-clue inputs included in a finished coding revision."""
    output = []
    for code in snapshot.get("codes") or []:
        if not isinstance(code, dict) or code.get("◇"):
            continue
        if code.get("sourceClass") == "human" and code.get("createdFromSelection") and not code.get("includedAfterAiReview"):
            continue
        if code.get("reviewStatus") not in {"accepted", "revised", "split", "merged"}:
            continue
        title = str(code.get("title") or "").strip()
        excerpts = _code_excerpts_for_comparison(code)
        if not title or not excerpts:
            continue
        output.append({
            "code id": str(code.get("id") or ""),
            "code name": title,
            "source": "Human" if code.get("sourceClass") == "human" else "AI+Human" if code.get("source") == "AI+Human" or code.get("reviewStatus") in {"revised", "split", "merged"} else "AI",
            "excerpts": excerpts,
        })
    return output


def public_project_codebook(project_id, include_codebook=False):
    update_status = project_codebook_update_status(project_id)
    with database() as connection:
        row = connection.execute(
            "SELECT * FROM project_codebooks WHERE project_id = ?", (project_id,)
        ).fetchone()
    if not row:
        return {
            "available": False,
            "current_size": 0,
            "previous_size": 0,
            "net_growth": 0,
            "included_revisions": {},
            "update_history": [],
            "new_code_names": [],
            "updated_at": None,
            **update_status,
        }
    payload = {
        "available": True,
        "codebook_id": row["codebook_id"],
        "current_size": int(row["current_size"] or 0),
        "previous_size": int(row["previous_size"] or 0),
        "net_growth": int(row["net_growth"] or 0),
        "included_revisions": json.loads(row["included_revisions"] or "{}"),
        "update_history": json.loads(row["update_history"] or "[]"),
        "new_code_names": json.loads(row["new_code_names"] or "[]"),
        "updated_at": row["updated_at"],
        **update_status,
    }
    if include_codebook:
        codebook_path = THEME_CODEBOOK_DIR / row["codebook_id"] / "ai_codebook.json"
        if not codebook_path.is_file():
            payload.update({"available": False, "codebook": None})
        else:
            payload["codebook"] = public_codebook(json.loads(codebook_path.read_text(encoding="utf-8")))
    return payload


def update_project_codebook(user, project, transcript_id, settings):
    """Initialize once, then add only the newly finished transcript."""
    required = ("azure_endpoint", "api_key", "api_version", "model")
    missing = [key for key in required if not str(settings.get(key) or "").strip()]
    if missing:
        raise ValueError("Missing Azure OpenAI setting for codebook update: " + ", ".join(missing))

    project_id = project["id"]
    with project_codebook_lock(project_id):
        with database() as connection:
            row = connection.execute(
                """SELECT t.id, t.name, t.created_at, ta.snapshot
                   FROM transcripts t JOIN transcript_analysis ta ON ta.transcript_id = t.id
                   WHERE t.project_id = ? AND t.id = ?""",
                (project_id, transcript_id),
            ).fetchone()
        if not row:
            raise ValueError("The finished transcript analysis could not be found.")
        snapshot = json.loads(row["snapshot"])
        if transcript_analysis_status(snapshot) != "finished":
            raise ValueError("Finish this coding revision before updating the codebook.")
        codes = final_codebook_codes(snapshot)
        if not codes:
            raise ValueError("The finished transcript has no reviewed codes for the codebook.")
        revision = max(1, int(snapshot.get("codingRevision") or 1))

        previous = public_project_codebook(project_id, include_codebook=True)
        previous_size = int(previous.get("current_size") or 0)
        included_revisions = dict(previous.get("included_revisions") or {})
        update_history = list(previous.get("update_history") or [])
        previous_code_names = {
            normalized_string(entry.get("initial code", ""))
            for entry in (previous.get("codebook") or {}).get("entries", [])
            if normalized_string(entry.get("initial code", ""))
        }
        if previous.get("available") and included_revisions and not update_history:
            baseline_transcript_id = next(reversed(included_revisions))
            with database() as connection:
                baseline_row = connection.execute(
                    "SELECT name FROM transcripts WHERE project_id=? AND id=?",
                    (project_id, baseline_transcript_id),
                ).fetchone()
            update_history.append({
                "order": len(included_revisions),
                "transcript_id": baseline_transcript_id,
                "transcript_name": baseline_row["name"] if baseline_row else baseline_transcript_id,
                "total_codes": previous_size,
                "net_growth": int(previous.get("net_growth") or 0),
                "new_code_names": (
                    [entry.get("initial code", "") for entry in (previous.get("codebook") or {}).get("entries", [])]
                    if len(included_revisions) == 1 else list(previous.get("new_code_names") or [])
                ),
                "updated_at": previous.get("updated_at"),
                "baseline": True,
            })
        transcript_key = str(transcript_id)
        if transcript_key in included_revisions:
            if int(included_revisions[transcript_key]) != revision:
                raise ValueError(
                    "This transcript already contributed an earlier coding revision. "
                    "The cumulative codebook was not rebuilt or changed."
                )
            return public_project_codebook(project_id, include_codebook=True)

        if previous.get("available"):
            codebook_id = previous["codebook_id"]
            run_dir = THEME_CODEBOOK_DIR / codebook_id
            if not (run_dir / "codebook.json").is_file():
                raise ValueError("The existing cumulative codebook file is unavailable.")
        else:
            codebook_id = uuid.uuid4().hex[:12]
            run_dir = THEME_CODEBOOK_DIR / codebook_id
            run_dir.mkdir(parents=True, exist_ok=False)
            (run_dir / "owner.json").write_text(json.dumps({
                "owner_id": user["user_id"], "project_id": project_id,
            }), encoding="utf-8")

        input_dir = run_dir / "coding_exports"
        review_dir = run_dir / "codebook_review_logs"
        input_dir.mkdir(parents=True, exist_ok=True)
        transcript_name = row["name"]
        path_out = input_dir / "{:03d}_{}_{}.json".format(
            len(included_revisions) + 1,
            storage_label(transcript_id, "transcript"),
            storage_label(transcript_name, "transcript"),
        )
        path_out.write_text(json.dumps({
            "project": {"id": project_id, "name": project["name"]},
            "research_question": project["research_question"],
            "interviewee": project["interviewee"],
            "transcript": {"id": transcript_id, "file_name": transcript_name},
            "coding_revision": revision,
            "codes": codes,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        completion_fn = make_completion(
            settings["azure_endpoint"], settings["api_key"],
            settings["api_version"], settings["model"],
        )
        import_workflow_modules()
        codebook_creation_module = importlib.import_module("codebook_creation")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            if previous.get("available"):
                update_result = codebook_creation_module.update_codebook_from_code_quote_file(
                    json_path=str(path_out),
                    codebook_path=str(run_dir / "codebook.json"),
                    review_output_dir=str(review_dir),
                    top_k=3,
                    reuse_threshold=0.80,
                    compact_threshold=0.80,
                    sleep_seconds=0,
                    completion_fn=completion_fn,
                )
                codebook = update_result["codebook"]
            else:
                codebook = codebook_creation_module.codebook_creation(
                    coding_result_files=[str(path_out)],
                    codebook_path=str(run_dir / "codebook.json"),
                    review_output_dir=str(review_dir),
                    top_k=3,
                    reuse_threshold=0.80,
                    compact_threshold=0.80,
                    sleep_seconds=0,
                    completion_fn=completion_fn,
                )
        all_inputs = [str(path) for path in sorted(input_dir.glob("*.json"))]
        public = public_codebook(codebook_source_refs(all_inputs, codebook))
        current_size = len(public["entries"])
        new_code_names = [
            entry.get("initial code", "")
            for entry in public["entries"]
            if normalized_string(entry.get("initial code", "")) not in previous_code_names
        ]
        included_revisions[transcript_key] = revision
        now = time.time()
        update_history.append({
            "order": len(included_revisions),
            "transcript_id": transcript_key,
            "transcript_name": transcript_name,
            "total_codes": current_size,
            "net_growth": current_size - previous_size,
            "new_code_names": new_code_names,
            "updated_at": now,
        })
        (run_dir / "ai_codebook.json").write_text(json.dumps({
            **public,
            "codebook_type": "AI",
            "created_at": now,
            "automatically_updated": True,
            "included_revisions": included_revisions,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        with database() as connection:
            connection.execute(
                """INSERT INTO project_codebooks(
                       project_id, codebook_id, current_size, previous_size,
                       net_growth, included_revisions, update_history,
                       new_code_names, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(project_id) DO UPDATE SET
                       codebook_id=excluded.codebook_id,
                       current_size=excluded.current_size,
                       previous_size=excluded.previous_size,
                       net_growth=excluded.net_growth,
                       included_revisions=excluded.included_revisions,
                       update_history=excluded.update_history,
                       new_code_names=excluded.new_code_names,
                       updated_at=excluded.updated_at""",
                (project_id, codebook_id, current_size, previous_size,
                 current_size - previous_size, json.dumps(included_revisions),
                 json.dumps(update_history), json.dumps(new_code_names), now),
            )
            connection.execute("DELETE FROM project_analysis WHERE project_id = ?", (project_id,))
        return public_project_codebook(project_id, include_codebook=True)


def public_codebook(codebook):
    entries = []
    for entry in codebook.get("entries", []):
        public_entry = {
            "initial code": entry.get("initial code", ""),
            "clues": entry.get("clues", []),
            "transcript_ids": entry.get("transcript_ids", []),
            "source_refs": entry.get("source_refs", []),
        }
        if isinstance(entry.get("ai_relevance_related"), bool):
            public_entry["ai_relevance_related"] = entry["ai_relevance_related"]
        if isinstance(entry.get("ai_suggested_delete"), bool):
            public_entry["ai_suggested_delete"] = entry["ai_suggested_delete"]
        if isinstance(entry.get("ai_deletion_reason"), str) and entry["ai_deletion_reason"].strip():
            public_entry["ai_deletion_reason"] = entry["ai_deletion_reason"].strip()[:800]
        entries.append(public_entry)
    return {
        "retrieval_mode": codebook.get("retrieval_mode", "code_clue"),
        "entries": entries,
    }


def codebook_source_refs(coding_result_files, codebook):
    """Attach stable transcript/code references to generated codebook entries."""
    sources = []
    for json_path in coding_result_files:
        with open(json_path, "r", encoding="utf-8") as source_file:
            payload = json.load(source_file)
        transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
        transcript_label = str(transcript.get("file_name") or Path(json_path).name).strip()
        transcript_id = str(transcript.get("id") or transcript.get("transcript_id") or transcript_label).strip()
        for index, code in enumerate(payload.get("codes") or []):
            if not isinstance(code, dict):
                continue
            code_name = str(code.get("code name") or code.get("code_name") or "").strip()
            excerpts = _code_excerpts_for_comparison(code)
            if not code_name and not excerpts:
                continue
            sources.append({
                "transcript_id": transcript_id[:1000],
                "transcript_label": transcript_label[:1000],
                "source_code_id": str(code.get("code id") or code.get("code_id") or index)[:1000],
                "source_code_name": code_name[:500],
                "excerpts": excerpts,
            })

    entries = codebook.get("entries") or []
    for source in sources:
        source_excerpt_keys = {normalized_string(excerpt) for excerpt in source["excerpts"] if normalized_string(excerpt)}
        best_entry = None
        best_score = (-1, -1.0)
        for entry in entries:
            entry_excerpt_keys = {
                normalized_string(clue)
                for clue in (entry.get("clues") or [])
                if normalized_string(clue)
            }
            excerpt_matches = len(source_excerpt_keys & entry_excerpt_keys)
            name_score = text_overlap(source["source_code_name"], entry.get("initial code", ""))
            score = (excerpt_matches, name_score)
            if score > best_score:
                best_score = score
                best_entry = entry
        if best_entry is None or (best_score[0] == 0 and best_score[1] <= 0):
            continue
        best_entry.setdefault("source_refs", []).append(source)

    for entry in entries:
        refs = entry.get("source_refs") or []
        if refs:
            entry["transcript_ids"] = list(dict.fromkeys(
                ref["transcript_id"] for ref in refs if ref.get("transcript_id")
            ))
    return codebook


def normalize_edited_codebook(value):
    if not isinstance(value, dict) or not isinstance(value.get("entries"), list):
        raise ValueError("The edited codebook is not valid. Please review it again.")
    if not value["entries"] or len(value["entries"]) > 5000:
        raise ValueError("The edited codebook must contain between 1 and 5,000 codes.")
    entries = []
    seen_names = set()
    for raw_entry in value["entries"]:
        if not isinstance(raw_entry, dict):
            raise ValueError("Every edited codebook entry must be an object.")
        name = str(raw_entry.get("initial code", "")).strip()
        if not name or len(name) > 500:
            raise ValueError("Every edited code needs a name of 500 characters or fewer.")
        name_key = name.casefold()
        if name_key in seen_names:
            raise ValueError(f'The edited codebook contains a duplicate code name: "{name}".')
        seen_names.add(name_key)
        raw_clues = raw_entry.get("clues", [])
        raw_transcript_ids = raw_entry.get("transcript_ids", [])
        raw_source_refs = raw_entry.get("source_refs", [])
        if not isinstance(raw_clues, list) or not isinstance(raw_transcript_ids, list) or not isinstance(raw_source_refs, list):
            raise ValueError(f'The edited code "{name}" has invalid evidence data.')
        clues = []
        for clue in raw_clues:
            text = str(clue).strip()
            if text and text not in clues:
                if len(text) > 20000:
                    raise ValueError(f'An excerpt under "{name}" is too long.')
                clues.append(text)
        if not clues:
            raise ValueError(f'The edited code "{name}" needs at least one excerpt.')
        transcript_ids = []
        for transcript_id in raw_transcript_ids:
            text = str(transcript_id).strip()
            if text and text not in transcript_ids:
                transcript_ids.append(text[:1000])
        source_refs = []
        seen_source_refs = set()
        for raw_ref in raw_source_refs:
            if not isinstance(raw_ref, dict):
                continue
            ref_transcript_id = str(raw_ref.get("transcript_id") or "").strip()[:1000]
            transcript_label = str(raw_ref.get("transcript_label") or "").strip()[:1000]
            source_code_id = str(raw_ref.get("source_code_id") or "").strip()[:1000]
            source_code_name = str(raw_ref.get("source_code_name") or "").strip()[:500]
            ref_excerpts = []
            for excerpt in raw_ref.get("excerpts") or []:
                text = str(excerpt or "").strip()
                if text and text in clues and text not in ref_excerpts:
                    ref_excerpts.append(text)
            ref_key = (ref_transcript_id, source_code_id, source_code_name.casefold())
            if not ref_transcript_id or ref_key in seen_source_refs:
                continue
            seen_source_refs.add(ref_key)
            source_refs.append({
                "transcript_id": ref_transcript_id,
                "transcript_label": transcript_label,
                "source_code_id": source_code_id,
                "source_code_name": source_code_name,
                "excerpts": ref_excerpts,
            })
        normalized_entry = {
            "initial code": name,
            "clues": clues,
            "transcript_ids": transcript_ids,
            "source_refs": source_refs,
        }
        if isinstance(raw_entry.get("ai_relevance_related"), bool):
            normalized_entry["ai_relevance_related"] = raw_entry["ai_relevance_related"]
        if isinstance(raw_entry.get("ai_suggested_delete"), bool):
            normalized_entry["ai_suggested_delete"] = raw_entry["ai_suggested_delete"]
        if isinstance(raw_entry.get("ai_deletion_reason"), str) and raw_entry["ai_deletion_reason"].strip():
            normalized_entry["ai_deletion_reason"] = raw_entry["ai_deletion_reason"].strip()[:800]
        entries.append(normalized_entry)
    return {
        "retrieval_mode": str(value.get("retrieval_mode", "code_clue"))[:100] or "code_clue",
        "entries": entries,
    }


def save_reviewed_codebook(run_dir, edited_codebook, change_history=None):
    reviewed = normalize_edited_codebook(edited_codebook)
    reviewed_at = time.time()
    ai_path = run_dir / "ai_codebook.json"
    legacy_ai_path = run_dir / "codebook.json"
    if not ai_path.exists() and legacy_ai_path.exists():
        original = public_codebook(json.loads(legacy_ai_path.read_text(encoding="utf-8")))
        ai_path.write_text(
            json.dumps({
                **original,
                "codebook_type": "AI",
                "created_at": legacy_ai_path.stat().st_mtime,
            }, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    saved = {
        **reviewed,
        "codebook_type": "AI+Human",
        "reviewed_at": reviewed_at,
    }
    (run_dir / "ai_human_codebook.json").write_text(
        json.dumps(saved, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    history = change_history if isinstance(change_history, list) else []
    (run_dir / "ai_human_codebook_review.json").write_text(
        json.dumps({
            "codebook_type": "AI+Human",
            "reviewed_at": reviewed_at,
            "change_history": history[:5000],
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return reviewed


def load_codebook_for_themes(run_dir, filter_mode, edited_codebook=None):
    if edited_codebook is not None:
        codebook = normalize_edited_codebook(edited_codebook)
    else:
        reviewed_path = run_dir / "ai_human_codebook.json"
        codebook_path = reviewed_path if reviewed_path.exists() else run_dir / "codebook.json"
        if not codebook_path.exists():
            raise FileNotFoundError("Generate the codebook before generating themes.")
        loaded = json.loads(codebook_path.read_text(encoding="utf-8"))
        codebook = normalize_edited_codebook(loaded) if reviewed_path.exists() else loaded
    entries = codebook.get("entries", [])
    if filter_mode == "remove-single-transcript":
        entries = [
            entry for entry in entries
            if len({str(item) for item in entry.get("transcript_ids", []) if str(item).strip()}) > 1
        ]
    theme_codebook = {
        "retrieval_mode": codebook.get("retrieval_mode", "code_clue"),
        "entries": entries,
    }
    theme_codebook_path = run_dir / "codebook_for_themes.json"
    theme_codebook_path.write_text(json.dumps(theme_codebook, indent=2, ensure_ascii=False), encoding="utf-8")
    return theme_codebook_path, theme_codebook


def theme_lookup_from_codebook_ids(codebook_ids_path):
    data = json.loads(Path(codebook_ids_path).read_text(encoding="utf-8"))
    lookup = {}
    for entry in data.get("entries", []):
        code_id = str(entry.get("code_id", "")).strip()
        if not code_id:
            continue
        lookup[code_id] = {
            "codeName": entry.get("initial code", ""),
            "quotes": entry.get("clues", []) if isinstance(entry.get("clues"), list) else [entry.get("clues", "")],
            "transcriptIds": entry.get("transcript_ids", []),
        }
    return lookup


def theme_lookup_from_clustered_ids(clustered_path):
    data = json.loads(Path(clustered_path).read_text(encoding="utf-8"))
    lookup = {}
    for cluster in data.get("clusters", []):
        for entry in cluster.get("items", []):
            code_id = str(entry.get("code_id", "")).strip()
            if not code_id:
                continue
            lookup[code_id] = {
                "codeName": entry.get("initial code", ""),
                "quotes": entry.get("clues", []) if isinstance(entry.get("clues"), list) else [entry.get("clues", "")],
                "transcriptIds": entry.get("transcript_ids", []),
            }
    return lookup


def public_themes_from_repaired_output(repaired_output, code_lookup):
    raw_themes = []
    if isinstance(repaired_output, dict):
        raw_themes = repaired_output.get("candidate_themes", []) or []
    elif isinstance(repaired_output, list):
        for cluster_result in repaired_output:
            raw_themes.extend(
                ((cluster_result.get("codebook") or {}).get("candidate_themes") or [])
            )

    themes = []
    assigned_code_ids = set()
    for index, theme in enumerate(raw_themes, start=1):
        related_ids = theme.get("related_initial_codes", []) or []
        if not isinstance(related_ids, list):
            related_ids = [related_ids]
        codes = []
        seen = set()
        for code_id in related_ids:
            code_id = str(code_id).strip()
            if not code_id or code_id in seen or code_id in assigned_code_ids or code_id not in code_lookup:
                continue
            seen.add(code_id)
            assigned_code_ids.add(code_id)
            code_info = code_lookup.get(code_id, {})
            quotes = [str(item).strip() for item in code_info.get("quotes", []) if str(item).strip()]
            codes.append({
                "codeId": code_id,
                "codeName": code_info.get("codeName") or code_id,
                "quote": quotes[0] if quotes else "",
                "quotes": quotes,
                "transcriptIds": code_info.get("transcriptIds", []),
            })
        if not codes:
            continue
        themes.append({
            "id": f"theme-{uuid.uuid4().hex[:8]}-{index}",
            "title": theme.get("theme_name") or f"Candidate theme {index}",
            "rationale": theme.get("definition") or "Generated from the repaired theme output.",
            "codes": codes,
            "source": "AI",
            "reviewStatus": "",
        })
    return themes


def public_themes_from_consensus_output(consensus_output, code_lookup):
    """Convert the new consensus pipeline output into editable website themes."""
    raw_themes = []
    if isinstance(consensus_output, dict):
        for cluster in consensus_output.get("clusters", []):
            if isinstance(cluster, dict):
                raw_themes.extend(cluster.get("final_themes", []) or [])

    themes = []
    assigned_code_ids = set()
    for index, theme in enumerate(raw_themes, start=1):
        related_ids = theme.get("code_ids", []) or []
        if not isinstance(related_ids, list):
            related_ids = [related_ids]
        codes = []
        seen = set()
        for code_id in related_ids:
            code_id = str(code_id).strip()
            if not code_id or code_id in seen or code_id in assigned_code_ids or code_id not in code_lookup:
                continue
            seen.add(code_id)
            assigned_code_ids.add(code_id)
            code_info = code_lookup[code_id]
            quotes = [str(item).strip() for item in code_info.get("quotes", []) if str(item).strip()]
            codes.append({
                "codeId": code_id,
                "codeName": code_info.get("codeName") or code_id,
                "quote": quotes[0] if quotes else "",
                "quotes": quotes,
                "transcriptIds": code_info.get("transcriptIds", []),
            })
        if not codes:
            continue
        themes.append({
            "id": f"theme-{uuid.uuid4().hex[:8]}-{index}",
            "title": theme.get("theme_name") or f"Candidate theme {index}",
            "rationale": theme.get("definition") or "Generated by multi-agent theme consensus.",
            "codes": codes,
            "source": "AI",
            "sourceAgent": str(theme.get("source_agent") or "").strip(),
            "sourceAgentLabel": AGENT_LABELS.get(
                str(theme.get("source_agent") or "").strip(),
                str(theme.get("source_agent") or "").strip().replace("_", " ").title(),
            ),
            "reviewStatus": "",
        })
    return themes


def enrich_theme_agent_provenance(snapshot):
    """Backfill agent attribution for snapshots saved before provenance was public."""
    if not isinstance(snapshot, dict):
        return snapshot
    codebook_id = str(snapshot.get("latestCodebookId") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", codebook_id):
        return snapshot
    consensus_path = THEME_CODEBOOK_DIR / codebook_id / "theme_generation" / "consensus" / "final_theme_consensus.json"
    try:
        consensus = json.loads(consensus_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return snapshot
    provenance = {}
    for cluster in consensus.get("clusters", []):
        for theme in cluster.get("final_themes", []) if isinstance(cluster, dict) else []:
            title_key = normalized_string(theme.get("theme_name"))
            agent = str(theme.get("source_agent") or "").strip()
            if title_key and agent:
                provenance[title_key] = (agent, AGENT_LABELS.get(agent, agent.replace("_", " ").title()))
    if not provenance:
        return snapshot
    for collection_name in ("themes", "originalAiThemes"):
        for theme in snapshot.get(collection_name, []) or []:
            if not isinstance(theme, dict) or theme.get("sourceAgent"):
                continue
            attribution = provenance.get(normalized_string(theme.get("title")))
            if attribution:
                theme["sourceAgent"], theme["sourceAgentLabel"] = attribution
    return snapshot


def sorted_agents(agent_names):
    return sorted(
        {agent for agent in agent_names if agent},
        key=lambda agent: AGENTS.index(agent) if agent in AGENTS else len(AGENTS),
    )


def load_scored_clue_metadata(run_dir, transcript_id):
    metadata = {}
    scored_dirs = ("clue_pool_filtered_4", "clue_pool_step1d", "clue_pool_step1c")
    for dirname in scored_dirs:
        scored_dir = run_dir / dirname
        scored_files = sorted(scored_dir.glob(f"clue_pool_{transcript_id}_round_*.json"))
        if not scored_files:
            continue
        data = json.loads(scored_files[-1].read_text(encoding="utf-8"))
        for clue in data.get("clue_pool", []):
            clue_id = clue.get("clue_id")
            if clue_id is not None:
                metadata[str(clue_id)] = clue
        if metadata:
            break
    return metadata


def build_first_pass_results(agent_outputs):
    groups = []
    for agent_name, output_text in agent_outputs:
        for item in parse_coding_text(output_text):
            item["agent"] = agent_name
            best_group = None
            best_overlap = 0
            for group in groups:
                overlap = max(text_overlap(item["clue"], existing["clue"]) for existing in group["items"])
                if overlap > best_overlap:
                    best_group = group
                    best_overlap = overlap
            if best_group and best_overlap >= 0.7:
                best_group["items"].append(item)
            else:
                groups.append({"items": [item]})

    excerpts = []
    codes = []
    for idx, group in enumerate(groups, start=1):
        items = group["items"]
        representative = max(items, key=lambda entry: len(entry["clue"]))
        scores = [entry.get("score") for entry in items]
        avg_score = average_score(scores)
        confidence = f"{format_score(avg_score)}/5" if avg_score is not None else ""
        agents = sorted_agents(entry["agent"] for entry in items)
        labels = agent_labels(agents)
        code_titles = [entry["code"] for entry in items if entry.get("code")]
        title = max(code_titles, key=code_titles.count) if code_titles else "Unlabeled code"
        excerpts.append({
            "id": idx,
            "text": representative["clue"],
            "line": idx,
            "code": title,
            "score": avg_score,
            "scoreLevel": code_score_level(avg_score),
        })
        codes.append({
            "id": idx,
            "title": title,
            "icon": "◆",
            "color": CODE_COLOR,
            "source": "AI",
            "sourceClass": "ai",
            "context": f"Agents: {', '.join(labels)}",
            "agents": agents,
            "agentLabel": f"Agents: {', '.join(labels)}",
            "score": avg_score,
            "scoreLevel": code_score_level(avg_score),
            "quote": f'"{representative["clue"]}"',
            "confidence": confidence,
            "selected": idx == 1,
        })

    return {"codes": codes, "excerpts": excerpts, "themes": []}


def load_compact_results_from_files(compact_files):
    compact_paths = [Path(path) for path in compact_files if path]
    compact_paths = [path for path in compact_paths if path.exists()]
    if not compact_paths:
        return {"codes": [], "excerpts": [], "themes": []}

    excerpts = []
    codes = []
    for path in compact_paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        for clue in data.get("clue_pool", []):
            raw_text = clue.get("text")
            if isinstance(raw_text, list):
                quote_texts = [str(item).strip() for item in raw_text if str(item).strip()]
            else:
                quote_texts = [str(raw_text or "").strip()] if str(raw_text or "").strip() else []
            code_name = (clue.get("final_initial_code") or "Unlabeled code").strip()
            if not quote_texts:
                continue
            idx = len(codes) + 1
            line = clue.get("clue_id") or idx
            agents = clue.get("coder_agents") or clue.get("agents") or clue.get("agent_sources") or []
            if isinstance(agents, str):
                agents = [agents]
            agents = sorted_agents(agents)
            labels = agent_labels(agents)
            agent_label = f"Agents: {', '.join(labels)}" if labels else ""
            for quote_index, text in enumerate(quote_texts, start=1):
                excerpts.append({
                    "id": f"{idx}-{quote_index}",
                    "codeId": idx,
                    "text": text,
                    "line": line,
                    "code": code_name,
                    "score": "",
                    "scoreLevel": "strong",
                })
            codes.append({
                "id": idx,
                "title": code_name,
                "icon": "◆",
                "color": CODE_COLOR,
                "source": "AI",
                "sourceClass": "ai",
                "context": agent_label,
                "agents": agents,
                "agentLabel": agent_label,
                "score": "",
                "scoreLevel": "",
                "quote": f'"{quote_texts[0]}"',
                "quotes": quote_texts,
                "confidence": "",
                "selected": idx == 1,
            })

    return {"codes": codes, "excerpts": excerpts, "themes": []}


def load_compact_results(run_dir, transcript_id):
    compact_dir = run_dir / "clue_pool_compact"
    compact_files = sorted(compact_dir.glob(f"clue_pool_{transcript_id}_round_*_compact.json"))
    return load_compact_results_from_files(compact_files)


def research_question_terms(value):
    return {
        token
        for token in re.findall(r"[a-z0-9]+", str(value or "").lower())
        if len(token) >= 4
    }


def calibration_excerpt_list(item):
    raw_excerpts = item.get("excerpts")
    if isinstance(raw_excerpts, list):
        return [str(excerpt).strip() for excerpt in raw_excerpts if str(excerpt).strip()]
    raw_excerpt = str(item.get("excerpt") or "").strip()
    if not raw_excerpt:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", raw_excerpt) if part.strip()]


def add_calibration_codes(results, research_question, seed):
    """Interleave 3-4 concealed study items, prioritizing research-question matches."""
    if not CALIBRATION_POOL_PATH.exists():
        return results
    try:
        pool = json.loads(CALIBRATION_POOL_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return results

    question_terms = research_question_terms(research_question)
    relevant = []
    fallback = []
    for item in pool.get("items", []):
        rq_terms = research_question_terms(" ".join(item.get("rq_terms", [])))
        relevance = len(question_terms & rq_terms)
        item_excerpts = calibration_excerpt_list(item)
        if item_excerpts:
            rank = hashlib.sha256(f"{seed}:{item.get('id')}".encode("utf-8")).hexdigest()
            (relevant if relevance else fallback).append((rank, item, item_excerpts))
    # Prefer plausible matches, then use the rest of the concealed pool so every
    # run contains the intended 3-4 critical-review checks.
    eligible = sorted(relevant) + sorted(fallback)
    if len(eligible) < 3:
        return results

    count_hash = hashlib.sha256(f"{seed}:count".encode("utf-8")).digest()[0]
    selected_items = [(entry[1], entry[2]) for entry in eligible[:3 + (count_hash % 2)]]
    marker = str(pool.get("marker") or "◇")
    codes = list(results.get("codes", []))
    excerpts = list(results.get("excerpts", []))

    for item, item_excerpts in selected_items:
        item_id = str(item.get("id") or uuid.uuid4().hex[:8])
        code_id = f"cal-{item_id}-{hashlib.sha256(f'{seed}:{item_id}'.encode()).hexdigest()[:8]}"
        title = str(item.get("code_name") or "Unlabeled code").strip()
        if not item_excerpts or not title:
            continue
        codes.append({
            "id": code_id,
            "title": title,
            "icon": "◆",
            "color": CODE_COLOR,
            "source": "AI",
            "sourceClass": "ai",
            "context": "",
            "agents": [],
            "agentLabel": "",
            "score": "",
            "scoreLevel": "",
            "quote": f'"{item_excerpts[0]}"',
            "quotes": item_excerpts,
            "confidence": "",
            "selected": False,
            marker: item_id,
        })
        for excerpt_index, excerpt in enumerate(item_excerpts, start=1):
            excerpts.append({
                "id": f"{code_id}-{excerpt_index}",
                "codeId": code_id,
                "text": excerpt,
                "line": "",
                "code": title,
                "score": "",
                "scoreLevel": "strong",
                marker: item_id,
            })

    # Stable interleaving keeps the study items from forming a visible block.
    codes.sort(key=lambda code: hashlib.sha256(
        f"{seed}:order:{code.get('id')}".encode("utf-8")
    ).hexdigest())
    for code in codes:
        code["selected"] = False
    if codes:
        codes[0]["selected"] = True
    return {**results, "codes": codes, "excerpts": excerpts}


def finalize_coding_results(workflow_results, research_question, seed):
    """Reject incomplete runs before concealed calibration items are added."""
    genuine_codes = workflow_results.get("codes") if isinstance(workflow_results, dict) else None
    if not isinstance(genuine_codes, list) or not genuine_codes:
        raise RuntimeError(
            "AI coding finished without producing genuine codes. Please retry AI coding."
        )
    return add_calibration_codes(workflow_results, research_question, seed)


def load_final_coding_results(run_dir):
    agent_outputs = []
    for base_name in ("final_coding_without_score", "final_coding", "independent_coding"):
        base_dir = run_dir / base_name
        if not base_dir.exists():
            continue
        json_files = sorted(base_dir.glob("**/*.json"))
        for path in json_files:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            agent_name = data.get("agent") or path.parent.name
            coding_output = data.get("coding_output", "")
            if agent_name in AGENTS and coding_output:
                agent_outputs.append((agent_name, coding_output))
        if agent_outputs:
            break

    if not agent_outputs:
        return {"codes": [], "excerpts": [], "themes": []}
    return build_first_pass_results(agent_outputs)


def load_workflow_results(run_dir, transcript_id):
    compact_results = load_compact_results(run_dir, transcript_id)
    if compact_results["codes"]:
        return compact_results
    return load_final_coding_results(run_dir)


def reflection_version(path):
    match = re.search(r"reflection_v(\d+)\.json$", path.name)
    return int(match.group(1)) if match else 0


def load_latest_agent_reflections(run_dir, initial_reflections=None):
    reflections = {}
    reflection_root = run_dir / "updated_reflections"
    initial_reflections = initial_reflections or EMPTY_AGENT_INITIAL_REFLECTIONS
    for agent in AGENTS:
        initial = initial_reflections.get(agent, {})
        agent_reflection = {
            "assumptions": initial.get("assumptions", ""),
            "further_consideration": "",
            "reflexive_history": "",
            "version": 0,
            "updated": False,
        }
        agent_dir = reflection_root / agent
        if agent_dir.exists():
            files = sorted(agent_dir.glob("reflection_v*.json"), key=reflection_version)
            if files:
                latest = files[-1]
                try:
                    data = json.loads(latest.read_text(encoding="utf-8"))
                    agent_reflection.update({
                        "assumptions": data.get("assumptions", agent_reflection["assumptions"]),
                        "further_consideration": data.get("further_consideration", ""),
                        "reflexive_history": data.get("reflexive_history", ""),
                        "version": reflection_version(latest),
                        "updated": True,
                    })
                except Exception:
                    pass
        reflections[agent] = agent_reflection
    return reflections


def infer_final_completed_round(run_dir, compact_files=None):
    candidates = []
    for item in compact_files or []:
        match = re.search(r"_round_(\d+)", str(item))
        if match:
            candidates.append(int(match.group(1)))
    for folder_name in ("clue_pool_compact", "clue_pool_filtered_4", "clue_pool_step1d"):
        folder = run_dir / folder_name
        if not folder.exists():
            continue
        for path in folder.glob("*.json"):
            match = re.search(r"_round_(\d+)", path.name)
            if match:
                candidates.append(int(match.group(1)))
    return max(candidates) if candidates else 1


def load_agent_reflections_used_for_round(run_dir, final_round, initial_reflections=None):
    reflections = {}
    reflection_root = run_dir / "updated_reflections"
    target_version = max(int(final_round or 1) - 1, 0)
    initial_reflections = initial_reflections or EMPTY_AGENT_INITIAL_REFLECTIONS
    for agent in AGENTS:
        initial = initial_reflections.get(agent, {})
        agent_reflection = {
            "assumptions": initial.get("assumptions", ""),
            "further_consideration": "",
            "reflexive_history": "",
            "version": 0,
            "updated": False,
            "used_for_round": int(final_round or 1),
        }
        agent_dir = reflection_root / agent
        if target_version > 0 and agent_dir.exists():
            files = [
                path for path in agent_dir.glob("reflection_v*.json")
                if reflection_version(path) <= target_version
            ]
            files = sorted(files, key=reflection_version)
            if files:
                selected = files[-1]
                try:
                    data = json.loads(selected.read_text(encoding="utf-8"))
                    agent_reflection.update({
                        "assumptions": data.get("assumptions", agent_reflection["assumptions"]),
                        "further_consideration": data.get("further_consideration", ""),
                        "reflexive_history": data.get("reflexive_history", ""),
                        "version": reflection_version(selected),
                        "updated": True,
                    })
                except Exception:
                    pass
        reflections[agent] = agent_reflection
    return reflections


def workflow_progress_message(job):
    current_message = job.get("message", "")
    if job.get("progress_updated_at") and current_message and not current_message.startswith("Running ReflexCoTI workflow on"):
        return current_message

    run_dir = Path(job.get("run_dir", ""))
    chunk_count = int(job.get("chunk_count") or 0)
    expected_round_outputs = max(1, chunk_count) * len(AGENTS)
    if not run_dir.exists():
        return job.get("message", "Running ReflexCoTI workflow...")

    def agent_label_from_path(path):
        return AGENT_LABELS.get(path.parent.name, path.parent.name.replace("_", " ").title())

    def chunk_label_from_path(path):
        match = re.match(r"^round_(\d+)_\d+_chunk_(\d+)", path.name)
        if not match:
            return None, None
        return match.group(1), match.group(2)

    def latest_path(paths):
        if not paths:
            return None
        return max(paths, key=lambda path: path.stat().st_mtime)

    compact_files = list((run_dir / "clue_pool_compact").glob("clue_pool_*_round_*_compact.json"))
    filtered_files = list((run_dir / "clue_pool_filtered_4").glob("clue_pool_*_round_*.json"))
    if compact_files:
        return "Finalizing coding results for display..."
    if filtered_files:
        return "Selecting final codes and excerpts..."

    for round_number in range(WORKFLOW_MAX_ROUNDS, 0, -1):
        raw_files = [
            path for path in (run_dir / "independent_coding").glob(f"*/round_{round_number}_*_chunk_*.json")
            if not path.name.endswith("_clean.json")
        ]
        clean_files = list((run_dir / "independent_coding").glob(f"*/round_{round_number}_*_chunk_*_clean.json"))
        final_files = list((run_dir / "final_coding").glob(f"*/*_round_{round_number}_final.json"))
        merged_files = list((run_dir / "clue_pool_step1a").glob(f"*_round_{round_number}_merged_items.json"))
        dedup_files = list((run_dir / "clue_pool_step1d").glob(f"clue_pool_*_round_{round_number}.json"))

        if dedup_files:
            if round_number < WORKFLOW_MAX_ROUNDS:
                return f"Round {round_number}: checking novelty and preparing the next round..."
            return f"Round {round_number}: selecting final codes and excerpts..."
        if merged_files:
            return f"Round {round_number}: removing duplicate excerpts..."
        if final_files:
            latest_final = latest_path(final_files)
            return f"Round {round_number}: merged chunk outputs for {agent_label_from_path(latest_final)}..."
        if len(clean_files) >= expected_round_outputs:
            return f"Round {round_number}: cleaning and merging coding outputs..."
        if clean_files:
            latest_clean = latest_path(clean_files)
            _, chunk_id = chunk_label_from_path(latest_clean)
            chunk_note = f", chunk {int(chunk_id)}/{max(1, chunk_count)}" if chunk_id else ""
            return f"Round {round_number}: cleaned output from {agent_label_from_path(latest_clean)}{chunk_note}..."
        if raw_files:
            latest_raw = latest_path(raw_files)
            _, chunk_id = chunk_label_from_path(latest_raw)
            chunk_note = f", chunk {int(chunk_id)}/{max(1, chunk_count)}" if chunk_id else ""
            return f"Round {round_number}: latest output from {agent_label_from_path(latest_raw)}{chunk_note}..."
    return job.get("message", "Running ReflexCoTI workflow...")


def run_job(job_id):
    job = JOBS[job_id]
    run_dir = Path(job["run_dir"])
    log_buffer = io.StringIO()

    def update_progress(message):
        job["message"] = message
        job["progress_updated_at"] = time.time()

    try:
        job["status"] = "running"
        update_progress("Initializing Azure OpenAI and ReflexCoTI workflow...")

        completion_fn = make_completion(
            job["azure_endpoint"], job["api_key"], job["api_version"], job["model"]
        )

        transcript_id = job["transcript_id"]

        chunk_paths = job.get("chunk_paths") or []
        update_progress(f"Running ReflexCoTI workflow on {len(chunk_paths)} transcript chunk(s)...")
        initial_reflections = job.get("initial_reflections") or EMPTY_AGENT_INITIAL_REFLECTIONS
        with contextlib.redirect_stdout(log_buffer), contextlib.redirect_stderr(log_buffer):
            RTA_workflow = import_workflow_modules()
            workflow_output = RTA_workflow.run_multi_transcript_dynamic_rounds(
                files_list=[chunk_paths],
                agents=AGENTS,
                max_rounds=WORKFLOW_MAX_ROUNDS,
                all_agent_initial_reflections=initial_reflections,
                coding_base_dir=str(run_dir / "independent_coding"),
                final_coding_base_dir=str(run_dir / "final_coding"),
                final_coding_without_score_base_dir=str(run_dir / "final_coding_without_score"),
                agent_personas=job.get("agent_personas") or AGENT_PERSONAS,
                novelty_threshold=0.05,
                k=2,
                clue_pool_dir_for_novelty=None,
                progress_callback=update_progress,
                research_question=job["research_question"],
                interviewee=job["interviewee"],
                completion_fn=completion_fn,
                reflection_output_base_dir=str(run_dir / "updated_reflections"),
            )

        compact_files = (workflow_output or {}).get("compact_coding_files", [])
        compact_results = load_compact_results_from_files(compact_files)
        workflow_results = compact_results if compact_results["codes"] else load_workflow_results(run_dir, transcript_id)
        calibration_seed = job.get("persistent_transcript_id") or f"{job.get('project_id')}:{transcript_id}"
        job["result"] = finalize_coding_results(
            workflow_results,
            job.get("research_question", ""),
            calibration_seed,
        )
        final_round = infer_final_completed_round(run_dir, compact_files)
        job["result"]["initial_agent_reflections"] = initial_reflections
        job["result"]["agent_reflections"] = load_agent_reflections_used_for_round(
            run_dir, final_round, initial_reflections
        )
        job["result"]["final_round"] = final_round
        job["status"] = "completed"
        update_progress("Codes and excerpts identified.")
    except Exception as exc:
        job["status"] = "failed"
        update_progress(str(exc))
        log_buffer.write("\n\n=== Python traceback ===\n")
        log_buffer.write(traceback.format_exc())
    finally:
        job["log"] = log_buffer.getvalue()[-12000:]
        (run_dir / "job.log").write_text(job["log"], encoding="utf-8")
        job["finished_at"] = time.time()


class ReflexCoTIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            send_json(self, 200, {"ok": True, "service": "ReflexCoTI"})
            return

        if parsed.path == "/api/auth/me":
            user = session_user(self)
            if not user:
                send_json(self, 401, {"authenticated": False})
            else:
                send_json(self, 200, {"authenticated": True, "user": {"id": user["user_id"], "username": user["username"], "role": user["role"]}})
            return

        if parsed.path == "/api/pi/student-connections":
            user = require_user(self)
            if not user:
                return
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can view junior researcher connections."})
                return
            with database() as connection:
                rows = connection.execute(
                    """SELECT c.id, c.student_id, c.status, c.created_at, c.responded_at,
                              s.username,
                              (SELECT COUNT(*) FROM projects p WHERE p.owner_id = c.student_id) AS project_count
                       FROM pi_student_connections c
                       JOIN users s ON s.id = c.student_id
                       WHERE c.pi_id = ? AND c.status IN ('pending', 'active')
                       ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.created_at DESC""",
                    (user["user_id"],),
                ).fetchall()
            payload = [{
                "id": int(row["id"]),
                "student_id": int(row["student_id"]),
                "username": row["username"],
                "status": row["status"],
                "project_count": int(row["project_count"] or 0) if row["status"] == "active" else 0,
                "created_at": row["created_at"],
                "responded_at": row["responded_at"],
            } for row in rows]
            send_json(self, 200, {
                "pending": [item for item in payload if item["status"] == "pending"],
                "connected": [item for item in payload if item["status"] == "active"],
            })
            return

        if parsed.path == "/api/student/pi-connections":
            user = require_user(self)
            if not user:
                return
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can view Senior researcher invitations."})
                return
            with database() as connection:
                rows = connection.execute(
                    """SELECT c.id, c.pi_id, c.status, c.created_at, c.responded_at, p.username
                       FROM pi_student_connections c
                       JOIN users p ON p.id = c.pi_id
                       WHERE c.student_id = ? AND c.status IN ('pending', 'active')
                       ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.created_at DESC""",
                    (user["user_id"],),
                ).fetchall()
            payload = [{
                "id": int(row["id"]),
                "pi_id": int(row["pi_id"]),
                "username": row["username"],
                "status": row["status"],
                "created_at": row["created_at"],
                "responded_at": row["responded_at"],
            } for row in rows]
            send_json(self, 200, {
                "pending": [item for item in payload if item["status"] == "pending"],
                "connected": [item for item in payload if item["status"] == "active"],
            })
            return

        if parsed.path == "/api/student/peer-review-connections":
            user = require_user(self)
            if not user:
                return
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can view peer-review requests."})
                return
            send_json(self, 200, peer_review_connections_for_user(user["user_id"]))
            return

        pi_student_projects_match = re.fullmatch(r"/api/pi/students/(\d+)/projects", parsed.path)
        if pi_student_projects_match:
            user = require_user(self)
            if not user:
                return
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can view connected junior researcher projects."})
                return
            try:
                payload = projects_for_connected_student(
                    user["user_id"], int(pi_student_projects_match.group(1))
                )
                send_json(self, 200, payload)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            return


        pi_project_review_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/review", parsed.path
        )
        if pi_project_review_match:
            user = require_user(self)
            if not user:
                return
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can review connected junior researcher projects."})
                return
            student_id, project_id = pi_project_review_match.groups()
            try:
                payload = connected_student_project_review(
                    user["user_id"], int(student_id), project_id
                )
                send_json(self, 200, payload)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            return

        pi_transcript_analysis_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/analysis",
            parsed.path,
        )
        if pi_transcript_analysis_match:
            user = require_user(self)
            if not user:
                return
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can review connected junior researcher analyses."})
                return
            student_id, project_id, transcript_id = pi_transcript_analysis_match.groups()
            try:
                payload = connected_student_analysis(
                    user["user_id"], int(student_id), project_id, transcript_id
                )
                send_json(self, 200, payload)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            return

        pi_transcript_content_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/content",
            parsed.path,
        )
        if pi_transcript_content_match:
            user = require_user(self)
            if not user:
                return
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can review connected junior researcher transcripts."})
                return
            student_id, project_id, transcript_id = pi_transcript_content_match.groups()
            try:
                payload = connected_student_transcript_content(
                    user["user_id"], int(student_id), project_id, transcript_id
                )
                send_json(self, 200, payload)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except ValueError as exc:
                send_json(self, 404, {"error": str(exc)})
            return

        pi_theme_analysis_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/theme-analysis", parsed.path
        )
        if pi_theme_analysis_match:
            user = require_user(self)
            if not user:
                return
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can review connected junior researcher analyses."})
                return
            student_id, project_id = pi_theme_analysis_match.groups()
            try:
                payload = connected_student_analysis(
                    user["user_id"], int(student_id), project_id
                )
                send_json(self, 200, payload)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            return

        if parsed.path == "/api/peer-review/projects":
            user = require_user(self)
            if not user:
                return
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can provide peer suggestions."})
                return
            username = (parse_qs(parsed.query).get("username") or [""])[0]
            try:
                projects = peer_review_projects(user["user_id"], username)
                owner_username = projects[0]["owner_username"] if projects else normalize_username(username)
                send_json(self, 200, {"projects": projects, "owner_username": owner_username})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        peer_coding_match = re.fullmatch(
            r"/api/peer-review/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)", parsed.path
        )
        peer_theme_match = re.fullmatch(
            r"/api/peer-review/projects/([A-Za-z0-9_-]+)/themes", parsed.path
        )
        if peer_coding_match or peer_theme_match:
            user = require_user(self)
            if not user:
                return
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can provide peer suggestions."})
                return
            owner_username = (parse_qs(parsed.query).get("username") or [""])[0]
            if not normalize_username(owner_username):
                send_json(self, 400, {"error": "Enter a junior researcher username."})
                return
            try:
                if peer_coding_match:
                    project_id, transcript_id = peer_coding_match.groups()
                    payload = peer_review_analysis(user["user_id"], project_id, "coding", transcript_id, owner_username)
                else:
                    project_id = peer_theme_match.group(1)
                    payload = peer_review_analysis(user["user_id"], project_id, "themes", owner_username=owner_username)
                send_json(self, 200, payload)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        if parsed.path == "/api/peer-suggestions":
            user = require_user(self)
            if not user:
                return
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts use peer suggestions."})
                return
            project_id = (parse_qs(parsed.query).get("project_id") or [None])[0]
            send_json(self, 200, peer_suggestions_for_user(user["user_id"], project_id))
            return

        if parsed.path == "/api/projects":
            user = require_user(self)
            if not user:
                return
            with database() as connection:
                rows = connection.execute(
                    """SELECT p.*, COUNT(t.id) AS transcript_count,
                              COALESCE(SUM(t.codes_count), 0) AS codes_count,
                              COALESCE(SUM(t.excerpts_count), 0) AS excerpts_count
                       FROM projects p LEFT JOIN transcripts t ON t.project_id = p.id
                       WHERE p.owner_id = ? GROUP BY p.id ORDER BY p.updated_at DESC""",
                    (user["user_id"],),
                ).fetchall()
            send_json(self, 200, {"projects": [{
                **public_project(row, row["transcript_count"], row["codes_count"], row["excerpts_count"]),
                **project_codebook_card_counts(row["id"]),
            } for row in rows]})
            return

        export_download_match = re.fullmatch(
            r"/api/projects/([A-Za-z0-9_-]+)/exports/([A-Za-z0-9_-]+)/([A-Za-z0-9_.-]+)",
            parsed.path,
        )
        if export_download_match:
            user = require_user(self)
            if not user:
                return
            project_id, batch_id, filename = export_download_match.groups()
            with database() as connection:
                row = connection.execute(
                    """SELECT eb.relative_path, ef.content_type FROM export_batches eb
                       JOIN projects p ON p.id = eb.project_id
                       JOIN export_files ef ON ef.batch_id = eb.id
                       WHERE eb.id = ? AND eb.project_id = ? AND p.owner_id = ? AND ef.filename = ?""",
                    (batch_id, project_id, user["user_id"], filename),
                ).fetchone()
            if not row:
                send_json(self, 404, {"error": "Export file not found."})
                return
            data_root = DATA_DIR.resolve()
            file_path = (DATA_DIR / row["relative_path"] / filename).resolve()
            if data_root not in file_path.parents or not file_path.is_file():
                send_json(self, 404, {"error": "Export file not found."})
                return
            body = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", row["content_type"])
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        export_list_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/exports", parsed.path)
        if export_list_match:
            user = require_user(self)
            if not user:
                return
            project_id = export_list_match.group(1)
            if not project_row_for_user(project_id, user["user_id"]):
                send_json(self, 404, {"error": "Project not found."})
                return
            with database() as connection:
                batches = connection.execute(
                    "SELECT * FROM export_batches WHERE project_id = ? ORDER BY created_at DESC",
                    (project_id,),
                ).fetchall()
                exports = []
                for batch in batches:
                    files = connection.execute(
                        "SELECT * FROM export_files WHERE batch_id = ? ORDER BY id",
                        (batch["id"],),
                    ).fetchall()
                    exports.append(public_export_batch(batch, files))
            send_json(self, 200, {"exports": exports})
            return

        project_codebook_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/codebook", parsed.path)
        if project_codebook_match:
            user = require_user(self)
            if not user:
                return
            project_id = project_codebook_match.group(1)
            if not project_row_for_user(project_id, user["user_id"]):
                send_json(self, 404, {"error": "Project not found."})
                return
            send_json(self, 200, public_project_codebook(project_id, include_codebook=True))
            return

        project_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)", parsed.path)
        if project_match:
            user = require_user(self)
            if not user:
                return
            project_id = project_match.group(1)
            project = project_row_for_user(project_id, user["user_id"])
            if not project:
                send_json(self, 404, {"error": "Project not found."})
                return
            with database() as connection:
                transcripts = connection.execute(
                    """SELECT t.*, ta.snapshot AS analysis_snapshot FROM transcripts t
                       LEFT JOIN transcript_analysis ta ON ta.transcript_id = t.id
                       WHERE t.project_id = ? ORDER BY t.created_at""",
                    (project_id,),
                ).fetchall()
            send_json(self, 200, {
                "project": public_project(
                    project,
                    len(transcripts),
                    sum(row["codes_count"] for row in transcripts),
                    sum(row["excerpts_count"] for row in transcripts),
                ),
                "transcripts": [public_transcript(row) for row in transcripts],
            })
            return

        content_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/content", parsed.path)
        if content_match:
            user = require_user(self)
            if not user:
                return
            project_id, transcript_id = content_match.groups()
            row = transcript_row_for_user(project_id, transcript_id, user["user_id"])
            if not row:
                send_json(self, 404, {"error": "Transcript not found."})
                return
            storage_dir = transcript_storage_dir(user["user_id"], project_id, transcript_id)
            text_path = storage_dir / "transcript.txt"
            chunks_dir = storage_dir / "chunks"
            try:
                if text_path.exists():
                    text = text_path.read_text(encoding="utf-8")
                    words = word_count(text)
                    chunk_paths = sorted(chunks_dir.glob("*.docx"))
                else:
                    source_path = storage_dir / row["stored_name"]
                    text, words, chunk_paths, _ = prepare_docx_chunks(source_path, chunks_dir, transcript_id)
                    text_path.write_text(text, encoding="utf-8")
                with database() as connection:
                    connection.execute(
                        "UPDATE transcripts SET word_count = ?, updated_at = ? WHERE id = ?",
                        (words, time.time(), transcript_id),
                    )
            except Exception as exc:
                send_json(self, 400, {"error": f"Could not read this transcript: {exc}"})
                return
            send_json(self, 200, {
                "text": text,
                "word_count": words,
                "chunk_count": max(1, len(chunk_paths)),
                "needs_chunking": len(chunk_paths) > 1,
            })
            return

        analysis_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/analysis", parsed.path)
        if analysis_match:
            user = require_user(self)
            if not user:
                return
            project_id, transcript_id = analysis_match.groups()
            if not transcript_row_for_user(project_id, transcript_id, user["user_id"]):
                send_json(self, 404, {"error": "Transcript not found."})
                return
            with database() as connection:
                row = connection.execute("SELECT snapshot, updated_at FROM transcript_analysis WHERE transcript_id = ?", (transcript_id,)).fetchone()
            send_json(self, 200, {"snapshot": json.loads(row["snapshot"]) if row else None, "updated_at": row["updated_at"] if row else None})
            return

        project_analysis_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/theme-analysis", parsed.path)
        if project_analysis_match:
            user = require_user(self)
            if not user:
                return
            project_id = project_analysis_match.group(1)
            if not project_row_for_user(project_id, user["user_id"]):
                send_json(self, 404, {"error": "Project not found."})
                return
            with database() as connection:
                row = connection.execute("SELECT snapshot, updated_at FROM project_analysis WHERE project_id = ?", (project_id,)).fetchone()
                snapshot = enrich_theme_agent_provenance(json.loads(row["snapshot"])) if row else None
                current_transcript_ids = {
                    str(item["id"])
                    for item in connection.execute("SELECT id FROM transcripts WHERE project_id = ?", (project_id,))
                }
                saved_transcript_ids = {
                    str(transcript_id)
                    for transcript_id in (snapshot.get("selectedTranscriptIds") or [])
                } if isinstance(snapshot, dict) else set()
                invalidated = bool(snapshot) and saved_transcript_ids != current_transcript_ids
                if invalidated:
                    connection.execute("DELETE FROM project_analysis WHERE project_id = ?", (project_id,))
                    snapshot = None
            send_json(self, 200, {
                "snapshot": snapshot,
                "updated_at": None if invalidated else (row["updated_at"] if row else None),
                "invalidated": invalidated,
            })
            return

        if parsed.path.startswith("/api/jobs/"):
            user = require_user(self)
            if not user:
                return
            job_id = parsed.path.rsplit("/", 1)[-1]
            job = JOBS.get(job_id)
            if not job or job.get("owner_id") != user["user_id"]:
                send_json(self, 404, {"error": "Job not found."})
                return
            send_json(self, 200, {
                "id": job_id,
                "status": job["status"],
                "message": workflow_progress_message(job) if job["status"] == "running" else job.get("message", ""),
                "result": job.get("result"),
                "log": job.get("log", ""),
            })
            return

        requested = parsed.path.lstrip("/") or "index.html"
        if requested not in PUBLIC_STATIC_FILES:
            self.send_error(404)
            return
        file_path = (ROOT / requested).resolve()
        if not str(file_path).startswith(str(ROOT)) or not file_path.exists() or file_path.is_dir():
            self.send_error(404)
            return

        content_type = "text/html"
        if file_path.suffix == ".css":
            content_type = "text/css"
        elif file_path.suffix == ".js":
            content_type = "application/javascript"

        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_DELETE(self):
        path = urlparse(self.path).path
        transcript_analysis_match = re.fullmatch(
            r"/api/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/analysis",
            path,
        )
        transcript_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)", path)
        project_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)", path)
        if not transcript_analysis_match and not transcript_match and not project_match:
            send_json(self, 404, {"error": "Not found."})
            return

        user = require_user(self)
        if not user:
            return
        if transcript_analysis_match:
            project_id, transcript_id = transcript_analysis_match.groups()
            if not transcript_row_for_user(project_id, transcript_id, user["user_id"]):
                send_json(self, 404, {"error": "Transcript not found."})
                return
            now = time.time()
            with database() as connection:
                analysis_result = connection.execute(
                    "DELETE FROM transcript_analysis WHERE transcript_id = ?", (transcript_id,)
                )
                theme_result = connection.execute(
                    "DELETE FROM project_analysis WHERE project_id = ?", (project_id,)
                )
                connection.execute(
                    "UPDATE transcripts SET codes_count = 0, excerpts_count = 0, updated_at = ? WHERE id = ? AND project_id = ?",
                    (now, transcript_id, project_id),
                )
                connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
            invalidate_identify_jobs(user["user_id"], project_id, transcript_id)
            send_json(self, 200, {
                "cleared": True,
                "transcript_id": transcript_id,
                "analysis_cleared": analysis_result.rowcount > 0,
                "themes_cleared": theme_result.rowcount > 0,
            })
            return

        if transcript_match:
            project_id, transcript_id = transcript_match.groups()
            transcript_row = transcript_row_for_user(project_id, transcript_id, user["user_id"])
            if not transcript_row:
                send_json(self, 404, {"error": "Transcript not found."})
                return
            project = project_row_for_user(project_id, user["user_id"])
            with database() as connection:
                connection.execute(
                    "DELETE FROM transcripts WHERE id = ? AND project_id = ?",
                    (transcript_id, project_id),
                )
                theme_result = connection.execute(
                    "DELETE FROM project_analysis WHERE project_id = ?", (project_id,)
                )
                connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (time.time(), project_id))
            invalidate_identify_jobs(user["user_id"], project_id, transcript_id)
            storage_dir = transcript_storage_dir(user["user_id"], project_id, transcript_id)
            try:
                shutil.rmtree(storage_dir, ignore_errors=False)
            except FileNotFoundError:
                pass
            except OSError:
                send_json(self, 200, {"deleted": True, "transcript_id": transcript_id, "warning": "The transcript was deleted, but some stored files could not be removed."})
                return
            for export_dir in (
                export_project_dir(user, project_id, project["name"]),
                legacy_export_project_dir(user, project_id),
            ):
                shutil.rmtree(export_dir / "transcripts" / transcript_id, ignore_errors=True)
            send_json(self, 200, {
                "deleted": True,
                "transcript_id": transcript_id,
                "themes_cleared": theme_result.rowcount > 0,
            })
            return

        project_id = project_match.group(1)
        project = project_row_for_user(project_id, user["user_id"])
        if not project:
            send_json(self, 404, {"error": "Project not found."})
            return

        with database() as connection:
            connection.execute(
                "DELETE FROM projects WHERE id = ? AND owner_id = ?",
                (project_id, user["user_id"]),
            )
        project_dir = PROJECTS_DIR / str(user["user_id"]) / project_id
        export_dirs = (
            export_project_dir(user, project_id, project["name"]),
            legacy_export_project_dir(user, project_id),
        )
        try:
            shutil.rmtree(project_dir, ignore_errors=False)
        except FileNotFoundError:
            pass
        except OSError:
            send_json(self, 200, {"deleted": True, "project_id": project_id, "warning": "The project was deleted, but some stored files could not be removed."})
            return
        for export_dir in export_dirs:
            shutil.rmtree(export_dir, ignore_errors=True)
        send_json(self, 200, {"deleted": True, "project_id": project_id})

    def do_POST(self):
        path = urlparse(self.path).path
        print(f"POST {path} received; length={self.headers.get('Content-Length', 'unknown')}", flush=True)

        if path in ("/api/auth/register", "/api/auth/login"):
            try:
                payload = json_body(self, 1024 * 1024)
                username = normalize_username(payload.get("username"))
                password = str(payload.get("password") or "")
                validate_password(password)
                with database() as connection:
                    user_row = connection.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
                    if path.endswith("/register"):
                        role = normalize_user_role(payload.get("role"))
                        if user_row:
                            send_json(self, 409, {"error": "That username already exists. Sign in instead."})
                            return
                        salt = secrets.token_bytes(16)
                        digest = password_digest(password, salt)
                        cursor = connection.execute(
                            "INSERT INTO users(username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                            (username, salt, digest, role, time.time()),
                        )
                        user_row = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
                    else:
                        if not user_row or not hmac.compare_digest(password_digest(password, user_row["password_salt"]), user_row["password_hash"]):
                            send_json(self, 401, {"error": "Incorrect username or password."})
                            return
                token = create_session(user_row)
                send_json(
                    self,
                    200,
                    {"user": {"id": int(user_row["id"]), "username": user_row["username"], "role": user_row["role"]}},
                    {"Set-Cookie": session_cookie(token)},
                )
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            except Exception:
                send_json(self, 400, {"error": "Could not complete authentication."})
            return

        if path == "/api/auth/logout":
            user = session_user(self)
            if user:
                with SESSIONS_LOCK:
                    SESSIONS.pop(user["token"], None)
            send_json(self, 200, {"ok": True}, {"Set-Cookie": session_cookie("", 0)})
            return

        user = require_user(self)
        if not user:
            return

        if path == "/api/pi/student-invitations":
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can invite junior researchers."})
                return
            try:
                payload = json_body(self, 1024 * 1024)
                invitation = create_pi_student_invitation(user["user_id"], payload.get("username"))
                send_json(self, 201, {"invitation": invitation})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        if path == "/api/peer-review/invitations":
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can request peer review."})
                return
            try:
                payload = json_body(self, 1024 * 1024)
                invitation = create_peer_review_invitation(user["user_id"], payload.get("username"))
                send_json(self, 201, {"invitation": invitation})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        invitation_response_match = re.fullmatch(r"/api/student/pi-invitations/(\d+)/respond", path)
        if invitation_response_match:
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can answer Senior researcher invitations."})
                return
            try:
                payload = json_body(self, 1024 * 1024)
                connection = respond_to_pi_invitation(
                    int(invitation_response_match.group(1)),
                    user["user_id"],
                    str(payload.get("action") or "").strip().lower(),
                )
                send_json(self, 200, {"connection": connection})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        peer_invitation_response_match = re.fullmatch(r"/api/student/peer-review-invitations/(\d+)/respond", path)
        if peer_invitation_response_match:
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can answer peer-review requests."})
                return
            try:
                payload = json_body(self, 1024 * 1024)
                connection = respond_to_peer_review_invitation(
                    int(peer_invitation_response_match.group(1)),
                    user["user_id"],
                    str(payload.get("action") or "").strip().lower(),
                )
                send_json(self, 200, {"connection": connection})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        if path == "/api/peer-suggestions":
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only Junior researcher accounts can provide peer suggestions."})
                return
            try:
                suggestion = create_peer_suggestion(
                    user["user_id"], user["username"], json_body(self, 2 * 1024 * 1024)
                )
                send_json(self, 201, {"suggestion": suggestion})
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        peer_resolution_match = re.fullmatch(r"/api/peer-suggestions/(\d+)/resolve", path)
        if peer_resolution_match:
            if user["role"] != "student":
                send_json(self, 403, {"error": "Only the Junior researcher owner can resolve peer suggestions."})
                return
            try:
                payload = json_body(self, 1024 * 1024)
                result = resolve_peer_suggestion(
                    user["user_id"], int(peer_resolution_match.group(1)),
                    str(payload.get("decision") or "").strip().lower(),
                )
                send_json(self, 200, result)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        pi_code_export_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/code-revision/export",
            path,
        )
        if pi_code_export_match:
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can export Senior code revisions."})
                return
            student_id, project_id, transcript_id = pi_code_export_match.groups()
            try:
                payload = json_body(self, 12 * 1024 * 1024)
                file_payload = payload.get("file") or {}
                result = export_connected_student_code_revision(
                    user["user_id"], int(student_id), project_id, transcript_id,
                    payload.get("snapshot"), str(file_payload.get("filename") or ""),
                    file_payload.get("content"),
                )
                send_json(self, 200, result)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        pi_theme_export_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/theme-revision/export", path
        )
        if pi_theme_export_match:
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can export Senior theme revisions."})
                return
            student_id, project_id = pi_theme_export_match.groups()
            try:
                payload = json_body(self, 12 * 1024 * 1024)
                file_payload = payload.get("file") or {}
                result = export_connected_student_theme_revision(
                    user["user_id"], int(student_id), project_id, payload.get("snapshot"),
                    str(file_payload.get("filename") or ""), file_payload.get("content"),
                )
                send_json(self, 200, result)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        pi_theme_revision_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/theme-revision", path
        )
        if pi_theme_revision_match:
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can modify completed junior themes."})
                return
            student_id, project_id = pi_theme_revision_match.groups()
            try:
                result = save_connected_student_theme_revision(
                    user["user_id"], int(student_id), project_id, json_body(self)
                )
                send_json(self, 200, result)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        pi_code_revision_match = re.fullmatch(
            r"/api/pi/students/(\d+)/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/code-revision",
            path,
        )
        if pi_code_revision_match:
            if user["role"] != "pi":
                send_json(self, 403, {"error": "Only Senior researcher accounts can modify completed junior coding."})
                return
            student_id, project_id, transcript_id = pi_code_revision_match.groups()
            try:
                result = save_connected_student_code_revision(
                    user["user_id"], int(student_id), project_id, transcript_id, json_body(self)
                )
                send_json(self, 200, result)
            except PermissionError as exc:
                send_json(self, 403, {"error": str(exc)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        if path == "/api/semantic-layout":
            try:
                payload = json_body(self, 4 * 1024 * 1024)
                items = payload.get("items")
                if not isinstance(items, list) or not items:
                    raise ValueError("At least one code is required for semantic layout.")
                if len(items) > 250 or not all(isinstance(item, dict) for item in items):
                    raise ValueError("Semantic layout supports up to 250 valid codes.")
                positions, method = semantic_code_layout(items)
                send_json(self, 200, {"positions": positions, "method": method})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            except Exception as exc:
                send_json(self, 400, {"error": f"Could not build semantic layout: {exc}"})
            return

        if path == "/api/code-merge-suggestions":
            try:
                payload = json_body(self, 4 * 1024 * 1024)
                items = payload.get("items")
                if not isinstance(items, list) or len(items) < 2:
                    raise ValueError("At least two reviewed codes are required for merge suggestions.")
                if len(items) > 250 or not all(isinstance(item, dict) for item in items):
                    raise ValueError("Merge suggestions support up to 250 valid codes.")
                suggestions, method = semantic_code_merge_suggestions(items, threshold=0.8)
                send_json(self, 200, {
                    "suggestions": suggestions,
                    "method": method,
                    "threshold": 0.8,
                })
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            except Exception as exc:
                send_json(self, 400, {"error": f"Could not suggest code merges: {exc}"})
            return

        if path == "/api/ai-assist-edit":
            try:
                payload = json_body(self, 2 * 1024 * 1024)
                missing = [label for label in ("azure_endpoint", "api_key", "api_version", "model")
                           if not str(payload.get(label) or "").strip()]
                if missing:
                    raise ValueError(f"Missing Azure OpenAI setting: {', '.join(missing)}")
                proposal = ai_edit_proposal(payload)
                send_json(self, 200, {"proposal": proposal})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            except Exception as exc:
                send_json(self, 400, {"error": f"Could not generate an AI proposal: {exc}"})
            return

        if path == "/api/projects":
            try:
                payload = json_body(self, 1024 * 1024)
                name = str(payload.get("name") or "").strip()
                research_question = str(payload.get("research_question") or "").strip()
                interviewee = str(payload.get("interviewee") or "").strip()
                if not all((name, research_question, interviewee)):
                    raise ValueError("Project name, research question, and interviewee are required.")
                initial_reflections = generate_project_initial_reflections(
                    payload, research_question
                )
                project_id = uuid.uuid4().hex[:16]
                now = time.time()
                with database() as connection:
                    duplicate = connection.execute(
                        "SELECT 1 FROM projects WHERE owner_id = ? AND name = ? COLLATE NOCASE LIMIT 1",
                        (user["user_id"], name[:200]),
                    ).fetchone()
                    if duplicate:
                        raise ValueError("A project with this name already exists in your account.")
                    connection.execute(
                        """INSERT INTO projects(
                               id, owner_id, name, research_question, interviewee,
                               initial_reflections, created_at, updated_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            project_id, user["user_id"], name[:200], research_question,
                            interviewee, json.dumps(initial_reflections, ensure_ascii=False), now, now,
                        ),
                    )
                    row = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                (PROJECTS_DIR / str(user["user_id"]) / project_id).mkdir(parents=True, exist_ok=True)
                send_json(self, 201, {"project": public_project(row)})
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        save_exports_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/exports", path)
        save_project_finished_results_match = re.fullmatch(
            r"/api/projects/([A-Za-z0-9_-]+)/finished-results", path
        )
        save_finished_results_match = re.fullmatch(
            r"/api/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/finished-results",
            path,
        )
        if save_project_finished_results_match:
            project_id = save_project_finished_results_match.group(1)
            project = project_row_for_user(project_id, user["user_id"])
            if not project:
                send_json(self, 404, {"error": "Project not found."})
                return
            try:
                result = save_project_finished_results(
                    user, project, json_body(self, 25 * 1024 * 1024)
                )
                send_json(self, 200, result)
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            except Exception:
                send_json(self, 500, {"error": "Could not save the finished project results."})
            return
        if save_finished_results_match:
            project_id, transcript_id = save_finished_results_match.groups()
            project = project_row_for_user(project_id, user["user_id"])
            transcript_row = transcript_row_for_user(project_id, transcript_id, user["user_id"])
            if not project or not transcript_row:
                send_json(self, 404, {"error": "Project transcript not found."})
                return
            temp_paths = []
            try:
                payload = json_body(self, 25 * 1024 * 1024)
                phase = str(payload.get("phase") or "").strip()
                revision = max(1, int(payload.get("revision") or 1))
                raw_files = payload.get("files")
                expected_count = {"human_coding": 1, "coding": 4}.get(phase)
                if expected_count is None or not isinstance(raw_files, list) or len(raw_files) != expected_count:
                    raise ValueError("The finished-result file set does not match the coding phase.")

                files = []
                names = set()
                total_bytes = 0
                for item in raw_files:
                    if not isinstance(item, dict):
                        raise ValueError("Invalid finished-result file.")
                    filename = str(item.get("filename") or "")
                    content = item.get("content")
                    allowed_extension = r"\.json" if phase == "human_coding" else r"\.(?:json|csv)"
                    if not re.fullmatch(rf"[A-Za-z0-9_.-]{{1,200}}{allowed_extension}", filename, re.IGNORECASE):
                        raise ValueError("Finished-result filenames must use the expected JSON or CSV format.")
                    if filename.casefold() in names or not isinstance(content, str):
                        raise ValueError("Finished-result files must have unique names and text content.")
                    if filename.lower().endswith(".json"):
                        document = json.loads(content)
                        if not isinstance(document, dict):
                            raise ValueError("Each finished-result JSON file must contain an object.")
                        # Trust the authenticated session, not browser-supplied identity metadata.
                        document["account"] = {"username": user["username"]}
                        document["project"] = {"id": project_id, "name": project["name"]}
                        document["transcript"] = {"file_name": transcript_row["name"]}
                        encoded = json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8")
                    else:
                        encoded = content.encode("utf-8")
                    if len(encoded) > 10 * 1024 * 1024:
                        raise ValueError(f'Finished-result file "{filename}" is too large.')
                    names.add(filename.casefold())
                    total_bytes += len(encoded)
                    files.append((filename, encoded))
                json_count = sum(filename.lower().endswith(".json") for filename, _ in files)
                csv_count = sum(filename.lower().endswith(".csv") for filename, _ in files)
                if phase == "human_coding" and (json_count, csv_count) != (1, 0):
                    raise ValueError("Human Coding Finish requires one JSON file.")
                if phase == "coding" and (json_count, csv_count) != (3, 1):
                    raise ValueError("AI Coding Finish requires three JSON files and one questionnaire CSV.")
                if total_bytes > 20 * 1024 * 1024:
                    raise ValueError("The finished-result file set is too large.")

                result_dir = finished_project_dir(user, project["name"])
                migrate_legacy_finished_results(
                    user, project_id, project["name"], result_dir
                )
                result_dir.mkdir(parents=True, exist_ok=True)
                for filename, encoded in files:
                    target_path = result_dir / filename
                    temp_path = result_dir / f".{filename}.{uuid.uuid4().hex}.tmp"
                    temp_path.write_bytes(encoded)
                    temp_paths.append(temp_path)
                    os.replace(temp_path, target_path)
                relative_path = str(result_dir.relative_to(DATA_DIR))
                codebook_result = None
                codebook_error = ""
                if phase == "coding":
                    begin_project_codebook_update(project_id, transcript_id)
                    try:
                        codebook_result = update_project_codebook(
                            user, project, transcript_id, payload.get("codebook_settings") or {}
                        )
                    except Exception as exc:
                        codebook_error = str(exc) or "Could not update the project codebook."
                        print(f"Could not update project codebook {project_id}: {exc}", flush=True)
                    finally:
                        end_project_codebook_update(project_id, transcript_id)
                if codebook_result:
                    codebook_result.update(project_codebook_update_status(project_id))
                send_json(self, 200, {
                    "saved": True,
                    "phase": phase,
                    "revision": revision,
                    "relative_path": relative_path,
                    "files": [filename for filename, _ in files],
                    "codebook": codebook_result,
                    "codebook_error": codebook_error,
                })
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            except Exception:
                send_json(self, 500, {"error": "Could not save the finished coding results."})
            finally:
                for temp_path in temp_paths:
                    try:
                        temp_path.unlink()
                    except FileNotFoundError:
                        pass
            return

        if save_exports_match:
            project_id = save_exports_match.group(1)
            project = project_row_for_user(project_id, user["user_id"])
            if not project:
                send_json(self, 404, {"error": "Project not found."})
                return
            batch_dir = None
            archive_committed = False
            try:
                payload = json_body(self, 25 * 1024 * 1024)
                scope = str(payload.get("scope") or "").strip()
                transcript_id = str(payload.get("transcript_id") or "").strip() or None
                raw_files = payload.get("files")
                if scope in {"coding", "themes"} and pending_peer_suggestion_count(
                    user["user_id"], project_id, scope,
                    transcript_id if scope == "coding" else None,
                ):
                    raise ValueError("Resolve every pending peer suggestion before exporting or downloading a new version.")
                if scope not in {"coding", "human_coding", "themes"}:
                    raise ValueError("Export scope must be coding, human_coding, or themes.")
                if scope in {"coding", "human_coding"}:
                    if not transcript_id or not transcript_row_for_user(project_id, transcript_id, user["user_id"]):
                        raise ValueError("A valid project transcript is required for coding exports.")
                elif transcript_id:
                    raise ValueError("Theme exports cannot be assigned to one transcript.")
                if scope == "human_coding":
                    valid_file_count = isinstance(raw_files, list) and len(raw_files) == 1
                elif scope == "coding":
                    valid_file_count = isinstance(raw_files, list) and len(raw_files) in {1, 3, 4}
                else:
                    valid_file_count = isinstance(raw_files, list) and len(raw_files) in {1, 4}
                if not valid_file_count:
                    raise ValueError("The export file set does not match the selected workflow.")

                files = []
                names = set()
                total_bytes = 0
                for item in raw_files:
                    if not isinstance(item, dict):
                        raise ValueError("Invalid export file.")
                    filename = str(item.get("filename") or "")
                    content = item.get("content")
                    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}\.(?:json|csv)", filename, re.IGNORECASE):
                        raise ValueError("Export filenames may contain only letters, numbers, dots, dashes, and underscores.")
                    if filename.casefold() in names:
                        raise ValueError("Export filenames must be unique.")
                    if not isinstance(content, str):
                        raise ValueError(f'Export file "{filename}" must contain text.')
                    encoded = content.encode("utf-8")
                    if len(encoded) > 10 * 1024 * 1024:
                        raise ValueError(f'Export file "{filename}" is too large.')
                    names.add(filename.casefold())
                    total_bytes += len(encoded)
                    content_type = "application/json; charset=utf-8" if filename.lower().endswith(".json") else "text/csv; charset=utf-8"
                    files.append((filename, content_type, encoded))
                if total_bytes > 20 * 1024 * 1024:
                    raise ValueError("The export batch is too large.")
                extensions = [Path(filename).suffix.lower() for filename, _, _ in files]
                is_revision = scope in {"coding", "themes"} and len(files) == 1
                if scope == "human_coding" or is_revision:
                    expected_json_count, expected_csv_count = 1, 0
                elif scope == "coding" and len(files) == 3:
                    expected_json_count, expected_csv_count = 2, 1
                else:
                    expected_json_count, expected_csv_count = 3, 1
                if extensions.count(".json") != expected_json_count or extensions.count(".csv") != expected_csv_count:
                    raise ValueError("The export file types do not match the selected workflow.")

                now = time.time()
                if is_revision:
                    batch, stored_files = replace_reviewed_export_json_file(
                        project_id, transcript_id, scope, files, now
                    )
                    archive_committed = True
                    send_json(self, 200, {"saved": True, "replaced": True, "export": public_export_batch(batch, stored_files)})
                    return
                batch_id = uuid.uuid4().hex
                version_name = f"{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime(now))}_{batch_id[:8]}"
                if scope == "themes":
                    scope_dir = "themes"
                elif scope == "human_coding":
                    scope_dir = f"transcripts/{transcript_id}/human_codes"
                else:
                    scope_dir = f"transcripts/{transcript_id}"
                batch_dir = export_project_dir(user, project_id, project["name"]) / scope_dir / version_name
                batch_dir.mkdir(parents=True, exist_ok=False)
                for filename, _, encoded in files:
                    (batch_dir / filename).write_bytes(encoded)
                relative_path = str(batch_dir.relative_to(DATA_DIR))
                with database() as connection:
                    connection.execute(
                        """INSERT INTO export_batches(
                               id, project_id, transcript_id, scope, created_by,
                               username_snapshot, project_name_snapshot, relative_path, created_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (batch_id, project_id, transcript_id, scope, user["user_id"],
                         user["username"], project["name"], relative_path, now),
                    )
                    connection.executemany(
                        """INSERT INTO export_files(batch_id, filename, content_type, size_bytes, created_at)
                           VALUES (?, ?, ?, ?, ?)""",
                        [(batch_id, filename, content_type, len(encoded), now)
                         for filename, content_type, encoded in files],
                    )
                    connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
                    batch = connection.execute("SELECT * FROM export_batches WHERE id = ?", (batch_id,)).fetchone()
                    stored_files = connection.execute(
                        "SELECT * FROM export_files WHERE batch_id = ? ORDER BY id", (batch_id,)
                    ).fetchall()
                archive_committed = True
                send_json(self, 201, {"saved": True, "export": public_export_batch(batch, stored_files)})
            except (ValueError, json.JSONDecodeError) as exc:
                if batch_dir is not None and not archive_committed:
                    shutil.rmtree(batch_dir, ignore_errors=True)
                send_json(self, 400, {"error": str(exc)})
            except Exception:
                if batch_dir is not None and not archive_committed:
                    shutil.rmtree(batch_dir, ignore_errors=True)
                send_json(self, 500, {"error": "Could not save this export batch."})
            return

        transcript_upload_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/transcripts", path)
        if transcript_upload_match:
            project_id = transcript_upload_match.group(1)
            if not project_row_for_user(project_id, user["user_id"]):
                send_json(self, 404, {"error": "Project not found."})
                return
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", "")},
            )
            raw_items = form["transcripts"] if "transcripts" in form else []
            items = raw_items if isinstance(raw_items, list) else [raw_items]
            items = [item for item in items if getattr(item, "filename", "")]
            if not items:
                send_json(self, 400, {"error": "Choose at least one .docx transcript."})
                return
            added = []
            themes_cleared = False
            now = time.time()
            try:
                with database() as connection:
                    connection.execute("BEGIN IMMEDIATE")
                    existing_names = {
                        row["name"].casefold()
                        for row in connection.execute("SELECT name FROM transcripts WHERE project_id = ?", (project_id,))
                    }
                    batch_names = set()
                    validated_items = []
                    for item in items:
                        original_name = safe_filename(item.filename)
                        if not original_name.lower().endswith(".docx"):
                            raise ValueError(f'"{item.filename}" is not supported. Upload only .docx transcript files.')
                        normalized_name = original_name.casefold()
                        if normalized_name in existing_names:
                            raise ValueError(f'A transcript named "{original_name}" already exists in this project. Rename the file before uploading it.')
                        if normalized_name in batch_names:
                            raise ValueError(f'The upload contains more than one transcript named "{original_name}". Each transcript filename must be unique.')
                        batch_names.add(normalized_name)
                        validated_items.append((item, original_name))
                    for item, original_name in validated_items:
                        transcript_id = uuid.uuid4().hex[:16]
                        storage_dir = transcript_storage_dir(user["user_id"], project_id, transcript_id)
                        storage_dir.mkdir(parents=True, exist_ok=True)
                        stored_name = "source.docx"
                        destination = storage_dir / stored_name
                        with destination.open("wb") as out:
                            shutil.copyfileobj(item.file, out)
                        size = destination.stat().st_size
                        connection.execute(
                            """INSERT INTO transcripts(id, project_id, name, stored_name, size, created_at, updated_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (transcript_id, project_id, original_name, stored_name, size, now, now),
                        )
                        row = connection.execute("SELECT * FROM transcripts WHERE id = ?", (transcript_id,)).fetchone()
                        added.append(public_transcript(row))
                    theme_result = connection.execute(
                        "DELETE FROM project_analysis WHERE project_id = ?", (project_id,)
                    )
                    themes_cleared = theme_result.rowcount > 0
                    connection.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now, project_id))
            except ValueError as exc:
                send_json(self, 400, {"error": str(exc)})
                return
            send_json(self, 201, {"transcripts": added, "themes_cleared": themes_cleared})
            return

        save_analysis_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/transcripts/([A-Za-z0-9_-]+)/analysis", path)
        if save_analysis_match:
            project_id, transcript_id = save_analysis_match.groups()
            if not transcript_row_for_user(project_id, transcript_id, user["user_id"]):
                send_json(self, 404, {"error": "Transcript not found."})
                return
            try:
                snapshot = json_body(self)
                if not isinstance(snapshot, dict):
                    raise ValueError("Invalid analysis snapshot.")
                codes_count, excerpts_count = reflexcoti_snapshot_counts(snapshot)
                now = time.time()
                serialized = json.dumps(snapshot, ensure_ascii=False)
                with database() as connection:
                    connection.execute(
                        """INSERT INTO transcript_analysis(transcript_id, snapshot, updated_at) VALUES (?, ?, ?)
                           ON CONFLICT(transcript_id) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at""",
                        (transcript_id, serialized, now),
                    )
                    connection.execute(
                        "UPDATE transcripts SET codes_count=?, excerpts_count=?, updated_at=? WHERE id=?",
                        (codes_count, excerpts_count, now, transcript_id),
                    )
                    connection.execute("UPDATE projects SET updated_at=? WHERE id=?", (now, project_id))
                send_json(self, 200, {"saved": True, "updated_at": now, "codes_count": codes_count, "excerpts_count": excerpts_count, "analysis_status": transcript_analysis_status(snapshot)})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        save_project_analysis_match = re.fullmatch(r"/api/projects/([A-Za-z0-9_-]+)/theme-analysis", path)
        if save_project_analysis_match:
            project_id = save_project_analysis_match.group(1)
            if not project_row_for_user(project_id, user["user_id"]):
                send_json(self, 404, {"error": "Project not found."})
                return
            try:
                snapshot = json_body(self)
                now = time.time()
                with database() as connection:
                    connection.execute(
                        """INSERT INTO project_analysis(project_id, snapshot, updated_at) VALUES (?, ?, ?)
                           ON CONFLICT(project_id) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at""",
                        (project_id, json.dumps(snapshot, ensure_ascii=False), now),
                    )
                    connection.execute("UPDATE projects SET updated_at=? WHERE id=?", (now, project_id))
                send_json(self, 200, {"saved": True, "updated_at": now})
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        if path == "/api/read-docx":
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                },
            )
            file_item = form["transcript"] if "transcript" in form else None
            if file_item is None or not getattr(file_item, "filename", ""):
                send_json(self, 400, {"error": "Upload a .docx transcript first."})
                return
            if not safe_filename(file_item.filename).lower().endswith(".docx"):
                send_json(self, 400, {"error": "Only .docx transcripts are supported."})
                return
            try:
                print(f"Reading and preparing uploaded .docx {file_item.filename}...", flush=True)
                preview_id = uuid.uuid4().hex[:12]
                preview_dir = UPLOAD_DIR / preview_id
                preview_upload_dir = preview_dir / "uploads"
                preview_chunk_dir = preview_dir / "transcript_chunks"
                preview_upload_dir.mkdir(parents=True, exist_ok=True)
                original_name = safe_filename(file_item.filename)
                normalized_name = normalize_uploaded_name(original_name)
                transcript_id = parse_transcript_id(normalized_name)
                preview_path = preview_upload_dir / normalized_name
                with preview_path.open("wb") as out:
                    shutil.copyfileobj(file_item.file, out)
                text, words, chunk_paths, chunk_lengths = prepare_docx_chunks(
                    preview_path,
                    preview_chunk_dir,
                    transcript_id,
                )
                print(f"Finished preparing uploaded .docx {file_item.filename}.", flush=True)
            except Exception as exc:
                print(f"Could not read uploaded .docx {file_item.filename}: {exc}", flush=True)
                send_json(self, 400, {"error": f"Could not read this .docx transcript: {exc}"})
                return
            if not text:
                send_json(self, 400, {"error": "No readable text found in this .docx file."})
                return
            send_json(self, 200, {
                "text": text,
                "word_count": words,
                "chunk_count": len(chunk_paths),
                "chunk_lengths": chunk_lengths,
                "needs_chunking": len(chunk_paths) > 1,
            })
            return

        if path == "/api/create-codebook":
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                },
            )
            raw_items = form["coding_jsons"] if "coding_jsons" in form else []
            file_items = raw_items if isinstance(raw_items, list) else [raw_items]
            file_items = [item for item in file_items if getattr(item, "filename", "")]
            if not file_items:
                send_json(self, 400, {"error": "Upload ReflexCoTI JSON files first."})
                return

            azure_endpoint = form.getfirst("azure_endpoint", "")
            api_key = form.getfirst("api_key", "")
            api_version = form.getfirst("api_version", "")
            model = form.getfirst("model", "")
            research_question = form.getfirst("research_question", "")
            include_ai_deletion_suggestions = str(
                form.getfirst("include_ai_deletion_suggestions", "false")
            ).strip().lower() == "true"
            missing = [
                label for label, value in (
                    ("azure_endpoint", azure_endpoint),
                    ("api_key", api_key),
                    ("api_version", api_version),
                    ("model", model),
                    ("research_question", research_question),
                )
                if not value
            ]
            if missing:
                send_json(self, 400, {"error": f"Missing Azure OpenAI setting: {', '.join(missing)}"})
                return

            codebook_id = uuid.uuid4().hex[:12]
            run_dir = THEME_CODEBOOK_DIR / codebook_id
            input_dir = run_dir / "coding_exports"
            review_dir = run_dir / "codebook_review_logs"
            input_dir.mkdir(parents=True, exist_ok=True)
            (run_dir / "owner.json").write_text(json.dumps({"owner_id": user["user_id"]}), encoding="utf-8")
            coding_result_files = []
            try:
                for index, item in enumerate(file_items, start=1):
                    filename = safe_filename(item.filename)
                    if not filename.lower().endswith(".json"):
                        raise ValueError(f"{item.filename} is not a JSON file.")
                    path_out = input_dir / f"{index:03d}_{filename}"
                    with path_out.open("wb") as out:
                        shutil.copyfileobj(item.file, out)
                    coding_result_files.append(str(path_out))

                completion_fn = make_completion(azure_endpoint, api_key, api_version, model)

                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    import_workflow_modules()
                    codebook_creation_module = importlib.import_module("codebook_creation")
                    codebook = codebook_creation_module.codebook_creation(
                        coding_result_files=coding_result_files,
                        codebook_path=str(run_dir / "codebook.json"),
                        review_output_dir=str(review_dir),
                        top_k=3,
                        reuse_threshold=0.80,
                        compact_threshold=0.80,
                        sleep_seconds=0,
                        completion_fn=completion_fn,
                    )
            except Exception as exc:
                send_json(self, 400, {"error": f"Could not create codebook: {exc}"})
                return

            public = public_codebook(codebook_source_refs(coding_result_files, codebook))
            relevance_reviews = []
            if include_ai_deletion_suggestions:
                try:
                    relevance_reviews = review_codebook_relevance(public["entries"], research_question, completion_fn)
                except Exception as exc:
                    print(f"Could not review codebook relevance: {exc}", flush=True)
            for review in relevance_reviews:
                entry_index = int(review.get("entry_index", -1))
                if 0 <= entry_index < len(public["entries"]) and isinstance(review.get("related"), bool):
                    public["entries"][entry_index]["ai_relevance_related"] = bool(review.get("related"))
                    public["entries"][entry_index]["ai_suggested_delete"] = not bool(review.get("related"))
                    if not bool(review.get("related")) and str(review.get("reason") or "").strip():
                        public["entries"][entry_index]["ai_deletion_reason"] = str(review["reason"]).strip()[:800]
            (run_dir / "ai_codebook.json").write_text(
                json.dumps({
                    **public,
                    "codebook_type": "AI",
                    "created_at": time.time(),
                }, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            send_json(self, 200, {
                "codebook_id": codebook_id,
                "codebook": public,
                "entry_count": len(public["entries"]),
                "relevance_reviewed": sum(isinstance(review.get("related"), bool) for review in relevance_reviews),
                "deletion_suggestions_enabled": include_ai_deletion_suggestions,
            })
            return

        save_reviewed_codebook_match = re.fullmatch(
            r"/api/codebooks/([A-Za-z0-9_-]+)/reviewed-codebook", path
        )
        if save_reviewed_codebook_match:
            codebook_id = save_reviewed_codebook_match.group(1)
            run_dir = THEME_CODEBOOK_DIR / codebook_id
            owner_path = run_dir / "owner.json"
            try:
                owner_metadata = json.loads(owner_path.read_text(encoding="utf-8"))
                owner_id = int(owner_metadata.get("owner_id"))
            except Exception:
                owner_metadata = {}
                owner_id = None
            if owner_id != user["user_id"]:
                send_json(self, 404, {"error": "Could not find this generated codebook."})
                return
            try:
                payload = json_body(self)
                reviewed = save_reviewed_codebook(
                    run_dir,
                    payload.get("edited_codebook"),
                    change_history=payload.get("change_history"),
                )
                send_json(self, 200, {
                    "saved": True,
                    "codebook_id": codebook_id,
                    "codebook_type": "AI+Human",
                    "entry_count": len(reviewed["entries"]),
                })
            except (ValueError, json.JSONDecodeError) as exc:
                send_json(self, 400, {"error": str(exc)})
            return

        if path == "/api/generate-themes":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except Exception:
                send_json(self, 400, {"error": "Could not read theme generation request."})
                return

            codebook_id = str(payload.get("codebook_id", "")).strip()
            filter_mode = payload.get("filter_mode", "keep-all")
            azure_endpoint = payload.get("azure_endpoint", "")
            api_key = payload.get("api_key", "")
            api_version = payload.get("api_version", "")
            model = payload.get("model", "")
            research_question = payload.get("research_question", "")
            interviewee = payload.get("interviewee", "")
            edited_codebook = payload.get("edited_codebook")
            human_themes = payload.get("human_themes") if isinstance(payload.get("human_themes"), list) else []
            missing = [
                label for label, value in (
                    ("codebook_id", codebook_id),
                    ("azure_endpoint", azure_endpoint),
                    ("api_key", api_key),
                    ("api_version", api_version),
                    ("model", model),
                    ("research_question", research_question),
                )
                if not value
            ]
            if missing:
                send_json(self, 400, {"error": f"Missing theme generation setting: {', '.join(missing)}"})
                return
            if not re.fullmatch(r"[A-Za-z0-9_-]+", codebook_id):
                send_json(self, 400, {"error": "Invalid codebook identifier. Please generate the codebook again."})
                return

            run_dir = THEME_CODEBOOK_DIR / codebook_id
            if not run_dir.exists() or not run_dir.is_dir():
                send_json(self, 400, {"error": "Could not find this generated codebook. Please generate the codebook again."})
                return
            owner_path = run_dir / "owner.json"
            try:
                owner_metadata = json.loads(owner_path.read_text(encoding="utf-8"))
                owner_id = int(owner_metadata.get("owner_id"))
            except Exception:
                owner_metadata = {}
                owner_id = None
            if owner_id != user["user_id"]:
                send_json(self, 404, {"error": "Could not find this generated codebook."})
                return

            theme_agent_personas = AGENT_PERSONAS
            project_id = owner_metadata.get("project_id")
            if project_id:
                theme_project = project_row_for_user(str(project_id), user["user_id"])
                if theme_project is not None:
                    theme_agent_personas = project_agent_personas(theme_project)

            try:
                if edited_codebook is not None:
                    edited_codebook = save_reviewed_codebook(
                        run_dir,
                        edited_codebook,
                        change_history=payload.get("codebook_change_history"),
                    )
                theme_codebook_path, theme_codebook = load_codebook_for_themes(
                    run_dir, filter_mode, edited_codebook=edited_codebook
                )
                total_codes = len(theme_codebook.get("entries", []))
                if total_codes == 0:
                    send_json(self, 400, {"error": "No unique codes are available for theme generation."})
                    return

                completion_fn = make_completion(azure_endpoint, api_key, api_version, model)

                output_dir = run_dir / "theme_generation"
                output_dir.mkdir(parents=True, exist_ok=True)

                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    import_workflow_modules()
                    theme_module = importlib.import_module("themer_agents_once")
                    consensus_module = importlib.import_module("new_consensus_cluster_distinctiveness")
                    agent_pipeline = theme_module.run_multiple_theme_agents_single_round_pipeline(
                        codebook_path=str(theme_codebook_path),
                        output_dir=str(output_dir),
                        research_question=research_question,
                        agents=AGENTS,
                        no_progress_limit=10,
                        verbose=False,
                        completion_fn=completion_fn,
                        agent_personas=theme_agent_personas,
                    )
                    consensus_output, consensus_path = consensus_module.run_final_theme_consensus(
                        final_clusters_path=agent_pipeline["final_clusters_path"],
                        final_agent_results=agent_pipeline["final_agent_results"],
                        output_dir=str(output_dir / "consensus"),
                    )
                    code_lookup = theme_lookup_from_clustered_ids(
                        agent_pipeline["final_clusters_path"]
                    )
                    mode = "multi-agent-consensus"

                if not Path(consensus_path).exists():
                    raise FileNotFoundError("The final theme consensus output was not created.")
                public_themes = public_themes_from_consensus_output(consensus_output, code_lookup)
                theme_matches = semantic_theme_matches(public_themes, human_themes, threshold=0.8)
            except Exception as exc:
                send_json(self, 400, {"error": f"Could not generate themes: {exc}"})
                return

            send_json(self, 200, {
                "themes": public_themes,
                "theme_count": len(public_themes),
                "code_count": total_codes,
                "mode": mode,
                "theme_matches": theme_matches,
            })
            return

        if path != "/api/identify":
            self.send_error(404)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
        )

        file_item = form["transcript"] if "transcript" in form else None
        project_id = form.getfirst("project_id", "").strip()
        persistent_transcript_id = form.getfirst("transcript_id", "").strip()
        stored_transcript = None
        if project_id and persistent_transcript_id:
            stored_transcript = transcript_row_for_user(project_id, persistent_transcript_id, user["user_id"])
            if not stored_transcript:
                send_json(self, 404, {"error": "Transcript not found."})
                return
            original_name = safe_filename(stored_transcript["name"])
        elif file_item is not None and getattr(file_item, "filename", ""):
            original_name = safe_filename(file_item.filename)
        else:
            send_json(self, 400, {"error": "Choose a project transcript first."})
            return

        reusable_job_id, reusable_job = reusable_identify_job(
            user["user_id"], project_id, persistent_transcript_id
        )
        if reusable_job_id and reusable_job:
            send_json(self, 202, {
                "job_id": reusable_job_id,
                "status": reusable_job["status"],
                "message": reusable_job.get("message", "Background AI coding is already running."),
                "reused": True,
            })
            return

        job_id = uuid.uuid4().hex[:12]
        run_dir = RUNS_DIR / job_id
        upload_dir = run_dir / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        normalized_name = normalize_uploaded_name(original_name)
        if not normalized_name.lower().endswith(".docx"):
            send_json(self, 400, {"error": "Only .docx transcripts are supported."})
            return
        file_path = upload_dir / normalized_name
        if stored_transcript:
            source_path = transcript_storage_dir(user["user_id"], project_id, persistent_transcript_id) / stored_transcript["stored_name"]
            shutil.copy2(source_path, file_path)
        else:
            with file_path.open("wb") as out:
                shutil.copyfileobj(file_item.file, out)

        chunk_dir = run_dir / "transcript_chunks"
        transcript_id = parse_transcript_id(normalized_name)
        try:
            transcript_text, words, chunk_paths, chunk_lengths = prepare_docx_chunks(
                file_path,
                chunk_dir,
                transcript_id,
            )
        except Exception as exc:
            send_json(self, 400, {"error": f"Could not prepare transcript chunks: {exc}"})
            return
        if not chunk_paths:
            send_json(self, 400, {"error": "No transcript chunks were available for coding."})
            return

        analysis_project_row = (
            project_row_for_user(project_id, user["user_id"]) if project_id else None
        )
        job = {
            "owner_id": user["user_id"],
            "project_id": project_id or None,
            "persistent_transcript_id": persistent_transcript_id or None,
            "status": "queued",
            "message": "Queued ReflexCoTI workflow...",
            "run_dir": str(run_dir),
            "file_path": str(file_path),
            "chunk_paths": [str(path) for path in chunk_paths],
            "transcript_id": transcript_id,
            "azure_endpoint": form.getfirst("azure_endpoint", ""),
            "api_key": form.getfirst("api_key", ""),
            "api_version": form.getfirst("api_version", ""),
            "model": form.getfirst("model", ""),
            "research_question": form.getfirst("research_question", "").strip(),
            "interviewee": form.getfirst("interviewee", "").strip(),
            "initial_reflections": project_starting_reflections(
                analysis_project_row,
                persistent_transcript_id,
            ) if analysis_project_row else EMPTY_AGENT_INITIAL_REFLECTIONS,
            "agent_personas": (
                project_agent_personas(analysis_project_row)
                if analysis_project_row else AGENT_PERSONAS
            ),
            "transcript_text": transcript_text,
            "chunk_count": len(chunk_paths),
            "chunk_lengths": chunk_lengths,
            "word_count": words,
            "created_at": time.time(),
        }
        missing = [key for key in ("azure_endpoint", "api_key", "api_version", "model", "research_question", "interviewee") if not job[key]]
        if missing:
            send_json(self, 400, {"error": f"Missing Azure OpenAI setting: {', '.join(missing)}"})
            return

        with JOBS_LOCK:
            JOBS[job_id] = job
        threading.Thread(target=run_job, args=(job_id,), daemon=True).start()
        send_json(self, 202, {"job_id": job_id, "status": "queued", "message": job["message"]})


def main():
    ensure_dirs()
    host = os.environ.get("HOST", "0.0.0.0")
    port_value = os.environ.get("PORT", "5173")
    try:
        port = int(port_value)
    except ValueError as exc:
        raise ValueError(f"PORT must be an integer, got {port_value!r}") from exc

    server = ThreadingHTTPServer((host, port), ReflexCoTIHandler)
    public_url = os.environ.get("PUBLIC_URL", f"http://{host}:{port}")
    print(f"ReflexCoTI web app listening on {host}:{port}", flush=True)
    print(f"Public URL: {public_url}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
