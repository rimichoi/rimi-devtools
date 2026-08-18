import { test, expect, type Page } from '@playwright/test';

// epoch 의 "타임스탬프 → 날짜" 방향이 대량 텍스트용 IOPane(textarea) 을 쓰면서,
// 바로 아래의 "날짜 → 타임스탬프" 방향(단일 줄 input)과 같은 페이지에서 서로 다른
// 모양이 되는 결함을 고친 회귀 테스트. 두 방향 모두 단일 줄 필드를 쓰고, 결과는
// 구조화된 목록(ResultList) 으로 보여야 한다.
test.describe('epoch: 두 방향이 같은 종류의 입력 모양을 쓴다', () => {
  test('타임스탬프 입력은 textarea 가 아니라 단일 줄 input 이다', async ({ page }) => {
    await page.goto('/#/epoch');

    const timestampInput = page.locator('#tool-root input[placeholder="1700000000"]');
    await expect(timestampInput).toBeVisible();
    // textarea 였다면 이 locator 자체가 아무것도 못 찾는다(placeholder 는 input 에만 있음).
    expect(await timestampInput.evaluate((el) => el.tagName)).toBe('INPUT');

    // 페이지에 남아 있는 textarea 가 없어야 한다 — 두 방향 다 단일 줄 필드다.
    await expect(page.locator('#tool-root textarea')).toHaveCount(0);
  });

  // 두 방향이 각자의 ResultList 를 갖게 되면서 '#tool-root .result-list' 는 두 개를
  // 가리킨다. 어느 방향의 목록인지 지정하지 않으면 strict mode 위반으로 죽으므로,
  // 아래 헬퍼로 방향을 명시한다(위에서부터 0 = 타임스탬프→날짜, 1 = 날짜→타임스탬프).
  const forward = (page: Page) => page.locator('#tool-root .result-list-wrap').nth(0);
  const reverse = (page: Page) => page.locator('#tool-root .result-list-wrap').nth(1);

  // '.result-list' 는 빈 dl(자식 0개)이라 CSS grid 가 높이 0으로 접혀서, hidden
  // 속성을 실제로 세팅하지 않아도 Playwright 의 toBeHidden() 이 우연히 통과할 수
  // 있다. hidden 이라는 IDL 속성값 자체를 직접 확인해야 그 속성을 세팅하는
  // 코드가 실제로 지워졌을 때도 이 테스트가 빨갛게 죽는다.
  test('결과가 없을 때는 안내 문구만 보이고 빈 목록은 숨는다', async ({ page }) => {
    await page.goto('/#/epoch');

    for (const box of [forward(page), reverse(page)]) {
      await expect(box.locator('.result-empty')).toHaveJSProperty('hidden', false);
      await expect(box.locator('.result-empty')).toBeVisible();
      await expect(box.locator('.result-list')).toHaveJSProperty('hidden', true);
    }
  });

  test('현재 시각 넣기 버튼은 구조화된 결과 목록(UTC/KST/ISO 8601 등)을 채운다', async ({ page }) => {
    await page.goto('/#/epoch');

    await page.getByRole('button', { name: '현재 시각 넣기' }).click();

    const list = forward(page).locator('.result-list');
    const empty = forward(page).locator('.result-empty');
    await expect(list).toHaveJSProperty('hidden', false);
    await expect(list).toBeVisible();
    await expect(empty).toHaveJSProperty('hidden', true);
    await expect(list).toContainText('UTC');
    await expect(list).toContainText('KST');
    await expect(list).toContainText('ISO 8601');
    await expect(list).toContainText('상대 시각');
  });

  test('타임스탬프 입력칸이 비면 결과 목록도 다시 빈 안내로 돌아간다', async ({ page }) => {
    await page.goto('/#/epoch');

    const timestampInput = page.locator('#tool-root input[placeholder="1700000000"]');
    const list = forward(page).locator('.result-list');
    const empty = forward(page).locator('.result-empty');

    await timestampInput.fill('1700000000');
    await expect(list).toHaveJSProperty('hidden', false);

    await timestampInput.fill('');
    await expect(list).toHaveJSProperty('hidden', true);
    await expect(empty).toHaveJSProperty('hidden', false);
  });

  // 아래는 '날짜 → 타임스탬프' 방향. 이 방향만 결과를 한 줄 문자열
  // (`초 … / 밀리초 …`)로 뭉쳐 .form-result 에 넣고 있었다 — 같은 화면, 같은 종류의
  // 답인데 위 방향과 모양이 달랐다.
  test('날짜 → 타임스탬프 방향도 초/밀리초를 라벨 붙은 행으로 낸다', async ({ page }) => {
    await page.goto('/#/epoch');

    const datetimeInput = page.locator('#tool-root input[placeholder="2023-11-15 07:13:20"]');
    await datetimeInput.fill('2023-11-15 07:13:20');

    const list = reverse(page).locator('.result-list');
    await expect(list).toHaveJSProperty('hidden', false);
    // KST 기준이 기본값이다: 2023-11-15 07:13:20 +09:00 = 1700000000. 값까지 고정해
    // 두면 행이 생겼다는 사실만 보고 통과하지 않는다.
    await expect(list.locator('dt')).toHaveText(['초', '밀리초']);
    await expect(list.locator('dd')).toHaveText(['1700000000', '1700000000000']);

    // 한 줄 문자열로 뭉쳐 넣던 .form-result 는 이 방향에 더 이상 남아 있지 않다.
    await expect(page.locator('#tool-root .form-result')).toHaveCount(0);
  });

  /*
   * 이 테스트는 '어제쯤' 을 넣고 있었다. 그 칸에 날짜·시각 마스크가 붙은 뒤로는
   * 한글이 칸에 들어가지 못하고 값이 빈 문자열이 되므로(=오류가 아니라 '입력 전'
   * 상태), 그 입력으로는 오류 경로를 더 이상 태울 수 없다. 마스크는 편의지
   * 경계가 아니라는 규칙을 실제로 재려면 **마스크를 통과하지만 계산이 거부하는**
   * 값을 써야 한다 — 완성되지 않은 부분 입력이 정확히 그것이다.
   */
  test('마스크를 통과한 부분 입력은 그 방향의 결과 자리에 한국어 오류가 뜬다', async ({ page }) => {
    await page.goto('/#/epoch');

    const datetimeInput = page.locator('#tool-root input[placeholder="2023-11-15 07:13:20"]');
    await datetimeInput.fill('2023-11');
    await expect(datetimeInput).toHaveValue('2023-11');

    await expect(reverse(page).locator('.io-error')).toContainText(
      'YYYY-MM-DD HH:mm:ss 형식으로 입력하세요.',
    );
    await expect(reverse(page).locator('.result-list')).toHaveJSProperty('hidden', true);
  });

  test('존재하지 않는 시각도 마스크를 통과해 계산 층의 한국어 오류가 된다', async ({ page }) => {
    await page.goto('/#/epoch');

    const datetimeInput = page.locator('#tool-root input[placeholder="2023-11-15 07:13:20"]');
    await datetimeInput.fill('2023-11-31 07:13:20');

    await expect(reverse(page).locator('.io-error')).toContainText(
      '존재하지 않는 날짜 또는 시각입니다.',
    );
  });

  test('두 방향은 서로 독립이다 — 한쪽을 입력해도 다른 쪽 결과가 지워지지 않는다', async ({ page }) => {
    await page.goto('/#/epoch');

    await page.locator('#tool-root input[placeholder="1700000000"]').fill('1700000000');
    await expect(forward(page).locator('.result-list')).toHaveJSProperty('hidden', false);

    await page.locator('#tool-root input[placeholder="2023-11-15 07:13:20"]').fill('2023-11-15 07:13:20');
    await expect(reverse(page).locator('.result-list')).toHaveJSProperty('hidden', false);
    // 위 방향 결과가 아래 방향 입력에 반응해 사라지면 안 된다.
    await expect(forward(page).locator('.result-list')).toHaveJSProperty('hidden', false);
    await expect(forward(page).locator('.result-list')).toContainText('ISO 8601');

    // 반대 방향도 대칭으로 확인한다.
    await page.locator('#tool-root input[placeholder="1700000000"]').fill('');
    await expect(forward(page).locator('.result-list')).toHaveJSProperty('hidden', true);
    await expect(reverse(page).locator('.result-list')).toHaveJSProperty('hidden', false);
    await expect(reverse(page).locator('.result-list')).toContainText('1700000000');
  });
});

