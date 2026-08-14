import { describe, it, expect } from 'vitest';
import { stripStringLiterals, findPrecisionLoss, formatJson } from './logic';

describe('stripStringLiterals', () => {
  it('문자열 내부를 공백으로 바꾸고 길이를 유지한다', () => {
    const input = '{"a":"hello"}';
    const output = stripStringLiterals(input);
    expect(output.length).toBe(input.length);
    // 키 "a" 는 1칸, 값 "hello" 는 5칸 공백이 된다. 따옴표는 남는다.
    expect(output).toBe('{" ":"     "}');
  });

  it('이스케이프된 따옴표에 속지 않는다', () => {
    // 실제 JSON 은 {"a":"he\"llo","b":1} 이다
    const input = '{"a":"he\\"llo","b":1}';
    expect(stripStringLiterals(input)).toBe('{" ":"       "," ":1}');
  });

  it('문자열 밖의 숫자는 남긴다', () => {
    expect(stripStringLiterals('{"n":12345}')).toBe('{" ":12345}');
  });
});

describe('findPrecisionLoss', () => {
  it('안전 범위를 넘는 정수를 찾는다', () => {
    expect(findPrecisionLoss('{"id":12345678901234567890}')).toEqual(['12345678901234567890']);
  });

  it('2의 53승 + 1 을 찾는다', () => {
    expect(findPrecisionLoss('{"id":9007199254740993}')).toEqual(['9007199254740993']);
  });

  it('안전 범위 안의 값은 찾지 않는다', () => {
    expect(findPrecisionLoss('{"id":9007199254740991}')).toEqual([]);
  });

  it('작은 정수는 찾지 않는다', () => {
    expect(findPrecisionLoss('{"a":1,"b":-42,"c":1000}')).toEqual([]);
  });

  it('문자열 안의 긴 숫자는 안전하므로 제외한다', () => {
    expect(findPrecisionLoss('{"id":"12345678901234567890"}')).toEqual([]);
  });

  it('소수는 대상이 아니다', () => {
    expect(findPrecisionLoss('{"v":1.23456789012345678}')).toEqual([]);
  });

  it('중복은 한 번만 보고한다', () => {
    expect(findPrecisionLoss('{"a":12345678901234567890,"b":12345678901234567890}')).toEqual([
      '12345678901234567890',
    ]);
  });

  it('음수도 찾는다', () => {
    expect(findPrecisionLoss('{"id":-12345678901234567890}')).toEqual(['-12345678901234567890']);
  });
});

describe('formatJson', () => {
  it('들여쓰기를 적용한다', () => {
    const r = formatJson('{"a":1}', { indent: 2, sortKeys: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe('{\n  "a": 1\n}');
  });

  it('압축 모드는 공백을 없앤다', () => {
    const r = formatJson('{\n "a": 1\n}', { indent: 'minify', sortKeys: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe('{"a":1}');
  });

  it('키를 정렬한다', () => {
    const r = formatJson('{"b":1,"a":2}', { indent: 2, sortKeys: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });

  it('중첩 객체의 키도 정렬한다', () => {
    const r = formatJson('{"z":{"y":1,"x":2}}', { indent: 'minify', sortKeys: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe('{"z":{"x":2,"y":1}}');
  });

  it('배열 순서는 유지한다', () => {
    const r = formatJson('{"a":[3,1,2]}', { indent: 'minify', sortKeys: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toBe('{"a":[3,1,2]}');
  });

  it('정밀도 손실이 있으면 경고를 붙인다', () => {
    const r = formatJson('{"id":12345678901234567890}', { indent: 2, sortKeys: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warning).toContain('12345678901234567890');
  });

  it('정밀도 손실이 없으면 경고가 없다', () => {
    const r = formatJson('{"id":123}', { indent: 2, sortKeys: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warning).toBeUndefined();
  });

  it('잘못된 JSON 은 줄과 칸을 알려준다', () => {
    const r = formatJson('{\n  "a": 1,\n}', { indent: 2, sortKeys: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/3\s*번째 줄/);
  });

  it('빈 입력은 에러다', () => {
    expect(formatJson('   ', { indent: 2, sortKeys: false }).ok).toBe(false);
  });
});
