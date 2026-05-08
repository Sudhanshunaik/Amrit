#!/usr/bin/env sh
set -eu

docker compose exec n8n n8n import:credentials --separate --input=/backup/credentials
docker compose exec n8n n8n import:workflow --separate --input=/backup/workflows

