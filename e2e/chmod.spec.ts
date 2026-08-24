import { test, expect, type Page } from '@playwright/test';

/**
 * chmod 권한 도구의 브라우저 계약.
 *
 * 8진수 ↔ 심볼릭 변환 자체는 유닛 테스트가 실제 OS(chmod + stat)로 뽑은 4096개
 * 벡터로 고정한다. 여기서 재는 것은 그 계산이 **화면에 어떻게 배선돼 있는가** 다.
 * 특히 체크박스 격자와 입력칸이 서로를 갱신하면서 어긋나지 않는지를 잰다 —
 * 두 곳이 같은 상태를 들고 있으면 언젠가 갈라지고, 그때 사용자는 어느 쪽을
 * 믿어야 할지 모른다.
 */

function ui(page: Page) {
  return {
    input: page.locator('#tool-root .io-wrap textarea:not([readonly])'),
    summary: page.locator('#tool-root .chmod-summary'),
    dangers: page.locator('#tool-root .chmod-warnings .io-error'),
    cautions: page.locator('#tool-root .chmod-warnings .io-warn'),
    error: page.locator('#tool-root > .tool-stack > .io-error'),
    lists: page.locator('#tool-root .result-list-wrap'),
    box: (name: string) => page.getByLabel(name, { exact: true }),
    special: (name: string) =>
      page.locator('#tool-root .chmod-specials label').filter({ hasText: name }).locator('input'),
  };
}

/** 표기 목록의 값들 (8진수 / 심볼릭 / chmod / 파일 종류) */
function detail(page: Page, label: string) {
  const list = page.locator('#tool-root .result-list-wrap').nth(1);
  return list.locator('dt').filter({ hasText: label }).locator('+ dd');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/chmod');
  await page.locator('#tool-root[data-tool="chmod"]').waitFor();
});

test('8진수를 넣으면 심볼릭 표기와 함께 요약한다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('755');
  await expect(summary).toHaveText('0755 · rwxr-xr-x');
  await expect(detail(page, '심볼릭')).toHaveText('rwxr-xr-x');
  await expect(detail(page, 'chmod')).toHaveText('chmod 755 <파일>');
});

test('심볼릭을 넣으면 8진수로 되돌린다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('rw-r--r--');
  await expect(summary).toHaveText('0644 · rw-r--r--');
  await expect(detail(page, '8진수')).toHaveText('0644');
});

test('setuid 는 소유자 실행 자리를 s 로 덮고 요약에 이름이 붙는다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('4755');
  await expect(summary).toHaveText('4755 · rwsr-xr-x · setuid');
});

test('실행 권한이 없는 setuid 는 대문자 S 다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('4644');
  await expect(summary).toHaveText('4644 · rwSr--r-- · setuid');
});

test('ls -l 한 줄을 통째로 붙여넣어도 읽고 파일 종류까지 말한다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('-rwsr-xr-x  1 root  wheel  1234 Aug 24 13:00 /usr/bin/sudo');
  await expect(summary).toHaveText('4755 · rwsr-xr-x · setuid');
  await expect(detail(page, '파일 종류')).toHaveText('일반 파일');
});

test('누가 무엇을 할 수 있는지 세 줄로 나눠 보여준다', async ({ page }) => {
  const { input, lists } = ui(page);
  await input.fill('750');

  const first = lists.nth(0);
  await expect(first.locator('dt')).toHaveCount(3);
  await expect(first.locator('dd').nth(0)).toHaveText('읽기, 쓰기, 실행');
  await expect(first.locator('dd').nth(1)).toHaveText('읽기, 실행');
  await expect(first.locator('dd').nth(2)).toHaveText('권한 없음');
});

test('777 은 위험 경고를 낸다', async ({ page }) => {
  const { input, dangers } = ui(page);
  await input.fill('777');
  await expect(dangers.filter({ hasText: '누구나 쓰고 실행할 수 있습니다' })).toHaveCount(1);
});