// json-diff 는 한때 IOPane 밖에서 스스로 두 칸짜리 레이아웃을 재구현했었다. 이제
// createIOPane 의 secondInput 옵션을 써서 backstop/에러 표시를 다른 도구와 공유한다.
test.describe('json-diff: IOPane 의 두 입력을 쓴다', () => {
  test('왼쪽만 채워진 동안에는 "오른쪽을 입력하세요" 류의 하드 에러를 띄우지 않는다', async ({ page }) => {
    await page.goto('/#/json-diff');

    const areas = page.locator('#tool-root textarea:not([readonly])');
    await expect(areas).toHaveCount(2);

    await areas.nth(0).fill('{"a":1}');
    // 아직 오른쪽은 입력 전이다 — peers(단일 입력 도구)의 "완전히 비어 있으면
    // 에러 없이 조용하다" 규칙이 두 입력 모두에 대칭으로 적용돼야 한다.
    await expect(page.locator('#tool-root .io-error')).toHaveText('');
  });

  test('양쪽을 채우면 차이를 계산해 결과 textarea 에 보여준다', async ({ page }) => {
    await page.goto('/#/json-diff');

    const areas = page.locator('#tool-root textarea:not([readonly])');
    await areas.nth(0).fill('{"a":1}');
    await areas.nth(1).fill('{"a":2}');

    const output = page.locator('#tool-root textarea[readonly]');
    await expect(output).toHaveValue(/1개 차이/);
    await expect(output).toHaveValue(/a: 1 → 2/);
  });

  test('오른쪽이 구문 오류면 다른 JSON 도구와 같은 형식(줄/칸 안내)으로 알려준다', async ({ page }) => {
    await page.goto('/#/json-diff');

    const areas = page.locator('#tool-root textarea:not([readonly])');
    await areas.nth(0).fill('{"a":1}');
    await areas.nth(1).fill('not json');

    const error = page.locator('#tool-root .io-error');
    await expect(error).toContainText('오른쪽 JSON 구문 오류');
  });
});

