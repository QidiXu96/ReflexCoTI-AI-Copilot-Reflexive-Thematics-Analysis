# codebook creation
import os
import json
import time
import numpy as np
from sentence_transformers import SentenceTransformer
from RTA_workflow import (
    codebook_compact,
    load_codebook,
    save_codebook,
    retrieve_topk_from_codebook,
    split_retrieval_results_by_decision,
    merge_reuse_results_into_codebook,
    reviewer_single,
    build_reviewer_input_text_single,
    parse_reviewer_output_simple,
    build_embedding_text,
    add_new_entry,
    update_codebook_from_reviewer_results
)

def load_code_quote_result(json_path):
    """Load either website coding JSON or compact workflow JSON."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    transcript = data.get("transcript")
    transcript = transcript if isinstance(transcript, dict) else {}
    transcript_id = str(
        data.get("transcript_id")
        or transcript.get("id")
        or ""
    ).strip()
    if not transcript_id:
        file_name = str(transcript.get("file_name") or "").strip()
        transcript_id = os.path.splitext(os.path.basename(file_name))[0]
    if not transcript_id:
        raise ValueError(f"Could not determine transcript_id from: {json_path}")

    grouped = {}
    display_names = {}

    def add(code_name, clues):
        code_name = " ".join(str(code_name or "").strip().split())
        if not code_name:
            return
        if not isinstance(clues, list):
            clues = [clues] if clues is not None else []
        key = code_name.casefold()
        display_names.setdefault(key, code_name)
        grouped.setdefault(key, [])
        for clue in clues:
            clue = " ".join(str(clue or "").strip().split())
            if len(clue) >= 2 and clue.startswith(chr(34)) and clue.endswith(chr(34)):
                clue = clue[1:-1].strip()
            if clue and clue not in grouped[key]:
                grouped[key].append(clue)

    codes = data.get("codes")
    if isinstance(codes, list):
        for item in codes:
            if not isinstance(item, dict):
                continue
            clues = []
            for field in ("excerpts", "quotes", "quote", "excerpt"):
                value = item.get(field)
                if isinstance(value, list):
                    clues.extend(value)
                elif value is not None and str(value).strip():
                    clues.append(value)
            add(
                item.get("code name") or item.get("code_name") or item.get("title"),
                clues,
            )
    else:
        clue_pool = data.get("clue_pool")
        if not isinstance(clue_pool, list):
            raise ValueError(f"Expected a codes or clue_pool list in: {json_path}")
        for item in clue_pool:
            if isinstance(item, dict):
                add(
                    item.get("final_initial_code") or item.get("initial code"),
                    item.get("text") or item.get("clue"),
                )

    code_to_clues = {
        display_names[key]: clues for key, clues in grouped.items()
    }
    return transcript_id, code_to_clues


def prepare_entries(json_path, model, retrieval_mode="code_clue"):
    transcript_id, code_to_clues = load_code_quote_result(json_path)
    code_names = list(code_to_clues)
    texts = [
        build_embedding_text(code_name, code_to_clues[code_name], retrieval_mode)
        for code_name in code_names
    ]
    embeddings = model.encode(texts, normalize_embeddings=True) if texts else []
    return transcript_id, [
        {
            "code_name": code_name,
            "transcript_id": transcript_id,
            "clues": code_to_clues[code_name],
            "embedding": np.asarray(embedding, dtype=np.float32).tolist(),
        }
        for code_name, embedding in zip(code_names, embeddings)
    ]


def initialize_codebook(json_path, codebook_path, model, retrieval_mode="code_clue"):
    _, prepared = prepare_entries(json_path, model, retrieval_mode)
    codebook = {
        "retrieval_mode": retrieval_mode,
        "entries": [
            {
                "initial code": item["code_name"],
                "embedding": item["embedding"],
                "transcript_ids": [item["transcript_id"]],
                "clues": item["clues"],
            }
            for item in prepared
        ],
    }
    save_codebook(codebook, codebook_path)
    return codebook


def retrieve_for_transcript(
    json_path,
    codebook,
    model,
    top_k=3,
    high_threshold=0.80,
    retrieval_mode="code_clue",
):
    _, prepared = prepare_entries(json_path, model, retrieval_mode)
    results = []
    for item in prepared:
        matches = retrieve_topk_from_codebook(item, codebook, top_k=top_k)
        top_score = matches[0]["score"] if matches else 0.0
        results.append({
            "code_name": item["code_name"],
            "transcript_id": item["transcript_id"],
            "clues": item["clues"],
            "top_k": matches,
            "top_score": top_score,
            "decision": "reuse" if top_score >= high_threshold else "reviewer_decide",
            "retrieval_mode": retrieval_mode,
            "review_policy": "threshold",
        })
    return results


# Get transcript ID
def get_transcript_id(json_path):
    return load_code_quote_result(json_path)[0]

# Add a code as NEW when reviewer fails
def add_new_fallback(
    codebook,
    code_name,
    clues,
    transcript_id,
    model,
    retrieval_mode
):
    if not isinstance(clues, list):
        clues = [clues]

    embedding_text = build_embedding_text(
        code_name=code_name,
        clues=clues,
        retrieval_mode=retrieval_mode
    )

    embedding = model.encode(
        [embedding_text],
        normalize_embeddings=True
    )[0]

    add_new_entry(
        codebook=codebook,
        code=code_name,
        clues=clues,
        transcript_id=transcript_id,
        embedding=embedding
    )

# Process reviewer-required codes
def process_reviewer_results(
    codebook,
    reviewer_results,
    transcript_id,
    model,
    completion_fn,
    retrieval_mode="code_clue",
    sleep_seconds=2
):
    parsed_results = []
    review_log_entries = []

    for item in reviewer_results:
        code_name = (item.get("code_name") or "").strip()
        clues = item.get("clues", [])

        if not isinstance(clues, list):
            clues = [clues]

        reviewer_input_text = build_reviewer_input_text_single(item=item, retrieval_mode=retrieval_mode)

        messages = reviewer_single(reviewer_input_text=reviewer_input_text, retrieval_mode=retrieval_mode)

        try:
            response = completion_fn(messages)
            review_content = response.choices[0].message.content

        except Exception as e:
            print(f"Reviewer API error for '{code_name}': {e}")

            add_new_fallback(
                codebook=codebook,
                code_name=code_name,
                clues=clues,
                transcript_id=transcript_id,
                model=model,
                retrieval_mode=retrieval_mode
            )

            review_log_entries.append({
                "code_name": code_name,
                "status": "API_ERROR"
            })

            continue

        if sleep_seconds:
            time.sleep(sleep_seconds)

        if not review_content or not review_content.strip():
            print(f"Empty reviewer response for '{code_name}'.")

            add_new_fallback(
                codebook=codebook,
                code_name=code_name,
                clues=clues,
                transcript_id=transcript_id,
                model=model,
                retrieval_mode=retrieval_mode
            )

            review_log_entries.append({
                "code_name": code_name,
                "status": "EMPTY_RESPONSE"
            })

            continue

        parsed = parse_reviewer_output_simple(review_content.strip())

        if not parsed:
            print(f"Failed to parse reviewer response for '{code_name}'.")

            add_new_fallback(
                codebook=codebook,
                code_name=code_name,
                clues=clues,
                transcript_id=transcript_id,
                model=model,
                retrieval_mode=retrieval_mode
            )

            review_log_entries.append({
                "code_name": code_name,
                "status": "PARSE_FAILURE"
            })

            continue

        result = parsed[0]

        result["clues"] = clues

        # Reviewer cannot invent a new code name
        if result.get("status") == "NEW":
            result["final code"] = code_name

        parsed_results.append(result)

        review_log_entries.append({
            "code_name": code_name,
            "parsed": result
        })

    return parsed_results, review_log_entries

# Save reviewer log
def save_reviewer_log(
    review_log_entries,
    review_output_dir,
    transcript_id
):
    os.makedirs(review_output_dir, exist_ok=True)

    log_path = os.path.join(review_output_dir, f"codebook_review_{transcript_id}.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(review_log_entries, f, indent=2, ensure_ascii=False)

    return log_path

# Save a snapshot after each transcript
def save_codebook_snapshot(
    codebook,
    codebook_path,
    transcript_id
):
    snapshot_path = os.path.join(os.path.dirname(codebook_path), f"codebook_after_{transcript_id}.json")

    save_codebook(codebook, snapshot_path)
    return snapshot_path

# Main
def update_codebook_with_transcript(
    json_path,
    codebook_path,
    review_output_dir,
    completion_fn,
    top_k=3,
    reuse_threshold=0.80,
    compact_threshold=0.80,
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    sleep_seconds=2,
    _model=None,
):
    retrieval_mode = "code_clue"

    transcript_id = get_transcript_id(json_path)

    model = _model or SentenceTransformer(model_name)

    # ============================================================
    # First transcript: initialize codebook
    # ============================================================
    if not os.path.exists(codebook_path):
        initialize_codebook(
            json_path=json_path,
            codebook_path=codebook_path,
            model=model,
            retrieval_mode=retrieval_mode
        )
        codebook_compact(
            codebook_path=codebook_path,
            model=model,
            threshold=compact_threshold,
            retrieval_mode=retrieval_mode
        )
        codebook = load_codebook(
            codebook_path,
            retrieval_mode=retrieval_mode
        )
        snapshot_path = save_codebook_snapshot(
            codebook=codebook,
            codebook_path=codebook_path,
            transcript_id=transcript_id
        )
        return {
            "transcript_id": transcript_id,
            "status": "initialized",
            "codebook": codebook,
            "codebook_size": len(codebook.get("entries", [])),
            "snapshot_path": snapshot_path
        }

    # ============================================================
    # Later transcripts: retrieve against existing codebook
    # ============================================================
    codebook = load_codebook(
        codebook_path,
        retrieval_mode=retrieval_mode
    )

    before_size = len(codebook.get("entries", []))

    retrieval_results = retrieve_for_transcript(
        json_path=json_path,
        codebook=codebook,
        model=model,
        top_k=top_k,
        high_threshold=reuse_threshold,
        retrieval_mode=retrieval_mode
    )

    reuse_results, reviewer_results = (
        split_retrieval_results_by_decision(retrieval_results)
    )

    # ============================================================
    # Automatic reuse
    # ============================================================
    if reuse_results:
        reuse_summary = merge_reuse_results_into_codebook(
            codebook=codebook,
            reuse_results=reuse_results,
            model=model,
            retrieval_mode=retrieval_mode
        )
    else:
        reuse_summary = {
            "n_merged": 0,
            "n_skipped": 0
        }

    # ============================================================
    # Reviewer
    # ============================================================
    parsed_results = []
    review_log_entries = []

    if reviewer_results:
        parsed_results, review_log_entries = process_reviewer_results(
            codebook=codebook,
            reviewer_results=reviewer_results,
            transcript_id=transcript_id,
            model=model,
            completion_fn=completion_fn,
            retrieval_mode=retrieval_mode,
            sleep_seconds=sleep_seconds
        )

    # ============================================================
    # Apply reviewer decisions
    # ============================================================
    if parsed_results:
        reviewer_summary = update_codebook_from_reviewer_results(
            codebook=codebook,
            reviewer_results=parsed_results,
            transcript_id=transcript_id,
            model=model,
            retrieval_mode=retrieval_mode
        )
    else:
        reviewer_summary = {
            "n_merged": 0,
            "n_added": 0,
            "n_skipped_existing": 0,
            "n_skipped_unknown_status": 0
        }

    # ============================================================
    # Save reviewer log
    # ============================================================
    log_path = save_reviewer_log(
        review_log_entries=review_log_entries,
        review_output_dir=review_output_dir,
        transcript_id=transcript_id
    )

    # ============================================================
    # Save updated codebook before compacting
    # ============================================================
    save_codebook(codebook, codebook_path)

    # ============================================================
    # Compact after processing this transcript
    # ============================================================
    codebook_compact(
        codebook_path=codebook_path,
        model=model,
        threshold=compact_threshold,
        retrieval_mode=retrieval_mode
    )

    codebook = load_codebook(
        codebook_path,
        retrieval_mode=retrieval_mode
    )

    # ============================================================
    # Save snapshot
    # ============================================================
    snapshot_path = save_codebook_snapshot(
        codebook=codebook,
        codebook_path=codebook_path,
        transcript_id=transcript_id
    )

    return {
        "transcript_id": transcript_id,
        "status": "updated",
        "before_size": before_size,
        "after_size": len(codebook.get("entries", [])),
        "automatic_reuse": reuse_summary.get("n_merged", 0),
        "reviewer_existing": reviewer_summary.get("n_merged", 0),
        "reviewer_new": reviewer_summary.get("n_added", 0),
        "reviewer_count": len(reviewer_results),
        "codebook": codebook,
        "review_log_path": log_path,
        "snapshot_path": snapshot_path
    }


# Website API: add one reviewed transcript to an existing codebook.
def update_codebook_from_code_quote_file(
    json_path,
    codebook_path,
    review_output_dir,
    top_k=3,
    reuse_threshold=0.80,
    compact_threshold=0.80,
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    sleep_seconds=0,
    completion_fn=None,
):
    if completion_fn is None:
        raise ValueError("completion_fn is required to update the codebook.")
    if not os.path.exists(codebook_path):
        raise FileNotFoundError(f"Codebook not found: {codebook_path}")
    return update_codebook_with_transcript(
        json_path=json_path,
        codebook_path=codebook_path,
        review_output_dir=review_output_dir,
        completion_fn=completion_fn,
        top_k=top_k,
        reuse_threshold=reuse_threshold,
        compact_threshold=compact_threshold,
        model_name=model_name,
        sleep_seconds=sleep_seconds,
    )


# Website API: create a codebook from ordered transcript files.
def codebook_creation(
    coding_result_files,
    codebook_path,
    review_output_dir,
    top_k=3,
    reuse_threshold=0.80,
    compact_threshold=0.80,
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    sleep_seconds=0,
    completion_fn=None,
):
    if completion_fn is None:
        raise ValueError("completion_fn is required to create the codebook.")
    if not coding_result_files:
        raise ValueError("coding_result_files is empty.")

    model = SentenceTransformer(model_name)
    seen_transcript_ids = set()
    result = None
    for json_path in coding_result_files:
        if not os.path.exists(json_path):
            raise FileNotFoundError(f"Coding-result file not found: {json_path}")
        transcript_id = get_transcript_id(json_path)
        if transcript_id in seen_transcript_ids:
            raise ValueError(f"Duplicate transcript ID detected: {transcript_id}")
        seen_transcript_ids.add(transcript_id)
        result = update_codebook_with_transcript(
            json_path=json_path,
            codebook_path=codebook_path,
            review_output_dir=review_output_dir,
            completion_fn=completion_fn,
            top_k=top_k,
            reuse_threshold=reuse_threshold,
            compact_threshold=compact_threshold,
            model_name=model_name,
            sleep_seconds=sleep_seconds,
            _model=model,
        )
    return result["codebook"]
