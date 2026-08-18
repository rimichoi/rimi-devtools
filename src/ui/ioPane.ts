import type { ToolResult } from '../types';
import { createCopyButton } from './copyButton';

/**
 * 컴포넌트 선택 규칙. 입력의 모양과 결과의 모양이 컴포넌트를 정한다. 지금은
 * 네 가지 경우가 있다:
 *
 *  1. 대량 텍스트 한 덩어리 → 대량 텍스트 한 덩어리: `IOPane`(이 파일). 붙여넣는
 *     문서, 여러 줄 JSON/SQL 등. `secondInput` 옵션은 "편집 가능한 입력 둘 →
 *     읽기 전용 출력 하나"(json-diff)까지 이 모양 안에서 처리한다.
 *  2. 스칼라 값 하나 → 여러 필드로 구조화된 결과: 입력은 단일 줄 필드
 *     (`numberForm.ts`), 결과는 정의 목록(`resultList.ts`). 구조화된 값을 문자열로
 *     뭉쳐 textarea 에 욱여넣지 않는다 — epoch 도구가 정확히 이 규칙을 어겨서
 *     (10글자짜리 타임스탬프에 textarea 를 썼다) 생긴 결함을 고치며 이 규칙을 적었다.
 *  3. 파일 → 무엇이든: 드롭존(`dropZone.ts`).
 *  4. 서로의 역함수인 값 둘: `linkedPanes.ts`. base64(원문 ↔ Base64), url-encode
 *     (원문 ↔ 퍼센트 인코딩)처럼 어느 쪽에서 출발해도 반대쪽을 만들 수 있는
 *     경우다. 이때 IOPane 을 쓰면 "지금 인코딩 모드인가 디코딩 모드인가" 를 고르는
 *     방향 select 가 반드시 따라붙는데, 그건 사용자가 아무것도 하기 전에 먼저
 *     대답해야 하는 질문이다. `secondInput` 은 이 자리에 맞지 않는다 — 그건
 *     "입력 둘 → 출력 하나"이지 "서로를 갱신하는 짝"이 아니다.
 *  5. 대량 텍스트 한 덩어리 → 여러 필드로 구조화된 결과: 입력은 이 파일의 입력
 *     카드(`output: false`), 결과는 정의 목록(`resultList.ts`). 2번과 같은 이유로
 *     결과를 문자열로 뭉쳐 textarea 에 넣지 않고, 입력만은 3번의 dropZone 처럼
 *     자기 몫의 공용 컴포넌트를 쓴다. 글자수 세기가 여기다 — 결과가 통계 묶음 둘 +
 *     발견 목록 둘이라, 한 덩어리 텍스트로 뭉치면 세 가지 "글자수" 가 왜 다른지도
 *     보이지 않는 문자를 몇 개 찾았는지도 읽히지 않는다. 새 컴포넌트를 만들지
 *     않는다: 입력 카드와 ResultList 를 그대로 조합한다.
 */
export interface TransformOutput {
  text: string;
  /** 결과는 정상이지만 사용자에게 알려야 하는 주의 사항 */
  warning?: string;
}

interface IOPaneBaseOptions {
  inputLabel?: string;
  placeholder?: string;
  /** 입력창 위에 놓을 컨트롤 (셀렉트, 체크박스 등) */
  controls?: HTMLElement[];
}

export interface IOPaneTransformOptions extends IOPaneBaseOptions {
  /** 결과 카드를 이 컴포넌트가 그린다(기본). */
  output?: true;
  outputLabel?: string;
  /**
   * 두 번째로 편집 가능한 텍스트 입력이 필요한 도구용(예: JSON 비교의 왼쪽/오른쪽).
   * 지정하면 pane 이 입력 두 개 + 결과 3열이 되고, 두 입력 중 하나라도 비어 있는
   * 동안에는(둘 다 채워지기 전) transform 을 부르지 않는다 — 한쪽만 입력한 순간
   * "다른 쪽을 입력하세요" 류의 하드 에러가 뜨는 것을 막기 위함이다.
   */
  secondInput?: { label?: string; placeholder?: string };
  transform: (input: string, secondInput?: string) => ToolResult<TransformOutput>;
}

