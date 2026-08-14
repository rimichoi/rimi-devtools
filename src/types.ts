export type ToolResult<T = string> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type ToolCategory = 'format' | 'convert' | 'encode' | 'calc' | 'file';

export interface ToolModule {
  /** root 에 UI 를 붙이고, 정리 함수를 반환한다. */
  mount(root: HTMLElement, initialInput?: string): () => void;
}

export interface Tool {
  /** URL 해시가 되는 식별자. 소문자와 하이픈만 사용한다. */
  id: string;
  name: string;
  /** 커맨드 팔레트 검색어. 한글과 영문을 함께 넣는다. */
  keywords: string[];
  category: ToolCategory;
  load: () => Promise<ToolModule>;
}

export const CATEGORY_LABEL: Record<ToolCategory, string> = {
  format: '포맷',
  convert: '변환',
  encode: '인코딩',
  calc: '계산',
  file: '파일',
};
