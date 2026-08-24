import { test, expect, type Page } from '@playwright/test';

/**
 * 레이아웃 계약.
 *
 * 이 파일이 있는 이유: 네 도구(jwt · cron · chmod · totp)가 최상위 래퍼에
 * `tool-stack` 클래스를 붙이는데 **그 클래스가 styles.css 에 없었다.** 입력 카드와
 * 요약 배너와 결과 카드가 전부 0px 간격으로 맞붙어 있었는데, tsc 도 유닛 885건도
 * E2E 248건도 전부 통과했다. `visual-contract.spec.ts` 는 대비와 가로 스크롤만
 * 재기 때문이다 — 없는 클래스를 쓰는 것은 아무 층에서도 오류가 아니다.
 *
 * 그래서 여기서는 **위치와 폭을 잰다.** 색도 글자도 보지 않는다. 아래 항목은
 * 전부 실제로 화면에서 발견돼 고친 결함이고, 하나씩 그 결함을 되돌리면 이 파일이
 * 빨개진다(각 단언마다 mutation 으로 확인했다).
 *
 * 두 가지 함정을 이 파일 자신이 이미 한 번씩 밟았으니 적어 둔다.
 *
 *  1. **간격은 최상위 스택에만 있는 것이 아니다.** 처음 판은 `.tool-stack` 의
 *     직계 자식만 훑었는데, 같은 커밋이 chmod 의 요약·경고를 `.chmod-input-col`
 *     안으로, totp 의 검증 칸을 `.totp-panes` 오른쪽 열 안으로 옮겼다. 그래서 그
 *     두 열의 gap 을 지워도 전부 초록이었다 — 이 파일이 막으려던 결함이 이 파일의
 *     사각지대로 들어갔다. 세로로 쌓이는 컨테이너를 도구마다 명시한다.
 *  2. **폭 하나만 재면 그 폭을 만든 규칙 하나만 잡힌다.** totp 의 6열 배분을
 *     예전 auto-fit 으로 되돌려도 `fields.width < 본문 * 0.7` 은 그대로 참이었다.
 *     "무엇이 얼마나 넓은가" 만이 아니라 "무엇이 무엇보다 넓은가 · 어느 줄에
 *     있는가" 까지 재야 배분이 계약에 들어온다.
 *
 * 폭은 절대값으로 못 박지 않는다 — 토큰(--col-narrow, --content-max)이 바뀌면
 * 같이 움직여야 하는 값이지 이 파일이 지켜야 할 값이 아니다. 대신 본문 폭에 대한
 * 비율이나 두 요소의 관계로 잰다.
 */

const WIDE = { width: 1440, height: 1000 };
const NARROW = { width: 430, height: 1000 };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 세로로 쌓이는 컨테이너들. 각 도구가 자기 몫을 명시한다 — "최상위 스택만" 으로
 * 두면 중첩 열로 옮겨진 패널의 간격을 아무도 재지 않는다(위 주석 1번).
 */
const STACKS: Record<string, string[]> = {
  jwt: ['#tool-root > .tool-stack'],
  cron: ['#tool-root > .tool-stack'],
  chmod: ['#tool-root > .tool-stack', '#tool-root .chmod-input-col'],
  totp: ['#tool-root > .tool-stack', '#tool-root .totp-panes > div'],
};

/**
 * 2열 결과 격자들. 넓은 화면에서는 gap 이 가로 간격이라 세로로 잴 것이 없지만,
 * 900px 아래에서는 한 열로 접혀 **그 gap 이 곧 결과 카드 사이의 세로 간격**이 된다.
 * 위 STACKS 만 두면 여기가 그대로 사각지대다 — `.tool-stack` 사고와 같은 종류다.
 */
const NARROW_STACKS: Record<string, string[]> = {
  jwt: ['#tool-root .jwt-panes'],
  cron: ['#tool-root .cron-panes'],
  chmod: ['#tool-root .chmod-panes', '#tool-root .chmod-input-row'],
  totp: ['#tool-root .totp-panes'],
};

