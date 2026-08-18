import { describe, expect, it } from 'vitest';
import {
  DES_BLOCK_SIZE,
  desCbcDecrypt,
  desCbcEncrypt,
  desDecryptBlock,
  desEncryptBlock,
} from './des';
import { DES_BLOCK_VECTORS, bytesToHex, hexToBytes } from './vectors';

/** 패딩을 붙이지 않고 CBC 로만 암호화한다 — 잘못된 패딩을 일부러 만들기 위한 것. */
function cbcEncryptWithoutPadding(
  key: Uint8Array,
  iv: Uint8Array,
  blocks: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(blocks.length);
  let previous = iv;
  for (let offset = 0; offset < blocks.length; offset += DES_BLOCK_SIZE) {
    const block = blocks.slice(offset, offset + DES_BLOCK_SIZE);
    for (let i = 0; i < DES_BLOCK_SIZE; i++) block[i] = block[i]! ^ previous[i]!;
    const encrypted = desEncryptBlock(key, block);
    out.set(encrypted, offset);
    previous = encrypted;
  }
  return out;
}

const KEY = hexToBytes('133457799BBCDFF1');
const IV = hexToBytes('0011223344556677');

describe('DES 단일 블록 (SunJCE DES/ECB/NoPadding 실측 벡터)', () => {
  for (const vector of DES_BLOCK_VECTORS) {
    it(`암호화: ${vector.key} / ${vector.plaintext} → ${vector.ciphertext} (${vector.note})`, () => {
      const actual = desEncryptBlock(hexToBytes(vector.key), hexToBytes(vector.plaintext));
      expect(bytesToHex(actual)).toBe(vector.ciphertext.toLowerCase());
    });

    /*
     * 복호화도 반드시 따로 검사한다. 암호화만 맞고 복호화의 서브키 순서(K16…K1)가
     * 뒤집히지 않은 버그가 흔하다 — 그 버그는 왕복 테스트로도, 암호화 벡터로도
     * 잡히지 않는다.
     */
    it(`복호화: ${vector.key} / ${vector.ciphertext} → ${vector.plaintext} (${vector.note})`, () => {
      const actual = desDecryptBlock(hexToBytes(vector.key), hexToBytes(vector.ciphertext));
      expect(bytesToHex(actual)).toBe(vector.plaintext.toLowerCase());
    });
  }

  it('키의 패리티 비트(각 바이트 최하위 비트)는 결과에 영향을 주지 않는다', () => {
    // PC-1 이 그 비트를 버리는지 보는 검사다. 값이 같다고 벡터에서 지우지 말 것.
    const zeros = desEncryptBlock(hexToBytes('0000000000000000'), hexToBytes('0000000000000000'));
    const parity = desEncryptBlock(hexToBytes('0101010101010101'), hexToBytes('0000000000000000'));
    expect(bytesToHex(parity)).toBe(bytesToHex(zeros));
    expect(bytesToHex(zeros)).toBe('8ca64de9c1b123a7');
  });

  it('한 블록 왕복', () => {
    const plain = hexToBytes('0123456789abcdef');
    expect(bytesToHex(desDecryptBlock(KEY, desEncryptBlock(KEY, plain)))).toBe(
      '0123456789abcdef',
    );
  });
});

