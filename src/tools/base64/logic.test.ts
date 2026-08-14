import { describe, it, expect } from 'vitest';
import { encodeBase64, decodeBase64 } from './logic';

describe('encodeBase64', () => {
  it('ASCII 를 인코딩한다', () => {
    expect(encodeBase64('hello')).toEqual({ ok: true, value: 'aGVsbG8=' });
  });

  it('한글을 UTF-8 로 인코딩한다', () => {
    expect(encodeBase64('안녕')).toEqual({ ok: true, value: '7JWI64WV' });
  });

  it('이모지를 인코딩한다', () => {
    expect(encodeBase64('👋')).toEqual({ ok: true, value: '8J+Riw==' });
  });

  it('빈 문자열은 빈 결과다', () => {
    expect(encodeBase64('')).toEqual({ ok: true, value: '' });
  });
});

describe('decodeBase64', () => {
  it('ASCII 를 디코딩한다', () => {
    expect(decodeBase64('aGVsbG8=')).toEqual({ ok: true, value: 'hello' });
  });

  it('한글을 디코딩한다', () => {
    expect(decodeBase64('7JWI64WV')).toEqual({ ok: true, value: '안녕' });
  });

  it('앞뒤 공백과 줄바꿈을 무시한다', () => {
    expect(decodeBase64('  aGVs\nbG8=  ')).toEqual({ ok: true, value: 'hello' });
  });

  it('base64 가 아닌 문자가 있으면 에러다', () => {
    const result = decodeBase64('!!!not-base64!!!');
    expect(result.ok).toBe(false);
  });

  it('UTF-8 로 해석할 수 없는 바이트면 에러다', () => {
    // 0xFF 단독은 유효한 UTF-8 시퀀스가 아니다
    const result = decodeBase64('/w==');
    expect(result.ok).toBe(false);
  });

  it('한글 왕복이 일치한다', () => {
    const encoded = encodeBase64('다우기술 비즈뿌리오');
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(decodeBase64(encoded.value)).toEqual({ ok: true, value: '다우기술 비즈뿌리오' });
  });
});
