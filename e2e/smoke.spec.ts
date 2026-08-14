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

test('Cmd+K 로 팔레트를 열고 실제 키 입력으로 도구를 검색해 이동한다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');

  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  // fill() 은 값을 한 번에 꽂아 넣어 IME 조합 등 실제 키 입력 이벤트를 만들지
  // 않는다. pressSequentially 로 한 글자씩 실제 keydown/keyup 을 발생시켜
  // 팔레트를 실제로 키보드로 구동한다.
  await input.pressSequentially('epoch');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/epoch$/);
  await expect(page.locator('.palette-overlay')).toBeHidden();
  await expect(page.locator('#tool-root[data-tool="epoch"]')).toBeVisible();

  // Enter로 이동해 닫힌 경우, 팔레트를 열기 전 있던 요소가 사이드바 재렌더로
  // 사라지므로 그리로 복원을 시도하지 않고 새로 렌더된 도구 영역으로 옮겨야 한다.
  await expect(page.locator('#tool-root')).toBeFocused();
});
