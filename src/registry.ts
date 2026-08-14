import type { Tool } from './types';

export const tools: Tool[] = [];

export function findTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}
