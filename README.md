# bitclaw (minimal container runtime v1)

Lightweight, IPC-only container runtime inspired by NanoClaw, with a TypeScript container that runs Claude Agent SDK.

## Principles

- Lightweight.
- Unit tested.

## Setup

```bash
npm install
```

Optional instance isolation:

```bash
export BITCLAW_HOME=~/.bitclaw-dev-1
```

## Start Container

Required for real Claude responses:

```bash
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN)
```

```bash
npm run container:start
```

This builds and runs one container with mounts:

- `<BITCLAW_HOME>/ipc` -> `/workspace/ipc`
- `<BITCLAW_HOME>/workspace` -> `/workspace/workspace`
- `<BITCLAW_HOME>/sessions/.claude` -> `/home/node/.claude`

`<BITCLAW_HOME>/workspace/AGENT.md` is bootstrapped if missing.

## Interact via IPC

Send inbound message:

```bash
npm run ipc:send -- messages "hello container"
```

Poll outbound events:

```bash
npm run ipc:poll
```

The outbound `result` events include Claude SDK responses (or error details if auth/config is missing).

Stop container:

```bash
npm run container:stop
```

## IPC filenames

All message files follow:

`<unixtimestamp>_<in|out>_<rand7>.json`

Example:

`1739859455_out_z9x8w7v.json`

Processed and failed files are archived into:

- `<BITCLAW_HOME>/ipc/archive`

## Tests

```bash
npm test
```
