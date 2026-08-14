import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// e2e/fixtures/gps-sample.jpg 는 GPS EXIF 만 담은 142바이트짜리 손패킹 JPEG 이다.
// 재생성 방법: e2e/fixtures/generate-gps-jpeg.mjs (순수 Node, 의존성 없음).
// 좌표는 그 스크립트의 주석대로 37.5665 / 126.978 (logic.test.ts 의
// formatCoordinate 케이스와 동일한 값)로 고정되어 있다.
const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/gps-sample.jpg');

const BASE = 'http://localhost:4173';
const BASE_ORIGIN = new URL(BASE).origin;

test('exif: GPS 픽스처를 넣으면 경고 배너와 좌표가 화면에 보인다', async ({ page }) => {
  const external: string[] = [];
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

  await page.goto('/#/exif');
  await expect(page.locator('#tool-root')).not.toBeEmpty();

  await page.locator('#tool-root input[type="file"]').setInputFiles(FIXTURE_PATH);

  const warn = page.locator('#tool-root .io-warn');
  await expect(warn).toContainText('주의: 촬영 위치(GPS)가 들어 있습니다.');
  await expect(warn).toContainText('37.566500, 126.978000');
  await expect(warn).toContainText('공유 전에 제거를 검토하세요.');

  // 메타데이터 표에도 GPS 관련 행이 채워져야 한다.
  await expect(page.locator('#tool-root .exif-table')).toContainText('GPS 위도');
  await expect(page.locator('#tool-root .exif-table')).toContainText('GPS 경도');

  // 픽스처를 다루는 과정에서 off-origin 요청이 새로 생기지 않아야 한다
  // (지도 링크·임베드·역지오코딩 금지 규칙의 실측 확인).
  await page.waitForTimeout(300);
  expect(external, `외부 요청이 발생했습니다: ${external.join(' | ')}`).toEqual([]);
});
