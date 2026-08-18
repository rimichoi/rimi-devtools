/**
 * 단일 DES (FIPS 46-3) + CBC 모드 + PKCS#5 패딩.
 *
 * `crypto.subtle` 에는 DES 가 없다(의도적으로 빠진 것이다 — 56비트 키는 오래
 * 전에 수명이 끝났다). 그래도 여기서 필요하다: 팀의 Spring 설정이 실제로
 * `PBEWithMD5AndDES` 로 암호화돼 있고, 그 값을 **읽으려면** 같은 알고리즘이
 * 있어야 한다. 새 비밀을 이 알고리즘으로 만드는 것을 권하는 파일이 아니다.
 *
 * 표(IP/FP/E/P/PC-1/PC-2/S-box)는 전부 상수 배열이다 — 계산해서 만드는 테이블이
 * 없으므로 모듈 평가 시점에 던질 수 있는 코드가 없다(이 프로젝트는 top-level
 * `new Intl.Segmenter(...)` 가 청크 평가를 깨뜨린 전례가 있다).
 *
 * 표의 숫자는 FIPS 46-3 그대로 **1부터 시작하는 비트 번호**이고, 비트 번호 1이
 * 최상위 비트다. 그래서 내부 표현은 비트 하나를 바이트 하나에 담는
 * `Uint8Array`(0 또는 1)이다. 워드 연산으로 접는 최적화 구현보다 느리지만,
 * 규격서와 한 줄씩 대조할 수 있다 — 이 도구는 틀려도 성공한 것처럼 보이는
 * 도구이므로 검증 가능성이 속도보다 앞선다(실측: 블록당 수십 마이크로초).
 *
 * 이 파일은 DOM 을 만지지 않는다.
 */

export const DES_BLOCK_SIZE = 8;

/** 초기 순열 IP. */
const IP: readonly number[] = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64,
  56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53,
  45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

/** 최종 순열 IP^-1. */
const FP: readonly number[] = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37,
  5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2,
  42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

/** 확장 함수 E (32 → 48비트). */
const E: readonly number[] = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18,
  19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

/** S-box 출력에 걸리는 순열 P (32 → 32비트). */
const P: readonly number[] = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13,
  30, 6, 22, 11, 4, 25,
];

/**
 * PC-1 (64 → 56비트). 여기서 각 키 바이트의 최하위 비트(8, 16, …, 64)가 빠진다 —
 * DES 는 그 비트를 패리티로 버린다. 그래서 키 `0000000000000000` 과
 * `0101010101010101` 은 **같은 결과**를 낸다(검증 벡터에 그 줄이 있다).
 */
const PC1: readonly number[] = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60,
  52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
  13, 5, 28, 20, 12, 4,
];

/** PC-2 (56 → 48비트). 라운드 서브키를 뽑는 압축 순열. */
const PC2: readonly number[] = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52,
  31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

/** 라운드별 C/D 레지스터 좌회전 비트수. */
const KEY_SHIFTS: readonly number[] = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

/** S-box 8개. 각 표는 4행 × 16열을 한 줄로 편 64개 값이다. */
const SBOXES: readonly (readonly number[])[] = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11,
    9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5,
    11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10,
    6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2,
    11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12,
    11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4,
    15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1,
    10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9,
    4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10,
    3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6,
    15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14,
    0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10,
    11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12,
    2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9,
    5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11,
    0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13,
    15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

/** 바이트열 → 비트열(최상위 비트 먼저). */
function bytesToBits(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    for (let b = 0; b < 8; b++) bits[i * 8 + b] = (byte >>> (7 - b)) & 1;
  }
  return bits;
}

/** 비트열 → 바이트열. 길이는 8의 배수여야 한다(내부에서만 부르므로 항상 그렇다). */
function bitsToBytes(bits: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) {
      const index = i >>> 3;
      bytes[index] = bytes[index]! | (1 << (7 - (i & 7)));
    }
  }
  return bytes;
}

/** 표에 적힌 1-based 비트 번호대로 비트를 다시 배열한다. */
function permute(bits: Uint8Array, table: readonly number[]): Uint8Array {
  const out = new Uint8Array(table.length);
  for (let i = 0; i < table.length; i++) out[i] = bits[table[i]! - 1]!;
  return out;
}

function rotateBitsLeft(bits: Uint8Array, amount: number): Uint8Array {
  const out = new Uint8Array(bits.length);
  for (let i = 0; i < bits.length; i++) out[i] = bits[(i + amount) % bits.length]!;
  return out;
}

/** 라운드 서브키 16개(각 48비트)를 만든다. */
function keySchedule(key: Uint8Array): Uint8Array[] {
  const permuted = permute(bytesToBits(key), PC1);
  let c: Uint8Array = permuted.slice(0, 28);
  let d: Uint8Array = permuted.slice(28, 56);

  const subkeys: Uint8Array[] = [];
  for (let round = 0; round < 16; round++) {
    const shift = KEY_SHIFTS[round]!;
    c = rotateBitsLeft(c, shift);
    d = rotateBitsLeft(d, shift);
    const cd = new Uint8Array(56);
    cd.set(c);
    cd.set(d, 28);
    subkeys.push(permute(cd, PC2));
  }
  return subkeys;
}

