import { test, expect, type Locator, type Page } from '@playwright/test';

/*
 * 스칼라 입력칸의 마스크 — percent 와 epoch.
 *
 * 한 라운드 전에는 시간/날짜 계산기의 날짜 칸 둘만 마스크를 갖고, 나머지 숫자 칸
 * (퍼센트 A/B, 타임스탬프, 날짜와 시각)은 임의의 텍스트를 그대로 받았다. 같은
 * 제품 안에서 어떤 칸은 걸러 주고 어떤 칸은 안 걸러 주는 상태였고, 그 불일치가
 * 이 스펙이 존재하는 이유다.
 *
 * 순수 변환(무엇이 무엇으로 바뀌는가)은 단위 테스트(src/ui/masks.test.ts)가 맡고,
 * 여기서는 **실제 입력칸에 붙였을 때만 드러나는 것** — 캐럿, 백스페이스, IME,
 * 붙여넣기, 그리고 마스크를 통과한 값이 계산까지 이어지는지 — 만 본다.
 */

function fields(page: Page): Locator {
  return page.locator('#tool-root .form-grid input');
}

function caretOf(field: Locator): Promise<number | null> {
  return field.evaluate((el) => (el as HTMLInputElement).selectionStart);
}

/**
 * 붙여넣기를 재현한다. 브라우저는 붙여넣기가 끝난 **뒤에** value 가 이미 바뀐
 * 상태로 inputType: 'insertFromPaste' 인 input 이벤트를 쏜다.
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

test.describe('percent: 숫자 칸 (음수·소수 허용)', () => {
  test('글자는 걸러지고 소수점과 맨 앞 - 는 남는다', async ({ page }) => {
    await page.goto('/#/percent');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('약 -12.5 %');
    await expect(a).toHaveValue('-12.5');
  });

  test('소수점은 하나만 남는다', async ({ page }) => {
    await page.goto('/#/percent');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('1.2.3');
    await expect(a).toHaveValue('1.23');
  });

  test('소수점을 찍고 이어서 칠 수 있다 — 끝의 소수점이 지워지지 않는다', async ({ page }) => {
    await page.goto('/#/percent');

    const a = fields(page).nth(0);
    await a.click();
    await a.pressSequentially('12.');
    // 끝의 소수점을 마스크가 지워 버리면 소수를 입력할 방법이 없다.
    await expect(a).toHaveValue('12.');
    await a.pressSequentially('5');
    await expect(a).toHaveValue('12.5');
    expect(await caretOf(a)).toBe(4);
  });

  test('자리 구분 쉼표가 붙은 값을 붙여넣으면 순수한 숫자가 된다', async ({ page }) => {
    await page.goto('/#/percent');

    const a = fields(page).nth(0);
    await paste(a, '1,234.5');
    await expect(a).toHaveValue('1234.5');
  });

  test('IME 조합 중에는 걸러내지 않고, 조합이 끝난 뒤에 정리한다', async ({ page }) => {
    await page.goto('/#/percent');
    const a = fields(page).nth(0);

    await a.evaluate((node) => {
      const el = node as HTMLInputElement;
      el.focus();
      el.value = '25퍼센트';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await expect(a).toHaveValue('25퍼센트');

    await a.evaluate((node) => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await expect(a).toHaveValue('25');
  });

  test('걸러진 소수·음수 값으로 실제 계산이 된다', async ({ page }) => {
    await page.goto('/#/percent');

    // 기본 모드: 'A 는 B 의 몇 % 인가'
    await fields(page).nth(0).click();
    await fields(page).nth(0).pressSequentially('12.5');
    await fields(page).nth(1).click();
    await fields(page).nth(1).pressSequentially('200');
    await expect(page.locator('#tool-root .form-result')).toHaveText('6.25 %');

    // 'A 에 B % 를 적용하면' 에서 음수 B 는 할인이다.
    await page.locator('#tool-root select').selectOption('applyChange');
    await fields(page).nth(0).fill('1000');
    await fields(page).nth(1).fill('-10');
    await expect(page.locator('#tool-root .form-result')).toHaveText('900');
  });

  test('모드를 바꿔도 네 모드 모두 같은 마스크가 걸린다', async ({ page }) => {
    await page.goto('/#/percent');

    for (const mode of ['ratio', 'partOf', 'change', 'applyChange']) {
      await page.locator('#tool-root select').selectOption(mode);
      for (const index of [0, 1]) {
        const field = fields(page).nth(index);
        await field.fill('');
        await field.click();
        await field.pressSequentially('a-1b2.5c');
        await expect(field, `${mode} / 칸 ${index}`).toHaveValue('-12.5');
      }
    }
  });
});

test.describe('epoch: 타임스탬프 칸 (정수)', () => {
  const timestamp = (page: Page): Locator =>
    page.locator('#tool-root input[placeholder="1700000000"]');

  test('숫자가 아닌 것은 걸러진다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = timestamp(page);
    await field.click();
    await field.pressSequentially('17억 0000000');
    await expect(field).toHaveValue('170000000');
  });

  test('자리 구분 기호가 섞인 값을 붙여넣으면 순수한 숫자가 된다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = timestamp(page);
    for (const pasted of ['1,700,000,000', '1_700_000_000', '1 700 000 000']) {
      await paste(field, pasted);
      await expect(field, `붙여넣은 값: ${pasted}`).toHaveValue('1700000000');
    }
    // 그리고 그 값으로 변환이 실제로 돈다.
    await expect(page.locator('#tool-root .result-list').first()).toContainText('2023-11-14');
  });

  test('1970년 이전을 가리키는 음수 타임스탬프를 여전히 칠 수 있다', async ({ page }) => {
    await page.goto('/#/epoch');

    // fromEpoch 이 `-?\d+` 를 받도록 만들어져 있다 — 숫자만 남기는 필터로 '-' 를
    // 지우면 이 도구가 이미 지원하는 입력을 칠 수 없게 된다.
    const field = timestamp(page);
    await field.click();
    await field.pressSequentially('-86400');
    await expect(field).toHaveValue('-86400');
    await expect(page.locator('#tool-root .result-list').first()).toContainText('1969-12-31');
  });

  test('소수점은 걸러진다 — 정수 칸이다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = timestamp(page);
    await field.click();
    await field.pressSequentially('1700000000.5');
    await expect(field).toHaveValue('17000000005');
  });

  // 프로그램으로 넣는 값(numberForm 의 setValue)도 사용자가 친 값과 같은 마스크를
  // 지난다. 마스크가 값을 잘라내거나 바꿔 버리면 이 칸이 열 자리 타임스탬프를
  // 담지 못한다.
  test('현재 시각 넣기 버튼이 마스크를 지나 열 자리 타임스탬프를 넣는다', async ({ page }) => {
    await page.goto('/#/epoch');

    await page.getByRole('button', { name: '현재 시각 넣기' }).click();
    await expect(timestamp(page)).toHaveValue(/^\d{10}$/);
  });
});

test.describe('epoch: 날짜와 시각 칸', () => {
  const datetime = (page: Page): Locator =>
    page.locator('#tool-root input[placeholder="2023-11-15 07:13:20"]');

  test('숫자만 쳐도 YYYY-MM-DD HH:mm:ss 가 된다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = datetime(page);
    await field.click();
    await field.pressSequentially('20231115071320');
    await expect(field).toHaveValue('2023-11-15 07:13:20');
    // KST 기준이 기본값이다: 2023-11-15 07:13:20 +09:00 = 1700000000
    await expect(page.locator('#tool-root .result-list').nth(1)).toContainText('1700000000');
  });

  test('치는 도중 끝에 구분자가 붙지 않는다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = datetime(page);
    await field.click();
    await field.pressSequentially('2023');
    await expect(field).toHaveValue('2023');
    await field.pressSequentially('11');
    await expect(field).toHaveValue('2023-11');
    await field.pressSequentially('15');
    await expect(field).toHaveValue('2023-11-15');
    await field.pressSequentially('07');
    await expect(field).toHaveValue('2023-11-15 07');
  });

  test('백스페이스가 갇히지 않는다 — 누를 때마다 한 글자씩 줄어든다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = datetime(page);
    await field.click();
    await field.pressSequentially('20231115071320');
    await expect(field).toHaveValue('2023-11-15 07:13:20');

    for (const expected of [
      '2023-11-15 07:13:2',
      '2023-11-15 07:13',
      '2023-11-15 07:1',
      '2023-11-15 07',
      '2023-11-15 0',
      '2023-11-15',
    ]) {
      await page.keyboard.press('Backspace');
      await expect(field).toHaveValue(expected);
    }
  });

  test('날짜와 시각을 나누는 공백 위에서 백스페이스를 누르면 그 앞 숫자가 지워진다', async ({
    page,
  }) => {
    await page.goto('/#/epoch');

    const field = datetime(page);
    await field.click();
    await field.pressSequentially('20231115071320');

    // 캐럿을 '2023-11-15 |07:13:20' 자리(공백 바로 뒤)에 놓고 백스페이스.
    await field.evaluate((node) => (node as HTMLInputElement).setSelectionRange(11, 11));
    await page.keyboard.press('Backspace');

    // 지운 공백을 마스크가 되돌려 놓기만 하면 값이 그대로여서 "안 먹는" 칸이 된다.
    // 사용자가 지우려던 것은 그 앞의 '5' 다.
    await expect(field).toHaveValue('2023-11-10 71:32:0');
    expect(await caretOf(field)).toBe(9);
  });

  test('값 가운데를 고쳐도 캐럿이 끝으로 튀지 않는다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = datetime(page);
    await field.click();
    await field.pressSequentially('20231115071320');

    // '2023-|11-15 07:13:20' 에 '9' 를 끼워 넣는다.
    await field.evaluate((node) => (node as HTMLInputElement).setSelectionRange(5, 5));
    await page.keyboard.type('9');

    await expect(field).toHaveValue('2023-91-11 50:71:32');
    // 방금 친 '9' 바로 뒤. 끝으로 튀면 다음 글자가 엉뚱한 자리에 들어간다.
    expect(await caretOf(field)).toBe(6);
  });

  test('어떤 표기로 붙여넣어도 같은 모양이 된다', async ({ page }) => {
    await page.goto('/#/epoch');

    const field = datetime(page);
    for (const pasted of [
      '2023-11-15 07:13:20',
      '20231115 071320',
      '2023/11/15 07:13:20',
      '2023-11-15T07:13:20',
    ]) {
      await paste(field, pasted);
      await expect(field, `붙여넣은 값: ${pasted}`).toHaveValue('2023-11-15 07:13:20');
    }
  });

  test('IME 조합 중에는 값을 건드리지 않고, 조합이 끝난 뒤에 정리한다', async ({ page }) => {
    await page.goto('/#/epoch');
    const field = datetime(page);

    await field.evaluate((node) => {
      const el = node as HTMLInputElement;
      el.focus();
      el.value = '2023년';
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await expect(field).toHaveValue('2023년');

    await field.evaluate((node) => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await expect(field).toHaveValue('2023');
  });
});