/**
 * 컨테이너의 직계 자식 중 화면에 그려지는 것들의 상자.
 *
 * `display: none` 으로 판별한다. 높이가 0 인지로 거르면 "높이가 0 으로 무너진
 * 패널" 까지 함께 빠져 나가, 잡아야 할 결함을 조용히 건너뛴다.
 */
async function stackChildBoxes(
  page: Page,
  selector: string,
): Promise<{ name: string; box: Box }[][]> {
  const groups = await page.evaluate((sel) => {
    // querySelectorAll 로 훑는다. 첫 매치만 보면 어느 것을 재고 있는지가 마크업의
    // 우연(예: 형제 하나가 div 가 아니라 section 인 것)에 달리고, 엉뚱한 컨테이너를
    // 재면서 계속 초록일 수 있다.
    const stacks = [...document.querySelectorAll(sel)];
    return stacks.map((stack) =>
      [...stack.children]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.className === '' ? el.tagName.toLowerCase() : String(el.className),
            box: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        }),
    );
  }, selector);
  expect(groups.length, `${selector} 를 찾지 못했습니다`).toBeGreaterThan(0);
  return groups;
}

/** 한 컨테이너 안에서 세로로 이웃한 자식들의 간격을 전부 잰다. */
async function expectVerticalGaps(page: Page, stack: string): Promise<void> {
  for (const children of await stackChildBoxes(page, stack)) {
    // 재는 대상이 실제로 여럿인지 먼저 확인한다. 하나짜리 목록을 훑고 통과하는
    // 테스트를 만들지 않기 위함이다.
    expect(children.length, `${stack} 의 패널이 둘 이상이어야 잴 것이 있다`).toBeGreaterThan(1);

    for (let i = 1; i < children.length; i++) {
      const above = children[i - 1]!;
      const below = children[i]!;
      // 같은 줄에 나란히 놓인 형제는 세로 간격을 잴 대상이 아니다.
      if (below.box.y < above.box.y + above.box.height) continue;
      const gap = below.box.y - (above.box.y + above.box.height);
      expect(
        gap,
        `${stack}: "${above.name}" 와 "${below.name}" 가 ${Math.round(gap)}px 로 붙어 있습니다`,
      ).toBeGreaterThanOrEqual(12);
    }
  }
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} 를 찾지 못했습니다`).not.toBeNull();
  return box as Box;
}

/*
 * 결과 패널이 실제로 그려진 상태로 만든다. 빈 화면에서는 자식이 한둘뿐이라
 * 간격을 재도 아무것도 잡지 못한다.
 */
const FILL: Record<string, (page: Page) => Promise<void>> = {
  jwt: async (page) => {
    await page
      .locator('#tool-root .io-wrap textarea:not([readonly])')
      .fill(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyNDI2MjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      );
    await expect(page.locator('#tool-root .jwt-card textarea').first()).not.toHaveValue('');
  },
  cron: async (page) => {
    await page.locator('#tool-root .io-wrap textarea:not([readonly])').fill('0 0 9-18 * * MON-FRI');
    await expect(page.locator('#tool-root .cron-summary')).not.toHaveText('');
  },
  chmod: async (page) => {
    await page.locator('#tool-root .io-wrap textarea:not([readonly])').fill('4755');
    await expect(page.locator('#tool-root .chmod-summary')).not.toHaveText('');
  },
  totp: async (page) => {
    await page.locator('#tool-root #totp-secret').fill('JBSWY3DPEHPK3PXP');
    await page.locator('#tool-root #totp-account').fill('rimichoi@daou.co.kr');
    await expect(page.locator('#tool-root .totp-qr')).toBeVisible();
  },
};

async function openFilled(page: Page, tool: string, viewport = WIDE): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(`/#/${tool}`);
  await page.locator(`#tool-root[data-tool="${tool}"]`).waitFor();
  await FILL[tool]!(page);
}

// ── 간격 ────────────────────────────────────────────────────────────────

for (const [tool, stacks] of Object.entries(STACKS)) {
  test(`${tool}: 세로로 쌓인 패널 사이에 간격이 있다`, async ({ page }) => {
    await openFilled(page, tool);
    for (const stack of stacks) await expectVerticalGaps(page, stack);
  });
}