/** 라운드 함수 f(R, K): 확장 → 서브키 XOR → S-box → 순열 P. */
function feistel(right: Uint8Array, subkey: Uint8Array): Uint8Array {
  const expanded = permute(right, E);
  for (let i = 0; i < expanded.length; i++) expanded[i] = expanded[i]! ^ subkey[i]!;

  const substituted = new Uint8Array(32);
  for (let box = 0; box < 8; box++) {
    const o = box * 6;
    // 행은 바깥 두 비트, 열은 가운데 네 비트다.
    const row = (expanded[o]! << 1) | expanded[o + 5]!;
    const column =
      (expanded[o + 1]! << 3) | (expanded[o + 2]! << 2) | (expanded[o + 3]! << 1) | expanded[o + 4]!;
    const value = SBOXES[box]![row * 16 + column]!;
    for (let b = 0; b < 4; b++) substituted[box * 4 + b] = (value >>> (3 - b)) & 1;
  }

  return permute(substituted, P);
}

/**
 * 서브키 순서대로 16라운드를 돈다. 암호화와 복호화의 차이는 **서브키 순서**
 * 하나뿐이다 — 복호화는 K16…K1 로 돈다.
 */
function crypt(block: Uint8Array, subkeys: readonly Uint8Array[]): Uint8Array {
  const bits = permute(bytesToBits(block), IP);
  let left: Uint8Array = bits.slice(0, 32);
  let right: Uint8Array = bits.slice(32, 64);

  for (let round = 0; round < 16; round++) {
    const f = feistel(right, subkeys[round]!);
    for (let i = 0; i < 32; i++) f[i] = left[i]! ^ f[i]!;
    left = right;
    right = f;
  }

  // 마지막 라운드 뒤에는 좌우를 바꾸지 않는다 — 최종 순열에 R16L16 순서로 넣는다.
  const preOutput = new Uint8Array(64);
  preOutput.set(right);
  preOutput.set(left, 32);
  return bitsToBytes(permute(preOutput, FP));
}

/** DES 단일 블록 암호화(8바이트 → 8바이트). 패딩·모드 없음. */
export function desEncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  return crypt(block, keySchedule(key));
}

/** DES 단일 블록 복호화(8바이트 → 8바이트). 패딩·모드 없음. */
export function desDecryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  return crypt(block, keySchedule(key).reverse());
}

/**
 * DES-CBC 암호화. PKCS#5 패딩을 **항상** 붙인다 — 평문이 정확히 8의 배수여도
 * 값이 8인 바이트 8개짜리 블록이 하나 더 생긴다. 그래야 복호화가 패딩의 시작을
 * 모호함 없이 찾을 수 있다.
 */
export function desCbcEncrypt(key: Uint8Array, iv: Uint8Array, plain: Uint8Array): Uint8Array {
  const padLength = DES_BLOCK_SIZE - (plain.length % DES_BLOCK_SIZE);
  const padded = new Uint8Array(plain.length + padLength);
  padded.set(plain);
  padded.fill(padLength, plain.length);

  const subkeys = keySchedule(key);
  const out = new Uint8Array(padded.length);
  let previous = iv;
  for (let offset = 0; offset < padded.length; offset += DES_BLOCK_SIZE) {
    const block = padded.slice(offset, offset + DES_BLOCK_SIZE);
    for (let i = 0; i < DES_BLOCK_SIZE; i++) block[i] = block[i]! ^ previous[i]!;
    const encrypted = crypt(block, subkeys);
    out.set(encrypted, offset);
    previous = encrypted;
  }
  return out;
}

/**
 * DES-CBC 복호화. 실패는 `null` 로 돌려준다 — 던지지 않고, **빈 바이트열이나
 * 쓰레기 바이트로 "성공" 처리하지 않는다.**
 *
 * 실패로 판정하는 경우:
 *   - 길이가 0이거나 8의 배수가 아니다
 *   - PKCS#5 패딩이 유효하지 않다(마지막 바이트가 1~8 밖이거나, 그 개수만큼의
 *     꼬리 바이트가 전부 같은 값이 아니다)
 *
 * 패딩 검사가 이 도구에서 가장 중요한 안전장치다. 틀린 마스터 비밀번호로 풀면
 * 평문 자리에 무작위 바이트가 나오는데, 검사를 빼면 그 쓰레기가 결과 칸에
 * 그대로 떠서 사용자는 그게 답인 줄 안다. 무작위 바이트가 이 검사를 통과할
 * 확률은 대략 1/256 아래이고, 통과해도 그 뒤의 UTF-8 검사(fatal)가 한 번 더 막는다.
 */
export function desCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  cipher: Uint8Array,
): Uint8Array | null {
  if (cipher.length === 0 || cipher.length % DES_BLOCK_SIZE !== 0) return null;

  const subkeys = keySchedule(key).reverse();
  const out = new Uint8Array(cipher.length);
  let previous = iv;
  for (let offset = 0; offset < cipher.length; offset += DES_BLOCK_SIZE) {
    const block = cipher.slice(offset, offset + DES_BLOCK_SIZE);
    const decrypted = crypt(block, subkeys);
    for (let i = 0; i < DES_BLOCK_SIZE; i++) out[offset + i] = decrypted[i]! ^ previous[i]!;
    previous = block;
  }

  const padLength = out[out.length - 1]!;
  if (padLength < 1 || padLength > DES_BLOCK_SIZE) return null;
  for (let i = out.length - padLength; i < out.length; i++) {
    if (out[i] !== padLength) return null;
  }
  return out.slice(0, out.length - padLength);
}
