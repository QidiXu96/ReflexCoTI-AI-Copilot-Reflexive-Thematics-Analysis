import json, re, os
import numpy as np
from nltk.tokenize import word_tokenize

try:
    import pandas as pd
except Exception:
    pd = None

def _chunk_sort_key(filename):
    m = re.search(r"_chunk_(\d+)", filename)
    return int(m.group(1)) if m else 10**9

def format_coding_output(obj):
    if obj is None:
        return ""

    if isinstance(obj, str):
        return obj.strip()

    if isinstance(obj, list):
        parts = []
        for it in obj:
            if not isinstance(it, dict):
                continue
            code = (it.get("Initial Code") or "").strip()
            clues = (it.get("Clues") or "").strip()
            if code and clues:
                parts.append(f"Initial Code: {code}\nClues: {clues}")
        return "\n\n".join(parts).strip()

    return ""

def merge_agent_results(
    agent_name,
    transcript_id,
    round_num,
    base_dir,
    suffix="_final",
    final_base_dir=None,
):
    agent_dir = os.path.join(base_dir, agent_name)
    prefix = f"round_{round_num}_{transcript_id}_chunk_"

    # ---------- Merge JSONs ----------
    json_files = [
        f for f in os.listdir(agent_dir)
        if f.startswith(prefix) and f.endswith("_clean.json")
    ]
    json_files.sort(key=_chunk_sort_key)

    if not json_files:
        raise FileNotFoundError(f"No cleanchunk JSONs found for agent={agent_name}, transcript={transcript_id}")

    merged_json_parts = []
    reflection_to_save = None

    for i, fn in enumerate(json_files):
        fp = os.path.join(agent_dir, fn)
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        if i == 0:
            reflection_to_save = data.get("reflection")
        coding_output = data.get("coding_output", "")
        coding_text = format_coding_output(coding_output)
        if coding_text:
            merged_json_parts.append(coding_text)

    merged_json_text = "\n\n".join(merged_json_parts)

    if final_base_dir is None:
        final_base_dir = os.path.join(os.getcwd(), "server_data", "final_coding")
    final_agent_dir = os.path.join(final_base_dir, agent_name)
    os.makedirs(final_agent_dir, exist_ok=True)

    merged_json = {
        "agent": agent_name,
        "transcript_id": transcript_id,
        "round": round_num,
        "reflection": reflection_to_save,
        "coding_output": merged_json_text
    }
    
    out_json = os.path.join(final_agent_dir, f"{transcript_id}_round_{round_num}{suffix}.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(merged_json, f, indent=4, ensure_ascii=False)

    # ---------- Merge MDs ----------
    md_files = [
        f for f in os.listdir(agent_dir)
        if f.startswith(prefix) and f.endswith("_clean.md")
    ]
    md_files.sort(key=_chunk_sort_key)

    if not md_files:
        raise FileNotFoundError(f"No cleanchunk MDs found for agent={agent_name}, transcript={transcript_id}")

    merged_md_parts = []
    for fn in md_files:
        fp = os.path.join(agent_dir, fn)
        with open(fp, "r", encoding="utf-8") as f:
            txt = f.read()

        if isinstance(txt, str) and txt.strip():
            merged_md_parts.append(txt.strip())

    merged_md_text = "\n\n".join(merged_md_parts)

    out_md = os.path.join(final_agent_dir, f"{transcript_id}_round_{round_num}{suffix}.md")
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(merged_md_text)

    return out_json, out_md

def extract_quotes_by_source(xlsx_path):
    if pd is None:
        raise ImportError("pandas is required for Excel quote extraction, but it is not installed.")
    df = pd.read_excel(xlsx_path, sheet_name="Codebook", engine="openpyxl")

    df["Source"] = df["Source"].apply(lambda x: f"{int(x):04d}")
    df["Quotes"] = df["Quotes"].astype(str).str.strip()

    quotes_by_source = df.groupby("Source")["Quotes"].apply(list).to_dict()

    combined_quotes = {}
    for source, quotes in quotes_by_source.items():
        combined = " ".join(q.strip() for q in quotes if q.strip())
        combined = (
            combined.replace('“', '')
            .replace('”', '')
            .replace('"', '')
        )
        combined = re.sub(r'\s+', ' ', combined).strip()
        combined_quotes[source] = combined

    return combined_quotes 

def extract_clues(json_files, field="coding_output"):
    # all clues concatenated together
    results = {}

    for json_file in json_files:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        regex = r"Clues:\s*(.*?)(?=\n\s*Initial Code:|$)"

        texts = []
        if isinstance(data, dict) and field in data:
            texts = [data[field]]

        clues_found = []
        for text in texts:
            found = re.findall(regex, text, flags=re.DOTALL | re.IGNORECASE)
            clues_found.extend(found)

        concatenated_clues = " ".join(clue.strip() for clue in clues_found if clue.strip())
        
        cleaned_clues = (
            concatenated_clues.replace('“', '')
            .replace('”', '')
            .replace('"', '')
            .replace("'", "")
        )
        cleaned_clues = " ".join(cleaned_clues.split())

        agent_type = data.get("agent", "unknown")
        transcript_id = data.get("transcript_id", "unknown")
        key = f"{agent_type}_{transcript_id}"

        results[key] = cleaned_clues

    return results

def extract_text_from_clue_pool_file_with_score_filter(fp, min_average_score, score_key="average_score", text_key="text"):
    with open(fp, "r", encoding="utf-8") as f:
        data = json.load(f)

    clues = data.get("clue_pool", []) or []

    kept_texts = []
    for cl in clues:
        txt = (cl.get(text_key) or "").strip()
        if not txt:
            continue

        if min_average_score is not None:
            sc = cl.get(score_key, None)
            if sc is None:
                continue
            try:
                sc = float(sc)
            except Exception:
                continue
            if sc < float(min_average_score):
                continue

        kept_texts.append(txt)

    return "\n".join(kept_texts)


_PUNCT_ONLY = re.compile(r"^\W+$") 

def tokenize_for_eval(text: str):
    tokens = word_tokenize((text or "").lower())
    tokens = [t for t in tokens if not _PUNCT_ONLY.match(t)]  
    return set(tokens)

def compute_jaccard(model_text, human_text):
    model_tokens = tokenize_for_eval(model_text)
    human_tokens = tokenize_for_eval(human_text)
    
    intersection = model_tokens.intersection(human_tokens)
    union = model_tokens.union(human_tokens)
    
    return len(intersection) / len(union) if union else 0

def compute_jaccard_for_all(model_dict, human_dict):
    scores = {}
    for name, model_text in model_dict.items():
        human_text = human_dict.get(name, "")
        score = compute_jaccard(model_text, human_text)
        scores[name] = score
    return scores

def average_jaccard(jaccard_scores):
    if jaccard_scores:
        return sum(jaccard_scores.values()) / len(jaccard_scores)
    return 0

def compute_token_metrics(model_text, human_text):
    model_tokens = tokenize_for_eval(model_text)
    human_tokens = tokenize_for_eval(human_text)
    intersection = model_tokens.intersection(human_tokens)
    precision = len(intersection) / len(model_tokens) if model_tokens else 0
    recall = len(intersection) / len(human_tokens) if human_tokens else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    return precision, recall, f1

def compute_token_metrics_for_all(model_dict, human_dict):
    results = {}
    for name, model_text in model_dict.items():
        human_text = human_dict.get(name, "")
        precision, recall, f1 = compute_token_metrics(model_text, human_text)
        results[name] = {
            "precision": precision,
            "recall": recall,
            "f1": f1
        }
    return results

def average_token_metrics(token_metrics):
    precisions = [m["precision"] for m in token_metrics.values()]
    recalls = [m["recall"] for m in token_metrics.values()]
    f1s = [m["f1"] for m in token_metrics.values()]

    avg_precision = sum(precisions) / len(precisions) if precisions else 0
    avg_recall = sum(recalls) / len(recalls) if recalls else 0
    avg_f1 = sum(f1s) / len(f1s) if f1s else 0

    return {
        "average_precision": avg_precision,
        "average_recall": avg_recall,
        "average_f1": avg_f1
    }

def compute_all_metrics(model_dict, human_dict):
    """Compute Jaccard, Precision, Recall, F1 for each shared key and return as a pandas DataFrame with average row."""
    if pd is None:
        raise ImportError("pandas is required for compute_all_metrics, but it is not installed.")
    # --- Individual metrics ---
    jaccard_scores = compute_jaccard_for_all(model_dict, human_dict)
    token_metrics = compute_token_metrics_for_all(model_dict, human_dict)

    # --- Combine results for shared keys only ---
    shared_keys = set(model_dict.keys()) & set(human_dict.keys())
    data = []

    for name in sorted(shared_keys):
        data.append({
            "Interview": name,
            "Jaccard": jaccard_scores.get(name, 0),
            "Precision": token_metrics.get(name, {}).get("precision", 0),
            "Recall": token_metrics.get(name, {}).get("recall", 0),
            "F1": token_metrics.get(name, {}).get("f1", 0)
        })

    df = pd.DataFrame(data)

    avg_row = {
        "Interview": "Average",
        "Jaccard": df["Jaccard"].mean() if not df.empty else 0,
        "Precision": df["Precision"].mean() if not df.empty else 0,
        "Recall": df["Recall"].mean() if not df.empty else 0,
        "F1": df["F1"].mean() if not df.empty else 0
    }
    df = pd.concat([df, pd.DataFrame([avg_row])], ignore_index=True)

    return df

# clean markdown text and json text
MARKDOWN_PATTERNS = [
    (r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", ""),
    (r"\n{3,}", "\n\n"),
]

def clean_markdown_text(text):
    if not isinstance(text, str) or not text.strip():
        return text

    cleaned = text
    for pattern, repl in MARKDOWN_PATTERNS:
        cleaned = re.sub(pattern, repl, cleaned, flags=re.MULTILINE)

    return cleaned.strip()

def process_multiple_markdown_files(file_paths, suffix="_clean"):
    for file_path in file_paths:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()

            cleaned = clean_markdown_text(text)

            base, ext = os.path.splitext(file_path)
            new_path = f"{base}{suffix}{ext}"

            with open(new_path, "w", encoding="utf-8") as f:
                f.write(cleaned)

        except Exception as e:
            raise RuntimeError(
                f"Failed to clean Markdown output: {file_path}"
            ) from e

def clean_json_text(s):
    if not isinstance(s, str):
        return s

    s = (
        s.replace("**", "")
         .replace("### ", "")
         .replace("###", "")
    )
    s = re.sub(r"(?m)^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", "", s)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s

def clean_json(obj):
    if isinstance(obj, dict):
        return {
            clean_json_text(k) if isinstance(k, str) else k:
            clean_json(v)
            for k, v in obj.items()
        }

    if isinstance(obj, list):
        return [clean_json(x) for x in obj]

    if isinstance(obj, str):
        return clean_json_text(obj)

    return obj

def process_multiple_json_files(file_paths, suffix="_clean"):
    for file_path in file_paths:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            cleaned_data = clean_json(data)

            base, ext = os.path.splitext(file_path)
            new_path = f"{base}{suffix}{ext}"

            with open(new_path, "w", encoding="utf-8") as f:
                json.dump(cleaned_data, f, indent=4, ensure_ascii=False)

        except json.JSONDecodeError as e:
            raise ValueError(
                f"Invalid JSON chunk output: {file_path}"
            ) from e
        except Exception as e:
            raise RuntimeError(
                f"Failed to clean JSON output: {file_path}"
            ) from e
