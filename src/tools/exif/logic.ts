export interface ExifRow {
  label: string;
  value: string;
}

const LABELS: Record<string, string> = {
  Make: '제조사',
  Model: '모델',
  LensModel: '렌즈',
  DateTimeOriginal: '촬영 일시',
  CreateDate: '생성 일시',
  ModifyDate: '수정 일시',
  ExposureTime: '노출 시간',
  FNumber: '조리개',
  ISO: 'ISO',
  FocalLength: '초점 거리',
  Orientation: '방향',
  Software: '소프트웨어',
  ImageWidth: '가로 픽셀',
  ImageHeight: '세로 픽셀',
  ExifImageWidth: '가로 픽셀',
  ExifImageHeight: '세로 픽셀',
  latitude: 'GPS 위도',
  longitude: 'GPS 경도',
  GPSAltitude: 'GPS 고도',
  Artist: '작성자',
  Copyright: '저작권',
};

function stringify(value: unknown): string {
  if (value instanceof Date) return value.toLocaleString('ko-KR');
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toExifRows(raw: Record<string, unknown>): ExifRow[] {
  const rows: ExifRow[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === '') continue;
    rows.push({ label: LABELS[key] ?? key, value: stringify(value) });
  }

  return rows;
}

export function extractGps(raw: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = raw['latitude'];
  const lon = raw['longitude'];

  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

export function formatCoordinate(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}
