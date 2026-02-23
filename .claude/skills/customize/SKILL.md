---
name: customize
description: Add MCP integrations (Gmail, Calendar, etc.) or expose extra folders to the BitClaw agent. Use when user wants to add capabilities, mount directories, or change the agent's tool access.
---

# BitClaw Customization

This skill helps users extend BitClaw by adding MCP servers or exposing additional host directories to the container agent. All customization is stored in `bitclaw.config.json` in the project root.

**Principle:** Ask what the user wants, make the changes directly to `bitclaw.config.json` and `.env`, then tell them to restart with `npm start`.

## Config File

All customization lives in `bitclaw.config.json`:

```json
{
  "mcpServers": {
    "example": {
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
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

## Flow

1. Ask: "What would you like to add? An MCP integration (Gmail, Calendar, etc.) or extra folder access?"
2. Follow the appropriate section below.
3. After changes, tell the user to restart: `npm start` (or Ctrl+C and re-run).

## Adding an MCP Server

### Questions to ask:
- Which service? (Gmail, Google Calendar, Notion, Slack, filesystem, etc.)
- Do they already have API credentials/tokens for it?

### Implementation:

1. Look up the MCP server package. Common ones:

| Service | Package | Required Env Vars |
|---------|---------|-------------------|
| Gmail | `@anthropic-ai/gmail-mcp` | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` |
| Google Calendar | `@anthropic-ai/google-calendar-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Google Drive | `@anthropic-ai/google-drive-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Slack | `@anthropic-ai/slack-mcp` | `SLACK_BOT_TOKEN` |
| Notion | `@anthropic-ai/notion-mcp` | `NOTION_API_KEY` |
| GitHub | `@anthropic-ai/github-mcp` | `GITHUB_TOKEN` |
| Filesystem | `@anthropic-ai/filesystem-mcp` | (none — uses args for paths) |

If you don't know the package name, search the web for `"<service> mcp server npm"` to find it.

2. Add the server to `bitclaw.config.json`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/gmail-mcp"],
      "env": ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]
    }
  }
}
```

3. Add required env vars to `.env`:

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

4. Also add them to `.env.example` with comments explaining what they are and where to get them.

5. Tell the user how to get the credentials if they don't have them. For Google services, this typically involves:
   - Creating a project in Google Cloud Console
   - Enabling the relevant API
   - Creating OAuth 2.0 credentials
   - Getting a refresh token via the OAuth flow

6. **Important:** MCP servers run inside the Docker container. The container needs network access for external APIs. If the container doesn't currently have network access, note this to the user — they may need to add `--network host` or specific network config. Currently BitClaw runs containers with default Docker networking which allows outbound connections.

### Verification:

After restarting, the user can check container logs for MCP initialization:
```bash
tail -f ~/.bitclaw/logs/container.log
```

They should see a log line like: `External MCP servers: gmail`

Then send a message via Telegram asking the agent to use the new capability.

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

5. Update the workspace AGENT.md (`~/.bitclaw/workspace/AGENT.md`) to tell the agent about the new mount:

```markdown
## Extra Mounts
- /workspace/extra/notes — Your personal notes (read-only)
```

### Verification:

After restarting, the user can ask the agent: "List the files in /workspace/extra/notes" to confirm access.

## Removing Customizations

To remove an MCP server: delete its entry from `mcpServers` in `bitclaw.config.json` and optionally remove its env vars from `.env`.

To remove a mount: delete its entry from `mounts` in `bitclaw.config.json`.

## After All Changes

Tell the user:
```
Changes saved. Restart BitClaw to apply:
  npm start
```

If the container is currently running, they need to Ctrl+C first, then re-run `npm start`. The container will be rebuilt with the new configuration.
