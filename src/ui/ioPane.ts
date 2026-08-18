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
 *     단일 줄 필드는 예외 없이 `masks.ts` 의 마스크 하나를 고른다.
 *  3. 파일 → 무엇이든: 드롭존(`dropZone.ts`).
 *  4. 대량 텍스트 한 덩어리 → 여러 필드로 구조화된 결과: 입력은 이 파일의 입력
 *     카드(`output: false`), 결과는 정의 목록(`resultList.ts`). 2번과 같은 이유로
 *     결과를 문자열로 뭉쳐 textarea 에 넣지 않고, 입력만은 3번의 dropZone 처럼
 *     자기 몫의 공용 컴포넌트를 쓴다. 글자수 세기가 여기다 — 결과가 통계 묶음 둘 +
 *     발견 목록 둘이라, 한 덩어리 텍스트로 뭉치면 세 가지 "글자수" 가 왜 다른지도
 *     보이지 않는 문자를 몇 개 찾았는지도 읽히지 않는다. 새 컴포넌트를 만들지
 *     않는다: 입력 카드와 ResultList 를 그대로 조합한다.
 *
 * 여기 없어진 다섯 번째 경우 — "서로의 역함수인 값 둘"(`linkedPanes.ts`) — 은
 * 지웠다. base64/url-encode 가 그 컴포넌트의 유일한 사용자였고, 두 값을 양방향으로
 * 이으면 한쪽을 고칠 때 반대쪽이 덮어써져서 **인코딩과 디코딩을 동시에 들고 있을
 * 수 없다**. 두 도구는 이제 1번을 두 번 쓴다: 독립된 IOPane 두 개를
 * `.section-heading` 으로 나눠 놓는다(base64/index.ts 참고). 다시 만들지 않는다 —
 * 값 둘을 잇고 싶은 충동이 들면 그 두 값을 동시에 다른 내용으로 들고 있고 싶은
 * 경우가 있는지 먼저 확인할 것.
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

  /*
   * output:false 갈래의 backstop 자리. transform 갈래는 결과 카드 안에 .io-error 를
   * 갖고 있어서 예외를 그릴 데가 있었지만, 이쪽은 결과를 다른 컴포넌트가 그리므로
   * 오류를 놓을 자리가 아예 없었다 — 입력 처리 중 예외가 나면 화면 어디에도 아무
   * 말이 뜨지 않았다. 결과 패널들 위, 입력 바로 아래에 둔다(원인이 어느 입력인지가
   * 위치로 드러난다). 비어 있으면 `.io-error:empty` 가 지우므로 평상시 자리를
   * 차지하지 않는다.
   */
  const inputError = document.createElement('div');
  inputError.className = 'io-error';

  pane.append(inputBox, ...(secondBox ? [secondBox] : []), ...(outputBox ? [outputBox] : []));
  wrap.append(pane);
  if (inputOnly) wrap.append(inputError);
  root.append(wrap);

  function run(): void {
    // 결과를 다른 컴포넌트가 그리는 경우. 빈 입력에서도 부른다 — 도구가 자기
    // 결과를 빈 상태로 되돌릴 기회를 잃으면 지운 입력의 결과가 화면에 남는다.
    if (options.output === false) {
      inputError.textContent = '';
      try {
        options.onInput(input.value);
      } catch (err) {
        // 이 갈래도 아래 transform 갈래와 같은 이유로 감싼다. 다만 여기서 실제로
        // 터지는 것은 "버그" 만이 아니다 — 브라우저가 도구가 쓰는 API 를 지원하지
        // 않는 경우(글자수 세기의 Intl.Segmenter)가 여기로 온다. 새로고침으로는
        // 해결되지 않으므로 새로고침을 권하지 않는다.
        console.error('[rimi-devtools] 입력을 처리하지 못했습니다.', err);
        inputError.textContent =
          '계산 중 오류가 발생했습니다. 브라우저가 이 도구가 쓰는 기능을 지원하지 않을 수 있습니다 — ' +
          `새로고침해도 해결되지 않습니다.\n${err instanceof Error ? err.message : String(err)}`;
      }
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
