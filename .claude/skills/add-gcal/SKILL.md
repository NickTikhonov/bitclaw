---
name: add-gcal
description: Add Google Calendar integration to BitClaw. Walks the user through GCP OAuth setup (or reuses existing Gmail credentials), authorization, and wiring the Calendar MCP server into the container.
---

# Add Google Calendar to BitClaw

This skill adds Google Calendar access to the BitClaw agent via the `@cocal/google-calendar-mcp` MCP server.

**Principle:** Walk the user through each step, do the work yourself, and restart the service when done. Don't tell the user to go do things — do them.

**Important:** Read the "CRITICAL: Pre-installing MCP Packages" section in `.claude/skills/customize/SKILL.md` before proceeding. MCP packages must be pre-installed in the Dockerfile and referenced by direct `node` path — never use `npx`.

---

## 1. Check Prerequisites

```bash
echo "=== Gmail MCP (for reusing OAuth credentials) ==="
ls -la ~/.gmail-mcp/gcp-oauth.keys.json 2>/dev/null || echo "No Gmail OAuth credentials found"

echo ""
echo "=== Existing Calendar setup ==="
ls -la ~/.google-calendar-mcp/ 2>/dev/null || echo "No Calendar config found"
```

- If `~/.gmail-mcp/gcp-oauth.keys.json` exists, we can reuse those OAuth credentials (skip to step 3).
- If `~/.google-calendar-mcp/token.json` exists, Calendar is already authorized (skip to step 5).

## 2. GCP OAuth Credentials

If Gmail is already set up (`~/.gmail-mcp/gcp-oauth.keys.json` exists), we reuse those credentials — skip to step 3.

Otherwise, **USER ACTION REQUIRED** — walk through step by step:

Tell the user:

> I'll walk you through setting up Google Cloud OAuth credentials.
>
> 1. Open https://console.cloud.google.com in your browser
> 2. Create a new project (or select existing)

Wait for confirmation, then:

> 3. Enable the Google Calendar API:
>    - Go to **APIs & Services → Library**
>    - Search for "Google Calendar API"
>    - Click on it, then click **Enable**

Wait for confirmation, then:

> 4. Create OAuth credentials:
>    - Go to **APIs & Services → Credentials**
>    - Click **+ CREATE CREDENTIALS** → **OAuth client ID**
>    - If prompted for consent screen, choose "External", fill in app name (e.g., "BitClaw"), your email, and save
>    - For Application type, select **Desktop app**
>    - Name it anything (e.g., "BitClaw Calendar")
>    - Click **Create**

Wait for confirmation, then:

> 5. Download the credentials:
>    - Click **DOWNLOAD JSON**
>    - Save it as `gcp-oauth.keys.json`
>
> Where did you save the file? (Give me the full path, or paste the contents)

If user provides a path:
```bash
mkdir -p ~/.google-calendar-mcp
cp "/path/user/provided/gcp-oauth.keys.json" ~/.google-calendar-mcp/gcp-oauth.keys.json
```

If user pastes JSON content, write it directly to `~/.google-calendar-mcp/gcp-oauth.keys.json`.

## 3. Enable the Calendar API (if reusing Gmail credentials)

If you're reusing Gmail's OAuth credentials, the Calendar API still needs to be enabled in the same GCP project.

Tell the user:

> Since you already have Gmail set up, we'll reuse the same Google Cloud project. You just need to enable the Calendar API:
>
> 1. Open https://console.cloud.google.com
> 2. Make sure you're in the same project you used for Gmail
> 3. Go to **APIs & Services → Library**
> 4. Search for "Google Calendar API"
> 5. Click **Enable**

Wait for confirmation.

Then set up the credentials directory:

```bash
mkdir -p ~/.google-calendar-mcp
cp ~/.gmail-mcp/gcp-oauth.keys.json ~/.google-calendar-mcp/gcp-oauth.keys.json
```

## 4. OAuth Authorization

**USER ACTION REQUIRED**

Tell the user:

> I'm going to run the Calendar authorization. A browser window will open asking you to sign in to Google and grant Calendar access.
>
> **Important:** If you see a warning that the app isn't verified, click "Advanced" then "Go to [app name] (unsafe)" — this is normal for personal OAuth apps.

Run:
```bash
cd ~/.google-calendar-mcp && GOOGLE_OAUTH_CREDENTIALS=~/.google-calendar-mcp/gcp-oauth.keys.json GOOGLE_CALENDAR_MCP_TOKEN_PATH=~/.google-calendar-mcp/token.json npx -y @cocal/google-calendar-mcp
```

