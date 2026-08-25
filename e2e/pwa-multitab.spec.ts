import { test, expect, type Page } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

/*
 * 배포가 열려 있는 탭을 건드리지 않는다는 계약.
 *
 * 원래 이 파일은 "한 탭에서 새로고침을 눌렀을 때 다른 탭까지 리로드되는" 회귀를
 * 막고 있었다. 그 토스트를 지운 지금은 새 버전을 수락하는 경로 자체가 없으므로
 * 그 피해도 성립하지 않는다. 대신 **더 넓은 계약**을 여기서 잰다:
 *
 *   배포해도 열려 있는 탭은 리로드되지 않고, 입력이 남고, 옛 코드로 계속 돈다.
 *   그리고 그 업데이트는 사라지지 않는다 — 탭을 다 닫고 다시 열면 적용된다.
 *
 * 앞 절반만 재면 "서비스 워커가 업데이트를 아예 감지하지 못하는" 고장도 통과한다.
 * 뒤 절반이 그 구멍을 막는다. 둘을 한 테스트에 두는 이유이기도 하다 — 사이에
 * 같은 origin 의 탭을 전부 닫아야 하므로 순서가 계약의 일부다.
 *
 * registerType 이 'autoUpdate' 로 바뀌면 "탭이 리로드되지 않는다"·"입력이 보존된다"
 * 가 빨개진다. 그게 이 테스트가 지키는 가장 중요한 것이다 — 그 설정에서는 배포
 * 한 번에 작업 중이던 textarea 가 통째로 날아간다.
 *
 * "배포 전/배포 후" 두 버전이 실제로 달라야 하므로, 다른 e2e 스펙들이 공유하는
 * dist/(포트 4173) 를 건드리지 않고 이 테스트 전용의 임시 출력 디렉터리 + 별도
 * 포트로 독립된 빌드/프리뷰를 띄운다. 두 번째 빌드의 차이는 RIMI_DEPLOY_MARKER
 * 환경 변수로만 만든다 — 추적 대상 파일은 물론 저장소 안의 어떤 파일도 쓰지
 * 않는다(vite.config.ts 의 deployMarkerPlugin 참고).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test.describe.configure({ mode: 'serial' });

test('배포해도 열려 있는 탭은 리로드되지 않고, 그 업데이트는 다음에 열 때 적용된다', async ({
  browser,
}) => {
  test.setTimeout(120_000);

  /*
   * 포트와 마커를 실행마다 분리한다.
   *
   * mode: 'serial' 은 --repeat-each 사본에는 적용되지 않아, `--repeat-each=3` 이면
   * 워커 셋이 **동시에** 돈다. 셋 다 고정 포트를 --strictPort 로 잡으려 하면 진 쪽의
   * preview 서버가 stdio: 'pipe' 뒤에서 조용히 죽고, 그 실행은 남의 서버와 남의
   * outDir 을 상대로 테스트를 계속한다. 마커 문자열까지 고정이면 그래도 초록이
   * 나온다 — 격리가 없는데 있는 것처럼 보이는 상태다.
   */
  const info = test.info();
  const slot = info.parallelIndex;
  const port = 4199 + slot;
  const base = `http://localhost:${port}`;
  const marker = `multitab-marker-${slot}-${info.repeatEachIndex}`;

  const outDir = mkdtempSync(join(tmpdir(), 'rimi-devtools-multitab-'));
  let server: ChildProcess | undefined;

  try {
    execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, { cwd: ROOT, stdio: 'pipe' });

    server = spawn(
      'npx',
      ['vite', 'preview', '--port', String(port), '--strictPort', '--outDir', outDir],
      { cwd: ROOT, stdio: 'pipe' },
    );
    await waitForServer(base);

    const context = await browser.newContext();

    const pageA = await context.newPage();
    await pageA.goto(base + '/');
    await pageA.locator('#tool-root[data-tool="json-format"]').waitFor();
    /*
     * 서비스 워커가 실제로 붙었는지 여기서 못 박는다. `navigator.serviceWorker.ready`
     * 를 그냥 await 하면 등록이 아예 없을 때 영원히 안 풀려서, 테스트가 120초 뒤
     * "Test ended" 로 죽는다 — 무엇이 잘못됐는지 아무 말도 하지 않는 실패다.
     */
    await expect
      .poll(
        async () => pageA.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null),
        { timeout: 20_000, message: '서비스 워커가 이 탭을 제어하지 않는다 (등록됐는가?)' },
      )
      .not.toBeNull();

    const pageB = await context.newPage();
    await pageB.goto(base + '/');
    await pageB.locator('#tool-root[data-tool="json-format"]').waitFor();

    // 두 탭 모두에 작업 중인 입력을 남긴다. 배포가 이걸 건드리면 안 된다.
    const textareaA = pageA.locator('#tool-root textarea').first();
    const textareaB = pageB.locator('#tool-root textarea').first();
    const wipA = '{"WIP_A": true}';
    const wipB = '{"WIP_B": true}';
    await textareaA.fill(wipA);
    await textareaB.fill(wipB);
    await expect(textareaA).toHaveValue(wipA);
    await expect(textareaB).toHaveValue(wipB);

    // "배포" 시뮬레이션: 이전과 다른 청크를 만들어야 service worker 가 업데이트를
    // 감지한다. 예전에는 src/main.ts 를 덮어쓰고 finally 로 되돌렸는데, 동시
    // 실행에서 원복이 깨져 통과를 보고하면서도 추적 대상 소스에 마커가 영구히
    // 남았다(--repeat-each=2 --workers=2 로 재현). 이제는 파일을 전혀 쓰지 않고,
    // 이 빌드에만 환경 변수를 넘겨 vite.config.ts 의 deployMarkerPlugin 이
    // 마커를 주입하게 한다 — 디스크에 남는 것이 없으니 동시 실행에서도 안전하다.
    // --emptyOutDir 로 옛 청크를 실제로 지운다. 이게 없으면 두 빌드의 산출물이
    // 한 디렉터리에 겹쳐 쌓여, 해시가 바뀐 옛 청크가 서버에 그대로 남는다 —
    // 실제 배포와 달라서 "배포 후 옛 청크가 404 가 된다" 는 진짜 피해를 이 스펙이
    // 구조적으로 못 보게 된다(main.ts 의 청크 로드 실패 안내가 그 경우다).
    execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, RIMI_DEPLOY_MARKER: marker },
    });

    let navA = 0;
    let navB = 0;
    pageA.on('framenavigated', (f) => {
      if (f === pageA.mainFrame()) navA++;
    });
    pageB.on('framenavigated', (f) => {
      if (f === pageB.mainFrame()) navB++;
    });

    await pageA.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });

    /*
     * 아무 일도 일어나지 않는 것을 먼저 잰다. 순서가 중요하다 — 아래 "대기 상태로
     * 들어왔다" 를 먼저 재면, autoUpdate 로 바뀌었을 때 그쪽이 먼저 터져서 정작
     * 이 커밋이 지키려는 것(작업 중이던 입력)이 어느 단언에도 걸리지 않는다.
     *
     * 고정 sleep 을 쓰지 않는다. 실측으로 강제 리로드는 update() 후 약 1초에
     * 일어나므로 5초면 충분하지만, 느린 머신에서 그 창을 넘기면 아래 "대기 상태"
     * 단언이 먼저 터지면서 순서를 이렇게 짠 의미가 조용히 사라진다. 대신 둘 중
     * 먼저 일어나는 쪽까지 기다린다 — 새 워커가 대기에 들어오거나(정상),
     * 탭이 리로드되거나(고장).
     */
    await expect
      .poll(async () => (navA + navB > 0 ? 'reloaded' : await waitingState(pageA)), {
        timeout: 30_000,
        message: '새 워커가 대기 상태로도, 강제 리로드로도 이어지지 않았다',
      })
      .not.toBeNull();

    expect(navA, '탭 A는 리로드되면 안 된다').toBe(0);
    expect(navB, '탭 B는 리로드되면 안 된다').toBe(0);
    await expect(textareaA, '탭 A의 입력이 보존돼야 한다').toHaveValue(wipA);
    await expect(textareaB, '탭 B의 입력이 보존돼야 한다').toHaveValue(wipB);

    // 새 버전 안내를 띄우지 않는다 — 수락 경로 자체가 없으므로 안내할 것도 없다.
    // 문구로 재지 않는다: '새 버전이 있습니다' 는 이제 src 어디에도 없는 문자열이라
    // 그걸 찾는 단언은 어떤 구현에서도 참이다. 토스트가 **하나도 없는지**로 잰다
    // (오프라인 안내는 2.5초 뒤 스스로 사라지고, 위 폴링이 그보다 오래 기다린다).
    await expect(pageA.locator('#toast-root')).toBeEmpty();
    await expect(pageB.locator('#toast-root')).toBeEmpty();

    /*
     * 그리고 업데이트가 **감지되긴 했는지**를 확인한다. 이걸 안 재면 위의
     * "리로드되지 않았다" 가 "서비스 워커가 죽어 아무 일도 일어나지 않았다" 와
     * 구별되지 않는다.
     */
    await expect
      .poll(async () => waitingState(pageA), {
        timeout: 20_000,
        message: '새 워커가 대기 상태로 들어오지 않았다',
      })
      .toBe('installed');

    // 두 탭 모두 여전히 옛 코드다. precache 가 발밑에서 갈리지 않았다는 뜻이다.
    for (const [name, page] of [
      ['A', pageA],
      ['B', pageB],
    ] as const) {
      const seen = await page.evaluate(
        () => document.documentElement.dataset['deployMarker'] ?? null,
      );
      expect(seen, `탭 ${name}는 아직 옛 코드로 돌아야 한다`).toBeNull();
    }

    /*
     * 그리고 이 업데이트는 사라지지 않는다. 같은 origin 의 탭을 전부 닫으면
     * 대기 중이던 워커가 활성화되고, 다음에 여는 탭은 새 코드를 받는다.
     * 사용자에게는 이것이 "새 버전이 적용되는 시점" 이다.
     */
    await pageA.close();
    await pageB.close();

    const fresh = await context.newPage();
    await fresh.goto(base + '/');
    await fresh.locator('#tool-root[data-tool="json-format"]').waitFor();
    await expect
      .poll(
        async () => fresh.evaluate(() => document.documentElement.dataset['deployMarker'] ?? null),
        { timeout: 20_000, message: '탭을 다 닫고 다시 열었는데도 새 코드가 적용되지 않았다' },
      )
      .toBe(marker);

    await context.close();
  } finally {
    server?.kill();
    rmSync(outDir, { recursive: true, force: true });
  }
});

/** 대기 중인 워커의 상태. 없으면 null. */
async function waitingState(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.waiting?.state ?? null;
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 서버가 아직 안 떴다. 잠깐 쉬고 재시도.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`서버가 ${url} 에서 응답하지 않았다`);
}
