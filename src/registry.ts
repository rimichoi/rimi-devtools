import type { Tool } from './types';

export const tools: Tool[] = [
  {
    id: 'base64',
    name: 'Base64',
    keywords: ['base64', 'b64', '인코딩', '디코딩', 'encode', 'decode'],
    category: 'encode',
    load: () => import('./tools/base64/index').then((m) => m.default),
  },
  {
    id: 'url-encode',
    name: 'URL 인코딩',
    keywords: ['url', 'uri', '퍼센트', 'percent', '인코딩', 'encode', 'decode'],
    category: 'encode',
    load: () => import('./tools/url-encode/index').then((m) => m.default),
  },
  {
    id: 'text-count',
    name: '글자수 세기',
    keywords: ['글자수', '자소', '바이트', 'count', 'length', '단어', '텍스트'],
    category: 'calc',
    load: () => import('./tools/text-count/index').then((m) => m.default),
  },
  {
    id: 'percent',
    name: '백분율 계산',
    keywords: ['백분율', '퍼센트', 'percent', '비율', '증감률', '계산'],
    category: 'calc',
    load: () => import('./tools/percent/index').then((m) => m.default),
  },
  {
    id: 'epoch',
    name: 'Epoch 변환',
    keywords: ['epoch', 'unix', '타임스탬프', 'timestamp', '시간', '변환', 'utc', 'kst'],
    category: 'convert',
    load: () => import('./tools/epoch/index').then((m) => m.default),
  },
  {
    id: 'time-calc',
    name: '시간/날짜 계산',
    keywords: ['시간', '날짜', '계산', 'time', 'date', '일수', 'diff', 'd-day'],
    category: 'calc',
    load: () => import('./tools/time-calc/index').then((m) => m.default),
  },
];

export function findTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}
