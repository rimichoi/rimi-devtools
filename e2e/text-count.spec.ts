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

/* ==========================================================================
 * 본문 강조 뷰 \u2014 찾은 문자를 "있던 자리에" 보여주기
 *
 * 좌표(`1줄 6칸`)는 사람이 다시 세어 찾아야 한다. 이 뷰는 입력을 되돌려 그리되
 * 신고 대상 문자만 눈에 보이는 표시로 바꾼다.
 *
 * 여기 있는 단언 중 절반은 보안이다. 이 상자에 들어오는 것은 사용자가 붙여넣은
 * 임의의 텍스트이고, 이런 도구에 붙여넣어지는 것에는 반드시 공격 payload 가
 * 섞인다.
 *
 * 위쪽 파일 머리말과 같은 이유로 대상 문자는 전부 \uXXXX 로 적는다 \u2014 특히
 * U+2028/U+2029 는 JS 소스에서 줄바꿈으로 취급돼 리터럴로 적으면 이 파일 자체가
 * 파싱되지 않는다.
 * ========================================================================== */

const ZWSP = '\u200B';
const NBSP = '\u00A0';
const LS = '\u2028';
const PS = '\u2029';
const RLO = '\u202E';

function highlight(page: Page) {
  return page.locator('#tool-root .text-count-highlight');
}

function body(page: Page) {
  return highlight(page).locator('.tc-body');
}

test('보이지 않는 문자를 본문에서 있던 자리에 표시한다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill(`a${ZWSP}b${NBSP}c`);

  await expect(highlight(page)).toBeVisible();
  // 평문 런과 마커가 원래 순서 그대로 번갈아 나온다 \u2014 목록의 좌표를 세지 않아도
  // 어디에 있었는지가 보인다.
  await expect(body(page).locator('span')).toHaveText(['a', 'U+200B', 'b', 'U+00A0', 'c']);
  await expect(body(page).locator('.tc-mark')).toHaveText(['U+200B', 'U+00A0']);
  // 마커는 무슨 문자인지 말한다.
  await expect(body(page).locator('.tc-mark').nth(0)).toHaveAttribute('title', '제로폭 공백 (ZWSP)');
  await expect(body(page).locator('.tc-mark').nth(1)).toHaveAttribute(
    'title',
    '줄바꿈 없는 공백 (NBSP)',
  );
});

test('깨끗한 텍스트에서는 강조 뷰를 띄우지 않고 "없습니다" 로 끝낸다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill('안녕하세요');

  await expect(highlight(page)).toHaveJSProperty('hidden', true);
  await expect(panel(page, INVISIBLE).locator('.result-empty')).toHaveText(
    '보이지 않는 문자나 제어문자가 없습니다.',
  );
});

test('입력을 지우면 강조 뷰도 걷힌다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill(`a${ZWSP}b`);
  await expect(highlight(page)).toHaveJSProperty('hidden', false);

  await input(page).fill('');
  await expect(highlight(page)).toHaveJSProperty('hidden', true);
  await expect(body(page).locator('span')).toHaveCount(0);
});

test('줄바꿈은 마커가 아니라 줄바꿈으로 읽힌다', async ({ page }) => {
  await page.goto('/#/text-count');
  await input(page).fill(`첫 줄\n둘째 줄${ZWSP}`);

  // \n 은 신고 대상이 아니므로 마커가 붙지 않는다(붙으면 거의 모든 입력이
  // 마커밭이 되어 이 뷰가 쓸모없어진다).
  await expect(body(page).locator('.tc-mark')).toHaveText(['U+200B']);
  // 그리고 실제로 두 줄로 그려져야 한다 \u2014 white-space 를 잃으면 한 줄이 된다.
  await expect(body(page)).toHaveCSS('white-space', 'pre-wrap');
  // 인라인 런의 클라이언트 사각형 수 = 그 런이 실제로 차지한 줄 수. white-space 를
  // 잃으면 '첫 줄\n둘째 줄' 이 한 줄로 붙어 여기가 1 이 된다.
  const lines = await body(page)
    .locator('.tc-run')
    .first()
    .evaluate((el) => el.getClientRects().length);
  expect(lines, '본문이 두 줄로 그려지지 않았습니다').toBeGreaterThan(1);
});

