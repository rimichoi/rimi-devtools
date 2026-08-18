import type { ToolResult } from '../../types';
import { DES_BLOCK_SIZE, desCbcDecrypt, desCbcEncrypt } from './des';
import { md5 } from './md5';

/**
 * Jasypt `PBEWithMD5AndDES` — PKCS#5 v1.5 의 PBES1.
 *
 * 이 파일은 DOM 을 만지지 않는다. 예외는 `crypto.getRandomValues` 하나이고,
 * 그건 Node 와 브라우저 양쪽에 있는 표준 API 다. 테스트에서 salt 를 고정할 수
 * 있게 `encryptJasypt` 가 salt 를 선택적 인자로 받는다(기본값은 난수).
 *
 * 절차:
 *   1. 마스터 비밀번호 → 바이트: **문자당 1바이트, 코드포인트 그대로** (UTF-8 이 아니다)
 *   2. DK = MD5^1000(passwordBytes || salt). 첫 회만 비밀번호+salt 를 먹이고,
 *      2회째부터는 직전 16바이트 다이제스트만 먹인다.
 *   3. desKey = DK[0..8], iv = DK[8..16] — NoIvGenerator 이므로 IV 를 따로
 *      만들지 않는다. IV 가 키 유도 결과의 뒷부분인 것이 PBES1 의 정의다.
 *   4. 본문은 DES-CBC + PKCS#5 패딩, 평문 문자열은 UTF-8.
 *   5. 출력은 base64( salt(8바이트) || 암호문 ).
 *
 * 지원 알고리즘은 이 하나뿐이다. `PBEWITHHMACSHA512ANDAES_256` 같은 것을 늘리지
 * 않는다 — 검증 벡터가 없는 경로를 만드는 것이 이 도구에서 가장 위험한 일이다.
 */

/** jasypt 기본값. 팀의 설정 파일 9개가 모두 이 값(또는 미지정=기본값)이다. */
export const KEY_OBTENTION_ITERATIONS = 1000;

/** RandomSaltGenerator 가 만드는 salt 크기이자, PBES1 이 정의한 크기. */
export const SALT_SIZE = 8;

/** 출력 가능 ASCII 의 경계. JDK 의 PBEKey 가 이 밖의 문자를 거부한다. */
const PASSWORD_MIN_CODE = 0x20;
const PASSWORD_MAX_CODE = 0x7e;

/**
 * 비ASCII 비밀번호 거부 문구.
 *
 * JDK 의 `com.sun.crypto.provider.PBEKey` 는 비ASCII 비밀번호에
 * `InvalidKeySpecException: Password is not ASCII` 를 던진다. 실측(temurin-21.0.11,
 * jasypt 1.9.3)으로 확인한 허용 범위는 U+0020~U+007E 뿐이다 — U+0009(탭),
 * U+007F, U+00E9 는 전부 거부된다.
 *
 * 여기서 거부하지 않고 계산해 버리면 **Java 가 절대 풀 수 없는 암호문을 만들어
 * 놓고 성공한 것처럼 보인다.** 이 도구의 최악의 실패 모드다.
 */
export const NON_ASCII_PASSWORD_ERROR =
  '마스터 비밀번호에 출력 가능 ASCII(공백 ~ ~) 밖의 문자가 있습니다. Java 의 PBEWithMD5AndDES 가 이 비밀번호를 거부하므로, 여기서 만든 값도 Java 에서 풀 수 없습니다.';

/** 비밀번호가 다르거나 형식이 아닐 때. 쓰레기 바이트를 결과로 내놓지 않는다. */
export const DECRYPT_FAILED_ERROR =
  '복호화에 실패했습니다. 마스터 비밀번호가 다르거나, 이 도구가 지원하는 형식(PBEWithMD5AndDES)이 아닙니다.';

export const NOT_BASE64_ERROR =
  'base64 로 읽을 수 없습니다. ENC(...) 안의 값이나 base64 문자열을 붙여넣으세요.';

/**
 * 마스터 비밀번호를 키 유도에 먹일 바이트열로 바꾼다. 출력 가능 ASCII 밖의
 * 문자가 하나라도 있으면 `null` — 호출자가 `NON_ASCII_PASSWORD_ERROR` 로 거부한다.
 */
export function passwordToBytes(password: string): Uint8Array | null {
  const bytes = new Uint8Array(password.length);
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    if (code < PASSWORD_MIN_CODE || code > PASSWORD_MAX_CODE) return null;
    bytes[i] = code;
  }
  return bytes;
}

export interface DerivedKey {
  /** DES 키 8바이트 */
  key: Uint8Array;
  /** CBC 초기 벡터 8바이트 */
  iv: Uint8Array;
  /** 유도 결과 16바이트 전체 — 계층별 테스트가 이 값을 직접 대조한다 */
  dk: Uint8Array;
}

/**
 * PBKDF1(MD5, 1000회). 첫 회만 `passwordBytes || salt` 를 먹이고, 그다음부터는
 * 직전 다이제스트 16바이트만 먹는다(비밀번호와 salt 를 다시 붙이지 않는다).
 */
