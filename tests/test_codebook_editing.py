import importlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import server


class EditedCodebookTests(unittest.TestCase):
    def test_normalizes_user_edited_codebook(self):
        result = server.normalize_edited_codebook({
            "retrieval_mode": "code_clue",
            "entries": [{
                "initial code": "  Trust in caregivers  ",
                "clues": [" First excerpt ", "First excerpt", "Second excerpt"],
                "transcript_ids": ["T1", "T1", "T2"],
            }],
        })

        self.assertEqual(result["entries"][0]["initial code"], "Trust in caregivers")
        self.assertEqual(result["entries"][0]["clues"], ["First excerpt", "Second excerpt"])
        self.assertEqual(result["entries"][0]["transcript_ids"], ["T1", "T2"])

    def test_project_card_counts_come_from_codebook(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database_path = root / "reflexcoti.sqlite3"
            codebook_root = root / "theme_codebooks"
            with patch.multiple(
                server,
                DATA_DIR=root,
                UPLOAD_DIR=root / "uploads",
                RUNS_DIR=root / "runs",
                THEME_CODEBOOK_DIR=codebook_root,
                PROJECTS_DIR=root / "projects",
                DATABASE_PATH=database_path,
            ):
                server.ensure_dirs()
                with server.database() as connection:
                    user_id = connection.execute(
                        "INSERT INTO users(username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                        ("researcher", b"salt", b"hash", "student", 1.0),
                    ).lastrowid
                    connection.execute(
                        "INSERT INTO projects(id, owner_id, name, research_question, interviewee, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        ("project-1", user_id, "Study", "Question", "Participants", 1.0, 1.0),
                    )
                    connection.execute(
                        "INSERT INTO project_codebooks(project_id, codebook_id, current_size, updated_at) VALUES (?, ?, ?, ?)",
                        ("project-1", "codebook-1", 99, 2.0),
                    )
                run_dir = codebook_root / "codebook-1"
                run_dir.mkdir(parents=True)
                (run_dir / "ai_codebook.json").write_text(json.dumps({"entries": [
                    {"initial code": "Trust", "clues": ["First excerpt", " first excerpt ", "Second excerpt"]},
                    {"initial code": "Support", "clues": ["Second excerpt"]},
                ]}), encoding="utf-8")

                counts = server.project_codebook_card_counts("project-1")

        self.assertEqual(counts, {
            "codebook_codes_count": 2,
            "codebook_excerpts_count": 4,
        })

    def test_relevance_review_returns_evidence_based_reason(self):
        prompts = []

        def complete(messages, **kwargs):
            prompts.append(messages[0]["content"])
            content = json.dumps({
                "related": False,
                "reason": "The excerpts focus on parking logistics rather than caregiver communication. They do not address the study question. A third sentence should be removed.",
            })
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

        reviews = server.review_codebook_relevance(
            [{"initial code": "Parking logistics", "clues": ["The car park was full."]}],
            "How do caregivers communicate with clinicians?",
            complete,
        )

        self.assertFalse(reviews[0]["related"])
        self.assertEqual(
            reviews[0]["reason"],
            "The excerpts focus on parking logistics rather than caregiver communication. They do not address the study question.",
        )
        self.assertIn("1-2 sentences", prompts[0])
        self.assertIn("Return only one JSON object", prompts[0])

    def test_preserves_ai_deletion_reason_when_normalizing(self):
        result = server.normalize_edited_codebook({
            "entries": [{
                "initial code": "Parking logistics",
                "clues": ["The car park was full."],
                "transcript_ids": ["T1"],
                "ai_suggested_delete": True,
                "ai_deletion_reason": "This evidence does not address caregiver communication.",
            }],
        })

        self.assertEqual(
            result["entries"][0]["ai_deletion_reason"],
            "This evidence does not address caregiver communication.",
        )

    def test_rejects_duplicate_code_names(self):
        with self.assertRaisesRegex(ValueError, "duplicate code name"):
            server.normalize_edited_codebook({
                "entries": [
                    {"initial code": "Trust", "clues": ["A"], "transcript_ids": ["T1"]},
                    {"initial code": " trust ", "clues": ["B"], "transcript_ids": ["T2"]},
                ],
            })

    def test_rejects_empty_codes_before_theme_generation(self):
        with self.assertRaisesRegex(ValueError, "needs at least one excerpt"):
            server.normalize_edited_codebook({
                "entries": [{"initial code": "Empty code", "clues": [], "transcript_ids": []}],
            })

    def test_theme_file_uses_edited_entries_and_filter(self):
        edited = {
            "entries": [
                {"initial code": "Shared", "clues": ["A"], "transcript_ids": ["T1", "T2"]},
                {"initial code": "Single", "clues": ["B"], "transcript_ids": ["T1"]},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path, result = server.load_codebook_for_themes(
                Path(directory), "remove-single-transcript", edited_codebook=edited
            )

            self.assertEqual([entry["initial code"] for entry in result["entries"]], ["Shared"])
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), result)

    def test_saves_ai_human_codebook_and_review_history(self):
        edited = {
            "entries": [{
                "initial code": "Human-refined code",
                "clues": ["Evidence"],
                "transcript_ids": ["T1", "T2"],
            }],
        }
        history = [{"description": "Renamed the original AI code."}]
        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory)
            result = server.save_reviewed_codebook(run_dir, edited, history)
            saved = json.loads((run_dir / "ai_human_codebook.json").read_text(encoding="utf-8"))
            review = json.loads((run_dir / "ai_human_codebook_review.json").read_text(encoding="utf-8"))

            self.assertEqual(result["entries"][0]["initial code"], "Human-refined code")
            self.assertEqual(saved["codebook_type"], "AI+Human")
            self.assertEqual(review["change_history"], history)

    def test_attaches_stable_source_references(self):
        coding_export = {
            "transcript": {"id": "transcript-123", "file_name": "Interview_0001.docx"},
            "codes": [{
                "code id": "code-456",
                "code name": "Caregiver trust",
                "excerpts": ["Trust grew over time."],
            }],
        }
        codebook = {
            "entries": [{
                "initial code": "Trust in caregivers",
                "clues": ["Trust grew over time."],
                "transcript_ids": ["0001"],
            }],
        }
        with tempfile.TemporaryDirectory() as directory:
            export_path = Path(directory) / "coding.json"
            export_path.write_text(json.dumps(coding_export), encoding="utf-8")
            result = server.codebook_source_refs([str(export_path)], codebook)

        entry = result["entries"][0]
        self.assertEqual(entry["transcript_ids"], ["transcript-123"])
        self.assertEqual(entry["source_refs"][0]["source_code_id"], "code-456")
        self.assertEqual(entry["source_refs"][0]["source_code_name"], "Caregiver trust")

    def test_source_references_preserve_all_merged_code_excerpt_fields(self):
        coding_export = {
            "transcript": {"id": "transcript-123", "file_name": "Interview_0001.docx"},
            "codes": [{
                "code id": "merged-456",
                "code name": "Caregiver communication",
                "excerpt": "First excerpt",
                "quote": "First excerpt",
                "excerpts": ["First excerpt"],
                "quotes": ["First excerpt", "Second excerpt", "Third excerpt"],
            }],
        }
        codebook = {
            "entries": [{
                "initial code": "Caregiver communication",
                "clues": ["First excerpt", "Second excerpt", "Third excerpt"],
                "transcript_ids": ["transcript-123"],
            }],
        }
        with tempfile.TemporaryDirectory() as directory:
            export_path = Path(directory) / "coding.json"
            export_path.write_text(json.dumps(coding_export), encoding="utf-8")
            result = server.codebook_source_refs([str(export_path)], codebook)

        ref = result["entries"][0]["source_refs"][0]
        self.assertEqual(ref["source_code_id"], "merged-456")
        self.assertEqual(ref["excerpts"], ["First excerpt", "Second excerpt", "Third excerpt"])

    def test_snapshot_counts_union_legacy_excerpt_fields(self):
        snapshot = {
            "analysisReady": True,
            "codes": [{
                "title": "Merged code",
                "reviewStatus": "accepted",
                "quote": "First excerpt",
                "excerpts": ["First excerpt"],
                "quotes": ["First excerpt", "Second excerpt", "Third excerpt"],
            }],
        }

        self.assertEqual(server.reflexcoti_snapshot_counts(snapshot), (1, 3))

    def test_final_codebook_codes_union_legacy_excerpt_fields(self):
        result = server.final_codebook_codes({
            "codes": [{
                "id": "merged-1",
                "title": "Merged code",
                "reviewStatus": "accepted",
                "quote": "First excerpt",
                "excerpts": ["First excerpt"],
                "quotes": ["First excerpt", "Second excerpt", "Third excerpt"],
            }],
        })

        self.assertEqual(result[0]["excerpts"], ["First excerpt", "Second excerpt", "Third excerpt"])

    def test_normalizes_source_references_with_edited_codebook(self):
        result = server.normalize_edited_codebook({
            "entries": [{
                "initial code": "Trust",
                "clues": ["Included evidence"],
                "transcript_ids": ["transcript-123"],
                "source_refs": [{
                    "transcript_id": "transcript-123",
                    "transcript_label": "Interview_0001.docx",
                    "source_code_id": "code-456",
                    "source_code_name": "Caregiver trust",
                    "excerpts": ["Included evidence", "Evidence removed by a split"],
                }],
            }],
        })

        ref = result["entries"][0]["source_refs"][0]
        self.assertEqual(ref["transcript_id"], "transcript-123")
        self.assertEqual(ref["excerpts"], ["Included evidence"])

    def test_theme_generation_prefers_saved_ai_human_codebook(self):
        original = {
            "entries": [{"initial code": "Original AI", "clues": ["A"], "transcript_ids": ["T1", "T2"]}],
        }
        reviewed = {
            "entries": [{"initial code": "Reviewed", "clues": ["B"], "transcript_ids": ["T1", "T2"]}],
        }
        with tempfile.TemporaryDirectory() as directory:
            run_dir = Path(directory)
            (run_dir / "codebook.json").write_text(json.dumps(original), encoding="utf-8")
            server.save_reviewed_codebook(run_dir, reviewed)

            _, result = server.load_codebook_for_themes(run_dir, "keep-all")
            saved_ai = json.loads((run_dir / "ai_codebook.json").read_text(encoding="utf-8"))
            saved_reviewed = json.loads((run_dir / "ai_human_codebook.json").read_text(encoding="utf-8"))

            self.assertEqual([entry["initial code"] for entry in result["entries"]], ["Reviewed"])
            self.assertEqual(saved_ai["entries"][0]["initial code"], "Original AI")
            self.assertEqual(saved_ai["codebook_type"], "AI")
            self.assertEqual(saved_reviewed["codebook_type"], "AI+Human")


    def test_coder_runner_uses_project_specific_profile(self):
        server.import_workflow_modules()
        coder_module = importlib.import_module("coder_agent")
        completion_calls = []

        def completion(messages):
            completion_calls.append(messages)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="[]"))]
            )

        with tempfile.TemporaryDirectory() as directory, \
                patch.object(coder_module, "read_docx", return_value="Transcript text"), \
                patch.object(coder_module.time, "sleep"):
            coder_module.run_independent_coding(
                transcript_file="unused.docx",
                agent_name="social_worker",
                reflection={"assumptions": "A working assumption."},
                transcript_id="T1",
                chunk_id="1",
                round_number=1,
                research_question="How does trust shape care?",
                interviewee="caregivers",
                fixed_profile="PROJECT-SPECIFIC CODER PROFILE",
                completion_fn=completion,
                output_base_dir=directory,
            )

        self.assertEqual(len(completion_calls), 1)
        self.assertIn("PROJECT-SPECIFIC CODER PROFILE", completion_calls[0][0]["content"])

    def test_theme_agent_runner_uses_request_scoped_completion(self):
        server.import_workflow_modules()
        theme_module = importlib.import_module("themer_agents_once")
        clusters = {
            "clusters": [{
                "cluster_id": 1,
                "n_items": 1,
                "items": [{
                    "code_id": "C1000",
                    "initial code": "Trust in caregivers",
                    "clues": ["Trust grew over time."],
                    "transcript_ids": ["T1"],
                }],
            }],
        }
        completion_calls = []

        def completion(messages):
            completion_calls.append(messages)
            content = json.dumps({
                "candidate_themes": [{
                    "theme_name": "Trust enables care",
                    "definition": "Trust supports caregiving collaboration.",
                    "related_initial_codes": ["C1000"],
                    "representative_quotes": ["Trust grew over time."],
                }],
            })
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

        with tempfile.TemporaryDirectory() as directory:
            cluster_path = Path(directory) / "clustered_codes_with_ids.json"
            cluster_path.write_text(json.dumps(clusters), encoding="utf-8")
            with patch.object(theme_module.time, "sleep"):
                result = theme_module.run_theme_agents_single_round(
                    final_clusters_path=str(cluster_path),
                    output_dir=str(Path(directory) / "agents"),
                    research_question="How does trust shape care?",
                    agents=["social_worker"],
                    verbose=False,
                    completion_fn=completion,
                    agent_personas={"social_worker": "PROJECT-SPECIFIC SOCIAL WORKER PROFILE"},
                )

        self.assertEqual(len(completion_calls), 1)
        self.assertIn("PROJECT-SPECIFIC SOCIAL WORKER PROFILE", completion_calls[0][0]["content"])
        final_theme = result["social_worker"]["final_results"][0]["codebook"]["candidate_themes"][0]
        self.assertEqual(final_theme["related_initial_codes"], ["C1000"])

    def test_converts_consensus_themes_for_website_review(self):
        consensus = {
            "clusters": [{
                "final_themes": [{
                    "theme_name": "Trust enables shared care",
                    "definition": "Trust makes collaborative caregiving possible.",
                    "code_ids": ["C1000", "C1001"],
                    "source_agent": "social_worker",
                }],
            }],
        }
        lookup = {
            "C1000": {
                "codeName": "Trust in caregivers",
                "quotes": ["Trust grew over time."],
                "transcriptIds": ["T1"],
            },
            "C1001": {
                "codeName": "Shared decisions",
                "quotes": ["We decided together."],
                "transcriptIds": ["T2"],
            },
        }

        result = server.public_themes_from_consensus_output(consensus, lookup)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "Trust enables shared care")
        self.assertEqual(result[0]["rationale"], "Trust makes collaborative caregiving possible.")
        self.assertEqual([code["codeId"] for code in result[0]["codes"]], ["C1000", "C1001"])
        self.assertEqual(result[0]["codes"][0]["quote"], "Trust grew over time.")
        self.assertEqual(result[0]["source"], "AI")
        self.assertEqual(result[0]["sourceAgent"], "social_worker")
        self.assertEqual(result[0]["sourceAgentLabel"], "Social worker")

    def test_backfills_agent_provenance_for_existing_theme_snapshot(self):
        snapshot = {
            "latestCodebookId": "saved-codebook",
            "themes": [{"title": "Trust enables shared care", "source": "AI"}],
            "originalAiThemes": [{"title": "Trust enables shared care", "source": "AI"}],
        }
        consensus = {"clusters": [{"final_themes": [{
            "theme_name": "Trust enables shared care",
            "source_agent": "social_worker",
        }]}]}
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "THEME_CODEBOOK_DIR", Path(directory)):
            path = Path(directory) / "saved-codebook" / "theme_generation" / "consensus"
            path.mkdir(parents=True)
            (path / "final_theme_consensus.json").write_text(json.dumps(consensus), encoding="utf-8")
            result = server.enrich_theme_agent_provenance(snapshot)

        self.assertEqual(result["themes"][0]["sourceAgentLabel"], "Social worker")
        self.assertEqual(result["originalAiThemes"][0]["sourceAgent"], "social_worker")

    def test_consensus_adapter_assigns_each_code_only_once(self):
        consensus = {
            "clusters": [{
                "final_themes": [
                    {"theme_name": "First", "definition": "First definition", "code_ids": ["C1000"]},
                    {"theme_name": "Second", "definition": "Second definition", "code_ids": ["C1000", "C1001"]},
                ],
            }],
        }
        lookup = {
            "C1000": {"codeName": "One", "quotes": ["A"], "transcriptIds": ["T1"]},
            "C1001": {"codeName": "Two", "quotes": ["B"], "transcriptIds": ["T2"]},
        }

        result = server.public_themes_from_consensus_output(consensus, lookup)

        self.assertEqual([[code["codeId"] for code in theme["codes"]] for theme in result], [["C1000"], ["C1001"]])

    def test_codebook_finish_saves_readable_project_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            projects_dir = root / "projects"
            codebooks_dir = root / "theme_codebooks"
            run_dir = codebooks_dir / "codebook-1"
            run_dir.mkdir(parents=True)
            (run_dir / "owner.json").write_text(json.dumps({"owner_id": 7}), encoding="utf-8")
            (run_dir / "ai_codebook.json").write_text(
                json.dumps({"codebook_type": "AI", "entries": [{"initial code": "Original"}]}),
                encoding="utf-8",
            )
            (run_dir / "ai_human_codebook.json").write_text(
                json.dumps({"codebook_type": "AI+Human", "entries": [{"initial code": "Reviewed"}]}),
                encoding="utf-8",
            )
            user = {"user_id": 7, "username": "AdaXu1130"}
            project = {"id": "project-1", "name": "AD Strategy"}
            with patch.object(server, "DATA_DIR", root), \
                    patch.object(server, "PROJECTS_DIR", projects_dir), \
                    patch.object(server, "THEME_CODEBOOK_DIR", codebooks_dir):
                result = server.save_project_finished_results(user, project, {
                    "phase": "codebook", "revision": 2, "codebook_id": "codebook-1", "files": [],
                })

            finished = projects_dir / "AdaXu1130" / "AD_Strategy" / "finished"
            self.assertEqual(set(result["files"]), {
                "ReflexCoTI_codebook_AI_original.json",
                "ReflexCoTI_codebook_AI_Human.json",
            })
            reviewed = json.loads((finished / "ReflexCoTI_codebook_AI_Human.json").read_text(encoding="utf-8"))
            self.assertEqual(reviewed["account"]["username"], "AdaXu1130")
            self.assertEqual(reviewed["project"]["name"], "AD Strategy")
            self.assertEqual(reviewed["codebook_revision"], 2)

    def test_theme_finish_saves_and_replaces_all_project_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            projects_dir = root / "projects"
            codebooks_dir = root / "theme_codebooks"
            run_dir = codebooks_dir / "codebook-1"
            run_dir.mkdir(parents=True)
            (run_dir / "owner.json").write_text(json.dumps({"owner_id": 7}), encoding="utf-8")
            (run_dir / "ai_codebook.json").write_text(json.dumps({"entries": []}), encoding="utf-8")
            (run_dir / "ai_human_codebook.json").write_text(json.dumps({"entries": []}), encoding="utf-8")
            user = {"user_id": 7, "username": "AdaXu1130"}
            project = {"id": "project-1", "name": "AD Strategy"}

            def payload(title, revision):
                return {
                    "phase": "themes",
                    "revision": revision,
                    "codebook_id": "codebook-1",
                    "files": [
                        {"filename": "ReflexCoTI_themes.json", "content": json.dumps({"themes": [{"title": title}]})},
                        {"filename": "ReflexCoTI_themes_AI_original.json", "content": json.dumps({"themes": []})},
                        {"filename": "ReflexCoTI_themes_Human_version.json", "content": json.dumps({"themes": []})},
                        {"filename": "ReflexCoTI_themes_questionnaire.csv", "content": "question,score\nOne,5"},
                    ],
                }

            with patch.object(server, "DATA_DIR", root), \
                    patch.object(server, "PROJECTS_DIR", projects_dir), \
                    patch.object(server, "THEME_CODEBOOK_DIR", codebooks_dir):
                server.save_project_finished_results(user, project, payload("First", 1))
                result = server.save_project_finished_results(user, project, payload("Updated", 2))

            finished = projects_dir / "AdaXu1130" / "AD_Strategy" / "finished"
            self.assertEqual(len(result["files"]), 6)
            saved = json.loads((finished / "ReflexCoTI_themes.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["themes"][0]["title"], "Updated")
            self.assertEqual(saved["account"]["username"], "AdaXu1130")
            self.assertEqual((finished / "ReflexCoTI_themes_questionnaire.csv").read_text(encoding="utf-8"), "question,score\nOne,5")

    def test_human_theme_finish_saves_human_theme_and_codebooks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            projects_dir = root / "projects"
            codebooks_dir = root / "theme_codebooks"
            run_dir = codebooks_dir / "codebook-1"
            run_dir.mkdir(parents=True)
            (run_dir / "owner.json").write_text(json.dumps({"owner_id": 7}), encoding="utf-8")
            (run_dir / "ai_codebook.json").write_text(json.dumps({"entries": []}), encoding="utf-8")
            (run_dir / "ai_human_codebook.json").write_text(json.dumps({"entries": []}), encoding="utf-8")
            user = {"user_id": 7, "username": "AdaXu1130"}
            project = {"id": "project-1", "name": "AD Strategy"}
            with patch.object(server, "DATA_DIR", root), \
                    patch.object(server, "PROJECTS_DIR", projects_dir), \
                    patch.object(server, "THEME_CODEBOOK_DIR", codebooks_dir):
                result = server.save_project_finished_results(user, project, {
                    "phase": "human_themes",
                    "revision": 1,
                    "codebook_id": "codebook-1",
                    "files": [{
                        "filename": "ReflexCoTI_themes_Human_version.json",
                        "content": json.dumps({"themes": [{"title": "Human insight"}]}),
                    }],
                })

            finished = projects_dir / "AdaXu1130" / "AD_Strategy" / "finished"
            self.assertEqual(len(result["files"]), 3)
            self.assertTrue((finished / "ReflexCoTI_themes_Human_version.json").is_file())
            self.assertTrue((finished / "ReflexCoTI_codebook_AI_original.json").is_file())
            self.assertTrue((finished / "ReflexCoTI_codebook_AI_Human.json").is_file())


    def test_incrementally_updates_project_codebook_and_tracks_net_growth(self):
        calls = []

        def entries_from_file(source_path):
            payload = json.loads(Path(source_path).read_text(encoding="utf-8"))
            transcript_id = payload["transcript"]["id"]
            return [{
                "initial code": code["code name"],
                "clues": code["excerpts"],
                "transcript_ids": [transcript_id],
                "embedding": [1.0, 0.0],
            } for code in payload["codes"]]

        def fake_codebook_creation(coding_result_files, codebook_path, **kwargs):
            calls.append(("create", [
                json.loads(Path(path).read_text(encoding="utf-8"))["transcript"]["id"]
                for path in coding_result_files
            ]))
            codebook = {"retrieval_mode": "code_clue", "entries": entries_from_file(coding_result_files[0])}
            Path(codebook_path).write_text(json.dumps(codebook), encoding="utf-8")
            return codebook

        def fake_incremental_update(json_path, codebook_path, **kwargs):
            transcript_id = json.loads(Path(json_path).read_text(encoding="utf-8"))["transcript"]["id"]
            calls.append(("update", transcript_id))
            codebook = json.loads(Path(codebook_path).read_text(encoding="utf-8"))
            codebook["entries"].extend(entries_from_file(json_path))
            Path(codebook_path).write_text(json.dumps(codebook), encoding="utf-8")
            return {"codebook": codebook}

        fake_module = SimpleNamespace(
            codebook_creation=fake_codebook_creation,
            update_codebook_from_code_quote_file=fake_incremental_update,
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.multiple(
                server,
                DATA_DIR=root,
                UPLOAD_DIR=root / "uploads",
                RUNS_DIR=root / "runs",
                THEME_CODEBOOK_DIR=root / "theme_codebooks",
                PROJECTS_DIR=root / "projects",
                DATABASE_PATH=root / "reflexcoti.sqlite3",
            ), patch.object(server, "make_completion", return_value=object()), \
                    patch.object(server, "import_workflow_modules"), \
                    patch.object(server.importlib, "import_module", return_value=fake_module):
                server.ensure_dirs()
                with server.database() as connection:
                    user_id = connection.execute(
                        "INSERT INTO users(username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                        ("student", b"salt", b"hash", "student", 1.0),
                    ).lastrowid
                    connection.execute(
                        """INSERT INTO projects(id, owner_id, name, research_question, interviewee, initial_reflections, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        ("project", user_id, "Study", "Question", "Participants", "{}", 1.0, 1.0),
                    )
                    for index, code_name in enumerate(("Trust", "Coordination"), start=1):
                        transcript_id = f"t{index}"
                        connection.execute(
                            """INSERT INTO transcripts(id, project_id, name, stored_name, size, created_at, updated_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (transcript_id, "project", f"Interview_{index}.docx", "source.docx", 1, float(index), float(index)),
                        )
                        snapshot = {
                            "codeReviewStage": "complete",
                            "codingRevision": 1,
                            "lastFinishedCodingRevision": 1,
                            "codes": [{
                                "id": f"c{index}", "title": code_name,
                                "reviewStatus": "accepted", "excerpts": [f"Excerpt {index}"],
                            }],
                        }
                        connection.execute(
                            "INSERT INTO transcript_analysis(transcript_id, snapshot, updated_at) VALUES (?, ?, ?)",
                            (transcript_id, json.dumps(snapshot), float(index)),
                        )
                user = {"user_id": user_id, "username": "student"}
                project = server.project_row_for_user("project", user_id)
                settings = {"azure_endpoint": "endpoint", "api_key": "key", "api_version": "version", "model": "model"}
                first = server.update_project_codebook(user, project, "t1", settings)
                first_codebook_id = first["codebook_id"]
                self.assertEqual(first["current_size"], 1)
                self.assertEqual(first["net_growth"], 1)
                self.assertEqual(first["new_code_names"], ["Trust"])
                self.assertEqual(first["update_history"][0]["transcript_name"], "Interview_1.docx")
                self.assertEqual(first["update_history"][0]["total_codes"], 1)

                second = server.update_project_codebook(user, project, "t2", settings)
                self.assertEqual(second["codebook_id"], first_codebook_id)
                self.assertEqual(second["current_size"], 2)
                self.assertEqual(second["previous_size"], 1)
                self.assertEqual(second["net_growth"], 1)
                self.assertEqual(second["included_revisions"], {"t1": 1, "t2": 1})
                self.assertEqual(second["new_code_names"], ["Coordination"])
                self.assertEqual(
                    [(item["transcript_id"], item["total_codes"], item["net_growth"]) for item in second["update_history"]],
                    [("t1", 1, 1), ("t2", 2, 1)],
                )
                self.assertEqual(calls, [("create", ["t1"]), ("update", "t2")])

                repeated = server.update_project_codebook(user, project, "t2", settings)
                self.assertEqual(repeated["net_growth"], 1)
                self.assertEqual(len(repeated["update_history"]), 2)
                self.assertEqual(calls, [("create", ["t1"]), ("update", "t2")])



class RealCodebookModuleTests(unittest.TestCase):
    def test_codebook_import_unions_all_legacy_excerpt_fields(self):
        server.import_workflow_modules()
        module = importlib.import_module("codebook_creation")
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "coding.json"
            source_path.write_text(json.dumps({
                "transcript": {"id": "t1", "file_name": "Interview_1.docx"},
                "codes": [{
                    "code name": "Merged code",
                    "quote": "\"First excerpt\"",
                    "excerpts": ["First excerpt"],
                    "quotes": ["First excerpt", "Second excerpt", "Third excerpt"],
                }],
            }), encoding="utf-8")

            transcript_id, code_to_clues = module.load_code_quote_result(str(source_path))

        self.assertEqual(transcript_id, "t1")
        self.assertEqual(
            code_to_clues["Merged code"],
            ["First excerpt", "Second excerpt", "Third excerpt"],
        )

    def test_compaction_ignores_empty_embeddings_and_saves_clean_codebook(self):
        server.import_workflow_modules()
        workflow = importlib.import_module("RTA_workflow")

        class FakeModel:
            def encode(self, texts, normalize_embeddings=True):
                return [[1.0, 0.0] for _ in texts]

        with tempfile.TemporaryDirectory() as directory:
            codebook_path = Path(directory) / "codebook.json"
            codebook_path.write_text(json.dumps({
                "retrieval_mode": "code_clue",
                "entries": [
                    {
                        "initial code": "Trust",
                        "embedding": [1.0, 0.0],
                        "transcript_ids": ["t1", "t1"],
                        "clues": ["Excerpt", "Excerpt"],
                    },
                    {
                        "initial code": "Invalid",
                        "embedding": [],
                        "transcript_ids": ["t2"],
                        "clues": ["Other excerpt"],
                    },
                ],
            }), encoding="utf-8")

            compacted = workflow.codebook_compact(
                str(codebook_path), FakeModel(), threshold=0.80
            )
            saved = json.loads(codebook_path.read_text(encoding="utf-8"))

            self.assertEqual(compacted, saved)
            self.assertEqual(len(saved["entries"]), 1)
            self.assertEqual(saved["entries"][0]["initial code"], "Trust")
            self.assertEqual(saved["entries"][0]["transcript_ids"], ["t1"])
            self.assertEqual(saved["entries"][0]["clues"], ["Excerpt"])

    def test_website_json_creates_and_updates_codebook(self):
        server.import_workflow_modules()
        module = importlib.import_module("codebook_creation")

        class FakeModel:
            def encode(self, texts, normalize_embeddings=True):
                return [
                    [0.0, 1.0] if "Coordination" in text else [1.0, 0.0]
                    for text in texts
                ]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first_path = root / "first.json"
            second_path = root / "second.json"
            third_path = root / "third.json"
            codebook_path = root / "codebook.json"
            review_dir = root / "reviews"
            first_path.write_text(json.dumps({
                "transcript": {"id": "t1", "file_name": "Interview_1.docx"},
                "codes": [{"code name": "Trust", "excerpts": ["First excerpt"]}],
            }), encoding="utf-8")
            second_path.write_text(json.dumps({
                "transcript": {"id": "t2", "file_name": "Interview_2.docx"},
                "codes": [{"code name": "Trust", "excerpts": ["Second excerpt"]}],
            }), encoding="utf-8")
            third_path.write_text(json.dumps({
                "transcript": {"id": "t3", "file_name": "Interview_3.docx"},
                "codes": [{"code name": "Coordination", "excerpts": ["Third excerpt"]}],
            }), encoding="utf-8")

            with patch.object(module, "SentenceTransformer", return_value=FakeModel()):
                created = module.codebook_creation(
                    [str(first_path)], str(codebook_path), str(review_dir),
                    completion_fn=lambda messages: None,
                )
                updated = module.update_codebook_from_code_quote_file(
                    str(second_path), str(codebook_path), str(review_dir),
                    completion_fn=lambda messages: None,
                )
                reviewed = module.update_codebook_from_code_quote_file(
                    str(third_path), str(codebook_path), str(review_dir),
                    completion_fn=lambda messages: SimpleNamespace(
                        choices=[SimpleNamespace(message=SimpleNamespace(
                            content="Final Code: Coordination\nStatus: NEW"
                        ))]
                    ),
                )

            self.assertEqual(len(created["entries"]), 1)
            entry = updated["codebook"]["entries"][0]
            self.assertEqual(set(entry["transcript_ids"]), {"t1", "t2"})
            self.assertEqual(set(entry["clues"]), {"First excerpt", "Second excerpt"})
            self.assertEqual(len(reviewed["codebook"]["entries"]), 2)


if __name__ == "__main__":
    unittest.main()
