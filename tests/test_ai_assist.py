import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import server
from workflow_modules import AzureUtils


class FakeCompletion:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.call_count = 0
        self.messages = []

    def __call__(self, messages, **kwargs):
        self.call_count += 1
        self.messages.append(messages)
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        content = response if isinstance(response, str) else json.dumps(response)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


def code_payload(action="revise"):
    return {
        "action": action,
        "entity_type": "code",
        "instruction": "Excerpt 3 is part of excerpt 1.",
        "azure_endpoint": "https://example.invalid",
        "api_key": "test",
        "api_version": "test",
        "model": "test",
        "research_question": "How do caregivers experience coordination?",
        "items": [{
            "title": "Example code",
            "excerpts": ["First excerpt", "Unaffected second excerpt", "Third excerpt"],
            "reference_contexts": ["Longer surrounding transcript passage"],
        }],
    }


def understanding(status="understood"):
    return {
        "status": status,
        "interpreted_request": "Remove excerpt 3 because it is already contained in excerpt 1.",
        "changes": ["Remove the redundant third excerpt."],
        "preserve": ["Keep excerpt 1, excerpt 2, and the code name unchanged."],
        "clarification_question": "",
    }


class AskAiTwoStageTests(unittest.TestCase):
    def run_with(self, responses, payload=None):
        completion = FakeCompletion(responses)
        with patch.object(server, "make_completion", return_value=completion):
            result = server.ai_edit_proposal(payload or code_payload())
        return result, completion

    def test_understanding_then_performing_uses_exactly_two_calls(self):
        performed = {
            "status": "completed",
            "revised_result": {
                "code_name": "Example code",
                "excerpts": ["First excerpt", "Unaffected second excerpt"],
            },
            "applied_changes": ["Removed redundant excerpt 3."],
            "preserved_content": ["Kept excerpt 1, excerpt 2, and the code name."],
            "completion_note": "The requested revision was completed.",
        }
        result, completion = self.run_with([understanding(), performed])

        self.assertEqual(completion.call_count, 2)
        self.assertEqual(result["excerpts"], ["First excerpt", "Unaffected second excerpt"])
        self.assertEqual(result["changed_fields"], ["excerpts"])
        self.assertEqual(result["instruction_interpretation"], understanding()["interpreted_request"])
        self.assertIn("Removed redundant excerpt 3", result["performance_summary"])

        first_user = json.loads(completion.messages[0][1]["content"])
        self.assertEqual(first_user["user_instruction"], code_payload()["instruction"])
        self.assertEqual(first_user["items"][0]["code_name"], "Example code")
        self.assertNotIn("title", first_user["items"][0])
        self.assertNotIn("reference_contexts", first_user["items"][0])
        second_user = json.loads(completion.messages[1][1]["content"])
        self.assertEqual(second_user["understanding"]["interpreted_request"],
                         understanding()["interpreted_request"])
        self.assertEqual(second_user["request"]["items"][0]["code_name"], "Example code")
        self.assertNotIn("title", second_user["request"]["items"][0])
        self.assertNotIn("reference_contexts", second_user["request"]["items"][0])

    def test_blurry_instruction_is_not_rejected_by_wording(self):
        payload = code_payload()
        payload["instruction"] = "3 is already in 1"
        performed = {
            "status": "completed",
            "revised_result": {
                "code_name": "Example code",
                "excerpts": ["First excerpt", "Unaffected second excerpt"],
            },
            "applied_changes": ["Removed the redundant third excerpt."],
            "preserved_content": [],
            "completion_note": "",
        }
        result, completion = self.run_with([understanding(), performed], payload)

        self.assertEqual(completion.call_count, 2)
        self.assertFalse(result.get("proposal_failed", False))
        self.assertEqual(result["excerpts"], ["First excerpt", "Unaffected second excerpt"])

    def test_delegated_creative_choice_proceeds_without_clarification(self):
        payload = code_payload()
        payload["instruction"] = "Change the code name; it should be related to emotion."
        understood = {
            "status": "understood",
            "interpreted_request": "Rename the code to reflect the emotion expressed by the evidence.",
            "changes": ["Change the code name."],
            "preserve": ["Keep all excerpts unchanged."],
            "assumptions": ["Choose the best-fitting emotion from the supplied evidence."],
            "clarification_question": "",
        }
        performed = {
            "status": "completed",
            "revised_result": {
                "code_name": "Emotional Frustration",
                "excerpts": ["First excerpt", "Unaffected second excerpt", "Third excerpt"],
            },
            "applied_changes": ["Renamed the code based on its emotional content."],
            "preserved_content": ["All excerpts."],
            "completion_note": "",
        }
        result, completion = self.run_with([understood, performed], payload)

        self.assertEqual(completion.call_count, 2)
        self.assertFalse(result.get("needs_clarification", False))
        self.assertEqual(result["code_name"], "Emotional Frustration")
        self.assertEqual(result["changed_fields"], ["code_name"])
        self.assertIn("delegated creative choices", completion.messages[0][0]["content"])
        self.assertIn("without performing the edit", completion.messages[0][0]["content"])

    def test_genuine_ambiguity_stops_after_understanding_and_asks_user(self):
        unclear = {
            **understanding("needs_clarification"),
            "interpreted_request": "",
            "clarification_question": "Should excerpt 3 be removed, or should excerpts 1 and 3 be combined?",
        }
        result, completion = self.run_with([unclear])

        self.assertEqual(completion.call_count, 1)
        self.assertTrue(result["needs_clarification"])
        self.assertIn("removed", result["clarification_question"])

    def test_optional_preference_question_does_not_block_an_actionable_revision(self):
        payload = code_payload()
        payload["instruction"] = "Change the code name; it should be related to emotion."
        overly_cautious = {
            "status": "needs_clarification",
            "interpreted_request": (
                "Rename the code with an emotion-related name that reflects its excerpts."
            ),
            "changes": ["Change the code name."],
            "preserve": ["Keep all excerpts unchanged."],
            "assumptions": ["Choose the most fitting emotion from the supplied context."],
            "clarification_question": (
                "What specific type of emotion should the new code name reflect?"
            ),
        }
        performed = {
            "status": "completed",
            "revised_result": {
                "code_name": "Emotional Strain",
                "excerpts": ["First excerpt", "Unaffected second excerpt", "Third excerpt"],
            },
            "applied_changes": ["Renamed the code to reflect emotional strain."],
            "preserved_content": ["All excerpts."],
            "completion_note": "",
        }
        result, completion = self.run_with([overly_cautious, performed], payload)

        self.assertEqual(completion.call_count, 2)
        self.assertFalse(result.get("needs_clarification", False))
        self.assertEqual(result["code_name"], "Emotional Strain")
        self.assertEqual(result["changed_fields"], ["code_name"])

    def test_understanding_provider_error_tells_user_what_to_do(self):
        completion = FakeCompletion([RuntimeError("provider unavailable")])
        with patch.object(server, "make_completion", return_value=completion):
            with self.assertRaisesRegex(ValueError, "Check your Azure OpenAI settings"):
                server.ai_edit_proposal(code_payload())
        self.assertEqual(completion.call_count, 1)

    def test_performing_provider_error_identifies_the_stage_and_next_steps(self):
        completion = FakeCompletion([understanding(), RuntimeError("provider unavailable")])
        with patch.object(server, "make_completion", return_value=completion):
            with self.assertRaisesRegex(
                    ValueError, "understood the instruction but could not create the proposal"):
                server.ai_edit_proposal(code_payload())
        self.assertEqual(completion.call_count, 2)

    def test_performing_unable_returns_reason_and_recovery_action(self):
        unable = {
            "status": "unable",
            "revised_result": None,
            "applied_changes": [],
            "preserved_content": [],
            "completion_note": "The requested result depends on transcript context that was not supplied.",
        }
        result, completion = self.run_with([understanding(), unable])

        self.assertEqual(completion.call_count, 2)
        self.assertTrue(result["proposal_failed"])
        self.assertIn("not supplied", result["failure_message"])
        self.assertIn("Try again with more context", result["failure_message"])
        self.assertEqual(result["instruction_interpretation"], understanding()["interpreted_request"])

    def test_completed_response_without_result_has_actionable_error(self):
        malformed = {
            "status": "completed",
            "revised_result": None,
            "applied_changes": [],
            "preserved_content": [],
            "completion_note": "",
        }
        with self.assertRaisesRegex(ValueError, "did not return a usable proposal"):
            self.run_with([understanding(), malformed])

    def test_theme_revision_preserves_the_unchanged_title(self):
        payload = {
            **code_payload(),
            "entity_type": "theme",
            "instruction": "Make the rationale clearer.",
            "items": [{
                "title": "Care coordination",
                "rationale": "Old rationale",
                "codes": [{
                    "title": "Example code",
                    "excerpts": ["Evidence"],
                    "transcript_ids": ["transcript-1"],
                    "reference_contexts": [{"context_lines": [{"line": 1, "text": "Hidden context"}]}],
                }],
            }],
        }
        understood = {
            "status": "understood",
            "interpreted_request": "Clarify the theme rationale.",
            "changes": ["Revise the rationale."],
            "preserve": ["Keep the theme name and supporting codes unchanged."],
            "assumptions": [],
            "clarification_question": "",
        }
        performed = {
            "status": "completed",
            "revised_result": {
                "theme_name": "Care coordination",
                "description": "A clearer analytic rationale.",
            },
            "applied_changes": ["Clarified the rationale."],
            "preserved_content": ["Theme name and supporting codes."],
            "completion_note": "",
        }
        result, completion = self.run_with([understood, performed], payload)

        self.assertEqual(completion.call_count, 2)
        self.assertEqual(result["theme_name"], "Care coordination")
        self.assertEqual(result["changed_fields"], ["description"])
        first_user = json.loads(completion.messages[0][1]["content"])
        theme_item = first_user["items"][0]
        self.assertEqual(theme_item["theme_name"], "Care coordination")
        self.assertEqual(theme_item["description"], "Old rationale")
        self.assertNotIn("title", theme_item)
        self.assertNotIn("rationale", theme_item)
        self.assertEqual(set(theme_item["codes"][0]), {"code_id", "code_name"})
        self.assertNotIn("excerpts", theme_item["codes"][0])
        self.assertNotIn("excerpt_ids", theme_item["codes"][0])
        second_user = json.loads(completion.messages[1][1]["content"])
        performing_theme = second_user["request"]["items"][0]
        self.assertEqual(performing_theme["theme_name"], "Care coordination")
        self.assertEqual(performing_theme["description"], "Old rationale")
        self.assertEqual(set(performing_theme["codes"][0]), {"code_id", "code_name"})
        self.assertNotIn("excerpts", performing_theme["codes"][0])
        self.assertNotIn("excerpt_ids", performing_theme["codes"][0])
        self.assertNotIn("transcript_ids", performing_theme["codes"][0])
        self.assertNotIn("reference_contexts", performing_theme["codes"][0])

    def test_split_returns_the_performing_calls_complete_parts(self):
        payload = code_payload("split")
        payload["instruction"] = "These excerpts show two different ideas."
        understood = {
            "status": "understood",
            "interpreted_request": "Split the code into two concepts.",
            "changes": ["Create two codes and allocate the excerpts."],
            "preserve": ["Keep the evidence text unchanged."],
            "assumptions": [],
            "clarification_question": "",
        }
        performed = {
            "status": "completed",
            "revised_result": {"parts": [
                {"code_name": "First concept", "excerpt_indexes": [0, 2]},
                {"code_name": "Second concept", "excerpt_indexes": [1]},
            ]},
            "applied_changes": ["Created two code proposals."],
            "preserved_content": ["All excerpts."],
            "completion_note": "",
        }
        result, completion = self.run_with([understood, performed], payload)

        self.assertEqual(completion.call_count, 2)
        self.assertEqual(len(result["parts"]), 2)
        self.assertEqual(result["parts"][0]["excerpt_indexes"], [0, 2])

    def test_split_refinement_reuses_understanding_and_marks_rejected_proposal(self):
        payload = code_payload("split")
        payload["instruction"] = ""
        payload["rejected_proposal"] = {
            "parts": [
                {"code_name": "Rejected first concept", "excerpt_indexes": [0, 2]},
                {"code_name": "Rejected second concept", "excerpt_indexes": [1]},
            ],
        }
        payload["prior_ai_context"] = {
            "original_user_instruction": "Split this code into two ideas.",
            "ai_understanding": {
                "interpreted_request": "Split the evidence into two distinct concepts.",
                "changes": ["Create two replacement codes."],
                "preserve": ["Keep all evidence text."],
            },
        }
        performed = {
            "status": "completed",
            "revised_result": {"parts": [
                {"code_name": "Emergency response", "excerpt_indexes": [0]},
                {"code_name": "Caregiver reliability", "excerpt_indexes": [1, 2]},
            ]},
            "applied_changes": ["Created a materially different split."],
            "preserved_content": ["All excerpts."],
            "completion_note": "",
        }
        result, completion = self.run_with([performed], payload)

        self.assertEqual(completion.call_count, 1)
        self.assertEqual(result["parts"][0]["code_name"], "Emergency response")
        self.assertEqual(result["instruction_interpretation"],
                         "Replace the rejected AI proposal with a materially different, evidence-grounded alternative.")
        refined_user = json.loads(completion.messages[0][1]["content"])
        self.assertEqual(
            refined_user["rejected_proposal"]["label"],
            "Rejected AI proposal — the user does not want this answer",
        )
        self.assertEqual(
            refined_user["understanding"]["interpreted_request"],
            "Split the evidence into two distinct concepts.",
        )
        self.assertNotIn("research_question", refined_user["request"])
        self.assertEqual(refined_user["request"]["items"][0]["code_name"], "Example code")
        self.assertNotIn("title", refined_user["request"]["items"][0])
        self.assertNotIn("reference_contexts", refined_user["request"]["items"][0])
        self.assertNotIn("previous_ai_understanding", refined_user["request"])
        self.assertNotIn("refinement_feedback", refined_user["request"])

    def test_understanding_fields_are_not_truncated(self):
        long_interpretation = "Interpretation " * 300
        long_change = "Change " * 300
        long_preserve = "Preserve " * 300
        understood = {
            "status": "understood",
            "interpreted_request": long_interpretation,
            "changes": [long_change],
            "preserve": [long_preserve],
            "clarification_question": "",
        }
        performed = {
            "status": "completed",
            "revised_result": {"code_name": "Changed code", "excerpts": ["First excerpt"]},
            "applied_changes": ["Changed the code."],
            "preserved_content": ["Evidence."],
            "completion_note": "",
        }
        result, completion = self.run_with([understood, performed])

        self.assertEqual(completion.call_count, 2)
        self.assertEqual(result["instruction_interpretation"], long_interpretation.strip())
        self.assertEqual(result["interpretation_requested_changes"], [long_change.strip()])
        self.assertEqual(result["interpretation_preserved_content"], [long_preserve.strip()])


