import type { ToolResult } from '../types';
import { createCopyButton } from './copyButton';

/**
 * LinkedPanes — 서로를 되짚어 만들 수 있는 두 값을 나란히 놓고 양방향으로 잇는다.
 *
 * `IOPane` 과 어디가 다른지: IOPane 은 "입력 → 출력" 한 방향이고, 출력은 읽기
 * 전용이다. `secondInput` 옵션이 있지만 그건 "입력 둘 → 출력 하나"(json-diff)의
 * 모양이지 이 모양이 아니다. base64/url-encode 처럼 두 값이 서로의 역함수로
 * 이어져 있는 도구는, 방향 select 로 모드를 고르게 하는 대신 양쪽 다 편집
 * 가능하게 두고 어느 쪽을 고쳐도 반대쪽이 따라오게 하는 게 맞다.
 *
 * 이런 컴포넌트가 깨지는 자리는 정해져 있어서, 셋 다 여기서 한 번에 막는다.
 *
 *  1. 되먹임 루프. B 를 프로그램으로 갱신하면 그게 B 의 핸들러를 깨우고 다시
 *     A 를 덮어쓰는 왕복이 생긴다. `.value = ` 대입은 브라우저에서 input 이벤트를
 *     내지 않지만 그건 "지금 그렇더라" 일 뿐이고, 테스트 러너나 확장이 값을
 *     꽂는 경로(예: Playwright 의 fill())는 실제로 이벤트를 낸다. 값이 우연히
 *     같아서 멈추기를 기대하지 않고 `syncing` 플래그로 명시적으로 끊는다.
 *  2. 커서 뺏기. 동기화는 **반대쪽만** 건드린다. 사용자가 타이핑 중인 쪽은
 *     value/selectionStart/scrollTop 중 무엇도 다시 쓰지 않는다 — 한 글자 칠
 *     때마다 커서가 끝으로 튀는 고전적인 결함이다.
 *  3. 한쪽이 잠깐 유효하지 않을 때. 오류는 **그 값을 들고 있는 쪽** 카드에
 *     붙이고, 반대쪽 내용은 손대지 않는다. 디코딩되지 않는 문자열을 한 글자
 *     붙여넣었다고 사용자가 반대편에 쓰던 원문을 지워 버리면 안 된다.
 */
export interface LinkedPaneSide {
  label: string;
  placeholder?: string;
}

export interface LinkedPanesOptions {
  left: LinkedPaneSide;
  right: LinkedPaneSide;
  /** 두 pane 위에 놓을 컨트롤 (셀렉트 등). 변경 처리는 도구가 직접 잇는다. */
  controls?: HTMLElement[];
  /** 왼쪽 값으로 오른쪽 값을 만든다. */
  toRight(left: string): ToolResult;
  /** 오른쪽 값으로 왼쪽 값을 만든다. */
  toLeft(right: string): ToolResult;
}

export interface LinkedPanesHandle {
  /**
   * 변환 규칙 자체가 바뀌었을 때(예: url-encode 의 encodeURIComponent ↔ encodeURI
   * 셀렉트) 두 값을 다시 맞춘다. 기준은 원문(왼쪽)이다 — 다만 왼쪽이 비어 있으면
   * 오른쪽을 기준으로 삼는다. 그러지 않으면 "오른쪽에만 값이 있는" 상태
   * (디코딩 실패로 왼쪽이 아직 비어 있는 경우가 정확히 그렇다)에서 셀렉트를
   * 건드리는 것만으로 사용자가 붙여넣은 값이 지워진다.
   */
  resync(): void;
  destroy(): void;
}

type Side = 'left' | 'right';

interface PaneParts {
  box: HTMLDivElement;
  field: HTMLTextAreaElement;
  error: HTMLDivElement;
}

