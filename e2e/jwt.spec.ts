import { test, expect, type Page } from '@playwright/test';

/**
 * JWT 디코더의 브라우저 계약.
 *
 * 디코딩과 서명 검증 자체는 유닛 테스트가 node:crypto 로 생성한 벡터로 고정한다.
 * 여기서 재는 것은 그 계산이 **화면에 어떻게 배선돼 있는가** 다:
 *
 *  - 비밀키 하나가 서명 판정을 실제로 다시 계산시키는가
 *  - 위험 신호(alg:none, 만료)가 눈에 보이는가
 *  - "검증 안 함" 과 "불일치" 가 화면에서 구분되는가
 *  - 토큰과 비밀키가 저장되거나 URL 에 실리지 않는가
 *
 * 마지막 항목이 이 도구가 존재하는 이유다. jwt.io 에 운영 토큰을 붙여넣는 습관을
 * 대체하는 도구가 그 토큰을 어딘가에 남기면 아무 의미가 없다.
 */

// node:crypto 로 생성해 실행 검증한 벡터. secret 은 'your-256-bit-secret'.
// iat=1700000000, exp=1700003600 이므로 지금은 항상 만료 상태다.
const HS256 =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Iu2Zjeq4uOuPmSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.aQGiu-ZTHs_BwR6lFho9PK5PZezSt5yh65zWYeZZwYc';
const HS256_SECRET = 'your-256-bit-secret';
// alg=none — 세 번째 조각이 빈 문자열이다.
const NONE_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJyb290In0.';

function ui(page: Page) {
  const cards = page.locator('#tool-root .jwt-panes .jwt-card');
  return {
    token: page.locator('#tool-root .io-wrap textarea:not([readonly])'),
    secret: page.locator('#tool-root #jwt-secret'),
    reveal: page.getByRole('button', { name: /비밀키 (보기|숨기기)/ }),
    verdict: page.locator('#tool-root .jwt-verdict'),
    dangers: page.locator('#tool-root .jwt-warnings .io-error'),
    cautions: page.locator('#tool-root .jwt-warnings .io-warn'),
    headerOut: cards.nth(0).locator('textarea'),
    payloadOut: cards.nth(1).locator('textarea'),
    times: page.locator('#tool-root .result-list-wrap'),
    error: page.locator('#tool-root > .tool-stack > .io-error'),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/jwt');
  await page.locator('#tool-root[data-tool="jwt"]').waitFor();
});

