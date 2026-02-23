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

/** Fun generic statuses shown for unknown / MCP tools. */
const FUN_FALLBACKS = [
  '🤔 Thinking really hard…',
  '🧙 Casting spells…',
  '🔮 Consulting the oracle…',
  '🛠️ Tinkering away…',
  '🎯 Locking on target…',
  '🧪 Running experiments…',
  '🪄 Working some magic…',
  '🐙 Wrangling octopi…',
  '⚡ Zapping electrons…',
  '🌀 Entering the vortex…',
  '🚀 Launching sequence…',
  '🦾 Flexing the muscles…',
  '🍳 Cooking something up…',
  '📡 Phoning a friend…',
  '🗺️ Charting new territory…',
  '🎸 Shredding…',
];

/**
 * Generate a short, friendly status string for a tool being used.
 * Uses a static map for common tools, random fun message for others.
 */
export function generateStatus(toolName: string): string {
  if (STATIC_MAP[toolName]) return STATIC_MAP[toolName];
  return FUN_FALLBACKS[Math.floor(Math.random() * FUN_FALLBACKS.length)];
}
