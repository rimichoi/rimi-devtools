import { test, expect, type Locator, type Page } from '@playwright/test';
import { TOOL_IDS, sampleFor } from './tools';

/**
 * 시각 계약. 여기 있는 것은 "예쁘다"가 아니라, 눈으로 보면 바로 알지만 코드로는
 * 조용히 무너지는 속성들이다. 실제로 두 번 무너졌다:
 *
 *  - 전경색 하드코딩(#fff)으로 다크 테마 --error 위 대비가 2.77:1 까지 떨어졌다.
 *    스타일시트 주석은 그 사건을 기록하고 있었지만, 그걸 지켜보는 테스트는 없었다.
 *  - 다크 테마에서 placeholder 를 브라우저 기본값(rgb(117,117,117))에 맡겨
 *    4.04:1 이었다. 아무 테스트도 빨갛지 않았다.
 *
 * 그래서 "본문 텍스트 대비 4.5:1" 을 색이 아니라 계산된 스타일로 측정해 고정한다.
 */

/** 화면에 그려진 텍스트의 실측 대비를 전부 모아 온다. */
async function measureContrast(page: Page): Promise<
  {
    el: string;
    kind: string;
    text: string;
    fg: string;
    bg: string;
    ratio: number;
    required: number;
  }[]
> {
  return page.evaluate(() => {
    type Rgb = { r: number; g: number; b: number; a: number };

    function parse(color: string): Rgb | null {
      const m = /rgba?\(([^)]+)\)/.exec(color);
      if (!m?.[1]) return null;
      const parts = m[1]
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      const [r, g, b, a] = parts;
      if (r === undefined || g === undefined || b === undefined) return null;
      return { r, g, b, a: a === undefined ? 1 : a };
    }

    function relativeLuminance({ r, g, b }: Rgb): number {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    /** 반투명 전경을 배경 위에 합성한다. */
    function composite(fg: Rgb, bg: Rgb): Rgb {
      return {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      };
    }

    function contrast(a: Rgb, b: Rgb): number {
      const l1 = relativeLuminance(a);
      const l2 = relativeLuminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    /**
     * 조상을 타고 올라가 실제로 눈에 보이는 배경색을 만든다. 요소 자신의
     * background 가 투명하면(대부분의 텍스트 요소가 그렇다) 그 위 조상의 색이
     * 실제 배경이다 — 이걸 안 하면 거의 모든 측정이 "흰 배경" 으로 잘못 나온다.
     */
    function effectiveBackground(el: Element): Rgb {
      const layers: Rgb[] = [];
      let cursor: Element | null = el;
      while (cursor) {
        const bg = parse(getComputedStyle(cursor).backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 1) break;
        }
        cursor = cursor.parentElement;
      }
      let result: Rgb = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer) result = composite(layer, result);
      }
      return result;
    }

    function isVisible(el: Element): boolean {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function describe(el: Element): string {
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      return el.tagName.toLowerCase() + (cls === '' ? '' : `.${cls.split(/\s+/).join('.')}`);
    }

    const results: {
      el: string;
      kind: string;
      text: string;
      fg: string;
      bg: string;
      ratio: number;
      required: number;
    }[] = [];

    for (const el of document.querySelectorAll('*')) {
      if (!isVisible(el)) continue;
      const cs = getComputedStyle(el);

      // 자식 요소의 텍스트를 중복 계산하지 않도록 '직접 자식 텍스트 노드' 만 본다.
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
        .map((n) => n.textContent)
        .join(' ')
        .trim();

      const field =
        el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el : null;

      const bg = effectiveBackground(el);
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      // WCAG 의 '큰 텍스트' 예외(18.66px 이상 굵게 또는 24px 이상)는 3:1 이다.
      const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;

      const record = (kind: string, colorString: string, text: string): void => {
        const raw = parse(colorString);
        if (!raw) return;
        const ratio = contrast(composite(raw, bg), bg);
        results.push({
          el: describe(el),
          kind,
          text: text.slice(0, 40).replace(/\s+/g, ' '),
          fg: colorString,
          bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
          ratio: Math.round(ratio * 100) / 100,
          required,
        });
      };

      if (ownText !== '') record('text', cs.color, ownText);
      // 입력/출력 필드의 값과 placeholder 도 사람이 읽는 텍스트다. placeholder 를
      // 브라우저 기본값에 맡겼다가 다크 테마에서 4.04:1 이 된 전례가 있다.
      if (field && field.value !== '') record('value', cs.color, field.value);
      if (field && field.placeholder !== '') {
        record('placeholder', getComputedStyle(field, '::placeholder').color, field.placeholder);
      }
    }

    return results;
  });
}

