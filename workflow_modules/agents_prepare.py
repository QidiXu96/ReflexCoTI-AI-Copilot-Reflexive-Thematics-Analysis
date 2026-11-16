import json
import time
try:
    from .AzureUtils import make_completion
except ImportError:
    from AzureUtils import make_completion


AGENT_PROFILE_TEMPLATES = {
    "caregiver_experience": """
    You are a former spousal caregiver in your late 60s who cared for your husband through progressive Alzheimer’s at home for six years before a memory-care transition. You became involved in a caregiver support group after his death.
    As a former spousal dementia caregiver, you frequently used the healthcare system, and you can bring an insider, lived-experience perspective when coding a transcript.
    {generated_content}
    """.strip(),
    "geriatrician": """
    You are a memory clinic geriatrician in your early 50s who have spent over 15 years evaluating and treating older adults with cognitive impairment and dementia in an academic memory clinic. You regularly guide patients and families through diagnostic workups, discussions of prognosis, and ongoing dementia management.
    As an academic memory clinic geriatrician, you are a specialist provider within dementia care services, and you can bring a clinical perspective when coding a transcript.
    {generated_content}
    """.strip(),
    "social_worker": """
    You are a licensed clinical social worker in your late 40s who have spent over 10 years supporting individuals living with dementia and their family caregivers. You have provided counseling, facilitated family meetings, and connected families with community resources.
    As a licensed clinical social worker, you are also a provider within health and social service systems, and you can bring a psychosocial perspective.
    {generated_content}
    """.strip(),
    "qualitative_researcher": """
    You are a qualitative health researcher in your mid-50s who have spent over 15 years conducting qualitative studies involving patients, caregivers, and healthcare professionals. You have extensive experience using reflexive thematic analysis and teaching qualitative research methods.
    As a qualitative researcher and reflexive thematic analysis methodologist, you are a researcher studying healthcare experiences, and you can bring a methodological perspective.
    {generated_content}
    """.strip()
}

DEFAULT_AGENT_ORIENTATIONS = {
    "caregiver_experience": (
        "You value dignity and caregiver wellbeing.\n"
        "You are especially attentive to invisible emotional labor and guilt after irritability.\n"
        "You may underestimate caregivers who do not frame care as love or duty."
    ),
    "geriatrician": (
        "You value clinical safety and careful communication about diagnosis, prognosis, and symptoms.\n"
        "You are especially attentive to diagnostic concerns, prognostic uncertainty, symptom changes, and safety risks.\n"
        "You may underestimate emotional, relational, or practical aspects of caregiving."
    ),
    "social_worker": (
        "You value caregiver wellbeing and supportive communication.\n"
        "You are especially attentive to caregiver distress, family conflict, emotional strain, and the ways communication influences caregiving relationships.\n"
        "You may underestimate the extent to which communication difficulties are driven by cognitive decline and clinical factors rather than interpersonal or family relationship issues."
    ),
    "qualitative_researcher": (
        "You value reflexivity and interpretive transparency.\n"
        "You are especially attentive to interpretive transparency, reflexivity, and the coherence of code development over time.\n"
        "You may underestimate practical caregiving realities or clinical constraints that are not explicitly discussed in the transcript."
    )
}

DEFAULT_AGENT_PROFILES = {
    agent: template.format(generated_content=DEFAULT_AGENT_ORIENTATIONS[agent])
    for agent, template in AGENT_PROFILE_TEMPLATES.items()
}

def agent_reflection(agent, research_question):
    if agent not in AGENT_PROFILE_TEMPLATES:
        raise ValueError(f"Unknown coder agent: {agent}")
    fixed_profile = AGENT_PROFILE_TEMPLATES[agent].format(generated_content="").strip()
    system_prompt = f"""
    Create a project-specific reflexive orientation and initial assumption for the {agent} coder based on this research question: {research_question}.

    The coder's fixed biography and professional/lived-experience role are:
    {fixed_profile}

    Do not generate, rewrite, or summarize this fixed identity.

    The value, attention, likely blind spot, and assumption must be specific to the research question and appropriate to the {agent} perspective. The assumption must be distinct from the other three statements.
    """
    user_prompt = """
    ### TASK ###
    Return JSON only in this exact form (no Markdown, no ``` fences, no extra text).
    {
      "value": "You value ...",
      "attention": "You are especially attentive to ...",
      "underestimate": "You may underestimate ...",
      "assumption": "one or two sentences"
    }
    Rules:
    - Output must start with { and end with }.
    - Do not include ```json or ``` anywhere.
    """
    return [
        {"role": "system", "content": system_prompt.strip()},
        {"role": "user", "content": user_prompt.strip()}
    ]

def _parse_json_object(text):
    # convert the AI’s JSON-like text response into a Python dictionary
    value = str(text or "").strip()
    fence = chr(96) * 3
    if value.startswith(fence):
        value = value[len(fence):].lstrip()
        if value.casefold().startswith("json"):
            value = value[4:].lstrip()
        if value.endswith(fence):
            value = value[:-len(fence)].rstrip()
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        start, end = value.find("{"), value.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(value[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("AI did not return a JSON object.")
    return parsed

def generate_project_agent_reflection(
    agent_name,
    research_question,
    azure_endpoint,
    api_key,
    api_version,
    deployment_name,
    completion_fn=None,
    retry_delays=(0.5, 1.0)
):
    """Prepare one agent while preserving its fixed biography and role."""
    if agent_name not in AGENT_PROFILE_TEMPLATES:
        raise ValueError(f"Unknown coder agent: {agent_name}")
    complete = completion_fn or make_completion(azure_endpoint, api_key, api_version, deployment_name)
    label = agent_name.replace("_", " ")
    attempts = len(retry_delays) + 1
    last_error = None
    for attempt in range(attempts):
        try:
            messages = agent_reflection(agent_name, research_question)
            response = complete(messages)
            res = response.choices[0].message.content.strip()
            reflection = _parse_json_object(res)
            required = ("value", "attention", "underestimate", "assumption")
            missing = [key for key in required if not str(reflection.get(key) or "").strip()]
            if missing:
                raise ValueError(f"AI response is missing: {', '.join(missing)}")

            orientation = [" ".join(str(reflection[key]).strip().split()) for key in ("value", "attention", "underestimate")]
            generated_content = "\n".join(orientation)
            assumptions = " ".join(str(reflection["assumption"]).strip().split())

            full_profile = AGENT_PROFILE_TEMPLATES[agent_name].format(generated_content=generated_content)
            return {
                "profile": [line.strip() for line in full_profile.splitlines() if line.strip()],
                "assumptions": assumptions
            }
        except Exception as exc:
            last_error = exc
            if attempt < len(retry_delays):
                time.sleep(retry_delays[attempt])
    raise ValueError(
        f"Could not generate the {label} reflexive profile and initial assumptions "
        f"after {attempts} attempts: {last_error}"
    )
