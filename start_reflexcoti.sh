#!/usr/bin/env sh
set -e

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"
mkdir -p server_data
export MPLCONFIGDIR="${MPLCONFIGDIR:-${TMPDIR:-/tmp}/reflexcoti_mpl}"

if [ -n "${PYTHON_BIN:-}" ]; then
  python_bin=$PYTHON_BIN
elif [ -x "$PROJECT_DIR/.venv/bin/python" ]; then
  python_bin="$PROJECT_DIR/.venv/bin/python"
elif [ -x "$PROJECT_DIR/reflexcoti_env/bin/python" ]; then
  python_bin="$PROJECT_DIR/reflexcoti_env/bin/python"
else
  python_bin=python3
fi

exec "$python_bin" -u server.py
