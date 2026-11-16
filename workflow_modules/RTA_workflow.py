import os, re, glob, json, time, copy
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from collections import Counter, defaultdict
from coder_agent import *
from coder_collaboration_reflection import *
from dedup import *
from evaluation import *

# get transcript id and chunk id
pattern = re.compile(r"^Interview_(\d+)_chunk_(\d+)\.docx$", re.IGNORECASE)
def parse_ids(fp: str):
    base = os.path.basename(fp)
    m = pattern.match(base)
    if not m:
        return None, None
    return m.group(1), m.group(2) # transcript id, chunk id

# clean all raw json/md coding output files 
def clean_chunk_round_outputs(coding_base_dir, agents, transcript_id, round_number):
    # coding_base_dir: independent_coding
    for agent in agents:
        agent_dir = os.path.join(coding_base_dir, agent)

        json_files = [
            f for f in glob.glob(f"{agent_dir}/round_{round_number}_{transcript_id}_*.json") # all chunks for one transcript one round
            if not f.endswith("_clean.json")
        ]
        if json_files:
            process_multiple_json_files(json_files) # in evaluation.py, output is each cleaned round_chunk_transcript file
        else:
            print(f"[{agent}] No JSON files to clean (round {round_number}).")

        md_files = [
            f for f in glob.glob(f"{agent_dir}/round_{round_number}_{transcript_id}_*.md")
            if not f.endswith("_clean.md")
        ]
        if md_files:
            process_multiple_markdown_files(md_files)
        else:
            print(f"[{agent}] No MD files to clean (round {round_number}).")

# merge all cleaned coding output files for one transcript and one round, across all agents.
def merge_chunk_round_outputs(
    coding_base_dir,
    agents,
    transcript_id,
    round_number,
    final_coding_base_dir,
):
    for agent in agents:
        try:
            merge_agent_results(
                agent_name=agent,
                transcript_id=transcript_id,
                round_num=round_number,
                base_dir=coding_base_dir,
                suffix="_final",
                final_base_dir=final_coding_base_dir,
            ) # in evaluation.py
            print(f"Merged: {agent} | transcript {transcript_id} | round {round_number}")
        except FileNotFoundError as e:
            print(f"Skipped merge: {agent} | {e}")

