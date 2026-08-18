import { test, expect, type Page } from '@playwright/test';

/**
 * Jasypt 도구의 브라우저 계약.
 *
 * 계산 자체는 유닛 테스트가 실제 라이브러리(jasypt 1.9.3) 출력 벡터로 고정한다.
 * 여기서 재는 것은 그 계산이 **화면에 어떻게 배선돼 있는가** 다:
 *
 *  - 마스터 비밀번호 하나가 두 세트를 모두 다시 계산시키는가
 *  - 비밀번호가 비어 있는 동안 빨간 글씨를 띄우지 않는가
 *  - 틀린 비밀번호가 결과 칸에 쓰레기를 남기지 않는가
 *  - 비밀번호가 저장되거나 URL 에 실리지 않는가
 *
 * 마지막 항목이 이 도구가 존재하는 이유다. 온라인 Jasypt 사이트에 마스터 키를
 * 붙여넣는 것을 대체하는 도구가 그 키를 어딘가에 남기면 아무 의미가 없다.
 */

// Jasypt 1.9.3 실제 출력. 비밀번호 'test1!' 로 풀면 'root' 다.
const ENC_ROOT = 'ENC(xYIzsUiigr3pQj5xO0KWvg==)';
const BASE64_ROOT = 'xYIzsUiigr3pQj5xO0KWvg==';

function ui(page: Page) {
  const wraps = page.locator('#tool-root .io-wrap');
  return {
    password: page.locator('#tool-root #jasypt-master-password'),
    reveal: page.getByRole('button', { name: /비밀번호 (보기|숨기기)/ }),
    decryptInput: wraps.nth(0).locator('textarea:not([readonly])'),
    decryptOutput: wraps.nth(0).locator('textarea[readonly]'),
    decryptError: wraps.nth(0).locator('.io-error'),
    encryptInput: wraps.nth(1).locator('textarea:not([readonly])'),
    results: page.locator('#tool-root .result-list'),
    resultsEmpty: page.locator('#tool-root .result-empty'),
    resultsError: page.locator('#tool-root .result-list-wrap .io-error'),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/jasypt');
  await expect(page.locator('#tool-root')).not.toBeEmpty();
});

test('화면은 비밀번호 하나 + 독립된 두 세트(복호화/암호화)로 이뤄진다', async ({ page }) => {
  const { password } = ui(page);

  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'off');
  await expect(password).toHaveAttribute('spellcheck', 'false');
  await expect(password).toHaveAttribute('autocapitalize', 'off');
  // name 을 주면 브라우저/비밀번호 매니저가 저장하겠다고 나선다.
  await expect(password).not.toHaveAttribute('name', /.*/);
  // 라벨이 실제로 이 칸을 가리켜야 한다.
  await expect(page.locator('#tool-root label[for="jasypt-master-password"]')).toHaveText(
    '마스터 비밀번호',
  );

  // 비밀번호 칸은 하나뿐이다 — 세트마다 하나씩 있으면 같은 값을 두 번 넣게 된다.
  await expect(page.locator('#tool-root input[type="password"]')).toHaveCount(1);

  await expect(page.locator('#tool-root .section-heading')).toHaveText(['복호화', '암호화']);
  // 사용자가 자기 팀 설정과 대조할 수 있어야 한다.
  await expect(page.locator('#tool-root .jasypt-algorithm')).toHaveText(
    'PBEWithMD5AndDES · 반복 1000회 · RandomSalt · base64',
  );

  // 복호화 세트: 입력/출력 텍스트 한 덩어리씩. 암호화 세트: 입력 + 라벨 붙은 목록.
  await expect(page.locator('#tool-root textarea:not([readonly])')).toHaveCount(2);
  await expect(page.locator('#tool-root textarea[readonly]')).toHaveCount(1);
  await expect(page.locator('#tool-root .result-list-wrap')).toHaveCount(1);
  // 알고리즘을 고르는 select 를 두지 않는다 — 지원하는 것은 하나뿐이다.
  await expect(page.locator('#tool-root select')).toHaveCount(0);
});

test('비밀번호가 비어 있는 동안에는 에러 없이 조용하다', async ({ page }) => {
  const { decryptInput, decryptOutput, decryptError, encryptInput, results, resultsEmpty } =
    ui(page);

  await decryptInput.fill(ENC_ROOT);
  await encryptInput.fill('root');

  // 아무것도 하지 않은 상태에 빨간 글씨가 뜨면 안 된다.
  await expect(decryptError).toHaveText('');
  await expect(decryptOutput).toHaveValue('');
  await expect(results).toHaveJSProperty('hidden', true);
  await expect(resultsEmpty).toBeVisible();
});

