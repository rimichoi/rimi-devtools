import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { md5 } from './md5';
import { bytesToHex } from './vectors';

/**
 * MD5 는 기대값을 손으로 적지 않는다 — Node 의 `node:crypto` 를 **오라클**로 쓴다.
 * 독립 구현과 대조하는 것이 손으로 옮겨 적은 상수보다 강하고, 옮겨 적다 틀릴
 * 여지도 없다. `node:crypto` 는 테스트에서만 쓰므로 런타임 의존성이 아니다.
 */
function oracle(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function pattern(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 37 + 11) & 0xff;
  return out;
}

describe('md5', () => {
  /*
   * 경계값 55/56/64 를 빼면 안 된다. MD5 구현의 거의 모든 버그가 거기서 난다:
   * 55바이트는 0x80 + 길이 8바이트가 한 블록에 딱 들어가는 마지막 길이이고,
   * 56바이트는 길이 필드가 다음 블록으로 밀리는 첫 길이다.
   */
  const cases: { name: string; input: Uint8Array }[] = [
    { name: '빈 입력', input: bytes() },
    { name: '1바이트', input: bytes(0x61) },
    { name: '55바이트 (패딩 경계 직전)', input: pattern(55) },
    { name: '56바이트 (길이 필드가 다음 블록으로 밀린다)', input: pattern(56) },
    { name: '57바이트', input: pattern(57) },
    { name: '63바이트', input: pattern(63) },
    { name: '64바이트 (정확히 한 블록)', input: pattern(64) },
    { name: '65바이트', input: pattern(65) },
    { name: '119바이트', input: pattern(119) },
    { name: '120바이트', input: pattern(120) },
    { name: '128바이트 (정확히 두 블록)', input: pattern(128) },
    { name: '1000바이트 (여러 블록)', input: pattern(1000) },
    { name: '0x00 과 0xFF 가 섞인 바이트열', input: bytes(0x00, 0xff, 0x00, 0xff, 0x80, 0x7f, 0x00) },
    { name: '0x00 만 64개', input: new Uint8Array(64) },
    { name: '0xFF 만 64개', input: new Uint8Array(64).fill(0xff) },
    // 1000회 반복 유도가 2회째부터 먹이는 바로 그 모양이다.
    { name: '16바이트 (반복 유도의 입력 모양)', input: pattern(16) },
  ];

  for (const { name, input } of cases) {
    it(`${name}: node:crypto 와 같은 다이제스트를 낸다`, () => {
      expect(bytesToHex(md5(input))).toBe(oracle(input));
    });
  }

  it('길이 0~200 바이트 전 구간에서 오라클과 일치한다', () => {
    for (let length = 0; length <= 200; length++) {
      const input = pattern(length);
      expect(bytesToHex(md5(input)), `길이 ${length}`).toBe(oracle(input));
    }
  });

  it('16바이트를 1000회 되먹여도 오라클과 계속 일치한다', () => {
    // 키 유도가 실제로 하는 일과 같은 모양. 라운드 상수나 시프트가 한 자리라도
    // 틀리면 회차가 쌓이며 어긋난다.
    let ours = pattern(16);
    let theirs = pattern(16);
    for (let i = 0; i < 1000; i++) {
      ours = md5(ours);
      theirs = new Uint8Array(createHash('md5').update(theirs).digest());
    }
    expect(bytesToHex(ours)).toBe(bytesToHex(theirs));
  });

  it('다이제스트는 항상 16바이트다', () => {
    expect(md5(bytes()).length).toBe(16);
    expect(md5(pattern(1000)).length).toBe(16);
  });

  it('입력 바이트열을 건드리지 않는다', () => {
    const input = pattern(70);
    const copy = input.slice();
    md5(input);
    expect(bytesToHex(input)).toBe(bytesToHex(copy));
  });
});
