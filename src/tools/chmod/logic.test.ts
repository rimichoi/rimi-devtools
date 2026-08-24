import { describe, it, expect } from 'vitest';
import { parseMode, toSymbolic, toOctal, describeMode, classRows } from './logic';
import { symbolicForMode, ALL_MODES } from './vectors';

/*
 * 기대값은 리터럴로 적는다. 예외는 vectors.ts 인데, 그건 내가 지어낸 값이 아니라
 * 실제 파일에 chmod 를 걸고 stat(1) 이 낸 출력이다(tools/chmod-vectors/README.md).
 * 구현은 그 표를 참조하지 않고 규칙으로 계산하므로 상수 대 상수 비교가 아니다.
 */

function parsed(input: string) {
  const result = parseMode(input);
  if (!result.ok) throw new Error(`파싱 실패: ${result.error}`);
  if (result.value.kind !== 'mode') throw new Error(`mode 가 아니라 ${result.value.kind} 였다`);
  return result.value;
}

describe('toSymbolic — 실제 OS 가 낸 4096개와 전부 일치한다', () => {
  /*
   * 이 도구가 조용히 틀리는 자리는 특수 비트다. setuid 는 소유자의 x 를 s 로 덮고,
   * 실행 권한이 없으면 대문자 S 가 된다. sticky 는 기타의 x 를 t / T 로 덮는다.
   * 이 규칙을 한 자리라도 잘못 적으면 화면에는 그럴듯한 문자열이 나온다.
   */
  it('0000 부터 7777 까지 전부 일치한다', () => {
    const mismatches: string[] = [];
    for (const mode of ALL_MODES) {
      const got = toSymbolic(mode);
      const want = symbolicForMode(mode);
      if (got !== want) mismatches.push(`${mode.toString(8).padStart(4, '0')}: ${got} !== ${want}`);
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(mismatches.length).toBe(0);
  });

  it('특수 비트가 없는 흔한 모드', () => {
    expect(toSymbolic(0o755)).toBe('rwxr-xr-x');
    expect(toSymbolic(0o644)).toBe('rw-r--r--');
    expect(toSymbolic(0o600)).toBe('rw-------');
    expect(toSymbolic(0o777)).toBe('rwxrwxrwx');
    expect(toSymbolic(0)).toBe('---------');
  });

  it('setuid 는 소유자의 x 자리를 덮는다 — 실행 권한이 있으면 소문자 s', () => {
    expect(toSymbolic(0o4755)).toBe('rwsr-xr-x');
  });

  it('실행 권한이 없으면 대문자 S 다 — 이 구분이 사라지면 안 된다', () => {
    expect(toSymbolic(0o4644)).toBe('rwSr--r--');
  });

  it('setgid 는 그룹의 x 자리를 덮는다', () => {
    expect(toSymbolic(0o2755)).toBe('rwxr-sr-x');
    expect(toSymbolic(0o2644)).toBe('rw-r-Sr--');
  });

  it('sticky 는 기타의 x 자리를 덮고 t / T 로 쓴다', () => {
    expect(toSymbolic(0o1777)).toBe('rwxrwxrwt');
    expect(toSymbolic(0o1644)).toBe('rw-r--r-T');
  });

  it('셋이 한꺼번에 걸린 경우', () => {
    expect(toSymbolic(0o7777)).toBe('rwsrwsrwt');
    expect(toSymbolic(0o6755)).toBe('rwsr-sr-x');
    expect(toSymbolic(0o3755)).toBe('rwxr-sr-t');
  });
});

describe('toOctal', () => {
  it('심볼릭을 다시 숫자로 되돌린다 — 4096개 왕복이 어긋나지 않는다', () => {
    const mismatches: string[] = [];
    for (const mode of ALL_MODES) {
      const back = toOctal(symbolicForMode(mode));
      if (!back.ok) mismatches.push(`${mode.toString(8)}: ${back.error}`);
      else if (back.value !== mode) mismatches.push(`${mode.toString(8)} -> ${back.value.toString(8)}`);
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(mismatches.length).toBe(0);
  });

  it('대문자 S 는 실행 권한 없는 setuid 로 되돌아간다', () => {
    const result = toOctal('rwSr--r--');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(0o4644);
  });

  it('자리 수가 9가 아니면 오류다', () => {
    expect(toOctal('rwxr-xr-').ok).toBe(false);
    expect(toOctal('rwxr-xr-xx').ok).toBe(false);
  });

  it('자리에 맞지 않는 글자는 오류다', () => {
    // 첫 자리는 r 또는 - 만 온다
    expect(toOctal('xwxr-xr-x').ok).toBe(false);
    // 세 번째 자리에 t 는 올 수 없다 (sticky 는 마지막 자리다)
    expect(toOctal('rwtr-xr-x').ok).toBe(false);
    // 마지막 자리에 s 는 올 수 없다
    expect(toOctal('rwxr-xr-s').ok).toBe(false);
  });
});

describe('parseMode — 입력 형태', () => {
  it('빈 입력은 오류가 아니라 빈 결과다', () => {
    const result = parseMode('   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe('empty');
  });

  it('세 자리 8진수를 읽는다', () => {
    expect(parsed('755').mode).toBe(0o755);
  });

  it('앞에 0 이 붙어도 같다', () => {
    expect(parsed('0755').mode).toBe(0o755);
  });

  it('네 자리 8진수의 첫 자리는 특수 비트다', () => {
    expect(parsed('4755').mode).toBe(0o4755);
    expect(parsed('7777').mode).toBe(0o7777);
  });

  it('한 자리, 두 자리도 받는다', () => {
    expect(parsed('7').mode).toBe(0o7);
    expect(parsed('64').mode).toBe(0o64);
  });

  it('8 이나 9 가 들어가면 오류다 — 8진수가 아니다', () => {
    expect(parseMode('758').ok).toBe(false);
    expect(parseMode('999').ok).toBe(false);
  });

  it('다섯 자리는 오류다', () => {
    expect(parseMode('17777').ok).toBe(false);
  });

  it('심볼릭 9글자를 읽는다', () => {
    expect(parsed('rwxr-xr-x').mode).toBe(0o755);
    expect(parsed('rwsr-xr-x').mode).toBe(0o4755);
  });

  it('ls -l 의 앞 글자가 붙은 10글자도 읽는다', () => {
    expect(parsed('-rwxr-xr-x').mode).toBe(0o755);
    expect(parsed('drwxr-xr-x').mode).toBe(0o755);
    expect(parsed('lrwxrwxrwx').mode).toBe(0o777);
  });

  it('파일 종류를 함께 알려준다', () => {
    expect(parsed('drwxr-xr-x').fileType).toBe('디렉터리');
    expect(parsed('-rwxr-xr-x').fileType).toBe('일반 파일');
    expect(parsed('lrwxrwxrwx').fileType).toBe('심볼릭 링크');
    expect(parsed('755').fileType).toBe(null);
  });

  it('ls -l 한 줄을 통째로 붙여넣어도 첫 토큰만 읽는다', () => {
    expect(parsed('-rwsr-xr-x  1 root  wheel  1234 Aug 24 13:00 /usr/bin/sudo').mode).toBe(0o4755);
  });

  it('chmod 명령을 통째로 붙여넣어도 읽는다', () => {
    expect(parsed('chmod 755 ./run.sh').mode).toBe(0o755);
    expect(parsed('chmod 0644 file').mode).toBe(0o644);
  });

  it('심볼릭 표현식은 지원하지 않는다고 말한다 — 조용히 무시하지 않는다', () => {
    const result = parseMode('u+rwx,go-w');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'u+rwx 같은 심볼릭 표현식은 아직 지원하지 않습니다. 755 나 rwxr-xr-x 처럼 적어 주세요.',
      );
    }
  });

  it('+x 만 적어도 같은 안내를 한다', () => {
    expect(parseMode('+x').ok).toBe(false);
    expect(parseMode('a=r').ok).toBe(false);
  });

  it('알 수 없는 입력은 오류다', () => {
    expect(parseMode('안녕하세요').ok).toBe(false);
    expect(parseMode('rwx').ok).toBe(false);
  });
});

describe('classRows — 사람이 읽는 분해', () => {
  it('소유자 · 그룹 · 기타 세 줄을 만든다', () => {
    const rows = classRows(0o750);
    expect(rows.map((r) => r.label)).toEqual(['소유자 (u)', '그룹 (g)', '기타 (o)']);
    expect(rows[0]?.value).toBe('읽기, 쓰기, 실행');
    expect(rows[1]?.value).toBe('읽기, 실행');
    expect(rows[2]?.value).toBe('권한 없음');
  });

  it('쓰기만 있는 경우도 정확히 말한다', () => {
    expect(classRows(0o200)[0]?.value).toBe('쓰기');
  });
});

describe('describeMode — 요약과 경고', () => {
  it('8진수와 심볼릭을 함께 말한다', () => {
    expect(describeMode(0o755).summary).toBe('0755 · rwxr-xr-x');
  });

  it('특수 비트가 있으면 요약에 덧붙인다', () => {
    expect(describeMode(0o4755).summary).toBe('4755 · rwsr-xr-x · setuid');
    expect(describeMode(0o7777).summary).toBe('7777 · rwsrwsrwt · setuid, setgid, sticky');
  });

  it('777 은 위험이다', () => {
    const messages = describeMode(0o777).warnings.map((w) => w.message);
    expect(messages).toContain('누구나 쓰고 실행할 수 있습니다. 배포 환경에서는 거의 항상 잘못된 설정입니다.');
  });

  it('기타 쓰기 권한은 위험이다', () => {
    expect(describeMode(0o666).warnings.map((w) => w.message)).toContain(
      '기타 사용자가 쓸 수 있습니다. 아무나 내용을 바꿀 수 있다는 뜻입니다.',
    );
  });

  it('setuid 는 주의로 알린다', () => {
    expect(describeMode(0o4755).warnings.map((w) => w.message)).toContain(
      'setuid 가 걸려 있어 실행하면 소유자 권한으로 돕니다.',
    );
  });

  it('setuid 와 기타 쓰기가 함께면 위험 등급으로 올라간다', () => {
    const warning = describeMode(0o4757).warnings.find((w) => w.message.startsWith('setuid 가 걸린'));
    expect(warning?.message).toBe(
      'setuid 가 걸린 파일에 기타 쓰기 권한까지 있습니다. 그 사용자가 내용을 바꿔 소유자 권한으로 실행시킬 수 있습니다.',
    );
    expect(warning?.severity).toBe('danger');
  });

  it('그룹 쓰기로 걸린 경우에는 그룹이라고 말한다 — 조건과 문구가 어긋나면 안 된다', () => {
    const warning = describeMode(0o4775).warnings.find((w) => w.message.startsWith('setuid 가 걸린'));
    expect(warning?.message).toBe(
      'setuid 가 걸린 파일에 그룹 쓰기 권한까지 있습니다. 그 사용자가 내용을 바꿔 소유자 권한으로 실행시킬 수 있습니다.',
    );
  });

  it('setuid 만 있고 쓰기가 소유자에게만 열려 있으면 주의에 머문다', () => {
    const warning = describeMode(0o4755).warnings.find((w) => w.message.startsWith('setuid'));
    expect(warning?.severity).toBe('caution');
  });

  it('흔하고 안전한 모드에는 경고가 없다', () => {
    expect(describeMode(0o644).warnings).toEqual([]);
    expect(describeMode(0o755).warnings).toEqual([]);
    expect(describeMode(0o600).warnings).toEqual([]);
  });

  it('chmod 명령을 만들어 준다', () => {
    expect(describeMode(0o755).command).toBe('chmod 755 <파일>');
    expect(describeMode(0o4755).command).toBe('chmod 4755 <파일>');
  });
});

describe('교차 리뷰가 지목한 것 — 광고한 입력 형태', () => {
  /*
   * macOS 의 ls -l 은 확장 속성이 있으면 `@`, ACL 이 있으면 `+` 를 한 글자 더
   * 붙인다. 이 저장소 파일들부터가 전부 `@` 라서, 떼어내지 않으면 개발자가 자기
   * 화면에서 복사한 줄이 거의 다 실패했다. placeholder 는 붙여넣어도 된다고
   * 광고하고 있었다.
   */
  it('확장 속성 표시 @ 가 붙은 ls -l 줄을 읽는다', () => {
    const value = parsed('-rw-r--r--@ 1 rimichoi  staff  8267  8 24 15:54 index.ts');
    expect(value.mode).toBe(0o644);
    expect(value.fileType).toBe('일반 파일');
  });

  it('ACL 표시 + 가 붙은 줄도 읽는다', () => {
    const value = parsed('drwxr-xr-x+ 5 me staff 160 8 24 13:00 .');
    expect(value.mode).toBe(0o755);
    expect(value.fileKind).toBe('directory');
  });

  it('권한 9글자에 @ 만 붙은 형태도 읽는다', () => {
    expect(parsed('rwxr-xr-x@').mode).toBe(0o755);
  });

  it('chmod 의 플래그를 건너뛴다 — -R 은 가장 흔한 형태다', () => {
    expect(parsed('chmod -R 755 dir').mode).toBe(0o755);
    expect(parsed('chmod -v 0644 file').mode).toBe(0o644);
  });

  it('종류 글자가 이상한 10글자는 그렇다고 말하되 엉뚱한 안내를 하지 않는다', () => {
    const result = parseMode('zwxr-xr-xx');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('모드로 읽을 수 없습니다');
  });

  it('아주 긴 입력을 오류 문구에 통째로 되돌리지 않는다', () => {
    const result = parseMode('x'.repeat(100000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeLessThan(200);
  });
});

describe('파일과 디렉터리에서 같은 비트가 다른 뜻이다', () => {
  it('디렉터리의 실행 비트는 실행이 아니라 들어가기다', () => {
    expect(classRows(0o750, 'directory').map((r) => r.value)).toEqual([
      '목록 보기, 만들기·지우기, 들어가기',
      '목록 보기, 들어가기',
      '권한 없음',
    ]);
  });

  it('일반 파일은 그대로 읽기·쓰기·실행이다', () => {
    expect(classRows(0o750, 'file')[0]?.value).toBe('읽기, 쓰기, 실행');
  });

  it('종류를 모르면 파일 기준 문구를 쓴다', () => {
    expect(classRows(0o750)[0]?.value).toBe('읽기, 쓰기, 실행');
  });

  it('setuid 는 디렉터리에서 무시된다고 말한다 — 실행 이야기를 하지 않는다', () => {
    const messages = describeMode(0o4755, 'directory').warnings.map((w) => w.message);
    expect(messages).toContain('setuid 는 디렉터리에서 무시됩니다. 아무 효과가 없습니다.');
    expect(messages.some((m) => m.includes('실행하면'))).toBe(false);
  });

  it('setgid 는 디렉터리에서 그룹 상속을 말한다', () => {
    expect(describeMode(0o2755, 'directory').warnings.map((w) => w.message)).toContain(
      '새로 만든 파일과 디렉터리가 이 디렉터리의 그룹을 물려받습니다.',
    );
  });

  it('setgid 는 파일에서 그룹 권한 실행을 말한다', () => {
    expect(describeMode(0o2755, 'file').warnings.map((w) => w.message)).toContain(
      'setgid 가 걸려 있어 실행하면 그룹 권한으로 돕니다.',
    );
  });

  it('일반 파일의 sticky 는 무시된다고 말한다', () => {
    expect(describeMode(0o1644, 'file').warnings.map((w) => w.message)).toContain(
      '일반 파일의 sticky 는 요즘 시스템에서 무시됩니다.',
    );
  });

  it('디렉터리의 sticky 는 자기 파일만 지운다고 말한다', () => {
    expect(describeMode(0o1755, 'directory').warnings.map((w) => w.message)).toContain(
      'sticky 가 걸려 있어 자기가 만든 파일만 지울 수 있습니다 (/tmp 가 그렇습니다).',
    );
  });

  it('종류를 모르면 양쪽을 다 말한다', () => {
    expect(describeMode(0o1755).warnings.map((w) => w.message)).toContain(
      'sticky 가 걸려 있습니다. 디렉터리면 자기가 만든 파일만 지울 수 있게 되고(/tmp 가 그렇습니다), 일반 파일에서는 무시됩니다.',
    );
  });

  it('디렉터리의 기타 쓰기는 남의 파일까지 지울 수 있다고 말한다', () => {
    expect(describeMode(0o777, 'directory').warnings.map((w) => w.message)).toContain(
      '누구나 이 디렉터리에 파일을 만들고, 남의 파일도 지우거나 이름을 바꿀 수 있습니다.',
    );
  });
});

describe('1777 (/tmp) 을 잘못된 설정이라고 말하지 않는다', () => {
  /*
   * sticky 가 존재하는 이유가 정확히 1777 을 쓸 만하게 만드는 것이다. 예전에는
   * "거의 항상 잘못된 설정" 이라는 위험 경고와 "/tmp 가 그렇습니다" 라는 설명이
   * 한 화면에 같이 떴다.
   */
  it('sticky 가 걸린 1777 은 위험이 아니라 주의다', () => {
    const warnings = describeMode(0o1777, 'directory').warnings;
    expect(warnings.filter((w) => w.severity === 'danger')).toEqual([]);
    expect(warnings.map((w) => w.message)).toContain(
      '누구나 이 안에 파일을 만들 수 있습니다. 다만 sticky 가 걸려 있어 남이 만든 파일은 지우지 못합니다 (/tmp 가 그렇습니다).',
    );
  });

  it('sticky 가 없는 777 디렉터리는 여전히 위험이다', () => {
    expect(describeMode(0o777, 'directory').warnings.some((w) => w.severity === 'danger')).toBe(true);
  });

  it('같은 문장을 두 번 말하지 않는다', () => {
    const messages = describeMode(0o1777, 'directory').warnings.map((w) => w.message);
    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe('실행할 수 없는 setuid 에 실행 이야기를 하지 않는다', () => {
  it('4644 는 대문자 S 이고, 실행 권한이 없다고 말한다', () => {
    expect(describeMode(0o4644, 'file').warnings.map((w) => w.message)).toContain(
      'setuid 가 걸려 있지만 소유자에게 실행 권한이 없어 지금은 효과가 없습니다.',
    );
  });

  it('2644 도 같은 규칙이다', () => {
    expect(describeMode(0o2644, 'file').warnings.map((w) => w.message)).toContain(
      'setgid 가 걸려 있지만 소유자에게 실행 권한이 없어 지금은 효과가 없습니다.',
    );
  });
});

describe('쓰기가 열린 곳을 정확히 말한다', () => {
  it('그룹과 기타가 둘 다 열렸으면 둘 다 말한다', () => {
    expect(describeMode(0o4777, 'file').warnings.map((w) => w.message)).toContain(
      'setuid 가 걸린 파일에 그룹과 기타 쓰기 권한까지 있습니다. 그 사용자가 내용을 바꿔 소유자 권한으로 실행시킬 수 있습니다.',
    );
  });

  it('setgid 도 setuid 와 같은 등급으로 올라간다', () => {
    const warning = describeMode(0o2775, 'file').warnings.find((w) => w.message.startsWith('setgid 가 걸린'));
    expect(warning?.severity).toBe('danger');
  });
});

describe('파일 종류 라벨', () => {
  it('ls -l 의 종류 글자를 각각 옳게 읽는다', () => {
    expect(parsed('brw-r--r--').fileType).toBe('블록 장치');
    expect(parsed('crw-r--r--').fileType).toBe('문자 장치');
    expect(parsed('prw-r--r--').fileType).toBe('이름 있는 파이프');
    expect(parsed('srw-r--r--').fileType).toBe('소켓');
  });
});