/*
 * base64 / url-encode: **독립된 두 세트**를 한 화면에 놓는다.
 *
 * 두 번의 오답을 지나왔다. (1) 방향 select 하나 + 입력/출력 한 쌍 — 사용자가
 * 아무것도 하기 전에 "나는 어느 모드인가" 를 대답해야 했다. (2) 양방향으로 이어진
 * 두 칸 — 질문은 없어졌지만 한쪽을 고치면 반대쪽이 덮어써져서 인코딩과 디코딩을
 * 동시에 들고 있을 수 없었다. 여기 있는 테스트의 핵심은 그 마지막 것이다:
 * **한 세트를 만지는 것이 다른 세트의 값에 아무 영향을 주지 않는다.**
 */
function sets(page: Page) {
  const wraps = page.locator('#tool-root .io-wrap');
  const set = (index: number) => ({
    input: wraps.nth(index).locator('textarea:not([readonly])'),
    output: wraps.nth(index).locator('textarea[readonly]'),
    error: wraps.nth(index).locator('.io-error'),
  });
  return { wraps, encode: set(0), decode: set(1) };
}

test.describe('base64: 인코딩 세트와 디코딩 세트가 독립이다', () => {
  test('편집 가능한 입력 둘 + 읽기 전용 출력 둘이고 방향 select 는 없다', async ({ page }) => {
    await page.goto('/#/base64');
    const { wraps, encode, decode } = sets(page);

    await expect(wraps).toHaveCount(2);
    // 인코딩/디코딩을 먼저 고르게 하던 select 가 남아 있으면 안 된다.
    await expect(page.locator('#tool-root select')).toHaveCount(0);
    await expect(page.locator('#tool-root textarea:not([readonly])')).toHaveCount(2);
    await expect(page.locator('#tool-root textarea[readonly]')).toHaveCount(2);
    await expect(encode.input).toBeEditable();
    await expect(decode.input).toBeEditable();

    // 세트마다 무엇이 들어가고 무엇이 나오는지 라벨로 드러난다.
    await expect(page.locator('#tool-root .io-wrap').nth(0)).toContainText('원문');
    await expect(page.locator('#tool-root .io-wrap').nth(0)).toContainText('Base64');
    await expect(page.locator('#tool-root .section-heading')).toHaveText('Base64 → 원문');
  });

  /*
   * "두 세트를 동시에 본다" 가 이 화면의 존재 이유다. 입력창 기본 높이(56vh)를 그대로
   * 두면 세트 둘이 화면 두 개 분량이 되어 두 번째 세트가 늘 스크롤 뒤에 숨는다 —
   * 그러면 모드 select 로 한 방향씩 보던 시절과 실질적으로 같아진다.
   */
  for (const id of ['base64', 'url-encode']) {
    test(`${id}: 평범한 노트북 화면에서 두 세트가 함께 쓸 만큼 보인다`, async ({ page }) => {
      // 1280×720 은 흔한 노트북 크기다. 여기서 두 번째 세트가 "있다는 표시"만
      // 보이는 것으로는 부족하다 — 값을 여러 줄 읽고 고칠 수 있어야 한다.
      const height = 720;
      await page.setViewportSize({ width: 1280, height });
      await page.goto(`/#/${id}`);

      const decodeInput = sets(page).decode.input;
      await expect(decodeInput).toBeVisible();
      const box = await decodeInput.boundingBox();
      expect(box, '디코딩 세트 입력칸의 위치를 잴 수 없습니다').not.toBeNull();

      const visible = height - (box?.y ?? height);
      expect(
        visible,
        `디코딩 세트 입력칸이 첫 화면에서 ${Math.round(visible)}px 만 보입니다`,
      ).toBeGreaterThanOrEqual(200);
    });
  }

  test('인코딩 세트: 원문 → Base64', async ({ page }) => {
    await page.goto('/#/base64');
    const { encode } = sets(page);

    await encode.input.fill('안녕하세요');
    await expect(encode.output).toHaveValue('7JWI64WV7ZWY7IS47JqU');
  });

  test('디코딩 세트: Base64 → 원문', async ({ page }) => {
    await page.goto('/#/base64');
    const { decode } = sets(page);

    await decode.input.fill('aGVsbG8=');
    await expect(decode.output).toHaveValue('hello');
  });

  test('두 세트를 동시에 들고 있을 수 있다 — 한쪽을 고쳐도 다른 쪽이 그대로다', async ({
    page,
  }) => {
    await page.goto('/#/base64');
    const { encode, decode } = sets(page);

    // 이것이 양방향으로 이어진 설계에서 불가능했던 상태다: 인코딩 하나와 디코딩
    // 하나를 서로 관계없는 값으로 동시에 들고 있는 것.
    await decode.input.fill('aGVsbG8=');
    await expect(decode.output).toHaveValue('hello');

    await encode.input.fill('안녕하세요');
    await expect(encode.output).toHaveValue('7JWI64WV7ZWY7IS47JqU');
    // 디코딩 세트는 손대지 않았으므로 입력도 결과도 그대로여야 한다.
    await expect(decode.input).toHaveValue('aGVsbG8=');
    await expect(decode.output).toHaveValue('hello');

    // 반대 방향도 대칭으로 확인한다.
    await decode.input.fill('7JWI64WV');
    await expect(decode.output).toHaveValue('안녕');
    await expect(encode.input).toHaveValue('안녕하세요');
    await expect(encode.output).toHaveValue('7JWI64WV7ZWY7IS47JqU');
  });

  test('한 세트를 비워도 다른 세트는 그대로다', async ({ page }) => {
    await page.goto('/#/base64');
    const { encode, decode } = sets(page);

    await encode.input.fill('안녕하세요');
    await decode.input.fill('aGVsbG8=');

    await encode.input.fill('');
    await expect(encode.output).toHaveValue('');
    await expect(decode.output).toHaveValue('hello');
  });

  test('디코딩할 수 없는 값의 오류는 그 세트에만 뜨고 다른 세트는 멀쩡하다', async ({ page }) => {
    await page.goto('/#/base64');
    const { encode, decode } = sets(page);

    await encode.input.fill('안녕하세요');
    await decode.input.fill('!!!not base64!!!');

    await expect(decode.error).toContainText('Base64 형식이 아닙니다');
    await expect(decode.output).toHaveValue('');
    // 오류는 원인이 들어 있는 세트에만 붙는다.
    await expect(encode.error).toHaveText('');
    await expect(encode.input).toHaveValue('안녕하세요');
    await expect(encode.output).toHaveValue('7JWI64WV7ZWY7IS47JqU');
  });
});

