import { describe, it, expect } from 'vitest';
import {
  DATE_MASK,
  DATE_TIME_MASK,
  DECIMAL_MASK,
  DURATION_MASK,
  INTEGER_MASK,
  type FieldMask,
} from './masks';

/**
 * 카탈로그의 마스크 전부가 지켜야 하는 세 규칙. 새 마스크를 추가하면 아래
 * ALL_MASKS 에 넣기만 하면 이 규칙들이 자동으로 걸린다 — 규칙을 도구마다 다시
 * 확인하지 않기 위해 공용 카탈로그를 만든 것이므로, 검사도 카탈로그 단위로 한다.
 */
const ALL_MASKS: [string, FieldMask][] = [
  ['DATE_MASK', DATE_MASK],
  ['DATE_TIME_MASK', DATE_TIME_MASK],
  ['DURATION_MASK', DURATION_MASK],
  ['INTEGER_MASK', INTEGER_MASK],
  ['DECIMAL_MASK', DECIMAL_MASK],
];

/** 한 글자씩 치는 것을 재현한다. 마스크는 매 글자마다 값에 다시 적용된다. */
function typeInto(mask: FieldMask, keys: string): string {
  let value = '';
  for (const key of keys) value = mask.apply(value + key);
  return value;
}

describe('마스크 공통 규칙', () => {
  for (const [name, mask] of ALL_MASKS) {
    it(`${name}: 멱등이다 — 이미 정리된 값을 다시 먹여도 그대로다`, () => {
      for (const raw of [
        '',
        '1',
        '12',
        '123',
        '1234',
        '12345',
        '123456',
        '1234567',
        '12345678',
        '20231115071320',
        '-12.5',
        '2026/08/14',
        '01:30:00',
        '안녕 abc !!',
      ]) {
        const once = mask.apply(raw);
        expect(mask.apply(once), `${name} / ${JSON.stringify(raw)}`).toBe(once);
      }
    });

    it(`${name}: 끝에 구분자를 붙이지 않는다 (백스페이스가 갇히는 원인)`, () => {
      for (let length = 1; length <= 14; length++) {
        const out = mask.apply('1'.repeat(length));
        expect(/[-:. ]$/.test(out), `${name} / ${length}자리 → ${JSON.stringify(out)}`).toBe(false);
      }
    });

    it(`${name}: 마스크가 끼워 넣는 구분자는 캐럿 기준 문자가 아니다`, () => {
      // apply 가 만든 값 안의 문자 중, 원본에 없던 문자(=마스크가 넣은 구분자)는
      // isAnchor 가 false 여야 한다. true 면 재포맷 뒤 캐럿이 한 칸씩 밀린다.
      const digits = '20231115071320';
      const out = mask.apply(digits);
      for (const char of out) {
        if (digits.includes(char)) continue;
        expect(mask.isAnchor(char), `${name} / 넣은 구분자 ${JSON.stringify(char)}`).toBe(false);
      }
    });

    it(`${name}: 한 글자씩 치는 것과 통째로 붙여넣는 것이 같은 값이 된다`, () => {
      for (const keys of ['20231115071320', '013000', '-125', '12']) {
        expect(typeInto(mask, keys), `${name} / ${keys}`).toBe(mask.apply(keys));
      }
    });
  }
});

describe('DATE_MASK', () => {
  const apply = (raw: string): string => DATE_MASK.apply(raw);

  it('숫자만 친 값에 구분자를 넣는다', () => {
    expect(apply('20260814')).toBe('2026-08-14');
  });

  it('붙여넣은 여러 표기를 모두 같은 모양으로 만든다', () => {
    for (const pasted of ['2026-08-14', '20260814', '2026/08/14', '2026.08.14']) {
      expect(apply(pasted), pasted).toBe('2026-08-14');
    }
  });

  it('치는 도중의 부분 입력을 그대로 유지한다', () => {
    expect(apply('2')).toBe('2');
    expect(apply('2026')).toBe('2026');
    expect(apply('20260')).toBe('2026-0');
    expect(apply('202608')).toBe('2026-08');
    expect(apply('2026081')).toBe('2026-08-1');
  });

  it('자리수를 채워도 끝에 구분자를 붙이지 않는다', () => {
    // 붙이면 백스페이스가 지운 자리를 마스크가 되채워 캐럿이 갇힌다.
    expect(apply('2026')).not.toContain('-');
    expect(apply('202608')).toBe('2026-08');
    expect(apply('202608').endsWith('-')).toBe(false);
  });

  it('백스페이스로 되돌아가는 길이 막히지 않는다', () => {
    // '2026-08' 에서 '8' 을 지운 상태를 마스크에 다시 먹인다.
    expect(apply('2026-0')).toBe('2026-0');
    expect(apply('2026-')).toBe('2026');
    expect(apply('2026')).toBe('2026');
  });

  it('숫자가 아닌 것은 전부 버린다', () => {
    expect(apply('안녕하세요')).toBe('');
    expect(apply('20a26b08c14')).toBe('2026-08-14');
  });

  it('여덟 자리를 넘는 숫자는 잘라낸다', () => {
    expect(apply('2026081499')).toBe('2026-08-14');
  });

  it('캐럿 기준 문자는 숫자뿐이다 (구분자를 세면 캐럿이 밀린다)', () => {
    expect(DATE_MASK.isAnchor('0')).toBe(true);
    expect(DATE_MASK.isAnchor('9')).toBe(true);
    expect(DATE_MASK.isAnchor('-')).toBe(false);
  });

  it('가상 키보드는 숫자판이다', () => {
    expect(DATE_MASK.inputMode).toBe('numeric');
  });
});

