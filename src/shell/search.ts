import type { Tool } from '../types';

function score(tool: Tool, query: string): number {
  const name = tool.name.toLowerCase();
  const id = tool.id.toLowerCase();

  if (id === query || name === query) return 100;
  if (id.startsWith(query) || name.startsWith(query)) return 80;
  if (id.includes(query) || name.includes(query)) return 60;
  if (tool.keywords.some((k) => k.toLowerCase().startsWith(query))) return 40;
  if (tool.keywords.some((k) => k.toLowerCase().includes(query))) return 20;
  return 0;
}

export function searchTools(tools: Tool[], query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...tools];

  return tools
    .map((tool, index) => ({ tool, index, score: score(tool, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.tool);
}
