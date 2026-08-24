import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

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

/*
 * 도구를 떠날 때 비밀키 칸을 비우는 것이 이 도구가 못 박은 안전 불변식이다.
 *
 * 처음에는 "떠났다 돌아오면 칸이 비어 있다" 로 쟀는데, 그건 **아무것도 검증하지
 * 못했다** — 돌아올 때 mount() 가 새 input 을 만들므로 정리 코드가 없어도 항상
 * 비어 있다. 정리 줄을 지워도 15건이 전부 초록이었다(교차 리뷰가 실측으로 잡음).
 *
 * 그래서 떠나기 **전에** 그 input 의 핸들을 붙잡아 두고, 떠난 뒤 그 낡은 요소가
 * 실제로 비워졌는지 본다. 이것만이 정리 코드의 존재를 잰다.
 */
test('도구를 떠날 때 그 화면의 비밀키 칸이 실제로 비워진다', async ({ page }) => {
  const { secret, account, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);

  const abandoned = await secret.elementHandle();
  expect(abandoned, '비밀키 칸의 핸들을 잡지 못했습니다').not.toBeNull();
  expect(await abandoned!.inputValue(), '떠나기 전에는 값이 들어 있어야 한다').toBe(SEED);

  await page.goto('/#/base64');
  await page.locator('#tool-root[data-tool="base64"]').waitFor();

  expect(
    await abandoned!.inputValue(),
    '떠난 화면의 비밀키 칸이 비워지지 않았다 — 정리 코드가 빠졌다',
  ).toBe('');
  await abandoned!.dispose();
});

test('다시 들어오면 빈 화면으로 시작한다', async ({ page }) => {
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

test('otpauth URI 를 손으로 타이핑해도 값을 잘라먹지 않는다', async ({ page }) => {
  const { secret, issuer, account, digits, error } = ui(page);
  await secret.click();
  await page.keyboard.type(`otpauth://totp/GitHub:rimi?secret=${SEED}&issuer=GitHub&digits=8`, {
    delay: 1,
  });
  // 치는 동안에는 건드리지 않는다. 예전에는 secret= 까지 친 순간 나머지를 잘라먹었다.
  await expect(secret).toHaveValue(
    `otpauth://totp/GitHub:rimi?secret=${SEED}&issuer=GitHub&digits=8`,
  );

  // 포커스를 옮기면 그때 나눠 담는다.
  await account.click();
  await expect(secret).toHaveValue(SEED);
  await expect(issuer).toHaveValue('GitHub');
  await expect(digits).toHaveValue('8');
  await expect(error).toHaveText('');
});

test('검증 코드를 치는 것은 QR 을 다시 그리지 않는다', async ({ page }) => {
  const { secret, account, verifyCode, qr } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(qr).toBeVisible();

  const rebuilds = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const host = document.querySelector('.totp-qr-host') as HTMLElement;
        const observer = new MutationObserver((records) => {
          count += records.length;
        });
        observer.observe(host, { childList: true });
        const input = document.querySelector('#totp-verify-code') as HTMLInputElement;
        for (const char of '123456') {
          input.value += char;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 300);
      }),
  );

  expect(rebuilds, `검증 코드를 치는 동안 QR 이 ${rebuilds}번 다시 그려졌다`).toBe(0);
  await expect(verifyCode).toHaveValue('123456');
});

/*
 * 여기서부터는 화면의 코드를 **구현과 다른 경로**로 계산해 대조한다.
 *
 * 기존 검증 테스트("화면의 코드를 그대로 넣으면 유효하다")는 구현이 낸 코드를
 * 같은 구현에 되먹이므로 자기모순이 없다 — 시각 단위를 초에서 밀리초로 바꿔도,
 * 검증이 설정을 무시하고 SHA-1·6자리·30초로 고정돼도 전부 초록이었다(교차 리뷰가
 * mutation 으로 실측). 아래는 node:crypto 로 직접 계산한 값과 맞춰 본다.
 */
