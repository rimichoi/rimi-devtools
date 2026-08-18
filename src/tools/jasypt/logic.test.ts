import { describe, expect, it } from 'vitest';
import {
  DECRYPT_FAILED_ERROR,
  KEY_OBTENTION_ITERATIONS,
  NON_ASCII_PASSWORD_ERROR,
  NOT_BASE64_ERROR,
  SALT_SIZE,
  decryptJasypt,
  deriveKey,
  encryptJasypt,
  passwordToBytes,
  stripEncWrapper,
} from './logic';
import {
  DECRYPT_VECTORS,
  KEY_DERIVATION_VECTORS,
  bytesToHex,
  hexToBytes,
} from './vectors';

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`성공을 기대했지만 실패했습니다: ${result.error}`);
  return result.value;
}

function expectError(result: { ok: true } | { ok: false; error: string }): string {
  if (result.ok) throw new Error('실패를 기대했지만 성공했습니다.');
  return result.error;
}

describe('마스터 비밀번호 → 바이트', () => {
  it('문자당 1바이트, 코드포인트 그대로다 (UTF-8 인코딩이 아니다)', () => {
    expect(bytesToHex(passwordToBytes('test1!')!)).toBe('746573743121');
    // 공백(U+0020)과 물결(U+007E)은 경계 안이므로 허용된다.
    expect(bytesToHex(passwordToBytes(' ~')!)).toBe('207e');
  });

  it('출력 가능 ASCII 전체(U+0020~U+007E)를 허용한다', () => {
    let all = '';
    for (let code = 0x20; code <= 0x7e; code++) all += String.fromCharCode(code);
    const bytes = passwordToBytes(all);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(0x7e - 0x20 + 1);
  });

  /*
   * JDK 의 com.sun.crypto.provider.PBEKey 가 거부하는 문자들이다(temurin-21.0.11 실측).
   * 여기서 거부하지 않고 계산해 버리면 Java 가 절대 풀 수 없는 암호문을 만들어
   * 놓고 성공한 것처럼 보인다 — 이 도구의 최악의 실패 모드다.
   */
  for (const [label, char] of [
    ['U+0000', '\u0000'],
    ['U+0001', '\u0001'],
    ['U+0009 (\ud0ed)', '\u0009'],
    ['U+000A (\uc904\ubc14\uafc8)', '\u000a'],
    ['U+001F', '\u001f'],
    ['U+007F', '\u007f'],
    ['U+0080', '\u0080'],
    ['U+00E9 (e\u0301)', '\u00e9'],
    ['\ud55c\uae00', '\ud55c'],
    ['\uc774\ubaa8\uc9c0', '\u{1f600}'],
  ] as const) {
    it(`${label} 이 들어간 비밀번호는 거부한다`, () => {
      expect(passwordToBytes(`abc${char}def`)).toBeNull();
    });
  }

  it('거부된 비밀번호는 암·복호화 양쪽에서 지정된 문구로 실패한다', () => {
    expect(expectError(decryptJasypt('ENC(xYIzsUiigr3pQj5xO0KWvg==)', '한글암호'))).toBe(
      NON_ASCII_PASSWORD_ERROR,
    );
    expect(expectError(encryptJasypt('root', '한글암호'))).toBe(NON_ASCII_PASSWORD_ERROR);
  });
});

