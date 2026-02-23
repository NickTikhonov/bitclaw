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
3. After all changes, restart the service (see "After All Changes" at the bottom).

---

## Adding Gmail

### 1. Check Existing Gmail Setup

```bash
ls -la ~/.gmail-mcp/ 2>/dev/null || echo "No Gmail config found"
```

If `credentials.json` exists, skip to step 5 (Verify).

### 2. Create Gmail Config Directory

```bash
mkdir -p ~/.gmail-mcp
```

### 3. GCP Project Setup

**USER ACTION REQUIRED** — walk through step by step, waiting for confirmation at each stage.

Tell the user:

> I'll walk you through setting up Google Cloud OAuth credentials.
>
> 1. Open https://console.cloud.google.com in your browser
> 2. Create a new project (or select existing) — click the project dropdown at the top

Wait for confirmation, then:

> 3. Enable the Gmail API:
>    - In the left sidebar, go to **APIs & Services → Library**
>    - Search for "Gmail API"
>    - Click on it, then click **Enable**

Wait for confirmation, then:

> 4. Create OAuth credentials:
>    - Go to **APIs & Services → Credentials** (in the left sidebar)
>    - Click **+ CREATE CREDENTIALS** at the top
>    - Select **OAuth client ID**
>    - If prompted for consent screen, choose "External", fill in app name (e.g., "BitClaw"), your email, and save
>    - For Application type, select **Desktop app**
>    - Name it anything (e.g., "BitClaw Gmail")
>    - Click **Create**

Wait for confirmation, then:

> 5. Download the credentials:
>    - Click **DOWNLOAD JSON** on the popup (or find it in the credentials list and click the download icon)
>    - Save it as `gcp-oauth.keys.json`
>
> Where did you save the file? (Give me the full path, or paste the file contents here)

If user provides a path:
```bash
cp "/path/user/provided/gcp-oauth.keys.json" ~/.gmail-mcp/gcp-oauth.keys.json
```

If user pastes JSON content, write it directly to `~/.gmail-mcp/gcp-oauth.keys.json`.

Verify:
```bash
cat ~/.gmail-mcp/gcp-oauth.keys.json | head -5
```

### 4. OAuth Authorization

**USER ACTION REQUIRED**

Tell the user:

> I'm going to run the Gmail authorization. A browser window will open asking you to sign in to Google and grant access.
>
> **Important:** If you see a warning that the app isn't verified, click "Advanced" then "Go to [app name] (unsafe)" — this is normal for personal OAuth apps.

Run:
```bash
npx -y @gongrzhe/server-gmail-autoauth-mcp auth
```

If that doesn't work (some versions don't have an auth subcommand):
```bash
timeout 60 npx -y @gongrzhe/server-gmail-autoauth-mcp || true
```

Tell user to complete the authorization in their browser.

### 5. Verify Gmail Access

```bash
if [ -f ~/.gmail-mcp/credentials.json ]; then
  echo "Gmail authorization successful!"
  ls -la ~/.gmail-mcp/
else
  echo "ERROR: credentials.json not found — authorization may have failed"
fi
```

### 6. Add Gmail to Config

Add the Gmail MCP server and credentials mount to `bitclaw.config.json`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
      "env": []
    }
  },
  "mounts": [
    {
      "host": "~/.gmail-mcp",
      "container": "/home/node/.gmail-mcp",
      "readonly": false
    }
  ]
}
```

The mount must be **read-write** (`readonly: false`) because the MCP server may need to refresh OAuth tokens.

### 7. Update Agent Memory

Append to `~/.bitclaw/workspace/AGENT.md`:

```markdown

## Email (Gmail)

You have access to Gmail via MCP tools:
- `mcp__gmail__search_emails` — Search emails with a query
- `mcp__gmail__get_email` — Get full email content by ID
- `mcp__gmail__send_email` — Send an email
- `mcp__gmail__draft_email` — Create a draft
- `mcp__gmail__list_labels` — List available labels

Examples: "Check my unread emails from today" or "Send an email to john@example.com about the meeting"
```

### 8. Restart and Test

Follow "After All Changes" below, then tell the user:

> Gmail is set up! Test it by sending a Telegram message like:
>
> "Check my recent emails"
>
> or: "List my Gmail labels"

Monitor for errors:
```bash
tail -f ~/.bitclaw/logs/container.log
```

### Gmail Troubleshooting

- **MCP not responding:** `npx -y @gongrzhe/server-gmail-autoauth-mcp` — test directly
- **OAuth token expired:** `rm ~/.gmail-mcp/credentials.json` then re-run auth (step 4)
- **Container can't access Gmail:** Verify `~/.gmail-mcp` mount in `bitclaw.config.json`

---

## Adding a Generic MCP Server

### Questions to ask:
- Which service? (Google Calendar, Notion, Slack, GitHub, etc.)
- Do they already have API credentials/tokens for it?

### Implementation:

1. Look up the MCP server package. Common ones:

| Service | Package | Required Env Vars |
|---------|---------|-------------------|
| Google Calendar | `@anthropic-ai/google-calendar-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Google Drive | `@anthropic-ai/google-drive-mcp` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` |
| Slack | `@anthropic-ai/slack-mcp` | `SLACK_BOT_TOKEN` |
| Notion | `@anthropic-ai/notion-mcp` | `NOTION_API_KEY` |
| GitHub | `@anthropic-ai/github-mcp` | `GITHUB_TOKEN` |

If you don't know the package name, search the web for `"<service> mcp server npm"` to find it.

2. Add the server to `bitclaw.config.json`:

```json
{
  "mcpServers": {
    "calendar": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/google-calendar-mcp"],
      "env": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
    }
  }
}
```

3. Add required env vars to `.env` and `.env.example` (with comments explaining what they are and where to get them).

4. If the MCP server stores credentials on disk (like Gmail), add a mount for them in `bitclaw.config.json`.

5. Update `~/.bitclaw/workspace/AGENT.md` with the available tools.

6. **Important:** MCP servers run inside the Docker container. The container uses default Docker networking which allows outbound connections.

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
