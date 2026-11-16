import copy
import importlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

import server


server.import_workflow_modules()
RTA_workflow = importlib.import_module("RTA_workflow")


class FakeEmbeddingModel:
    def encode(self, texts, normalize_embeddings=True):
        vectors = []
        for text in texts:
            if "Autonomy" in text or "Final decision" in text:
                vectors.append([1.0, 0.0])
            else:
                vectors.append([0.0, 1.0])
        return np.asarray(vectors, dtype=np.float32)


class CodeMergeSuggestionTests(unittest.TestCase):
    def test_suggest_code_merges_returns_groups_without_mutating_entries(self):
        entries = [
            {
                "id": "a",
                "initial code": "Maintaining autonomy",
                "clues": ["I decide whether to use the recommendation."],
                "transcript_ids": ["t1"],
                "embedding": [1.0, 0.0],
            },
            {
                "id": "b",
                "initial code": "Human keeps final control",
                "clues": ["The final decision remains mine."],
                "transcript_ids": ["t1"],
                "embedding": [0.9, 0.1],
            },
            {
                "id": "c",
                "initial code": "Time pressure",
                "clues": ["There was not enough time."],
                "transcript_ids": ["t1"],
                "embedding": [0.0, 1.0],
            },
        ]
        original = copy.deepcopy(entries)

        suggestions = RTA_workflow.suggest_code_merges(entries, model=None, threshold=0.8)

        self.assertEqual(entries, original)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]["member_ids"], ["a", "b"])
        self.assertGreaterEqual(suggestions[0]["similarity_min"], 0.8)
        self.assertEqual(suggestions[0]["suggested_name"], "Maintaining autonomy")

    def test_exact_name_match_is_suggested_below_similarity_threshold(self):
        entries = [
            {"id": "a", "initial code": "Trust", "clues": ["One"], "transcript_ids": ["t1"], "embedding": [1.0, 0.0]},
            {"id": "b", "initial code": "trust", "clues": ["Two"], "transcript_ids": ["t2"], "embedding": [0.0, 1.0]},
        ]

        suggestions = RTA_workflow.suggest_code_merges(entries, model=None, threshold=0.8)

        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]["match_types"], ["same_name"])
        self.assertEqual(suggestions[0]["member_ids"], ["a", "b"])

    def test_server_wrapper_returns_public_suggestion_metadata(self):
        items = [
            {"id": "a", "title": "Maintaining Autonomy", "excerpts": ["I remain in control."]},
            {"id": "b", "title": "Final decision", "excerpts": ["The decision is mine."]},
            {"id": "c", "title": "Time pressure", "excerpts": ["We had little time."]},
        ]

        with patch.object(server, "get_paragraph_chunk_module", return_value=object()), \
             patch.object(server, "get_chunking_model", return_value=FakeEmbeddingModel()):
            suggestions, method = server.semantic_code_merge_suggestions(items, threshold=0.8)

        self.assertEqual(method, "semantic-compact")
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]["member_ids"], ["a", "b"])
        self.assertNotIn("merged_entry", suggestions[0])

    def test_codebook_compact_reuses_suggestion_grouping(self):
        payload = {
            "retrieval_mode": "code_clue",
            "entries": [
                {"id": "a", "initial code": "Maintaining Autonomy", "clues": ["One"], "transcript_ids": ["t1"], "embedding": [1.0, 0.0]},
                {"id": "b", "initial code": "Final decision", "clues": ["Two"], "transcript_ids": ["t1"], "embedding": [0.9, 0.1]},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "codebook.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            compacted = RTA_workflow.codebook_compact(str(path), FakeEmbeddingModel(), threshold=0.8)

            self.assertEqual(len(compacted["entries"]), 1)
            self.assertEqual(compacted["entries"][0]["clues"], ["One", "Two"])
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), compacted)


if __name__ == "__main__":
    unittest.main()
