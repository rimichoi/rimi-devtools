import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createCopyButton } from '../../ui/copyButton';
import { createResultList } from '../../ui/resultList';
import { decodeJwt, type JwtDecoded } from './logic';
import { verifySignature } from './verify';

/*
 * 컴포넌트 선택 근거(ioPane.ts 상단 규칙 4번): 입력은 붙여넣는 텍스트 한 덩어리고,
 * 결과는 헤더 JSON / 페이로드 JSON / 시간 클레임 목록 / 경고 목록으로 나뉜다.
 * 그래서 입력은 IOPane 의 입력 카드(`output: false`)를 쓰고, 결과는 각자의
 * 컴포넌트로 그린다. 시간 클레임은 필드가 여럿이라 ResultList 이고, 헤더와
 * 페이로드는 "정렬된 JSON 한 덩어리" 라 읽기 전용 textarea 카드다 — ResultList 의
 * 행 값은 한 줄짜리 문자열이라 여러 줄 JSON 을 담을 수 없다.
 *
 * 보안: 여기 들어오는 것은 운영 토큰일 수 있다. innerHTML / insertAdjacentHTML 을
 * 한 번도 쓰지 않는다 — 전부 createElement + textContent 다. 토큰 값과 비밀키는
 * localStorage / sessionStorage / URL 어디에도 쓰지 않는다.
 */

/** 헤더·페이로드처럼 "정렬된 텍스트 한 덩어리" 를 보여주는 읽기 전용 카드 */
function createOutputCard(labelText: string): {
  el: HTMLElement;
  setText(text: string): void;
  setNote(note: string): void;
} {
  const box = document.createElement('section');
  box.className = 'panel jwt-card';

  const head = document.createElement('div');
  head.className = 'io-output-head';
  const label = document.createElement('label');
  label.textContent = labelText;

  const area = document.createElement('textarea');
  area.readOnly = true;
  area.spellcheck = false;
  area.placeholder = '결과가 여기에 표시됩니다.';

  head.append(label, createCopyButton(() => area.value));

  const note = document.createElement('div');
  note.className = 'io-warn';

  box.append(head, area, note);
  return {
    el: box,
    setText(text) {
      area.value = text;
    },
    setNote(text) {
      note.textContent = text;
    },
  };
}

