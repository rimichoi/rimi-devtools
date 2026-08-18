import type { ToolResult } from '../../types';

export type PercentMode = 'ratio' | 'partOf' | 'change' | 'applyChange';

export const PERCENT_MODES = [
  { id: 'ratio', label: 'A 는 B 의 몇 % 인가', labelA: 'A (부분)', labelB: 'B (전체)' },
  { id: 'partOf', label: 'B 의 A % 는 얼마인가', labelA: 'A (퍼센트)', labelB: 'B (전체)' },
  { id: 'change', label: 'A 에서 B 로 몇 % 증감했나', labelA: 'A (이전)', labelB: 'B (이후)' },
  { id: 'applyChange', label: 'A 에 B % 를 적용하면', labelA: 'A (원래 값)', labelB: 'B (증감 %)' },
] as const satisfies readonly { id: PercentMode; label: string; labelA: string; labelB: string }[];

/** 12.5000000000001 같은 부동소수점 잔여 오차를 정리한다 */
function tidy(n: number): number {
  return Number.parseFloat(n.toPrecision(12));
}

/** 위 switch 가 고른 식의 값. 값이 없는 경우는 그 자리에서 오류로 끝난다. */
function evaluate(mode: PercentMode, a: number, b: number): ToolResult<number> {
  switch (mode) {
    case 'ratio':
      if (b === 0) return { ok: false, error: '전체(B)가 0 이면 비율을 계산할 수 없습니다.' };
      return { ok: true, value: (a / b) * 100 };
    case 'partOf':
      return { ok: true, value: (b * a) / 100 };
    case 'change':
      if (a === 0) return { ok: false, error: '기준값(A)이 0 이면 증감률을 계산할 수 없습니다.' };
      return { ok: true, value: ((b - a) / a) * 100 };
    case 'applyChange':
      return { ok: true, value: a * (1 + b / 100) };
  }
}

export function calcPercent(mode: PercentMode, a: number, b: number): ToolResult<number> {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: '숫자를 입력하세요.' };
  }

  const raw = evaluate(mode, a, b);
  if (!raw.ok) return raw;

  /*
   * 입력이 둘 다 유한해도 결과는 넘칠 수 있다 — 1e308 의 1e308 % 는 Infinity 다.
   * 이걸 막지 않으면 tidy 를 통과한 Infinity 가 화면에 '∞' 로 뜬다
   * (`Infinity.toLocaleString('ko-KR')`). 답이 아닌 것을 답의 자리에 놓는 것이
   * 이 층이 막아야 하는 부류의 실패다. 화면의 마스크는 여기에 아무 도움이 되지
   * 않는다 — 1e308 은 마스크를 통과하는 정상적인 숫자 문자열이다.
   */
  const value = tidy(raw.value);
  if (!Number.isFinite(value)) {
    return { ok: false, error: '계산 결과가 너무 커서 나타낼 수 없습니다.' };
  }
  return { ok: true, value };
}
