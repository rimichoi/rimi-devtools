import { createCopyButton } from './copyButton';

export interface ResultRow {
  label: string;
  value: string;
}

export interface ResultListOptions {
  /** IOPane 의 outputLabel 과 대응하는 헤더 문구 */
  label?: string;
  /**
   * 복사 버튼이 복사할 전체 텍스트를 만든다. 행 목록(label/value)과는 별도로
   * 받는다 — 예를 들어 epoch 는 `formatEpochInfo()` 가 만드는, 사람이 정렬해
   * 읽기 좋은 한 덩어리 텍스트를 복사 결과로 쓰고 싶어 하는데, 그건 행 목록을
   * 기계적으로 이어붙인 것과 다를 수 있다.
   */
  getCopyText: () => string;
  /** 아직 값이 없을 때 보여줄 안내 문구 */
  emptyHint?: string;
}

export interface ResultListHandle {
  setRows(rows: ResultRow[]): void;
  setError(message: string): void;
  destroy(): void;
}

/**
 * 스칼라 입력 → 구조화된(복수 필드) 출력을 보여주는 정의 목록(definition list) 형태의
 * 공용 컴포넌트. `IOPane` 은 결과가 "텍스트 한 덩어리"일 때만 맞고, epoch 처럼 결과가
 * unit/UTC/KST/ISO 같은 개별 필드로 구조화돼 있으면 그걸 다시 문자열로 뭉쳤다가
 * textarea 에 넣는 대신 이 컴포넌트로 필드 그대로 보여준다.
 */
export function createResultList(root: HTMLElement, options: ResultListOptions): ResultListHandle {
  const wrap = document.createElement('div');
  wrap.className = 'result-list-wrap';

  const head = document.createElement('div');
  head.className = 'io-output-head';
  const label = document.createElement('label');
  label.textContent = options.label ?? '결과';
  head.append(label, createCopyButton(options.getCopyText));

  const list = document.createElement('dl');
  list.className = 'result-list';
  list.hidden = true;

  const empty = document.createElement('p');
  empty.className = 'result-empty';
  empty.textContent = options.emptyHint ?? '결과가 여기에 표시됩니다.';

  const error = document.createElement('div');
  error.className = 'io-error';

  wrap.append(head, list, empty, error);
  root.append(wrap);

  return {
    setRows(rows: ResultRow[]) {
      error.textContent = '';
      list.replaceChildren();

      if (rows.length === 0) {
        list.hidden = true;
        empty.hidden = false;
        return;
      }

      for (const row of rows) {
        const dt = document.createElement('dt');
        dt.textContent = row.label;
        const dd = document.createElement('dd');
        dd.textContent = row.value;
        list.append(dt, dd);
      }
      list.hidden = false;
      empty.hidden = true;
    },
    setError(message: string) {
      list.hidden = true;
      list.replaceChildren();
      empty.hidden = true;
      error.textContent = message;
    },
    destroy() {
      wrap.remove();
    },
  };
}
