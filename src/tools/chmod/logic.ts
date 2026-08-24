import type { ToolResult } from '../../types';

/*
 * chmod 모드의 순수 로직. DOM 을 참조하지 않는다.
 *
 * 이 도구가 조용히 틀릴 수 있는 자리는 **특수 비트가 심볼릭 표기에 그려지는 방식**
 * 이다. setuid 는 소유자의 실행 자리를 덮어쓰는데, 실행 권한이 있으면 소문자 `s`,
 * 없으면 대문자 `S` 다. setgid 는 그룹 자리에 같은 규칙이고, sticky 는 기타 자리에
 * `t` / `T` 다. 한 자리라도 잘못 적으면 화면에는 여전히 그럴듯한 문자열이 나온다.
 *
 * 그래서 규칙을 손으로 확인하지 않고 실제 파일에 chmod 를 걸어 stat(1) 로 읽은
 * 4096개(0000-7777) 전부를 테스트가 대조한다. 이 파일은 그 표를 참조하지 않는다 —
 * 참조하면 테스트가 표를 표와 비교하는 셈이 되어 아무것도 검증하지 못한다.
 */

export type ChmodSeverity = 'danger' | 'caution';

export interface ChmodWarning {
  severity: ChmodSeverity;
  message: string;
}

export interface ClassRow {
  label: string;
  value: string;
}

export interface ModeValue {
  kind: 'mode';
  mode: number;
  /** `ls -l` 의 첫 글자로 알아낸 것. 8진수 입력이면 알 수 없으므로 null 이다. */
  fileType: string | null;
}

export type ParseOutcome = { kind: 'empty' } | ModeValue;

export interface ModeDescription {
  summary: string;
  command: string;
  warnings: ChmodWarning[];
}

export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;

const FILE_TYPES: Record<string, string> = {
  '-': '일반 파일',
  d: '디렉터리',
  l: '심볼릭 링크',
  b: '블록 장치',
  c: '문자 장치',
  p: '이름 있는 파이프',
  s: '소켓',
};

/*
 * 한 클래스(소유자/그룹/기타)의 세 글자를 만든다.
 *
 * 세 번째 글자가 네 가지로 갈린다:
 *   실행 O + 특수비트 O -> 소문자 (s 또는 t)
 *   실행 X + 특수비트 O -> 대문자 (S 또는 T)
 *   실행 O + 특수비트 X -> x
 *   실행 X + 특수비트 X -> -
 */
function classTriplet(bits: number, special: boolean, specialChar: 's' | 't'): string {
  const read = (bits & 0b100) !== 0 ? 'r' : '-';
  const write = (bits & 0b010) !== 0 ? 'w' : '-';
  const execute = (bits & 0b001) !== 0;

  let third: string;
  if (special) third = execute ? specialChar : specialChar.toUpperCase();
  else third = execute ? 'x' : '-';

  return `${read}${write}${third}`;
}

/** 모드 → `rwxr-xr-x` 9글자 */
export function toSymbolic(mode: number): string {
  return (
    classTriplet((mode >> 6) & 0b111, (mode & SETUID) !== 0, 's') +
    classTriplet((mode >> 3) & 0b111, (mode & SETGID) !== 0, 's') +
    classTriplet(mode & 0b111, (mode & STICKY) !== 0, 't')
  );
}

/** 자리마다 올 수 있는 글자. 세 번째 자리만 클래스별로 다르다. */
const TRIPLET_THIRD: Record<'owner' | 'group' | 'other', readonly string[]> = {
  owner: ['-', 'x', 'S', 's'],
  group: ['-', 'x', 'S', 's'],
  other: ['-', 'x', 'T', 't'],
};

