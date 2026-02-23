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

## Run

```bash
npm start
```

This starts the main process which:

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

Container stdout/stderr are appended to:

```
~/.bitclaw/logs/container.log
```

Tail live:

```bash
tail -f ~/.bitclaw/logs/container.log
```

## IPC filenames

All message files follow: `<unixtimestamp>_<in|out>_<rand7>.json`

Processed and failed files are archived into `<BITCLAW_HOME>/ipc/archive`.

## Tests

```bash
npm test
```
