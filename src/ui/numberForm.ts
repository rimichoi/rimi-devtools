export interface NumberFormField {
  key: string;
  label: string;
  placeholder?: string;
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

  for (const field of fields) {
    const row = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = field.placeholder ?? '';
    input.addEventListener('input', onChange);
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
      el.value = value;
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