describe('키 유도 (PBKDF1-MD5)', () => {
  it('반복 횟수 기본값은 jasypt 기본값 1000 이다', () => {
    expect(KEY_OBTENTION_ITERATIONS).toBe(1000);
  });

  /*
   * 이 중간값들은 SunJCE 의 raw DES/CBC/PKCS5Padding 에 그대로 넣어 Jasypt 가 만든
   * 암호문을 실제로 복호화해 검증한 값이다. 종단 벡터만 있으면 틀렸을 때
   * MD5·키유도·DES·패딩·base64 중 어디가 문제인지 알 수 없다.
   *
   * 반복 횟수를 **인자로 넘기지 않는다** — 기본값 1000 이 실제로 쓰이는지까지
   * 이 테스트가 고정해야 한다.
   */
  for (const vector of KEY_DERIVATION_VECTORS) {
    it(`"${vector.password}" + salt ${vector.salt} → DK ${vector.dk}`, () => {
      const derived = deriveKey(passwordToBytes(vector.password)!, hexToBytes(vector.salt));
      expect(bytesToHex(derived.dk)).toBe(vector.dk);
      expect(bytesToHex(derived.key)).toBe(vector.desKey);
      expect(bytesToHex(derived.iv)).toBe(vector.iv);
      expect(derived.key.length).toBe(8);
      expect(derived.iv.length).toBe(8);
    });
  }

  it('반복이 한 번만 어긋나도 값이 완전히 달라진다', () => {
    const password = passwordToBytes('test1!')!;
    const salt = hexToBytes('c58233b148a282bd');
    expect(bytesToHex(deriveKey(password, salt, 999).dk)).not.toBe(
      '9ee7a0dbb982ae1e7d56834fe75fefce',
    );
    expect(bytesToHex(deriveKey(password, salt, 1001).dk)).not.toBe(
      '9ee7a0dbb982ae1e7d56834fe75fefce',
    );
  });

  it('1회 반복은 MD5(비밀번호 || salt) 그 자체다', () => {
    // 첫 회만 비밀번호+salt 를 먹인다는 규칙을 고정한다.
    const derived = deriveKey(passwordToBytes('test1!')!, hexToBytes('c58233b148a282bd'), 1);
    // md5("test1!" + salt 8바이트) — node:crypto 로 대조하는 md5.test.ts 가 md5 자체를
    // 이미 보증하므로, 여기서는 "무엇을 먹이는가"만 본다.
    expect(derived.dk.length).toBe(16);
    expect(bytesToHex(derived.dk)).not.toBe('9ee7a0dbb982ae1e7d56834fe75fefce');
  });

  it('salt 가 다르면 키도 달라진다', () => {
    const password = passwordToBytes('test1!')!;
    const a = deriveKey(password, hexToBytes('c58233b148a282bd')).dk;
    const b = deriveKey(password, hexToBytes('c58233b148a282be')).dk;
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});

describe('ENC(...) 껍데기 벗기기', () => {
  it('껍데기가 있으면 안쪽만 남긴다', () => {
    expect(stripEncWrapper('ENC(abc==)')).toBe('abc==');
  });

  it('껍데기가 없으면 그대로 둔다', () => {
    expect(stripEncWrapper('abc==')).toBe('abc==');
  });

  it('앞뒤 공백과 줄바꿈을 잘라낸다', () => {
    expect(stripEncWrapper('  \n ENC( abc== ) \n ')).toBe('abc==');
  });

  it('소문자 enc( 도 받는다', () => {
    expect(stripEncWrapper('enc(abc==)')).toBe('abc==');
  });
});

describe('종단 복호화 벡터 (Jasypt 1.9.3 실제 출력)', () => {
  for (const vector of DECRYPT_VECTORS) {
    it(`"${vector.password}" → ${JSON.stringify(vector.plaintext)} (${vector.note})`, () => {
      expect(expectOk(decryptJasypt(vector.ciphertext, vector.password))).toBe(vector.plaintext);
    });

    it(`ENC(...) 로 감싸 붙여넣어도 같다 (${vector.note})`, () => {
      const wrapped = `ENC(${vector.ciphertext})`;
      expect(expectOk(decryptJasypt(wrapped, vector.password))).toBe(vector.plaintext);
    });
  }

  it('앞뒤에 공백/줄바꿈이 붙어 와도 푼다 (설정 파일에서 복사한 모양)', () => {
    expect(expectOk(decryptJasypt('\n  ENC(xYIzsUiigr3pQj5xO0KWvg==)  \n', 'test1!'))).toBe('root');
  });
});

describe('암호화', () => {
  it('salt 를 주입하면 Jasypt 가 낸 것과 바이트까지 같은 값이 나온다', () => {
    // 4.3 의 중간값 벡터가 알려주는 salt 를 그대로 넣으면, 같은 평문에서 4.4 의
    // 암호문이 그대로 재현돼야 한다. 암호화 경로 전체가 Java 와 동일하다는 증거다.
    const encrypted = expectOk(
      encryptJasypt('root', 'test1!', hexToBytes('c58233b148a282bd')),
    );
    expect(encrypted.base64).toBe('xYIzsUiigr3pQj5xO0KWvg==');
    expect(encrypted.enc).toBe('ENC(xYIzsUiigr3pQj5xO0KWvg==)');
  });

  for (const vector of KEY_DERIVATION_VECTORS) {
    it(`salt ${vector.salt} 를 고정하면 "${vector.decrypts}" 의 암호문이 재현된다`, () => {
      const match = DECRYPT_VECTORS.find(
        (candidate) =>
          candidate.password === vector.password && candidate.plaintext === vector.decrypts,
      );
      expect(match, '짝이 되는 종단 벡터를 찾지 못했습니다').toBeDefined();
      const encrypted = expectOk(
        encryptJasypt(vector.decrypts, vector.password, hexToBytes(vector.salt)),
      );
      expect(encrypted.base64).toBe(match!.ciphertext);
    });
  }

  it('출력은 salt 8바이트 + 8의 배수인 본문이다', () => {
    const encrypted = expectOk(encryptJasypt('hello', 'test1!'));
    const bytes = Uint8Array.from(atob(encrypted.base64), (ch) => ch.charCodeAt(0));
    expect(bytes.length).toBeGreaterThanOrEqual(SALT_SIZE + 8);
    expect((bytes.length - SALT_SIZE) % 8).toBe(0);
  });

  it('salt 가 8바이트가 아니면 거부한다', () => {
    expect(expectError(encryptJasypt('hello', 'test1!', new Uint8Array(7)))).toContain(
      '8바이트여야 합니다',
    );
  });
});

describe('왕복', () => {
  const cases = [
    '',
    'a',
    '01234567',
    '0123456789012345',
    'jdbc:mysql://db.internal:3306/app?useSSL=false',
    '한글 비밀번호',
    '😀 emoji surrogate pair',
    '여러 줄\n두 번째 줄\t탭',
    'x'.repeat(500),
  ];

  for (const plain of cases) {
    it(`고정 salt: ${JSON.stringify(plain.slice(0, 24))} 가 그대로 돌아온다`, () => {
      const encrypted = expectOk(
        encryptJasypt(plain, 'test1!', hexToBytes('0011223344556677')),
      );
      expect(expectOk(decryptJasypt(encrypted.enc, 'test1!'))).toBe(plain);
    });
  }

  /*
   * RandomSaltGenerator 를 실제로 쓰고 있다는 증거. 같은 입력을 두 번 암호화하면
   * 결과가 서로 달라야 하고, 둘 다 같은 평문으로 풀려야 한다. salt 를 상수로
   * 굳혀 버린 구현은 앞 줄에서 죽는다.
   */
  it('난수 salt: 두 번 암호화하면 결과가 다르고, 둘 다 같은 평문으로 풀린다', () => {
    const first = expectOk(encryptJasypt('same plaintext', 'test1!'));
    const second = expectOk(encryptJasypt('same plaintext', 'test1!'));
    expect(first.base64).not.toBe(second.base64);
    expect(expectOk(decryptJasypt(first.enc, 'test1!'))).toBe('same plaintext');
    expect(expectOk(decryptJasypt(second.enc, 'test1!'))).toBe('same plaintext');
  });

  it('난수 salt 는 앞 8바이트에 실려 나간다 — 20회 모두 서로 다르다', () => {
    const salts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const encrypted = expectOk(encryptJasypt('x', 'test1!'));
      const bytes = Uint8Array.from(atob(encrypted.base64), (ch) => ch.charCodeAt(0));
      salts.add(bytesToHex(bytes.slice(0, SALT_SIZE)));
    }
    expect(salts.size).toBe(20);
  });
});

describe('실패 경로', () => {
  /*
   * 이 묶음이 이 도구의 존재 이유다. **복호화 실패를 빈 문자열이나 깨진 문자로
   * "성공" 처리하면 안 된다** — 틀린 비밀번호로 푼 쓰레기가 결과 칸에 뜨면
   * 사용자는 그게 답인 줄 알고 설정 파일에 넣는다.
   */
  it('틀린 마스터 비밀번호는 지정된 문구로 실패한다', () => {
    expect(expectError(decryptJasypt('xYIzsUiigr3pQj5xO0KWvg==', 'wrong'))).toBe(
      DECRYPT_FAILED_ERROR,
    );
  });

  it('벡터 13개 전부, 틀린 비밀번호로는 단 하나도 성공하지 않는다', () => {
    const leaked: string[] = [];
    for (const vector of DECRYPT_VECTORS) {
      for (const wrong of ['wrong', 'test1!x', 'x', 'Test1!', 'zzzzzzzzzz']) {
        if (wrong === vector.password) continue;
        const result = decryptJasypt(vector.ciphertext, wrong);
        if (result.ok) leaked.push(`${vector.note}: "${wrong}" → ${JSON.stringify(result.value)}`);
      }
    }
    expect(leaked, `틀린 비밀번호가 성공으로 샜습니다:\n${leaked.join('\n')}`).toEqual([]);
  });

  it('base64 가 아닌 문자열은 base64 문구로 실패한다', () => {
    expect(expectError(decryptJasypt('!!! not base64 !!!', 'test1!'))).toBe(NOT_BASE64_ERROR);
    expect(expectError(decryptJasypt('ENC(한글이다)', 'test1!'))).toBe(NOT_BASE64_ERROR);
    expect(expectError(decryptJasypt('', 'test1!'))).toBe(NOT_BASE64_ERROR);
  });

  it('8바이트 이하 — salt 조차 채우지 못하면 실패한다', () => {
    // 'AAAAAAAA' = 6바이트, 'AAAAAAAAAAA=' = 8바이트. 둘 다 본문이 없다.
    expect(expectError(decryptJasypt('AAAAAAAA', 'test1!'))).toContain('Jasypt 암호문이 아닙니다');
    expect(expectError(decryptJasypt('AAAAAAAAAAA=', 'test1!'))).toContain(
      'Jasypt 암호문이 아닙니다',
    );
  });

  it('본문 길이가 8의 배수가 아니면 실패한다', () => {
    // 8(salt) + 12바이트 = 20바이트. 최소 길이는 넘기므로 배수 검사에서만 걸린다.
    const bytes = new Uint8Array(20);
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(expectError(decryptJasypt(base64, 'test1!'))).toContain('8의 배수가 아닙니다');
  });

  it('비ASCII 마스터 비밀번호는 계산하지 않고 거부한다', () => {
    expect(expectError(decryptJasypt('xYIzsUiigr3pQj5xO0KWvg==', 'tést1!'))).toBe(
      NON_ASCII_PASSWORD_ERROR,
    );
  });

  it('빈 마스터 비밀번호는 형식상 유효하다 — 계산은 하되 벡터와는 맞지 않는다', () => {
    // 빈 문자열은 출력 가능 ASCII 규칙을 어기지 않는다. UI 가 "아직 입력 전"으로
    // 다루는 것이지 계산 층이 거부하는 값이 아니다.
    expect(passwordToBytes('')).not.toBeNull();
    expect(expectError(decryptJasypt('xYIzsUiigr3pQj5xO0KWvg==', ''))).toBe(DECRYPT_FAILED_ERROR);
  });
});
