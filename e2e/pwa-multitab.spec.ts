import { test, expect } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

// N-1 회귀 가드: clientsClaim 을 켜둔 채(1차 fix 라운드) 한 탭에서 "새로고침"을
// 누르면, 아무것도 누르지 않은 다른 탭까지 예고 없이 리로드되며 작업 중이던
// 입력이 사라졌다 — 1차 리뷰가 blocking 으로 지목한 바로 그 피해가 다중 탭
// 에서 재현된 사례다. 탭 하나만 보는 테스트로는 이 결함이 영원히 잡히지 않으므로
// 여기서 실제로 두 개의 탭을 동시에 띄워 검증한다.
//
// 이 시나리오는 "배포 전/배포 후" 두 버전이 실제로 달라야 하므로, 다른
// e2e 스펙들이 공유하는 dist/(포트 4173) 를 건드리지 않고 이 테스트 전용의
// 임시 출력 디렉터리 + 별도 포트로 독립된 빌드/프리뷰를 띄운다. 두 번째 빌드의
// 차이는 RIMI_DEPLOY_MARKER 환경 변수로만 만든다 — 추적 대상 파일은 물론
// 저장소 안의 어떤 파일도 쓰지 않는다(vite.config.ts 의 deployMarkerPlugin 참고).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4199;
const BASE = `http://localhost:${PORT}`;

test.describe.configure({ mode: 'serial' });

test('여러 탭이 열려 있을 때, 동의하지 않은 다른 탭은 리로드되지 않고 입력이 보존된다', async ({ browser }) => {
  test.setTimeout(90_000);

  const outDir = mkdtempSync(join(tmpdir(), 'rimi-devtools-multitab-'));
  let server: ChildProcess | undefined;

  try {
    execSync(`npx vite build --outDir ${outDir}`, { cwd: ROOT, stdio: 'pipe' });

    server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', outDir], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    await waitForServer(BASE);

    const context = await browser.newContext();
    const pageA = await context.newPage();
    await pageA.goto(BASE + '/');
    await pageA.locator('#tool-root[data-tool="json-format"]').waitFor();
    await pageA.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    const pageB = await context.newPage();
    await pageB.goto(BASE + '/');
    await pageB.locator('#tool-root[data-tool="json-format"]').waitFor();

    const textareaB = pageB.locator('#tool-root textarea').first();
    const workInProgress = `{"WIP_${Date.now()}": true}`;
    await textareaB.fill(workInProgress);
    await expect(textareaB).toHaveValue(workInProgress);

    // "배포" 시뮬레이션: 이전과 다른 청크를 만들어야 service worker 가 업데이트를
    // 감지한다. 예전에는 src/main.ts 를 덮어쓰고 finally 로 되돌렸는데, 동시
    // 실행에서 원복이 깨져 통과를 보고하면서도 추적 대상 소스에 마커가 영구히
    // 남았다(--repeat-each=2 --workers=2 로 재현). 이제는 파일을 전혀 쓰지 않고,
    // 이 빌드에만 환경 변수를 넘겨 vite.config.ts 의 deployMarkerPlugin 이
    // 마커를 주입하게 한다 — 디스크에 남는 것이 없으니 동시 실행에서도 안전하다.
    const marker = 'multitab-test-marker';
    execSync(`npx vite build --outDir ${outDir}`, {
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
    await pageA.locator('.toast-update').waitFor({ timeout: 15_000 });
    // 탭 B 도 같은 origin 의 등록을 관찰하고 있어 독자적으로 업데이트를 감지해
    // 자기 토스트를 띄운다. 이게 끝나기 전에 탭 A 를 클릭하면, 탭 B 쪽에 아직
    // 플러그인의 controlling 리스너가 붙지 않아 회귀(clientsClaim 이 모든 탭을
    // 리로드시키는 문제)가 타이밍상 가려질 수 있다 — 반드시 기다린다.
    await pageB.locator('.toast-update').waitFor({ timeout: 15_000 });

    navA = 0;
    navB = 0;

    // 탭 A 에서만 "새로고침"을 누른다. 탭 B 는 아무것도 누르지 않는다.
    await pageA.locator('.toast-update button:not(.toast-dismiss)').click();
    await pageA.waitForTimeout(5_000);

    // 탭 A(동의한 탭)는 리로드되어 새 코드가 적용돼야 한다.
    expect(navA, '동의한 탭 A는 리로드됐어야 한다').toBeGreaterThanOrEqual(1);
    const markerA = await pageA.evaluate(() => document.documentElement.dataset['deployMarker'] ?? null);
    expect(markerA, '탭 A는 새 코드를 로드했어야 한다').toBe(marker);

    // 탭 B(동의하지 않은 탭)는 절대 리로드되면 안 되고, 입력이 보존돼야 한다.
    expect(navB, '동의하지 않은 탭 B는 리로드되면 안 된다').toBe(0);
    await expect(textareaB, '탭 B의 작업 중이던 입력값이 보존돼야 한다').toHaveValue(workInProgress);

    await context.close();
  } finally {
    server?.kill();
    rmSync(outDir, { recursive: true, force: true });
  }
});

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
