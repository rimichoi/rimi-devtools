import { test, expect, type Page } from '@playwright/test';

/**
 * 2차인증 OTP 도구의 브라우저 계약.
 *
 * 코드 계산 자체는 유닛 테스트가 RFC 6238 공식 벡터 18개로 고정한다. 여기서 재는
 * 것은 그 계산이 **화면에 어떻게 배선돼 있는가** 이고, 특히 이 도구가 다루는 것이
 * 자격 증명이라는 사실이다 — 비밀키가 어디에도 남지 않아야 한다.
 *
 * 코드는 30초마다 바뀌므로 값을 리터럴로 못 박지 않는다. 시계와 무관하게 참인
 * 것만 잰다.
 */

// RFC 6238 의 공개 테스트 seed 라 비밀이 아니다.
const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function ui(page: Page) {
  return {
    secret: page.locator('#tool-root #totp-secret'),
    issuer: page.locator('#tool-root #totp-issuer'),
    account: page.locator('#tool-root #totp-account'),
    algorithm: page.locator('#tool-root #totp-algorithm'),
    digits: page.locator('#tool-root #totp-digits'),
    period: page.locator('#tool-root #totp-period'),
    verifyCode: page.locator('#tool-root #totp-verify-code'),
    verdict: page.locator('#tool-root .totp-verdict'),
    uri: page.locator('#tool-root .totp-uri-card textarea'),
    qr: page.locator('#tool-root .totp-qr'),
    qrNote: page.locator('#tool-root .totp-qr-card .io-warn'),
    cautions: page.locator('#tool-root .totp-warnings .io-warn'),
    error: page.locator('#tool-root > .tool-stack > .io-error'),
    reveal: page.getByRole('button', { name: /비밀키 (보기|숨기기)/ }),
    generate: page.getByRole('button', { name: '무작위 생성' }),
    codeValues: page.locator('#tool-root .result-list dd'),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/totp');
  await page.locator('#tool-root[data-tool="totp"]').waitFor();
});

test('비밀키와 계정을 넣으면 URI 와 QR 이 만들어진다', async ({ page }) => {
  const { secret, account, issuer, uri, qr } = ui(page);
  await secret.fill(SEED);
  await issuer.fill('다우오피스');
  await account.fill('rimichoi@daou.co.kr');

  await expect(uri).toHaveValue(
    `otpauth://totp/%EB%8B%A4%EC%9A%B0%EC%98%A4%ED%94%BC%EC%8A%A4:rimichoi%40daou.co.kr?secret=${SEED}&issuer=%EB%8B%A4%EC%9A%B0%EC%98%A4%ED%94%BC%EC%8A%A4&algorithm=SHA1&digits=6&period=30`,
  );
  // QR 이 실제로 그려졌는지 — 모듈 사각형이 수백 개 있어야 한다.
  await expect(qr).toBeVisible();
  expect(await qr.locator('rect').count()).toBeGreaterThan(100);
});

test('QR 안에 비밀키가 들어 있다는 사실을 화면에 적는다', async ({ page }) => {
  const { secret, account, qrNote } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(qrNote).toContainText('화면 캡처를 공유하면 비밀키를 공유하는 것과 같습니다');
});

test('지금 코드가 6자리로 표시되고 남은 시간이 함께 나온다', async ({ page }) => {
  const { secret, account, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');

  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);
  await expect(codeValues.nth(1)).toHaveText(/^\d{1,2}초$/);
});

test('자릿수를 8로 바꾸면 코드도 8자리가 된다', async ({ page }) => {
  const { secret, account, digits, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);

  await digits.selectOption('8');
  await expect(codeValues.nth(0)).toHaveText(/^\d{8}$/);
});

test('otpauth URI 를 비밀키 칸에 붙여넣으면 설정이 채워진다', async ({ page }) => {
  const { secret, issuer, account, algorithm, digits, period } = ui(page);
  await secret.fill(
    `otpauth://totp/GitHub:rimi?secret=${SEED}&issuer=GitHub&algorithm=SHA256&digits=8&period=60`,
  );

  await expect(issuer).toHaveValue('GitHub');
  await expect(account).toHaveValue('rimi');
  await expect(algorithm).toHaveValue('SHA-256');
  await expect(digits).toHaveValue('8');
  await expect(period).toHaveValue('60');
  await expect(secret).toHaveValue(SEED);
});

test('앱이 무시하는 설정을 조용히 넘기지 않는다', async ({ page }) => {
  const { secret, account, algorithm, cautions } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(cautions).toHaveCount(0);

  await algorithm.selectOption('SHA-256');
  await expect(cautions.filter({ hasText: 'algorithm 을 무시하고 SHA-1 로 계산합니다' })).toHaveCount(1);
});

