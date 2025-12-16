#!/bin/bash
#
# Demo Server Startup Script
#
# This script:
# 1. Generates plugin files with configurable verifier URLs
# 2. Starts the verifier server and demo file server via Docker
#
# Environment Variables:
#   VERIFIER_HOST - Verifier server host (default: localhost:7047)
#   SSL           - Use https/wss if true (default: false)
#
# Usage:
#   ./start.sh                                    # Local development
#   VERIFIER_HOST=verifier.tlsnotary.org SSL=true ./start.sh  # Production

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration with defaults
VERIFIER_HOST="${VERIFIER_HOST:-localhost:7047}"
SSL="${SSL:-false}"

# Determine protocol based on SSL setting
if [ "$SSL" = "true" ]; then
    HTTP_PROTOCOL="https"
    WS_PROTOCOL="wss"
else
    HTTP_PROTOCOL="http"
    WS_PROTOCOL="ws"
fi

VERIFIER_URL="${HTTP_PROTOCOL}://${VERIFIER_HOST}"
PROXY_URL_BASE="${WS_PROTOCOL}://${VERIFIER_HOST}/proxy?token="

echo "========================================"
echo "TLSNotary Demo Server"
echo "========================================"
echo "Verifier Host: $VERIFIER_HOST"
echo "SSL Enabled:   $SSL"
echo "Verifier URL:  $VERIFIER_URL"
echo "Proxy URL:     ${PROXY_URL_BASE}<host>"
echo "========================================"

# Create generated directory for processed files
mkdir -p generated

# Function to process a plugin file
process_plugin() {
    local input_file="$1"
    local output_file="generated/$(basename "$input_file")"

    echo "Processing: $input_file -> $output_file"

    # Replace verifierUrl and proxyUrl patterns
    sed -E \
        -e "s|verifierUrl: '[^']*'|verifierUrl: '${VERIFIER_URL}'|g" \
        -e "s|verifierUrl: \"[^\"]*\"|verifierUrl: \"${VERIFIER_URL}\"|g" \
        -e "s|proxyUrl: 'ws://[^/]+/proxy\?token=([^']+)'|proxyUrl: '${PROXY_URL_BASE}\1'|g" \
        -e "s|proxyUrl: 'wss://[^/]+/proxy\?token=([^']+)'|proxyUrl: '${PROXY_URL_BASE}\1'|g" \
        -e "s|proxyUrl: \"ws://[^/]+/proxy\?token=([^\"]+)\"|proxyUrl: \"${PROXY_URL_BASE}\1\"|g" \
        -e "s|proxyUrl: \"wss://[^/]+/proxy\?token=([^\"]+)\"|proxyUrl: \"${PROXY_URL_BASE}\1\"|g" \
        "$input_file" > "$output_file"
}

# Copy static files
echo ""
echo "Copying static files..."
cp index.html generated/
cp favicon.ico generated/ 2>/dev/null || true

# Process plugin files
echo ""
echo "Processing plugin files..."
for plugin_file in *.js; do
    if [ -f "$plugin_file" ]; then
        process_plugin "$plugin_file"
    fi
done

echo ""
echo "Generated files:"
ls -la generated/

echo ""
echo "========================================"
echo "Starting Docker services..."
echo "========================================"

# Start docker compose
docker compose up --build "$@"