const NODE_HASH: Record<string, string> = { 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-512': 'sha512' };

function base32ToBuffer(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 구현을 전혀 참조하지 않는 오라클. RFC 6238 을 node:crypto 로 직접 구현했다. */
function oracleTotp(secret: string, algorithm: string, digits: number, period: number, unixSeconds: number): string {
  const counter = Math.floor(unixSeconds / period);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(NODE_HASH[algorithm] as string, base32ToBuffer(secret)).update(buffer).digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const binary =
    (((mac[offset] as number) & 0x7f) << 24) |
    ((mac[offset + 1] as number) << 16) |
    ((mac[offset + 2] as number) << 8) |
    (mac[offset + 3] as number);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** 그 순간에 유효한 코드 후보들. 재는 사이에 창이 넘어갈 수 있어 앞뒤를 함께 본다. */
function acceptableCodes(secret: string, algorithm: string, digits: number, period: number): string[] {
  const now = Date.now() / 1000;
  return [-1, 0, 1].map((step) => oracleTotp(secret, algorithm, digits, period, now + step * period));
}

test('화면의 코드가 node:crypto 로 계산한 값과 같다 (기본 설정)', async ({ page }) => {
  const { secret, account, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);

  const shown = (await codeValues.nth(0).textContent()) ?? '';
  expect(acceptableCodes(SEED, 'SHA-1', 6, 30), `화면=${shown}`).toContain(shown);
});

test('설정을 바꿔도 화면의 코드가 독립 계산과 같다 (SHA-256 · 8자리 · 60초)', async ({ page }) => {
  const { secret, account, algorithm, digits, period, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await algorithm.selectOption('SHA-256');
  await digits.selectOption('8');
  await period.selectOption('60');
  await expect(codeValues.nth(0)).toHaveText(/^\d{8}$/);

  const shown = (await codeValues.nth(0).textContent()) ?? '';
  expect(acceptableCodes(SEED, 'SHA-256', 8, 60), `화면=${shown}`).toContain(shown);
});

test('검증이 설정을 실제로 읽는다 — 기본값으로 고정돼 있지 않다', async ({ page }) => {
  const { secret, account, algorithm, digits, period, verifyCode, verdict, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await algorithm.selectOption('SHA-256');
  await digits.selectOption('8');
  await period.selectOption('60');
  await expect(codeValues.nth(0)).toHaveText(/^\d{8}$/);

  // 이 코드는 SHA-256 · 8자리 · 60초에서만 유효하다. 검증이 기본값으로 고정돼
  // 있으면 "맞지 않습니다" 가 뜬다.
  const expected = oracleTotp(SEED, 'SHA-256', 8, 60, Date.now() / 1000);
  await verifyCode.fill(expected);
  await expect(verdict).toHaveText('이 코드는 지금 유효합니다.');
});

test('기본 설정의 코드는 다른 설정에서 유효하지 않다', async ({ page }) => {
  const { secret, account, digits, verifyCode, verdict, codeValues } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await digits.selectOption('8');
  await expect(codeValues.nth(0)).toHaveText(/^\d{8}$/);

  // 6자리 코드는 8자리 설정에서 맞을 수 없다.
  await verifyCode.fill(oracleTotp(SEED, 'SHA-1', 6, 30, Date.now() / 1000));
  await expect(verdict).toHaveAttribute('data-state', 'mismatch');
});

test('select 에 없는 digits · period 를 가진 URI 에도 NaN 이 새지 않는다', async ({ page }) => {
  const { secret, digits, period, uri, error, codeValues } = ui(page);
  await secret.fill(`otpauth://totp/GitHub:rimi?secret=${SEED}&digits=7&period=90`);

  await expect(error).toHaveText('');
  await expect(digits).toHaveValue('7');
  await expect(period).toHaveValue('90');
  await expect(uri).toHaveValue(/digits=7&period=90$/);
  await expect(uri, 'URI 에 NaN 이 들어가면 안 된다').not.toHaveValue(/NaN/);
  await expect(codeValues.nth(0)).toHaveText(/^\d{7}$/);

  const shown = (await codeValues.nth(0).textContent()) ?? '';
  expect(acceptableCodes(SEED, 'SHA-1', 7, 90), `화면=${shown}`).toContain(shown);
});

test('QR 로 담을 수 없이 길면 그렇다고 말하고 옛 코드를 남기지 않는다', async ({ page }) => {
  const { secret, account, qr, qrNote, codeValues, uri } = ui(page);
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(qr).toBeVisible();
  const firstCode = (await codeValues.nth(0).textContent()) ?? '';
  expect(firstCode).toMatch(/^\d{6}$/);

  await account.fill('가'.repeat(300));

  await expect(qr).toHaveCount(0);
  await expect(qrNote).toContainText('QR 로 담을 수 없습니다');
  await expect(qrNote, 'QR 이 없는데 QR 주의 문구를 남기면 안 된다').not.toContainText(
    '화면 캡처를 공유하면',
  );
  // URI 는 여전히 쓸 수 있어야 하고, 코드도 새 설정으로 계속 돌아야 한다.
  await expect(uri).toHaveValue(/^otpauth:\/\/totp\//);
  await expect(codeValues.nth(0)).toHaveText(/^\d{6}$/);
});

test('QR 은 테마와 무관하게 흑백이다 — 다크 테마에서도 스캔돼야 한다', async ({ page }) => {
  const { secret, account, qr } = ui(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await secret.fill(SEED);
  await account.fill('a@b.com');
  await expect(qr).toBeVisible();

  const colors = await page.evaluate(() => {
    const svg = document.querySelector('.totp-qr') as SVGElement;
    const rects = svg.querySelectorAll('rect');
    return {
      background: getComputedStyle(rects[0] as Element).fill,
      cell: getComputedStyle(rects[rects.length - 1] as Element).fill,
    };
  });
  expect(colors.background, 'QR 배경이 흰색이 아니다').toBe('rgb(255, 255, 255)');
  expect(colors.cell, 'QR 모듈이 검은색이 아니다').toBe('rgb(0, 0, 0)');
});
