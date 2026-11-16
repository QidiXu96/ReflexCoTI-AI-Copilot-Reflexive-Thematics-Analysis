ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TOKENIZERS_PARALLELISM=false \
    NLTK_DATA=/usr/local/share/nltk_data \
    MPLCONFIGDIR=/tmp/reflexcoti_mpl \
    HF_HOME=/home/reflexcoti/.cache/huggingface \
    HOST=0.0.0.0 \
    PORT=7783

WORKDIR /app

# Install the CPU build of PyTorch separately so a CPU server does not pull
# several gigabytes of CUDA runtime packages.
ARG PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir \
        --index-url "${PYTORCH_INDEX_URL}" \
        "torch==2.13.0" \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m nltk.downloader -d "${NLTK_DATA}" punkt punkt_tab

RUN groupadd --system reflexcoti \
    && useradd --system --gid reflexcoti --create-home reflexcoti \
    && mkdir -p /app/server_data "${HF_HOME}" "${MPLCONFIGDIR}" \
    && chown -R reflexcoti:reflexcoti \
        /app/server_data /home/reflexcoti "${MPLCONFIGDIR}"

COPY --chown=reflexcoti:reflexcoti server.py index.html app.js styles.css ./
COPY --chown=reflexcoti:reflexcoti workflow_modules/ ./workflow_modules/

USER reflexcoti

EXPOSE 7783

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7783/api/health', timeout=4)"]

CMD ["python", "-u", "server.py"]