/** 도구를 '실제로 쓰는 중' 상태로 만든다. 빈 화면만 재면 결과/경고 색을 한 번도 못 본다. */
async function driveTool(page: Page, id: string): Promise<void> {
  const sample = sampleFor(id);
  if (sample.kind === 'text') {
    const fields = page.locator(
      '#tool-root textarea:not([readonly]), #tool-root input[type="text"]',
    );
    const count = await fields.count();
    expect(count, `${id}: 입력 필드를 찾지 못했습니다`).toBeGreaterThan(0);
    for (let i = 0; i < sample.values.length && i < count; i++) {
      const value = sample.values[i];
      if (value !== undefined) await fields.nth(i).fill(value);
    }
    // 비밀번호 칸은 위 셀렉터에 걸리지 않는다(걸리게 만들면 다른 도구의 값 순서가
    // 밀린다). 선언했는데 못 찾으면 빈 결과 화면을 재고 통과하는 대신 실패한다.
    if (sample.secret !== undefined) {
      const secretFields = page.locator('#tool-root input[type="password"]');
      expect(await secretFields.count(), `${id}: 비밀번호 입력을 찾지 못했습니다`).toBeGreaterThan(0);
      await secretFields.first().fill(sample.secret);
    }
  } else if (sample.kind === 'file') {
    await page.locator('#tool-root input[type="file"]').first().setInputFiles(sample.path);
    await expect(page.locator(sample.settledSelector).first()).toBeVisible();
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} 테마`, () => {
    test.use({ colorScheme });

    test('모든 도구의 본문 텍스트 대비가 4.5:1 이상이다', async ({ page }) => {
      const failures: string[] = [];

      for (const id of TOOL_IDS) {
        await page.goto(`/#/${id}`);
        await expect(page.locator('#tool-root')).not.toBeEmpty();
        await driveTool(page, id);

        for (const row of await measureContrast(page)) {
          if (row.ratio < row.required) {
            failures.push(
              `${id} › ${row.el} (${row.kind}) ${row.ratio}:1 < ${row.required}:1 ` +
                `fg=${row.fg} bg=${row.bg} "${row.text}"`,
            );
          }
        }
      }

      // 오류/경고 상태도 색을 새로 쓰는 자리이므로 함께 잰다.
      await page.goto('/#/json-format');
      const input = page.locator('#tool-root textarea:not([readonly])').first();
      for (const [label, value] of [
        ['구문 오류', '{"a": 1,,}'],
        ['정밀도 경고', '{"id": 12345678901234567890}'],
      ] as const) {
        await input.fill(value);
        await expect(page.locator(`#tool-root .io-${label === '구문 오류' ? 'error' : 'warn'}`)).not.toBeEmpty();
        for (const row of await measureContrast(page)) {
          if (row.ratio < row.required) {
            failures.push(
              `json-format/${label} › ${row.el} (${row.kind}) ${row.ratio}:1 < ${row.required}:1 ` +
                `fg=${row.fg} bg=${row.bg} "${row.text}"`,
            );
          }
        }
      }

      // 팔레트는 오버레이 위에 그려지므로 배경 합성이 달라진다 — 따로 잰다.
      await page.keyboard.press('ControlOrMeta+k');
      await expect(page.locator('.palette-overlay')).toBeVisible();
      for (const row of await measureContrast(page)) {
        if (row.ratio < row.required) {
          failures.push(
            `palette › ${row.el} (${row.kind}) ${row.ratio}:1 < ${row.required}:1 ` +
              `fg=${row.fg} bg=${row.bg} "${row.text}"`,
          );
        }
      }

      expect(failures, `대비 미달 ${failures.length}건:\n${failures.join('\n')}`).toEqual([]);
    });

    /*
     * WCAG 1.4.11 (비텍스트 대비 3:1). 스타일시트의 테두리 대비 규칙 — "사용자가
     * 타이핑할 수 있는 표면의 경계는 --border-strong, 내용을 묶기만 하는 컨테이너는
     * --border" — 을 실측으로 고정한다.
     *
     * 이 규칙은 한 번 조용히 어긋난 적이 있다. 단일 줄 input 은 --border-strong
     * (3.6:1)이었는데 textarea 를 감싼 패널 카드는 --border(1.25:1)여서, 같은
     * 화면에서 "타이핑하는 자리" 가 두 가지 대우를 받고 있었다. 그걸 지켜보는
     * 테스트가 없었기 때문에 아무것도 빨갛지 않았다.
     *
     * 클래스 이름이 아니라 성질로 잰다: '편집 가능한 필드'에서 위로 올라가며 실제로
     * 테두리를 그리는 첫 상자를 찾아, 그 테두리색을 상자 바깥 배경과 비교한다.
     * (.io-pane textarea 는 border:0 이고 감싼 카드가 경계를 그린다. 단일 줄 input 은
     * 자기 자신이 그린다. 어느 쪽이든 사용자 눈에는 '그 칸의 경계'다.)
     */
    test('편집 가능한 표면의 경계 대비가 3:1 이상이다', async ({ page }) => {
      const failures: string[] = [];
      let measured = 0;

      for (const id of TOOL_IDS) {
        await page.goto(`/#/${id}`);
        await expect(page.locator('#tool-root')).not.toBeEmpty();
        await driveTool(page, id);
        // 포커스가 남아 있으면 그 칸은 --accent 테두리(5:1 이상)로 그려진다.
        // 평상시 테두리를 재는 것이 목적이므로 반드시 포커스를 푼다.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        // 카드 테두리에 90ms transition 이 걸려 있다. 전환이 끝난 뒤 재야
        // 중간값이 아니라 평상시 색을 잰다.
        await page.waitForTimeout(150);

        const rows = await measureEditableBorders(page);
        measured += rows.length;
        for (const row of rows) {
          if (row.ratio < 3) {
            failures.push(
              `${id} › ${row.el} (경계를 그리는 상자: ${row.box}) ${row.ratio}:1 < 3:1 ` +
                `border=${row.fg} bg=${row.bg}`,
            );
          }
        }
      }

      // 셀렉터가 어긋나 아무것도 못 재고 조용히 초록이 되는 것을 막는다.
      expect(measured, '편집 가능한 표면을 하나도 재지 못했습니다').toBeGreaterThanOrEqual(12);
      expect(failures, `경계 대비 미달 ${failures.length}건:\n${failures.join('\n')}`).toEqual([]);
    });
  });
}

