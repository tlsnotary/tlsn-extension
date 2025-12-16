#!/bin/sh
#
# Demo Server Startup Script
#
# This script starts the verifier server and demo file server via Docker.
# Note: Run generate.sh first to create plugin files in the generated/ directory.
#
# Usage:
#   ./generate.sh && ./start.sh                      # Generate and start
#   ./start.sh                                       # Start only (assumes generated/ exists)
#   ./start.sh -d                                    # Start in detached mode

set -e

cd "$(dirname "$0")"

# Check if generated directory exists
if [ ! -d "generated" ]; then
    echo "ERROR: generated/ directory not found!"
    echo "Please run ./generate.sh first to create plugin files."
    exit 1
fi

echo "========================================"
echo "TLSNotary Demo Server"
echo "========================================"
echo "Starting Docker services..."
echo "========================================"

# Start docker compose
docker compose up --build "$@"