test('비밀번호를 나중에 채우면 두 세트가 함께 다시 계산된다', async ({ page }) => {
  const { password, decryptInput, decryptOutput, encryptInput, results } = ui(page);

  await decryptInput.fill(ENC_ROOT);
  await encryptInput.fill('root');
  await expect(decryptOutput).toHaveValue('');

  // 하나뿐인 비밀번호 칸이 두 세트를 모두 구동해야 한다.
  await password.fill('test1!');

  await expect(decryptOutput).toHaveValue('root');
  await expect(results).toHaveJSProperty('hidden', false);
  await expect(results.locator('dt')).toHaveText(['설정 파일용', 'base64 만']);
});

test('복호화: ENC(...) 껍데기가 있어도 없어도 같은 평문이 나온다', async ({ page }) => {
  const { password, decryptInput, decryptOutput } = ui(page);
  await password.fill('test1!');

  await decryptInput.fill(ENC_ROOT);
  await expect(decryptOutput).toHaveValue('root');

  await decryptInput.fill(BASE64_ROOT);
  await expect(decryptOutput).toHaveValue('root');

  // 설정 파일에서 복사하면 앞뒤 공백/줄바꿈이 붙어 온다.
  await decryptInput.fill(`\n  ${ENC_ROOT}  \n`);
  await expect(decryptOutput).toHaveValue('root');
});

test('틀린 비밀번호는 결과 칸을 비우고 지정된 문구를 띄운다', async ({ page }) => {
  const { password, decryptInput, decryptOutput, decryptError } = ui(page);

  await password.fill('test1!');
  await decryptInput.fill(ENC_ROOT);
  await expect(decryptOutput).toHaveValue('root');

  await password.fill('wrong-password');

  // 이 도구의 가장 위험한 오동작이 "틀린 비밀번호인데 결과가 나온 것처럼 보이는
  // 것" 이다. 쓰레기 바이트도, 이전 결과도 남아 있으면 안 된다.
  await expect(decryptOutput).toHaveValue('');
  await expect(decryptError).toHaveText(
    '복호화에 실패했습니다. 마스터 비밀번호가 다르거나, 이 도구가 지원하는 형식(PBEWithMD5AndDES)이 아닙니다.',
  );
});

test('Java 가 거부하는 비ASCII 비밀번호는 계산하지 않고 거부한다', async ({ page }) => {
  const { password, decryptInput, decryptOutput, decryptError, encryptInput, resultsError } =
    ui(page);

  await password.fill('한글비밀번호');
  await decryptInput.fill(ENC_ROOT);
  await encryptInput.fill('root');

  const expected =
    '마스터 비밀번호에 출력 가능 ASCII(공백 ~ ~) 밖의 문자가 있습니다. ' +
    'Java 의 PBEWithMD5AndDES 가 이 비밀번호를 거부하므로, 여기서 만든 값도 Java 에서 풀 수 없습니다.';
  await expect(decryptError).toHaveText(expected);
  await expect(decryptOutput).toHaveValue('');
  // 암호화 쪽도 같다 — 풀 수 없는 값을 만들어 놓고 성공한 척하면 안 된다.
  await expect(resultsError).toHaveText(expected);
});

test('base64 가 아닌 입력은 그 세트에만 base64 문구로 뜬다', async ({ page }) => {
  const { password, decryptInput, decryptError, encryptInput, results } = ui(page);

  await password.fill('test1!');
  await encryptInput.fill('root');
  await decryptInput.fill('!!! not base64 !!!');

  await expect(decryptError).toContainText('base64 로 읽을 수 없습니다');
  // 오류는 원인이 들어 있는 세트에만 붙는다.
  await expect(results).toHaveJSProperty('hidden', false);
});

test('암호화 결과는 설정 파일용 ENC(...) 과 base64 두 줄이고, 실제로 되돌려 풀린다', async ({
  page,
}) => {
  const { password, decryptInput, decryptOutput, encryptInput, results } = ui(page);

  await password.fill('test1!');
  await encryptInput.fill('jdbc:mysql://db.internal:3306/app');

  await expect(results.locator('dt')).toHaveText(['설정 파일용', 'base64 만']);
  const enc = (await results.locator('dd').nth(0).textContent()) ?? '';
  const base64 = (await results.locator('dd').nth(1).textContent()) ?? '';
  expect(enc).toBe(`ENC(${base64})`);
  expect(base64).not.toBe('');

  // 브라우저에서 만든 값을 브라우저에서 되돌려 푼다 — 배선까지 포함한 왕복이다.
  await decryptInput.fill(enc);
  await expect(decryptOutput).toHaveValue('jdbc:mysql://db.internal:3306/app');
});