for (const [tool, stacks] of Object.entries(NARROW_STACKS)) {
  test(`${tool}: 좁은 화면에서 한 열로 접힌 결과 카드 사이에도 간격이 있다`, async ({ page }) => {
    await openFilled(page, tool, NARROW);
    for (const stack of stacks) await expectVerticalGaps(page, stack);
  });
}

// ── 입력 폭과 높이 ──────────────────────────────────────────────────────

test('cron · chmod: 한 줄짜리 값을 받는 입력이 본문 폭만큼 늘어나지 않는다', async ({ page }) => {
  for (const tool of ['cron', 'chmod']) {
    await openFilled(page, tool);

    const root = await boxOf(page, '#tool-root');
    const card = await boxOf(page, '#tool-root .io-pane');
    // 크론 표현식도 chmod 모드도 40자를 넘지 않는다. 붙여넣는 문서용 폭을 그대로
    // 쓰면 커서는 왼쪽 끝, 테두리는 오른쪽 끝에 있어 칸의 모양이 아무 말도 못 한다.
    expect(
      card.width,
      `${tool}: 입력 카드가 ${Math.round(card.width)}px 로 본문(${Math.round(root.width)}px)을 거의 다 차지합니다`,
    ).toBeLessThan(root.width * 0.7);

    /*
     * 높이는 뷰포트에 대한 비율로 잰다. 되돌아갈 값이 26vh 이므로 절대 픽셀로
     * 못 박으면 뷰포트가 낮은 실행에서는 버그가 있어도 통과한다.
     */
    const area = await boxOf(page, '#tool-root .io-pane textarea');
    expect(
      area.height,
      `${tool}: 입력 높이가 ${Math.round(area.height)}px (뷰포트 ${WIDE.height}px)`,
    ).toBeLessThan(WIDE.height * 0.15);
  }
});

test('cron: 요약·경고가 입력 폭 안에 묶인다', async ({ page }) => {
  await openFilled(page, 'cron');
  // 입력이 620px 인데 그에 딸린 요약만 1130px 로 뻗어 있으면 무엇에 대한 말인지
  // 폭이 거짓말을 한다. totp 의 주의 줄, chmod 의 요약과 같은 기준이다.
  const card = await boxOf(page, '#tool-root .io-wrap');
  const summary = await boxOf(page, '#tool-root .cron-summary');
  expect(
    summary.width,
    `요약 ${Math.round(summary.width)}px, 입력 ${Math.round(card.width)}px`,
  ).toBeLessThanOrEqual(card.width + 1);
});

// ── chmod ───────────────────────────────────────────────────────────────

test('chmod: 체크박스 한 행을 눈으로 따라갈 수 있다', async ({ page }) => {
  await openFilled(page, 'chmod');

  const root = await boxOf(page, '#tool-root');
  const table = await boxOf(page, '#tool-root .chmod-grid table');
  /*
   * .panel 이 flex column 이라 표가 교차축으로 늘어나, 행 라벨(소유자)은 화면
   * 왼쪽 끝에 실행 칸은 오른쪽 끝에 있었다. 한 행이 1100px 로 벌어지면 어느
   * 체크박스가 어느 행인지 눈이 따라가지 못한다.
   */
  expect(
    table.width,
    `체크박스 표가 ${Math.round(table.width)}px 입니다 (본문 ${Math.round(root.width)}px)`,
  ).toBeLessThan(root.width * 0.4);

  // 모드 입력과 격자가 같은 줄에 있다 — 세로로 쌓으면 격자 오른쪽이 통째로 빈다.
  const col = await boxOf(page, '#tool-root .chmod-input-col');
  const grid = await boxOf(page, '#tool-root .chmod-grid');
  expect(grid.x, '격자가 입력 열 오른쪽에 있지 않습니다').toBeGreaterThan(col.x + col.width - 1);
  expect(grid.y, '격자가 입력 열과 같은 줄에 있지 않습니다').toBeLessThan(col.y + col.height);

  // 요약·경고가 입력 카드와 같은 폭이다(입력 열이 넓어지면 둘만 어긋난다).
  const card = await boxOf(page, '#tool-root .io-pane');
  const summary = await boxOf(page, '#tool-root .chmod-summary');
  expect(
    Math.abs(summary.width - card.width),
    `요약 ${Math.round(summary.width)}px, 입력 ${Math.round(card.width)}px`,
  ).toBeLessThan(2);

  // 특수 비트는 3×3 표의 네 번째 행이 아니다. 선 하나로 갈라 놓는다.
  const border = await page
    .locator('#tool-root .chmod-specials')
    .evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(border, '특수 비트 줄이 표와 시각적으로 분리돼 있지 않습니다').not.toBe('0px');
});

