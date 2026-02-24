---
name: customize
description: Add MCP integrations (Gmail, Calendar, etc.) or expose extra folders to the BitClaw agent. Use when user wants to add capabilities, mount directories, or change the agent's tool access.
---

# BitClaw Customization

This skill helps users extend BitClaw by adding MCP servers or exposing additional host directories to the container agent. All customization is stored in `bitclaw.config.json` in the project root.

**Principle:** Ask what the user wants, make the changes, and restart the service yourself. Don't tell the user to go do things — do them.

## Config File

All customization lives in `bitclaw.config.json`:

```json
{
  "mcpServers": {
    "example": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/@example/mcp-server/dist/index.js"],
      "env": ["EXAMPLE_API_KEY"]
    }
  },
  "mounts": [
    {
      "host": "~/projects",
      "container": "/workspace/extra/projects",
      "readonly": true
    }
  ]
}
```

- `mcpServers`: MCP servers injected into the agent's Claude SDK session. The `env` array lists env var **names** — their values are read from `.env` at startup and securely passed to the container.
- `mounts`: Extra host directories mounted into the container. Paths starting with `~` are resolved to the user's home directory.

## CRITICAL: Pre-installing MCP Packages

MCP servers run **inside** the Docker container. **Never use `npx` as the command** — it tries to download the package from npm on every invocation, which is flaky (70s+ timeouts when the network is slow or unavailable).

Instead, every MCP server npm package must be:

1. **Pre-installed globally in `container/Dockerfile`:**

```dockerfile
RUN npm install -g @example/mcp-server
```

2. **Referenced by direct `node` path in `bitclaw.config.json`:**

```json
{
  "command": "node",
  "args": ["/usr/local/lib/node_modules/@example/mcp-server/dist/index.js"]
}
```

### Finding the correct entrypoint path

After adding the package to the Dockerfile and rebuilding, run:

```bash
docker run --rm bitclaw-agent node -e "const p=require('/usr/local/lib/node_modules/@example/mcp-server/package.json'); console.log(p.main || Object.values(p.bin || {})[0])"
```

This prints the relative entrypoint (e.g. `dist/index.js`). Prepend `/usr/local/lib/node_modules/<package>/` to get the full path.

### Rebuilding the container

After any Dockerfile change:

```bash
docker build -f container/Dockerfile -t bitclaw-agent .
```

Then restart the service (see "After All Changes" below).

## Flow

1. Ask: "What would you like to add? An MCP integration (Gmail, Calendar, etc.) or extra folder access?"
2. Follow the appropriate section below.
3. After all changes, restart the service (see "After All Changes" at the bottom).

---

## Adding Gmail

Use the `/add-gmail` skill — it handles the full setup including GCP OAuth, credentials, Dockerfile pre-install, config, and agent memory.

---

## Adding a Generic MCP Server

### Questions to ask:
- Which service? (Google Calendar, Notion, Slack, GitHub, etc.)
- Do they already have API credentials/tokens for it?

### Implementation:

1. Look up the MCP server package. Common ones:

| Service | Package | Required Env Vars |
|---------|---------|-------------------|
| Google Calendar | `@cocal/google-calendar-mcp` | (uses OAuth files) |
| Google Drive | `@anthropic-ai/google-drive-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Slack | `@anthropic-ai/slack-mcp` | `SLACK_BOT_TOKEN` |
| Notion | `@anthropic-ai/notion-mcp` | `NOTION_API_KEY` |
| GitHub | `@anthropic-ai/github-mcp` | `GITHUB_TOKEN` |

If you don't know the package name, search the web for `"<service> mcp server npm"` to find it.

2. **Pre-install in the Dockerfile.** Add a `RUN npm install -g <package>` line to `container/Dockerfile` (before `WORKDIR /app`), then rebuild the image:

```bash
docker build -f container/Dockerfile -t bitclaw-agent .
```

3. **Find the entrypoint path** inside the built image:

```bash
docker run --rm bitclaw-agent node -e "const p=require('/usr/local/lib/node_modules/<package>/package.json'); console.log(p.main || Object.values(p.bin || {})[0])"
```

4. Add the server to `bitclaw.config.json` using `node` + the full path (never `npx`):

```json
{
  "mcpServers": {
    "calendar": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/@cocal/google-calendar-mcp/dist/index.js"],
      "env": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
    }
  }
}
```

5. Add required env vars to `.env` and `.env.example` (with comments explaining what they are and where to get them).

6. If the MCP server stores credentials on disk (like Gmail), add a mount for them in `bitclaw.config.json`.

7. Update `~/.bitclaw/workspace/AGENT.md` with the available tools.

### Verification:

After restarting, check container logs:
```bash
tail -f ~/.bitclaw/logs/container.log
```

You should see: `External MCP servers: <name>`

Then send a Telegram message asking the agent to use the new capability.

---

## Exposing Extra Folders

### Questions to ask:
- Which directory on the host?
- Should the agent have read-only or read-write access?
- What should it be called inside the container? (suggest a sensible default under `/workspace/extra/`)

### Implementation:

1. Add the mount to `bitclaw.config.json`:

```json
{
  "mounts": [
    {
      "host": "~/Documents/notes",
      "container": "/workspace/extra/notes",
      "readonly": true
    }
  ]
}
```

2. `host`: The path on the host machine. Supports `~` for home directory.
3. `container`: Where it appears inside the container. Use `/workspace/extra/<name>` as convention.
4. `readonly`: Set to `true` unless the user explicitly needs write access. Read-only is safer.

5. Update `~/.bitclaw/workspace/AGENT.md` to tell the agent about the new mount:

```markdown
## Extra Mounts
- /workspace/extra/notes — Your personal notes (read-only)
```

### Verification:

After restarting, ask the agent: "List the files in /workspace/extra/notes" to confirm access.

---

## Removing Customizations

To remove an MCP server: delete its entry from `mcpServers` in `bitclaw.config.json` and optionally remove its env vars from `.env`.

To remove a mount: delete its entry from `mounts` in `bitclaw.config.json`.

---

## After All Changes

Restart the service automatically so changes take effect:

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw
```

If that fails (service not installed), fall back to:
```bash
./.claude/skills/setup/scripts/02-install-service.sh
```

Then verify by checking the logs:
```bash
tail -5 ~/.bitclaw/logs/app.log
```

Confirm to the user that the service has been restarted and the new configuration is active.
