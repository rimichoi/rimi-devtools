import type { ToolResult } from '../../types';

/*
 * chmod 모드의 순수 로직. DOM 을 참조하지 않는다.
 *
 * 이 도구가 조용히 틀릴 수 있는 자리는 둘이다.
 *
 * 1. **특수 비트가 심볼릭 표기에 그려지는 방식.** setuid 는 소유자의 실행 자리를
 *    덮어쓰는데, 실행 권한이 있으면 소문자 `s`, 없으면 대문자 `S` 다. setgid 는
 *    그룹 자리에 같은 규칙이고 sticky 는 기타 자리에 `t` / `T` 다. 한 자리라도
 *    잘못 적으면 화면에는 여전히 그럴듯한 문자열이 나온다. 그래서 규칙을 손으로
 *    확인하지 않고 실제 파일에 chmod 를 걸어 stat(1) 로 읽은 4096개 전부를
 *    테스트가 대조한다. 이 파일은 그 표를 참조하지 않는다 — 참조하면 테스트가
 *    표를 표와 비교하는 셈이 되어 아무것도 검증하지 못한다.
 *
 * 2. **같은 비트가 파일과 디렉터리에서 다른 뜻이라는 것.** 디렉터리의 실행 비트는
 *    "실행" 이 아니라 "들어가기" 이고, 읽기 비트는 "목록 보기" 다. setuid 는
 *    디렉터리에서 아예 무시되고, sticky 는 반대로 일반 파일에서 무시된다.
 *    `ls -l` 을 받아 종류를 알아냈으면서 파일 기준 문구를 쓰면, 한 화면에서
 *    "디렉터리" 라고 말하고 바로 아래에서 "실행하면" 이라고 말하게 된다.
 *    그래서 설명과 경고는 전부 `FileKind` 를 받는다.
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

/** 8진수만 입력하면 종류를 알 수 없다. 그때는 양쪽에 다 맞는 문구를 쓴다. */
export type FileKind = 'file' | 'directory' | 'link' | 'other' | 'unknown';

export interface ModeValue {
  kind: 'mode';
  mode: number;
  fileKind: FileKind;
  /** 화면에 그대로 띄우는 이름. 8진수 입력이면 알 수 없으므로 null 이다. */
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

const FILE_TYPES: Record<string, { label: string; kind: FileKind }> = {
  '-': { label: '일반 파일', kind: 'file' },
  d: { label: '디렉터리', kind: 'directory' },
  l: { label: '심볼릭 링크', kind: 'link' },
  b: { label: '블록 장치', kind: 'other' },
  c: { label: '문자 장치', kind: 'other' },
  p: { label: '이름 있는 파이프', kind: 'other' },
  s: { label: '소켓', kind: 'other' },
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

/** 오류 문구에 사용자 입력을 되돌릴 때의 상한. 10만 자를 그대로 화면에 붙이지 않는다. */
const ECHO_LIMIT = 40;

function echo(text: string): string {
  return text.length <= ECHO_LIMIT ? text : `${text.slice(0, ECHO_LIMIT)}…`;
}

export function parseMode(input: string): ToolResult<ParseOutcome> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, value: { kind: 'empty' } };

  /*
   * `chmod 755 file` 이나 `ls -l` 한 줄을 통째로 붙여넣는 일이 흔하다. 명령 이름과
   * 그 뒤의 플래그(`-R`, `--reference=...`)는 건너뛰고 첫 실제 인자를 찾는다.
   * `chmod -R 755 dir` 은 통째로 붙여넣기의 가장 흔한 형태다.
   */
  const tokens = trimmed.split(/\s+/);
  let index = 0;
  if (tokens[index] === 'chmod') {
    index++;
    while (index < tokens.length && (tokens[index] as string).startsWith('-') && (tokens[index] as string).length <= 2) {
      index++;
    }
    while (index < tokens.length && (tokens[index] as string).startsWith('--')) index++;
  }
  const rawFirst = tokens[index];
  if (rawFirst === undefined || rawFirst === '') {
    return { ok: false, error: '모드를 찾지 못했습니다.' };
  }

  if (SYMBOLIC_EXPRESSION_RE.test(rawFirst)) {
    // 조용히 무시하거나 엉뚱하게 읽는 대신 지원하지 않는다고 말한다.
    return {
      ok: false,
      error:
        'u+rwx 같은 심볼릭 표현식은 아직 지원하지 않습니다. 755 나 rwxr-xr-x 처럼 적어 주세요.',
    };
  }

