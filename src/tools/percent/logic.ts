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

export function calcPercent(mode: PercentMode, a: number, b: number): ToolResult<number> {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: '숫자를 입력하세요.' };
  }

  switch (mode) {
    case 'ratio':
      if (b === 0) return { ok: false, error: '전체(B)가 0 이면 비율을 계산할 수 없습니다.' };
      return { ok: true, value: tidy((a / b) * 100) };
    case 'partOf':
      return { ok: true, value: tidy((b * a) / 100) };
    case 'change':
      if (a === 0) return { ok: false, error: '기준값(A)이 0 이면 증감률을 계산할 수 없습니다.' };
      return { ok: true, value: tidy(((b - a) / a) * 100) };
    case 'applyChange':
      return { ok: true, value: tidy(a * (1 + b / 100)) };
  }
}
