import { describe, it, expect } from 'vitest';
import { encodeUrl, decodeUrl } from './logic';

describe('encodeUrl - component 모드', () => {
  it('예약 문자를 모두 인코딩한다', () => {
    expect(encodeUrl('a=1&b=2', 'component')).toEqual({ ok: true, value: 'a%3D1%26b%3D2' });
  });

  it('슬래시를 인코딩한다', () => {
    expect(encodeUrl('a/b', 'component')).toEqual({ ok: true, value: 'a%2Fb' });
  });

  it('한글을 UTF-8 퍼센트 인코딩한다', () => {
    expect(encodeUrl('한글', 'component')).toEqual({ ok: true, value: '%ED%95%9C%EA%B8%80' });
  });
});

describe('encodeUrl - full 모드', () => {
  it('URL 구조 문자는 남긴다', () => {
    expect(encodeUrl('https://a.com/b?x=1&y=2', 'full')).toEqual({
      ok: true,
      value: 'https://a.com/b?x=1&y=2',
    });
  });

  it('공백은 인코딩한다', () => {
    expect(encodeUrl('https://a.com/b c', 'full')).toEqual({
      ok: true,
      value: 'https://a.com/b%20c',
    });
  });
});

describe('decodeUrl', () => {
  it('퍼센트 인코딩을 되돌린다', () => {
    expect(decodeUrl('%ED%95%9C%EA%B8%80', 'component')).toEqual({ ok: true, value: '한글' });
  });

  it('더하기는 공백으로 바꾸지 않는다', () => {
    expect(decodeUrl('a+b', 'component')).toEqual({ ok: true, value: 'a+b' });
  });

  it('잘못된 퍼센트 시퀀스는 에러다', () => {
    const result = decodeUrl('%E0%A4%A', 'component');
    expect(result.ok).toBe(false);
  });

  it('왕복이 일치한다', () => {
    const encoded = encodeUrl('검색어 = 다우 & 비즈', 'component');
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(decodeUrl(encoded.value, 'component')).toEqual({ ok: true, value: '검색어 = 다우 & 비즈' });
  });
});
