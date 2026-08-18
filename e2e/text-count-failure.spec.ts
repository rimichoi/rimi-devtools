import { test, expect, type Page } from '@playwright/test';

/*
 * 입력 처리 경로의 backstop.
 *
 * 이 도구는 마운트에 성공한 뒤 **입력할 때** 던질 수 있는 경로를 실제로 갖고 있다.
 * main.ts 의 두 catch 는 각각 "청크 못 받음" 과 "마운트 실패" 만 덮으므로 그
 * 예외는 어느 쪽에도 걸리지 않는다 — 화면은 아무 말 없이 낡은 결과를 붙들고
 * 있게 된다. IOPane 의 output:false 갈래가 그 자리를 받는다.
 *
 * 여기서 재현하는 것은 가정이 아니다. 고치기 전에 실측한 결과는 이랬다:
 *   - Intl.Segmenter 제거 → #tool-root 가 통째로 비고, 토스트는
 *     "새 버전이 배포되었습니다. 새로고침해 주세요." (새로고침해도 소용없는데도)
 *   - TextDecoder('euc-kr') 미지원 → 이미 정상. ToolResult 로 돌아와 EUC-KR
 *     패널에만 한국어 오류가 붙고 나머지 계산은 그대로 나온다.
 */

/** Firefox 125 미만처럼 Intl.Segmenter 가 없는 브라우저를 만든다. */
const KILL_SEGMENTER = () => {
  delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
};

/** `euc-kr` 라벨만 거부하는 브라우저를 만든다(다른 인코딩은 그대로 둔다). */
const KILL_EUC_KR = () => {
  const Real = TextDecoder;
  const Fake = function (label?: string, options?: TextDecoderOptions) {
    if (String(label).toLowerCase() === 'euc-kr') throw new RangeError('unsupported encoding');
    return new Real(label, options);
  } as unknown as typeof TextDecoder;
  Fake.prototype = Real.prototype;
  window.TextDecoder = Fake;
};

/**
 * Segmenter 는 살아 있지만 특정 입력에서만 던지게 만든다. "정상 결과가 화면에
 * 있는 상태에서 그다음 입력이 터진다" 는 순서를 재현해야 낡은 결과가 남는지를
 * 볼 수 있다 — 처음부터 터지면 지울 낡은 결과가 애초에 없다.
 */
const POISON_SEGMENTER = () => {
  const Real = Intl.Segmenter;
  const Fake = function (this: unknown, locale?: string, options?: Intl.SegmenterOptions) {
    const real = new Real(locale, options);
    return {
      segment(text: string) {
        if (text.includes('BOOM')) throw new TypeError('segment 폭발');
        return real.segment(text);
      },
    };
  } as unknown as typeof Intl.Segmenter;
  (Intl as unknown as { Segmenter: typeof Intl.Segmenter }).Segmenter = Fake;
};

const BACKSTOP = '#tool-root .io-wrap > .io-error';

function panels(page: Page) {
  return page.locator('#tool-root .result-list-wrap');
}

test('Intl.Segmenter 가 없어도 화면이 죽지 않고 한국어 오류가 뜬다', async ({ page }) => {
  await page.addInitScript(KILL_SEGMENTER);
  await page.goto('/#/text-count');

  // 고치기 전에는 이 세 줄이 전부 실패했다 — 도구가 아예 그려지지 않았다.
  await expect(page.locator('#tool-root')).not.toBeEmpty();
  await expect(page.locator('#tool-root textarea')).toBeVisible();
  await expect(panels(page)).toHaveCount(4);

  // 새로고침을 권하는 토스트가 뜨면 안 된다. 새로고침해도 해결되지 않는다.
  await expect(page.locator('#toast-root')).not.toContainText('새 버전이 배포되었습니다');

  await page.locator('#tool-root textarea').fill('안녕하세요');

  const error = page.locator(BACKSTOP);
  await expect(error).toBeVisible();
  await expect(error).toContainText('계산 중 오류가 발생했습니다');
  await expect(error).toContainText('새로고침해도 해결되지 않습니다');

  // 그리고 아무 결과도 결과인 척 남아 있지 않다.
  for (let i = 0; i < 4; i++) {
    await expect(panels(page).nth(i).locator('.result-list')).toHaveJSProperty('hidden', true);
  }
});

test('입력 처리가 던지면 낡은 결과를 지우고 오류로 바꾼다', async ({ page }) => {
  await page.addInitScript(POISON_SEGMENTER);
  await page.goto('/#/text-count');

  const field = page.locator('#tool-root textarea');
  await field.fill('안녕하세요');
  await expect(panels(page).nth(0).locator('.result-list')).toHaveJSProperty('hidden', false);
  await expect(panels(page).nth(0).locator('.result-list dd').nth(0)).toHaveText('5');
  await expect(page.locator(BACKSTOP)).toBeHidden();

  await field.fill('안녕하세요BOOM');

  await expect(page.locator(BACKSTOP)).toContainText('계산 중 오류가 발생했습니다');
  // 낡은 '5' 가 새 입력의 답인 척 남아 있으면 안 된다.
  for (let i = 0; i < 4; i++) {
    const box = panels(page).nth(i);
    await expect(box.locator('.result-list')).toHaveJSProperty('hidden', true);
    await expect(box.locator('.result-empty')).toHaveText('텍스트를 입력하면 결과가 여기에 표시됩니다.');
  }

  // 그리고 회복 가능해야 한다 — 다음 정상 입력에서 오류가 걷히고 결과가 돌아온다.
  await field.fill('안녕');
  await expect(page.locator(BACKSTOP)).toBeHidden();
  await expect(panels(page).nth(0).locator('.result-list dd').nth(0)).toHaveText('2');
});

test('TextDecoder("euc-kr") 가 없으면 그 패널에만 오류가 붙고 나머지는 계속 센다', async ({ page }) => {
  await page.addInitScript(KILL_EUC_KR);
  await page.goto('/#/text-count');

  await page.locator('#tool-root textarea').fill('안녕하세요');

  // 이 경로는 던지지 않는다(ToolResult). 그러므로 backstop 은 조용해야 한다 —
  // 여기에 backstop 오류가 뜨면 "던지지 않는다" 는 계약이 깨진 것이다.
  await expect(page.locator(BACKSTOP)).toBeHidden();

  await expect(panels(page).nth(2).locator('.io-error')).toContainText(
    '이 브라우저에는 EUC-KR 디코더가 없어',
  );
  // 나머지 계산은 그대로 나온다.
  await expect(panels(page).nth(0).locator('.result-list dd').nth(0)).toHaveText('5');
  await expect(panels(page).nth(1).locator('.result-list dt')).toHaveText([
    '글자수 (사람이 보는 수)',
    '코드포인트 (Python·Go len)',
    'UTF-16 (Java·JS length)',
    '바이트 (UTF-8)',
  ]);
});
