import { test, expect, type Locator, type Page } from '@playwright/test';

/*
 * 시간/날짜 계산기의 입력 마스크.
 *
 * 자동 서식은 잘못 만들면 원래보다 나쁘다 — 백스페이스가 안 먹고, 캐럿이 끝으로
 * 튀고, 한글 조합 중에 글자가 사라진다. 여기 있는 것은 전부 그 부류의 실패다.
 * 순수 변환 자체(무엇을 무엇으로 바꾸는가)는 단위 테스트가 맡고, 이 스펙은
 * **실제 입력칸에 붙였을 때만 드러나는** 것 — 캐럿, 백스페이스, IME, 붙여넣기 —
 * 만 본다.
 */

const MODE_DIFF = 'diff';
const MODE_SHIFT = 'shift';

function fields(page: Page): Locator {
  return page.locator('#tool-root .form-grid input');
}

async function selectMode(page: Page, mode: string): Promise<void> {
  await page.locator('#tool-root select').first().selectOption(mode);
}

/** 캐럿 위치(selectionStart)를 읽는다. */
function caretOf(field: Locator): Promise<number | null> {
  return field.evaluate((el) => (el as HTMLInputElement).selectionStart);
}

/**
 * 붙여넣기를 재현한다. 브라우저는 붙여넣기가 끝난 **뒤에** value 가 이미 바뀐
 * 상태로 inputType: 'insertFromPaste' 인 input 이벤트를 쏜다 — 그 모양 그대로 만든다.
 */
async function paste(field: Locator, text: string): Promise<void> {
  await field.evaluate((node, value) => {
    const el = node as HTMLInputElement;
    el.focus();
    el.value = value;
    el.setSelectionRange(value.length, value.length);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  }, text);
}

test.describe('날짜 칸 자동 서식', () => {
  test('숫자만 쳐도 YYYY-MM-DD 가 된다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    const start = fields(page).nth(0);
    await start.click();
    await start.pressSequentially('20260814');
    await expect(start).toHaveValue('2026-08-14');
  });

  test('치는 도중의 부분 입력이 다시 쓰이지 않는다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    const start = fields(page).nth(0);
    await start.click();
    await start.pressSequentially('2026');
    // 자리수를 채웠다고 끝에 '-' 를 붙이면 다음 백스페이스가 갇힌다.
    await expect(start).toHaveValue('2026');
    await start.pressSequentially('0');
    await expect(start).toHaveValue('2026-0');
  });

  test('백스페이스가 갇히지 않는다 — 누를 때마다 한 글자씩 줄어든다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    const start = fields(page).nth(0);
    await start.click();
    await start.pressSequentially('20260814');
    await expect(start).toHaveValue('2026-08-14');

    // 마스크가 구분자를 되돌려 놓는 구현이면 여기 어딘가에서 값이 멈춘다.
    for (const expected of ['2026-08-1', '2026-08', '2026-0', '2026', '202', '20', '2', '']) {
      await page.keyboard.press('Backspace');
      await expect(start).toHaveValue(expected);
    }
  });

  test('구분자 위에서 백스페이스를 누르면 그 앞 숫자가 지워진다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    const start = fields(page).nth(0);
    await start.click();
    await start.pressSequentially('20260814');

    // 캐럿을 '2026-|08-14' 자리(구분자 바로 뒤)에 놓고 백스페이스.
    await start.evaluate((node) => (node as HTMLInputElement).setSelectionRange(5, 5));
    await page.keyboard.press('Backspace');

    // 지운 '-' 를 마스크가 되돌려 놓기만 하면 값이 그대로여서 "안 먹는" 칸이 된다.
    // 사용자가 지우려던 것은 그 앞의 '6' 이다.
    await expect(start).toHaveValue('2020-81-4');
    expect(await caretOf(start)).toBe(3);
  });

  test('값 가운데를 고쳐도 캐럿이 끝으로 튀지 않는다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    const start = fields(page).nth(0);
    await start.click();
    await start.pressSequentially('20260814');
    await expect(start).toHaveValue('2026-08-14');

    // '2026-|08-14' 에 '9' 를 끼워 넣는다.
    await start.evaluate((node) => (node as HTMLInputElement).setSelectionRange(5, 5));
    await page.keyboard.type('9');

    await expect(start).toHaveValue('2026-90-81');
    // 방금 친 '9' 바로 뒤. 끝(10)으로 튀면 다음 글자가 엉뚱한 자리에 들어간다.
    expect(await caretOf(start)).toBe(6);
  });

  test('어떤 표기로 붙여넣어도 2026-08-14 가 된다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    const start = fields(page).nth(0);
    for (const pasted of ['2026-08-14', '20260814', '2026/08/14', '2026.08.14']) {
      await paste(start, pasted);
      await expect(start, `붙여넣은 값: ${pasted}`).toHaveValue('2026-08-14');
    }
  });

  test('IME 조합 중에는 값을 건드리지 않고, 조합이 끝난 뒤에 정리한다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);
    const start = fields(page).nth(0);

    /*
     * 실제 OS IME 조합은 Playwright 키보드 API 로 재현할 수 없으므로, 브라우저가
     * 조합 중에 만드는 것과 같은 모양의 InputEvent(isComposing: true)를 직접
     * 쏜다. 이건 numberForm 의 가드가 보는 바로 그 속성이다. 조합 중에 value 를
     * 다시 쓰면 조합이 끊기고 확정되지 않은 글자가 사라진다.
     */
    await start.evaluate((node) => {
      const el = node as HTMLInputElement;
      el.focus();
      el.value = '2026년';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await expect(start).toHaveValue('2026년');

    // 조합이 끝나면 그때 마스크가 돈다.
    await start.evaluate((node) => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await expect(start).toHaveValue('2026');
  });

  test('두 날짜를 채우면 일수가 계산된다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_DIFF);

    await fields(page).nth(0).click();
    await fields(page).nth(0).pressSequentially('20260801');
    await fields(page).nth(1).click();
    await fields(page).nth(1).pressSequentially('20260814');

    await expect(page.locator('#tool-root .form-result')).toHaveText('13일 (1주 6일)');
  });
});

