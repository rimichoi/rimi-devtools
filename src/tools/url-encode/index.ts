import type { ToolModule, ToolResult } from '../../types';
import { createIOPane, type TransformOutput } from '../../ui/ioPane';
import { createSelect } from '../../ui/select';
import { encodeUrl, decodeUrl, type UrlMode } from './logic';

/** `ToolResult<string>` 인 logic 함수를 IOPane 의 결과 모양으로 감싼다. */
function asOutput(result: ToolResult): ToolResult<TransformOutput> {
  return result.ok ? { ok: true, value: { text: result.value } } : result;
}

const mod: ToolModule = {
  mount(root) {
    /*
     * base64 와 같은 모양이다: 독립된 두 세트(인코딩/디코딩)를 한 화면에 놓는다.
     * 근거는 base64/index.ts 주석 참고.
     *
     * select 는 **하나를 두 세트가 공유한다**. 각 세트에 하나씩 두지 않는 이유:
     *
     *  - 이 select 는 방향이 아니라 **다루는 재료가 무엇인지**를 말한다 — "이 값은
     *    쿼리 값 하나인가, URL 전체인가". 한 작업 세션에서 재료는 하나다. 두 세트가
     *    같은 URL 의 앞뒤를 보는 것이 정상적인 사용이다.
     *  - 따로 두면 '값 단위로 인코딩 → URL 전체로 디코딩' 처럼 서로 짝이 맞지 않는
     *    조합이 사고로 만들어진다. decodeURI 는 %2F, %3F 를 풀지 않으므로 그
     *    조합에서는 왕복이 원문으로 돌아오지 않고, 사용자는 "왜 되돌아오지 않지" 를
     *    두 개의 select 를 번갈아 보며 찾아야 한다. 얻는 것 없이 상태만 두 배다.
     *  - 두 세트의 **값** 은 여전히 완전히 독립이다(요구사항은 값의 독립이다).
     *    select 는 값이 아니라 변환 규칙이고, 규칙이 바뀌면 두 세트가 함께 다시
     *    계산되는 것이 맞다 — 규칙이 바뀐 뒤에도 옛 규칙으로 만든 결과가 화면에
     *    남아 있으면 그게 거짓이다.
     *
     * 도구 전체에 걸리는 컨트롤이므로 IOPane 의 `controls` (그 pane 안에 놓인다)가
     * 아니라 화면 맨 위 자기 바에 둔다.
     */
    const mode = createSelect([
      ['component', '값 단위 (encodeURIComponent)'],
      ['full', 'URL 전체 (encodeURI)'],
    ]);
    const bar = document.createElement('div');
    bar.className = 'io-controls';
    bar.append(mode);
    root.append(bar);

    const encode = createIOPane(root, {
      inputLabel: '원문',
      placeholder: 'URL 또는 쿼리 값을 붙여넣으세요.',
      outputLabel: '인코딩된 값',
      transform: (text) => asOutput(encodeUrl(text, mode.value as UrlMode)),
    });

    const divider = document.createElement('h3');
    divider.className = 'section-heading';
    divider.textContent = '인코딩된 값 → 원문';
    root.append(divider);

    const decode = createIOPane(root, {
      inputLabel: '인코딩된 값',
      placeholder: '퍼센트 인코딩된 값을 붙여넣으세요.',
      outputLabel: '원문',
      transform: (text) => asOutput(decodeUrl(text, mode.value as UrlMode)),
    });

    // 규칙이 바뀌었으니 두 세트를 각자의 입력 기준으로 다시 계산한다.
    const onModeChange = (): void => {
      encode.run();
      decode.run();
    };
    mode.addEventListener('change', onModeChange);

    return () => {
      mode.removeEventListener('change', onModeChange);
      bar.remove();
      encode.destroy();
      divider.remove();
      decode.destroy();
    };
  },
};

export default mod;
