import { describe, it, expect } from 'vitest';
import { decodeJwt, base64UrlToBytes, isSymmetricAlg } from './logic';

/*
 * 기대값은 상수에서 가져오지 않고 전부 리터럴로 적는다. 이 프로젝트는 문구를
 * 상수와 상수로 비교해 어떤 구현에서도 통과하는 테스트를 여러 번 머지한 이력이
 * 있다(가장 최근은 Jasypt 태스크).
 *
 * 토큰 벡터는 node:crypto 로 생성하고 실행 검증했다.
 */

// 5.1 HS256, 페이로드에 한글, iat=1700000000 exp=1700003600
const HS256 =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Iu2Zjeq4uOuPmSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.aQGiu-ZTHs_BwR6lFho9PK5PZezSt5yh65zWYeZZwYc';
// 5.4 alg=none, 세 번째 조각이 빈 문자열
const NONE = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJyb290In0.';
// 5.5 nbf=4102444800(2100년), exp=4102448400
const FUTURE_NBF =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwibmJmIjo0MTAyNDQ0ODAwLCJleHAiOjQxMDI0NDg0MDB9.4qFrmZBEKrEVGiD3V9tKTC_K0QPRi-m2XgSmDQg6V-0';
// 5.6 exp 없음
const NO_EXP =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwiaWF0IjoxNzAwMDAwMDAwfQ.MH0-nGAWoF88MzQfjOT0tVzgCjMH0p02wAZBefYD_xE';
// 5.7 키까지 한글인 페이로드 {"이름":"김철수","부서":"개발팀"}
const KOREAN_KEYS =
  'eyJhbGciOiJIUzI1NiJ9.eyLsnbTrpoQiOiLquYDssqDsiJgiLCLrtoDshJwiOiLqsJzrsJztjIAifQ.PadLfKTm6hjvL9MaSJgkoVHrQfIjAu3jKzT96a7nwYg';

/** 성공을 단언하고 decoded 결과를 꺼낸다. 실패면 그 자리에서 테스트를 깬다. */
function decoded(input: string, nowSeconds: number) {
  const result = decodeJwt(input, nowSeconds);
  if (!result.ok) throw new Error(`디코드가 실패했다: ${result.error}`);
  if (result.value.kind !== 'decoded') throw new Error(`decoded 가 아니라 ${result.value.kind} 였다`);
  return result.value;
}

function messages(input: string, nowSeconds: number): string[] {
  return decoded(input, nowSeconds).warnings.map((w) => w.message);
}

describe('base64UrlToBytes', () => {
  it('base64url 전용 문자 - 와 _ 를 표준 base64 의 + 와 / 로 되돌린다', () => {
    // 0xfb 0xff 0xbe → 표준 base64 "+/++", base64url "-_--"
    const result = base64UrlToBytes('-_--');
    if (!result.ok) throw new Error(result.error);
    expect(Array.from(result.value)).toEqual([0xfb, 0xff, 0xbe]);
  });

  it('패딩이 없는 입력에 = 를 채워 넣는다', () => {
    const result = base64UrlToBytes('QQ');
    if (!result.ok) throw new Error(result.error);
    expect(Array.from(result.value)).toEqual([0x41]);
  });

  it('base64url 이 아닌 문자가 있으면 오류다', () => {
    expect(base64UrlToBytes('ab*c').ok).toBe(false);
  });

  it('표준 base64 의 + 와 / 는 base64url 이 아니므로 거부한다', () => {
    expect(base64UrlToBytes('a+b/c').ok).toBe(false);
  });
});

describe('isSymmetricAlg', () => {
  it('HS256 / HS384 / HS512 만 참이다', () => {
    expect(isSymmetricAlg('HS256')).toBe(true);
    expect(isSymmetricAlg('HS384')).toBe(true);
    expect(isSymmetricAlg('HS512')).toBe(true);
    expect(isSymmetricAlg('RS256')).toBe(false);
    expect(isSymmetricAlg('ES256')).toBe(false);
    expect(isSymmetricAlg('none')).toBe(false);
    expect(isSymmetricAlg(null)).toBe(false);
  });
});

