import { describe, it, expect } from 'vitest';
import { calcPercent } from './logic';

describe('calcPercent - ratio (A는 B의 몇 %)', () => {
  it('25 는 200 의 12.5% 다', () => {
    expect(calcPercent('ratio', 25, 200)).toEqual({ ok: true, value: 12.5 });
  });

  it('분모가 0 이면 에러다', () => {
    expect(calcPercent('ratio', 5, 0).ok).toBe(false);
  });
});

describe('calcPercent - partOf (B의 A%는 얼마)', () => {
  it('200 의 15% 는 30 이다', () => {
    expect(calcPercent('partOf', 15, 200)).toEqual({ ok: true, value: 30 });
  });
});

describe('calcPercent - change (A에서 B로 증감률)', () => {
  it('80 에서 100 은 25% 증가다', () => {
    expect(calcPercent('change', 80, 100)).toEqual({ ok: true, value: 25 });
  });

  it('100 에서 80 은 -20% 다', () => {
    expect(calcPercent('change', 100, 80)).toEqual({ ok: true, value: -20 });
  });

  it('기준이 0 이면 에러다', () => {
    expect(calcPercent('change', 0, 50).ok).toBe(false);
  });
});

describe('calcPercent - applyChange (A에 B% 적용)', () => {
  it('1000 에 10% 증가는 1100 이다', () => {
    expect(calcPercent('applyChange', 1000, 10)).toEqual({ ok: true, value: 1100 });
  });

  it('1000 에 -10% 는 900 이다', () => {
    expect(calcPercent('applyChange', 1000, -10)).toEqual({ ok: true, value: 900 });
  });
});

describe('calcPercent - 공통', () => {
  it('NaN 입력은 에러다', () => {
    expect(calcPercent('ratio', Number.NaN, 100).ok).toBe(false);
  });

  it('Infinity 입력은 에러다', () => {
    expect(calcPercent('ratio', Number.POSITIVE_INFINITY, 100).ok).toBe(false);
  });

  it('부동소수점 오차를 정리한다', () => {
    // 0.1 + 0.2 계열 오차가 결과에 노출되지 않아야 한다
    expect(calcPercent('partOf', 10, 0.3)).toEqual({ ok: true, value: 0.03 });
  });
});

describe('calcPercent 방어 — 결과가 넘치는 경우', () => {
  /*
   * 입력이 둘 다 유한해도 결과는 넘칠 수 있다. 막지 않으면 tidy 를 통과한 Infinity
   * 가 `toLocaleString('ko-KR')` 을 거쳐 화면에 '∞' 로 뜬다 — 답이 아닌 것을 답의
   * 자리에 놓는 것이 이 층이 막아야 하는 부류의 실패다. 화면의 숫자 마스크는 여기에
   * 아무 도움이 되지 않는다: 1e308 은 마스크를 통과하는 정상적인 숫자 문자열이다.
   */
  const HUGE = 1e308;

  it('applyChange 의 결과가 넘치면 한국어 오류다', () => {
    const r = calcPercent('applyChange', HUGE, HUGE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('너무 커서');
  });

  it('partOf 의 결과가 넘치면 한국어 오류다', () => {
    expect(calcPercent('partOf', HUGE, HUGE).ok).toBe(false);
  });

  it('ratio 의 결과가 넘치면 한국어 오류다', () => {
    expect(calcPercent('ratio', HUGE, 1e-308).ok).toBe(false);
  });

  it('change 의 결과가 넘치면 한국어 오류다', () => {
    expect(calcPercent('change', 1e-308, HUGE).ok).toBe(false);
  });

  it('넘침 검사가 큰 정상 입력을 막지 않는다', () => {
    expect(calcPercent('ratio', HUGE, HUGE)).toEqual({ ok: true, value: 100 });
    expect(calcPercent('applyChange', 1e300, 100)).toEqual({ ok: true, value: 2e300 });
  });
});