test('토큰을 넣으면 헤더와 페이로드가 정렬된 JSON 으로 풀린다', async ({ page }) => {
  const { token, headerOut, payloadOut } = ui(page);
  await token.fill(HS256);

  await expect(headerOut).toHaveValue('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
  // textarea 는 값이 textContent 가 아니라 value 에 있다 — toContainText 로 재면
  // 무엇이 들어 있든 빈 문자열을 보고 통과/실패가 뒤집힌다. toHaveValue 로 잰다.
  // 한글 클레임이 깨지지 않는다는 것도 여기서 함께 고정된다.
  await expect(payloadOut).toHaveValue(
    '{\n  "sub": "1234567890",\n  "name": "홍길동",\n  "iat": 1700000000,\n  "exp": 1700003600\n}',
  );
});

test('Bearer 접두사가 붙어 있어도 그대로 처리한다', async ({ page }) => {
  const { token, headerOut } = ui(page);
  await token.fill(`Bearer ${HS256}`);
  await expect(headerOut).toHaveValue('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
});

test('시간 클레임을 UTC·KST·상대시간으로 함께 보여준다', async ({ page }) => {
  const { token, times } = ui(page);
  await token.fill(HS256);

  const rows = times.locator('dd');
  // exp=1700003600 을 초로 읽은 값이다. 밀리초로 읽으면 1970년이 나온다.
  await expect(rows.filter({ hasText: 'UTC 2023-11-14 23:13:20' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'KST 2023-11-15 08:13:20' })).toHaveCount(1);
  await expect(times.locator('dt').filter({ hasText: 'exp (만료)' })).toHaveCount(1);
});

test('만료된 토큰은 위험 경고로 드러난다', async ({ page }) => {
  const { token, dangers } = ui(page);
  await token.fill(HS256);
  await expect(dangers.filter({ hasText: '이미 만료된 토큰입니다.' })).toHaveCount(1);
});

test('alg 가 none 이면 위험 경고가 보인다', async ({ page }) => {
  const { token, dangers } = ui(page);
  await token.fill(NONE_TOKEN);
  await expect(
    dangers.filter({ hasText: 'alg 가 none 입니다. 서명이 없어 내용을 누구나 바꿔 넣을 수 있는 토큰입니다.' }),
  ).toHaveCount(1);
});

test('비밀키를 나중에 채우면 서명 판정이 다시 계산된다', async ({ page }) => {
  const { token, secret, verdict } = ui(page);

  /*
   * 순서가 중요하다. 비밀키를 **나중에** 넣어야, 판정을 다시 돌린 것이 비밀키
   * 입력의 recompute 리스너임이 드러난다. 비밀키를 먼저 넣으면 토큰 textarea 의
   * 자기 input 이벤트만으로 계산이 돌아서, 리스너가 통째로 빠져도 화면이
   * 똑같아 보인다 — 이 프로젝트가 Jasypt 태스크에서 실제로 겪은 공허한 테스트다.
   */
  await token.fill(HS256);
  await expect(verdict).toHaveText('비밀키를 입력하면 서명을 검증합니다.');

  await secret.fill(HS256_SECRET);
  await expect(verdict).toHaveText('서명이 유효합니다.');
  await expect(verdict).toHaveAttribute('data-state', 'valid');
});

test('"검증 안 함" 과 "불일치" 가 화면에서 구분된다', async ({ page }) => {
  const { token, secret, verdict } = ui(page);
  await token.fill(HS256);
  await secret.fill('wrong-secret');

  await expect(verdict).toHaveText('서명이 일치하지 않습니다. 비밀키가 다르거나 토큰이 변조됐습니다.');
  await expect(verdict).toHaveAttribute('data-state', 'mismatch');

  // 비밀키를 지우면 "불일치" 가 아니라 "검증 안 함" 으로 돌아간다.
  await secret.fill('');
  await expect(verdict).toHaveText('비밀키를 입력하면 서명을 검증합니다.');
  await expect(verdict).toHaveAttribute('data-state', 'unverified');
});

test('RS256 은 조용히 넘어가지 않고 검증하지 않는다고 말한다', async ({ page }) => {
  const { token, secret, verdict, cautions } = ui(page);
  // {"alg":"RS256"} 헤더를 가진 토큰
  await token.fill('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIn0.zzz');
  await secret.fill('anything');

  await expect(verdict).toHaveText(
    '이 도구는 대칭키(HS256/384/512) 서명만 검증합니다. RS256 는 검증하지 않습니다.',
  );
  await expect(cautions.filter({ hasText: 'RS256 는 검증하지 않습니다.' })).toHaveCount(1);
});

test('비밀키 보기 토글이 값을 드러내고 다시 숨긴다', async ({ page }) => {
  const { secret, reveal } = ui(page);
  await secret.fill('my-secret');

  await expect(secret).toHaveAttribute('type', 'password');
  await reveal.click();
  await expect(secret).toHaveAttribute('type', 'text');
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await reveal.click();
  await expect(secret).toHaveAttribute('type', 'password');
});

test('망가진 입력에 빨간 글씨를 띄우되, 빈 입력에는 띄우지 않는다', async ({ page }) => {
  const { token, error } = ui(page);

  await expect(error).toHaveText('');
  await token.fill('점이없는문자열');
  await expect(error).toContainText('JWT 는 점으로 나뉜 조각이 3개여야 합니다');

  await token.fill('');
  await expect(error).toHaveText('');
});

test('넓은 화면에서 헤더와 페이로드가 같은 줄에 나란히 놓인다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { token } = ui(page);
  await token.fill(HS256);

  const cards = page.locator('#tool-root .jwt-panes .jwt-card');
  const headerBox = await cards.nth(0).boundingBox();
  const payloadBox = await cards.nth(1).boundingBox();
  expect(headerBox, '헤더 카드를 찾지 못했습니다').not.toBeNull();
  expect(payloadBox, '페이로드 카드를 찾지 못했습니다').not.toBeNull();

  // 페이로드 카드는 헤더 오른쪽에 있고, 세로로 겹친다(= 같은 줄이다).
  expect(payloadBox!.x).toBeGreaterThan(headerBox!.x + headerBox!.width - 1);
  expect(payloadBox!.y).toBeLessThan(headerBox!.y + headerBox!.height);

  // 오른쪽 절반을 비워 두지 않는다 — 두 카드가 폭을 나눠 갖는다.
  const row = await page.locator('#tool-root .jwt-panes').boundingBox();
  expect(payloadBox!.width).toBeGreaterThan(row!.width * 0.4);
});

/*
 * 이 도구의 존재 이유를 재는 테스트다. 셸이 'rdt.recent' 를 쓰기 때문에
 * "저장소가 비어 있다" 로는 잴 수 없다 — 저장된 값들 **어디에도 토큰과 비밀키가
 * 없다** 로 잰다.
 */
test('토큰과 비밀키가 저장소·URL 어디에도 남지 않는다', async ({ page }) => {
  const { token, secret, verdict } = ui(page);

  await token.fill(HS256);
  await secret.fill(HS256_SECRET);

  /*
   * 아무것도 계산되지 않은 화면을 재고 통과하는 일을 막는 관문이다. 아래 단언은
   * 비밀키를 넣은 뒤에야 참이 된다 — 비밀키가 비어 있는 동안에는 "비밀키를
   * 입력하면 서명을 검증합니다." 이므로, recompute 배선이 빠지면 여기서 걸린다.
   */
  await expect(verdict).toHaveText('서명이 유효합니다.');

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
      local: dump(window.localStorage),
      session: dump(window.sessionStorage),
      url: window.location.href,
      cookie: document.cookie,
      html: document.documentElement.outerHTML,
    };
  });

  const haystack = [...stored.local, ...stored.session, stored.url, stored.cookie].join('\n');
  expect(haystack, '토큰이 저장소나 URL 에 남았다').not.toContain(HS256);
  expect(haystack, '비밀키가 저장소나 URL 에 남았다').not.toContain(HS256_SECRET);
  // 비밀키는 value 프로퍼티에만 있고 속성이 아니므로 HTML 덤프에도 나오지 않는다.
  expect(stored.html, '비밀키가 HTML 속성으로 새어 나왔다').not.toContain(HS256_SECRET);
});

test('다른 도구로 옮겨가면 비밀키가 남지 않는다', async ({ page }) => {
  const { token, secret, verdict } = ui(page);
  await token.fill(HS256);
  await secret.fill(HS256_SECRET);
  await expect(verdict).toHaveText('서명이 유효합니다.');

  await page.goto('/#/base64');
  await page.locator('#tool-root[data-tool="base64"]').waitFor();
  await page.goto('/#/jwt');
  await page.locator('#tool-root[data-tool="jwt"]').waitFor();

  await expect(ui(page).secret).toHaveValue('');
  await expect(ui(page).verdict).toHaveText('비밀키를 입력하면 서명을 검증합니다.');
});