function parseTriplet(
  text: string,
  which: 'owner' | 'group' | 'other',
): ToolResult<{ bits: number; special: boolean }> {
  const [readChar, writeChar, thirdChar] = text as unknown as [string, string, string];

  if (readChar !== 'r' && readChar !== '-') {
    return { ok: false, error: `읽기 자리에는 r 또는 - 만 올 수 있습니다: "${readChar}"` };
  }
  if (writeChar !== 'w' && writeChar !== '-') {
    return { ok: false, error: `쓰기 자리에는 w 또는 - 만 올 수 있습니다: "${writeChar}"` };
  }
  if (!TRIPLET_THIRD[which].includes(thirdChar)) {
    return {
      ok: false,
      error: `실행 자리에는 ${TRIPLET_THIRD[which].join(' / ')} 만 올 수 있습니다: "${thirdChar}"`,
    };
  }

  const read = readChar === 'r' ? 0b100 : 0;
  const write = writeChar === 'w' ? 0b010 : 0;
  // 소문자면 실행 권한이 함께 있고, 대문자면 특수 비트만 있다.
  const execute = thirdChar === 'x' || thirdChar === 's' || thirdChar === 't' ? 0b001 : 0;
  const special = thirdChar !== '-' && thirdChar !== 'x';

  return { ok: true, value: { bits: read | write | execute, special } };
}

/** `rwxr-xr-x` 9글자 → 모드 */
export function toOctal(symbolic: string): ToolResult<number> {
  if (symbolic.length !== 9) {
    return { ok: false, error: `심볼릭 표기는 9글자여야 합니다. 이 입력은 ${symbolic.length}글자입니다.` };
  }

  const owner = parseTriplet(symbolic.slice(0, 3), 'owner');
  if (!owner.ok) return owner;
  const group = parseTriplet(symbolic.slice(3, 6), 'group');
  if (!group.ok) return group;
  const other = parseTriplet(symbolic.slice(6, 9), 'other');
  if (!other.ok) return other;

  let mode = (owner.value.bits << 6) | (group.value.bits << 3) | other.value.bits;
  if (owner.value.special) mode |= SETUID;
  if (group.value.special) mode |= SETGID;
  if (other.value.special) mode |= STICKY;

  return { ok: true, value: mode };
}

/** `u+rwx`, `go-w`, `a=r` 같은 표현식으로 보이는가 */
const SYMBOLIC_EXPRESSION_RE = /^[ugoa]*[+\-=][rwxst]*(,|$)/;

export function parseMode(input: string): ToolResult<ParseOutcome> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, value: { kind: 'empty' } };

  // `chmod 755 file` 이나 `ls -l` 한 줄을 통째로 붙여넣는 일이 흔하다.
  // 첫 토큰만 본다(chmod 는 명령 이름이므로 건너뛴다).
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0] === 'chmod' ? tokens[1] : tokens[0];
  if (first === undefined || first === '') {
    return { ok: false, error: '모드를 찾지 못했습니다.' };
  }

  if (SYMBOLIC_EXPRESSION_RE.test(first)) {
    // 조용히 무시하거나 엉뚱하게 읽는 대신 지원하지 않는다고 말한다.
    return {
      ok: false,
      error:
        'u+rwx 같은 심볼릭 표현식은 아직 지원하지 않습니다. 755 나 rwxr-xr-x 처럼 적어 주세요.',
    };
  }

  if (/^[0-7]+$/.test(first)) {
    if (first.length > 4) {
      return { ok: false, error: `8진수 모드는 최대 4자리입니다. 이 입력은 ${first.length}자리입니다.` };
    }
    return { ok: true, value: { kind: 'mode', mode: Number.parseInt(first, 8), fileType: null } };
  }

  if (/^[0-9]+$/.test(first)) {
    return { ok: false, error: `8진수 모드에는 0~7 만 쓸 수 있습니다: "${first}"` };
  }

  if (first.length === 10) {
    const typeChar = first[0] as string;
    const fileType = FILE_TYPES[typeChar];
    if (fileType === undefined) {
      return { ok: false, error: `파일 종류 글자를 알 수 없습니다: "${typeChar}"` };
    }
    const mode = toOctal(first.slice(1));
    if (!mode.ok) return mode;
    return { ok: true, value: { kind: 'mode', mode: mode.value, fileType } };
  }

  if (first.length === 9) {
    const mode = toOctal(first);
    if (!mode.ok) return mode;
    return { ok: true, value: { kind: 'mode', mode: mode.value, fileType: null } };
  }

  return {
    ok: false,
    error: `모드로 읽을 수 없습니다: "${first}". 755 나 rwxr-xr-x 처럼 적어 주세요.`,
  };
}

