import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import server


def response(content):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


class InitialAssumptionTests(unittest.TestCase):
    def test_default_profiles_are_centralized_in_agents_prepare(self):
        from workflow_modules.agents_prepare import DEFAULT_AGENT_PROFILES

        self.assertIs(server.AGENT_PERSONAS, DEFAULT_AGENT_PROFILES)
        self.assertIn(
            "You are a former spousal caregiver",
            DEFAULT_AGENT_PROFILES["caregiver_experience"],
        )

    def test_only_reflexive_orientation_is_generated_and_identity_stays_fixed(self):
        calls = []
        outcomes = iter([
            response(json.dumps({
                "value": "You value participant agency.",
                "attention": "You are especially attentive to informal support.",
                "underestimate": "You may underestimate institutional constraints.",
                "assumption": "I may initially expect informal support to shape participants' experiences.",
            })),
        ])

        def complete(messages, **kwargs):
            calls.append((messages, kwargs))
            return next(outcomes)

        result = server.generate_project_agent_reflection(
            "caregiver_experience",
            "How do students experience group work?",
            "endpoint",
            "key",
            "version",
            "model",
            completion_fn=complete,
            retry_delays=(),
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(len(result["profile"]), 5)
        self.assertTrue(result["profile"][0].startswith("You are a former spousal caregiver"))
        self.assertIn("progressive Alzheimer", result["profile"][0])
        self.assertEqual(result["profile"][2], "You value participant agency.")
        self.assertIn("informal support", result["assumptions"])

        reflection_prompt = calls[0][0][0]["content"]
        output_prompt = calls[0][0][1]["content"]
        self.assertIn("How do students experience group work?", reflection_prompt)
        self.assertIn("progressive Alzheimer", reflection_prompt)
        self.assertNotIn("{generated_content}", reflection_prompt)
        self.assertIn('"value"', output_prompt)
        self.assertIn('"assumption"', output_prompt)

    def test_project_profiles_become_coder_personas(self):
        profile = ["You are project specific.", "You value context.", "You may underestimate systems."]
        project = {
            "id": "project-1",
            "initial_reflections": json.dumps({
                "caregiver_experience": {
                    "profile": profile,
                    "assumptions": "An initial assumption.",
                }
            }),
        }

        reflections = server.project_initial_reflections(project)
        personas = server.project_agent_personas(project)

        self.assertEqual(reflections["caregiver_experience"]["profile"], profile)
        self.assertEqual(personas["caregiver_experience"], "\n".join(profile))
        self.assertEqual(
            personas["geriatrician"],
            server.AGENT_PERSONAS["geriatrician"].strip(),
        )

    @patch.object(server.time, "sleep")
    def test_failed_request_is_retried(self, sleep):
        outcomes = iter([
            RuntimeError("temporary failure"),
            response(json.dumps({
                "value": "You value supportive communication.",
                "attention": "You are especially attentive to unequal access.",
                "underestimate": "You may underestimate clinical constraints.",
                "assumption": "My assumptions may privilege formal support structures.",
            })),
        ])
        calls = []

        def complete(messages, **kwargs):
            calls.append(messages)
            outcome = next(outcomes)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        result = server.generate_project_agent_reflection(
            "social_worker", "A question", "endpoint", "key",
            "version", "model", completion_fn=complete, retry_delays=(0.5, 1.0),
        )

        self.assertEqual(len(calls), 2)
        sleep.assert_called_once_with(0.5)
        self.assertIn("formal support structures", result["assumptions"])

    @patch.object(server.time, "sleep")
    def test_three_failures_raise_clear_error(self, sleep):
        def complete(messages, **kwargs):
            raise RuntimeError("provider unavailable")

        with self.assertRaisesRegex(ValueError, "after 3 attempts"):
            server.generate_project_agent_reflection(
                "geriatrician", "A question", "endpoint", "key",
                "version", "model", completion_fn=complete, retry_delays=(0, 0),
            )

    def test_saved_reflections_carry_only_assumptions(self):
        snapshot = {
            "analysisReady": True,
            "agentReflections": {
                agent: {
                    "assumptions": f"Updated assumption for {agent}",
                    "further_consideration": "Do not carry this forward.",
                    "reflexive_history": "Do not carry this forward either.",
                }
                for agent in server.AGENTS
            },
        }

        carried = server.saved_agent_assumptions(snapshot)

        self.assertEqual(set(carried), set(server.AGENTS))
        for agent in server.AGENTS:
            self.assertEqual(
                carried[agent],
                {"assumptions": f"Updated assumption for {agent}"},
            )

    def test_unsuccessful_analysis_is_not_carried_forward(self):
        snapshot = {
            "analysisReady": False,
            "agentReflections": {
                "caregiver_experience": {"assumptions": "Incomplete result"}
            },
        }

        self.assertEqual(server.saved_agent_assumptions(snapshot), {})

    @patch.object(server, "latest_project_agent_assumptions")
    def test_previous_assumptions_override_project_initial_values(self, latest):
        project_initial = {
            agent: {"assumptions": f"Initial assumption for {agent}"}
            for agent in server.AGENTS
        }
        latest.return_value = {
            "caregiver_experience": {"assumptions": "Latest collaboration assumption"}
        }
        project = {
            "id": "project-1",
            "initial_reflections": json.dumps(project_initial),
        }

        starting = server.project_starting_reflections(project, "transcript-2")

        self.assertEqual(
            starting["caregiver_experience"],
            {"assumptions": "Latest collaboration assumption"},
        )
        self.assertEqual(
            starting["geriatrician"],
            {"assumptions": "Initial assumption for geriatrician"},
        )
        latest.assert_called_once_with("project-1", "transcript-2")


class AiCodingCountTests(unittest.TestCase):
    def manual_code(self, included=True):
        return {
            "id": "human-1",
            "title": "Manual insight",
            "source": "Human",
            "sourceClass": "human",
            "createdFromSelection": True,
            "includedAfterAiReview": included,
            "reviewStatus": "accepted",
            "excerpts": ["A manually coded excerpt."],
        }

    def test_manual_workspace_codes_do_not_count_before_ai_coding_starts(self):
        snapshot = {
            "analysisReady": False,
            "aiCodingStarted": False,
            "codes": [self.manual_code(included=True)],
        }
        self.assertEqual(server.reflexcoti_snapshot_counts(snapshot), (0, 0))

    def test_manual_code_counts_after_explicit_inclusion_in_ai_coding(self):
        snapshot = {
            "analysisReady": True,
            "aiCodingStarted": True,
            "codes": [self.manual_code(included=True)],
        }
        self.assertEqual(server.reflexcoti_snapshot_counts(snapshot), (1, 1))

    def test_unselected_manual_code_stays_out_of_ai_coding_counts(self):
        snapshot = {
            "analysisReady": True,
            "aiCodingStarted": True,
            "codes": [self.manual_code(included=False)],
        }
        self.assertEqual(server.reflexcoti_snapshot_counts(snapshot), (0, 0))



if __name__ == "__main__":
    unittest.main()
