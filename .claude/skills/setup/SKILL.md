---
name: setup
description: Run initial BitClaw setup. Use when user wants to install dependencies, configure Docker, set up Telegram, add API keys, or build the container. Triggers on "setup", "install", "configure", or first-time setup requests.
---

# BitClaw Setup

Walk the user through setup step by step. Only pause when user action is required (pasting a token, creating a bot, etc.). If something is broken or missing, fix it — don't tell the user to go fix it themselves unless it genuinely requires their manual action.

**UX:** Be concise. State what you're doing, do it, report the result.

## 1. Preflight Check

Run `./.claude/skills/setup/scripts/01-preflight.sh` and parse the structured output.

Record all values — they determine which steps to run vs skip.

## 2. Node.js

**If NODE_OK=true:** Skip.

**If NODE_OK=false:** Node.js ≥20 is required. Offer to install:
- macOS: `brew install node@22` (if brew available) or install nvm + `nvm install 22`
- Linux: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`

If brew/nvm aren't installed, install them first. After installing, re-run preflight to confirm.

## 3. Docker

**If DOCKER=running:** Skip to step 4.

**If DOCKER=installed_not_running:**
- macOS: `open -a Docker` — wait 15s, re-check with `docker info`. Poll a few times if needed.
- Linux: `sudo systemctl start docker`

**If DOCKER=not_found:** Ask the user for confirmation before installing.
- macOS: `brew install --cask docker`, then `open -a Docker` and wait. If no brew, direct to https://docker.com/products/docker-desktop
- Linux: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER` (note: may need to log out/in)

After Docker is running, confirm with `docker info`.

## 4. Install Dependencies

**If DEPS_INSTALLED=true:** Ask user if they want to re-install or skip. If skipping, move on.

Run `npm install` in the project root. If it fails, read the error and try to fix (delete node_modules + package-lock.json and retry, or install build tools if native module issues).

## 5. Claude Authentication

**If HAS_ANTHROPIC_KEY=true or HAS_OAUTH_TOKEN=true:** Tell the user credentials already exist. Ask: keep or reconfigure? If keeping, skip to step 6.

Ask: Do you have a Claude subscription (Pro/Max) or an Anthropic API key?

**Subscription (OAuth):**
1. Tell the user to open another terminal and run: `claude setup-token`
2. Copy the token it outputs
3. They should add it to `.env` in the project root as: `CLAUDE_CODE_OAUTH_TOKEN=<token>`
4. Wait for confirmation, then verify the `.env` file has the key

Do NOT ask the user to paste the token into the chat. Tell them to put it in `.env`, then confirm.

**API key:**
1. Tell user to get a key from https://console.anthropic.com/settings/keys
2. Add it to `.env` as: `ANTHROPIC_API_KEY=<key>`
3. Wait for confirmation, then verify

If `.env` doesn't exist yet, create it from `.env.example`:
```bash
cp .env.example .env
```

## 6. Telegram Bot Setup

**If HAS_TELEGRAM_TOKEN=true and HAS_TELEGRAM_CHAT=true:** Tell the user Telegram is already configured. Ask: keep or reconfigure? If keeping, skip to step 7.

### 6a. Create Bot

Tell the user:
1. Open Telegram and message **@BotFather**
2. Send `/newbot`
3. Follow the prompts to name the bot
4. Copy the bot token (looks like `123456789:ABCdef...`)
5. Add it to `.env` as: `TELEGRAM_BOT_TOKEN=<token>`

Wait for confirmation.

### 6b. Get Chat ID

Tell the user:
1. Create a group in Telegram (or use an existing one)
2. Add the bot to the group
3. Send any message in the group
4. Open this URL in a browser: `https://api.telegram.org/bot<TOKEN>/getUpdates` (replace `<TOKEN>` with the bot token they just set)
5. Find the `"chat":{"id":...}` value in the JSON response — it's a negative number for groups
6. Add it to `.env` as: `TELEGRAM_CHAT_ID=<id>`

Wait for confirmation.

### 6c. Disable Privacy Mode

Tell the user:
1. Open a chat with **@BotFather**
2. Send `/setprivacy`
3. Select their bot
4. Choose **Disable**
5. Remove and re-add the bot to the group

This allows the bot to read all messages, not just commands.

## 7. Build Container

**If CONTAINER_IMAGE=true:** Ask user if they want to rebuild or skip. If skipping, move on.

Build the container image:
```bash
docker build -t bitclaw-agent:dev -f container/Dockerfile .
```

If the build fails:
- Read the error output
- If cache issue: `docker builder prune -f` then retry
- If TypeScript errors: diagnose and fix, then retry

Test the image:
```bash
echo '{}' | docker run -i --rm --entrypoint /bin/echo bitclaw-agent:dev "Container OK"
```

If the test output contains "Container OK", the build is good.

## 8. Verify

Re-run `./.claude/skills/setup/scripts/01-preflight.sh` and confirm all values are now passing:

- NODE_OK=true
- DOCKER=running
- DEPS_INSTALLED=true
- HAS_ANTHROPIC_KEY=true or HAS_OAUTH_TOKEN=true
- HAS_TELEGRAM_TOKEN=true
- HAS_TELEGRAM_CHAT=true
- CONTAINER_IMAGE=true

**If any are still false**, go back and fix the relevant step.

**If all pass:** Tell the user setup is complete. Show them:

```
✅ BitClaw is ready!

Start it with:
  npm start

View container logs:
  tail -f ~/.bitclaw/logs/container.log

Interactive chat (without Telegram):
  npm run chat
```

## Troubleshooting

**Container build fails with TypeScript errors:** Check `container/src/` for issues. The container TypeScript is compiled during docker build.

**"Missing required env vars" on `npm start`:** Ensure `.env` has both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set to non-empty values.

**Bot doesn't respond in group:** Check privacy mode is disabled (step 6c). Verify the chat ID is correct by re-checking `/getUpdates`.

**Agent errors:** Check `~/.bitclaw/logs/container.log` for container-side errors. Common cause: invalid or expired API key.
