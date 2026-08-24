/*
 * src/tools/chmod/vectors.ts 를 만든다.
 *
 * 값을 손으로 적지 않는다. 실제 파일 4096개에 chmod 를 걸고 stat(1) 이 낸
 * 심볼릭 표기를 그대로 읽는다. 자세한 이유는 옆의 README.md 에 있다.
 *
 *   node tools/chmod-vectors/generate.mjs > src/tools/chmod/vectors.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'chmod-vectors-'));
try {
  /*
   * 파일의 그룹이 내가 속하지 않은 그룹이면 커널이 setgid 비트를 조용히 떨어뜨린다
   * (임시 디렉터리는 wheel 그룹으로 만들어지는 일이 흔하다). 그래서 먼저 내 기본
   * 그룹으로 바꾼다 — 이걸 빼먹으면 2000번대 2048개가 전부 0으로 돌아온다.
   */
  const group = execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim();

  const names = [];
  for (let mode = 0; mode < 4096; mode++) {
    const name = mode.toString(8).padStart(4, '0');
    writeFileSync(join(dir, name), '');
    names.push(name);
  }
  execFileSync('chgrp', [group, ...names.map((n) => join(dir, n))]);
  for (let mode = 0; mode < 4096; mode++) chmodSync(join(dir, names[mode]), mode);

  // 커널이 실제로 유지한 모드를 먼저 확인한다. 하나라도 떨어졌으면 표가 거짓이 된다.
  for (let mode = 0; mode < 4096; mode++) {
    const kept = statSync(join(dir, names[mode])).mode & 0o7777;
    if (kept !== mode) {
      throw new Error(`모드 ${names[mode]} 가 ${kept.toString(8)} 로 떨어졌다. 그룹 소유권을 확인할 것.`);
    }
  }

  const raw = execFileSync('stat', ['-f', '%N %Sp', ...names.map((n) => join(dir, n))], {
    encoding: 'utf8',
    maxBuffer: 1 << 24,
  });

  const table = new Array(4096).fill(null);
  for (const line of raw.trim().split('\n')) {
    const [path, symbolic] = line.split(' ');
    const mode = parseInt(path.slice(path.lastIndexOf('/') + 1), 8);
    // 맨 앞 글자는 파일 종류다. 권한 9글자만 남긴다.
    table[mode] = symbolic.slice(1);
  }
  if (table.some((v) => v === null || v.length !== 9)) throw new Error('표가 완성되지 않았다');

  const joined = table.join('');
  const chunks = joined.match(/.{1,96}/g) ?? [];

  process.stdout.write(
    [
      '/*',
      ' * chmod 모드 0000-7777 의 심볼릭 표기 4096개.',
      ' *',
      ' * **테스트 전용이다.** src/tools/chmod/logic.ts 는 이 표를 참조하지 않고 규칙으로',
      ' * 직접 계산한다. 구현이 이 표를 그대로 읽으면 테스트가 상수 대 상수 비교가 되어',
      ' * 아무것도 검증하지 못한다 — 이 저장소가 열 번 겪은 실수다.',
      ' *',
      ' * 값은 내가 지어낸 것이 아니라 실제 파일에 chmod 를 걸고 stat(1) 의 %Sp 로 읽은',
      ' * 것이다. 생성 방법과 근거는 tools/chmod-vectors/README.md 에 있다.',
      ' */',
      '',
      '/** 모드 하나당 9글자씩 이어붙였다. 인덱스는 mode * 9 이다. */',
      'const TABLE =',
      ...chunks.map((c, i) => `  '${c}'` + (i === chunks.length - 1 ? ';' : ' +')),
      '',
      '/** 0000-7777 의 심볼릭 표기. 범위를 벗어나면 던진다 — 테스트에서만 쓰므로 안전하다. */',
      'export function symbolicForMode(mode: number): string {',
      '  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) {',
      '    throw new Error(`표에 없는 모드: ${mode}`);',
      '  }',
      '  return TABLE.slice(mode * 9, mode * 9 + 9);',
      '}',
      '',
      '/** 표 전체를 훑는 테스트용 */',
      'export const ALL_MODES: readonly number[] = Array.from({ length: 4096 }, (_, i) => i);',
      '',
    ].join('\n'),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
