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

/** QR 을 SVG 로 그린다. createSvgTag() 는 문자열이라 innerHTML 이 필요해 쓰지 않는다. */
function renderQr(host: HTMLElement, text: string): void {
  host.replaceChildren();

  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const margin = 2;
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

    function recompute(): void {
      // 설정이 바뀌면 진행 중이던 계산은 전부 stale 이다. tick() 이 이 값을 읽어
      // 자기 세대가 최신인지 확인한다.
      generation++;

      // otpauth URI 를 비밀키 칸에 통째로 붙여넣는 것이 가장 흔한 사용법이다.
      if (secret.value.trim().toLowerCase().startsWith('otpauth://')) {
        const parsedUri = parseOtpauthUri(secret.value);
        if (parsedUri.ok) {
          const config = parsedUri.value;
          secret.value = config.secret;
          issuerField.input.value = config.issuer;
          accountField.input.value = config.account;
          algorithmSelect.value = config.algorithm;
          digitsSelect.value = String(config.digits);
          periodSelect.value = String(config.period);
        } else {
          error.textContent = parsedUri.error;
          clearResults();
          return;
        }
      }

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
      renderQr(qrHost, uri.value);
      qrNote.textContent =
        '이 QR 안에 비밀키가 그대로 들어 있습니다. 화면 캡처를 공유하면 비밀키를 공유하는 것과 같습니다.';

      const decoded = decodeBase32(config.secret);
      if (!decoded.ok) return;

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

      void checkVerification(gen, config, bytes);
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

    const inputs = [secret, issuerField.input, accountField.input, verifyField.input];
    const selects = [algorithmSelect, digitsSelect, periodSelect];
    for (const input of inputs) input.addEventListener('input', recompute);
    for (const select of selects) select.addEventListener('change', recompute);

    // 코드는 시간이 지나면 바뀐다. 화면에 옛 코드를 남겨 두지 않는다.
    ticker = window.setInterval(tick, 1000);

    recompute();

    return () => {
      generation++; // 언마운트 후 도착하는 계산도 stale 로 취급한다
      if (ticker !== null) window.clearInterval(ticker);
      for (const input of inputs) input.removeEventListener('input', recompute);
      for (const select of selects) select.removeEventListener('change', recompute);
      // 비밀키를 DOM 에 남기지 않는다.
      secret.value = '';
      verifyField.input.value = '';
      codeList.destroy();
      wrap.remove();
    };
  },
};

export default mod;
