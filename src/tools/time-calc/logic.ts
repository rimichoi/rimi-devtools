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

/* ==========================================================================
 * 입력 마스크
 *
 * 순수 함수다(DOM 을 모른다). 캐럿 보정은 `numberForm.ts` 가 맡는다 — 여기에
 * 두면 vitest 의 environment: 'node' 에서 돌 수 없고, 저기 두면 도구마다 다시
 * 쓰게 된다.
 * ========================================================================== */

/**
 * 날짜 입력을 YYYY-MM-DD 모양으로 정리한다. `20260814`, `2026/08/14`,
 * `2026.08.14` 를 모두 `2026-08-14` 로 만든다.
 *
 * 핵심은 **뒤따르는 숫자가 있을 때만** '-' 를 넣는다는 것이다. 자리수를 채우자마자
 * 끝에 '-' 를 붙이는 흔한 구현은 백스페이스를 무력화한다: `2026-` 에서 '-' 를
 * 지우면 마스크가 그 자리에 '-' 를 곧바로 되돌려 놓아 캐럿이 갇힌다.
 *
 * 치는 도중의 부분 입력(`2026-0`)은 그 모양 그대로 유지된다 — 완성된 날짜만
 * 받아들이는 마스크는 사용자가 날짜를 끝까지 칠 수 없게 만든다.
 */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 8);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  let out = digits.slice(0, 4);
  if (month !== '') out += `-${month}`;
  if (day !== '') out += `-${day}`;
  return out;
}

/** 날짜 마스크에서 캐럿의 기준이 되는 문자 — '-' 는 마스크가 끼워 넣으므로 뺀다. */
export function isDateInputAnchor(char: string): boolean {
  return char >= '0' && char <= '9';
}

/**
 * 일수 입력을 숫자와 맨 앞 '-' 하나로 제한한다. `Number('abc')` 가 NaN 이 되어
 * 계산이 조용히 무너지는 자리를 아예 만들지 않는다.
 *
 * '-' 는 맨 앞에 있을 때만 살린다: `5-3` 은 `53`, `--5` 는 `-5` 가 된다.
 */
export function maskDayCountInput(raw: string): string {
  const sign = raw.startsWith('-') ? '-' : '';
  return sign + raw.replace(/[^0-9]/g, '');
}

/** 일수 마스크는 아무것도 끼워 넣지 않으므로 남는 문자 전부가 캐럿 기준이다. */
export function isDayCountInputAnchor(char: string): boolean {
  return char === '-' || (char >= '0' && char <= '9');
}