describe('DATE_TIME_MASK', () => {
  const apply = (raw: string): string => DATE_TIME_MASK.apply(raw);

  it('숫자만 친 값을 YYYY-MM-DD HH:mm:ss 로 만든다', () => {
    expect(apply('20231115071320')).toBe('2023-11-15 07:13:20');
  });

  it('붙여넣은 여러 표기를 모두 같은 모양으로 만든다', () => {
    for (const pasted of [
      '2023-11-15 07:13:20',
      '2023/11/15 07:13:20',
      '20231115 071320',
      '2023-11-15T07:13:20',
      '2023.11.15 07.13.20',
    ]) {
      expect(apply(pasted), pasted).toBe('2023-11-15 07:13:20');
    }
  });

  it('치는 도중의 부분 입력이 자리마다 정확히 자란다', () => {
    expect(apply('2023')).toBe('2023');
    expect(apply('202311')).toBe('2023-11');
    expect(apply('20231115')).toBe('2023-11-15');
    expect(apply('202311150')).toBe('2023-11-15 0');
    expect(apply('2023111507')).toBe('2023-11-15 07');
    expect(apply('20231115071')).toBe('2023-11-15 07:1');
    expect(apply('202311150713')).toBe('2023-11-15 07:13');
    expect(apply('2023111507132')).toBe('2023-11-15 07:13:2');
  });

  it('자리수를 채워도 끝에 구분자(-, 공백, :)를 붙이지 않는다', () => {
    expect(apply('2023')).toBe('2023');
    expect(apply('20231115')).toBe('2023-11-15');
    expect(apply('2023111507')).toBe('2023-11-15 07');
    expect(apply('202311150713')).toBe('2023-11-15 07:13');
  });

  it('열네 자리를 넘는 숫자는 잘라낸다', () => {
    expect(apply('2023111507132099')).toBe('2023-11-15 07:13:20');
  });

  it('숫자가 아닌 것은 전부 버린다', () => {
    expect(apply('어제쯤')).toBe('');
  });

  it('날짜와 시각을 나누는 공백도 캐럿 기준이 아니다', () => {
    expect(DATE_TIME_MASK.isAnchor(' ')).toBe(false);
    expect(DATE_TIME_MASK.isAnchor(':')).toBe(false);
    expect(DATE_TIME_MASK.isAnchor('-')).toBe(false);
    expect(DATE_TIME_MASK.isAnchor('5')).toBe(true);
  });
});

describe('DURATION_MASK (오른쪽부터 채운다)', () => {
  const apply = (raw: string): string => DURATION_MASK.apply(raw);

  it('오른쪽 끝 두 자리가 초, 그 앞 두 자리가 분이다', () => {
    expect(apply('013000')).toBe('01:30:00');
    expect(apply('004530')).toBe('00:45:30');
  });

  it('MM:SS 도 정상 입력이다 — 네 자리는 분:초가 된다', () => {
    // 왼쪽부터 채우는 마스크는 앞 두 자리를 늘 '시' 로 못 박아 이 모양을 못 만든다.
    expect(apply('3000')).toBe('30:00');
    expect(apply('0530')).toBe('05:30');
  });

  it('시는 열려 있다 — 100시간도 표현된다', () => {
    expect(apply('1000000')).toBe('100:00:00');
    expect(apply('12345600')).toBe('1234:56:00');
  });

  it('치는 동안 이미 친 자리의 뜻이 오른쪽으로 밀린다', () => {
    expect(apply('0')).toBe('0');
    expect(apply('01')).toBe('01');
    expect(apply('013')).toBe('0:13');
    expect(apply('0130')).toBe('01:30');
    expect(apply('01300')).toBe('0:13:00');
    expect(apply('013000')).toBe('01:30:00');
  });

  it('한 글자씩 쳐서 01:30:00 에 도달한다 (구분자를 함께 쳐도 된다)', () => {
    expect(typeInto(DURATION_MASK, '01:30:00')).toBe('01:30:00');
    expect(typeInto(DURATION_MASK, '013000')).toBe('01:30:00');
  });

  it('앞이 비는 구분자를 만들지 않는다 — ":30:00" 이 되지 않는다', () => {
    expect(apply('3000').startsWith(':')).toBe(false);
    expect(apply('30')).toBe('30');
    expect(apply('300')).toBe('3:00');
  });

  it('숫자가 아닌 것은 전부 버린다', () => {
    expect(apply('한시간')).toBe('');
    // 남는 숫자는 '13000' 다섯 자리 — 오른쪽부터 초/분을 떼고 남은 '1' 이 시가 된다.
    expect(apply('1h30m00s')).toBe('1:30:00');
    expect(apply('01h30m00s')).toBe('01:30:00');
  });

  it('열 자리를 넘는 숫자는 잘라낸다', () => {
    expect(apply('123456789012345')).toBe('123456:78:90');
  });

  it('캐럿 기준 문자는 숫자뿐이다', () => {
    expect(DURATION_MASK.isAnchor('7')).toBe(true);
    expect(DURATION_MASK.isAnchor(':')).toBe(false);
  });
});

