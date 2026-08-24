import type { TotpAlgorithm } from './logic';

/*
 * RFC 6238 TOTP. `crypto.subtle` 의 HMAC 만 쓴다.
 *
 * 현재 시각을 스스로 읽지 않는다 — 인자로 받는다. 그러지 않으면 공식 벡터를
 * 대조하는 테스트를 쓸 수 없고, 시계에 의존해 언젠가 깨지거나 아무 때나 통과하는
 * 테스트가 된다.
 */

/** 카운터를 8바이트 빅엔디언으로 적는다. 이 순서가 뒤집히면 코드가 전부 달라진다. */
function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

async function hmac(
  secret: Uint8Array,
  algorithm: TotpAlgorithm,
  message: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret as unknown as ArrayBufferView<ArrayBuffer>,
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    message as unknown as ArrayBufferView<ArrayBuffer>,
  );
  return new Uint8Array(signature);
}

/**
 * 그 시각의 코드를 만든다.
 *
 * RFC 4226 의 동적 절단(dynamic truncation): 다이제스트 마지막 바이트의 하위 4비트를
 * 오프셋으로 삼아 그 자리에서 4바이트를 읽고, 최상위 비트를 떨어뜨린 뒤 10^자릿수로
 * 나눈 나머지를 쓴다. 최상위 비트를 남기면 부호 있는 정수로 해석하는 구현과 값이
 * 갈린다 — 그래서 0x7f 로 마스크한다.
 */
export async function generateTotp(
  secret: Uint8Array,
  algorithm: TotpAlgorithm,
  digits: number,
  period: number,
  unixSeconds: number,
): Promise<string> {
  const counter = Math.floor(unixSeconds / period);
  const digest = await hmac(secret, algorithm, counterBytes(counter));

  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    ((digest[offset + 1] as number) << 16) |
    ((digest[offset + 2] as number) << 8) |
    (digest[offset + 3] as number);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** 지금 주기가 끝날 때까지 남은 초. 주기 시작 순간에는 period 를 그대로 돌려준다. */
export function secondsRemaining(period: number, unixSeconds: number): number {
  return period - (Math.floor(unixSeconds) % period);
}

/**
 * 입력한 코드가 맞는지 본다.
 *
 * 앞뒤 한 주기까지 받아준다. 사용자 기기의 시계는 늘 조금씩 어긋나 있고, 코드를
 * 옮겨 적는 데도 시간이 걸린다. 창을 0으로 두면 "분명 맞게 쳤는데 틀렸다" 가 된다.
 */
export async function verifyTotp(
  secret: Uint8Array,
  algorithm: TotpAlgorithm,
  digits: number,
  period: number,
  unixSeconds: number,
  code: string,
): Promise<boolean> {
  // 앱은 코드를 '123 456' 처럼 끊어 보여준다. 옮겨 적은 그대로 받아준다.
  const cleaned = code.replace(/[\s-]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return false;

  for (const step of [-1, 0, 1]) {
    const at = unixSeconds + step * period;
    if (at < 0) continue;
    if ((await generateTotp(secret, algorithm, digits, period, at)) === cleaned) return true;
  }
  return false;
}
