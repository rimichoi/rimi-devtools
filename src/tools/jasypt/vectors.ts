/**
 * PBEWithMD5AndDES 검증 벡터.
 *
 * ## 출처 (추측한 값이 하나도 없다)
 *
 * - 종단 벡터(`DECRYPT_VECTORS`): **jasypt-1.9.3.jar + temurin-21.0.11** 로 실제
 *   암호화한 출력이다. 설정은 팀이 `~/REPO/BIZ`, `~/REPO/SAL`, `~/REPO/UFIT` 의
 *   설정 파일 9개에서 쓰고 있는 것과 같다:
 *     algorithm = PBEWithMD5AndDES, key-obtention-iterations = 1000,
 *     salt-generator = org.jasypt.salt.RandomSaltGenerator,
 *     string-output-type = base64, iv-generator = org.jasypt.iv.NoIvGenerator,
 *     provider = SunJCE
 * - DES 단일 블록(`DES_BLOCK_VECTORS`): **SunJCE 의 DES/ECB/NoPadding** 실측값.
 * - 키 유도 중간값(`KEY_DERIVATION_VECTORS`): PBKDF1-MD5 1000회를 직접 계산한 뒤,
 *   그 키/IV 를 SunJCE 의 raw `DES/CBC/PKCS5Padding` 에 넣어 **Jasypt 가 만든
 *   암호문을 실제로 복호화**해 확인했다. 즉 "이렇게 계산했다"가 아니라 "이 값이
 *   실제로 동작한다"이다.
 *
 * 재생성 스크립트는 `tools/jasypt-vectors/` 에 있다(커밋 d50dfde). 이 파일은
 * 그 스크립트에 의존하지 않는다 — 값이 여기 박혀 있으므로 CI 에 Java 가 필요 없다.
 *
 * ## 지우지 말 것
 *
 * 표에 있는 줄들은 각각 특정 결함 하나를 잡는다. "정리" 하지 마라:
 *   - DES 표의 `0000000000000000` / `0101010101010101` 두 줄은 결과가 같다.
 *     오타가 아니라 PC-1 이 패리티 비트를 버리는지 보는 줄이다.
 *   - 종단 표의 빈 평문 줄은 "패딩만 있는 블록"을 제대로 벗기는지 보는 유일한 줄이다.
 *   - 종단 표의 `01234567`(정확히 한 블록) 줄은 패딩 블록이 하나 더 붙는지 본다.
 *
 * 이 파일은 테스트만 참조한다(런타임 번들에 들어가지 않는다).
 */

/** 16진 문자열 → 바이트열. 벡터를 그대로 옮겨 적을 수 있게 두는 헬퍼다. */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** 바이트열 → 소문자 16진 문자열. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export interface DesBlockVector {
  /** 16진 8바이트 */
  key: string;
  /** 16진 8바이트 */
  plaintext: string;
  /** 16진 8바이트 */
  ciphertext: string;
  note: string;
}

/** DES/ECB/NoPadding, SunJCE 실측. */
export const DES_BLOCK_VECTORS: readonly DesBlockVector[] = [
  {
    key: '133457799BBCDFF1',
    plaintext: '0123456789ABCDEF',
    ciphertext: '85E813540F0AB405',
    note: '고전 예제 (FIPS 해설서에 나오는 키/평문)',
  },
  {
    key: '0000000000000000',
    plaintext: '0000000000000000',
    ciphertext: '8CA64DE9C1B123A7',
    note: '전부 0',
  },
  {
    key: 'FFFFFFFFFFFFFFFF',
    plaintext: 'FFFFFFFFFFFFFFFF',
    ciphertext: '7359B2163E4EDC58',
    note: '전부 1',
  },
  {
    key: '0101010101010101',
    plaintext: '0000000000000000',
    ciphertext: '8CA64DE9C1B123A7',
    note: '패리티 비트만 다른 키 — 위 전부 0 줄과 결과가 같아야 한다(PC-1 검사)',
  },
  {
    key: '8000000000000000',
    plaintext: '0000000000000000',
    ciphertext: '95A8D72813DAA94D',
    note: '키의 최상위 비트 하나만 1',
  },
  {
    key: '0123456789ABCDEF',
    plaintext: '4E6F772069732074',
    ciphertext: '3FA40E8A984D4815',
    note: '"Now is t" (ASCII 평문)',
  },
];

export interface KeyDerivationVector {
  password: string;
  /** 16진 8바이트 */
  salt: string;
  /** 16진 16바이트 — MD5 1000회의 결과 */
  dk: string;
  /** 16진 8바이트 — DK[0..8] */
  desKey: string;
  /** 16진 8바이트 — DK[8..16] */
  iv: string;
  /** 이 키/IV 로 풀리는 종단 벡터의 평문 */
  decrypts: string;
}