test.describe('더할 일수 칸 입력 제한', () => {
  test('숫자와 맨 앞 - 만 남는다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_SHIFT);

    const days = fields(page).nth(1);
    await days.click();
    await days.pressSequentially('a-1b2.5c');
    // 'a' 는 버려지고 '-' 가 맨 앞이 된다. '.' 도 버려진다.
    await expect(days).toHaveValue('-125');
  });

  test('- 는 맨 앞에서만 살아남는다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_SHIFT);

    const days = fields(page).nth(1);
    await days.click();
    await days.pressSequentially('5-3');
    await expect(days).toHaveValue('53');
  });

  test('숫자만 치는 동안 캐럿이 끝에 그대로 있다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_SHIFT);

    const days = fields(page).nth(1);
    await days.click();
    await days.pressSequentially('-14');
    await expect(days).toHaveValue('-14');
    expect(await caretOf(days)).toBe(3);
  });

  test('IME 조합 중에는 걸러내지 않는다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_SHIFT);
    const days = fields(page).nth(1);

    await days.evaluate((node) => {
      const el = node as HTMLInputElement;
      el.focus();
      el.value = '20일';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await expect(days).toHaveValue('20일');

    await days.evaluate((node) => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await expect(days).toHaveValue('20');
  });

  test('걸러진 값으로 날짜가 계산된다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_SHIFT);

    await fields(page).nth(0).click();
    await fields(page).nth(0).pressSequentially('20260814');
    await fields(page).nth(1).click();
    await fields(page).nth(1).pressSequentially('20');

    await expect(page.locator('#tool-root .form-result')).toHaveText('2026-09-03');
  });

  test('필터를 통과한 큰 수도 NaN-NaN-NaN 이 아니라 한국어 오류가 된다', async ({ page }) => {
    await page.goto('/#/time-calc');
    await selectMode(page, MODE_SHIFT);

    await fields(page).nth(0).click();
    await fields(page).nth(0).pressSequentially('20260814');
    await fields(page).nth(1).click();
    await fields(page).nth(1).pressSequentially('999999999999');

    const result = page.locator('#tool-root .form-result');
    await expect(result).not.toContainText('NaN');
    await expect(page.locator('#tool-root .form-grid .io-error')).toContainText(
      'YYYY-MM-DD 로 나타낼 수 있는 범위를 벗어났습니다',
    );
  });
});

/*
 * 시간 칸(기본 모드)의 마스크는 **오른쪽부터** 채운다. 날짜 마스크를 복사해 오면
 * 틀린다: `30:00`(MM:SS)과 `01:30:00`(HH:MM:SS)이 둘 다 정상 입력이고, 시는
 * 열려 있다(`100:00:00`). 변환 규칙 자체는 단위 테스트(src/ui/masks.test.ts)가
 * 맡고, 여기서는 실제 입력칸에 붙였을 때만 드러나는 것만 본다.
 */