const mod: ToolModule = {
  mount(root) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-stack jwt-tool';

    /*
     * 비밀키 헤더. Jasypt 도구의 마스터 비밀번호 헤더와 같은 모양이지만 공용
     * 컴포넌트로 빼지 않는다 — 라벨도 안내 문구도 다르고, Jasypt 쪽은 두 IOPane 을
     * run() 으로 다시 돌리는 배선이 얽혀 있다. 지금 뽑으면 옵션만 늘어난 껍데기가
     * 된다. 세 번째 사용자가 생기면 그때 뽑는다.
     */
    const secretBox = document.createElement('section');
    secretBox.className = 'jwt-secret';

    const secretLabel = document.createElement('label');
    secretLabel.textContent = '비밀키 (HS256/384/512 서명 검증용)';
    // <label for> 를 맞추려면 id 가 필요하다. name 은 주지 않는다 — 브라우저
    // 자동완성과 비밀번호 매니저가 이 값을 저장하겠다고 나서는 것을 피한다.
    secretLabel.htmlFor = 'jwt-secret';

    const secretRow = document.createElement('div');
    secretRow.className = 'jwt-secret-row';

    const secret = document.createElement('input');
    secret.type = 'password';
    secret.id = 'jwt-secret';
    secret.autocomplete = 'off';
    secret.spellcheck = false;
    secret.autocapitalize = 'off';
    secret.placeholder = '비워두면 서명을 검증하지 않는다';

    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.textContent = '비밀키 보기';
    reveal.setAttribute('aria-pressed', 'false');
    reveal.addEventListener('click', () => {
      const shown = secret.type === 'text';
      secret.type = shown ? 'password' : 'text';
      reveal.setAttribute('aria-pressed', shown ? 'false' : 'true');
      reveal.textContent = shown ? '비밀키 보기' : '비밀키 숨기기';
    });

    secretRow.append(secret, reveal);
    secretBox.append(secretLabel, secretRow);

    const verdict = document.createElement('div');
    verdict.className = 'jwt-verdict';

    const warnings = document.createElement('div');
    warnings.className = 'jwt-warnings';

    const header = createOutputCard('헤더');
    const payload = createOutputCard('페이로드');

    // 넓은 화면에서 오른쪽 절반이 비지 않도록 헤더와 페이로드를 2열로 놓는다.
    // Jasypt 도구가 정확히 그 문제(전폭 입력 아래 카드 하나)로 수정 라운드를
    // 한 번 돌았다. e2e/jwt.spec.ts 가 두 카드가 같은 줄에 있는지 위치로 잰다.
    const panes = document.createElement('div');
    panes.className = 'jwt-panes';
    panes.append(header.el, payload.el);

    const error = document.createElement('div');
    error.className = 'io-error';

    const times = document.createElement('div');

    let copyText = '';
    let token = '';

    // 입력 카드가 wrap 의 첫 자식이 되도록 다른 요소보다 먼저 붙인다.
    const pane = createIOPane(wrap, {
      inputLabel: 'JWT',
      placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9. …  (Bearer 접두사가 붙어 있어도 된다)',
      output: false,
      onInput: (input) => {
        token = input;
        recompute();
      },
    });

    wrap.append(secretBox, verdict, warnings, panes, times, error);

    const timeList = createResultList(times, {
      label: '시간 클레임',
      getCopyText: () => copyText,
      emptyHint: 'exp · iat · nbf 가 있으면 여기에 표시됩니다.',
    });

    /*
     * crypto.subtle 은 비동기다. 빠르게 타이핑하면 먼저 시작한 검증이 나중에
     * 끝나서 최신 결과를 덮어쓴다 — 이 프로젝트는 EXIF 도구에서 정확히 같은
     * 사고를 냈다(늦게 끝난 파일 A 의 GPS 배너가 파일 B 화면 위에 찍혔다).
     * 세대 카운터로 막는다: 모든 await 지점 이후에 자기 세대가 아직 최신인지
     * 확인하고, 아니면 DOM 을 건드리지 말고 조용히 빠져나온다.
     */
    let generation = 0;

    function clearResults(): void {
      header.setText('');
      header.setNote('');
      payload.setText('');
      payload.setNote('');
      warnings.replaceChildren();
      copyText = '';
      timeList.setRows([]);
    }

    function renderWarnings(value: JwtDecoded): void {
      warnings.replaceChildren();
      for (const warning of value.warnings) {
        const line = document.createElement('div');
        // 새 색을 만들지 않는다. 위험은 오류와 같은 빨강(.io-error), 주의는
        // 경고와 같은 주황(.io-warn) 을 그대로 쓴다.
        line.className = warning.severity === 'danger' ? 'io-error' : 'io-warn';
        line.textContent = warning.message;
        warnings.append(line);
      }
    }

    function setVerdict(state: string, message: string): void {
      verdict.textContent = message;
      verdict.dataset['state'] = state;
    }

    function recompute(): void {
      // 입력이 바뀌면 진행 중이던 검증 결과는 전부 stale 이다.
      const gen = ++generation;

      // 현재 시각은 여기서 한 번만 읽는다. logic.ts 는 시계를 읽지 않는다.
      const nowSeconds = Math.floor(Date.now() / 1000);
      const result = decodeJwt(token, nowSeconds);

      if (!result.ok) {
        error.textContent = result.error;
        clearResults();
        setVerdict('unverified', '비밀키를 입력하면 서명을 검증합니다.');
        return;
      }

      error.textContent = '';

      if (result.value.kind === 'empty') {
        clearResults();
        setVerdict('unverified', '비밀키를 입력하면 서명을 검증합니다.');
        return;
      }

      if (result.value.kind === 'jwe') {
        clearResults();
        setVerdict('unverified', '암호화된 토큰(JWE)이라 이 도구로는 내용을 볼 수 없습니다.');
        return;
      }

      const value = result.value;
      header.setText(value.headerText);
      header.setNote('');
      payload.setText(value.payloadText);
      payload.setNote(value.payloadNote ?? '');
      renderWarnings(value);

      const rows = value.timeRows.map((row) => ({ label: row.label, value: row.value }));
      copyText = rows.map((row) => `${row.label}: ${row.value}`).join('\n');
      timeList.setRows(rows, '이 토큰에는 exp · iat · nbf 가 없습니다.');

      if (value.signatureError !== undefined) {
        setVerdict('mismatch', value.signatureError);
        return;
      }

      // 결과가 도착하기 전까지는 직전 판정을 남겨두지 않는다 — 바뀐 입력 위에
      // 옛 "서명이 유효합니다" 가 걸려 있는 순간을 만들지 않기 위함이다.
      setVerdict('pending', '서명을 검증하는 중…');

      void verifySignature(value.alg, value.signingInput, value.signature, secret.value).then(
        (result) => {
          if (gen !== generation) return; // 내 세대가 아니다. DOM 을 건드리지 않는다.
          setVerdict(result.state, result.message);
        },
        () => {
          if (gen !== generation) return;
          setVerdict('unverified', '서명을 검증하지 못했습니다.');
        },
      );
    }

    // 비밀키가 바뀌어도 같은 경로로 다시 계산한다 — 토큰을 다시 붙여넣게 만들지
    // 않는다. 토큰 값은 위 onInput 이 `token` 에 넣어 둔 것을 그대로 쓴다.
    secret.addEventListener('input', recompute);

    root.append(wrap);
    recompute();

    return () => {
      generation++; // 언마운트 후 도착하는 검증 결과도 stale 로 취급한다
      secret.removeEventListener('input', recompute);
      // 비밀키를 DOM 에 남기지 않는다.
      secret.value = '';
      pane.destroy();
      timeList.destroy();
      wrap.remove();
    };
  },
};

export default mod;