test('chmod: 좁은 화면에서는 격자가 입력 아래로 내려간다', async ({ page }) => {
  await openFilled(page, 'chmod', NARROW);
  const col = await boxOf(page, '#tool-root .chmod-input-col');
  const grid = await boxOf(page, '#tool-root .chmod-grid');
  expect(grid.y, '격자가 아래로 접히지 않았습니다').toBeGreaterThan(col.y + col.height - 1);
});

// ── jwt ─────────────────────────────────────────────────────────────────

test('jwt: 시간 클레임이 헤더·페이로드와 같은 폭으로 놓인다', async ({ page }) => {
  await openFilled(page, 'jwt');

  const panes = await boxOf(page, '#tool-root .jwt-panes');
  const times = await boxOf(page, '#tool-root .result-list-wrap');
  /*
   * 시간 클레임은 헤더·페이로드와 같은 결과인데 공용 --col-narrow 를 그대로 받아
   * 혼자 절반 폭으로 서 있었고, 그 안에서 값이 `3140일 전에 만료 / 됨` 으로 접혔다.
   */
  expect(
    Math.abs(times.width - panes.width),
    `시간 클레임 ${Math.round(times.width)}px, 결과 줄 ${Math.round(panes.width)}px`,
  ).toBeLessThan(2);

  // 값이 두 줄로 접히지 않는다 — 한 행의 높이로 잰다.
  const row = await boxOf(page, '#tool-root .result-list dd:first-of-type');
  expect(row.height, `클레임 값이 ${Math.round(row.height)}px 로 접혀 있습니다`).toBeLessThan(30);
});

test('jwt: 비밀키 칸과 토큰 칸이 담는 값에 맞는 크기다', async ({ page }) => {
  await openFilled(page, 'jwt');

  const root = await boxOf(page, '#tool-root');
  // 비밀키는 한 줄짜리 값이다. 결과 줄과 같은 폭으로 두면 입력인지 결과인지 모른다.
  const secret = await boxOf(page, '#tool-root .jwt-secret');
  expect(secret.width, `비밀키 줄이 ${Math.round(secret.width)}px 입니다`).toBeLessThan(
    root.width * 0.7,
  );

  // 토큰 칸은 두 줄짜리 토큰에 26vh(=260px)를 쓰고 있었다.
  const area = await boxOf(page, '#tool-root .io-pane textarea');
  expect(area.height, `토큰 칸이 ${Math.round(area.height)}px 입니다`).toBeLessThan(
    WIDE.height * 0.2,
  );
});

// ── totp ────────────────────────────────────────────────────────────────

test('totp: 이름 칸과 설정 칸이 같은 폭을 나눠 갖지 않는다', async ({ page }) => {
  await openFilled(page, 'totp');

  const root = await boxOf(page, '#tool-root');
  const fields = await boxOf(page, '#tool-root .totp-fields');
  expect(fields.width, `설정 줄이 ${Math.round(fields.width)}px 입니다`).toBeLessThan(
    root.width * 0.7,
  );

  const secret = await boxOf(page, '#tool-root .totp-secret');
  expect(Math.abs(fields.width - secret.width), '비밀키 줄과 설정 줄의 폭이 다릅니다').toBeLessThan(
    2,
  );

  /*
   * 배분을 잰다. 폭만 재면 max-width 하나만 잡히고, 다섯 칸을 균등 분할하던
   * 예전 auto-fit 으로 되돌려도 초록이었다. 이메일이 들어가는 계정 칸은
   * `30초 (기본)` 한 마디를 고르는 주기 칸보다 넓어야 하고, 이름 줄과 설정 줄은
   * 서로 다른 줄에 있어야 한다.
   */
  const account = await boxOf(page, '#tool-root .totp-fields > .totp-field:nth-child(2)');
  const algorithm = await boxOf(page, '#tool-root .totp-fields > .totp-field:nth-child(3)');
  expect(
    account.width,
    `계정 ${Math.round(account.width)}px, 알고리즘 ${Math.round(algorithm.width)}px`,
  ).toBeGreaterThan(algorithm.width + 1);
  expect(algorithm.y, '이름 줄과 설정 줄이 같은 줄에 있습니다').toBeGreaterThan(
    account.y + account.height - 1,
  );
});