/**
 * 편집 가능한 필드마다, 실제로 경계선을 그리는 첫 상자(자기 자신이거나 조상)의
 * 테두리색을 그 상자 바깥 배경과 비교한 대비를 모아 온다.
 */
async function measureEditableBorders(page: Page): Promise<
  { el: string; box: string; fg: string; bg: string; ratio: number }[]
> {
  return page.evaluate(() => {
    type Rgb = { r: number; g: number; b: number; a: number };

    function parse(color: string): Rgb | null {
      const m = /rgba?\(([^)]+)\)/.exec(color);
      if (!m?.[1]) return null;
      const parts = m[1]
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      const [r, g, b, a] = parts;
      if (r === undefined || g === undefined || b === undefined) return null;
      return { r, g, b, a: a === undefined ? 1 : a };
    }

    function relativeLuminance({ r, g, b }: Rgb): number {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    function composite(fg: Rgb, bg: Rgb): Rgb {
      return {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      };
    }

    function contrast(a: Rgb, b: Rgb): number {
      const l1 = relativeLuminance(a);
      const l2 = relativeLuminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function effectiveBackground(el: Element | null): Rgb {
      const layers: Rgb[] = [];
      let cursor: Element | null = el;
      while (cursor) {
        const bg = parse(getComputedStyle(cursor).backgroundColor);
        if (bg && bg.a > 0) {
          layers.push(bg);
          if (bg.a >= 1) break;
        }
        cursor = cursor.parentElement;
      }
      let result: Rgb = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer) result = composite(layer, result);
      }
      return result;
    }

    function describe(el: Element): string {
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      return el.tagName.toLowerCase() + (cls === '' ? '' : `.${cls.split(/\s+/).join('.')}`);
    }

    /** 자기 자신부터 위로 올라가며 실제로 눈에 보이는 테두리를 그리는 첫 상자. */
    function borderedBox(el: Element): Element | null {
      let cursor: Element | null = el;
      while (cursor && cursor !== document.body) {
        const cs = getComputedStyle(cursor);
        const width = parseFloat(cs.borderTopWidth);
        const color = parse(cs.borderTopColor);
        if (width > 0 && cs.borderTopStyle !== 'none' && color && color.a > 0) return cursor;
        cursor = cursor.parentElement;
      }
      return null;
    }

    const results: { el: string; box: string; fg: string; bg: string; ratio: number }[] = [];

    // 비밀번호 칸도 사용자가 타이핑하는 표면이다 — 같은 테두리 규칙을 받아야 한다.
    const fields = document.querySelectorAll(
      '#tool-root textarea:not([readonly]), #tool-root input:not([readonly]):is([type="text"], [type="password"])',
    );
    for (const field of fields) {
      const rect = field.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const box = borderedBox(field);
      if (!box) {
        // 경계를 그리는 상자가 아예 없다 = 사용자가 이 칸의 범위를 볼 수 없다.
        results.push({ el: describe(field), box: '(없음)', fg: 'none', bg: 'none', ratio: 0 });
        continue;
      }

      const cs = getComputedStyle(box);
      const outside = effectiveBackground(box.parentElement);
      const border = parse(cs.borderTopColor);
      if (!border) continue;
      results.push({
        el: describe(field),
        box: describe(box),
        fg: cs.borderTopColor,
        bg: `rgb(${Math.round(outside.r)}, ${Math.round(outside.g)}, ${Math.round(outside.b)})`,
        ratio: Math.round(contrast(composite(border, outside), outside) * 100) / 100,
      });
    }

    return results;
  });
}

