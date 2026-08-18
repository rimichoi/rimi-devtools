import type { ToolModule, ToolResult } from '../../types';
import { createIOPane, type TransformOutput } from '../../ui/ioPane';
import { encodeBase64, decodeBase64 } from './logic';

/** `ToolResult<string>` 인 logic 함수를 IOPane 의 결과 모양으로 감싼다. */
function asOutput(result: ToolResult): ToolResult<TransformOutput> {
  return result.ok ? { ok: true, value: { text: result.value } } : result;
}

const mod: ToolModule = {
  mount(root) {
    /*
     * 한 화면에 **독립된 두 세트**를 놓는다. 인코딩 세트(원문 → Base64)와 디코딩
     * 세트(Base64 → 원문)가 서로의 값을 건드리지 않는다.
     *
     * 두 번의 오답을 지나 여기 왔다:
     *
     *  1. 방향 select(인코딩/디코딩) 하나 + 입력/출력 한 쌍. 사용자가 아무것도
     *     하기 전에 "나는 지금 어느 모드인가" 를 먼저 대답해야 했다.
     *  2. 양방향으로 이어진 두 칸(LinkedPanes). 질문은 없어졌지만 한쪽을 고치면
     *     반대쪽이 덮어써지므로, **인코딩과 디코딩을 동시에 들고 있을 수 없었다** —
     *     Base64 를 하나 풀어 보고 그 옆에서 다른 문자열을 인코딩하는, 이 도구를
     *     쓰는 가장 흔한 방식이 불가능했다.
     *
     * 그래서 IOPane 두 개다. 새 컴포넌트를 만들지 않는다 — 각 세트는 그냥 "대량
     * 텍스트 → 대량 텍스트" 이고, 그건 IOPane 이 이미 하는 일이다(ioPane.ts 의
     * 컴포넌트 선택 규칙 1번). 두 인스턴스가 상태를 공유하지 않는 것이 곧 독립성의
     * 구현이다.
     */
    const encode = createIOPane(root, {
      inputLabel: '원문',
      placeholder: '텍스트를 입력하면 Base64 가 나옵니다.',
      outputLabel: 'Base64',
      transform: (text) => asOutput(encodeBase64(text)),
    });

    const divider = document.createElement('h3');
    divider.className = 'section-heading';
    divider.textContent = 'Base64 → 원문';
    root.append(divider);

    const decode = createIOPane(root, {
      inputLabel: 'Base64',
      // 붙여넣은 Base64 에는 줄바꿈/공백이 섞여 들어오는 일이 흔하다.
      // decodeBase64 가 알아서 걷어내지만, 사용자가 붙여넣은 값 자체는 건드리지 않는다.
      placeholder: 'Base64 를 붙여넣으면 원문이 나옵니다.',
      outputLabel: '원문',
      transform: (b64) => asOutput(decodeBase64(b64)),
    });

    return () => {
      encode.destroy();
      divider.remove();
      decode.destroy();
    };
  },
};

export default mod;
