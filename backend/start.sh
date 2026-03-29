#!/usr/bin/env bash
# Start the Council backend
# Usage: bash start.sh [--port 8600] [--reload]
set -euo pipefail

PORT=${PORT:-8600}
RELOAD_FLAG=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --port) PORT="$2"; shift 2 ;;
        --reload) RELOAD_FLAG="--reload"; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

cd "$(dirname "$0")"

# Load NVIDIA env if present
if [ -f "$HOME/.nvidia.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$HOME/.nvidia.env"
    set +a
fi

echo "Installing dependencies..."
C:/Python312/python.exe -m pip install -r requirements.txt -q

echo "Running Alembic migrations..."
C:/Python312/python.exe -m alembic upgrade head

echo "Starting Council backend on port $PORT..."
C:/Python312/python.exe -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level info \
    $RELOAD_FLAG
