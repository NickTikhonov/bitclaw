#!/bin/bash
set -euo pipefail

# 01-preflight.sh — Check environment for BitClaw setup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Detect platform
UNAME=$(uname -s)
case "$UNAME" in
  Darwin*) PLATFORM="macos" ;;
  Linux*)  PLATFORM="linux" ;;
  *)       PLATFORM="unknown" ;;
esac

# Check Node
NODE_OK="false"
NODE_VERSION="not_found"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version 2>/dev/null | sed 's/^v//')
  MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$MAJOR" -ge 20 ] 2>/dev/null; then
    NODE_OK="true"
  fi
fi

# Check Docker
DOCKER="not_found"
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER="running"
  else
    DOCKER="installed_not_running"
  fi
fi

# Check npm deps
DEPS_INSTALLED="false"
if [ -d "$PROJECT_ROOT/node_modules" ]; then
  DEPS_INSTALLED="true"
fi

# Check .env
HAS_ENV="false"
HAS_ANTHROPIC_KEY="false"
HAS_OAUTH_TOKEN="false"
HAS_TELEGRAM_TOKEN="false"
HAS_TELEGRAM_CHAT="false"
if [ -f "$PROJECT_ROOT/.env" ]; then
  HAS_ENV="true"
  grep -q "^ANTHROPIC_API_KEY=.\+" "$PROJECT_ROOT/.env" 2>/dev/null && HAS_ANTHROPIC_KEY="true"
  grep -q "^CLAUDE_CODE_OAUTH_TOKEN=.\+" "$PROJECT_ROOT/.env" 2>/dev/null && HAS_OAUTH_TOKEN="true"
  grep -q "^TELEGRAM_BOT_TOKEN=.\+" "$PROJECT_ROOT/.env" 2>/dev/null && HAS_TELEGRAM_TOKEN="true"
  grep -q "^TELEGRAM_CHAT_ID=.\+" "$PROJECT_ROOT/.env" 2>/dev/null && HAS_TELEGRAM_CHAT="true"
fi

# Check container image
CONTAINER_IMAGE="false"
if docker image inspect bitclaw-agent:dev >/dev/null 2>&1; then
  CONTAINER_IMAGE="true"
fi

cat <<EOF
=== BITCLAW SETUP: PREFLIGHT ===
PLATFORM: $PLATFORM
NODE_VERSION: $NODE_VERSION
NODE_OK: $NODE_OK
DOCKER: $DOCKER
DEPS_INSTALLED: $DEPS_INSTALLED
HAS_ENV: $HAS_ENV
HAS_ANTHROPIC_KEY: $HAS_ANTHROPIC_KEY
HAS_OAUTH_TOKEN: $HAS_OAUTH_TOKEN
HAS_TELEGRAM_TOKEN: $HAS_TELEGRAM_TOKEN
HAS_TELEGRAM_CHAT: $HAS_TELEGRAM_CHAT
CONTAINER_IMAGE: $CONTAINER_IMAGE
=== END ===
EOF
