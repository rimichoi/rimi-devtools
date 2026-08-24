import qrcode from 'qrcode-generator';
import type { ToolModule } from '../../types';
import { createCopyButton } from '../../ui/copyButton';
import { createResultList, type ResultRow } from '../../ui/resultList';
import { createSelect } from '../../ui/select';
import {
  buildOtpauthUri,
  configWarnings,
  decodeBase32,
  encodeBase32,
  parseOtpauthUri,
  type TotpAlgorithm,
  type TotpConfig,
} from './logic';
import { generateTotp, secondsRemaining, verifyTotp } from './totp';

/*
 * 이 도구는 **자격 증명 자체를 다룬다.** 2차 인증 비밀키는 비밀번호보다 오래 살고,
 * 유출되면 2차 인증이 있으나 마나가 된다. 그래서 Jasypt · JWT 도구와 같은 규칙을
 * 지킨다: localStorage / sessionStorage / URL 어디에도 쓰지 않고, 렌더링은 전부
 * createElement + textContent 이며(innerHTML 0건), 도구를 떠날 때 입력칸을 비운다.
 *
 * QR 도 마찬가지다. QR 그림 안에 비밀키가 그대로 들어 있으므로 화면 캡처를 공유하는
 * 것은 비밀키를 공유하는 것과 같다. 그 사실을 화면에 적어 둔다.
 *
 * 컴포넌트 선택 근거: 입력이 스칼라 여럿(비밀키 · 발급자 · 계정 · 설정 셋)이고
 * 결과가 URI · QR · 현재 코드로 나뉜다. ioPane 의 규칙 2번에 가장 가깝지만
 * numberForm 은 숫자와 마스크를 전제하므로 맞지 않는다. 도구 안에서 입력 줄을
 * 직접 만들고 결과는 ResultList 와 자체 QR 카드로 그린다.
 */

const ALGORITHMS: readonly (readonly [string, string])[] = [
  ['SHA-1', 'SHA-1 (기본)'],
  ['SHA-256', 'SHA-256'],
  ['SHA-512', 'SHA-512'],
];
const DIGITS: readonly (readonly [string, string])[] = [
  ['6', '6자리 (기본)'],
  ['8', '8자리'],
];
const PERIODS: readonly (readonly [string, string])[] = [
  ['30', '30초 (기본)'],
  ['60', '60초'],
];

/**
 * QR 을 SVG 로 그린다. createSvgTag() 는 문자열이라 innerHTML 이 필요해 쓰지 않는다.
 *
 * 성공 여부를 돌려준다. `qr.make()` 는 내용이 QR 용량(약 2300바이트)을 넘으면
 * 예외를 던지는데, 그 예외가 호출부로 새면 결과 갱신이 통째로 건너뛰어져 화면이
 * 찢어진다 — URI 와 경고는 새 설정으로 바뀌었는데 "지금 코드" 는 옛 설정 값에
 * 얼어붙고, QR 은 사라졌는데 "이 QR 안에 비밀키가 있습니다" 는 그대로 남았다.
 * 사용자에게 보이는 오류는 하나도 없었다. 직전 태스크의 BLOCKING 과 같은 부류다.
 */
function renderQr(host: HTMLElement, text: string): boolean {
  host.replaceChildren();

  const qr = qrcode(0, 'M');
  qr.addData(text);
  try {
    qr.make();
  } catch {
    return false;
  }

  const count = qr.getModuleCount();
  // ISO/IEC 18004 는 조용한 여백(quiet zone) 4모듈을 요구한다. 좁히면 어두운
  // 배경 위에서 파인더 패턴 인식이 불안정해진다.
  const margin = 4;
  const size = count + margin * 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '설정용 QR 코드');
  svg.classList.add('totp-qr');

  // 밝은 칸은 배경으로 한 번에 깔고, 어두운 칸만 사각형으로 찍는다.
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(size));
  background.setAttribute('height', String(size));
  background.setAttribute('fill', '#ffffff');
  svg.append(background);

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      cell.setAttribute('x', String(col + margin));
      cell.setAttribute('y', String(row + margin));
      cell.setAttribute('width', '1');
      cell.setAttribute('height', '1');
      // QR 은 흑백 대비가 규격이다. 테마 토큰을 쓰면 다크 테마에서 스캔이 안 된다.
      cell.setAttribute('fill', '#000000');
      svg.append(cell);
    }
  }

  host.append(svg);
  return true;
}

