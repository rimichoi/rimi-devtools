import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  formatDuration,
  addDuration,
  diffDates,
  shiftDate,
  maskDateInput,
  maskDayCountInput,
  isDateInputAnchor,
  isDayCountInputAnchor,
} from './logic';

describe('parseDuration', () => {
  it('HH:MM:SS 를 초로 바꾼다', () => {
    expect(parseDuration('01:30:00')).toEqual({ ok: true, value: 5400 });
  });

  it('MM:SS 를 초로 바꾼다', () => {
    expect(parseDuration('05:30')).toEqual({ ok: true, value: 330 });
  });

  it('24시간을 넘는 값을 허용한다', () => {
    expect(parseDuration('100:00:00')).toEqual({ ok: true, value: 360000 });
  });

  it('분과 초가 60 이상이면 에러다', () => {
    expect(parseDuration('01:60:00').ok).toBe(false);
    expect(parseDuration('01:00:60').ok).toBe(false);
  });

  it('형식이 다르면 에러다', () => {
    expect(parseDuration('1시간').ok).toBe(false);
  });
});

describe('formatDuration', () => {
  it('초를 HH:MM:SS 로 만든다', () => {
    expect(formatDuration(5400)).toBe('01:30:00');
  });

  it('24시간을 넘겨도 시간으로 누적한다', () => {
    expect(formatDuration(360000)).toBe('100:00:00');
  });

  it('음수는 앞에 부호를 붙인다', () => {
    expect(formatDuration(-90)).toBe('-00:01:30');
  });
});

describe('addDuration', () => {
  it('시간을 더한다', () => {
    expect(addDuration('01:30:00', '00:45:30', '+')).toEqual({ ok: true, value: '02:15:30' });
  });

  it('시간을 뺀다', () => {
    expect(addDuration('01:30:00', '00:45:30', '-')).toEqual({ ok: true, value: '00:44:30' });
  });

  it('결과가 음수여도 계산한다', () => {
    expect(addDuration('00:10:00', '00:30:00', '-')).toEqual({ ok: true, value: '-00:20:00' });
  });

  it('한쪽이 잘못되면 에러다', () => {
    expect(addDuration('abc', '00:30:00', '+').ok).toBe(false);
  });
});

describe('diffDates', () => {
  it('날짜 차이를 일수로 낸다', () => {
    const r = diffDates('2026-08-01', '2026-08-14');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days).toBe(13);
  });

  it('역순이면 음수다', () => {
    const r = diffDates('2026-08-14', '2026-08-01');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days).toBe(-13);
  });

  it('윤년 2월을 건너뛰는 구간을 정확히 센다', () => {
    const r = diffDates('2024-02-28', '2024-03-01');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days).toBe(2);
  });

  it('평년은 하루 적다', () => {
    const r = diffDates('2023-02-28', '2023-03-01');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days).toBe(1);
  });

  it('주 단위도 함께 낸다', () => {
    const r = diffDates('2026-08-01', '2026-08-15');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.weeks).toBe(2);
  });

  it('형식이 틀리면 에러다', () => {
    expect(diffDates('2026/08/01', '2026-08-14').ok).toBe(false);
  });
});

describe('shiftDate', () => {
  it('날짜에 일수를 더한다', () => {
    expect(shiftDate('2026-08-14', 20)).toEqual({ ok: true, value: '2026-09-03' });
  });

  it('음수면 뺀다', () => {
    expect(shiftDate('2026-08-14', -14)).toEqual({ ok: true, value: '2026-07-31' });
  });

  it('윤년을 넘어간다', () => {
    expect(shiftDate('2024-02-28', 2)).toEqual({ ok: true, value: '2024-03-01' });
  });

  it('존재하지 않는 날짜는 에러다', () => {
    expect(shiftDate('2026-02-30', 1).ok).toBe(false);
  });
});