test('모든 도구가 이름(h1)과 한 줄 설명을 본문 머리말에 노출한다', async ({ page }) => {
  for (const id of TOOL_IDS) {
    await page.goto(`/#/${id}`);
    await expect(page.locator('#tool-root')).not.toBeEmpty();

    const title = page.locator('#tool-header h1.tool-title');
    await expect(title, `${id}: 도구 이름 제목이 없습니다`).toBeVisible();
    expect((await title.textContent())?.trim(), `${id}: 제목이 비어 있습니다`).not.toBe('');

    const desc = page.locator('#tool-header .tool-desc');
    await expect(desc, `${id}: 도구 설명이 없습니다`).toBeVisible();
    expect((await desc.textContent())?.trim().length ?? 0, `${id}: 설명이 비어 있습니다`).toBeGreaterThan(
      0,
    );
  }
});

async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const size = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    size.scrollWidth,
    `${label}: 가로 스크롤이 생겼습니다 (scrollWidth ${size.scrollWidth} > clientWidth ${size.clientWidth})`,
  ).toBeLessThanOrEqual(size.clientWidth);
}

/** 요소 안의 글자가 상자 밖으로 삐져나가(=잘려) 있지 않은지 본다. */
async function expectTextNotClipped(locator: Locator, label: string): Promise<void> {
  const size = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    size.scrollWidth,
    `${label}: 글자가 상자를 넘쳐 잘립니다 (scrollWidth ${size.scrollWidth} > clientWidth ${size.clientWidth})`,
  ).toBeLessThanOrEqual(size.clientWidth);
}

test('좁은 화면에서 가로 스크롤이 생기지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 780 });

  for (const id of TOOL_IDS) {
    await page.goto(`/#/${id}`);
    await expect(page.locator('#tool-root')).not.toBeEmpty();
    await driveTool(page, id);
    await expectNoHorizontalScroll(page, id);
  }

  /*
   * 페이지 스크롤만 보는 것으로는 부족하다. 420px 폭에서 scrollWidth 를 427px 로
   * 밀어냈던 값은 '끊을 곳이 없는 20자리 정수' 인데, 이제 그 문구를 담은 카드가
   * overflow:hidden 이라 줄바꿈이 없어도 페이지는 안 밀린다 — 대신 글자가 잘려
   * 안 보인다. 그건 더 나쁘다. 그래서 문구 상자 자신이 넘치지 않는지도 확인한다.
   * (실측: 이 문단이 없으면 .io-warn 의 overflow-wrap 을 지워도 초록색이었다.)
   */
  await page.goto('/#/json-format');
  await expect(page.locator('#tool-root')).not.toBeEmpty();
  // 자리수를 넉넉히 준다. 20자리는 400px 화면에도 그냥 들어가서, 줄바꿈 규칙이
  // 사라져도 아무 일이 없다 — 사람들이 실제로 붙여넣는 긴 해시/ID 길이로 잰다.
  await page
    .locator('#tool-root textarea:not([readonly])')
    .first()
    .fill('{"id": 123456789012345678901234567890123456789012345678901234567890}');
  const warn = page.locator('#tool-root .io-warn');
  await expect(warn).not.toBeEmpty();
  await expectNoHorizontalScroll(page, 'json-format/정밀도 경고');
  await expectTextNotClipped(warn, '정밀도 경고 문구');

  // EXIF 표의 긴 좌표값도 같은 부류다.
  await page.goto('/#/exif');
  await expect(page.locator('#tool-root')).not.toBeEmpty();
  await driveTool(page, 'exif');
  await expectNoHorizontalScroll(page, 'exif/메타데이터 표');
  await expectTextNotClipped(page.locator('#tool-root .exif-table'), 'EXIF 메타데이터 표');
});
