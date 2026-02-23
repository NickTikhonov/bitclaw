# bitclaw

Lightweight, IPC-only container runtime inspired by NanoClaw, with a TypeScript container that runs Claude Agent SDK.

## Principles

- Lightweight.
- Unit tested.

## Setup

```bash
npm install
```

```bash
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

Optional instance isolation:

```bash
export BITCLAW_HOME=~/.bitclaw-dev-1
```

## Run (macOS service)

Install as a LaunchAgent (auto-starts at login, auto-restarts on crash):

```bash
./.claude/skills/setup/scripts/02-install-service.sh
```

Manage the service:

```bash
launchctl list | grep bitclaw                                  # status
launchctl kickstart -k gui/$(id -u)/com.bitclaw                # restart
launchctl bootout gui/$(id -u)/com.bitclaw                     # stop
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bitclaw.plist  # start
```

Or run in the foreground for debugging:

```bash
npm start
```

The main process:

- Builds and starts the agent container
- Listens for Telegram messages and routes them to the container via IPC
- Polls outbound IPC and sends responses back to Telegram
- Restarts the container every 4 hours

The container is started with mounts:

- `<BITCLAW_HOME>/ipc` -> `/workspace/ipc`
- `<BITCLAW_HOME>/workspace` -> `/workspace/workspace`
- `<BITCLAW_HOME>/sessions/.claude` -> `/home/node/.claude`

`<BITCLAW_HOME>/workspace/AGENT.md` is bootstrapped if missing.

## REPL

Interactive chat (starts/restarts container each run):

```bash
npm run chat
```

Inside chat: `/help`, `/restart`, `/exit`.

## Logs

```bash
tail -f ~/.bitclaw/logs/app.log          # host orchestrator
tail -f ~/.bitclaw/logs/app.error.log    # host errors
tail -f ~/.bitclaw/logs/container.log    # agent container
```

## IPC filenames

All message files follow: `<unixtimestamp>_<in|out>_<rand7>.json`

Processed and failed files are archived into `<BITCLAW_HOME>/ipc/archive`.

## Tests

```bash
npm test
```