test.describe('시간 칸 자동 서식 (오른쪽부터 채운다)', () => {
  test('숫자만 쳐도 HH:MM:SS 가 된다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('013000');
    await expect(a).toHaveValue('01:30:00');
  });

  test('구분자를 함께 쳐도 같은 값이 된다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('01:30:00');
    await expect(a).toHaveValue('01:30:00');
  });

  test('네 자리는 MM:SS 가 된다 — 앞 두 자리를 시로 못 박지 않는다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('3000');
    await expect(a).toHaveValue('30:00');
    // 그리고 이 값으로 실제 계산이 된다(MM:SS 를 parseDuration 이 받는다).
    const b = fields(page).nth(1);
    await b.click();
    await b.pressSequentially('3000');
    await expect(page.locator('#tool-root .form-result')).toHaveText('01:00:00');
  });

  test('시는 열려 있다 — 100시간을 넘겨도 잘리지 않는다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('1000000');
    await expect(a).toHaveValue('100:00:00');
  });

  test('백스페이스가 갇히지 않는다 — 누를 때마다 한 글자씩 줄어든다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('013000');
    await expect(a).toHaveValue('01:30:00');

    // 숫자가 하나 줄면 뜻이 오른쪽으로 밀리므로 값의 모양도 함께 바뀐다.
    for (const expected of ['0:13:00', '01:30', '0:13', '01', '0', '']) {
      await page.keyboard.press('Backspace');
      await expect(a).toHaveValue(expected);
    }
  });

  test('값 가운데를 고쳐도 캐럿이 방금 친 글자 뒤에 남는다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('013000');
    await expect(a).toHaveValue('01:30:00');

    // '01:3|0:00' 에 '9' 를 끼워 넣는다 → 숫자열 '0139000'
    await a.evaluate((node) => (node as HTMLInputElement).setSelectionRange(4, 4));
    await page.keyboard.type('9');

    await expect(a).toHaveValue('013:90:00');
    // 방금 친 '9' 바로 뒤. 끝으로 튀면 다음 글자가 엉뚱한 자리에 들어간다.
    expect(await caretOf(a)).toBe(5);
  });

  test('어떤 표기로 붙여넣어도 01:30:00 이 된다', async ({ page }) => {
    await page.goto('/#/time-calc');

    const a = fields(page).nth(0);
    for (const pasted of ['01:30:00', '013000', '01.30.00', '01 30 00']) {
      await paste(a, pasted);
      await expect(a, `붙여넣은 값: ${pasted}`).toHaveValue('01:30:00');
    }
  });

  test('IME 조합 중에는 값을 건드리지 않고, 조합이 끝난 뒤에 정리한다', async ({ page }) => {
    await page.goto('/#/time-calc');
    const a = fields(page).nth(0);

    await a.evaluate((node) => {
      const el = node as HTMLInputElement;
      el.focus();
      el.value = '1시간';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await expect(a).toHaveValue('1시간');

    await a.evaluate((node) => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await expect(a).toHaveValue('1');
  });

  test('마스크를 통과한 값도 분/초가 59 를 넘으면 계산 층이 한국어 오류를 낸다', async ({
    page,
  }) => {
    await page.goto('/#/time-calc');

    // 마스크는 자리만 맞춘다 — 60 분이 유효한지는 판단하지 않는다(편의지 경계가 아니다).
    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('016000');
    await expect(a).toHaveValue('01:60:00');

    const b = fields(page).nth(1);
    await b.click();
    await b.pressSequentially('000001');

    await expect(page.locator('#tool-root .form-grid .io-error')).toContainText(
      'HH:MM:SS 또는 MM:SS 형식으로 입력하세요.',
    );
  });
});

test('모드를 바꿔도 각 모드에 맞는 마스크가 새 칸에 다시 붙는다', async ({ page }) => {
  await page.goto('/#/time-calc');

  // 기본 모드(시간 더하기/빼기)의 칸은 오른쪽부터 채우는 시간 마스크다.
  await fields(page).nth(0).click();
  await fields(page).nth(0).pressSequentially('013000');
  await expect(fields(page).nth(0)).toHaveValue('01:30:00');

  // 날짜 모드의 칸은 왼쪽부터 채우는 날짜 마스크다 — 같은 숫자열이 다른 모양이 된다.
  await selectMode(page, MODE_SHIFT);
  await fields(page).nth(0).click();
  await fields(page).nth(0).pressSequentially('20260814');
  await expect(fields(page).nth(0)).toHaveValue('2026-08-14');
});
