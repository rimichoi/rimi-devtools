import { test, expect, type Page } from '@playwright/test';

/*
 * 글자수 세기.
 *
 * 이 스펙이 따로 있는 이유가 둘이다.
 *
 *  1. 결과의 모양. 이 도구는 결과가 "한 덩어리 텍스트" 가 아니라 통계 묶음 둘 +
 *     발견 목록 둘이라, 예전처럼 formatStats() 문자열을 출력 textarea 에 넣으면
 *     세 가지 "글자수" 가 왜 다른지도, 보이지 않는 문자를 찾았는지도 줄글에
 *     묻힌다. ioPane.ts 의 컴포넌트 선택 규칙 5번을 실제 DOM 으로 고정한다.
 *
 *  2. EUC-KR 표의 범위. 단위 테스트는 environment: 'node' 에서 도는데, Node 의
 *     `euc-kr` 디코더는 ICU 의 엄격 EUC-KR(8,412자)이라 windows-949 확장 영역
 *     ('뷁', '힣' 등)이 통째로 없다. 제품이 도는 곳은 브라우저(WHATWG,
 *     17,048자)이므로 그 범위는 **여기서만** 확인할 수 있다. 이 단언을 단위
 *     테스트로 옮기면 반드시 빨개진다.
 */

const BASIC = 0;
const UNITS = 1;
const EUC_KR = 2;
const INVISIBLE = 3;

function panel(page: Page, index: number) {
  return page.locator('#tool-root .result-list-wrap').nth(index);
}

function input(page: Page) {
  return page.locator('#tool-root textarea');
}

/** fill() 이 다루지 못하는 문자열(짝 잃은 서로게이트 등)을 직접 넣고 input 을 쏜다. */
async function setRawValue(page: Page, value: string): Promise<void> {
  // 도구 청크는 동적 import 라 goto 직후에는 아직 마운트 전일 수 있다. locator 를
  // 쓰는 경로와 달리 page.evaluate 에는 자동 대기가 없으므로 여기서 기다린다.
  await expect(input(page)).toBeVisible();
  await page.evaluate((text) => {
    const el = document.querySelector('#tool-root textarea') as HTMLTextAreaElement;
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('결과를 textarea 에 뭉치지 않고 구조화된 목록 넷으로 보여준다', async ({ page }) => {
  await page.goto('/#/text-count');

  // 입력은 여전히 대량 텍스트이므로 textarea 다. 다만 그게 유일한 textarea 여야
  // 한다 — 읽기 전용 출력 textarea 가 남아 있으면 규칙 5번을 안 따른 것이다.
  await expect(input(page)).toBeVisible();
  await expect(page.locator('#tool-root textarea')).toHaveCount(1);
  await expect(page.locator('#tool-root textarea[readonly]')).toHaveCount(0);

  await expect(page.locator('#tool-root .result-list-wrap')).toHaveCount(4);
  await expect(panel(page, BASIC).locator('label')).toHaveText('기본 통계');
  await expect(panel(page, UNITS).locator('label')).toHaveText('길이 제한 단위 (백엔드가 세는 기준)');
  await expect(panel(page, EUC_KR).locator('label')).toHaveText('EUC-KR 로 표현할 수 없는 문자');
  await expect(panel(page, INVISIBLE).locator('label')).toHaveText('보이지 않는 문자 / JSON 위험 문자');
});

test('세 가지 글자수를 한 표에 묶고, 대응하는 언어를 라벨에 적는다', async ({ page }) => {
  await page.goto('/#/text-count');
  // 가족 이모지는 셋이 전부 다른 값이 되는 대표 사례다: 사람은 1글자로 보고,
  // Python·Go 의 len() 은 5, Java·JS 의 length 는 8 이다.
  await input(page).fill('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}');

  const units = panel(page, UNITS).locator('.result-list');
  await expect(units.locator('dt')).toHaveText([
    '글자수 (사람이 보는 수)',
    '코드포인트 (Python·Go len)',
    'UTF-16 (Java·JS length)',
    '바이트 (UTF-8)',
    '바이트 (EUC-KR)',
  ]);
  const values = units.locator('dd');
  await expect(values.nth(0)).toHaveText('1');
  await expect(values.nth(1)).toHaveText('5');
  await expect(values.nth(2)).toHaveText('8');
  await expect(values.nth(3)).toHaveText('18');
});

test('EUC-KR 바이트는 UTF-8 과 다르고, windows-949 확장 한글도 2바이트로 센다', async ({ page }) => {
  await page.goto('/#/text-count');

  await input(page).fill('안녕');
  const units = panel(page, UNITS).locator('.result-list');
  await expect(units.locator('dd').nth(3)).toHaveText('6'); // UTF-8: 3바이트 × 2
  await expect(units.locator('dd').nth(4)).toHaveText('4'); // EUC-KR: 2바이트 × 2

  // '뷁' 과 '힣' 은 엄격 EUC-KR(KS X 1001)에는 없고 windows-949 확장 영역에만
  // 있다. 표를 0xA1-0xFE 만 훑도록 좁히면 여기서 "표현 불가" 로 바뀌어 죽는다.
  await input(page).fill('뷁힣');
  await expect(units.locator('dd').nth(3)).toHaveText('6');
  await expect(units.locator('dd').nth(4)).toHaveText('4');
  await expect(panel(page, EUC_KR).locator('.result-empty')).toHaveText(
    '모든 문자를 EUC-KR 로 표현할 수 있습니다.',
  );
});

test('EUC-KR 로 표현할 수 없는 문자를 코드포인트·문자·개수로 알린다', async ({ page }) => {
  await page.goto('/#/text-count');
  // 이모지 둘 + CJK 확장 한자 하나. 레거시 컬럼에 넣다 깨지는 바로 그 부류다.
  await input(page).fill('가\u{1F600}나\u{1F600}㐀');

  const list = panel(page, EUC_KR).locator('.result-list');
  await expect(list).toHaveJSProperty('hidden', false);
  await expect(list.locator('dt')).toHaveText(['U+1F600', 'U+3400']);
  await expect(list.locator('dd')).toHaveText(['\u{1F600} · 2회', '㐀 · 1회']);

  // 총합만 말하고 끝내지 않는다 — 바이트 행도 '?' 로 대체된다는 사실을 밝힌다.
  await expect(panel(page, UNITS).locator('.result-list dd').nth(4)).toHaveText(
    '7 (표현 불가 3자를 ? 1바이트로 계산)',
  );
});

test('보이지 않는 문자를 코드포인트·설명·개수·위치와 함께 알린다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill('a\u200Bb\u00A0c\n\u200B');

  const list = panel(page, INVISIBLE).locator('.result-list');
  await expect(list).toHaveJSProperty('hidden', false);
  await expect(list.locator('dt')).toHaveText(['U+200B', 'U+00A0']);
  await expect(list.locator('dd')).toHaveText([
    '제로폭 공백 (ZWSP) · 2회 · 1줄 2칸, 2줄 1칸',
    '줄바꿈 없는 공백 (NBSP) · 1회 · 1줄 4칸',
  ]);
});

test('짝 잃은 서로게이트도 잡는다 (JSON.stringify 왕복이 깨지는 입력)', async ({ page }) => {
  await page.goto('/#/text-count');
  await setRawValue(page, 'a\uD800b');

  const list = panel(page, INVISIBLE).locator('.result-list');
  await expect(list.locator('dt')).toHaveText(['U+D800']);
  await expect(list.locator('dd')).toContainText('JSON.stringify');
});

test('찾은 것이 없으면 빈 영역이 아니라 없다고 말한다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill('안녕하세요');

  for (const [index, message] of [
    [EUC_KR, '모든 문자를 EUC-KR 로 표현할 수 있습니다.'],
    [INVISIBLE, '보이지 않는 문자나 제어문자가 없습니다.'],
  ] as const) {
    const box = panel(page, index);
    await expect(box.locator('.result-list')).toHaveJSProperty('hidden', true);
    await expect(box.locator('.result-empty')).toHaveJSProperty('hidden', false);
    await expect(box.locator('.result-empty')).toHaveText(message);
  }
});

test('입력을 지우면 "없습니다" 가 아니라 대기 문구로 돌아간다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill('안녕하세요');
  await expect(panel(page, INVISIBLE).locator('.result-empty')).toHaveText(
    '보이지 않는 문자나 제어문자가 없습니다.',
  );

  await input(page).fill('');
  for (const index of [BASIC, UNITS, EUC_KR, INVISIBLE]) {
    await expect(panel(page, index).locator('.result-list')).toHaveJSProperty('hidden', true);
    await expect(panel(page, index).locator('.result-empty')).toHaveText(
      '텍스트를 입력하면 결과가 여기에 표시됩니다.',
    );
  }
});

