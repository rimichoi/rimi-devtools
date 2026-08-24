import { describe, it, expect } from 'vitest';
import { generateTotp, secondsRemaining, verifyTotp } from './totp';
import { decodeBase32 } from './logic';

/*
 * 기대값은 RFC 6238 Appendix B 의 공식 테스트 벡터다. 내가 지어낸 값이 아니고,
 * 착수 전에 node:crypto 로 독립 구현해 18개 전부 재현되는 것을 확인했다.
 * 그래서 벡터와 알고리즘이 서로를 뒷받침한다.
 *
 * seed 는 ASCII "12345678901234567890" 을 각 해시 길이에 맞게 반복한 것이고,
 * 아래 Base32 는 그 바이트열을 그대로 옮긴 것이다.
 */
const SEED = {
  'SHA-1': 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  'SHA-256': 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====',
  'SHA-512':
    'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=',
} as const;

/** RFC 6238 표. [시각(초), SHA-1, SHA-256, SHA-512] — 전부 8자리, 주기 30초. */
const RFC_6238: readonly [number, string, string, string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

function secretOf(algorithm: keyof typeof SEED): Uint8Array {
  const result = decodeBase32(SEED[algorithm]);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('generateTotp — RFC 6238 공식 벡터 18개', () => {
  for (const [time, sha1, sha256, sha512] of RFC_6238) {
    it(`t=${time} SHA-1`, async () => {
      expect(await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, time)).toBe(sha1);
    });
    it(`t=${time} SHA-256`, async () => {
      expect(await generateTotp(secretOf('SHA-256'), 'SHA-256', 8, 30, time)).toBe(sha256);
    });
    it(`t=${time} SHA-512`, async () => {
      expect(await generateTotp(secretOf('SHA-512'), 'SHA-512', 8, 30, time)).toBe(sha512);
    });
  }
});

describe('generateTotp — 자릿수와 주기', () => {
  it('6자리는 8자리의 뒤 6자리다', async () => {
    // 같은 카운터에서 mod 10^6 은 mod 10^8 의 뒤 여섯 자리와 같다.
    const eight = await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59);
    const six = await generateTotp(secretOf('SHA-1'), 'SHA-1', 6, 30, 59);
    expect(eight).toBe('94287082');
    expect(six).toBe('287082');
  });

  it('앞자리가 0 이어도 자릿수를 채운다', async () => {
    expect(await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1111111109)).toBe('07081804');
  });

  it('같은 주기 안에서는 같은 코드가 나온다', async () => {
    const a = await generateTotp(secretOf('SHA-1'), 'SHA-1', 6, 30, 1234567890);
    const b = await generateTotp(secretOf('SHA-1'), 'SHA-1', 6, 30, 1234567890 + 29);
    // 1234567890 은 주기 시작(41152263 * 30 = 1234567890)이라 +29 까지 같은 창이다
    expect(b).toBe(a);
  });

  it('주기를 넘기면 코드가 바뀐다', async () => {
    const a = await generateTotp(secretOf('SHA-1'), 'SHA-1', 6, 30, 1234567890);
    const b = await generateTotp(secretOf('SHA-1'), 'SHA-1', 6, 30, 1234567890 + 30);
    expect(b).not.toBe(a);
  });

  it('주기가 60초면 다른 카운터를 쓴다', async () => {
    const thirty = await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59);
    const sixty = await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 60, 59);
    expect(sixty).not.toBe(thirty);
  });
});

describe('secondsRemaining', () => {
  it('주기 시작이면 통째로 남는다', () => {
    expect(secondsRemaining(30, 1234567890)).toBe(30);
  });

  it('1초 지나면 29초 남는다', () => {
    expect(secondsRemaining(30, 1234567891)).toBe(29);
  });

  it('주기 끝 직전이면 1초 남는다', () => {
    expect(secondsRemaining(30, 1234567890 + 29)).toBe(1);
  });

  it('주기가 60초면 60까지 센다', () => {
    expect(secondsRemaining(60, 1234567890)).toBe(30);
    expect(secondsRemaining(60, 1234567860)).toBe(60);
  });
});

describe('verifyTotp — 입력한 코드가 맞는지', () => {
  it('그 순간의 코드는 유효하다', async () => {
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59, '94287082')).toBe(true);
  });

  it('다른 코드는 유효하지 않다', async () => {
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59, '00000000')).toBe(false);
  });

  it('앞뒤 한 주기까지는 받아준다 — 기기 시계가 조금씩 어긋난다', async () => {
    const previous = await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1234567890 - 30);
    const next = await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1234567890 + 30);
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1234567890, previous)).toBe(true);
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1234567890, next)).toBe(true);
  });

  it('두 주기 밖은 받아주지 않는다', async () => {
    const far = await generateTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1234567890 + 60);
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 1234567890, far)).toBe(false);
  });

  it('공백과 하이픈이 섞여 있어도 읽는다 — 앱이 그렇게 보여준다', async () => {
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59, '9428 7082')).toBe(true);
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59, '9428-7082')).toBe(true);
  });

  it('빈 코드는 유효하지 않다', async () => {
    expect(await verifyTotp(secretOf('SHA-1'), 'SHA-1', 8, 30, 59, '')).toBe(false);
  });
});
