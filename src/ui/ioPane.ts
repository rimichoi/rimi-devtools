import type { ToolResult } from '../types';
import { createCopyButton } from './copyButton';

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
  transform: (input: string) => ToolResult<TransformOutput>;
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
  pane.className = 'io-pane';

  const inputBox = document.createElement('div');
  const inputLabel = document.createElement('label');
  inputLabel.textContent = options.inputLabel ?? '입력';
  const input = document.createElement('textarea');
  input.placeholder = options.placeholder ?? '';
  input.spellcheck = false;
  inputBox.append(inputLabel, input);

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

  pane.append(inputBox, outputBox);
  wrap.append(pane);
  root.append(wrap);

  function run(): void {
    error.textContent = '';
    warn.textContent = '';

    if (input.value.trim() === '') {
      output.value = '';
      return;
    }

    const result = options.transform(input.value);
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