describe('shiftDate 방어', () => {
  /*
   * 화면의 입력 필터는 편의지 경계가 아니다. 이 층은 필터가 무엇을 통과시키든
   * 스스로 한국어 ToolResult 오류를 돌려줘야 한다.
   */
  it('숫자가 아니면 한국어 오류를 돌려준다 (Number("abc") = NaN)', () => {
    expect(shiftDate('2026-08-14', Number('abc'))).toEqual({
      ok: false,
      error: '더할 일수를 숫자로 입력하세요.',
    });
  });

  it('Infinity 도 막는다', () => {
    expect(shiftDate('2026-08-14', Infinity).ok).toBe(false);
  });

  it('정수가 아니면 조용히 잘라내지 않고 오류를 돌려준다', () => {
    expect(shiftDate('2026-08-14', 1.5)).toEqual({
      ok: false,
      error: '더할 일수는 정수로 입력하세요.',
    });
  });

  it('Date 의 표현 범위를 넘기는 일수는 NaN-NaN-NaN 대신 오류가 된다', () => {
    // 필터가 숫자만 통과시키므로 999999999999 는 실제로 칸에 칠 수 있는 값이다.
    const r = shiftDate('2026-08-14', 999999999999);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('계산한 날짜가 YYYY-MM-DD 로 나타낼 수 있는 범위를 벗어났습니다.');
  });

  it('연도가 네 자리를 벗어나면 YYYY-MM-DD 가 아니므로 오류가 된다', () => {
    // 3,000,000일 ≈ 8,200년. Date 범위 안이지만 이 도구의 형식 밖이다.
    const r = shiftDate('2026-08-14', 3_000_000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('YYYY-MM-DD');
  });

  it('음수 방향으로도 같은 범위 검사를 한다', () => {
    expect(shiftDate('2026-08-14', -3_000_000).ok).toBe(false);
  });

  it('범위 안이면 그대로 계산한다 (범위 검사가 정상 입력을 막지 않는다)', () => {
    expect(shiftDate('2026-08-14', 0)).toEqual({ ok: true, value: '2026-08-14' });
    // 표현 가능한 마지막 날 바로 앞까지는 계산된다.
    expect(shiftDate('9999-12-30', 1)).toEqual({ ok: true, value: '9999-12-31' });
  });

  it('네 자리 연도의 마지막 날을 넘어서면 막는다', () => {
    expect(shiftDate('9999-12-31', 1).ok).toBe(false);
  });
});

describe('maskDateInput', () => {
  it('숫자만 친 값에 구분자를 넣는다', () => {
    expect(maskDateInput('20260814')).toBe('2026-08-14');
  });

  it('붙여넣은 여러 표기를 모두 같은 모양으로 만든다', () => {
    for (const pasted of ['2026-08-14', '20260814', '2026/08/14', '2026.08.14']) {
      expect(maskDateInput(pasted), pasted).toBe('2026-08-14');
    }
  });

  it('치는 도중의 부분 입력을 그대로 유지한다', () => {
    expect(maskDateInput('2')).toBe('2');
    expect(maskDateInput('2026')).toBe('2026');
    expect(maskDateInput('20260')).toBe('2026-0');
    expect(maskDateInput('202608')).toBe('2026-08');
    expect(maskDateInput('2026081')).toBe('2026-08-1');
  });

  it('자리수를 채워도 끝에 구분자를 붙이지 않는다', () => {
    // 붙이면 백스페이스가 지운 자리를 마스크가 되채워 캐럿이 갇힌다.
    expect(maskDateInput('2026')).not.toContain('-');
    expect(maskDateInput('202608')).toBe('2026-08');
    expect(maskDateInput('202608').endsWith('-')).toBe(false);
  });

  it('백스페이스로 되돌아가는 길이 막히지 않는다', () => {
    // '2026-08' 에서 '8' 을 지운 상태를 마스크에 다시 먹인다.
    expect(maskDateInput('2026-0')).toBe('2026-0');
    expect(maskDateInput('2026-')).toBe('2026');
    expect(maskDateInput('2026')).toBe('2026');
  });

  it('숫자가 아닌 것은 전부 버린다', () => {
    expect(maskDateInput('안녕하세요')).toBe('');
    expect(maskDateInput('20a26b08c14')).toBe('2026-08-14');
  });

  it('여덟 자리를 넘는 숫자는 잘라낸다', () => {
    expect(maskDateInput('2026081499')).toBe('2026-08-14');
  });

  it('멱등이다 — 이미 정리된 값을 다시 먹여도 그대로다', () => {
    expect(maskDateInput(maskDateInput('2026/08/14'))).toBe('2026-08-14');
  });

  it('캐럿 기준 문자는 숫자뿐이다 (구분자를 세면 캐럿이 밀린다)', () => {
    expect(isDateInputAnchor('0')).toBe(true);
    expect(isDateInputAnchor('9')).toBe(true);
    expect(isDateInputAnchor('-')).toBe(false);
  });
});

describe('maskDayCountInput', () => {
  it('숫자는 그대로 둔다', () => {
    expect(maskDayCountInput('20')).toBe('20');
  });

  it('맨 앞의 - 하나는 남긴다', () => {
    expect(maskDayCountInput('-14')).toBe('-14');
    expect(maskDayCountInput('-')).toBe('-');
  });

  it('숫자와 - 가 아닌 것은 전부 버린다', () => {
    expect(maskDayCountInput('abc')).toBe('');
    expect(maskDayCountInput('1a2b3')).toBe('123');
    expect(maskDayCountInput('1.5')).toBe('15');
    expect(maskDayCountInput('1e3')).toBe('13');
  });

  it('- 는 맨 앞에서만 살아남는다', () => {
    expect(maskDayCountInput('5-3')).toBe('53');
    expect(maskDayCountInput('--5')).toBe('-5');
    expect(maskDayCountInput('-5-3')).toBe('-53');
  });

  it('멱등이다', () => {
    expect(maskDayCountInput(maskDayCountInput('-1a2'))).toBe('-12');
  });

  it('캐럿 기준 문자는 살아남는 문자 전부다', () => {
    expect(isDayCountInputAnchor('7')).toBe(true);
    expect(isDayCountInputAnchor('-')).toBe(true);
    expect(isDayCountInputAnchor('a')).toBe(false);
  });
});
