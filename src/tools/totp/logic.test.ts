import { describe, it, expect } from 'vitest';
import {
  buildOtpauthUri,
  configWarnings,
  decodeBase32,
  encodeBase32,
  parseOtpauthUri,
  type TotpConfig,
} from './logic';

/*
 * 기대값은 리터럴로 적는다. Base32 기대값은 내가 지어낸 것이 아니라 RFC 4648
 * 10절에 실린 공식 테스트 벡터이고, 별도로 node 로 계산해 대조했다.
 */

const BASE_CONFIG: TotpConfig = {
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  issuer: '다우오피스',
  account: 'rimichoi@daou.co.kr',
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
};

function decoded(text: string): number[] {
  const result = decodeBase32(text);
  if (!result.ok) throw new Error(`디코드 실패: ${result.error}`);
  return Array.from(result.value);
}

function ascii(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

describe('decodeBase32 — RFC 4648 공식 벡터', () => {
  it('빈 문자열', () => {
    expect(decoded('')).toEqual([]);
  });

  it('MY====== 는 "f" 다', () => {
    expect(decoded('MY======')).toEqual(ascii('f'));
  });

  it('MZXQ==== 는 "fo" 다', () => {
    expect(decoded('MZXQ====')).toEqual(ascii('fo'));
  });

  it('MZXW6=== 는 "foo" 다', () => {
    expect(decoded('MZXW6===')).toEqual(ascii('foo'));
  });

  it('MZXW6YQ= 는 "foob" 다', () => {
    expect(decoded('MZXW6YQ=')).toEqual(ascii('foob'));
  });

  it('MZXW6YTB 는 "fooba" 다', () => {
    expect(decoded('MZXW6YTB')).toEqual(ascii('fooba'));
  });

  it('MZXW6YTBOI====== 는 "foobar" 다', () => {
    expect(decoded('MZXW6YTBOI======')).toEqual(ascii('foobar'));
  });
});

describe('decodeBase32 — 사람이 실제로 붙여넣는 모양', () => {
  it('패딩이 없어도 읽는다 — 인증 앱 화면에는 = 가 안 붙어 나온다', () => {
    expect(decoded('MZXW6YTBOI')).toEqual(ascii('foobar'));
  });

  it('소문자를 읽는다', () => {
    expect(decoded('mzxw6ytboi')).toEqual(ascii('foobar'));
  });

  it('네 글자씩 띄어 쓴 것을 읽는다 — 화면에 그렇게 표시된다', () => {
    expect(decoded('MZXW 6YTB OI')).toEqual(ascii('foobar'));
  });

  it('하이픈으로 나눈 것도 읽는다', () => {
    expect(decoded('MZXW-6YTB-OI')).toEqual(ascii('foobar'));
  });

  it('Base32 에 없는 글자는 오류다 — 0 1 8 9 는 쓰지 않는다', () => {
    expect(decodeBase32('MZXW0YTB').ok).toBe(false);
    expect(decodeBase32('MZXW1YTB').ok).toBe(false);
    expect(decodeBase32('MZXW8YTB').ok).toBe(false);
  });

  it('Base64 를 붙여넣으면 오류다 — 소문자를 대문자로 접어도 + / 는 없다', () => {
    expect(decodeBase32('ab+/cd').ok).toBe(false);
  });

  it('길이가 맞지 않으면 오류다', () => {
    // Base32 는 5비트씩이라 8글자 그룹에서 1, 3, 6 글자만 남는 일은 없다
    expect(decodeBase32('M').ok).toBe(false);
    expect(decodeBase32('MZX').ok).toBe(false);
  });

  /*
   * 길이는 맞지만 마지막 글자의 남는 비트가 0 이 아닌 경우. 이 검사가 없으면
   * 조용히 디코딩돼 "그럴듯한 엉뚱한 코드" 가 나온다 — 이 도구가 막겠다고
   * 선언한 실패 그 자체다. 앞의 길이 검사만으로는 잡히지 않는다.
   */
  it('자투리 비트가 0 이 아니면 오류다', () => {
    // 자투리가 생기는 길이는 2(2비트) · 4(4비트) · 5(1비트) · 7(3비트) 이다.
    // 8글자는 정확히 5바이트라 자투리가 없다.
    expect(decodeBase32('MB').ok).toBe(false); // 남는 2비트가 1
    expect(decodeBase32('MZXX').ok).toBe(false); // 남는 4비트가 7
    expect(decodeBase32('MZXW7').ok).toBe(false); // 남는 1비트가 1
    expect(decodeBase32('MZXW6YT').ok).toBe(false); // 남는 3비트가 3
  });

  it('같은 길이라도 자투리가 0 이면 통과한다 — 길이만으로 거절하지 않는다', () => {
    // 위와 길이가 같은 짝들이다. 길이 검사만 있으면 이쪽도 함께 거절된다.
    expect(decodeBase32('MA').ok).toBe(true);
    expect(decoded('MZXQ')).toEqual(ascii('fo'));
    expect(decodeBase32('MZXW6').ok).toBe(true);
    expect(decoded('MZXW6YQ')).toEqual(ascii('foob'));
  });

  it('패딩이 중간에 오면 그렇다고 말한다', () => {
    const result = decodeBase32('MZ=XW');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('패딩(=) 은 맨 뒤에만 올 수 있습니다.');
  });
});

describe('encodeBase32 — 왕복', () => {
  it('RFC 4648 벡터를 그대로 다시 만든다', () => {
    expect(encodeBase32(new TextEncoder().encode('f'))).toBe('MY======');
    expect(encodeBase32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI======');
    expect(encodeBase32(new Uint8Array(0))).toBe('');
  });

  it('임의의 바이트를 넣었다 빼도 같다', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64, 32, 16, 8]);
    expect(decoded(encodeBase32(bytes))).toEqual(Array.from(bytes));
  });
});

