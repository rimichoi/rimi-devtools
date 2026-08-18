export type ToolResult<T = string> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type ToolCategory = 'format' | 'convert' | 'encode' | 'calc' | 'file';

export interface ToolModule {
  /**
   * root 에 UI 를 붙이고, 정리 함수를 반환한다.
   *
   * 초기 입력값을 받는 인자는 두지 않는다. 한때 `initialInput` 이 선언돼 있었고
   * 6개 도구가 구현까지 해두었지만 넘기는 곳이 한 번도 없었다 — 그리고 이 값을
   * 넘길 자연스러운 경로는 URL(쿼리/해시 파라미터)인데, 사용자 payload 를 URL 에
   * 싣는 것은 이 프로젝트가 없애려는 습관 그 자체다. URL 은 히스토리와 referrer,
   * 서버 로그에 남는다. 배선하지 않을 기능을 타입 계약이 광고하지 않도록 지웠다.
   */
  mount(root: HTMLElement): () => void;
}

export interface Tool {
  /** URL 해시가 되는 식별자. 소문자와 하이픈만 사용한다. */
  id: string;
  name: string;
  /**
   * 도구 화면 머리말에 이름과 함께 뜨는 한 줄 설명. 필수로 둔다 — 도구를
   * 추가하면서 빼먹으면 그 도구만 설명 없는 화면이 되고, 그건 컴파일 단계에서
   * 잡히는 게 낫다.
   */
  description: string;
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