This will start the MCP server which triggers the OAuth flow. Tell the user to complete the authorization in their browser. Once authorized, a `token.json` will be written. You can kill the process after authorization completes (Ctrl+C or timeout).

If that hangs without opening a browser:
```bash
timeout 60 bash -c 'cd ~/.google-calendar-mcp && GOOGLE_OAUTH_CREDENTIALS=~/.google-calendar-mcp/gcp-oauth.keys.json GOOGLE_CALENDAR_MCP_TOKEN_PATH=~/.google-calendar-mcp/token.json npx -y @cocal/google-calendar-mcp' || true
```

## 5. Verify Calendar Access

```bash
if [ -f ~/.google-calendar-mcp/token.json ]; then
  echo "Calendar authorization successful!"
  ls -la ~/.google-calendar-mcp/
else
  echo "ERROR: token.json not found — authorization may have failed"
fi
```

## 6. Pre-install in Dockerfile

Add the Calendar MCP package to `container/Dockerfile`. Find the existing `RUN npm install -g` line and append the package:

For example, if the line currently reads:
```dockerfile
RUN npm install -g @gongrzhe/server-gmail-autoauth-mcp
```

Change it to:
```dockerfile
RUN npm install -g @gongrzhe/server-gmail-autoauth-mcp @cocal/google-calendar-mcp
```

If there's no existing `npm install -g` line, add before `WORKDIR /app`:
```dockerfile
RUN npm install -g @cocal/google-calendar-mcp
```

The image will be rebuilt automatically when the service restarts (see final step).

## 7. Add Calendar to Config

Add the Calendar MCP server, env vars, and credentials mount to `bitclaw.config.json`.

The MCP server config:
```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/@cocal/google-calendar-mcp/build/index.js"],
      "env": ["GOOGLE_OAUTH_CREDENTIALS", "GOOGLE_CALENDAR_MCP_TOKEN_PATH"]
    }
  }
}
```

The credentials mount (merge into existing `mounts` array):
```json
{
  "mounts": [
    {
      "host": "~/.google-calendar-mcp",
      "container": "/home/node/.google-calendar-mcp",
      "readonly": false
    }
  ]
}
```

The mount must be **read-write** (`readonly: false`) because the MCP server may need to refresh tokens.

## 8. Add Environment Variables

Add to `.env`:
```
# Google Calendar MCP — paths inside the container
GOOGLE_OAUTH_CREDENTIALS=/home/node/.google-calendar-mcp/gcp-oauth.keys.json
GOOGLE_CALENDAR_MCP_TOKEN_PATH=/home/node/.google-calendar-mcp/token.json
```

Add the same (without values) to `.env.example`:
```
# Google Calendar MCP — credential paths inside the container
GOOGLE_OAUTH_CREDENTIALS=
GOOGLE_CALENDAR_MCP_TOKEN_PATH=
```

## 9. Update Agent Memory

Append to `~/.bitclaw/workspace/AGENT.md`:

```markdown

## Calendar (Google Calendar)

You have access to Google Calendar via MCP tools:
- `mcp__google-calendar__list_calendars` — List available calendars
- `mcp__google-calendar__get_events` — Get events from a calendar
- `mcp__google-calendar__create_event` — Create a new event
- `mcp__google-calendar__update_event` — Update an existing event
- `mcp__google-calendar__delete_event` — Delete an event

Examples: "What's on my calendar today?" or "Schedule a meeting with the team tomorrow at 2pm"
```

## 10. Restart and Test

Restart the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw
```

If that fails (service not installed), fall back to:
```bash
./.claude/skills/setup/scripts/02-install-service.sh
```

Then tell the user:

> Google Calendar is set up! Test it by sending a Telegram message like:
>
> "What's on my calendar today?"
>
> or: "List my calendars"

Monitor for errors:
```bash
tail -f ~/.bitclaw/logs/container.log
```

---

## Troubleshooting

- **MCP not responding:** Run inside the container to test: `docker run --rm bitclaw-agent node /usr/local/lib/node_modules/@cocal/google-calendar-mcp/build/index.js`
- **OAuth token expired:** `rm ~/.google-calendar-mcp/token.json` then re-run auth (step 4). If the GCP OAuth consent screen is in "Testing" mode, tokens expire after 7 days — publish the app to fix this.
- **Container can't access Calendar:** Verify `~/.google-calendar-mcp` mount in `bitclaw.config.json` and that `GOOGLE_OAUTH_CREDENTIALS` / `GOOGLE_CALENDAR_MCP_TOKEN_PATH` are in `.env`.
- **"No such tool available":** The MCP server likely failed to start. Check `~/.bitclaw/logs/container.log` for errors. Ensure the package is pre-installed in the Dockerfile (not relying on `npx` to download at runtime).
