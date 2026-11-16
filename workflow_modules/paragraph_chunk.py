import re
import os
import numpy as np
import json
from docx import Document
from scipy.spatial.distance import cosine
from sentence_transformers import SentenceTransformer

def speaker_content_to_newline(text):
    out = []
    for line in text.split("\n"):
        m = re.match(r'^\s*([^:]+):\s*(\S.*)$', line)
        if m:
            label = m.group(1).strip() + ":"   # everything before colon
            content = m.group(2).strip()
            out.append(label)
            out.append(content)
        else:
            out.append(line.rstrip())
    return "\n".join(out)

def paragraph_split(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()] 
    
    paragraphs = []
    buffer = ""

    for line in lines:
        if re.match(r'^[^:]+:$', line):
            # If there's something in the buffer, save it as a completed paragraph
            if buffer:
                paragraphs.append(buffer.strip())
                buffer = ""
            # Start a new paragraph with this label
            buffer = line + " "
        else:
            # Otherwise, it's a continuation of the same speaker's text
            buffer += line + " "

    # Append the last buffered paragraph
    if buffer:
        paragraphs.append(buffer.strip())

    return [{'paragraph': p, 'index': i} for i, p in enumerate(paragraphs)]

def read_docx(file_path):
    doc = Document(file_path)
    full_text = []
    for paragraph in doc.paragraphs:
        full_text.append(paragraph.text)
    return '\n'.join(full_text)

# neighbor connection
def combine_paragraphs(paragraphs, buffer_size=1):
    # buffer_size: number of neighbors to include before and after each paragraph
    combined_paragraphs = [
        ' '.join(
            re.sub(r'^[A-Za-z]+:\s*', '', paragraphs[j]['paragraph'].strip()) # remove label since it has no semantic meaning when Bert-embedding
            for j in range(max(i - buffer_size, 0), min(i + buffer_size + 1, len(paragraphs))))
        for i in range(len(paragraphs))
    ]
    for i, combined_paragraph in enumerate(combined_paragraphs):
        paragraphs[i]['combined_paragraph'] = combined_paragraph

    return paragraphs

def cosine_similarity(vec1, vec2):
    return 1 - cosine(vec1, vec2)

# cosine distance
def calculate_cosine_distances(paragraphs):
    distances = []
    for i in range(len(paragraphs) - 1):
        embedding_current = paragraphs[i]['combined_paragraph_embedding']
        embedding_next = paragraphs[i + 1]['combined_paragraph_embedding']
        distance = cosine(embedding_current, embedding_next)
        distances.append(distance)
        paragraphs[i]['distance_to_next'] = distance
    return distances, paragraphs

# chunk boundary computation
def chunk_com(distances, bpp_threshold=80):
    if not distances:
        return [], None
    breakpoint_percentile_threshold = bpp_threshold
    breakpoint_distance_threshold = np.percentile(distances, breakpoint_percentile_threshold)
    indices_above_thresh = [i for i, x in enumerate(distances) if x > breakpoint_distance_threshold]

    return indices_above_thresh, breakpoint_distance_threshold

# chunk generation
def chunk_gen(indices_above_thresh, paragraphs):
    start_index = 0
    chunks = []
    chunks_len = []

    for index in indices_above_thresh:
        end_index = index
        group = paragraphs[start_index:end_index + 1]
        combined_text = '\n\n'.join([d['paragraph'] for d in group])
        chunks.append(combined_text)
        chunks_len.append(len(combined_text))

        start_index = index + 1

    if start_index < len(paragraphs):
        combined_text = '\n\n'.join([d['paragraph'] for d in paragraphs[start_index:]])
        chunks.append(combined_text)
        chunks_len.append(len(combined_text))

    return chunks, chunks_len

# chunk combination
def chunk_re_gen(chunks, chunks_len, max_chunk_len):
    chunks_new = []
    chunks_len_new = []
    chunk_len = 0
    chunk = ''
    for i, chunk_i in enumerate(chunks):
        chunk_len_new = chunk_len + chunks_len[i]
        chunk_new = chunk + chunk_i
        if chunk_len_new > max_chunk_len:
            chunks_new.append(chunk)
            chunks_len_new.append(chunk_len)
            chunk_len = chunks_len[i]
            chunk = chunk_i
        else:
            chunk_len = chunk_len_new
            chunk = chunk_new

    if chunk:
        chunks_new.append(chunk)
        chunks_len_new.append(chunk_len)

    return chunks_new, chunks_len_new

def paragraph_chunking(model, text, bpp_threshold):
    if type(text) == list:
        paragraphs = [{'paragraph': x, 'index': i} for i, x in enumerate(text)]
    else:
        paragraphs = paragraph_split(text)
    if len(paragraphs) <= 1:
        chunk = "\n\n".join([d["paragraph"] for d in paragraphs]).strip()
        return ([chunk] if chunk else []), ([len(chunk)] if chunk else [])
    paragraphs = combine_paragraphs(paragraphs)
    # model.to(device="cuda:1")
    embeddings = model.encode([x['combined_paragraph'] for x in paragraphs])

    for i, paragraph in enumerate(paragraphs):
        paragraph['combined_paragraph_embedding'] = embeddings[i]

    distances, paragraphs = calculate_cosine_distances(paragraphs)
    indices_above_thresh, breakpoint_distance_threshold = chunk_com(distances, bpp_threshold)
    chunks, chunks_len = chunk_gen(indices_above_thresh, paragraphs)
    return chunks, chunks_len

# merges semantically close chunks, avoid short one
def paragraph_chunking_main(chunk_len, bpp_threshold, re_combine, text, model):
    max_chunk_len = chunk_len * 4

    chunks, chunks_len = paragraph_chunking(model, text, bpp_threshold) # First-pass chunking

    while True: # Only re-chunk if there are multiple chunks
        if len(chunks) > 1:
            chunks_new, chunks_len_new = paragraph_chunking(model, chunks, bpp_threshold) # Treats each existing chunk as a new “paragraph”
            if len(chunks_new) >= len(chunks):
                break
            if max(chunks_len_new) < max_chunk_len:
                chunks = chunks_new
                chunks_len = chunks_len_new
            else:
                break # Reach chunk size limit
        else: # only one chunk
            re_combine = False
            break

    if re_combine:
        chunks, chunks_len = chunk_re_gen(chunks, chunks_len, max_chunk_len)
    return chunks, chunks_len

def save_chunk_to_docx(chunks, out_dir, interview_name="Interview", base_name="chunk"):
    os.makedirs(out_dir, exist_ok=True)

    for i, text in enumerate(chunks, start=1):
        doc = Document()
        doc.add_paragraph("") 

        for para in text.splitlines():
            doc.add_paragraph(para if para.strip() else "")

        safe_name = interview_name.replace(" ", "_")
        filename = os.path.join(out_dir, f"{safe_name}_{base_name}_{i:03d}.docx")
        doc.save(filename)


