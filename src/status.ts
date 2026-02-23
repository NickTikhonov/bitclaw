import Anthropic from '@anthropic-ai/sdk';

/**
 * Static map for common built-in tools — zero latency, zero cost.
 */
const STATIC_MAP: Record<string, string> = {
  Bash: '🖥️ Running a command…',
  Read: '📖 Reading a file…',
  Write: '✏️ Writing a file…',
  Edit: '✏️ Editing a file…',
  Glob: '🔍 Searching for files…',
  Grep: '🔍 Searching file contents…',
  WebSearch: '🌐 Searching the web…',
  WebFetch: '🌐 Fetching a webpage…',
  TodoWrite: '📋 Updating task list…',
  Task: '⚙️ Starting a subtask…',
  TaskOutput: '⚙️ Checking subtask output…',
  TaskStop: '⚙️ Stopping a subtask…',
  Skill: '🧠 Using a skill…',
  NotebookEdit: '📓 Editing a notebook…',
  ToolSearch: '🔧 Looking for tools…',
};

const FALLBACK = '⚙️ Working on it…';

/** In-memory cache so each unique tool name only triggers one LLM call. */
const cache = new Map<string, string>();
let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Generate a short, friendly status string for a tool being used.
 * Uses a static map for common tools, Haiku for unknown ones, with caching.
 */
export async function generateStatus(toolName: string): Promise<string> {
  // 1. Static map (instant)
  if (STATIC_MAP[toolName]) return STATIC_MAP[toolName];

  // 2. Cache hit
  const cached = cache.get(toolName);
  if (cached) return cached;

  // 3. Haiku generation for unknown tools (e.g. MCP tools)
  const anthropic = getClient();
  if (!anthropic) return FALLBACK;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-20250414',
      max_tokens: 30,
      messages: [{
        role: 'user',
        content: `Generate a brief, friendly status message (3-6 words with one leading emoji) for an AI assistant that is currently using this tool: "${toolName}". Just output the status text, nothing else. Examples: "📧 Checking your emails…", "📅 Looking up calendar…", "💬 Sending a message…"`,
      }],
    });
    const text = resp.content[0]?.type === 'text'
      ? resp.content[0].text.trim()
      : FALLBACK;
    cache.set(toolName, text);
    return text;
  } catch {
    return FALLBACK;
  }
}