def load_prev_round_coding_output(
    coding_base_dir,
    agent_name,
    previous_round,
    transcript_id,
    chunk_id,
):
    r_file_path = os.path.join(
        coding_base_dir,
        agent_name,
        f"round_{previous_round}_{transcript_id}_chunk_{chunk_id}_clean.json",
    )

    if not os.path.exists(r_file_path):
        print(f"Warning: Missing round {previous_round} chunk file for {agent_name}: {r_file_path}")
        return ""

    try:
        with open(r_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("coding_output", "")
    except Exception as e:
        print(f"Warning: Failed reading {r_file_path} ({agent_name}): {e}")
        return "" 

# clue_pool format
def parse_transcript_and_round(fname):
    base = os.path.basename(fname)

    m = re.match(r"^clue_pool_(\d{4})(?:_round_(\d+))?\.json$", base)
    if not m:
        raise ValueError(f"Unexpected filename format: {base}")

    transcript_id = m.group(1)
    round_str = m.group(2)

    round_num = int(round_str) if round_str is not None else 1
    return transcript_id, round_num

def parse_transcript_id_from_filename(fname):
    tid, _ = parse_transcript_and_round(fname)
    return tid

# Maps transcript_id -> file_path
def build_tid_to_file_map(file_paths):
    m = {}
    for p in file_paths:
        tid = parse_transcript_id_from_filename(p)
        if tid:
            m[tid] = p
    return m

# get files for a given round
def collect_round_files(clue_pool_dir, round_num):
    round_files = []
    for fname in sorted(os.listdir(clue_pool_dir)):
        if not fname.endswith(".json"):
            continue
        _, r = parse_transcript_and_round(fname)
        if r == round_num:
            round_files.append(os.path.join(clue_pool_dir, fname))
    return round_files

# get dedup agents clues
def load_dedup_clues_from_clue_pool(json_path):
    with open(json_path, "r") as f:
        data = json.load(f)
    texts = []
    for clue in data["clue_pool"]:
        t = str(clue.get("text", "")).strip()
        t = re.sub(r"\s+", " ", t)
        if t:
            texts.append(t)
    return texts

def get_embeddings(model, texts):
    return model.encode(
        texts
    )

def compute_similarity(model, cur_texts, pre_texts):
    if (not cur_texts) or (not pre_texts):
        return None
    
    C = get_embeddings(model, cur_texts)
    P = get_embeddings(model, pre_texts)

    sims = cosine_similarity(C, P)  # shape: (len(C), len(P))
    return sims

def novelty_from_matrix(sims):
    if sims is None:
        return float("nan")
    mean_max_sim = float(np.mean(np.max(sims, axis=1)))
    novelty = 1 - mean_max_sim
    return novelty

def compute_round_to_round_novelty(
    clue_pool_dir,
    cur_round,
    model_name = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
):
    if cur_round <= 1:
        return None  # no previous round to compare

    cur_files = collect_round_files(clue_pool_dir, cur_round) 
    pre_files = collect_round_files(clue_pool_dir, cur_round-1)

    if not cur_files or not pre_files:
        return None

    model = SentenceTransformer(model_name)

    cur_map = build_tid_to_file_map(cur_files)
    pre_map = build_tid_to_file_map(pre_files)

    results = []

    common_tids = sorted(set(cur_map.keys()) & set(pre_map.keys()))

    for tid in common_tids:
        cur_path = cur_map[tid]
        pre_path = pre_map[tid]

        cur_texts = load_dedup_clues_from_clue_pool(cur_path)
        pre_texts = load_dedup_clues_from_clue_pool(pre_path)

        sims = compute_similarity(model, cur_texts, pre_texts) if (cur_texts and pre_texts) else None
        novel = novelty_from_matrix(sims)

        results.append({
            "transcript_id": tid,
            "cur_round": cur_round,
            "pre_round": cur_round-1,
            "novelty": float(novel),
            "cur_agents_units": len(cur_texts),
            "pre_agents_units": len(pre_texts)
        })

    valid_novelties = [row["novelty"] for row in results if row.get("novelty") is not None]
    avg_novelty = float(np.mean(valid_novelties)) if valid_novelties else float("nan")
    return results, avg_novelty

def compute_single_transcript_round_novelty(clue_pool_dir, transcript_id, cur_round):
    rows, _avg = compute_round_to_round_novelty(clue_pool_dir, cur_round)
    if not rows:
        return None
    for row in rows:
        if row.get("transcript_id") == transcript_id:
            return float(row["novelty"])
    return None

def should_stop_by_novelty(novelty_history, threshold, k):
    """
    novelty_history:
        [novelty(2 vs 1), novelty(3 vs 2), ..., novelty(r vs r-1)]
    """
    if len(novelty_history) < k:
        return False

    return all(
        v is not None and not np.isnan(v) and v < threshold
        for v in novelty_history[-k:]
    )

def extract_score_from_text(text):
    text = str(text or "")
    match = re.search(r"Importance Score:\s*(\d+)", text, flags=re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None

def filter_json_files_by_score(json_paths, output_dir, min_score=4.0):
    os.makedirs(output_dir, exist_ok=True)

    summary = []

    for input_path in json_paths:
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        original_clues = data.get("clue_pool", [])

        filtered_clues = []
        fixed_none_scores = 0

        for clue in original_clues:
            score = clue.get("average_score", None)

            # If average_score is None, try to recover score from text
            if score is None:
                score = extract_score_from_text(clue.get("text", ""))
                if score is not None:
                    clue["average_score"] = score
                    fixed_none_scores += 1

            # If still None or invalid, treat as 0
            try:
                score = float(score)
            except (TypeError, ValueError):
                score = 0.0

            if score >= min_score:
                # clean clue text: remove embedded Importance Score
                clue["text"] = re.sub(
                    r"\s*Importance Score:\s*\d+\s*$",
                    "",
                    str(clue.get("text", "")),
                    flags=re.IGNORECASE
                ).strip()

                filtered_clues.append(clue)

        filtered_data = {
            k: v for k, v in data.items() if k != "clue_pool"
        }
        filtered_data["clue_pool"] = filtered_clues

        filename = os.path.basename(input_path)
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(filtered_data, f, indent=2, ensure_ascii=False)

        summary.append({
            "file": filename,
            "original_clues": len(original_clues),
            "kept_clues": len(filtered_clues),
            "removed": len(original_clues) - len(filtered_clues),
            "fixed_none_scores": fixed_none_scores
        })

    return summary

def collect_max_round_files(base_dir):
    pattern = re.compile(r"clue_pool_(\d+)_round_(\d+)\.json")
    best = {}

    for fn in os.listdir(base_dir):
        m = pattern.match(fn)
        if not m:
            continue
        tid, rnd = m.group(1), int(m.group(2))
        if tid not in best or rnd > best[tid][0]:
            best[tid] = (rnd, os.path.join(base_dir, fn))

    selected_files = [v[1] for v in best.values()]
    return selected_files

def normalize_text(s):
    return " ".join((s or "").strip().split()).lower()

def get_embeddings_sentence_transformers(texts, model):
    emb = model.encode(texts)
    return emb

def choose_one_code_per_clue(input_path, output_path, model, sim_threshold=0.80):
    """
    Compact each clue by selecting one final initial code.

    Keeps only:
    - clue_id
    - text
    - final_initial_code
    - coder_agents
    - average_score
    """

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    compact = {
        "transcript_id": data.get("transcript_id"),
        "round": data.get("round"),
        "clue_pool": []
    }

    for clue in data.get("clue_pool", []):
        evidence = clue.get("evidence", [])

        # Keep coder agent names, without duplicates
        coder_agents = sorted({
            ev.get("agent")
            for ev in evidence
            if ev.get("agent")
        })

        codes = []
        for ev in evidence:
            c = ev.get("initial code")
            if c and str(c).strip():
                codes.append(str(c).strip())

        if not codes:
            compact["clue_pool"].append({
                "clue_id": clue.get("clue_id"),
                "text": clue.get("text", ""),
                "final_initial_code": None,
                "coder_agents": coder_agents,
                "average_score": clue.get("average_score")
            })
            continue

        # Normalization
        norm_map = {}
        for c in codes:
            norm = normalize_text(c)
            norm_map.setdefault(norm, []).append(c)

        freq = Counter(normalize_text(c) for c in codes)
        unique_norms = list(freq.keys())

        if len(unique_norms) == 1:
            final = max(norm_map[unique_norms[0]], key=len)

            compact["clue_pool"].append({
                "clue_id": clue.get("clue_id"),
                "text": clue.get("text", ""),
                "final_initial_code": final,
                "coder_agents": coder_agents,
                "average_score": clue.get("average_score")
            })
            continue

        rep_texts = [
            max(norm_map[n], key=len)
            for n in unique_norms
        ]

        embeddings = get_embeddings_sentence_transformers(rep_texts, model)
        sim_matrix = cosine_similarity(embeddings)

        clusters = []
        visited = set()

        for i in range(len(unique_norms)):
            if i in visited:
                continue

            cluster = [i]
            visited.add(i)

            for j in range(i + 1, len(unique_norms)):
                if sim_matrix[i, j] >= sim_threshold:
                    cluster.append(j)
                    visited.add(j)

            clusters.append(cluster)

        best_cluster = None
        best_score = -1

        for cluster in clusters:
            score = sum(freq[unique_norms[i]] for i in cluster)
            if score > best_score:
                best_score = score
                best_cluster = cluster

        candidates = []
        for i in best_cluster:
            candidates.extend(norm_map[unique_norms[i]])

        final = max(candidates, key=len)

        compact["clue_pool"].append({
            "clue_id": clue.get("clue_id"),
            "text": clue.get("text", ""),
            "final_initial_code": final,
            "coder_agents": coder_agents,
            "average_score": clue.get("average_score")
        })

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(compact, f, indent=2, ensure_ascii=False)

    return compact

def generate_compact_clue_pool(
    input_dir,
    output_dir,
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    sim_threshold=0.80
):
    json_files = sorted(glob.glob(os.path.join(input_dir, "*.json")))

    if not json_files:
        raise ValueError(f"No JSON files found in {input_dir}")

    model = SentenceTransformer(model_name)
    os.makedirs(output_dir, exist_ok=True)

    out_paths = []

    for input_path in json_files:
        base = os.path.basename(input_path).replace(".json", "")
        output_path = os.path.join(output_dir, f"{base}_compact.json")

        choose_one_code_per_clue(
            input_path=input_path,
            output_path=output_path,
            model=model,
            sim_threshold=sim_threshold
        )

        out_paths.append(output_path)

# ----------- Codebook Functions ---------- #
OPTION_CONFIGS = {
    1: {
        "name": "skip",
        "retrieval_mode": None,
        "review_policy": "skip"
    },
    3: {
        "name": "code_clue_threshold",
        "retrieval_mode": "code_clue",
        "review_policy": "threshold"
    }
}

def get_option_codebook_path(base_codebook_dir, option_id):
    option_name = OPTION_CONFIGS[option_id]["name"]
    option_dir = os.path.join(base_codebook_dir, f"option_{option_id}_{option_name}")
    os.makedirs(option_dir, exist_ok=True)
    return os.path.join(option_dir, "codebook.json")

### Code text
def build_code_text(code_name):
    code_name = (code_name or "").strip()
    return f"Initial Code: {code_name}"

### Code + clues text
def build_code_clue_text(code_name, clues):
    code_name = (code_name or "").strip()

    if isinstance(clues, list):
        clues_text = "\n".join([str(c).strip() for c in clues if str(c).strip()])
    else:
        clues_text = str(clues).strip()

    return f"Initial Code: {code_name}\nSupporting Quotes: {clues_text}"

### Generate embedding input text
def build_embedding_text(code_name, clues=None, retrieval_mode="code_clue"):
    if retrieval_mode == "code":
        return build_code_text(code_name)

    if retrieval_mode == "code_clue":
        return build_code_clue_text(code_name, clues or [])

    raise ValueError(f"Unknown retrieval_mode: {retrieval_mode}")

### Initialize codebook based on 1st transcript coding results
def initialize_codebook_from_compact_file(
    compact_json_path, # from different coder agents
    codebook_path,
    model,
    retrieval_mode="code_clue"
):
    with open(compact_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    transcript_id = str(data.get("transcript_id", "")).strip()
    clue_pool = data.get("clue_pool", [])

    # group clues by code within this transcript
    code_to_clues = {}

    for item in clue_pool:
        code_name = (item.get("final_initial_code") or "").strip()
        clue = (item.get("text") or "").strip()

        if not code_name:
            continue

        code_to_clues.setdefault(code_name, [])
        if clue and clue not in code_to_clues[code_name]:
            code_to_clues[code_name].append(clue)

    unique_codes = list(code_to_clues.keys())

    texts_to_embed = [
        build_embedding_text(
            code_name=code_name,
            clues=code_to_clues[code_name],
            retrieval_mode=retrieval_mode
        )
        for code_name in unique_codes
    ]

    if texts_to_embed:
        embeddings = model.encode(texts_to_embed, normalize_embeddings=True)
    else:
        embeddings = []

    entries = []
    for code_name, emb in zip(unique_codes, embeddings):
        entries.append({
            "initial code": code_name,
            "embedding": np.asarray(emb, dtype=np.float32).tolist(),
            "transcript_ids": [transcript_id],
            "clues": code_to_clues[code_name]
        })

    codebook = {
        "retrieval_mode": retrieval_mode,
        "entries": entries
    }

    codebook_dir = os.path.dirname(codebook_path)
    if codebook_dir:
        os.makedirs(codebook_dir, exist_ok=True)

    with open(codebook_path, "w", encoding="utf-8") as f:
        json.dump(codebook, f, indent=2, ensure_ascii=False)

    return codebook

def suggest_code_merges(entries, model, threshold=0.8, retrieval_mode="code_clue", include_singletons=False):
    """Return non-destructive merge candidates using codebook compaction logic."""
    norm = []
    for source_index, e in enumerate(entries if isinstance(entries, list) else []):
        code = str(e.get("initial code", "")).strip()
        if not code:
            continue

        clues = e.get("clues", [])
        if not clues and "clue" in e:
            clues = [e["clue"]]

        tids = e.get("transcript_ids", [])
        if not isinstance(tids, list):
            tids = [tids]

        embedding = e.get("embedding")
        if not isinstance(embedding, (list, tuple)) or not embedding:
            continue

        norm.append({
            "id": str(e.get("id") or e.get("code_id") or source_index),
            "source_index": source_index,
            "initial code": code,
            "embedding": embedding,
            "transcript_ids": list(dict.fromkeys(str(t).strip() for t in tids if str(t).strip())),
            "clues": list(dict.fromkeys(str(c).strip() for c in clues if str(c).strip()))
        })
    if not norm:
        return []

    emb_matrix = np.array(
        [e["embedding"] for e in norm],
        dtype=np.float32
    )
    sim_matrix = cosine_similarity(emb_matrix)

    used = set()
    suggestions = []

    for i in range(len(norm)):
        if i in used:
            continue

        members = [norm[i]]
        member_scores = [1.0]
        member_match_types = ["anchor"]
        base = {
            "initial code": norm[i]["initial code"],
            "clues": list(norm[i]["clues"]),
            "transcript_ids": list(norm[i]["transcript_ids"])
        }
        used.add(i)

        for j in range(i + 1, len(norm)):
            if j in used:
                continue

            same_name = norm[i]["initial code"].lower() == norm[j]["initial code"].lower()
            similar = sim_matrix[i, j] >= threshold

            if same_name or similar:
                members.append(norm[j])
                member_scores.append(float(sim_matrix[i, j]))
                member_match_types.append("same_name" if same_name else "semantic_similarity")
                candidate_clues = list(dict.fromkeys(base["clues"] + norm[j]["clues"]))
                candidate_tids = list(dict.fromkeys(base["transcript_ids"] + norm[j]["transcript_ids"]))

                # decide which code name to keep
                keep_j = False
                if len(norm[j]["transcript_ids"]) > len(base["transcript_ids"]):
                    keep_j = True
                elif len(norm[j]["transcript_ids"]) == len(base["transcript_ids"]):
                    if len(norm[j]["clues"]) > len(base["clues"]):
                        keep_j = True

                if keep_j:
                    base["initial code"] = norm[j]["initial code"]

                base["clues"] = candidate_clues
                base["transcript_ids"] = candidate_tids
                used.add(j)

        if len(members) == 1 and not include_singletons:
            continue
        actionable_scores = member_scores[1:]
        suggestions.append({
            "id": "merge-suggestion-{}".format(len(suggestions) + 1),
            "member_ids": [member["id"] for member in members],
            "member_indexes": [member["source_index"] for member in members],
            "codes": [member["initial code"] for member in members],
            "suggested_name": base["initial code"],
            "similarities": [round(score, 6) for score in actionable_scores],
            "similarity_min": round(min(actionable_scores), 6) if actionable_scores else 1.0,
            "similarity_max": round(max(actionable_scores), 6) if actionable_scores else 1.0,
            "match_types": member_match_types[1:],
            "merged_entry": base,
        })

    return suggestions


# Codebook compact after finishing transcript
def codebook_compact(codebook_path, model, threshold=0.8, retrieval_mode="code_clue"):
    with open(codebook_path, "r", encoding="utf-8") as f:
        entries = json.load(f).get("entries", [])

    grouped = suggest_code_merges(
        entries,
        model,
        threshold=threshold,
        retrieval_mode=retrieval_mode,
        include_singletons=True,
    )
    merged = [group["merged_entry"] for group in grouped]
    if not merged:
        codebook = {
            "retrieval_mode": retrieval_mode,
            "entries": []
        }
        with open(codebook_path, "w", encoding="utf-8") as f:
            json.dump(codebook, f, indent=2, ensure_ascii=False)
        return codebook

    texts = [
        build_embedding_text(
            code_name=e["initial code"],
            clues=e["clues"],
            retrieval_mode=retrieval_mode
        )
        for e in merged
    ]

    new_embeddings = model.encode(texts, normalize_embeddings=True)

    for e, emb in zip(merged, new_embeddings):
        e["embedding"] = np.asarray(emb, dtype=np.float32).tolist()

    codebook = {
        "retrieval_mode": retrieval_mode,
        "entries": merged
    }

    with open(codebook_path, "w", encoding="utf-8") as f:
        json.dump(codebook, f, indent=2, ensure_ascii=False)

    return codebook

def load_compact_file(compact_json_path):
    with open(compact_json_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_codebook(codebook_path, retrieval_mode="code_clue"):
    if not os.path.exists(codebook_path):
        return {
            "retrieval_mode": retrieval_mode,
            "entries": []
        }

    with open(codebook_path, "r", encoding="utf-8") as f:
        text = f.read().strip()

    if not text:
        return {
            "retrieval_mode": retrieval_mode,
            "entries": []
        }

    data = json.loads(text)

    if not isinstance(data, dict):
        return {
            "retrieval_mode": retrieval_mode,
            "entries": []
        }

    data.setdefault("retrieval_mode", retrieval_mode)
    data.setdefault("entries", [])

    return data
    
def save_codebook(codebook, path):
    codebook_dir = os.path.dirname(path)
    if codebook_dir:
        os.makedirs(codebook_dir, exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(codebook, f, indent=2, ensure_ascii=False)

# New coding results for a new transcript
def prepare_new_entries_from_compact(compact_json_path, model, retrieval_mode="code_clue"):
    data = load_compact_file(compact_json_path)

    transcript_id = str(data.get("transcript_id", "")).strip()
    clue_pool = data.get("clue_pool", [])

    code_to_clues = {}

    for item in clue_pool:
        if not isinstance(item, dict):
            continue
        code_name = (item.get("final_initial_code") or "").strip()
        clue = (item.get("text") or "").strip()

        if not code_name:
            continue

        code_to_clues.setdefault(code_name, [])
        if clue and clue not in code_to_clues[code_name]:
            code_to_clues[code_name].append(clue)

    unique_codes = list(code_to_clues.keys())
    texts_to_embed = [
        build_embedding_text(
            code_name=code_name,
            clues=code_to_clues[code_name],
            retrieval_mode=retrieval_mode
        )
        for code_name in unique_codes
    ]

    if texts_to_embed:
        embeddings = model.encode(texts_to_embed, normalize_embeddings=True)
    else:
        embeddings = []

    prepared = []
    for code_name, emb in zip(unique_codes, embeddings):
        prepared.append({
            "code_name": code_name,
            "transcript_id": transcript_id,
            "embedding": np.asarray(emb, dtype=np.float32).tolist(),
            "clues": code_to_clues[code_name],
            "retrieval_mode": retrieval_mode
        })

    return prepared

# Retrieval top k codebook for a new code
def retrieve_topk_from_codebook(new_entry, codebook, top_k=3):
    emb_new = new_entry.get("embedding", None)
    if emb_new is None:
        return []
    q = np.asarray(emb_new, dtype=np.float32)
    if q.size == 0:
        return []
    q = q.reshape(1, -1)
    scored = []
    for entry in codebook.get("entries", []):
        emb = entry.get("embedding", None)
        if emb is None:
            continue
        emb = np.asarray(emb, dtype=np.float32)
        if emb.size == 0:
            continue
        emb = emb.reshape(1, -1)
        score = float(cosine_similarity(q, emb)[0, 0])
        scored.append({
            "score": score,
            "initial code": entry.get("initial code", ""),
            "clues": entry.get("clues", [])
        })
    scored.sort(key=lambda x: x["score"], reverse=True)

    return scored[:top_k]

# Retrieval top k codebook for all new codes
def retrieve_for_transcript_from_codebook(compact_json_path, codebook, model, top_k=3, high_threshold=0.80, retrieval_mode="code_clue", review_policy="threshold"):
    new_entries = prepare_new_entries_from_compact(
        compact_json_path=compact_json_path,
        model=model,
        retrieval_mode=retrieval_mode
    )

    results = []

    for new_entry in new_entries:
        retrieved = retrieve_topk_from_codebook(
            new_entry=new_entry,
            codebook=codebook,
            top_k=top_k
        )
        top_score = retrieved[0]["score"] if retrieved else 0.0
        if review_policy == "all_to_reviewer":
            decision = "reviewer_decide"

        elif review_policy == "threshold":
            if top_score >= high_threshold:
                decision = "reuse"
            else:
                decision = "reviewer_decide"

        else:
            raise ValueError(f"Unknown review_policy: {review_policy}")

        results.append({
            "code_name": new_entry["code_name"],
            "transcript_id": new_entry["transcript_id"],
            "clues": new_entry.get("clues", []),
            "top_k": retrieved,
            "top_score": top_score,
            "decision": decision,
            "retrieval_mode": retrieval_mode,
            "review_policy": review_policy
        })
    return results

def split_retrieval_results_by_decision(retrieval_results):
    reuse_results = []
    reviewer_results = []

    for item in retrieval_results:
        decision = (item.get("decision") or "").strip()

        if decision == "reuse":
            reuse_results.append(item)
        elif decision == "reviewer_decide":
            reviewer_results.append(item)

    return reuse_results, reviewer_results

# Process reuse part (based on threshold policy)
"""
New code from current transcript
→ retrieve top-k similar codebook entries
→ if top cosine similarity >= 0.80
→ directly reuse the top retrieved codebook entry
→ add the new clues + transcript_id into that existing codebook entry
"""

def merge_reuse_results_into_codebook(
    codebook,
    reuse_results,
    model,
    retrieval_mode="code_clue"
):
    n_merged = 0
    n_skipped = 0

    for item in reuse_results:
        transcript_id = str(item.get("transcript_id", "")).strip()
        new_clues = item.get("clues", [])
        top_k = item.get("top_k", [])

        if not isinstance(new_clues, list):
            new_clues = [new_clues]

        if not top_k:
            n_skipped += 1
            continue

        matched_code = (top_k[0].get("initial code") or "").strip()

        if not matched_code:
            n_skipped += 1
            continue

        matched_entry = None

        for e in codebook.get("entries", []):
            code = (e.get("initial code") or "").strip()

            if code.lower() == matched_code.lower():
                matched_entry = e
                break

        if matched_entry is None:
            n_skipped += 1
            print(f"ERROR! [WARNING] matched code not found in codebook: {matched_code}")
            continue

        # add clues
        matched_entry.setdefault("clues", [])
        for c in new_clues:
            c = str(c).strip()
            if c and c not in matched_entry["clues"]:
                matched_entry["clues"].append(c)

        # add transcript id
        matched_entry.setdefault("transcript_ids", [])
        if transcript_id and transcript_id not in matched_entry["transcript_ids"]:
            matched_entry["transcript_ids"].append(transcript_id)

        # update embedding
        text = build_embedding_text(
            code_name=matched_entry["initial code"],
            clues=matched_entry["clues"],
            retrieval_mode=retrieval_mode
        )

        emb = model.encode([text], normalize_embeddings=True)[0]
        matched_entry["embedding"] = np.asarray(emb, dtype=np.float32).tolist()

        n_merged += 1

    return {
        "n_merged": n_merged,
        "n_skipped": n_skipped
    }

# Process reviewer part
def reviewer_single(reviewer_input_text, retrieval_mode="code_clue"):
    if retrieval_mode == "code":
        retrieval_note = """
        You will see:
        - The new Initial Code and its Clues
        - Retrieved similar existing codebook entries (Code Name only)
        """
    elif retrieval_mode == "code_clue":
        retrieval_note = """
        You will see:
        - The new Initial Code and its Clues
        - Retrieved similar existing codebook entries (Code Name and Clues)
        """
    else:
        raise ValueError(f"Unknown retrieval_mode: {retrieval_mode}")

    system_instruction = f"""
    You are a review coder in the reflexive thematic analysis of interviews conducted with family caregivers of individuals with Alzheimer’s disease or related dementias.
    Your job is to review one new coding result against similar existing entries from the codebook.

    {retrieval_note}

    Your task:
    Step 1. Merge step:
    Decide whether the new code and its clues can be merged to one of the retrieved similar codebook entries.
    Step 2. New-code step:
    If no retrieved codebook entry adequately matches, keep the original Initial Code.

    Rules:
    - Always try to map/merge to an existing code first.
    - Do not create or invent a different code name.
    - If Status is EXISTING:
    Final Code must be exactly one Code Name from the retrieved similar codebook entries.
    - If Status is NEW:
    Final Code must be exactly the Initial Code.
    - Status must be exactly EXISTING or NEW.

    Output exactly:
    Final Code: [code name]
    Status: [EXISTING or NEW]
    """

    task_instruction = f"""
    {reviewer_input_text}

    ### OUTPUT ###
    Final Code: [final code name after review]
    Status: [EXISTING or NEW]
    """

    messages = [
        {"role": "system", "content": system_instruction.strip()},
        {"role": "user", "content": task_instruction.strip()}
    ]
    return messages

# format content will be sent to reviewer
def build_reviewer_input_text_single(item, retrieval_mode="code_clue"):
    code_name = (item.get("code_name") or "").strip()
    clues = item.get("clues", [])
    top_k = item.get("top_k", [])

    if not isinstance(clues, list):
        clues = [clues]

    lines = [f"New Code: {code_name}"]
    lines.append("Clues:")
    for clue in clues:
        clue = str(clue).strip()
        if clue:
            lines.append(f'- "{clue}"')

    lines.append("")
    lines.append("Retrieved similar codebook entries:")

    if not top_k:
        lines.append("(no similar codes found)")
    else:
        for idx, hit in enumerate(top_k, start=1):
            existing_code = (hit.get("initial code") or "").strip()
            lines.append(f"Code Name: {existing_code}")

            if retrieval_mode == "code_clue":
                existing_clues = hit.get("clues", [])
                if not isinstance(existing_clues, list):
                    existing_clues = [existing_clues]
                lines.append("Clues:")
                for clue in existing_clues:
                    clue = str(clue).strip()
                    if clue:
                        lines.append(f'- "{clue}"')

            lines.append("")

    return "\n".join(lines).strip()


# Reviewer output parser
_BLOCK_PATTERN_REVIEWER_SIMPLE = re.compile(
    r"Final\s*Code:\s*(.*?)\n\s*Status:\s*(.*?)(?=\n\s*Final\s*Code:|\Z)",
    flags=re.DOTALL | re.IGNORECASE,
)

def parse_reviewer_output_simple(text):
    if not text or not str(text).strip():
        return []

    out = []
    for code_raw, status_raw in _BLOCK_PATTERN_REVIEWER_SIMPLE.findall(text):
        final_code = " ".join(code_raw.strip().split())
        status = status_raw.strip().upper()

        if status in {"EXIST", "EXISTING"}:
            status = "EXISTING"
        elif status == "NEW":
            status = "NEW"
        else:
            continue

        if final_code:
            out.append({
                "final code": final_code,
                "status": status
            })

    return out

# NEW status
def add_new_entry(codebook, code, clues, transcript_id, embedding):
    codebook.setdefault("entries", []).append({
        "initial code": code,
        "embedding": np.asarray(embedding, dtype=np.float32).tolist(),
        "transcript_ids": [transcript_id],
        "clues": clues
    })

# EXISTING status
def merge_existing_reviewer_result_into_codebook(
    codebook,
    final_code,
    clues,
    transcript_id,
    model,
    retrieval_mode="code_clue",
    sim_threshold=0.95
):
    matched_entry = None
    final_code = str(final_code or "").strip()
    final_code_lower = final_code.lower()

    # Step 1: lowercase exact match
    for e in codebook.get("entries", []):
        code = (e.get("initial code") or "").strip()
        if code.lower() == final_code_lower:
            matched_entry = e
            break

    # Step 2: high code-name embedding similarity
    if matched_entry is None:
        target_text = build_code_text(final_code)
        target_emb = model.encode([target_text], normalize_embeddings=True)[0]

        best_entry = None
        best_score = -1

        for e in codebook.get("entries", []):
            code = (e.get("initial code") or "").strip()
            code_text = build_code_text(code)
            code_emb = model.encode([code_text], normalize_embeddings=True)[0]

            score = float(
                cosine_similarity(
                    np.asarray(target_emb).reshape(1, -1),
                    np.asarray(code_emb).reshape(1, -1)
                )[0, 0]
            )

            if score > best_score:
                best_score = score
                best_entry = e

        if best_entry is not None and best_score >= sim_threshold:
            matched_entry = best_entry
        else:
            print(
                f"WARNING: Reviewer EXISTING code not found in codebook: {final_code}. "
                f"Best similarity={best_score:.4f}. Adding as NEW instead."
            )

            if not isinstance(clues, list):
                clues = [clues]

            embedding_text = build_embedding_text(
                code_name=final_code,
                clues=clues,
                retrieval_mode=retrieval_mode
            )
            embedding = model.encode([embedding_text], normalize_embeddings=True)[0]

            add_new_entry(
                codebook=codebook,
                code=final_code,
                clues=clues,
                transcript_id=transcript_id,
                embedding=embedding
            )

            return "added_as_new"

    # Merge clues
    if not isinstance(clues, list):
        clues = [clues]

    matched_entry.setdefault("clues", [])
    for c in clues:
        c = str(c).strip()
        if c and c not in matched_entry["clues"]:
            matched_entry["clues"].append(c)

    # Merge transcript id
    transcript_id = str(transcript_id).strip()
    matched_entry.setdefault("transcript_ids", [])
    if transcript_id and transcript_id not in matched_entry["transcript_ids"]:
        matched_entry["transcript_ids"].append(transcript_id)

    # Update embedding
    text = build_embedding_text(
        code_name=matched_entry["initial code"],
        clues=matched_entry["clues"],
        retrieval_mode=retrieval_mode
    )

    emb = model.encode([text], normalize_embeddings=True)[0]
    matched_entry["embedding"] = np.asarray(emb, dtype=np.float32).tolist()

    return True
    
def update_codebook_from_reviewer_results(
    codebook,
    reviewer_results,
    transcript_id,
    model,
    retrieval_mode="code_clue"
):
    n_merged = 0
    n_added = 0
    n_skipped_existing = 0
    n_skipped_unknown_status = 0

    for item in reviewer_results:
        final_code = (item.get("final code") or "").strip()
        status = (item.get("status") or "").strip().upper()
        clues = item.get("clues", [])

        if not final_code:
            continue

        if not isinstance(clues, list):
            clues = [clues]

        if status == "EXISTING":
            merged = merge_existing_reviewer_result_into_codebook(
                codebook=codebook,
                final_code=final_code,
                clues=clues,
                transcript_id=transcript_id,
                model=model,
                retrieval_mode=retrieval_mode,
                sim_threshold=0.95
            )

            if merged:
                n_merged += 1
            else:
                n_skipped_existing += 1

                print(
                    f"ERROR! [SKIPPED] Reviewer marked EXISTING, but no matched codebook entry was found. "
                )

        elif status == "NEW":
            embedding_text = build_embedding_text(
                code_name=final_code,
                clues=clues,
                retrieval_mode=retrieval_mode
            )

            embedding = model.encode(
                [embedding_text],
                normalize_embeddings=True
            )[0]

            add_new_entry(
                codebook=codebook,
                code=final_code,
                clues=clues,
                transcript_id=transcript_id,
                embedding=embedding
            )

            n_added += 1

        else:
            n_skipped_unknown_status += 1
            print(f"ERROR! [WARNING] Unknown reviewer status skipped: {status} | code={final_code}")

    return {
        "n_merged": n_merged,
        "n_added": n_added,
        "n_skipped_existing": n_skipped_existing,
        "n_skipped_unknown_status": n_skipped_unknown_status
    }

def compact_compact_json(
    input_path,
    output_path,
    model,
    threshold=0.80
):
    """
    Merge identical or semantically similar codes within one transcript.

    Input:
        Output from choose_one_code_per_clue()

    Output:
        One clue_pool item per compacted code:
        {
            "text": [quote1, quote2, ...],
            "final_initial_code": "...",
            "coder_agents": [...]
        }
    """

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # --------------------------------------------------
    # 1. Group clues with the same normalized code name
    # --------------------------------------------------
    grouped = {}

    for item in data.get("clue_pool", []):
        code = str(item.get("final_initial_code") or "").strip()
        text = str(item.get("text") or "").strip()
        agents = item.get("coder_agents", [])

        if not code:
            continue

        if not isinstance(agents, list):
            agents = [agents]

        key = normalize_text(code)

        if key not in grouped:
            grouped[key] = {
                "final_initial_code": code,
                "text": [],
                "coder_agents": []
            }

        if text and text not in grouped[key]["text"]:
            grouped[key]["text"].append(text)

        for agent in agents:
            agent = str(agent).strip()
            if agent and agent not in grouped[key]["coder_agents"]:
                grouped[key]["coder_agents"].append(agent)

    groups = list(grouped.values())

    if not groups:
        output = {
            "transcript_id": data.get("transcript_id"),
            "round": data.get("round"),
            "clue_pool": []
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        return output

    # --------------------------------------------------
    # 2. Embed each code together with its quotes
    # --------------------------------------------------
    embedding_texts = [
        build_code_clue_text(
            group["final_initial_code"],
            group["text"]
        )
        for group in groups
    ]

    embeddings = model.encode(
        embedding_texts,
        normalize_embeddings=True
    )

    sim_matrix = cosine_similarity(embeddings)

    # --------------------------------------------------
    # 3. Greedily merge semantically similar code groups
    # --------------------------------------------------
    used = set()
    compacted = []

    for i in range(len(groups)):
        if i in used:
            continue

        cluster = [i]
        used.add(i)

        for j in range(i + 1, len(groups)):
            if j in used:
                continue

            if sim_matrix[i, j] >= threshold:
                cluster.append(j)
                used.add(j)

        cluster_groups = [groups[idx] for idx in cluster]

        # Keep the code supported by the most quotes.
        # If tied, keep the shortest code name.
        representative = max(
            cluster_groups,
            key=lambda x: (
                len(x["text"]),
                -len(x["final_initial_code"])
            )
        )

        combined_texts = []
        combined_agents = []

        for group in cluster_groups:
            for text in group["text"]:
                if text not in combined_texts:
                    combined_texts.append(text)

            for agent in group["coder_agents"]:
                if agent not in combined_agents:
                    combined_agents.append(agent)

        compacted.append({
            "text": combined_texts,
            "final_initial_code": representative["final_initial_code"],
            "coder_agents": sorted(combined_agents)
        })

    output = {
        "transcript_id": data.get("transcript_id"),
        "round": data.get("round"),
        "clue_pool": compacted
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    return output

### Final Function
def run_multi_transcript_dynamic_rounds(
    files_list, # chunk transcript list list
    agents,
    max_rounds, # 4
    all_agent_initial_reflections,
    coding_base_dir, # independent coding
    final_coding_base_dir, # final coding --> merge all chunks for a transcript
    final_coding_without_score_base_dir, # final coding without score
    agent_personas,
    novelty_threshold=0.05,
    k=2,
    clue_pool_dir_for_novelty=None,
    progress_callback=None,
    research_question=None,
    interviewee=None,
    completion_fn=None,
    reflection_output_base_dir=None
):
    if completion_fn is None:
        raise ValueError("completion_fn is required to run the RTA workflow.")

    def report_progress(message):
        print(message)
        if callable(progress_callback):
            try:
                progress_callback(message)
            except Exception:
                pass

    all_novelty_logs = []  

    AD_dir = os.path.dirname(coding_base_dir) # dataset folder
    output_dir_1a = os.path.join(AD_dir, "clue_pool_step1a")  # merge all agents
    output_dir_1c = os.path.join(AD_dir, "clue_pool_step1c")  # containment dedup
    output_dir_1d = os.path.join(AD_dir, "clue_pool_step1d")  # similarity dedup
    output_dir_filtered_4 = os.path.join(AD_dir, "clue_pool_filtered_4") # score >= 4
    output_dir_compact = os.path.join(AD_dir, "clue_pool_compact") # select the final initial code for a clue

    if clue_pool_dir_for_novelty is None:
        clue_pool_dir_for_novelty = output_dir_1d
    
    os.makedirs(output_dir_1a, exist_ok=True)
    os.makedirs(output_dir_1c, exist_ok=True)
    os.makedirs(output_dir_1d, exist_ok=True)
    os.makedirs(output_dir_filtered_4, exist_ok=True)
    os.makedirs(output_dir_compact, exist_ok=True)
    os.makedirs(final_coding_base_dir, exist_ok=True)
    os.makedirs(final_coding_without_score_base_dir, exist_ok=True)

    report_progress("Loading semantic model for transcript chunking and novelty checks...")
    model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

    compact_coding_files = []

    for t_idx, selected_files in enumerate(files_list, start=1):
        if not selected_files:
            print("empty, skipping.")
            continue

        tid0, _ = parse_ids(selected_files[0]) # transcript id, chunk id
        if not tid0:
            raise ValueError(f"ERROR! Filename not matched: {selected_files[0]}")

        for fp in selected_files:
            tid, _ = parse_ids(fp)
            if tid != tid0:
                raise ValueError(f"ERROR! Mixed transcript IDs in same group: expected {tid0}, got {tid} in {fp}")

        transcript_id = tid0
        report_progress(f"Starting transcript {transcript_id} ({len(selected_files)} chunk(s))...")

        novelty_hist = []
        latest_agent_reflections = {}
        for agent_name in agents:
            if isinstance(all_agent_initial_reflections, dict):
                latest_agent_reflections[agent_name] = copy.deepcopy(
                    all_agent_initial_reflections.get(agent_name, {})
                )
            else:
                latest_agent_reflections[agent_name] = {}
        round_number = 1
        last_completed_round = None

        while round_number <= max_rounds:
            report_progress(f"Starting coding round {round_number} of {max_rounds}...")

            ### independent coding among agents###
            for chunk_index, fp in enumerate(selected_files, start=1):
                tid, chunk_id = parse_ids(fp)
                if not tid:
                    print(f"ERROR! Skipping (filename not matched): {os.path.basename(fp)}")
                    continue

                for agent_name in agents:
                    agent_label = agent_name.replace("_", " ")
                    report_progress(
                        f"Round {round_number}: coding chunk "
                        f"{chunk_index}/{len(selected_files)} with {agent_label}..."
                    )
                    if (t_idx == 1) and (round_number == 1): # first transcript under first round
                        agent_reflection = copy.deepcopy(
                            latest_agent_reflections.get(agent_name, {})
                        )  # ref0
                    else:
                        raw_reflection = get_latest_reflection(
                            agent_name,
                            reflection_output_base_dir=reflection_output_base_dir,
                        )

                        if raw_reflection:
                            latest_agent_reflections[agent_name] = copy.deepcopy(raw_reflection)
                        else:
                            raw_reflection = latest_agent_reflections.get(agent_name) or {}
                            report_progress(
                                f"Round {round_number}: using previous reflection for {agent_label}..."
                            )
                            print(
                                f"WARNING: No updated reflection found for {agent_name} | "
                                f"transcript {tid} chunk {chunk_id}; using previous reflection."
                            )
                    
                        agent_reflection = copy.deepcopy(raw_reflection)
                        if round_number == 1 and isinstance(agent_reflection, dict): # other transcripts under first round
                            agent_reflection = {
                                "assumptions": agent_reflection.get("assumptions", "")
                            }

                    coding_memory_content = None
                    if round_number > 1: # coding memory
                        coding_memory_content = load_prev_round_coding_output(
                            coding_base_dir=coding_base_dir,
                            agent_name=agent_name,
                            previous_round=round_number - 1,
                            transcript_id=tid,
                            chunk_id=chunk_id
                        )

                    try:
                        run_independent_coding(
                            fp,
                            agent_name,
                            agent_reflection,
                            tid,
                            chunk_id,
                            round_number=round_number,
                            coding_memory_content=coding_memory_content,
                            research_question=research_question,
                            interviewee=interviewee,
                            fixed_profile=agent_personas.get(agent_name),
                            completion_fn=completion_fn,
                            output_base_dir=coding_base_dir,
                        )
                        print(f"Done: {agent_name} | chunk {chunk_id} | round {round_number}")
                    except Exception as e:
                        print(f"Error: {agent_name} | chunk {chunk_id} | round {round_number}: {e}")

            report_progress(f"Round {round_number}: cleaning coding outputs...")
            clean_chunk_round_outputs(coding_base_dir, agents, transcript_id, round_number)
            report_progress(f"Round {round_number}: merging chunk-level coding outputs...")
            merge_chunk_round_outputs(
                coding_base_dir,
                agents,
                transcript_id,
                round_number,
                final_coding_base_dir,
            )
            # _final.json contains score

            report_progress(f"Round {round_number}: preparing no-score coding outputs...")
            remove_importance_score(final_coding_base_dir) # generate _final_without_score json files

            # build clue_pool for this round (used for novelty)
            report_progress(f"Round {round_number}: merging agents into clue pool...")
            run_merge_all(final_coding_base_dir, output_dir_1a, [transcript_id], [round_number], agents)
            report_progress(f"Round {round_number}: removing contained duplicate excerpts...")
            run_build_clue_pools_containment(output_dir_1a, output_dir_1c)
            report_progress(f"Round {round_number}: removing similar duplicate excerpts...")
            run_build_clue_pools_similar(output_dir_1c, output_dir_1d)

            # mark this round as successfully completed
            last_completed_round = round_number

            # novelty check (round>=2)
            if round_number >= 2:
                report_progress(f"Round {round_number}: checking novelty against previous round...")
                novelty_val = compute_single_transcript_round_novelty(
                    clue_pool_dir=clue_pool_dir_for_novelty,
                    transcript_id=transcript_id,
                    cur_round=round_number
                )
                all_novelty_logs.append({
                    "transcript_id": transcript_id,
                    "cur_round": round_number,
                    "pre_round": round_number - 1,
                    "novelty": novelty_val,
                })
                if novelty_val is None or (isinstance(novelty_val, float) and np.isnan(novelty_val)):
                    novelty_hist.append(None)
                    print(f"[Novelty] {transcript_id} r{round_number-1}->r{round_number}: (missing)")
                else:
                    novelty_hist.append(novelty_val)
                    print(f"[Novelty] {transcript_id} r{round_number-1}->r{round_number}: {novelty_val:.4f}")

                if should_stop_by_novelty(novelty_hist, novelty_threshold, k):
                    report_progress(
                        f"Novelty saturated after round {round_number}; preparing final coding results..."
                    )
                    break

            # collaboration (only if we will continue to another round)
            if round_number < max_rounds:
                report_progress(f"Round {round_number}: updating coder-agent reflections...")
                for target_agent in agents:
                    agent_label = target_agent.replace("_", " ")
                    report_progress(
                        f"Round {round_number}: updating {agent_label} reflection for next round..."
                    )
                    try:
                        new_reflection_path = run_reflection_update(
                            target_agent,
                            agent_personas[target_agent],
                            transcript_id,
                            str(round_number),
                            final_coding_without_score_base_dir,
                            agents=agents,
                            completion_fn=completion_fn,
                            reflection_output_base_dir=reflection_output_base_dir,
                        )
                        if new_reflection_path:
                            updated_reflection = get_latest_reflection(
                                target_agent,
                                reflection_output_base_dir=reflection_output_base_dir,
                            )
                            latest_agent_reflections[target_agent] = copy.deepcopy(updated_reflection)
                            print(f"Updated reflection: {target_agent} (after round {round_number})")
                        else:
                            print(
                                f"WARNING: Reflection update did not create a file for {target_agent} "
                                f"after round {round_number}; keeping previous reflection."
                            )
                    except Exception as e:
                        print(f"Reflection update failed: {target_agent} | {e}")

            round_number += 1

        report_progress("Dynamic coding rounds finished; selecting final codes and excerpts...")

        # we only process coding results from final round
        if last_completed_round is None:
            print(f"ERROR! No completed rounds for transcript {transcript_id}, skipping score filter/code selection.")
            continue

        final_clue_pool_file = os.path.join(
            output_dir_1d,
            f"clue_pool_{transcript_id}_round_{last_completed_round}.json"
        )

        if not os.path.exists(final_clue_pool_file):
            print(f"Final clue pool file not found: {final_clue_pool_file}")
            continue
        
        # filter by score for this transcript only
        report_progress("Filtering final excerpts by score...")
        summary = filter_json_files_by_score([final_clue_pool_file], output_dir_filtered_4, min_score=4)
        # choose one final code per clue for this transcript only
        filtered_file = os.path.join(
            output_dir_filtered_4,
            os.path.basename(final_clue_pool_file)
        )
        compact_output_file = os.path.join(
            output_dir_compact,
            os.path.basename(filtered_file).replace(".json", "_compact.json")
        )
        report_progress("Creating coding results for display...")
        choose_one_code_per_clue(
            input_path=filtered_file,
            output_path=compact_output_file,
            model=model,
            sim_threshold=0.80
        )
        compact_coding_files.append(compact_output_file)

    return {
            "compact_coding_files": compact_coding_files,
            "novelty_logs": all_novelty_logs
    }

    """
        selected_code_file = os.path.join(
            output_dir_compact,
            os.path.basename(filtered_file).replace(
                ".json",
                "_selected_codes.json"
            )
        )

        compact_output_file = os.path.join(
            output_dir_compact,
            os.path.basename(filtered_file).replace(
                ".json",
                "_compact.json"
            )
        )

        report_progress("Selecting one final initial code for each excerpt...")
        choose_one_code_per_clue(
            input_path=filtered_file,
            output_path=selected_code_file,
            model=model,
            sim_threshold=0.80
        )

        report_progress("Compacting similar initial codes within the transcript...")
        compact_compact_json(
            input_path=selected_code_file,
            output_path=compact_output_file,
            model=model,
            threshold=0.80
        )

        compact_coding_files.append(compact_output_file)

    return {
        "compact_coding_files": compact_coding_files,
        "novelty_logs": all_novelty_logs
    }
    """
