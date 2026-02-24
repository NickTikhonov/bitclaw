---
name: add-voice-notes
description: Enable Whisper voice message transcription for BitClaw. When a Telegram voice note is sent to the bot, it is automatically transcribed via OpenAI Whisper and handled as a text message. Use when the user wants to speak to the bot instead of typing.
---

# Add Voice Note Transcription

Automatically transcribes Telegram voice messages using OpenAI Whisper (`whisper-1`) before forwarding them to the agent. No extra dependencies required — uses native `fetch`.

**Principle:** Do everything yourself. Don't ask the user to edit files or run commands.

---

## Step 1: Check Current State

Check if the feature is already applied:

```bash
grep -q 'message:voice' src/telegram.ts && echo "already applied" || echo "needs patch"
```

If "already applied", skip to Step 3 (API key check).

---

## Step 2: Patch `src/telegram.ts`

### 2a. Add the voice handler

Find the closing brace after the `message:text` handler in the constructor and add the voice handler immediately after:

The existing block looks like:
```typescript
    this.bot.on('message:text', (ctx) => {
      if (String(ctx.chat.id) !== this.chatId) return;
      this.handler?.(ctx.message.text);
    });
  }
```

Replace with:
```typescript
    this.bot.on('message:text', (ctx) => {
      if (String(ctx.chat.id) !== this.chatId) return;
      this.handler?.(ctx.message.text);
    });

    this.bot.on('message:voice', async (ctx) => {
      if (String(ctx.chat.id) !== this.chatId) return;
      try {
        const text = await transcribeVoice(this.bot, ctx.message.voice.file_id);
        this.handler?.(text);
      } catch (err) {
        this.bot.api
          .sendMessage(this.chatId, `Voice transcription failed: ${err instanceof Error ? err.message : String(err)}`)
          .catch(() => {});
      }
    });
  }
```

### 2b. Add the `transcribeVoice` function

Find the line `function chunkString(str: string, maxLen: number): string[] {` and insert the following immediately before it:

```typescript
async function transcribeVoice(bot: Bot, fileId: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const file = await bot.api.getFile(fileId);
  const token = bot.token;
  const audioResp = await fetch(
    `https://api.telegram.org/file/bot${token}/${file.file_path}`,
  );
  if (!audioResp.ok) throw new Error(`Failed to download voice file: ${audioResp.status}`);
  const audioBuffer = await audioResp.arrayBuffer();

  const form = new FormData();
  form.append('model', 'whisper-1');
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Whisper API error ${resp.status}: ${body}`);
  }
  const data = (await resp.json()) as { text: string };
  return data.text;
}

```

---

## Step 3: Check `OPENAI_API_KEY`

```bash
grep -q 'OPENAI_API_KEY' .env && echo "key present" || echo "key missing"
```

If missing, ask the user for their OpenAI API key, then append it:

```bash
echo "" >> .env
echo "# OpenAI API key — used for Whisper voice transcription" >> .env
echo "OPENAI_API_KEY=<key from user>" >> .env
```

Also ensure `.env.example` has the entry. If it doesn't, append:

```
# OpenAI API key — used for Whisper voice transcription
OPENAI_API_KEY=
```

---

## Step 4: Restart the Service

```bash
launchctl kickstart -k gui/$(id -u)/com.bitclaw
```

If that fails (service not installed):
```bash
./.claude/skills/setup/scripts/02-install-service.sh
```

Verify:
```bash
sleep 2 && tail -5 ~/.bitclaw/logs/app.log
```

---

## Step 5: Confirm

Tell the user:

> Voice transcription is live. Send a Telegram voice note — it will be transcribed by Whisper and handled as if you typed the message.
>
> Whisper supports all languages and will transcribe in whichever language you speak.

---

## Troubleshooting

- **"OPENAI_API_KEY is not set"** — the key is missing from `.env`; add it and restart
- **"Voice transcription failed: Whisper API error 401"** — the key is invalid or expired
- **"Failed to download voice file"** — Telegram file download failed; check `TELEGRAM_BOT_TOKEN` is correct
- **Voice messages silently ignored** — check the patch was applied: `grep 'message:voice' src/telegram.ts`
