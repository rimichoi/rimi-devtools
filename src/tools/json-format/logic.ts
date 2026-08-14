import type { ToolResult } from '../../types';

export interface FormatOptions {
  indent: number | 'tab' | 'minify';
  sortKeys: boolean;
}

/**
 * 문자열 리터럴 내부를 공백으로 치환한다. 길이와 위치는 그대로 둔다.
 * 문자열 안에 든 숫자를 정밀도 검사 대상에서 빼기 위한 전처리다.
 */
export function stripStringLiterals(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      out += ' ';
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ' ';
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += '"';
      inString = false;
      continue;
    }
    out += ' ';
  }

  return out;
}

/** 소수점과 지수가 붙지 않은, 16자리 이상의 정수 리터럴만 본다 */
const BIG_INT_RE = /(?<![\w.])-?\d{16,}(?![\d.eE])/g;

export function findPrecisionLoss(json: string): string[] {
  const masked = stripStringLiterals(json);
  const lost = new Set<string>();

  for (const match of masked.matchAll(BIG_INT_RE)) {
    const literal = match[0];
    const asNumber = Number(literal);

    if (!Number.isFinite(asNumber)) {
      lost.add(literal);
      continue;
    }
    try {
      if (BigInt(literal) !== BigInt(asNumber)) lost.add(literal);
    } catch {
      lost.add(literal);
    }
  }

  return [...lost];
}

export function describeSyntaxError(json: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const positionMatch = /position (\d+)/.exec(message);

  if (!positionMatch?.[1]) return `JSON 구문 오류: ${message}`;

  const position = Number(positionMatch[1]);
  const before = json.slice(0, position);
  const line = before.split('\n').length;
  const column = position - before.lastIndexOf('\n');

  return `JSON 구문 오류: ${line} 번째 줄 ${column} 번째 칸 부근을 확인하세요.\n${message}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value === null || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.map(([key, v]) => [key, sortValue(v)]));
}

export function formatJson(
  text: string,
  options: FormatOptions,
): ToolResult<{ text: string; warning?: string }> {
  if (text.trim() === '') return { ok: false, error: 'JSON 을 입력하세요.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: describeSyntaxError(text, err) };
  }

  const value = options.sortKeys ? sortValue(parsed) : parsed;
  const indent = options.indent === 'minify' ? undefined : options.indent === 'tab' ? '\t' : options.indent;
  const output = JSON.stringify(value, null, indent);

  const lost = findPrecisionLoss(text);
  const warning =
    lost.length > 0
      ? [
          '주의: 아래 숫자는 JavaScript 가 정확히 표현할 수 없어 값이 바뀌었습니다.',
          ...lost.map((literal) => `  ${literal} → ${Number(literal)}`),
          '원본 값이 필요하면 위 목록을 참고하세요. 64비트 정수 ID 에서 자주 발생합니다.',
        ].join('\n')
      : undefined;

  return { ok: true, value: { text: output, ...(warning ? { warning } : {}) } };
}