test.describe('url-encode: 인코딩 세트와 디코딩 세트가 독립이다', () => {
  test('방향 select 는 없고 인코딩 범위 select 하나를 두 세트가 공유한다', async ({ page }) => {
    await page.goto('/#/url-encode');

    await expect(sets(page).wraps).toHaveCount(2);
    const selects = page.locator('#tool-root select');
    await expect(selects).toHaveCount(1);
    await expect(selects.locator('option')).toHaveText([
      '값 단위 (encodeURIComponent)',
      'URL 전체 (encodeURI)',
    ]);
  });

  test('두 세트가 각자 자기 방향으로 변환한다', async ({ page }) => {
    await page.goto('/#/url-encode');
    const { encode, decode } = sets(page);

    await encode.input.fill('한글 검색');
    await expect(encode.output).toHaveValue('%ED%95%9C%EA%B8%80%20%EA%B2%80%EC%83%89');

    await decode.input.fill('%ED%95%9C');
    await expect(decode.output).toHaveValue('한');
    // 인코딩 세트는 건드려지지 않았다.
    await expect(encode.input).toHaveValue('한글 검색');
    await expect(encode.output).toHaveValue('%ED%95%9C%EA%B8%80%20%EA%B2%80%EC%83%89');
  });

  test('공유 select 를 바꾸면 두 세트가 각자의 입력 기준으로 다시 계산된다', async ({ page }) => {
    await page.goto('/#/url-encode');
    const { encode, decode } = sets(page);

    await encode.input.fill('https://a.com/b?q=한글');
    await decode.input.fill('https%3A%2F%2Fa.com');
    // 값 단위(encodeURIComponent/decodeURIComponent)는 구분자까지 전부 다룬다.
    await expect(encode.output).toHaveValue('https%3A%2F%2Fa.com%2Fb%3Fq%3D%ED%95%9C%EA%B8%80');
    await expect(decode.output).toHaveValue('https://a.com');

    await page.locator('#tool-root select').selectOption('full');

    // encodeURI 는 구분자를 남기고, decodeURI 는 %3A/%2F 를 풀지 않는다 —
    // select 가 두 세트를 **모두** 다시 계산해야만 이 두 값이 함께 나온다.
    await expect(encode.output).toHaveValue('https://a.com/b?q=%ED%95%9C%EA%B8%80');
    await expect(decode.output).toHaveValue('https%3A%2F%2Fa.com');

    // 입력은 select 를 건드렸다고 바뀌지 않는다.
    await expect(encode.input).toHaveValue('https://a.com/b?q=한글');
    await expect(decode.input).toHaveValue('https%3A%2F%2Fa.com');
  });

  test('한 글자씩 치는 동안 편집 중인 칸이 다시 쓰이지 않는다 (커서가 끝으로 튀지 않는다)', async ({
    page,
  }) => {
    await page.goto('/#/url-encode');
    const { decode } = sets(page);

    // '%2D' 는 디코딩하면 '-' 이고 '-' 를 다시 인코딩하면 '%2D' 가 아니라 '-' 다.
    // 입력칸을 한 번이라도 다시 쓰는 구현은 여기서 사용자가 친 글자를 잃는다.
    await decode.input.click();
    await decode.input.pressSequentially('%2Dab');
    await expect(decode.output).toHaveValue('-ab');

    /*
     * 중간으로 커서를 옮겨 **두 글자** 끼워 넣는다. 한 글자만 넣으면 캐럿을 끝으로
     * 뺏는 구현도 통과한다 — 그 한 글자는 이미 제자리에 들어간 뒤이고, 뺏긴 캐럿이
     * 어디 있는지는 다음 글자를 칠 때만 값에 드러난다. (실측: 한 글자로 재던 동안
     * ioPane 의 run() 안에 setSelectionRange(끝) 를 심어도 이 테스트가 초록이었다.)
     */
    await page.keyboard.press('ArrowLeft');
    await decode.input.pressSequentially('XY');

    await expect(decode.input).toHaveValue('%2DaXYb');
    await expect(decode.output).toHaveValue('-aXYb');
  });

  test('잘못된 퍼센트 인코딩은 그 세트의 오류로 뜨고 다른 세트는 멀쩡하다', async ({ page }) => {
    await page.goto('/#/url-encode');
    const { encode, decode } = sets(page);

    await encode.input.fill('한글');
    await decode.input.fill('%ZZ');

    await expect(decode.error).toContainText('퍼센트 인코딩 형식이 올바르지 않습니다');
    await expect(encode.error).toHaveText('');
    await expect(encode.output).toHaveValue('%ED%95%9C%EA%B8%80');
  });
});