/**
 * 결과를 다른 컴포넌트(ResultList 등)가 그리는 경우. `numberForm.ts` 의
 * `result: false` 와 같은 이유로 둔다 — 결과 카드를 그대로 두면 아무도 채우지
 * 않는 상자가 입력과 진짜 결과 사이에 끼어 "결과가 여기에 표시됩니다" 를 계속
 * 띄운다(바로 아래에 결과가 이미 나와 있는데도).
 *
 * `transform` 대신 `onInput` 을 받는다: 결과를 이 컴포넌트가 그리지 않으므로
 * 돌려줄 값이 없다. 빈 입력에서도 부른다 — 입력을 지웠을 때 도구가 자기 결과를
 * 되돌릴 기회를 잃지 않도록.
 */
export interface IOPaneInputOnlyOptions extends IOPaneBaseOptions {
  output: false;
  onInput: (input: string) => void;
}

export type IOPaneOptions = IOPaneTransformOptions | IOPaneInputOnlyOptions;

export interface IOPaneHandle {
  setInput(text: string): void;
  run(): void;
  destroy(): void;
}

export function createIOPane(root: HTMLElement, options: IOPaneOptions): IOPaneHandle {
  const wrap = document.createElement('div');
  // 컨트롤 바와 pane 사이 수직 리듬을 CSS 로 잡을 수 있도록 이름을 준다.
  wrap.className = 'io-wrap';

  if (options.controls?.length) {
    const bar = document.createElement('div');
    bar.className = 'io-controls';
    bar.append(...options.controls);
    wrap.append(bar);
  }

  const inputOnly = options.output === false;
  const secondSpec = options.output === false ? undefined : options.secondInput;

  const pane = document.createElement('div');
  pane.className = inputOnly ? 'io-pane io-pane-1col' : secondSpec ? 'io-pane io-pane-3col' : 'io-pane';

  const inputBox = document.createElement('div');
  const inputLabel = document.createElement('label');
  inputLabel.textContent = options.inputLabel ?? '입력';
  const input = document.createElement('textarea');
  input.placeholder = options.placeholder ?? '';
  input.spellcheck = false;
  inputBox.append(inputLabel, input);

  let secondBox: HTMLDivElement | undefined;
  let secondInputEl: HTMLTextAreaElement | undefined;
  if (secondSpec) {
    secondBox = document.createElement('div');
    const secondLabel = document.createElement('label');
    secondLabel.textContent = secondSpec.label ?? '입력 2';
    secondInputEl = document.createElement('textarea');
    secondInputEl.placeholder = secondSpec.placeholder ?? '';
    secondInputEl.spellcheck = false;
    secondBox.append(secondLabel, secondInputEl);
  }

  let outputBox: HTMLDivElement | undefined;
  let output: HTMLTextAreaElement | undefined;
  let error: HTMLDivElement | undefined;
  let warn: HTMLDivElement | undefined;
  if (!inputOnly) {
    outputBox = document.createElement('div');
    const outputHead = document.createElement('div');
    outputHead.className = 'io-output-head';
    const outputLabel = document.createElement('label');
    outputLabel.textContent = options.outputLabel ?? '결과';
    output = document.createElement('textarea');
    output.readOnly = true;
    output.spellcheck = false;
    // 아무것도 입력하지 않은 출력창은 지금까지 그냥 빈 상자였고, 기다리는 중인지
    // 고장난 것인지 구분할 수 없었다. 빈 상태 문구는 CSS 로는 만들 수 없다 —
    // textarea 는 대체 요소라 ::before/content 가 렌더되지 않고, ::placeholder 는
    // placeholder 속성이 실제로 있어야 그릴 것이 생긴다.
    output.placeholder = '결과가 여기에 표시됩니다.';
    const outputEl = output;
    outputHead.append(outputLabel, createCopyButton(() => outputEl.value));
    outputBox.append(outputHead, output);

    error = document.createElement('div');
    error.className = 'io-error';
    warn = document.createElement('div');
    warn.className = 'io-warn';
    outputBox.append(error, warn);
  }

  pane.append(inputBox, ...(secondBox ? [secondBox] : []), ...(outputBox ? [outputBox] : []));
  wrap.append(pane);
  root.append(wrap);

  function run(): void {
    // 결과를 다른 컴포넌트가 그리는 경우. 빈 입력에서도 부른다 — 도구가 자기
    // 결과를 빈 상태로 되돌릴 기회를 잃으면 지운 입력의 결과가 화면에 남는다.
    if (options.output === false) {
      options.onInput(input.value);
      return;
    }
    if (!output || !error || !warn) return;

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
