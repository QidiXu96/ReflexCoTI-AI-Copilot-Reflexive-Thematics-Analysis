import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class PeerSuggestionWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp.name)
        self.patcher = patch.multiple(
            server,
            DATA_DIR=self.data_dir,
            UPLOAD_DIR=self.data_dir / "uploads",
            RUNS_DIR=self.data_dir / "runs",
            THEME_CODEBOOK_DIR=self.data_dir / "theme_codebooks",
            PROJECTS_DIR=self.data_dir / "projects",
            DATABASE_PATH=self.data_dir / "reflexcoti.sqlite3",
        )
        self.patcher.start()
        server.ensure_dirs()
        with server.database() as connection:
            connection.executemany(
                """INSERT INTO users(username, password_salt, password_hash, role, created_at)
                   VALUES (?, X'01', X'02', 'student', 1)""",
                [("Owner",), ("Reviewer",), ("AnotherReviewer",)],
            )
            users = {row["username"]: int(row["id"]) for row in connection.execute("SELECT id, username FROM users")}
            self.owner_id = users["Owner"]
            self.reviewer_id = users["Reviewer"]
            self.other_reviewer_id = users["AnotherReviewer"]
            connection.executemany(
                """INSERT INTO peer_review_connections(reviewer_id, owner_id, status, created_at, responded_at)
                   VALUES (?, ?, 'active', 1, 1)""",
                [(self.reviewer_id, self.owner_id), (self.other_reviewer_id, self.owner_id)],
            )
            connection.execute(
                """INSERT INTO projects(id, owner_id, name, research_question, interviewee,
                       initial_reflections, created_at, updated_at)
                   VALUES ('peer-project', ?, 'Peer study', 'How is support experienced?',
                           'Participants', '{}', 2, 2)""",
                (self.owner_id,),
            )
            connection.execute(
                """INSERT INTO transcripts(id, project_id, name, stored_name, size, word_count,
                       codes_count, excerpts_count, created_at, updated_at)
                   VALUES ('peer-transcript', 'peer-project', 'Interview.docx', 'source.docx',
                           1, 5, 2, 2, 2, 2)"""
            )
            coding_snapshot = {
                "codeReviewStage": "complete", "codingRevision": 1,
                "lastExportedCodingRevision": 1, "originalAiCodes": [],
                "codes": [
                    {"id": "code-1", "title": "Emotional support", "quotes": ["I listened"], "reviewStatus": "accepted"},
                    {"id": "code-2", "title": "Practical support", "quotes": ["I drove her"], "reviewStatus": "accepted"},
                ],
            }
            theme_snapshot = {
                "themeReviewStage": "complete", "themeRevision": 1,
                "lastExportedThemeRevision": 1, "originalAiThemes": [],
                "themes": [
                    {"id": "theme-1", "title": "Support work", "rationale": "Ways support is provided.",
                     "codes": [{"codeName": "Emotional support"}, {"codeName": "Practical support"}],
                     "reviewStatus": "accepted"},
                    {"id": "theme-2", "title": "Coordination", "rationale": "Organizing care.",
                     "codes": [{"codeName": "Care coordination"}], "reviewStatus": "accepted"},
                ],
            }
            connection.execute(
                "INSERT INTO transcript_analysis(transcript_id, snapshot, updated_at) VALUES ('peer-transcript', ?, 3)",
                (json.dumps(coding_snapshot),),
            )
            connection.execute(
                "INSERT INTO project_analysis(project_id, snapshot, updated_at) VALUES ('peer-project', ?, 3)",
                (json.dumps(theme_snapshot),),
            )
            connection.executemany(
                """INSERT INTO export_batches(id, project_id, transcript_id, scope, created_by,
                       username_snapshot, project_name_snapshot, relative_path, created_at)
                   VALUES (?, 'peer-project', ?, ?, ?, 'Owner', 'Peer study', ?, 4)""",
                [
                    ("code-export", "peer-transcript", "coding", self.owner_id, "code-export"),
                    ("theme-export", None, "themes", self.owner_id, "theme-export"),
                ],
            )

    def tearDown(self):
        self.patcher.stop()
        self.temp.cleanup()

    def test_peer_can_suggest_but_only_owner_can_apply_and_export_after_resolution(self):
        projects = server.peer_review_projects(self.reviewer_id, "owner")
        self.assertEqual(projects[0]["owner_username"], "Owner")
        self.assertEqual(projects[0]["transcripts"][0]["id"], "peer-transcript")
        self.assertEqual(server.peer_review_projects(self.reviewer_id, "UnknownUser"), [])
        self.assertEqual(server.peer_review_projects(self.reviewer_id, "Reviewer"), [])
        with self.assertRaisesRegex(PermissionError, "not available"):
            server.peer_review_analysis(
                self.reviewer_id, "peer-project", "coding", "peer-transcript", "AnotherReviewer"
            )

        with self.assertRaisesRegex(ValueError, "requires an explanatory memo"):
            server.create_peer_suggestion(self.reviewer_id, "Reviewer", {
                "project_id": "peer-project", "transcript_id": "peer-transcript",
                "scope": "coding", "action": "revise", "target_ids": ["code-1"],
                "proposed_value": {"title": "Relational support"}, "memo": "",
            })

        suggestion = server.create_peer_suggestion(self.reviewer_id, "Reviewer", {
            "project_id": "peer-project", "transcript_id": "peer-transcript",
            "scope": "coding", "action": "revise", "target_ids": ["code-1"],
            "proposed_value": {"title": "Relational support", "excerpts": ["I listened"]},
            "memo": "This name better captures the relational work.",
        })
        self.assertEqual(suggestion["status"], "pending")
        self.assertEqual(server.pending_peer_suggestion_count(
            self.owner_id, "peer-project", "coding", "peer-transcript"
        ), 1)
        inbox = server.peer_suggestions_for_user(self.owner_id)
        self.assertEqual(inbox["pending_received"], 1)
        detail = inbox["suggestions"][0]
        self.assertEqual(detail["affected_items"][0]["title"], "Emotional support")
        self.assertEqual(detail["result_preview"][0]["title"], "Relational support")
        self.assertEqual(detail["result_preview"][0]["excerpts"], ["I listened"])
        self.assertFalse(detail["is_stale"])
        with self.assertRaisesRegex(PermissionError, "not found"):
            server.resolve_peer_suggestion(self.reviewer_id, suggestion["id"], "accept")

        result = server.resolve_peer_suggestion(self.owner_id, suggestion["id"], "accept")
        self.assertTrue(result["applied"])
        self.assertEqual(server.pending_peer_suggestion_count(
            self.owner_id, "peer-project", "coding", "peer-transcript"
        ), 0)
        with server.database() as connection:
            snapshot = json.loads(connection.execute(
                "SELECT snapshot FROM transcript_analysis WHERE transcript_id = 'peer-transcript'"
            ).fetchone()["snapshot"])
        self.assertEqual(snapshot["codingRevision"], 2)
        self.assertEqual(snapshot["lastExportedCodingRevision"], 1)
        self.assertEqual(snapshot["codes"][0]["title"], "Relational support")
        self.assertEqual(snapshot["codes"][0]["peerSuggestionHistory"][0]["reviewer_username"], "Reviewer")

    def test_peer_review_requires_owner_acceptance_and_access_is_one_way(self):
        with server.database() as connection:
            connection.execute(
                "DELETE FROM peer_review_connections WHERE reviewer_id = ? AND owner_id = ?",
                (self.reviewer_id, self.owner_id),
            )
        self.assertEqual(server.peer_review_projects(self.reviewer_id, "Owner"), [])
        with self.assertRaisesRegex(PermissionError, "must accept"):
            server.peer_review_analysis(
                self.reviewer_id, "peer-project", "coding", "peer-transcript", "Owner"
            )

        request = server.create_peer_review_invitation(self.reviewer_id, "Owner")
        self.assertEqual(request["status"], "pending")
        self.assertEqual(server.peer_review_projects(self.reviewer_id, "Owner"), [])
        accepted = server.respond_to_peer_review_invitation(request["id"], self.owner_id, "accept")
        self.assertEqual(accepted["status"], "active")
        self.assertEqual(server.peer_review_projects(self.reviewer_id, "Owner")[0]["owner_username"], "Owner")
        self.assertEqual(server.peer_review_projects(self.owner_id, "Reviewer"), [])

    def test_peer_review_request_can_be_declined_and_requested_again(self):
        with server.database() as connection:
            connection.execute(
                "DELETE FROM peer_review_connections WHERE reviewer_id = ? AND owner_id = ?",
                (self.reviewer_id, self.owner_id),
            )
        request = server.create_peer_review_invitation(self.reviewer_id, "Owner")
        declined = server.respond_to_peer_review_invitation(request["id"], self.owner_id, "decline")
        self.assertEqual(declined["status"], "declined")
        repeated = server.create_peer_review_invitation(self.reviewer_id, "owner")
        self.assertEqual(repeated["id"], request["id"])
        self.assertEqual(repeated["status"], "pending")
        with self.assertRaisesRegex(ValueError, "another junior"):
            server.create_peer_review_invitation(self.reviewer_id, "Reviewer")

    def test_peer_review_dashboard_lists_approved_sent_and_received_requests(self):
        dashboard = server.peer_review_connections_for_user(self.reviewer_id)
        self.assertEqual([item["username"] for item in dashboard["approved"]], ["Owner"])
        self.assertEqual(dashboard["approved"][0]["exported_project_count"], 1)
        self.assertEqual(dashboard["pending_sent"], [])

        with server.database() as connection:
            connection.execute(
                "DELETE FROM peer_review_connections WHERE reviewer_id = ? AND owner_id = ?",
                (self.reviewer_id, self.owner_id),
            )
        request = server.create_peer_review_invitation(self.reviewer_id, "Owner")
        pending_dashboard = server.peer_review_connections_for_user(self.reviewer_id)
        self.assertEqual([item["username"] for item in pending_dashboard["pending_sent"]], ["Owner"])
        self.assertEqual(pending_dashboard["approved"], [])

        incoming = server.create_peer_review_invitation(self.owner_id, "Reviewer")
        received_dashboard = server.peer_review_connections_for_user(self.reviewer_id)
        self.assertEqual([item["username"] for item in received_dashboard["pending"]], ["Owner"])
        self.assertNotEqual(incoming["id"], request["id"])

    def test_owner_can_agree_to_peer_code_merge_and_theme_split(self):
        merge = server.create_peer_suggestion(self.reviewer_id, "Reviewer", {
            "project_id": "peer-project", "transcript_id": "peer-transcript",
            "scope": "coding", "action": "merge", "target_ids": ["code-1", "code-2"],
            "proposed_value": {"title": "Support practices"},
            "memo": "The excerpts describe one connected practice.",
        })
        server.resolve_peer_suggestion(self.owner_id, merge["id"], "accept")
        with server.database() as connection:
            coding = json.loads(connection.execute(
                "SELECT snapshot FROM transcript_analysis WHERE transcript_id = 'peer-transcript'"
            ).fetchone()["snapshot"])
        self.assertEqual([code["title"] for code in coding["codes"]], ["Support practices"])
        self.assertEqual(coding["codes"][0]["peerSourceCodeIds"], ["code-1", "code-2"])

        split = server.create_peer_suggestion(self.other_reviewer_id, "AnotherReviewer", {
            "project_id": "peer-project", "scope": "themes", "action": "split",
            "target_ids": ["theme-1"], "memo": "Two patterns are present.",
            "proposed_value": {"parts": [
                {"title": "Emotional presence", "rationale": "Listening and presence.",
                 "code_names": ["Emotional support"]},
                {"title": "Practical help", "rationale": "Tangible assistance.",
                 "code_names": ["Practical support"]},
            ]},
        })
        server.resolve_peer_suggestion(self.owner_id, split["id"], "accept")
        with server.database() as connection:
            themes = json.loads(connection.execute(
                "SELECT snapshot FROM project_analysis WHERE project_id = 'peer-project'"
            ).fetchone()["snapshot"])
        self.assertEqual(themes["themeRevision"], 2)
        self.assertEqual(
            {theme["title"] for theme in themes["themes"]},
            {"Emotional presence", "Practical help", "Coordination"},
        )

    def test_disagree_resolves_without_changing_owner_snapshot(self):
        suggestion = server.create_peer_suggestion(self.reviewer_id, "Reviewer", {
            "project_id": "peer-project", "transcript_id": "peer-transcript",
            "scope": "coding", "action": "reject", "target_ids": ["code-2"],
            "memo": "This code may be too descriptive.",
        })
        result = server.resolve_peer_suggestion(self.owner_id, suggestion["id"], "reject")
        self.assertEqual(result["status"], "rejected")
        with server.database() as connection:
            snapshot = json.loads(connection.execute(
                "SELECT snapshot FROM transcript_analysis WHERE transcript_id = 'peer-transcript'"
            ).fetchone()["snapshot"])
        self.assertEqual(snapshot["codingRevision"], 1)
        self.assertEqual(snapshot["codes"][1]["reviewStatus"], "accepted")

    def test_agreeing_with_peer_accept_records_review_and_requires_new_export(self):
        suggestion = server.create_peer_suggestion(self.reviewer_id, "Reviewer", {
            "project_id": "peer-project", "transcript_id": "peer-transcript",
            "scope": "coding", "action": "accept", "target_ids": ["code-1"],
            "memo": "This code and evidence are well aligned.",
        })
        result = server.resolve_peer_suggestion(self.owner_id, suggestion["id"], "accept")
        self.assertTrue(result["applied"])
        with server.database() as connection:
            snapshot = json.loads(connection.execute(
                "SELECT snapshot FROM transcript_analysis WHERE transcript_id = 'peer-transcript'"
            ).fetchone()["snapshot"])
        self.assertEqual(snapshot["codingRevision"], 2)
        self.assertEqual(snapshot["lastExportedCodingRevision"], 1)
        self.assertEqual(snapshot["codes"][0]["peerSuggestionHistory"][0]["action"], "accept")


if __name__ == "__main__":
    unittest.main()
