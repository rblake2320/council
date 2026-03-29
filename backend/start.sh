#!/bin/bash
set -e
cd /c/Users/techai/council/backend
pip install -r requirements.txt -q
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
