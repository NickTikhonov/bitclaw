<h1 align="center">BitClaw</h1>

<p align="center">
  <img width="256" height="256" alt="logo" src="https://github.com/user-attachments/assets/0ba35eda-7627-44eb-9177-2f34ed88936d" />
</p>

<p align="center">
  <strong>The AI assistant small enough to understand and audit over coffee.</strong>
</p>

<p align="center">
  ☕ 1,500 lines of TypeScript. That's the whole thing.
</p>

<table>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/7e23c282-5af4-45dd-b1dd-d1bf5ee521cd" width="260"></video></td>
    <td><video src="https://github.com/user-attachments/assets/1a961dc3-c4c5-469c-87c2-c38196f5bbc5" width="260"></video></td>
    <td><video src="https://github.com/user-attachments/assets/e0dbbda8-bc99-4efe-ac4f-cb35e44f2095" width="260"></video></td>
  </tr>
</table>

## 🤔 Why BitClaw?

You're about to give an AI agent access to your email, calendar, and personal machine. Shouldn't you be able to read every line of code that powers it?

BitClaw is a personal Claude assistant that runs in Docker and talks to you on Telegram. The entire codebase is ~1,500 lines — you can audit it in an afternoon, or ask Claude to walk you through it. It's built for developers and tinkerers who want to understand what they're running before they trust it.

Inspired by [OpenClaw](https://github.com/openclaw/openclaw) and [NanoClaw](https://github.com/qwibitai/nanoclaw) — same vision, 10x less code.

## 🚀 Quick Start

```bash
git clone https://github.com/NickTikhonov/bitclaw.git
cd bitclaw
claude
```

Then run `/setup`. Claude handles dependencies, API keys, Telegram bot, container build, and service installation.

## ✨ What It Does

- 💬 **Telegram I/O** — message BitClaw from your phone, get formatted responses back
- 🐳 **Container isolation** — the agent runs in Docker, not on your host
- 💾 **Persistent workspace** — notes, code, and artifacts survive restarts
- ⏰ **Scheduled tasks** — recurring and one-shot jobs via file-based cron
- 🔌 **Extensible** — add Gmail, Google Calendar, or any MCP integration via `/customize`
- 🔧 **Self-building** — the codebase is small enough that Claude can safely modify it
- 🔄 **Runs as a service** — auto-starts at login, auto-restarts on crash

## 🏗️ Architecture

```
Telegram
   │
   ▼
┌─────────────────────────────────┐
│  Host (single Node.js process)  │
│                                 │
│  Orchestrator ← Telegram channel│
│       │                         │
│       ▼                         │
│  Docker container               │
│  ┌───────────────────────────┐  │
│  │ Claude agent + MCP tools  │  │
│  └───────────────────────────┘  │
│       ▲           │             │
│       └── IPC ────┘             │
│    (atomic JSON files)          │
└─────────────────────────────────┘
```

No databases. No message queues. Just files.

## 📂 What's Inside

Every file, nothing hidden:

```
container/index.ts      434  Agent runtime + Claude SDK
container/ipc-mcp.ts    162  MCP tool definitions
telegram.ts             148  Telegram channel
orchestrator.ts         146  Container lifecycle + IPC routing
runtime.ts              108  Docker management
cron.ts                  92  Task scheduler
config.ts                80  Paths and constants
ipc.ts                   72  Host-side IPC read/write
customisation.ts         71  Config loading (mounts, MCPs)
types.ts                 53  TypeScript interfaces
status.ts                49  Tool status messages
ipc-utils.ts             43  Container-side IPC helpers
main.ts                  28  Entry point
format.ts                26  Output formatting
env.ts                   10  Env loader
─────────────────────────────
                       1,522  total
```

## 🧩 Customizing

Run `/customize` in Claude Code to add MCP integrations (Gmail, Calendar, etc.) or expose extra folders. Or just tell Claude what you want — the codebase is small enough that it can safely modify itself.

## 📖 Reference

<details>
<summary>⚙️ Service management</summary>

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw    # restart
launchctl kill SIGTERM gui/$(id -u)/com.bitclaw     # stop
launchctl list | grep bitclaw                       # status
```

</details>

<details>
<summary>📋 Logs</summary>

```bash
tail -f ~/.bitclaw/logs/app.log          # host orchestrator
tail -f ~/.bitclaw/logs/app.error.log    # host errors
tail -f ~/.bitclaw/logs/container.log    # agent container
```

</details>

<details>
<summary>💻 Local REPL (no Telegram)</summary>

```bash
npm run chat
```

</details>

## 🛠️ Setup (manual)

Prerequisites: macOS, Node.js 20+, Docker, [Claude Code](https://claude.ai/download).

```bash
npm install
cp .env.example .env
# Set ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

Or just run `/setup` in Claude Code — it's easier.

## 📄 License

MIT
