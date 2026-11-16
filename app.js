const views = {
  login: document.querySelector('[data-view="login"]'),
  piHome: document.querySelector('[data-view="pi-home"]'),
  piStudents: document.querySelector('[data-view="pi-students"]'),
  piProjectReview: document.querySelector('[data-view="pi-project-review"]'),
  peerReview: document.querySelector('[data-view="peer-review"]'),
  peerInbox: document.querySelector('[data-view="peer-inbox"]'),
  project: document.querySelector('[data-view="project"]'),
  documents: document.querySelector('[data-view="documents"]'),
  codeVisualization: document.querySelector('[data-view="code-visualization"]'),
  themeVisualization: document.querySelector('[data-view="theme-visualization"]'),
  workspace: document.querySelector('[data-view="workspace"]')
};

let currentUser = null;
let piReviewContext = null;
let piReadOnlyMode = false;
let piReadOnlyContext = null;
let seniorCodeEditMode = false;
let seniorCodeReview = null;
let seniorCodeMergeMemo = "";
let seniorThemeEditMode = false;
let seniorThemeReview = null;
let seniorThemeMergeMemo = "";
let peerReviewProjects = [];
let peerReviewAnalysis = null;
let peerReviewOwnerUsername = "";
let peerReviewConnections = { approved: [], pending_sent: [] };
let pendingPeerSuggestion = null;
let peerSelectedIds = new Set();
let peerSuggestionInbox = [];
let peerInboxCompletion = null;
let projects = [];
let pendingDeleteProject = null;
let pendingDeleteTranscript = null;
let pendingClearTranscript = null;
let projectFiles = [];
let activeTranscriptFile = null;
let currentProject = null;
let selectedThemeTranscriptIds = [];
let selectedThemeCodingRevisions = {};
let projectThemeAnalysis = null;
let projectCodebook = null;
let themeGenerationInProgress = false;
let codebookProcessingPollTimer = null;
let codebookProcessingCheckPending = false;
let codebookProcessingContinuation = null;
let autosaveTimer = null;
let restoringSnapshot = false;
let analysisReady = false;
let transcript = [];
let identifiedExcerpts = [];
let codes = [];
let originalAiCodes = [];
let agentReflections = {};
let initialAgentReflections = {};
let themes = [];
let originalAiThemes = [];
let preGenerationHumanThemes = [];
let humanThemesFinished = false;
let manualThemeReuseFinished = false;
let themeGenerationStarted = false;
let themeReviewStage = "idle";
let themeAmendmentReturnStage = "";
let themeRevision = 1;
let lastFinishedThemeRevision = 0;
let themesFinishedWhenOpened = false;
let lastExportedThemeRevision = 0;
let themeQuestionnaireResponses = [];
let themesExportedAt = "";
let themeCodeInputs = [];
let themeJsonFiles = [];
let themeTranscriptDocuments = [];
let latestCodebook = null;
let latestCodebookId = null;
let mergeCodeEditorOpen = false;
let codeMergeAssistMode = "";
let codeMergeDraft = null;
let codeMergeSuggestedName = "";
let codeMergeSuggestions = [];
let codeMergeSuggestionStatus = "idle";
let codeMergeSuggestionError = "";
let dismissedCodeMergeSuggestionIds = new Set();
let codeReviewStage = "review";
let codeReviewFilter = "all";
let codeAmendmentReturnStage = "";
let codingRevision = 1;
let lastFinishedCodingRevision = 0;
let codingFinishedWhenOpened = false;
let lastExportedCodingRevision = 0;
let codingQuestionnaireResponses = [];
let codingExportedAt = "";
let manualCodeReuseFinished = false;
let mergeThemeEditorOpen = false;
let themeMergeAssistMode = "";
let themeMergeDraft = null;
let highlightedThemeId = null;
let codebookExpanded = false;
let selectedCodebookEntryIndex = null;
let themeCodebookFilter = "keep-all";
let codebookReviewFinished = false;
let codebookModificationMode = false;
let codebookRenamingEntryIndex = null;
let codebookSplittingEntryIndex = null;
let codebookMergingEntryIndex = null;
let codebookMergeSelectedIndexes = [];
let codebookMergeNameIndex = null;
let codebookMergeUsesCustomName = false;
let codebookMergeCustomName = "";
let codebookSplitDraft = { names: [], assignments: [] };
let codebookPendingMerge = null;
let codebookPendingDeleteIndex = null;
let codebookUndoStack = [];
let codebookChangeHistory = [];
let codebookHistoryOpen = false;
let codebookAiSuggestionsOpen = false;
let codebookDeletionSuggestionChoice = "";
let codebookResearchQuestion = "";
let codebookSourceEditReturn = null;
let pendingCodebookSourceEdit = null;
let currentWorkspacePage = "codes";
let codingWorkspaceMode = "ai";
let themeWorkspaceMode = "codebook";
let workspaceNavAccessMode = "codes";
let lastSavedAt = null;
let transcriptDisplayedAt = null;
let readingGateTimer = null;
let readingElapsedMs = 0;
let readingLastTickAt = null;
let transcriptReachedEnd = false;
let newCodeEditorOpen = false;
let newThemeEditorOpen = false;
let selectedTranscriptExcerpt = null;
let humanCodingFinished = false;
let humanCodingFinishedWhenOpened = false;
let manualCodeDraftExpanded = false;
let aiCodingStarted = false;
const backgroundAiJobs = new Map();
let expandedCodeId = null;
let expandedThemeId = null;
let focusedHumanCodeId = null;
let activeReviewTimer = null;
let codeViewTranscriptFile = null;
let codeViewCodes = [];
let codeViewPositions = new Map();
let codeViewLayoutMethod = "";
let codeViewCanvasHeight = 620;
let themeViewThemes = [];
let themeViewPositions = new Map();
let themeViewLayoutMethod = "";
let themeViewCanvasHeight = 620;
let themeVisualizationMode = "map";
let codebookExplorerTrigger = null;
let codebookGrowthOpen = false;
let highlightedCodebookCodeNames = [];
let questionnaireTimings = { coding: [], theme: [] };
let workflowTiming = null;
let codeMergeStartedAt = 0;
let themeMergeStartedAt = 0;
const READING_TRACKING_CAP_MS = 5 * 60 * 1000; // Timing-data cap only; it does not delay AI results.
const REVIEW_IDLE_LIMIT_MS = 60 * 1000;
const WORKFLOW_TIMING_METHOD = "manual_phase_visible_focused_active_time_60s_idle_cap";
const CODING_QUESTIONNAIRE_ITEMS = [
  "The AI-generated codes were relevant to the research question.",
  "The AI-identified excerpts were useful for understanding why each code was suggested.",
  "When revising codes, I preferred using 'Ask AI' rather than 'Edit myself'.",
  "The AI suggestions helped me notice ideas I might otherwise have missed.",
  "I felt able to make my own coding decisions rather than simply accepting the AI suggestions.",
  "I needed to add additional codes that the AI missed.",
  "Revising code names or excerpts helped me better align the coding results with my interpretation.",
  "The AI coding process supported my reflexive thinking during analysis.",
  "Overall, I would be willing to use ReflexCoTI for coding another transcript.",
];
const THEME_QUESTIONNAIRE_ITEMS = [
  "The AI-generated themes were relevant to the research question.",
  "The codes grouped under each theme helped me understand why the theme was suggested.",
  "The AI-generated theme descriptions were useful for understanding each theme.",
  "The AI suggestions helped me notice broader patterns across transcripts.",
  "I felt able to make my own theme development decisions rather than simply accepting the AI suggestions.",
  "I needed to add additional themes that the AI missed.",
  "Splitting or merging AI-generated themes helped me better align the themes with my interpretation.",
  "The AI theme generation process supported my reflexive thinking during analysis.",
  "Overall, I would be willing to use ReflexCoTI for theme generation in another study.",
];
const AGENT_DETAILS = {
  caregiver_experience: {
    label: "Caregiver experience",
    role: "Former spousal dementia caregiver",
    identity: [
      "You are a former spousal caregiver in your late 60s who cared for your husband through progressive Alzheimer’s at home for six years before a memory-care transition. You became involved in a caregiver support group after his death.",
      "As a former spousal dementia caregiver, you frequently used the healthcare system, and you can bring an insider, lived-experience perspective when coding a transcript.",
      "You value dignity and caregiver wellbeing.",
      "You are especially attentive to invisible emotional labor and guilt after irritability.",
      "You may underestimate caregivers who do not frame care as love or duty.",
    ],
  },
  geriatrician: {
    label: "Geriatrician",
    role: "Academic memory clinic geriatrician",
    identity: [
      "You are a memory clinic geriatrician in your early 50s who have spent over 15 years evaluating and treating older adults with cognitive impairment and dementia in an academic memory clinic. You regularly guide patients and families through diagnostic workups, discussions of prognosis, and ongoing dementia management.",
      "As an academic memory clinic geriatrician, you are a specialist provider within dementia care services, and you can bring a clinical perspective when coding a transcript.",
      "You value clinical safety and careful communication about diagnosis, prognosis, and symptoms.",
      "You are especially attentive to diagnostic concerns, prognostic uncertainty, symptom changes, and safety risks.",
      "You may underestimate emotional, relational, or practical aspects of caregiving.",
    ],
  },
  social_worker: {
    label: "Social worker",
    role: "Licensed clinical social worker",
    identity: [
      "You are a licensed clinical social worker in your late 40s who have spent over 10 years supporting individuals living with dementia and their family caregivers. You have provided counseling, facilitated family meetings, and connected families with community resources.",
      "As a licensed clinical social worker, you are also a provider within health and social service systems, and you can bring a psychosocial perspective.",
      "You value caregiver wellbeing and supportive communication.",
      "You are especially attentive to caregiver distress, family conflict, and emotional strain.",
      "You may underestimate the extent to which communication difficulties are driven by cognitive decline and clinical factors rather than interpersonal or family relationship issues.",
    ],
  },
  qualitative_researcher: {
    label: "Qualitative researcher",
    role: "Qualitative health researcher and RTA methodologist",
    identity: [
      "You are a qualitative health researcher in your mid-50s who have spent over 15 years conducting qualitative studies involving patients, caregivers, and healthcare professionals. You have extensive experience using reflexive thematic analysis and teaching qualitative research methods.",
      "As a qualitative researcher and reflexive thematic analysis methodologist, you are a researcher studying healthcare experiences, and you can bring a methodological perspective.",
      "You value reflexivity and interpretive transparency.",
      "You are especially attentive to interpretive transparency and reflexivity.",
      "You may underestimate practical caregiving realities or clinical constraints that are not explicitly discussed in the transcript.",
    ],
  },
};

function showView(name) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function setPiReadOnlyMode(enabled, context = null) {
  piReadOnlyMode = Boolean(enabled);
  piReadOnlyContext = piReadOnlyMode ? context : null;
  if (piReadOnlyMode) themeWorkspaceMode = "ai";
  if (!piReadOnlyMode) {
    seniorCodeEditMode = false;
    seniorCodeReview = null;
    seniorThemeEditMode = false;
    seniorThemeReview = null;
  }
  document.body.classList.toggle("pi-read-only", piReadOnlyMode);
  document.body.classList.toggle("senior-code-edit", piReadOnlyMode && seniorCodeEditMode);
  document.body.classList.toggle("senior-theme-edit", piReadOnlyMode && seniorThemeEditMode);
  document.getElementById("piReadOnlyDocumentsBadge")?.classList.toggle("hidden", !piReadOnlyMode);
  document.getElementById("piReadOnlyWorkspaceBadge")?.classList.toggle("hidden", !piReadOnlyMode);
  const backButton = document.getElementById("backToProjects");
  if (backButton) backButton.textContent = piReadOnlyMode ? "← Junior researcher projects" : "← Projects";
}

function setSeniorThemeEditMode(enabled) {
  seniorThemeEditMode = Boolean(piReadOnlyMode && enabled);
  document.body.classList.toggle("senior-theme-edit", seniorThemeEditMode);
  const badge = document.getElementById("piReadOnlyWorkspaceBadge");
  if (badge) badge.textContent = seniorThemeEditMode
    ? "Senior review · completed themes can be modified"
    : "Senior researcher read-only view";
}

function setSeniorCodeEditMode(enabled) {
  seniorCodeEditMode = Boolean(piReadOnlyMode && enabled);
  if (!seniorCodeEditMode) seniorCodeMergeMemo = "";
  document.body.classList.toggle("senior-code-edit", seniorCodeEditMode);
  const badge = document.getElementById("piReadOnlyWorkspaceBadge");
  if (badge) badge.textContent = seniorCodeEditMode
    ? "Senior review · completed codes can be amended"
    : "Senior researcher read-only view";
}

function toast(message, duration = 3200) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), duration);
}

function openAiCodeCaution() {
  const modal = document.getElementById("aiCodeCautionModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.getElementById("continueCodeReviewBtn")?.focus();
}

function closeAiCodeCaution() {
  const modal = document.getElementById("aiCodeCautionModal");
  if (!modal) return;
  modal.classList.add("hidden");
  const nextCodeCard = document.querySelector(".code-card.current-review");
  if (nextCodeCard) {
    nextCodeCard.setAttribute("tabindex", "-1");
    nextCodeCard.focus({ preventScroll: true });
  }
}

function initials(name) {
  return name.trim().split(/\s|[._-]/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "U";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAssistChoice({ action, noun, mode = "", instruction = "", isRefinement = false }) {
  if (isRefinement) {
    return `<div class="assist-choice proposal-review-heading">
      <div><strong>Review the AI proposal</strong><span>Use this proposal, ask AI for a different alternative, or cancel.</span></div>
    </div>`;
  }
  return `
    <div class="assist-choice">
      <div><strong>How would you like to ${escapeHTML(action)} this ${escapeHTML(noun)}?</strong><span>You stay in control and review everything before applying it.</span></div>
      <div class="assist-mode-buttons">
        <button class="${mode === "manual" ? "active" : ""}" data-assist-mode="manual" type="button">Edit myself</button>
        <button class="${mode === "ai" ? "active" : ""}" data-assist-mode="ai" type="button">Ask AI</button>
      </div>
    </div>
    ${mode === "ai" ? `<div class="ai-instruction-box">
      <label>${isRefinement ? "What should AI improve?" : "Tell AI what you want"}<textarea data-ai-instruction placeholder="${isRefinement ? "Describe what is unsatisfactory and what the next proposal should do differently." : "Clearly describe what you want AI to change and what should remain unchanged."}">${escapeHTML(instruction)}</textarea></label>
      <button class="secondary-btn" data-generate-ai-draft type="button">${isRefinement ? "Refine proposal" : "Generate proposal"}</button>
      <span class="ai-draft-status" aria-live="polite">${isRefinement ? "AI will use the current proposal as its starting point." : "AI first understands your request, then performs the revision using the relevant context."}</span>
    </div>` : ""}`;
}

function renderAiUnderstanding(draft) {
  if (!draft) return "";
  const outcome = draft.interpretation || draft.instruction_interpretation || "";
  const requested = draft.requestedChanges || draft.interpretation_requested_changes || [];
  const preserved = draft.preservedContent || draft.interpretation_preserved_content || [];
  const performance = draft.performance || draft.performance_summary || "";
  const review = draft.review || draft.review_summary || "";
  const editPlan = draft.editPlan || draft.edit_plan || [];
  return `
    ${outcome ? `<div class="ai-interpretation"><strong>AI understood:</strong> ${escapeHTML(outcome)}
      ${requested.length ? `<span><strong>Will change:</strong> ${escapeHTML(requested.join("; "))}</span>` : ""}
      ${preserved.length ? `<span><strong>Will keep unchanged:</strong> ${escapeHTML(preserved.join("; "))}</span>` : ""}
    </div>` : ""}
    ${performance ? `<p class="ai-review"><strong>AI performed:</strong> ${escapeHTML(performance)}</p>` : ""}
    ${review && !performance ? `<p class="ai-review"><strong>AI performed:</strong> ${escapeHTML(review)}</p>` : ""}
    ${editPlan.length ? `<details class="ai-edit-plan"><summary>Planned changes (${editPlan.length})</summary>
      <ol>${editPlan.map((operation) => `<li><strong>${escapeHTML(operation.op)} ${escapeHTML(operation.target)}</strong>
        ${operation.before ? `<span><b>Before:</b> ${escapeHTML(operation.before)}</span>` : ""}
        ${operation.after ? `<span><b>After:</b> ${escapeHTML(operation.after)}</span>` : ""}
      </li>`).join("")}</ol>
    </details>` : ""}`;
}

async function requestAiEdit(action, entityType, items, instruction = "", rejectedProposal = null, priorAiContext = null) {
  const settings = {
    azure_endpoint: document.getElementById("azureEndpoint")?.value.trim(),
    api_key: document.getElementById("apiKey")?.value.trim(),
    api_version: document.getElementById("apiVersion")?.value.trim(),
    model: document.getElementById("model")?.value.trim(),
  };
  const missing = Object.entries(settings).filter(([, value]) => !value).map(([key]) => key.replaceAll("_", " "));
  if (missing.length) throw new Error(`Add your Azure OpenAI ${missing.join(", ")} setting${missing.length === 1 ? "" : "s"} first.`);
  return apiFetch("/api/ai-assist-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...settings, action, entity_type: entityType, instruction, items,
      ...(rejectedProposal ? { rejected_proposal: rejectedProposal } : {}),
      ...(priorAiContext ? { prior_ai_context: priorAiContext } : {}) }),
  });
}

function agentLabel(code) {
  if (code.agentLabel) return code.agentLabel;
  if (!code.context || code.context.includes(":")) return code.context || "";
  return `Agent: ${code.context.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
}

function agentDetail(agentId) {
  return AGENT_DETAILS[agentId] || {
    label: String(agentId || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    role: "Coder agent",
    identity: ["Identity profile is not available for this coder agent."],
    assumptions: "No reflexive assumptions are available for this coder agent.",
  };
}

function displayAgentName(agentId, detail) {
  if (detail?.label) return detail.label;
  return String(agentId || "Coder agent").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function agentReflection(agentId) {
  return agentReflections?.[agentId] || {};
}

function renderStructuredReflection(value, emptyText = "No updated reflection available yet.") {
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && item !== "");
    if (!items.length) return `<p>${escapeHTML(emptyText)}</p>`;
    return `<ul>${items.map((item) => {
      if (typeof item === "object") {
        const parts = Object.entries(item)
          .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
          .map(([key, entryValue]) => `<span><strong>${escapeHTML(key)}:</strong> ${escapeHTML(entryValue)}</span>`)
          .join("");
        return `<li class="reflection-history-item">${parts || escapeHTML(emptyText)}</li>`;
      }
      return `<li>${escapeHTML(item)}</li>`;
    }).join("")}</ul>`;
  }
  if (value && typeof value === "object") {
    const parts = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
      .map(([key, entryValue]) => `<p><strong>${escapeHTML(key)}:</strong> ${escapeHTML(entryValue)}</p>`)
      .join("");
    return parts || `<p>${escapeHTML(emptyText)}</p>`;
  }
  const text = String(value || "").trim();
  if (!text || text === "N/A") return `<p>${escapeHTML(emptyText)}</p>`;
  return `<p class="preserve-lines">${escapeHTML(text)}</p>`;
}

function renderAgentChips(code) {
  const agents = Array.isArray(code.agents)
    ? code.agents.map((agent) => String(agent || "").trim()).filter(Boolean)
    : [];
  const chips = agents.length === 0
    ? (agentLabel(code) ? `<span class="tag agent-tag">${escapeHTML(agentLabel(code))}</span>` : "")
    : agents.map((agentId) => {
      const detail = agentDetail(agentId);
      return `<button class="tag agent-tag agent-chip" data-agent-id="${escapeHTML(agentId)}" type="button">${escapeHTML(detail.label)}</button>`;
    }).join("");
  if (!chips) return "";
  return `<details class="ai-provenance">
    <summary><span class="ai-provenance-icon" aria-hidden="true">✦</span><span>AI suggested</span></summary>
    <div class="ai-provenance-panel"><span class="ai-provenance-label">Contributing perspectives</span>${chips}</div>
  </details>`;
}

function quoteText(code) {
  return codeExcerptList(code)[0] || "";
}

function cleanExcerptText(value) {
  return String(value || "").replace(/^"\s*/, "").replace(/\s*"$/, "").trim();
}

function dedupeExcerpts(excerpts) {
  const seen = new Set();
  return excerpts.map(cleanExcerptText).filter(Boolean).filter((excerpt) => {
    const key = excerpt.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function codeExcerptList(code) {
  const values = [];
  [code?.excerpts, code?.quotes, code?.quote, code?.excerpt].forEach((field) => {
    if (Array.isArray(field)) values.push(...field);
    else if (field != null && String(field).trim()) values.push(field);
  });
  return dedupeExcerpts(values);
}

function normalizeTranscriptContextMatch(value) {
  return normalizeForMatch(value)
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptTokenPositionForExcerpt(excerptText) {
  const excerptSpans = tokenSpansForMatch(excerptText);
  if (!excerptSpans.length) return null;

  const transcriptSpans = transcript.flatMap((row, rowIndex) => {
    const displayText = splitSpeakerPrefix(row).text.trim();
    return tokenSpansForMatch(displayText).map((span) => ({
      ...span,
      rowIndex,
      characterIndex: span.start,
    }));
  });
  if (!transcriptSpans.length) return null;

  const excerptTokenPositions = new Map();
  excerptSpans.forEach((span, index) => {
    const positions = excerptTokenPositions.get(span.token) || [];
    positions.push(index);
    excerptTokenPositions.set(span.token, positions);
  });

  let bestMatch = null;
  transcriptSpans.forEach((transcriptSpan, transcriptIndex) => {
    (excerptTokenPositions.get(transcriptSpan.token) || []).forEach((excerptIndex) => {
      let runLength = 0;
      while (
        transcriptSpans[transcriptIndex + runLength]
        && excerptSpans[excerptIndex + runLength]
        && transcriptSpans[transcriptIndex + runLength].token === excerptSpans[excerptIndex + runLength].token
      ) {
        runLength += 1;
      }
      const coversShortExcerpt = runLength === excerptSpans.length;
      if (runLength < 4 && !coversShortExcerpt) return;
      const candidate = {
        rowIndex: transcriptSpan.rowIndex,
        characterIndex: transcriptSpan.characterIndex,
        runLength,
      };
      if (
        !bestMatch
        || candidate.runLength > bestMatch.runLength
        || (
          candidate.runLength === bestMatch.runLength
          && (
            candidate.rowIndex < bestMatch.rowIndex
            || (
              candidate.rowIndex === bestMatch.rowIndex
              && candidate.characterIndex < bestMatch.characterIndex
            )
          )
        )
      ) {
        bestMatch = candidate;
      }
    });
  });
  return bestMatch
    ? { rowIndex: bestMatch.rowIndex, characterIndex: bestMatch.characterIndex }
    : null;
}

function transcriptPositionForExcerpt(excerpt, codeId = "") {
  const excerptText = cleanExcerptText(excerpt);
  const excerptKey = normalizeTranscriptContextMatch(excerptText);
  if (!excerptKey || !transcript.length) return null;

  const code = codeId
    ? codes.find((item) => String(item.id) === String(codeId))
    : null;
  const savedCodeLines = Array.isArray(code?.transcriptLines) ? code.transcriptLines : [];
  for (const savedCodeLine of savedCodeLines) {
    const rowIndex = transcript.findIndex((row) => Number(row.line) === Number(savedCodeLine));
    if (rowIndex < 0) continue;
    const displayText = splitSpeakerPrefix(transcript[rowIndex]).text.trim();
    const match = excerptMatchDetails(displayText, excerptText);
    return { rowIndex, characterIndex: match.range?.[0] || 0 };
  }

  // AI result files store a clue identifier in the excerpt line field. It is
  // not necessarily a transcript line number, so derive position from the
  // transcript text itself. Token matching spans transcript rows, which keeps
  // a multi-line excerpt anchored to the row where it actually begins.
  const tokenPosition = transcriptTokenPositionForExcerpt(excerptText);
  if (tokenPosition) return tokenPosition;

  for (let rowIndex = 0; rowIndex < transcript.length; rowIndex += 1) {
    const displayText = splitSpeakerPrefix(transcript[rowIndex]).text.trim();
    const match = excerptMatchDetails(displayText, excerptText);
    if (match.score > 0) {
      return { rowIndex, characterIndex: match.range?.[0] || 0 };
    }
  }
  return null;
}

function transcriptRowIndexForExcerpt(excerpt, codeId = "") {
  return transcriptPositionForExcerpt(excerpt, codeId)?.rowIndex ?? -1;
}

function firstTranscriptPositionForCode(code) {
  const positions = codeExcerptList(code)
    .map((excerpt) => transcriptPositionForExcerpt(excerpt, code?.id))
    .filter(Boolean)
    .sort((left, right) => (
      left.rowIndex - right.rowIndex
      || left.characterIndex - right.characterIndex
    ));
  return positions[0] || {
    rowIndex: Number.POSITIVE_INFINITY,
    characterIndex: Number.POSITIVE_INFINITY,
  };
}

function compareTranscriptPositions(left, right) {
  return left.rowIndex - right.rowIndex
    || left.characterIndex - right.characterIndex;
}

function stableCodeInsertionHash(code) {
  const value = String(code?.id || code?.title || "");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function codesInTranscriptExcerptOrder(items) {
  const indexedItems = items.map((code, index) => ({
    code,
    index,
    firstPosition: firstTranscriptPositionForCode(code),
  }));
  const genuineItems = indexedItems
    .filter(({ code }) => !isCalibrationCode(code))
    .sort((left, right) => (
      compareTranscriptPositions(left.firstPosition, right.firstPosition)
      || left.index - right.index
    ));
  const calibrationItems = indexedItems
    .filter(({ code }) => isCalibrationCode(code))
    .sort((left, right) => (
      stableCodeInsertionHash(left.code) - stableCodeInsertionHash(right.code)
      || left.index - right.index
    ));

  if (!genuineItems.length) return calibrationItems.map(({ code }) => code);
  if (!calibrationItems.length) return genuineItems.map(({ code }) => code);

  const insertionBuckets = Array.from({ length: genuineItems.length + 1 }, () => []);
  calibrationItems.forEach((item) => {
    // Keep study cards away from the obvious first/end positions when there is
    // room, while their seeded IDs keep placement stable across re-renders.
    const slot = genuineItems.length > 1
      ? 1 + (stableCodeInsertionHash(item.code) % (genuineItems.length - 1))
      : 1;
    insertionBuckets[slot].push(item);
  });

  const orderedItems = [];
  for (let slot = 0; slot <= genuineItems.length; slot += 1) {
    orderedItems.push(...insertionBuckets[slot]);
    if (slot < genuineItems.length) orderedItems.push(genuineItems[slot]);
  }
  return orderedItems.map(({ code }) => code);
}

function transcriptContextForExcerpt(excerpt, radius = 6) {
  const excerptKey = normalizeTranscriptContextMatch(cleanExcerptText(excerpt));
  if (!excerptKey || !transcript.length) return null;
  const identified = identifiedExcerpts.find((item) => normalizeTranscriptContextMatch(item.text) === excerptKey);
  let rowIndex = Number.isFinite(Number(identified?.line))
    ? transcript.findIndex((row) => Number(row.line) === Number(identified.line))
    : -1;
  if (rowIndex >= 0) {
    const savedLineKey = normalizeTranscriptContextMatch(transcript[rowIndex]?.text);
    if (!savedLineKey || (!savedLineKey.includes(excerptKey) && !excerptKey.includes(savedLineKey))) rowIndex = -1;
  }
  if (rowIndex < 0) {
    rowIndex = transcript.findIndex((row) => {
      const rowKey = normalizeTranscriptContextMatch(row.text);
      return rowKey && (rowKey.includes(excerptKey) || excerptKey.includes(rowKey));
    });
  }
  if (rowIndex < 0) return null;
  const start = Math.max(0, rowIndex - radius);
  const end = Math.min(transcript.length, rowIndex + radius + 1);
  return {
    excerpt: cleanExcerptText(excerpt),
    matched_line: transcript[rowIndex]?.line || null,
    context_lines: transcript.slice(start, end).map((row) => ({
      line: row.line,
      text: String(row.text || "").slice(0, 1200),
    })),
  };
}

function codeAiEditPayload(code) {
  const excerpts = codeExcerptList(code);
  return {
    title: code.title,
    excerpts,
    reference_contexts: excerpts.slice(0, 4).map((excerpt) => transcriptContextForExcerpt(excerpt)).filter(Boolean),
  };
}

function themeTranscriptContextForExcerpt(excerpt, transcriptIds = [], radius = 1) {
  const excerptKey = normalizeForMatch(cleanExcerptText(excerpt));
  if (!excerptKey) return null;
  const requestedIds = new Set((transcriptIds || []).map((value) => normalizeForMatch(value)));
  const preferred = requestedIds.size
    ? themeTranscriptDocuments.filter((document) => requestedIds.has(normalizeForMatch(document.transcript_id)) || requestedIds.has(normalizeForMatch(document.file_name)))
    : [];
  const documents = preferred.length ? preferred : themeTranscriptDocuments;
  for (const document of documents) {
    const rowIndex = document.rows.findIndex((row) => {
      const rowKey = normalizeForMatch(row.text);
      return rowKey && (rowKey.includes(excerptKey) || excerptKey.includes(rowKey));
    });
    if (rowIndex < 0) continue;
    return {
      excerpt: cleanExcerptText(excerpt),
      transcript_id: document.transcript_id,
      file_name: document.file_name,
      matched_line: document.rows[rowIndex]?.line || null,
      context_lines: document.rows
        .slice(Math.max(0, rowIndex - radius), Math.min(document.rows.length, rowIndex + radius + 1))
        .map((row) => ({ line: row.line, text: String(row.text || "").slice(0, 1200) })),
    };
  }
  return null;
}

function themeAiEditPayload(theme) {
  return {
    title: theme.title,
    rationale: theme.rationale,
    codes: (theme.codes || []).map((code) => {
      const transcriptIds = code.transcriptIds || code.transcript_ids || [];
      const excerpts = codeExcerptList(code).slice(0, 4).map((excerpt) => excerpt.slice(0, 2000));
      return {
        code_name: code.codeName || code.title || "",
        excerpts,
        transcript_ids: transcriptIds,
        reference_contexts: excerpts.map((excerpt) => themeTranscriptContextForExcerpt(excerpt, transcriptIds)).filter(Boolean),
      };
    }),
  };
}

function splitExcerptInput(value) {
  return dedupeExcerpts(String(value || "").split(/\n+/));
}

function isCollaborationHumanCode(code) {
  return code?.sourceClass === "human" && !code.createdFromSelection;
}

function isPreAiManualHumanCode(code) {
  return code?.sourceClass === "human" && Boolean(code.createdFromSelection);
}

function isIncludedPreAiManualCode(code) {
  return isPreAiManualHumanCode(code) && Boolean(code.includedAfterAiReview);
}

function resetUnincorporatedManualCodesForAiCoding(snapshot = {}) {
  // Human Coding is a separate workspace. Until AI Coding has actually
  // started, none of its manual codes belong to the AI Coding result set.
  if (snapshot.aiCodingStarted || snapshot.analysisReady) return;
  codes.filter(isPreAiManualHumanCode).forEach((code) => {
    code.includedAfterAiReview = false;
  });
}

function unmatchedPreAiHumanCodes() {
  return codes.filter((code) => isPreAiManualHumanCode(code) && code.matchedAiCodeId == null);
}

function codeStageAfterMerge() {
  return unmatchedPreAiHumanCodes().length ? "unmatched-human" : "additional-choice";
}

function isHumanAiMatchedResult(code) {
  if (!code?.humanAiMatchDecision) return false;
  return code.sourceClass === "human"
    ? code.humanAiMatchDecision === "human" && isIncludedPreAiManualCode(code)
    : code.humanAiMatchDecision === "ai" && code.reviewStatus !== "rejected";
}


function codeCardSourceClass(code) {
  if (isHumanAiMatchedResult(code) || code?.sourceClass === "human") return "source-human-ai";
  if (code?.source === "AI+Human" || ["revised", "split", "merged"].includes(code?.reviewStatus)) return "source-ai-human";
  return "source-ai";
}

function codeExcerptOverlapScore(leftCode, rightCode) {
  const leftExcerpts = codeExcerptList(leftCode);
  const rightExcerpts = codeExcerptList(rightCode);
  let bestScore = 0;
  leftExcerpts.forEach((leftExcerpt) => {
    rightExcerpts.forEach((rightExcerpt) => {
      bestScore = Math.max(
        bestScore,
        excerptMatchScore(leftExcerpt, rightExcerpt),
        excerptMatchScore(rightExcerpt, leftExcerpt),
      );
    });
  });
  return bestScore;
}

function initializeHumanAiCodeMatches() {
  const humanItems = codes.filter(isPreAiManualHumanCode);
  const aiItems = codes.filter((code) => code.sourceClass !== "human" && !isCalibrationCode(code));
  humanItems.forEach((code) => {
    code.includedAfterAiReview = false;
    delete code.matchedAiCodeId;
    delete code.humanAiMatchDecision;
  });
  aiItems.forEach((code) => {
    delete code.matchedHumanCodeId;
    delete code.humanAiMatchScore;
    delete code.humanAiMatchDecision;
  });

  const candidates = [];
  aiItems.forEach((aiCode) => {
    humanItems.forEach((humanCode) => {
      const score = codeExcerptOverlapScore(aiCode, humanCode);
      if (score >= 0.7) candidates.push({ aiCode, humanCode, score });
    });
  });
  candidates.sort((left, right) => right.score - left.score);
  const usedAiIds = new Set();
  const usedHumanIds = new Set();
  candidates.forEach(({ aiCode, humanCode, score }) => {
    const aiId = String(aiCode.id);
    const humanId = String(humanCode.id);
    if (usedAiIds.has(aiId) || usedHumanIds.has(humanId)) return;
    usedAiIds.add(aiId);
    usedHumanIds.add(humanId);
    aiCode.matchedHumanCodeId = humanCode.id;
    aiCode.humanAiMatchScore = score;
    aiCode.humanAiMatchDecision = "";
    humanCode.matchedAiCodeId = aiCode.id;
    humanCode.humanAiMatchDecision = "";
  });
  return usedAiIds.size;
}

function unresolvedHumanAiCodeMatches() {
  return codes.filter((code) => (
    code.sourceClass !== "human"
    && code.matchedHumanCodeId != null
    && !code.humanAiMatchDecision
    && codes.some((humanCode) => String(humanCode.id) === String(code.matchedHumanCodeId))
  ));
}

function resolveHumanAiCodeMatch(aiCodeId, choice) {
  const aiCode = codes.find((code) => String(code.id) === String(aiCodeId));
  const humanCode = codes.find((code) => String(code.id) === String(aiCode?.matchedHumanCodeId));
  if (!aiCode || !humanCode || !["ai", "human"].includes(choice)) return;

  aiCode.humanAiMatchDecision = choice;
  humanCode.humanAiMatchDecision = choice;
  if (choice === "human") {
    aiCode.reviewStatus = "rejected";
    humanCode.includedAfterAiReview = true;
  } else {
    aiCode.reviewStatus = "accepted";
    aiCode.acceptedAt = new Date().toISOString();
    humanCode.includedAfterAiReview = false;
  }
  if (unresolvedHumanAiCodeMatches().length === 0) codeReviewStage = "review";
  markSaved();
  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
}

function reviewableCodes() {
  return codes.filter((code) => code.sourceClass !== "human" || isCollaborationHumanCode(code) || isIncludedPreAiManualCode(code));
}

function isCalibrationCode(code) {
  return Boolean(code?.["◇"]);
}

function redFlagsShownCount() {
  return codes.filter((code) => isCalibrationCode(code) && code.reviewStatus === "accepted").length;
}

function isExportableReviewedCode(code) {
  if (!code || typeof code !== "object") return false;
  if (isPreAiManualHumanCode(code) && !code.includedAfterAiReview) return false;
  return ["accepted", "revised", "split", "merged"].includes(code.reviewStatus);
}

function isFinalAiCodingResult(code) {
  return Boolean(
    code
    && !isCalibrationCode(code)
    && isExportableReviewedCode(code)
  );
}

function normalizedAiUnderstanding(value) {
  if (!value || typeof value !== "object") return null;
  const cleanList = (items) => Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const understanding = {
    interpreted_request: String(value.interpreted_request || value.interpretation || "").trim(),
    requested_changes: cleanList(value.requested_changes || value.changes),
    preserved_content: cleanList(value.preserved_content || value.preserve),
  };
  return understanding.interpreted_request || understanding.requested_changes.length
    || understanding.preserved_content.length
    ? understanding
    : null;
}

function aiUnderstandingFromDraft(draft) {
  return normalizedAiUnderstanding({
    interpreted_request: draft?.interpretation || draft?.instruction_interpretation || "",
    requested_changes: draft?.requestedChanges || draft?.interpretation_requested_changes || [],
    preserved_content: draft?.preservedContent || draft?.interpretation_preserved_content || [],
  });
}

function aiTransformationMetadata(draft) {
  const understanding = aiUnderstandingFromDraft(draft);
  const previousUnderstanding = normalizedAiUnderstanding(draft?.previousAiUnderstanding);
  const originalInstruction = String(draft?.originalInstruction || "").trim();
  return {
    ...(originalInstruction && originalInstruction !== String(draft?.instruction || "").trim()
      ? { original_user_instruction: originalInstruction }
      : {}),
    ...(understanding ? { ai_understanding: understanding } : {}),
    ...(previousUnderstanding ? { previous_ai_understanding: previousUnderstanding } : {}),
    ...(draft?.isRefinement ? { refinement_feedback: "rejected_ai_proposal" } : {}),
  };
}

function priorAiContextFromDraft(draft) {
  const understanding = aiUnderstandingFromDraft(draft) || {};
  return {
    original_user_instruction: draft?.originalInstruction || draft?.instruction || "",
    ai_understanding: draft?.sourceUnderstanding || {
      interpreted_request: understanding.interpreted_request || "",
      changes: understanding.requested_changes || [],
      preserve: understanding.preserved_content || [],
    },
    ai_performance: {
      summary: draft?.performance || draft?.performance_summary || draft?.review || "",
      edit_plan: draft?.editPlan || draft?.edit_plan || [],
    },
  };
}

function rejectedSplitProposal(item, draft, isCode) {
  const parts = Array.isArray(draft?.splitParts) ? draft.splitParts : item.splitParts || [];
  const assignments = Array.isArray(draft?.splitAssignments) ? draft.splitAssignments : item.splitAssignments || [];
  return {
    parts: parts.map((part, partIndex) => ({
      [isCode ? "code_name" : "theme_name"]: part.title || "",
      ...(isCode ? {} : { description: part.rationale || "" }),
      [isCode ? "excerpt_indexes" : "code_indexes"]: assignments
        .map((assignment, index) => Number(assignment) === partIndex ? index : -1)
        .filter((index) => index >= 0),
    })),
  };
}

function transformationHistory(item) {
  const raw = Array.isArray(item?.transformationHistory)
    ? item.transformationHistory.filter(Boolean)
    : (["revised", "split", "merged"].includes(item?.reviewStatus) ? [item.reviewStatus] : []);
  return raw.map((entry) => {
    if (typeof entry === "string") {
      return { operation: entry, method: "legacy_unspecified", instruction: "", active_time_ms: 0 };
    }
    const understanding = normalizedAiUnderstanding(entry.ai_understanding);
    const previousUnderstanding = normalizedAiUnderstanding(entry.previous_ai_understanding);
    return {
      operation: entry.operation || "edited",
      method: entry.method || "unspecified",
      instruction: String(entry.instruction || ""),
      ...(entry.original_user_instruction
        ? { original_user_instruction: String(entry.original_user_instruction) }
        : {}),
      ...(understanding ? { ai_understanding: understanding } : {}),
      ...(previousUnderstanding ? { previous_ai_understanding: previousUnderstanding } : {}),
      ...(entry.refinement_feedback
        ? { refinement_feedback: String(entry.refinement_feedback) }
        : {}),
      ...(entry.memo ? { memo: String(entry.memo) } : {}),
      ...(entry.recorded_at ? { recorded_at: String(entry.recorded_at) } : {}),
      ...(entry.actor_role ? { actor_role: String(entry.actor_role) } : {}),
      ...(entry.actor_username ? { actor_username: String(entry.actor_username) } : {}),
      ...(Number(entry.version) > 0 ? { version: Number(entry.version) } : {}),
      ...(entry.previous_version && typeof entry.previous_version === "object"
        ? { previous_version: {
          code_name: String(entry.previous_version.code_name || ""),
          excerpts: Array.isArray(entry.previous_version.excerpts) ? entry.previous_version.excerpts.map(String) : [],
        } } : {}),
      active_time_ms: Number(entry.active_time_ms || 0),
    };
  });
}

function ensureReviewTiming(item) {
  item.reviewTiming = {
    totalActiveTimeMs: Number(item.reviewTiming?.totalActiveTimeMs || 0),
    sessionCount: Number(item.reviewTiming?.sessionCount || 0),
    operationBaselineMs: Number(item.reviewTiming?.operationBaselineMs || 0),
    timingMethod: "expanded_detail_visible_focused_active_time_60s_idle_cap",
    finalDecision: item.reviewTiming?.finalDecision || "",
  };
  return item.reviewTiming;
}

function reviewItem(kind, id) {
  const collection = kind === "code" ? codes : themes;
  return collection.find((item) => String(item.id) === String(id));
}

function flushActiveReviewTimer() {
  if (!activeReviewTimer) return;
  const item = reviewItem(activeReviewTimer.kind, activeReviewTimer.id);
  if (item) {
    const timing = ensureReviewTiming(item);
    const elapsed = Math.max(0, Date.now() - activeReviewTimer.lastActivityAt);
    timing.totalActiveTimeMs += Math.min(elapsed, REVIEW_IDLE_LIMIT_MS);
  }
  activeReviewTimer = null;
}

function syncActiveReviewTimer(kind, item) {
  if (activeReviewTimer?.kind === kind && String(activeReviewTimer.id) === String(item?.id)) return;
  flushActiveReviewTimer();
  if (!item || document.hidden) return;
  const timing = ensureReviewTiming(item);
  timing.sessionCount += 1;
  activeReviewTimer = { kind, id: item.id, lastActivityAt: Date.now() };
}

function recordReviewActivity() {
  if (!activeReviewTimer || document.hidden) return;
  const item = reviewItem(activeReviewTimer.kind, activeReviewTimer.id);
  if (!item) return flushActiveReviewTimer();
  const now = Date.now();
  const timing = ensureReviewTiming(item);
  timing.totalActiveTimeMs += Math.min(Math.max(0, now - activeReviewTimer.lastActivityAt), REVIEW_IDLE_LIMIT_MS);
  activeReviewTimer.lastActivityAt = now;
}

function finalizeReviewTiming(item, decision) {
  if (activeReviewTimer && String(activeReviewTimer.id) === String(item.id)) flushActiveReviewTimer();
  const timing = ensureReviewTiming(item);
  timing.finalDecision = decision;
}

function editMethod(item) {
  return item?.aiDraft ? "ask_ai" : "edit_myself";
}

function appendTransformation(item, operation, method = "edit_myself", fallbackDurationMs = 0) {
  if (activeReviewTimer && String(activeReviewTimer.id) === String(item.id)) {
    recordReviewActivity();
  }
  const timing = ensureReviewTiming(item);
  const operationTime = Math.max(0, timing.totalActiveTimeMs - timing.operationBaselineMs) || Math.max(0, fallbackDurationMs);
  item.transformationHistory = [...transformationHistory(item), {
    operation,
    method,
    instruction: method === "ask_ai" ? String(item.aiDraft?.instruction || "") : "",
    ...(method === "ask_ai" ? aiTransformationMetadata(item.aiDraft) : {}),
    active_time_ms: Math.round(operationTime),
  }];
  timing.operationBaselineMs = timing.totalActiveTimeMs;
}

function appendAiThenManualTransformation(item, operation) {
  if (!item?.aiDraft) return appendTransformation(item, operation, "edit_myself");
  if (activeReviewTimer && String(activeReviewTimer.id) === String(item.id)) {
    recordReviewActivity();
  }
  const timing = ensureReviewTiming(item);
  const operationTime = Math.max(0, timing.totalActiveTimeMs - timing.operationBaselineMs);
  item.transformationHistory = [
    ...transformationHistory(item),
    {
      operation,
      method: "ask_ai",
      instruction: String(item.aiDraft.instruction || ""),
      ...aiTransformationMetadata(item.aiDraft),
      active_time_ms: 0,
    },
    {
      operation,
      method: "edit_myself",
      instruction: "",
      active_time_ms: Math.round(operationTime),
    },
  ];
  timing.operationBaselineMs = timing.totalActiveTimeMs;
}

function rollbackUnchangedAcceptedCodeAmendment(code) {
  const rollback = code?.amendmentRollback;
  if (!rollback) return false;
  if (activeReviewTimer && String(activeReviewTimer.id) === String(code.id)) flushActiveReviewTimer();
  code.title = rollback.title;
  code.quote = rollback.quote;
  code.quotes = [...rollback.quotes];
  code.excerpts = [...rollback.excerpts];
  code.source = rollback.source;
  code.reviewStatus = rollback.reviewStatus;
  code.acceptedAt = rollback.acceptedAt;
  code.version = rollback.version;
  code.versionHistory = rollback.versionHistory;
  code.transformationHistory = rollback.transformationHistory;
  code.amendmentMemo = rollback.amendmentMemo;
  code.reopenedForAmendment = rollback.reopenedForAmendment;
  if (rollback.modifiedBySenior) code.modifiedBySenior = rollback.modifiedBySenior;
  else delete code.modifiedBySenior;
  seniorCodeReview = rollback.seniorCodeReview;
  if (workflowTiming) workflowTiming.finished = rollback.workflowTimingFinished;
  const timing = ensureReviewTiming(code);
  timing.finalDecision = rollback.finalDecision;
  timing.operationBaselineMs = timing.totalActiveTimeMs;
  code.amendMode = false;
  code.editMode = "";
  code.assistMode = "";
  code.aiDraft = null;
  code.splitMode = false;
  code.splitParts = undefined;
  code.splitAssignments = undefined;
  code.selectedForMerge = false;
  codingRevision = rollback.codingRevision;
  codeReviewStage = rollback.codeReviewStage;
  codeAmendmentReturnStage = rollback.codeAmendmentReturnStage;
  delete code.amendmentRollback;
  return true;
}

function reopenAcceptedCode(code, memo) {
  const cleanMemo = String(memo || "").trim();
  const priorReviewStatus = code?.reviewStatus || "";
  if (!cleanMemo) {
    return toast(`Add a memo explaining why this ${priorReviewStatus === "rejected" ? "rejected" : "accepted"} code is being changed.`);
  }
  if (!codeReviewIsDecided(code)) return;

  const priorStage = codeReviewStage;
  const priorReturnStage = codeAmendmentReturnStage;
  code.amendmentRollback = {
    title: code.title || "",
    quote: code.quote || "",
    quotes: codeExcerptList(code),
    excerpts: codeExcerptList(code),
    source: code.source,
    reviewStatus: code.reviewStatus || "",
    acceptedAt: code.acceptedAt || "",
    version: Math.max(1, Number(code.version || 1)),
    versionHistory: codebookClone(Array.isArray(code.versionHistory) ? code.versionHistory : []),
    transformationHistory: codebookClone(Array.isArray(code.transformationHistory) ? code.transformationHistory : []),
    amendmentMemo: code.amendmentMemo || "",
    reopenedForAmendment: Boolean(code.reopenedForAmendment),
    modifiedBySenior: code.modifiedBySenior ? codebookClone(code.modifiedBySenior) : null,
    seniorCodeReview: seniorCodeReview ? codebookClone(seniorCodeReview) : null,
    workflowTimingFinished: Boolean(workflowTiming?.finished),
    finalDecision: code.reviewTiming?.finalDecision || "",
    codingRevision,
    codeReviewStage: priorStage,
    codeAmendmentReturnStage: priorReturnStage,
  };
  if (priorStage !== "review" && !codeAmendmentReturnStage) {
    codeAmendmentReturnStage = priorStage;
  }
  const priorVersion = Math.max(1, Number(code.version || 1));
  const supersededAt = new Date().toISOString();
  if (piReadOnlyMode && seniorCodeEditMode) {
    code.modifiedBySenior = {
      user_id: Number(currentUser?.id || 0),
      username: currentUser?.username || "Senior researcher",
      memo: cleanMemo,
      modified_at: supersededAt,
    };
    seniorCodeReview = {
      ...(seniorCodeReview || {}),
      status: "pending_export",
      senior_user_id: Number(currentUser?.id || 0),
      senior_username: currentUser?.username || "Senior researcher",
      student_user_id: Number(piReadOnlyContext?.student?.id || 0),
      started_at: seniorCodeReview?.started_at || supersededAt,
      updated_at: supersededAt,
      modified_code_ids: [...new Set([...(seniorCodeReview?.modified_code_ids || []), String(code.id)])],
    };
  }
  const priorSnapshot = {
    version: priorVersion,
    code_name: code.title || "",
    excerpts: codeExcerptList(code),
    review_status: code.reviewStatus,
    accepted_at: code.acceptedAt || "",
    superseded_at: supersededAt,
    change_memo: cleanMemo,
  };
  code.versionHistory = [
    ...(Array.isArray(code.versionHistory) ? code.versionHistory : []),
    priorSnapshot,
  ];
  code.version = priorVersion + 1;
  code.reviewStatus = "";
  code.reopenedForAmendment = true;
  code.amendmentMemo = cleanMemo;
  code.amendMode = false;
  code.editMode = "";
  code.splitMode = false;
  code.selectedForMerge = false;
  code.transformationHistory = [...transformationHistory(code), {
    operation: "reopened",
    method: "edit_myself",
    instruction: "",
    memo: cleanMemo,
    recorded_at: supersededAt,
    version: code.version,
    previous_version: {
      code_name: priorSnapshot.code_name,
      excerpts: priorSnapshot.excerpts,
    },
    ...(piReadOnlyMode && seniorCodeEditMode ? {
      actor_role: "senior",
      actor_username: currentUser?.username || "Senior researcher",
    } : {}),
    active_time_ms: 0,
  }];
  const timing = ensureReviewTiming(code);
  timing.finalDecision = "";
  timing.operationBaselineMs = timing.totalActiveTimeMs;
  codingRevision = Math.max(1, Number(codingRevision || 1)) + 1;
  codeReviewStage = "review";
  mergeCodeEditorOpen = false;
  codes = codes.map((item) => ({ ...item, selectedForMerge: false }));
  if (workflowTiming) workflowTiming.finished = false;
  const reopenedCode = codes.find((item) => String(item.id) === String(code.id));
  syncActiveReviewTimer("code", reopenedCode);
  expandedCodeId = code.id;
  markSaved();
  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
  toast(lastExportedCodingRevision > 0
    ? "Code reopened. This transcript must be accepted and finished again."
    : `${priorReviewStatus === "rejected" ? "Rejected code" : "Code"} reopened. Review the updated version and accept or reject it again.`);
}

function codingChangesNeedFinish() {
  return Number(lastFinishedCodingRevision || 0) < Number(codingRevision || 1);
}

function codingChangesNeedExport() {
  return !codingChangesNeedFinish()
    && Number(lastExportedCodingRevision || 0) < Number(codingRevision || 1);
}

function sameTextList(left, right) {
  const normalizedLeft = Array.isArray(left) ? left.map((value) => String(value || "").trim()) : [];
  const normalizedRight = Array.isArray(right) ? right.map((value) => String(value || "").trim()) : [];
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function sameNumberList(left, right) {
  const normalizedLeft = Array.isArray(left) ? left.map(Number) : [];
  const normalizedRight = Array.isArray(right) ? right.map(Number) : [];
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function draftTransformationEntries(operation, draft, manuallyEdited, activeTimeMs) {
  const duration = Math.round(Math.max(0, activeTimeMs));
  if (!draft) {
    return [{ operation, method: "edit_myself", instruction: "", active_time_ms: duration }];
  }
  const aiEntry = {
    operation,
    method: "ask_ai",
    instruction: String(draft.instruction || ""),
    ...aiTransformationMetadata(draft),
    active_time_ms: manuallyEdited ? 0 : duration,
  };
  return manuallyEdited
    ? [aiEntry, { operation, method: "edit_myself", instruction: "", active_time_ms: duration }]
    : [aiEntry];
}

function hasTransformation(item, operation) {
  return transformationHistory(item).some((entry) => entry.operation === operation);
}

function renderTransformationTag(item) {
  const history = transformationHistory(item);
  if (!history.length) return "";
  const methodLabels = { ask_ai: "Ask AI", ai_suggestion: "AI suggestion", edit_myself: "Edit myself" };
  const label = history.map((entry) => {
    const operation = entry.operation.charAt(0).toUpperCase() + entry.operation.slice(1);
    return methodLabels[entry.method] ? `${operation} (${methodLabels[entry.method]})` : operation;
  }).join(" → ");
  return `<span class="tag transformation-tag" title="Editing history">${escapeHTML(label)}</span>`;
}

function exportedReviewTiming(item) {
  if (activeReviewTimer && String(activeReviewTimer.id) === String(item.id)) recordReviewActivity();
  const timing = ensureReviewTiming(item);
  return {
    total_active_time_ms: Math.round(timing.totalActiveTimeMs),
    review_sessions: timing.sessionCount,
    timing_method: timing.timingMethod,
    final_decision: timing.finalDecision || item.reviewStatus || "",
  };
}

function normalizedWorkflowTiming(value = {}) {
  const compatible = value.timingMethod === WORKFLOW_TIMING_METHOD;
  return {
    totalActiveTimeMs: compatible ? Math.max(0, Number(value.totalActiveTimeMs || 0)) : 0,
    sessionCount: compatible ? Math.max(0, Number(value.sessionCount || 0)) : 0,
    lastActivityAt: 0,
    started: compatible && Boolean(value.started),
    finished: compatible && Boolean(value.finished),
    timingMethod: WORKFLOW_TIMING_METHOD,
  };
}

function resetWorkflowTiming(value = {}) {
  workflowTiming = normalizedWorkflowTiming(value);
}

function workflowTimingIsAvailable() {
  const hasWorkspace = currentWorkspacePage === "themes" ? selectedThemeTranscriptIds.length >= 2 : Boolean(activeTranscriptFile);
  return hasWorkspace && Boolean(workflowTiming?.started) && !workflowTiming?.finished;
}

function beginManualPhaseTiming() {
  if (!workflowTiming) resetWorkflowTiming();
  if (workflowTiming.finished) return;
  workflowTiming.started = true;
  startWorkflowTimingSession();
}

function finishManualPhaseTiming() {
  if (!workflowTiming?.started) return;
  recordWorkflowActivity();
  pauseWorkflowTiming();
  workflowTiming.finished = true;
}

function startWorkflowTimingSession() {
  if (!workflowTimingIsAvailable() || document.hidden || !document.hasFocus()) return;
  if (!workflowTiming) resetWorkflowTiming();
  if (!workflowTiming.lastActivityAt) {
    workflowTiming.lastActivityAt = Date.now();
    workflowTiming.sessionCount += 1;
  }
}

function recordWorkflowActivity() {
  if (!workflowTimingIsAvailable() || document.hidden || !document.hasFocus()) return;
  if (!workflowTiming) resetWorkflowTiming();
  const now = Date.now();
  if (!workflowTiming.lastActivityAt) {
    workflowTiming.lastActivityAt = now;
    workflowTiming.sessionCount += 1;
    return;
  }
  workflowTiming.totalActiveTimeMs += Math.min(
    Math.max(0, now - workflowTiming.lastActivityAt),
    REVIEW_IDLE_LIMIT_MS,
  );
  workflowTiming.lastActivityAt = now;
}

function pauseWorkflowTiming() {
  if (!workflowTiming?.lastActivityAt) return;
  const now = Date.now();
  workflowTiming.totalActiveTimeMs += Math.min(
    Math.max(0, now - workflowTiming.lastActivityAt),
    REVIEW_IDLE_LIMIT_MS,
  );
  workflowTiming.lastActivityAt = 0;
}

function savedWorkflowTiming() {
  recordWorkflowActivity();
  const timing = workflowTiming || normalizedWorkflowTiming();
  return {
    totalActiveTimeMs: Math.round(timing.totalActiveTimeMs),
    sessionCount: timing.sessionCount,
    started: timing.started,
    finished: timing.finished,
    timingMethod: timing.timingMethod,
  };
}

function exportedWorkflowTiming(scope, startEvent, endEvent) {
  const timing = savedWorkflowTiming();
  return {
    total_active_time_ms: timing.totalActiveTimeMs,
    active_sessions: timing.sessionCount,
    scope,
    started: timing.started,
    completed: timing.finished,
    start_event: startEvent,
    end_event: endEvent,
    includes_questionnaire: false,
    timing_method: timing.timingMethod,
  };
}

function activeCodeCounts() {
  const items = reviewableCodes().filter((code) => !isCalibrationCode(code));
  const activeCodes = items.filter((code) => code.reviewStatus !== "rejected");
  const aiReviewCodes = items.filter((code) => code.sourceClass !== "human");
  const humanCodes = items.filter((code) => code.sourceClass === "human");
  return {
    active: activeCodes.length,
    ai: aiReviewCodes.filter((code) => code.reviewStatus === "accepted" && code.source !== "AI+Human" && !isHumanAiMatchedResult(code)).length,
    aiHuman: aiReviewCodes.filter((code) => code.reviewStatus !== "rejected" && (
      code.source === "AI+Human" || ["revised", "split", "merged"].includes(code.reviewStatus)
    ) && !isHumanAiMatchedResult(code)).length,
    humanAi: activeCodes.filter(isHumanAiMatchedResult).length,
    merged: items.filter((code) => code.mergedFromCodes && code.reviewStatus !== "rejected").length,
    human: humanCodes.filter((code) => code.reviewStatus !== "rejected" && !isHumanAiMatchedResult(code)).length,
    rejected: items.filter((code) => code.reviewStatus === "rejected").length,
    unreviewed: items.filter((code) => !code.reviewStatus).length,
  };
}

function nextHumanCodeId() {
  return `human-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeExportCodes() {
  return reviewableCodes().filter((code) => !isCalibrationCode(code) && isExportableReviewedCode(code));
}

function aiCodes() {
  return codes.filter((code) => code.sourceClass !== "human");
}

function codeReviewIsDecided(code) {
  // revised/split/merged are legacy terminal statuses retained for saved-project compatibility.
  return ["accepted", "revised", "split", "merged", "rejected"].includes(code?.reviewStatus);
}

function codeReviewPresentation(code) {
  if (code?.reviewStatus === "rejected") {
    return { key: "rejected", label: "Rejected", symbol: "×" };
  }
  if (!codeReviewIsDecided(code)) {
    return { key: "unreviewed", label: "Not reviewed", symbol: "" };
  }
  const edited = ["revised", "split", "merged"].includes(code?.reviewStatus)
    || transformationHistory(code).some((entry) => ["revised", "split", "merged"].includes(entry?.operation));
  return edited
    ? { key: "edited", label: "Reviewed with edits", symbol: "✓" }
    : { key: "accepted", label: "Accepted", symbol: "✓" };
}

function renderCodeReviewStatus(code) {
  const status = codeReviewPresentation(code);
  return `<span class="code-review-status ${status.key}" role="img" aria-label="${status.label}" title="${status.label}">${status.symbol}</span>`;
}

function allAiCodesReviewed() {
  const items = aiCodes();
  return analysisReady && items.length > 0 && items.every(codeReviewIsDecided);
}

function aiThemes() {
  return themes.filter((theme) => theme.sourceClass !== "human" && theme.source !== "Human");
}

function themeReviewIsDecided(theme) {
  // revised/split/merged are legacy terminal statuses retained for saved-project compatibility.
  return ["accepted", "revised", "split", "merged", "rejected"].includes(theme?.reviewStatus);
}

function renderThemeReviewStatus(theme) {
  const reviewed = themeReviewIsDecided(theme);
  const label = reviewed ? "Reviewed" : "Not reviewed";
  return `<span class="code-review-status theme-review-status ${reviewed ? "accepted" : "unreviewed"}" role="img" aria-label="${label}" title="${label}">${reviewed ? "✓" : ""}</span>`;
}

function finalReviewedThemes(themeItems = themes) {
  const reviewedThemes = (Array.isArray(themeItems) ? themeItems : [])
    .filter((theme) => theme.reviewStatus !== "rejected" && themeReviewIsDecided(theme));
  if (themeItems !== themes) return reviewedThemes;
  const existingIds = new Set(reviewedThemes.map((theme) => String(theme.id || "")).filter(Boolean));
  const includedEarlierHumanThemes = preGenerationHumanThemes.filter((theme) => (
    theme.includedAfterAiReview && !existingIds.has(String(theme.id || ""))
  ));
  return [...reviewedThemes, ...includedEarlierHumanThemes];
}


function advanceCodeReviewStageIfComplete() {
  const seniorItems = piReadOnlyMode && seniorCodeEditMode
    ? reviewableCodes().filter((code) => !isCalibrationCode(code) && !(
      isPreAiManualHumanCode(code) && !code.includedAfterAiReview
    ))
    : null;
  const reviewComplete = seniorItems
    ? seniorItems.every(codeReviewIsDecided)
    : allAiCodesReviewed();
  if (codeReviewStage !== "review" || !reviewComplete) return;
  if (codeAmendmentReturnStage) {
    codeReviewStage = codeAmendmentReturnStage;
    codeAmendmentReturnStage = "";
    if (codeReviewStage === "complete") {
      requestAnimationFrame(() => {
        document.getElementById("finishCodingReminderBtn")?.classList.add("export-ready-cue");
      });
      toast(codingChangesNeedFinish()
        ? "Updated coding is complete. Finish changes to save this revision."
        : "Updated coding is complete.");
    }
  } else {
    resetCodeMergeSuggestions();
    codeReviewStage = "merge-choice";
  }
}

function resetCodeMergeSuggestions() {
  codeMergeSuggestedName = "";
  codeMergeSuggestions = [];
  codeMergeSuggestionStatus = "idle";
  codeMergeSuggestionError = "";
  dismissedCodeMergeSuggestionIds = new Set();
}

function revealNextCodeMergeSuggestion() {
  requestAnimationFrame(() => {
    const nextSuggestion = document.querySelector(".code-merge-suggestion-card");
    const target = nextSuggestion || document.querySelector(".code-merge-suggestions-state");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function mergeSuggestionEligibleCodes() {
  return reviewableCodes().filter((code) => (
    code.sourceClass !== "human"
    && code.reviewStatus !== "rejected"
    && codeReviewIsDecided(code)
    && !isCalibrationCode(code)
  ));
}

async function ensureCodeMergeSuggestions() {
  if (codeReviewStage !== "merge-choice" || codeMergeSuggestionStatus !== "idle") return;
  const eligibleCodes = mergeSuggestionEligibleCodes();
  if (piReadOnlyMode || eligibleCodes.length < 2) {
    codeMergeSuggestionStatus = "ready";
    renderCodes();
    return;
  }
  const requestIds = eligibleCodes.map((code) => String(code.id));
  codeMergeSuggestionStatus = "loading";
  codeMergeSuggestionError = "";
  renderCodes();
  try {
    const result = await apiFetch("/api/code-merge-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: eligibleCodes.map((code) => ({
          id: String(code.id),
          title: code.title || "Untitled code",
          excerpts: codeExcerptList(code),
          transcript_id: activeTranscriptFile?.id || "current-transcript",
        })),
      }),
    });
    const currentIds = mergeSuggestionEligibleCodes().map((code) => String(code.id));
    if (requestIds.join("|") !== currentIds.join("|")) {
      resetCodeMergeSuggestions();
      return ensureCodeMergeSuggestions();
    }
    codeMergeSuggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    codeMergeSuggestionStatus = "ready";
  } catch (error) {
    codeMergeSuggestionStatus = "error";
    codeMergeSuggestionError = error.message || "Merge suggestions could not be generated.";
  }
  renderCodes();
}

function renderCodeMergeSuggestionChoice(activeAiCodes) {
  if (codeMergeSuggestionStatus === "idle") {
    requestAnimationFrame(ensureCodeMergeSuggestions);
  }
  if (codeMergeSuggestionStatus === "loading" || codeMergeSuggestionStatus === "idle") {
    return `<article class="code-workflow-prompt code-merge-suggestions-state code-merge-suggestions-loading" role="status"><strong>Checking for possible similar codes…</strong><p>Semantic similarity is being calculated from the reviewed code names and supporting excerpts.</p><span>Waiting…</span></article>`;
  }
  if (codeMergeSuggestionStatus === "error") {
    return `<article class="code-workflow-prompt code-merge-suggestions-state"><strong>Merge suggestions are unavailable</strong><p>${escapeHTML(codeMergeSuggestionError)}</p><div><button class="secondary-btn" id="retryCodeMergeSuggestionsBtn" type="button">Try again</button><button class="primary-btn" id="startCodeMergeBtn" type="button" ${activeAiCodes.length < 2 ? "disabled" : ""}>Select manually</button><button class="secondary-btn" id="skipCodeMergeBtn" type="button">No merges</button></div></article>`;
  }
  const visibleSuggestions = codeMergeSuggestions.filter((suggestion) => !dismissedCodeMergeSuggestionIds.has(String(suggestion.id)));
  const suggestionCards = visibleSuggestions.map((suggestion) => {
    const members = (suggestion.member_ids || []).map((id, index) => {
      const sourceCode = codes.find((code) => String(code.id) === String(id));
      return {
        id: String(id),
        title: suggestion.codes?.[index] || sourceCode?.title || "Untitled code",
        excerpts: sourceCode ? codeExcerptList(sourceCode) : [],
      };
    });
    const hasExactName = (suggestion.match_types || []).includes("same_name");
    const minScore = Math.round(Number(suggestion.similarity_min || 0) * 100);
    const maxScore = Math.round(Number(suggestion.similarity_max || 0) * 100);
    const scoreLabel = hasExactName
      ? "Includes an exact code-name match"
      : `Similarity ${minScore === maxScore ? `${minScore}%` : `${minScore}–${maxScore}%`}`;
    return `<article class="code-merge-suggestion-card">
      <div class="code-merge-suggestion-heading"><span class="code-merge-suggestion-icon" aria-hidden="true">✦</span><span><strong>Possible overlap</strong><small>${members.length} codes · ${escapeHTML(scoreLabel)}</small></span></div>
      <div class="code-merge-suggestion-members">${members.map((member) => `<div class="code-merge-suggestion-member">
        <button class="code-merge-suggestion-member-toggle" data-code-merge-member-toggle type="button" aria-expanded="false">
          <span>${escapeHTML(member.title)}</span><small>${member.excerpts.length} excerpt${member.excerpts.length === 1 ? "" : "s"}</small><b aria-hidden="true">+</b>
        </button>
        <div class="code-merge-suggestion-excerpts" data-code-merge-member-excerpts hidden>
          <strong>Associated excerpts</strong>
          ${member.excerpts.length ? `<ol>${member.excerpts.map((excerpt) => `<li>“${escapeHTML(excerpt)}”</li>`).join("")}</ol>` : `<p>No supporting excerpts are available.</p>`}
        </div>
      </div>`).join("")}</div>
      <label class="code-merge-suggested-result"><span>Merged code name</span><input data-code-merge-suggested-name value="${escapeHTML(suggestion.suggested_name || members[0]?.title || "Merged code")}" maxlength="160" aria-label="Merged code name" /></label>
      <p>Edit the proposed name if needed. Using the suggestion combines the supporting excerpts and accepts the merged result.</p>
      <div class="code-merge-suggestion-actions"><button class="secondary-btn" data-dismiss-code-merge-suggestion="${escapeHTML(suggestion.id)}" type="button">Dismiss</button><button class="secondary-btn" data-use-code-merge-suggestion="${escapeHTML(suggestion.id)}" type="button">Use suggested merge</button></div>
    </article>`;
  }).join("");
  const message = visibleSuggestions.length
    ? `<strong>${visibleSuggestions.length} possible merge group${visibleSuggestions.length === 1 ? "" : "s"} found</strong><p>Review the grouped codes, edit the proposed name if needed, then use or dismiss each suggestion.</p><div class="code-merge-suggestion-list">${suggestionCards}</div>`
    : `<strong>No remaining merge suggestions</strong><p>You can still select codes manually, or continue without merging.</p>`;
  const completionActions = visibleSuggestions.length ? "" : `<div class="code-merge-choice-actions"><button class="secondary-btn" id="startCodeMergeBtn" type="button" ${activeAiCodes.length < 2 ? "disabled" : ""}>Select additional codes to be merged</button><button class="secondary-btn" id="skipCodeMergeBtn" type="button">No merge</button></div>`;
  return `<article class="code-workflow-prompt code-merge-suggestions-state">${message}${completionActions}</article>`;
}

function changeCodeReviewStage(stage) {
  const justCompleted = stage === "complete" && codeReviewStage !== "complete";
  if (activeReviewTimer?.kind === "code") flushActiveReviewTimer();
  expandedCodeId = null;
  codeReviewStage = stage;
  if (stage === "unmatched-human") manualCodeReuseFinished = false;
  if (stage !== "merge") {
    mergeCodeEditorOpen = false;
    codeMergeSuggestedName = "";
    seniorCodeMergeMemo = "";
    codes = codes.map((code) => ({ ...code, selectedForMerge: false }));
  }
  if (stage !== "additional") newCodeEditorOpen = false;
  if (!(piReadOnlyMode && seniorCodeEditMode)
      || codingChangesNeedFinish()
      || seniorCodeReview?.status === "pending_export") {
    markSaved();
  }
  renderCodes();
  if (justCompleted) {
    document.getElementById("finishCodingReminderBtn")?.classList.add("export-ready-cue");
    toast("Coding complete. Click Finish to save this transcript's results.", 6000);
  }
}

function allAiThemesReviewed() {
  const items = aiThemes();
  return items.length > 0 && items.every(themeReviewIsDecided);
}

function reopenAcceptedTheme(theme, memo) {
  const cleanMemo = String(memo || "").trim();
  if (!cleanMemo) return toast("Add a memo explaining why this accepted theme is being changed.");
  if (!themeReviewIsDecided(theme) || theme.reviewStatus === "rejected" || (isHumanTheme(theme) && !(piReadOnlyMode && seniorThemeEditMode))) return;

  const priorStage = themeReviewStage;
  if (priorStage !== "review" && !themeAmendmentReturnStage) {
    themeAmendmentReturnStage = priorStage;
  }
  const priorVersion = Math.max(1, Number(theme.version || 1));
  const supersededAt = new Date().toISOString();
  if (piReadOnlyMode && seniorThemeEditMode) {
    theme.modifiedBySenior = {
      user_id: Number(currentUser?.id || 0),
      username: currentUser?.username || "Senior researcher",
      memo: cleanMemo,
      modified_at: supersededAt,
    };
    seniorThemeReview = {
      ...(seniorThemeReview || {}),
      status: "pending_export",
      senior_user_id: Number(currentUser?.id || 0),
      senior_username: currentUser?.username || "Senior researcher",
      student_user_id: Number(piReadOnlyContext?.student?.id || 0),
      started_at: seniorThemeReview?.started_at || supersededAt,
      updated_at: supersededAt,
      modified_theme_ids: [...new Set([...(seniorThemeReview?.modified_theme_ids || []), String(theme.id)])],
    };
  }
  const priorSnapshot = {
    version: priorVersion,
    theme_name: theme.title || "",
    definition: theme.rationale || "",
    codes: codebookClone(theme.codes || []),
    review_status: theme.reviewStatus,
    accepted_at: theme.acceptedAt || "",
    superseded_at: supersededAt,
    change_memo: cleanMemo,
  };
  theme.versionHistory = [
    ...(Array.isArray(theme.versionHistory) ? theme.versionHistory : []),
    priorSnapshot,
  ];
  theme.version = priorVersion + 1;
  theme.reviewStatus = "";
  theme.source = "AI+Human";
  theme.reopenedForAmendment = true;
  theme.amendmentMemo = cleanMemo;
  theme.amendMode = false;
  theme.editMode = "";
  theme.splitMode = false;
  theme.selectedForMerge = false;
  theme.transformationHistory = [...transformationHistory(theme), {
    operation: "reopened",
    method: "edit_myself",
    instruction: "",
    memo: cleanMemo,
    recorded_at: supersededAt,
    version: theme.version,
    previous_version: {
      theme_name: priorSnapshot.theme_name,
      definition: priorSnapshot.definition,
      codes: priorSnapshot.codes,
    },
    ...(piReadOnlyMode && seniorThemeEditMode ? {
      actor_role: "senior",
      actor_username: currentUser?.username || "Senior researcher",
    } : {}),
    active_time_ms: 0,
  }];
  const timing = ensureReviewTiming(theme);
  timing.finalDecision = "";
  timing.operationBaselineMs = timing.totalActiveTimeMs;
  themeRevision = Math.max(1, Number(themeRevision || 1)) + 1;
  themeReviewStage = "review";
  mergeThemeEditorOpen = false;
  markSaved();
  renderThemes();
  toast("Theme reopened. Revise or split it, then accept the updated version.");
}

function themeChangesNeedFinish() {
  return Number(lastFinishedThemeRevision || 0) < Number(themeRevision || 1);
}

function themeChangesNeedExport() {
  return !themeChangesNeedFinish()
    && Number(lastExportedThemeRevision || 0) < Number(themeRevision || 1);
}

function advanceThemeReviewStageIfComplete() {
  if (themeReviewStage === "review" && allAiThemesReviewed()) {
    if (themeAmendmentReturnStage) {
      themeReviewStage = themeAmendmentReturnStage;
      themeAmendmentReturnStage = "";
      if (themeReviewStage === "complete") {
        requestAnimationFrame(() => {
          document.getElementById("finishThemeReminderBtn")?.classList.add("export-ready-cue");
        });
        toast("Updated theme review is complete. Finish changes to save this revision.");
      }
    } else themeReviewStage = "merge-choice";
  }
  if (themeReviewStage === "merge-review" && aiThemes().every(themeReviewIsDecided)) themeReviewStage = "merge";
}

function changeThemeReviewStage(stage) {
  const justCompleted = stage === "complete" && themeReviewStage !== "complete";
  if (activeReviewTimer?.kind === "theme") flushActiveReviewTimer();
  expandedThemeId = null;
  themeReviewStage = stage;
  if (stage === "additional") {
    humanThemesFinished = false;
  }
  if (stage === "complete") humanThemesFinished = true;
  if (stage !== "merge") {
    mergeThemeEditorOpen = false;
    themes = themes.map((theme) => ({ ...theme, selectedForMerge: false }));
  }
  newThemeEditorOpen = false;
  if (!(piReadOnlyMode && seniorThemeEditMode && !seniorThemeReview?.modified_theme_ids?.length)) markSaved();
  renderThemes();
  if (justCompleted) {
    document.getElementById("finishThemeReminderBtn")?.classList.add("export-ready-cue");
    toast("Theme review complete. Click Finish to save the results.", 6000);
  }
}

function isHumanTheme(theme) {
  return theme?.sourceClass === "human" || theme?.source === "Human";
}

function themeCardSourceClass(theme) {
  if (theme?.humanAiThemeNameDecision || isHumanTheme(theme)) return "source-human-ai";
  if (theme?.source === "AI+Human" || ["revised", "split", "merged"].includes(theme?.reviewStatus)) return "source-ai-human";
  return "source-ai";
}

function initializeHumanAiThemeMatches(matches = []) {
  preGenerationHumanThemes.forEach((theme) => {
    theme.includedAfterAiReview = false;
    delete theme.matchedAiThemeId;
  });
  aiThemes().forEach((theme) => {
    delete theme.matchedHumanThemeId;
    delete theme.humanAiThemeMatchScore;
    delete theme.humanAiThemeNameDecision;
  });
  matches.forEach((match) => {
    const aiTheme = aiThemes()[Number(match?.ai_index)];
    const humanTheme = preGenerationHumanThemes[Number(match?.human_index)];
    const score = Number(match?.similarity || 0);
    if (!aiTheme || !humanTheme || score < 0.8 || aiTheme.matchedHumanThemeId != null || humanTheme.matchedAiThemeId != null) return;
    aiTheme.matchedHumanThemeId = humanTheme.id;
    aiTheme.humanAiThemeMatchScore = score;
    aiTheme.humanAiThemeNameDecision = "";
    aiTheme.originalAiTitle = aiTheme.title;
    humanTheme.matchedAiThemeId = aiTheme.id;
  });
  return unresolvedHumanAiThemeMatches().length;
}

function unresolvedHumanAiThemeMatches() {
  return aiThemes().filter((theme) => (
    theme.matchedHumanThemeId != null
    && !theme.humanAiThemeNameDecision
    && preGenerationHumanThemes.some((humanTheme) => String(humanTheme.id) === String(theme.matchedHumanThemeId))
  ));
}

function resolveHumanAiThemeMatch(aiThemeId, choice) {
  const aiTheme = themes.find((theme) => String(theme.id) === String(aiThemeId));
  const humanTheme = preGenerationHumanThemes.find((theme) => String(theme.id) === String(aiTheme?.matchedHumanThemeId));
  if (!aiTheme || !humanTheme || !["ai", "human"].includes(choice)) return;
  aiTheme.humanAiThemeNameDecision = choice;
  if (choice === "human") aiTheme.title = humanTheme.title || aiTheme.title;
  else aiTheme.title = aiTheme.originalAiTitle || aiTheme.title;
  if (!unresolvedHumanAiThemeMatches().length) themeReviewStage = "review";
  markSaved();
  renderThemes();
}

function isPreGenerationHumanTheme(theme) {
  return isHumanTheme(theme);
}

function safeDownloadBaseName(name) {
  const fallback = "transcript";
  return String(name || fallback)
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

function downloadExportFile(file) {
  const blob = new Blob([file.content], { type: file.content_type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function jsonExportFile(data, filename) {
  return {
    filename,
    content_type: "application/json; charset=utf-8",
    content: JSON.stringify(data, null, 2),
  };
}

function csvExportFile(rows, filename) {
  return {
    filename,
    content_type: "text/csv; charset=utf-8",
    content: rows.map((row) => row.map(csvCell).join(",")).join("\n"),
  };
}

async function archiveExportFiles(scope, transcriptId, files) {
  if (!currentProject?.id) throw new Error("No active project is available for this export.");
  return apiFetch(`/api/projects/${currentProject.id}/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, transcript_id: transcriptId || null, files }),
  });
}

async function archiveFinishedResultFiles(phase, revision, files) {
  if (!currentProject?.id || !activeTranscriptFile?.id) {
    throw new Error("No active project transcript is available.");
  }
  return apiFetch(`/api/projects/${currentProject.id}/transcripts/${activeTranscriptFile.id}/finished-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phase,
      revision,
      files,
      ...(phase === "coding" ? {
        codebook_settings: {
          azure_endpoint: document.getElementById("azureEndpoint").value.trim(),
          api_key: document.getElementById("apiKey").value.trim(),
          api_version: document.getElementById("apiVersion").value.trim(),
          model: document.getElementById("model").value.trim(),
        },
      } : {}),
    }),
  });
}

async function archiveProjectFinishedResultFiles(phase, revision, files = []) {
  if (!currentProject?.id) throw new Error("No active project is available.");
  return apiFetch(`/api/projects/${currentProject.id}/finished-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phase,
      revision,
      codebook_id: latestCodebookId,
      files,
    }),
  });
}

function finishedResultMetadata(savedAt) {
  return {
    account: { username: currentUser?.username || "" },
    project: { id: currentProject?.id || "", name: currentProject?.name || "" },
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    transcript: { file_name: activeTranscriptFile?.name || "" },
    coding_revision: Math.max(1, Number(codingRevision || 1)),
    finished_at: savedAt,
  };
}

function humanCodingFinishedResultFile(savedAt = new Date().toISOString()) {
  const baseName = `${safeDownloadBaseName(activeTranscriptFile?.name || "")}_ReflexCoTI`;
  const humanCodes = codes.filter((code) => isPreAiManualHumanCode(code) && code.reviewStatus !== "rejected");
  return jsonExportFile({
    ...finishedResultMetadata(savedAt),
    user_timing: exportedWorkflowTiming("human_manual_coding", "first_excerpt_selection", "finish_human_coding_click"),
    codes: humanCodes.map(humanCodeRecord),
  }, `${baseName}_Human_version.json`);
}

function codingFinishedResultFiles(savedAt = new Date().toISOString()) {
  const baseName = `${safeDownloadBaseName(activeTranscriptFile?.name || "")}_ReflexCoTI`;
  const metadata = finishedResultMetadata(savedAt);
  const originalCodes = (originalAiCodes.length ? originalAiCodes : aiCodes())
    .filter((code) => !isCalibrationCode(code));
  const humanCodes = codes.filter((code) => isPreAiManualHumanCode(code) && code.reviewStatus !== "rejected");
  return [
    jsonExportFile({ ...metadata, codes: activeExportCodes().map(simpleCodeRecord) }, `${baseName}.json`),
    jsonExportFile({ ...metadata, codes: originalCodes.map(originalAiCodeRecord) }, `${baseName}_AI_original.json`),
    jsonExportFile({
      ...metadata,
      user_timing: exportedWorkflowTiming("human_manual_coding", "first_excerpt_selection", "finish_human_coding_click"),
      codes: humanCodes.map(humanCodeRecord),
    }, `${baseName}_Human_version.json`),
    csvExportFile(
      codingQuestionnaireCsvRows(codingQuestionnaireResponses, activeTranscriptFile?.name || ""),
      `${baseName}_questionnaire.csv`,
    ),
  ];
}

async function exportSeniorCodingRevision(file) {
  if (!piReadOnlyMode || !seniorCodeEditMode || !piReadOnlyContext?.student?.id) {
    throw new Error("Senior code revision context is unavailable.");
  }
  const previousExportedRevision = lastExportedCodingRevision;
  const previousExportedAt = codingExportedAt;
  const exportTimestamp = new Date().toISOString();
  lastExportedCodingRevision = Math.max(1, Number(codingRevision || 1));
  codingExportedAt = exportTimestamp;
  seniorCodeReview = {
    ...(seniorCodeReview || {}),
    status: "pending_export",
    senior_user_id: Number(currentUser?.id || 0),
    senior_username: currentUser?.username || "Senior researcher",
    student_user_id: Number(piReadOnlyContext.student.id),
    updated_at: exportTimestamp,
  };
  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  try {
    const result = await apiFetch(
      `/api/pi/students/${piReadOnlyContext.student.id}/projects/${currentProject.id}/transcripts/${activeTranscriptFile.id}/code-revision/export`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: transcriptAnalysisSnapshot(), file }),
      },
    );
    seniorCodeReview = result.snapshot?.seniorCodeReview || seniorCodeReview;
    lastExportedCodingRevision = Number(result.snapshot?.lastExportedCodingRevision || codingRevision);
    codingExportedAt = String(result.snapshot?.codingExportedAt || exportTimestamp);
    const downloadedFile = result.file
      ? { filename: result.file.filename, content_type: "application/json; charset=utf-8", content: result.file.content }
      : file;
    downloadExportFile(downloadedFile);
    const metadata = projectFiles.find((item) => item.id === activeTranscriptFile.id);
    if (metadata) metadata.analysis_status = "finished";
    lastSavedAt = new Date((result.updated_at || Date.now() / 1000) * 1000);
    renderLastSaved();
    renderCodes();
    toast("Senior coding revision downloaded.");
    openExportPrompt("codes");
  } catch (error) {
    lastExportedCodingRevision = previousExportedRevision;
    codingExportedAt = previousExportedAt;
    seniorCodeReview = { ...(seniorCodeReview || {}), status: "pending_export" };
    renderCodes();
    throw error;
  }
}

async function exportSeniorThemeRevision(file) {
  if (!piReadOnlyMode || !seniorThemeEditMode || !piReadOnlyContext?.student?.id) {
    throw new Error("Senior theme revision context is unavailable.");
  }
  const previousRevision = lastExportedThemeRevision;
  const previousExportedAt = themesExportedAt;
  const exportTimestamp = new Date().toISOString();
  lastExportedThemeRevision = Math.max(1, Number(themeRevision || 1));
  themesExportedAt = exportTimestamp;
  seniorThemeReview = {
    ...(seniorThemeReview || {}), status: "pending_export",
    senior_user_id: Number(currentUser?.id || 0),
    senior_username: currentUser?.username || "Senior researcher",
    student_user_id: Number(piReadOnlyContext.student.id), updated_at: exportTimestamp,
  };
  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  try {
    const result = await apiFetch(
      `/api/pi/students/${piReadOnlyContext.student.id}/projects/${currentProject.id}/theme-revision/export`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: themeAnalysisSnapshot(), file }) },
    );
    seniorThemeReview = result.snapshot?.seniorThemeReview || seniorThemeReview;
    lastExportedThemeRevision = Number(result.snapshot?.lastExportedThemeRevision || themeRevision);
    themesExportedAt = String(result.snapshot?.themesExportedAt || exportTimestamp);
    projectThemeAnalysis = { ...(projectThemeAnalysis || {}), snapshot: result.snapshot, can_modify_themes: true };
    downloadExportFile(result.file
      ? { filename: result.file.filename, content_type: "application/json; charset=utf-8", content: result.file.content }
      : file);
    lastSavedAt = new Date((result.updated_at || Date.now() / 1000) * 1000);
    renderLastSaved();
    renderThemes();
    toast("Senior theme revision downloaded.");
    openExportPrompt("themes");
  } catch (error) {
    lastExportedThemeRevision = previousRevision;
    themesExportedAt = previousExportedAt;
    seniorThemeReview = { ...(seniorThemeReview || {}), status: "pending_export" };
    renderThemes();
    throw error;
  }
}

function nextThemeId() {
  return `theme-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function themeSupportItems(value) {
  const seen = new Set();
  return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean).filter((item) => {
    const key = normalizedCodeKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function supportItemsToThemeCodes(supportItems) {
  return supportItems.map((item, index) => ({
    codeName: item || `Human code ${index + 1}`,
    quote: "",
    quotes: [],
    transcriptIds: transcriptIdsForCodeName(item),
  }));
}

function normalizeThemeSource(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function codeNameFromExport(code) {
  return normalizeThemeSource(code?.["code name"] || code?.title || code?.code || "");
}

function quotesFromExport(code) {
  const rawItems = [];
  if (Array.isArray(code?.excerpts)) rawItems.push(...code.excerpts);
  if (Array.isArray(code?.quotes)) rawItems.push(...code.quotes);
  if (Array.isArray(code?.quote)) rawItems.push(...code.quote);
  if (code?.quote && !Array.isArray(code.quote)) rawItems.push(code.quote);
  if (code?.clue) rawItems.push(code.clue);
  if (code?.excerpt) rawItems.push(code.excerpt);
  return dedupeExcerpts(rawItems);
}

function normalizedCodeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizedCodeKey(value).split(" ").filter(Boolean));
}

function tokenSimilarity(left, right) {
  const leftNorm = normalizedCodeKey(left);
  const rightNorm = normalizedCodeKey(right);
  if (!leftNorm || !rightNorm) return 0;
  if (leftNorm === rightNorm) return 1;
  if (leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)) return 0.92;
  const leftTokens = tokenSet(leftNorm);
  const rightTokens = tokenSet(rightNorm);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / union.size;
}

function codebookCreation(codeRows, threshold = 0.8) {
  const codebook = {
    retrieval_mode: "code_clue",
    creation_method: "uploaded_reflexcoti_exports_threshold",
    threshold,
    entries: [],
  };

  codeRows.forEach((row) => {
    const codeName = normalizeThemeSource(row.codeName);
    const clue = normalizeThemeSource(row.quote);
    const transcriptId = normalizeThemeSource(row.transcript || "uploaded_transcript");
    if (!codeName || !clue) return;

    let matchedEntry = null;
    let bestScore = 0;
    codebook.entries.forEach((entry) => {
      const score = tokenSimilarity(codeName, entry["initial code"]);
      if (score > bestScore) {
        bestScore = score;
        matchedEntry = entry;
      }
    });

    if (!matchedEntry || bestScore < threshold) {
      matchedEntry = {
        "initial code": codeName,
        transcript_ids: [],
        clues: [],
      };
      codebook.entries.push(matchedEntry);
    }

    if (!matchedEntry.transcript_ids.includes(transcriptId)) {
      matchedEntry.transcript_ids.push(transcriptId);
    }
    if (!matchedEntry.clues.includes(clue)) {
      matchedEntry.clues.push(clue);
    }
  });

  return codebook;
}

function codebookEntriesToThemeInputs(codebook) {
  return (codebook?.entries || []).flatMap((entry) => {
    const codeName = entry["initial code"] || "";
    const transcript = (entry.transcript_ids || []).join(", ");
    return (entry.clues || []).map((clue) => ({
      codeName,
      quote: clue,
      source: "Codebook",
      transcript,
    }));
  });
}

function uniqueTranscriptCount(entry) {
  return new Set(entry?.transcript_ids || []).size;
}

function filteredCodebookItems() {
  return (latestCodebook?.entries || []).map((entry, index) => ({ entry, index }));
}

function themeCodebookEntries() {
  return filteredCodebookItems().map(({ entry }) => entry);
}

function codebookItemIncluded(entryIndex) {
  return Boolean(latestCodebook?.entries?.[entryIndex]);
}

function transcriptIdsForCodeName(codeName) {
  const normalizedName = normalizedCodeKey(codeName);
  const entry = (latestCodebook?.entries || []).find((item) => normalizedCodeKey(item?.["initial code"]) === normalizedName);
  return Array.isArray(entry?.transcript_ids) ? entry.transcript_ids : [];
}

function themeBucketForCode(codeName, quote) {
  const text = `${codeName} ${quote}`.toLowerCase();
  const buckets = [
    ["Healthcare communication and navigation", ["provider", "doctor", "clinic", "healthcare", "appointment", "diagnosis", "medical", "care team", "portal"]],
    ["Family coordination and support", ["family", "sister", "brother", "children", "network", "support", "coordination", "group", "chat"]],
    ["Caregiver role and emotional work", ["caregiver", "guilt", "burden", "stress", "emotion", "responsibility", "role", "duty"]],
    ["Dementia symptoms and safety", ["memory", "symptom", "alzheimer", "dementia", "safety", "lost", "decline", "risk"]],
    ["Care resources and practical strategies", ["resource", "tool", "service", "help", "manage", "strategy", "transport", "schedule"]],
  ];
  const match = buckets.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return match ? match[0] : "Everyday caregiving experiences";
}

function themeSummaryForCodes(items) {
  const names = [...new Set(items.map((item) => item.codeName).filter(Boolean))].slice(0, 4);
  if (names.length === 0) return "Generated from uploaded coding exports.";
  return `Generated from codes including ${names.join(", ")}.`;
}

function splitCodeGroups(codes, partCount) {
  const count = Math.max(1, partCount);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * codes.length) / count);
    const end = Math.floor(((index + 1) * codes.length) / count);
    return codes.slice(start, end);
  });
}

function themeSplitCodeGroups(theme, partCount) {
  const assignments = Array.isArray(theme.splitAssignments) ? theme.splitAssignments : [];
  const groups = Array.from({ length: partCount }, () => []);
  if (assignments.length !== theme.codes.length) return splitCodeGroups(theme.codes, partCount);
  theme.codes.forEach((code, index) => {
    const assignment = Number(assignments[index]);
    if (Number.isInteger(assignment) && assignment >= 0 && assignment < partCount) {
      groups[assignment].push(code);
    }
  });
  return groups;
}

function defaultThemeSplitParts(theme, count = 2) {
  const partCount = Math.max(2, Math.min(count, Math.max(2, theme.codes.length)));
  return Array.from({ length: partCount }, () => ({
    title: "",
    rationale: "",
  }));
}

function generateCandidateThemesFromCodes(items) {
  const grouped = new Map();
  items.forEach((item) => {
    const bucket = themeBucketForCode(item.codeName, item.quote);
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket).push(item);
  });
  return [...grouped.entries()].map(([title, groupedCodes]) => ({
    id: nextThemeId(),
    title,
    rationale: themeSummaryForCodes(groupedCodes),
    codes: groupedCodes,
    source: "AI",
    reviewStatus: "",
    selectedForMerge: false,
    splitMode: false,
    editMode: false,
  }));
}

function themeCounts() {
  const includedEarlierHumanThemes = preGenerationHumanThemes.filter((theme) => theme.includedAfterAiReview);
  const counts = {
    accepted: 0,
    human: includedEarlierHumanThemes.length,
    revised: 0,
    split: 0,
    merged: 0,
    rejected: 0,
    unreviewed: 0,
  };
  themes.forEach((theme) => {
    if (theme.reviewStatus === "rejected") counts.rejected += 1;
    else if (!themeReviewIsDecided(theme)) counts.unreviewed += 1;
    else if (isHumanTheme(theme)) counts.human += 1;
    else if (hasTransformation(theme, "merged")) counts.merged += 1;
    else if (hasTransformation(theme, "split")) counts.split += 1;
    else if (hasTransformation(theme, "revised") || hasTransformation(theme, "reopened") || theme.source === "AI+Human") counts.revised += 1;
    else counts.accepted += 1;
  });
  return {
    ...counts,
    total: themes.length + includedEarlierHumanThemes.length,
    active: themes.length - counts.rejected + includedEarlierHumanThemes.length,
  };
}

function themeCodeRecord(code) {
  return {
    "code name": code.codeName || "",
    excerpts: (code.quotes && code.quotes.length ? code.quotes : [code.quote]).filter(Boolean),
    transcript_ids: code.transcriptIds || [],
  };
}

function themeSource(theme) {
  if (theme.sourceClass === "human" || theme.source === "Human") return "Human";
  return theme.source === "AI+Human" || ["revised", "split", "merged"].includes(theme.reviewStatus)
    ? "AI+Human"
    : "AI";
}

function themeExportRecord(theme, forceSource = "") {
  return {
    "theme name": theme.title || "",
    source: forceSource || themeSource(theme),
    ...(theme.sourceAgent ? {
      "source agent": theme.sourceAgent,
      "source agent label": theme.sourceAgentLabel || theme.sourceAgent.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    } : {}),
    definition: theme.rationale || "",
    ...(forceSource ? {} : {
      "editing history": transformationHistory(theme),
      "review timing": exportedReviewTiming(theme),
      version: Math.max(1, Number(theme.version || 1)),
      "version history": Array.isArray(theme.versionHistory) ? theme.versionHistory : [],
      "latest amendment memo": String(theme.amendmentMemo || ""),
      "peer suggestion history": Array.isArray(theme.peerSuggestionHistory) ? theme.peerSuggestionHistory : [],
      ...(theme.modifiedBySenior ? {
        "modified by senior": {
          username: String(theme.modifiedBySenior.username || "Senior researcher"),
          memo: String(theme.modifiedBySenior.memo || ""),
          modified_at: String(theme.modifiedBySenior.modified_at || ""),
        },
      } : {}),
    }),
    codes: (theme.codes || []).map(themeCodeRecord),
  };
}

function humanThemeRecord(theme) {
  return {
    "theme name": theme.title || "",
    source: "Human",
    definition: theme.rationale || "",
    codes: (theme.codes || []).map(themeCodeRecord),
    created_before_ai_generation: Boolean(theme.createdBeforeAiGeneration),
  };
}

function simpleCodeRecord(code) {
  let source = "AI";
  if (isHumanAiMatchedResult(code)) {
    source = "Human & AI";
  } else if (code.sourceClass === "human") {
    source = "Human";
  } else if (code.source === "AI+Human" || ["revised", "merged"].includes(code.reviewStatus)) {
    source = "AI+Human";
  }
  return {
    "code id": String(code.id || ""),
    "code name": code.title || "",
    source,
    "editing history": transformationHistory(code),
    "review timing": exportedReviewTiming(code),
    version: Math.max(1, Number(code.version || 1)),
    "version history": Array.isArray(code.versionHistory) ? code.versionHistory : [],
    "latest amendment memo": String(code.amendmentMemo || ""),
    "peer suggestion history": Array.isArray(code.peerSuggestionHistory) ? code.peerSuggestionHistory : [],
    ...(code.modifiedBySenior ? {
      "modified by senior": {
        username: String(code.modifiedBySenior.username || "Senior researcher"),
        memo: String(code.modifiedBySenior.memo || ""),
        modified_at: String(code.modifiedBySenior.modified_at || ""),
      },
    } : {}),
    excerpts: codeExcerptList(code),
  };
}

function humanCodeRecord(code) {
  return {
    "code name": code.title || "",
    source: "Human",
    excerpts: codeExcerptList(code),
    transcript_lines: Array.isArray(code.transcriptLines) ? code.transcriptLines : [],
    created_from_selection: Boolean(code.createdFromSelection),
  };
}

function originalAiCodeRecord(code) {
  return {
    "code name": code.title || "",
    source: "AI",
    excerpts: codeExcerptList(code),
  };
}

function updateWordCount() {
  if (currentWorkspacePage === "themes") {
    updateFooterStats();
    return;
  }
  const words = transcript.map((item) => item.text).join(" ").trim().split(/\s+/).filter(Boolean).length;
  document.getElementById("wordStats").textContent = `Words: ${words.toLocaleString()}`;
}

function updateFooterStats() {
  if (currentWorkspacePage === "themes") {
    const codebookSize = latestCodebook ? themeCodebookEntries().length : 0;
    if (themeWorkspaceMode === "human") {
      document.getElementById("wordStats").textContent = `Codebook Size: ${codebookSize.toLocaleString()}`;
      document.getElementById("codeStats").textContent = `Human Themes: ${preGenerationHumanThemes.length.toLocaleString()}`;
      return;
    }
    const counts = themeCounts();
    document.getElementById("wordStats").textContent = `Codebook Size: ${codebookSize.toLocaleString()}`;
    document.getElementById("codeStats").textContent = `Themes: ${counts.total.toLocaleString()}`;
    return;
  }
  const words = transcript.map((item) => item.text).join(" ").trim().split(/\s+/).filter(Boolean).length;
  document.getElementById("wordStats").textContent = `Words: ${words.toLocaleString()}`;
  if (codingWorkspaceMode === "human") {
    const humanCount = codes.filter((code) => isPreAiManualHumanCode(code) && code.reviewStatus !== "rejected").length;
    document.getElementById("codeStats").textContent = `Human codes: ${humanCount}`;
    return;
  }
  const counts = activeCodeCounts();
  const reviewStats = [];
  if (counts.rejected) reviewStats.push(`Rejected: ${counts.rejected}`);
  if (counts.unreviewed) reviewStats.push(`Unreviewed: ${counts.unreviewed}`);
  document.getElementById("codeStats").textContent = `Codes: ${counts.active}${reviewStats.length ? ` (${reviewStats.join(", ")})` : ""}`;
}

function relativeTime(value) {
  if (!value) return "Not yet";
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return value.toLocaleString();
}

function renderLastSaved() {
  document.getElementById("lastSaved").textContent = `Last saved: ${relativeTime(lastSavedAt)}`;
}

function transcriptAnalysisSnapshot() {
  const backgroundJob = activeTranscriptFile?.id
    ? backgroundAiJobs.get(String(activeTranscriptFile.id))
    : null;
  recordActiveReadingTime();
  return {
    version: 5,
    analysisReady,
    identifiedExcerpts,
    codes,
    originalAiCodes,
    agentReflections,
    initialAgentReflections,
    codeReviewStage,
    codeAmendmentReturnStage,
    codingRevision,
    lastFinishedCodingRevision,
    lastExportedCodingRevision,
    codingQuestionnaireResponses,
    codingExportedAt,
    manualCodeReuseFinished,
    humanCodingFinished,
    aiCodingStarted,
    backgroundAiJobId: backgroundJob?.jobId || null,
    backgroundAiJobStatus: backgroundJob?.status || "idle",
    readingElapsedMs: transcriptDisplayedAt ? Math.min(readingElapsedMs, READING_TRACKING_CAP_MS) : 0,
    transcriptReachedEnd,
    workflowTiming: savedWorkflowTiming(),
    seniorCodeReview,
  };
}

function themeAnalysisSnapshot() {
  return {
    version: 7,
    themeWorkspaceMode,
    selectedTranscriptIds: selectedThemeTranscriptIds,
    selectedTranscriptCodingRevisions: selectedThemeCodingRevisions,
    latestCodebook,
    latestCodebookId,
    themes,
    originalAiThemes,
    preGenerationHumanThemes,
    humanThemesFinished,
    manualThemeReuseFinished,
    themeGenerationStarted,
    themeReviewStage,
    themeAmendmentReturnStage,
    themeRevision,
    lastFinishedThemeRevision,
    lastExportedThemeRevision,
    themeQuestionnaireResponses,
    themesExportedAt,
    themeCodebookFilter,
    codebookReviewFinished,
    codebookDeletionSuggestionChoice,
    codebookResearchQuestion,
    codebookChangeHistory,
    workflowTiming: savedWorkflowTiming(),
    seniorThemeReview,
  };
}

async function persistCurrentAnalysis({ throwOnError = false } = {}) {
  if (!currentProject || restoringSnapshot || (piReadOnlyMode && !seniorCodeEditMode && !seniorThemeEditMode)) return;
  try {
    let payload;
    if (currentWorkspacePage === "themes") {
      const themeUrl = piReadOnlyMode
        ? `/api/pi/students/${piReadOnlyContext.student.id}/projects/${currentProject.id}/theme-revision`
        : `/api/projects/${currentProject.id}/theme-analysis`;
      payload = await apiFetch(themeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(themeAnalysisSnapshot()),
      });
      if (piReadOnlyMode && payload.snapshot) {
        projectThemeAnalysis = { ...(projectThemeAnalysis || {}), snapshot: payload.snapshot, can_modify_themes: true };
      }
    } else if (activeTranscriptFile?.id) {
      const analysisUrl = piReadOnlyMode
        ? `/api/pi/students/${piReadOnlyContext.student.id}/projects/${currentProject.id}/transcripts/${activeTranscriptFile.id}/code-revision`
        : `/api/projects/${currentProject.id}/transcripts/${activeTranscriptFile.id}/analysis`;
      payload = await apiFetch(analysisUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transcriptAnalysisSnapshot()),
      });
      const metadata = projectFiles.find((item) => item.id === activeTranscriptFile.id);
      if (metadata) {
        metadata.codes_count = payload.codes_count;
        metadata.excerpts_count = payload.excerpts_count;
        metadata.analysis_status = payload.analysis_status;
      }
    } else {
      return;
    }
    lastSavedAt = new Date((payload.updated_at || Date.now() / 1000) * 1000);
    renderLastSaved();
  } catch (error) {
    document.getElementById("lastSaved").textContent = "Last saved: Save failed";
    console.error("Could not persist analysis", error);
    if (throwOnError) throw error;
    return null;
  }
}

async function flushPendingAutosave(options = {}) {
  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  return persistCurrentAnalysis(options);
}

function markSaved() {
  if (piReadOnlyMode && !seniorCodeEditMode && !seniorThemeEditMode) return;
  lastSavedAt = new Date();
  renderLastSaved();
  if (restoringSnapshot) return;
  if (autosaveTimer) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    persistCurrentAnalysis();
  }, 600);
}

function readingGateIsActive() {
  return Boolean(
    transcriptDisplayedAt
    && !analysisReady
    && codingWorkspaceMode === "ai"
    && currentWorkspacePage === "codes"
    && !views.workspace?.classList.contains("hidden")
    && document.visibilityState === "visible"
    && document.hasFocus()
  );
}

function recordActiveReadingTime() {
  const now = Date.now();
  if (readingLastTickAt == null) {
    readingLastTickAt = now;
    return;
  }
  const elapsed = now - readingLastTickAt;
  readingLastTickAt = now;
  if (!readingGateIsActive()) return;
  readingElapsedMs = Math.min(
    READING_TRACKING_CAP_MS,
    readingElapsedMs + Math.min(Math.max(0, elapsed), 1500)
  );
}

function updateReadingGateStatus(message = "") {
  const status = document.getElementById("readingGateStatus");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  if (!transcriptDisplayedAt) {
    status.textContent = "Choose a project transcript first.";
    return;
  }

  const endReached = analysisReady || transcriptReachedEnd;
  status.textContent = endReached
    ? "Transcript reading complete."
    : "Scroll to the end of the transcript to finish reading.";
  updateBackgroundAiControl();
}

function startReadingGate(resume = false) {
  if (!resume) {
    readingElapsedMs = 0;
    transcriptReachedEnd = false;
  }
  transcriptDisplayedAt = new Date();
  readingLastTickAt = Date.now();
  if (readingGateTimer) window.clearInterval(readingGateTimer);
  updateReadingGateStatus();
  readingGateTimer = window.setInterval(() => {
    recordActiveReadingTime();
    updateReadingGateStatus();
    if (readingElapsedMs >= READING_TRACKING_CAP_MS) {
      markSaved();
      window.clearInterval(readingGateTimer);
      readingGateTimer = null;
    }
  }, 1000);
}

function resetReadingGate() {
  transcriptDisplayedAt = null;
  readingElapsedMs = 0;
  readingLastTickAt = null;
  transcriptReachedEnd = false;
  if (readingGateTimer) window.clearInterval(readingGateTimer);
  readingGateTimer = null;
  updateReadingGateStatus();
}

function updateTranscriptEndGate() {
  if (!transcriptDisplayedAt || transcriptReachedEnd || codingWorkspaceMode !== "ai" || !transcript.length) return;
  if (document.getElementById("transcriptSearch")?.value.trim()) return;
  const container = document.getElementById("transcriptLines");
  if (!container) return;
  const distanceFromEnd = container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceFromEnd > 24) return;
  transcriptReachedEnd = true;
  updateReadingGateStatus();
  markSaved();
  maybeRevealBackgroundAiResults();
}

function normalizeForMatch(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenSpansForMatch(value) {
  const source = String(value || "");
  const spans = [];
  const pattern = /[a-z0-9]+(?:[’'][a-z0-9]+)*/gi;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    spans.push({
      token: match[0].toLowerCase().replace(/[’']/g, ""),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return spans;
}

function partialExcerptRowScore(rowSpans, excerptSpans, rowNorm) {
  const meaningfulLength = String(rowNorm || "").replace(/[^a-z0-9]/g, "").length;
  if (rowSpans.length < 4 || meaningfulLength < 18) return 0;
  const coverage = rowSpans.length / Math.max(rowSpans.length, excerptSpans.length);
  return Math.min(0.98, 0.72 + (coverage * 0.26));
}

function excerptMatchDetails(rowText, excerptText) {
  const rowSource = String(rowText || "");
  const excerptSource = String(excerptText || "");
  const rowNorm = normalizeForMatch(rowSource);
  const excerptNorm = normalizeForMatch(excerptSource);
  if (!rowNorm || !excerptNorm) return { score: 0, range: null };

  const literalExcerpt = cleanExcerptText(excerptSource);
  const literalStart = rowSource.toLowerCase().indexOf(literalExcerpt.toLowerCase());
  if (literalExcerpt && literalStart >= 0) {
    return { score: 1, range: [literalStart, literalStart + literalExcerpt.length] };
  }
  const rowSpans = tokenSpansForMatch(rowSource);
  const excerptSpans = tokenSpansForMatch(excerptSource);
  if (excerptNorm.includes(rowNorm)) {
    const score = partialExcerptRowScore(rowSpans, excerptSpans, rowNorm);
    return score > 0
      ? { score, range: [0, rowSource.length] }
      : { score: 0, range: null };
  }
  if (rowSpans.length < 4 || excerptSpans.length < 4) return { score: 0, range: null };

  const excerptPositions = new Map();
  excerptSpans.forEach((span, index) => {
    const positions = excerptPositions.get(span.token) || [];
    positions.push(index);
    excerptPositions.set(span.token, positions);
  });

  let previousRuns = new Map();
  let longestRun = 0;
  let longestRowEnd = -1;
  rowSpans.forEach((rowSpan, rowIndex) => {
    const currentRuns = new Map();
    (excerptPositions.get(rowSpan.token) || []).forEach((excerptIndex) => {
      const runLength = (previousRuns.get(excerptIndex - 1) || 0) + 1;
      currentRuns.set(excerptIndex, runLength);
      if (runLength > longestRun) {
        longestRun = runLength;
        longestRowEnd = rowIndex;
      }
    });
    previousRuns = currentRuns;
  });

  const shorterCoverage = longestRun / Math.min(rowSpans.length, excerptSpans.length);
  if (longestRun < 4 || (longestRun < 6 && shorterCoverage < 0.45)) {
    return { score: 0, range: null };
  }

  const rowCoverage = longestRun / rowSpans.length;
  const rangeStartIndex = longestRowEnd - longestRun + 1;
  return {
    score: Math.min(0.99, (shorterCoverage + rowCoverage) / 2),
    range: [rowSpans[rangeStartIndex].start, rowSpans[longestRowEnd].end],
  };
}

function excerptMatchScore(rowText, excerptText) {
  return excerptMatchDetails(rowText, excerptText).score;
}

function matchedExcerptForText(text) {
  let bestMatch = null;
  let bestScore = 0;
  identifiedExcerpts.forEach((excerpt) => {
    const excerptCode = codes.find((code) => String(code.id) === String(excerpt.codeId ?? excerpt.id));
    if (excerptCode?.sourceClass === "human") return;
    const score = excerptMatchScore(text, excerpt.text);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = excerpt;
    }
  });
  return bestScore > 0 ? bestMatch : null;
}

function transcriptSelectionDetails() {
  const container = document.getElementById("transcriptLines");
  const selection = window.getSelection();
  if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const excerpt = cleanExcerptText(selection.toString()).replace(/\s+/g, " ");
  if (!excerpt) return null;

  const lineNumbers = [...container.querySelectorAll(".line-row")]
    .filter((row) => {
      try {
        return range.intersectsNode(row);
      } catch {
        return false;
      }
    })
    .map((row) => Number(row.dataset.line))
    .filter((line) => Number.isFinite(line));

  const bounds = range.getBoundingClientRect();
  return {
    text: excerpt,
    lines: [...new Set(lineNumbers)],
    range: range.cloneRange(),
    rect: { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left },
  };
}

function setManualSelectionHighlight(range = null) {
  if (!window.CSS?.highlights || typeof window.Highlight === "undefined") return;
  window.CSS.highlights.delete("human-code-selection");
  if (range) window.CSS.highlights.set("human-code-selection", new window.Highlight(range));
}

function positionManualCodePopover(rect) {
  const popover = document.getElementById("manualCodePopover");
  if (!popover || !rect) return;
  const gap = 12;
  const inset = 14;
  const width = popover.offsetWidth || 300;
  const height = popover.offsetHeight || 178;
  let left = rect.right + gap;
  if (left + width > window.innerWidth - inset) left = rect.left - width - gap;
  if (left < inset) left = Math.min(window.innerWidth - width - inset, Math.max(inset, rect.left));
  let top = rect.top + Math.max(0, (rect.bottom - rect.top - height) / 2);
  top = Math.max(72, Math.min(top, window.innerHeight - height - inset));
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function renderManualCodingPanel() {
  const panel = document.getElementById("manualCodingPanel");
  const popover = document.getElementById("manualCodePopover");
  const status = document.getElementById("manualSelectionStatus");
  const selectionLine = document.getElementById("manualSelectionLine");
  const codeInput = document.getElementById("manualCodeName");
  const saveButton = document.getElementById("saveManualCodeBtn");
  const clearButton = document.getElementById("clearManualSelectionBtn");
  const finishButton = document.getElementById("finishHumanCodingBtn");
  const exportButton = document.getElementById("exportHumanCodingBtn");
  const reopenAdd = document.getElementById("humanReopenAdd");
  const humanList = document.getElementById("humanManualCodeList");
  if (!panel || !popover || !status || !selectionLine || !codeInput || !saveButton || !clearButton || !finishButton || !exportButton || !humanList) return;

  const humanCodes = codes.filter((code) => isPreAiManualHumanCode(code) && code.reviewStatus !== "rejected");
  const isHumanWorkspace = codingWorkspaceMode === "human" && !piReadOnlyMode;
  const hasTranscript = transcript.length > 0;
  const hasSelection = Boolean(selectedTranscriptExcerpt?.text);
  panel.classList.toggle("hidden", !isHumanWorkspace);
  popover.classList.toggle("hidden", !isHumanWorkspace || !hasSelection);
  if (!hasTranscript) {
    selectedTranscriptExcerpt = null;
    codeInput.value = "";
    setManualSelectionHighlight();
  }
  codeInput.disabled = !isHumanWorkspace || !hasTranscript || !hasSelection;
  saveButton.disabled = !isHumanWorkspace || !hasTranscript || !hasSelection;
  clearButton.disabled = !isHumanWorkspace || !hasSelection;
  finishButton.disabled = !isHumanWorkspace || !hasTranscript || humanCodingFinished;
  finishButton.textContent = humanCodingFinished ? "Finished" : "Finish";
  finishButton.classList.toggle("finish-attention", isHumanWorkspace && hasTranscript && !humanCodingFinished);
  exportButton.disabled = !isHumanWorkspace || !hasTranscript || !humanCodingFinished;
  reopenAdd?.classList.toggle("hidden", !isHumanWorkspace || !humanCodingFinished || !humanCodingFinishedWhenOpened);
  status.textContent = hasSelection
    ? "Name the highlighted selection in the open box."
    : hasTranscript
      ? `Select transcript text to add a code. ${humanCodes.length} saved.`
      : "Preparing the transcript for manual coding.";
  selectionLine.textContent = hasSelection && selectedTranscriptExcerpt.lines?.length
    ? `Line${selectedTranscriptExcerpt.lines.length === 1 ? "" : "s"} ${selectedTranscriptExcerpt.lines.join(", ")}`
    : "Selected text";
  humanList.innerHTML = humanCodes.length
    ? `<div class="human-manual-list-header"><strong>Saved human coding (${humanCodes.length})</strong></div><div class="human-manual-items">${humanCodes.map((code) => { const lines = Array.isArray(code.transcriptLines) ? code.transcriptLines : []; return `<article class="human-manual-item ${String(focusedHumanCodeId || "") === String(code.id) ? "active" : ""}" data-focus-human-code="${escapeHTML(code.id)}" role="button" tabindex="0" aria-label="Show excerpt for ${escapeHTML(code.title || "human code")}"><div><strong>${escapeHTML(code.title || "Untitled code")}</strong><small>${lines.length ? `Line${lines.length === 1 ? "" : "s"} ${lines.join(", ")}` : "Transcript selection"} · View excerpt →</small></div><button type="button" data-delete-human-code="${escapeHTML(code.id)}" aria-label="Delete ${escapeHTML(code.title || "human code")}">Delete</button></article>`; }).join("")}</div>`
    : `<div class="manual-coding-empty"><strong>No human codes yet</strong><p>Select any meaningful transcript text to begin.</p></div>`;
  if (isHumanWorkspace && hasSelection) requestAnimationFrame(() => positionManualCodePopover(selectedTranscriptExcerpt.rect));
}

function updateManualTranscriptSelection() {
  if (codingWorkspaceMode !== "human") return;
  const details = transcriptSelectionDetails();
  if (!details) return;
  if (workflowTiming?.finished) workflowTiming.finished = false;
  beginManualPhaseTiming();
  humanCodingFinished = false;
  humanCodingFinishedWhenOpened = false;
  selectedTranscriptExcerpt = details;
  setManualSelectionHighlight(details.range);
  renderManualCodingPanel();
  document.getElementById("manualCodeName")?.focus();
}

function clearManualTranscriptSelection() {
  selectedTranscriptExcerpt = null;
  setManualSelectionHighlight();
  window.getSelection()?.removeAllRanges();
  const input = document.getElementById("manualCodeName");
  if (input) input.value = "";
  renderManualCodingPanel();
}

function focusHumanCode(codeId) {
  const code = codes.find((item) => String(item.id) === String(codeId) && isPreAiManualHumanCode(item));
  if (!code) return;
  if (selectedTranscriptExcerpt) clearManualTranscriptSelection();
  focusedHumanCodeId = code.id;
  expandedCodeId = null;
  const searchInput = document.getElementById("transcriptSearch");
  if (searchInput) searchInput.value = "";
  renderTranscript("");
  requestAnimationFrame(() => {
    const savedLine = Array.isArray(code.transcriptLines) ? code.transcriptLines[0] : null;
    const bestLine = savedLine ?? bestTranscriptLineForCode(code);
    const row = bestLine == null ? null : document.querySelector(`.line-row[data-line="${CSS.escape(String(bestLine))}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function reopenHumanCodingForAdditionalCode() {
  if (codingWorkspaceMode !== "human" || !humanCodingFinished) return;
  humanCodingFinished = false;
  humanCodingFinishedWhenOpened = false;
  if (workflowTiming) workflowTiming.finished = false;
  renderManualCodingPanel();
  document.getElementById("transcriptLines")?.focus();
  toast("Select a transcript excerpt, then name the additional Human code.");
}

async function finishHumanCoding() {
  if (!transcript.length || !activeTranscriptFile) return toast("Choose a project transcript before finishing Human Coding.");
  const button = document.getElementById("finishHumanCodingBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }
  const wasFinished = humanCodingFinished;
  humanCodingFinished = true;
  finishManualPhaseTiming();
  selectedTranscriptExcerpt = null;
  setManualSelectionHighlight();
  window.getSelection()?.removeAllRanges();
  const input = document.getElementById("manualCodeName");
  if (input) input.value = "";
  markSaved();
  try {
    await flushPendingAutosave({ throwOnError: true });
    await archiveFinishedResultFiles(
      "human_coding",
      Math.max(1, Number(codingRevision || 1)),
      [humanCodingFinishedResultFile()],
    );
    renderManualCodingPanel();
    toast("Human Coding finished and saved. Export is optional.");
    openHumanCodingNextStep("finish");
  } catch (error) {
    humanCodingFinished = wasFinished;
    markSaved();
    try {
      await flushPendingAutosave();
    } catch (_) {
      // The original error below remains the useful user-facing failure.
    }
    renderManualCodingPanel();
    toast(error.message || "Human Coding could not be finished because saving failed.");
  }
}

async function exportHumanCodes() {
  if (!humanCodingFinished || !transcript.length || !activeTranscriptFile) return toast("Finish Human Coding before exporting.");
  const button = document.getElementById("exportHumanCodingBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Exporting…";
  }
  const transcriptFileName = activeTranscriptFile.name || "";
  const baseName = `${safeDownloadBaseName(transcriptFileName)}_ReflexCoTI`;
  const exportTimestamp = new Date().toISOString();
  const humanCodes = codes.filter((code) => isPreAiManualHumanCode(code) && code.reviewStatus !== "rejected");
  const humanExportFile = jsonExportFile({
    project: { id: currentProject?.id || "", name: currentProject?.name || "" },
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    transcript: { file_name: transcriptFileName },
    user_timing: exportedWorkflowTiming("human_manual_coding", "first_excerpt_selection", "finish_human_coding_click"),
    coding_revision: Math.max(1, Number(codingRevision || 1)),
    exported_at: exportTimestamp,
    codes: humanCodes.map(humanCodeRecord),
  }, `${baseName}_Human_version.json`);
  downloadExportFile(humanExportFile);
  toast("Human Coding export downloaded.");
  try {
    await archiveExportFiles("human_coding", activeTranscriptFile.id, [humanExportFile]);
  } catch (error) {
    console.error("Could not archive the Human Coding export.", error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Export";
    }
  }
  openHumanExportChoice();
}

function openHumanCodingNextStep(source = "finish") {
  const modal = document.getElementById("humanExportChoiceModal");
  const title = document.getElementById("humanExportChoiceTitle");
  const description = document.getElementById("humanExportChoiceDescription");
  if (title) title.textContent = "Continue to AI Coding?";
  if (description) description.textContent = source === "export"
    ? "Your Human Coding results were exported. Would you like to continue to AI Coding for this transcript?"
    : "Human Coding is finished and saved. Would you like to continue to AI Coding for this transcript?";
  modal?.classList.remove("hidden");
  document.getElementById("stayOnHumanCodesBtn")?.focus();
}

function openHumanExportChoice() {
  openHumanCodingNextStep("export");
}

function closeHumanExportChoice({ restoreFocus = true } = {}) {
  document.getElementById("humanExportChoiceModal")?.classList.add("hidden");
  if (restoreFocus) document.getElementById("finishHumanCodingBtn")?.focus();
}

async function openAiCodesAfterHumanExport() {
  const file = activeTranscriptFile;
  closeHumanExportChoice({ restoreFocus: false });
  if (file) await openCodesForTranscript(file);
}

function highlightClassForText(text) {
  if (!analysisReady) return "";
  const match = matchedExcerptForText(text);
  if (!match) return "";
  return "hl-strong";
}

function splitSpeakerPrefix(item) {
  if (item.speaker) {
    return { speaker: item.speaker, text: item.text || "" };
  }
  const match = String(item.text || "").match(/^\s*(I|P|R|C|Interviewer|Participant)\s*:\s*(.*)$/i);
  if (!match) {
    return { speaker: "", text: item.text || "" };
  }
  return {
    speaker: match[1],
    text: match[2] || "",
  };
}

function aiCodesForTranscriptRow(text) {
  if (!analysisReady || !text) return [];
  return aiCodes().filter((code) => codeExcerptList(code).some((excerpt) => excerptMatchScore(text, excerpt) > 0));
}

function renderFocusedExcerptText(text, code, highlightClass = "hl-strong") {
  const source = String(text || "");
  if (!source || !code) return escapeHTML(source);

  const ranges = [];
  codeExcerptList(code).forEach((excerpt) => {
    const match = excerptMatchDetails(source, excerpt);
    if (match.score > 0 && match.range) ranges.push(match.range);
  });

  if (!ranges.length) return escapeHTML(source);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });

  let cursor = 0;
  const parts = merged.map(([start, end]) => {
    const before = escapeHTML(source.slice(cursor, start));
    const highlighted = `<span class="highlight ${highlightClass}">${escapeHTML(source.slice(start, end))}</span>`;
    cursor = end;
    return `${before}${highlighted}`;
  });
  parts.push(escapeHTML(source.slice(cursor)));
  return parts.join("");
}

function codeMatchRangesForText(text, code) {
  const ranges = [];
  codeExcerptList(code).forEach((excerpt) => {
    const match = excerptMatchDetails(text, excerpt);
    if (match.score > 0 && match.range) ranges.push(match.range);
  });
  return ranges;
}

function intersectMatchRanges(leftRanges, rightRanges) {
  const intersections = [];
  leftRanges.forEach(([leftStart, leftEnd]) => {
    rightRanges.forEach(([rightStart, rightEnd]) => {
      const start = Math.max(leftStart, rightStart);
      const end = Math.min(leftEnd, rightEnd);
      if (end > start) intersections.push([start, end]);
    });
  });
  intersections.sort((left, right) => left[0] - right[0]);
  return intersections.reduce((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
    return merged;
  }, []);
}

function renderTextRanges(text, ranges, highlightClass) {
  const source = String(text || "");
  if (!ranges.length) return escapeHTML(source);
  let cursor = 0;
  const parts = ranges.map(([start, end]) => {
    const before = escapeHTML(source.slice(cursor, start));
    const highlighted = `<span class="highlight ${highlightClass}">${escapeHTML(source.slice(start, end))}</span>`;
    cursor = end;
    return `${before}${highlighted}`;
  });
  parts.push(escapeHTML(source.slice(cursor)));
  return parts.join("");
}

function humanAiOverlapRangesForText(text, aiCode, humanCode) {
  if (!aiCode || !humanCode) return [];
  return intersectMatchRanges(
    codeMatchRangesForText(text, aiCode),
    codeMatchRangesForText(text, humanCode),
  );
}

function bestTranscriptLineForCode(code) {
  for (const excerpt of codeExcerptList(code)) {
    let bestLine = null;
    let bestScore = 0;
    transcript.forEach((item) => {
      const displayText = splitSpeakerPrefix(item).text.trim();
      const score = excerptMatchScore(displayText, excerpt);
      if (score > bestScore) {
        bestScore = score;
        bestLine = item.line;
      }
    });
    if (bestLine != null) return bestLine;
  }
  return null;
}

function autosizeCodeEditorTextareas(root) {
  root?.querySelectorAll(".revise-panel textarea, .ai-instruction-box textarea").forEach((textarea) => {
    textarea.style.height = "auto";
    textarea.style.height = String(textarea.scrollHeight + 2) + "px";
    textarea.style.overflowY = "hidden";
  });
}

function revealExpandedCodeCard(codeId, { focusEditor = false } = {}) {
  const card = document.querySelector(`.code-card[data-code-id="${CSS.escape(String(codeId))}"]`);
  const scroller = card?.closest(".code-workflow-scroll");
  if (!card || !scroller) return;
  autosizeCodeEditorTextareas(card);
  const cardRect = card.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const inset = 8;
  const availableHeight = scroller.clientHeight - (inset * 2);
  let offset = 0;
  if (cardRect.height > availableHeight || cardRect.top < scrollerRect.top + inset) {
    offset = cardRect.top - scrollerRect.top - inset;
  } else if (cardRect.bottom > scrollerRect.bottom - inset) {
    offset = cardRect.bottom - scrollerRect.bottom + inset;
  }
  if (offset) scroller.scrollBy({ top: offset, behavior: "smooth" });
  if (focusEditor) card.querySelector("[data-edit-field=code-title], [data-ai-instruction]")?.focus({ preventScroll: true });
}

function setExpandedCode(codeId, { scrollTranscript = false, scrollDetails = false } = {}) {
  const key = String(codeId || "");
  const code = codes.find((item) => String(item.id) === key);
  if (!code) return;

  if (String(expandedCodeId || "") === key) {
    if (activeReviewTimer?.kind === "code") flushActiveReviewTimer();
    expandedCodeId = null;
  } else {
    if (activeReviewTimer?.kind === "code") flushActiveReviewTimer();
    expandedCodeId = code.id;
    if (currentWorkspacePage === "codes" && codeReviewStage === "review" && !codeReviewIsDecided(code)) {
      syncActiveReviewTimer("code", code);
    }
  }

  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
  requestAnimationFrame(() => {
    if (scrollTranscript && expandedCodeId != null) {
      const bestLine = bestTranscriptLineForCode(code);
      const bestRow = bestLine == null
        ? null
        : document.querySelector(`.line-row[data-line="${CSS.escape(String(bestLine))}"]`);
      (bestRow || document.querySelector(`.line-row[data-code-ids~="${CSS.escape(key)}"]`))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (scrollDetails && expandedCodeId != null) {
      revealExpandedCodeCard(key);
    }
  });
}

function renderTranscript(filter = "") {
  const target = document.getElementById("transcriptLines");
  const query = filter.trim().toLowerCase();
  const rows = transcript.filter((item) => item.text.toLowerCase().includes(query));
  const currentMatchAiCode = codeReviewStage === "match-review" ? unresolvedHumanAiCodeMatches()[0] : null;
  const currentMatchHumanCode = currentMatchAiCode
    ? codes.find((code) => String(code.id) === String(currentMatchAiCode.matchedHumanCodeId))
    : null;

  if (transcript.length === 0) {
    target.innerHTML = "";
    updateWordCount();
    renderManualCodingPanel();
    return;
  }

  if (rows.length === 0) {
    target.innerHTML = `<div class="empty-state"><strong>No matching transcript text</strong><p>Try another search term.</p></div>`;
    updateWordCount();
    renderManualCodingPanel();
    return;
  }

  target.innerHTML = rows.map((item) => {
    const display = splitSpeakerPrefix(item);
    const displayText = display.text.trim();
    const humanAiOverlapRanges = humanAiOverlapRangesForText(displayText, currentMatchAiCode, currentMatchHumanCode);
    const isHumanAiMatchLine = humanAiOverlapRanges.length > 0;
    const matchedCodes = aiCodesForTranscriptRow(displayText);
    const matchedCodeIds = matchedCodes.map((code) => String(code.id));
    const focusedAiCode = matchedCodes.find((code) => String(code.id) === String(expandedCodeId || ""));
    const focusedHumanCode = codingWorkspaceMode === "human"
      ? codes.find((code) => String(code.id) === String(focusedHumanCodeId || "") && isPreAiManualHumanCode(code))
      : null;
    const humanMatch = focusedHumanCode
      ? codeExcerptList(focusedHumanCode).some((excerpt) => excerptMatchScore(displayText, excerpt) > 0)
      : false;
    const focusedCode = humanMatch ? focusedHumanCode : focusedAiCode;
    const focused = Boolean(focusedCode);
    const text = isHumanAiMatchLine
      ? renderTextRanges(displayText, humanAiOverlapRanges, "hl-human-ai-match")
      : focused
      ? renderFocusedExcerptText(displayText, focusedCode, humanMatch ? "hl-human" : "hl-strong")
      : escapeHTML(display.text);
    const speaker = display.speaker ? `<span class="speaker">${escapeHTML(display.speaker)}:</span>` : "";
    return `
      <div class="line-row ${display.speaker ? "" : "no-speaker"} ${isHumanAiMatchLine ? "human-ai-match-focus-line" : focused ? (humanMatch ? "human-code-focus-line" : "code-focus-line") : ""}" data-line="${item.line}" data-code-ids="${escapeHTML(matchedCodeIds.join(" "))}">
        <span class="line-number">${item.line}</span>
        ${speaker}
        <span>${text}</span>
      </div>`;
  }).join("");
  if (currentMatchAiCode && !query) {
    requestAnimationFrame(() => target.querySelector(".human-ai-match-focus-line")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  requestAnimationFrame(updateTranscriptEndGate);
  updateWordCount();
  renderManualCodingPanel();
}

function renderManualCodeReusePicker() {
  const items = unmatchedPreAiHumanCodes();
  const content = items.length
    ? items.map((code) => `
      <label class="manual-code-reuse-item ${code.includedAfterAiReview ? "selected" : ""}">
        <input type="checkbox" data-include-manual-code="${escapeHTML(code.id)}" ${code.includedAfterAiReview ? "checked" : ""} />
        <span>
          <strong>${escapeHTML(code.title || "Untitled human code")}</strong>
          <small>${escapeHTML(codeExcerptList(code)[0] || "No excerpt available")}</small>
        </span>
      </label>`).join("")
    : '<div class="manual-code-reuse-empty">No unmatched Human Coding codes remain.</div>';
  const selectedItems = items.filter(isIncludedPreAiManualCode);
  return `
    <article class="manual-code-reuse">
      <div class="human-code-option-heading">
        <span class="human-code-step">1</span>
        <span>
          <strong>Would you like to add any unmatched Human codes?</strong>
          <small>Select the Human Coding results that should be included in the AI Coding results.</small>
        </span>
      </div>
      <div class="manual-code-reuse-list">${content}</div>
      <div class="manual-code-reuse-actions">
        <button class="primary-btn manual-code-done-btn" id="finishManualCodeReuseBtn" type="button" ${selectedItems.length ? "" : "disabled"}>Add selected Human codes</button>
        <button class="secondary-btn" id="skipManualCodeReuseBtn" type="button">No unmatched Human codes to add</button>
      </div>
    </article>`;
}

function renderHumanAiCodeMatchReview() {
  const unresolved = unresolvedHumanAiCodeMatches()
    .map((aiCode, index) => {
      const humanCode = codes.find((code) => String(code.id) === String(aiCode.matchedHumanCodeId));
      return {
        aiCode,
        index,
        firstPosition: [
          firstTranscriptPositionForCode(aiCode),
          firstTranscriptPositionForCode(humanCode),
        ].sort(compareTranscriptPositions)[0],
      };
    })
    .sort((left, right) => (
      compareTranscriptPositions(left.firstPosition, right.firstPosition)
      || left.index - right.index
    ))
    .map(({ aiCode }) => aiCode);
  const currentAiCode = unresolved[0];
  if (!currentAiCode) return "";
  const humanCode = codes.find((code) => String(code.id) === String(currentAiCode.matchedHumanCodeId));
  if (!humanCode) return "";
  const total = codes.filter((code) => code.sourceClass !== "human" && code.matchedHumanCodeId != null).length;
  const reviewed = total - unresolved.length;
  const excerptCard = (code) => {
    const excerpts = codeExcerptList(code)
      .map((excerpt, index) => {
        const position = transcriptRowIndexForExcerpt(excerpt, code.id);
        return { excerpt, index, position, line: position >= 0 ? transcript[position]?.line : null };
      })
      .sort((left, right) => {
        const leftPosition = left.position >= 0 ? left.position : Number.POSITIVE_INFINITY;
        const rightPosition = right.position >= 0 ? right.position : Number.POSITIVE_INFINITY;
        return leftPosition - rightPosition || left.index - right.index;
      });
    return `<div class="human-ai-match-option">
      <span class="tag ${code.sourceClass === "human" ? "human" : "ai"}">${code.sourceClass === "human" ? "Human" : "AI"}</span>
      <strong>${escapeHTML(code.title || "Untitled code")}</strong>
      <div class="human-ai-match-excerpts" tabindex="0" aria-label="Complete excerpts for ${escapeHTML(code.title || "this code")}">
        ${excerpts.length
          ? excerpts.map(({ excerpt, line }) => `<p>${line != null ? `<span class="human-ai-match-line">Line ${escapeHTML(line)}</span>` : ""}<span>${escapeHTML(excerpt)}</span></p>`).join("")
          : "<p>No excerpt available</p>"}
      </div>
    </div>`;
  };
  return `<article class="human-ai-match-review" data-code-match-ai-id="${escapeHTML(currentAiCode.id)}">
    <div class="human-ai-match-heading">
      <span><strong>Possible Human–AI match</strong><small>Matches are shown in transcript order. Compare the excerpts, then keep one code for the AI Coding results.</small></span>
      <b>${reviewed + 1} of ${total}</b>
    </div>
    <div class="human-ai-match-options">
      ${excerptCard(humanCode)}
      ${excerptCard(currentAiCode)}
    </div>
    <div class="human-ai-match-actions">
      <button class="secondary-btn" data-code-match-choice="human" type="button">Keep Human code</button>
      <button class="secondary-btn" data-code-match-choice="ai" type="button">Keep AI code</button>
    </div>
  </article>`;
}

function renderCodes() {
  const target = document.getElementById("codeList");
  const codeCount = document.getElementById("codeCount");
  const codeReviewSummary = document.getElementById("codeReviewSummary");
  newCodeEditorOpen = false;
  renderNewCodeEditor();
  renderMergeCodeEditor();
  const newCodeGate = document.getElementById("newCodeGate");
  if (newCodeGate) newCodeGate.classList.add("hidden");
  const allDisplayCodes = reviewableCodes();
  advanceCodeReviewStageIfComplete();
  const aiItems = piReadOnlyMode && seniorCodeEditMode
    ? allDisplayCodes.filter((code) => !isCalibrationCode(code) && !(
      isPreAiManualHumanCode(code) && !code.includedAfterAiReview
    ))
    : aiCodes();
  if (codeReviewStage !== "review" && activeReviewTimer?.kind === "code") flushActiveReviewTimer();
  const visibleReviewCodes = aiItems.filter((code) => !(isCalibrationCode(code) && codeReviewIsDecided(code)));
  const activeCodes = allDisplayCodes.filter((code) => code.reviewStatus !== "rejected" && !isCalibrationCode(code));
  const activeAiCodes = activeCodes.filter((code) => code.sourceClass !== "human");
  const completedDisplayCodes = allDisplayCodes.filter((code) => !isCalibrationCode(code) && !(
    isPreAiManualHumanCode(code) && !code.includedAfterAiReview
  ));
  const baseDisplayCodes = codeReviewStage === "match-review"
    ? []
    : codeReviewStage === "review"
    ? visibleReviewCodes
    : codeReviewStage === "complete"
      ? completedDisplayCodes
    : codeReviewStage === "unmatched-human"
      ? activeCodes.filter((code) => !isPreAiManualHumanCode(code))
      : activeCodes.filter((code) => !isPreAiManualHumanCode(code));
  const reviewedCount = aiItems.filter(codeReviewIsDecided).length;
  const remainingCount = Math.max(0, aiItems.length - reviewedCount);
  const displayCodes = codeReviewStage !== "review" || codeReviewFilter === "all"
    ? baseDisplayCodes
    : baseDisplayCodes.filter((code) => codeReviewFilter === "reviewed"
      ? codeReviewIsDecided(code)
      : !codeReviewIsDecided(code));
  const selectedCount = displayCodes.filter((code) => code.selectedForMerge).length;
  if (codeReviewSummary) codeReviewSummary.textContent = `${reviewedCount} reviewed · ${remainingCount} remaining`;
  if (!analysisReady && allDisplayCodes.length === 0) {
    target.innerHTML = `<article class="empty-state"><strong>AI coding is preparing suggestions</strong><p>Read the transcript while the background workflow prepares codes and supporting excerpts.</p></article>`;
    codeCount.textContent = "(0)";
    updateFooterStats();
    return;
  }
  if (analysisReady && aiItems.length === 0 && codeReviewStage === "review") codeReviewStage = codeStageAfterMerge();
  const counts = activeCodeCounts();
  let stageHeader = "";
  if (codeReviewStage === "match-review") {
    stageHeader = renderHumanAiCodeMatchReview();
  } else if (codeReviewStage === "review") {
    stageHeader = `<div class="code-review-progress">
      <div class="code-review-progress-summary"><span>AI-generated code review</span><strong>${reviewedCount} of ${aiItems.length} reviewed</strong></div>
      <div class="code-review-filter" role="group" aria-label="Filter codes by review status">
        <button class="${codeReviewFilter === "all" ? "active" : ""}" data-code-review-filter="all" type="button" aria-pressed="${codeReviewFilter === "all"}">All (${aiItems.length})</button>
        <button class="${codeReviewFilter === "unreviewed" ? "active" : ""}" data-code-review-filter="unreviewed" type="button" aria-pressed="${codeReviewFilter === "unreviewed"}">Unreviewed (${remainingCount})</button>
        <button class="${codeReviewFilter === "reviewed" ? "active" : ""}" data-code-review-filter="reviewed" type="button" aria-pressed="${codeReviewFilter === "reviewed"}">Reviewed (${reviewedCount})</button>
      </div>
      <div class="code-review-progress-track" role="progressbar" aria-label="Code review progress" aria-valuemin="0" aria-valuemax="${aiItems.length}" aria-valuenow="${reviewedCount}"><i style="width:${Math.round((reviewedCount / Math.max(1, aiItems.length)) * 100)}%"></i></div>
    </div>`;
  } else if (codeReviewStage === "merge-choice") {
    stageHeader = renderCodeMergeSuggestionChoice(activeAiCodes);
  } else if (codeReviewStage === "merge") {
    stageHeader = `<div class="theme-merge-toolbar code-merge-toolbar"><span><strong>${selectedCount} code${selectedCount === 1 ? "" : "s"} selected</strong><small>${selectedCount < 2 ? "Select at least two codes to merge." : "Ready to create a merged code."}</small></span><div><button class="secondary-btn" id="mergeCodesBtn" type="button" ${selectedCount < 2 ? "disabled" : ""}>Merge selected codes</button><button class="primary-btn" id="finishCodeMergeBtn" type="button">Done merging</button></div></div>`;
  } else if (codeReviewStage === "additional-choice") {
    stageHeader = `<article class="code-workflow-prompt"><strong>Would you like to add any additional codes?</strong><p>Add a code for any new insight that is not represented in the reviewed coding results.</p><div class="additional-code-choice-actions"><button class="secondary-btn" id="addAdditionalCodesChoiceBtn" type="button">Add additional codes</button><button class="secondary-btn" id="skipAdditionalCodesChoiceBtn" type="button">No additional codes to add</button></div></article>`;
  } else if (codeReviewStage === "complete") {
    const needsFinish = codingChangesNeedFinish();
    const finishLabel = lastFinishedCodingRevision > 0 ? "Finish changes" : "Finish";
    const heading = needsFinish
      ? (lastFinishedCodingRevision > 0 ? "Updated coding needs to be finished" : "Code review complete")
      : "Coding finished";
    const message = needsFinish
      ? "Click Finish to complete this review before continuing or exporting."
      : "Review complete. Export is optional.";
    const mergeAction = piReadOnlyMode && seniorCodeEditMode && activeCodes.length >= 2
      ? `<button class="secondary-btn" id="startSeniorCodeMergeBtn" type="button">Merge codes</button>`
      : "";
    const showAddAction = !piReadOnlyMode && codingFinishedWhenOpened;
    const addAction = showAddAction
      ? `<div class="reopen-add-actions"><button class="secondary-btn" id="addCodeAfterFinishBtn" type="button">Add code</button></div>`
      : "";
    stageHeader = `<article class="code-workflow-prompt complete export-reminder ${needsFinish ? "revision-dirty" : ""}${showAddAction ? " has-reopen-add" : ""}" aria-live="polite"><span class="export-reminder-icon" aria-hidden="true">${needsFinish ? "!" : "✓"}</span><span><strong>${heading}</strong><p>${message}</p></span><div class="finish-export-actions">${mergeAction}<button class="primary-btn ${needsFinish ? "export-ready-cue" : ""}" id="finishCodingReminderBtn" type="button" ${needsFinish ? "" : "disabled"}>${needsFinish ? finishLabel : "Finished"}</button><button class="secondary-btn" id="exportCodingReminderBtn" type="button" ${needsFinish ? "disabled" : ""}>Export</button></div>${addAction}</article>`;
  }
  const promptAtBottom = ["merge-choice", "merge", "additional-choice", "complete"].includes(codeReviewStage);
  const stageFooter = promptAtBottom ? stageHeader : "";
  if (promptAtBottom) stageHeader = "";
  const humanCodePicker = codeReviewStage === "unmatched-human" ? renderManualCodeReusePicker() : "";
  const renderedDisplayCodes = codesInTranscriptExcerptOrder(displayCodes).filter((code) => (
    (piReadOnlyMode && seniorCodeEditMode)
    || code.sourceClass !== "human"
    || isCollaborationHumanCode(code)
    || isIncludedPreAiManualCode(code)
  ));
  target.innerHTML = `
    ${stageHeader}
    ${renderedDisplayCodes.map((code) => {
      const expanded = String(expandedCodeId || "") === String(code.id);
      const canReview = codeReviewStage === "review" && (!piReadOnlyMode || seniorCodeEditMode || code.sourceClass !== "human") && !codeReviewIsDecided(code);
      const canAmend = !isCalibrationCode(code) && codeReviewIsDecided(code) && codeReviewStage !== "merge" && (
        piReadOnlyMode
          ? seniorCodeEditMode && !(isPreAiManualHumanCode(code) && !code.includedAfterAiReview)
          : code.sourceClass !== "human" || isCollaborationHumanCode(code)
      );
      const amendingRejectedCode = code.reviewStatus === "rejected";
      const amendmentDecisionLabel = amendingRejectedCode ? "rejected" : "accepted";
      const amendmentActionLabel = piReadOnlyMode ? "Modify code" : `Modify ${amendmentDecisionLabel} code`;
      return `
    <article class="code-card ${codeCardSourceClass(code)} ${expanded ? "expanded current-review" : "collapsed"} ${isIncludedPreAiManualCode(code) ? "reused-manual-code" : ""} ${code.selectedForMerge ? "selected" : ""} ${code.reviewStatus ? `review-${code.reviewStatus}` : ""}" data-code-id="${escapeHTML(code.id)}">
      <div class="code-heading">
        <label class="theme-select-label code-select-label">
          ${codeReviewStage === "merge" ? `<input type="checkbox" data-code-select ${code.selectedForMerge ? "checked" : ""} />` : ""}
          ${renderCodeReviewStatus(code)}
          <span>${escapeHTML(code.title || "Untitled code")}</span>
        </label>
        ${code.modifiedBySenior ? `<span class="tag senior-modified-tag">Modified by Senior</span>` : ""}
        <button class="code-detail-toggle" data-code-toggle="${escapeHTML(code.id)}" type="button" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} details for ${escapeHTML(code.title || "this code")}">${expanded ? "−" : "+"}</button>
      </div>
      ${expanded ? `<div class="code-detail-body">
        <div class="tag-row">
          ${isPreAiManualHumanCode(code) ? `<span class="tag">Earlier manual code</span>` : code.sourceClass === "human" ? `<span class="tag">Human added</span>` : ""}
          ${code.sourceClass === "human" ? "" : renderAgentChips(code)}
        </div>
        ${renderCodeExcerpts(code)}
      ${canReview ? `<div class="code-actions">
        <button class="action-btn accept" data-action="accept" type="button">✓ ${code.reopenedForAmendment ? "Accept updated version" : "Accept"}</button>
        <button class="action-btn revise" data-action="revise" type="button">✎ Revise</button>
        <button class="action-btn reject" data-action="reject" type="button">✕ Reject</button>
      </div>
      ${transformationHistory(code).length ? `<p class="iterative-review-note">Editing saved. You can revise again, or Accept to finish this item.</p>` : ""}
      ${renderRevisePanel(code)}` : ""}
      ${code.reopenedForAmendment ? `<p class="amendment-note"><strong>Amendment memo:</strong> ${escapeHTML(code.amendmentMemo || "")}</p>` : ""}
      ${code.modifiedBySenior && !code.reopenedForAmendment ? `<p class="amendment-note senior-amendment-note"><strong>Modified by Senior ${escapeHTML(code.modifiedBySenior.username || "researcher")}:</strong> ${escapeHTML(code.modifiedBySenior.memo || "")} ${code.modifiedBySenior.modified_at ? `<span>${escapeHTML(new Date(code.modifiedBySenior.modified_at).toLocaleString())}</span>` : ""}</p>` : ""}
      ${canAmend ? `<div class="code-actions amendment-actions"><button class="action-btn revise" data-action="amend" type="button">✎ ${amendmentActionLabel}</button></div>${code.amendMode ? `<div class="revise-panel amendment-panel"><strong>${piReadOnlyMode ? "Why are you modifying this code?" : `Why are you changing this ${amendmentDecisionLabel} code?`}</strong><label>Required amendment memo<textarea data-amendment-memo placeholder="Explain the reason for reopening this ${amendmentDecisionLabel} code."></textarea></label><div class="revise-actions"><button class="action-btn accept" data-action="confirm-amend" type="button">${piReadOnlyMode ? "Start modification" : "Reopen code"}</button><button class="action-btn cancel-action" data-action="cancel-amend" type="button">Cancel</button></div></div>` : ""}` : ""}
      </div>` : ""}
    </article>`;
    }).join("")}
    ${codeReviewStage === "review" && codeReviewFilter !== "all" && renderedDisplayCodes.length === 0
      ? `<article class="empty-state compact code-filter-empty"><strong>No ${codeReviewFilter} codes</strong><p>Choose another filter to see the rest of the code cards.</p></article>`
      : ""}
    ${humanCodePicker}
    ${stageFooter}`;
  const nextStageElement = codeReviewStage === "unmatched-human"
    ? ".manual-code-reuse"
    : ".code-workflow-prompt:last-child, .code-merge-toolbar:last-child";
  if ((promptAtBottom || codeReviewStage === "unmatched-human") && expandedCodeId == null) {
    requestAnimationFrame(() => {
      const nextElement = codeReviewStage === "merge" && mergeCodeEditorOpen
        ? document.getElementById("mergeCodeEditor")
        : target.querySelector(nextStageElement);
      nextElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  if (newCodeGate && codeReviewStage === "additional") newCodeGate.classList.remove("hidden");
  renderNewCodeGate();
  // Keep the page-heading count aligned with the All review filter. This total
  // includes concealed calibration items, which remain excluded from exports
  // and codebook inputs elsewhere in the workflow.
  codeCount.textContent = `(${aiItems.length})`;
  updateFooterStats();
}

function renderMergeCodeEditor() {
  const target = document.getElementById("mergeCodeEditor");
  if (!target) return;
  const selectedCodes = reviewableCodes().filter((code) => code.selectedForMerge);
  if (codeReviewStage !== "merge" || !mergeCodeEditorOpen || selectedCodes.length < 2) {
    target.innerHTML = "";
    return;
  }
  const seniorManualOnly = piReadOnlyMode && seniorCodeEditMode;
  const suggestedName = codeMergeSuggestedName || selectedCodes.map((code) => code.title).filter(Boolean).join(" + ");
  target.innerHTML = `
    <div class="revise-panel theme-merge-panel code-merge-panel">
      ${seniorManualOnly ? "" : renderAssistChoice({ action: "name", noun: "set of codes", mode: codeMergeAssistMode, isRefinement: Boolean(codeMergeDraft) })}
      ${codeMergeAssistMode === "manual" ? `${codeMergeDraft ? "" : "<strong>Create the merged code</strong>"}
        ${renderAiUnderstanding(codeMergeDraft)}
        <label>New code name<input id="mergedCodeTitle" value="${escapeHTML(codeMergeDraft?.title || "")}" placeholder="${escapeHTML(suggestedName)}" data-suggested-title="${escapeHTML(suggestedName)}" /></label>
        <p>The supporting excerpts from all selected codes will be combined and deduplicated.</p>
        <div class="revise-actions"><button class="action-btn accept" id="saveMergedCodeBtn" type="button">Apply merge</button>${codeMergeDraft ? `<button class="action-btn refine-ai" data-refine-merge-ai type="button">Refine with AI</button>` : ""}<button class="action-btn cancel-action" id="cancelMergedCodeBtn" type="button">Cancel</button></div>`
        : `<button class="action-btn plain" id="cancelMergedCodeBtn" type="button">Cancel</button>`}
    </div>`;
}

function renderCodeExcerpts(code) {
  const excerpts = codeExcerptList(code);
  if (excerpts.length === 0) {
    return `<div class="quote-row empty-quote">No excerpts available.</div>`;
  }
  if (excerpts.length === 1) {
    return `
      <div class="quote-row">
        <span>"${escapeHTML(excerpts[0])}"</span>
      </div>`;
  }
  return `
    <div class="quote-list">
      <div class="quote-list-title">Excerpts (${excerpts.length})</div>
      <ol>
        ${excerpts.map((excerpt) => `<li>"${escapeHTML(excerpt)}"</li>`).join("")}
      </ol>
    </div>`;
}

function renderNewCodeEditor() {
  const target = document.getElementById("newCodeEditor");
  if (!target) return;
  if (!newCodeEditorOpen) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `
    <div class="revise-panel new-code-panel">
      <strong>Add an additional code</strong>
      <label>Code name
        <input data-new-code-field="title" placeholder="Enter code name" />
      </label>
      <label>Excerpts
        <textarea data-new-code-field="excerpt" placeholder="Paste or type the supporting transcript excerpt"></textarea>
      </label>
      <div class="revise-actions">
        <button class="action-btn accept" id="saveNewCodeBtn" type="button">Save new code</button>
        <button class="action-btn plain" id="cancelNewCodeBtn" type="button">Cancel</button>
      </div>
    </div>`;
}

function renderNewCodeGate() {
  const gate = document.getElementById("newCodeGate");
  const status = document.getElementById("newCodeStatus");
  const button = document.getElementById("newCodeBtn");
  const finishButton = document.getElementById("finishAddingHumanCodesBtn");
  if (!gate || !status || !button || !finishButton) return;

  const ready = codeReviewStage === "additional";
  gate.classList.toggle("ready", ready);
  button.disabled = !ready;
  finishButton.disabled = !ready;
  button.classList.toggle("hidden", !ready);
  finishButton.classList.toggle("hidden", !ready);
  status.textContent = ready ? "Add a code for each new insight that is not represented in the reviewed coding results." : "Review the AI codes first.";

  if (!ready && newCodeEditorOpen) {
    newCodeEditorOpen = false;
    renderNewCodeEditor();
  }
}

function collectCodeSplitDraft(codeId) {
  const card = document.querySelector(`[data-code-id="${CSS.escape(String(codeId))}"]`);
  const titles = [...(card?.querySelectorAll('[data-code-split-field="title"]') || [])]
    .map((input) => input.value.trim());
  const assignments = [...(card?.querySelectorAll("[data-code-split-assignment]") || [])]
    .map((select) => Number(select.value));
  return { titles, assignments };
}

function renderCodeSplitPanel(code) {
  if (!code.splitMode) return "";
  const excerpts = codeExcerptList(code);
  const maxParts = excerpts.length;
  const storedParts = Array.isArray(code.splitParts) ? code.splitParts : [];
  const partCount = Math.max(2, Math.min(storedParts.length || 2, maxParts));
  const parts = Array.from({ length: partCount }, (_, index) => storedParts[index] || { title: "" });
  const storedAssignments = Array.isArray(code.splitAssignments) ? code.splitAssignments : [];
  const assignments = excerpts.map((_, index) => {
    const assignment = Number(storedAssignments[index]);
    return Number.isInteger(assignment) && assignment >= 0 && assignment < partCount ? assignment : index % partCount;
  });
  code.splitParts = parts;
  code.splitAssignments = assignments;
  const seniorManualOnly = piReadOnlyMode && seniorCodeEditMode;
  return `
    <div class="revise-panel code-split-panel">
      ${seniorManualOnly ? "" : renderAssistChoice({ action: "split", noun: "code", mode: code.assistMode || "", isRefinement: Boolean(code.aiDraft) })}
      ${code.assistMode === "manual" ? `${code.aiDraft ? "" : "<strong>Create the split codes</strong>"}
      ${renderAiUnderstanding(code.aiDraft)}
      <p>Create two or more replacement codes, then assign every excerpt to the code it supports.</p>
      <label class="code-split-count-label">Number of new codes
        <select data-code-split-count>
          ${Array.from({ length: maxParts - 1 }, (_, index) => index + 2).map((count) => `
            <option value="${count}" ${count === partCount ? "selected" : ""}>${count} codes</option>
          `).join("")}
        </select>
      </label>
      <div class="code-split-parts">
        ${parts.map((part, index) => `
          <label class="code-split-part">New code ${index + 1}
            <input data-code-split-field="title" value="${escapeHTML(part.title || "")}" placeholder="Enter code name" />
          </label>
        `).join("")}
      </div>
      <div class="code-split-excerpts">
        <strong>Assign excerpts</strong>
        ${excerpts.map((excerpt, excerptIndex) => `
          <label class="code-split-excerpt">
            <span>${escapeHTML(excerpt)}</span>
            <select data-code-split-assignment>
              ${parts.map((part, partIndex) => `
                <option value="${partIndex}" ${assignments[excerptIndex] === partIndex ? "selected" : ""}>${escapeHTML(part.title || `New code ${partIndex + 1}`)}</option>
              `).join("")}
            </select>
          </label>
        `).join("")}
      </div>
      <div class="revise-actions">
        <button class="action-btn accept" data-action="save-split" type="button">${code.aiDraft ? "Use this proposal" : "Save & keep reviewing"}</button>
        ${code.aiDraft && !seniorManualOnly ? `<button class="action-btn refine-ai" data-refine-ai-proposal type="button">Refine with AI</button>` : ""}
        <button class="action-btn cancel-action" data-action="cancel-split" type="button">Cancel</button>
      </div>
      ` : `<button class="action-btn plain" data-action="cancel-split" type="button">Cancel</button>`}
    </div>`;
}
function renderRevisePanel(code) {
  if (!code.editMode) return "";
  const seniorManualOnly = piReadOnlyMode && seniorCodeEditMode;
  return `
    <div class="revise-panel">
      ${seniorManualOnly ? "" : renderAssistChoice({ action: "revise", noun: "code", mode: code.assistMode || "", isRefinement: Boolean(code.aiDraft) })}
      ${code.assistMode === "manual" ? `${code.aiDraft ? "" : "<strong>Revise the code</strong>"}
      ${renderAiUnderstanding(code.aiDraft)}
      <label>Code name
        <input data-edit-field="code-title" value="${escapeHTML(code.aiDraft?.title || code.title || "")}" />
      </label>
      <label>Excerpts
        <textarea data-edit-field="excerpt">${escapeHTML(code.aiDraft?.excerpts?.join("\n") || codeExcerptList(code).join("\n"))}</textarea>
      </label>
      <div class="revise-actions">
        <button class="action-btn accept" data-action="save-revisions" type="button">${code.aiDraft ? "Use this proposal" : "Save & keep reviewing"}</button>
        ${code.aiDraft && !seniorManualOnly ? `<button class="action-btn refine-ai" data-refine-ai-proposal type="button">Refine with AI</button>` : ""}
        <button class="action-btn cancel-action" data-action="cancel-revise" type="button">Cancel</button>
      </div>
      ` : `<button class="action-btn plain" data-action="cancel-revise" type="button">Cancel</button>`}
    </div>`;
}

function renderHumanAiThemeMatchReview() {
  const unresolved = unresolvedHumanAiThemeMatches();
  const aiTheme = unresolved[0];
  if (!aiTheme) return "";
  const humanTheme = preGenerationHumanThemes.find((theme) => String(theme.id) === String(aiTheme.matchedHumanThemeId));
  if (!humanTheme) return "";
  const total = aiThemes().filter((theme) => theme.matchedHumanThemeId != null).length;
  const reviewed = total - unresolved.length;
  const option = (theme, kind) => `<div class="human-ai-match-option theme-name-match-option">
    <span class="tag ${kind}">${kind === "human" ? "Human" : "AI"}</span>
    <strong>${escapeHTML(theme.title || "Untitled theme")}</strong>
    <div class="human-ai-match-excerpts" tabindex="0" aria-label="Complete description for ${escapeHTML(theme.title || "this theme")}">
      <p>${escapeHTML(theme.rationale || "No description provided.")}</p>
    </div>
  </div>`;
  return `<article class="human-ai-match-review" data-theme-match-ai-id="${escapeHTML(aiTheme.id)}">
    <div class="human-ai-match-heading">
      <span><strong>Possible Human–AI theme match</strong><small>Similarity: ${Math.round(Number(aiTheme.humanAiThemeMatchScore || 0) * 100)}%. Choose the name to use. The AI theme's code assignments will be retained.</small></span>
      <b>${reviewed + 1} of ${total}</b>
    </div>
    <div class="human-ai-match-options">
      ${option(humanTheme, "human")}
      ${option(aiTheme, "ai")}
    </div>
    <div class="human-ai-match-actions">
      <button class="secondary-btn" data-theme-match-choice="human" type="button">Use Human theme name</button>
      <button class="primary-btn" data-theme-match-choice="ai" type="button">Use AI theme name</button>
    </div>
  </article>`;
}

function renderManualThemeReusePicker() {
  const items = preGenerationHumanThemes;
  const content = items.length
    ? items.map((theme) => `
      <label class="manual-code-reuse-item ${theme.includedAfterAiReview ? "selected" : ""}">
        <input type="checkbox" data-include-manual-theme="${escapeHTML(theme.id)}" ${theme.includedAfterAiReview ? "checked" : ""} />
        <span>
          <strong>${escapeHTML(theme.title || "Untitled human theme")}</strong>
          <small>${escapeHTML(theme.rationale || "No description provided.")}</small>
        </span>
      </label>`).join("")
    : '<div class="manual-code-reuse-empty">No existing Human Themes are available. Continue to Step 2 to add themes from new insights.</div>';
  const selectedItems = items.filter((theme) => theme.includedAfterAiReview);
  if (manualThemeReuseFinished) {
    return `
      <article class="manual-code-reuse completed">
        <div class="human-code-option-heading">
          <span class="human-code-step">✓</span>
          <span>
            <strong>Human Themes selection complete</strong>
            <small>${selectedItems.length} existing human theme${selectedItems.length === 1 ? "" : "s"} added to the final theme list.</small>
          </span>
        </div>
        <button class="secondary-btn manual-code-edit-btn" id="editManualThemeReuseBtn" type="button">Change selection</button>
      </article>`;
  }
  return `
    <article class="manual-code-reuse">
      <div class="human-code-option-heading">
        <span class="human-code-step">1</span>
        <span>
          <strong>Add themes from Human Themes</strong>
          <small>Select any themes you created before AI generation that should be included in the final analysis.</small>
        </span>
      </div>
      <div class="manual-code-reuse-list">${content}</div>
      <button class="primary-btn manual-code-done-btn" id="finishManualThemeReuseBtn" type="button">Done selecting Human Themes</button>
    </article>`;
}

function setExpandedTheme(themeId) {
  const key = String(themeId || "");
  const theme = themes.find((item) => String(item.id) === key);
  if (!theme) return;
  if (activeReviewTimer?.kind === "theme") flushActiveReviewTimer();
  expandedThemeId = String(expandedThemeId || "") === key ? null : theme.id;
  if (expandedThemeId != null) {
    highlightedThemeId = theme.id;
    if (["review", "merge-review"].includes(themeReviewStage) && !themeReviewIsDecided(theme)) {
      syncActiveReviewTimer("theme", theme);
    }
  }
  renderThemes();
  if (expandedThemeId != null) {
    requestAnimationFrame(() => {
      document.querySelector('#themeList [data-theme-id="' + CSS.escape(String(expandedThemeId)) + '"]')
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

function renderThemes() {
  const target = document.getElementById("themeList");
  const themeCount = document.getElementById("themeCount");
  const status = document.getElementById("themeReviewStatus");
  if (!target || !themeCount) return;
  updateThemeWorkspaceModeUi();
  renderCodebookPanel();
  renderManualThemePanel();
  if (themeWorkspaceMode === "codebook" && !piReadOnlyMode) {
    if (activeReviewTimer?.kind === "theme") flushActiveReviewTimer();
    themeCount.textContent = `(${themeCodebookEntries().length})`;
    updateFooterStats();
    return;
  }
  if (themeWorkspaceMode === "human" && !piReadOnlyMode) {
    if (activeReviewTimer?.kind === "theme") flushActiveReviewTimer();
    themeCount.textContent = `(${preGenerationHumanThemes.length})`;
    updateFooterStats();
    return;
  }
  if (themeReviewStage === "idle" && themes.length) themeReviewStage = "review";
  advanceThemeReviewStageIfComplete();
  renderMergeThemeEditor();
  const aiItems = piReadOnlyMode && seniorThemeEditMode ? themes : aiThemes();
  const reviewedCount = aiItems.filter(themeReviewIsDecided).length;
  const remainingCount = Math.max(0, aiItems.length - reviewedCount);
  const headingSummary = document.getElementById("themeReviewHeadingSummary");
  if (headingSummary) headingSummary.textContent = ` · ${reviewedCount} reviewed · ${remainingCount} remaining`;
  const includedEarlierHumanThemes = (manualThemeReuseFinished || themeReviewStage === "complete")
    ? preGenerationHumanThemes.filter((theme) => theme.includedAfterAiReview)
    : [];
  const activeThemes = [
    ...themes.filter((theme) => theme.reviewStatus !== "rejected"),
    ...includedEarlierHumanThemes,
  ];
  const selectedCount = activeThemes.filter((theme) => theme.selectedForMerge).length;
  const sequentialReview = ["review", "merge-review"].includes(themeReviewStage);
  const visibleReviewThemes = aiItems;
  let displayThemes = themeReviewStage === "match-review"
    ? []
    : piReadOnlyMode && seniorThemeEditMode && themeReviewStage === "complete"
    ? themes
    : (sequentialReview ? visibleReviewThemes : activeThemes);
  if (!["match-review", "merge"].includes(themeReviewStage)) {
    const displayedIds = new Set(displayThemes.map((theme) => String(theme.id)));
    displayThemes = [
      ...displayThemes,
      ...themes.filter((theme) => theme.reviewStatus === "rejected" && !displayedIds.has(String(theme.id))),
    ];
  }
  if (themeWorkspaceMode === "ai") {
    const highlightedThemeIsVisible = displayThemes.some((theme) => String(theme.id) === String(highlightedThemeId || ""));
    if (expandedThemeId != null) highlightedThemeId = expandedThemeId;
    else if (!highlightedThemeIsVisible) highlightedThemeId = displayThemes[0]?.id || null;
    renderCodebookPanel();
  }
  const expandedTheme = themes.find((theme) => String(theme.id) === String(expandedThemeId || ""));
  if (currentWorkspacePage === "themes" && sequentialReview && expandedTheme && !themeReviewIsDecided(expandedTheme)) {
    syncActiveReviewTimer("theme", expandedTheme);
  } else if (activeReviewTimer?.kind === "theme") {
    flushActiveReviewTimer();
  }
  if (status) {
    const statusMessages = {
      "match-review": "Review possible matches between Human and AI themes.",
      review: `Reviewing AI themes. ${reviewedCount} of ${aiItems.length} reviewed.`,
      "merge-choice": "All AI themes reviewed. Choose whether to merge overlapping themes.",
      merge: `${selectedCount} theme${selectedCount === 1 ? "" : "s"} selected for merge.`,
      "merge-review": "Review the newly merged theme before continuing.",
      "additional-choice": "Theme review is finished. Choose whether to add additional themes.",
      additional: "Add themes for any new insights not represented in the reviewed themes.",
      complete: "Theme review complete and ready for export.",
      idle: codebookReviewFinished
        ? ""
        : "Finish the codebook review before generating AI themes.",
    };
    status.textContent = themeGenerationInProgress
      ? "Generating AI themes from the finished codebook…"
      : (statusMessages[themeReviewStage] || statusMessages.idle);
    status.closest(".theme-review-toolbar")?.classList.toggle(
      "hidden",
      themeReviewStage === "idle" && codebookReviewFinished,
    );
  }
  if (themeGenerationInProgress) {
    target.setAttribute("aria-busy", "true");
    target.innerHTML = `<article class="empty-state theme-generation-loading" role="status"><span class="theme-loading-spinner" aria-hidden="true"></span><strong>Generating AI themes…</strong><p>The theme agents are analyzing the finished codebook and reaching consensus. This can take a few minutes; you can keep this page open.</p></article>`;
    themeCount.textContent = "(0)";
    updateFooterStats();
    return;
  }
  target.removeAttribute("aria-busy");
  if (themes.length === 0 && !["additional-choice", "additional", "complete"].includes(themeReviewStage)) {
    target.innerHTML = codebookReviewFinished
      ? ""
      : `<article class="empty-state"><strong>Finish the codebook first</strong><p>Review the shared codebook before generating AI themes.</p></article>`;
    themeCount.textContent = "(0)";
    updateFooterStats();
    return;
  }
  let stageHeader = "";
  if (themeReviewStage === "match-review") {
    stageHeader = renderHumanAiThemeMatchReview();
  } else if (themeReviewStage === "review") {
    stageHeader = `<div class="code-review-progress"><span>AI theme review</span><strong>${reviewedCount} of ${aiItems.length} reviewed</strong><div><i style="width:${Math.round((reviewedCount / Math.max(1, aiItems.length)) * 100)}%"></i></div></div>`;
  } else if (themeReviewStage === "merge-review") {
    stageHeader = `<div class="code-review-progress"><span>Merged theme review</span><strong>Review the result</strong><div><i style="width:50%"></i></div></div>`;
  } else if (themeReviewStage === "merge-choice") {
    stageHeader = `<article class="code-workflow-prompt"><strong>Would you like to merge any themes?</strong><p>You have reviewed every AI theme. You can combine overlapping accepted or revised themes before continuing.</p><div class="theme-choice-actions"><button class="secondary-btn" id="startThemeMergeBtn" type="button" ${activeThemes.length < 2 ? "disabled" : ""}>Yes, review merge options</button><button class="secondary-btn" id="skipThemeMergeBtn" type="button">No, continue</button></div></article>`;
  } else if (themeReviewStage === "merge") {
    stageHeader = `<div class="theme-merge-toolbar"><span><strong>${selectedCount} theme${selectedCount === 1 ? "" : "s"} selected</strong><small>${selectedCount < 2 ? "Select at least two themes to merge." : "Ready to create a merged theme."}</small></span><div><button class="secondary-btn" id="mergeThemesBtn" type="button" ${selectedCount < 2 ? "disabled" : ""}>Merge selected themes</button><button class="primary-btn" id="finishThemeMergeBtn" type="button">Done merging</button></div></div>`;
  } else if (themeReviewStage === "additional-choice") {
    stageHeader = `<article class="code-workflow-prompt"><strong>Would you like to add any additional themes?</strong><p>Add a theme for any new insight that is not represented in the reviewed themes.</p><div class="theme-choice-actions"><button class="secondary-btn" id="addAdditionalThemesChoiceBtn" type="button">Add additional themes</button><button class="secondary-btn" id="skipAdditionalThemesChoiceBtn" type="button">No additional themes to add</button></div></article>`;
  } else if (themeReviewStage === "additional") {
    stageHeader = "";
  } else if (themeReviewStage === "complete") {
    const needsFinish = themeChangesNeedFinish();
    const finishLabel = "Finish";
    const heading = needsFinish
      ? (lastFinishedThemeRevision > 0 ? "Updated themes need to be finished" : "Theme review complete")
      : "Themes finished";
    const message = needsFinish
      ? "Click Finish to complete this review before continuing or exporting."
      : "Review complete. Export is optional.";
    const mergeAction = piReadOnlyMode && seniorThemeEditMode
      ? `<button class="secondary-btn" id="startThemeMergeBtn" type="button" ${activeThemes.length < 2 ? "disabled" : ""}>Merge themes</button>`
      : "";
    const showAddAction = !piReadOnlyMode && themesFinishedWhenOpened;
    const addAction = showAddAction
      ? `<div class="reopen-add-actions"><button class="secondary-btn" id="addThemeAfterFinishBtn" type="button">+ Add theme</button></div>`
      : "";
    stageHeader = `<article class="code-workflow-prompt complete export-reminder${needsFinish ? " revision-dirty" : ""}${showAddAction ? " has-reopen-add" : ""}" aria-live="polite"><span class="export-reminder-icon" aria-hidden="true">${needsFinish ? "!" : "✓"}</span><span><strong>${heading}</strong><p>${message}</p></span><div class="finish-export-actions">${mergeAction}<button class="primary-btn ${needsFinish ? "export-ready-cue" : ""}" id="finishThemeReminderBtn" type="button" ${needsFinish ? "" : "disabled"}>${needsFinish ? finishLabel : "Finished"}</button><button class="secondary-btn" id="exportThemeReminderBtn" type="button" ${needsFinish ? "disabled" : ""}>Export</button></div>${addAction}</article>`;
  }
  const promptAtBottom = ["merge-choice", "merge", "additional-choice", "complete"].includes(themeReviewStage);
  const stageFooter = promptAtBottom ? stageHeader : "";
  if (promptAtBottom) stageHeader = "";
  const humanThemeTools = themeReviewStage === "additional"
    ? `${renderNewThemeGate()}${renderNewThemeEditor()}`
    : themeReviewStage === "complete"
      ? renderNewThemeEditor()
      : "";
  target.innerHTML = `
    ${stageHeader}
    ${displayThemes.map((theme) => {
      const expanded = String(expandedThemeId || "") === String(theme.id);
      const canReview = sequentialReview && !themeReviewIsDecided(theme);
      const canAmend = (
        piReadOnlyMode && seniorThemeEditMode
          ? true
          : !isHumanTheme(theme) || theme.createdAfterAiReview
      ) && theme.reviewStatus !== "rejected" && themeReviewIsDecided(theme) && themeReviewStage !== "merge";
      return `
    <article class="theme-card ${themeCardSourceClass(theme)} ${theme.selectedForMerge ? "selected" : ""} ${expanded ? "expanded current-review" : "collapsed"} ${String(theme.id) === String(highlightedThemeId || "") ? "codebook-focus" : ""} ${theme.reviewStatus ? `review-${theme.reviewStatus}` : ""}" data-theme-id="${escapeHTML(theme.id)}" tabindex="0">
      <div class="theme-heading">
        <label class="theme-select-label">
          ${themeReviewStage === "merge" ? `<input type="checkbox" data-theme-select ${theme.selectedForMerge ? "checked" : ""} />` : ""}
          ${isHumanTheme(theme) ? "" : renderThemeReviewStatus(theme)}
          <span>${escapeHTML(theme.title || "Untitled theme")}</span>
        </label>
        ${theme.reviewStatus === "rejected" ? `<span class="tag review-tag">${escapeHTML(theme.reviewStatus)}</span>` : ""}
        ${theme.modifiedBySenior ? `<span class="tag senior-modified">Modified by Senior</span>` : ""}
        <span class="confidence theme-code-count">${theme.codes.length} code${theme.codes.length === 1 ? "" : "s"}</span>
        <button class="code-detail-toggle" data-theme-toggle="${escapeHTML(theme.id)}" type="button" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} details for ${escapeHTML(theme.title || "this theme")}">${expanded ? "−" : "+"}</button>
      </div>
      ${expanded ? `<div class="theme-detail-body">
      <p class="theme-rationale">${escapeHTML(theme.rationale || "Generated from uploaded coding exports.")}</p>
      <div class="theme-code-preview">
        ${theme.codes.length
          ? theme.codes.map((code) => `<span>${escapeHTML(code.codeName || "Unnamed code")}</span>`).join("")
          : `<span>No related codes</span>`}
      </div>
      ${canReview ? `<div class="code-actions">
        <button class="action-btn accept" data-theme-action="accept" type="button">✓ ${theme.reopenedForAmendment ? "Accept updated version" : "Accept"}</button>
        <button class="action-btn revise" data-theme-action="revise" type="button">✎ Revise</button>
        <button class="action-btn revise" data-theme-action="split" type="button" ${theme.codes.length < 2 ? "disabled title=\"At least two codes are required\"" : ""}>Split</button>
        <button class="action-btn reject" data-theme-action="reject" type="button">Reject</button>
      </div>` : ""}
      ${transformationHistory(theme).length && !theme.reviewStatus ? `<p class="iterative-review-note">Editing saved. You can revise or split again, or Accept to finish this theme.</p>` : ""}
      ${canReview ? renderThemeRevisePanel(theme) : ""}
      ${canReview ? renderThemeSplitPanel(theme) : ""}
      ${theme.reopenedForAmendment || theme.modifiedBySenior ? `<p class="amendment-note"><strong>Modification memo:</strong> ${escapeHTML(theme.modifiedBySenior?.memo || theme.amendmentMemo || "")}</p>` : ""}
      ${canAmend ? `<div class="code-actions amendment-actions"><button class="action-btn revise" data-theme-action="amend" type="button">✎ ${piReadOnlyMode && seniorThemeEditMode ? "Modify theme" : "Modify accepted theme"}</button></div>${theme.amendMode ? `<div class="revise-panel amendment-panel"><strong>Why are you changing this accepted theme?</strong><label>Required modification memo<textarea data-theme-amendment-memo placeholder="Explain the reason for reopening this theme."></textarea></label><div class="revise-actions"><button class="action-btn accept" data-theme-action="confirm-amend" type="button">Continue to modify</button><button class="action-btn cancel-action" data-theme-action="cancel-amend" type="button">Cancel</button></div></div>` : ""}` : ""}
      </div>` : ""}
    </article>`;
    }).join("")}
    ${stageFooter}
    ${humanThemeTools}`;
  if (themeReviewStage === "additional") {
    requestAnimationFrame(() => target.querySelector(".new-code-gate")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }
  const counts = themeCounts();
  themeCount.textContent = `(${counts.active})`;
  updateFooterStats();
}

function renderNewThemeGate() {
  const totalAi = aiThemes().length;
  const reviewedAi = aiThemes().filter((theme) => (
    themeReviewIsDecided(theme)
  )).length;
  const aiReviewComplete = allAiThemesReviewed() || (themeGenerationStarted && totalAi === 0);
  const ready = themeReviewStage === "additional" && aiReviewComplete;
  if (!ready && newThemeEditorOpen) newThemeEditorOpen = false;
  return `
    <div class="new-code-gate ${ready ? "ready" : ""}">
      <span>${ready
        ? "Add an additional theme for each new insight that is not represented in the reviewed themes."
        : themeReviewStage === "additional"
          ? "Add themes for new insights."
          : `Review all AI themes before adding an additional theme (${reviewedAi}/${totalAi} reviewed).`}</span>
      <div class="new-theme-gate-actions">
        <button class="secondary-btn ${ready ? "" : "hidden"}" id="newThemeBtn" type="button" ${ready ? "" : "disabled"}>+ New theme</button>
        <button class="primary-btn ${ready ? "" : "hidden"}" id="finishAddingHumanThemesBtn" type="button" ${ready ? "" : "disabled"}>No more insights</button>
      </div>
    </div>`;
}

function renderThemeRevisePanel(theme) {
  if (!theme.editMode) return "";
  const seniorManualOnly = piReadOnlyMode && seniorThemeEditMode;
  return `
    <div class="revise-panel">
      ${seniorManualOnly ? "" : renderAssistChoice({ action: "revise", noun: "theme", mode: theme.assistMode || "", isRefinement: Boolean(theme.aiDraft) })}
      ${theme.assistMode === "manual" ? `${theme.aiDraft ? "" : "<strong>Revise the theme</strong>"}
      ${renderAiUnderstanding(theme.aiDraft)}
      <label>Theme name
        <input data-theme-revise-field="title" value="${escapeHTML(theme.aiDraft?.title || theme.title || "")}" />
      </label>
      <label>Description
        <textarea data-theme-revise-field="rationale">${escapeHTML(theme.aiDraft?.rationale || theme.rationale || "")}</textarea>
      </label>
      <div class="revise-actions">
        <button class="action-btn accept" data-theme-action="save-revisions" type="button">${theme.aiDraft ? "Use this proposal" : "Save & keep reviewing"}</button>
        ${theme.aiDraft && !seniorManualOnly ? `<button class="action-btn refine-ai" data-refine-ai-proposal type="button">Refine with AI</button>` : ""}
        <button class="action-btn cancel-action" data-theme-action="cancel-revise" type="button">Cancel</button>
      </div>
      ` : `<button class="action-btn plain" data-theme-action="cancel-revise" type="button">Cancel</button>`}
    </div>`;
}

function renderNewThemeEditor() {
  if (!newThemeEditorOpen) return "";
  return `
    <div class="revise-panel new-code-panel new-theme-panel">
      <strong>Add an additional theme</strong>
      <label>Theme name
        <input data-new-theme-field="title" placeholder="Enter theme name" />
      </label>
      <label>Description
        <textarea data-new-theme-field="description" placeholder="Describe this theme"></textarea>
      </label>
      <label>Related codes
        <textarea data-new-theme-field="support" placeholder="Type one code name per line"></textarea>
      </label>
      <div class="revise-actions">
        <button class="action-btn accept" id="saveNewThemeBtn" type="button">Save new theme</button>
        <button class="action-btn plain" id="cancelNewThemeBtn" type="button">Cancel</button>
      </div>
    </div>`;
}

function noteHumanThemeChangeForExport() {
  if (themeReviewStage === "complete" && Number(lastFinishedThemeRevision || 0) >= Number(themeRevision || 1)) {
    themeRevision = Math.max(1, Number(themeRevision || 1)) + 1;
  }
  if (workflowTiming) workflowTiming.finished = false;
}

function saveNewTheme() {
  const title = document.querySelector('[data-new-theme-field="title"]')?.value.trim();
  const description = document.querySelector('[data-new-theme-field="description"]')?.value.trim();
  const support = document.querySelector('[data-new-theme-field="support"]')?.value || "";
  if (!title) return toast("Theme name cannot be empty.");
  if (!description) return toast("Theme description cannot be empty.");

  const humanTheme = {
    id: nextThemeId(),
    title,
    rationale: description,
    codes: supportItemsToThemeCodes(themeSupportItems(support)),
    source: "Human",
    sourceClass: "human",
    reviewStatus: "accepted",
    createdAfterAiReview: true,
    selectedForMerge: false,
    splitMode: false,
    editMode: false,
  };
  themes = [...themes, humanTheme];
  noteHumanThemeChangeForExport();
  newThemeEditorOpen = false;
  renderThemes();
  markSaved();
  toast("New human theme added. Click Finish to save the updated themes.");
}

function codebookClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codebookEntryName(entry) {
  return String(entry?.["initial code"] || "").trim();
}

function codebookDeletionSuggestionsEnabled() {
  return codebookDeletionSuggestionChoice === "yes";
}

function aiSuggestedDeletionItems() {
  return (latestCodebook?.entries || [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.ai_suggested_delete === true);
}

function codebookSourceRefs(entry) {
  if (Array.isArray(entry?.source_refs) && entry.source_refs.length) return entry.source_refs;
  const clueKeys = new Set((entry?.clues || []).map(codebookExcerptKey));
  const grouped = new Map();
  themeCodeInputs.forEach((input) => {
    if (!clueKeys.has(codebookExcerptKey(input.quote))) return;
    const key = `${input.transcriptId || input.transcript}|${input.codeId || ""}|${input.codeName || ""}`;
    const existing = grouped.get(key) || {
      transcript_id: String(input.transcriptId || input.transcript || ""),
      transcript_label: String(input.transcript || ""),
      source_code_id: String(input.codeId || ""),
      source_code_name: String(input.codeName || ""),
      excerpts: [],
    };
    if (input.quote && !existing.excerpts.includes(input.quote)) existing.excerpts.push(input.quote);
    grouped.set(key, existing);
  });
  return [...grouped.values()];
}

function projectFileForCodebookSource(ref) {
  const transcriptId = String(ref?.transcript_id || "");
  const transcriptLabel = normalizedTranscriptName(ref?.transcript_label || transcriptId);
  return projectFiles.find((file) => String(file.id) === transcriptId)
    || projectFiles.find((file) => normalizedTranscriptName(file.name) === transcriptLabel)
    || null;
}

function codebookSourceRefsForExcerpts(entry, excerpts) {
  const excerptKeys = new Set((excerpts || []).map(codebookExcerptKey));
  return codebookSourceRefs(entry).map((ref) => ({
    ...ref,
    excerpts: (ref.excerpts || []).filter((excerpt) => excerptKeys.has(codebookExcerptKey(excerpt))),
  })).filter((ref) => ref.excerpts.length);
}

function mergeCodebookSourceRefs(left, right) {
  const grouped = new Map();
  [...codebookSourceRefs(left), ...codebookSourceRefs(right)].forEach((ref) => {
    const key = `${ref.transcript_id || ""}|${ref.source_code_id || ""}|${ref.source_code_name || ""}`;
    const existing = grouped.get(key) || { ...ref, excerpts: [] };
    existing.excerpts = [...new Set([...(existing.excerpts || []), ...(ref.excerpts || [])])];
    grouped.set(key, existing);
  });
  return [...grouped.values()];
}

function renderCodebookSourceCodes(entry, entryIndex, canEditCodebook, displayItems) {
  const refs = codebookSourceRefs(entry);
  if (!refs.length) return "";
  return `<div class="codebook-source-codes">${refs.map((ref, refIndex) => {
    const file = projectFileForCodebookSource(ref);
    const sourceName = ref.original_source_code_name || ref.source_code_name || codebookEntryName(entry);
    return `<article class="codebook-source-code">
      <div class="codebook-source-heading"><span><strong>${escapeHTML(sourceName)}</strong><small>${escapeHTML(file?.name || ref.transcript_label || ref.transcript_id || "Transcript unavailable")}</small></span></div>
      <div class="codebook-source-excerpts">${(ref.excerpts || []).map((excerpt, excerptIndex) => `<div class="codebook-source-excerpt">
        <p>${escapeHTML(excerpt)}</p>
        ${canEditCodebook ? `<div class="codebook-evidence-actions"><label><span class="sr-only">Move this original code–excerpt pair to another final code</span><select aria-label="Move this original code–excerpt pair to another final code" data-codebook-move-entry="${entryIndex}" data-codebook-move-ref="${refIndex}" data-codebook-move-excerpt="${excerptIndex}"><option value="">Choose another code from the codebook</option>${displayItems.map(({ entry: candidate, index: candidateIndex }) => candidateIndex === entryIndex ? "" : `<option value="${candidateIndex}">${escapeHTML(codebookEntryName(candidate))}</option>`).join("")}</select></label><button class="codebook-remove-evidence" data-codebook-remove-entry="${entryIndex}" data-codebook-remove-ref="${refIndex}" data-codebook-remove-excerpt="${excerptIndex}" type="button">Remove from codebook</button></div>` : ""}
      </div>`).join("")}</div>
    </article>`;
  }).join("")}</div>`;
}

function refreshCodebookEntryFromSourceRefs(entry) {
  if (!entry) return;
  entry.source_refs = codebookSourceRefs(entry).map((ref) => ({
    ...ref,
    excerpts: [...new Set((ref.excerpts || []).filter((excerpt) => String(excerpt || "").trim()))],
  })).filter((ref) => ref.excerpts.length);
  entry.clues = [...new Set(entry.source_refs.flatMap((ref) => ref.excerpts || []))];
  entry.transcript_ids = [...new Set(entry.source_refs.map((ref) => String(ref.transcript_id || "")).filter(Boolean))];
}

function removeCodebookEvidence(entryIndex, refIndex, excerptIndex) {
  const entry = latestCodebook?.entries?.[entryIndex];
  const ref = codebookSourceRefs(entry)[refIndex];
  const excerpt = ref?.excerpts?.[excerptIndex];
  if (!entry || !ref || excerpt == null) return;
  const codeName = codebookEntryName(entry);
  const removesCode = (entry.clues || []).length === 1;
  recordCodebookChange(
    removesCode
      ? `Removed the final excerpt and automatically deleted “${codeName}”.`
      : `Removed one excerpt from “${codeName}”.`,
    () => {
      entry.source_refs = codebookSourceRefs(entry).map((item) => ({ ...item, excerpts: [...(item.excerpts || [])] }));
      entry.source_refs[refIndex].excerpts.splice(excerptIndex, 1);
      refreshCodebookEntryFromSourceRefs(entry);
      if (!entry.clues.length) {
        latestCodebook.entries.splice(entryIndex, 1);
        selectedCodebookEntryIndex = null;
      }
    },
  );
}

function moveCodebookEvidence(entryIndex, refIndex, excerptIndex, targetIndex) {
  const entries = latestCodebook?.entries || [];
  const sourceEntry = entries[entryIndex];
  const targetEntry = entries[targetIndex];
  const sourceRef = codebookSourceRefs(sourceEntry)[refIndex];
  const excerpt = sourceRef?.excerpts?.[excerptIndex];
  if (!sourceEntry || !targetEntry || !sourceRef || excerpt == null || entryIndex === targetIndex) return;
  const sourceName = codebookEntryName(sourceEntry);
  const targetName = codebookEntryName(targetEntry);
  const removesCode = (sourceEntry.clues || []).length === 1;
  recordCodebookChange(
    `Moved an excerpt from “${sourceName}” to “${targetName}”${removesCode ? ` and automatically deleted the empty code “${sourceName}”` : ""}.`,
    () => {
      sourceEntry.source_refs = codebookSourceRefs(sourceEntry).map((item) => ({ ...item, excerpts: [...(item.excerpts || [])] }));
      targetEntry.source_refs = codebookSourceRefs(targetEntry).map((item) => ({ ...item, excerpts: [...(item.excerpts || [])] }));
      const movingRef = sourceEntry.source_refs[refIndex];
      movingRef.excerpts.splice(excerptIndex, 1);
      const matchingTargetRef = targetEntry.source_refs.find((item) => (
        String(item.transcript_id || "") === String(movingRef.transcript_id || "")
        && String(item.source_code_id || "") === String(movingRef.source_code_id || "")
      ));
      if (matchingTargetRef) {
        matchingTargetRef.excerpts = [...new Set([...(matchingTargetRef.excerpts || []), excerpt])];
      } else {
        targetEntry.source_refs.push({
          ...movingRef,
          original_source_code_name: movingRef.original_source_code_name || movingRef.source_code_name || sourceName,
          excerpts: [excerpt],
        });
      }
      refreshCodebookEntryFromSourceRefs(sourceEntry);
      refreshCodebookEntryFromSourceRefs(targetEntry);
      if (!sourceEntry.clues.length) {
        entries.splice(entryIndex, 1);
        selectedCodebookEntryIndex = entries.indexOf(targetEntry);
      } else {
        selectedCodebookEntryIndex = entryIndex;
      }
    },
  );
}

function codebookExcerptTranscriptIds(entry, excerpt) {
  const excerptKey = codebookExcerptKey(excerpt);
  const matched = themeCodeInputs
    .filter((input) => codebookExcerptKey(input.quote) === excerptKey)
    .map((input) => String(input.transcriptId || input.transcript || "").trim())
    .filter(Boolean);
  if (matched.length) return [...new Set(matched)];
  const existing = [...new Set(entry?.transcript_ids || [])];
  return existing.length === 1 ? existing : [];
}

function refreshCodebookEntryTranscripts(entry) {
  if (!entry) return;
  const clues = Array.isArray(entry.clues) ? entry.clues : [];
  if (!clues.length) {
    entry.transcript_ids = [];
    return;
  }
  const mapped = clues.flatMap((excerpt) => codebookExcerptTranscriptIds(entry, excerpt));
  if (mapped.length) entry.transcript_ids = [...new Set(mapped)];
}

function recordCodebookChange(description, mutation) {
  if (!latestCodebook || codebookReviewFinished || themeGenerationStarted) {
    toast("The codebook is locked after review is finished.");
    return false;
  }
  codebookUndoStack.push({
    codebook: codebookClone(latestCodebook),
    selectedIndex: selectedCodebookEntryIndex,
    history: codebookClone(codebookChangeHistory),
  });
  if (codebookUndoStack.length > 20) codebookUndoStack.shift();
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookRenamingEntryIndex = null;
  mutation();
  codebookChangeHistory = [
    ...codebookChangeHistory,
    { description, at: new Date().toISOString() },
  ];
  renderThemes();
  updateThemeWorkflowButtons();
  markSaved();
  toast(description);
  return true;
}

function renameCodebookEntry(entryIndex, nextName) {
  const entry = latestCodebook?.entries?.[entryIndex];
  const oldName = codebookEntryName(entry);
  const name = String(nextName || "").trim();
  if (!entry) return;
  if (name === oldName) {
    codebookRenamingEntryIndex = null;
    renderCodebookPanel();
    return;
  }
  if (!name) {
    renderCodebookPanel();
    return toast("Code name cannot be empty.");
  }
  const duplicate = (latestCodebook.entries || []).some((candidate, index) => (
    index !== entryIndex && normalizedCodeKey(codebookEntryName(candidate)) === normalizedCodeKey(name)
  ));
  if (duplicate) {
    renderCodebookPanel();
    return toast("That code name already exists. Use Merge if these codes should be combined.");
  }
  codebookRenamingEntryIndex = null;
  recordCodebookChange(`Renamed “${oldName}” to “${name}”.`, () => {
    entry["initial code"] = name;
  });
}

function beginRenameCodebookEntry(entryIndex) {
  if (codebookReviewFinished || themeGenerationStarted || !latestCodebook?.entries?.[entryIndex]) return;
  codebookRenamingEntryIndex = entryIndex;
  renderCodebookPanel();
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-codebook-name="${entryIndex}"]`);
    input?.focus();
    input?.select();
  });
}

function openCodebookMergeControls(entryIndex) {
  if (!codebookItemIncluded(entryIndex)) return toast("That code is excluded by the current codebook filter.");
  codebookSplittingEntryIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  selectedCodebookEntryIndex = null;
  codebookMergingEntryIndex = entryIndex;
  codebookMergeSelectedIndexes = [entryIndex];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  renderCodebookPanel();
  window.requestAnimationFrame(() => {
    document.querySelector("[data-codebook-merge-choice]")?.focus();
  });
}

function codebookOriginalNameSuggestions(entry) {
  const suggestions = [];
  const seen = new Set();
  codebookSourceRefs(entry).forEach((ref) => {
    const name = String(ref.original_source_code_name || ref.source_code_name || "").trim();
    const key = normalizedCodeKey(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    suggestions.push(name);
  });
  return suggestions;
}

function beginSplitCodebookCode(entryIndex) {
  const entry = latestCodebook?.entries?.[entryIndex];
  if (!entry) return;
  if (!codebookItemIncluded(entryIndex)) return toast("That code is excluded by the current codebook filter.");
  if ((entry.clues || []).length < 2) return toast("A code needs at least two excerpts before it can be split.");
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  codebookRenamingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  selectedCodebookEntryIndex = null;
  codebookSplittingEntryIndex = entryIndex;
  codebookSplitDraft = {
    names: ["", ""],
    nameModes: ["", ""],
    assignments: (entry.clues || []).map(() => ""),
  };
  renderCodebookPanel();
}

function cancelSplitCodebookCode() {
  codebookSplittingEntryIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  renderCodebookPanel();
}

function changeCodebookSplitPartCount(change) {
  const entry = latestCodebook?.entries?.[codebookSplittingEntryIndex];
  if (!entry) return;
  const maximum = Math.max(2, (entry.clues || []).length);
  const nextCount = Math.max(2, Math.min(maximum, codebookSplitDraft.names.length + change));
  if (nextCount > codebookSplitDraft.names.length) {
    codebookSplitDraft.names.push("");
    codebookSplitDraft.nameModes = [...(codebookSplitDraft.nameModes || []), ""];
  }
  if (nextCount < codebookSplitDraft.names.length) {
    codebookSplitDraft.names = codebookSplitDraft.names.slice(0, nextCount);
    codebookSplitDraft.nameModes = (codebookSplitDraft.nameModes || []).slice(0, nextCount);
    codebookSplitDraft.assignments = codebookSplitDraft.assignments.map((value) => Number(value) >= nextCount ? "" : value);
  }
  renderCodebookPanel();
}

function splitCodebookCode(entryIndex) {
  const entries = latestCodebook?.entries || [];
  const source = entries[entryIndex];
  if (!source) return;
  if (!codebookItemIncluded(entryIndex)) return toast("That code is excluded by the current codebook filter.");
  const names = codebookSplitDraft.names.map((name) => String(name || "").trim());
  if (names.length < 2 || names.some((name) => !name)) return toast("Name every new code before splitting.");
  const normalizedNames = names.map(normalizedCodeKey);
  if (new Set(normalizedNames).size !== names.length) return toast("Each new code needs a different name.");
  const existingNames = new Set(entries
    .filter((_, index) => index !== entryIndex)
    .map((entry) => normalizedCodeKey(codebookEntryName(entry))));
  if (normalizedNames.some((name) => existingNames.has(name))) return toast("A new code name already exists in the codebook.");

  const assignments = codebookSplitDraft.assignments.map((value) => value === "" ? -1 : Number(value));
  if (assignments.length !== (source.clues || []).length || assignments.some((index) => index < 0 || index >= names.length)) {
    return toast("Assign every excerpt to one new code.");
  }
  const groups = names.map(() => []);
  source.clues.forEach((excerpt, index) => groups[assignments[index]].push(excerpt));
  if (groups.some((group) => group.length === 0)) return toast("Assign at least one excerpt to every new code.");

  const sourceName = codebookEntryName(source);
  codebookSplittingEntryIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  recordCodebookChange(`Split “${sourceName}” into ${names.map((name) => `“${name}”`).join(", ")}.`, () => {
    const replacements = names.map((name, index) => {
      const inferredTranscriptIds = [...new Set(groups[index]
        .flatMap((excerpt) => codebookExcerptTranscriptIds(source, excerpt)))];
      const sourceTranscriptIds = [...new Set(source.transcript_ids || [])];
      const entry = {
        "initial code": name,
        clues: groups[index],
        transcript_ids: inferredTranscriptIds.length
          ? inferredTranscriptIds
          : (sourceTranscriptIds.length === 1 ? sourceTranscriptIds : []),
        source_refs: codebookSourceRefsForExcerpts(source, groups[index]),
      };
      refreshCodebookEntryTranscripts(entry);
      return entry;
    });
    entries.splice(entryIndex, 1, ...replacements);
    selectedCodebookEntryIndex = entryIndex;
  });
}

function beginMergeCodebookCode() {
  const entries = latestCodebook?.entries || [];
  const selectedIndexes = [...new Set(codebookMergeSelectedIndexes)]
    .filter((index) => Number.isInteger(index) && entries[index]);
  const resultName = String(codebookMergeCustomName || "").trim();
  const matchingSelectedIndex = selectedIndexes.find((index) => (
    normalizedCodeKey(codebookEntryName(entries[index])) === normalizedCodeKey(resultName)
  ));
  const targetIndex = Number.isInteger(matchingSelectedIndex) ? matchingSelectedIndex : selectedIndexes[0];
  const sourceIndexes = [...new Set(codebookMergeSelectedIndexes)]
    .filter((index) => Number.isInteger(index) && index !== targetIndex && entries[index]);
  if (selectedIndexes.length < 2) {
    return toast("Select at least two final codes to merge.");
  }
  if (!Number.isInteger(targetIndex) || !selectedIndexes.includes(targetIndex) || !resultName) {
    return toast("Choose or enter a code name for the merged result.");
  }
  const duplicateOutsideSelection = entries.some((entry, index) => (
    !selectedIndexes.includes(index) && normalizedCodeKey(codebookEntryName(entry)) === normalizedCodeKey(resultName)
  ));
  if (duplicateOutsideSelection) return toast("That code name already exists outside this merge selection.");
  if (!codebookItemIncluded(targetIndex) || sourceIndexes.some((index) => !codebookItemIncluded(index))) {
    return toast("Merge only codes included by the current codebook filter.");
  }
  codebookSplittingEntryIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = { sourceIndexes, targetIndex, resultName };
  renderCodebookPanel();
}

function cancelMergeCodebookCode() {
  codebookPendingMerge = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  renderCodebookPanel();
}

function mergeCodebookCodes(sourceIndexes, targetIndex, resultName = "") {
  const entries = latestCodebook?.entries || [];
  const target = entries[targetIndex];
  const validSourceIndexes = [...new Set(sourceIndexes || [])]
    .filter((index) => Number.isInteger(index) && index !== targetIndex && entries[index]);
  const sources = validSourceIndexes.map((index) => entries[index]);
  if (!target || !sources.length) return toast("Select at least one final code to merge.");
  if (!codebookItemIncluded(targetIndex) || validSourceIndexes.some((index) => !codebookItemIncluded(index))) {
    return toast("Merge only codes included by the current codebook filter.");
  }
  const sourceNames = sources.map(codebookEntryName);
  const targetName = String(resultName || codebookEntryName(target)).trim();
  codebookPendingMerge = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  recordCodebookChange(`Merged ${sourceNames.map((name) => `“${name}”`).join(", ")} into “${targetName}”.`, () => {
    target["initial code"] = targetName;
    sources.forEach((source) => {
      target.clues = [...new Set([...(target.clues || []), ...(source.clues || [])])];
      target.transcript_ids = [...new Set([...(target.transcript_ids || []), ...(source.transcript_ids || [])])];
      target.source_refs = mergeCodebookSourceRefs(target, source);
    });
    validSourceIndexes.sort((left, right) => right - left).forEach((index) => entries.splice(index, 1));
    selectedCodebookEntryIndex = entries.indexOf(target);
  });
}

function requestDeleteCodebookEntry(entryIndex) {
  const entry = latestCodebook?.entries?.[entryIndex];
  if (!entry || codebookReviewFinished || themeGenerationStarted) return;
  if (!codebookItemIncluded(entryIndex)) return toast("That code is excluded by the current codebook filter.");
  codebookPendingMerge = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookSplittingEntryIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  codebookRenamingEntryIndex = null;
  selectedCodebookEntryIndex = null;
  codebookPendingDeleteIndex = entryIndex;
  renderCodebookPanel();
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-codebook-delete-confirm="${entryIndex}"]`)?.focus();
  });
}

function cancelDeleteCodebookEntry() {
  codebookPendingDeleteIndex = null;
  renderCodebookPanel();
}

function deleteCodebookEntry(entryIndex) {
  const entries = latestCodebook?.entries || [];
  const entry = entries[entryIndex];
  if (!entry || codebookPendingDeleteIndex !== entryIndex) return;
  const codeName = codebookEntryName(entry);
  const pairCount = codebookSourceRefs(entry)
    .reduce((total, ref) => total + (ref.excerpts || []).length, 0);
  codebookPendingDeleteIndex = null;
  recordCodebookChange(
    `Deleted final code “${codeName}” and its ${pairCount} original code–excerpt pair${pairCount === 1 ? "" : "s"} from the reviewed codebook.`,
    () => {
      entries.splice(entryIndex, 1);
      selectedCodebookEntryIndex = null;
    },
  );
}

function undoCodebookChange() {
  const previous = codebookUndoStack.pop();
  if (!previous || codebookReviewFinished) return toast("There is no codebook change to undo.");
  latestCodebook = previous.codebook;
  selectedCodebookEntryIndex = previous.selectedIndex;
  codebookChangeHistory = previous.history;
  codebookSplittingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  codebookRenamingEntryIndex = null;
  codebookSplittingEntryIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = null;
  renderThemes();
  updateThemeWorkflowButtons();
  markSaved();
  toast("Last codebook change undone.");
}

function codebookAssignmentsForTranscript(transcriptId) {
  const targetId = String(transcriptId || "");
  const assignments = [];
  (latestCodebook?.entries || []).forEach((entry, entryIndex) => {
    codebookSourceRefs(entry).forEach((ref, refIndex) => {
      if (String(ref.transcript_id || "") !== targetId || !(ref.excerpts || []).length) return;
      assignments.push({
        entry,
        entryIndex,
        ref,
        refIndex,
        finalName: codebookEntryName(entry),
        sourceId: String(ref.source_code_id || ""),
        excerpts: [...new Set(ref.excerpts || [])],
      });
    });
  });
  return assignments;
}

function codebookReviewVersion(code, finalName, excerpts, recordedAt) {
  const previousVersion = Math.max(1, Number(code.version || 1));
  const previousSnapshot = {
    version: previousVersion,
    code_name: String(code.title || ""),
    excerpts: codeExcerptList(code),
    review_status: code.reviewStatus || "",
    accepted_at: code.acceptedAt || "",
    superseded_at: recordedAt,
    change_memo: "Changed during Codebook review",
  };
  return {
    ...code,
    title: finalName,
    quote: excerpts[0] ? `"${excerpts[0]}"` : "",
    quotes: [...excerpts],
    excerpts: [...excerpts],
    source: code.sourceClass === "human" ? "Human" : "AI+Human",
    reviewStatus: code.sourceClass === "human" ? "accepted" : "revised",
    selected: true,
    version: previousVersion + 1,
    versionHistory: [...(Array.isArray(code.versionHistory) ? code.versionHistory : []), previousSnapshot],
    amendmentMemo: "Changed during Codebook review",
    reopenedForAmendment: true,
    transformationHistory: [...transformationHistory(code), {
      operation: "codebook_review",
      method: "edit_myself",
      instruction: "",
      memo: "Changed during Codebook review",
      recorded_at: recordedAt,
      version: previousVersion + 1,
      previous_version: {
        code_name: previousSnapshot.code_name,
        excerpts: previousSnapshot.excerpts,
      },
      active_time_ms: 0,
    }],
  };
}

function synchronizeTranscriptSnapshotFromCodebook(file, snapshot) {
  const transcriptId = String(file.id || "");
  const originalInputs = themeCodeInputs.filter((input) => String(input.transcriptId || input.transcript || "") === transcriptId);
  const originalSourceIds = new Set(originalInputs.map((input) => String(input.codeId || "")).filter(Boolean));
  const assignments = codebookAssignmentsForTranscript(transcriptId);
  const currentCodes = Array.isArray(snapshot.codes) ? snapshot.codes : [];
  const currentById = new Map(currentCodes.map((code) => [String(code.id || ""), code]));
  if (!originalSourceIds.size) return { changed: false, snapshot, descriptors: currentTranscriptCodeDescriptors(currentCodes) };

  const desiredSignature = assignments.map((assignment) => ({
    id: assignment.sourceId,
    title: assignment.finalName,
    excerpts: assignment.excerpts.map(codebookExcerptKey).sort(),
  })).sort((left, right) => `${left.id}|${left.title}`.localeCompare(`${right.id}|${right.title}`));
  const currentSignature = currentCodes
    .filter((code) => originalSourceIds.has(String(code.id || "")) && isFinalAiCodingResult(code))
    .map((code) => ({ id: String(code.id || ""), title: String(code.title || ""), excerpts: codeExcerptList(code).map(codebookExcerptKey).sort() }))
    .sort((left, right) => `${left.id}|${left.title}`.localeCompare(`${right.id}|${right.title}`));
  if (JSON.stringify(desiredSignature) === JSON.stringify(currentSignature)) {
    return { changed: false, snapshot, descriptors: currentTranscriptCodeDescriptors(currentCodes) };
  }

  const recordedAt = new Date().toISOString();
  const groupedBySource = new Map();
  assignments.forEach((assignment) => {
    const items = groupedBySource.get(assignment.sourceId) || [];
    items.push(assignment);
    groupedBySource.set(assignment.sourceId, items);
  });
  const replacements = [];
  groupedBySource.forEach((items, sourceId) => {
    const base = currentById.get(sourceId);
    if (!base) return;
    items.forEach((assignment, assignmentIndex) => {
      const sameTitle = normalizedCodeKey(base.title) === normalizedCodeKey(assignment.finalName);
      const sameExcerpts = JSON.stringify(codeExcerptList(base).map(codebookExcerptKey).sort())
        === JSON.stringify(assignment.excerpts.map(codebookExcerptKey).sort());
      const replacement = items.length === 1 && sameTitle && sameExcerpts
        ? { ...base, excerpts: [...assignment.excerpts], quotes: [...assignment.excerpts] }
        : codebookReviewVersion(base, assignment.finalName, assignment.excerpts, recordedAt);
      replacement.id = assignmentIndex === 0
        ? sourceId
        : `${sourceId}-codebook-${Date.now()}-${assignmentIndex + 1}`;
      if (assignmentIndex > 0) {
        replacement.splitFromCodeId = sourceId;
        replacement.sourceCodeIds = [...new Set([...(base.sourceCodeIds || []).map(String), sourceId])];
      }
      assignment.ref.original_source_code_name = assignment.ref.original_source_code_name
        || assignment.ref.source_code_name
        || base.title
        || assignment.finalName;
      assignment.ref.source_code_id = replacement.id;
      replacements.push(replacement);
    });
  });
  const preserved = currentCodes.filter((code) => !originalSourceIds.has(String(code.id || "")));
  const preservedIds = new Set(preserved.map((code) => String(code.id || "")));
  const existingExcerptRows = Array.isArray(snapshot.identifiedExcerpts) ? snapshot.identifiedExcerpts : [];
  const nextExcerptRows = [
    ...existingExcerptRows.filter((row) => preservedIds.has(String(row.codeId ?? row.id ?? ""))),
    ...replacements
      .filter((code) => code.sourceClass !== "human")
      .flatMap((code) => codeExcerptList(code).map((text, excerptIndex) => {
        const prior = existingExcerptRows.find((row) => codebookExcerptKey(row.text) === codebookExcerptKey(text));
        return {
          ...(prior || {}),
          id: `${code.id}-excerpt-${excerptIndex + 1}`,
          codeId: code.id,
          text,
        };
      })),
  ];
  const nextRevision = Math.max(1, Number(snapshot.codingRevision || 1)) + 1;
  const nextSnapshot = {
    ...snapshot,
    codes: [...preserved, ...replacements],
    identifiedExcerpts: nextExcerptRows,
    codingRevision: nextRevision,
    lastFinishedCodingRevision: nextRevision,
    codeReviewStage: "complete",
    codebookReviewChanges: [
      ...(Array.isArray(snapshot.codebookReviewChanges) ? snapshot.codebookReviewChanges : []),
      {
        memo: "Changed during Codebook review",
        recorded_at: recordedAt,
        codebook_id: latestCodebookId || "",
      },
    ],
  };
  return { changed: true, snapshot: nextSnapshot, descriptors: currentTranscriptCodeDescriptors(nextSnapshot.codes) };
}

function codebookReviewQuestionnaireRows(snapshot, transcriptName) {
  const scores = Array.isArray(snapshot.codingQuestionnaireResponses) ? snapshot.codingQuestionnaireResponses : [];
  const redFlags = (snapshot.codes || []).filter((code) => isCalibrationCode(code) && code.reviewStatus === "accepted").length;
  return [
    ["username", "project_id", "project_name", "transcript_file", "research_question", "interviewee", "red_flags_shown", "question_number", "question", "score", "response_time_ms", "answer_changes", "timing_method"],
    ...scores.map((item) => [
      currentUser?.username || "", currentProject?.id || "", currentProject?.name || "", transcriptName,
      currentProject?.research_question || document.getElementById("researchQuestion").value,
      currentProject?.interviewee || document.getElementById("interviewee").value,
      redFlags, item.question_number, item.question, item.score, item.response_time_ms, item.answer_changes, item.timing_method,
    ]),
  ];
}

function codebookReviewFinishedFiles(file, snapshot, savedAt = new Date().toISOString()) {
  const baseName = `${safeDownloadBaseName(file.name || "")}_ReflexCoTI`;
  const revision = Math.max(1, Number(snapshot.codingRevision || 1));
  const timing = snapshot.workflowTiming || {};
  const metadata = {
    account: { username: currentUser?.username || "" },
    project: { id: currentProject?.id || "", name: currentProject?.name || "" },
    research_question: currentProject?.research_question || document.getElementById("researchQuestion").value,
    interviewee: currentProject?.interviewee || document.getElementById("interviewee").value,
    transcript: { file_name: file.name || "" },
    coding_revision: revision,
    finished_at: savedAt,
  };
  const manualCodes = (snapshot.codes || []).filter((code) => isPreAiManualHumanCode(code) && code.reviewStatus !== "rejected");
  const originalCodes = (snapshot.originalAiCodes?.length ? snapshot.originalAiCodes : (snapshot.codes || []).filter((code) => code.sourceClass !== "human"))
    .filter((code) => !isCalibrationCode(code));
  return [
    jsonExportFile({ ...metadata, codes: (snapshot.codes || []).filter(isFinalAiCodingResult).map(simpleCodeRecord) }, `${baseName}.json`),
    jsonExportFile({ ...metadata, codes: originalCodes.map(originalAiCodeRecord) }, `${baseName}_AI_original.json`),
    jsonExportFile({
      ...metadata,
      user_timing: {
        total_active_time_ms: Math.round(Number(timing.totalActiveTimeMs || 0)),
        active_sessions: Number(timing.sessionCount || 0),
        scope: "human_manual_coding",
        started: Boolean(timing.started),
        completed: Boolean(timing.finished),
        start_event: "first_excerpt_selection",
        end_event: "finish_human_coding_click",
        includes_questionnaire: false,
        timing_method: timing.timingMethod || "active_time_60s_idle_cap",
      },
      codes: manualCodes.map(humanCodeRecord),
    }, `${baseName}_Human_version.json`),
    csvExportFile(codebookReviewQuestionnaireRows(snapshot, file.name || ""), `${baseName}_questionnaire.csv`),
  ];
}

async function synchronizeCodebookReviewToTranscripts() {
  const selectedIds = new Set((selectedThemeTranscriptIds || []).map(String));
  const files = projectFiles.filter((file) => selectedIds.has(String(file.id)));
  const refreshedInputs = [];
  for (const file of files) {
    const analysis = await apiFetch(`/api/projects/${currentProject.id}/transcripts/${file.id}/analysis`);
    const result = synchronizeTranscriptSnapshotFromCodebook(file, analysis.snapshot || {});
    if (result.changed) {
      const saved = await apiFetch(`/api/projects/${currentProject.id}/transcripts/${file.id}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.snapshot),
      });
      await apiFetch(`/api/projects/${currentProject.id}/transcripts/${file.id}/finished-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "coding",
          revision: result.snapshot.codingRevision,
          files: codebookReviewFinishedFiles(file, result.snapshot),
        }),
      });
      file.codes_count = saved.codes_count;
      file.excerpts_count = saved.excerpts_count;
      file.analysis_status = saved.analysis_status;
      selectedThemeCodingRevisions[String(file.id)] = result.snapshot.codingRevision;
    }
    refreshedInputs.push(...result.descriptors.flatMap((descriptor) => descriptor.excerpts.map((quote) => ({
      codeName: descriptor.title,
      codeId: descriptor.id,
      source: descriptor.source,
      quote,
      transcript: file.name,
      transcriptId: String(file.id),
    }))));
  }
  themeCodeInputs = refreshedInputs;
  themeJsonFiles = files.map((file) => {
    const fileInputs = themeCodeInputs.filter((input) => String(input.transcriptId) === String(file.id));
    const grouped = new Map();
    fileInputs.forEach((input) => {
      const existing = grouped.get(input.codeId) || { "code id": input.codeId, "code name": input.codeName, source: input.source, excerpts: [] };
      existing.excerpts.push(input.quote);
      grouped.set(input.codeId, existing);
    });
    return new File([JSON.stringify({ transcript: { file_name: file.name, id: file.id }, codes: [...grouped.values()] })], `${safeDownloadBaseName(file.name)}_ReflexCoTI.json`, { type: "application/json" });
  });
}

async function finishCodebookReview() {
  let entries = latestCodebook?.entries || [];
  if (!entries.length) return toast("Add at least one code before finishing the codebook review.");
  if (!latestCodebookId) return toast("Generate the codebook again before finishing its review.");
  const emptyCodes = entries.filter((entry) => !(entry.clues || []).length);
  const nonEmptyCodes = entries.filter((entry) => (entry.clues || []).length);
  if (!nonEmptyCodes.length) return toast("At least one code with an excerpt is required.");
  if (emptyCodes.length) {
    codebookUndoStack.push({ codebook: codebookClone(latestCodebook), selectedIndex: selectedCodebookEntryIndex, history: codebookClone(codebookChangeHistory) });
    latestCodebook.entries = nonEmptyCodes;
    entries = latestCodebook.entries;
    codebookChangeHistory = [...codebookChangeHistory, { description: `Removed ${emptyCodes.length} empty code${emptyCodes.length === 1 ? "" : "s"} automatically.`, at: new Date().toISOString() }];
  }
  const finishButton = document.getElementById("finishCodebookReviewBtn");
  if (finishButton) {
    finishButton.disabled = true;
    finishButton.textContent = "Saving reviewed codebook…";
  }
  try {
    await synchronizeCodebookReviewToTranscripts();
    await apiFetch(`/api/codebooks/${latestCodebookId}/reviewed-codebook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edited_codebook: latestCodebook,
        change_history: codebookChangeHistory,
      }),
    });
    await archiveProjectFinishedResultFiles(
      "codebook",
      Math.max(1, Number(themeRevision || 1)),
    );
  } catch (error) {
    if (finishButton) finishButton.textContent = "Finish codebook review";
    updateThemeWorkflowButtons();
    return toast(error.message || "Could not save the reviewed codebook.");
  }
  if (finishButton) finishButton.textContent = "Finish codebook review";
  codebookReviewFinished = true;
  codebookModificationMode = false;
  codebookSplittingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  codebookHistoryOpen = false;
  setThemeWorkspaceMode("codebook", { render: false });
  renderThemes();
  updateThemeWorkflowButtons();
  markSaved();
  toast("Codebook review finished. Transcript coding changes were synchronized and saved automatically.");
}

function reopenCodebookReview() {
  if (!latestCodebook || themeGenerationStarted) return toast("The codebook is locked after AI theme generation starts.");
  if ((preGenerationHumanThemes.length || humanThemesFinished) && !window.confirm("Reopening the codebook will clear the human-theme work created after review. Continue?")) return;
  codebookReviewFinished = false;
  codebookModificationMode = false;
  codebookSplittingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  codebookSplitDraft = { names: [], assignments: [] };
  preGenerationHumanThemes = [];
  humanThemesFinished = false;
  manualThemeReuseFinished = false;
  clearManualThemeFields();
  renderThemes();
  updateThemeWorkflowButtons();
  markSaved();
  toast("Codebook review reopened.");
}

function toggleCodebookModificationMode() {
  if (!latestCodebook || codebookReviewFinished || themeGenerationStarted) return;
  codebookModificationMode = !codebookModificationMode;
  codebookSplittingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  if (!codebookModificationMode) codebookHistoryOpen = false;
  renderCodebookPanel();
  updateThemeWorkflowButtons();
}

function renderCodebookSplitPanel(entry, entryIndex) {
  if (codebookSplittingEntryIndex !== entryIndex) return "";
  const excerpts = entry.clues || [];
  const names = codebookSplitDraft.names;
  const originalNames = codebookOriginalNameSuggestions(entry);
  return `<div class="codebook-split-panel">
    <div class="codebook-split-heading">
      <div><strong>Split “${escapeHTML(codebookEntryName(entry))}”</strong><p>Choose an original code name or enter your own, then assign every excerpt to exactly one final code.</p></div>
      <button class="codebook-inline-cancel" data-codebook-split-cancel type="button">Cancel</button>
    </div>
    <div class="codebook-split-names">
      ${names.map((name, index) => {
        const customMode = codebookSplitDraft.nameModes?.[index] === "custom";
        return `<label><span>New final code ${index + 1}</span>${customMode ? `<input data-codebook-split-name="${index}" value="${escapeHTML(name)}" maxlength="160" placeholder="Enter a new code name" autocomplete="off" title="Press Escape to choose an original code name" />` : `<select data-codebook-split-name-choice="${index}"><option value="">Choose an original code name</option>${originalNames.map((originalName) => `<option value="${escapeHTML(originalName)}" ${normalizedCodeKey(name) === normalizedCodeKey(originalName) ? "selected" : ""}>${escapeHTML(originalName)}</option>`).join("")}<option value="__custom__">Enter a new code name</option></select>`}</label>`;
      }).join("")}
    </div>
    <div class="codebook-split-count-actions">
      <button class="secondary-btn" data-codebook-split-remove type="button" ${names.length <= 2 ? "disabled" : ""}>Remove last added code</button>
      <button class="secondary-btn" data-codebook-split-add type="button" ${names.length >= excerpts.length ? "disabled" : ""}>+ Add another code</button>
    </div>
    <div class="codebook-split-assignments">
      ${excerpts.map((excerpt, excerptIndex) => {
        const labels = transcriptLabelsForCodebookExcerpt(entry, excerpt);
        const selectedValue = String(codebookSplitDraft.assignments[excerptIndex] ?? "");
        return `<article><p>${escapeHTML(excerpt)}${labels.length ? `<span>${escapeHTML(labels.join(", "))}</span>` : ""}</p><label><span>Assign to</span><select data-codebook-split-assignment="${excerptIndex}"><option value="">Choose new code…</option>${names.map((name, index) => `<option value="${index}" ${selectedValue === String(index) ? "selected" : ""}>${escapeHTML(String(name || "").trim() || `New code ${index + 1}`)}</option>`).join("")}</select></label></article>`;
      }).join("")}
    </div>
    <div class="codebook-split-actions"><button class="primary-btn" data-codebook-split-save="${entryIndex}" type="button">Apply split</button><button class="codebook-inline-cancel" data-codebook-split-cancel type="button">Cancel</button></div>
  </div>`;
}

function renderCodebookPanel() {
  const content = document.getElementById("codebookContent");
  if (!content) return;
  document.getElementById("themeCodebookSetupCard")?.classList.toggle("hidden", Boolean(latestCodebook));
  document.getElementById("codebookPanel")?.classList.toggle("hidden", !latestCodebook);
  if (!latestCodebook) {
    content.innerHTML = "";
    return;
  }
  const entries = latestCodebook.entries || [];
  const filteredItems = filteredCodebookItems();
  const themeEntries = filteredItems.map(({ entry }) => entry);
  const selectedKeys = new Set(manualThemeSelectedCodeNames().map(normalizedCodeKey));
  const simplifiedHumanView = themeWorkspaceMode === "human" && codebookReviewFinished && !piReadOnlyMode;
  const simplifiedAiView = themeWorkspaceMode === "ai" && codebookReviewFinished;
  const simplifiedReferenceView = simplifiedHumanView || simplifiedAiView;
  const highlightedTheme = themes.find((theme) => String(theme.id) === String(highlightedThemeId || ""));
  const highlightedCodeKeys = new Set((highlightedTheme?.codes || []).map((code) => normalizedCodeKey(
    typeof code === "string" ? code : (code.codeName || code.title || code.name || "")
  )).filter(Boolean));
  const hasHighlightedCodes = simplifiedAiView && highlightedCodeKeys.size > 0;
  const canSelectForHumanTheme = themeWorkspaceMode === "human" && codebookReviewFinished && !themeGenerationStarted;
  const canEditCodebook = !codebookReviewFinished && !themeGenerationStarted;
  const mergeSelectionActive = canEditCodebook && Number.isInteger(codebookMergingEntryIndex);
  const displayItems = filteredItems;
  const aiDeleteSuggestions = aiSuggestedDeletionItems();
  content.innerHTML = `
    ${simplifiedReferenceView ? "" : `<div class="codebook-summary">
      <div>
        <strong>${codebookReviewFinished ? "Codebook review finished" : "Review the codebook"}</strong>
        <p>${entries.length} unique code${entries.length === 1 ? "" : "s"} from ${themeJsonFiles.length} uploaded JSON file${themeJsonFiles.length === 1 ? "" : "s"}.</p>
      </div>
      <div class="codebook-summary-actions">
        ${codebookReviewFinished ? `<span class="codebook-review-state finished">Finished</span>` : ""}
        ${codebookReviewFinished && !themeGenerationStarted ? `<button class="codebook-modify-btn" id="reopenCodebookReviewBtn" type="button">Edit again</button>` : ""}
      </div>
    </div>`}
    ${!codebookReviewFinished ? `<div class="codebook-review-tools">
      <p>Double-click a final code name to rename it. Expand a final code to move or remove original code–excerpt pairs. Delete removes an entire final code. Changes synchronize with the transcript coding results when you finish the review.</p>
      <div class="codebook-review-actions">
        ${codebookDeletionSuggestionsEnabled() ? `<button class="secondary-btn ai-delete-suggestions-btn ${codebookAiSuggestionsOpen ? "active" : ""}" id="toggleAiDeleteSuggestionsBtn" type="button" aria-expanded="${codebookAiSuggestionsOpen}">AI-suggested deletions (${aiDeleteSuggestions.length})</button>` : ""}
        ${canEditCodebook && codebookUndoStack.length ? `<button class="secondary-btn" id="undoCodebookChangeBtn" type="button">Undo</button>` : ""}
        ${codebookChangeHistory.length ? `<button class="secondary-btn" id="toggleCodebookHistoryBtn" type="button" aria-expanded="${codebookHistoryOpen}">Changes (${codebookChangeHistory.length})</button>` : ""}
      </div>
    </div>` : ""}
    ${!codebookReviewFinished && codebookDeletionSuggestionsEnabled() && codebookAiSuggestionsOpen ? `<div class="ai-delete-suggestions-panel">
      <strong>AI-suggested deletions</strong>
      ${aiDeleteSuggestions.length
        ? `<p>Review these potentially unrelated final codes before deciding whether to delete them.</p><div>${aiDeleteSuggestions.map(({ entry, index }) => `<button data-ai-delete-target="${index}" type="button"><strong>${escapeHTML(codebookEntryName(entry) || "Unnamed code")}</strong><span>${escapeHTML(entry.ai_deletion_reason || "This code and its excerpts may not directly help answer the research question.")}</span></button>`).join("")}</div>`
        : `<p>The AI did not flag any final codes as unrelated to the research question.</p>`}
    </div>` : ""}
    ${!codebookReviewFinished && codebookHistoryOpen ? `<div class="codebook-change-history"><strong>Codebook changes</strong>${codebookChangeHistory.length ? `<ol>${[...codebookChangeHistory].reverse().map((change) => `<li><span>${escapeHTML(change.description || "Codebook updated.")}</span><time>${escapeHTML(new Date(change.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</time></li>`).join("")}</ol>` : `<p>No changes recorded yet.</p>`}</div>` : ""}
    ${simplifiedReferenceView ? "" : `<div class="codebook-filter">
      <div class="codebook-filter-actions">
        <button class="codebook-visualize-btn" id="openCodebookExplorer" type="button">Visualize all ${themeEntries.length} code${themeEntries.length === 1 ? "" : "s"}</button>
      </div>
    </div>`}
    <div class="codebook-preview" aria-label="Codebook entries">
      ${displayItems.map(({ entry, index: entryIndex }) => {
        const codeName = entry?.["initial code"] || "Unnamed code";
        const themeCodeMatch = hasHighlightedCodes && highlightedCodeKeys.has(normalizedCodeKey(codeName));
        const transcriptIds = [...new Set(entry?.transcript_ids || [])];
        const excerpts = entry?.clues || [];
        const selected = selectedKeys.has(normalizedCodeKey(codeName));
        const isExpanded = selectedCodebookEntryIndex === entryIndex;
        const isSplitting = codebookSplittingEntryIndex === entryIndex;
        const isMerging = codebookMergingEntryIndex === entryIndex;
        const isMergeChoiceSelected = codebookMergeSelectedIndexes.includes(entryIndex);
        const pendingMergeSourceIndexes = codebookPendingMerge?.targetIndex === entryIndex ? codebookPendingMerge.sourceIndexes : [];
        const isPendingMerge = Boolean(pendingMergeSourceIndexes?.length);
        const isPendingDelete = codebookPendingDeleteIndex === entryIndex;
        const showAiDeletionReason = canEditCodebook
          && codebookDeletionSuggestionsEnabled()
          && entry.ai_suggested_delete === true
          && isExpanded;
        const mergeNameReady = Boolean(String(codebookMergeCustomName || "").trim());
        return `
          <div class="codebook-entry-group ${themeCodeMatch ? "theme-code-match" : (hasHighlightedCodes ? "theme-code-dimmed" : "")} ${canEditCodebook && codebookDeletionSuggestionsEnabled() && codebookAiSuggestionsOpen && entry.ai_suggested_delete === true ? "ai-delete-suggested" : ""}" data-codebook-entry-group="${entryIndex}">
            <div class="codebook-entry ${canEditCodebook ? "editable" : ""} ${isExpanded || isSplitting || (mergeSelectionActive && isMergeChoiceSelected) ? "selected" : ""} ${showAiDeletionReason ? "has-ai-deletion-reason" : ""}">
              ${canEditCodebook && codebookRenamingEntryIndex === entryIndex
                ? `<label class="codebook-name-editor"><span>Rename final code · Return to save · Esc to cancel</span><input data-codebook-name="${entryIndex}" value="${escapeHTML(codeName)}" maxlength="160" aria-label="Rename final code. Press Return to save or Escape to cancel." /></label>`
                : mergeSelectionActive
                  ? `<div class="codebook-merge-choice"><label class="codebook-merge-selector"><input data-codebook-merge-choice="${entryIndex}" type="checkbox" ${isMergeChoiceSelected ? "checked" : ""} /><span class="sr-only">Select ${escapeHTML(codeName)} for merging</span></label><div class="codebook-entry-copy"><strong title="${escapeHTML(codeName)}">${escapeHTML(codeName)}</strong><span>${transcriptIds.length} transcript${transcriptIds.length === 1 ? "" : "s"} · ${excerpts.length} excerpt${excerpts.length === 1 ? "" : "s"}</span></div></div>`
                  : `<button class="codebook-entry-copy ${selected ? "selected" : ""}" ${canEditCodebook ? `data-codebook-start-rename="${entryIndex}" aria-label="Rename ${escapeHTML(codeName)}" title="Double click to rename"` : `data-manual-theme-code="${escapeHTML(codeName)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${selected ? "Remove" : "Select"} ${escapeHTML(codeName)} for a human theme" ${canSelectForHumanTheme ? "" : "disabled"}`} type="button"><strong title="${escapeHTML(codeName)}">${escapeHTML(codeName)}</strong><span>${transcriptIds.length} transcript${transcriptIds.length === 1 ? "" : "s"} · ${excerpts.length} excerpt${excerpts.length === 1 ? "" : "s"}</span>${canEditCodebook && codebookDeletionSuggestionsEnabled() && codebookAiSuggestionsOpen && entry.ai_suggested_delete === true ? `<em class="ai-delete-suggestion-badge">AI suggested delete</em>` : ""}</button>`}
              ${showAiDeletionReason ? `<div class="codebook-ai-deletion-reason" role="note"><strong>Why AI suggested deletion</strong><span>${escapeHTML(entry.ai_deletion_reason || "This code and its excerpts may not directly help answer the research question.")}</span></div>` : ""}
              ${mergeSelectionActive ? "" : canEditCodebook ? `<div class="codebook-row-actions"><button data-codebook-open-merge="${entryIndex}" type="button">Merge</button><button data-codebook-split="${entryIndex}" type="button" ${excerpts.length < 2 ? `disabled title="At least two excerpts are required"` : ""}>Split</button><button class="codebook-delete-code" data-codebook-delete="${entryIndex}" type="button">Delete</button><button class="codebook-entry-toggle" data-codebook-entry="${entryIndex}" type="button" aria-expanded="${isExpanded}" aria-label="${isExpanded ? "Hide" : "Show"} evidence for ${escapeHTML(codeName)}">${isExpanded ? "−" : "+"}</button></div>` : `<button class="codebook-entry-toggle" data-codebook-entry="${entryIndex}" type="button" aria-expanded="${isExpanded}" aria-label="${isExpanded ? "Hide" : "Show"} evidence for ${escapeHTML(codeName)}">${isExpanded ? "−" : "+"}</button>`}
            </div>
            ${canEditCodebook && isPendingDelete ? `<div class="codebook-inline-confirm codebook-delete-confirm" role="group" aria-label="Confirm final code deletion"><p><strong>Delete final code “${escapeHTML(codeName)}”?</strong><span>Its ${excerpts.length} original code–excerpt pair${excerpts.length === 1 ? "" : "s"} will be removed from the transcript coding results when you finish the review.</span></p><div><button class="codebook-confirm-delete" data-codebook-delete-confirm="${entryIndex}" type="button">Delete final code</button><button class="codebook-inline-cancel" data-codebook-delete-cancel type="button">Cancel</button></div></div>` : ""}
            ${isExpanded ? `
              <div class="codebook-detail">
                <div class="codebook-detail-heading"><strong>Associated evidence</strong><span>${excerpts.length} excerpt${excerpts.length === 1 ? "" : "s"}</span></div>
                ${renderCodebookSourceCodes(entry, entryIndex, canEditCodebook, displayItems)}
              </div>` : ""}
            ${canEditCodebook && isMerging ? `<div class="codebook-multi-merge-panel"><div><strong>Merge selected final codes</strong><span>Select at least two final codes, then choose or enter the code name for the merged result.</span></div><label><span>Code name after merge</span>${codebookMergeUsesCustomName ? `<input data-codebook-merge-custom-name value="${escapeHTML(codebookMergeCustomName)}" maxlength="160" placeholder="Enter a new code name" autocomplete="off" title="Press Escape to choose a selected code name" />` : `<select data-codebook-merge-name><option value="">Choose a selected code name</option>${codebookMergeSelectedIndexes.map((selectedIndex) => entries[selectedIndex] ? `<option value="${selectedIndex}" ${codebookMergeNameIndex === selectedIndex ? "selected" : ""}>${escapeHTML(codebookEntryName(entries[selectedIndex]))}</option>` : "").join("")}<option value="__custom__">Enter a new code name</option></select>`}</label><button class="secondary-btn" data-codebook-merge="${entryIndex}" type="button" ${codebookMergeSelectedIndexes.length >= 2 && mergeNameReady ? "" : "disabled"}>Merge selected codes${codebookMergeSelectedIndexes.length ? ` (${codebookMergeSelectedIndexes.length})` : ""}</button><button class="codebook-inline-cancel" data-codebook-merge-cancel type="button">Cancel</button></div>` : ""}
            ${canEditCodebook && isMerging && isPendingMerge ? `<div class="codebook-inline-confirm" role="group" aria-label="Confirm final code merge"><p><strong>Combine ${pendingMergeSourceIndexes.length + 1} selected final codes as “${escapeHTML(codebookPendingMerge.resultName)}”?</strong><span>All selected original code–excerpt pairs will be combined under this final code name.</span></p><div><button class="primary-btn" data-codebook-merge-confirm type="button">Confirm merge</button><button class="codebook-inline-cancel" data-codebook-merge-confirm-cancel type="button">Cancel</button></div></div>` : ""}
            ${canEditCodebook && isSplitting ? renderCodebookSplitPanel(entry, entryIndex) : ""}
          </div>`;
      }).join("") || `<article class="empty-state compact"><strong>No codes available</strong><p>No code names remain with the current filter.</p></article>`}
    </div>`;
}

function codebookTranscriptLabel(transcriptId) {
  const rawId = String(transcriptId || "").trim();
  const exactFile = projectFiles.find((file) => String(file.id || "") === rawId);
  if (exactFile?.name) return exactFile.name;
  const idDigits = rawId.match(/\d+/)?.[0] || "";
  const matchingFile = projectFiles.find((file) => {
    const baseName = String(file.name || "").replace(/\.docx$/i, "");
    const fileDigits = baseName.match(/\d+/)?.[0] || "";
    return baseName === rawId || (idDigits && fileDigits === idDigits);
  });
  if (matchingFile?.name) return matchingFile.name;
  const sourceRef = (latestCodebook?.entries || [])
    .flatMap((entry) => entry.source_refs || [])
    .find((ref) => String(ref.transcript_id || "") === rawId);
  const codeInput = themeCodeInputs.find((input) => String(input.transcriptId || "") === rawId);
  return sourceRef?.transcript_label || codeInput?.transcript || rawId || "Unknown transcript";
}

function codebookExcerptKey(value) {
  return cleanExcerptText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function codebookTranscriptKey(value) {
  return String(value || "")
    .split(/[\\/]/).pop()
    .replace(/\.docx$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function transcriptLabelsForCodebookExcerpt(entry, excerpt) {
  const excerptKey = codebookExcerptKey(excerpt);
  const matchedLabels = themeCodeInputs
    .filter((input) => codebookExcerptKey(input.quote) === excerptKey)
    .map((input) => input.transcript)
    .filter(Boolean);
  if (matchedLabels.length) return [...new Set(matchedLabels)];
  const transcriptIds = [...new Set(entry.transcript_ids || [])];
  return transcriptIds.length === 1 ? [codebookTranscriptLabel(transcriptIds[0])] : [];
}

function setCodebookTranscriptHighlight(badge, active) {
  const detail = badge?.closest(".codebook-chart-detail");
  if (!detail) return;
  const transcriptKey = badge.dataset.highlightTranscript || "";
  detail.classList.toggle("transcript-highlighting", active);
  detail.querySelectorAll("[data-excerpt-transcripts]").forEach((excerptItem) => {
    const excerptKeys = String(excerptItem.dataset.excerptTranscripts || "").split(" ").filter(Boolean);
    excerptItem.classList.toggle("matches-transcript", active && excerptKeys.includes(transcriptKey));
  });
  detail.querySelectorAll("[data-highlight-transcript]").forEach((transcriptBadge) => {
    transcriptBadge.classList.toggle("active", active && transcriptBadge === badge);
  });
}

function codebookGrowthHistory() {
  const stored = Array.isArray(projectCodebook?.update_history) ? projectCodebook.update_history : [];
  if (stored.length) return stored;
  const transcriptIds = Object.keys(projectCodebook?.included_revisions || {});
  if (!transcriptIds.length || !projectCodebook?.available) return [];
  const transcriptId = transcriptIds[transcriptIds.length - 1];
  return [{
    order: transcriptIds.length,
    transcript_id: transcriptId,
    transcript_name: codebookTranscriptLabel(transcriptId),
    total_codes: Number(projectCodebook.current_size || 0),
    net_growth: Number(projectCodebook.net_growth || 0),
    new_code_names: Array.isArray(projectCodebook.new_code_names) && projectCodebook.new_code_names.length
      ? projectCodebook.new_code_names
      : (latestCodebook?.entries || []).filter((entry) => {
          const entryTranscriptIds = [...new Set((entry.source_refs || []).map((ref) => String(ref.transcript_id || "")).filter(Boolean))];
          return entryTranscriptIds.length === 1 && entryTranscriptIds[0] === String(transcriptId);
        }).map((entry) => entry["initial code"]).filter(Boolean),
  }];
}

function codebookGrowthChart(history) {
  if (!history.length) return '<section class="codebook-growth-panel"><p>No codebook update history is available yet.</p></section>';
  const width = 760;
  const height = 250;
  const left = 48;
  const right = 24;
  const top = 22;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...history.map((item) => Number(item.total_codes || 0)));
  const points = history.map((item, index) => ({
    x: history.length === 1 ? left + plotWidth / 2 : left + (index / (history.length - 1)) * plotWidth,
    y: top + plotHeight - (Number(item.total_codes || 0) / maximum) * plotHeight,
  }));
  const linePoints = points.map((point) => point.x + "," + point.y).join(" ");
  const yTicks = [0, Math.ceil(maximum / 2), maximum].filter((value, index, values) => values.indexOf(value) === index);
  const grid = yTicks.map((value) => {
    const y = top + plotHeight - (value / maximum) * plotHeight;
    return '<line x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '" class="codebook-growth-grid" /><text x="' + (left - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="codebook-growth-axis-label">' + value + '</text>';
  }).join("");
  const dots = points.map((point, index) => '<g><circle cx="' + point.x + '" cy="' + point.y + '" r="6" class="codebook-growth-dot" /><text x="' + point.x + '" y="' + (point.y - 12) + '" text-anchor="middle" class="codebook-growth-value">' + Number(history[index].total_codes || 0) + '</text><text x="' + point.x + '" y="' + (height - 17) + '" text-anchor="middle" class="codebook-growth-axis-label">T' + (index + 1) + '</text></g>').join("");
  const updateButtons = history.map((item, index) => {
    const growth = Number(item.net_growth || 0);
    const label = item.transcript_name || codebookTranscriptLabel(item.transcript_id);
    const isActive = highlightedCodebookCodeNames.length && (item.new_code_names || []).some((name) => highlightedCodebookCodeNames.includes(String(name).toLocaleLowerCase()));
    return '<button class="codebook-growth-update ' + (isActive ? "active" : "") + '" data-codebook-history-index="' + index + '" type="button"><span>T' + (index + 1) + ': ' + escapeHTML(label) + '</span><strong>' + (growth >= 0 ? "+" : "") + growth + ' code' + (Math.abs(growth) === 1 ? "" : "s") + '</strong></button>';
  }).join("");
  return '<section class="codebook-growth-panel" aria-label="Codebook growth by transcript"><div class="codebook-growth-heading"><div><strong>Total codes after each transcript</strong><span>Select an update to jump to its first newly added code. Select it again to clear.</span></div><span>Y-axis: total codes</span></div><svg class="codebook-growth-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Line plot of total codebook codes by transcript order">' + grid + '<polyline points="' + linePoints + '" class="codebook-growth-line" />' + dots + '</svg><div class="codebook-growth-updates">' + updateButtons + '</div></section>';
}

function renderCodebookExplorer() {
  const content = document.getElementById("codebookExplorerContent");
  if (!content) return;
  const items = filteredCodebookItems().sort((left, right) => {
    const transcriptDifference = new Set(right.entry.transcript_ids || []).size - new Set(left.entry.transcript_ids || []).size;
    const excerptDifference = (right.entry.clues || []).length - (left.entry.clues || []).length;
    return transcriptDifference || excerptDifference || String(left.entry["initial code"] || "").localeCompare(String(right.entry["initial code"] || ""));
  });
  const entries = items.map(({ entry }) => entry);
  const excerptTotal = entries.reduce((total, entry) => total + (entry.clues || []).length, 0);
  const transcriptIds = new Set(entries.flatMap((entry) => entry.transcript_ids || []));
  const transcriptTotal = entries.length ? (transcriptIds.size || selectedThemeTranscriptIds.length || themeJsonFiles.length) : 0;
  const netGrowth = Number(projectCodebook?.net_growth || 0);
  const growthHistory = codebookGrowthHistory();
  const growthLabel = netGrowth > 0 ? `+${netGrowth}` : String(netGrowth);
  const maximumExcerptCount = Math.max(1, ...entries.map((entry) => (entry.clues || []).length));
  const maximumTranscriptCount = Math.max(1, ...entries.map((entry) => new Set(entry.transcript_ids || []).size));
  content.innerHTML = `
    <div class="codebook-explorer-context">
      <span>Project codebook</span>
      <strong>Cumulative finished transcripts</strong>
    </div>
    <div class="codebook-explorer-stats" aria-label="Codebook totals">
      <div><strong>${entries.length}</strong><span>Codes</span></div>
      <button class="codebook-stat-button ${netGrowth > 0 ? "positive" : netGrowth < 0 ? "negative" : ""}" data-toggle-codebook-growth type="button" aria-expanded="${codebookGrowthOpen}"><strong>${growthLabel}</strong><span>Since previous update</span><small>${codebookGrowthOpen ? "Hide trend" : "View trend"}</small></button>
      <div><strong>${transcriptTotal}</strong><span>Transcripts</span></div>
      <div><strong>${excerptTotal}</strong><span>Coded excerpts</span></div>
    </div>
    ${codebookGrowthOpen ? codebookGrowthChart(growthHistory) : ""}
    <div class="codebook-chart-heading">
      <div>
        <strong>Code distribution</strong>
        <span>Ranked by transcripts, then coded excerpts</span>
      </div>
      <div class="codebook-chart-legend" aria-label="Chart legend">
        <span><i class="transcript-key"></i>Transcripts</span>
        <span><i class="excerpt-key"></i>Excerpts</span>
      </div>
    </div>
    <div class="codebook-distribution-chart">
        ${items.map(({ entry, index: entryIndex }) => {
          const excerptCount = (entry.clues || []).length;
          const transcriptIdsForCode = [...new Set(entry.transcript_ids || [])];
          const transcriptCount = transcriptIdsForCode.length;
          const transcriptRecords = transcriptIdsForCode.map((transcriptId) => {
            const label = codebookTranscriptLabel(transcriptId);
            return { label, key: codebookTranscriptKey(label) };
          });
          const excerptWidth = Math.max(3, (excerptCount / maximumExcerptCount) * 100);
          const transcriptWidth = Math.max(3, (transcriptCount / maximumTranscriptCount) * 100);
          const isExpanded = selectedCodebookEntryIndex === entryIndex;
          const isJumpTarget = highlightedCodebookCodeNames.includes(String(entry["initial code"] || "").toLocaleLowerCase());
          return `
            <article class="codebook-chart-item ${isExpanded ? "expanded" : ""} ${isJumpTarget ? "new-code-highlight" : ""}" ${isJumpTarget ? 'data-new-codebook-code="true"' : ""}>
              <button class="codebook-chart-row" data-explorer-code="${entryIndex}" type="button" aria-expanded="${isExpanded}">
              <span class="codebook-chart-label">
                <strong>${escapeHTML(entry["initial code"] || "Unnamed code")}</strong>
                <small>${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"} <i aria-hidden="true">&middot;</i> ${excerptCount} excerpt${excerptCount === 1 ? "" : "s"}</small>
              </span>
              <span class="codebook-chart-bars">
                <span class="codebook-bar-line"><small>Transcripts</small><span class="codebook-bar-track"><i class="codebook-bar transcripts" style="width: ${transcriptWidth}%"></i></span><strong>${transcriptCount}</strong></span>
                <span class="codebook-bar-line"><small>Excerpts</small><span class="codebook-bar-track"><i class="codebook-bar excerpts" style="width: ${excerptWidth}%"></i></span><strong>${excerptCount}</strong></span>
              </span>
              <span class="codebook-chart-chevron" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
              </button>
              ${isExpanded ? `
                <div class="codebook-chart-detail">
                  <section>
                    <strong>Transcripts containing this code</strong>
                    <p class="codebook-transcript-hint">Hover over or focus a transcript to highlight its excerpts.</p>
                    <div class="codebook-transcript-list">${transcriptRecords.map(({ label, key }) => `<button data-highlight-transcript="${escapeHTML(key)}" type="button">${escapeHTML(label)}</button>`).join("") || `<span>No transcript information available.</span>`}</div>
                  </section>
                  <section>
                    <strong>Detailed excerpts</strong>
                    <ol>${(entry.clues || []).map((excerpt) => {
                      const transcriptKeys = transcriptLabelsForCodebookExcerpt(entry, excerpt).map(codebookTranscriptKey).filter(Boolean);
                      return `<li data-excerpt-transcripts="${escapeHTML(transcriptKeys.join(" "))}">${escapeHTML(excerpt)}</li>`;
                    }).join("") || `<li>No excerpts available.</li>`}</ol>
                  </section>
                </div>` : ""}
            </article>`;
        }).join("") || `<p class="codebook-explorer-empty">No codes are available in this codebook.</p>`}
    </div>`;
  content.querySelectorAll("[data-highlight-transcript]").forEach((badge) => {
    badge.addEventListener("mouseenter", () => setCodebookTranscriptHighlight(badge, true));
    badge.addEventListener("mouseleave", () => setCodebookTranscriptHighlight(badge, false));
    badge.addEventListener("focus", () => setCodebookTranscriptHighlight(badge, true));
    badge.addEventListener("blur", () => setCodebookTranscriptHighlight(badge, false));
  });
}

function renderThemeSplitPanel(theme) {
  if (!theme.splitMode) return "";
  const splitParts = Array.isArray(theme.splitParts) && theme.splitParts.length >= 2
    ? theme.splitParts
    : [];
  theme.splitParts = splitParts;
  const hasSplitCount = splitParts.length >= 2;
  const groups = hasSplitCount ? themeSplitCodeGroups(theme, splitParts.length) : [];
  const maxParts = Math.max(2, theme.codes.length);
  const seniorManualOnly = piReadOnlyMode && seniorThemeEditMode;
  return `
    <div class="revise-panel theme-split-panel">
      ${seniorManualOnly ? "" : renderAssistChoice({ action: "split", noun: "theme", mode: theme.assistMode || "", isRefinement: Boolean(theme.aiDraft) })}
      ${theme.assistMode === "manual" ? `${theme.aiDraft ? "" : "<strong>Create the split themes</strong>"}
      ${renderAiUnderstanding(theme.aiDraft)}
      <label class="theme-split-count-label">Number of themes
        <select data-theme-split-count>
          <option value="" ${hasSplitCount ? "" : "selected"} disabled>Choose number of themes</option>
          ${Array.from({ length: maxParts - 1 }, (_, index) => index + 2).map((count) => `
            <option value="${count}" ${hasSplitCount && count === splitParts.length ? "selected" : ""}>${count} themes</option>
          `).join("")}
        </select>
      </label>
      ${hasSplitCount ? `
        <div class="theme-split-parts">
          ${splitParts.map((part, index) => {
          return `
            <section class="theme-split-part" data-theme-split-part="${index}">
              <div class="theme-split-part-heading">
                <strong>New theme ${index + 1}</strong>
              </div>
              <label>Theme name
                <input data-theme-split-field="title" value="${escapeHTML(part.title || "")}" placeholder="Enter new theme name" />
              </label>
              <label>Description
                <textarea data-theme-split-field="rationale" placeholder="Describe this new theme">${escapeHTML(part.rationale || "")}</textarea>
              </label>
              <fieldset class="theme-split-code-picker">
                <legend>Codes in this theme</legend>
                <p>Choose the codes that belong under this new theme.</p>
                <div class="theme-split-code-options">
                  ${theme.codes.map((code, codeIndex) => `
                    <label>
                      <input type="checkbox" data-theme-split-code="${codeIndex}" ${groups[index]?.includes(code) ? "checked" : ""} />
                      <span>${escapeHTML(code.codeName || "Unnamed code")}</span>
                    </label>
                  `).join("")}
                </div>
              </fieldset>
            </section>`;
          }).join("")}
        </div>` : `<p class="theme-split-empty">Choose how many themes you want before entering new theme names and descriptions.</p>`}
      <div class="revise-actions">
        <button class="action-btn accept" data-theme-action="save-split" type="button" ${hasSplitCount ? "" : "disabled"}>${theme.aiDraft ? "Use this proposal" : "Save & keep reviewing"}</button>
        ${theme.aiDraft && !seniorManualOnly ? `<button class="action-btn refine-ai" data-refine-ai-proposal type="button">Refine with AI</button>` : ""}
        <button class="action-btn cancel-action" data-theme-action="cancel-split" type="button">Cancel</button>
      </div>
      ` : `<button class="action-btn plain" data-theme-action="cancel-split" type="button">Cancel</button>`}
    </div>`;
}

function renderMergeThemeEditor() {
  const target = document.getElementById("mergeThemeEditor");
  if (!target) return;
  const selectedThemes = themes.filter((theme) => theme.selectedForMerge);
  if (!mergeThemeEditorOpen || selectedThemes.length < 2) {
    target.innerHTML = "";
    return;
  }
  const suggestedName = selectedThemes.map((theme) => theme.title).filter(Boolean).join(" + ");
  const seniorManualOnly = piReadOnlyMode && seniorThemeEditMode;
  target.innerHTML = `
    <div class="revise-panel theme-merge-panel">
      ${seniorManualOnly ? "" : renderAssistChoice({ action: "merge", noun: "set of themes", mode: themeMergeAssistMode, isRefinement: Boolean(themeMergeDraft) })}
      ${themeMergeAssistMode === "manual" ? `${themeMergeDraft ? "" : "<strong>Create the merged theme</strong>"}
        ${renderAiUnderstanding(themeMergeDraft)}
        <label>New theme name<input id="mergedThemeTitle" value="${escapeHTML(themeMergeDraft?.title || "")}" placeholder="${escapeHTML(suggestedName)}" data-suggested-title="${escapeHTML(suggestedName)}" /></label>
        <label>Description<textarea id="mergedThemeRationale" placeholder="Provide a description for this merged theme.">${escapeHTML(themeMergeDraft?.rationale || "")}</textarea></label>
        <div class="revise-actions"><button class="action-btn accept" id="saveMergedThemeBtn" type="button">Apply merge</button>${themeMergeDraft && !seniorManualOnly ? `<button class="action-btn refine-ai" data-refine-merge-ai type="button">Refine with AI</button>` : ""}<button class="action-btn cancel-action" id="cancelMergedThemeBtn" type="button">Cancel</button></div>`
        : `<button class="action-btn plain" id="cancelMergedThemeBtn" type="button">Cancel</button>`}
    </div>`;
}

function resetCodebookReviewState() {
  codebookReviewFinished = false;
  codebookModificationMode = false;
  codebookSplittingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  codebookUndoStack = [];
  codebookChangeHistory = [];
  codebookHistoryOpen = false;
  codebookAiSuggestionsOpen = false;
  themeAmendmentReturnStage = "";
  themeRevision = 1;
  lastFinishedThemeRevision = 0;
  lastExportedThemeRevision = 0;
  themeQuestionnaireResponses = [];
  themesExportedAt = "";
}

function resetAnalysis() {
  flushActiveReviewTimer();
  analysisReady = false;
  identifiedExcerpts = [];
  codes = [];
  originalAiCodes = [];
  initialAgentReflections = {};
  agentReflections = {};
  themes = [];
  originalAiThemes = [];
  preGenerationHumanThemes = [];
  humanThemesFinished = false;
  manualThemeReuseFinished = false;
  themeGenerationStarted = false;
  themeReviewStage = "idle";
  expandedThemeId = null;
  themeWorkspaceMode = "codebook";
  themeAmendmentReturnStage = "";
  latestCodebook = null;
  latestCodebookId = null;
  codebookDeletionSuggestionChoice = "";
  codebookResearchQuestion = "";
  mergeCodeEditorOpen = false;
  codeMergeAssistMode = "";
  codeMergeDraft = null;
  resetCodeMergeSuggestions();
  codeReviewStage = "review";
  codeReviewFilter = "all";
  codeAmendmentReturnStage = "";
  codingRevision = 1;
  lastFinishedCodingRevision = 0;
  codingFinishedWhenOpened = false;
  lastExportedCodingRevision = 0;
  codingQuestionnaireResponses = [];
  codingExportedAt = "";
  manualCodeReuseFinished = false;
  mergeThemeEditorOpen = false;
  themeJsonFiles = [];
  codebookExpanded = false;
  selectedCodebookEntryIndex = null;
  themeCodebookFilter = "keep-all";
  resetCodebookReviewState();
  themesFinishedWhenOpened = false;
  themeMergeAssistMode = "";
  themeMergeDraft = null;
  newCodeEditorOpen = false;
  newThemeEditorOpen = false;
  selectedTranscriptExcerpt = null;
  humanCodingFinished = false;
  humanCodingFinishedWhenOpened = false;
  manualCodeDraftExpanded = false;
  aiCodingStarted = false;
  expandedCodeId = null;
  focusedHumanCodeId = null;
}

async function resetWorkspaceForNextTranscript() {
  const currentIndex = projectFiles.indexOf(activeTranscriptFile);
  if (currentIndex >= 0 && currentIndex < projectFiles.length - 1) {
    const nextIndex = currentIndex + 1;
    const selector = document.getElementById("activeTranscriptSelect");
    if (selector) selector.value = projectFiles[nextIndex].id;
    await loadProjectTranscript(projectFiles[nextIndex]);
    toast(`Opened transcript ${nextIndex + 1} of ${projectFiles.length}.`);
    return;
  }
  toast("All transcripts in this project have been reached.");
}

function clearTranscriptWorkspace() {
  transcript = [];
  pauseWorkflowTiming();
  resetWorkflowTiming();
  resetAnalysis();
  resetReadingGate();
  document.getElementById("transcriptSearch").value = "";
  lastSavedAt = null;
  renderTranscript();
  renderCodes();
  renderThemes();
  renderLastSaved();
  document.querySelector(".editor-grid")?.scrollTo({ top: 0, behavior: "smooth" });
}

function resetThemesForNewGeneration({ announce = true, statusMessage = "No ReflexCoTI JSON files uploaded yet." } = {}) {
  themesFinishedWhenOpened = false;
  pauseWorkflowTiming();
  resetWorkflowTiming();
  if (activeReviewTimer?.kind === "theme") activeReviewTimer = null;
  themeJsonFiles = [];
  themeCodeInputs = [];
  themeTranscriptDocuments = [];
  latestCodebook = null;
  latestCodebookId = null;
  codebookDeletionSuggestionChoice = "";
  codebookResearchQuestion = "";
  themes = [];
  originalAiThemes = [];
  preGenerationHumanThemes = [];
  humanThemesFinished = false;
  manualThemeReuseFinished = false;
  themeGenerationStarted = false;
  themeReviewStage = "idle";
  themeWorkspaceMode = "codebook";
  codebookExpanded = false;
  selectedCodebookEntryIndex = null;
  themeCodebookFilter = "keep-all";
  resetCodebookReviewState();
  mergeThemeEditorOpen = false;
  themeMergeAssistMode = "";
  themeMergeDraft = null;
  themeMergeStartedAt = 0;
  newThemeEditorOpen = false;
  themeViewThemes = [];
  themeViewPositions = new Map();
  themeViewLayoutMethod = "";
  themeViewCanvasHeight = 620;
  themeVisualizationMode = "map";
  const themeInput = document.getElementById("themeJsonFiles");
  if (themeInput) themeInput.value = "";
  clearManualThemeFields();
  document.getElementById("themeUploadStatus").textContent = statusMessage;
  document.getElementById("codebookUploadHint").textContent = "Add transcripts with saved coding results.";
  const themeSearch = document.getElementById("themeViewSearch");
  if (themeSearch) themeSearch.value = "";
  resetQuestionnaireTiming("theme", THEME_QUESTIONNAIRE_ITEMS.length);
  resetQuestionnaireView(themeQuestionnaireModal, themeQuestionnaireForm, themeQuestionnaireList);
  themeQuestionnaireModal?.classList.add("hidden");
  lastSavedAt = null;
  updateThemeWorkflowButtons();
  renderThemes();
  renderLastSaved();
  if (announce) toast("Ready for a new theme generation.");
}

function invalidateThemesForTranscriptChange() {
  selectedThemeTranscriptIds = [];
  resetThemesForNewGeneration({
    announce: false,
    statusMessage: "Transcript set changed. Finish coding all transcripts to begin fresh theme development.",
  });
}

function setIdentifyRunning(isRunning, message = "") {
  document.querySelectorAll(".identify-action").forEach((button) => {
    button.disabled = isRunning;
    button.textContent = isRunning ? "Running workflow..." : "Identify codes & excerpts";
  });
  if (message) document.getElementById("uploadedTranscriptName").textContent = message;
  if (!isRunning) updateReadingGateStatus();
}

function updateCodeReview(codeId, action, control = null) {
  const code = codes.find((item) => String(item.id) === String(codeId));
  if (!code) return;
  let warnBeforeNextAiCode = false;
  if (action === "amend") {
    code.amendMode = true;
    renderCodes();
    requestAnimationFrame(() => {
      revealExpandedCodeCard(codeId);
      document.querySelector(`[data-code-id="${CSS.escape(String(codeId))}"] [data-amendment-memo]`)?.focus({ preventScroll: true });
    });
    return;
  } else if (action === "cancel-amend") {
    code.amendMode = false;
    renderCodes();
    return;
  } else if (action === "confirm-amend") {
    const memo = document.querySelector(`[data-code-id="${CSS.escape(String(codeId))}"] [data-amendment-memo]`)?.value;
    return reopenAcceptedCode(code, memo);
  } else if (action === "revise") {
    code.editMode = "both";
    code.assistMode = piReadOnlyMode && seniorCodeEditMode ? "manual" : "";
    code.aiDraft = null;
    code.selectedForMerge = false;
    code.splitMode = false;
    mergeCodeEditorOpen = false;
  } else if (action === "split") {
    const excerpts = codeExcerptList(code);
    if (excerpts.length < 2) return toast("This code needs at least two excerpts before it can be split.");
    code.splitMode = true;
    code.assistMode = "";
    code.aiDraft = null;
    code.splitParts = [{ title: "" }, { title: "" }];
    code.splitAssignments = excerpts.map((_, index) => index % 2);
    code.editMode = "";
    code.selectedForMerge = false;
    mergeCodeEditorOpen = false;
  } else if (action === "set-split-count") {
    const draft = collectCodeSplitDraft(codeId);
    const maxParts = codeExcerptList(code).length;
    const requestedCount = Math.max(2, Math.min(Number(control?.value) || 2, maxParts));
    code.splitParts = Array.from({ length: requestedCount }, (_, index) => ({
      title: draft.titles[index] || code.splitParts?.[index]?.title || "",
    }));
    code.splitAssignments = codeExcerptList(code).map((_, index) => {
      const assignment = Number(draft.assignments[index]);
      return Number.isInteger(assignment) && assignment >= 0 && assignment < requestedCount ? assignment : index % requestedCount;
    });
    code.splitMode = true;
  } else if (action === "cancel-split") {
    if (rollbackUnchangedAcceptedCodeAmendment(code)) {
      markSaved();
      toast("Modification canceled. The accepted code was not changed.");
    } else {
      code.splitMode = false;
      code.assistMode = "";
      code.aiDraft = null;
      code.splitParts = undefined;
      code.splitAssignments = undefined;
    }
  } else if (action === "save-split") {
    const draft = collectCodeSplitDraft(codeId);
    const excerpts = codeExcerptList(code);
    const titles = draft.titles.map((title) => title.trim());
    if (titles.length < 2 || titles.some((title) => !title)) return toast("Every split code needs a name.");
    const uniqueTitles = new Set(titles.map((title) => title.toLowerCase()));
    if (uniqueTitles.size !== titles.length) return toast("Each split code needs a different name.");
    const groups = titles.map(() => []);
    draft.assignments.forEach((assignment, index) => {
      const partIndex = Number(assignment);
      if (Number.isInteger(partIndex) && groups[partIndex] && excerpts[index]) groups[partIndex].push(excerpts[index]);
    });
    if (groups.some((group) => group.length === 0)) return toast("Assign at least one excerpt to every new code.");
    const manuallyEditedAiProposal = Boolean(code.aiDraft && (
      !sameTextList(titles, code.aiDraft.splitParts?.map((part) => part.title))
      || !sameNumberList(draft.assignments, code.aiDraft.splitAssignments)
    ));
    const sourceCodeIds = [...new Set([
      ...((code.sourceCodeIds || []).map(String)),
      ...((code.seniorSourceCodeIds || []).map(String)),
      ...(code.splitFromCodeId ? [String(code.splitFromCodeId)] : []),
    ].filter(Boolean))];
    const oldExcerptRows = identifiedExcerpts.filter((item) => String(item.codeId ?? item.id) === String(codeId));
    delete code.amendmentRollback;
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    finalizeReviewTiming(code, "split");
    if (manuallyEditedAiProposal) {
      appendAiThenManualTransformation(code, "split");
    } else {
      appendTransformation(code, "split", editMethod(code));
    }
    const history = transformationHistory(code);
    const inheritedTiming = { ...ensureReviewTiming(code), finalDecision: "" };
    const replacements = groups.map((group, index) => {
      const id = `${codeId}-split-${stamp}-${index + 1}`;
      return {
        id,
        title: titles[index],
        icon: code.icon || "◆",
        color: code.color || "#a855f7",
        source: "AI+Human",
        sourceClass: "ai",
        agents: Array.isArray(code.agents) ? [...code.agents] : [],
        quote: group[0] ? `"${group[0]}"` : "",
        quotes: group,
        excerpts: group,
        selected: false,
        version: Math.max(1, Number(code.version || 1)),
        versionHistory: Array.isArray(code.versionHistory) ? [...code.versionHistory] : [],
        reopenedForAmendment: Boolean(code.reopenedForAmendment),
        amendmentMemo: code.amendmentMemo || "",
        selectedForMerge: false,
        reviewStatus: "",
        transformationHistory: [...history],
        reviewTiming: { ...inheritedTiming },
        splitFromCodeId: code.id,
        ...(sourceCodeIds.length ? { sourceCodeIds } : {}),
        ...(code["◇"] ? { "◇": code["◇"] } : {}),
        editMode: "",
        splitMode: false,
      };
    });
    codes = codes.flatMap((item) => String(item.id) === String(codeId) ? replacements : [item]);
    identifiedExcerpts = [
      ...identifiedExcerpts.filter((item) => String(item.codeId ?? item.id) !== String(codeId)),
      ...replacements.flatMap((replacement, index) => groups[index].map((text, excerptIndex) => ({
        id: `${replacement.id}-excerpt-${excerptIndex + 1}`,
        codeId: replacement.id,
        text,
        line: oldExcerptRows.find((item) => normalizeForMatch(item.text) === normalizeForMatch(text))?.line || oldExcerptRows[excerptIndex]?.line || "",
        code: replacement.title,
        score: "",
        scoreLevel: "strong",
      }))),
    ];
    expandedCodeId = null;
    markSaved();
    renderTranscript(document.getElementById("transcriptSearch").value);
    toast(`Code split into ${replacements.length} codes. Review each result, then Accept when finished.`);
    renderCodes();
    return;
  } else if (action === "merge") {
    code.selectedForMerge = !code.selectedForMerge;
    code.editMode = "";
    mergeCodeEditorOpen = reviewableCodes().filter((item) => item.selectedForMerge).length >= 2;
  } else if (action === "cancel-revise") {
    if (rollbackUnchangedAcceptedCodeAmendment(code)) {
      markSaved();
      toast("Modification canceled. The accepted code was not changed.");
    } else {
      code.editMode = "";
      code.assistMode = "";
      code.aiDraft = null;
    }
  } else if (action === "save-revisions") {
    const input = document.querySelector(`[data-code-id="${CSS.escape(String(codeId))}"] [data-edit-field="code-title"]`);
    const textarea = document.querySelector(`[data-code-id="${CSS.escape(String(codeId))}"] [data-edit-field="excerpt"]`);
    const cleanTitle = input?.value.trim();
    const cleanExcerpts = splitExcerptInput(textarea?.value || "");
    if (!cleanTitle) return toast("Code name cannot be empty.");
    if (cleanExcerpts.length === 0) return toast("Excerpt cannot be empty.");
    const noContentChange = cleanTitle === String(code.title || "").trim()
      && sameTextList(cleanExcerpts, codeExcerptList(code));
    if (noContentChange) {
      const rolledBack = rollbackUnchangedAcceptedCodeAmendment(code);
      if (!rolledBack) {
        code.editMode = "";
        code.assistMode = "";
        code.aiDraft = null;
      }
      markSaved();
      renderTranscript(document.getElementById("transcriptSearch").value);
      renderCodes();
      toast(rolledBack
        ? "No changes were saved. The accepted code keeps its existing version."
        : "No changes were saved.");
      return;
    }
    delete code.amendmentRollback;
    const manuallyEditedAiProposal = Boolean(code.aiDraft && (
      cleanTitle !== String(code.aiDraft.title || "").trim()
      || !sameTextList(cleanExcerpts, code.aiDraft.excerpts)
    ));
    code.title = cleanTitle;
    code.quote = `"${cleanExcerpts[0]}"`;
    code.quotes = cleanExcerpts;
    code.excerpts = cleanExcerpts;
    if (code.sourceClass !== "human") {
      code.source = "AI+Human";
      const oldExcerpts = identifiedExcerpts.filter((item) => String(item.codeId ?? item.id) === String(codeId));
      identifiedExcerpts = identifiedExcerpts.filter((item) => String(item.codeId ?? item.id) !== String(codeId));
      identifiedExcerpts = [
        ...identifiedExcerpts,
        ...cleanExcerpts.map((text, index) => ({
          id: `${codeId}-rev-${index + 1}`,
          codeId: code.id,
          text,
          line: oldExcerpts[index]?.line || oldExcerpts[0]?.line || "",
          code: cleanTitle,
          score: "",
          scoreLevel: "strong",
        })),
      ];
    }
    if (manuallyEditedAiProposal) {
      appendAiThenManualTransformation(code, "revised");
    } else {
      appendTransformation(code, "revised", editMethod(code));
    }
    code.reviewStatus = "";
    code.editMode = "";
    code.assistMode = "";
    code.aiDraft = null;
    code.splitMode = false;
    ensureReviewTiming(code).finalDecision = "";
    expandedCodeId = code.id;
    markSaved();
    renderTranscript(document.getElementById("transcriptSearch").value);
    toast("Code revised. You can revise it again, then Accept when finished.");
  } else if (action === "accept") {
    if (code.amendmentRollback && rollbackUnchangedAcceptedCodeAmendment(code)) {
      markSaved();
      renderTranscript(document.getElementById("transcriptSearch").value);
      renderCodes();
      toast("No changes were made. The code keeps its existing version.");
      return;
    }
    const acceptedAmendment = Boolean(code.reopenedForAmendment);
    finalizeReviewTiming(code, "accepted");
    expandedCodeId = null;
    code.reviewStatus = "accepted";
    code.acceptedAt = new Date().toISOString();
    code.reopenedForAmendment = false;
    code.editMode = "";
    code.splitMode = false;
    markSaved();
    toast(acceptedAmendment ? "Updated code accepted." : "Code accepted.");
    // Only accepting a concealed calibration code (whose excerpts come from
    // another transcript) opens the caution. Genuine AI codes stay silent.
    warnBeforeNextAiCode = Boolean(code["◇"]);
  } else if (action === "reject") {
    if (piReadOnlyMode && seniorCodeEditMode && !code.reopenedForAmendment) {
      return toast("Enter an amendment memo before rejecting this code.");
    }
    delete code.amendmentRollback;
    if (piReadOnlyMode && seniorCodeEditMode) appendTransformation(code, "rejected", "edit_myself");
    finalizeReviewTiming(code, "rejected");
    expandedCodeId = null;
    code.reviewStatus = "rejected";
    code.reopenedForAmendment = false;
    code.editMode = "";
    code.splitMode = false;
    code.selectedForMerge = false;
    if (reviewableCodes().filter((item) => item.selectedForMerge).length < 2) mergeCodeEditorOpen = false;
    markSaved();
    toast("Code rejected.");
  }
  if (["accept", "reject"].includes(action)) advanceCodeReviewStageIfComplete();
  codes = codes.map((item) => ({ ...item, selected: String(item.id) === String(codeId) }));
  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
  if (["revise", "split", "set-split-count"].includes(action)) {
    requestAnimationFrame(() => revealExpandedCodeCard(codeId, { focusEditor: action === "revise" }));
  }
  if (warnBeforeNextAiCode) requestAnimationFrame(openAiCodeCaution);
}

function mergeSelectedCodes({ titleOverride = "", suggestion = null, autoAccept = false } = {}) {
  const selectedCodes = reviewableCodes().filter((code) => code.selectedForMerge);
  if (selectedCodes.length < 2) return toast("Select at least two codes to merge.");
  const titleInput = document.getElementById("mergedCodeTitle");
  const title = String(titleOverride || "").trim() || titleInput?.value.trim() || titleInput?.dataset.suggestedTitle || "";
  if (!title) return toast("Merged code name is required.");
  const manuallyEditedAiProposal = Boolean(codeMergeDraft
    && title !== String(codeMergeDraft.title || "").trim());

  const selectedIds = new Set(selectedCodes.map((code) => String(code.id)));
  const sourceCodeIds = [...new Set(selectedCodes.flatMap((code) => [
    String(code.id || ""),
    ...(code.splitFromCodeId ? [String(code.splitFromCodeId)] : []),
    ...((code.sourceCodeIds || []).map(String)),
    ...((code.seniorSourceCodeIds || []).map(String)),
  ]).filter(Boolean))];
  const excerpts = dedupeExcerpts(selectedCodes.flatMap(codeExcerptList));
  const agents = [...new Set(selectedCodes.flatMap((code) => Array.isArray(code.agents) ? code.agents : []))];
  const markedIds = [...new Set(selectedCodes.flatMap((code) => Array.isArray(code["◇"])
    ? code["◇"]
    : (code["◇"] ? [code["◇"]] : [])))];
  const id = `merged-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const seniorAudit = piReadOnlyMode && seniorCodeEditMode ? {
    user_id: Number(currentUser?.id || 0),
    username: currentUser?.username || "Senior researcher",
    memo: seniorCodeMergeMemo,
    modified_at: new Date().toISOString(),
  } : null;
  if (seniorAudit && !seniorAudit.memo) return toast("A memo is required before merging codes.");
  const oldExcerptRows = identifiedExcerpts.filter((item) => selectedIds.has(String(item.codeId ?? item.id)));
  identifiedExcerpts = [
    ...identifiedExcerpts.filter((item) => !selectedIds.has(String(item.codeId ?? item.id))),
    ...excerpts.map((excerpt, index) => ({
      id: `${id}-excerpt-${index + 1}`,
      codeId: id,
      text: excerpt,
      line: oldExcerptRows.find((item) => cleanExcerptText(item.text) === excerpt)?.line || "",
      code: title,
      score: "",
      scoreLevel: "strong",
    })),
  ];
  codes = [
    ...codes.filter((code) => !selectedIds.has(String(code.id))).map((code) => ({ ...code, selected: false })),
    {
      id,
      title,
      icon: "◆",
      color: "#a855f7",
      source: "AI+Human",
      sourceClass: "ai",
      agents,
      quote: excerpts[0] ? `"${excerpts[0]}"` : "",
      quotes: excerpts,
      excerpts,
      selected: true,
      selectedForMerge: false,
      mergedFromCodes: true,
      sourceCodeIds,
      ...(seniorAudit ? {
        modifiedBySenior: seniorAudit,
        seniorSourceCodeIds: [...selectedIds],
        amendmentMemo: seniorAudit.memo,
      } : {}),
      ...(markedIds.length ? { "◇": markedIds } : {}),
      reviewStatus: autoAccept ? "accepted" : "",
      ...(autoAccept ? { acceptedAt: new Date().toISOString() } : {}),
      transformationHistory: suggestion ? [{
        operation: "merged",
        method: "ai_suggestion",
        instruction: "",
        suggested_name: title,
        similarity_min: Number(suggestion.similarity_min || 0),
        similarity_max: Number(suggestion.similarity_max || 0),
        suggestion_id: String(suggestion.id || ""),
        active_time_ms: Math.round(Math.min(Math.max(0, Date.now() - codeMergeStartedAt), REVIEW_IDLE_LIMIT_MS)),
      }] : draftTransformationEntries(
        "merged",
        codeMergeDraft,
        manuallyEditedAiProposal,
        Math.min(Math.max(0, Date.now() - codeMergeStartedAt), REVIEW_IDLE_LIMIT_MS),
      ),
      editMode: "",
    },
  ];
  if (seniorAudit) {
    codingRevision = Math.max(1, Number(codingRevision || 1)) + 1;
    seniorCodeReview = {
      ...(seniorCodeReview || {}),
      status: "pending_export",
      senior_user_id: seniorAudit.user_id,
      senior_username: seniorAudit.username,
      student_user_id: Number(piReadOnlyContext?.student?.id || 0),
      started_at: seniorCodeReview?.started_at || seniorAudit.modified_at,
      updated_at: seniorAudit.modified_at,
      modified_code_ids: [...new Set([...(seniorCodeReview?.modified_code_ids || []), id])],
    };
  }
  mergeCodeEditorOpen = false;
  codeMergeAssistMode = "";
  codeMergeDraft = null;
  codeMergeSuggestedName = "";
  seniorCodeMergeMemo = "";
  if (autoAccept) {
    expandedCodeId = null;
    if (suggestion?.id) dismissedCodeMergeSuggestionIds.add(String(suggestion.id));
    codeReviewStage = "merge-choice";
    markSaved();
    renderTranscript(document.getElementById("transcriptSearch").value);
    renderCodes();
    revealNextCodeMergeSuggestion();
    toast(`Suggested merge accepted as “${title}”.`);
  } else {
    codeReviewStage = "review";
    setExpandedCode(id, { scrollDetails: true });
    markSaved();
    toast("Codes merged. Review the result, then Accept when finished.");
  }
}

function createHumanCode({ title, excerpts, lineNumbers = [], createdFromSelection = false }) {
  const id = nextHumanCodeId();
  return {
    id,
    title,
    icon: "◆",
    color: "#2563eb",
    source: "Human",
    sourceClass: "human",
    context: createdFromSelection ? "Human selected excerpt" : "Human added",
    agentLabel: createdFromSelection ? "Human selected excerpt" : "Human added",
    score: "",
    scoreLevel: "",
    quote: `"${excerpts[0]}"`,
    quotes: excerpts,
    excerpts,
    transcriptLines: lineNumbers,
    createdFromSelection,
    // Manual-workspace codes are only incorporated later, when the user
    // explicitly selects them from inside the AI Coding workflow.
    includedAfterAiReview: false,
    confidence: "",
    selected: true,
    reviewStatus: "accepted",
  };
}

function addHumanCodeToState(code) {
  codes = [
    ...codes.map((item) => ({ ...item, selected: false })),
    code,
  ];
}

function saveNewCode() {
  const titleInput = document.querySelector('[data-new-code-field="title"]');
  const excerptInput = document.querySelector('[data-new-code-field="excerpt"]');
  const title = titleInput?.value.trim();
  const excerpts = splitExcerptInput(excerptInput?.value || "");
  if (!title) return toast("Code name cannot be empty.");
  if (excerpts.length === 0) return toast("Excerpt cannot be empty.");

  addHumanCodeToState(createHumanCode({ title, excerpts }));
  noteHumanCodeChangeForExport();
  newCodeEditorOpen = false;
  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
  markSaved();
  toast("New code added.");
}

function noteHumanCodeChangeForExport() {
  humanCodingFinished = false;
  humanCodingFinishedWhenOpened = false;
  if (codeReviewStage === "complete" && Number(lastFinishedCodingRevision || 0) >= Number(codingRevision || 1)) {
    codingRevision = Math.max(1, Number(codingRevision || 1)) + 1;
  }
  if (workflowTiming) workflowTiming.finished = false;
}

function saveManualSelectedCode() {
  const title = document.getElementById("manualCodeName")?.value.trim();
  const excerpt = selectedTranscriptExcerpt?.text || "";
  if (!transcript.length) return toast("Choose a project transcript before adding human codes.");
  if (!excerpt) return toast("Select transcript text first.");
  if (!title) return toast("Code name cannot be empty.");

  addHumanCodeToState(createHumanCode({
    title,
    excerpts: [excerpt],
    lineNumbers: selectedTranscriptExcerpt.lines || [],
    createdFromSelection: true,
  }));
  noteHumanCodeChangeForExport();
  clearManualTranscriptSelection();
  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
  markSaved();
  toast("Human code added from selected excerpt.");
}

function manualThemeFormReady() {
  const title = document.getElementById("manualThemeName")?.value.trim();
  const description = document.getElementById("manualThemeDescription")?.value.trim();
  return Boolean(latestCodebook) && codebookReviewFinished && !themeGenerationStarted && Boolean(title) && Boolean(description);
}

function updateManualThemeControls() {
  const disabled = !latestCodebook || !codebookReviewFinished || themeGenerationStarted;
  const titleInput = document.getElementById("manualThemeName");
  const descriptionInput = document.getElementById("manualThemeDescription");
  const supportInput = document.getElementById("manualThemeSupport");
  const saveButton = document.getElementById("saveManualThemeBtn");
  const clearButton = document.getElementById("clearManualThemeBtn");
  const finishButton = document.getElementById("finishHumanThemesBtn");
  const exportButton = document.getElementById("exportHumanThemesBtn");
  [titleInput, descriptionInput, supportInput, clearButton].forEach((item) => {
    if (item) item.disabled = disabled;
  });
  if (saveButton) saveButton.disabled = !manualThemeFormReady();
  if (finishButton) {
    const canFinishHumanThemes = Boolean(latestCodebook) && codebookReviewFinished && !humanThemesFinished && !themeGenerationStarted;
    finishButton.disabled = !canFinishHumanThemes;
    finishButton.textContent = humanThemesFinished ? "Finished" : "Finish";
    finishButton.classList.toggle("finish-attention", canFinishHumanThemes);
  }
  if (exportButton) exportButton.disabled = !humanThemesFinished;
}

function reopenHumanThemesForRevision() {
  if (!humanThemesFinished || themeGenerationStarted) return;
  humanThemesFinished = false;
  themeRevision = Math.max(1, Number(themeRevision || 1)) + 1;
  const intro = document.getElementById("manualThemeIntroStatus");
  if (intro) intro.textContent = "Select code names on the left, then name and describe your interpretation.";
  markSaved();
}

function manualThemeSelectedCodeNames() {
  return themeSupportItems(document.getElementById("manualThemeSupport")?.value || "");
}

function setManualThemeSelectedCodeNames(codeNames) {
  const supportInput = document.getElementById("manualThemeSupport");
  if (!supportInput) return;
  supportInput.value = themeSupportItems(codeNames.join("\n")).join("\n");
}

function renderManualThemeCodePicker() {
  const target = document.getElementById("manualThemeCodePicker");
  if (!target) return;
  target.innerHTML = "";
}

function toggleManualThemeCode(codeName) {
  const normalizedName = normalizedCodeKey(codeName);
  if (!normalizedName) return;
  reopenHumanThemesForRevision();
  const selected = manualThemeSelectedCodeNames();
  const alreadySelected = selected.some((item) => normalizedCodeKey(item) === normalizedName);
  const nextSelected = alreadySelected
    ? selected.filter((item) => normalizedCodeKey(item) !== normalizedName)
    : [...selected, codeName];
  setManualThemeSelectedCodeNames(nextSelected);
  updateManualThemeControls();
  renderCodebookPanel();
}

function clearManualThemeFields() {
  const titleInput = document.getElementById("manualThemeName");
  const descriptionInput = document.getElementById("manualThemeDescription");
  const supportInput = document.getElementById("manualThemeSupport");
  if (titleInput) titleInput.value = "";
  if (descriptionInput) descriptionInput.value = "";
  if (supportInput) supportInput.value = "";
  updateManualThemeControls();
  renderCodebookPanel();
}

function renderHumanManualThemeList() {
  const target = document.getElementById("humanManualThemeList");
  if (!target) return;
  if (!preGenerationHumanThemes.length) {
    target.innerHTML = humanThemesFinished || themeGenerationStarted
      ? `<article class="empty-state compact"><strong>No human themes added</strong></article>`
      : "";
    return;
  }
  target.innerHTML = `
    <div class="human-manual-list-header">
      <strong>Human themes added</strong>
      <span>${preGenerationHumanThemes.length} theme${preGenerationHumanThemes.length === 1 ? "" : "s"}</span>
    </div>
    <div class="human-manual-items">
      ${preGenerationHumanThemes.map((theme) => `
        <article class="human-manual-item">
          <strong>${escapeHTML(theme.title || "Untitled theme")}</strong>
          <p>${escapeHTML(theme.rationale || "No description provided.")}</p>
        </article>`).join("")}
    </div>`;
}

function renderManualThemePanel() {
  const panel = document.getElementById("manualThemePanel");
  if (!panel) return;
  const visible = themeWorkspaceMode === "human" && Boolean(latestCodebook) && codebookReviewFinished && !piReadOnlyMode;
  panel.classList.toggle("hidden", !visible);
  panel.classList.toggle("human-themes-reference", themeGenerationStarted);
  const panelTitle = document.getElementById("manualThemePanelTitle");
  if (panelTitle) panelTitle.textContent = themeGenerationStarted ? "Human themes" : "Create a human theme";
  const intro = document.getElementById("manualThemeIntroStatus");
  if (intro) intro.textContent = themeGenerationStarted
    ? "Saved human theme results"
    : humanThemesFinished
      ? "Human theme development is finished. Open AI Themes to generate and review AI candidates."
      : "Select code names on the left, then name and describe your interpretation.";
  renderHumanManualThemeList();
  renderManualThemeCodePicker();
  updateManualThemeControls();
}

function saveManualTheme() {
  if (!latestCodebook) return toast("Generate the codebook before adding human themes.");
  if (!codebookReviewFinished) return toast("Finish reviewing the codebook before adding human themes.");
  if (themeGenerationStarted) return toast("Human themes can only be added before generating AI themes.");
  reopenHumanThemesForRevision();
  const title = document.getElementById("manualThemeName")?.value.trim();
  const description = document.getElementById("manualThemeDescription")?.value.trim();
  const support = document.getElementById("manualThemeSupport")?.value || "";
  if (!title) return toast("Theme name cannot be empty.");
  if (!description) return toast("Theme description cannot be empty.");
  const supportItems = themeSupportItems(support);
  const humanTheme = {
    id: nextThemeId(),
    title,
    rationale: description,
    codes: supportItemsToThemeCodes(supportItems),
    source: "Human",
    sourceClass: "human",
    reviewStatus: "accepted",
    createdBeforeAiGeneration: true,
  };
  preGenerationHumanThemes = [...preGenerationHumanThemes, humanTheme];
  clearManualThemeFields();
  renderThemes();
  markSaved();
  toast("Human theme added.");
}

async function finishHumanThemes() {
  if (!latestCodebook) return toast("Generate the codebook before finishing Human Themes.");
  if (!codebookReviewFinished) return toast("Finish reviewing the codebook first.");
  if (humanThemesFinished) return;
  const draftTitle = document.getElementById("manualThemeName")?.value.trim() || "";
  const draftDescription = document.getElementById("manualThemeDescription")?.value.trim() || "";
  const draftSupport = document.getElementById("manualThemeSupport")?.value.trim() || "";
  if (draftTitle || draftDescription || draftSupport) {
    if (!draftTitle || !draftDescription) {
      return toast("Complete the current theme name and description, or clear the fields before finishing.");
    }
    saveManualTheme();
  }
  const wasFinished = humanThemesFinished;
  finishManualPhaseTiming();
  humanThemesFinished = true;
  clearManualThemeFields();
  markSaved();
  try {
    await flushPendingAutosave({ throwOnError: true });
    const humanThemeFile = themeFinishedResultFiles([], new Date().toISOString())
      .find((file) => file.filename === "ReflexCoTI_themes_Human_version.json");
    await archiveProjectFinishedResultFiles(
      "human_themes",
      Math.max(1, Number(themeRevision || 1)),
      [humanThemeFile],
    );
  } catch (error) {
    humanThemesFinished = wasFinished;
    markSaved();
    try {
      await flushPendingAutosave();
    } catch (_) {
      // The original error below remains the useful user-facing failure.
    }
    renderThemes();
    return toast(error.message || "Human Themes could not be finished because saving failed.");
  }
  setThemeWorkspaceMode("ai", { render: false });
  renderThemes();
  updateThemeWorkflowButtons();
  toast("Human Themes finished and saved. Export is optional.");
}

async function exportHumanThemes() {
  if (!humanThemesFinished) return toast("Finish Human Themes before exporting.");
  const button = document.getElementById("exportHumanThemesBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Exporting…";
  }
  const exportTimestamp = new Date().toISOString();
  const humanThemes = preGenerationHumanThemes.filter((theme) => isPreGenerationHumanTheme(theme));
  const file = jsonExportFile({
    project: { id: currentProject?.id || "", name: currentProject?.name || "" },
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    codebook_size: latestCodebook ? themeCodebookEntries().length : 0,
    theme_revision: Math.max(1, Number(themeRevision || 1)),
    exported_at: exportTimestamp,
    user_timing: exportedWorkflowTiming("human_manual_theme_development", "first_manual_theme_input_or_code_selection", "finish_human_themes_click"),
    themes: humanThemes.map(humanThemeRecord),
  }, "ReflexCoTI_themes_Human_version.json");
  downloadExportFile(file);
  toast("Human Themes export downloaded.");
  if (button) {
    button.disabled = false;
    button.textContent = "Export";
  }
}

function setCodingWorkspaceMode(mode) {
  codingWorkspaceMode = mode === "human" ? "human" : "ai";
  if (codingWorkspaceMode !== "human") {
    selectedTranscriptExcerpt = null;
    focusedHumanCodeId = null;
    setManualSelectionHighlight();
    window.getSelection()?.removeAllRanges();
  }
  const workspace = views.workspace;
  workspace?.classList.toggle("human-coding-mode", codingWorkspaceMode === "human");
  document.querySelectorAll('[data-workspace-nav="codes"]').forEach((button) => {
    button.classList.toggle("active", currentWorkspacePage === "codes" && button.dataset.codingWorkspaceMode === codingWorkspaceMode);
  });
  renderManualCodingPanel();
  updateFooterStats();
  if (currentWorkspacePage === "codes") requestAnimationFrame(restoreCodingPaneWidth);
}

function updateThemeWorkspaceNavigation() {
  const themesAvailable = ["themes", "both"].includes(workspaceNavAccessMode) && selectedThemeTranscriptIds.length >= 2;
  document.querySelectorAll('[data-workspace-nav="themes"]').forEach((button) => {
    const mode = button.dataset.themeWorkspaceMode;
    const modeUnavailable = piReadOnlyMode ? mode !== "ai" : mode !== "codebook" && (!latestCodebook || !codebookReviewFinished);
    button.disabled = !themesAvailable || modeUnavailable;
    button.classList.toggle("active", currentWorkspacePage === "themes" && button.dataset.themeWorkspaceMode === themeWorkspaceMode);
  });
}

function updateThemeWorkspaceModeUi() {
  const workspace = views.workspace;
  const aiThemeMode = themeWorkspaceMode === "ai";
  workspace?.classList.toggle("codebook-theme-mode", themeWorkspaceMode === "codebook");
  workspace?.classList.toggle("human-theme-mode", themeWorkspaceMode === "human");
  workspace?.classList.toggle("ai-theme-mode", aiThemeMode);
  const title = document.getElementById("themePageTitle");
  if (title) title.textContent = themeWorkspaceMode === "codebook" ? "Codebook" : (themeWorkspaceMode === "human" ? "Human Themes" : "Finished codebook");
  const themeCount = document.getElementById("themeCount");
  const pageHeading = document.querySelector("#themePanelTitle h2");
  const reviewHeading = document.getElementById("themeReviewColumnHeading");
  const reviewSummary = document.getElementById("themeReviewHeadingSummary");
  if (themeCount) {
    (aiThemeMode ? reviewHeading : pageHeading)?.append(themeCount);
    if (aiThemeMode && reviewSummary) reviewHeading?.append(reviewSummary);
  }
  document.getElementById("themeOptionalBadge")?.classList.toggle("hidden", themeWorkspaceMode !== "human");
  const columnTitle = document.getElementById("themeCodebookColumnTitle");
  const columnDescription = document.getElementById("themeCodebookColumnDescription");
  if (columnTitle) columnTitle.textContent = themeWorkspaceMode === "human" ? "Reviewed codebook" : (themeWorkspaceMode === "ai" ? "Finished codebook" : "Codebook");
  if (columnDescription) columnDescription.textContent = themeWorkspaceMode === "human"
    ? "Select codes for your human theme, or expand a code to review its detailed evidence."
    : (themeWorkspaceMode === "ai"
      ? ""
      : "Review shared codes across transcripts and generate the codebook before developing themes.");
  columnDescription?.classList.toggle("hidden", themeWorkspaceMode === "ai");
  const pathChoice = document.getElementById("themePathChoice");
  pathChoice?.classList.toggle("hidden", themeWorkspaceMode !== "codebook" || !latestCodebook || !codebookReviewFinished || piReadOnlyMode);
  const aiStartCard = document.getElementById("aiThemeStartCard");
  aiStartCard?.classList.toggle("hidden", themeWorkspaceMode !== "ai" || themeGenerationStarted || themeGenerationInProgress);
  updateThemeWorkspaceNavigation();
}

function setThemeWorkspaceMode(mode, { render = true } = {}) {
  const validMode = ["codebook", "human", "ai"].includes(mode) ? mode : "codebook";
  const requestedMode = piReadOnlyMode ? "ai" : validMode;
  if (requestedMode !== "codebook" && (!latestCodebook || !codebookReviewFinished)) {
    toast("Finish the codebook review before opening themes.");
    return false;
  }
  if (requestedMode !== themeWorkspaceMode && activeReviewTimer?.kind === "theme") flushActiveReviewTimer();
  if (requestedMode !== "ai") expandedThemeId = null;
  themeWorkspaceMode = requestedMode;
  updateThemeWorkspaceModeUi();
  if (render) renderThemes();
  return true;
}

function setWorkspacePage(page) {
  if (page === "themes" && selectedThemeTranscriptIds.length < 2) {
    toast("Add at least two project transcripts to open Themes.");
    return;
  }
  if (page === "codes" && !activeTranscriptFile) {
    toast("Select one transcript in the Transcript Section to open Codes.");
    return;
  }
  if (page !== currentWorkspacePage) {
    flushActiveReviewTimer();
    pauseWorkflowTiming();
  }
  currentWorkspacePage = page;
  views.workspace?.classList.toggle("coding-page-active", page === "codes");
  if (page === "codes") requestAnimationFrame(restoreCodingPaneWidth);
  document.querySelectorAll("[data-workspace-page]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.workspacePage !== page);
  });
  document.querySelectorAll("[data-workspace-nav]").forEach((button) => {
    const isThemeModeButton = button.dataset.workspaceNav === "themes" && button.dataset.themeWorkspaceMode;
    const isCodingModeButton = button.dataset.workspaceNav === "codes" && button.dataset.codingWorkspaceMode;
    button.classList.toggle("active", button.dataset.workspaceNav === page && (
      isThemeModeButton
        ? button.dataset.themeWorkspaceMode === themeWorkspaceMode
        : isCodingModeButton
          ? button.dataset.codingWorkspaceMode === codingWorkspaceMode
          : true
    ));
  });
  updateFooterStats();
  if (page === "codes" && codeReviewStage === "review") {
    const expandedCode = codes.find((code) => String(code.id) === String(expandedCodeId || ""));
    if (expandedCode && !codeReviewIsDecided(expandedCode)) syncActiveReviewTimer("code", expandedCode);
  } else if (page === "themes" && ["review", "merge-review"].includes(themeReviewStage)) {
    const expandedTheme = themes.find((theme) => String(theme.id) === String(expandedThemeId || ""));
    if (expandedTheme && !themeReviewIsDecided(expandedTheme)) syncActiveReviewTimer("theme", expandedTheme);
  }
  startWorkflowTimingSession();
  renderCodebookReturnBar();
}

function updateWorkspaceNavAccess(mode) {
  workspaceNavAccessMode = mode;
  document.querySelectorAll('[data-workspace-nav="codes"]').forEach((button) => {
    const humanUnavailable = piReadOnlyMode && button.dataset.codingWorkspaceMode === "human";
    button.disabled = !["codes", "both"].includes(mode) || humanUnavailable;
  });
  const themesEnabled = ["themes", "both"].includes(mode);
  document.querySelectorAll('[data-workspace-nav="themes"]').forEach((button) => {
    const themeMode = button.dataset.themeWorkspaceMode;
    const modeUnavailable = piReadOnlyMode ? themeMode !== "ai" : themeMode !== "codebook" && (!latestCodebook || !codebookReviewFinished);
    button.disabled = !themesEnabled || modeUnavailable;
  });
}

function extractThemeCodesFromExport(payload, fileName) {
  const transcriptName = payload?.transcript?.file_name || fileName;
  const transcriptId = String(payload?.transcript?.id || payload?.transcript?.transcript_id || transcriptName);
  const exportedCodes = Array.isArray(payload?.codes) ? payload.codes : [];
  return exportedCodes.flatMap((code) => {
    const codeName = codeNameFromExport(code);
    const source = normalizeThemeSource(code?.source || "");
    const quotes = quotesFromExport(code);
    if (quotes.length === 0) {
      return codeName ? [{
        codeName,
        codeId: String(code?.["code id"] || code?.code_id || ""),
        source,
        quote: "",
        transcript: transcriptName,
        transcriptId,
      }] : [];
    }
    return quotes.map((quote) => ({
      codeName,
      codeId: String(code?.["code id"] || code?.code_id || ""),
      source,
      quote,
      transcript: transcriptName,
      transcriptId,
    }));
  }).filter((code) => code.codeName || code.quote);
}

function reviewedCodeCountFromExport(payload) {
  const exportedCodes = Array.isArray(payload?.codes) ? payload.codes : [];
  return exportedCodes.filter((code) => (
    codeNameFromExport(code) || quotesFromExport(code).length > 0
  )).length;
}

async function loadThemeJsonFiles(files) {
  const parsed = [];
  let reviewedCodeCount = 0;
  for (const file of files) {
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      reviewedCodeCount += reviewedCodeCountFromExport(payload);
      parsed.push(...extractThemeCodesFromExport(payload, file.name));
    } catch {
      throw new Error(`${file.name} is not a valid ReflexCoTI JSON file.`);
    }
  }
  themeJsonFiles = files;
  themeCodeInputs = parsed;
  themeTranscriptDocuments = [];
  latestCodebook = null;
  latestCodebookId = null;
  themes = [];
  originalAiThemes = [];
  preGenerationHumanThemes = [];
  humanThemesFinished = false;
  manualThemeReuseFinished = false;
  themeGenerationStarted = false;
  themeReviewStage = "idle";
  mergeThemeEditorOpen = false;
  newThemeEditorOpen = false;
  codebookExpanded = false;
  selectedCodebookEntryIndex = null;
  themeCodebookFilter = "keep-all";
  resetCodebookReviewState();
  clearManualThemeFields();
  document.getElementById("themeUploadStatus").textContent =
    `${files.length} JSON file${files.length === 1 ? "" : "s"} uploaded, ` +
    `${reviewedCodeCount} reviewed code${reviewedCodeCount === 1 ? "" : "s"} ` +
    `and ${parsed.length} excerpt${parsed.length === 1 ? "" : "s"} available.`;
  updateThemeWorkflowButtons();
  renderThemes();
}

function updateThemeWorkflowButtons(isCreatingCodebook = false, isGeneratingThemes = false) {
  const codebookButton = document.getElementById("generateCodebookBtn");
  const finishCodebookButton = document.getElementById("finishCodebookReviewBtn");
  const themesButton = document.getElementById("generateThemesBtn");
  const codebookHint = document.getElementById("codebookUploadHint");
  const deletionChoiceMade = ["yes", "no"].includes(codebookDeletionSuggestionChoice);
  if (codebookButton) {
    codebookButton.disabled = isCreatingCodebook || isGeneratingThemes || themeJsonFiles.length === 0 || themeCodeInputs.length === 0 || !deletionChoiceMade;
    codebookButton.textContent = isCreatingCodebook ? "Generating codebook..." : "Generate codebook";
  }
  if (codebookHint) {
    codebookHint.classList.toggle("hidden", Boolean(latestCodebook) || isCreatingCodebook);
  }
  if (finishCodebookButton) {
    finishCodebookButton.classList.toggle("hidden", !latestCodebook || codebookReviewFinished || themeGenerationStarted);
    finishCodebookButton.disabled = isCreatingCodebook || isGeneratingThemes;
  }
  if (themesButton) {
    themesButton.disabled = !latestCodebook || !codebookReviewFinished || themeGenerationStarted || isCreatingCodebook || isGeneratingThemes;
    themesButton.textContent = isGeneratingThemes ? "Generating AI themes..." : "Generate AI themes";
  }
}

async function generateCodebookFromUploadedFiles() {
  if (themeJsonFiles.length === 0) {
    toast("Upload ReflexCoTI JSON files first.");
    return;
  }
  if (!["yes", "no"].includes(codebookDeletionSuggestionChoice)) {
    toast("Complete the research-question prompt before generating the codebook.");
    return;
  }
  const formData = new FormData();
  themeJsonFiles.forEach((file) => formData.append("coding_jsons", file, file.name));
  formData.append("azure_endpoint", document.getElementById("azureEndpoint").value);
  formData.append("api_key", document.getElementById("apiKey").value);
  formData.append("api_version", document.getElementById("apiVersion").value);
  formData.append("model", document.getElementById("model").value);
  formData.append(
    "research_question",
    codebookResearchQuestion || currentProject?.research_question || document.getElementById("researchQuestion").value,
  );
  formData.append("include_ai_deletion_suggestions", String(codebookDeletionSuggestionsEnabled()));

  try {
    updateThemeWorkflowButtons(true);
    document.getElementById("themeUploadStatus").textContent = "Generating codebook from uploaded ReflexCoTI JSON files...";
    const response = await fetch("/api/create-codebook", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not generate codebook.");
    latestCodebook = payload.codebook || null;
    latestCodebookId = payload.codebook_id || null;
    themes = [];
    originalAiThemes = [];
    preGenerationHumanThemes = [];
    humanThemesFinished = false;
    manualThemeReuseFinished = false;
    themeGenerationStarted = false;
    themeReviewStage = "idle";
    codebookExpanded = false;
    codebookAiSuggestionsOpen = false;
    selectedCodebookEntryIndex = null;
    themeCodebookFilter = "keep-all";
    resetCodebookReviewState();
    mergeThemeEditorOpen = false;
    newThemeEditorOpen = false;
    clearManualThemeFields();
    document.getElementById("themeUploadStatus").textContent = `Codebook generated: ${payload.entry_count || 0} unique code${payload.entry_count === 1 ? "" : "s"}.`;
    renderThemes();
    markSaved();
    toast("Codebook generated.");
    return true;
  } catch (error) {
    latestCodebook = null;
    latestCodebookId = null;
    preGenerationHumanThemes = [];
    humanThemesFinished = false;
    manualThemeReuseFinished = false;
    themeGenerationStarted = false;
    themeReviewStage = "idle";
    originalAiThemes = [];
    selectedCodebookEntryIndex = null;
    themeCodebookFilter = "keep-all";
    resetCodebookReviewState();
    mergeThemeEditorOpen = false;
    newThemeEditorOpen = false;
    clearManualThemeFields();
    document.getElementById("themeUploadStatus").textContent = error.message || "Could not generate codebook.";
    renderThemes();
    toast(error.message || "Could not generate codebook.");
    return false;
  } finally {
    updateThemeWorkflowButtons(false);
  }
}

async function generateThemesFromUploadedCodes() {
  if (!latestCodebook || !latestCodebookId) {
    toast("Generate the codebook first.");
    return;
  }
  if (!codebookReviewFinished) {
    toast("Finish reviewing the codebook before generating themes.");
    return;
  }
  const themeEntries = themeCodebookEntries();
  if (themeEntries.length === 0) {
    toast("No unique codes remain after this filter.");
    return;
  }
  const payload = {
    codebook_id: latestCodebookId,
    filter_mode: themeCodebookFilter,
    edited_codebook: latestCodebook,
    codebook_change_history: codebookChangeHistory,
    azure_endpoint: document.getElementById("azureEndpoint").value,
    api_key: document.getElementById("apiKey").value,
    api_version: document.getElementById("apiVersion").value,
    model: document.getElementById("model").value,
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    human_themes: preGenerationHumanThemes.map((theme) => ({
      id: theme.id,
      title: theme.title,
      rationale: theme.rationale,
      codes: theme.codes,
    })),
  };
  try {
    themeGenerationInProgress = true;
    setThemeWorkspaceMode("ai", { render: false });
    themeGenerationStarted = true;
    manualThemeReuseFinished = false;
    themeReviewStage = "review";
    expandedThemeId = null;
    newThemeEditorOpen = false;
    renderThemes();
    updateThemeWorkflowButtons(false, true);
    document.getElementById("themeUploadStatus").textContent = `Generating themes from ${themeEntries.length} unique code${themeEntries.length === 1 ? "" : "s"}...`;
    const response = await fetch("/api/generate-themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not generate themes.");
    themeGenerationInProgress = false;
    themes = (result.themes || []).map((theme) => ({
      ...theme,
      id: theme.id || nextThemeId(),
      source: theme.source || "AI",
      reviewStatus: theme.reviewStatus || "",
      version: Math.max(1, Number(theme.version || 1)),
      versionHistory: [],
      reopenedForAmendment: false,
      amendmentMemo: "",
      selectedForMerge: false,
      splitMode: false,
      editMode: false,
    }));
    const humanAiThemeMatchCount = initializeHumanAiThemeMatches(result.theme_matches || []);
    originalAiThemes = JSON.parse(JSON.stringify(themes));
    themeReviewStage = themes.length
      ? (humanAiThemeMatchCount > 0 ? "match-review" : "review")
      : (piReadOnlyMode ? "complete" : "additional-choice");
    mergeThemeEditorOpen = false;
    newThemeEditorOpen = false;
    const generationMethod = result.mode === "multi-agent-consensus"
      ? "multi-agent consensus"
      : (result.mode === "clusters" ? "clustered" : "no-cluster");
    document.getElementById("themeUploadStatus").textContent = `Themes generated from ${result.code_count || themeEntries.length} unique code${(result.code_count || themeEntries.length) === 1 ? "" : "s"} using ${generationMethod} theme generation.`;
    renderThemes();
    markSaved();
    toast("Candidate themes generated.");
  } catch (error) {
    themeGenerationInProgress = false;
    themeGenerationStarted = false;
    themeReviewStage = "idle";
    document.getElementById("themeUploadStatus").textContent = error.message || "Could not generate themes.";
    renderThemes();
    toast(error.message || "Could not generate themes.");
  } finally {
    themeGenerationInProgress = false;
    updateThemeWorkflowButtons(false, false);
  }
}

function collectThemeSplitParts(themeId) {
  const card = document.querySelector(`[data-theme-id="${CSS.escape(String(themeId))}"]`);
  return [...(card?.querySelectorAll("[data-theme-split-part]") || [])].map((part) => ({
    title: part.querySelector('[data-theme-split-field="title"]')?.value.trim() || "",
    rationale: part.querySelector('[data-theme-split-field="rationale"]')?.value.trim() || "",
  }));
}

function updateThemeReview(themeId, action, control = null) {
  const theme = themes.find((item) => String(item.id) === String(themeId));
  if (!theme) return;
  if (action === "amend") {
    theme.amendMode = true;
    renderThemes();
    document.querySelector(`[data-theme-id="${CSS.escape(String(themeId))}"] [data-theme-amendment-memo]`)?.focus();
    return;
  } else if (action === "cancel-amend") {
    theme.amendMode = false;
    renderThemes();
    return;
  } else if (action === "confirm-amend") {
    const memo = document.querySelector(`[data-theme-id="${CSS.escape(String(themeId))}"] [data-theme-amendment-memo]`)?.value;
    return reopenAcceptedTheme(theme, memo);
  }
  syncActiveReviewTimer("theme", theme);
  if (action === "accept") {
    const acceptedAmendment = Boolean(theme.reopenedForAmendment);
    finalizeReviewTiming(theme, "accepted");
    theme.reviewStatus = "accepted";
    theme.acceptedAt = new Date().toISOString();
    theme.reopenedForAmendment = false;
    theme.amendMode = false;
    theme.splitMode = false;
    theme.editMode = false;
    theme.splitParts = undefined;
    toast(acceptedAmendment ? "Updated theme accepted." : "Theme accepted.");
  } else if (action === "reject") {
    if (piReadOnlyMode && seniorThemeEditMode && !theme.reopenedForAmendment) {
      toast("Use Modify theme and add the required memo before rejecting it.");
      return;
    }
    finalizeReviewTiming(theme, "rejected");
    if (piReadOnlyMode && seniorThemeEditMode) appendTransformation(theme, "rejected", "edit_myself");
    theme.reviewStatus = "rejected";
    theme.reopenedForAmendment = false;
    theme.amendMode = false;
    theme.splitMode = false;
    theme.editMode = false;
    theme.splitParts = undefined;
    theme.selectedForMerge = false;
  } else if (action === "merge") {
    theme.selectedForMerge = !theme.selectedForMerge;
    theme.splitMode = false;
    theme.editMode = false;
    theme.splitParts = undefined;
    mergeThemeEditorOpen = themes.filter((item) => item.selectedForMerge).length >= 2;
  } else if (action === "revise") {
    theme.editMode = true;
    theme.assistMode = piReadOnlyMode && seniorThemeEditMode ? "manual" : "";
    theme.aiDraft = null;
    theme.splitMode = false;
    theme.splitParts = undefined;
    theme.selectedForMerge = false;
    mergeThemeEditorOpen = false;
  } else if (action === "cancel-revise") {
    theme.editMode = false;
    theme.assistMode = "";
    theme.aiDraft = null;
  } else if (action === "save-revisions") {
    const card = document.querySelector(`[data-theme-id="${CSS.escape(String(themeId))}"]`);
    const title = card?.querySelector('[data-theme-revise-field="title"]')?.value.trim();
    const rationale = card?.querySelector('[data-theme-revise-field="rationale"]')?.value.trim();
    if (!title) {
      toast("Theme name cannot be empty.");
      return;
    }
    if (!rationale) {
      toast("Theme description cannot be empty.");
      return;
    }
    const manuallyEditedAiProposal = Boolean(theme.aiDraft && (
      title !== String(theme.aiDraft.title || "").trim()
      || rationale !== String(theme.aiDraft.rationale || "").trim()
    ));
    theme.title = title;
    theme.rationale = rationale;
    if (manuallyEditedAiProposal) {
      appendAiThenManualTransformation(theme, "revised");
    } else {
      appendTransformation(theme, "revised", editMethod(theme));
    }
    if (isHumanTheme(theme)) {
      theme.source = "Human";
      theme.sourceClass = "human";
      theme.reviewStatus = "accepted";
    } else {
      theme.source = "AI+Human";
      theme.reviewStatus = "";
    }
    theme.editMode = false;
    theme.assistMode = "";
    theme.aiDraft = null;
    theme.splitMode = false;
    theme.selectedForMerge = false;
    toast("Theme revised. You can revise or split it again, then Accept when finished.");
  } else if (action === "split") {
    if (theme.codes.length < 2) {
      toast("This theme needs at least two codes before it can be split.");
      return;
    }
    theme.splitMode = true;
    theme.assistMode = piReadOnlyMode && seniorThemeEditMode ? "manual" : "";
    theme.aiDraft = null;
    theme.splitParts = [];
    theme.editMode = false;
    theme.selectedForMerge = false;
    mergeThemeEditorOpen = false;
  } else if (action === "set-split-count") {
    const currentParts = collectThemeSplitParts(themeId);
    const maxParts = Math.max(2, theme.codes.length);
    const requestedCount = Math.max(2, Math.min(Number(control?.value) || 2, maxParts));
    theme.splitParts = Array.from({ length: requestedCount }, (_, index) => currentParts[index] || {
      title: "",
      rationale: "",
    });
    theme.splitAssignments = theme.codes.map(() => -1);
    theme.splitMode = true;
  } else if (action === "cancel-split") {
    theme.splitMode = false;
    theme.assistMode = "";
    theme.aiDraft = null;
    theme.splitParts = undefined;
    theme.splitAssignments = undefined;
  } else if (action === "save-split") {
    const splitParts = collectThemeSplitParts(themeId);
    if (splitParts.length < 2) {
      toast("A split needs at least two new themes.");
      return;
    }
    if (splitParts.some((part) => !part.title)) {
      toast("Every split theme needs a name.");
      return;
    }
    if (splitParts.some((part) => !part.rationale)) {
      toast("Every split theme needs a description.");
      return;
    }
    const codeGroups = themeSplitCodeGroups(theme, splitParts.length);
    if (codeGroups.reduce((total, group) => total + group.length, 0) !== theme.codes.length) {
      toast("Choose a new theme for every code.");
      return;
    }
    if (codeGroups.some((group) => group.length === 0)) {
      toast("Choose at least one code for every new theme.");
      return;
    }
    const proposedParts = Array.isArray(theme.aiDraft?.splitParts) ? theme.aiDraft.splitParts : [];
    const manuallyEditedAiProposal = Boolean(theme.aiDraft && (
      splitParts.length !== proposedParts.length
      || splitParts.some((part, index) => (
        String(part.title || "").trim() !== String(proposedParts[index]?.title || "").trim()
        || String(part.rationale || "").trim() !== String(proposedParts[index]?.rationale || "").trim()
      ))
      || !sameNumberList(theme.splitAssignments, theme.aiDraft.splitAssignments)
    ));
    if (manuallyEditedAiProposal) {
      appendAiThenManualTransformation(theme, "split");
    } else {
      appendTransformation(theme, "split", editMethod(theme));
    }
    const history = transformationHistory(theme);
    const inheritedTiming = { ...ensureReviewTiming(theme), finalDecision: "" };
    const replacement = splitParts.map((part, index) => ({
      id: nextThemeId(),
      title: part.title,
      rationale: part.rationale,
      codes: codeGroups[index] || [],
      source: "AI+Human",
      reviewStatus: "",
      version: Math.max(1, Number(theme.version || 1)),
      versionHistory: Array.isArray(theme.versionHistory) ? codebookClone(theme.versionHistory) : [],
      reopenedForAmendment: Boolean(theme.reopenedForAmendment),
      amendmentMemo: theme.amendmentMemo || "",
      transformationHistory: [...history],
      reviewTiming: { ...inheritedTiming },
      selectedForMerge: false,
      splitMode: false,
      editMode: false,
      ...(piReadOnlyMode && seniorThemeEditMode ? {
        modifiedBySenior: { ...theme.modifiedBySenior },
        seniorSourceThemeIds: [String(theme.id)],
      } : {}),
    }));
    if (piReadOnlyMode && seniorThemeEditMode) {
      seniorThemeReview.modified_theme_ids = [...new Set([
        ...(seniorThemeReview.modified_theme_ids || []),
        ...replacement.map((item) => String(item.id)),
      ])];
    }
    themes = themes.flatMap((item) => String(item.id) === String(themeId) ? replacement : [item]);
    toast(`Theme split into ${replacement.length} themes. Review each result, then Accept when finished.`);
  }
  if (!themes.filter((item) => item.selectedForMerge).length) mergeThemeEditorOpen = false;
  if (["accept", "reject"].includes(action)) {
    expandedThemeId = null;
    advanceThemeReviewStageIfComplete();
  }
  renderThemes();
  markSaved();
}

function mergeSelectedThemes() {
  const selectedThemes = themes.filter((theme) => theme.selectedForMerge);
  if (selectedThemes.length < 2) {
    toast("Select at least two themes to merge.");
    return;
  }
  const titleInput = document.getElementById("mergedThemeTitle");
  const title = titleInput?.value.trim() || titleInput?.dataset.suggestedTitle || "";
  const rationale = document.getElementById("mergedThemeRationale")?.value.trim();
  if (!title) {
    toast("Merged theme name is required.");
    return;
  }
  const mergedCodes = selectedThemes.flatMap((theme) => theme.codes);
  const manuallyEditedAiProposal = Boolean(themeMergeDraft && (
    title !== String(themeMergeDraft.title || "").trim()
    || (rationale || themeSummaryForCodes(mergedCodes)) !== String(themeMergeDraft.rationale || "").trim()
  ));
  const selectedIds = new Set(selectedThemes.map((theme) => String(theme.id)));
  const seniorAudit = piReadOnlyMode && seniorThemeEditMode ? {
    user_id: Number(currentUser?.id || 0),
    username: currentUser?.username || "Senior researcher",
    memo: seniorThemeMergeMemo,
    modified_at: new Date().toISOString(),
  } : null;
  if (piReadOnlyMode && seniorThemeEditMode && !seniorAudit.memo) {
    toast("A memo is required before merging themes.");
    return;
  }
  const mergedThemeId = nextThemeId();
  themes = [
    ...themes.filter((theme) => !selectedIds.has(String(theme.id))),
    {
      id: mergedThemeId,
      title,
      rationale: rationale || themeSummaryForCodes(mergedCodes),
      codes: mergedCodes,
      source: "AI+Human",
      reviewStatus: "",
      transformationHistory: draftTransformationEntries(
        "merged",
        themeMergeDraft,
        manuallyEditedAiProposal,
        Math.min(Math.max(0, Date.now() - themeMergeStartedAt), REVIEW_IDLE_LIMIT_MS),
      ),
      selectedForMerge: false,
      splitMode: false,
      editMode: false,
      ...(seniorAudit ? {
        modifiedBySenior: seniorAudit,
        seniorSourceThemeIds: [...selectedIds],
        amendmentMemo: seniorAudit.memo,
      } : {}),
    },
  ];
  if (seniorAudit) {
    themeRevision = Math.max(1, Number(themeRevision || 1)) + 1;
    seniorThemeReview = {
      ...(seniorThemeReview || {}), status: "pending_export",
      senior_user_id: seniorAudit.user_id, senior_username: seniorAudit.username,
      student_user_id: Number(piReadOnlyContext?.student?.id || 0),
      started_at: seniorThemeReview?.started_at || seniorAudit.modified_at,
      updated_at: seniorAudit.modified_at,
      modified_theme_ids: [...new Set([...(seniorThemeReview?.modified_theme_ids || []), mergedThemeId])],
    };
  }
  mergeThemeEditorOpen = false;
  themeMergeAssistMode = "";
  themeMergeDraft = null;
  seniorThemeMergeMemo = "";
  themeReviewStage = "merge-review";
  renderThemes();
  markSaved();
  toast("Themes merged. Review the result, then Accept when finished.");
}

async function pollAnalysisJob(jobId) {
  while (true) {
    const response = await fetch(`/api/jobs/${jobId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not check workflow status.");
    if (payload.status === "completed") return payload.result || { codes: [], excerpts: [], themes: [] };
    if (payload.status === "failed") throw new Error(payload.message || "The ReflexCoTI workflow failed.");
    setIdentifyRunning(true, payload.message || "Running ReflexCoTI workflow...");
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
  }
}

async function checkServerHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function extractDocxText(file) {
  const serverReady = await checkServerHealth();
  if (!serverReady) {
    throw new Error("The local ReflexCoTI server is not responding. Please reload the page after the server starts.");
  }
  const formData = new FormData();
  formData.append("transcript", file);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 600000);
  try {
    const response = await fetch("/api/read-docx", {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not read this .docx transcript.");
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Preparing this .docx took more than 10 minutes. Please try a smaller transcript file.");
    if (error instanceof TypeError && /fetch/i.test(error.message || "")) {
      const serverStillReady = await checkServerHealth();
      throw new Error(serverStillReady
        ? "The transcript upload was interrupted before it reached ReflexCoTI. Please choose the .docx again."
        : "The local ReflexCoTI server stopped responding during upload. Please refresh the page and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function transcriptRowsFromText(text) {
  return text.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line }));
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !url.startsWith("/api/auth/")) {
    currentUser = null;
    showView("login");
  }
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function humanFileSize(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "Size unavailable";
  if (Number(bytes) < 1024 * 1024) return `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizedTranscriptName(name) {
  return String(name || "").replace(/[^A-Za-z0-9_.-]+/g, "_").toLowerCase();
}

function setProjectContext(project) {
  currentProject = project;
  document.getElementById("projectName").value = project?.name || "";
  document.getElementById("researchQuestion").value = project?.research_question || "";
  document.getElementById("interviewee").value = project?.interviewee || "";
  document.getElementById("workspaceProjectName").textContent = project?.name || "Untitled project";
  document.getElementById("documentProjectName").textContent = project?.name || "Project transcripts";
  document.getElementById("documentProjectQuestion").textContent = project?.research_question || "";
}

function renderProjects(filter = "") {
  const grid = document.getElementById("projectCardGrid");
  if (!grid) return;
  const query = filter.trim().toLowerCase();
  const visible = projects.filter((project) =>
    [project.name, project.research_question, project.interviewee].some((value) => String(value || "").toLowerCase().includes(query))
  );
  grid.innerHTML = visible.length ? visible.map((project) => `
    <article class="project-card" tabindex="0" data-open-project="${escapeHTML(project.id)}">
      <button class="project-card-delete" type="button" data-delete-project="${escapeHTML(project.id)}" aria-label="Delete ${escapeHTML(project.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
      </button>
      <h2>${escapeHTML(project.name)}</h2>
      <p class="project-card-question">${escapeHTML(project.research_question)}</p>
      <div class="project-card-meta"><span>${project.transcript_count} transcript${project.transcript_count === 1 ? "" : "s"}</span><span title="Current codebook">${Number(project.codebook_codes_count || 0).toLocaleString()} codes</span><span title="Current codebook">${Number(project.codebook_excerpts_count || 0).toLocaleString()} excerpts</span></div>
      <span class="project-card-owner">${escapeHTML(initials(currentUser?.username || "U"))}</span>
    </article>`).join("") : '<article class="library-empty"><strong>No projects found</strong><p>Create a project or change the search.</p></article>';
}

async function loadProjects() {
  const payload = await apiFetch("/api/projects");
  projects = payload.projects || [];
  renderProjects(document.getElementById("projectSearch")?.value || "");
}

function peerItemId(item, index) {
  return String(item?.id ?? index);
}

async function loadPeerSuggestionCount() {
  if (currentUser?.role !== "student") return;
  const payload = await apiFetch("/api/peer-suggestions");
  peerSuggestionInbox = payload.suggestions || [];
  const count = Number(payload.pending_received || 0);
  const badge = document.getElementById("peerSuggestionCount");
  if (badge) {
    badge.textContent = String(count);
    badge.dataset.count = String(count);
  }
  const notice = document.getElementById("peerSuggestionNotice");
  if (notice) {
    notice.classList.toggle("hidden", count === 0);
    notice.innerHTML = count
      ? "<strong>Someone gave you suggestions.</strong> Open Suggestions to review whether you agree before finishing a new revision."
      : "";
  }
  if (count) {
    document.getElementById("openPeerInbox")?.setAttribute(
      "aria-label", `${count} pending peer suggestion${count === 1 ? "" : "s"}`
    );
  }
}

function renderPeerProjects() {
  const target = document.getElementById("peerReviewContent");
  document.getElementById("peerReviewRequestForm")?.classList.add("hidden");
  document.getElementById("backToPeerAccess")?.classList.remove("hidden");
  document.getElementById("peerReviewToolbar")?.classList.add("hidden");
  document.getElementById("peerReviewEyebrow").textContent = "Junior researcher peer review";
  document.getElementById("peerReviewTitle").textContent = "Review shared results";
  document.getElementById("peerReviewSubtitle").textContent = peerReviewOwnerUsername
    ? `Showing completed, exported results for ${peerReviewOwnerUsername}. Your proposals remain suggestions until they agree.`
    : "Choose a researcher whose peer-review access is approved.";
  target.innerHTML = peerReviewProjects.length ? `<div class="peer-project-grid">${peerReviewProjects.map((project) => `
    <article class="peer-project-card">
      <span class="peer-project-owner">Owned by ${escapeHTML(project.owner_username)}</span>
      <h2>${escapeHTML(project.name)}</h2>
      <p>${escapeHTML(project.research_question)}</p>
      <div class="peer-transcript-list">
        ${(project.transcripts || []).map((transcript) => `<button class="secondary-btn" type="button" data-peer-coding-project="${escapeHTML(project.id)}" data-peer-transcript="${escapeHTML(transcript.id)}">Codes · ${escapeHTML(transcript.name)}</button>`).join("")}
      </div>
      <div class="peer-project-actions">${project.has_theme_export ? `<button class="secondary-btn" type="button" data-peer-themes-project="${escapeHTML(project.id)}">Review project themes</button>` : ""}</div>
    </article>`).join("")}</div>` : `<article class="library-empty"><strong>No shared results found</strong><p>Check the exact username, or ask this junior researcher to finish results before peer review.</p></article>`;
}

function renderPeerAccessDashboard() {
  const approved = peerReviewConnections.approved || [];
  const pending = peerReviewConnections.pending_sent || [];
  document.getElementById("peerReviewToolbar")?.classList.add("hidden");
  document.getElementById("peerReviewRequestForm")?.classList.remove("hidden");
  document.getElementById("backToPeerAccess")?.classList.add("hidden");
  document.getElementById("peerReviewEyebrow").textContent = "Junior researcher peer review";
  document.getElementById("peerReviewTitle").textContent = "Peer review";
  document.getElementById("peerReviewSubtitle").textContent = "Request access or open exported results that another junior researcher has approved for you to review.";
  const target = document.getElementById("peerReviewContent");
  target.innerHTML = `${approved.length ? `<section class="peer-access-section">
    <div class="connection-section-heading"><h2>Ready to review</h2><span class="connection-count">${approved.length}</span></div>
    <div class="connection-list">${approved.map((item) => `<article class="connection-card peer-access-card">
      <span class="connection-avatar" aria-hidden="true">${escapeHTML(initials(item.username))}</span>
      <span class="connection-copy"><strong>${escapeHTML(item.username)}</strong><span>${item.exported_project_count || 0} exported project${Number(item.exported_project_count || 0) === 1 ? "" : "s"} · Review codes and themes</span></span>
      <span class="connection-status active">Approved</span><button class="secondary-btn" type="button" data-review-peer="${escapeHTML(item.username)}">Review results</button>
    </article>`).join("")}</div>
  </section>` : ""}
  ${pending.length ? `<section class="peer-access-section">
    <div class="connection-section-heading"><h2>Awaiting acceptance</h2><span class="connection-count">${pending.length}</span></div>
    <div class="connection-list">${pending.map((item) => `<article class="connection-card">
      <span class="connection-avatar" aria-hidden="true">${escapeHTML(initials(item.username))}</span>
      <span class="connection-copy"><strong>${escapeHTML(item.username)}</strong><span>Your peer-review request is waiting for their response.</span></span>
      <span class="connection-status">Pending</span>
    </article>`).join("")}</div>
  </section>` : ""}
  ${!approved.length && !pending.length ? `<article class="library-empty peer-review-prompt"><strong>No peer-review access yet</strong><p>Send a request above. Once accepted, the researcher will appear here with a Review results action.</p></article>` : ""}`;
}

async function openPeerReview() {
  peerReviewProjects = [];
  peerReviewAnalysis = null;
  peerReviewOwnerUsername = "";
  peerSelectedIds = new Set();
  document.getElementById("peerReviewRequestForm")?.reset();
  document.getElementById("peerReviewContent").innerHTML = `<article class="library-empty peer-review-prompt"><strong>Loading peer-review access…</strong></article>`;
  showView("peerReview");
  peerReviewConnections = await apiFetch("/api/student/peer-review-connections");
  renderPeerAccessDashboard();
}

async function findPeerResults(username) {
  const requestedUsername = String(username || "").trim();
  if (!requestedUsername) return;
  const payload = await apiFetch(`/api/peer-review/projects?username=${encodeURIComponent(requestedUsername)}`);
  peerReviewProjects = payload.projects || [];
  peerReviewAnalysis = null;
  peerReviewOwnerUsername = payload.owner_username || requestedUsername;
  peerSelectedIds = new Set();
  renderPeerProjects();
}

function peerEvidence(item, scope) {
  if (scope === "coding") return codeExcerptList(item);
  return (item.codes || []).map((code) => typeof code === "string" ? code : (code.codeName || code.title || "Code"));
}

function renderPeerAnalysis() {
  const analysis = peerReviewAnalysis;
  if (!analysis) return renderPeerProjects();
  const scope = analysis.scope;
  const items = (analysis.items || []).filter((item) => item.reviewStatus !== "rejected");
  document.getElementById("peerReviewRequestForm")?.classList.add("hidden");
  document.getElementById("backToPeerAccess")?.classList.remove("hidden");
  document.getElementById("peerReviewEyebrow").textContent = `${scope === "coding" ? "Code" : "Theme"} suggestions · ${analysis.project.owner_username}`;
  document.getElementById("peerReviewTitle").textContent = scope === "coding" ? analysis.transcript_name : `${analysis.project.name} themes`;
  document.getElementById("peerReviewSubtitle").textContent = "Select one action and provide a required memo. Select two or more results to suggest a merge.";
  const toolbar = document.getElementById("peerReviewToolbar");
  toolbar.classList.remove("hidden");
  document.getElementById("peerSelectionStatus").textContent = `${peerSelectedIds.size} selected for a possible merge`;
  document.getElementById("suggestPeerMerge").disabled = peerSelectedIds.size < 2;
  document.getElementById("peerReviewContent").innerHTML = items.length ? `<div class="peer-result-list">${items.map((item, index) => {
    const id = peerItemId(item, index);
    const evidence = peerEvidence(item, scope);
    return `<article class="peer-result-card ${peerSelectedIds.has(id) ? "selected" : ""}" data-peer-item="${escapeHTML(id)}">
      <label class="peer-result-select"><input type="checkbox" data-peer-merge-select="${escapeHTML(id)}" ${peerSelectedIds.has(id) ? "checked" : ""} /><span class="sr-only">Select ${escapeHTML(item.title || "result")} for merge</span></label>
      <div class="peer-result-copy"><h3>${escapeHTML(item.title || "Untitled")}</h3>${scope === "themes" ? `<p>${escapeHTML(item.rationale || "No description")}</p>` : ""}
        ${evidence.length ? `<ul class="peer-evidence-list">${evidence.slice(0, 10).map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul>` : ""}
        <div class="peer-result-actions"><button class="action-btn revise" type="button" data-peer-action="revise">Revise</button><button class="action-btn reject" type="button" data-peer-action="reject">Reject</button>${scope === "themes" ? "<button class=\"action-btn revise\" type=\"button\" data-peer-action=\"split\">Split</button>" : ""}</div>
      </div>
    </article>`;
  }).join("")}</div>` : '<article class="library-empty"><strong>No active results</strong><p>The exported analysis has no active items to suggest changes to.</p></article>';
}

async function openPeerAnalysis(projectId, scope, transcriptId = null) {
  const ownerQuery = `?username=${encodeURIComponent(peerReviewOwnerUsername)}`;
  const url = scope === "coding"
    ? `/api/peer-review/projects/${projectId}/transcripts/${transcriptId}${ownerQuery}`
    : `/api/peer-review/projects/${projectId}/themes${ownerQuery}`;
  peerReviewAnalysis = await apiFetch(url);
  peerSelectedIds = new Set();
  renderPeerAnalysis();
}

function peerPromptMemo(action) {
  return String(window.prompt(`Required memo: explain why you suggest ${action}.`) || "").trim();
}

function closePeerSuggestionDialog() {
  document.getElementById("peerSuggestionModal")?.classList.add("hidden");
  const returnFocus = pendingPeerSuggestion?.returnFocus;
  pendingPeerSuggestion = null;
  returnFocus?.focus();
}

function openPeerSuggestionDialog(action, targetIds, returnFocus = null) {
  const analysis = peerReviewAnalysis;
  if (!analysis || !["revise", "reject", "merge"].includes(action)) return;
  const indexed = new Map((analysis.items || []).map((item, index) => [peerItemId(item, index), item]));
  const selectedItems = targetIds.map((id) => indexed.get(String(id))).filter(Boolean);
  const item = selectedItems[0];
  if (!item) return;
  pendingPeerSuggestion = { action, targetIds, selectedItems, returnFocus };
  const kind = analysis.scope === "coding" ? "code" : "theme";
  const merging = action === "merge";
  const rejecting = action === "reject";
  const editing = !rejecting;
  document.getElementById("peerSuggestionDialogTitle").textContent = merging
    ? `Suggest merging ${selectedItems.length} ${kind}s`
    : (rejecting ? `Suggest rejecting this ${kind}` : `Suggest a ${kind} revision`);
  document.getElementById("peerSuggestionDialogDescription").textContent = merging
    ? `Propose one combined ${kind}. The owner will decide whether to apply the merge.`
    : (rejecting
      ? `Explain why this ${kind} should be removed. The owner will make the final decision.`
      : "Propose a replacement below. The owner will decide whether to apply it.");
  document.getElementById("peerSuggestionTarget").innerHTML = merging
    ? `<strong>Selected ${kind}s (${selectedItems.length})</strong><ul>${selectedItems.map((entry) => `<li>${escapeHTML(entry.title || "Untitled")}</li>`).join("")}</ul>`
    : `<strong>Selected ${kind}</strong>${escapeHTML(item.title || "Untitled")}`;
  const revisionFields = document.getElementById("peerSuggestionRevisionFields");
  const detailField = document.getElementById("peerSuggestionDetailField");
  revisionFields.classList.toggle("hidden", !editing);
  const titleInput = document.getElementById("peerSuggestionTitle");
  const detailInput = document.getElementById("peerSuggestionDetail");
  document.getElementById("peerSuggestionTitleLabel").textContent = merging ? `Proposed merged ${kind} name` : `Proposed ${kind} name`;
  titleInput.value = editing ? (merging ? selectedItems.map((entry) => entry.title || "Untitled").join(" + ") : (item.title || "")) : "";
  titleInput.required = editing;
  const hideDetail = merging && analysis.scope === "coding";
  detailField.classList.toggle("hidden", hideDetail);
  if (analysis.scope === "coding") {
    document.getElementById("peerSuggestionDetailLabel").textContent = "Proposed excerpts (one per line)";
    detailInput.value = editing && !merging ? codeExcerptList(item).join("\n") : "";
    detailInput.required = false;
  } else {
    document.getElementById("peerSuggestionDetailLabel").textContent = merging ? "Proposed merged theme description" : "Proposed theme description";
    detailInput.value = editing && !merging ? (item.rationale || "") : "";
    detailInput.required = editing;
  }
  document.getElementById("peerSuggestionMemo").value = "";
  document.getElementById("sendPeerSuggestion").textContent = merging
    ? "Send merge suggestion"
    : (rejecting ? "Send rejection suggestion" : "Send revision suggestion");
  document.getElementById("peerSuggestionModal").classList.remove("hidden");
  window.setTimeout(() => (editing ? titleInput : document.getElementById("peerSuggestionMemo")).focus(), 0);
}

async function sendPeerSuggestionRequest(action, targetIds, proposedValue, memo) {
  const analysis = peerReviewAnalysis;
  if (!analysis) return;
  await apiFetch("/api/peer-suggestions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: analysis.project.id,
      transcript_id: analysis.transcript_id,
      scope: analysis.scope,
      action,
      target_ids: targetIds,
      proposed_value: proposedValue,
      memo,
    }),
  });
  peerSelectedIds = new Set();
  renderPeerAnalysis();
  toast("Suggestion sent to the owner. You cannot export or download their proposed version.");
}

function peerProposedValue(action, item, selectedItems = []) {
  const scope = peerReviewAnalysis.scope;
  if (["accept", "reject"].includes(action)) return {};
  if (action === "revise") {
    const title = String(window.prompt(`Proposed ${scope === "coding" ? "code" : "theme"} name:`, item.title || "") || "").trim();
    if (!title) return null;
    if (scope === "coding") {
      const excerpts = String(window.prompt("Proposed excerpts, one per line:", codeExcerptList(item).join("\n")) || "")
        .split(/\n+/).map((value) => value.trim()).filter(Boolean);
      return { title, excerpts };
    }
    const rationale = String(window.prompt("Proposed theme description:", item.rationale || "") || "").trim();
    return rationale ? { title, rationale } : null;
  }
  if (action === "merge") {
    const title = String(window.prompt(`Proposed merged ${scope === "coding" ? "code" : "theme"} name:`, selectedItems.map((entry) => entry.title).join(" + ")) || "").trim();
    if (!title) return null;
    if (scope === "coding") return { title };
    const rationale = String(window.prompt("Proposed merged theme description:", "") || "").trim();
    return rationale ? { title, rationale } : null;
  }
  if (action === "split") {
    const codeNames = (item.codes || []).map((code) => code.codeName || code.title || "").filter(Boolean);
    if (codeNames.length < 2) return null;
    const firstTitle = String(window.prompt("First split theme name:", `${item.title || "Theme"} A`) || "").trim();
    const firstRationale = String(window.prompt("First split theme description:", "") || "").trim();
    const firstCodes = String(window.prompt(`Codes for the first theme, separated by commas:\n${codeNames.join(", ")}`, codeNames[0]) || "").split(",").map((value) => value.trim()).filter(Boolean);
    const secondTitle = String(window.prompt("Second split theme name:", `${item.title || "Theme"} B`) || "").trim();
    const secondRationale = String(window.prompt("Second split theme description:", "") || "").trim();
    const firstSet = new Set(firstCodes);
    const secondCodes = codeNames.filter((name) => !firstSet.has(name));
    if (!firstTitle || !firstRationale || !secondTitle || !secondRationale || !firstCodes.length || !secondCodes.length) return null;
    return { parts: [
      { title: firstTitle, rationale: firstRationale, code_names: firstCodes },
      { title: secondTitle, rationale: secondRationale, code_names: secondCodes },
    ] };
  }
  return {};
}

async function submitPeerSuggestion(action, targetIds) {
  const analysis = peerReviewAnalysis;
  if (!analysis) return;
  const indexed = new Map((analysis.items || []).map((item, index) => [peerItemId(item, index), item]));
  const selectedItems = targetIds.map((id) => indexed.get(String(id))).filter(Boolean);
  const memo = peerPromptMemo(action);
  if (!memo) return toast("A memo is required for every peer suggestion.");
  const proposedValue = peerProposedValue(action, selectedItems[0], selectedItems);
  if (proposedValue === null) return toast("Complete the proposed answer before sending the suggestion.");
  await sendPeerSuggestionRequest(action, targetIds, proposedValue, memo);
}

function peerInboxEvidence(item, scope) {
  if (scope === "coding") return codeExcerptList(item);
  return (item.codes || []).map((code) => typeof code === "string" ? code : (code.codeName || code.title || "Code"));
}

function peerInboxResultDetail(item, scope, label = "") {
  const evidence = peerInboxEvidence(item, scope);
  return `<article class="peer-inbox-result-detail">
    ${label ? `<span>${escapeHTML(label)}</span>` : ""}
    <h4>${escapeHTML(item.title || "Untitled")}</h4>
    ${scope === "themes" && item.rationale ? `<p>${escapeHTML(item.rationale)}</p>` : ""}
    ${evidence.length ? `<ul>${evidence.map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul>` : `<p class="muted">No supporting ${scope === "coding" ? "excerpts" : "codes"}.</p>`}
  </article>`;
}

function peerProposedDetails(suggestion) {
  if (suggestion.action === "reject") {
    return `<div class="peer-change-removal"><strong>Remove from the approved results</strong><span>The affected ${suggestion.scope === "coding" ? "code" : "theme"} will no longer appear in the active result set.</span></div>`;
  }
  const proposed = suggestion.proposed_value || {};
  if (suggestion.action === "split") {
    return `<div class="peer-inbox-result-grid">${(proposed.parts || []).map((part, index) => peerInboxResultDetail({
      title: part.title, rationale: part.rationale, codes: part.code_names || [],
    }, suggestion.scope, `New theme ${index + 1}`)).join("")}</div>`;
  }
  const previewMatch = (suggestion.result_preview || []).find((item) => item.title === proposed.title);
  const proposedItem = previewMatch || {
    title: proposed.title,
    rationale: proposed.rationale,
    excerpts: proposed.excerpts || [],
    quotes: proposed.excerpts || [],
  };
  return `<div class="peer-inbox-result-grid">${peerInboxResultDetail(
    proposedItem, suggestion.scope, suggestion.action === "merge" ? "Merged result" : "Revised result"
  )}</div>`;
}

function renderPeerInbox() {
  const received = peerSuggestionInbox.filter((item) => item.owner_id === Number(currentUser?.id));
  const pending = received.filter((item) => item.status === "pending").length;
  const target = document.getElementById("peerInboxContent");
  const completionMarkup = peerInboxCompletion && pending === 0 ? `<div class="peer-inbox-complete" role="status">
    <span class="peer-inbox-complete-icon" aria-hidden="true">✓</span>
    <div><strong>All suggestions are resolved</strong><p>${peerInboxCompletion.accepted
      ? `Your agreed changes are saved${peerInboxCompletion.location ? ` in ${escapeHTML(peerInboxCompletion.location)}` : ""}, but the revision is not finished yet. Return to My Projects, open the affected ${peerInboxCompletion.scope === "themes" ? "Themes results" : "transcript coding results"}, and select <strong>Finish changes</strong>.`
      : "No suggestions were applied, so you do not need to finish a new revision."}</p></div>
    <button class="primary-btn" type="button" data-return-peer-projects>Return to My Projects</button>
  </div>` : "";
  target.innerHTML = `${completionMarkup}${pending ? `<div class="peer-suggestion-notice"><strong>${pending} suggestion${pending === 1 ? "" : "s"} awaiting your decision.</strong> Finish and Export remain unavailable for each affected result until every suggestion is resolved.</div>` : ""}${received.length ? `<div class="peer-suggestion-list">${received.map((suggestion) => {
    const kind = suggestion.scope === "coding" ? "code" : "theme";
    const finalLabel = suggestion.status === "pending" ? `Preview final ${kind} results if applied` : `Current ${kind} results`;
    return `<article class="peer-suggestion-card ${escapeHTML(suggestion.status)}">
      <div class="peer-suggestion-meta"><span>${escapeHTML(suggestion.project_name)}</span>${suggestion.transcript_name ? `<span>${escapeHTML(suggestion.transcript_name)}</span>` : ""}<span>${escapeHTML(suggestion.scope)}</span><span>${escapeHTML(suggestion.status)}</span></div>
      <div class="peer-suggestion-heading"><div><span>${escapeHTML(suggestion.reviewer_username)} suggests</span><h3>${escapeHTML(suggestion.action)} ${escapeHTML(kind)}</h3></div><span class="peer-suggestion-revision">Based on revision ${suggestion.base_revision}</span></div>
      ${suggestion.is_stale && suggestion.status === "pending" ? `<div class="peer-suggestion-stale"><strong>Results changed after this suggestion.</strong> Review the current affected content and final preview carefully before agreeing.</div>` : ""}
      <section class="peer-decision-section"><h4>Where this changes your work</h4><p>${escapeHTML(suggestion.project_name)}${suggestion.transcript_name ? ` · ${escapeHTML(suggestion.transcript_name)}` : ""} · ${escapeHTML(suggestion.scope)}</p>
        <div class="peer-inbox-result-grid">${(suggestion.affected_items || []).length
          ? suggestion.affected_items.map((item) => peerInboxResultDetail(item, suggestion.scope, "Current result")).join("")
          : `<div class="peer-change-removal"><span>The original affected result is no longer in the current revision.</span></div>`}</div>
      </section>
      <section class="peer-decision-section peer-why-section"><h4>Why the reviewer suggests this</h4><p>${escapeHTML(suggestion.memo)}</p></section>
      <section class="peer-decision-section"><h4>Proposed change</h4>${peerProposedDetails(suggestion)}</section>
      <details class="peer-final-preview"><summary>${escapeHTML(finalLabel)} <span>${(suggestion.result_preview || []).length} ${escapeHTML(kind)}${(suggestion.result_preview || []).length === 1 ? "" : "s"}</span></summary>
        <div class="peer-inbox-result-grid">${(suggestion.result_preview || []).map((item) => peerInboxResultDetail(item, suggestion.scope)).join("")}</div>
      </details>
      ${suggestion.status === "pending" ? `<div class="peer-suggestion-actions"><button class="primary-btn" type="button" data-resolve-peer="accept" data-suggestion-id="${suggestion.id}">Agree and apply</button><button class="secondary-btn" type="button" data-resolve-peer="reject" data-suggestion-id="${suggestion.id}">Disagree</button></div>` : ""}
    </article>`;
  }).join("")}</div>` : `<article class="library-empty"><strong>No suggestions yet</strong><p>When another junior researcher reviews your exported work, their suggestions will appear here.</p></article>`}`;
}

async function openPeerInbox() {
  peerInboxCompletion = null;
  await loadPeerSuggestionCount();
  renderPeerInbox();
  showView("peerInbox");
}

async function resolvePeerSuggestion(id, decision) {
  const resolvedSuggestion = peerSuggestionInbox.find((item) => Number(item.id) === Number(id));
  await apiFetch(`/api/peer-suggestions/${id}/resolve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  await Promise.all([loadPeerSuggestionCount(), loadProjects()]);
  const received = peerSuggestionInbox.filter((item) => item.owner_id === Number(currentUser?.id));
  if (!received.some((item) => item.status === "pending")) {
    peerInboxCompletion = {
      accepted: received.some((item) => item.status === "accepted"),
      location: [resolvedSuggestion?.project_name, resolvedSuggestion?.transcript_name].filter(Boolean).join(" · "),
      scope: resolvedSuggestion?.scope || "coding",
    };
  }
  renderPeerInbox();
  toast(decision === "accept" ? "Suggestion agreed and applied to your results." : "Suggestion declined; your result was not changed.");
}

async function ensurePeerSuggestionsResolved(scope, transcriptId = null) {
  if (currentUser?.role !== "student" || !currentProject?.id) return true;
  const payload = await apiFetch(`/api/peer-suggestions?project_id=${encodeURIComponent(currentProject.id)}`);
  const pending = (payload.suggestions || []).filter((item) => (
    item.owner_id === Number(currentUser.id) && item.status === "pending" && item.scope === scope
    && (scope !== "coding" || String(item.transcript_id) === String(transcriptId))
  ));
  if (!pending.length) return true;
  toast(`Resolve ${pending.length} pending peer suggestion${pending.length === 1 ? "" : "s"} before finishing or exporting a new version.`, 6000);
  return false;
}

function connectionCard(item, perspective, pending = false) {
  const label = perspective === "pi" ? "Junior researcher" : "Senior researcher";
  const detail = pending
    ? (perspective === "pi" ? "Waiting for the junior researcher to respond" : "Invited you to connect permanently")
    : (perspective === "pi"
      ? `${item.project_count || 0} project${Number(item.project_count || 0) === 1 ? "" : "s"} · Select to view projects`
      : "Permanently connected");
  const actions = pending && perspective === "student" ? `
    <div class="connection-actions">
      <button class="secondary-btn decline-invitation" type="button" data-pi-response="decline" data-connection-id="${item.id}">Decline</button>
      <button class="primary-btn" type="button" data-pi-response="accept" data-connection-id="${item.id}">Accept</button>
    </div>` : `<span class="connection-status${pending ? "" : " active"}">${pending ? "Pending" : "Connected"}</span>`;
  const interactive = perspective === "pi" && !pending;
  const tag = interactive ? "button" : "article";
  const attributes = interactive ? ` type="button" data-open-connected-student="${item.student_id}"` : "";
  return `<${tag} class="connection-card${interactive ? " connection-card-link" : ""}"${attributes}>
    <span class="connection-avatar" aria-hidden="true">${escapeHTML(initials(item.username))}</span>
    <div class="connection-copy"><strong>${escapeHTML(item.username)}</strong><span>${label} · ${escapeHTML(detail)}</span></div>
    ${actions}
    ${interactive ? '<span class="connection-open-arrow" aria-hidden="true">→</span>' : ""}
  </${tag}>`;
}

function renderPiStudentConnections(payload) {
  const container = document.getElementById("piStudentConnections");
  if (!container) return;
  const pending = payload.pending || [];
  const connected = payload.connected || [];
  if (!pending.length && !connected.length) {
    container.innerHTML = `<article class="connections-empty">
      <strong>No junior researchers are connected yet</strong>
      <p>Invite a Junior researcher using their exact ReflexCoTI username.</p>
      <button class="secondary-btn" type="button" data-open-invite-student>Invite junior researcher</button>
    </article>`;
    return;
  }
  container.innerHTML = `
    ${pending.length ? `<section class="connection-section"><div class="connection-section-heading"><h2>Pending review requests</h2><span class="connection-count">${pending.length}</span></div><div class="connection-list">${pending.map((item) => connectionCard(item, "pi", true)).join("")}</div></section>` : ""}
    <section class="connection-section"><div class="connection-section-heading"><h2>Connected junior researchers</h2><span class="connection-count">${connected.length}</span></div>${connected.length ? `<div class="connection-list">${connected.map((item) => connectionCard(item, "pi")).join("")}</div>` : '<div class="connections-empty"><strong>No accepted connections yet</strong><p>Accepted junior researchers will appear here permanently.</p></div>'}</section>`;
}

function peerReviewRequestCard(item) {
  return `<article class="connection-card">
    <span class="connection-avatar" aria-hidden="true">${escapeHTML(initials(item.username))}</span>
    <div class="connection-copy"><strong>${escapeHTML(item.username)}</strong><span>Junior researcher · Requested access to review your exported results</span></div>
    <div class="connection-actions">
      <button class="secondary-btn decline-invitation" type="button" data-peer-response="decline" data-connection-id="${item.id}">Decline</button>
      <button class="primary-btn" type="button" data-peer-response="accept" data-connection-id="${item.id}">Accept</button>
    </div>
  </article>`;
}

function renderStudentReviewRequests(seniorPayload, peerPayload) {
  const panel = document.getElementById("studentPiPanel");
  const container = document.getElementById("studentPiConnections");
  if (!panel || !container) return;
  const seniorPending = seniorPayload.pending || [];
  const peerPending = peerPayload.pending || [];
  panel.classList.toggle("hidden", !seniorPending.length && !peerPending.length);
  if (!seniorPending.length && !peerPending.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    ${seniorPending.length ? `<section class="connection-section"><div class="connection-section-heading"><h2>Senior review requests</h2><span class="connection-count">${seniorPending.length}</span></div><div class="connection-list">${seniorPending.map((item) => connectionCard(item, "student", true)).join("")}</div></section>` : ""}
    ${peerPending.length ? `<section class="connection-section"><div class="connection-section-heading"><h2>Peer review requests</h2><span class="connection-count">${peerPending.length}</span></div><div class="connection-list">${peerPending.map(peerReviewRequestCard).join("")}</div></section>` : ""}`;
}

async function loadPiStudentConnections() {
  const payload = await apiFetch("/api/pi/student-connections");
  renderPiStudentConnections(payload);
}

function renderConnectedStudentProjects(payload) {
  const container = document.getElementById("piStudentConnections");
  const title = document.getElementById("piStudentPageTitle");
  const subtitle = document.getElementById("piStudentPageSubtitle");
  const inviteButton = document.getElementById("openInviteStudent");
  if (!container) return;
  title.textContent = `${payload.student.username}’s Projects`;
  subtitle.textContent = "Review access; completed transcript codes can be amended manually with a required memo";
  inviteButton.classList.add("hidden");
  const projectCards = (payload.projects || []).map((project) => `
    <article class="project-card student-project-readonly clickable" tabindex="0" role="button" data-open-student-project="${escapeHTML(project.id)}" data-student-id="${payload.student.id}">
      <span class="readonly-badge">Review access</span>
      <h2>${escapeHTML(project.name)}</h2>
      <p class="project-card-question">${escapeHTML(project.research_question)}</p>
      <div class="project-card-meta"><span>${project.transcript_count} transcript${project.transcript_count === 1 ? "" : "s"}</span><span title="Current codebook">${Number(project.codebook_codes_count || 0).toLocaleString()} codes</span><span title="Current codebook">${Number(project.codebook_excerpts_count || 0).toLocaleString()} excerpts</span></div>
      <span class="project-card-owner">${escapeHTML(initials(payload.student.username))}</span>
    </article>`).join("");
  container.innerHTML = `
    <div class="student-project-drilldown-bar"><button class="breadcrumb-btn" type="button" data-back-connected-students>← All connected junior researchers</button><span>${payload.projects.length} project${payload.projects.length === 1 ? "" : "s"}</span></div>
    ${projectCards ? `<div class="project-card-grid">${projectCards}</div>` : '<article class="connections-empty"><strong>No projects yet</strong><p>This junior researcher has not created a project.</p></article>'}`;
}

async function openConnectedStudentProjects(studentId) {
  const payload = await apiFetch(`/api/pi/students/${studentId}/projects`);
  renderConnectedStudentProjects(payload);
}

function piReviewAnalysisCards(items, kind) {
  if (!Array.isArray(items) || !items.length) return '<div class="pi-analysis-empty">No saved analysis is available yet.</div>';
  return `<div class="pi-analysis-grid">${items.map((item, index) => {
    const title = item.title || item.code_name || item.name || `${kind === "theme" ? "Theme" : "Code"} ${index + 1}`;
    const rationale = item.rationale || item.description || item.definition || "";
    const evidence = kind === "theme"
      ? (Array.isArray(item.codes) ? item.codes.map((code) => typeof code === "string" ? code : (code.title || code.code_name || code.name || "Code")) : [])
      : (Array.isArray(item.excerpts) ? item.excerpts : (Array.isArray(item.quotes) ? item.quotes : (item.quote ? [item.quote] : [])));
    return `<article class="pi-analysis-card"><h3>${escapeHTML(title)}</h3>${rationale ? `<p>${escapeHTML(rationale)}</p>` : ""}${evidence.length ? `<ul>${evidence.slice(0, 12).map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul>` : '<p>No supporting items saved.</p>'}</article>`;
  }).join("")}</div>`;
}

function renderPiProjectReview(payload) {
  piReviewContext = { student: payload.student, project: payload.project };
  document.getElementById("piReviewProjectName").textContent = payload.project.name;
  document.getElementById("piReviewProjectQuestion").textContent = payload.project.research_question;
  document.getElementById("piReviewTranscriptCount").textContent = payload.project.transcript_count;
  document.getElementById("piReviewCodeCount").textContent = payload.project.codes_count;
  document.getElementById("piReviewExcerptCount").textContent = payload.project.excerpts_count;
  document.getElementById("piReviewThemeCount").textContent = payload.theme_count || 0;
  const themeButton = document.getElementById("viewPiThemeAnalysis");
  themeButton.disabled = !payload.has_theme_analysis;
  document.getElementById("piReviewThemeStatus").textContent = payload.has_theme_analysis
    ? `${payload.theme_count || 0} saved theme${Number(payload.theme_count || 0) === 1 ? "" : "s"} available for review.`
    : "No theme analysis has been saved.";
  const body = document.getElementById("piReviewTranscriptBody");
  body.innerHTML = payload.transcripts.length ? payload.transcripts.map((transcript) => {
    const statusLabel = transcript.analysis_status === "finished" ? "Finished" : transcript.analysis_status === "needs_finish" ? "Needs finish" : transcript.analysis_status === "in_progress" ? "In progress" : "Not started";
    return `<tr><td><strong class="document-name">${escapeHTML(transcript.name)}</strong><span class="document-submeta">${transcript.word_count || 0} words</span></td><td><span class="document-count">${transcript.codes_count}</span></td><td><span class="document-count">${transcript.excerpts_count}</span></td><td><span class="transcript-status ${transcript.analysis_status.replace("_", "-")}">${statusLabel}</span></td><td><button class="secondary-btn pi-review-action" type="button" data-view-student-analysis="${escapeHTML(transcript.id)}" ${transcript.analysis_status === "not_started" ? "disabled" : ""}>View coding</button></td></tr>`;
  }).join("") : '<tr><td colspan="5" class="table-empty">This project has no transcripts.</td></tr>';
  document.getElementById("piAnalysisDetail").classList.add("hidden");
  showView("piProjectReview");
}

async function openConnectedStudentProjectReview(studentId, projectId) {
  const payload = await apiFetch(`/api/pi/students/${studentId}/projects/${projectId}/review`);
  renderPiProjectReview(payload);
}

async function openStudentProjectAsAccount(studentId, projectId) {
  const [payload, themePayload] = await Promise.all([
    apiFetch(`/api/pi/students/${studentId}/projects/${projectId}/review`),
    apiFetch(`/api/pi/students/${studentId}/projects/${projectId}/theme-analysis`),
  ]);
  piReviewContext = { student: payload.student, project: payload.project };
  setPiReadOnlyMode(true, piReviewContext);
  setProjectContext(payload.project);
  projectFiles = payload.transcripts || [];
  projectThemeAnalysis = themePayload;
  projectCodebook = null;
  activeTranscriptFile = null;
  document.getElementById("documentProjectName").textContent = payload.project.name;
  document.getElementById("documentProjectQuestion").textContent = payload.project.research_question;
  renderDocumentManager();
  showView("documents");
}

function openPiReadOnlyThemes() {
  if (!piReadOnlyMode || !projectThemeAnalysis?.snapshot) return toast("No saved theme analysis is available.");
  selectedThemeTranscriptIds = (projectThemeAnalysis.snapshot.selectedTranscriptIds || projectFiles.map((item) => item.id)).map(String);
  activeTranscriptFile = null;
  resetThemesForNewGeneration({ announce: false });
  restoreThemeSnapshot(projectThemeAnalysis.snapshot);
  setSeniorCodeEditMode(false);
  setSeniorThemeEditMode(Boolean(projectThemeAnalysis.can_modify_themes));
  document.getElementById("themeUploadStatus").textContent = projectThemeAnalysis.can_modify_themes
    ? "Junior theme analysis is finished. Senior manual modifications are enabled."
    : `Viewing ${projectFiles.length} junior researcher transcript${projectFiles.length === 1 ? "" : "s"} in read-only mode until themes are finished and exported.`;
  document.getElementById("codebookUploadHint").textContent = "Saved junior researcher codebook";
  updateWorkspaceNavAccess("both");
  setWorkspacePage("themes");
  renderThemes();
  renderLastSaved();
  showView("workspace");
}

async function viewPiTranscriptAnalysis(transcriptId) {
  const { student, project } = piReviewContext;
  const payload = await apiFetch(`/api/pi/students/${student.id}/projects/${project.id}/transcripts/${transcriptId}/analysis`);
  const transcript = document.querySelector(`[data-view-student-analysis="${CSS.escape(transcriptId)}"]`)?.closest("tr")?.querySelector(".document-name")?.textContent || "Transcript coding";
  document.getElementById("piAnalysisDetailType").textContent = "Coding analysis";
  document.getElementById("piAnalysisDetailTitle").textContent = transcript;
  document.getElementById("piAnalysisDetailContent").innerHTML = piReviewAnalysisCards(payload.snapshot?.codes || [], "code");
  document.getElementById("piAnalysisDetail").classList.remove("hidden");
  document.getElementById("piAnalysisDetail").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function viewPiThemeAnalysis() {
  const { student, project } = piReviewContext;
  const payload = await apiFetch(`/api/pi/students/${student.id}/projects/${project.id}/theme-analysis`);
  document.getElementById("piAnalysisDetailType").textContent = "Theme analysis";
  document.getElementById("piAnalysisDetailTitle").textContent = project.name;
  document.getElementById("piAnalysisDetailContent").innerHTML = piReviewAnalysisCards(payload.snapshot?.themes || [], "theme");
  document.getElementById("piAnalysisDetail").classList.remove("hidden");
  document.getElementById("piAnalysisDetail").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function showPiStudentsOverview() {
  document.getElementById("piStudentPageTitle").textContent = "Junior Researcher Projects";
  document.getElementById("piStudentPageSubtitle").textContent = "Review coding and theme analyses shared with you";
  document.getElementById("openInviteStudent").classList.remove("hidden");
  await loadPiStudentConnections();
}

async function loadStudentPiConnections() {
  const [seniorPayload, peerPayload] = await Promise.all([
    apiFetch("/api/student/pi-connections"),
    apiFetch("/api/student/peer-review-connections"),
  ]);
  renderStudentReviewRequests(seniorPayload, peerPayload);
}

function openInviteStudentModal() {
  document.getElementById("inviteStudentForm")?.reset();
  document.getElementById("inviteStudentModal")?.classList.remove("hidden");
  document.getElementById("inviteStudentUsername")?.focus();
}

function closeInviteStudentModal() {
  document.getElementById("inviteStudentModal")?.classList.add("hidden");
}

function openCreateProjectModal() {
  document.getElementById("projectForm")?.reset();
  const error = document.getElementById("projectCreateError");
  if (error) { error.textContent = ""; error.classList.add("hidden"); }
  document.getElementById("createProjectModal")?.classList.remove("hidden");
  document.getElementById("projectName")?.focus();
}

function closeCreateProjectModal() {
  document.getElementById("createProjectModal")?.classList.add("hidden");
}

function openDeleteProjectModal(projectId) {
  pendingDeleteProject = projects.find((project) => project.id === projectId) || null;
  if (!pendingDeleteProject) return;
  const transcriptCount = Number(pendingDeleteProject.transcript_count || 0);
  const codeCount = Number(pendingDeleteProject.codes_count || 0);
  const excerptCount = Number(pendingDeleteProject.excerpts_count || 0);
  document.getElementById("deleteProjectSummary").innerHTML = `
    <strong>${escapeHTML(pendingDeleteProject.name)}</strong>
    ${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"}, ${codeCount} code${codeCount === 1 ? "" : "s"}, and ${excerptCount} excerpt${excerptCount === 1 ? "" : "s"} will be permanently removed.`;
  document.getElementById("deleteProjectModal")?.classList.remove("hidden");
  document.getElementById("cancelDeleteProject")?.focus();
}

function closeDeleteProjectModal() {
  document.getElementById("deleteProjectModal")?.classList.add("hidden");
  pendingDeleteProject = null;
}

async function deletePendingProject() {
  if (!pendingDeleteProject) return;
  const project = pendingDeleteProject;
  const button = document.getElementById("confirmDeleteProject");
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const result = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
    closeDeleteProjectModal();
    await loadProjects();
    toast(result.warning || `“${project.name}” was deleted.`);
  } catch (error) {
    toast(error.message || "Could not delete the project.");
  } finally {
    button.disabled = false;
    button.textContent = "Delete project";
  }
}

async function openProject(projectId) {
  const [payload, themeAnalysisPayload, codebookPayload] = await Promise.all([
    apiFetch(`/api/projects/${projectId}`),
    apiFetch(`/api/projects/${projectId}/theme-analysis`),
    apiFetch(`/api/projects/${projectId}/codebook`),
  ]);
  setProjectContext(payload.project);
  projectFiles = payload.transcripts || [];
  projectThemeAnalysis = themeAnalysisPayload;
  projectCodebook = codebookPayload;
  renderDocumentManager();
  showView("documents");
}

function themeSnapshotHasGeneratedThemes(snapshot) {
  return Boolean(
    snapshot?.themeGenerationStarted &&
    ((snapshot.themes || []).length || (snapshot.originalAiThemes || []).length)
  );
}

 function updateManagerActions() {
  const status = document.getElementById("managerSelectionStatus");
  const button = document.getElementById("openSelectionBtn");
  const codebookViewButton = document.getElementById("openCodebookViewBtn");
  const themeViewButton = document.getElementById("openThemeViewBtn");
  const toolbar = document.querySelector(".selection-toolbar");
  if (!status || !button) return;
  const unfinishedCount = projectFiles.filter((item) => item.analysis_status !== "finished").length;
  const hasEnoughTranscripts = projectFiles.length > 1;
  const canOpenThemes = hasEnoughTranscripts && unfinishedCount === 0;
  const themeSnapshot = projectThemeAnalysis?.snapshot;
  const hasGeneratedThemes = themeSnapshotHasGeneratedThemes(themeSnapshot);
  const canOpenThemeView = canOpenThemes && hasGeneratedThemes;
  const canOpenCodebookView = Boolean(projectCodebook?.available && projectCodebook?.codebook);
  if (!hasEnoughTranscripts) {
    status.textContent = "Perform human coding or review AI codes. Add at least two transcripts to use Themes.";
  } else if (unfinishedCount > 0) {
    status.textContent = `Finish ${unfinishedCount} remaining transcript${unfinishedCount === 1 ? "" : "s"} before opening Themes with all ${projectFiles.length} transcripts.`;
  } else {
    status.textContent = `All ${projectFiles.length} project transcripts are finished and ready for Themes.`;
  }
  button.textContent = "Open Themes with all transcripts";
  button.disabled = !canOpenThemes;
  if (themeViewButton) {
    themeViewButton.disabled = !canOpenThemeView;
    themeViewButton.title = canOpenThemeView ? "Explore generated project themes" : "Generate project themes to enable Theme View";
  }
  if (codebookViewButton) {
    codebookViewButton.disabled = !canOpenCodebookView;
    codebookViewButton.title = canOpenCodebookView ? "Explore the current cumulative project codebook" : "Finish transcript coding to create the project codebook";
  }
  toolbar?.classList.toggle("ready", canOpenThemes);
}

function transcriptStatusBadge(item) {
  const status = ["in_progress", "needs_finish", "finished"].includes(item.analysis_status)
    ? item.analysis_status
    : "not_started";
  const labels = { not_started: "Not started", in_progress: "In progress", needs_finish: "Needs finish", finished: "Finished" };
  return `<span class="transcript-status ${status.replace("_", "-")}">${labels[status]}</span>`;
}
function renderDocumentManager(filter = "") {
  const body = document.getElementById("documentTableBody");
  if (!body) return;
  const query = filter.trim().toLowerCase();
  const visible = projectFiles.filter((item) => item.name.toLowerCase().includes(query));
  body.innerHTML = visible.length ? visible.map((item) => `
    <tr data-transcript-row="${escapeHTML(item.id)}">
      <td><span class="document-name">${escapeHTML(item.name)}</span><span class="document-submeta">${escapeHTML(humanFileSize(item.size))}${item.word_count ? ` · ${Number(item.word_count).toLocaleString()} words` : ""}</span></td>
      <td><span class="document-count">${Number(item.codes_count || 0).toLocaleString()}</span></td>
      <td>${transcriptStatusBadge(item)}</td>
      <td><div class="document-row-actions">${piReadOnlyMode ? "" : `<button class="human-codes-btn" type="button" data-open-human-codes="${escapeHTML(item.id)}">Human Coding</button>`}<button class="ai-codes-btn" type="button" data-open-transcript="${escapeHTML(item.id)}">AI Coding</button>${piReadOnlyMode ? "" : `<button class="code-view-btn" type="button" data-open-code-view="${escapeHTML(item.id)}" ${Number(item.codes_count || 0) ? "" : "disabled"}>◉ Code View</button><button class="transcript-clear-btn" type="button" data-clear-transcript="${escapeHTML(item.id)}" ${item.analysis_status === "not_started" ? "disabled" : ""}>Clear</button><button class="transcript-delete-btn" type="button" data-delete-transcript="${escapeHTML(item.id)}">Delete</button>`}</div></td>
    </tr>`).join("") : `<tr><td colspan="4" class="table-empty">${piReadOnlyMode ? "This junior researcher has no transcripts." : "No transcripts uploaded yet. Use Add transcripts to begin."}</td></tr>`;
  updateManagerActions();
}


function codeViewSourceClass(code) {
  return codeCardSourceClass(code);
}

function codeViewKey(code, index) {
  return String(code?.id || `code-${index}`);
}

function codeViewNodeMetrics(code, maxExcerptCount) {
  const weight = codeExcerptList(code).length / Math.max(1, maxExcerptCount);
  if (weight > .66) return { size: "large", width: 244, height: 64 };
  if (weight > .32) return { size: "medium", width: 218, height: 56 };
  return { size: "small", width: 190, height: 50 };
}

function fallbackCodeViewLayout() {
  const count = codeViewCodes.length;
  const positions = new Map();
  if (!count) return positions;
  codeViewCodes.forEach((code, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
    const radius = count === 1 ? 0 : .34;
    positions.set(codeViewKey(code, index), {
      x: .5 + Math.cos(angle) * radius,
      y: .5 + Math.sin(angle) * radius,
    });
  });
  return positions;
}

function resolveCodeViewCollisions(rawPositions) {
  const count = codeViewCodes.length;
  const maxExcerptCount = Math.max(1, ...codeViewCodes.map((code) => codeExcerptList(code).length));
  const width = 1200;
  const height = Math.max(520, Math.min(900, 390 + Math.ceil(count / 7) * 82));
  const nodes = codeViewCodes.map((code, index) => {
    const metrics = codeViewNodeMetrics(code, maxExcerptCount);
    const raw = rawPositions.get(codeViewKey(code, index)) || { x: .5, y: .5 };
    return {
      key: codeViewKey(code, index),
      x: raw.x * width,
      y: raw.y * height,
      anchorX: raw.x * width,
      anchorY: raw.y * height,
      ...metrics,
    };
  });
  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        if (Math.abs(dx) < .01 && Math.abs(dy) < .01) {
          dx = ((rightIndex % 2) ? 1 : -1) * .5;
          dy = ((leftIndex % 2) ? 1 : -1) * .5;
        }
        const overlapX = ((left.width + right.width) / 2 + 16) - Math.abs(dx);
        const overlapY = ((left.height + right.height) / 2 + 16) - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapX / Math.max(1, left.width + right.width) < overlapY / Math.max(1, left.height + right.height)) {
          const push = overlapX / 2;
          const direction = dx >= 0 ? 1 : -1;
          left.x -= push * direction;
          right.x += push * direction;
        } else {
          const push = overlapY / 2;
          const direction = dy >= 0 ? 1 : -1;
          left.y -= push * direction;
          right.y += push * direction;
        }
      }
    }
    nodes.forEach((node) => {
      if (iteration < 60) {
        node.x += (node.anchorX - node.x) * .018;
        node.y += (node.anchorY - node.y) * .018;
      }
      node.x = Math.max(node.width / 2 + 24, Math.min(width - node.width / 2 - 24, node.x));
      node.y = Math.max(node.height / 2 + 24, Math.min(height - node.height / 2 - 24, node.y));
    });
  }
  codeViewCanvasHeight = height;
  return new Map(nodes.map((node) => [node.key, {
    x: (node.x / width) * 100,
    y: (node.y / height) * 100,
    width: node.width,
    size: node.size,
  }]));
}

async function requestCodeSemanticLayout() {
  if (!codeViewCodes.length) {
    codeViewPositions = new Map();
    return;
  }
  const items = codeViewCodes.map((code, index) => ({
    id: codeViewKey(code, index),
    title: code.title || "Untitled code",
    excerpts: codeExcerptList(code),
  }));
  try {
    const result = await apiFetch("/api/semantic-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const rawPositions = new Map((result.positions || []).map((position) => [
      String(position.id),
      { x: Number(position.x), y: Number(position.y) },
    ]));
    codeViewLayoutMethod = result.method || "semantic-pca";
    codeViewPositions = resolveCodeViewCollisions(rawPositions);
  } catch (error) {
    codeViewLayoutMethod = "radial fallback";
    codeViewPositions = resolveCodeViewCollisions(fallbackCodeViewLayout());
    toast("Semantic positioning was unavailable; a stable fallback layout is shown.");
  }
}

function renderCodeVisualization(filter = "") {
  const target = document.getElementById("codeConstellation");
  if (!target) return;
  const query = filter.trim().toLowerCase();
  const visible = codeViewCodes.map((code, index) => ({ code, index }))
    .filter(({ code }) => String(code.title || "").toLowerCase().includes(query));
  const totalExcerpts = codeViewCodes.reduce((sum, code) => sum + codeExcerptList(code).length, 0);
  document.getElementById("codeViewCodeCount").textContent = codeViewCodes.length.toLocaleString();
  document.getElementById("codeViewExcerptCount").textContent = totalExcerpts.toLocaleString();
  const methodLabel = codeViewLayoutMethod.includes("semantic") ? "semantic PCA" : codeViewLayoutMethod;
  document.getElementById("codeViewVisibleStatus").textContent = `${query ? `${visible.length} of ${codeViewCodes.length} codes` : `Showing all ${codeViewCodes.length} codes`} · ${methodLabel}`;
  if (!visible.length) {
    target.classList.remove("semantic-layout");
    target.style.removeProperty("--semantic-height");
    target.innerHTML = `<div class="code-view-empty"><span>✦</span><strong>No matching codes</strong><p>Try another code name.</p></div>`;
    return;
  }
  target.classList.add("semantic-layout");
  target.style.setProperty("--semantic-height", `${codeViewCanvasHeight}px`);
  const maxExcerptCount = Math.max(1, ...codeViewCodes.map((code) => codeExcerptList(code).length));
  target.innerHTML = visible.map(({ code, index }) => {
    const excerpts = codeExcerptList(code);
    const key = codeViewKey(code, index);
    const position = codeViewPositions.get(key) || { x: 50, y: 50, ...codeViewNodeMetrics(code, maxExcerptCount) };
    const detailId = `code-view-detail-${index}`;
    return `
      <article class="code-node semantic-positioned ${position.y > 64 ? "detail-up" : ""} ${position.size} ${codeViewSourceClass(code)}" data-code-view-node style="left:${position.x}%;top:${position.y}%;--node-width:${position.width}px">
        <div class="code-node-core"><span class="code-node-orbit" aria-hidden="true"></span><strong>${escapeHTML(code.title || "Untitled code")}</strong><span class="code-node-excerpt-count" title="${excerpts.length} supporting excerpt${excerpts.length === 1 ? "" : "s"}">${excerpts.length}</span><button type="button" data-code-view-expand aria-expanded="false" aria-controls="${detailId}" aria-label="Show ${excerpts.length} excerpt${excerpts.length === 1 ? "" : "s"} for ${escapeHTML(code.title || "this code")}">+</button></div>
        <div class="code-node-detail hidden" id="${detailId}"><div class="code-node-detail-heading"><strong>Supporting excerpts</strong><span>${excerpts.length}</span></div>${excerpts.length ? `<ol>${excerpts.map((excerpt) => `<li>“${escapeHTML(excerpt)}”</li>`).join("")}</ol>` : `<p>No supporting excerpts are saved for this code.</p>`}</div>
      </article>`;
  }).join("");
}

async function openCodeVisualization(file) {
  if (!file || !currentProject) return;
  codeViewTranscriptFile = file;
  document.getElementById("codeViewTranscriptName").textContent = file.name.replace(/\.docx$/i, "");
  document.getElementById("codeViewProjectName").textContent = `${currentProject.name} · A semantic map of the reviewed coding landscape`;
  document.getElementById("codeViewSearch").value = "";
  codeViewCodes = [];
  codeViewPositions = new Map();
  codeViewLayoutMethod = "mapping";
  showView("codeVisualization");
  document.getElementById("codeConstellation").innerHTML = `<div class="code-view-empty loading"><span>✦</span><strong>Embedding and mapping codes…</strong><p>Code names and excerpts are being projected into semantic space.</p></div>`;
  try {
    const payload = await apiFetch(`/api/projects/${currentProject.id}/transcripts/${file.id}/analysis`);
    codeViewCodes = (payload.snapshot?.codes || []).filter(isFinalAiCodingResult);
    await requestCodeSemanticLayout();
    renderCodeVisualization();
  } catch (error) {
    document.getElementById("codeConstellation").innerHTML = `<div class="code-view-empty"><strong>Could not load this code view</strong><p>${escapeHTML(error.message || "Please try again.")}</p></div>`;
  }
}

function themeViewSourceClass(theme) {
  if (theme?.sourceClass === "human" || theme?.source === "Human") return "human";
  if (theme?.source === "AI+Human" || ["revised", "split", "merged"].includes(theme?.reviewStatus)) return "collaborative";
  return "ai";
}

function themeViewCodeNames(theme) {
  return [...new Set((theme?.codes || []).map((code) => String(code?.codeName || code?.title || code?.["code name"] || "").trim()).filter(Boolean))];
}

function themeViewTranscriptIds(theme) {
  return [...new Set((theme?.codes || []).flatMap((code) => {
    const ids = code?.transcriptIds || code?.transcript_ids || code?.transcripts || code?.transcript || [];
    return (Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "").trim()).filter(Boolean);
  }))];
}

const themeCloudStopWords = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "through", "about", "after", "before", "between",
  "being", "have", "has", "had", "were", "was", "are", "but", "not", "you", "your", "their", "they", "them",
  "our", "out", "all", "any", "can", "could", "would", "should", "how", "why", "what", "when", "where", "who",
]);

function themeCloudTokens(value) {
  return (String(value || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [])
    .map((word) => word.replace(/^[’']+|[’']+$/g, ""))
    .filter((word) => word.length > 2 && !themeCloudStopWords.has(word.toLowerCase()));
}

function themeWordCloudEntries(filter = "") {
  const query = filter.trim().toLowerCase();
  const entries = new Map();
  themeViewThemes.forEach((theme, themeIndex) => {
    themeViewCodeNames(theme).forEach((name) => {
      [...new Set(themeCloudTokens(name).map((word) => word.toLowerCase()))].forEach((key) => {
        const displayWord = themeCloudTokens(name).find((word) => word.toLowerCase() === key) || key;
        const entry = entries.get(key) || { name: displayWord, codeNames: new Set(), themeIds: new Set(), transcriptIds: new Set() };
        entry.codeNames.add(name);
        entry.themeIds.add(String(theme.id || theme.title || themeIndex));
        themeViewTranscriptIds(theme).forEach((id) => entry.transcriptIds.add(id));
        entries.set(key, entry);
      });
    });
  });
  return [...entries.values()]
    .filter((entry) => !query || entry.name.toLowerCase().includes(query))
    .map((entry) => ({ ...entry, score: entry.codeNames.size + (entry.themeIds.size * .5) + (entry.transcriptIds.size * .08) }))
    .sort((a, b) => b.score - a.score || b.themeIds.size - a.themeIds.size || a.name.localeCompare(b.name));
}

function cloudWordPlacement(entries, width, height) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const placed = [];
  const scores = entries.map((entry) => entry.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const maxFont = Math.min(width < 600 ? 54 : 92, width / 7);
  const minFont = width < 600 ? 12 : 14;
  const centerX = width / 2;
  const centerY = height / 2;
  const limit = Math.min(entries.length, width < 600 ? 55 : 110);

  entries.slice(0, limit).forEach((entry, index) => {
    const normalized = maxScore === minScore ? (entries.length === 1 ? 1 : .48) : (entry.score - minScore) / (maxScore - minScore);
    let fontSize = Math.round(minFont + (maxFont - minFont) * Math.pow(normalized, .72));
    let result = null;
    for (let scaleAttempt = 0; scaleAttempt < 4 && !result; scaleAttempt += 1) {
      context.font = `${index < 8 ? 620 : 450} ${fontSize}px Inter, Arial, sans-serif`;
      const wordWidth = Math.ceil(context.measureText(entry.name).width) + 7;
      const wordHeight = Math.ceil(fontSize * 1.04);
      for (let step = 0; step < 1800; step += 1) {
        const angle = (step * .31) + (index * 1.7);
        const radius = 1.9 * angle;
        const x = Math.round(centerX + (radius * Math.cos(angle)) - (wordWidth / 2));
        const y = Math.round(centerY + (.58 * radius * Math.sin(angle)) - (wordHeight / 2));
        const box = { x: x - 3, y: y - 2, width: wordWidth + 6, height: wordHeight + 4 };
        const inside = box.x >= 8 && box.y >= 8 && box.x + box.width <= width - 8 && box.y + box.height <= height - 8;
        const overlaps = placed.some((item) => !(box.x + box.width < item.x || item.x + item.width < box.x || box.y + box.height < item.y || item.y + item.height < box.y));
        if (inside && !overlaps) {
          result = { ...box, left: x, top: y, fontSize };
          placed.push(box);
          break;
        }
      }
      fontSize = Math.max(minFont, Math.floor(fontSize * .82));
    }
    if (result) entry.placement = result;
  });
  return entries.filter((entry) => entry.placement);
}

function renderThemeWordCloud(filter = "") {
  const target = document.getElementById("themeWordCloud");
  if (!target) return;
  const entries = themeWordCloudEntries(filter);
  const totalTerms = themeWordCloudEntries().length;
  const query = filter.trim();
  document.getElementById("themeWordCloudStatus").textContent = query
    ? `${entries.length} of ${totalTerms} terms`
    : `${totalTerms} terms sized by frequency`;
  if (!entries.length) {
    target.innerHTML = `<div class="code-view-empty"><span>✦</span><strong>${totalTerms ? "No matching terms" : "No related code terms yet"}</strong><p>${totalTerms ? "Try another word." : "Terms from reviewed theme codes will appear here."}</p></div>`;
    return;
  }
  const width = Math.max(300, target.clientWidth || target.parentElement?.clientWidth || 900);
  const height = width < 600 ? 440 : 590;
  target.style.height = `${height}px`;
  const placedEntries = cloudWordPlacement(entries, width, height);
  target.innerHTML = placedEntries.map((entry, index) => {
    const title = `${entry.name} · ${entry.codeNames.size} code${entry.codeNames.size === 1 ? "" : "s"} · ${entry.themeIds.size} theme${entry.themeIds.size === 1 ? "" : "s"}`;
    const shade = Math.max(24, Math.min(68, 24 + (index / Math.max(placedEntries.length, 1)) * 44));
    return `<button class="theme-cloud-word" type="button" data-cloud-term="${escapeHTML(entry.name.toLowerCase())}" style="left:${entry.placement.left}px;top:${entry.placement.top}px;font-size:${entry.placement.fontSize}px;color:hsl(228 7% ${shade}%);font-weight:${index < 8 ? 620 : 450}" title="${escapeHTML(title)}" aria-label="${escapeHTML(title)}">${escapeHTML(entry.name)}</button>`;
  }).join("");
}

function setThemeVisualizationMode(mode) {
  themeVisualizationMode = mode === "cloud" ? "cloud" : "map";
  const showingCloud = themeVisualizationMode === "cloud";
  document.querySelector(".theme-constellation-shell")?.classList.toggle("hidden", showingCloud);
  document.getElementById("themeWordCloudShell")?.classList.toggle("hidden", !showingCloud);
  document.getElementById("showThemeMap")?.classList.toggle("active", !showingCloud);
  document.getElementById("showThemeWordCloud")?.classList.toggle("active", showingCloud);
  document.getElementById("showThemeMap")?.setAttribute("aria-pressed", String(!showingCloud));
  document.getElementById("showThemeWordCloud")?.setAttribute("aria-pressed", String(showingCloud));
  const search = document.getElementById("themeViewSearch");
  if (search) search.placeholder = showingCloud ? "Search code terms" : "Search theme names";
  const sizeHint = document.getElementById("themeViewSizeHint");
  if (sizeHint) sizeHint.innerHTML = showingCloud
    ? `<span class="code-view-size-key theme-size-key" aria-hidden="true"></span>Larger words recur across more reviewed codes and themes. Select a word to see those themes.`
    : `<span class="code-view-size-key" aria-hidden="true"></span>Position reflects thematic similarity; each compact card shows its code and transcript counts. Select <strong>+</strong> for details.`;
  if (showingCloud) renderThemeWordCloud(search?.value || "");
  else renderThemeVisualization(search?.value || "");
}

function themeViewKey(theme, index) {
  return String(theme?.id || `theme-${index}`);
}

function themeViewNodeMetrics(theme, maxTranscriptCount) {
  const weight = themeViewTranscriptIds(theme).length / Math.max(1, maxTranscriptCount);
  if (weight > .66) return { size: "large", width: 300, height: 82 };
  if (weight > .32) return { size: "medium", width: 270, height: 74 };
  return { size: "small", width: 238, height: 66 };
}

function fallbackThemeViewLayout() {
  const count = themeViewThemes.length;
  const positions = new Map();
  if (!count) return positions;
  themeViewThemes.forEach((theme, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
    const radius = count === 1 ? 0 : .34;
    positions.set(themeViewKey(theme, index), {
      x: .5 + Math.cos(angle) * radius,
      y: .5 + Math.sin(angle) * radius,
    });
  });
  return positions;
}

function resolveThemeViewCollisions(rawPositions) {
  const count = themeViewThemes.length;
  const maxTranscriptCount = Math.max(1, ...themeViewThemes.map((theme) => themeViewTranscriptIds(theme).length));
  const width = 1200;
  const height = Math.max(520, Math.min(900, 420 + Math.ceil(count / 7) * 90));
  const nodes = themeViewThemes.map((theme, index) => {
    const metrics = themeViewNodeMetrics(theme, maxTranscriptCount);
    const raw = rawPositions.get(themeViewKey(theme, index)) || { x: .5, y: .5 };
    return {
      key: themeViewKey(theme, index),
      x: raw.x * width,
      y: raw.y * height,
      anchorX: raw.x * width,
      anchorY: raw.y * height,
      ...metrics,
    };
  });
  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        if (Math.abs(dx) < .01 && Math.abs(dy) < .01) {
          dx = ((rightIndex % 2) ? 1 : -1) * .5;
          dy = ((leftIndex % 2) ? 1 : -1) * .5;
        }
        const overlapX = ((left.width + right.width) / 2 + 18) - Math.abs(dx);
        const overlapY = ((left.height + right.height) / 2 + 18) - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapX / Math.max(1, left.width + right.width) < overlapY / Math.max(1, left.height + right.height)) {
          const push = overlapX / 2;
          const direction = dx >= 0 ? 1 : -1;
          left.x -= push * direction;
          right.x += push * direction;
        } else {
          const push = overlapY / 2;
          const direction = dy >= 0 ? 1 : -1;
          left.y -= push * direction;
          right.y += push * direction;
        }
      }
    }
    nodes.forEach((node) => {
      if (iteration < 60) {
        node.x += (node.anchorX - node.x) * .018;
        node.y += (node.anchorY - node.y) * .018;
      }
      node.x = Math.max(node.width / 2 + 24, Math.min(width - node.width / 2 - 24, node.x));
      node.y = Math.max(node.height / 2 + 24, Math.min(height - node.height / 2 - 24, node.y));
    });
  }
  themeViewCanvasHeight = height;
  return new Map(nodes.map((node) => [node.key, {
    x: (node.x / width) * 100,
    y: (node.y / height) * 100,
    width: node.width,
    size: node.size,
  }]));
}

async function requestThemeSemanticLayout() {
  if (!themeViewThemes.length) {
    themeViewPositions = new Map();
    return;
  }
  const items = themeViewThemes.map((theme, index) => ({
    id: themeViewKey(theme, index),
    title: theme.title || "Untitled theme",
    excerpts: [
      theme.rationale || "",
      ...themeViewCodeNames(theme).map((name) => `Related code: ${name}`),
    ].filter(Boolean),
  }));
  try {
    const result = await apiFetch("/api/semantic-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const rawPositions = new Map((result.positions || []).map((position) => [
      String(position.id),
      { x: Number(position.x), y: Number(position.y) },
    ]));
    themeViewLayoutMethod = result.method || "semantic-pca";
    themeViewPositions = resolveThemeViewCollisions(rawPositions);
  } catch (error) {
    themeViewLayoutMethod = "radial fallback";
    themeViewPositions = resolveThemeViewCollisions(fallbackThemeViewLayout());
    toast("Semantic theme positioning was unavailable; a stable fallback layout is shown.");
  }
}

function renderThemeVisualization(filter = "") {
  const target = document.getElementById("themeConstellation");
  if (!target) return;
  const query = filter.trim().toLowerCase();
  const visible = themeViewThemes.map((theme, index) => ({ theme, index }))
    .filter(({ theme }) => String(theme.title || "").toLowerCase().includes(query));
  const allCodeNames = new Set(themeViewThemes.flatMap(themeViewCodeNames));
  document.getElementById("themeViewThemeCount").textContent = themeViewThemes.length.toLocaleString();
  document.getElementById("themeViewCodeCount").textContent = allCodeNames.size.toLocaleString();
  const methodLabel = themeViewLayoutMethod.includes("semantic") ? "semantic PCA" : themeViewLayoutMethod;
  document.getElementById("themeViewVisibleStatus").textContent = `${query ? `${visible.length} of ${themeViewThemes.length} themes` : `Showing all ${themeViewThemes.length} themes`} · ${methodLabel}`;
  if (!visible.length) {
    const hasThemes = themeViewThemes.length > 0;
    target.classList.remove("semantic-layout");
    target.style.removeProperty("--semantic-height");
    target.innerHTML = `<div class="code-view-empty"><span>✦</span><strong>${hasThemes ? "No matching themes" : "No reviewed themes yet"}</strong><p>${hasThemes ? "Try another theme name." : "Open detailed themes to generate and review the project themes."}</p></div>`;
    return;
  }
  target.classList.add("semantic-layout");
  target.style.setProperty("--semantic-height", `${themeViewCanvasHeight}px`);
  const maxTranscriptCount = Math.max(1, ...themeViewThemes.map((theme) => themeViewTranscriptIds(theme).length));
  target.innerHTML = visible.map(({ theme, index }) => {
    const codeNames = themeViewCodeNames(theme);
    const transcriptCount = themeViewTranscriptIds(theme).length;
    const key = themeViewKey(theme, index);
    const position = themeViewPositions.get(key) || { x: 50, y: 50, ...themeViewNodeMetrics(theme, maxTranscriptCount) };
    const detailId = `theme-view-detail-${index}`;
    return `
      <article class="code-node theme-node semantic-positioned ${position.y > 64 ? "detail-up" : ""} ${position.size} ${themeViewSourceClass(theme)}" data-theme-view-node style="left:${position.x}%;top:${position.y}%;--node-width:${position.width}px">
        <div class="code-node-core"><span class="code-node-orbit" aria-hidden="true"></span><span class="theme-node-card-copy"><strong>${escapeHTML(theme.title || "Untitled theme")}</strong><small>${codeNames.length} code${codeNames.length === 1 ? "" : "s"} · ${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"}</small></span><button type="button" data-theme-view-expand aria-expanded="false" aria-controls="${detailId}" aria-label="Show details for ${escapeHTML(theme.title || "this theme")}">+</button></div>
        <div class="code-node-detail theme-node-detail hidden" id="${detailId}">
          <div class="code-node-detail-heading"><strong>Theme details</strong><span class="theme-transcript-count" title="${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"}">${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"}</span></div>
          <p class="theme-view-definition">${escapeHTML(theme.rationale || "No theme description is saved.")}</p>
          <strong class="theme-view-codes-label">Related codes</strong>
          <div class="theme-view-code-list">${codeNames.length ? codeNames.map((name) => `<span>${escapeHTML(name)}</span>`).join("") : "<em>No related codes are saved.</em>"}</div>
        </div>
      </article>`;
  }).join("");
}

async function openThemeVisualization() {
  if (!currentProject) return;
  let themeAnalysisPayload;
  try {
    themeAnalysisPayload = await apiFetch(`/api/projects/${currentProject.id}/theme-analysis`);
  } catch (error) {
    toast(error.message || "Could not load this theme view.");
    return;
  }
  projectThemeAnalysis = themeAnalysisPayload;
  updateManagerActions();
  if (!themeSnapshotHasGeneratedThemes(themeAnalysisPayload.snapshot)) {
    toast("Generate project themes before opening Theme View.");
    return;
  }
  document.getElementById("themeViewProjectName").textContent = `${currentProject.name} · A semantic map of the reviewed thematic landscape`;
  document.getElementById("themeViewSearch").value = "";
  themeVisualizationMode = "map";
  themeViewThemes = [];
  themeViewPositions = new Map();
  themeViewLayoutMethod = "mapping";
  showView("themeVisualization");
  document.getElementById("themeConstellation").innerHTML = `<div class="code-view-empty loading"><span>✦</span><strong>Embedding and mapping themes…</strong><p>Theme names, definitions, and related codes are being projected into semantic space.</p></div>`;
  try {
    themeViewThemes = finalReviewedThemes(themeAnalysisPayload.snapshot?.themes);
    await requestThemeSemanticLayout();
    renderThemeVisualization();
    renderThemeWordCloud();
    setThemeVisualizationMode("map");
  } catch (error) {
    document.getElementById("themeConstellation").innerHTML = `<div class="code-view-empty"><strong>Could not load this theme view</strong><p>${escapeHTML(error.message || "Please try again.")}</p></div>`;
  }
}

async function projectThemeCodeInputs(snapshot) {
  const selectedIds = new Set((snapshot?.selectedTranscriptIds || []).map(String));
  const selectedFiles = projectFiles.filter((file) => selectedIds.has(String(file.id)));
  const analysisPayloads = await Promise.all(
    selectedFiles.map((file) => apiFetch(`/api/projects/${currentProject.id}/transcripts/${file.id}/analysis`))
  );
  return selectedFiles.map((file, index) => {
    const analysisSnapshot = analysisPayloads[index].snapshot || {};
    const reviewedCodes = (analysisSnapshot.codes || []).filter(isFinalAiCodingResult);
    return {
      name: `${file.name.replace(/\.docx$/i, "")}_ReflexCoTI.json`,
      payload: {
        research_question: currentProject.research_question,
        interviewee: currentProject.interviewee,
        transcript: { file_name: file.name },
        codes: reviewedCodes.map(simpleCodeRecord),
      },
    };
  }).flatMap((entry) => extractThemeCodesFromExport(entry.payload, entry.name));
}

async function openProjectCodebookExplorer() {
  if (!currentProject) return;
  try {
    const [themeAnalysisPayload, maintainedCodebook] = await Promise.all([
      apiFetch(`/api/projects/${currentProject.id}/theme-analysis`),
      apiFetch(`/api/projects/${currentProject.id}/codebook`),
    ]);
    projectThemeAnalysis = themeAnalysisPayload;
    projectCodebook = maintainedCodebook;
    updateManagerActions();
    if (maintainedCodebook?.processing) {
      showCodebookProcessingModal(openProjectCodebookExplorer);
      return;
    }
    if (!maintainedCodebook?.available || !maintainedCodebook.codebook) {
      toast("Finish transcript coding before opening Codebook View.");
      return;
    }
    const snapshot = themeAnalysisPayload.snapshot;
    if (snapshot?.latestCodebook && snapshot?.codebookReviewFinished) {
      selectedThemeTranscriptIds = snapshot.selectedTranscriptIds || [];
      themeCodeInputs = await projectThemeCodeInputs(snapshot);
      themeJsonFiles = [];
      restoreThemeSnapshot(snapshot);
    } else {
      latestCodebook = maintainedCodebook.codebook;
      latestCodebookId = maintainedCodebook.codebook_id;
      selectedThemeTranscriptIds = Object.keys(maintainedCodebook.included_revisions || {});
      themeJsonFiles = [];
      themeCodeInputs = (latestCodebook.entries || []).flatMap((entry) =>
        (entry.source_refs || []).flatMap((ref) => (ref.excerpts || []).map((quote) => ({
          codeName: ref.source_code_name || entry["initial code"] || "",
          codeId: ref.source_code_id || "",
          source: "Codebook",
          quote,
          transcript: ref.transcript_label || ref.transcript_id || "",
          transcriptId: ref.transcript_id || "",
        })))
      );
    }
    selectedCodebookEntryIndex = null;
    codebookGrowthOpen = false;
    highlightedCodebookCodeNames = [];
    openCodebookExplorer(document.getElementById("openCodebookViewBtn"));
  } catch (error) {
    toast(error.message || "Could not load this codebook view.");
  }
}

function openDeleteTranscriptModal(transcriptId) {
  pendingDeleteTranscript = projectFiles.find((item) => item.id === transcriptId) || null;
  if (!pendingDeleteTranscript) return;
  const codeCount = Number(pendingDeleteTranscript.codes_count || 0);
  const excerptCount = Number(pendingDeleteTranscript.excerpts_count || 0);
  document.getElementById("deleteTranscriptSummary").innerHTML = `
    <strong>${escapeHTML(pendingDeleteTranscript.name)}</strong>
    Its source file, ${codeCount} code${codeCount === 1 ? "" : "s"}, and ${excerptCount} excerpt${excerptCount === 1 ? "" : "s"} will be permanently removed.`;
  document.getElementById("deleteTranscriptModal")?.classList.remove("hidden");
  document.getElementById("cancelDeleteTranscript")?.focus();
}

function closeDeleteTranscriptModal() {
  document.getElementById("deleteTranscriptModal")?.classList.add("hidden");
  pendingDeleteTranscript = null;
}

function openClearTranscriptModal(transcriptId) {
  pendingClearTranscript = projectFiles.find((item) => item.id === transcriptId) || null;
  if (!pendingClearTranscript) return;
  const codeCount = Number(pendingClearTranscript.codes_count || 0);
  const excerptCount = Number(pendingClearTranscript.excerpts_count || 0);
  document.getElementById("clearTranscriptSummary").innerHTML = `
    <strong>${escapeHTML(pendingClearTranscript.name)}</strong>
    ${codeCount} code${codeCount === 1 ? "" : "s"} and ${excerptCount} excerpt${excerptCount === 1 ? "" : "s"} will be permanently removed. Any previously generated project themes will also be cleared.`;
  document.getElementById("clearTranscriptModal")?.classList.remove("hidden");
  document.getElementById("cancelClearTranscript")?.focus();
}

function closeClearTranscriptModal() {
  document.getElementById("clearTranscriptModal")?.classList.add("hidden");
  pendingClearTranscript = null;
}

async function clearPendingTranscript() {
  if (!pendingClearTranscript || !currentProject) return;
  const transcriptToClear = pendingClearTranscript;
  const projectId = currentProject.id;
  const button = document.getElementById("confirmClearTranscript");
  button.disabled = true;
  button.textContent = "Clearing…";
  try {
    const backgroundJob = backgroundAiJobs.get(String(transcriptToClear.id));
    if (backgroundJob) backgroundJob.jobId = null;
    backgroundAiJobs.delete(String(transcriptToClear.id));
    await flushPendingAutosave();
    const result = await apiFetch(`/api/projects/${projectId}/transcripts/${transcriptToClear.id}/analysis`, { method: "DELETE" });
    if (activeTranscriptFile?.id === transcriptToClear.id) {
      clearTranscriptWorkspace();
      activeTranscriptFile = null;
    }
    invalidateThemesForTranscriptChange();
    closeClearTranscriptModal();
    await openProject(projectId);
    const themeMessage = result.themes_cleared ? " Previous project themes were cleared too." : "";
    toast(`Codes for “${transcriptToClear.name}” were cleared.${themeMessage}`);
  } catch (error) {
    toast(error.message || "Could not clear the transcript codes.");
  } finally {
    button.disabled = false;
    button.textContent = "Clear codes";
  }
}

async function deletePendingTranscript() {
  if (!pendingDeleteTranscript || !currentProject) return;
  const transcriptToDelete = pendingDeleteTranscript;
  const projectId = currentProject.id;
  const button = document.getElementById("confirmDeleteTranscript");
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const backgroundJob = backgroundAiJobs.get(String(transcriptToDelete.id));
    if (backgroundJob) backgroundJob.jobId = null;
    backgroundAiJobs.delete(String(transcriptToDelete.id));
    await flushPendingAutosave();
    const result = await apiFetch(`/api/projects/${projectId}/transcripts/${transcriptToDelete.id}`, { method: "DELETE" });
    if (activeTranscriptFile?.id === transcriptToDelete.id) activeTranscriptFile = null;
    invalidateThemesForTranscriptChange();
    closeDeleteTranscriptModal();
    await openProject(projectId);
    toast(result.warning || `“${transcriptToDelete.name}” was deleted.`);
  } catch (error) {
    toast(error.message || "Could not delete the transcript.");
  } finally {
    button.disabled = false;
    button.textContent = "Delete transcript";
  }
}

function renderWorkspaceProjectControls() {
  document.getElementById("workspaceProjectName").textContent = currentProject?.name || "Untitled project";
  const activeName = document.getElementById("activeTranscriptName");
  if (activeName) activeName.textContent = activeTranscriptFile?.name || "No transcript selected";
  const selector = document.getElementById("activeTranscriptSelect");
  if (!selector) return;
  selector.innerHTML = projectFiles.map((file) =>
    `<option value="${escapeHTML(file.id)}">${escapeHTML(file.name)}</option>`
  ).join("");
  selector.value = activeTranscriptFile?.id || "";
}

function restoreTranscriptSnapshot(snapshot) {
  if (!snapshot) return false;
  restoringSnapshot = true;
  resetCodeMergeSuggestions();
  const snapshotCodes = Array.isArray(snapshot.codes) ? snapshot.codes : [];
  const calibrationOnlyAiSnapshot = Boolean(snapshot.analysisReady)
    && snapshotCodes.some(isCalibrationCode)
    && !snapshotCodes.some((code) => code.sourceClass !== "human" && !isCalibrationCode(code));
  const snapshotExcerpts = Array.isArray(snapshot.identifiedExcerpts) ? snapshot.identifiedExcerpts : [];
  analysisReady = Boolean(snapshot.analysisReady) && !calibrationOnlyAiSnapshot;
  identifiedExcerpts = calibrationOnlyAiSnapshot
    ? snapshotExcerpts.filter((excerpt) => !isCalibrationCode(excerpt))
    : snapshotExcerpts;
  codes = calibrationOnlyAiSnapshot
    ? snapshotCodes.filter((code) => !isCalibrationCode(code))
    : snapshotCodes;
  resetUnincorporatedManualCodesForAiCoding(snapshot);
  initialAgentReflections = snapshot.initialAgentReflections || {};
  originalAiCodes = calibrationOnlyAiSnapshot ? [] : (snapshot.originalAiCodes || []);
  agentReflections = snapshot.agentReflections || {};
  const legacyUntouchedAiItems = codes.filter((code) => (
    code.sourceClass !== "human"
    && !isCalibrationCode(code)
    && !codeReviewIsDecided(code)
  ));
  const migrateToMatchReview = Number(snapshot.version || 0) < 5
    && Boolean(snapshot.analysisReady)
    && codes.some(isPreAiManualHumanCode)
    && legacyUntouchedAiItems.length > 0
    && legacyUntouchedAiItems.length === codes.filter((code) => code.sourceClass !== "human" && !isCalibrationCode(code)).length;
  if (migrateToMatchReview) initializeHumanAiCodeMatches();
  const aiItems = codes.filter((code) => code.sourceClass !== "human");
  const hasUnreviewedAi = aiItems.some((code) => !["accepted", "revised", "split", "merged", "rejected"].includes(code.reviewStatus));
  const hasUnresolvedHumanAiMatches = unresolvedHumanAiCodeMatches().length > 0;
  codeReviewStage = hasUnresolvedHumanAiMatches
    ? "match-review"
    : hasUnreviewedAi
      ? "review"
    : (snapshot.codeReviewStage || (aiItems.length ? "merge-choice" : "review"));
  const legacyPrematureCompletion = Number(snapshot.version || 0) < 3
    && codeReviewStage === "complete"
    && !snapshot.manualCodeReuseFinished
    && Number(snapshot.lastExportedCodingRevision || 0) <= 0;
  if (legacyPrematureCompletion) codeReviewStage = "human-choice";
  if (codeReviewStage === "human-choice") codeReviewStage = codeStageAfterMerge();
  if (codeReviewStage === "human") {
    codeReviewStage = snapshot.manualCodeReuseFinished ? "additional" : codeStageAfterMerge();
  }
  codeAmendmentReturnStage = snapshot.codeAmendmentReturnStage || "";
  codingRevision = Math.max(1, Number(snapshot.codingRevision || 1));
  lastExportedCodingRevision = snapshot.lastExportedCodingRevision == null
    ? (snapshot.codeReviewStage === "complete" ? codingRevision : 0)
    : Math.max(0, Number(snapshot.lastExportedCodingRevision || 0));
  lastFinishedCodingRevision = Math.max(0, Number(
    snapshot.lastFinishedCodingRevision ?? snapshot.lastExportedCodingRevision ?? (snapshot.codeReviewStage === "complete" ? codingRevision : 0)
  ));
  codingFinishedWhenOpened = codeReviewStage === "complete"
    && lastFinishedCodingRevision >= codingRevision;
  codingQuestionnaireResponses = Array.isArray(snapshot.codingQuestionnaireResponses) ? snapshot.codingQuestionnaireResponses : [];
  codingExportedAt = String(snapshot.codingExportedAt || "");
  seniorCodeReview = snapshot.seniorCodeReview || null;
  manualCodeReuseFinished = Boolean(snapshot.manualCodeReuseFinished);
  humanCodingFinished = Boolean(snapshot.humanCodingFinished);
  humanCodingFinishedWhenOpened = humanCodingFinished;
  aiCodingStarted = Boolean(snapshot.aiCodingStarted) && !calibrationOnlyAiSnapshot;
  const transcriptId = String(activeTranscriptFile?.id || "");
  if (transcriptId && snapshot.backgroundAiJobId && !analysisReady && !calibrationOnlyAiSnapshot) {
    backgroundAiJobs.set(transcriptId, {
      jobId: snapshot.backgroundAiJobId,
      status: snapshot.backgroundAiJobStatus || "queued",
      message: "Reconnecting to background AI coding...",
      result: null,
      error: "",
      polling: false,
    });
  }
  resetWorkflowTiming(snapshot.workflowTiming || {});
  const elapsed = Math.min(Number(snapshot.readingElapsedMs || 0), READING_TRACKING_CAP_MS);
  readingElapsedMs = elapsed;
  transcriptReachedEnd = Boolean(snapshot.transcriptReachedEnd || snapshot.analysisReady);
  transcriptDisplayedAt = new Date();
  readingLastTickAt = Date.now();
  restoringSnapshot = false;
  return calibrationOnlyAiSnapshot;
}

async function loadProjectTranscript(file, { startAi = codingWorkspaceMode === "ai" } = {}) {
  if (!file) return;
  if (activeTranscriptFile?.id && activeTranscriptFile.id !== file.id) await flushPendingAutosave();
  activeTranscriptFile = file;
  clearTranscriptWorkspace();
  renderWorkspaceProjectControls();
  const label = document.getElementById("uploadedTranscriptName");
  const selector = document.getElementById("activeTranscriptSelect");
  if (selector) selector.disabled = true;
  try {
    label.textContent = `Reading and preparing transcript: ${file.name}`;
    const transcriptBase = piReadOnlyMode
      ? `/api/pi/students/${piReadOnlyContext.student.id}/projects/${currentProject.id}/transcripts/${file.id}`
      : `/api/projects/${currentProject.id}/transcripts/${file.id}`;
    const [docxPayload, analysisPayload] = await Promise.all([
      apiFetch(`${transcriptBase}/content`),
      apiFetch(`${transcriptBase}/analysis`),
    ]);
    const text = docxPayload.text || "";
    if (!text.trim()) throw new Error("No readable text found in this .docx file.");
    transcript = transcriptRowsFromText(text);
    const retryIncompleteAiCoding = restoreTranscriptSnapshot(analysisPayload.snapshot);
    setSeniorCodeEditMode(Boolean(piReadOnlyMode && analysisPayload.can_modify_codes));
    if (startAi) {
      if (!analysisPayload.snapshot) startReadingGate(); else startReadingGate(true);
    } else {
      if (readingGateTimer) window.clearInterval(readingGateTimer);
      readingGateTimer = null;
    }
    startWorkflowTimingSession();
    const wordCount = Number(docxPayload.word_count || 0).toLocaleString();
    const chunkCount = Number(docxPayload.chunk_count || 1);
    label.textContent = docxPayload.needs_chunking
      ? `Loaded: ${file.name}. ${wordCount} words, prepared as ${chunkCount} chunks.`
      : `Loaded: ${file.name}. ${wordCount} words.`;
    renderTranscript();
    renderCodes();
    renderThemes();
    lastSavedAt = analysisPayload.updated_at ? new Date(analysisPayload.updated_at * 1000) : null;
    renderLastSaved();
    if (startAi) ensureBackgroundAiCoding(file);
    toast(retryIncompleteAiCoding
      ? "Previous AI coding was incomplete. AI coding restarted."
      : (analysisPayload.snapshot ? "Saved transcript analysis restored." : "Project transcript loaded."));
  } catch (error) {
    transcript = [];
    resetAnalysis();
    resetReadingGate();
    label.textContent = error.message || "Could not read this .docx transcript.";
    renderTranscript();
    renderCodes();
    renderThemes();
    toast(error.message || "Could not read this .docx transcript.");
  } finally {
    if (selector) selector.disabled = false;
  }
}

async function openCodesForTranscript(file) {
  if (!file) return;
  setCodingWorkspaceMode("ai");
  if (activeTranscriptFile?.id && activeTranscriptFile.id !== file.id) await flushPendingAutosave();
  if (piReadOnlyMode) {
    setSeniorThemeEditMode(false);
    setSeniorCodeEditMode(false);
  }
  selectedThemeTranscriptIds = [];
  activeTranscriptFile = file;
  updateWorkspaceNavAccess(piReadOnlyMode ? "both" : "codes");
  setWorkspacePage("codes");
  renderWorkspaceProjectControls();
  showView("workspace");
  await loadProjectTranscript(file, { startAi: true });
}

async function openHumanCodesForTranscript(file) {
  if (!file || piReadOnlyMode) return;
  if (activeTranscriptFile?.id && activeTranscriptFile.id !== file.id) await flushPendingAutosave();
  selectedThemeTranscriptIds = [];
  activeTranscriptFile = file;
  setCodingWorkspaceMode("human");
  updateWorkspaceNavAccess("codes");
  setWorkspacePage("codes");
  renderWorkspaceProjectControls();
  showView("workspace");
  await loadProjectTranscript(file, { startAi: false });
}

function renderCodebookReturnBar() {
  const bar = document.getElementById("codebookReturnBar");
  if (!bar) return;
  const visible = Boolean(codebookSourceEditReturn && currentWorkspacePage === "codes");
  bar.classList.toggle("hidden", !visible);
  if (!visible) return;
  const detail = document.getElementById("codebookReturnDetail");
  if (detail) detail.textContent = `Editing a source of “${codebookSourceEditReturn.entryName}”. Return anytime to synchronize code and excerpt changes into the existing codebook.`;
}

function closeSourceCodeEditConfirmation({ restoreFocus = true } = {}) {
  const trigger = pendingCodebookSourceEdit?.trigger;
  pendingCodebookSourceEdit = null;
  document.getElementById("sourceCodeEditConfirmModal")?.classList.add("hidden");
  if (restoreFocus) trigger?.focus();
}

function openSourceCodeEditConfirmation(entryIndex, refIndex, entry, ref, file) {
  pendingCodebookSourceEdit = { entryIndex, refIndex, trigger: document.activeElement };
  const description = document.getElementById("sourceCodeEditConfirmDescription");
  if (description) {
    const sourceName = ref.source_code_name || codebookEntryName(entry);
    description.textContent = `“${sourceName}” will open in ${file.name}, where you can review it in the full transcript context.`;
  }
  document.getElementById("sourceCodeEditConfirmModal")?.classList.remove("hidden");
  document.getElementById("cancelSourceCodeEdit")?.focus();
}

function currentTranscriptCodeDescriptors(sourceCodes) {
  return (sourceCodes || [])
    .filter(isFinalAiCodingResult)
    .map((code) => ({
      id: String(code.id || ""),
      title: String(code.title || "").trim(),
      source: String(code.source || (code.sourceClass === "human" ? "Human" : "AI+Human")),
      excerpts: codeExcerptList(code),
      predecessorIds: [...new Set([
        String(code.id || ""),
        ...(code.splitFromCodeId ? [String(code.splitFromCodeId)] : []),
        ...((code.sourceCodeIds || []).map(String)),
        ...((code.seniorSourceCodeIds || []).map(String)),
      ].filter(Boolean))],
    }))
    .filter((code) => code.id && code.title && code.excerpts.length);
}

function restorePreservedCodebookContext(context) {
  restoreThemeSnapshot(codebookClone(context.themeSnapshot));
  selectedThemeTranscriptIds = [...(context.selectedTranscriptIds || [])];
  selectedThemeCodingRevisions = { ...(context.codingRevisions || {}) };
  themeCodeInputs = codebookClone(context.themeCodeInputs || []);
  themeJsonFiles = [...(context.themeJsonFiles || [])];
  themeTranscriptDocuments = codebookClone(context.themeTranscriptDocuments || []);
  codebookUndoStack = codebookClone(context.codebookUiState?.undoStack || []);
  codebookModificationMode = Boolean(context.codebookUiState?.modificationMode && !codebookReviewFinished && !themeGenerationStarted);
  selectedCodebookEntryIndex = context.codebookUiState?.selectedIndex ?? null;
  codebookHistoryOpen = Boolean(context.codebookUiState?.historyOpen);
}

function synchronizeCodebookFromTranscript(context, sourceCodes, currentRevision) {
  const transcriptId = String(context.sourceTranscriptId || "");
  const transcriptLabel = String(context.sourceTranscriptName || transcriptId);
  const entries = latestCodebook?.entries || [];
  const before = JSON.stringify(entries);
  const descriptors = currentTranscriptCodeDescriptors(sourceCodes);
  const successors = new Map();
  descriptors.forEach((descriptor) => {
    descriptor.predecessorIds.forEach((predecessorId) => {
      const items = successors.get(predecessorId) || [];
      if (!items.some((item) => item.id === descriptor.id)) items.push(descriptor);
      successors.set(predecessorId, items);
    });
  });

  const occurrences = new Map();
  entries.forEach((entry, entryIndex) => {
    codebookSourceRefs(entry).forEach((ref, refIndex) => {
      if (String(ref.transcript_id || "") !== transcriptId) return;
      const sourceId = String(ref.source_code_id || "");
      const items = occurrences.get(sourceId) || [];
      items.push({ entryIndex, refIndex, ref });
      occurrences.set(sourceId, items);
    });
  });

  const ownerForNewExcerpt = (sourceId, excerpt) => {
    const items = occurrences.get(sourceId) || [];
    if (items.length <= 1) return items[0] || null;
    return items.reduce((best, item) => {
      const score = Math.max(0, ...(item.ref.excerpts || []).map((oldExcerpt) => tokenSimilarity(excerpt, oldExcerpt)));
      return !best || score > best.score ? { ...item, score } : best;
    }, null);
  };

  entries.forEach((entry, entryIndex) => {
    const originalRefs = codebookSourceRefs(entry).map((ref) => codebookClone(ref));
    const originalEntryName = codebookEntryName(entry);
    const updatedRefs = [];
    originalRefs.forEach((ref, refIndex) => {
      if (String(ref.transcript_id || "") !== transcriptId) {
        updatedRefs.push(ref);
        return;
      }
      const sourceId = String(ref.source_code_id || "");
      const candidates = successors.get(sourceId) || [];
      const oldExcerptKeys = new Set((ref.excerpts || []).map(codebookExcerptKey));
      const allOldExcerptKeys = new Set((occurrences.get(sourceId) || []).flatMap((item) => item.ref.excerpts || []).map(codebookExcerptKey));
      candidates.forEach((candidate) => {
        let assigned = candidate.excerpts.filter((excerpt) => oldExcerptKeys.has(codebookExcerptKey(excerpt)));
        if (candidate.id === sourceId) {
          const newExcerpts = candidate.excerpts.filter((excerpt) => !allOldExcerptKeys.has(codebookExcerptKey(excerpt)));
          const ownedNewExcerpts = newExcerpts.filter((excerpt) => {
            const owner = ownerForNewExcerpt(sourceId, excerpt);
            return owner && owner.entryIndex === entryIndex && owner.refIndex === refIndex;
          });
          assigned = [...new Set([...assigned, ...ownedNewExcerpts])];
        }
        if (!assigned.length) return;
        updatedRefs.push({
          transcript_id: transcriptId,
          transcript_label: transcriptLabel,
          source_code_id: candidate.id,
          source_code_name: candidate.title,
          excerpts: assigned,
        });
      });
    });

    const groupedRefs = new Map();
    updatedRefs.forEach((ref) => {
      const key = `${ref.transcript_id || ""}|${ref.source_code_id || ""}|${ref.source_code_name || ""}`;
      const existing = groupedRefs.get(key) || { ...ref, excerpts: [] };
      existing.excerpts = [...new Set([...(existing.excerpts || []), ...(ref.excerpts || [])])];
      groupedRefs.set(key, existing);
    });
    entry.source_refs = [...groupedRefs.values()];
    entry.clues = [...new Set(entry.source_refs.flatMap((ref) => ref.excerpts || []))];
    entry.transcript_ids = [...new Set(entry.source_refs.map((ref) => String(ref.transcript_id || "")).filter(Boolean))];

    const originalTranscriptRefs = originalRefs.filter((ref) => String(ref.transcript_id || "") === transcriptId);
    const updatedTranscriptRefs = entry.source_refs.filter((ref) => String(ref.transcript_id || "") === transcriptId);
    if (
      originalRefs.length === 1
      && originalTranscriptRefs.length === 1
      && updatedTranscriptRefs.length === 1
      && normalizedCodeKey(originalEntryName) === normalizedCodeKey(originalTranscriptRefs[0].source_code_name)
    ) {
      entry["initial code"] = updatedTranscriptRefs[0].source_code_name;
    }
  });

  latestCodebook.entries = entries.filter((entry) => (entry.clues || []).length && (entry.source_refs || []).length);
  const representedIds = new Set(latestCodebook.entries.flatMap((entry) => (
    (entry.source_refs || [])
      .filter((ref) => String(ref.transcript_id || "") === transcriptId)
      .map((ref) => String(ref.source_code_id || ""))
  )));
  descriptors.forEach((descriptor) => {
    if (representedIds.has(descriptor.id)) return;
    latestCodebook.entries.push({
      "initial code": descriptor.title,
      clues: [...descriptor.excerpts],
      transcript_ids: [transcriptId],
      source_refs: [{
        transcript_id: transcriptId,
        transcript_label: transcriptLabel,
        source_code_id: descriptor.id,
        source_code_name: descriptor.title,
        excerpts: [...descriptor.excerpts],
      }],
    });
  });

  themeCodeInputs = [
    ...themeCodeInputs.filter((input) => String(input.transcriptId || input.transcript || "") !== transcriptId),
    ...descriptors.flatMap((descriptor) => descriptor.excerpts.map((quote) => ({
      codeName: descriptor.title,
      codeId: descriptor.id,
      source: descriptor.source,
      quote,
      transcript: transcriptLabel,
      transcriptId,
    }))),
  ];
  selectedThemeCodingRevisions[transcriptId] = Math.max(1, Number(currentRevision || 1));
  const changed = before !== JSON.stringify(latestCodebook.entries);
  if (changed) {
    codebookChangeHistory = [...codebookChangeHistory, {
      description: `Synchronized code and excerpt changes from “${transcriptLabel}”.`,
      at: new Date().toISOString(),
    }];
  }
  return changed;
}

async function openCodebookSourceCode(entryIndex, refIndex, { confirmed = false } = {}) {
  const entry = latestCodebook?.entries?.[entryIndex];
  const ref = codebookSourceRefs(entry)[refIndex];
  const file = projectFileForCodebookSource(ref);
  if (!entry || !ref || !file) return toast("The original project transcript could not be found.");
  const hasDownstreamWork = themeGenerationStarted || themes.length || preGenerationHumanThemes.length || humanThemesFinished;
  if (hasDownstreamWork && !confirmed) {
    openSourceCodeEditConfirmation(entryIndex, refIndex, entry, ref, file);
    return;
  }
  await flushPendingAutosave();
  codebookSourceEditReturn = {
    entryName: codebookEntryName(entry),
    sourceTranscriptId: String(file.id),
    sourceTranscriptName: file.name,
    selectedTranscriptIds: selectedThemeTranscriptIds.length ? [...selectedThemeTranscriptIds] : projectFiles.map((item) => item.id),
    codingRevisions: { ...selectedThemeCodingRevisions },
    themeSnapshot: codebookClone(themeAnalysisSnapshot()),
    themeCodeInputs: codebookClone(themeCodeInputs),
    themeJsonFiles: [...themeJsonFiles],
    themeTranscriptDocuments: codebookClone(themeTranscriptDocuments),
    codebookUiState: {
      undoStack: codebookClone(codebookUndoStack),
      modificationMode: codebookModificationMode,
      selectedIndex: selectedCodebookEntryIndex,
      historyOpen: codebookHistoryOpen,
    },
  };
  await openCodesForTranscript(file);
  const sourceCodeId = String(ref.source_code_id || "");
  const sourceName = normalizedCodeKey(ref.source_code_name || "");
  const sourceExcerptKeys = new Set((ref.excerpts || []).map(codebookExcerptKey));
  const target = codes.find((code) => sourceCodeId && String(code.id) === sourceCodeId)
    || codes.find((code) => normalizedCodeKey(code.title) === sourceName && codeExcerptList(code).some((excerpt) => sourceExcerptKeys.has(codebookExcerptKey(excerpt))))
    || codes.find((code) => normalizedCodeKey(code.title) === sourceName);
  if (target) setExpandedCode(target.id, { scrollTranscript: true, scrollDetails: true });
  renderCodebookReturnBar();
  toast(target ? "Source code opened in its original transcript." : "Transcript opened. Find and modify the source code, then return to the codebook.");
}

async function returnToCodebook() {
  const context = codebookSourceEditReturn;
  if (!context || !currentProject) return;
  const button = document.getElementById("returnToCodebookBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Syncing changes…";
  }
  try {
    await flushPendingAutosave();
    const currentSourceCodes = codebookClone(codes);
    const currentRevision = codingRevision;
    restorePreservedCodebookContext(context);
    const changed = synchronizeCodebookFromTranscript(context, currentSourceCodes, currentRevision);
    codebookSourceEditReturn = null;
    activeTranscriptFile = projectFiles.find((file) => String(file.id) === String(context.sourceTranscriptId)) || activeTranscriptFile;
    updateWorkspaceNavAccess("both");
    setWorkspacePage("themes");
    renderWorkspaceProjectControls();
    showView("workspace");
    renderThemes();
    updateThemeWorkflowButtons();
    markSaved();
    toast(changed
      ? `Codebook updated from ${context.sourceTranscriptName}. Existing merges and splits were preserved.`
      : "Returned to the codebook. No source-code changes were detected.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Return to codebook";
    }
  }
}

function restoreThemeSnapshot(snapshot) {
  if (!snapshot) return;
  restoringSnapshot = true;
  latestCodebook = snapshot.latestCodebook || null;
  latestCodebookId = snapshot.latestCodebookId || null;
  const savedHumanThemes = (snapshot.preGenerationHumanThemes || []).map((theme) => ({
    ...theme,
    source: "Human",
    sourceClass: "human",
    reviewStatus: "accepted",
    createdBeforeAiGeneration: true,
  }));
  const savedHumanIds = new Set(savedHumanThemes.map((theme) => String(theme.id || "")).filter(Boolean));
  themes = (snapshot.themes || []).filter((theme) => !savedHumanIds.has(String(theme.id || "")));
  originalAiThemes = snapshot.originalAiThemes || [];
  preGenerationHumanThemes = savedHumanThemes;
  humanThemesFinished = Boolean(snapshot.humanThemesFinished);
  manualThemeReuseFinished = Boolean(snapshot.manualThemeReuseFinished);
  themeGenerationStarted = Boolean(snapshot.themeGenerationStarted);
  codebookDeletionSuggestionChoice = ["yes", "no"].includes(snapshot.codebookDeletionSuggestionChoice)
    ? snapshot.codebookDeletionSuggestionChoice
    : ((latestCodebook?.entries || []).some((entry) => (
      typeof entry?.ai_relevance_related === "boolean" || typeof entry?.ai_suggested_delete === "boolean"
    )) ? "yes" : (latestCodebook ? "no" : ""));
  codebookResearchQuestion = String(
    snapshot.codebookResearchQuestion
    || currentProject?.research_question
    || document.getElementById("researchQuestion")?.value
    || ""
  ).trim();
  codebookReviewFinished = Boolean(
    snapshot.codebookReviewFinished || humanThemesFinished || themeGenerationStarted || savedHumanThemes.length
  );
  const restoredThemeMode = snapshot.themeWorkspaceMode || (themeGenerationStarted ? "ai" : "codebook");
  themeWorkspaceMode = piReadOnlyMode
    ? "ai"
    : (["codebook", "human", "ai"].includes(restoredThemeMode) && (restoredThemeMode === "codebook" || codebookReviewFinished)
      ? restoredThemeMode
      : "codebook");
  codebookModificationMode = false;
  codebookUndoStack = [];
  codebookChangeHistory = Array.isArray(snapshot.codebookChangeHistory) ? snapshot.codebookChangeHistory : [];
  codebookHistoryOpen = false;
  const hasUnreviewedThemes = aiThemes().some((theme) => !themeReviewIsDecided(theme));
  const savedStage = snapshot.themeReviewStage || "";
  themeReviewStage = savedStage || (themes.length ? (hasUnreviewedThemes ? "review" : "merge-choice") : "idle");
  if (["human-choice", "human"].includes(themeReviewStage)) {
    themeReviewStage = themeReviewStage === "human" ? "additional" : "additional-choice";
  }
  if (themeReviewStage === "match-review" && !unresolvedHumanAiThemeMatches().length) {
    themeReviewStage = hasUnreviewedThemes ? "review" : "merge-choice";
  }
  themeAmendmentReturnStage = snapshot.themeAmendmentReturnStage || "";
  themeRevision = Math.max(1, Number(snapshot.themeRevision || 1));
  lastExportedThemeRevision = snapshot.lastExportedThemeRevision == null
    ? (themeReviewStage === "complete" ? themeRevision : 0)
    : Math.max(0, Number(snapshot.lastExportedThemeRevision || 0));
  lastFinishedThemeRevision = Math.max(0, Number(
    snapshot.lastFinishedThemeRevision ?? snapshot.lastExportedThemeRevision ?? (themeReviewStage === "complete" ? themeRevision : 0)
  ));
  themesFinishedWhenOpened = themeReviewStage === "complete"
    && lastFinishedThemeRevision >= themeRevision;
  themeQuestionnaireResponses = Array.isArray(snapshot.themeQuestionnaireResponses) ? snapshot.themeQuestionnaireResponses : [];
  themesExportedAt = String(snapshot.themesExportedAt || "");
  seniorThemeReview = snapshot.seniorThemeReview || null;
  themeCodebookFilter = "keep-all";
  resetWorkflowTiming(snapshot.workflowTiming || {});
  restoringSnapshot = false;
}

function themeSnapshotMatchesSelectedTranscripts(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.selectedTranscriptIds)) return false;
  const savedIds = new Set(snapshot.selectedTranscriptIds.map(String));
  const currentIds = new Set(selectedThemeTranscriptIds.map(String));
  const idsMatch = savedIds.size === currentIds.size && [...currentIds].every((id) => savedIds.has(id));
  if (!idsMatch) return false;
  const savedRevisions = snapshot.selectedTranscriptCodingRevisions;
  if (!savedRevisions || typeof savedRevisions !== "object") return true;
  return [...currentIds].every((id) => (
    Number(savedRevisions[id] || 1) === Number(selectedThemeCodingRevisions[id] || 1)
  ));
}

function themeSnapshotHasProgress(snapshot) {
  return Boolean(
    snapshot?.latestCodebook ||
    snapshot?.latestCodebookId ||
    snapshot?.themes?.length ||
    snapshot?.originalAiThemes?.length ||
    snapshot?.preGenerationHumanThemes?.length
  );
}

function previousProjectResearchQuestion() {
  return String(
    currentProject?.research_question
    || document.getElementById("researchQuestion")?.value
    || ""
  ).trim();
}

function setCodebookResearchQuestionStep(refining) {
  const choice = document.getElementById("codebookResearchQuestionChoice");
  const form = document.getElementById("codebookResearchQuestionForm");
  choice?.classList.toggle("hidden", refining);
  form?.classList.toggle("hidden", !refining);
  if (refining) {
    const input = document.getElementById("refinedResearchQuestion");
    if (input) input.value = "";
    requestAnimationFrame(() => input?.focus());
  } else {
    requestAnimationFrame(() => document.getElementById("skipResearchQuestionRefinement")?.focus());
  }
}

function openCodebookResearchQuestionPrompt() {
  const previousQuestion = previousProjectResearchQuestion();
  codebookDeletionSuggestionChoice = "";
  codebookResearchQuestion = previousQuestion;
  document.getElementById("previousResearchQuestionText").textContent = previousQuestion || "No previous research question is available.";
  document.getElementById("previousResearchQuestionFormText").textContent = previousQuestion || "No previous research question is available.";
  setCodebookResearchQuestionStep(false);
  document.getElementById("codebookResearchQuestionModal")?.classList.remove("hidden");
  updateThemeWorkflowButtons();
}

function closeCodebookResearchQuestionPrompt() {
  document.getElementById("codebookResearchQuestionModal")?.classList.add("hidden");
  document.getElementById("generateCodebookBtn")?.focus();
}

function skipCodebookResearchQuestionRefinement() {
  codebookDeletionSuggestionChoice = "no";
  codebookResearchQuestion = previousProjectResearchQuestion();
  codebookAiSuggestionsOpen = false;
  closeCodebookResearchQuestionPrompt();
  updateThemeWorkflowButtons();
  markSaved();
}

function saveRefinedCodebookResearchQuestion(event) {
  event.preventDefault();
  const refinedQuestion = document.getElementById("refinedResearchQuestion")?.value.trim() || "";
  if (!refinedQuestion) {
    toast("Enter a refined research question to continue.");
    document.getElementById("refinedResearchQuestion")?.focus();
    return;
  }
  codebookDeletionSuggestionChoice = "yes";
  codebookResearchQuestion = refinedQuestion;
  closeCodebookResearchQuestionPrompt();
  updateThemeWorkflowButtons();
  markSaved();
}

function openThemesConfirmation() {
  const count = projectFiles.length;
  const countElement = document.getElementById("openThemesTranscriptCount");
  if (countElement) countElement.textContent = String(count);
  document.getElementById("openThemesConfirmModal")?.classList.remove("hidden");
  document.getElementById("cancelOpenThemes")?.focus();
}

function closeThemesConfirmation() {
  document.getElementById("openThemesConfirmModal")?.classList.add("hidden");
  document.getElementById("openSelectionBtn")?.focus();
}

function closeCodebookProcessingModal({ clearContinuation = true, restoreFocus = true } = {}) {
  window.clearTimeout(codebookProcessingPollTimer);
  codebookProcessingPollTimer = null;
  document.getElementById("codebookProcessingModal")?.classList.add("hidden");
  if (clearContinuation) codebookProcessingContinuation = null;
  if (restoreFocus) document.getElementById("openSelectionBtn")?.focus();
}

function scheduleCodebookProcessingCheck() {
  window.clearTimeout(codebookProcessingPollTimer);
  codebookProcessingPollTimer = window.setTimeout(() => checkProjectCodebookReady(), 2500);
}

function showCodebookProcessingModal(continuation) {
  if (continuation) codebookProcessingContinuation = continuation;
  document.getElementById("openThemesConfirmModal")?.classList.add("hidden");
  document.getElementById("codebookProcessingModal")?.classList.remove("hidden");
  document.getElementById("checkCodebookProcessing")?.focus();
  scheduleCodebookProcessingCheck();
}

async function checkProjectCodebookReady(continuation = null) {
  if (continuation) codebookProcessingContinuation = continuation;
  if (!currentProject?.id || codebookProcessingCheckPending) return false;
  codebookProcessingCheckPending = true;
  const checkButton = document.getElementById("checkCodebookProcessing");
  if (checkButton) {
    checkButton.disabled = true;
    checkButton.textContent = "Checking…";
  }
  try {
    projectCodebook = await apiFetch("/api/projects/" + currentProject.id + "/codebook");
    updateManagerActions();
    if (projectCodebook.processing) {
      showCodebookProcessingModal();
      return false;
    }
    const readyAction = codebookProcessingContinuation;
    closeCodebookProcessingModal({ clearContinuation: true, restoreFocus: false });
    if (readyAction) readyAction();
    return true;
  } catch (error) {
    closeCodebookProcessingModal();
    toast(error.message || "Could not check the codebook update status.");
    return false;
  } finally {
    codebookProcessingCheckPending = false;
    if (checkButton) {
      checkButton.disabled = false;
      checkButton.textContent = "Check again";
    }
  }
}

async function openThemesForTranscripts(selected) {
  if (!selected || selected.length < 2) return toast("Add at least two project transcripts to use Themes.");
  const unfinishedCount = selected.filter((item) => item.analysis_status !== "finished").length;
  if (unfinishedCount > 0) {
    return toast(`Finish ${unfinishedCount} remaining transcript${unfinishedCount === 1 ? "" : "s"} before opening Themes.`);
  }
  const pendingAutosave = activeTranscriptFile?.id || currentWorkspacePage === "themes"
    ? flushPendingAutosave()
    : Promise.resolve();
  selectedThemeTranscriptIds = selected.map((item) => item.id);
  activeTranscriptFile = null;
  updateWorkspaceNavAccess("themes");
  resetThemesForNewGeneration({ announce: false });
  setWorkspacePage("themes");
  showView("workspace");
  const uploadStatus = document.getElementById("themeUploadStatus");
  if (uploadStatus) uploadStatus.textContent = `Loading finished coding from all ${selected.length} project transcripts…`;
  renderThemes();
  try {
    await pendingAutosave;
    const [analysisPayloads, transcriptPayloads, automaticCodebook] = await Promise.all([
      Promise.all(selected.map((item) => apiFetch(`/api/projects/${currentProject.id}/transcripts/${item.id}/analysis`))),
      Promise.all(selected.map((item) => apiFetch(`/api/projects/${currentProject.id}/transcripts/${item.id}/content`).catch(() => ({ text: "" })))),
      apiFetch(`/api/projects/${currentProject.id}/codebook`),
    ]);
    projectCodebook = automaticCodebook;
    if (automaticCodebook?.processing) {
      showCodebookProcessingModal(() => openThemesForTranscripts(selected));
      return;
    }
    selectedThemeCodingRevisions = Object.fromEntries(selected.map((item, index) => [
      String(item.id),
      Math.max(1, Number(analysisPayloads[index]?.snapshot?.codingRevision || 1)),
    ]));
    themeTranscriptDocuments = selected.map((item, index) => ({
      transcript_id: item.id,
      file_name: item.name,
      rows: transcriptRowsFromText(transcriptPayloads[index]?.text || ""),
    })).filter((document) => document.rows.some((row) => String(row.text || "").trim()));
    const exports = selected.map((item, index) => {
      const snapshot = analysisPayloads[index].snapshot || {};
      // Match the AI Coding totals shown in the Transcript Manager. Human Coding
      // entries and concealed calibration codes are not Codebook inputs.
      const reviewedCodes = (snapshot.codes || []).filter(isFinalAiCodingResult);
      return {
        name: `${item.name.replace(/\.docx$/i, "")}_ReflexCoTI.json`,
        payload: {
          research_question: currentProject.research_question,
          interviewee: currentProject.interviewee,
          transcript: { file_name: item.name, id: item.id },
          codes: reviewedCodes.map(simpleCodeRecord),
        },
      };
    });
    themeJsonFiles = exports.map((entry) => new File([JSON.stringify(entry.payload)], entry.name, { type: "application/json" }));
    themeCodeInputs = exports.flatMap((entry) => extractThemeCodesFromExport(entry.payload, entry.name));
    const reviewedCodeCount = exports.reduce((total, entry) => total + reviewedCodeCountFromExport(entry.payload), 0);
    const savedThemes = await apiFetch(`/api/projects/${currentProject.id}/theme-analysis`);
    const snapshotMatches = themeSnapshotMatchesSelectedTranscripts(savedThemes.snapshot);
    const restoredThemeProgress = snapshotMatches && themeSnapshotHasProgress(savedThemes.snapshot);
    const staleThemeProgress = Boolean(savedThemes.invalidated) || (Boolean(savedThemes.snapshot) && !snapshotMatches);
    if (snapshotMatches) {
      restoreThemeSnapshot(savedThemes.snapshot);
      lastSavedAt = savedThemes.updated_at ? new Date(savedThemes.updated_at * 1000) : null;
    } else {
      if (!automaticCodebook?.available || !automaticCodebook.codebook) {
        throw new Error("The project codebook is unavailable. Finish the latest transcript again to update it.");
      }
      latestCodebook = automaticCodebook.codebook;
      latestCodebookId = automaticCodebook.codebook_id;
      codebookDeletionSuggestionChoice = "no";
      codebookResearchQuestion = currentProject?.research_question || "";
      if (savedThemes.snapshot) {
        const clearedThemes = await apiFetch(`/api/projects/${currentProject.id}/theme-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(themeAnalysisSnapshot()),
        });
        lastSavedAt = new Date((clearedThemes.updated_at || Date.now() / 1000) * 1000);
      }
    }
    const maintainedSize = Number(latestCodebook?.entries?.length ?? automaticCodebook.current_size ?? 0);
    document.getElementById("themeUploadStatus").textContent = `Codebook ready with ${maintainedSize} code${maintainedSize === 1 ? "" : "s"} from all ${selected.length} finished transcripts.`;
    document.getElementById("codebookUploadHint").textContent = "Codebook updated automatically when transcript coding was finished.";
    updateThemeWorkflowButtons();
    startWorkflowTimingSession();
    renderThemes();
    renderLastSaved();
    toast(restoredThemeProgress
      ? "Saved theme analysis restored."
      : staleThemeProgress
        ? "The transcript selection or coding revisions changed, so the previous codebook and themes were cleared. Theme development will use the latest accepted codes."
        : "All project transcripts opened for theme development.");
  } catch (error) {
    if (uploadStatus) uploadStatus.textContent = "The transcript coding results could not be loaded. Return to Transcripts and try again.";
    toast(error.message || "Could not open all project transcripts for Themes.");
  }
}

async function authenticate(mode) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("accountRole").value;
  const payload = await apiFetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, ...(mode === "register" ? { role } : {}) }),
  });
  currentUser = payload.user;
  setPiReadOnlyMode(false);
  sessionStorage.setItem("reflexcoti_username", currentUser.username);
  sessionStorage.setItem("reflexcoti_azure_config", JSON.stringify({
    azure_endpoint: document.getElementById("azureEndpoint").value,
    api_version: document.getElementById("apiVersion").value,
    model: document.getElementById("model").value,
  }));
  document.querySelectorAll("#userAvatar, #setupUserAvatar, .document-user-avatar, .code-view-user-avatar, .pi-user-avatar, .peer-user-avatar").forEach((avatar) => { avatar.textContent = initials(currentUser.username); });
  if (currentUser.role === "pi") {
    showView("piHome");
  } else {
    await Promise.all([loadProjects(), loadStudentPiConnections(), loadPeerSuggestionCount()]);
    showView("project");
  }
  toast(mode === "register" ? "Account created." : "Signed in.");
  if (mode === "register") openGuidebook();
}

async function openOwnProjects() {
  setPiReadOnlyMode(false);
  await loadProjects();
  if (currentUser?.role === "student") await loadPeerSuggestionCount();
  document.getElementById("openPeerReview")?.classList.toggle("hidden", currentUser?.role !== "student");
  document.getElementById("openPeerInbox")?.classList.toggle("hidden", currentUser?.role !== "student");
  document.getElementById("projectPageContext")?.classList.toggle("hidden", currentUser?.role === "pi");
  document.getElementById("backToPiHome")?.classList.toggle("hidden", currentUser?.role !== "pi");
  showView("project");
}

function openPiHome() {
  if (currentUser?.role !== "pi") return;
  setPiReadOnlyMode(false);
  showView("piHome");
}

async function openAppHome(trigger) {
  if (!currentUser) return;
  if (trigger) trigger.disabled = true;
  try {
    if (!views.workspace.classList.contains("hidden")) await flushPendingAutosave();
    await openOwnProjects();
  } catch (error) {
    toast(error.message || "Could not return home.");
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

document.querySelectorAll("[data-app-home]").forEach((button) => {
  button.addEventListener("click", () => openAppHome(button));
});

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null; projects = []; currentProject = null; projectFiles = [];
  peerReviewProjects = []; peerReviewAnalysis = null; peerSuggestionInbox = [];
  setPiReadOnlyMode(false);
  showView("login");
  toast("Signed out.");
}

document.getElementById("sessionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await authenticate("login"); } catch (error) { toast(error.message); }
});

function closeAccountTypeModal() {
  document.getElementById("accountTypeModal")?.classList.add("hidden");
}

document.getElementById("registerBtn")?.addEventListener("click", () => {
  if (!document.getElementById("sessionForm").reportValidity()) return;
  document.getElementById("accountTypeForm")?.reset();
  document.getElementById("accountTypeModal")?.classList.remove("hidden");
  document.getElementById("accountRole")?.focus();
});
document.getElementById("closeAccountType")?.addEventListener("click", closeAccountTypeModal);
document.getElementById("cancelAccountType")?.addEventListener("click", closeAccountTypeModal);
document.getElementById("accountTypeModal")?.addEventListener("click", (event) => {
  if (event.target.id === "accountTypeModal") closeAccountTypeModal();
});
document.getElementById("accountTypeForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("confirmCreateAccount");
  button.disabled = true;
  button.textContent = "Creating…";
  try {
    await authenticate("register");
    closeAccountTypeModal();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});
document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", logout));
document.getElementById("openPiProjects")?.addEventListener("click", () => openOwnProjects().catch((error) => toast(error.message)));
document.getElementById("openStudentProjects")?.addEventListener("click", async () => {
  try { await showPiStudentsOverview(); showView("piStudents"); } catch (error) { toast(error.message); }
});
document.getElementById("backToPiHome")?.addEventListener("click", openPiHome);
document.getElementById("backToPiHomeFromStudents")?.addEventListener("click", openPiHome);
document.getElementById("openInviteStudent")?.addEventListener("click", openInviteStudentModal);
document.getElementById("closeInviteStudent")?.addEventListener("click", closeInviteStudentModal);
document.getElementById("cancelInviteStudent")?.addEventListener("click", closeInviteStudentModal);
document.getElementById("piStudentConnections")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-invite-student]")) openInviteStudentModal();
  const student = event.target.closest("[data-open-connected-student]");
  if (student) openConnectedStudentProjects(student.dataset.openConnectedStudent).catch((error) => toast(error.message));
  if (event.target.closest("[data-back-connected-students]")) showPiStudentsOverview().catch((error) => toast(error.message));
  const project = event.target.closest("[data-open-student-project]");
  if (project) openStudentProjectAsAccount(project.dataset.studentId, project.dataset.openStudentProject).catch((error) => toast(error.message));
});
document.getElementById("piStudentConnections")?.addEventListener("keydown", (event) => {
  const project = event.target.closest("[data-open-student-project]");
  if (project && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openStudentProjectAsAccount(project.dataset.studentId, project.dataset.openStudentProject).catch((error) => toast(error.message));
  }
});
document.getElementById("backToPiStudentProjects")?.addEventListener("click", () => {
  if (!piReviewContext) return;
  openConnectedStudentProjects(piReviewContext.student.id).then(() => showView("piStudents")).catch((error) => toast(error.message));
});
document.getElementById("piReviewTranscriptBody")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view-student-analysis]");
  if (button) viewPiTranscriptAnalysis(button.dataset.viewStudentAnalysis).catch((error) => toast(error.message));
});
document.getElementById("viewPiThemeAnalysis")?.addEventListener("click", () => viewPiThemeAnalysis().catch((error) => toast(error.message)));
document.getElementById("closePiAnalysisDetail")?.addEventListener("click", () => document.getElementById("piAnalysisDetail")?.classList.add("hidden"));
document.getElementById("inviteStudentModal")?.addEventListener("click", (event) => {
  if (event.target.id === "inviteStudentModal") closeInviteStudentModal();
});
document.getElementById("inviteStudentForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("sendStudentInvitation");
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const username = document.getElementById("inviteStudentUsername").value.trim();
    await apiFetch("/api/pi/student-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
    closeInviteStudentModal();
    await loadPiStudentConnections();
    toast(`Invitation sent to ${username}.`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Send invitation";
  }
});
document.getElementById("studentPiConnections")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-pi-response], [data-peer-response]");
  if (!button) return;
  const isPeerRequest = Boolean(button.dataset.peerResponse);
  const action = isPeerRequest ? button.dataset.peerResponse : button.dataset.piResponse;
  button.disabled = true;
  try {
    const path = isPeerRequest
      ? `/api/student/peer-review-invitations/${button.dataset.connectionId}/respond`
      : `/api/student/pi-invitations/${button.dataset.connectionId}/respond`;
    await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    await loadStudentPiConnections();
    toast(action === "accept"
      ? `${isPeerRequest ? "Peer" : "Senior"} review access accepted.`
      : `${isPeerRequest ? "Peer" : "Senior"} review request declined.`);
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});
document.getElementById("openCreateProject")?.addEventListener("click", openCreateProjectModal);
document.getElementById("peerReviewRequestForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("sendPeerReviewRequest");
  const username = document.getElementById("peerReviewRequestUsername").value.trim();
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    await apiFetch("/api/peer-review/invitations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }),
    });
    document.getElementById("peerReviewRequestForm").reset();
    peerReviewConnections = await apiFetch("/api/student/peer-review-connections");
    renderPeerAccessDashboard();
    toast(`Peer review request sent to ${username}. Their results remain private until they accept.`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Send request";
  }
});
document.getElementById("openPeerReview")?.addEventListener("click", () => openPeerReview().catch((error) => toast(error.message)));
document.getElementById("backToPeerAccess")?.addEventListener("click", () => openPeerReview().catch((error) => toast(error.message)));
document.getElementById("openPeerInbox")?.addEventListener("click", () => openPeerInbox().catch((error) => toast(error.message)));
document.getElementById("backFromPeerReview")?.addEventListener("click", () => openOwnProjects().catch((error) => toast(error.message)));
document.getElementById("backFromPeerInbox")?.addEventListener("click", () => openOwnProjects().catch((error) => toast(error.message)));
document.getElementById("peerReviewContent")?.addEventListener("click", (event) => {
  const approvedPeer = event.target.closest("[data-review-peer]");
  if (approvedPeer) return findPeerResults(approvedPeer.dataset.reviewPeer).catch((error) => toast(error.message));
  const coding = event.target.closest("[data-peer-coding-project]");
  if (coding) return openPeerAnalysis(coding.dataset.peerCodingProject, "coding", coding.dataset.peerTranscript).catch((error) => toast(error.message));
  const themesButton = event.target.closest("[data-peer-themes-project]");
  if (themesButton) return openPeerAnalysis(themesButton.dataset.peerThemesProject, "themes").catch((error) => toast(error.message));
  const actionButton = event.target.closest("[data-peer-action]");
  const card = actionButton?.closest("[data-peer-item]");
  if (actionButton && card) {
    const action = actionButton.dataset.peerAction;
    if (["revise", "reject"].includes(action)) return openPeerSuggestionDialog(action, [card.dataset.peerItem], actionButton);
    submitPeerSuggestion(action, [card.dataset.peerItem]).catch((error) => toast(error.message));
  }
});
document.getElementById("closePeerSuggestion")?.addEventListener("click", closePeerSuggestionDialog);
document.getElementById("cancelPeerSuggestion")?.addEventListener("click", closePeerSuggestionDialog);
document.getElementById("peerSuggestionModal")?.addEventListener("click", (event) => {
  if (event.target.id === "peerSuggestionModal") closePeerSuggestionDialog();
});
document.getElementById("peerSuggestionForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingPeerSuggestion || !peerReviewAnalysis) return;
  const { action, targetIds } = pendingPeerSuggestion;
  const memo = document.getElementById("peerSuggestionMemo").value.trim();
  const proposedValue = action === "reject" ? {} : {
    title: document.getElementById("peerSuggestionTitle").value.trim(),
    ...(peerReviewAnalysis.scope === "themes"
      ? { rationale: document.getElementById("peerSuggestionDetail").value.trim() }
      : (action === "revise"
        ? { excerpts: document.getElementById("peerSuggestionDetail").value.split(/\n+/).map((value) => value.trim()).filter(Boolean) }
        : {})),
  };
  const button = document.getElementById("sendPeerSuggestion");
  button.disabled = true;
  try {
    await sendPeerSuggestionRequest(action, targetIds, proposedValue, memo);
    closePeerSuggestionDialog();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
document.getElementById("peerReviewContent")?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-peer-merge-select]");
  if (!checkbox) return;
  if (checkbox.checked) peerSelectedIds.add(checkbox.dataset.peerMergeSelect);
  else peerSelectedIds.delete(checkbox.dataset.peerMergeSelect);
  renderPeerAnalysis();
});
document.getElementById("suggestPeerMerge")?.addEventListener("click", () => {
  if (peerSelectedIds.size < 2) return toast("Select at least two results to suggest a merge.");
  openPeerSuggestionDialog("merge", [...peerSelectedIds], document.getElementById("suggestPeerMerge"));
});
document.getElementById("peerInboxContent")?.addEventListener("click", (event) => {
  const returnButton = event.target.closest("[data-return-peer-projects]");
  if (returnButton) {
    openOwnProjects().catch((error) => toast(error.message));
    return;
  }
  const button = event.target.closest("[data-resolve-peer]");
  if (!button) return;
  button.disabled = true;
  resolvePeerSuggestion(button.dataset.suggestionId, button.dataset.resolvePeer).catch((error) => {
    button.disabled = false;
    toast(error.message);
  });
});
document.getElementById("closeCreateProject")?.addEventListener("click", closeCreateProjectModal);
document.getElementById("cancelCreateProject")?.addEventListener("click", closeCreateProjectModal);
document.getElementById("projectSearch")?.addEventListener("input", (event) => renderProjects(event.target.value));
document.getElementById("projectCardGrid")?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-project]");
  if (deleteButton) {
    event.stopPropagation();
    openDeleteProjectModal(deleteButton.dataset.deleteProject);
    return;
  }
  const card = event.target.closest("[data-open-project]");
  if (card) openProject(card.dataset.openProject).catch((error) => toast(error.message));
});
document.getElementById("cancelDeleteProject")?.addEventListener("click", closeDeleteProjectModal);
document.getElementById("confirmDeleteProject")?.addEventListener("click", () => deletePendingProject());
document.getElementById("deleteProjectModal")?.addEventListener("click", (event) => {
  if (event.target.id === "deleteProjectModal") closeDeleteProjectModal();
});
document.getElementById("projectCardGrid")?.addEventListener("keydown", (event) => {
  if (event.target.closest("[data-delete-project]")) return;
  const card = event.target.closest("[data-open-project]");
  if (card && ["Enter", " "].includes(event.key)) { event.preventDefault(); openProject(card.dataset.openProject).catch((error) => toast(error.message)); }
});

document.getElementById("projectForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const createButton = document.getElementById("createProjectBtn");
  createButton.disabled = true;
  createButton.textContent = "Preparing coder agents…";
  const formError = document.getElementById("projectCreateError");
  if (formError) { formError.textContent = ""; formError.classList.add("hidden"); }
  let agentsPrepared = false;
  const request = {
    name: document.getElementById("projectName").value.trim(),
    research_question: document.getElementById("researchQuestion").value.trim(),
    interviewee: document.getElementById("interviewee").value.trim(),
    azure_endpoint: document.getElementById("azureEndpoint").value.trim(),
    api_key: document.getElementById("apiKey").value.trim(),
    api_version: document.getElementById("apiVersion").value.trim(),
    model: document.getElementById("model").value.trim(),
  };
  try {
    const payload = await apiFetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    agentsPrepared = true;
    closeCreateProjectModal();
    await loadProjects();
    await openProject(payload.project.id);
    toast("Coder agents are ready. Your project-specific coder profiles and initial assumptions have been created.", 5000);
  } catch (error) {
    if (agentsPrepared) {
      toast(error.message || "The project was created, but it could not be opened.", 6000);
    } else {
      const message = "Coder agents could not be prepared. " + (error.message || "Please check your Azure OpenAI settings and try again.");
      if (formError) {
        formError.textContent = message;
        formError.classList.remove("hidden");
        formError.scrollIntoView({ behavior: "smooth", block: "nearest" });
        formError.focus({ preventScroll: true });
      } else {
        toast(message, 8000);
      }
    }
  } finally {
    createButton.disabled = false;
    createButton.textContent = "Create project";
  }
});

document.getElementById("backToProjects")?.addEventListener("click", async () => {
  if (piReadOnlyMode && piReadOnlyContext) {
    await openConnectedStudentProjects(piReadOnlyContext.student.id);
    showView("piStudents");
    return;
  }
  await loadProjects(); showView("project");
});
async function returnToCurrentProject() {
  await flushPendingAutosave();
  if (piReadOnlyMode) {
    renderDocumentManager();
    showView("documents");
    return;
  }
  if (currentProject) await openProject(currentProject.id);
}

document.querySelector("[data-project-settings]")?.addEventListener("click", returnToCurrentProject);
document.getElementById("workspaceProjectLink")?.addEventListener("click", returnToCurrentProject);
document.getElementById("changeTranscriptBtn")?.addEventListener("click", async () => {
  await flushPendingAutosave();
  if (piReadOnlyMode) {
    renderDocumentManager();
    showView("documents");
    return;
  }
  if (currentProject) await openProject(currentProject.id);
});

document.getElementById("activeTranscriptSelect")?.addEventListener("change", async (event) => {
  const file = projectFiles.find((item) => item.id === event.target.value);
  if (file && file !== activeTranscriptFile) await loadProjectTranscript(file, { startAi: codingWorkspaceMode === "ai" });
});

document.getElementById("managerTranscriptFiles")?.addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const unsupportedFile = files.find((file) => !file.name.toLowerCase().endsWith(".docx"));
  if (unsupportedFile) {
    event.target.value = "";
    toast(`“${unsupportedFile.name}” is not supported. Upload only .docx transcript files.`);
    return;
  }
  const existingNames = new Set(projectFiles.map((file) => normalizedTranscriptName(file.name)));
  const selectedNames = new Set();
  const duplicate = files.find((file) => {
    const normalizedName = normalizedTranscriptName(file.name);
    if (existingNames.has(normalizedName) || selectedNames.has(normalizedName)) return true;
    selectedNames.add(normalizedName);
    return false;
  });
  if (duplicate) {
    event.target.value = "";
    toast(`A transcript named “${duplicate.name}” already exists in this project. Rename the file before uploading it.`);
    return;
  }
  const formData = new FormData();
  files.forEach((file) => formData.append("transcripts", file, file.name));
  try {
    await flushPendingAutosave();
    const result = await apiFetch(`/api/projects/${currentProject.id}/transcripts`, { method: "POST", body: formData });
    invalidateThemesForTranscriptChange();
    event.target.value = "";
    await openProject(currentProject.id);
    const themeMessage = result.themes_cleared ? " Previous project themes were cleared so theme development can start fresh." : "";
    toast(`${files.length} transcript${files.length === 1 ? "" : "s"} saved to the project.${themeMessage}`);
  } catch (error) { toast(error.message); }
});
document.getElementById("transcriptSearchManager")?.addEventListener("input", (event) => renderDocumentManager(event.target.value));
document.getElementById("documentTableBody")?.addEventListener("click", (event) => {
  const clearButton = event.target.closest("[data-clear-transcript]");
  if (clearButton) return openClearTranscriptModal(clearButton.dataset.clearTranscript);
  const deleteButton = event.target.closest("[data-delete-transcript]");
  if (deleteButton) return openDeleteTranscriptModal(deleteButton.dataset.deleteTranscript);
  const codeViewButton = event.target.closest("[data-open-code-view]");
  if (codeViewButton) return openCodeVisualization(projectFiles.find((item) => item.id === codeViewButton.dataset.openCodeView));
  const humanButton = event.target.closest("[data-open-human-codes]");
  if (humanButton) return openHumanCodesForTranscript(projectFiles.find((item) => item.id === humanButton.dataset.openHumanCodes));
  const openButton = event.target.closest("[data-open-transcript]");
  if (openButton) return openCodesForTranscript(projectFiles.find((item) => item.id === openButton.dataset.openTranscript));
});
document.getElementById("backFromCodeView")?.addEventListener("click", () => {
  renderDocumentManager(document.getElementById("transcriptSearchManager")?.value || "");
  showView("documents");
});
document.getElementById("openDetailedCodes")?.addEventListener("click", () => openCodesForTranscript(codeViewTranscriptFile));
document.getElementById("codeViewSearch")?.addEventListener("input", (event) => renderCodeVisualization(event.target.value));
function keepExpandedCodeNodeInBounds(node) {
  const canvas = node?.closest(".code-constellation");
  if (!canvas || !node.classList.contains("expanded") || !node.classList.contains("semantic-positioned")) return;
  node.style.removeProperty("--expanded-shift-x");
  node.style.removeProperty("--expanded-shift-y");
  const canvasBounds = canvas.getBoundingClientRect();
  const nodeBounds = node.getBoundingClientRect();
  const detail = node.querySelector(".code-node-detail:not(.hidden)");
  const inset = 12;
  let shiftX = 0;
  if (nodeBounds.right > canvasBounds.right - inset) shiftX -= nodeBounds.right - canvasBounds.right + inset;
  if (nodeBounds.left + shiftX < canvasBounds.left + inset) shiftX += canvasBounds.left + inset - (nodeBounds.left + shiftX);
  if (shiftX) node.style.setProperty("--expanded-shift-x", `${shiftX}px`);
  if (!detail) return;
  let detailBounds = detail.getBoundingClientRect();
  const coreBounds = node.querySelector(".code-node-core")?.getBoundingClientRect() || nodeBounds;
  const spaceAbove = coreBounds.top - canvasBounds.top;
  const spaceBelow = canvasBounds.bottom - coreBounds.bottom;
  if (!node.classList.contains("detail-up") && detailBounds.height > spaceBelow && spaceAbove > spaceBelow) {
    node.classList.add("detail-up");
    detailBounds = detail.getBoundingClientRect();
  } else if (node.classList.contains("detail-up") && detailBounds.height > spaceAbove && spaceBelow > spaceAbove) {
    node.classList.remove("detail-up");
    detailBounds = detail.getBoundingClientRect();
  }
  let shiftY = 0;
  if (detailBounds.bottom > canvasBounds.bottom - inset) shiftY -= detailBounds.bottom - canvasBounds.bottom + inset;
  if (detailBounds.top + shiftY < canvasBounds.top + inset) shiftY += canvasBounds.top + inset - (detailBounds.top + shiftY);
  if (shiftY) node.style.setProperty("--expanded-shift-y", `${shiftY}px`);
}

function setCodeViewNodeExpanded(node, button, shouldExpand) {
  const detail = node?.querySelector(".code-node-detail");
  if (!detail || !button) return;
  button.setAttribute("aria-expanded", String(shouldExpand));
  button.textContent = shouldExpand ? "−" : "+";
  button.setAttribute("aria-label", button.getAttribute("aria-label").replace(shouldExpand ? /^Show/ : /^Hide/, shouldExpand ? "Hide" : "Show"));
  detail.classList.toggle("hidden", !shouldExpand);
  node.classList.toggle("expanded", shouldExpand);
  if (!shouldExpand) {
    node.style.removeProperty("--expanded-shift-x");
    node.style.removeProperty("--expanded-shift-y");
    return;
  }
  requestAnimationFrame(() => keepExpandedCodeNodeInBounds(node));
  const finishExpansion = (event) => {
    if (event.propertyName !== "width") return;
    node.removeEventListener("transitionend", finishExpansion);
    keepExpandedCodeNodeInBounds(node);
  };
  node.addEventListener("transitionend", finishExpansion);
}

const codeConstellation = document.getElementById("codeConstellation");
codeConstellation?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-code-view-expand]");
  if (!button) return;
  const node = button.closest("[data-code-view-node]");
  const expanded = button.getAttribute("aria-expanded") === "true";
  setCodeViewNodeExpanded(node, button, !expanded);
});
codeConstellation?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const node = event.target.closest("[data-code-view-node].expanded");
  const button = node?.querySelector("[data-code-view-expand]");
  if (!node || !button) return;
  event.preventDefault();
  setCodeViewNodeExpanded(node, button, false);
  button.focus();
});
document.getElementById("cancelDeleteTranscript")?.addEventListener("click", closeDeleteTranscriptModal);
document.getElementById("confirmDeleteTranscript")?.addEventListener("click", () => deletePendingTranscript());
document.getElementById("deleteTranscriptModal")?.addEventListener("click", (event) => {
  if (event.target.id === "deleteTranscriptModal") closeDeleteTranscriptModal();
});
document.getElementById("cancelClearTranscript")?.addEventListener("click", closeClearTranscriptModal);
document.getElementById("confirmClearTranscript")?.addEventListener("click", () => clearPendingTranscript());
document.getElementById("clearTranscriptModal")?.addEventListener("click", (event) => {
  if (event.target.id === "clearTranscriptModal") closeClearTranscriptModal();
});
document.getElementById("openThemeViewBtn")?.addEventListener("click", openThemeVisualization);
document.getElementById("openCodebookViewBtn")?.addEventListener("click", openProjectCodebookExplorer);
document.getElementById("backFromThemeView")?.addEventListener("click", () => {
  renderDocumentManager(document.getElementById("transcriptSearchManager")?.value || "");
  showView("documents");
});
document.getElementById("openDetailedThemes")?.addEventListener("click", () => {
  checkProjectCodebookReady(() => openThemesForTranscripts(projectFiles));
});
document.getElementById("showThemeMap")?.addEventListener("click", () => setThemeVisualizationMode("map"));
document.getElementById("showThemeWordCloud")?.addEventListener("click", () => setThemeVisualizationMode("cloud"));
document.getElementById("themeViewSearch")?.addEventListener("input", (event) => {
  if (themeVisualizationMode === "cloud") renderThemeWordCloud(event.target.value);
  else renderThemeVisualization(event.target.value);
});
document.getElementById("themeWordCloud")?.addEventListener("click", (event) => {
  const word = event.target.closest("[data-cloud-term]");
  if (!word) return;
  const query = word.dataset.cloudTerm || "";
  const matchingThemes = themeViewThemes.filter((theme) => themeViewCodeNames(theme).some((name) => themeCloudTokens(name).some((term) => term.toLowerCase() === query)));
  setThemeVisualizationMode("map");
  document.getElementById("themeViewSearch").value = "";
  if (matchingThemes.length) {
    const allThemes = themeViewThemes;
    themeViewThemes = matchingThemes;
    renderThemeVisualization();
    themeViewThemes = allThemes;
    document.getElementById("themeViewVisibleStatus").textContent = `${matchingThemes.length} theme${matchingThemes.length === 1 ? "" : "s"} using “${query}”`;
  }
});
let themeCloudResizeTimer = 0;
window.addEventListener("resize", () => {
  if (themeVisualizationMode !== "cloud") return;
  window.clearTimeout(themeCloudResizeTimer);
  themeCloudResizeTimer = window.setTimeout(() => renderThemeWordCloud(document.getElementById("themeViewSearch")?.value || ""), 140);
});
document.getElementById("themeConstellation")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-view-expand]");
  if (!button) return;
  const node = button.closest("[data-theme-view-node]");
  const expanded = button.getAttribute("aria-expanded") === "true";
  setCodeViewNodeExpanded(node, button, !expanded);
});
document.getElementById("themeConstellation")?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const node = event.target.closest("[data-theme-view-node].expanded");
  const button = node?.querySelector("[data-theme-view-expand]");
  if (!node || !button) return;
  event.preventDefault();
  setCodeViewNodeExpanded(node, button, false);
  button.focus();
});
document.getElementById("openSelectionBtn")?.addEventListener("click", async () => {
  if (piReadOnlyMode) return openPiReadOnlyThemes();
  if (projectFiles.length < 2) return toast("Add at least two transcripts to use Themes.");
  const unfinishedCount = projectFiles.filter((item) => item.analysis_status !== "finished").length;
  if (unfinishedCount > 0) {
    return toast(`Finish ${unfinishedCount} remaining transcript${unfinishedCount === 1 ? "" : "s"} before opening Themes.`);
  }
  await checkProjectCodebookReady(openThemesConfirmation);
});
document.getElementById("cancelOpenThemes")?.addEventListener("click", closeThemesConfirmation);
document.getElementById("confirmOpenThemes")?.addEventListener("click", async () => {
  document.getElementById("openThemesConfirmModal")?.classList.add("hidden");
  await checkProjectCodebookReady(() => openThemesForTranscripts(projectFiles));
});
document.getElementById("openThemesConfirmModal")?.addEventListener("click", (event) => {
  if (event.target.id === "openThemesConfirmModal") closeThemesConfirmation();
});
document.getElementById("closeCodebookProcessing")?.addEventListener("click", () => closeCodebookProcessingModal());
document.getElementById("checkCodebookProcessing")?.addEventListener("click", () => checkProjectCodebookReady());
document.getElementById("codebookProcessingModal")?.addEventListener("click", (event) => {
  if (event.target.id === "codebookProcessingModal") closeCodebookProcessingModal();
});

document.getElementById("transcriptSearch").addEventListener("input", (event) => {
  if (codingWorkspaceMode === "human" && selectedTranscriptExcerpt) clearManualTranscriptSelection();
  renderTranscript(event.target.value);
});

document.getElementById("transcriptLines")?.addEventListener("mouseup", updateManualTranscriptSelection);
document.getElementById("transcriptLines")?.addEventListener("keyup", updateManualTranscriptSelection);
document.getElementById("saveManualCodeBtn")?.addEventListener("click", saveManualSelectedCode);
document.getElementById("clearManualSelectionBtn")?.addEventListener("click", clearManualTranscriptSelection);
document.getElementById("finishHumanCodingBtn")?.addEventListener("click", finishHumanCoding);
document.getElementById("exportHumanCodingBtn")?.addEventListener("click", exportHumanCodes);
document.getElementById("addHumanCodeAfterFinishBtn")?.addEventListener("click", reopenHumanCodingForAdditionalCode);
document.getElementById("stayOnHumanCodesBtn")?.addEventListener("click", () => closeHumanExportChoice());
document.getElementById("openAiCodesAfterHumanExportBtn")?.addEventListener("click", openAiCodesAfterHumanExport);
document.getElementById("humanExportChoiceModal")?.addEventListener("click", (event) => {
  if (event.target.id === "humanExportChoiceModal") closeHumanExportChoice();
});
document.getElementById("humanExportChoiceModal")?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeHumanExportChoice();
});
document.getElementById("humanManualCodeList")?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-human-code]");
  if (deleteButton) {
    const code = codes.find((item) => String(item.id) === String(deleteButton.dataset.deleteHumanCode));
    if (!code) return;
    codes = codes.filter((item) => String(item.id) !== String(code.id));
    if (String(focusedHumanCodeId || "") === String(code.id)) focusedHumanCodeId = null;
    noteHumanCodeChangeForExport();
    identifiedExcerpts = identifiedExcerpts.filter((excerpt) => String(excerpt.codeId ?? excerpt.id) !== String(code.id));
    renderTranscript(document.getElementById("transcriptSearch").value);
    updateFooterStats();
    markSaved();
    toast("Human code deleted.");
    return;
  }
  const focusItem = event.target.closest("[data-focus-human-code]");
  if (focusItem) focusHumanCode(focusItem.dataset.focusHumanCode);
});
document.getElementById("humanManualCodeList")?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.closest("[data-delete-human-code]")) return;
  const focusItem = event.target.closest("[data-focus-human-code]");
  if (!focusItem) return;
  event.preventDefault();
  focusHumanCode(focusItem.dataset.focusHumanCode);
});
document.getElementById("manualCodeName")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveManualSelectedCode();
  } else if (event.key === "Escape") {
    event.preventDefault();
    clearManualTranscriptSelection();
  }
});
document.getElementById("transcriptLines")?.addEventListener("scroll", () => {
  if (codingWorkspaceMode === "human" && selectedTranscriptExcerpt) clearManualTranscriptSelection();
  updateTranscriptEndGate();
});
window.addEventListener("resize", () => {
  if (codingWorkspaceMode === "human" && selectedTranscriptExcerpt?.rect) positionManualCodePopover(selectedTranscriptExcerpt.rect);
});
["manualThemeName", "manualThemeDescription", "manualThemeSupport"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    beginManualPhaseTiming();
    reopenHumanThemesForRevision();
    updateManualThemeControls();
    if (id === "manualThemeSupport") renderCodebookPanel();
  });
});
document.getElementById("saveManualThemeBtn")?.addEventListener("click", saveManualTheme);
document.getElementById("clearManualThemeBtn")?.addEventListener("click", clearManualThemeFields);
document.getElementById("finishHumanThemesBtn")?.addEventListener("click", finishHumanThemes);
document.getElementById("exportHumanThemesBtn")?.addEventListener("click", exportHumanThemes);
document.getElementById("manualThemeCodePicker")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-manual-theme-code]");
  if (!button) return;
  beginManualPhaseTiming();
  toggleManualThemeCode(button.dataset.manualThemeCode || "");
});

async function generateCardAiDraft(card, entityType, refinement = false) {
  const status = card.querySelector(".ai-draft-status");
  const instruction = card.querySelector("[data-ai-instruction]")?.value.trim() || "";
  const isCode = entityType === "code";
  const item = isCode
    ? codes.find((entry) => String(entry.id) === String(card.dataset.codeId))
    : themes.find((entry) => String(entry.id) === String(card.dataset.themeId));
  if (!item) return;
  const priorDraft = item.aiDraft;
  const action = item.splitMode ? "split" : "revise";
  const isRefinement = Boolean(refinement || (["revise", "split"].includes(action) && priorDraft));
  const button = card.querySelector(isRefinement ? "[data-refine-ai-proposal]" : "[data-generate-ai-draft]")
    || card.querySelector("[data-generate-ai-draft]");
  if (!button) return;
  if (!instruction && !isRefinement) {
    if (status) status.textContent = "Describe what you want AI to change.";
    return toast("Tell AI what you want to change first.");
  }
  button.disabled = true;
  button.textContent = "Working…";
  if (status) status.textContent = isRefinement
    ? "AI is creating a different alternative to the rejected proposal."
    : "AI is understanding your instruction, then performing the revision.";
  try {
    const payload = isCode ? codeAiEditPayload(item) : themeAiEditPayload(item);
    const rejectedProposal = priorDraft
      ? (action === "split"
        ? rejectedSplitProposal(item, priorDraft, isCode)
        : (isCode
          ? { code_name: priorDraft.title || "", excerpts: priorDraft.excerpts || [] }
          : { theme_name: priorDraft.title || "", description: priorDraft.rationale || "" }))
      : null;
    const priorAiContext = rejectedProposal ? priorAiContextFromDraft(priorDraft) : null;
    const result = await requestAiEdit(action, entityType, [payload], instruction, rejectedProposal, priorAiContext);
    const proposal = result.proposal || {};
    if (proposal.needs_clarification) {
      throw new Error(`AI needs clarification: ${proposal.clarification_question || "Please describe the intended outcome more precisely."}`);
    }
    if (proposal.proposal_failed) {
      throw new Error(`AI could not create the proposal: ${proposal.failure_message || "Please try again or edit the item yourself."}`);
    }
    if (action === "revise") {
      item.aiDraft = isCode
        ? { title: proposal.code_name || priorDraft?.title || item.title, excerpts: Array.isArray(proposal.excerpts) && proposal.excerpts.length ? proposal.excerpts : priorDraft?.excerpts || codeExcerptList(item), instruction, interpretation: proposal.instruction_interpretation || "", review: proposal.review_summary || "" }
        : { title: proposal.theme_name || priorDraft?.title || item.title, rationale: proposal.description || priorDraft?.rationale || item.rationale, instruction, interpretation: proposal.instruction_interpretation || "", review: proposal.review_summary || "" };
      item.assistMode = "manual";
    } else {
      const parts = Array.isArray(proposal.parts) ? proposal.parts : [];
      if (parts.length < 2) throw new Error("AI did not return at least two usable parts. Try a more specific instruction.");
      if (isCode) {
        const excerptCount = codeExcerptList(item).length;
        const assignments = Array(excerptCount).fill(-1);
        parts.forEach((part, partIndex) => (part.excerpt_indexes || []).forEach((index) => {
          const normalized = Number(index);
          if (Number.isInteger(normalized) && normalized >= 0 && normalized < excerptCount) assignments[normalized] = partIndex;
        }));
        assignments.forEach((value, index) => { if (value < 0) assignments[index] = index % parts.length; });
        item.splitParts = parts.map((part, index) => ({ title: part.code_name || `New code ${index + 1}` }));
        item.splitAssignments = assignments;
        item.aiDraft = { generated: true, instruction, interpretation: proposal.instruction_interpretation || "", review: proposal.review_summary || "" };
      } else {
        item.splitParts = parts.map((part, index) => ({ title: part.theme_name || `New theme ${index + 1}`, rationale: part.description || "" }));
        const codeCount = (item.codes || []).length;
        const assignments = Array(codeCount).fill(-1);
        parts.forEach((part, partIndex) => (part.code_indexes || []).forEach((index) => {
          const normalized = Number(index);
          if (Number.isInteger(normalized) && normalized >= 0 && normalized < codeCount) assignments[normalized] = partIndex;
        }));
        assignments.forEach((value, index) => { if (value < 0) assignments[index] = index % parts.length; });
        item.splitAssignments = assignments;
        item.aiDraft = { generated: true, instruction, interpretation: proposal.instruction_interpretation || "", review: proposal.review_summary || "" };
      }
      item.assistMode = "manual";
    }
    item.aiDraft.requestedChanges = Array.isArray(proposal.interpretation_requested_changes)
      ? proposal.interpretation_requested_changes : [];
    item.aiDraft.preservedContent = Array.isArray(proposal.interpretation_preserved_content)
      ? proposal.interpretation_preserved_content : [];
    item.aiDraft.performance = proposal.performance_summary || "";
    item.aiDraft.editPlan = Array.isArray(proposal.edit_plan) ? proposal.edit_plan : [];
    item.aiDraft.originalInstruction = priorAiContext?.original_user_instruction || instruction;
    item.aiDraft.sourceUnderstanding = priorAiContext?.ai_understanding || {
      interpreted_request: item.aiDraft.interpretation,
      changes: item.aiDraft.requestedChanges,
      preserve: item.aiDraft.preservedContent,
    };
    item.aiDraft.previousAiUnderstanding = priorAiContext?.ai_understanding || null;
    item.aiDraft.isRefinement = Boolean(priorAiContext);
    if (action === "split") {
      item.aiDraft.splitParts = item.splitParts.map((part) => ({ ...part }));
      item.aiDraft.splitAssignments = [...item.splitAssignments];
    }
    isCode ? renderCodes() : renderThemes();
    toast(isRefinement ? "A different AI proposal is ready for review." : "AI proposal ready. Review and edit it before applying.");
  } catch (error) {
    button.disabled = false;
    button.textContent = isRefinement ? "Refine with AI" : item.aiDraft ? "Refine proposal" : "Generate proposal";
    if (status) status.textContent = error.message || "Could not generate a proposal.";
    toast(error.message || "Could not generate a proposal.");
  }
}

async function generateMergeAiDraft(entityType, container, refinement = false) {
  const isCode = entityType === "code";
  const status = container.querySelector(".ai-draft-status");
  const instruction = container.querySelector("[data-ai-instruction]")?.value.trim() || "";
  const selected = isCode ? reviewableCodes().filter((item) => item.selectedForMerge) : themes.filter((item) => item.selectedForMerge);
  const priorDraft = isCode ? codeMergeDraft : themeMergeDraft;
  const isRefinement = Boolean(refinement || priorDraft);
  const button = container.querySelector(isRefinement ? "[data-refine-merge-ai]" : "[data-generate-ai-draft]")
    || container.querySelector("[data-generate-ai-draft]");
  if (!button) return;
  if (!instruction && !isRefinement) {
    if (status) status.textContent = "Describe the merged result you want AI to create.";
    return toast("Tell AI how you want these items merged first.");
  }
  button.disabled = true;
  button.textContent = isRefinement ? "Working…" : "Generating…";
  if (status) status.textContent = isRefinement
    ? "AI is creating a different merge proposal."
    : "AI is understanding your instruction, then performing the merge.";
  try {
    const items = selected.map((item) => isCode ? codeAiEditPayload(item) : themeAiEditPayload(item));
    const rejectedProposal = priorDraft
      ? (isCode
        ? { code_name: priorDraft.title || "" }
        : { theme_name: priorDraft.title || "", description: priorDraft.rationale || "" })
      : null;
    const priorAiContext = rejectedProposal ? priorAiContextFromDraft(priorDraft) : null;
    const result = await requestAiEdit("merge", entityType, items, instruction, rejectedProposal, priorAiContext);
    if (result.proposal?.needs_clarification) {
      throw new Error(`AI needs clarification: ${result.proposal.clarification_question || "Please describe the intended outcome more precisely."}`);
    }
    if (result.proposal?.proposal_failed) {
      throw new Error(`AI could not create the proposal: ${result.proposal.failure_message || "Please try again or edit the item yourself."}`);
    }
    const proposal = result.proposal || {};
    const nextDraft = {
      ...proposal,
      title: isCode ? (proposal.code_name || "") : (proposal.theme_name || ""),
      ...(isCode ? {} : { rationale: proposal.description || "" }),
      instruction,
      originalInstruction: priorAiContext?.original_user_instruction || instruction,
      sourceUnderstanding: priorAiContext?.ai_understanding || null,
      previousAiUnderstanding: priorAiContext?.ai_understanding || null,
      isRefinement,
    };
    if (isCode) {
      codeMergeDraft = nextDraft;
      codeMergeAssistMode = "manual";
      renderCodes();
    } else {
      themeMergeDraft = nextDraft;
      themeMergeAssistMode = "manual";
      renderThemes();
    }
    toast(isRefinement ? "A different merge proposal is ready for review." : "AI proposal ready. Review and edit it before applying.");
  } catch (error) {
    button.disabled = false;
    button.textContent = isRefinement ? "Refine with AI" : "Generate proposal";
    if (status) status.textContent = error.message || "Could not generate a proposal.";
    toast(error.message || "Could not generate a proposal.");
  }
}

document.getElementById("codeList").addEventListener("click", (event) => {
  const reviewFilter = event.target.closest("[data-code-review-filter]");
  if (reviewFilter) {
    codeReviewFilter = reviewFilter.dataset.codeReviewFilter;
    renderCodes();
    return;
  }
  const mergeMemberToggle = event.target.closest("[data-code-merge-member-toggle]");
  if (mergeMemberToggle) {
    const member = mergeMemberToggle.closest(".code-merge-suggestion-member");
    const excerpts = member?.querySelector("[data-code-merge-member-excerpts]");
    const expanded = mergeMemberToggle.getAttribute("aria-expanded") === "true";
    mergeMemberToggle.setAttribute("aria-expanded", String(!expanded));
    mergeMemberToggle.classList.toggle("is-open", !expanded);
    if (excerpts) excerpts.hidden = expanded;
    const symbol = mergeMemberToggle.querySelector("b");
    if (symbol) symbol.textContent = expanded ? "+" : "−";
    return;
  }
  const matchChoice = event.target.closest("[data-code-match-choice]");
  if (matchChoice) {
    const matchCard = matchChoice.closest("[data-code-match-ai-id]");
    resolveHumanAiCodeMatch(matchCard?.dataset.codeMatchAiId, matchChoice.dataset.codeMatchChoice);
    return;
  }
  if (event.target.closest("#addCodeAfterFinishBtn")) {
    if (piReadOnlyMode || codeReviewStage !== "complete") return;
    newCodeEditorOpen = true;
    renderNewCodeEditor();
    document.querySelector('[data-new-code-field="title"]')?.focus();
    return;
  }
  if (event.target.closest("#finishCodingReminderBtn")) return finishCurrentAnalysis();
  if (event.target.closest("#exportCodingReminderBtn")) return exportCurrentAnalysis();
  if (event.target.closest("#startSeniorCodeMergeBtn")) {
    const memo = window.prompt("Required memo: why are you merging these codes?");
    if (!String(memo || "").trim()) return toast("A memo is required before merging codes.");
    seniorCodeMergeMemo = String(memo).trim();
    codeMergeAssistMode = "manual";
    codeAmendmentReturnStage = "complete";
    return changeCodeReviewStage("merge");
  }
  const suggestedMerge = event.target.closest("[data-use-code-merge-suggestion]");
  if (suggestedMerge) {
    const suggestion = codeMergeSuggestions.find((item) => String(item.id) === String(suggestedMerge.dataset.useCodeMergeSuggestion));
    if (!suggestion) return;
    const selectedIds = new Set((suggestion.member_ids || []).map(String));
    const availableIds = new Set(mergeSuggestionEligibleCodes().map((code) => String(code.id)));
    const usableIds = new Set([...selectedIds].filter((id) => availableIds.has(id)));
    if (usableIds.size < 2) return toast("This suggestion is no longer available. Refresh the suggestions or select codes manually.");
    const suggestedName = suggestedMerge.closest(".code-merge-suggestion-card")
      ?.querySelector("[data-code-merge-suggested-name]")?.value.trim();
    if (!suggestedName) return toast("Enter a merged code name before using this suggestion.");
    codes = codes.map((code) => ({ ...code, selectedForMerge: usableIds.has(String(code.id)) }));
    codeMergeStartedAt = Date.now();
    return mergeSelectedCodes({
      titleOverride: suggestedName,
      suggestion,
      autoAccept: true,
    });
  }
  const dismissedMerge = event.target.closest("[data-dismiss-code-merge-suggestion]");
  if (dismissedMerge) {
    dismissedCodeMergeSuggestionIds.add(String(dismissedMerge.dataset.dismissCodeMergeSuggestion));
    renderCodes();
    revealNextCodeMergeSuggestion();
    return;
  }
  if (event.target.closest("#retryCodeMergeSuggestionsBtn")) {
    codeMergeSuggestionStatus = "idle";
    codeMergeSuggestionError = "";
    renderCodes();
    return;
  }
  if (event.target.closest("#startCodeMergeBtn")) {
    codeMergeSuggestedName = "";
    codes = codes.map((code) => ({ ...code, selectedForMerge: false }));
    return changeCodeReviewStage("merge");
  }
  if (event.target.closest("#skipCodeMergeBtn")) return changeCodeReviewStage(codeStageAfterMerge());
  if (event.target.closest("#finishCodeMergeBtn")) return changeCodeReviewStage(codeStageAfterMerge());
  if (event.target.closest("#addAdditionalCodesChoiceBtn")) return changeCodeReviewStage("additional");
  if (event.target.closest("#skipAdditionalCodesChoiceBtn")) return changeCodeReviewStage("complete");
  if (event.target.closest("#finishManualCodeReuseBtn")) {
    manualCodeReuseFinished = true;
    markSaved();
    toast("Selected unmatched Human codes were added.");
    return changeCodeReviewStage("additional-choice");
  }
  if (event.target.closest("#skipManualCodeReuseBtn")) {
    unmatchedPreAiHumanCodes().forEach((code) => {
      code.includedAfterAiReview = false;
    });
    manualCodeReuseFinished = true;
    markSaved();
    return changeCodeReviewStage("additional-choice");
  }
  const detailToggle = event.target.closest("[data-code-toggle]");
  if (detailToggle) {
    setExpandedCode(detailToggle.dataset.codeToggle, { scrollTranscript: true, scrollDetails: true });
    return;
  }
  const agentButton = event.target.closest("[data-agent-id]");
  if (agentButton) {
    openAgentProfile(agentButton.dataset.agentId);
    return;
  }
  if (event.target.closest("#mergeCodesBtn")) {
    mergeCodeEditorOpen = true;
    codeMergeStartedAt = Date.now();
    codeMergeAssistMode = piReadOnlyMode && seniorCodeEditMode ? "manual" : "";
    codeMergeDraft = null;
    renderCodes();
    return;
  }
  const assistMode = event.target.closest("[data-assist-mode]");
  if (assistMode) {
    const card = assistMode.closest("[data-code-id]");
    const code = codes.find((item) => String(item.id) === String(card?.dataset.codeId));
    if (!code) return;
    code.assistMode = assistMode.dataset.assistMode;
    renderCodes();
    requestAnimationFrame(() => revealExpandedCodeCard(code.id, { focusEditor: code.assistMode === "manual" }));
    return;
  }
  const aiDraftButton = event.target.closest("[data-generate-ai-draft]");
  if (aiDraftButton) return generateCardAiDraft(aiDraftButton.closest("[data-code-id]"), "code");
  const refineButton = event.target.closest("[data-refine-ai-proposal]");
  if (refineButton) return generateCardAiDraft(refineButton.closest("[data-code-id]"), "code", true);
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest("[data-code-id]");
  if (!card) return;
  updateCodeReview(card.dataset.codeId, button.dataset.action);
});

document.getElementById("codeList").addEventListener("input", (event) => {
  const suggestedNameInput = event.target.closest("[data-code-merge-suggested-name]");
  if (suggestedNameInput) {
    const useButton = suggestedNameInput.closest(".code-merge-suggestion-card")
      ?.querySelector("[data-use-code-merge-suggestion]");
    if (useButton) useButton.disabled = !suggestedNameInput.value.trim();
    return;
  }
  if (event.target.matches(".revise-panel textarea, .ai-instruction-box textarea")) {
    event.target.style.height = "auto";
    event.target.style.height = String(event.target.scrollHeight + 2) + "px";
    event.target.style.overflowY = "hidden";
  }
});

document.getElementById("codeList").addEventListener("change", (event) => {
  const splitCount = event.target.closest("[data-code-split-count]");
  if (splitCount) {
    const card = splitCount.closest("[data-code-id]");
    if (!card) return;
    updateCodeReview(card.dataset.codeId, "set-split-count", splitCount);
    return;
  }
  const manualCodeCheckbox = event.target.closest("[data-include-manual-code]");
  if (manualCodeCheckbox) {
    const manualCode = codes.find((code) => String(code.id) === String(manualCodeCheckbox.dataset.includeManualCode));
    if (!manualCode) return;
    manualCode.includedAfterAiReview = manualCodeCheckbox.checked;
    markSaved();
    renderCodes();
    return;
  }
  const checkbox = event.target.closest("[data-code-select]");
  if (!checkbox) return;
  const card = checkbox.closest("[data-code-id]");
  const code = codes.find((item) => String(item.id) === String(card?.dataset.codeId));
  if (!code) return;
  code.selectedForMerge = checkbox.checked;
  codeMergeSuggestedName = "";
  if (!checkbox.checked && reviewableCodes().filter((item) => item.selectedForMerge).length < 2) mergeCodeEditorOpen = false;
  renderCodes();
});

document.getElementById("mergeCodeEditor")?.addEventListener("click", (event) => {
  const assistMode = event.target.closest("[data-assist-mode]");
  if (assistMode) {
    codeMergeAssistMode = assistMode.dataset.assistMode;
    renderMergeCodeEditor();
    requestAnimationFrame(() => document.getElementById("mergeCodeEditor")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  } else if (event.target.closest("[data-generate-ai-draft]")) {
    generateMergeAiDraft("code", event.currentTarget);
  } else if (event.target.closest("[data-refine-merge-ai]")) {
    generateMergeAiDraft("code", event.currentTarget, true);
  } else if (event.target.closest("#saveMergedCodeBtn")) {
    mergeSelectedCodes();
  } else if (event.target.closest("#cancelMergedCodeBtn")) {
    mergeCodeEditorOpen = false;
    codeMergeAssistMode = "";
    codeMergeDraft = null;
    renderCodes();
  }
});

document.getElementById("newCodeBtn").addEventListener("click", () => {
  if (codeReviewStage !== "additional") return;
  newCodeEditorOpen = true;
  renderNewCodeEditor();
  renderNewCodeGate();
  document.querySelector('[data-new-code-field="title"]')?.focus();
});
document.getElementById("finishAddingHumanCodesBtn")?.addEventListener("click", () => {
  newCodeEditorOpen = false;
  changeCodeReviewStage("complete");
});

document.getElementById("newCodeEditor").addEventListener("click", (event) => {
  if (event.target.closest("#saveNewCodeBtn")) {
    saveNewCode();
  } else if (event.target.closest("#cancelNewCodeBtn")) {
    newCodeEditorOpen = false;
    renderNewCodeEditor();
    renderNewCodeGate();
  }
});

document.querySelectorAll("[data-workspace-nav]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.workspaceNav === "codes" && button.dataset.codingWorkspaceMode) {
      const mode = button.dataset.codingWorkspaceMode;
      if (mode === "human" && piReadOnlyMode) return;
      const modeChanged = codingWorkspaceMode !== mode;
      if (modeChanged) {
        if (activeReviewTimer?.kind === "code") flushActiveReviewTimer();
        pauseWorkflowTiming();
      }
      setCodingWorkspaceMode(mode);
      setWorkspacePage("codes");
      renderTranscript(document.getElementById("transcriptSearch")?.value || "");
      renderCodes();
      if (mode === "ai" && activeTranscriptFile && !analysisReady) {
        if (!transcriptDisplayedAt || (!readingGateTimer && readingElapsedMs < READING_TRACKING_CAP_MS)) {
          startReadingGate(Boolean(transcriptDisplayedAt));
        }
        await ensureBackgroundAiCoding(activeTranscriptFile);
      }
      return;
    }
    if (button.dataset.workspaceNav === "themes" && button.dataset.themeWorkspaceMode) {
      if (piReadOnlyMode) return openPiReadOnlyThemes();
      if (!setThemeWorkspaceMode(button.dataset.themeWorkspaceMode, { render: false })) return;
      setWorkspacePage("themes");
      renderThemes();
      return;
    }
    setWorkspacePage(button.dataset.workspaceNav);
  });
});

document.getElementById("themeJsonFiles")?.addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])];
  if (files.length === 0) {
    themeJsonFiles = [];
    themeCodeInputs = [];
    latestCodebook = null;
    latestCodebookId = null;
    themes = [];
    originalAiThemes = [];
    preGenerationHumanThemes = [];
    humanThemesFinished = false;
    manualThemeReuseFinished = false;
    themeGenerationStarted = false;
    themeReviewStage = "idle";
    codebookExpanded = false;
    selectedCodebookEntryIndex = null;
    themeCodebookFilter = "keep-all";
    resetCodebookReviewState();
    mergeThemeEditorOpen = false;
    newThemeEditorOpen = false;
    clearManualThemeFields();
    document.getElementById("themeUploadStatus").textContent = "No ReflexCoTI JSON files uploaded yet.";
    updateThemeWorkflowButtons();
    renderThemes();
    return;
  }
  try {
    await loadThemeJsonFiles(files);
    toast("Coding exports loaded.");
  } catch (error) {
    event.target.value = "";
    themeJsonFiles = [];
    themeCodeInputs = [];
    latestCodebook = null;
    latestCodebookId = null;
    themes = [];
    originalAiThemes = [];
    preGenerationHumanThemes = [];
    humanThemesFinished = false;
    manualThemeReuseFinished = false;
    themeGenerationStarted = false;
    themeReviewStage = "idle";
    codebookExpanded = false;
    selectedCodebookEntryIndex = null;
    themeCodebookFilter = "keep-all";
    resetCodebookReviewState();
    mergeThemeEditorOpen = false;
    newThemeEditorOpen = false;
    clearManualThemeFields();
    document.getElementById("themeUploadStatus").textContent = error.message || "Could not read the selected JSON files.";
    updateThemeWorkflowButtons();
    renderThemes();
    toast(error.message || "Could not read the selected JSON files.");
  }
});

document.getElementById("skipResearchQuestionRefinement")?.addEventListener("click", skipCodebookResearchQuestionRefinement);
document.getElementById("startResearchQuestionRefinement")?.addEventListener("click", () => setCodebookResearchQuestionStep(true));
document.getElementById("backToResearchQuestionChoice")?.addEventListener("click", () => setCodebookResearchQuestionStep(false));
document.getElementById("codebookResearchQuestionForm")?.addEventListener("submit", saveRefinedCodebookResearchQuestion);

document.getElementById("generateCodebookBtn")?.addEventListener("click", generateCodebookFromUploadedFiles);
document.getElementById("finishCodebookReviewBtn")?.addEventListener("click", finishCodebookReview);
document.getElementById("generateThemesBtn")?.addEventListener("click", generateThemesFromUploadedCodes);
document.getElementById("openHumanThemesBtn")?.addEventListener("click", () => setThemeWorkspaceMode("human"));
document.getElementById("openAiThemesBtn")?.addEventListener("click", () => setThemeWorkspaceMode("ai"));
document.getElementById("returnToCodebookBtn")?.addEventListener("click", () => returnToCodebook().catch((error) => toast(error.message)));
document.getElementById("cancelSourceCodeEdit")?.addEventListener("click", () => closeSourceCodeEditConfirmation());
document.getElementById("confirmSourceCodeEdit")?.addEventListener("click", () => {
  const pending = pendingCodebookSourceEdit;
  if (!pending) return;
  closeSourceCodeEditConfirmation({ restoreFocus: false });
  openCodebookSourceCode(pending.entryIndex, pending.refIndex, { confirmed: true }).catch((error) => toast(error.message));
});
document.getElementById("sourceCodeEditConfirmModal")?.addEventListener("click", (event) => {
  if (event.target.id === "sourceCodeEditConfirmModal") closeSourceCodeEditConfirmation();
});

document.getElementById("codebookContent")?.addEventListener("click", (event) => {
  if (event.target.closest("#toggleAiDeleteSuggestionsBtn")) {
    codebookAiSuggestionsOpen = !codebookAiSuggestionsOpen;
    renderCodebookPanel();
    if (codebookAiSuggestionsOpen) window.requestAnimationFrame(() => {
      document.querySelector(".codebook-entry-group.ai-delete-suggested")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return;
  }
  const aiDeleteTarget = event.target.closest("[data-ai-delete-target]");
  if (aiDeleteTarget) {
    const entryIndex = Number(aiDeleteTarget.dataset.aiDeleteTarget);
    selectedCodebookEntryIndex = entryIndex;
    renderCodebookPanel();
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-codebook-entry-group="${entryIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return;
  }
  if (event.target.closest("#undoCodebookChangeBtn")) return undoCodebookChange();
  if (event.target.closest("#reopenCodebookReviewBtn")) return reopenCodebookReview();
  if (event.target.closest("#toggleCodebookHistoryBtn")) {
    codebookHistoryOpen = !codebookHistoryOpen;
    renderCodebookPanel();
    return;
  }
  const removeEvidenceButton = event.target.closest("[data-codebook-remove-entry]");
  if (removeEvidenceButton) return removeCodebookEvidence(
    Number(removeEvidenceButton.dataset.codebookRemoveEntry),
    Number(removeEvidenceButton.dataset.codebookRemoveRef),
    Number(removeEvidenceButton.dataset.codebookRemoveExcerpt),
  );
  const deleteCodeButton = event.target.closest("[data-codebook-delete]");
  if (deleteCodeButton) return requestDeleteCodebookEntry(Number(deleteCodeButton.dataset.codebookDelete));
  const confirmDeleteCodeButton = event.target.closest("[data-codebook-delete-confirm]");
  if (confirmDeleteCodeButton) return deleteCodebookEntry(Number(confirmDeleteCodeButton.dataset.codebookDeleteConfirm));
  if (event.target.closest("[data-codebook-delete-cancel]")) return cancelDeleteCodebookEntry();
  const quickMergeButton = event.target.closest("[data-codebook-open-merge]");
  if (quickMergeButton) return openCodebookMergeControls(Number(quickMergeButton.dataset.codebookOpenMerge));
  const splitButton = event.target.closest("[data-codebook-split]");
  if (splitButton) return beginSplitCodebookCode(Number(splitButton.dataset.codebookSplit));
  const splitNameSuggestion = event.target.closest("[data-codebook-split-name-suggestion]");
  if (splitNameSuggestion) {
    const nameIndex = Number(splitNameSuggestion.dataset.codebookSplitNameSuggestion);
    codebookSplitDraft.names[nameIndex] = splitNameSuggestion.dataset.codebookSuggestedName || "";
    renderCodebookPanel();
    return;
  }
  const mergeNameSuggestion = event.target.closest("[data-codebook-merge-name-suggestion]");
  if (mergeNameSuggestion) {
    codebookMergeCustomName = mergeNameSuggestion.dataset.codebookSuggestedName || "";
    codebookPendingMerge = null;
    renderCodebookPanel();
    return;
  }
  if (event.target.closest("[data-codebook-split-cancel]")) return cancelSplitCodebookCode();
  if (event.target.closest("[data-codebook-split-add]")) return changeCodebookSplitPartCount(1);
  if (event.target.closest("[data-codebook-split-remove]")) return changeCodebookSplitPartCount(-1);
  const splitSaveButton = event.target.closest("[data-codebook-split-save]");
  if (splitSaveButton) return splitCodebookCode(Number(splitSaveButton.dataset.codebookSplitSave));
  if (event.target.closest("[data-codebook-merge-confirm]")) {
    if (!codebookPendingMerge) return;
    return mergeCodebookCodes(codebookPendingMerge.sourceIndexes, codebookPendingMerge.targetIndex, codebookPendingMerge.resultName);
  }
  if (event.target.closest("[data-codebook-merge-confirm-cancel]")) {
    codebookPendingMerge = null;
    renderCodebookPanel();
    return;
  }
  if (event.target.closest("[data-codebook-merge-cancel]")) return cancelMergeCodebookCode();
  const mergeButton = event.target.closest("[data-codebook-merge]");
  if (mergeButton) {
    return beginMergeCodebookCode();
  }
   const manualCodeButton = event.target.closest("[data-manual-theme-code]");
  if (manualCodeButton) {
    beginManualPhaseTiming();
    toggleManualThemeCode(manualCodeButton.dataset.manualThemeCode || "");
    return;
  }
  const toggleButton = event.target.closest("#toggleCodebookEntries");
  if (toggleButton) {
    codebookExpanded = !codebookExpanded;
    const visibleIndexes = filteredCodebookItems().slice(0, 8).map(({ index }) => index);
    if (!codebookExpanded && !visibleIndexes.includes(selectedCodebookEntryIndex)) {
      selectedCodebookEntryIndex = null;
    }
    renderCodebookPanel();
    return;
  }
  const entryButton = event.target.closest("[data-codebook-entry]");
  if (!entryButton) return;
  const entryIndex = Number(entryButton.dataset.codebookEntry);
  codebookSplittingEntryIndex = null;
  codebookMergingEntryIndex = null;
  codebookMergeSelectedIndexes = [];
  codebookMergeNameIndex = null;
  codebookMergeUsesCustomName = false;
  codebookMergeCustomName = "";
  codebookSplitDraft = { names: [], assignments: [] };
  codebookPendingMerge = null;
  codebookPendingDeleteIndex = null;
  selectedCodebookEntryIndex = selectedCodebookEntryIndex === entryIndex ? null : entryIndex;
  renderCodebookPanel();
});

document.getElementById("codebookContent")?.addEventListener("dblclick", (event) => {
  const renameButton = event.target.closest("[data-codebook-start-rename]");
  if (renameButton) beginRenameCodebookEntry(Number(renameButton.dataset.codebookStartRename));
});

function filterCodebookNameSuggestions(input) {
  const suggestions = input?.closest(".codebook-name-combobox")?.querySelector(".codebook-name-suggestions");
  if (!suggestions) return;
  const query = String(input.value || "").trim().toLowerCase();
  let visibleCount = 0;
  suggestions.querySelectorAll("button").forEach((button) => {
    const matches = !query || String(button.textContent || "").toLowerCase().includes(query);
    button.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  suggestions.classList.toggle("no-matches", Boolean(query) && visibleCount === 0);
}

document.getElementById("codebookContent")?.addEventListener("input", (event) => {
  const mergeCustomNameInput = event.target.closest("[data-codebook-merge-custom-name]");
  if (mergeCustomNameInput) {
    codebookMergeCustomName = mergeCustomNameInput.value;
    filterCodebookNameSuggestions(mergeCustomNameInput);
    codebookPendingMerge = null;
    const mergeButton = document.querySelector("[data-codebook-merge]");
    if (mergeButton) mergeButton.disabled = codebookMergeSelectedIndexes.length < 2 || !codebookMergeCustomName.trim();
    return;
  }
  const input = event.target.closest("[data-codebook-split-name]");
  if (!input) return;
  const nameIndex = Number(input.dataset.codebookSplitName);
  codebookSplitDraft.names[nameIndex] = input.value;
  filterCodebookNameSuggestions(input);
  document.querySelectorAll("[data-codebook-split-assignment]").forEach((select) => {
    const option = select.options[nameIndex + 1];
    if (option) option.textContent = input.value.trim() || `New code ${nameIndex + 1}`;
  });
});

document.getElementById("codebookContent")?.addEventListener("keydown", (event) => {
  const renameButton = event.target.closest("[data-codebook-start-rename]");
  if (renameButton && event.key === "Enter") {
    event.preventDefault();
    beginRenameCodebookEntry(Number(renameButton.dataset.codebookStartRename));
    return;
  }
  const splitCustomNameInput = event.target.closest("[data-codebook-split-name]");
  if (splitCustomNameInput && event.key === "Escape") {
    event.preventDefault();
    const nameIndex = Number(splitCustomNameInput.dataset.codebookSplitName);
    codebookSplitDraft.names[nameIndex] = "";
    codebookSplitDraft.nameModes[nameIndex] = "";
    renderCodebookPanel();
    return;
  }
  const mergeCustomNameInput = event.target.closest("[data-codebook-merge-custom-name]");
  if (mergeCustomNameInput && event.key === "Escape") {
    event.preventDefault();
    codebookMergeUsesCustomName = false;
    codebookMergeCustomName = "";
    codebookMergeNameIndex = null;
    renderCodebookPanel();
    return;
  }
  const nameInput = event.target.closest("[data-codebook-name]");
  if (!nameInput) return;
  if (event.key === "Enter") {
    event.preventDefault();
    renameCodebookEntry(Number(nameInput.dataset.codebookName), nameInput.value);
  } else if (event.key === "Escape") {
    event.preventDefault();
    codebookRenamingEntryIndex = null;
    renderCodebookPanel();
  }
});

document.getElementById("codebookContent")?.addEventListener("change", (event) => {
  const nameInput = event.target.closest("[data-codebook-name]");
  if (nameInput) return renameCodebookEntry(Number(nameInput.dataset.codebookName), nameInput.value);
  const mergeChoice = event.target.closest("[data-codebook-merge-choice]");
  if (mergeChoice) {
    const entryIndex = Number(mergeChoice.dataset.codebookMergeChoice);
    codebookMergeSelectedIndexes = mergeChoice.checked
      ? [...new Set([...codebookMergeSelectedIndexes, entryIndex])]
      : codebookMergeSelectedIndexes.filter((index) => index !== entryIndex);
    if (!codebookMergeSelectedIndexes.includes(codebookMergeNameIndex)) {
      codebookMergeNameIndex = null;
      if (!codebookMergeUsesCustomName) codebookMergeCustomName = "";
    }
    codebookPendingMerge = null;
    renderCodebookPanel();
    return;
  }
  const mergeNameSelect = event.target.closest("[data-codebook-merge-name]");
  if (mergeNameSelect) {
    codebookMergeUsesCustomName = mergeNameSelect.value === "__custom__";
    if (codebookMergeUsesCustomName) {
      codebookMergeNameIndex = null;
      codebookMergeCustomName = "";
    } else {
      const selectedIndex = mergeNameSelect.value === "" ? null : Number(mergeNameSelect.value);
      codebookMergeNameIndex = Number.isInteger(selectedIndex) && codebookMergeSelectedIndexes.includes(selectedIndex) ? selectedIndex : null;
      codebookMergeCustomName = Number.isInteger(codebookMergeNameIndex) ? codebookEntryName(latestCodebook?.entries?.[codebookMergeNameIndex]) : "";
    }
    codebookPendingMerge = null;
    renderCodebookPanel();
    if (codebookMergeUsesCustomName) window.requestAnimationFrame(() => document.querySelector("[data-codebook-merge-custom-name]")?.focus());
    return;
  }
  const splitNameChoice = event.target.closest("[data-codebook-split-name-choice]");
  if (splitNameChoice) {
    const nameIndex = Number(splitNameChoice.dataset.codebookSplitNameChoice);
    codebookSplitDraft.nameModes = [...(codebookSplitDraft.nameModes || [])];
    if (splitNameChoice.value === "__custom__") {
      codebookSplitDraft.nameModes[nameIndex] = "custom";
      codebookSplitDraft.names[nameIndex] = "";
    } else {
      codebookSplitDraft.nameModes[nameIndex] = splitNameChoice.value ? "original" : "";
      codebookSplitDraft.names[nameIndex] = splitNameChoice.value;
    }
    renderCodebookPanel();
    if (splitNameChoice.value === "__custom__") window.requestAnimationFrame(() => document.querySelector(`[data-codebook-split-name="${nameIndex}"]`)?.focus());
    return;
  }
  const moveSelect = event.target.closest("[data-codebook-move-entry]");
  if (moveSelect) {
    const targetIndex = moveSelect.value === "" ? -1 : Number(moveSelect.value);
    if (targetIndex >= 0) moveCodebookEvidence(
      Number(moveSelect.dataset.codebookMoveEntry),
      Number(moveSelect.dataset.codebookMoveRef),
      Number(moveSelect.dataset.codebookMoveExcerpt),
      targetIndex,
    );
    return;
  }
  const select = event.target.closest("[data-codebook-split-assignment]");
  if (!select) return;
  codebookSplitDraft.assignments[Number(select.dataset.codebookSplitAssignment)] = select.value;
});

document.getElementById("themeList")?.addEventListener("click", (event) => {
  const matchChoice = event.target.closest("[data-theme-match-choice]");
  if (matchChoice) {
    const matchCard = matchChoice.closest("[data-theme-match-ai-id]");
    resolveHumanAiThemeMatch(matchCard?.dataset.themeMatchAiId, matchChoice.dataset.themeMatchChoice);
    return;
  }
  const agentButton = event.target.closest("[data-agent-id]");
  if (agentButton) {
    openAgentProfile(agentButton.dataset.agentId);
    return;
  }
  const detailToggle = event.target.closest("[data-theme-toggle]");
  if (detailToggle) {
    setExpandedTheme(detailToggle.dataset.themeToggle);
    return;
  }
  const focusedThemeCard = event.target.closest("[data-theme-id]");
  if (focusedThemeCard && themeWorkspaceMode === "ai") {
    highlightedThemeId = focusedThemeCard.dataset.themeId;
    document.querySelectorAll("#themeList [data-theme-id]").forEach((card) => {
      card.classList.toggle("codebook-focus", String(card.dataset.themeId) === String(highlightedThemeId));
    });
    renderCodebookPanel();
  }
  if (event.target.closest("#openHumanThemesFromAiBtn")) return setThemeWorkspaceMode("human");
  if (event.target.closest("#addThemeAfterFinishBtn")) {
    if (piReadOnlyMode || themeReviewStage !== "complete") return;
    newThemeEditorOpen = true;
    renderThemes();
    document.querySelector('[data-new-theme-field="title"]')?.focus();
    return;
  }
  if (event.target.closest("#finishThemeReminderBtn")) return finishCurrentAnalysis();
  if (event.target.closest("#exportThemeReminderBtn")) return exportCurrentAnalysis();
  if (event.target.closest("#startThemeMergeBtn")) {
    if (piReadOnlyMode && seniorThemeEditMode) {
      const memo = window.prompt("Required memo: why are you merging these themes?");
      if (!String(memo || "").trim()) return toast("A memo is required before merging themes.");
      seniorThemeMergeMemo = String(memo).trim();
      themeMergeAssistMode = "manual";
    }
    return changeThemeReviewStage("merge");
  }
  if (event.target.closest("#skipThemeMergeBtn")) return changeThemeReviewStage(piReadOnlyMode ? "complete" : "additional-choice");
  if (event.target.closest("#finishThemeMergeBtn")) return changeThemeReviewStage(piReadOnlyMode ? "complete" : "additional-choice");
  if (event.target.closest("#addAdditionalThemesChoiceBtn")) return changeThemeReviewStage("additional");
  if (event.target.closest("#skipAdditionalThemesChoiceBtn")) return changeThemeReviewStage("complete");
  if (event.target.closest("#finishManualThemeReuseBtn")) {
    manualThemeReuseFinished = true;
    markSaved();
    renderThemes();
    toast("Human Themes selection complete.");
    return;
  }
  if (event.target.closest("#editManualThemeReuseBtn")) {
    manualThemeReuseFinished = false;
    markSaved();
    renderThemes();
    return;
  }
  if (event.target.closest("#finishAddingHumanThemesBtn")) {
    newThemeEditorOpen = false;
    changeThemeReviewStage("complete");
    return;
  }
  const codeToggle = event.target.closest("[data-theme-codes-toggle]");
  if (codeToggle) {
    const card = codeToggle.closest("[data-theme-id]");
    const theme = themes.find((item) => String(item.id) === String(card?.dataset.themeId));
    if (!theme) return;
    theme.codesExpanded = !theme.codesExpanded;
    renderThemes();
    return;
  }
  if (event.target.closest("#newThemeBtn")) {
    if (themeReviewStage !== "additional") return;
    newThemeEditorOpen = true;
    renderThemes();
    document.querySelector('[data-new-theme-field="title"]')?.focus();
    return;
  }
  if (event.target.closest("#saveNewThemeBtn")) {
    saveNewTheme();
    return;
  }
  if (event.target.closest("#cancelNewThemeBtn")) {
    newThemeEditorOpen = false;
    renderThemes();
    return;
  }
  if (event.target.closest("#mergeThemesBtn")) {
    mergeThemeEditorOpen = true;
    themeMergeStartedAt = Date.now();
    themeMergeAssistMode = piReadOnlyMode && seniorThemeEditMode ? "manual" : "";
    themeMergeDraft = null;
    renderThemes();
    document.getElementById("mergedThemeTitle")?.focus();
    return;
  }
  const assistMode = event.target.closest("[data-assist-mode]");
  if (assistMode) {
    const card = assistMode.closest("[data-theme-id]");
    const theme = themes.find((item) => String(item.id) === String(card?.dataset.themeId));
    if (!theme) return;
    theme.assistMode = assistMode.dataset.assistMode;
    renderThemes();
    return;
  }
  const aiDraftButton = event.target.closest("[data-generate-ai-draft]");
  if (aiDraftButton) return generateCardAiDraft(aiDraftButton.closest("[data-theme-id]"), "theme");
  const refineButton = event.target.closest("[data-refine-ai-proposal]");
  if (refineButton) return generateCardAiDraft(refineButton.closest("[data-theme-id]"), "theme", true);
  const button = event.target.closest("[data-theme-action]");
  if (!button) return;
  const card = button.closest("[data-theme-id]");
  if (!card) return;
  updateThemeReview(card.dataset.themeId, button.dataset.themeAction, button);
});

document.getElementById("themeList")?.addEventListener("focusin", (event) => {
  const focusedThemeCard = event.target.closest("[data-theme-id]");
  if (!focusedThemeCard || themeWorkspaceMode !== "ai") return;
  highlightedThemeId = focusedThemeCard.dataset.themeId;
  document.querySelectorAll("#themeList [data-theme-id]").forEach((card) => {
    card.classList.toggle("codebook-focus", String(card.dataset.themeId) === String(highlightedThemeId));
  });
  renderCodebookPanel();
});

document.getElementById("themeList")?.addEventListener("change", (event) => {
  const manualThemeCheckbox = event.target.closest("[data-include-manual-theme]");
  if (manualThemeCheckbox) {
    const manualTheme = preGenerationHumanThemes.find((theme) => String(theme.id) === String(manualThemeCheckbox.dataset.includeManualTheme));
    if (!manualTheme) return;
    manualTheme.includedAfterAiReview = manualThemeCheckbox.checked;
    markSaved();
    renderThemes();
    return;
  }
  const codeChoice = event.target.closest("[data-theme-split-code]");
  if (codeChoice) {
    const card = codeChoice.closest("[data-theme-id]");
    const part = codeChoice.closest("[data-theme-split-part]");
    const theme = themes.find((item) => String(item.id) === String(card?.dataset.themeId));
    const codeIndex = Number(codeChoice.dataset.themeSplitCode);
    const partIndex = Number(part?.dataset.themeSplitPart);
    if (!theme || !Number.isInteger(codeIndex) || !Number.isInteger(partIndex)) return;
    if (!Array.isArray(theme.splitAssignments) || theme.splitAssignments.length !== theme.codes.length) {
      theme.splitAssignments = theme.codes.map(() => -1);
    }
    if (codeChoice.checked) {
      theme.splitAssignments[codeIndex] = partIndex;
      card.querySelectorAll(`[data-theme-split-code="${codeIndex}"]`).forEach((checkbox) => {
        checkbox.checked = checkbox === codeChoice;
      });
    } else if (Number(theme.splitAssignments[codeIndex]) === partIndex) {
      theme.splitAssignments[codeIndex] = -1;
    }
    markSaved();
    return;
  }
  const splitCount = event.target.closest("[data-theme-split-count]");
  if (splitCount) {
    const card = splitCount.closest("[data-theme-id]");
    if (!card) return;
    updateThemeReview(card.dataset.themeId, "set-split-count", splitCount);
    return;
  }
  const checkbox = event.target.closest("[data-theme-select]");
  if (!checkbox) return;
  if (themeReviewStage !== "merge") return;
  const card = checkbox.closest("[data-theme-id]");
  const theme = themes.find((item) => String(item.id) === String(card?.dataset.themeId));
  if (!theme) return;
  theme.selectedForMerge = checkbox.checked;
  if (!checkbox.checked) mergeThemeEditorOpen = false;
  renderThemes();
});

["pointerover", "focusin"].forEach((eventName) => document.getElementById("themeList")?.addEventListener(eventName, (event) => {
  const card = event.target.closest("[data-theme-id]");
  const theme = themes.find((item) => String(item.id) === String(card?.dataset.themeId));
  if (theme && String(theme.id) === String(expandedThemeId || "") && ["review", "merge-review"].includes(themeReviewStage) && !themeReviewIsDecided(theme)) {
    syncActiveReviewTimer("theme", theme);
  }
}));

["pointerdown", "keydown", "scroll"].forEach((eventName) => {
  document.addEventListener(eventName, () => {
    recordReviewActivity();
    recordWorkflowActivity();
  }, { passive: true, capture: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flushActiveReviewTimer();
    pauseWorkflowTiming();
    pauseQuestionnaireTiming("coding");
    pauseQuestionnaireTiming("theme");
  }
  else {
    startWorkflowTimingSession();
    if (currentWorkspacePage === "codes" && codeReviewStage === "review") {
      const expandedCode = codes.find((code) => String(code.id) === String(expandedCodeId || ""));
      if (expandedCode && !codeReviewIsDecided(expandedCode)) syncActiveReviewTimer("code", expandedCode);
    } else if (currentWorkspacePage === "themes" && ["review", "merge-review"].includes(themeReviewStage)) {
      const expandedTheme = themes.find((theme) => String(theme.id) === String(expandedThemeId || ""));
      if (expandedTheme && !themeReviewIsDecided(expandedTheme)) syncActiveReviewTimer("theme", expandedTheme);
    }
  }
});
window.addEventListener("blur", () => {
  flushActiveReviewTimer();
  pauseWorkflowTiming();
  pauseQuestionnaireTiming("coding");
  pauseQuestionnaireTiming("theme");
});
window.addEventListener("focus", () => {
  startWorkflowTimingSession();
  if (currentWorkspacePage === "codes" && codeReviewStage === "review") {
    const expandedCode = codes.find((code) => String(code.id) === String(expandedCodeId || ""));
    if (expandedCode && !codeReviewIsDecided(expandedCode)) syncActiveReviewTimer("code", expandedCode);
  } else if (currentWorkspacePage === "themes" && ["review", "merge-review"].includes(themeReviewStage)) {
    const expandedTheme = themes.find((theme) => String(theme.id) === String(expandedThemeId || ""));
    if (expandedTheme && !themeReviewIsDecided(expandedTheme)) syncActiveReviewTimer("theme", expandedTheme);
  }
});

document.getElementById("mergeThemeEditor")?.addEventListener("click", (event) => {
  const assistMode = event.target.closest("[data-assist-mode]");
  if (assistMode) {
    themeMergeAssistMode = assistMode.dataset.assistMode;
    renderMergeThemeEditor();
  } else if (event.target.closest("[data-generate-ai-draft]")) {
    generateMergeAiDraft("theme", event.currentTarget);
  } else if (event.target.closest("[data-refine-merge-ai]")) {
    generateMergeAiDraft("theme", event.currentTarget, true);
  } else if (event.target.closest("#saveMergedThemeBtn")) {
    mergeSelectedThemes();
  } else if (event.target.closest("#cancelMergedThemeBtn")) {
    mergeThemeEditorOpen = false;
    themeMergeAssistMode = "";
    themeMergeDraft = null;
    renderThemes();
  }
});

function backgroundAiFormData(file) {
  const formData = new FormData();
  formData.append("project_id", currentProject.id);
  formData.append("transcript_id", file.id);
  formData.append("transcript_text", transcript.map((item) => item.text).join("\n"));
  formData.append("research_question", document.getElementById("researchQuestion").value);
  formData.append("interviewee", document.getElementById("interviewee").value);
  formData.append("azure_endpoint", document.getElementById("azureEndpoint").value);
  formData.append("api_key", document.getElementById("apiKey").value);
  formData.append("api_version", document.getElementById("apiVersion").value);
  formData.append("model", document.getElementById("model").value);
  return formData;
}

function updateBackgroundAiControl() {
  const button = document.getElementById("identifyCodesBottom");
  if (!button) return;
  const transcriptId = String(activeTranscriptFile?.id || "");
  const entry = transcriptId ? backgroundAiJobs.get(transcriptId) : null;

  if (analysisReady) {
    button.disabled = true;
    button.textContent = "Codes & excerpts ready";
  } else if (entry?.status === "failed") {
    button.disabled = false;
    button.textContent = "Retry AI coding";
  } else if (entry?.status === "completed") {
    button.disabled = true;
    button.textContent = "AI results waiting for transcript end";
  } else if (["starting", "queued", "running"].includes(entry?.status)) {
    button.disabled = true;
    button.textContent = "AI coding in background…";
  } else {
    button.disabled = true;
    button.textContent = activeTranscriptFile ? "Starting AI coding…" : "Choose a transcript";
  }
}

function maybeRevealBackgroundAiResults(transcriptId = activeTranscriptFile?.id) {
  const key = String(transcriptId || "");
  if (!key || String(activeTranscriptFile?.id || "") !== key || analysisReady) return false;
  const entry = backgroundAiJobs.get(key);
  if (!entry?.result || entry.status !== "completed") return false;
  if (!transcriptReachedEnd) {
    updateReadingGateStatus();
    return false;
  }

  recordActiveReadingTime();
  if (readingGateTimer) window.clearInterval(readingGateTimer);
  readingGateTimer = null;

  const preservedHumanCodes = codes
    .filter((code) => code.sourceClass === "human")
    .map((code) => ({ ...code, selected: false }));
  const preservedHumanIds = new Set(preservedHumanCodes.map((code) => String(code.id)));
  const preservedHumanExcerpts = identifiedExcerpts
    .filter((excerpt) => preservedHumanIds.has(String(excerpt.codeId ?? excerpt.id)))
    .map((excerpt) => ({ ...excerpt }));
  const result = entry.result;

  codes = [
    ...(result.codes || []).map((code) => ({ ...code, selected: false })),
    ...preservedHumanCodes,
  ];
  const humanAiMatchCount = initializeHumanAiCodeMatches();
  originalAiCodes = JSON.parse(JSON.stringify(codes.filter((code) => code.sourceClass !== "human")));
  agentReflections = result.agent_reflections || {};
  initialAgentReflections = result.initial_agent_reflections || {};
  identifiedExcerpts = [...(result.excerpts || []), ...preservedHumanExcerpts];
  themes = result.themes || [];
  analysisReady = true;
  aiCodingStarted = true;
  codeReviewStage = humanAiMatchCount > 0 ? "match-review" : "review";
  manualCodeReuseFinished = false;
  entry.status = "revealed";
  codeAmendmentReturnStage = "";
  codingRevision = 1;
  lastFinishedCodingRevision = 0;
  lastExportedCodingRevision = 0;
  codingQuestionnaireResponses = [];
  codingExportedAt = "";

  renderTranscript(document.getElementById("transcriptSearch").value);
  renderCodes();
  renderThemes();
  document.getElementById("uploadedTranscriptName").textContent = `Analyzed: ${activeTranscriptFile.name}`;
  updateReadingGateStatus();
  markSaved();
  toast("Codes and excerpts are ready for review.");
  return true;
}

async function pollBackgroundAiJob(transcriptId, jobId) {
  const key = String(transcriptId);
  const entry = backgroundAiJobs.get(key);
  if (!entry || entry.polling || entry.jobId !== jobId) return;
  entry.polling = true;

  try {
    while (entry.jobId === jobId) {
      const response = await fetch(`/api/jobs/${jobId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not check background AI coding.");
      if (backgroundAiJobs.get(key) !== entry || entry.jobId !== jobId) return;
      if (payload.status === "completed") {
        entry.status = "completed";
        entry.result = payload.result || { codes: [], excerpts: [], themes: [] };
        entry.message = "AI coding finished.";
        if (String(activeTranscriptFile?.id || "") === key) {
          updateReadingGateStatus();
          maybeRevealBackgroundAiResults(key);
          markSaved();
        }
        break;
      }
      if (payload.status === "failed") throw new Error(payload.message || "The ReflexCoTI workflow failed.");
      entry.status = payload.status || "running";
      entry.message = payload.message || "AI coding is running in the background...";
      if (String(activeTranscriptFile?.id || "") === key) {
        document.getElementById("uploadedTranscriptName").textContent = entry.message;
        updateReadingGateStatus();
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
    }
  } catch (error) {
    entry.status = "failed";
    entry.error = error.message || "The ReflexCoTI workflow failed.";
    if (String(activeTranscriptFile?.id || "") === key) {
      document.getElementById("uploadedTranscriptName").textContent = `Workflow failed: ${entry.error}`;
      updateReadingGateStatus();
      toast(entry.error);
      markSaved();
    }
  } finally {
    entry.polling = false;
    updateBackgroundAiControl();
  }
}

async function ensureBackgroundAiCoding(file, { force = false } = {}) {
  if (!file || piReadOnlyMode || analysisReady || transcript.length === 0) return;
  const key = String(file.id);
  let entry = backgroundAiJobs.get(key);

  if (force) {
    backgroundAiJobs.delete(key);
    entry = null;
  }
  if (entry?.jobId && entry.status !== "failed") {
    updateBackgroundAiControl();
    pollBackgroundAiJob(key, entry.jobId);
    return;
  }
  if (entry?.status === "starting") return;

  entry = {
    jobId: null,
    status: "starting",
    message: "Starting background AI coding...",
    result: null,
    error: "",
    polling: false,
  };
  backgroundAiJobs.set(key, entry);
  updateReadingGateStatus();

  try {
    const response = await fetch("/api/identify", {
      method: "POST",
      body: backgroundAiFormData(file),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not start background AI coding.");
    entry.jobId = payload.job_id;
    entry.status = payload.status || "queued";
    entry.message = payload.message || "AI coding is running in the background...";
    if (String(activeTranscriptFile?.id || "") === key) markSaved();
    pollBackgroundAiJob(key, entry.jobId);
  } catch (error) {
    entry.status = "failed";
    entry.error = error.message || "Could not start background AI coding.";
    if (String(activeTranscriptFile?.id || "") === key) {
      document.getElementById("uploadedTranscriptName").textContent = `Workflow failed: ${entry.error}`;
      updateReadingGateStatus();
      toast(entry.error);
      markSaved();
    }
  } finally {
    updateBackgroundAiControl();
  }
}

async function identifyCodesAndExcerpts() {
  const file = activeTranscriptFile;
  if (!file) return toast("Choose a project transcript first.");
  const entry = backgroundAiJobs.get(String(file.id));
  if (entry?.status !== "failed") return;
  await ensureBackgroundAiCoding(file, { force: true });
}

document.querySelectorAll(".identify-action").forEach((button) => {
  button.addEventListener("click", identifyCodesAndExcerpts);
});

const guidebookModal = document.getElementById("guidebookModal");
const guidebookButton = document.getElementById("guidebookBtn");
const closeGuidebookButton = document.getElementById("closeGuidebook");
const agentProfileModal = document.getElementById("agentProfileModal");
const closeAgentProfileButton = document.getElementById("closeAgentProfile");
const codebookExplorerModal = document.getElementById("codebookExplorerModal");
const closeCodebookExplorerButton = document.getElementById("closeCodebookExplorer");
const exportPromptModal = document.getElementById("exportPromptModal");
const stayOnTranscriptButton = document.getElementById("stayOnTranscriptBtn");
const nextTranscriptButton = document.getElementById("nextTranscriptBtn");
const aiCodeCautionModal = document.getElementById("aiCodeCautionModal");
const continueCodeReviewButton = document.getElementById("continueCodeReviewBtn");
const codingQuestionnaireModal = document.getElementById("codingQuestionnaireModal");
const codingQuestionnaireForm = document.getElementById("codingQuestionnaireForm");
const codingQuestionnaireList = document.getElementById("codingQuestionnaireList");
const cancelCodingQuestionnaireButton = document.getElementById("cancelCodingQuestionnaire");
const themeQuestionnaireModal = document.getElementById("themeQuestionnaireModal");
const themeQuestionnaireForm = document.getElementById("themeQuestionnaireForm");
const themeQuestionnaireList = document.getElementById("themeQuestionnaireList");
const cancelThemeQuestionnaireButton = document.getElementById("cancelThemeQuestionnaire");
let exportPromptMode = "codes";

function renderQuestionnaire(listEl, questions, namePrefix, mode) {
  if (!listEl) return;
  listEl.innerHTML = questions.map((question, index) => `
    <fieldset class="questionnaire-item" data-questionnaire-mode="${mode}" data-question-index="${index}">
      <strong>${index + 1}. ${escapeHTML(question)}</strong>
      <div class="rating-row" role="radiogroup" aria-label="${escapeHTML(question)}">
        ${[1, 2, 3, 4, 5].map((score) => `
          <label>
            <input type="radio" name="${namePrefix}-${index}" value="${score}" required />
            ${score}
          </label>
        `).join("")}
      </div>
    </fieldset>
  `).join("");
}

function renderCodingQuestionnaire() {
  renderQuestionnaire(codingQuestionnaireList, CODING_QUESTIONNAIRE_ITEMS, "coding-question", "coding");
}

function renderThemeQuestionnaire() {
  renderQuestionnaire(themeQuestionnaireList, THEME_QUESTIONNAIRE_ITEMS, "theme-question", "theme");
}

function resetQuestionnaireTiming(mode, count) {
  questionnaireTimings[mode] = Array.from({ length: count }, (_, index) => ({
    question_number: index + 1,
    response_time_ms: 0,
    answer_changes: 0,
    activeSince: 0,
    timing_method: "first_focus_or_interaction_to_answer_60s_idle_cap",
  }));
}

function questionnaireTimingEntry(mode, index) {
  return questionnaireTimings[mode]?.[Number(index)];
}

function startQuestionnaireTiming(mode, index) {
  const entry = questionnaireTimingEntry(mode, index);
  if (!entry) return;
  const now = Date.now();
  if (entry.activeSince) entry.response_time_ms += Math.min(now - entry.activeSince, REVIEW_IDLE_LIMIT_MS);
  entry.activeSince = now;
}

function answerQuestionnaireTiming(mode, index) {
  const entry = questionnaireTimingEntry(mode, index);
  if (!entry) return;
  if (entry.activeSince) entry.response_time_ms += Math.min(Date.now() - entry.activeSince, REVIEW_IDLE_LIMIT_MS);
  entry.activeSince = 0;
  entry.answer_changes += 1;
}

function pauseQuestionnaireTiming(mode) {
  (questionnaireTimings[mode] || []).forEach((entry) => {
    if (entry.activeSince) entry.response_time_ms += Math.min(Date.now() - entry.activeSince, REVIEW_IDLE_LIMIT_MS);
    entry.activeSince = 0;
  });
}

function resetQuestionnaireView(modal, form, listEl) {
  form?.reset();
  form?.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.checked = false;
  });
  [modal, form, listEl].filter(Boolean).forEach((element) => {
    element.scrollTop = 0;
  });
}

function openCodingQuestionnaire() {
  if (!codingQuestionnaireModal) return;
  renderCodingQuestionnaire();
  resetQuestionnaireTiming("coding", CODING_QUESTIONNAIRE_ITEMS.length);
  resetQuestionnaireView(codingQuestionnaireModal, codingQuestionnaireForm, codingQuestionnaireList);
  codingQuestionnaireModal.classList.remove("hidden");
  codingQuestionnaireModal.querySelector("input")?.focus({ preventScroll: true });
  requestAnimationFrame(() => resetQuestionnaireView(codingQuestionnaireModal, codingQuestionnaireForm, codingQuestionnaireList));
}

function closeCodingQuestionnaire() {
  if (!codingQuestionnaireModal) return;
  pauseQuestionnaireTiming("coding");
  codingQuestionnaireModal.classList.add("hidden");
  activeFinishExportButton()?.focus();
}

function openThemeQuestionnaire() {
  if (!themeQuestionnaireModal) return;
  renderThemeQuestionnaire();
  resetQuestionnaireTiming("theme", THEME_QUESTIONNAIRE_ITEMS.length);
  resetQuestionnaireView(themeQuestionnaireModal, themeQuestionnaireForm, themeQuestionnaireList);
  themeQuestionnaireModal.classList.remove("hidden");
  themeQuestionnaireModal.querySelector("input")?.focus({ preventScroll: true });
  requestAnimationFrame(() => resetQuestionnaireView(themeQuestionnaireModal, themeQuestionnaireForm, themeQuestionnaireList));
}

function closeThemeQuestionnaire() {
  if (!themeQuestionnaireModal) return;
  pauseQuestionnaireTiming("theme");
  themeQuestionnaireModal.classList.add("hidden");
  activeFinishExportButton()?.focus();
}

function collectQuestionnaireScores(questions, namePrefix, mode) {
  return questions.map((question, index) => {
    const selected = document.querySelector(`input[name="${namePrefix}-${index}"]:checked`);
    const timing = questionnaireTimingEntry(mode, index) || {};
    return {
      question_number: index + 1,
      question,
      score: selected?.value || "",
      response_time_ms: Math.round(timing.response_time_ms || 0),
      answer_changes: Number(timing.answer_changes || 0),
      timing_method: timing.timing_method || "first_focus_or_interaction_to_answer_60s_idle_cap",
    };
  });
}

function collectCodingQuestionnaireScores() {
  return collectQuestionnaireScores(CODING_QUESTIONNAIRE_ITEMS, "coding-question", "coding");
}

function collectThemeQuestionnaireScores() {
  return collectQuestionnaireScores(THEME_QUESTIONNAIRE_ITEMS, "theme-question", "theme");
}

function questionnaireComplete(scores) {
  return scores.every((item) => item.score);
}

function questionnaireFieldset(event) {
  return event.target.closest("[data-questionnaire-mode][data-question-index]");
}

[codingQuestionnaireForm, themeQuestionnaireForm].filter(Boolean).forEach((form) => {
  ["focusin", "pointerdown", "keydown", "scroll"].forEach((eventName) => form.addEventListener(eventName, (event) => {
    const fieldset = questionnaireFieldset(event);
    if (fieldset) startQuestionnaireTiming(fieldset.dataset.questionnaireMode, fieldset.dataset.questionIndex);
  }));
  form.addEventListener("change", (event) => {
    const fieldset = questionnaireFieldset(event);
    if (fieldset) answerQuestionnaireTiming(fieldset.dataset.questionnaireMode, fieldset.dataset.questionIndex);
  });
});

function codingQuestionnaireCsvRows(scores, transcriptFileName) {
  const username = currentUser?.username || document.getElementById("username").value;
  const researchQuestion = document.getElementById("researchQuestion").value;
  const interviewee = document.getElementById("interviewee").value;
  return [
    ["username", "project_id", "project_name", "transcript_file", "research_question", "interviewee", "red_flags_shown", "question_number", "question", "score", "response_time_ms", "answer_changes", "timing_method"],
    ...scores.map((item) => [
      username,
      currentProject?.id || "",
      currentProject?.name || "",
      transcriptFileName,
      researchQuestion,
      interviewee,
      redFlagsShownCount(),
      item.question_number,
      item.question,
      item.score,
      item.response_time_ms,
      item.answer_changes,
      item.timing_method,
    ]),
  ];
}

function themeQuestionnaireCsvRows(scores, uploadedFiles) {
  const username = currentUser?.username || document.getElementById("username").value;
  const researchQuestion = document.getElementById("researchQuestion").value;
  const interviewee = document.getElementById("interviewee").value;
  return [
    ["username", "project_id", "project_name", "uploaded_coding_files", "research_question", "interviewee", "question_number", "question", "score", "response_time_ms", "answer_changes", "timing_method"],
    ...scores.map((item) => [
      username,
      currentProject?.id || "",
      currentProject?.name || "",
      uploadedFiles.join("; "),
      researchQuestion,
      interviewee,
      item.question_number,
      item.question,
      item.score,
      item.response_time_ms,
      item.answer_changes,
      item.timing_method,
    ]),
  ];
}

function themeFinishedResultFiles(scores = themeQuestionnaireResponses, savedAt = new Date().toISOString()) {
  const baseName = "ReflexCoTI_themes";
  const revision = Math.max(1, Number(themeRevision || 1));
  const uploadedFiles = themeJsonFiles.map((file) => file.name);
  const humanThemes = preGenerationHumanThemes.filter((theme) => isPreGenerationHumanTheme(theme));
  const metadata = {
    account: { username: currentUser?.username || "" },
    project: { id: currentProject?.id || "", name: currentProject?.name || "" },
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    uploaded_coding_files: uploadedFiles,
    codebook_size: latestCodebook ? themeCodebookEntries().length : 0,
    theme_revision: revision,
    finished_at: savedAt,
  };
  return [
    jsonExportFile({
      ...metadata,
      themes: finalReviewedThemes().map((theme) => themeExportRecord(theme)),
    }, `${baseName}.json`),
    jsonExportFile({
      ...metadata,
      themes: (originalAiThemes.length ? originalAiThemes : themes)
        .map((theme) => themeExportRecord(theme, "AI")),
    }, `${baseName}_AI_original.json`),
    jsonExportFile({
      ...metadata,
      user_timing: exportedWorkflowTiming(
        "human_manual_theme_development",
        "first_manual_theme_input_or_code_selection",
        "finish_human_themes_click",
      ),
      themes: humanThemes.map(humanThemeRecord),
    }, `${baseName}_Human_version.json`),
    csvExportFile(
      themeQuestionnaireCsvRows(scores, uploadedFiles),
      `${baseName}_questionnaire.csv`,
    ),
  ];
}

async function exportCodingFiles(scores = [], { includeQuestionnaire = true } = {}) {
  const file = activeTranscriptFile;
  if (!(await ensurePeerSuggestionsResolved("coding", file?.id))) return;
  const transcriptFileName = file?.name || "";
  const exportRevision = Math.max(1, Number(codingRevision || 1));
  const exportTimestamp = new Date().toISOString();
  const baseName = `${safeDownloadBaseName(transcriptFileName)}_ReflexCoTI`;
  const activeCodes = activeExportCodes();
  const originalAiExportCodes = (originalAiCodes.length ? originalAiCodes : aiCodes())
    .filter((code) => !isCalibrationCode(code));
  const projectMetadata = { id: currentProject?.id || "", name: currentProject?.name || "" };
  const exportData = {
    project: projectMetadata,
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    transcript: {
      file_name: transcriptFileName,
    },
    coding_revision: exportRevision,
    exported_at: exportTimestamp,
    codes: activeCodes.map(simpleCodeRecord),
  };
  const originalAiExportData = {
    project: projectMetadata,
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    transcript: {
      file_name: transcriptFileName,
    },
    coding_revision: exportRevision,
    exported_at: exportTimestamp,
    codes: originalAiExportCodes.map(originalAiCodeRecord),
  };

  const exportFiles = includeQuestionnaire ? [
    jsonExportFile(exportData, `${baseName}.json`),
    jsonExportFile(originalAiExportData, `${baseName}_AI_original.json`),
    csvExportFile(codingQuestionnaireCsvRows(scores, transcriptFileName), `${baseName}_questionnaire.csv`),
  ] : [
    jsonExportFile(exportData, `${baseName}.json`),
  ];
  if (piReadOnlyMode && seniorCodeEditMode) {
    try {
      await exportSeniorCodingRevision(exportFiles[0]);
    } catch (error) {
      toast(error.message || "Could not export the Senior coding revision.");
    }
    return;
  }
  exportFiles.forEach(downloadExportFile);
  lastExportedCodingRevision = exportRevision;
  codingExportedAt = exportTimestamp;
  markSaved();
  await flushPendingAutosave();
  toast("Coding exports downloaded.");
  try {
    await archiveExportFiles("coding", activeTranscriptFile?.id, exportFiles);
  } catch (error) {
    console.error("Could not archive the coding exports.", error);
  }
  openExportPrompt("codes");
}

async function exportThemeFiles(scores = [], { includeQuestionnaire = true } = {}) {
  if (!(await ensurePeerSuggestionsResolved("themes"))) return;
  const baseName = "ReflexCoTI_themes";
  const exportRevision = Math.max(1, Number(themeRevision || 1));
  const exportTimestamp = new Date().toISOString();
  const uploadedFiles = themeJsonFiles.map((file) => file.name);
  const humanThemes = preGenerationHumanThemes.filter((theme) => isPreGenerationHumanTheme(theme));
  const projectMetadata = { id: currentProject?.id || "", name: currentProject?.name || "" };
  const reviewedThemeExportData = {
    project: projectMetadata,
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    uploaded_coding_files: uploadedFiles,
    codebook_size: latestCodebook ? themeCodebookEntries().length : 0,
    theme_revision: exportRevision,
    exported_at: exportTimestamp,
    themes: finalReviewedThemes()
      .map((theme) => themeExportRecord(theme)),
  };
  const originalAiThemeExportData = {
    project: projectMetadata,
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    uploaded_coding_files: uploadedFiles,
    codebook_size: latestCodebook ? themeCodebookEntries().length : 0,
    theme_revision: exportRevision,
    exported_at: exportTimestamp,
    themes: (originalAiThemes.length ? originalAiThemes : themes).map((theme) => themeExportRecord(theme, "AI")),
  };
  const humanThemeExportData = {
    project: projectMetadata,
    research_question: document.getElementById("researchQuestion").value,
    interviewee: document.getElementById("interviewee").value,
    uploaded_coding_files: uploadedFiles,
    codebook_size: latestCodebook ? themeCodebookEntries().length : 0,
    theme_revision: exportRevision,
    exported_at: exportTimestamp,
    user_timing: exportedWorkflowTiming(
      "human_manual_theme_development",
      "first_manual_theme_input_or_code_selection",
      "finish_human_themes_click",
    ),
    themes: humanThemes.map(humanThemeRecord),
  };

  const exportFiles = includeQuestionnaire ? [
    jsonExportFile(reviewedThemeExportData, `${baseName}.json`),
    jsonExportFile(originalAiThemeExportData, `${baseName}_AI_original.json`),
    jsonExportFile(humanThemeExportData, `${baseName}_Human_version.json`),
    csvExportFile(themeQuestionnaireCsvRows(scores, uploadedFiles), `${baseName}_questionnaire.csv`),
  ] : [
    jsonExportFile(reviewedThemeExportData, `${baseName}.json`),
  ];
  if (piReadOnlyMode && seniorThemeEditMode) {
    try {
      await exportSeniorThemeRevision(exportFiles[0]);
    } catch (error) {
      toast(error.message || "Could not export the Senior theme revision.");
    }
    return;
  }
  exportFiles.forEach(downloadExportFile);
  lastExportedThemeRevision = exportRevision;
  themesExportedAt = exportTimestamp;
  markSaved();
  await flushPendingAutosave();
  toast(includeQuestionnaire ? "Theme exports downloaded." : "Updated theme file downloaded.");
  try {
    await archiveExportFiles("themes", null, exportFiles);
  } catch (error) {
    console.error("Could not archive the theme exports.", error);
  }
  openExportPrompt("themes");
}

function openGuidebook() {
  if (!guidebookModal) return;
  guidebookModal.classList.remove("hidden");
  closeGuidebookButton?.focus();
}

function closeGuidebook() {
  if (!guidebookModal) return;
  guidebookModal.classList.add("hidden");
  guidebookButton?.focus();
}

function openAgentProfile(agentId) {
  if (!agentProfileModal) return;
  const detail = agentDetail(agentId);
  const reflection = agentReflection(agentId);
  const initialReflection = initialAgentReflections?.[agentId]
    || (reflection.updated ? {} : reflection);
  const updatedAssumptions = reflection.updated ? reflection.assumptions : "";
  document.getElementById("agentProfileTitle").textContent = detail.label;
  document.getElementById("agentProfileName").textContent = displayAgentName(agentId, detail);
  const generatedProfile = initialReflection?.profile;
  const identityItems = Array.isArray(generatedProfile) && generatedProfile.length
    ? generatedProfile
    : (typeof generatedProfile === "string" && generatedProfile.trim()
      ? generatedProfile.split(/\n+/).filter(Boolean)
      : (Array.isArray(detail.identity) ? detail.identity : [detail.identity]));
  document.getElementById("agentProfileIdentity").innerHTML = identityItems
    .filter(Boolean)
    .map((item) => `<li>${escapeHTML(item)}</li>`)
    .join("");
  document.getElementById("agentProfileAssumptions").textContent = initialReflection.assumptions
    || "No project-specific initial assumptions are available.";
  document.getElementById("agentProfileUpdatedAssumptions").innerHTML = renderStructuredReflection(
    updatedAssumptions,
    "No updated assumptions have been generated yet."
  );
  document.getElementById("agentProfileReflexiveHistory").innerHTML = renderStructuredReflection(
    reflection.reflexive_history,
    "No reflexive history has been generated yet."
  );
  agentProfileModal.classList.remove("hidden");
  closeAgentProfileButton?.focus();
}

function closeAgentProfile() {
  if (!agentProfileModal) return;
  agentProfileModal.classList.add("hidden");
}

function openCodebookExplorer(trigger = null) {
  if (!codebookExplorerModal || !latestCodebook) return;
  codebookExplorerTrigger = trigger || document.activeElement;
  renderCodebookExplorer();
  codebookExplorerModal.classList.remove("hidden");
  closeCodebookExplorerButton?.focus();
}

function closeCodebookExplorer() {
  if (!codebookExplorerModal) return;
  codebookExplorerModal.classList.add("hidden");
  const trigger = codebookExplorerTrigger;
  codebookExplorerTrigger = null;
  if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
}

function openExportPrompt(mode = "codes") {
  if (!exportPromptModal) return;
  exportPromptMode = mode;
  const title = document.getElementById("exportPromptTitle");
  const message = document.getElementById("exportPromptMessage");
  const nextButton = document.getElementById("nextTranscriptBtn");
  if (mode === "themes") {
    if (title) title.textContent = "Theme export complete";
    if (message) message.textContent = "Your reviewed theme file, original AI theme file, and human version file have been prepared. Theme generation review is complete.";
    if (nextButton) nextButton.textContent = "Start new theme generation";
  } else {
    if (title) title.textContent = piReadOnlyMode ? "Senior revision exported" : "Export complete";
    const currentIndex = projectFiles.indexOf(activeTranscriptFile);
    const hasNextTranscript = currentIndex >= 0 && currentIndex < projectFiles.length - 1;
    if (message) {
      message.textContent = piReadOnlyMode
        ? (hasNextTranscript
          ? `The reviewed AI+Human file for ${activeTranscriptFile?.name || "this transcript"} was downloaded. Open the next transcript?`
          : "The reviewed AI+Human file was downloaded. This is the last transcript in the project.")
        : (hasNextTranscript
          ? `Files for ${activeTranscriptFile?.name || "this transcript"} are ready. Open the next project transcript?`
          : "This transcript is the last one in the project. Your coding files are ready.");
    }
    if (nextButton) nextButton.textContent = hasNextTranscript ? "Open next transcript" : "Review project";
  }
  exportPromptModal.classList.remove("hidden");
  nextTranscriptButton?.focus();
}

function closeExportPrompt() {
  if (!exportPromptModal) return;
  exportPromptModal.classList.add("hidden");
  activeFinishExportButton()?.focus();
}

guidebookButton?.addEventListener("click", openGuidebook);
closeGuidebookButton?.addEventListener("click", closeGuidebook);
guidebookModal?.addEventListener("click", (event) => {
  if (event.target === guidebookModal) closeGuidebook();
});
closeAgentProfileButton?.addEventListener("click", closeAgentProfile);
agentProfileModal?.addEventListener("click", (event) => {
  if (event.target === agentProfileModal) closeAgentProfile();
});
document.getElementById("codebookContent")?.addEventListener("click", (event) => {
  const trigger = event.target.closest("#openCodebookExplorer");
  if (trigger) openCodebookExplorer(trigger);
});
closeCodebookExplorerButton?.addEventListener("click", closeCodebookExplorer);
codebookExplorerModal?.addEventListener("click", (event) => {
  const growthToggle = event.target.closest("[data-toggle-codebook-growth]");
  if (growthToggle) {
    const openingGrowth = !codebookGrowthOpen;
    codebookGrowthOpen = openingGrowth;
    if (openingGrowth && !highlightedCodebookCodeNames.length) {
      const history = codebookGrowthHistory();
      const latestUpdate = history[history.length - 1];
      highlightedCodebookCodeNames = (latestUpdate?.new_code_names || [])
        .map((name) => String(name).toLocaleLowerCase());
    } else if (!openingGrowth) {
      highlightedCodebookCodeNames = [];
    }
    renderCodebookExplorer();
    document.querySelector("[data-toggle-codebook-growth]")?.focus();
    return;
  }
  const historyButton = event.target.closest("[data-codebook-history-index]");
  if (historyButton) {
    const historyIndex = Number(historyButton.dataset.codebookHistoryIndex);
    const historyItem = codebookGrowthHistory()[historyIndex];
    const selectedNames = (historyItem?.new_code_names || []).map((name) => String(name).toLocaleLowerCase());
    const isAlreadySelected = selectedNames.length > 0
      && selectedNames.length === highlightedCodebookCodeNames.length
      && selectedNames.every((name) => highlightedCodebookCodeNames.includes(name));
    highlightedCodebookCodeNames = isAlreadySelected ? [] : selectedNames;
    renderCodebookExplorer();
    if (isAlreadySelected) {
      document.querySelector(`[data-codebook-history-index="${historyIndex}"]`)?.focus();
      return;
    }
    const firstNewCode = document.querySelector('[data-new-codebook-code="true"]');
    if (firstNewCode) {
      firstNewCode.classList.add("codebook-jump-target");
      firstNewCode.scrollIntoView({ behavior: "smooth", block: "center" });
      firstNewCode.querySelector("[data-explorer-code]")?.focus({ preventScroll: true });
      window.setTimeout(() => firstNewCode.classList.remove("codebook-jump-target"), 1600);
    } else {
      toast("This update merged codes into the existing codebook; there are no separate newly added codes to jump to.");
    }
    return;
  }
  const codeButton = event.target.closest("[data-explorer-code]");
  if (codeButton) {
    const entryIndex = Number(codeButton.dataset.explorerCode);
    selectedCodebookEntryIndex = selectedCodebookEntryIndex === entryIndex ? null : entryIndex;
    renderCodebookExplorer();
    document.querySelector(`[data-explorer-code="${entryIndex}"]`)?.focus();
    return;
  }
  if (event.target === codebookExplorerModal) closeCodebookExplorer();
});
cancelCodingQuestionnaireButton?.addEventListener("click", closeCodingQuestionnaire);
codingQuestionnaireModal?.addEventListener("click", (event) => {
  if (event.target === codingQuestionnaireModal) closeCodingQuestionnaire();
});
cancelThemeQuestionnaireButton?.addEventListener("click", closeThemeQuestionnaire);
themeQuestionnaireModal?.addEventListener("click", (event) => {
  if (event.target === themeQuestionnaireModal) closeThemeQuestionnaire();
});
codingQuestionnaireForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const scores = collectCodingQuestionnaireScores();
  if (!questionnaireComplete(scores)) {
    toast("Please answer every questionnaire item before finishing.");
    return;
  }
  closeCodingQuestionnaire();
  await completeCoding(scores);
});
themeQuestionnaireForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const scores = collectThemeQuestionnaireScores();
  if (!questionnaireComplete(scores)) {
    toast("Please answer every questionnaire item before finishing.");
    return;
  }
  closeThemeQuestionnaire();
  await completeThemes(scores);
});
stayOnTranscriptButton?.addEventListener("click", closeExportPrompt);
continueCodeReviewButton?.addEventListener("click", closeAiCodeCaution);
aiCodeCautionModal?.addEventListener("click", (event) => {
  if (event.target === aiCodeCautionModal) closeAiCodeCaution();
});
nextTranscriptButton?.addEventListener("click", () => {
  closeExportPrompt();
  if (exportPromptMode === "codes") {
    const currentIndex = projectFiles.indexOf(activeTranscriptFile);
    if (currentIndex >= 0 && currentIndex < projectFiles.length - 1) {
      resetWorkspaceForNextTranscript();
    } else {
      renderDocumentManager();
      showView("documents");
    }
  } else if (exportPromptMode === "themes") {
    resetThemesForNewGeneration();
  }
});
exportPromptModal?.addEventListener("click", (event) => {
  if (event.target === exportPromptModal) closeExportPrompt();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.getElementById("codebookProcessingModal")?.classList.contains("hidden")) {
    closeCodebookProcessingModal();
  }
  if (event.key === "Escape" && !document.getElementById("sourceCodeEditConfirmModal")?.classList.contains("hidden")) {
    closeSourceCodeEditConfirmation();
  }
  if (event.key === "Escape" && !document.getElementById("accountTypeModal")?.classList.contains("hidden")) {
    closeAccountTypeModal();
  }
  if (event.key === "Escape" && !aiCodeCautionModal?.classList.contains("hidden")) {
    closeAiCodeCaution();
  }
  if (event.key === "Escape" && !document.getElementById("clearTranscriptModal")?.classList.contains("hidden")) {
    closeClearTranscriptModal();
  }
  if (event.key === "Escape" && !document.getElementById("peerSuggestionModal")?.classList.contains("hidden")) {
    closePeerSuggestionDialog();
  }
  if (event.key === "Escape" && !guidebookModal?.classList.contains("hidden")) {
    closeGuidebook();
  }
  if (event.key === "Escape" && !agentProfileModal?.classList.contains("hidden")) {
    closeAgentProfile();
  }
  if (event.key === "Escape" && !codebookExplorerModal?.classList.contains("hidden")) {
    closeCodebookExplorer();
  }
  if (event.key === "Escape" && !codingQuestionnaireModal?.classList.contains("hidden")) {
    closeCodingQuestionnaire();
  }
  if (event.key === "Escape" && !themeQuestionnaireModal?.classList.contains("hidden")) {
    closeThemeQuestionnaire();
  }
  if (event.key === "Escape" && !exportPromptModal?.classList.contains("hidden")) {
    closeExportPrompt();
  }
});

function activeFinishExportButton() {
  return document.getElementById(
    currentWorkspacePage === "themes" ? "finishThemeReminderBtn" : "finishCodingReminderBtn"
  );
}

async function completeCoding(scores = []) {
  if (!(await ensurePeerSuggestionsResolved("coding", activeTranscriptFile?.id))) return;
  const previousFinishedRevision = lastFinishedCodingRevision;
  const previousResponses = codingQuestionnaireResponses;
  if (scores.length) codingQuestionnaireResponses = scores;
  lastFinishedCodingRevision = Math.max(1, Number(codingRevision || 1));
  finishManualPhaseTiming();
  markSaved();
  try {
    await flushPendingAutosave({ throwOnError: true });
    toast("Coding saved. Updating the project codebook…", 6000);
    const finishResult = await archiveFinishedResultFiles(
      "coding",
      Math.max(1, Number(codingRevision || 1)),
      codingFinishedResultFiles(),
    );
    if (finishResult.codebook) projectCodebook = finishResult.codebook;
    renderCodes();
    if (finishResult.codebook_error) {
      toast(`Coding finished, but the project codebook could not be updated: ${finishResult.codebook_error}`, 8000);
    } else {
      const size = Number(finishResult.codebook?.current_size || 0);
      const growth = Number(finishResult.codebook?.net_growth || 0);
      toast(`Coding finished. Codebook updated to ${size} codes (${growth >= 0 ? "+" : ""}${growth}).`, 6000);
    }
  } catch (error) {
    lastFinishedCodingRevision = previousFinishedRevision;
    codingQuestionnaireResponses = previousResponses;
    markSaved();
    try {
      await flushPendingAutosave();
    } catch (_) {
      // The original error below remains the useful user-facing failure.
    }
    renderCodes();
    toast(error.message || "Coding could not be finished because saving failed.");
  }
}

async function completeThemes(scores = []) {
  if (!(await ensurePeerSuggestionsResolved("themes"))) return;
  const previousFinishedRevision = lastFinishedThemeRevision;
  const previousResponses = themeQuestionnaireResponses;
  if (scores.length) themeQuestionnaireResponses = scores;
  lastFinishedThemeRevision = Math.max(1, Number(themeRevision || 1));
  finishManualPhaseTiming();
  markSaved();
  try {
    await flushPendingAutosave({ throwOnError: true });
    await archiveProjectFinishedResultFiles(
      "themes",
      Math.max(1, Number(themeRevision || 1)),
      themeFinishedResultFiles(themeQuestionnaireResponses),
    );
    renderThemes();
    toast("Themes finished and saved. Export is optional.");
  } catch (error) {
    lastFinishedThemeRevision = previousFinishedRevision;
    themeQuestionnaireResponses = previousResponses;
    markSaved();
    try {
      await flushPendingAutosave();
    } catch (_) {
      // The original error below remains the useful user-facing failure.
    }
    renderThemes();
    toast(error.message || "Themes could not be finished because saving failed.");
  }
}

function finishCurrentAnalysis() {
  activeFinishExportButton()?.classList.remove("export-ready-cue");
  if (currentWorkspacePage === "themes") {
    if (themeReviewStage !== "complete") return toast("Complete the theme review before finishing.");
    if (!themeChangesNeedFinish()) return toast("The latest theme revision is already finished.");
    if (!piReadOnlyMode && lastFinishedThemeRevision === 0 && themeQuestionnaireResponses.length === 0) {
      openThemeQuestionnaire();
      return;
    }
    completeThemes();
    return;
  }
  if (analysisReady && codeReviewStage !== "complete") {
    return toast("Complete the AI review, merge question, and human-code question before finishing.");
  }
  if (codeReviewStage !== "complete") return toast("Complete coding before finishing.");
  if (!codingChangesNeedFinish()) return toast("The latest coding revision is already finished.");
  if (!piReadOnlyMode && lastFinishedCodingRevision === 0 && codingQuestionnaireResponses.length === 0) {
    openCodingQuestionnaire();
    return;
  }
  completeCoding();
}

function exportCurrentAnalysis() {
  if (currentWorkspacePage === "themes") {
    if (themeChangesNeedFinish()) return toast("Finish the latest theme changes before exporting.");
    if (piReadOnlyMode && (!seniorThemeEditMode || seniorThemeReview?.status !== "pending_export")) {
      return toast("Finish a Senior theme modification before exporting it.");
    }
    const includeQuestionnaire = !piReadOnlyMode && lastExportedThemeRevision === 0 && themeQuestionnaireResponses.length > 0;
    exportThemeFiles(themeQuestionnaireResponses, { includeQuestionnaire });
    return;
  }
  if (codingChangesNeedFinish()) return toast("Finish the latest coding changes before exporting.");
  if (piReadOnlyMode && (!seniorCodeEditMode || seniorCodeReview?.status !== "pending_export")) {
    return toast("Finish a Senior code modification before exporting it.");
  }
  const includeQuestionnaire = !piReadOnlyMode && lastExportedCodingRevision === 0 && codingQuestionnaireResponses.length > 0;
  exportCodingFiles(codingQuestionnaireResponses, { includeQuestionnaire });
}

const CODING_PANE_WIDTH_KEY = "reflexcoti-coding-transcript-width-v4";
const CODING_STACK_BREAKPOINT = 900;

function codingPaneWidthBounds(grid, resizer) {
  const style = window.getComputedStyle(grid);
  const horizontalPadding = parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
  const gap = parseFloat(style.columnGap || 0);
  const available = Math.max(0, grid.clientWidth - horizontalPadding - resizer.offsetWidth - (gap * 2));
  const minimumCodeWidth = views.workspace?.classList.contains("human-coding-mode")
    ? Math.min(420, Math.max(280, window.innerWidth * 0.30))
    : Math.min(520, Math.max(340, window.innerWidth * 0.34));
  const minimum = Math.min(560, Math.max(400, available - minimumCodeWidth));
  const maximum = Math.max(minimum, available - minimumCodeWidth);
  return { minimum, maximum, available, paddingLeft: parseFloat(style.paddingLeft || 0), gap };
}

function setCodingPaneWidth(width, { persist = false } = {}) {
  const grid = document.querySelector(".editor-grid");
  const resizer = document.getElementById("codingPaneResizer");
  if (!grid || !resizer || window.innerWidth <= CODING_STACK_BREAKPOINT || grid.clientWidth <= 0 || resizer.offsetWidth <= 0) return;
  const bounds = codingPaneWidthBounds(grid, resizer);
  const nextWidth = Math.min(bounds.maximum, Math.max(bounds.minimum, Number(width) || bounds.minimum));
  grid.style.setProperty("--human-transcript-pane-width", String(Math.round(nextWidth)) + "px");
  const percentage = bounds.available ? Math.round((nextWidth / bounds.available) * 100) : 0;
  resizer.setAttribute("aria-valuemin", String(Math.round((bounds.minimum / Math.max(1, bounds.available)) * 100)));
  resizer.setAttribute("aria-valuemax", String(Math.round((bounds.maximum / Math.max(1, bounds.available)) * 100)));
  resizer.setAttribute("aria-valuenow", String(percentage));
  if (persist) {
    try { window.localStorage.setItem(CODING_PANE_WIDTH_KEY, String(Math.round(nextWidth))); } catch (error) { console.debug("Pane width could not be saved.", error); }
  }
}

function restoreCodingPaneWidth() {
  const grid = document.querySelector(".editor-grid");
  if (!grid || currentWorkspacePage !== "codes" || window.innerWidth <= CODING_STACK_BREAKPOINT || grid.clientWidth <= 0) return;
  let savedWidth = 0;
  try { savedWidth = Number(window.localStorage.getItem(CODING_PANE_WIDTH_KEY)); } catch (error) { console.debug("Pane width could not be restored.", error); }
  if (savedWidth > 0) setCodingPaneWidth(savedWidth);
  else grid.style.removeProperty("--human-transcript-pane-width");
}

function initializeCodingPaneResizer() {
  const grid = document.querySelector(".editor-grid");
  const resizer = document.getElementById("codingPaneResizer");
  const transcriptPanel = document.querySelector(".transcript-panel");
  if (!grid || !resizer || !transcriptPanel) return;
  requestAnimationFrame(restoreCodingPaneWidth);
  let dragging = false;
  const resizeFromPointer = (event, persist = false) => {
    const bounds = codingPaneWidthBounds(grid, resizer);
    const gridRect = grid.getBoundingClientRect();
    const width = event.clientX - gridRect.left - bounds.paddingLeft - bounds.gap - (resizer.offsetWidth / 2);
    setCodingPaneWidth(width, { persist });
  };
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add("dragging");
    document.body.classList.add("resizing-coding-panes");
    resizeFromPointer(event);
    event.preventDefault();
  });
  resizer.addEventListener("pointermove", (event) => {
    if (dragging) resizeFromPointer(event);
  });
  const finishDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
    resizer.classList.remove("dragging");
    document.body.classList.remove("resizing-coding-panes");
    resizeFromPointer(event, true);
  };
  resizer.addEventListener("pointerup", finishDragging);
  resizer.addEventListener("pointercancel", finishDragging);
  resizer.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const bounds = codingPaneWidthBounds(grid, resizer);
    const currentWidth = transcriptPanel.getBoundingClientRect().width;
    const nextWidth = event.key === "Home" ? bounds.minimum
      : event.key === "End" ? bounds.maximum
        : currentWidth + (event.key === "ArrowLeft" ? -24 : 24);
    setCodingPaneWidth(nextWidth, { persist: true });
    event.preventDefault();
  });
  resizer.addEventListener("dblclick", () => {
    grid.style.removeProperty("--human-transcript-pane-width");
    try { window.localStorage.removeItem(CODING_PANE_WIDTH_KEY); } catch (error) { console.debug("Pane width could not be reset.", error); }
    requestAnimationFrame(() => setCodingPaneWidth(transcriptPanel.getBoundingClientRect().width));
  });
  window.addEventListener("resize", () => {
    const configuredWidth = parseFloat(grid.style.getPropertyValue("--human-transcript-pane-width"));
    if (configuredWidth > 0) setCodingPaneWidth(configuredWidth);
  });
}

initializeCodingPaneResizer();
renderTranscript();
renderCodes();
renderThemes();
renderLastSaved();
window.setInterval(renderLastSaved, 30000);
  pauseQuestionnaireTiming("coding");
  pauseQuestionnaireTiming("theme");
