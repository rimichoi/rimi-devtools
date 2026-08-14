import { tools } from '../src/registry';

export const TOOL_IDS: string[] = tools.map((t) => t.id);

/**
 * 도구가 받는 입력의 모양을 선언한다. 도구를 추가할 때 여기에도 추가한다.
 * - 'text': 텍스트 입력 필드(들)에 순서대로 채울 값. 필드를 찾지 못하면
 *   테스트가 실패한다 — "입력을 찾지 못해 그냥 지나감"이 조용히 통과하는 일을 막는다.
 * - 'none': 텍스트 입력이 아예 없는 도구(예: 파일 드롭존). 텍스트 입력 검사를
 *   건너뛴다는 것을 명시적으로 선언해야 하며, 선언 없이는 스킵될 수 없다.
 */
export type SampleInput = { kind: 'text'; values: string[] } | { kind: 'none' };

export const SAMPLE_INPUT: Record<string, SampleInput> = {
  'json-format': { kind: 'text', values: ['{"id":1,"name":"다우","tags":["a","b"]}'] },
  base64: { kind: 'text', values: ['안녕하세요'] },
  'url-encode': { kind: 'text', values: ['https://a.com/b?q=한글 검색'] },
  'text-count': { kind: 'text', values: ['안녕하세요 반갑습니다'] },
  percent: { kind: 'text', values: ['25', '200'] },
  epoch: { kind: 'text', values: ['1700000000'] },
  'time-calc': { kind: 'text', values: ['01:30:00', '00:45:30'] },
  'json-diff': { kind: 'text', values: ['{"a":1}', '{"a":2}'] },
};

export function sampleFor(id: string): SampleInput {
  return SAMPLE_INPUT[id] ?? { kind: 'text', values: ['test'] };
}
