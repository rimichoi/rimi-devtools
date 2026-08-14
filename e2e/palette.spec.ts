import { test, expect } from '@playwright/test';
import { TOOL_IDS } from './tools';

test('Escape 로 닫으면 팔레트를 열기 전 포커스로 돌아간다', async ({ page }) => {
  await page.goto('/#/epoch');
  // 재렌더로 사라지지 않을 안정적인 포커스 대상: 이미 활성 상태인 도구 자신의
  // 사이드바 링크를 클릭한다(같은 해시라 재렌더가 일어나지 않는다).
  await page.locator('.sidebar-link[data-tool-id="epoch"]').click();
  await expect(page.locator('.sidebar-link[data-tool-id="epoch"]')).toBeFocused();

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.locator('.palette-box input')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.palette-overlay')).toBeHidden();
  await expect(page.locator('.sidebar-link[data-tool-id="epoch"]')).toBeFocused();
});

test('IME 조합 중 확정되는 Enter 는 팔레트를 닫지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();
  await input.pressSequentially('포');

  // 실제 OS IME 조합은 Playwright 키보드 API로 재현할 수 없으므로, 브라우저가
  // 조합 중에 실제로 만드는 것과 같은 모양의 KeyboardEvent(isComposing: true)를
  // 직접 만들어 디스패치한다. 이는 palette.ts 의 가드가 보는 바로 그 속성이다.
  await page.evaluate(() => {
    const el = document.querySelector('.palette-box input') as HTMLInputElement;
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
  });

  // 조합 확정 Enter 로는 어디로도 이동하지 않고, 팔레트도 열려 있어야 한다.
  await expect(page).toHaveURL(/^[^#]*\/?$/);
  await expect(page.locator('.palette-overlay')).toBeVisible();

  // 조합이 끝난 뒤의 진짜 Enter 는 정상적으로 이동해야 한다(가드가 Enter 전체를
  // 막는 게 아니라 조합 중인 Enter 만 무시하는지 확인).
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/json-format$/);
  await expect(page.locator('.palette-overlay')).toBeHidden();
});

test('도구가 많아 선택 항목이 화면 밖으로 나가면 스크롤해서 보여준다', async ({ page }) => {
  test.skip(TOOL_IDS.length < 6, '스크롤이 필요할 만큼 도구 수가 많지 않습니다');

  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  for (let i = 0; i < TOOL_IDS.length - 1; i++) {
    await page.keyboard.press('ArrowDown');
  }

  const info = await page.evaluate(() => {
    const list = document.querySelector('.palette-list') as HTMLElement;
    const cursor = document.querySelector('.palette-row.is-cursor') as HTMLElement;
    const listRect = list.getBoundingClientRect();
    const cursorRect = cursor.getBoundingClientRect();
    return {
      scrollTop: list.scrollTop,
      cursorVisible: cursorRect.top >= listRect.top - 1 && cursorRect.bottom <= listRect.bottom + 1,
    };
  });

  expect(info.cursorVisible, '마지막 항목까지 ArrowDown 했는데 하이라이트가 보이지 않습니다').toBe(true);
});

test('Tab 이 팔레트 밖으로 빠져나가지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
});

test('팔레트에 모달 다이얼로그 접근성 속성이 있다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');

  const box = page.locator('.palette-box');
  await expect(box).toHaveAttribute('role', 'dialog');
  await expect(box).toHaveAttribute('aria-modal', 'true');
  await expect(box).toHaveAttribute('aria-label', /.+/);

  const input = page.locator('.palette-box input');
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(input).toHaveAttribute('aria-controls', 'palette-listbox');
  await expect(input).toHaveAttribute('aria-activedescendant', /.+/);

  const firstOption = page.locator('.palette-row').first();
  await expect(firstOption).toHaveAttribute('role', 'option');
  await expect(firstOption).toHaveAttribute('aria-selected', 'true');
});

test('즐겨찾기 별을 누르면 해당 행으로 이동하지 않고, 목록 맨 위로 고정된다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  // registry 상 세 번째 도구를 즐겨찾기한다(현재 목록: json-format, sql-format, base64, ...).
  const targetRow = page.locator('.palette-row').nth(2);
  const targetName = await targetRow.locator('.palette-row-name').textContent();
  await targetRow.locator('.palette-star').click();

  // 별을 눌러도 이동은 일어나지 않는다: 팔레트가 계속 열려 있고 해시도 그대로다.
  await expect(page.locator('.palette-overlay')).toBeVisible();
  await expect(page).toHaveURL(/^[^#]*\/?$/);

  // 검색어를 지워 전체 목록을 다시 보면 방금 즐겨찾기한 도구가 맨 위에 온다.
  await input.fill('');
  await expect(page.locator('.palette-row-name').first()).toHaveText(targetName ?? '');
});