/** PBKDF1-MD5 1000회 중간값. 계층별 디버깅용 — 어디서 틀렸는지 좁힐 수 있다. */
export const KEY_DERIVATION_VECTORS: readonly KeyDerivationVector[] = [
  {
    password: 'test1!',
    salt: 'c58233b148a282bd',
    dk: '9ee7a0dbb982ae1e7d56834fe75fefce',
    desKey: '9ee7a0dbb982ae1e',
    iv: '7d56834fe75fefce',
    decrypts: 'root',
  },
  {
    password: 'mypassword',
    salt: '2c23e5a9db7c9eda',
    dk: '059850e5161e3de3d990035f6c26c6b9',
    desKey: '059850e5161e3de3',
    iv: 'd990035f6c26c6b9',
    decrypts: 'Hello, World!',
  },
  {
    password: 'P@ssw0rd',
    salt: 'eab4b01841c3e183',
    dk: '66c50a308fbd719ab817f6ace361b1a3',
    desKey: '66c50a308fbd719a',
    iv: 'b817f6ace361b1a3',
    decrypts: '한글 비밀번호',
  },
];

export interface JasyptVector {
  password: string;
  /** Jasypt 가 낸 base64: salt(8바이트) || DES-CBC 암호문 */
  ciphertext: string;
  plaintext: string;
  note: string;
}

/** 종단 복호화 벡터 13개 (Jasypt 1.9.3 출력). */
export const DECRYPT_VECTORS: readonly JasyptVector[] = [
  {
    password: 'test1!',
    ciphertext: 'xYIzsUiigr3pQj5xO0KWvg==',
    plaintext: 'root',
    note: '기본',
  },
  {
    password: 'test1!',
    ciphertext: 'Y/lcnjkC31IWWiCW+89hgg==',
    plaintext: '1234',
    note: '숫자',
  },
  {
    password: 'mypassword',
    ciphertext: 'LCPlqdt8ntq9cdukcFzuUDahrciLtaFt',
    plaintext: 'Hello, World!',
    note: '13바이트(블록 배수 아님)',
  },
  {
    password: 'mypassword',
    ciphertext: 'uTTZZg0k781wriEcw2KzfrP0zktRTN/6',
    plaintext: '01234567',
    note: '정확히 한 블록 → 패딩 블록이 하나 더 붙는 경우',
  },
  {
    password: 'mypassword',
    ciphertext: '+zDmWpFmbQeaU+qO4YAgxEGF4PQ1O/8zUsRO+pMrzWk=',
    plaintext: '0123456789012345',
    note: '두 블록',
  },
  {
    password: 'mypassword',
    ciphertext: 'hB015vKBgaVEO/rPIXyaKw==',
    plaintext: '',
    note: '빈 평문 — 패딩만 있는 블록을 벗기는지 보는 유일한 케이스',
  },
  {
    password: 'P@ssw0rd',
    ciphertext: '6rSwGEHD4YPnVK1tj2cyX3vMdXJ738VaXgLQfCrqrGw=',
    plaintext: '한글 비밀번호',
    note: '평문 UTF-8 다국어',
  },
  {
    password: 'P@ssw0rd',
    ciphertext: 'Z8PwWnyvGSMGlKcKEclGgH9Vh95w8lvJI4zzPQ/Tm5JgFi4kr3+5aw==',
    plaintext: '😀 emoji surrogate pair',
    note: '서로게이트 쌍',
  },
  {
    password: 'a',
    ciphertext: 'gXBOv7jTe7tMjd0AcZXoTS5wzaTP9fKYH+oUFJz/BNEnB48uPjLMkQ==',
    plaintext: 'single-char master password',
    note: '1글자 비밀번호',
  },
  {
    password: 'master key with spaces',
    ciphertext: 'bBkPOFiBBqb//mMqXTi6rnozeUgB03Ldcc6Ftc6Cq/xAGRGQRJu6Z+TM27igSxgR',
    plaintext: 'spaces are legal in the password',
    note: '비밀번호 안의 공백(허용됨)',
  },
  {
    password: '0123456789012345678901234567890123456789',
    ciphertext: 'u892IsTQcbQpL/cjTARpx5crAgvT8BpvXJM+rMIlguo=',
    plaintext: 'long master password',
    note: '40자 비밀번호',
  },
  {
    password: "~!@#$%^&*()_+-=[]{}|;':,./<>?",
    ciphertext: '9VMX6phmbs10oqmmByqXDQHwyGmtzr7/UeKOcRqpEN0=',
    plaintext: 'punctuation password',
    note: '특수문자 비밀번호',
  },
  {
    password: 'jdbc-secret',
    ciphertext: 'pqY1ZixuXCqWMaGzuIGFqI25uPx/WEFVYHDfNteoBqGiu4vTUbH3POwjlfiONcWzwOp3tv1zeDM=',
    plaintext: 'jdbc:mysql://db.internal:3306/app?useSSL=false',
    note: '실제 설정값 모양',
  },
];
