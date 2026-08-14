import { describe, it, expect } from 'vitest';
import { countText } from './logic';

describe('countText', () => {
  it('ASCII 를 센다', () => {
    const s = countText('hello world');
    expect(s.graphemes).toBe(11);
    expect(s.charsNoSpace).toBe(10);
    expect(s.bytesUtf8).toBe(11);
    expect(s.words).toBe(2);
    expect(s.lines).toBe(1);
  });

  it('한글은 글자당 3바이트다', () => {
    const s = countText('안녕하세요');
    expect(s.graphemes).toBe(5);
    expect(s.codePoints).toBe(5);
    expect(s.bytesUtf8).toBe(15);
  });

  it('가족 이모지는 1글자로 센다', () => {
    const s = countText('👨‍👩‍👧');
    expect(s.graphemes).toBe(1);
    expect(s.codePoints).toBe(5);
    expect(s.utf16Units).toBe(8);
    expect(s.bytesUtf8).toBe(18);
  });

  it('줄바꿈을 센다', () => {
    const s = countText('a\nb\nc');
    expect(s.lines).toBe(3);
  });

  it('마지막이 줄바꿈으로 끝나면 빈 줄을 세지 않는다', () => {
    expect(countText('a\nb\n').lines).toBe(2);
  });

  it('빈 문자열은 전부 0 이다', () => {
    const s = countText('');
    expect(s.graphemes).toBe(0);
    expect(s.words).toBe(0);
    expect(s.lines).toBe(0);
  });

  it('공백만 있으면 단어는 0 이다', () => {
    expect(countText('   \n  ').words).toBe(0);
  });

  it('연속 공백을 단어 구분자 하나로 본다', () => {
    expect(countText('a   b\t\tc').words).toBe(3);
  });

  it('공백 제외 글자수는 모든 공백류를 뺀다', () => {
    expect(countText('a b\tc\nd').charsNoSpace).toBe(4);
  });
});