test('무작위 생성이 쓸 수 있는 비밀키를 만든다', async ({ page }) => {
  const { secret, account, generate, uri } = ui(page);
  await account.fill('a@b.com');
  await generate.click();

  // 160비트 = Base32 32글자
  await expect(secret).toHaveValue(/^[A-Z2-7]{32}$/);
  await expect(uri).toHaveValue(/^otpauth:\/\/totp\/a%40b\.com\?secret=[A-Z2-7]{32}&/);
});

test('두 번 생성하면 다른 비밀키가 나온다', async ({ page }) => {
  const { secret, generate } = ui(page);
  await generate.click();
  const first = await secret.inputValue();
  await generate.click();
  expect(await secret.inputValue()).not.toBe(first);
});

test('화면의 코드를 그대로 넣으면 유효하다고 말한다', async ({ page }) => {
  const { secret, account, codeValues, verifyCode, verdict } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);

  const code = (await codeValues.nth(0).textContent()) ?? '';
  await verifyCode.fill(code);
  await expect(verdict).toHaveText('이 코드는 지금 유효합니다.');
  await expect(verdict).toHaveAttribute('data-state', 'valid');
});

test('틀린 코드는 유효하다고 말하지 않는다', async ({ page }) => {
  const { secret, account, verifyCode, verdict } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await verifyCode.fill('000000');
  await expect(verdict).toHaveAttribute('data-state', 'mismatch');
  await expect(verdict).toContainText('맞지 않습니다');
});

test('비밀키 보기 토글이 값을 드러내고 다시 숨긴다', async ({ page }) => {
  const { secret, reveal } = ui(page);
  await secret.fill(SEED);
  await expect(secret).toHaveAttribute('type', 'password');
  await reveal.click();
  await expect(secret).toHaveAttribute('type', 'text');
  await reveal.click();
  await expect(secret).toHaveAttribute('type', 'password');
});

test('망가진 비밀키에 빨간 글씨를 띄우되, 빈 입력에는 띄우지 않는다', async ({ page }) => {
  const { secret, account, error } = ui(page);
  await expect(error).toHaveText('');

  await account.fill('a@b.com');
  await secret.fill('MZXW0YTB');
  await expect(error).toContainText('Base32 에 없는 글자입니다');

  await secret.fill('');
  await account.fill('');
  await expect(error).toHaveText('');
});

test('넓은 화면에서 QR 과 URI 가 같은 줄에 나란히 놓인다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { secret, account, qr } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(qr).toBeVisible();

  const left = await page.locator('#tool-root .totp-qr-card').boundingBox();
  const right = await page.locator('#tool-root .totp-uri-card').boundingBox();
  expect(left, 'QR 카드를 찾지 못했습니다').not.toBeNull();
  expect(right, 'URI 카드를 찾지 못했습니다').not.toBeNull();

  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  expect(right!.y).toBeLessThan(left!.y + left!.height);
});

/*
 * 이 도구가 존재하는 이유를 재는 테스트다. 2차 인증 비밀키는 비밀번호보다 오래
 * 살고, 유출되면 2차 인증이 있으나 마나가 된다.
 */
test('비밀키가 저장소·URL·DOM 속성 어디에도 남지 않는다', async ({ page }) => {
  const { secret, account, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  // 계산이 실제로 돌았음을 먼저 확인한다. 빈 화면을 재고 통과하지 않기 위함이다.
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);

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
      side: [...dump(window.localStorage), ...dump(window.sessionStorage), window.location.href, document.cookie].join('\n'),
      html: document.documentElement.outerHTML,
    };
  });

  expect(stored.side, '비밀키가 저장소나 URL 에 남았다').not.toContain(SEED);
  // 비밀키는 value 프로퍼티에만 있고 속성이 아니므로 HTML 덤프에도 나오지 않는다.
  // (URI textarea 는 화면에 보이는 결과이므로 outerHTML 이 아니라 value 에만 있다.)
  expect(stored.html, '비밀키가 HTML 속성으로 새어 나왔다').not.toContain(SEED);
});

test('다른 도구로 옮겨가면 비밀키가 남지 않는다', async ({ page }) => {
  const { secret, account, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);

  await page.goto('/#/base64');
  await page.locator('#tool-root[data-tool="base64"]').waitFor();
  await page.goto('/#/totp');
  await page.locator('#tool-root[data-tool="totp"]').waitFor();

  await expect(ui(page).secret).toHaveValue('');
  await expect(ui(page).uri).toHaveValue('');
});
