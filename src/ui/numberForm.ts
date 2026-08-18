import type { FieldMask } from './masks';

/**
 * 단일 줄 스칼라 입력칸 하나.
 *
 * `mask` 는 **필수**다. 마스크 없는 칸을 만들 수 있게 두었을 때 실제로 일어난 일이
 * 이 파일의 존재 이유다 — 날짜 칸 둘만 마스크를 갖고 나머지 숫자 칸(퍼센트 A/B,
 * 타임스탬프, 시간 A/B)은 임의의 텍스트를 그대로 받았고, 같은 제품 안에서 어떤
 * 칸은 걸러 주고 어떤 칸은 안 걸러 주는 상태가 됐다. 마스크를 고르지 않으면
 * 컴파일이 실패해야 그 표류가 다시 생기지 않는다. 고를 마스크는
 * `masks.ts` 카탈로그에 있고, 없으면 거기에 추가한다(도구마다 새로 쓰지 않는다).
 */
export interface NumberFormField {
  key: string;
  label: string;
  placeholder?: string;
  /** 이 칸의 입력을 정규화하는 마스크. `masks.ts` 에서 고른다. */
  mask: FieldMask;
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

  interface FieldParts {
    input: HTMLInputElement;
    label: HTMLLabelElement;
    /** 프로그램으로 넣는 값(`setValue`)을 같은 마스크로 통과시키는 동기화 함수. */
    sync: (value: string) => string;
  }
  const parts = new Map<string, FieldParts>();

  for (const field of fields) {
    const row = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'text';
    // 어떤 문자를 받아들이는지 아는 것은 마스크뿐이다. 모든 칸에 'decimal' 을
    // 박아 두면 날짜/시각 칸에도 소수점 키가 뜨고, 그 키는 눌러도 걸러진다.
    input.inputMode = field.mask.inputMode;
    input.placeholder = field.placeholder ?? '';
    // attachMask 가 자기 input 리스너 안에서 onChange 를 부른다 — 마스크가 먼저
    // 돌아야 계산이 정규화된 값을 본다.
    const sync = attachMask(input, field.mask, onChange);
    row.append(label, input);
    wrap.append(row);
    parts.set(field.key, { input, label, sync });
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
      for (const [key, field] of parts) out[key] = field.input.value;
      return out;
    },
    setValue(key, value) {
      const field = parts.get(key);
      if (!field) return;
      // 프로그램으로 넣는 값도 사용자가 친 값과 같은 마스크를 지나야 한다.
      field.input.value = field.sync(value);
      onChange();
    },
    setLabel(key, label) {
      const field = parts.get(key);
      if (field) field.label.textContent = label;
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
