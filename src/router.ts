import type { Tool } from './types';

export function parseHash(hash: string): string | null {
  const raw = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const id = raw.trim();
  return id === '' ? null : id;
}

export function resolveToolId(hash: string, tools: Tool[]): string | null {
  const first = tools[0];
  if (!first) return null;
  const id = parseHash(hash);
  if (id === null) return first.id;
  return tools.some((t) => t.id === id) ? id : first.id;
}

/**
 * render() 를 다시 실행해야 하는지 판단한다. 아직 한 번도 렌더링하지 않았다면
 * (currentId 가 UNSET) resolveToolId 의 결과가 null 이어도 반드시 렌더링해야 한다.
 * currentId 를 string | null 로 초기화하면 빈 레지스트리에서 첫 결과인 null 과
 * 충돌해 최초 렌더링이 그냥 건너뛰어지므로, 실제 결과값과 절대 겹치지 않는
 * 심볼 sentinel 을 초기값으로 쓴다.
 */
export const UNSET = Symbol('unset');

export function shouldRender(
  nextId: string | null,
  currentId: string | null | typeof UNSET,
): boolean {
  return nextId !== currentId;
}