  if (/^[0-7]+$/.test(rawFirst)) {
    if (rawFirst.length > 4) {
      return { ok: false, error: `8진수 모드는 최대 4자리입니다. 이 입력은 ${rawFirst.length}자리입니다.` };
    }
    return {
      ok: true,
      value: { kind: 'mode', mode: Number.parseInt(rawFirst, 8), fileKind: 'unknown', fileType: null },
    };
  }

  if (/^[0-9]+$/.test(rawFirst)) {
    return { ok: false, error: `8진수 모드에는 0~7 만 쓸 수 있습니다: "${echo(rawFirst)}"` };
  }

  /*
   * macOS 의 `ls -l` 은 확장 속성이 있으면 `-rw-r--r--@`, ACL 이 있으면
   * `drwxr-xr-x+` 로 한 글자를 더 붙인다. 이 저장소 파일들부터가 전부 `@` 다 —
   * 떼어내지 않으면 개발자가 자기 화면에서 복사한 줄이 거의 다 실패한다.
   */
  const first = /[@+]$/.test(rawFirst) ? rawFirst.slice(0, -1) : rawFirst;

  if (first.length === 10) {
    const typeChar = first[0] as string;
    const type = FILE_TYPES[typeChar];
    if (type === undefined) {
      return {
        ok: false,
        error: `모드로 읽을 수 없습니다: "${echo(rawFirst)}". 755 나 rwxr-xr-x 처럼 적어 주세요.`,
      };
    }
    const mode = toOctal(first.slice(1));
    if (!mode.ok) return mode;
    return {
      ok: true,
      value: { kind: 'mode', mode: mode.value, fileKind: type.kind, fileType: type.label },
    };
  }

  if (first.length === 9) {
    const mode = toOctal(first);
    if (!mode.ok) return mode;
    return { ok: true, value: { kind: 'mode', mode: mode.value, fileKind: 'unknown', fileType: null } };
  }

  return {
    ok: false,
    error: `모드로 읽을 수 없습니다: "${echo(rawFirst)}". 755 나 rwxr-xr-x 처럼 적어 주세요.`,
  };
}

const CLASS_LABEL: readonly [string, number][] = [
  ['소유자 (u)', 6],
  ['그룹 (g)', 3],
  ['기타 (o)', 0],
];

/*
 * 디렉터리에서는 같은 비트가 다른 일을 한다. 실행 비트는 프로그램을 돌리는 것이
 * 아니라 그 안으로 들어가는(경로를 지나가는) 권한이고, 읽기 비트는 내용을 읽는
 * 것이 아니라 목록을 보는 권한이다.
 */
const PERMISSION_WORDS: Record<'directory' | 'other', readonly [string, string, string]> = {
  directory: ['목록 보기', '만들기·지우기', '들어가기'],
  other: ['읽기', '쓰기', '실행'],
};

