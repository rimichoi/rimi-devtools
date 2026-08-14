import { test, expect } from '@playwright/test';
import { TOOL_IDS } from './tools';
import { extractPrecachedJsBasenames, hasChunkForId } from './precacheMatch';

// 이 태스크의 핵심 산출물(서비스 워커, precache, 오프라인 동작)을 직접 검증한다.
// workbox 의 maximumFileSizeToCacheInBytes(기본 2MiB) 는 어느 청크가 이 크기를
// 넘기면 빌드 로그 경고 한 줄만 남기고 precache 목록에서 조용히 제외한다 —
// registry.ts 에 도구를 추가/변경했는데 그 청크가 프리캐시에서 빠지는 회귀를
// 여기서 잡아야, 오프라인에서 그 도구만 조용히 죽는 사고를 미리 잡는다.

test('서비스 워커가 등록되고 활성화된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tool-root')).not.toBeEmpty();

  const active = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.scriptURL ?? null;
  });

  expect(active).toBe('http://localhost:4173/sw.js');
});

test('precache 매니페스트가 registry.ts 의 도구 청크를 id 기준으로 전부 포함한다', async ({ request }) => {
  const swText = await (await request.get('/sw.js')).text();
  const jsBasenames = extractPrecachedJsBasenames(swText);

  // 개수(예: "10개")가 아니라 도구별 id 로 대조한다 — 도구가 늘어나도 이
  // 단언이 그대로 따라와야 하고, 특정 도구 하나만 빠지는 경우를 잡아야 한다.
  // hasChunkForId 는 "json" 이 "json-diff" 청크로 오인되는 것 같은 접두어
  // 겹침도 가려낸다(아래 별도 테스트로 그 로직 자체를 검증한다).
  const missing = TOOL_IDS.filter((id) => !hasChunkForId(id, TOOL_IDS, jsBasenames));

  expect(missing, `precache 매니페스트에서 빠진 도구 청크: ${missing.join(', ')}`).toEqual([]);
});

test('precache 매칭 로직은 접두어가 겹치는 도구 id 를 혼동하지 않는다', () => {
  // registry.ts 의 실제 id 와 무관하게, "짧은 id 가 더 긴 id 의 접두어"인
  // 상황을 인위적으로 만들어 hasChunkForId 자체를 검증한다. 실제 도구 목록이
  // 이런 쌍을 갖지 않게 되더라도 이 테스트는 그 자체로 로직의 정확성을 보장한다.
  const ids = ['json', 'json-diff'];

  // "json" 청크가 실제로는 없고, "json-diff" 청크만 있는 상황 — 이전 정규식
  // (assets/{id}-[\w-]+\.js)은 "json-diff-HASH.js" 가 "json-" 로 시작한다는
  // 이유로 "json" 이 있다고 오판했다. 더 구체적인 id 가 있으면 그쪽 소유로
  // 봐야 한다.
  const onlyJsonDiffChunk = ['json-diff-Ab12Cd34.js'];
  expect(hasChunkForId('json', ids, onlyJsonDiffChunk)).toBe(false);
  expect(hasChunkForId('json-diff', ids, onlyJsonDiffChunk)).toBe(true);

  // 둘 다 진짜로 존재하면 둘 다 인정돼야 한다.
  const bothChunks = ['json-Ab12Cd34.js', 'json-diff-Ef56Gh78.js'];
  expect(hasChunkForId('json', ids, bothChunks)).toBe(true);
  expect(hasChunkForId('json-diff', ids, bothChunks)).toBe(true);

  // 아예 없으면 둘 다 없어야 한다.
  expect(hasChunkForId('json', ids, ['unrelated-Xy12.js'])).toBe(false);
  expect(hasChunkForId('json-diff', ids, ['unrelated-Xy12.js'])).toBe(false);
});

test('오프라인 상태에서, 온라인 중 방문하지 않은 도구도 마운트된다', async ({ page, context }) => {
  // 온라인으로는 기본 경로(첫 번째 도구)만 연다. 나머지 9개는 이 세션에서
  // 한 번도 온라인으로 열리지 않은 채로 오프라인 전환 후 마운트를 시도한다.
  await page.goto('/');
  await expect(page.locator('#tool-root[data-tool]')).toBeVisible();
  const firstVisited = await page.getAttribute('#tool-root', 'data-tool');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);

  // 오프라인 하드 리로드로 앱 셸이 뜨는지 먼저 확인한다.
  await page.reload();
  await expect(page.locator('#tool-root[data-tool]')).toBeVisible();

  for (const id of TOOL_IDS) {
    if (id === firstVisited) continue;

    await page.evaluate((toolId) => {
      location.hash = `#/${toolId}`;
    }, id);

    await expect(page.locator(`#tool-root[data-tool="${id}"]`)).toBeVisible();
    await expect(page.locator('#tool-root')).not.toBeEmpty();
  }

  await context.setOffline(false);
});