function createPane(side: LinkedPaneSide): PaneParts {
  const box = document.createElement('div');

  // 양쪽 다 편집 가능하고 양쪽 다 복사할 값이므로, 두 카드가 같은 머리 스트립을
  // 갖는다. IOPane 의 읽기 전용 출력 카드(.io-output-head)와는 다른 클래스를
  // 쓴다 — 그 클래스는 "이 카드는 결과다" 라는 뜻으로 배경까지 바꾼다.
  const head = document.createElement('div');
  head.className = 'io-input-head';
  const label = document.createElement('label');
  label.textContent = side.label;
  const field = document.createElement('textarea');
  field.placeholder = side.placeholder ?? '';
  field.spellcheck = false;
  head.append(label, createCopyButton(() => field.value));

  const error = document.createElement('div');
  error.className = 'io-error';

  box.append(head, field, error);
  return { box, field, error };
}

export function createLinkedPanes(
  root: HTMLElement,
  options: LinkedPanesOptions,
): LinkedPanesHandle {
  const wrap = document.createElement('div');
  wrap.className = 'io-wrap';

  if (options.controls?.length) {
    const bar = document.createElement('div');
    bar.className = 'io-controls';
    bar.append(...options.controls);
    wrap.append(bar);
  }

  const pane = document.createElement('div');
  pane.className = 'io-pane io-pane-linked';

  const left = createPane(options.left);
  const right = createPane(options.right);
  pane.append(left.box, right.box);
  wrap.append(pane);
  root.append(wrap);

  // 해저드 1: 되먹임 루프 차단. 반대쪽에 값을 꽂는 동안에는 어떤 쪽의
  // 핸들러도 돌지 않는다.
  let syncing = false;

  /** 반대쪽에만 값을 쓴다. 쓰는 동안 상대의 input 핸들러가 되돌아오지 못한다. */
  function writeTarget(target: PaneParts, value: string): void {
    syncing = true;
    try {
      target.field.value = value;
    } finally {
      syncing = false;
    }
  }

  function sync(from: Side): void {
    if (syncing) return;

    const source = from === 'left' ? left : right;
    const target = from === 'left' ? right : left;
    const convert = from === 'left' ? options.toRight : options.toLeft;

    // 오류는 항상 방금 편집된 쪽에만 붙는다. 매 동기화마다 둘 다 지우고 시작하면
    // 두 개의 오류가 겹쳐 뜨는 상태가 생기지 않는다.
    left.error.textContent = '';
    right.error.textContent = '';

    // 해저드 4: 빈 상태. 한쪽을 비우면 반대쪽도 비운다. 안 그러면 더 이상
    // 대응하지 않는 값이 남아 둘이 서로의 변환이라는 약속이 깨진다.
    if (source.field.value === '') {
      writeTarget(target, '');
      return;
    }

    // logic.ts 는 던지지 않는 게 규칙이지만, 규칙이 깨졌을 때 낡은 값이 새 입력의
    // 변환 결과인 척 남아 있는 것이 최악이므로 IOPane 과 같은 안전망을 둔다.
    let result: ToolResult;
    try {
      result = convert(source.field.value);
    } catch (err) {
      // 해저드 3: 오류는 원인이 들어 있는 쪽에 붙고, 반대쪽 내용은 그대로 둔다.
      source.error.textContent = err instanceof Error ? err.message : String(err);
      return;
    }

    if (!result.ok) {
      source.error.textContent = result.error;
      return;
    }

    // 해저드 2: 반대쪽만 건드린다. source 의 value/selection/scroll 은 읽기만 한다.
    writeTarget(target, result.value);
  }

  const onLeft = (): void => sync('left');
  const onRight = (): void => sync('right');
  left.field.addEventListener('input', onLeft);
  right.field.addEventListener('input', onRight);

  return {
    resync() {
      if (left.field.value !== '') sync('left');
      else if (right.field.value !== '') sync('right');
    },
    destroy() {
      left.field.removeEventListener('input', onLeft);
      right.field.removeEventListener('input', onRight);
      wrap.remove();
    },
  };
}