test('흔하고 안전한 모드에는 경고가 없다', async ({ page }) => {
  const { input, dangers, cautions, summary } = ui(page);
  await input.fill('644');
  await expect(summary).toHaveText('0644 · rw-r--r--');
  await expect(dangers).toHaveCount(0);
  await expect(cautions).toHaveCount(0);
});

test('입력한 모드가 체크박스 격자에 그대로 반영된다', async ({ page }) => {
  const { input, box, special } = ui(page);
  await input.fill('750');

  await expect(box('소유자 읽기')).toBeChecked();
  await expect(box('소유자 쓰기')).toBeChecked();
  await expect(box('소유자 실행')).toBeChecked();
  await expect(box('그룹 읽기')).toBeChecked();
  await expect(box('그룹 쓰기')).not.toBeChecked();
  await expect(box('그룹 실행')).toBeChecked();
  await expect(box('기타 읽기')).not.toBeChecked();
  await expect(special('setuid')).not.toBeChecked();
});

test('체크박스를 누르면 입력칸과 결과가 함께 따라온다', async ({ page }) => {
  const { input, box, summary } = ui(page);
  await input.fill('000');
  await expect(summary).toHaveText('0000 · ---------');

  await box('소유자 읽기').check();
  await box('소유자 쓰기').check();
  await expect(input).toHaveValue('0600');
  await expect(summary).toHaveText('0600 · rw-------');

  await box('기타 읽기').check();
  await expect(input).toHaveValue('0604');
  await expect(summary).toHaveText('0604 · rw----r--');
});

test('특수 비트 체크박스도 같은 경로로 돈다', async ({ page }) => {
  const { input, special, summary } = ui(page);
  await input.fill('755');
  await special('setuid').check();
  await expect(input).toHaveValue('4755');
  await expect(summary).toHaveText('4755 · rwsr-xr-x · setuid');
});

test('체크를 풀면 그 비트만 빠진다 — 격자와 입력칸이 갈라지지 않는다', async ({ page }) => {
  const { input, box } = ui(page);
  await input.fill('777');
  await box('기타 쓰기').uncheck();
  await expect(input).toHaveValue('0775');
  await expect(box('기타 읽기')).toBeChecked();
  await expect(box('기타 실행')).toBeChecked();
});

test('심볼릭 표현식은 조용히 넘어가지 않고 지원하지 않는다고 말한다', async ({ page }) => {
  const { input, error } = ui(page);
  await input.fill('u+rwx,go-w');
  await expect(error).toHaveText(
    'u+rwx 같은 심볼릭 표현식은 아직 지원하지 않습니다. 755 나 rwxr-xr-x 처럼 적어 주세요.',
  );
});

test('망가진 입력에 빨간 글씨를 띄우되, 빈 입력에는 띄우지 않는다', async ({ page }) => {
  const { input, error } = ui(page);

  await expect(error).toHaveText('');
  await input.fill('758');
  await expect(error).toContainText('8진수 모드에는 0~7 만');

  await input.fill('');
  await expect(error).toHaveText('');
});

test('입력을 지우면 결과와 체크박스가 함께 걷힌다', async ({ page }) => {
  const { input, summary, box } = ui(page);
  await input.fill('777');
  await expect(box('소유자 읽기')).toBeChecked();

  await input.fill('');
  await expect(summary).toHaveText('');
  await expect(box('소유자 읽기')).not.toBeChecked();
});

test('넓은 화면에서 두 결과 카드가 같은 줄에 나란히 놓인다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { input } = ui(page);
  await input.fill('755');

  const boxes = page.locator('#tool-root .chmod-panes > div');
  const left = await boxes.nth(0).boundingBox();
  const right = await boxes.nth(1).boundingBox();
  expect(left, '왼쪽 카드를 찾지 못했습니다').not.toBeNull();
  expect(right, '오른쪽 카드를 찾지 못했습니다').not.toBeNull();

  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  expect(right!.y).toBeLessThan(left!.y + left!.height);

  const row = await page.locator('#tool-root .chmod-panes').boundingBox();
  expect(right!.width).toBeGreaterThan(row!.width * 0.4);
});
