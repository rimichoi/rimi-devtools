import type { ToolModule } from '../../types';
import { createLinkedPanes } from '../../ui/linkedPanes';
import { encodeBase64, decodeBase64 } from './logic';

const mod: ToolModule = {
  mount(root) {
    // 방향 select 가 있던 자리다. 인코딩/디코딩은 서로의 역함수이므로, 무엇을
    // 하려는지 먼저 고르게 하는 대신 두 값을 나란히 놓고 양방향으로 잇는다.
    const panes = createLinkedPanes(root, {
      left: { label: '원문', placeholder: '텍스트를 입력하면 오른쪽에 Base64 가 나옵니다.' },
      right: { label: 'Base64', placeholder: 'Base64 를 붙여넣으면 왼쪽에 원문이 나옵니다.' },
      toRight: (text) => encodeBase64(text),
      // 붙여넣은 Base64 에는 줄바꿈/공백이 섞여 들어오는 일이 흔하다.
      // decodeBase64 가 알아서 걷어내지만, 사용자가 친 값 자체는 건드리지 않는다.
      toLeft: (b64) => decodeBase64(b64),
    });

    return () => panes.destroy();
  },
};

export default mod;