describe('DES-CBC + PKCS#5', () => {
  it('패딩은 항상 붙는다 — 평문이 블록 배수여도 블록이 하나 더 생긴다', () => {
    expect(desCbcEncrypt(KEY, IV, new Uint8Array(0)).length).toBe(8);
    expect(desCbcEncrypt(KEY, IV, new Uint8Array(1)).length).toBe(8);
    expect(desCbcEncrypt(KEY, IV, new Uint8Array(7)).length).toBe(8);
    expect(desCbcEncrypt(KEY, IV, new Uint8Array(8)).length).toBe(16);
    expect(desCbcEncrypt(KEY, IV, new Uint8Array(16)).length).toBe(24);
  });

  it('CBC 는 같은 평문 블록 둘을 서로 다른 암호문 블록으로 만든다 (ECB 가 아니다)', () => {
    const cipher = desCbcEncrypt(KEY, IV, new Uint8Array(16));
    expect(bytesToHex(cipher.slice(0, 8))).not.toBe(bytesToHex(cipher.slice(8, 16)));
  });

  it('IV 가 다르면 같은 평문의 암호문도 달라진다', () => {
    const a = desCbcEncrypt(KEY, IV, new Uint8Array([1, 2, 3]));
    const b = desCbcEncrypt(KEY, hexToBytes('ffffffffffffffff'), new Uint8Array([1, 2, 3]));
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  for (const length of [0, 1, 7, 8, 9, 15, 16, 17, 64, 200]) {
    it(`${length}바이트 평문이 CBC 왕복으로 그대로 돌아온다`, () => {
      const plain = new Uint8Array(length);
      for (let i = 0; i < length; i++) plain[i] = (i * 13 + 7) & 0xff;
      const roundTripped = desCbcDecrypt(KEY, IV, desCbcEncrypt(KEY, IV, plain));
      expect(roundTripped).not.toBeNull();
      expect(bytesToHex(roundTripped!)).toBe(bytesToHex(plain));
    });
  }

  it('키가 틀리면 평문이 돌아오지 않는다', () => {
    const cipher = desCbcEncrypt(KEY, IV, new TextEncoder().encode('secret value'));
    // 마지막 바이트를 0xF1 → 0xF0 처럼 최하위 비트만 바꾸면 안 된다 — 그건
    // 패리티 비트라 DES 가 버리므로 **같은 키**다(위 PC-1 검사 참고).
    const wrong = desCbcDecrypt(hexToBytes('133457799bbcdfe1'), IV, cipher);
    // null(패딩 불량) 이거나, 통과했더라도 원문과 달라야 한다.
    if (wrong !== null) expect(new TextDecoder().decode(wrong)).not.toBe('secret value');
  });
});

/*
 * 패딩 검사는 이 도구에서 가장 중요한 안전장치다. 틀린 마스터 비밀번호로 풀면
 * 평문 자리에 무작위 바이트가 나오는데, 검사가 없으면 그 쓰레기가 결과 칸에
 * 떠서 사용자는 그게 답인 줄 안다. 아래는 그 검사를 직접 겨눈다 — 잘못된 패딩을
 * 가진 "정상적으로 암호화된" 데이터를 만들어 넣는다(그러니 복호화 자체는 성공하고,
 * 오직 패딩 검사만이 이것을 막는다).
 */
describe('PKCS#5 패딩 검사', () => {
  function decryptRawBlocks(lastBlock: number[]): Uint8Array | null {
    const cipher = cbcEncryptWithoutPadding(KEY, IV, new Uint8Array(lastBlock));
    return desCbcDecrypt(KEY, IV, cipher);
  }

  it('마지막 바이트가 0이면 실패다', () => {
    expect(decryptRawBlocks([1, 2, 3, 4, 5, 6, 7, 0])).toBeNull();
  });

  it('마지막 바이트가 9(블록 크기 초과)면 실패다', () => {
    expect(decryptRawBlocks([1, 2, 3, 4, 5, 6, 7, 9])).toBeNull();
  });

  it('마지막 바이트가 0xFF 면 실패다', () => {
    expect(decryptRawBlocks([1, 2, 3, 4, 5, 6, 7, 0xff])).toBeNull();
  });

  it('꼬리 바이트들이 같은 값이 아니면 실패다', () => {
    // 마지막 바이트가 3이니 꼬리 세 바이트가 모두 3이어야 한다.
    expect(decryptRawBlocks([1, 2, 3, 4, 5, 1, 2, 3])).toBeNull();
  });

  it('유효한 패딩만 있는 블록은 빈 바이트열로 성공한다', () => {
    const decrypted = decryptRawBlocks([8, 8, 8, 8, 8, 8, 8, 8]);
    expect(decrypted).not.toBeNull();
    expect(decrypted!.length).toBe(0);
  });

  it('유효한 패딩은 정확히 그만큼만 벗긴다', () => {
    const decrypted = decryptRawBlocks([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 3, 3, 3]);
    expect(decrypted).not.toBeNull();
    expect(bytesToHex(decrypted!)).toBe('aabbccddee');
  });

  it('길이가 0이거나 블록 크기의 배수가 아니면 실패다', () => {
    expect(desCbcDecrypt(KEY, IV, new Uint8Array(0))).toBeNull();
    expect(desCbcDecrypt(KEY, IV, new Uint8Array(7))).toBeNull();
    expect(desCbcDecrypt(KEY, IV, new Uint8Array(9))).toBeNull();
    expect(desCbcDecrypt(KEY, IV, new Uint8Array(15))).toBeNull();
  });
});
