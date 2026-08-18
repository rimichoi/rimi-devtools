/**
 * 필드가 받아들이는 모양을 강제하는 마스크.
 *
 * `apply` 는 순수 함수이고 도구의 logic.ts 에 산다(node 에서 단위 테스트할 수
 * 있어야 한다). 이 파일은 그 함수를 실제 입력칸에 붙이면서 생기는 DOM 쪽 문제
 * 셋만 맡는다: 캐럿 위치, 백스페이스, IME 조합.
 */
export interface FieldMask {
  /** 임의의 입력을 허용된 모양으로 바꾼다. 부분 입력도 통과시켜야 한다. */
  apply(raw: string): string;
  /**
   * 캐럿 위치를 세는 기준 문자인지. **마스크가 끼워 넣는 구분자는 false 여야
   * 한다** — 구분자까지 세면 재포맷 뒤 캐럿이 한 칸씩 밀려 결국 사용자가
   * 글자를 엉뚱한 자리에 넣게 된다.
   */
  isAnchor(char: string): boolean;
}

export interface NumberFormField {
  key: string;
  label: string;
  placeholder?: string;
  /** 지정하면 이 칸의 입력을 마스크로 정규화한다(캐럿 보정 포함). */
  mask?: FieldMask;
}

/** text 안의 기준 문자 개수 */
function countAnchors(text: string, mask: FieldMask): number {
  let count = 0;
  for (const char of text) if (mask.isAnchor(char)) count++;
  return count;
}

/** `count` 번째(1부터) 기준 문자 바로 뒤의 인덱스 */
function indexAfterAnchors(text: string, count: number, mask: FieldMask): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (!mask.isAnchor(text.charAt(i))) continue;
    seen++;
    if (seen === count) return i + 1;
  }
  return text.length;
}

/** `ordinal` 번째(1부터) 기준 문자를 지운 문자열 */
function removeAnchor(text: string, ordinal: number, mask: FieldMask): string {
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (!mask.isAnchor(text.charAt(i))) continue;
    seen++;
    if (seen === ordinal) return text.slice(0, i) + text.slice(i + 1);
  }
  return text;
}

/**
 * 마스크를 입력칸에 붙인다. 값을 강제로 다시 쓰는 자리이므로 셋을 지킨다:
 *
 *  1. IME 조합 중에는(`event.isComposing`) 손대지 않는다. 조합 중에 value 를
 *     다시 쓰면 조합이 끊기고 아직 확정되지 않은 글자가 사라진다. 이 프로젝트는
 *     이미 조합 확정 Enter 가 엉뚱한 도구로 이동시키는 결함을 낸 적이 있다.
 *  2. 캐럿을 끝으로 밀지 않는다. 값 가운데를 고치던 사용자가 매 글자마다 끝으로
 *     끌려가면 그 칸은 못 쓰는 칸이 된다.
 *  3. 백스페이스가 지운 구분자를 곧바로 되돌려 놓지 않는다.
 *
 * @returns 프로그램으로 값을 넣을 때(`setValue`) 쓰는 동기화 함수.
 */
