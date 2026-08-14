import { create } from 'jsondiffpatch';
import type { ToolResult } from '../../types';

export interface DiffLine {
  kind: 'added' | 'removed' | 'changed';
  path: string;
  before?: string;
  after?: string;
}

const differ = create({
  // 배열 원소를 인덱스로만 비교한다. objectHash 없이 이동 감지를 켜면 결과가 헷갈린다.
  arrays: { detectMove: false },
});

function show(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

function joinPath(parent: string[], key: string, isArray: boolean): string[] {
  const clean = key.startsWith('_') ? key.slice(1) : key;
  return isArray ? [...parent, `[${clean}]`] : [...parent, clean];
}

function renderPath(parts: string[]): string {
  return parts.reduce((acc, part) => {
    if (part.startsWith('[')) return acc + part;
    return acc === '' ? part : `${acc}.${part}`;
  }, '');
}

export function flattenDelta(delta: unknown, path: string[] = []): DiffLine[] {
  if (delta === undefined || delta === null || typeof delta !== 'object') return [];

  const record = delta as Record<string, unknown>;
  const isArray = record['_t'] === 'a';
  const lines: DiffLine[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (key === '_t') continue;

    const childPath = joinPath(path, key, isArray);
    const rendered = renderPath(childPath);

    if (Array.isArray(value)) {
      if (value.length === 1) {
        lines.push({ kind: 'added', path: rendered, after: show(value[0]) });
      } else if (value.length === 2) {
        lines.push({ kind: 'changed', path: rendered, before: show(value[0]), after: show(value[1]) });
      } else {
        lines.push({ kind: 'removed', path: rendered, before: show(value[0]) });
      }
      continue;
    }

    lines.push(...flattenDelta(value, childPath));
  }

  return lines;
}

const MARK: Record<DiffLine['kind'], string> = {
  added: '+',
  removed: '-',
  changed: '~',
};

export function formatDiffLines(lines: DiffLine[]): string {
  return lines
    .map((line) => {
      const head = `${MARK[line.kind]} ${line.path}`;
      if (line.kind === 'added') return `${head}: ${line.after}`;
      if (line.kind === 'removed') return `${head}: ${line.before}`;
      return `${head}: ${line.before} → ${line.after}`;
    })
    .join('\n');
}

function parseSide(text: string, label: '왼쪽' | '오른쪽'): ToolResult<unknown> {
  if (text.trim() === '') return { ok: false, error: `${label} JSON 을 입력하세요.` };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `${label} JSON 의 구문이 잘못되었습니다.\n${message}` };
  }
}

export function diffJson(leftText: string, rightText: string): ToolResult<string> {
  const left = parseSide(leftText, '왼쪽');
  if (!left.ok) return left;
  const right = parseSide(rightText, '오른쪽');
  if (!right.ok) return right;

  const delta = differ.diff(left.value, right.value);
  const lines = flattenDelta(delta);

  if (lines.length === 0) return { ok: true, value: '두 JSON 이 같습니다.' };
  return { ok: true, value: `${lines.length}개 차이\n\n${formatDiffLines(lines)}` };
}
