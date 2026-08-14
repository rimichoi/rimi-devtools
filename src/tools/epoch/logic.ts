import type { ToolResult } from '../../types';

export type EpochUnit = 'seconds' | 'milliseconds';
export type TimeZone = 'utc' | 'kst';

export interface EpochInfo {
  unit: EpochUnit;
  epochSeconds: number;
  epochMillis: number;
  iso: string;
  utc: string;
  kst: string;
  relative: string;
}

/**
 * 초와 밀리초를 자릿수로 구분한다.
 * 1e11 초는 서기 5138년, 1e11 밀리초는 1973년이라 이 값이 안전한 경계다.
 */
const MS_THRESHOLD = 1e11;

export function detectUnit(n: number): EpochUnit {
  return Math.abs(n) >= MS_THRESHOLD ? 'milliseconds' : 'seconds';
}

const TZ_NAME: Record<TimeZone, string> = { utc: 'UTC', kst: 'Asia/Seoul' };

/** sv-SE 로케일은 'YYYY-MM-DD HH:mm:ss' 형태를 준다 */
function formatIn(date: Date, zone: TimeZone): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ_NAME[zone],
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function relativeFrom(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  if (abs < 60_000) return '방금';

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600_000],
    ['month', 30 * 24 * 3600_000],
    ['day', 24 * 3600_000],
    ['hour', 3600_000],
    ['minute', 60_000],
  ];
  // numeric: 'auto' 는 -1일을 '어제' 로 바꾼다. 로그 분석에는 '1일 전' 이 낫다.
  const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'always' });

  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return '방금';
}

export function fromEpoch(
  input: string,
  forced: EpochUnit | 'auto',
  now: Date,
): ToolResult<EpochInfo> {
  const cleaned = input.replace(/[,\s_]/g, '');
  if (cleaned === '' || !/^-?\d+$/.test(cleaned)) {
    return { ok: false, error: '정수 형태의 타임스탬프를 입력하세요. (예: 1700000000)' };
  }

  const raw = Number(cleaned);
  if (!Number.isSafeInteger(raw)) {
    return { ok: false, error: '숫자가 너무 커서 정확히 처리할 수 없습니다.' };
  }

  const unit = forced === 'auto' ? detectUnit(raw) : forced;
  const millis = unit === 'seconds' ? raw * 1000 : raw;
  const date = new Date(millis);

  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: '표현할 수 있는 날짜 범위를 벗어났습니다.' };
  }

  return {
    ok: true,
    value: {
      unit,
      epochSeconds: Math.floor(millis / 1000),
      epochMillis: millis,
      iso: date.toISOString(),
      utc: formatIn(date, 'utc'),
      kst: formatIn(date, 'kst'),
      relative: relativeFrom(date, now),
    },
  };
}

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const KST_OFFSET_MS = 9 * 3600_000;

export function toEpoch(
  datetime: string,
  zone: TimeZone,
): ToolResult<{ seconds: number; millis: number }> {
  const m = DATETIME_RE.exec(datetime.trim());
  if (!m) {
    return { ok: false, error: 'YYYY-MM-DD HH:mm:ss 형식으로 입력하세요.' };
  }

  const [, y, mo, d, h, mi, s] = m as unknown as string[];
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? '0');

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utcMillis);

  // Date.UTC 는 2023-02-30 을 3월 2일로 롤오버한다. 되돌려서 일치하는지 본다.
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return { ok: false, error: '존재하지 않는 날짜 또는 시각입니다.' };
  }

  const millis = zone === 'kst' ? utcMillis - KST_OFFSET_MS : utcMillis;
  return { ok: true, value: { seconds: Math.floor(millis / 1000), millis } };
}

export function formatEpochInfo(info: EpochInfo): string {
  return [
    `입력 단위: ${info.unit === 'seconds' ? '초' : '밀리초'} (자동 판별)`,
    '',
    `UTC        ${info.utc}`,
    `KST +09:00 ${info.kst}`,
    `ISO 8601   ${info.iso}`,
    '',
    `초         ${info.epochSeconds}`,
    `밀리초     ${info.epochMillis}`,
    `상대       ${info.relative}`,
  ].join('\n');
}