export function deriveKey(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number = KEY_OBTENTION_ITERATIONS,
): DerivedKey {
  const seed = new Uint8Array(passwordBytes.length + salt.length);
  seed.set(passwordBytes);
  seed.set(salt, passwordBytes.length);

  let digest = md5(seed);
  for (let i = 1; i < iterations; i++) digest = md5(digest);

  return { key: digest.slice(0, 8), iv: digest.slice(8, 16), dk: digest };
}

/**
 * `ENC(...)` 껍데기를 벗긴다. 설정 파일에서 복사하면 껍데기가 붙어 오고, 사이트에
 * 붙여넣기 전에 그걸 손으로 지우게 하는 것은 이 도구가 없애려는 종류의 수고다.
 * 껍데기가 없는 base64 도 그대로 받는다.
 */
export function stripEncWrapper(text: string): string {
  const trimmed = text.trim();
  const wrapped = /^ENC\(([\s\S]*)\)$/i.exec(trimmed);
  return (wrapped?.[1] ?? trimmed).trim();
}

function decodeBase64(text: string): Uint8Array | null {
  const cleaned = text.replace(/\s+/g, '');
  // atob 은 구현마다 관용도가 다르다. 우리 문구로 거부하기 위해 먼저 검사한다.
  if (cleaned === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  try {
    const binary = atob(cleaned);
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * `ENC(...)` 또는 base64 를 마스터 비밀번호로 푼다.
 *
 * 실패는 반드시 실패로 돌려준다 — 빈 문자열이나 깨진 문자를 "성공" 으로 내놓지
 * 않는다. 패딩 검사(des.ts)와 UTF-8 검사(fatal)가 그 두 겹이다.
 */
export function decryptJasypt(input: string, password: string): ToolResult<string> {
  const passwordBytes = passwordToBytes(password);
  if (passwordBytes === null) return { ok: false, error: NON_ASCII_PASSWORD_ERROR };

  const payload = stripEncWrapper(input);
  const bytes = decodeBase64(payload);
  if (bytes === null) return { ok: false, error: NOT_BASE64_ERROR };

  if (bytes.length < SALT_SIZE + DES_BLOCK_SIZE) {
    return {
      ok: false,
      error:
        `Jasypt 암호문이 아닙니다. salt ${SALT_SIZE}바이트 + DES 블록 ${DES_BLOCK_SIZE}바이트가 ` +
        `최소인데 전체가 ${bytes.length}바이트입니다.`,
    };
  }

  const salt = bytes.slice(0, SALT_SIZE);
  const body = bytes.slice(SALT_SIZE);
  if (body.length % DES_BLOCK_SIZE !== 0) {
    return {
      ok: false,
      error:
        `Jasypt 암호문이 아닙니다. salt ${SALT_SIZE}바이트를 뺀 본문이 ${body.length}바이트로, ` +
        `DES 블록 크기 ${DES_BLOCK_SIZE}의 배수가 아닙니다.`,
    };
  }

  const { key, iv } = deriveKey(passwordBytes, salt);
  const plainBytes = desCbcDecrypt(key, iv, body);
  if (plainBytes === null) return { ok: false, error: DECRYPT_FAILED_ERROR };

  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(plainBytes) };
  } catch {
    // 패딩 검사를 통과한 쓰레기 바이트가 여기서 한 번 더 걸린다.
    return { ok: false, error: DECRYPT_FAILED_ERROR };
  }
}

export interface JasyptEncrypted {
  /** 설정 파일에 붙이는 형태 */
  enc: string;
  /** 껍데기 없는 base64 */
  base64: string;
}

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_SIZE));
}

/**
 * 평문을 Jasypt 형식으로 암호화한다.
 *
 * salt 는 암호화할 때마다 새로 만든다(RandomSaltGenerator). 같은 입력을 두 번
 * 암호화하면 결과가 서로 다른 것이 정상이고, 둘 다 같은 평문으로 풀린다.
 * `salt` 인자는 테스트가 값을 고정하기 위한 단 하나의 주입 경로다.
 */
export function encryptJasypt(
  plain: string,
  password: string,
  salt: Uint8Array = randomSalt(),
): ToolResult<JasyptEncrypted> {
  const passwordBytes = passwordToBytes(password);
  if (passwordBytes === null) return { ok: false, error: NON_ASCII_PASSWORD_ERROR };

  if (salt.length !== SALT_SIZE) {
    return { ok: false, error: `salt 는 ${SALT_SIZE}바이트여야 합니다 (받은 값: ${salt.length}바이트).` };
  }

  const { key, iv } = deriveKey(passwordBytes, salt);
  const body = desCbcEncrypt(key, iv, new TextEncoder().encode(plain));

  const output = new Uint8Array(SALT_SIZE + body.length);
  output.set(salt);
  output.set(body, SALT_SIZE);

  const base64 = encodeBase64(output);
  return { ok: true, value: { enc: `ENC(${base64})`, base64 } };
}
