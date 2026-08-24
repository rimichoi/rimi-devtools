import { base64UrlToBytes, isSymmetricAlg } from './logic';

/*
 * HS256/384/512 서명 검증. `crypto.subtle` 만 쓴다 — 런타임 의존성을 늘리지 않는다.
 *
 * 상태를 세 가지로 유지한다. "검증 안 함" 과 "검증 실패" 를 하나로 뭉치면
 * 사용자에게 정반대의 소식이 같은 얼굴로 전달된다.
 */

export type SignatureState = 'unverified' | 'valid' | 'mismatch';

export interface SignatureVerdict {
  state: SignatureState;
  message: string;
}

const HASH: Record<string, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

const UNVERIFIED_HINT = '비밀키를 입력하면 서명을 검증합니다.';
const VALID = '서명이 유효합니다.';
const MISMATCH = '서명이 일치하지 않습니다. 비밀키가 다르거나 토큰이 변조됐습니다.';

export async function verifySignature(
  alg: string | null,
  signingInput: string,
  signature: string,
  secret: string,
): Promise<SignatureVerdict> {
  if (alg !== null && alg.toLowerCase() === 'none') {
    return { state: 'unverified', message: 'alg 가 none 이라 검증할 서명이 없습니다.' };
  }
  if (alg === null) {
    return { state: 'unverified', message: '헤더에 alg 가 없어 서명을 검증할 수 없습니다.' };
  }
  /*
   * 검증할 수 없는 alg 는 전부 그 사실을 말한다. 예전에는 RS/ES/PS 로 시작하는
   * 것만 걸러내고 나머지(EdDSA, HS1, 소문자 hs256, 뒤에 공백이 붙은 "HS256 ")는
   * 일반 안내 문구로 떨어졌다 — 비밀키를 이미 넣은 사용자가 "비밀키를 입력하면
   * 검증합니다" 를 읽고, 경고 목록에도 아무 줄이 없었다.
   */
  if (!isSymmetricAlg(alg)) {
    return {
      state: 'unverified',
      message: `이 도구는 대칭키(HS256/384/512) 서명만 검증합니다. ${alg} 는 검증하지 않습니다.`,
    };
  }
  if (secret === '') {
    return { state: 'unverified', message: UNVERIFIED_HINT };
  }

  const signatureBytes = base64UrlToBytes(signature);
  if (!signatureBytes.ok) {
    // 서명 조각이 형식조차 안 맞으면 검증할 것이 없다. "검증 안 함" 이 아니라
    // 불일치다 — 이 토큰의 서명은 이 비밀키로 만들어진 것일 수 없다.
    return { state: 'mismatch', message: MISMATCH };
  }

  const encoder = new TextEncoder();
  // 비밀키는 UTF-8 바이트로 쓴다. 어디에도 저장하지 않는다.
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: { name: HASH[alg as string] as string } },
    false,
    ['verify'],
  );

  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes.value as unknown as ArrayBufferView<ArrayBuffer>,
    encoder.encode(signingInput),
  );

  return ok ? { state: 'valid', message: VALID } : { state: 'mismatch', message: MISMATCH };
}
