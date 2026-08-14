import type { ToolResult } from '../../types';

export type UrlMode = 'component' | 'full';

export function encodeUrl(text: string, mode: UrlMode): ToolResult {
  try {
    return {
      ok: true,
      value: mode === 'component' ? encodeURIComponent(text) : encodeURI(text),
    };
  } catch {
    return { ok: false, error: '인코딩할 수 없는 문자가 있습니다. 쌍이 맞지 않는 서로게이트일 수 있습니다.' };
  }
}

export function decodeUrl(text: string, mode: UrlMode): ToolResult {
  try {
    return {
      ok: true,
      value: mode === 'component' ? decodeURIComponent(text) : decodeURI(text),
    };
  } catch {
    return { ok: false, error: '퍼센트 인코딩 형식이 올바르지 않습니다. (예: %ED%95%9C)' };
  }
}
