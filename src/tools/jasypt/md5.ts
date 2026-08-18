/**
 * MD5 (RFC 1321).
 *
 * `crypto.subtle` 에는 MD5 가 없다. PBEWithMD5AndDES 의 키 유도(PBKDF1)가 MD5 를
 * 1000회 돌리는 것이 전부이므로, 이 해시가 없으면 도구 자체가 성립하지 않는다.
 * 그래서 직접 만든다 — 런타임 의존성은 0개를 유지한다.
 *
 * MD5 는 **이 도구 안에서 해시로 쓰이는 것이 아니다.** 서명·무결성 용도로는
 * 이미 깨진 알고리즘이지만, 여기서는 Java 의 PBEWithMD5AndDES 가 정의한 키
 * 유도 절차를 바이트 단위로 재현하기 위한 부품이다. 다른 용도로 가져다 쓰지 말 것.
 *
 * 이 파일은 DOM 을 만지지 않는다(유닛 테스트 가능해야 한다).
 *
 * 테스트는 기대값을 손으로 적는 대신 Node 의 `node:crypto` 를 오라클로 쓴다 —
 * 독립 구현과 대조하는 것이 손으로 적은 값보다 강하다(md5.test.ts).
 */

/** 라운드 상수: K[i] = floor(2^32 × |sin(i + 1)|), i 는 라디안 기준. */
const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

/** 라운드별 좌회전 비트수. */
const SHIFT = new Uint8Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);

const BLOCK_BYTES = 64;

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * 임의 길이 바이트열의 MD5 다이제스트(16바이트)를 돌려준다.
 *
 * 배열 접근에 `!` 를 쓰는 자리들은 전부 길이를 먼저 정해 놓고 그 안에서만 도는
 * 루프다(`noUncheckedIndexedAccess` 아래에서 범위 밖일 수 없다는 뜻의 단언이다).
 */
export function md5(input: Uint8Array): Uint8Array {
  // 패딩: 0x80 한 바이트 + 0 채움 + 64비트 리틀엔디언 길이(비트 단위).
  // 길이 필드 8바이트가 들어갈 자리가 남지 않으면 블록이 하나 더 생긴다 —
  // 입력 55바이트(한 블록)와 56바이트(두 블록)가 갈리는 경계가 여기다.
  const paddedLength = (Math.floor((input.length + 8) / BLOCK_BYTES) + 1) * BLOCK_BYTES;
  const message = new Uint8Array(paddedLength);
  message.set(input);
  message[input.length] = 0x80;

  const bitLength = input.length * 8;
  const bitLengthLow = bitLength >>> 0;
  const bitLengthHigh = Math.floor(bitLength / 0x100000000);
  for (let i = 0; i < 4; i++) {
    message[paddedLength - 8 + i] = (bitLengthLow >>> (i * 8)) & 0xff;
    message[paddedLength - 4 + i] = (bitLengthHigh >>> (i * 8)) & 0xff;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const words = new Uint32Array(16);
  for (let offset = 0; offset < paddedLength; offset += BLOCK_BYTES) {
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      words[i] =
        (message[p]! | (message[p + 1]! << 8) | (message[p + 2]! << 16) | (message[p + 3]! << 24)) >>>
        0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      // 네 항의 합은 최대 4×2^32 이라 double 로 정확히 표현된다. >>> 0 으로 접는다.
      const sum = (f + a + K[i]! + words[g]!) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(sum, SHIFT[i]!)) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const state = [a0, b0, c0, d0];
  for (let i = 0; i < 4; i++) {
    const value = state[i]!;
    for (let b = 0; b < 4; b++) digest[i * 4 + b] = (value >>> (b * 8)) & 0xff;
  }
  return digest;
}