test('같은 평문을 두 번 암호화하면 값이 달라진다 (RandomSalt)', async ({ page }) => {
  const { password, encryptInput, results } = ui(page);

  await password.fill('test1!');
  await encryptInput.fill('same plaintext');
  const first = await results.locator('dd').nth(1).textContent();

  // 같은 값을 다시 넣어 재계산시킨다.
  await encryptInput.fill('same plaintext ');
  await encryptInput.fill('same plaintext');
  const second = await results.locator('dd').nth(1).textContent();

  expect(first).not.toBe('');
  expect(second).not.toBe(first);
});

test('두 세트는 독립이다 — 한쪽을 고쳐도 다른 쪽 값이 그대로다', async ({ page }) => {
  const { password, decryptInput, decryptOutput, encryptInput, results } = ui(page);

  await password.fill('test1!');
  await decryptInput.fill(ENC_ROOT);
  await expect(decryptOutput).toHaveValue('root');

  await encryptInput.fill('another value');
  await expect(results).toHaveJSProperty('hidden', false);
  // 복호화 세트는 손대지 않았다.
  await expect(decryptInput).toHaveValue(ENC_ROOT);
  await expect(decryptOutput).toHaveValue('root');

  await decryptInput.fill('');
  await expect(decryptOutput).toHaveValue('');
  // 암호화 세트는 여전히 자기 결과를 들고 있다.
  await expect(results).toHaveJSProperty('hidden', false);
});

test('보기/숨기기 토글이 상태를 문구와 aria-pressed 로 알린다', async ({ page }) => {
  const { password, reveal } = ui(page);
  await password.fill('test1!');

  await expect(reveal).toHaveText('비밀번호 보기');
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await expect(password).toHaveAttribute('type', 'password');

  await reveal.click();
  await expect(reveal).toHaveText('비밀번호 숨기기');
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('test1!');

  await reveal.click();
  await expect(reveal).toHaveText('비밀번호 보기');
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await expect(password).toHaveAttribute('type', 'password');
});

/*
 * 이 도구는 프로젝트에서 유일하게 비밀 자체를 입력받는다. 셸이 localStorage 에
 * 'rdt.recent' 를 쓰기 때문에 "저장소가 비어 있다" 로는 잴 수 없다 — 저장된
 * 값들 **어디에도 비밀번호와 평문이 없다** 로 잰다.
 */
test('마스터 비밀번호와 값이 저장소·URL 어디에도 남지 않는다', async ({ page }) => {
  const { password, decryptInput, encryptInput, decryptOutput } = ui(page);

  const secret = 'super-secret-master-key';
  await password.fill(secret);
  await decryptInput.fill(ENC_ROOT);
  await encryptInput.fill('plaintext-payload');
  // 계산이 실제로 돌았다는 것을 확인한 뒤에 판정한다.
  await expect(decryptOutput).toHaveValue('');

  const stored = await page.evaluate(() => {
    const dump = (storage: Storage): string[] => {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) out.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
      return out;
    };
    return {
      local: dump(localStorage),
      session: dump(sessionStorage),
      url: location.href,
      cookie: document.cookie,
    };
  });

  const haystack = [...stored.local, ...stored.session, stored.url, stored.cookie].join('\n');
  expect(haystack, `저장된 값에 비밀번호가 들어 있습니다:\n${haystack}`).not.toContain(secret);
  expect(haystack, `저장된 값에 평문이 들어 있습니다:\n${haystack}`).not.toContain(
    'plaintext-payload',
  );
  expect(haystack).not.toContain(BASE64_ROOT);
  // URL 에는 도구 해시만 있어야 한다.
  expect(new URL(stored.url).hash).toBe('#/jasypt');
});

test('다른 도구로 갔다 돌아오면 비밀번호 칸이 비어 있다', async ({ page }) => {
  const { password } = ui(page);
  await password.fill('test1!');
  await expect(password).toHaveValue('test1!');

  await page.goto('/#/base64');
  await expect(page.locator('#tool-root .io-wrap')).toHaveCount(2);

  await page.goto('/#/jasypt');
  await expect(ui(page).password).toHaveValue('');
});
