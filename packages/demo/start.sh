#!/bin/sh
#
# Demo Server Startup Script
#
# This script starts the verifier server and demo file server via Docker.
#
# Usage:
#   ./start.sh                                       # Start services
#   ./start.sh -d                                    # Start in detached mode
#
# Environment Variables:
#   VITE_VERIFIER_HOST      - Verifier host (default: localhost:7047)
#   VITE_VERIFIER_PROTOCOL  - Protocol: http or https (default: http)
#   VITE_PROXY_PROTOCOL     - WebSocket protocol: ws or wss (default: ws)

set -e

cd "$(dirname "$0")"

echo "========================================"
echo "TLSNotary Demo Server"
echo "========================================"
echo "Starting Docker services..."
echo "========================================"

# Start docker compose
docker compose up --build "$@"
