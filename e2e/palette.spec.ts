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

test('IME 조합 중에는 Escape/화살표도 IME 에 맡기고 팔레트는 반응하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();
  await input.pressSequentially('포');

  // 조합 중 Escape: 팔레트가 닫히면 안 되고(조합 취소는 IME 몫이다), 입력값도
  // 그대로 남아 있어야 한다.
  await page.evaluate(() => {
    const el = document.querySelector('.palette-box input') as HTMLInputElement;
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true }),
    );
  });
  await expect(page.locator('.palette-overlay')).toBeVisible();
  await expect(input).toHaveValue('포');

  // 조합 중 ArrowDown: 후보 이동은 IME 몫이라 팔레트의 커서가 움직이면 안 된다.
  const cursorBefore = await page.locator('.palette-row.is-cursor .palette-row-name').textContent();
  await page.evaluate(() => {
    const el = document.querySelector('.palette-box input') as HTMLInputElement;
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, isComposing: true }),
    );
  });
  const cursorAfter = await page.locator('.palette-row.is-cursor .palette-row-name').textContent();
  expect(cursorAfter).toBe(cursorBefore);

  // 조합이 끝난 뒤의 진짜 Escape 는 정상적으로 팔레트를 닫는다.
  await page.keyboard.press('Escape');
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

test('즐겨찾기는 Ctrl/Cmd+D 로 키보드만으로 토글할 수 있고, 이동을 일으키지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  // 커서(첫 행)에 대해 단축키로 즐겨찾기를 켠다. 마우스로 별 버튼을 클릭하지 않는다.
  await page.keyboard.press('ControlOrMeta+d');

  // 포커스는 input 에 그대로 있다(Tab 트랩 유지, 별도 tab-stop 으로 옮겨가지 않음).
  await expect(input).toBeFocused();
  // 토글이 이동을 일으키지 않는다.
  await expect(page.locator('.palette-overlay')).toBeVisible();
  await expect(page).toHaveURL(/^[^#]*\/?$/);
  // 즐겨찾기가 맨 위로 고정되므로, 방금 켠 도구는 계속 첫 행이고 별이 채워져 보인다.
  await expect(page.locator('.palette-row').first().locator('.palette-star')).toHaveText('★');

  // 같은 단축키로 다시 누르면 해제된다.
  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.locator('.palette-row').first().locator('.palette-star')).toHaveText('☆');
});

test('IME 조합 중에도 Ctrl/Cmd+D 는 preventDefault 되고 즐겨찾기가 토글된다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();
  await input.pressSequentially('포');

  // Ctrl/Cmd+K 와 마찬가지로 Ctrl/Cmd+D 도 IME 가 조합을 확정하는 데 쓰는 키가
  // 아니므로, 조합 중(isComposing: true)에도 이 핸들러가 먼저 처리해 브라우저의
  // 네이티브 북마크 창으로 새어 나가면 안 된다(preventDefault 확인).
  const result = await page.evaluate(() => {
    const el = document.querySelector('.palette-box input') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    el.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  });
  expect(result.defaultPrevented, '조합 중 Ctrl+D 가 preventDefault 되지 않아 브라우저로 샐 수 있습니다').toBe(true);

  // 브라우저로 새지 않을 뿐 아니라, 즐겨찾기도 실제로 켜져야 한다(무반응이면 안 됨).
  const favorites = await page.evaluate(() => localStorage.getItem('rdt.favorites'));
  expect(favorites).toBe(JSON.stringify(['json-format']));
});

test('한글 키보드 레이아웃에서도 Ctrl/Cmd+D 가 물리 키 위치(event.code) 기준으로 동작한다', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('.palette-box input');
  await expect(input).toBeVisible();

  // 한글 입력 소스가 활성일 때 물리 D 키는 event.key 로 자모(예: 'ㅇ')를 보고할 수
  // 있다. event.code('KeyD')는 레이아웃과 무관하게 항상 물리 위치를 가리키므로,
  // event.key 가 알파벳이 아니어도 단축키가 동작해야 한다.
  const result = await page.evaluate(() => {
    const el = document.querySelector('.palette-box input') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', {
      key: 'ㅇ',
      code: 'KeyD',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  });
  expect(result.defaultPrevented).toBe(true);

  const favorites = await page.evaluate(() => localStorage.getItem('rdt.favorites'));
  expect(favorites).toBe(JSON.stringify(['json-format']));
});

test('행의 접근성 이름에는 즐겨찾기 문구가 섞이지 않고, 상태는 설명으로 따로 전달된다 (전수 검증)', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.locator('.palette-box input')).toBeVisible();

  // 첫 도구를 즐겨찾기해서, 별이 있는 행과 없는 행을 모두 검사한다.
  await page.keyboard.press('ControlOrMeta+d');

  const client = await page.context().newCDPSession(page);
  const { nodes } = await client.send('Accessibility.getFullAXTree');
  const optionNodes = nodes.filter((n) => n.role?.value === 'option');

  // 도구가 10개인데 한 행만 검사하면 "즐겨찾기가 아닌 9개 행에도 상태 문구가
  // 새는" 결함을 놓친다 — 옵션 전수를 대상으로 이름과 설명을 각각 검사한다.
  expect(optionNodes.length).toBeGreaterThan(1);
  for (const node of optionNodes) {
    const name = node.name?.value ?? '';
    expect(name, `옵션 이름에 "즐겨찾기" 문구가 섞였습니다: "${name}"`).not.toContain('즐겨찾기');
  }

  // 즐겨찾기는 정확히 하나만 켰으므로, description 이 "즐겨찾기에 있음" 인 옵션도
  // 정확히 하나여야 한다. 나머지 전부는 description 이 없어야 한다.
  const withFavoriteDescription = optionNodes.filter((n) => n.description?.value === '즐겨찾기에 있음');
  expect(withFavoriteDescription.map((n) => n.name?.value)).toEqual(['JSON 포맷']);
  expect(withFavoriteDescription).toHaveLength(1);

  // option 의 description 필드만 봐서는, "즐겨찾기가 아닌 행에도 숨김 span 을 만들어
  // 두고 연결만 안 한" 경우를 놓친다 — aria-describedby 로 참조되지 않아도 DOM에
  // 존재하는 .visually-hidden span 은 그 자체로 별도의 AX 노드(예: StaticText)가
  // 돼 object/touch 탐색 등 다른 경로로 새어 나갈 수 있다. 전체 AX 트리에서 그
  // 문구를 이름으로 가진 노드 수를 세어, 즐겨찾기 개수(1)와 정확히 같은지까지
  // 확인한다 — 이게 진짜 "전수" 검증이다.
  const anyNodeWithPhrase = nodes.filter((n) => n.name?.value === '즐겨찾기에 있음');
  expect(anyNodeWithPhrase).toHaveLength(1);
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
