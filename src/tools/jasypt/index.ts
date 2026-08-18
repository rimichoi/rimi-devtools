import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createResultList } from '../../ui/resultList';
import { decryptJasypt, encryptJasypt, type JasyptEncrypted } from './logic';

/** 사용자가 자기 팀 설정과 대조할 수 있도록 규격을 그대로 적는다. */
const ALGORITHM_SUMMARY = 'PBEWithMD5AndDES · 반복 1000회 · RandomSalt · base64';

const EMPTY_HINT = '마스터 비밀번호와 평문을 입력하면 결과가 여기에 표시됩니다.';

const mod: ToolModule = {
  mount(root) {
    /*
     * 이 도구는 이 사이트에서 **비밀 자체를 입력받는 유일한 도구**다.
     *
     * 그래서 아래 코드에 없는 것이 있는 코드만큼 중요하다: localStorage /
     * sessionStorage / location / history 를 한 번도 건드리지 않는다. 마스터
     * 비밀번호는 이 화면이 살아 있는 동안 <input> 의 value 로만 존재하고,
     * 언마운트하면 사라진다(아래 정리 함수가 명시적으로 비운다).
     *
     * 렌더링은 전부 createElement + textContent 다. innerHTML /
     * insertAdjacentHTML / outerHTML 을 쓰지 않는다 — 복호화 결과는 사용자가
     * 붙여넣은 값에서 나온 임의의 문자열이다.
     */

    // --- 마스터 비밀번호 (두 세트가 공유한다) --------------------------------
    /*
     * ioPane 의 secondInput 으로 만들지 않는다. 그건 여러 줄 textarea 이고, 세트마다
     * 하나씩 생겨서 같은 비밀번호를 두 번 넣게 만든다. 공용 컴포넌트로 빼지도
     * 않는다 — 사용자가 하나뿐인 컴포넌트를 만들지 않는 것이 이 프로젝트의
     * 규칙이다(ioPane.ts 상단 주석).
     */
    const masterBox = document.createElement('section');
    masterBox.className = 'jasypt-master';

    const masterLabel = document.createElement('label');
    masterLabel.textContent = '마스터 비밀번호';
    // <label for> 를 맞추려면 id 가 필요하다. name 은 주지 않는다 — 브라우저
    // 자동완성과 비밀번호 매니저가 이 값을 저장하겠다고 나서는 것을 피한다.
    masterLabel.htmlFor = 'jasypt-master-password';

    const masterRow = document.createElement('div');
    masterRow.className = 'jasypt-master-row';

    const password = document.createElement('input');
    password.type = 'password';
    password.id = 'jasypt-master-password';
    password.autocomplete = 'off';
    password.spellcheck = false;
    password.autocapitalize = 'off';
    password.placeholder = 'jasypt.encryptor.password 값';

    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = '비밀번호 보기';
    reveal.setAttribute('aria-pressed', 'false');
    reveal.addEventListener('click', () => {
      const shown = password.type === 'text';
      password.type = shown ? 'password' : 'text';
      reveal.setAttribute('aria-pressed', shown ? 'false' : 'true');
      reveal.textContent = shown ? '비밀번호 보기' : '비밀번호 숨기기';
    });

    masterRow.append(password, reveal);
    masterBox.append(masterLabel, masterRow);

    const algorithm = document.createElement('p');
    algorithm.className = 'jasypt-algorithm';
    algorithm.textContent = ALGORITHM_SUMMARY;

    root.append(masterBox, algorithm);

    // --- 복호화 세트 --------------------------------------------------------
    const decryptHeading = document.createElement('h3');
    decryptHeading.className = 'section-heading';
    decryptHeading.textContent = '복호화';
    root.append(decryptHeading);

    /*
     * 두 세트는 독립이다 — 한쪽을 고쳐도 반대쪽이 덮어써지지 않는다. base64 도구와
     * 같은 패턴이고, 양방향으로 잇는 컴포넌트(linkedPanes)는 이 프로젝트에서 한 번
     * 만들고 지웠다. 다시 만들지 않는다.
     */
    const decrypt = createIOPane(root, {
      inputLabel: 'ENC(...) 또는 base64',
      placeholder: '설정 파일에서 복사한 ENC(...) 값을 그대로 붙여넣으세요.',
      outputLabel: '평문',
      transform: (text) => {
        // 비밀번호가 비어 있으면 **에러를 띄우지 않는다.** 아무것도 하지 않은
        // 화면에 빨간 글씨가 뜨는 것을 막기 위한 것이고, ioPane 의 secondInput 이
        // 같은 판단을 한다.
        if (password.value === '') return { ok: true, value: { text: '' } };
        const result = decryptJasypt(text, password.value);
        return result.ok ? { ok: true, value: { text: result.value } } : result;
      },
    });

    // --- 암호화 세트 --------------------------------------------------------
    const encryptHeading = document.createElement('h3');
    encryptHeading.className = 'section-heading';
    encryptHeading.textContent = '암호화';
    root.append(encryptHeading);

    /*
     * 결과가 "텍스트 한 덩어리" 가 아니라 라벨 붙은 두 줄(설정 파일용 / base64 만)
     * 이므로 ioPane 의 컴포넌트 선택 규칙 4번을 따른다: 입력은 IOPane 의 입력
     * 카드(output:false), 결과는 ResultList.
     *
     * 다만 그 조합을 세로로 쌓지 않는다. 글자수 세기는 같은 조합을 쓰면서 결과
     * 카드가 넷이라 아래쪽 격자가 꽉 차지만, 여기는 결과 카드가 **하나**뿐이라
     * 전폭 입력창 아래에 카드 하나가 덩그러니 남고 오른쪽 절반이 빈다(실측
     * 1132×356 입력 + 620 결과). 바로 위 복호화 세트가 균형 잡힌 2열이라 그
     * 어긋남이 더 두드러진다. 그래서 이 도구 전용 격자로 두 컴포넌트를 나란히
     * 놓는다 — 공용 클래스(.io-pane-1col / .result-list-wrap)는 다른 도구들이
     * 의존하므로 건드리지 않는다.
     */
    const encryptRow = document.createElement('div');
    encryptRow.className = 'jasypt-encrypt-row';
    root.append(encryptRow);

    let encrypted: JasyptEncrypted | null = null;

    const encryptInput = createIOPane(encryptRow, {
      inputLabel: '평문',
      placeholder: '설정 파일에 넣을 값을 입력하면 ENC(...) 형태가 나옵니다.',
      output: false,
      onInput: (text) => update(text),
    });

    const results = createResultList(encryptRow, {
      /*
       * 복사 버튼은 **ENC(...) 쪽을 복사한다.** 두 줄을 이어붙여 복사하면 그대로
       * 설정 파일에 붙였을 때 깨지는 값이 되고, 이 도구에서 가장 위험한 것이
       * 정확히 "설정 파일에 넣었는데 배포 시점에 터지는 값" 이다.
       *
       * 그 사실을 머리말이 말한다. 컴포넌트는 머리말 하나에 복사 버튼 하나를
       * 두므로(항목별 버튼은 없다), 무엇이 복사되는지 화면에 적히지 않으면
       * 사용자는 두 줄이 다 복사된다고 믿을 수밖에 없다. e2e 가 이 문구와 실제
       * 복사 내용을 **함께** 고정한다 — 문구만 재면 동작이 바뀌었을 때 머리말이
       * 거짓말을 하게 되기 때문이다.
       */
      label: '암호화 결과 · 복사는 ENC(...)',
      getCopyText: () => encrypted?.enc ?? '',
      emptyHint: EMPTY_HINT,
    });

    function update(text: string): void {
      if (text === '' || password.value === '') {
        encrypted = null;
        results.setRows([], EMPTY_HINT);
        return;
      }

      const result = encryptJasypt(text, password.value);
      if (!result.ok) {
        encrypted = null;
        results.setError(result.error);
        return;
      }

      encrypted = result.value;
      results.setRows([
        // 설정 파일에 붙일 때 필요한 것이 ENC(...) 쪽이므로 먼저 놓는다.
        { label: '설정 파일용', value: encrypted.enc },
        { label: 'base64 만', value: encrypted.base64 },
      ]);
    }

    // 비밀번호가 바뀌면 두 세트를 다시 계산한다. 각 pane 이 자기 입력을 들고
    // 있으므로 여기서 값을 옮겨 담을 필요가 없다.
    function recompute(): void {
      decrypt.run();
      encryptInput.run();
    }
    password.addEventListener('input', recompute);

    return () => {
      password.removeEventListener('input', recompute);
      // 엘리먼트가 파괴되므로 자동이지만, 비밀을 지우는 일은 명시적으로 한다.
      password.value = '';
      encrypted = null;
      decrypt.destroy();
      encryptInput.destroy();
      results.destroy();
      masterBox.remove();
      algorithm.remove();
      decryptHeading.remove();
      encryptHeading.remove();
      encryptRow.remove();
    };
  },
};

export default mod;
