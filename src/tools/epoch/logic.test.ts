import { describe, it, expect } from 'vitest';
import { detectUnit, fromEpoch, toEpoch } from './logic';

const NOW = new Date('2023-11-14T22:13:20Z');

describe('detectUnit', () => {
  it('10자리는 초로 본다', () => {
    expect(detectUnit(1700000000)).toBe('seconds');
  });

  it('13자리는 밀리초로 본다', () => {
    expect(detectUnit(1700000000000)).toBe('milliseconds');
  });

  it('0 은 초로 본다', () => {
    expect(detectUnit(0)).toBe('seconds');
  });

  it('음수도 자릿수로 판단한다', () => {
    expect(detectUnit(-1000)).toBe('seconds');
    expect(detectUnit(-1700000000000)).toBe('milliseconds');
  });

  it('경계값 1e11 부터 밀리초다', () => {
    expect(detectUnit(99_999_999_999)).toBe('seconds');
    expect(detectUnit(100_000_000_000)).toBe('milliseconds');
  });
});

describe('fromEpoch', () => {
  it('초 값을 UTC 로 변환한다', () => {
    const r = fromEpoch('1700000000', 'auto', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.utc).toBe('2023-11-14 22:13:20');
    expect(r.value.unit).toBe('seconds');
  });

  it('같은 시각을 KST 로도 보여준다', () => {
    const r = fromEpoch('1700000000', 'auto', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kst).toBe('2023-11-15 07:13:20');
  });

  it('밀리초 값을 자동으로 알아본다', () => {
    const r = fromEpoch('1700000000000', 'auto', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.unit).toBe('milliseconds');
    expect(r.value.utc).toBe('2023-11-14 22:13:20');
  });

  it('단위를 강제로 지정할 수 있다', () => {
    const r = fromEpoch('1700000000', 'milliseconds', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1700000000 밀리초 = 19일 16시간 13분 20초
    expect(r.value.utc).toBe('1970-01-20 16:13:20');
  });

  it('1970년 이전 음수를 처리한다', () => {
    const r = fromEpoch('-1', 'auto', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.utc).toBe('1969-12-31 23:59:59');
  });

  it('쉼표와 공백을 무시한다', () => {
    const r = fromEpoch(' 1,700,000,000 ', 'auto', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.utc).toBe('2023-11-14 22:13:20');
  });

  it('숫자가 아니면 에러다', () => {
    expect(fromEpoch('abc', 'auto', NOW).ok).toBe(false);
  });

  it('표현 범위를 넘으면 에러다', () => {
    expect(fromEpoch('99999999999999999', 'milliseconds', NOW).ok).toBe(false);
  });

  it('상대 시간을 계산한다', () => {
    const r = fromEpoch('1699913600', 'auto', NOW); // 정확히 24시간 전
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.relative).toBe('1일 전');
  });

  it('현재 시각이면 방금 전이다', () => {
    const r = fromEpoch('1700000000', 'auto', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.relative).toBe('방금');
  });
});

describe('toEpoch', () => {
  it('UTC 문자열을 초로 바꾼다', () => {
    expect(toEpoch('2023-11-14 22:13:20', 'utc')).toEqual({
      ok: true,
      value: { seconds: 1700000000, millis: 1700000000000 },
    });
  });

  it('KST 문자열을 초로 바꾼다', () => {
    expect(toEpoch('2023-11-15 07:13:20', 'kst')).toEqual({
      ok: true,
      value: { seconds: 1700000000, millis: 1700000000000 },
    });
  });

  it('T 구분자를 허용한다', () => {
    expect(toEpoch('2023-11-14T22:13:20', 'utc').ok).toBe(true);
  });

  it('초를 생략할 수 있다', () => {
    const r = toEpoch('2023-11-14 22:13', 'utc');
    expect(r).toEqual({ ok: true, value: { seconds: 1699999980, millis: 1699999980000 } });
  });

  it('형식이 다르면 에러다', () => {
    expect(toEpoch('2023/11/14 22:13:20', 'utc').ok).toBe(false);
  });

  it('존재하지 않는 날짜는 에러다', () => {
    expect(toEpoch('2023-02-30 00:00:00', 'utc').ok).toBe(false);
  });

  it('윤년 2월 29일은 통과한다', () => {
    expect(toEpoch('2024-02-29 00:00:00', 'utc').ok).toBe(true);
  });

  it('평년 2월 29일은 에러다', () => {
    expect(toEpoch('2023-02-29 00:00:00', 'utc').ok).toBe(false);
  });
});

describe('toEpoch 방어 — 두 자리 이하 연도', () => {
  /*
   * Date.UTC 는 0~99 를 1900년대로 옮긴다 — Date.UTC(23, 10, 15) 는 1923년이다.
   * 되돌림 검사에 그대로 넣으면 `0023-11-15 07:13:20` 이라는 **정상적인 날짜**가
   * '존재하지 않는 날짜' 라는 틀린 오류를 받는다. 마스크가 네 자리 연도를 그대로
   * 통과시키므로 실제로 칠 수 있는 입력이다.
   */
  it('연도 0023 을 1923 으로 오해하지 않는다', () => {
    const r = toEpoch('0023-11-15 07:13:20', 'utc');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 되돌려 보면 같은 날짜여야 한다.
      expect(new Date(r.value.millis).toISOString()).toBe('0023-11-15T07:13:20.000Z');
    }
  });

  it('연도 0099 도 통과한다', () => {
    expect(toEpoch('0099-01-01 00:00:00', 'utc').ok).toBe(true);
  });

  it('두 자리 이하 연도에서도 존재하지 않는 날짜는 여전히 막는다', () => {
    expect(toEpoch('0023-02-30 00:00:00', 'utc').ok).toBe(false);
  });

  it('네 자리 연도의 정상 동작은 그대로다', () => {
    expect(toEpoch('2023-11-15 07:13:20', 'kst')).toEqual({
      ok: true,
      value: { seconds: 1700000000, millis: 1700000000000 },
    });
  });
});
