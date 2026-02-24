# BitClaw

A personal, secure and self-upgrading Claude assistant that runs in a Docker container and talks to you on Telegram.

<table>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/7e23c282-5af4-45dd-b1dd-d1bf5ee521cd" width="260" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/1a961dc3-c4c5-469c-87c2-c38196f5bbc5" width="260" autoplay loop muted playsinline></video></td>
    <td><video src="https://github.com/user-attachments/assets/e0dbbda8-bc99-4efe-ac4f-cb35e44f2095" width="260" autoplay loop muted playsinline></video></td>
  </tr>
</table>

Inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw) — same philosophy, 5x smaller @ 1200 lines of TypeScript! Small enough to read and understand in one sitting.


## Quick Start

```bash
git clone https://github.com/NickTikhonov/bitclaw.git
cd bitclaw
claude
```

Then run `/setup`. Claude handles dependencies, API keys, Telegram bot, container build, and service installation.

## What It Does

- **Telegram I/O** — message BitClaw from your phone
- **Container isolation** — the agent runs in Docker, not on your host
- **Persistent sessions** — conversation context survives restarts
- **Scheduled tasks** — recurring and one-shot jobs via file-based cron
- **Web access** — search and fetch content
- **Self-building** — run Claude to add integration (Gmail, Calendar, etc.) via `/customize`
- **Runs as a service** — auto-starts at login, auto-restarts on crash

## How It Works

Single Node.js process on the host. The agent runs in an isolated Docker container with mounted directories. Communication is via atomic JSON files in a shared IPC directory. No databases, no message queues.

## Setup

Prerequisites: macOS, Node.js 20+, Docker, [Claude Code](https://claude.ai/download).

```bash
npm install
cp .env.example .env
# Set ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

Install as a macOS service (auto-starts at login):

```bash
./.claude/skills/setup/scripts/02-install-service.sh
```

Or run `/setup` in Claude Code for guided installation.

## Usage

Message your Telegram bot. That's it.

The agent has access to a persistent workspace at `~/.bitclaw/workspace/` where it can store notes, code, and artifacts. Edit `workspace/AGENT.md` to customize how it behaves.

### Service Management

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw    # restart
launchctl kill SIGTERM gui/$(id -u)/com.bitclaw     # stop
launchctl list | grep bitclaw                       # status
```

### Logs

```bash
tail -f ~/.bitclaw/logs/app.log          # host orchestrator
tail -f ~/.bitclaw/logs/app.error.log    # host errors
tail -f ~/.bitclaw/logs/container.log    # agent container
```

### REPL

For local debugging without Telegram:

```bash
npm run chat
```

## Customizing

Run `/customize` in Claude Code to add MCP integrations or expose extra folders to the agent. Or just tell Claude what you want — the codebase is small enough that it can safely modify it.

## License

MIT