describe('decodeJwt — 구조', () => {
  it('빈 입력은 오류가 아니라 빈 결과다', () => {
    const result = decodeJwt('', 1700000000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe('empty');
  });

  it('공백만 있는 입력도 빈 결과다', () => {
    const result = decodeJwt('   \n  ', 1700000000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe('empty');
  });

  it('Bearer 접두사를 떼고 처리한다', () => {
    const value = decoded(`Bearer ${HS256}`, 1700000000);
    expect(value.headerText).toBe('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
  });

  it('앞뒤 공백을 잘라낸다', () => {
    expect(decoded(`  ${HS256}  `, 1700000000).alg).toBe('HS256');
  });

  it('점이 없는 문자열은 오류다', () => {
    expect(decodeJwt('abc', 1700000000).ok).toBe(false);
  });

  it('조각이 5개면 JWE 로 알린다 — 오류가 아니다', () => {
    const result = decodeJwt('a.b.c.d.e', 1700000000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe('jwe');
  });

  it('조각이 4개면 오류다', () => {
    expect(decodeJwt('a.b.c.d', 1700000000).ok).toBe(false);
  });

  it('헤더가 JSON 이 아니면 오류다', () => {
    // "notjson" 을 base64url 로 적은 것
    expect(decodeJwt('bm90anNvbg.eyJhIjoxfQ.x', 1700000000).ok).toBe(false);
  });
});

describe('decodeJwt — 헤더와 페이로드', () => {
  it('헤더와 페이로드를 보기 좋게 정렬한 JSON 으로 돌려준다', () => {
    const value = decoded(HS256, 1700000000);
    expect(value.headerText).toBe('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
    expect(value.payloadText).toBe(
      '{\n  "sub": "1234567890",\n  "name": "홍길동",\n  "iat": 1700000000,\n  "exp": 1700003600\n}',
    );
  });

  it('키까지 한글인 페이로드를 UTF-8 로 정확히 읽는다', () => {
    const value = decoded(KOREAN_KEYS, 1700000000);
    expect(value.payloadText).toBe('{\n  "이름": "김철수",\n  "부서": "개발팀"\n}');
  });

  it('페이로드가 JSON 이 아니면 오류가 아니라 원문을 그대로 보여주고 알린다', () => {
    // 페이로드 조각이 "hello" (JSON 아님)
    const value = decoded('eyJhbGciOiJIUzI1NiJ9.aGVsbG8.x', 1700000000);
    expect(value.payloadIsJson).toBe(false);
    expect(value.payloadText).toBe('hello');
    expect(value.payloadNote).toBe('페이로드가 JSON 이 아닙니다.');
  });

  it('헤더가 UTF-8 로 깨져 있으면 대체 문자로 통과시키지 않고 오류를 낸다', () => {
    // 0xff 는 단독으로 올 수 없는 바이트다. base64url 로 "_w"
    expect(decodeJwt('_w.eyJhIjoxfQ.x', 1700000000).ok).toBe(false);
  });

  it('서명 조각이 base64url 로 안 풀려도 헤더와 페이로드는 보여준다', () => {
    const value = decoded('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.**', 1700000000);
    expect(value.payloadText).toBe('{\n  "sub": "x"\n}');
    expect(value.signatureError).toBe('서명 조각이 base64url 형식이 아닙니다.');
  });
});

describe('decodeJwt — 시간 클레임', () => {
  it('exp 를 초 단위로 읽는다 — 밀리초로 읽지 않는다', () => {
    // exp=1700003600 초 = 2023-11-14 23:13:20 UTC.
    // 밀리초로 읽으면 1970-01-20 이 된다.
    const row = decoded(HS256, 1700000000).timeRows.find((r) => r.claim === 'exp');
    expect(row?.value).toContain('UTC 2023-11-14 23:13:20');
    expect(row?.value).toContain('KST 2023-11-15 08:13:20');
  });

  it('iat 도 초 단위로 읽는다', () => {
    const row = decoded(HS256, 1700000000).timeRows.find((r) => r.claim === 'iat');
    expect(row?.value).toContain('UTC 2023-11-14 22:13:20');
  });

  it('exp 가 과거면 상대 시간을 "…전에 만료됨" 으로 말한다', () => {
    // now = exp + 3600 초
    const row = decoded(HS256, 1700007200).timeRows.find((r) => r.claim === 'exp');
    expect(row?.value).toContain('1시간 전에 만료됨');
  });

  it('exp 가 미래면 상대 시간을 "…뒤 만료" 로 말한다', () => {
    // now = exp - 7200 초
    const row = decoded(HS256, 1699996400).timeRows.find((r) => r.claim === 'exp');
    expect(row?.value).toContain('2시간 뒤 만료');
  });

  it('시간 클레임이 숫자가 아니면 시각으로 해석하지 않는다', () => {
    // {"exp":"soon"} 을 담은 토큰
    const value = decoded('eyJhbGciOiJIUzI1NiJ9.eyJleHAiOiJzb29uIn0.x', 1700000000);
    const row = value.timeRows.find((r) => r.claim === 'exp');
    expect(row?.value).toBe('숫자가 아닙니다: "soon"');
  });

  it('없는 클레임은 행을 만들지 않는다', () => {
    expect(decoded(NO_EXP, 1700000000).timeRows.map((r) => r.claim)).toEqual(['iat']);
  });
});

describe('decodeJwt — 경고', () => {
  it('alg 가 none 이면 위험 경고를 낸다', () => {
    const value = decoded(NONE, 1700000000);
    const warning = value.warnings.find((w) => w.message.startsWith('alg 가 none'));
    expect(warning?.message).toBe(
      'alg 가 none 입니다. 서명이 없어 내용을 누구나 바꿔 넣을 수 있는 토큰입니다.',
    );
    expect(warning?.severity).toBe('danger');
  });

  it('alg 는 대소문자를 가리지 않고 none 으로 본다', () => {
    // {"alg":"NONE"} 헤더
    expect(messages('eyJhbGciOiJOT05FIn0.eyJzdWIiOiJhIn0.', 1700000000)).toContain(
      'alg 가 none 입니다. 서명이 없어 내용을 누구나 바꿔 넣을 수 있는 토큰입니다.',
    );
  });

  it('서명이 비었는데 alg 가 none 이 아니면 떼어낸 토큰일 수 있다고 경고한다', () => {
    expect(messages('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.', 1700000000)).toContain(
      '서명이 비어 있는데 헤더는 HS256 로 서명됐다고 말합니다. 서명을 떼어낸 토큰일 수 있습니다.',
    );
  });

  it('exp 가 지났으면 만료 경고를 낸다', () => {
    expect(messages(HS256, 1700007200)).toContain('이미 만료된 토큰입니다.');
  });

  it('exp 가 아직이면 만료 경고를 내지 않는다', () => {
    expect(messages(HS256, 1699996400)).not.toContain('이미 만료된 토큰입니다.');
  });

  it('nbf 가 미래면 아직 유효하지 않다고 경고한다', () => {
    expect(messages(FUTURE_NBF, 1700000000)).toContain('아직 유효하지 않은 토큰입니다(nbf 가 미래).');
  });

  it('exp 가 없으면 만료되지 않는 토큰이라고 주의를 준다', () => {
    const value = decoded(NO_EXP, 1700000000);
    const warning = value.warnings.find((w) => w.message.startsWith('exp 가 없습니다'));
    expect(warning?.message).toBe('exp 가 없습니다 — 만료되지 않는 토큰입니다.');
    expect(warning?.severity).toBe('caution');
  });

  it('RS 계열이면 이 도구가 검증하지 않는다고 명시적으로 알린다', () => {
    // {"alg":"RS256"} 헤더
    expect(messages('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIn0.zzz', 1700000000)).toContain(
      '이 도구는 대칭키(HS256/384/512) 서명만 검증합니다. RS256 는 검증하지 않습니다.',
    );
  });

  it('ES 계열도 같은 안내를 받는다', () => {
    // {"alg":"ES384"} 헤더
    expect(messages('eyJhbGciOiJFUzM4NCJ9.eyJzdWIiOiJhIn0.zzz', 1700000000)).toContain(
      '이 도구는 대칭키(HS256/384/512) 서명만 검증합니다. ES384 는 검증하지 않습니다.',
    );
  });

  it('시간 값이 10^11 을 넘으면 밀리초일 수 있다고 주의만 준다 — 해석은 바꾸지 않는다', () => {
    // {"exp":1700000000000} — 밀리초로 넣은 값
    const value = decoded('eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3MDAwMDAwMDAwMDB9.x', 1700000000);
    expect(value.warnings.map((w) => w.message)).toContain(
      'exp 값이 너무 큽니다 — 초가 아니라 밀리초로 넣은 값일 수 있습니다.',
    );
    // 해석을 바꾸지 않았다는 증거: 여전히 초로 읽어 서기 55000년대가 나온다
    const row = value.timeRows.find((r) => r.claim === 'exp');
    expect(row?.value).toContain('UTC 55840-');
  });

  it('정상 토큰(유효기간 안)에는 위험 경고가 없다', () => {
    expect(decoded(HS256, 1699996400).warnings.filter((w) => w.severity === 'danger')).toEqual([]);
  });
});