export function classRows(mode: number, fileKind: FileKind = 'unknown'): ClassRow[] {
  const words = PERMISSION_WORDS[fileKind === 'directory' ? 'directory' : 'other'];
  return CLASS_LABEL.map(([label, shift]) => {
    const bits = (mode >> shift) & 0b111;
    const granted: string[] = [];
    if ((bits & 0b100) !== 0) granted.push(words[0]);
    if ((bits & 0b010) !== 0) granted.push(words[1]);
    if ((bits & 0b001) !== 0) granted.push(words[2]);
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

/** 쓰기가 소유자 밖으로 열린 곳을 정확히 말한다. 둘 다면 둘 다 말한다. */
function openWriters(mode: number): string | null {
  const group = (mode & 0o020) !== 0;
  const other = (mode & 0o002) !== 0;
  if (group && other) return '그룹과 기타';
  if (other) return '기타';
  if (group) return '그룹';
  return null;
}

export function describeMode(mode: number, fileKind: FileKind = 'unknown'): ModeDescription {
  const octal = mode.toString(8).padStart(4, '0');
  const specials = specialNames(mode);
  const warnings: ChmodWarning[] = [];

  const isDirectory = fileKind === 'directory';
  const isFile = fileKind === 'file' || fileKind === 'other' || fileKind === 'link';
  const otherWrite = (mode & 0o002) !== 0;
  const otherExecute = (mode & 0o001) !== 0;
  const ownerExecute = (mode & 0o100) !== 0;
  const sticky = (mode & STICKY) !== 0;

  // ── 열린 쓰기 권한 ───────────────────────────────────────────────────
  if (otherWrite) {
    if (isDirectory || fileKind === 'unknown') {
      if (sticky) {
        /*
         * sticky 가 존재하는 이유가 정확히 1777 을 쓸 만하게 만드는 것이다.
         * 그걸 "거의 항상 잘못된 설정" 이라고 말하면서 바로 아래 줄에서 /tmp 를
         * 예로 드는 건 자기모순이다. /tmp 자체가 drwxrwxrwt 다.
         */
        warnings.push({
          severity: 'caution',
          message:
            '누구나 이 안에 파일을 만들 수 있습니다. 다만 sticky 가 걸려 있어 남이 만든 파일은 지우지 못합니다 (/tmp 가 그렇습니다).',
        });
      } else if (isDirectory) {
        warnings.push({
          severity: 'danger',
          message: '누구나 이 디렉터리에 파일을 만들고, 남의 파일도 지우거나 이름을 바꿀 수 있습니다.',
        });
      } else if (otherExecute) {
        warnings.push({
          severity: 'danger',
          message: '누구나 쓰고 실행할 수 있습니다. 배포 환경에서는 거의 항상 잘못된 설정입니다.',
        });
      } else {
        warnings.push({
          severity: 'danger',
          message: '기타 사용자가 쓸 수 있습니다. 아무나 내용을 바꿀 수 있다는 뜻입니다.',
        });
      }
    } else if (otherExecute) {
      warnings.push({
        severity: 'danger',
        message: '누구나 쓰고 실행할 수 있습니다. 배포 환경에서는 거의 항상 잘못된 설정입니다.',
      });
    } else {
      warnings.push({
        severity: 'danger',
        message: '기타 사용자가 쓸 수 있습니다. 아무나 내용을 바꿀 수 있다는 뜻입니다.',
      });
    }
  }

  // ── setuid / setgid ──────────────────────────────────────────────────
  const writers = openWriters(mode);

  for (const [bit, name, who] of [
    [SETUID, 'setuid', '소유자'],
    [SETGID, 'setgid', '그룹'],
  ] as const) {
    if ((mode & bit) === 0) continue;

    if (isDirectory) {
      if (bit === SETUID) {
        warnings.push({
          severity: 'caution',
          message: 'setuid 는 디렉터리에서 무시됩니다. 아무 효과가 없습니다.',
        });
      } else {
        warnings.push({
          severity: 'caution',
          message: '새로 만든 파일과 디렉터리가 이 디렉터리의 그룹을 물려받습니다.',
        });
      }
      continue;
    }

    if (!ownerExecute) {
      // 대문자 S 가 뜻하는 상태다. 실행 자체가 안 되는데 "실행하면" 이라고 말하면
      // 커밋이 막으려던 것과 같은 부류로 사실과 어긋난다.
      warnings.push({
        severity: 'caution',
        message: `${name} 가 걸려 있지만 소유자에게 실행 권한이 없어 지금은 효과가 없습니다.`,
      });
      continue;
    }

    if (writers !== null) {
      warnings.push({
        severity: 'danger',
        message: `${name} 가 걸린 파일에 ${writers} 쓰기 권한까지 있습니다. 그 사용자가 내용을 바꿔 ${who} 권한으로 실행시킬 수 있습니다.`,
      });
    } else {
      warnings.push({
        severity: 'caution',
        message: `${name} 가 걸려 있어 실행하면 ${who} 권한으로 돕니다.`,
      });
    }
  }

  // ── sticky ───────────────────────────────────────────────────────────
  if (sticky && !otherWrite) {
    // 쓰기가 열려 있으면 위에서 이미 sticky 를 언급했으므로 두 번 말하지 않는다.
    if (isDirectory) {
      warnings.push({
        severity: 'caution',
        message: 'sticky 가 걸려 있어 자기가 만든 파일만 지울 수 있습니다 (/tmp 가 그렇습니다).',
      });
    } else if (isFile) {
      warnings.push({
        severity: 'caution',
        message: '일반 파일의 sticky 는 요즘 시스템에서 무시됩니다.',
      });
    } else {
      warnings.push({
        severity: 'caution',
        message:
          'sticky 가 걸려 있습니다. 디렉터리면 자기가 만든 파일만 지울 수 있게 되고(/tmp 가 그렇습니다), 일반 파일에서는 무시됩니다.',
      });
    }
  }

  const summary =
    specials.length === 0
      ? `${octal} · ${toSymbolic(mode)}`
      : `${octal} · ${toSymbolic(mode)} · ${specials.join(', ')}`;

  // 특수 비트가 없으면 세 자리로 적는다. 사람이 chmod 에 넣는 모양 그대로다.
  const commandMode = specials.length === 0 ? octal.slice(1) : octal;

  return { summary, command: `chmod ${commandMode} <파일>`, warnings };
}