test('U+2028 / U+2029 는 마커로 바뀌고 원본 문자는 DOM 에 들어가지 않는다', async ({ page }) => {
  await page.goto('/#/text-count');
  await setRawValue(page, `a${LS}b${PS}c`);

  await expect(body(page).locator('.tc-mark')).toHaveText(['U+2028', 'U+2029']);
  const leaked = await page.evaluate(() => {
    const el = document.querySelector('#tool-root .tc-body') as HTMLElement;
    return /[\u2028\u2029]/.test(el.textContent ?? '');
  });
  expect(leaked, 'U+2028/U+2029 원본이 DOM 에 새어 들어갔습니다').toBe(false);
});

test('방향 뒤집기 문자(RLO)는 마커로 바뀌어 주변 문구를 뒤집지 못한다', async ({ page }) => {
  await page.goto('/#/text-count');
  await setRawValue(page, `invoice${RLO}gpj.exe`);

  await expect(body(page).locator('.tc-mark')).toHaveText(['U+202E']);
  // 진짜 방어는 "DOM 에 넣지 않는다" 다. #tool-root 어디에도 원본이 없어야 한다 \u2014
  // 하나라도 남으면 그 뒤의 UI 문구가 통째로 거꾸로 그려진다.
  const leaked = await page.evaluate(() =>
    /[\u202A-\u202E\u2066-\u2069]/.test(
      (document.querySelector('#tool-root') as HTMLElement).textContent ?? '',
    ),
  );
  expect(leaked, '방향 제어 문자가 DOM 에 새어 들어갔습니다').toBe(false);
});

test('붙여넣은 HTML 은 마크업이 되지 않고 글자 그대로 그려진다', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('/#/text-count');
  const payload = `<img src=x onerror=alert(1)>${ZWSP}<script>alert(2)</script>`;
  await input(page).fill(payload);

  // 요소가 만들어지지 않았다.
  await expect(page.locator('#tool-root .tc-body img')).toHaveCount(0);
  await expect(page.locator('#tool-root .tc-body script')).toHaveCount(0);
  // 글자 그대로 보인다.
  await expect(body(page)).toContainText('<img src=x onerror=alert(1)>');
  await expect(body(page)).toContainText('<script>alert(2)</script>');
  await expect(body(page).locator('.tc-mark')).toHaveText(['U+200B']);

  expect(dialogs, `alert 이 떴습니다: ${dialogs.join(', ')}`).toEqual([]);
  // onerror 가 돌려면 먼저 x 를 받으러 나가야 한다. 나간 요청이 있으면 안 된다.
  expect(requests.filter((u) => u.endsWith('/x'))).toEqual([]);
});

test('너무 긴 입력은 앞부분만 그리고, 잘랐다는 사실을 말한다', async ({ page }) => {
  await page.goto('/#/text-count');
  await expect(input(page)).toBeVisible();

  // 1MB 붙여넣기. 사람들이 실제로 하는 짓이다.
  const timing = await page.evaluate((zwsp) => {
    const el = document.querySelector('#tool-root textarea') as HTMLTextAreaElement;
    el.value = `${zwsp}${'가나다라마'.repeat(200_000)}`;
    const started = performance.now();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { ms: performance.now() - started, length: el.value.length };
  }, ZWSP);

  await expect(highlight(page)).toHaveJSProperty('hidden', false);
  await expect(highlight(page).locator('.io-warn')).toContainText('표시하지 않았습니다');
  await expect(highlight(page).locator('.io-warn')).toContainText('20,000자');

  // 잘라내는 것이 실제로 일어났는지 \u2014 상자 안 글자수로 확인한다. 상한을 없애면
  // 여기가 100만이 된다.
  const shown = await body(page).evaluate((el) => (el.textContent ?? '').length);
  expect(shown, `강조 뷰에 그려진 글자수 ${shown}`).toBeLessThan(30_000);

  // 목록 쪽 개수는 잘라내지 않은 전체 기준이다.
  await expect(panel(page, INVISIBLE).locator('.result-list dt')).toHaveText(['U+200B']);

  // 상한이 없으면 노드 수십만 개를 만들며 탭이 얼어붙는다. 넉넉히 잡아도 걸린다.
  expect(timing.ms, `1MB(${timing.length}자) 입력 처리 ${timing.ms.toFixed(1)}ms`).toBeLessThan(
    3000,
  );
});