describe('buildOtpauthUri', () => {
  function built(config: Partial<TotpConfig> = {}): string {
    const result = buildOtpauthUri({ ...BASE_CONFIG, ...config });
    if (!result.ok) throw new Error(`URI 생성 실패: ${result.error}`);
    return result.value;
  }

  it('발급자와 계정을 라벨에 콜론으로 잇는다', () => {
    expect(built()).toContain('otpauth://totp/%EB%8B%A4%EC%9A%B0%EC%98%A4%ED%94%BC%EC%8A%A4:rimichoi%40daou.co.kr?');
  });

  it('발급자를 쿼리에도 넣는다 — 라벨만으로는 못 읽는 앱이 있다', () => {
    expect(built()).toContain('issuer=%EB%8B%A4%EC%9A%B0%EC%98%A4%ED%94%BC%EC%8A%A4');
  });

  it('비밀키는 패딩 없이 대문자로 넣는다', () => {
    expect(built({ secret: 'mzxw 6ytb oi' })).toContain('secret=MZXW6YTBOI');
  });

  it('알고리즘 이름에 하이픈을 넣지 않는다 — URI 규격은 SHA1 이지 SHA-1 이 아니다', () => {
    expect(built({ algorithm: 'SHA-1' })).toContain('algorithm=SHA1');
    expect(built({ algorithm: 'SHA-256' })).toContain('algorithm=SHA256');
    expect(built({ algorithm: 'SHA-512' })).toContain('algorithm=SHA512');
    expect(built()).not.toContain('SHA-1');
  });

  it('자릿수와 주기를 넣는다', () => {
    expect(built({ digits: 8, period: 60 })).toContain('digits=8');
    expect(built({ digits: 8, period: 60 })).toContain('period=60');
  });

  it('발급자가 비어 있으면 라벨에 콜론을 넣지 않는다', () => {
    expect(built({ issuer: '' })).toContain('otpauth://totp/rimichoi%40daou.co.kr?');
  });

  it('계정에 콜론이 들어 있어도 라벨 구분자와 섞이지 않는다', () => {
    // 콜론이 퍼센트 인코딩되어야 앱이 발급자 경계를 잘못 찾지 않는다
    expect(built({ account: 'a:b', issuer: '' })).toContain('otpauth://totp/a%3Ab?');
  });

  it('계정이 비어 있으면 오류다', () => {
    expect(buildOtpauthUri({ ...BASE_CONFIG, account: '  ' }).ok).toBe(false);
  });

  it('비밀키가 비어 있으면 오류다', () => {
    expect(buildOtpauthUri({ ...BASE_CONFIG, secret: '' }).ok).toBe(false);
  });

  it('비밀키가 Base32 가 아니면 오류다', () => {
    expect(buildOtpauthUri({ ...BASE_CONFIG, secret: 'not-base32!' }).ok).toBe(false);
  });
});

