import { test, expect } from '@playwright/test';
import { TOOL_IDS, sampleFor } from './tools';

const BASE = 'http://localhost:4173';

for (const id of TOOL_IDS) {
  test(`${id}: 외부로 나가는 요청과 CSP 위반이 없다`, async ({ page }) => {
    const external: string[] = [];
    const cspViolations: string[] = [];

    page.on('request', (req) => {
      if (!req.url().startsWith(BASE) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
        external.push(`${req.method()} ${req.url()}`);
      }
    });
    page.on('console', (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) cspViolations.push(msg.text());
    });

    await page.goto(`/#/${id}`);

    const input = page.locator('#tool-root textarea:not([readonly]), #tool-root input[type="text"]').first();
    if (await input.count()) {
      await input.fill(sampleFor(id));
      await page.waitForTimeout(300);
    }

    expect(external, `외부 요청이 발생했습니다: ${external.join(' | ')}`).toEqual([]);
    expect(cspViolations, `CSP 위반: ${cspViolations.join(' | ')}`).toEqual([]);
  });
}
