import { test, expect } from '@playwright/test';
import { TOOL_IDS } from './tools';

test('레지스트리에 도구가 하나 이상 있다', () => {
  expect(TOOL_IDS.length).toBeGreaterThan(0);
});

for (const id of TOOL_IDS) {
  test(`${id}: 열리고 콘솔 오류가 없다`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/#/${id}`);
    await expect(page.locator(`.sidebar-link.is-active[data-tool-id="${id}"]`)).toBeVisible();
    await expect(page.locator('#tool-root')).not.toBeEmpty();

    expect(errors, `콘솔 오류: ${errors.join(' | ')}`).toEqual([]);
  });
}

test('도구 사이를 이동하면 화면이 새 도구로 교체된다', async ({ page }) => {
  if (TOOL_IDS.length < 2) test.skip();
  const [first, second] = TOOL_IDS as [string, string];

  await page.goto(`/#/${first}`);
  await expect(page.locator(`#tool-root[data-tool="${first}"]`)).toBeVisible();

  await page.locator(`.sidebar-link[data-tool-id="${second}"]`).click();

  await expect(page.locator(`.sidebar-link.is-active[data-tool-id="${second}"]`)).toBeVisible();
  await expect(page.locator(`#tool-root[data-tool="${second}"]`)).toBeVisible();
  await expect(page.locator('#tool-root')).not.toBeEmpty();
});

test('Cmd+K 로 팔레트를 열고 도구로 이동한다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');

  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  await input.fill('epoch');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/epoch$/);
  await expect(page.locator('.palette-overlay')).toBeHidden();
});
