# BitClaw

Lightweight AI agent that runs Claude in a Docker container, communicating via filesystem IPC. Messages routed through Telegram. See [README.md](README.md) for usage.

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point: loads env, starts orchestrator + Telegram |
| `src/orchestrator.ts` | Container lifecycle, IPC polling, task scheduling |
| `src/telegram.ts` | Telegram channel (grammy) |
| `src/ipc.ts` | Host-side IPC: send inbound, poll outbound |
| `src/cron.ts` | File-based task scheduler |
| `src/runtime.ts` | Docker build/start/stop/restart |
| `src/config.ts` | Paths, constants, directory setup |
| `container/src/index.ts` | Agent runner inside the container (Claude SDK) |
| `container/src/ipc-mcp-stdio.ts` | MCP tools: send_message, task CRUD |
| `scripts/repl.ts` | Interactive chat REPL |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation: Node, Docker, Telegram bot, API keys, container build |
| `/customize` | Add MCP integrations (Gmail, Calendar, etc.) or expose extra folders to the agent |
| `/add-voice-notes` | Enable Whisper voice transcription so the bot understands Telegram voice messages |

## Coding Rules

- Prefer clarity and reliability over clever abstractions.
- Aggressively apply DRY — guard all code from repetitions.
- Write clean, simple TypeScript. Don't overengineer.
- Unit test the code you write. Use dependency injection where necessary.
- Unit tests colocated with code, named `*.spec.ts`.
- Keep functions small and explicit; avoid hidden side effects.
- Add short comments only where logic is non-obvious.

## Change Workflow

- Make focused, minimal diffs.
- Do not revert unrelated user changes.
- For new env vars: update `.env.example` with clear comments and add validation in env schema code.

## Development

```bash
npm start        # Run Telegram bot (main app)
npm run chat     # Interactive REPL
npm test         # Run tests
npm run sloc     # Count source lines
```

## Service Management (macOS)

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw   # Restart the service
launchctl kill SIGTERM gui/$(id -u)/com.bitclaw    # Stop the service
tail -f ~/.bitclaw/logs/app.log                    # Watch logs
tail -f ~/.bitclaw/logs/app.error.log              # Watch error logs
```