test('NBSP 만 들어 있는 입력도 빈 입력으로 취급하지 않는다', async ({ page }) => {
  await page.goto('/#/text-count');
  // JS 의 trim() 은 U+00A0 도 지운다. 빈 입력 판정을 trim() 으로 하면 이 도구에서
  // 가장 값진 검사가 통째로 건너뛰어지고, 사용자는 아무 일도 일어나지 않는
  // 화면을 본다 — "왜 이 공백이 서버에서 안 지워지지" 를 알아보려던 바로 그 입력에서.
  await input(page).fill('\u00A0\u00A0');

  const list = panel(page, INVISIBLE).locator('.result-list');
  await expect(list).toHaveJSProperty('hidden', false);
  await expect(list.locator('dt')).toHaveText(['U+00A0']);
  await expect(list.locator('dd')).toHaveText('줄바꿈 없는 공백 (NBSP) · 2회 · 1줄 1칸, 1줄 2칸');
  await expect(panel(page, BASIC).locator('.result-list dd').nth(0)).toHaveText('2');
});

test('EUC-KR 역방향 표를 만드는 데 드는 시간은 첫 입력 한 번뿐이다', async ({ page }) => {
  await page.goto('/#/text-count');
  await expect(input(page)).toBeVisible();

  // 표를 만드는 비용이 매 키 입력마다 든다면 여기서 드러난다. 절대 시간이 아니라
  // "첫 계산 대비 이후 계산" 의 비율로 재서 기기 성능에 덜 의존하게 한다.
  const timing = await page.evaluate(() => {
    const el = document.querySelector('#tool-root textarea') as HTMLTextAreaElement;
    const type = (text: string): number => {
      el.value = text;
      const started = performance.now();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return performance.now() - started;
    };
    const first = type('가');
    let rest = 0;
    for (let i = 0; i < 20; i++) rest += type(`가나다라마${i}`);
    return { first, average: rest / 20 };
  });

  // 표 생성은 실측 10~20ms 수준이고, 표가 있는 뒤의 계산은 0.1ms 미만이다.
  // 매번 다시 만들면 average 가 first 와 같은 자릿수가 된다.
  expect(timing.average, `첫 계산 ${timing.first}ms, 이후 평균 ${timing.average}ms`).toBeLessThan(
    timing.first / 5,
  );
});
