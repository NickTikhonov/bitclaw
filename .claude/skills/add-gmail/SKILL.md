---
name: add-gmail
description: Add Gmail integration to BitClaw. Walks the user through GCP OAuth setup, credentials, and wiring the Gmail MCP server into the container.
---

# Add Gmail to BitClaw

This skill adds Gmail access to the BitClaw agent via the `@gongrzhe/server-gmail-autoauth-mcp` MCP server.

**Principle:** Walk the user through each step, do the work yourself, and restart the service when done. Don't tell the user to go do things — do them.

**Important:** Read the "CRITICAL: Pre-installing MCP Packages" section in `.claude/skills/customize/SKILL.md` before proceeding. MCP packages must be pre-installed in the Dockerfile and referenced by direct `node` path — never use `npx`.

---

## 1. Check Existing Gmail Setup

```bash
ls -la ~/.gmail-mcp/ 2>/dev/null || echo "No Gmail config found"
```

If `credentials.json` exists, skip to step 5 (Verify).

## 2. Create Gmail Config Directory

```bash
mkdir -p ~/.gmail-mcp
```

## 3. GCP Project Setup

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

## 4. OAuth Authorization

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

## 5. Verify Gmail Access

```bash
if [ -f ~/.gmail-mcp/credentials.json ]; then
  echo "Gmail authorization successful!"
  ls -la ~/.gmail-mcp/
else
  echo "ERROR: credentials.json not found — authorization may have failed"
fi
```

## 6. Pre-install in Dockerfile

Add the Gmail MCP package to `container/Dockerfile` (before the `WORKDIR /app` line):

```dockerfile
RUN npm install -g @gongrzhe/server-gmail-autoauth-mcp
```

The image will be rebuilt automatically when the service restarts (see final step).

## 7. Add Gmail to Config

Add the Gmail MCP server and credentials mount to `bitclaw.config.json`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/@gongrzhe/server-gmail-autoauth-mcp/dist/index.js"],
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

## 8. Update Agent Memory

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

## 9. Restart and Test

Restart the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw
```

If that fails (service not installed), fall back to:
```bash
./.claude/skills/setup/scripts/02-install-service.sh
```

Then tell the user:

> Gmail is set up! Test it by sending a Telegram message like:
>
> "Check my recent emails"
>
> or: "List my Gmail labels"

Monitor for errors:
```bash
tail -f ~/.bitclaw/logs/container.log
```

---

## Troubleshooting

- **MCP not responding:** Run inside the container to test: `docker run --rm bitclaw-agent node /usr/local/lib/node_modules/@gongrzhe/server-gmail-autoauth-mcp/dist/index.js`
- **OAuth token expired:** `rm ~/.gmail-mcp/credentials.json` then re-run auth (step 4). If the GCP OAuth consent screen is in "Testing" mode, tokens expire after 7 days — publish the app to fix this.
- **Container can't access Gmail:** Verify `~/.gmail-mcp` mount in `bitclaw.config.json`
- **"No such tool available":** The MCP server likely failed to start. Check `~/.bitclaw/logs/container.log` for errors. Ensure the package is pre-installed in the Dockerfile (not relying on `npx` to download at runtime).
