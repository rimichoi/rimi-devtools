import type { Tool } from './types';

export const tools: Tool[] = [
  {
    id: 'base64',
    name: 'Base64',
    keywords: ['base64', 'b64', '인코딩', '디코딩', 'encode', 'decode'],
    category: 'encode',
    load: () => import('./tools/base64/index').then((m) => m.default),
  },
];

export function findTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}
