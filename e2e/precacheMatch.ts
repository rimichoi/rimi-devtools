// service worker 의 precache 매니페스트에서 특정 도구 id 의 청크가 실제로
// 있는지 판정하는 순수 로직. 도구 청크 파일명은 `${id}-${hash}.js` 형태인데,
// hash 부분도 하이픈을 포함할 수 있어 `${id}-` 로 시작하는지만 보면 도구 id
// 하나가 다른(더 긴) id 의 접두어인 경우 오판할 수 있다 — 예를 들어 id="json"
// 이 없어도 id="json-diff" 의 청크 "json-diff-HASH.js" 가 "json-" 로 시작하는
// 조건을 만족해버린다. 그래서 "가장 구체적인(가장 긴) id 가 진짜 주인"이라는
// 규칙으로 소거한다.

export function extractPrecachedJsBasenames(swText: string): string[] {
  const urls = [...swText.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] ?? '');
  return urls.filter((u) => u.endsWith('.js')).map((u) => u.split('/').pop() ?? u);
}

export function hasChunkForId(id: string, allIds: string[], jsBasenames: string[]): boolean {
  return jsBasenames.some((name) => {
    if (!name.endsWith('.js') || !name.startsWith(`${id}-`)) return false;

    const moreSpecificIdAlsoMatches = allIds.some(
      (other) => other !== id && other.length > id.length && name.startsWith(`${other}-`),
    );

    return !moreSpecificIdAlsoMatches;
  });
}