class CodingResultFinalizationTests(unittest.TestCase):
    def test_empty_genuine_results_fail_before_calibration_codes_are_added(self):
        with patch.object(server, "add_calibration_codes") as add_calibration:
            with self.assertRaisesRegex(RuntimeError, "without producing genuine codes"):
                server.finalize_coding_results(
                    {"codes": [], "excerpts": [], "themes": []},
                    "How do caregivers coordinate care?",
                    "transcript-1",
                )
        add_calibration.assert_not_called()

    def test_genuine_results_receive_calibration_codes_after_validation(self):
        workflow_results = {"codes": [{"id": "genuine-1"}], "excerpts": [], "themes": []}
        finalized = {"codes": [{"id": "genuine-1"}, {"id": "cal-1", "◇": "check-1"}]}
        with patch.object(server, "add_calibration_codes", return_value=finalized) as add_calibration:
            result = server.finalize_coding_results(
                workflow_results,
                "How do caregivers coordinate care?",
                "transcript-1",
            )
        self.assertIs(result, finalized)
        add_calibration.assert_called_once_with(
            workflow_results,
            "How do caregivers coordinate care?",
            "transcript-1",
        )


class AzureUtilsTests(unittest.TestCase):
    def test_make_completion_uses_default_max_tokens(self):
        create = Mock(return_value=SimpleNamespace(choices=[]))
        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )
        with patch.object(AzureUtils, "AzureOpenAI", return_value=client):
            complete = AzureUtils.make_completion("endpoint", "key", "version", "deployment")
            complete([{"role": "user", "content": "Hello"}])

        request = create.call_args.kwargs
        self.assertEqual(request["max_tokens"], 16384)
        self.assertEqual(request["model"], "deployment")


if __name__ == "__main__":
    unittest.main()
