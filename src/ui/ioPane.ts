import type { ToolResult } from '../types';
import { createCopyButton } from './copyButton';

/**
 * 컴포넌트 선택 규칙: `IOPane` 은 대량 텍스트 페이로드(붙여넣는 문서, 여러 줄
 * JSON/SQL 등)를 위한 것이다. 스칼라 값 하나를 받는 입력에는 단일 줄 필드
 * (`numberForm.ts`)를, 파일을 받는 입력에는 드롭존(`dropZone.ts`)을 쓴다.
 * 결과가 텍스트 한 덩어리가 아니라 여러 필드로 구조화돼 있다면(`resultList.ts`)
 * 참고 — 구조화된 값을 문자열로 뭉쳐 textarea 에 욱여넣지 않는다. epoch 도구가
 * 정확히 이 규칙을 어겨서(10글자짜리 타임스탬프에 textarea 를 썼다) 생긴 결함을
 * 고치며 이 규칙을 적어 둔다.
 */
export interface TransformOutput {
  text: string;
  /** 결과는 정상이지만 사용자에게 알려야 하는 주의 사항 */
  warning?: string;
}

export interface IOPaneOptions {
  inputLabel?: string;
  outputLabel?: string;
  placeholder?: string;
  /** 입력창 위에 놓을 컨트롤 (셀렉트, 체크박스 등) */
  controls?: HTMLElement[];
  /**
   * 두 번째로 편집 가능한 텍스트 입력이 필요한 도구용(예: JSON 비교의 왼쪽/오른쪽).
   * 지정하면 pane 이 입력 두 개 + 결과 3열이 되고, 두 입력 중 하나라도 비어 있는
   * 동안에는(둘 다 채워지기 전) transform 을 부르지 않는다 — 한쪽만 입력한 순간
   * "다른 쪽을 입력하세요" 류의 하드 에러가 뜨는 것을 막기 위함이다.
   */
  secondInput?: { label?: string; placeholder?: string };
  transform: (input: string, secondInput?: string) => ToolResult<TransformOutput>;
}

export interface IOPaneHandle {
  setInput(text: string): void;
  run(): void;
  destroy(): void;
}

export function createIOPane(root: HTMLElement, options: IOPaneOptions): IOPaneHandle {
  const wrap = document.createElement('div');

  if (options.controls?.length) {
    const bar = document.createElement('div');
    bar.className = 'io-controls';
    bar.append(...options.controls);
    wrap.append(bar);
  }

  const pane = document.createElement('div');
  pane.className = options.secondInput ? 'io-pane io-pane-3col' : 'io-pane';

  const inputBox = document.createElement('div');
  const inputLabel = document.createElement('label');
  inputLabel.textContent = options.inputLabel ?? '입력';
  const input = document.createElement('textarea');
  input.placeholder = options.placeholder ?? '';
  input.spellcheck = false;
  inputBox.append(inputLabel, input);

  let secondBox: HTMLDivElement | undefined;
  let secondInputEl: HTMLTextAreaElement | undefined;
  if (options.secondInput) {
    secondBox = document.createElement('div');
    const secondLabel = document.createElement('label');
    secondLabel.textContent = options.secondInput.label ?? '입력 2';
    secondInputEl = document.createElement('textarea');
    secondInputEl.placeholder = options.secondInput.placeholder ?? '';
    secondInputEl.spellcheck = false;
    secondBox.append(secondLabel, secondInputEl);
  }

  const outputBox = document.createElement('div');
  const outputHead = document.createElement('div');
  outputHead.className = 'io-output-head';
  const outputLabel = document.createElement('label');
  outputLabel.textContent = options.outputLabel ?? '결과';
  const output = document.createElement('textarea');
  output.readOnly = true;
  output.spellcheck = false;
  outputHead.append(outputLabel, createCopyButton(() => output.value));
  outputBox.append(outputHead, output);

  const error = document.createElement('div');
  error.className = 'io-error';
  const warn = document.createElement('div');
  warn.className = 'io-warn';
  outputBox.append(error, warn);

  pane.append(inputBox, ...(secondBox ? [secondBox] : []), outputBox);
  wrap.append(pane);
  root.append(wrap);

  function run(): void {
    error.textContent = '';
    warn.textContent = '';

    const primaryEmpty = input.value.trim() === '';
    const secondaryEmpty = secondInputEl ? secondInputEl.value.trim() === '' : false;
    if (primaryEmpty || secondaryEmpty) {
      output.value = '';
      return;
    }

    // logic.ts 는 예외를 던지지 않는 게 규칙이지만, 이 함수는 프로젝트의 모든 도구가
    // 거치는 단일 지점이다 — 규칙이 어겨졌을 때 이전 결과가 최신 입력의 결과인 것처럼
    // 화면에 남는 최악의 실패 모드를 막기 위한 안전망으로 감싼다.
    let result: ToolResult<TransformOutput>;
    try {
      result = options.transform(input.value, secondInputEl?.value);
    } catch (err) {
      output.value = '';
      error.textContent = err instanceof Error ? err.message : String(err);
      return;
    }

    if (result.ok) {
      output.value = result.value.text;
      warn.textContent = result.value.warning ?? '';
    } else {
      output.value = '';
      error.textContent = result.error;
    }
  }

  const controlListeners = new Map<HTMLElement, (e: Event) => void>();

  input.addEventListener('input', run);
  secondInputEl?.addEventListener('input', run);
  for (const control of options.controls ?? []) {
    const listener = run as unknown as (e: Event) => void;
    control.addEventListener('change', listener);
    controlListeners.set(control, listener);
  }

  return {
    setInput(text: string) {
      input.value = text;
      run();
    },
    run,
    destroy() {
      for (const [control, listener] of controlListeners) {
        control.removeEventListener('change', listener);
      }
      wrap.remove();
    },
  };
}