test('totp: 좁은 화면에서는 설정 칸이 한 줄에 하나씩 내려온다', async ({ page }) => {
  await openFilled(page, 'totp', NARROW);
  const issuer = await boxOf(page, '#tool-root .totp-fields > .totp-field:nth-child(1)');
  const account = await boxOf(page, '#tool-root .totp-fields > .totp-field:nth-child(2)');
  // 6열 격자를 좁은 화면까지 끌고 가면 칸 하나가 60px 밑으로 내려간다.
  expect(account.y, '발급자와 계정이 좁은 화면에서도 같은 줄에 있습니다').toBeGreaterThan(
    issuer.y + issuer.height - 1,
  );
});

test('totp: 결과와 검증 칸이 한 열 안에 계단 없이 놓인다', async ({ page }) => {
  await openFilled(page, 'totp');

  const qr = await boxOf(page, '#tool-root .totp-qr-card');
  const uri = await boxOf(page, '#tool-root .totp-uri-card');
  const code = await boxOf(page, '#tool-root .result-list-wrap');
  const verify = await boxOf(page, '#tool-root .totp-verify');

  /*
   * "앱이 보여주는 코드" 는 "지금 코드" 와 맞대보라고 있는 칸이다. 화면 맨 아래에
   * 전폭으로 떨어져 있으면 무엇과 비교하라는 것인지 배치가 말해주지 못한다.
   *
   * 세로 순서(verify.y > code.y)만으로는 아무것도 못 잡는다 — 맨 아래에 있어도
   * 참이다. 같은 열에 있는지를 왼쪽 변으로 잰다.
   */
  expect(verify.x, '검증 칸이 QR 오른쪽 열에 있지 않습니다').toBeGreaterThan(qr.x + qr.width - 1);
  expect(
    Math.abs(verify.x - code.x),
    `검증 칸 x=${Math.round(verify.x)}, 지금 코드 x=${Math.round(code.x)}`,
  ).toBeLessThan(2);
  expect(verify.y, '검증 칸이 지금 코드 아래에 있지 않습니다').toBeGreaterThan(
    code.y + code.height - 1,
  );

  // 지금 코드가 위 URI 카드와 같은 폭이다 — 공용 --col-narrow 를 그대로 받으면
  // 혼자 좁아져 열 안에서 계단이 생긴다.
  expect(
    Math.abs(code.width - uri.width),
    `지금 코드 ${Math.round(code.width)}px, URI ${Math.round(uri.width)}px`,
  ).toBeLessThan(2);

  // 여섯 자리를 받는 칸이 열 폭을 다 먹지 않는다.
  const input = await boxOf(page, '#tool-root #totp-verify-code');
  expect(input.width, `검증 칸 입력이 ${Math.round(input.width)}px 입니다`).toBeLessThan(250);
});

test('totp: 설정에 딸린 주의 줄이 설정 폭 안에 묶인다', async ({ page }) => {
  await openFilled(page, 'totp');
  // 10바이트 비밀키라 "RFC 4226 은 16바이트 이상을 권합니다" 주의가 뜬다.
  const warning = page.locator('#tool-root .totp-warnings .io-warn').first();
  await expect(warning).toBeVisible();

  const fields = await boxOf(page, '#tool-root .totp-fields');
  const box = await boxOf(page, '#tool-root .totp-warnings');
  expect(
    box.width,
    `주의 줄 ${Math.round(box.width)}px, 설정 줄 ${Math.round(fields.width)}px`,
  ).toBeLessThanOrEqual(fields.width + 1);
});