describe('parseOtpauthUri — 기존 URI 를 붙여넣는 경우', () => {
  function parsed(uri: string): TotpConfig {
    const result = parseOtpauthUri(uri);
    if (!result.ok) throw new Error(`파싱 실패: ${result.error}`);
    return result.value;
  }

  it('발급자와 계정을 라벨에서 갈라낸다', () => {
    const config = parsed('otpauth://totp/GitHub:rimi?secret=MZXW6YTBOI&issuer=GitHub');
    expect(config.issuer).toBe('GitHub');
    expect(config.account).toBe('rimi');
    expect(config.secret).toBe('MZXW6YTBOI');
  });

  it('퍼센트 인코딩을 푼다', () => {
    const config = parsed('otpauth://totp/%EB%8B%A4%EC%9A%B0:a%40b.com?secret=MZXW6YTBOI');
    expect(config.issuer).toBe('다우');
    expect(config.account).toBe('a@b.com');
  });

  it('쿼리의 issuer 가 라벨보다 우선한다', () => {
    const config = parsed('otpauth://totp/Old:rimi?secret=MZXW6YTBOI&issuer=New');
    expect(config.issuer).toBe('New');
  });

  it('SHA256 을 내부 표기 SHA-256 으로 되돌린다', () => {
    expect(parsed('otpauth://totp/a?secret=MZXW6YTBOI&algorithm=SHA256').algorithm).toBe('SHA-256');
  });

  it('빠진 값은 기본값으로 채운다', () => {
    const config = parsed('otpauth://totp/a?secret=MZXW6YTBOI');
    expect(config.algorithm).toBe('SHA-1');
    expect(config.digits).toBe(6);
    expect(config.period).toBe(30);
  });

  it('hotp 는 지원하지 않는다고 말한다', () => {
    const result = parseOtpauthUri('otpauth://hotp/a?secret=MZXW6YTBOI&counter=0');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('시간 기반(totp)만 지원합니다. 이 URI 는 hotp 입니다.');
  });

  it('secret 이 없으면 오류다', () => {
    expect(parseOtpauthUri('otpauth://totp/a?issuer=b').ok).toBe(false);
  });

  it('otpauth 가 아니면 오류다', () => {
    expect(parseOtpauthUri('https://example.com').ok).toBe(false);
  });

  it('만든 URI 를 다시 읽으면 같은 설정이 나온다', () => {
    const uri = buildOtpauthUri(BASE_CONFIG);
    if (!uri.ok) throw new Error(uri.error);
    const back = parsed(uri.value);
    expect(back.issuer).toBe(BASE_CONFIG.issuer);
    expect(back.account).toBe(BASE_CONFIG.account);
    expect(back.algorithm).toBe(BASE_CONFIG.algorithm);
    expect(back.digits).toBe(BASE_CONFIG.digits);
    expect(back.period).toBe(BASE_CONFIG.period);
  });
});

describe('configWarnings — 조용히 안 되는 조합을 알린다', () => {
  it('SHA-1 · 6자리 · 30초에는 경고가 없다', () => {
    expect(configWarnings(BASE_CONFIG)).toEqual([]);
  });

  it('SHA-256 은 무시하는 앱이 있다고 알린다', () => {
    expect(configWarnings({ ...BASE_CONFIG, algorithm: 'SHA-256' }).map((w) => w.message)).toContain(
      'Google Authenticator 를 비롯한 여러 앱은 algorithm 을 무시하고 SHA-1 로 계산합니다. 코드가 맞지 않으면 이것부터 의심하세요.',
    );
  });

  it('8자리도 같은 이유로 알린다', () => {
    expect(configWarnings({ ...BASE_CONFIG, digits: 8 }).map((w) => w.message)).toContain(
      'Google Authenticator 를 비롯한 여러 앱은 digits 를 무시하고 6자리로 계산합니다.',
    );
  });

  it('30초가 아닌 주기도 알린다', () => {
    expect(configWarnings({ ...BASE_CONFIG, period: 60 }).map((w) => w.message)).toContain(
      'Google Authenticator 를 비롯한 여러 앱은 period 를 무시하고 30초로 계산합니다.',
    );
  });

  it('비밀키가 짧으면 알린다', () => {
    // 'MZXW6YTBOI' 는 6바이트다. RFC 4226 은 최소 16바이트를 권한다.
    expect(configWarnings({ ...BASE_CONFIG, secret: 'MZXW6YTBOI' }).map((w) => w.message)).toContain(
      '비밀키가 6바이트입니다. RFC 4226 은 16바이트 이상을 권합니다.',
    );
  });
});