function labelledInput(
  labelText: string,
  id: string,
  placeholder: string,
): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('div');
  row.className = 'totp-field';

  const label = document.createElement('label');
  label.textContent = labelText;
  label.htmlFor = id;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;

  row.append(label, input);
  return { row, input };
}

const mod: ToolModule = {
  mount(root) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-stack totp-tool';

    // ── 비밀키 ───────────────────────────────────────────────────────
    const secretBox = document.createElement('section');
    secretBox.className = 'totp-secret';

    const secretLabel = document.createElement('label');
    secretLabel.textContent = '비밀키 (Base32)';
    // name 은 주지 않는다 — 브라우저 자동완성과 비밀번호 매니저가 이 값을
    // 저장하겠다고 나서는 것을 피한다.
    secretLabel.htmlFor = 'totp-secret';

    const secretRow = document.createElement('div');
    secretRow.className = 'totp-secret-row';

    const secret = document.createElement('input');
    secret.type = 'password';
    secret.id = 'totp-secret';
    secret.autocomplete = 'off';
    secret.spellcheck = false;
    secret.autocapitalize = 'off';
    secret.placeholder = 'JBSWY3DPEHPK3PXP  또는  otpauth:// URI 를 붙여넣으세요';

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

    const generate = document.createElement('button');
    generate.type = 'button';
    generate.textContent = '무작위 생성';
    generate.addEventListener('click', () => {
      // 160비트. RFC 4226 이 권하는 최소(128비트)보다 넉넉하고 SHA-1 블록에 맞다.
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      secret.value = encodeBase32(bytes).replace(/=+$/, '');
      lastSecretValue = secret.value;
      secret.type = 'text';
      reveal.setAttribute('aria-pressed', 'true');
      reveal.textContent = '비밀키 숨기기';
      recompute();
    });

    secretRow.append(secret, reveal, generate);
    secretBox.append(secretLabel, secretRow);

    // ── 발급자 · 계정 · 설정 ─────────────────────────────────────────
    const fields = document.createElement('section');
    fields.className = 'totp-fields';

    const issuerField = labelledInput('발급자', 'totp-issuer', '다우오피스');
    const accountField = labelledInput('계정', 'totp-account', 'rimichoi@daou.co.kr');

    const algorithmSelect = createSelect(ALGORITHMS);
    algorithmSelect.id = 'totp-algorithm';
    const digitsSelect = createSelect(DIGITS);
    digitsSelect.id = 'totp-digits';
    const periodSelect = createSelect(PERIODS);
    periodSelect.id = 'totp-period';

    function selectField(labelText: string, select: HTMLSelectElement): HTMLElement {
      const row = document.createElement('div');
      row.className = 'totp-field';
      const label = document.createElement('label');
      label.textContent = labelText;
      label.htmlFor = select.id;
      row.append(label, select);
      return row;
    }

    fields.append(
      issuerField.row,
      accountField.row,
      selectField('알고리즘', algorithmSelect),
      selectField('자릿수', digitsSelect),
      selectField('주기', periodSelect),
    );

    const warnings = document.createElement('div');
    warnings.className = 'totp-warnings';

    const error = document.createElement('div');
    error.className = 'io-error';

    // ── 결과: QR + URI + 현재 코드 ───────────────────────────────────
    const panes = document.createElement('div');
    panes.className = 'totp-panes';

    const qrCard = document.createElement('section');
    qrCard.className = 'panel totp-qr-card';
    const qrHead = document.createElement('div');
    qrHead.className = 'io-output-head';
    const qrLabel = document.createElement('label');
    qrLabel.textContent = 'QR 코드';
    qrHead.append(qrLabel);
    const qrHost = document.createElement('div');
    qrHost.className = 'totp-qr-host';
    const qrNote = document.createElement('div');
    qrNote.className = 'io-warn';
    qrCard.append(qrHead, qrHost, qrNote);

    const rightColumn = document.createElement('div');

    const uriCard = document.createElement('section');
    uriCard.className = 'panel totp-uri-card';
    const uriHead = document.createElement('div');
    uriHead.className = 'io-output-head';
    const uriLabel = document.createElement('label');
    uriLabel.textContent = 'otpauth URI';
    const uriArea = document.createElement('textarea');
    uriArea.readOnly = true;
    uriArea.spellcheck = false;
    uriArea.placeholder = '비밀키와 계정을 채우면 여기에 표시됩니다.';
    uriHead.append(uriLabel, createCopyButton(() => uriArea.value));
    uriCard.append(uriHead, uriArea);

    const codeBox = document.createElement('div');
    let codeRows: ResultRow[] = [];

    rightColumn.append(uriCard, codeBox);
    panes.append(qrCard, rightColumn);

    // ── 코드 검증 ────────────────────────────────────────────────────
    const verifyBox = document.createElement('section');
    verifyBox.className = 'totp-verify';
    const verifyField = labelledInput('앱이 보여주는 코드', 'totp-verify-code', '123456');
    verifyField.input.inputMode = 'numeric';
    const verdict = document.createElement('div');
    verdict.className = 'totp-verdict';
    verifyBox.append(verifyField.row, verdict);

    wrap.append(secretBox, fields, warnings, panes, verifyBox, error);
    root.append(wrap);

    const codeList = createResultList(codeBox, {
      label: '지금 코드',
      getCopyText: () => codeRows.map((row) => row.value).join('\n'),
      emptyHint: '비밀키를 채우면 여기에 표시됩니다.',
    });

    /*
     * crypto.subtle 은 비동기다. 빠르게 타이핑하면 먼저 시작한 계산이 나중에 끝나
     * 최신 결과를 덮어쓴다 — 이 프로젝트가 EXIF 에서 겪은 사고다. 세대 카운터로
     * 막고, 모든 await 지점 이후에 자기 세대가 최신인지 확인한다.
     */
    let generation = 0;
    let ticker: number | null = null;
    /*
     * 코드는 1초마다 갱신해야 하지만 QR 과 URI 는 설정이 바뀔 때만 다시 만든다.
     * 매초 QR 을 다시 그리면 화면이 깜빡이고, 수백 개 사각형을 1초마다 버리고
     * 새로 만드는 셈이 된다. 그래서 마지막으로 성립한 설정을 들고 있다가 티커는
     * 코드 계산만 다시 돌린다.
     */
    let liveConfig: TotpConfig | null = null;
    let liveBytes: Uint8Array | null = null;

    function currentConfig(): TotpConfig {
      return {
        secret: secret.value,
        issuer: issuerField.input.value,
        account: accountField.input.value,
        algorithm: algorithmSelect.value as TotpAlgorithm,
        digits: Number.parseInt(digitsSelect.value, 10),
        period: Number.parseInt(periodSelect.value, 10),
      };
    }

    function clearResults(): void {
      liveConfig = null;
      liveBytes = null;
      qrHost.replaceChildren();
      qrNote.textContent = '';
      uriArea.value = '';
      warnings.replaceChildren();
      codeRows = [];
      codeList.setRows([]);
      verdict.textContent = '';
      verdict.removeAttribute('data-state');
    }

    function renderWarnings(config: TotpConfig): void {
      warnings.replaceChildren();
      for (const warning of configWarnings(config)) {
        const line = document.createElement('div');
        line.className = warning.severity === 'danger' ? 'io-error' : 'io-warn';
        line.textContent = warning.message;
        warnings.append(line);
      }
    }

    /*
     * otpauth URI 를 비밀키 칸에 통째로 넣는 것이 가장 흔한 사용법이라 자동으로
     * 나눠 담는다. 다만 **키 입력마다** 하면 안 된다 — 대부분의 URI 는 secret=
     * 파라미터가 앞에 있어서, 손으로 타이핑하면 그 지점까지만 쳤을 때 이미 파싱에
     * 성공해 나머지를 통째로 잘라먹는다. 실제로 `otpauth://...&issuer=GitHub&digits=8`
     * 을 타이핑하면 비밀키 칸에 `GEZ...&issuer=GitHub&digits=8` 이 남았다.
     * 그래서 붙여넣기와 포커스 이탈에서만 나눈다.
     */
    function adoptUriIfPresent(): boolean {
      if (!secret.value.trim().toLowerCase().startsWith('otpauth://')) return true;

      const parsedUri = parseOtpauthUri(secret.value);
      if (!parsedUri.ok) {
        error.textContent = parsedUri.error;
        clearResults();
        return false;
      }

      const config = parsedUri.value;
      secret.value = config.secret;
      issuerField.input.value = config.issuer;
      accountField.input.value = config.account;
      algorithmSelect.value = config.algorithm;
      // 목록에 없는 값이면 항목을 만들어 넣는다. 그러지 않으면 select.value 가
      // '' 이 되고 parseInt('') 이 NaN 이 되어 URI 와 QR 에 NaN 이 박힌다.
      adoptSelectValue(digitsSelect, String(config.digits), `${config.digits}자리`);
      adoptSelectValue(periodSelect, String(config.period), `${config.period}초`);
      return true;
    }

    function adoptSelectValue(select: HTMLSelectElement, value: string, label: string): void {
      if (![...select.options].some((option) => option.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      select.value = value;
    }

    /*
     * 방어선. 근본 원인(QR 용량 초과에서 던지던 make())은 renderQr 에서 막았지만,
     * 이 도구의 최악 실패 모드는 "새 설정 화면에 옛 코드가 얼어붙은 채 남는 것"
     * 이다. 그 상태를 만드는 길은 결과를 비우기 전에 예외로 빠져나가는 것 하나뿐
     * 이므로, 어떤 예외가 나더라도 결과를 먼저 비운다.
     */
    function recompute(): void {
      try {
        recomputeOnce();
      } catch (thrown) {
        generation++;
        clearResults();
        error.textContent = `설정을 처리하지 못했습니다: ${String(thrown)}`;
      }
    }

    function recomputeOnce(): void {
      // 설정이 바뀌면 진행 중이던 계산은 전부 stale 이다. tick() 이 이 값을 읽어
      // 자기 세대가 최신인지 확인한다.
      generation++;

      const config = currentConfig();

      if (config.secret.trim() === '' && config.account.trim() === '') {
        error.textContent = '';
        clearResults();
        return;
      }

      const uri = buildOtpauthUri(config);
      if (!uri.ok) {
        error.textContent = uri.error;
        clearResults();
        return;
      }
      error.textContent = '';

      uriArea.value = uri.value;
      renderWarnings(config);

      if (renderQr(qrHost, uri.value)) {
        qrNote.textContent =
          '이 QR 안에 비밀키가 그대로 들어 있습니다. 화면 캡처를 공유하면 비밀키를 공유하는 것과 같습니다.';
      } else {
        // QR 이 없는데 QR 주의 문구를 남겨두면 화면이 서로 다른 말을 한다.
        qrNote.textContent =
          '발급자와 계정이 너무 길어 QR 로 담을 수 없습니다. 아래 URI 는 그대로 쓸 수 있습니다.';
      }

      const decoded = decodeBase32(config.secret);
      if (!decoded.ok) {
        // buildOtpauthUri 가 이미 같은 디코딩을 통과시켰으므로 여기는 도달하지
        // 않는다. 그래도 조용히 빠져나가 옛 코드를 남기지 않도록 비운다.
        liveConfig = null;
        liveBytes = null;
        codeList.setRows([]);
        return;
      }

      liveConfig = config;
      liveBytes = decoded.value;
      tick();
    }

    /** 코드와 남은 시간만 다시 계산한다. QR 과 URI 는 건드리지 않는다. */
    function tick(): void {
      const config = liveConfig;
      const bytes = liveBytes;
      if (config === null || bytes === null) return;

      const gen = generation;
      const now = Date.now() / 1000;

      void generateTotp(bytes, config.algorithm, config.digits, config.period, now)
        .then((code) => {
          if (gen !== generation) return; // 내 세대가 아니다. DOM 을 건드리지 않는다.
          codeRows = [
            { label: '코드', value: code },
            { label: '남은 시간', value: `${secondsRemaining(config.period, Date.now() / 1000)}초` },
          ];
          codeList.setRows(codeRows);
        })
        .catch(() => {
          if (gen !== generation) return;
          codeList.setError('코드를 계산하지 못했습니다.');
        });

      void checkVerification(gen, config, bytes).catch(() => {
        if (gen !== generation) return;
        verdict.textContent = '코드를 검증하지 못했습니다.';
        verdict.dataset['state'] = 'mismatch';
      });
    }

    async function checkVerification(
      gen: number,
      config: TotpConfig,
      bytes: Uint8Array,
    ): Promise<void> {
      const typed = verifyField.input.value.trim();
      if (typed === '') {
        if (gen === generation) {
          verdict.textContent = '';
          verdict.removeAttribute('data-state');
        }
        return;
      }
      const ok = await verifyTotp(
        bytes,
        config.algorithm,
        config.digits,
        config.period,
        Date.now() / 1000,
        typed,
      );
      if (gen !== generation) return;
      verdict.textContent = ok
        ? '이 코드는 지금 유효합니다.'
        : '이 코드는 맞지 않습니다. 앱의 설정이나 기기 시계를 확인하세요.';
      verdict.dataset['state'] = ok ? 'valid' : 'mismatch';
    }

    /*
     * 검증 코드는 QR · URI · 경고와 아무 상관이 없다. 예전에는 이 칸도 recompute 에
     * 묶여 있어서 여섯 자리를 치면 QR 을 열두 번 다시 그렸다(티커에서 고쳤던 것과
     * 같은 문제가 여기 남아 있었다). 검증만 다시 돌린다.
     */
    function onVerifyInput(): void {
      const config = liveConfig;
      const bytes = liveBytes;
      if (config === null || bytes === null) return;
      void checkVerification(generation, config, bytes).catch(() => undefined);
    }

    /*
     * URI 를 언제 나눠 담을지 정하는 규칙.
     *
     * paste 이벤트에만 기대면 안 된다 — 붙여넣기 말고도 값이 한꺼번에 들어오는
     * 경로가 있고(브라우저 자동완성, 자동화 도구), paste 는 값이 아직 반영되기
     * 전에 발화한다. 반대로 매 입력마다 나누면 손으로 타이핑할 때 secret= 까지만
     * 친 순간 나머지를 잘라먹는다.
     *
     * 그래서 **한 글자씩 늘어난 경우만** 건드리지 않는다. 타이핑은 한 글자씩
     * 늘어나고, 붙여넣기·자동완성·자동화는 한꺼번에 뛴다. 손으로 다 친 URI 는
     * 포커스를 옮길 때(change) 나눠 담는다.
     */
    let lastSecretValue = secret.value;

    function onSecretInput(): void {
      const typedOneChar =
        secret.value.length === lastSecretValue.length + 1 && secret.value.startsWith(lastSecretValue);
      lastSecretValue = secret.value;

      if (!typedOneChar && !adoptUriIfPresent()) return;
      lastSecretValue = secret.value;
      recompute();
    }

    function onSecretChange(): void {
      // 포커스를 옮기는 순간, 손으로 다 친 URI 도 나눠 담는다.
      if (!adoptUriIfPresent()) return;
      lastSecretValue = secret.value;
      recompute();
    }

    const configInputs = [issuerField.input, accountField.input];
    const selects = [algorithmSelect, digitsSelect, periodSelect];
    for (const input of configInputs) input.addEventListener('input', recompute);
    for (const select of selects) select.addEventListener('change', recompute);
    verifyField.input.addEventListener('input', onVerifyInput);
    secret.addEventListener('input', onSecretInput);
    secret.addEventListener('change', onSecretChange);

    // 코드는 시간이 지나면 바뀐다. 화면에 옛 코드를 남겨 두지 않는다.
    ticker = window.setInterval(tick, 1000);

    recompute();

    return () => {
      generation++; // 언마운트 후 도착하는 계산도 stale 로 취급한다
      if (ticker !== null) window.clearInterval(ticker);
      for (const input of configInputs) input.removeEventListener('input', recompute);
      for (const select of selects) select.removeEventListener('change', recompute);
      verifyField.input.removeEventListener('input', onVerifyInput);
      secret.removeEventListener('input', onSecretInput);
      secret.removeEventListener('change', onSecretChange);
      // 비밀키를 DOM 에 남기지 않는다.
      secret.value = '';
      verifyField.input.value = '';
      codeList.destroy();
      wrap.remove();
    };
  },
};

export default mod;
