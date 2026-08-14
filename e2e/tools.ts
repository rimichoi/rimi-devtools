import { tools } from '../src/registry';

export const TOOL_IDS: string[] = tools.map((t) => t.id);

/** 도구 id 별 샘플 입력. 도구를 추가하면 여기에도 추가한다. */
export const SAMPLE_INPUT: Record<string, string> = {
  base64: '안녕하세요',
};

export function sampleFor(id: string): string {
  return SAMPLE_INPUT[id] ?? 'test';
}
