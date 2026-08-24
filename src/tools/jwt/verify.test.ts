import { describe, it, expect } from 'vitest';
import { verifySignature } from './verify';

/*
 * 이 도구가 "서명이 유효합니다" 를 잘못 말하면 사용자는 변조된 토큰을 정상으로
 * 믿는다. 그래서 유효/불일치/검증안함 세 상태를 각각 리터럴로 못 박는다.
 *
 * 토큰과 비밀키는 node:crypto 로 생성하고 실행 검증한 벡터다.
 */

const HS256 = {
  signingInput:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Iu2Zjeq4uOuPmSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ',
  signature: 'aQGiu-ZTHs_BwR6lFho9PK5PZezSt5yh65zWYeZZwYc',
  secret: 'your-256-bit-secret',
};
const HS384 = {
  signingInput: 'eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhIiwiaWF0IjoxNzAwMDAwMDAwfQ',
  signature: '7AJmo_HmSbY29p0Ke0qHjxJ3-JidIuhkJs2YkC8WDbti4OTzJnOSl0IQo_B2g8HV',
  secret: 'secret',
};
const HS512 = {
  signingInput: 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhIiwiaWF0IjoxNzAwMDAwMDAwfQ',
  signature:
    'whnpjR0XQtcMmOoXVa2JN6yM_ks6I3KCZVgww6rUmUx2TJCQUFFeO_hw4tafGBUK-KOfy8Oy_sV9X2BGm0fjrg',
  secret: 'secret',
};

describe('verifySignature — 유효', () => {
  it('HS256 서명이 맞으면 유효하다고 말한다', async () => {
    const result = await verifySignature('HS256', HS256.signingInput, HS256.signature, HS256.secret);
    expect(result.state).toBe('valid');
    expect(result.message).toBe('서명이 유효합니다.');
  });

  it('HS384 서명이 맞으면 유효하다고 말한다', async () => {
    const result = await verifySignature('HS384', HS384.signingInput, HS384.signature, HS384.secret);
    expect(result.state).toBe('valid');
  });

  it('HS512 서명이 맞으면 유효하다고 말한다', async () => {
    const result = await verifySignature('HS512', HS512.signingInput, HS512.signature, HS512.secret);
    expect(result.state).toBe('valid');
  });
});

describe('verifySignature — 불일치', () => {
  it('비밀키가 다르면 불일치라고 말한다 — 유효로 뭉치지 않는다', async () => {
    const result = await verifySignature('HS256', HS256.signingInput, HS256.signature, 'wrong-secret');
    expect(result.state).toBe('mismatch');
    expect(result.message).toBe('서명이 일치하지 않습니다. 비밀키가 다르거나 토큰이 변조됐습니다.');
  });

  it('페이로드가 변조되면 불일치를 잡아낸다', async () => {
    // 원래 signingInput 의 마지막 글자 하나만 바꾼다
    const tampered = `${HS256.signingInput.slice(0, -1)}X`;
    const result = await verifySignature('HS256', tampered, HS256.signature, HS256.secret);
    expect(result.state).toBe('mismatch');
  });

  it('알고리즘이 다르면(HS256 서명을 HS512 로 검증) 불일치다', async () => {
    const result = await verifySignature('HS512', HS256.signingInput, HS256.signature, HS256.secret);
    expect(result.state).toBe('mismatch');
  });

  it('서명 조각이 base64url 이 아니면 불일치로 처리한다', async () => {
    const result = await verifySignature('HS256', HS256.signingInput, '**not-base64url**', HS256.secret);
    expect(result.state).toBe('mismatch');
  });
});

describe('verifySignature — 검증 안 함', () => {
  it('비밀키가 비어 있으면 검증하지 않고, 넣으면 검증한다고 안내한다', async () => {
    const result = await verifySignature('HS256', HS256.signingInput, HS256.signature, '');
    expect(result.state).toBe('unverified');
    expect(result.message).toBe('비밀키를 입력하면 서명을 검증합니다.');
  });

  it('RS256 은 검증하지 않는다고 명시적으로 말한다 — 조용히 넘어가지 않는다', async () => {
    const result = await verifySignature('RS256', HS256.signingInput, HS256.signature, 'anything');
    expect(result.state).toBe('unverified');
    expect(result.message).toBe(
      '이 도구는 대칭키(HS256/384/512) 서명만 검증합니다. RS256 는 검증하지 않습니다.',
    );
  });

  it('alg 가 none 이면 검증할 서명 자체가 없다고 말한다', async () => {
    const result = await verifySignature('none', 'a.b', '', 'anything');
    expect(result.state).toBe('unverified');
    expect(result.message).toBe('alg 가 none 이라 검증할 서명이 없습니다.');
  });

  it('alg 가 아예 없으면 검증하지 않는다', async () => {
    const result = await verifySignature(null, HS256.signingInput, HS256.signature, 'anything');
    expect(result.state).toBe('unverified');
  });
});
