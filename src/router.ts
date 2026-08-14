import type { Tool } from './types';

export function parseHash(hash: string): string | null {
  const raw = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const id = raw.trim();
  return id === '' ? null : id;
}

export function resolveToolId(hash: string, tools: Tool[]): string | null {
  const first = tools[0];
  if (!first) return null;
  const id = parseHash(hash);
  if (id === null) return first.id;
  return tools.some((t) => t.id === id) ? id : first.id;
}