describe('INTEGER_MASK', () => {
  const apply = (raw: string): string => INTEGER_MASK.apply(raw);

  it('숫자는 그대로 둔다', () => {
    expect(apply('20')).toBe('20');
  });

  it('맨 앞의 - 하나는 남긴다', () => {
    expect(apply('-14')).toBe('-14');
    expect(apply('-')).toBe('-');
  });

  it('숫자와 - 가 아닌 것은 전부 버린다', () => {
    expect(apply('abc')).toBe('');
    expect(apply('1a2b3')).toBe('123');
    expect(apply('1.5')).toBe('15');
    expect(apply('1e3')).toBe('13');
  });

  it('- 는 맨 앞에서만 살아남는다', () => {
    expect(apply('5-3')).toBe('53');
    expect(apply('--5')).toBe('-5');
    expect(apply('-5-3')).toBe('-53');
  });

  it('자리 구분 기호가 섞인 값을 순수한 숫자로 정규화한다', () => {
    expect(apply('1,700,000,000')).toBe('1700000000');
    expect(apply('1_700_000_000')).toBe('1700000000');
    expect(apply(' 1 700 000 000 ')).toBe('1700000000');
  });

  it('캐럿 기준 문자는 살아남는 문자 전부다', () => {
    expect(INTEGER_MASK.isAnchor('7')).toBe(true);
    expect(INTEGER_MASK.isAnchor('-')).toBe(true);
    expect(INTEGER_MASK.isAnchor('a')).toBe(false);
    // 버려지는 문자를 기준으로 세면 캐럿이 밀린다.
    expect(INTEGER_MASK.isAnchor('.')).toBe(false);
  });

  it('가상 키보드는 숫자판이다 — 소수점 키를 띄우지 않는다', () => {
    expect(INTEGER_MASK.inputMode).toBe('numeric');
  });
});

describe('DECIMAL_MASK', () => {
  const apply = (raw: string): string => DECIMAL_MASK.apply(raw);

  it('소수점을 남긴다', () => {
    expect(apply('12.5')).toBe('12.5');
    expect(apply('.5')).toBe('.5');
    expect(apply('-12.5')).toBe('-12.5');
  });

  it('치는 도중의 부분 입력을 유지한다 — 끝의 소수점을 지우지 않는다', () => {
    // 지워 버리면 소수점을 찍고 다음 숫자를 칠 수가 없다.
    expect(apply('12.')).toBe('12.');
  });

  it('소수점은 하나만 남긴다', () => {
    expect(apply('1.2.3')).toBe('1.23');
    expect(apply('1..2')).toBe('1.2');
  });

  it('숫자와 -, 소수점이 아닌 것은 전부 버린다', () => {
    expect(apply('12.5 %')).toBe('12.5');
    expect(apply('약 25퍼센트')).toBe('25');
    expect(apply('1e5')).toBe('15');
  });

  it('자리 구분 쉼표를 걷어낸다', () => {
    expect(apply('1,234.5')).toBe('1234.5');
  });

  it('- 는 맨 앞에서만 살아남는다', () => {
    expect(apply('12-5')).toBe('125');
    expect(apply('-12-5')).toBe('-125');
  });

  it('캐럿 기준 문자에 소수점이 포함된다', () => {
    expect(DECIMAL_MASK.isAnchor('.')).toBe(true);
    expect(DECIMAL_MASK.isAnchor('-')).toBe(true);
    expect(DECIMAL_MASK.isAnchor('3')).toBe(true);
    expect(DECIMAL_MASK.isAnchor('%')).toBe(false);
  });

  it('가상 키보드에 소수점 키가 있다', () => {
    expect(DECIMAL_MASK.inputMode).toBe('decimal');
  });

  it('마스크를 통과한 값은 Number() 가 NaN 을 내지 않는다 (숫자의 부분 입력만 예외)', () => {
    for (const raw of ['12.5', '-12.5', '1,234.5', '약 25퍼센트', '0.0001']) {
      expect(Number.isNaN(Number(apply(raw))), raw).toBe(false);
    }
    // 부분 입력 상태는 그대로 통과시킨다 — 계산 층이 한국어 오류로 받는다.
    expect(Number.isNaN(Number(apply('-')))).toBe(true);
    expect(Number.isNaN(Number(apply('.')))).toBe(true);
  });
});
