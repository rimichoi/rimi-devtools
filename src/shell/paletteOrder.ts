import type { Tool } from '../types';
import { searchTools } from './search';

/**
 * 커맨드 팔레트에 실제로 그릴 순서를 계산한다. DOM 을 건드리지 않는 순수 함수라
 * 유닛 테스트로 검증한다.
 *
 * - 즐겨찾기는 항상 맨 위에 고정한다(현재 결과 안에서의 상대 순서는 유지).
 * - 검색어가 비어 있을 때는 즐겨찾기 다음에 최근 사용한 도구를 최신순으로 보여주고,
 *   그다음에 나머지를 registry 순서 그대로 보여준다.
 * - favorites/recent 에는 registry 에서 이미 삭제된 도구 id 가 손상값으로 남아있을 수
 *   있다(로컬스토리지는 UI 없이도 값을 저장할 수 있다). tools 목록에 없는 id 는
 *   전부 걸러내고 절대 죽은 항목을 돌려주지 않는다.
 */
export function orderForPalette(
  tools: Tool[],
  query: string,
  favorites: string[],
  recent: string[],
): Tool[] {
  const validIds = new Set(tools.map((t) => t.id));
  const favoriteIds = new Set(favorites.filter((id) => validIds.has(id)));

  if (query.trim() === '') {
    const byId = new Map(tools.map((t) => [t.id, t] as const));
    const recentIds = recent.filter((id) => validIds.has(id) && !favoriteIds.has(id));
    const recentSet = new Set(recentIds);
    const recentTools = recentIds
      .map((id) => byId.get(id))
      .filter((t): t is Tool => t !== undefined);
    const favoriteTools = tools.filter((t) => favoriteIds.has(t.id));
    const restTools = tools.filter((t) => !favoriteIds.has(t.id) && !recentSet.has(t.id));
    return [...favoriteTools, ...recentTools, ...restTools];
  }

  const base = searchTools(tools, query);
  const favoriteMatches = base.filter((t) => favoriteIds.has(t.id));
  const restMatches = base.filter((t) => !favoriteIds.has(t.id));
  return [...favoriteMatches, ...restMatches];
}