function attachMask(
  el: HTMLInputElement,
  mask: FieldMask,
  onChange: () => void,
): (value: string) => string {
  /** 직전 값. 백스페이스가 무엇을 지웠는지는 이것과 비교해야만 알 수 있다. */
  let previous = el.value;

  function normalize(event: InputEvent | null): void {
    if (event?.isComposing) {
      // 조합이 끝난 뒤 compositionend 에서 다시 온다. 그때까지는 아무것도 하지 않는다.
      previous = el.value;
      return;
    }

    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    let anchors = countAnchors(raw.slice(0, caret), mask);
    let source = raw;

    /*
     * 백스페이스가 구분자만 지운 경우. 마스크가 그 구분자를 다시 넣으므로 값이
     * 그대로인 것처럼 보이고, 사용자에게는 "백스페이스가 안 먹는" 칸이 된다.
     * 사용자가 지우려던 것은 그 앞의 기준 문자이므로 그것을 대신 지운다.
     */
    if (
      event?.inputType === 'deleteContentBackward' &&
      previous.length === raw.length + 1 &&
      caret < previous.length &&
      !mask.isAnchor(previous.charAt(caret)) &&
      anchors > 0
    ) {
      source = removeAnchor(raw, anchors, mask);
      anchors -= 1;
    }

    const next = mask.apply(source);
    // 값이 그대로면 다시 쓰지 않는다 — 같은 문자열을 대입하는 것만으로도
    // 브라우저가 캐럿을 끝으로 옮기는 경우가 있다.
    if (next !== raw) el.value = next;

    const position = indexAfterAnchors(next, anchors, mask);
    if (el.selectionStart !== position || el.selectionEnd !== position) {
      el.setSelectionRange(position, position);
    }
    previous = next;
  }

  el.addEventListener('input', (event) => {
    normalize(event instanceof InputEvent ? event : null);
    onChange();
  });
  // 조합이 끝나는 순간이 이 칸에서 마스크를 처음 적용할 수 있는 시점이다.
  el.addEventListener('compositionend', () => {
    normalize(null);
    onChange();
  });

  return (value: string) => {
    const next = mask.apply(value);
    previous = next;
    return next;
  };
}

export interface NumberFormOptions {
  /**
   * 이 폼 안에 결과/오류 표시 영역을 만들 것인지. 기본은 true.
   *
   * epoch 의 "타임스탬프 → 날짜" 방향처럼 결과를 다른 컴포넌트(ResultList)가
   * 그리는 경우 false 로 준다. true 로 두면 아무도 채우지 않는 상자가 입력과
   * 진짜 결과 사이에 끼어 "값을 입력하면 결과가 표시됩니다" 같은 빈 상태 문구를
   * 계속 띄운다 — 바로 아래에 결과가 이미 나와 있는데도.
   */
  result?: boolean;
}

export interface NumberFormHandle {
  values(): Record<string, string>;
  /** 필드 값을 프로그램으로 채우고 onChange 를 부른다(IOPane 의 setInput 과 대응). */
  setValue(key: string, value: string): void;
  setLabel(key: string, label: string): void;
  setResult(text: string): void;
  setError(text: string): void;
  destroy(): void;
}

export function createNumberForm(
  root: HTMLElement,
  fields: NumberFormField[],
  onChange: () => void,
  options: NumberFormOptions = {},
): NumberFormHandle {
  const wrap = document.createElement('div');
  wrap.className = 'tool-custom form-grid';

  const inputs = new Map<string, HTMLInputElement>();
  const labels = new Map<string, HTMLLabelElement>();
  /** 마스크가 붙은 칸의 "프로그램으로 넣는 값" 정규화기 */
  const syncs = new Map<string, (value: string) => string>();

  for (const field of fields) {
    const row = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = field.placeholder ?? '';
    if (field.mask) syncs.set(field.key, attachMask(input, field.mask, onChange));
    // 마스크가 붙은 칸은 attachMask 가 자기 input 리스너 안에서 onChange 를
    // 부른다 — 마스크가 먼저 돌아야 계산이 정규화된 값을 본다.
    else input.addEventListener('input', onChange);
    row.append(label, input);
    wrap.append(row);
    inputs.set(field.key, input);
    labels.set(field.key, label);
  }

  const showResult = options.result !== false;
  const result = document.createElement('div');
  result.className = 'form-result';
  const error = document.createElement('div');
  error.className = 'io-error';
  if (showResult) wrap.append(result, error);
  root.append(wrap);

  return {
    values() {
      const out: Record<string, string> = {};
      for (const [key, input] of inputs) out[key] = input.value;
      return out;
    },
    setValue(key, value) {
      const el = inputs.get(key);
      if (!el) return;
      // 마스크가 붙은 칸은 프로그램으로 넣는 값도 같은 규칙을 지나야 한다.
      el.value = syncs.get(key)?.(value) ?? value;
      onChange();
    },
    setLabel(key, label) {
      const el = labels.get(key);
      if (el) el.textContent = label;
    },
    setResult(text) {
      result.textContent = text;
      error.textContent = '';
    },
    setError(text) {
      result.textContent = '';
      error.textContent = text;
    },
    destroy() {
      wrap.remove();
    },
  };
}
