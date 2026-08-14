import type { ToolResult } from '../../types';

export interface ExifRow {
  label: string;
  value: string;
}

export interface ExifParseResult {
  rows: ExifRow[];
  /** true 면 일부 세그먼트를 읽지 못했지만(exifr silentErrors) 나머지는 정상 표시됨 */
  partial: boolean;
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

/**
 * exifr 의 기본 옵션은 silentErrors: true 라서, 일부 세그먼트가 손상된 이미지는
 * reject 하지 않고 `raw.errors` (배열)를 결과 객체에 섞어 resolve 한다. 그대로
 * toExifRows 에 넘기면 라이브러리의 영어 에러 메시지가 "메타데이터" 행인 척 표에
 * 섞여 나온다. 이 함수가 그 errors 키를 표에서 걸러내고, 남는 값이 있는지에 따라
 * 완전 실패(ToolResult ok:false)와 부분 실패(표는 채우되 partial 안내)를 가른다.
 */
export function toExifResult(raw: Record<string, unknown>): ToolResult<ExifParseResult> {
  const { errors, ...rest } = raw;
  const partial = errors !== undefined;
  const rows = toExifRows(rest);

  if (partial && rows.length === 0) {
    return {
      ok: false,
      error: '이미지 일부가 손상되어 메타데이터를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.',
    };
  }

  return { ok: true, value: { rows, partial } };
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
