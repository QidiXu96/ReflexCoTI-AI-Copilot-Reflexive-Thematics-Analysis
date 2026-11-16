import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class UserRoleTests(unittest.TestCase):
    def test_normalize_user_role_accepts_supported_roles(self):
        self.assertEqual(server.normalize_user_role(" Student "), "student")
        self.assertEqual(server.normalize_user_role("PI"), "pi")

    def test_normalize_user_role_requires_a_supported_role(self):
        for value in (None, "", "admin"):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "Junior researcher or Senior researcher"):
                    server.normalize_user_role(value)

    def test_existing_users_are_migrated_to_student(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            database_path = data_dir / "reflexcoti.sqlite3"
            with sqlite3.connect(database_path) as connection:
                connection.execute(
                    """CREATE TABLE users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        password_salt BLOB NOT NULL,
                        password_hash BLOB NOT NULL,
                        created_at REAL NOT NULL
                    )"""
                )
                connection.execute(
                    "INSERT INTO users(username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    ("existing-user", b"salt", b"hash", 1.0),
                )

            with patch.multiple(
                server,
                DATA_DIR=data_dir,
                UPLOAD_DIR=data_dir / "uploads",
                RUNS_DIR=data_dir / "runs",
                THEME_CODEBOOK_DIR=data_dir / "theme_codebooks",
                PROJECTS_DIR=data_dir / "projects",
                DATABASE_PATH=database_path,
            ):
                server.ensure_dirs()
                with server.database() as connection:
                    user = connection.execute(
                        "SELECT username, role FROM users WHERE username = ?",
                        ("existing-user",),
                    ).fetchone()

            self.assertEqual(user["role"], "student")


class PiStudentInvitationTests(unittest.TestCase):
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
        with server.database() as connection:
            pi = connection.execute(
                "INSERT INTO users(username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, 'pi', ?)",
                ("Professor", b"salt", b"hash", 1.0),
            )
            student = connection.execute(
                "INSERT INTO users(username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, 'student', ?)",
                ("StudentOne", b"salt", b"hash", 1.0),
            )
            self.pi_id = pi.lastrowid
            self.student_id = student.lastrowid

    def tearDown(self):
        self.paths.stop()
        self.temporary_directory.cleanup()

    def test_student_can_accept_invitation_and_connection_stays_active(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "studentone")
        self.assertEqual(invitation["status"], "pending")

        accepted = server.respond_to_pi_invitation(
            invitation["id"], self.student_id, "accept"
        )

        self.assertEqual(accepted["status"], "active")
        with server.database() as connection:
            stored = connection.execute(
                "SELECT status, responded_at FROM pi_student_connections WHERE id = ?",
                (invitation["id"],),
            ).fetchone()
        self.assertEqual(stored["status"], "active")
        self.assertIsNotNone(stored["responded_at"])

    def test_active_connection_cannot_be_invited_again(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")

        with self.assertRaisesRegex(ValueError, "already connected"):
            server.create_pi_student_invitation(self.pi_id, "StudentOne")

    def test_only_invited_student_can_respond(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")

        with self.assertRaisesRegex(ValueError, "not found"):
            server.respond_to_pi_invitation(invitation["id"], self.student_id + 999, "accept")

    def test_pi_can_list_projects_only_after_student_accepts(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        with self.assertRaisesRegex(PermissionError, "not connected"):
            server.projects_for_connected_student(self.pi_id, self.student_id)

        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")
        with server.database() as connection:
            connection.execute(
                """INSERT INTO projects(
                       id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)""",
                ("student-project", self.student_id, "Student study", "A question", "Participants", 2.0, 2.0),
            )
            connection.execute(
                """INSERT INTO projects(
                       id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)""",
                ("pi-project", self.pi_id, "PI study", "Another question", "Participants", 2.0, 2.0),
            )

        result = server.projects_for_connected_student(self.pi_id, self.student_id)

        self.assertEqual(result["student"]["username"], "StudentOne")
        self.assertEqual([project["id"] for project in result["projects"]], ["student-project"])

    def test_unconnected_pi_cannot_list_student_projects(self):
        with self.assertRaisesRegex(PermissionError, "not connected"):
            server.projects_for_connected_student(self.pi_id + 999, self.student_id)

    def test_connected_pi_can_review_saved_coding_and_themes_read_only(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")
        coding_snapshot = {"codeReviewStage": "complete", "codes": [{"title": "Support", "excerpts": ["Example"]}]}
        theme_snapshot = {"themes": [{"title": "Coordination", "codes": ["Support"]}]}
        with server.database() as connection:
            connection.execute(
                """INSERT INTO projects(
                       id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)""",
                ("review-project", self.student_id, "Review study", "Question", "Participants", 2.0, 2.0),
            )
            connection.execute(
                """INSERT INTO transcripts(
                       id, project_id, name, stored_name, size, word_count,
                       codes_count, excerpts_count, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("transcript-1", "review-project", "Interview.docx", "source.docx", 100, 20, 1, 1, 2.0, 2.0),
            )
            connection.execute(
                "INSERT INTO transcript_analysis(transcript_id, snapshot, updated_at) VALUES (?, ?, ?)",
                ("transcript-1", json.dumps(coding_snapshot), 3.0),
            )
            connection.execute(
                "INSERT INTO project_analysis(project_id, snapshot, updated_at) VALUES (?, ?, ?)",
                ("review-project", json.dumps(theme_snapshot), 3.0),
            )
        storage_dir = server.transcript_storage_dir(
            self.student_id, "review-project", "transcript-1"
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        (storage_dir / "transcript.txt").write_text(
            "Interviewer: Example question\nParticipant: Example response",
            encoding="utf-8",
        )

        review = server.connected_student_project_review(
            self.pi_id, self.student_id, "review-project"
        )
        coding = server.connected_student_analysis(
            self.pi_id, self.student_id, "review-project", "transcript-1"
        )
        themes = server.connected_student_analysis(
            self.pi_id, self.student_id, "review-project"
        )
        content = server.connected_student_transcript_content(
            self.pi_id, self.student_id, "review-project", "transcript-1"
        )

        self.assertEqual(review["project"]["codes_count"], 1)
        self.assertEqual(review["transcripts"][0]["analysis_status"], "finished")
        self.assertEqual(review["theme_count"], 1)
        self.assertEqual(coding["snapshot"], coding_snapshot)
        self.assertEqual(themes["snapshot"], theme_snapshot)
        self.assertIn("Example response", content["text"])
        self.assertGreater(content["word_count"], 0)

    def test_connected_pi_cannot_review_another_students_project(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")

        with self.assertRaisesRegex(PermissionError, "not available"):
            server.connected_student_project_review(
                self.pi_id, self.student_id, "missing-project"
            )
        with self.assertRaisesRegex(PermissionError, "not available"):
            server.connected_student_transcript_content(
                self.pi_id, self.student_id, "missing-project", "missing-transcript"
            )

    def test_connected_pi_can_save_only_memoed_manual_revision_after_student_export(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")
        finished_snapshot = {
            "codeReviewStage": "complete",
            "codingRevision": 1,
            "lastExportedCodingRevision": 1,
            "originalAiCodes": [
                {"id": "code-1", "title": "Support"},
                {"id": "code-2", "title": "Coordination"},
            ],
            "codes": [{
                "id": "code-1", "title": "Support", "quotes": ["Example", "Another example"],
                "reviewStatus": "accepted", "transformationHistory": [],
            }, {
                "id": "code-2", "title": "Coordination", "quotes": ["Coordinated example"],
                "reviewStatus": "accepted", "transformationHistory": [],
            }],
        }
        with server.database() as connection:
            connection.execute(
                """INSERT INTO projects(
                       id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)""",
                ("editable-project", self.student_id, "Study", "Question", "Participants", 2.0, 2.0),
            )
            connection.execute(
                """INSERT INTO transcripts(
                       id, project_id, name, stored_name, size, word_count,
                       codes_count, excerpts_count, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("editable-transcript", "editable-project", "Interview.docx", "source.docx", 1, 1, 1, 1, 2.0, 2.0),
            )
            connection.execute(
                "INSERT INTO transcript_analysis(transcript_id, snapshot, updated_at) VALUES (?, ?, ?)",
                ("editable-transcript", json.dumps(finished_snapshot), 3.0),
            )

        export_dir = self.data_dir / "senior-export"
        export_dir.mkdir()
        filenames = [
            "Interview_ReflexCoTI.json",
            "Interview_ReflexCoTI_AI_original.json",
            "Interview_ReflexCoTI_Human_version.json",
            "Interview_ReflexCoTI_questionnaire.csv",
        ]
        for filename in filenames:
            (export_dir / filename).write_text("original", encoding="utf-8")
        with server.database() as connection:
            connection.execute(
                """INSERT INTO export_batches(
                       id, project_id, transcript_id, scope, created_by,
                       username_snapshot, project_name_snapshot, relative_path, created_at
                   ) VALUES (?, ?, ?, 'coding', ?, ?, ?, ?, ?)""",
                ("senior-batch", "editable-project", "editable-transcript", self.student_id,
                 "StudentOne", "Study", "senior-export", 4.0),
            )
            connection.executemany(
                """INSERT INTO export_files(
                       batch_id, filename, content_type, size_bytes, created_at
                   ) VALUES (?, ?, ?, ?, ?)""",
                [("senior-batch", name, "application/json; charset=utf-8" if name.endswith(".json") else "text/csv; charset=utf-8", 8, 4.0) for name in filenames],
            )

        payload = server.connected_student_analysis(
            self.pi_id, self.student_id, "editable-project", "editable-transcript"
        )
        self.assertTrue(payload["can_modify_codes"])

        revision = json.loads(json.dumps(finished_snapshot))
        revision["codeReviewStage"] = "review"
        revision["codingRevision"] = 2
        revision["codes"][0].update({
            "title": "Practical support",
            "reviewStatus": "",
            "modifiedBySenior": {
                "user_id": self.pi_id,
                "username": "Professor",
                "memo": "Clarifies the kind of support described.",
            },
            "transformationHistory": [{"operation": "reopened", "method": "edit_myself"}],
        })
        revision["codes"][1].update({
            "title": "Care coordination",
            "reviewStatus": "accepted",
            "modifiedBySenior": {
                "user_id": self.pi_id,
                "username": "Professor",
                "memo": "Uses the more precise project terminology.",
            },
            "transformationHistory": [
                {"operation": "reopened", "method": "edit_myself"},
                {"operation": "revised", "method": "edit_myself"},
            ],
        })
        revision["seniorCodeReview"] = {
            "senior_user_id": self.pi_id,
            "student_user_id": self.student_id,
            "status": "pending_export",
        }

        saved = server.save_connected_student_code_revision(
            self.pi_id, self.student_id, "editable-project", "editable-transcript", revision
        )
        self.assertEqual(saved["analysis_status"], "in_progress")
        self.assertEqual(saved["snapshot"]["seniorCodeReview"]["senior_username"], "Professor")

        revision["codeReviewStage"] = "complete"
        revision["codes"][0]["reviewStatus"] = "accepted"
        exported = server.export_connected_student_code_revision(
            self.pi_id, self.student_id, "editable-project", "editable-transcript",
            revision, filenames[0], json.dumps({
                "codes": [
                    {"code name": "Practical support", "excerpts": ["Example", "Another example"]},
                    {"code name": "Care coordination", "excerpts": ["Coordinated example"]},
                ],
            }),
        )
        self.assertEqual(exported["analysis_status"], "finished")
        reviewed_file = json.loads((export_dir / filenames[0]).read_text(encoding="utf-8"))
        self.assertEqual(reviewed_file["senior_review"]["senior_username"], "Professor")
        self.assertEqual((export_dir / filenames[1]).read_text(encoding="utf-8"), "original")
        with server.database() as connection:
            audit = connection.execute(
                "SELECT senior_username, coding_revision, modified_code_ids FROM senior_code_revisions"
            ).fetchone()
        self.assertEqual((audit["senior_username"], audit["coding_revision"]), ("Professor", 2))
        self.assertEqual(
            set(json.loads(audit["modified_code_ids"])),
            {"code-1", "code-2"},
        )

        rejected = json.loads(json.dumps(exported["snapshot"]))
        rejected["codingRevision"] = 3
        rejected["codes"][0]["reviewStatus"] = "rejected"
        rejected["codes"][0]["modifiedBySenior"]["memo"] = "This code is not supported after Senior review."
        rejected["codes"][0]["transformationHistory"].append({"operation": "rejected", "method": "edit_myself"})
        rejected["seniorCodeReview"].update({"status": "pending_export", "senior_user_id": self.pi_id})
        server.validate_connected_student_code_revision(
            self.pi_id, self.student_id, "editable-project", "editable-transcript", rejected
        )

        split_revision = json.loads(json.dumps(exported["snapshot"]))
        split_revision["codingRevision"] = 3
        split_revision["codeReviewStage"] = "review"
        parent = split_revision["codes"][0]
        split_history = parent["transformationHistory"] + [{"operation": "split", "method": "edit_myself"}]
        split_revision["codes"] = [
            {
                **parent, "id": "code-1-split-1", "title": "First support",
                "quotes": ["Example"], "excerpts": ["Example"], "reviewStatus": "",
                "splitFromCodeId": "code-1", "transformationHistory": split_history,
                "modifiedBySenior": {"user_id": self.pi_id, "username": "Professor", "memo": "Separates two distinct forms of support."},
            },
            {
                **parent, "id": "code-1-split-2", "title": "Second support",
                "quotes": ["Another example"], "excerpts": ["Another example"], "reviewStatus": "",
                "splitFromCodeId": "code-1", "transformationHistory": split_history,
                "modifiedBySenior": {"user_id": self.pi_id, "username": "Professor", "memo": "Separates two distinct forms of support."},
            },
        ]
        split_revision["seniorCodeReview"].update({"status": "pending_export", "senior_user_id": self.pi_id})
        with self.assertRaisesRegex(ValueError, "merged codes must identify"):
            server.validate_connected_student_code_revision(
                self.pi_id, self.student_id, "editable-project", "editable-transcript", split_revision
            )

        no_memo = json.loads(json.dumps(finished_snapshot))
        no_memo["codingRevision"] = 2
        no_memo["codes"][0]["title"] = "Changed without memo"
        no_memo["codes"][0]["modifiedBySenior"] = {"user_id": self.pi_id, "memo": ""}
        no_memo["seniorCodeReview"] = {"senior_user_id": self.pi_id}
        with self.assertRaisesRegex(ValueError, "requires a memo"):
            server.validate_connected_student_code_revision(
                self.pi_id, self.student_id, "editable-project", "editable-transcript", no_memo
            )

        merge_revision = json.loads(json.dumps(exported["snapshot"]))
        merge_revision["codingRevision"] = 3
        merge_revision["codeReviewStage"] = "complete"
        merge_revision["codes"] = [{
            "id": "code-merged",
            "title": "Support coordination",
            "quotes": ["Example", "Another example", "Coordinated example"],
            "excerpts": ["Example", "Another example", "Coordinated example"],
            "source": "AI+Human",
            "sourceClass": "ai",
            "reviewStatus": "accepted",
            "mergedFromCodes": True,
            "seniorSourceCodeIds": ["code-1", "code-2"],
            "modifiedBySenior": {
                "user_id": self.pi_id,
                "username": "Professor",
                "memo": "These codes describe one integrated support process.",
            },
            "transformationHistory": [{"operation": "merged", "method": "edit_myself"}],
        }]
        merge_revision["seniorCodeReview"].update({
            "status": "pending_export",
            "senior_user_id": self.pi_id,
            "modified_code_ids": ["code-1", "code-2", "code-merged"],
        })
        merged_export = server.export_connected_student_code_revision(
            self.pi_id, self.student_id, "editable-project", "editable-transcript",
            merge_revision, filenames[0], json.dumps({
                "codes": [{
                    "code name": "Support coordination",
                    "excerpts": ["Example", "Another example", "Coordinated example"],
                }],
            }),
        )
        self.assertEqual(merged_export["analysis_status"], "finished")
        self.assertEqual(merged_export["snapshot"]["codes"][0]["seniorSourceCodeIds"], ["code-1", "code-2"])
        reviewed_file = json.loads((export_dir / filenames[0]).read_text(encoding="utf-8"))
        self.assertEqual(reviewed_file["codes"][0]["code name"], "Support coordination")

    def test_connected_pi_cannot_modify_unexported_student_codes(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")
        unfinished = {
            "codeReviewStage": "complete", "codingRevision": 1,
            "lastExportedCodingRevision": 0, "originalAiCodes": [], "codes": [],
        }
        with server.database() as connection:
            connection.execute(
                """INSERT INTO projects(
                       id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)""",
                ("unfinished-project", self.student_id, "Study", "Question", "Participants", 2.0, 2.0),
            )
            connection.execute(
                """INSERT INTO transcripts(
                       id, project_id, name, stored_name, size, word_count,
                       codes_count, excerpts_count, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                ("unfinished-transcript", "unfinished-project", "Interview.docx", "source.docx", 1, 1, 0, 0, 2.0, 2.0),
            )
            connection.execute(
                "INSERT INTO transcript_analysis(transcript_id, snapshot, updated_at) VALUES (?, ?, ?)",
                ("unfinished-transcript", json.dumps(unfinished), 3.0),
            )
        payload = server.connected_student_analysis(
            self.pi_id, self.student_id, "unfinished-project", "unfinished-transcript"
        )
        self.assertFalse(payload["can_modify_codes"])
        with self.assertRaisesRegex(ValueError, "finish and export"):
            server.validate_connected_student_code_revision(
                self.pi_id, self.student_id, "unfinished-project", "unfinished-transcript", unfinished
            )

    def test_connected_pi_can_manually_merge_and_export_finished_themes(self):
        invitation = server.create_pi_student_invitation(self.pi_id, "StudentOne")
        server.respond_to_pi_invitation(invitation["id"], self.student_id, "accept")
        original_themes = [
            {"id": "theme-1", "title": "Support", "rationale": "Support description",
             "codes": [{"codeName": "Emotional support"}], "reviewStatus": "accepted",
             "transformationHistory": []},
            {"id": "theme-2", "title": "Coordination", "rationale": "Coordination description",
             "codes": [{"codeName": "Care coordination"}], "reviewStatus": "accepted",
             "transformationHistory": []},
        ]
        finished = {
            "themeReviewStage": "complete", "themeRevision": 1,
            "lastExportedThemeRevision": 1, "latestCodebook": {"entries": []},
            "originalAiThemes": original_themes, "themes": original_themes,
        }
        with server.database() as connection:
            connection.execute(
                """INSERT INTO projects(id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)""",
                ("theme-project", self.student_id, "Study", "Question", "Participants", 2.0, 2.0),
            )
            connection.execute(
                "INSERT INTO project_analysis(project_id, snapshot, updated_at) VALUES (?, ?, ?)",
                ("theme-project", json.dumps(finished), 3.0),
            )
        export_dir = self.data_dir / "theme-export"
        export_dir.mkdir()
        filenames = ["ReflexCoTI_themes.json", "ReflexCoTI_themes_AI_original.json",
                     "ReflexCoTI_themes_Human_version.json", "ReflexCoTI_themes_questionnaire.csv"]
        for filename in filenames:
            (export_dir / filename).write_text("original", encoding="utf-8")
        with server.database() as connection:
            connection.execute(
                """INSERT INTO export_batches(id, project_id, transcript_id, scope, created_by,
                       username_snapshot, project_name_snapshot, relative_path, created_at)
                       VALUES (?, ?, NULL, 'themes', ?, ?, ?, ?, ?)""",
                ("theme-batch", "theme-project", self.student_id, "StudentOne", "Study", "theme-export", 4.0),
            )
            connection.executemany(
                "INSERT INTO export_files(batch_id, filename, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)",
                [("theme-batch", name, "application/json; charset=utf-8" if name.endswith(".json") else "text/csv; charset=utf-8", 8, 4.0) for name in filenames],
            )

        self.assertTrue(server.connected_student_analysis(
            self.pi_id, self.student_id, "theme-project"
        )["can_modify_themes"])
        revision = json.loads(json.dumps(finished))
        revision.update({"themeRevision": 2, "seniorThemeReview": {
            "senior_user_id": self.pi_id, "student_user_id": self.student_id,
            "status": "pending_export",
        }})
        revision["themes"] = [{
            "id": "theme-merged", "title": "Support coordination",
            "rationale": "Support is coordinated across caregivers.",
            "codes": [{"codeName": "Emotional support"}, {"codeName": "Care coordination"}],
            "reviewStatus": "accepted", "seniorSourceThemeIds": ["theme-1", "theme-2"],
            "modifiedBySenior": {"user_id": self.pi_id, "username": "Professor",
                                 "memo": "These themes describe one integrated pattern."},
            "transformationHistory": [{"operation": "merged", "method": "edit_myself"}],
        }]
        server.save_connected_student_theme_revision(
            self.pi_id, self.student_id, "theme-project", revision
        )
        exported = server.export_connected_student_theme_revision(
            self.pi_id, self.student_id, "theme-project", revision, filenames[0], json.dumps({
                "themes": [{"theme name": "Support coordination",
                            "definition": "Support is coordinated across caregivers.",
                            "codes": [{"code name": "Emotional support"}, {"code name": "Care coordination"}]}],
            }),
        )
        self.assertEqual(exported["analysis_status"], "finished")
        reviewed = json.loads((export_dir / filenames[0]).read_text(encoding="utf-8"))
        self.assertEqual(reviewed["senior_review"]["senior_username"], "Professor")
        self.assertEqual((export_dir / filenames[1]).read_text(encoding="utf-8"), "original")
        with server.database() as connection:
            audit = connection.execute(
                "SELECT senior_username, theme_revision FROM senior_theme_revisions"
            ).fetchone()
        self.assertEqual((audit["senior_username"], audit["theme_revision"]), ("Professor", 2))


if __name__ == "__main__":
    unittest.main()
