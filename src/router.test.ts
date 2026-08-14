import { describe, it, expect } from 'vitest';
import { parseHash, resolveToolId } from './router';
import type { Tool } from './types';

const tools = [
  { id: 'base64', name: 'Base64', keywords: [], category: 'encode', load: async () => ({ mount: () => () => {} }) },
  { id: 'epoch', name: 'Epoch', keywords: [], category: 'convert', load: async () => ({ mount: () => () => {} }) },
] as Tool[];

describe('parseHash', () => {
  it('해시에서 도구 id 를 뽑는다', () => {
    expect(parseHash('#/base64')).toBe('base64');
  });

  it('앞의 슬래시가 없어도 처리한다', () => {
    expect(parseHash('#base64')).toBe('base64');
  });

  it('빈 해시는 null 이다', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#/')).toBeNull();
  });

  it('쿼리스트링을 잘라낸다', () => {
    expect(parseHash('#/base64?x=1')).toBe('base64');
  });
});

describe('resolveToolId', () => {
  it('등록된 도구면 그 id 를 돌려준다', () => {
    expect(resolveToolId('#/epoch', tools)).toBe('epoch');
  });

  it('없는 도구면 첫 번째 도구로 대체한다', () => {
    expect(resolveToolId('#/nope', tools)).toBe('base64');
  });

  it('빈 해시면 첫 번째 도구로 대체한다', () => {
    expect(resolveToolId('', tools)).toBe('base64');
  });

  it('도구가 하나도 없으면 null 이다', () => {
    expect(resolveToolId('#/base64', [])).toBeNull();
  });
});
