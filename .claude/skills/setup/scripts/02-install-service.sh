#!/bin/bash
set -euo pipefail

# 02-install-service.sh — Install BitClaw as a macOS launchd service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TEMPLATE="$PROJECT_ROOT/launchd/com.bitclaw.plist"
TARGET="$HOME/Library/LaunchAgents/com.bitclaw.plist"
LABEL="com.bitclaw"

NODE_PATH="$(which node)"
LOG_DIR="$HOME/.bitclaw/logs"

# Ensure logs directory exists
mkdir -p "$LOG_DIR"

# Unload existing service if loaded
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

# Fill template
sed \
  -e "s|{{NODE_PATH}}|$NODE_PATH|g" \
  -e "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" \
  -e "s|{{HOME}}|$HOME|g" \
  "$TEMPLATE" > "$TARGET"

# Load service
launchctl bootstrap "gui/$(id -u)" "$TARGET"

echo "=== BITCLAW SERVICE ==="
echo "STATUS: installed"
echo "PLIST: $TARGET"
echo "LABEL: $LABEL"
echo "LOGS: $LOG_DIR/app.log"
echo "=== END ==="
