import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class CodingRevisionExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temporary_directory.name)
        self.database_path = self.data_dir / "reflexcoti.sqlite3"
        self.paths = patch.multiple(
            server,
            DATA_DIR=self.data_dir,
            UPLOAD_DIR=self.data_dir / "uploads",
            RUNS_DIR=self.data_dir / "runs",
            THEME_CODEBOOK_DIR=self.data_dir / "theme_codebooks",
            PROJECTS_DIR=self.data_dir / "projects",
            DATABASE_PATH=self.database_path,
        )
        self.paths.start()
        server.ensure_dirs()
        self.export_dir = self.data_dir / "archive"
        self.export_dir.mkdir()
        self.names = ["Post_ReflexCoTI.json", "Post_ReflexCoTI_AI_original.json", "Post_ReflexCoTI_Human_version.json"]
        for name in self.names:
            (self.export_dir / name).write_text("old", encoding="utf-8")
        (self.export_dir / "Post_ReflexCoTI_questionnaire.csv").write_text("original questionnaire", encoding="utf-8")
        with server.database() as connection:
            user_id = connection.execute(
                "INSERT INTO users(username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, 'student', ?)",
                ("student", b"salt", b"hash", 1.0),
            ).lastrowid
            connection.execute(
                """INSERT INTO projects(id, owner_id, name, research_question, interviewee, initial_reflections, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                ("project", user_id, "Project", "Question", "Participant", "{}", 1.0, 1.0),
            )
            connection.execute(
                """INSERT INTO transcripts(id, project_id, name, stored_name, size, word_count, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                ("transcript", "project", "Post.docx", "Post.docx", 1, 1, 1.0, 1.0),
            )
            connection.execute(
                """INSERT INTO export_batches(id, project_id, transcript_id, scope, created_by, username_snapshot, project_name_snapshot, relative_path, created_at)
                   VALUES (?, ?, ?, 'coding', ?, ?, ?, ?, ?)""",
                ("batch", "project", "transcript", user_id, "student", "Project", "archive", 1.0),
            )
            rows = [("batch", name, "application/json; charset=utf-8", 3, 1.0) for name in self.names]
            rows.append(("batch", "Post_ReflexCoTI_questionnaire.csv", "text/csv; charset=utf-8", 22, 1.0))
            connection.executemany(
                "INSERT INTO export_files(batch_id, filename, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)",
                rows,
            )

    def tearDown(self):
        self.paths.stop()
        self.temporary_directory.cleanup()

    def test_revision_replaces_only_reviewed_json(self):
        files = [
            (self.names[0], "application/json; charset=utf-8", b"new-reviewed")
        ]
        batch, stored_files = server.replace_coding_export_json_file(
            "project", "transcript", files, 2.0
        )

        self.assertEqual(batch["id"], "batch")
        self.assertEqual(len(stored_files), 4)
        self.assertEqual((self.export_dir / self.names[0]).read_text(encoding="utf-8"), "new-reviewed")
        self.assertEqual((self.export_dir / self.names[1]).read_text(encoding="utf-8"), "old")
        self.assertEqual((self.export_dir / self.names[2]).read_text(encoding="utf-8"), "old")
        self.assertEqual(
            (self.export_dir / "Post_ReflexCoTI_questionnaire.csv").read_text(encoding="utf-8"),
            "original questionnaire",
        )
        with server.database() as connection:
            batch_count = connection.execute("SELECT COUNT(*) FROM export_batches").fetchone()[0]
            updated_at = connection.execute("SELECT created_at FROM export_batches WHERE id = 'batch'").fetchone()[0]
        self.assertEqual(batch_count, 1)
        self.assertEqual(updated_at, 2.0)

    def test_theme_revision_replaces_only_reviewed_ai_human_json(self):
        theme_dir = self.data_dir / "theme_archive"
        theme_dir.mkdir()
        names = [
            "ReflexCoTI_themes.json",
            "ReflexCoTI_themes_AI_original.json",
            "ReflexCoTI_themes_Human_version.json",
        ]
        for name in names:
            (theme_dir / name).write_text("old", encoding="utf-8")
        questionnaire = "ReflexCoTI_themes_questionnaire.csv"
        (theme_dir / questionnaire).write_text("original questionnaire", encoding="utf-8")
        with server.database() as connection:
            connection.execute(
                """INSERT INTO export_batches(id, project_id, transcript_id, scope, created_by, username_snapshot, project_name_snapshot, relative_path, created_at)
                   VALUES (?, ?, NULL, 'themes', ?, ?, ?, ?, ?)""",
                ("theme-batch", "project", 1, "student", "Project", "theme_archive", 1.0),
            )
            rows = [("theme-batch", name, "application/json; charset=utf-8", 3, 1.0) for name in names]
            rows.append(("theme-batch", questionnaire, "text/csv; charset=utf-8", 22, 1.0))
            connection.executemany(
                "INSERT INTO export_files(batch_id, filename, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)",
                rows,
            )

        batch, stored_files = server.replace_reviewed_export_json_file(
            "project", None, "themes",
            [(names[0], "application/json; charset=utf-8", b"new-reviewed-themes")],
            3.0,
        )

        self.assertEqual(batch["id"], "theme-batch")
        self.assertEqual(len(stored_files), 4)
        self.assertEqual((theme_dir / names[0]).read_text(encoding="utf-8"), "new-reviewed-themes")
        self.assertEqual((theme_dir / names[1]).read_text(encoding="utf-8"), "old")
        self.assertEqual((theme_dir / names[2]).read_text(encoding="utf-8"), "old")
        self.assertEqual((theme_dir / questionnaire).read_text(encoding="utf-8"), "original questionnaire")


    def test_legacy_export_scope_constraint_migrates_without_losing_files(self):
        legacy_path = self.data_dir / "legacy.sqlite3"
        connection = sqlite3.connect(legacy_path)
        connection.row_factory = sqlite3.Row
        connection.executescript(
            """
            CREATE TABLE users(id INTEGER PRIMARY KEY);
            CREATE TABLE projects(id TEXT PRIMARY KEY);
            CREATE TABLE transcripts(id TEXT PRIMARY KEY);
            CREATE TABLE export_batches (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
                transcript_id TEXT REFERENCES transcripts(id),
                scope TEXT NOT NULL CHECK(scope IN ('coding', 'themes')),
                created_by INTEGER NOT NULL REFERENCES users(id), username_snapshot TEXT NOT NULL,
                project_name_snapshot TEXT NOT NULL, relative_path TEXT NOT NULL, created_at REAL NOT NULL
            );
            CREATE INDEX export_batches_project_idx ON export_batches(project_id, created_at DESC);
            CREATE TABLE export_files (
                id INTEGER PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES export_batches(id),
                filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at REAL NOT NULL
            );
            INSERT INTO users VALUES (1);
            INSERT INTO projects VALUES ('project');
            INSERT INTO transcripts VALUES ('transcript');
            INSERT INTO export_batches VALUES ('old-batch', 'project', 'transcript', 'coding', 1, 'student', 'Project', 'archive', 1.0);
            INSERT INTO export_files VALUES (1, 'old-batch', 'old.json', 'application/json', 2, 1.0);
            """
        )

        server.migrate_export_batch_scopes(connection)

        schema_sql = connection.execute(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'export_batches'"
        ).fetchone()["sql"]
        self.assertIn("human_coding", schema_sql)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM export_batches").fetchone()[0], 1)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM export_files").fetchone()[0], 1)
        connection.execute(
            "INSERT INTO export_batches VALUES (?, ?, ?, 'human_coding', ?, ?, ?, ?, ?)",
            ("human-batch", "project", "transcript", 1, "student", "Project", "human_archive", 2.0),
        )
        connection.close()

    def test_human_coding_export_scope_is_stored(self):
        with server.database() as connection:
            connection.execute(
                """INSERT INTO export_batches(
                       id, project_id, transcript_id, scope, created_by,
                       username_snapshot, project_name_snapshot, relative_path, created_at
                   ) VALUES (?, ?, ?, 'human_coding', ?, ?, ?, ?, ?)""",
                ("human-batch", "project", "transcript", 1, "student", "Project", "human_archive", 2.0),
            )
            saved_scope = connection.execute(
                "SELECT scope FROM export_batches WHERE id = 'human-batch'"
            ).fetchone()["scope"]
        self.assertEqual(saved_scope, "human_coding")

    def test_finished_results_use_readable_flat_account_project_folder(self):
        user = {"username": "Ada Xu", "user_id": 1}
        destination = server.finished_project_dir(user, "AD Strategy")

        self.assertEqual(
            destination,
            self.data_dir / "projects" / "Ada_Xu" / "AD_Strategy" / "finished",
        )

    def test_legacy_finished_results_are_flattened_with_newest_file_retained(self):
        user = {"username": "Ada Xu", "user_id": 1}
        project_id = "project"
        project_name = "AD Strategy"
        legacy_root = server.export_project_dir(user, project_id, project_name) / "finished"
        older = legacy_root / "transcripts" / "one" / "coding_revision_0001"
        newer = legacy_root / "transcripts" / "one" / "coding_revision_0002"
        older.mkdir(parents=True)
        newer.mkdir(parents=True)
        filename = "Interview_1_ReflexCoTI.json"
        (older / filename).write_text("older", encoding="utf-8")
        (newer / filename).write_text("newer", encoding="utf-8")
        (older / filename).touch()
        (newer / filename).touch()
        older_time = 1_700_000_000
        newer_time = older_time + 10
        import os
        os.utime(older / filename, (older_time, older_time))
        os.utime(newer / filename, (newer_time, newer_time))

        destination = server.finished_project_dir(user, project_name)
        server.migrate_legacy_finished_results(user, project_id, project_name, destination)

        self.assertEqual((destination / filename).read_text(encoding="utf-8"), "newer")
        self.assertFalse(legacy_root.exists())


if __name__ == "__main__":
    unittest.main()
