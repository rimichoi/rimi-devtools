import type { ToolResult } from '../../types';

export interface DateDiff {
  days: number;
  weeks: number;
  remainderDays: number;
}

const DURATION_RE = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/;

export function parseDuration(text: string): ToolResult<number> {
  const m = DURATION_RE.exec(text.trim());
  if (!m) {
    return { ok: false, error: 'HH:MM:SS 또는 MM:SS 형식으로 입력하세요. (분/초는 59 까지)' };
  }

  const [, first, second, third] = m as unknown as string[];
  if (third === undefined) {
    // MM:SS 로 해석한다
    return { ok: true, value: Number(first) * 60 + Number(second) };
  }
  return { ok: true, value: Number(first) * 3600 + Number(second) * 60 + Number(third) };
}

export function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${sign}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function addDuration(a: string, b: string, op: '+' | '-'): ToolResult<string> {
  const left = parseDuration(a);
  if (!left.ok) return left;
  const right = parseDuration(b);
  if (!right.ok) return right;

  const total = op === '+' ? left.value + right.value : left.value - right.value;
  return { ok: true, value: formatDuration(total) };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(text: string): ToolResult<Date> {
  const m = DATE_RE.exec(text.trim());
  if (!m) return { ok: false, error: 'YYYY-MM-DD 형식으로 입력하세요.' };

  const [, y, mo, d] = m as unknown as string[];
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, error: '존재하지 않는 날짜입니다.' };
  }
  return { ok: true, value: date };
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const DAY_MS = 24 * 3600_000;

export function diffDates(from: string, to: string): ToolResult<DateDiff> {
  const a = parseDate(from);
  if (!a.ok) return a;
  const b = parseDate(to);
  if (!b.ok) return b;

  // UTC 자정 기준이라 서머타임 영향 없이 정확히 나눠떨어진다
  const days = Math.round((b.value.getTime() - a.value.getTime()) / DAY_MS);
  return {
    ok: true,
    value: {
      days,
      weeks: Math.trunc(days / 7),
      remainderDays: days % 7,
    },
  };
}

export function shiftDate(date: string, days: number): ToolResult<string> {
  if (!Number.isFinite(days)) return { ok: false, error: '더할 일수를 숫자로 입력하세요.' };
  if (!Number.isInteger(days)) return { ok: false, error: '더할 일수는 정수로 입력하세요.' };

  const base = parseDate(date);
  if (!base.ok) return base;

  const shifted = new Date(base.value.getTime() + days * DAY_MS);
  /*
   * 화면의 입력 필터가 무엇을 걸러 주든 이 층은 스스로 방어한다 — 필터는 편의지
   * 경계가 아니다. 그리고 여기서 막지 않으면 실제로 새어 나가는 값이 있었다:
   * `999999999999` 같은 큰 일수는 Date 의 표현 범위(±8.64e15ms)를 넘겨 Invalid
   * Date 가 되고, 그대로 형식화하면 `NaN-NaN-NaN` 이 '결과' 랍시고 화면에 뜬다.
   * 범위 안이어도 연도가 네 자리를 벗어나면 이 도구가 약속한 YYYY-MM-DD 가
   * 아니게 되므로(그 값을 다시 입력칸에 넣으면 파싱되지 않는다) 함께 막는다.
   */
  const year = shifted.getUTCFullYear();
  if (!Number.isFinite(year) || year < 0 || year > 9999) {
    return { ok: false, error: '계산한 날짜가 YYYY-MM-DD 로 나타낼 수 있는 범위를 벗어났습니다.' };
  }

  return { ok: true, value: formatDate(shifted) };
}
