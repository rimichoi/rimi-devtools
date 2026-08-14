import { test, expect } from '@playwright/test';
import { TOOL_IDS, sampleFor } from './tools';

const BASE = 'http://localhost:4173';
const BASE_ORIGIN = new URL(BASE).origin;

// textarea(읽기 전용 제외)뿐 아니라 type 이 생략된 input, text/search/number input 까지 잡는다.
const TEXT_FIELD_SELECTOR =
  '#tool-root textarea:not([readonly]), #tool-root input:not([readonly]):is([type="text"], [type="search"], [type="number"], :not([type]))';

for (const id of TOOL_IDS) {
  test(`${id}: 외부로 나가는 요청과 CSP 위반이 없다`, async ({ page }) => {
    const external: string[] = [];
    const cspViolations: string[] = [];

    page.on('request', (req) => {
      let origin: string;
      try {
        origin = new URL(req.url()).origin;
      } catch {
        origin = req.url();
      }
      if (origin !== BASE_ORIGIN && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
        external.push(`${req.method()} ${req.url()}`);
      }
    });
    page.on('console', (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) cspViolations.push(msg.text());
    });

    await page.goto(`/#/${id}`);
    // tool.load() 는 동적 import 라 #tool-root 가 비동기로 채워진다. 이 대기가
    // auto-retry 되므로, 아래에서 입력 필드를 찾기 전에 mount 경합을 닫아둔다.
    await expect(page.locator('#tool-root')).not.toBeEmpty();

    const sample = sampleFor(id);
    if (sample.kind === 'text') {
      const fields = page.locator(TEXT_FIELD_SELECTOR);
      const count = await fields.count();
      // 텍스트 입력이 있다고 선언한 도구인데 필드를 못 찾으면, 아무것도 타이핑하지
      // 않은 채 통과하는 대신 여기서 바로 실패한다.
      expect(count, `${id}: 텍스트 입력을 선언했지만 입력 필드를 찾지 못했습니다`).toBeGreaterThan(0);

      for (let i = 0; i < sample.values.length && i < count; i++) {
        const value = sample.values[i];
        if (value === undefined) continue;
        await fields.nth(i).fill(value);
      }
    }

    await page.waitForTimeout(300);

    expect(external, `외부 요청이 발생했습니다: ${external.join(' | ')}`).toEqual([]);
    expect(cspViolations, `CSP 위반: ${cspViolations.join(' | ')}`).toEqual([]);
  });
}
