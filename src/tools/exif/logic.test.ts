import { describe, it, expect } from 'vitest';
import { toExifRows, extractGps, formatCoordinate } from './logic';

describe('toExifRows', () => {
  it('알려진 키를 한글 라벨로 바꾼다', () => {
    const rows = toExifRows({ Make: 'Apple', Model: 'iPhone 15' });
    expect(rows).toContainEqual({ label: '제조사', value: 'Apple' });
    expect(rows).toContainEqual({ label: '모델', value: 'iPhone 15' });
  });

  it('모르는 키는 원래 이름을 쓴다', () => {
    const rows = toExifRows({ SomethingWeird: 'x' });
    expect(rows).toContainEqual({ label: 'SomethingWeird', value: 'x' });
  });

  it('Date 를 읽기 좋게 만든다', () => {
    const rows = toExifRows({ DateTimeOriginal: new Date('2026-08-14T05:30:00Z') });
    const row = rows.find((r) => r.label === '촬영 일시');
    expect(row?.value).toMatch(/2026/);
  });

  it('undefined 와 null 값은 제외한다', () => {
    const rows = toExifRows({ Make: 'Apple', Model: undefined, Lens: null });
    expect(rows).toHaveLength(1);
  });

  it('배열을 쉼표로 잇는다', () => {
    const rows = toExifRows({ Components: [1, 2, 3] });
    expect(rows[0]?.value).toBe('1, 2, 3');
  });

  it('빈 객체는 빈 배열이다', () => {
    expect(toExifRows({})).toEqual([]);
  });
});

describe('extractGps', () => {
  it('latitude/longitude 를 뽑는다', () => {
    expect(extractGps({ latitude: 37.5665, longitude: 126.978 })).toEqual({
      lat: 37.5665,
      lon: 126.978,
    });
  });

  it('GPS 가 없으면 null 이다', () => {
    expect(extractGps({ Make: 'Apple' })).toBeNull();
  });

  it('한쪽만 있으면 null 이다', () => {
    expect(extractGps({ latitude: 37.5 })).toBeNull();
  });

  it('숫자가 아니면 null 이다', () => {
    expect(extractGps({ latitude: 'x', longitude: 'y' })).toBeNull();
  });
});

describe('formatCoordinate', () => {
  it('위도 경도를 소수점 6자리로 만든다', () => {
    expect(formatCoordinate(37.5665, 126.978)).toBe('37.566500, 126.978000');
  });

  it('음수 좌표를 처리한다', () => {
    expect(formatCoordinate(-33.8688, 151.2093)).toBe('-33.868800, 151.209300');
  });
});