const CLASS_LABEL: readonly [string, number][] = [
  ['소유자 (u)', 6],
  ['그룹 (g)', 3],
  ['기타 (o)', 0],
];

export function classRows(mode: number): ClassRow[] {
  return CLASS_LABEL.map(([label, shift]) => {
    const bits = (mode >> shift) & 0b111;
    const granted: string[] = [];
    if ((bits & 0b100) !== 0) granted.push('읽기');
    if ((bits & 0b010) !== 0) granted.push('쓰기');
    if ((bits & 0b001) !== 0) granted.push('실행');
    return { label, value: granted.length === 0 ? '권한 없음' : granted.join(', ') };
  });
}

function specialNames(mode: number): string[] {
  const names: string[] = [];
  if ((mode & SETUID) !== 0) names.push('setuid');
  if ((mode & SETGID) !== 0) names.push('setgid');
  if ((mode & STICKY) !== 0) names.push('sticky');
  return names;
}

export function describeMode(mode: number): ModeDescription {
  const octal = mode.toString(8).padStart(4, '0');
  const specials = specialNames(mode);
  const warnings: ChmodWarning[] = [];

  const otherWrite = (mode & 0o002) !== 0;
  const otherExecute = (mode & 0o001) !== 0;

  if (otherWrite && otherExecute) {
    warnings.push({
      severity: 'danger',
      message: '누구나 쓰고 실행할 수 있습니다. 배포 환경에서는 거의 항상 잘못된 설정입니다.',
    });
  } else if (otherWrite) {
    warnings.push({
      severity: 'danger',
      message: '기타 사용자가 쓸 수 있습니다. 아무나 내용을 바꿀 수 있다는 뜻입니다.',
    });
  }

  if ((mode & SETUID) !== 0) {
    // 특수 비트만으로도 알릴 값이 있지만, 쓰기 권한이 붙으면 성격이 달라진다 —
    // 내용을 바꿔 넣고 소유자 권한으로 실행시킬 수 있게 된다.
    const groupWrite = (mode & 0o020) !== 0;
    if (otherWrite || groupWrite) {
      // 어느 쪽이 열렸는지 정확히 말한다. 조건은 둘 다 보는데 문구는 "기타" 라고만
      // 하면, 그룹 쓰기로 걸린 사용자가 자기 설정과 안 맞는 문장을 읽는다.
      const who = otherWrite ? '기타' : '그룹';
      warnings.push({
        severity: 'danger',
        message: `setuid 가 걸린 파일에 ${who} 쓰기 권한까지 있습니다. 그 사용자가 내용을 바꿔 소유자 권한으로 실행시킬 수 있습니다.`,
      });
    } else {
      warnings.push({
        severity: 'caution',
        message: 'setuid 가 걸려 있어 실행하면 소유자 권한으로 돕니다.',
      });
    }
  }

  if ((mode & SETGID) !== 0) {
    warnings.push({
      severity: 'caution',
      message: 'setgid 가 걸려 있습니다. 파일이면 그룹 권한으로 실행되고, 디렉터리면 새로 만든 파일이 그 그룹을 물려받습니다.',
    });
  }

  if ((mode & STICKY) !== 0) {
    warnings.push({
      severity: 'caution',
      message: 'sticky 가 걸려 있습니다. 디렉터리에서는 자기가 만든 파일만 지울 수 있게 됩니다(/tmp 가 그렇습니다).',
    });
  }

  const summary =
    specials.length === 0
      ? `${octal} · ${toSymbolic(mode)}`
      : `${octal} · ${toSymbolic(mode)} · ${specials.join(', ')}`;

  // 특수 비트가 없으면 세 자리로 적는다. 사람이 chmod 에 넣는 모양 그대로다.
  const commandMode = specials.length === 0 ? octal.slice(1) : octal;

  return { summary, command: `chmod ${commandMode} <파일>`, warnings };
}
