import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tools } from '../src/registry';

export const TOOL_IDS: string[] = tools.map((t) => t.id);

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * 도구가 받는 입력의 모양을 선언한다. 도구를 추가할 때 여기에도 추가한다.
 * - 'text': 텍스트 입력 필드(들)에 순서대로 채울 값. 필드를 찾지 못하면
 *   테스트가 실패한다 — "입력을 찾지 못해 그냥 지나감"이 조용히 통과하는 일을 막는다.
 * - 'file': 파일 입력을 받는 도구. `path` 의 파일을 실제로 올려서 도구의 처리
 *   경로를 구동한다. 파일 입력을 찾지 못하면 역시 실패한다. `settledSelector`
 *   가 화면에 나타날 때까지 기다린 뒤에야 요청을 판정한다 — 비동기 처리가
 *   끝나기도 전에 "요청 없음"으로 통과해 버리는 일을 막기 위한 것이다.
 * - 'none': 어떤 입력도 받지 않는 도구. 아무것도 구동하지 않고 통과하므로,
 *   실제로 입력이 있는 도구에 이걸 쓰면 가드가 통째로 무력해진다.
 *
 * `secret` 은 `<input type="password">` 에 채울 값이다. 텍스트 필드 셀렉터
 * (textarea / input[type=text] 계열)는 비밀번호 칸을 잡지 않으므로 — 잡게 만들면
 * 다른 도구의 값 순서가 밀린다 — 별도 항목으로 둔다. 선언한 도구인데 비밀번호
 * 칸을 못 찾으면 헬퍼가 실패한다(조용히 지나가지 않는다).
 */
export type SampleInput =
  | { kind: 'text'; values: string[]; secret?: string }
  | { kind: 'file'; path: string; settledSelector: string }
  | { kind: 'none' };

export const SAMPLE_INPUT: Record<string, SampleInput> = {
  'json-format': { kind: 'text', values: ['{"id":1,"name":"다우","tags":["a","b"]}'] },
  'sql-format': { kind: 'text', values: ['select a,b from t where a=1'] },
  /*
   * base64 / url-encode 는 한 화면에 독립된 두 세트(인코딩/디코딩)를 갖는다. 값이
   * 하나면 인코딩 세트만 구동되고 디코딩 세트는 빈 화면으로 남아, 그쪽 결과 카드의
   * 색도 좁은 화면 레이아웃도 한 번도 검사되지 않는다. 세트마다 하나씩 준다 —
   * 순서는 DOM 순서(인코딩 입력, 디코딩 입력)다.
   */
  base64: { kind: 'text', values: ['안녕하세요', '7JWI64WV7ZWY7IS47JqU'] },
  'url-encode': {
    kind: 'text',
    values: ['https://a.com/b?q=한글 검색', '%ED%95%9C%EA%B8%80%20%EA%B2%80%EC%83%89'],
  },
  // 이 값은 네 결과 패널을 **전부** 채워야 한다. 평범한 한글 문장만 넣으면
  // 'EUC-KR 로 표현할 수 없는 문자' 와 '보이지 않는 문자' 패널이 빈 안내 문구로
  // 남아서, 그 목록의 행 색이 대비 측정에도 좁은 화면 검사에도 한 번도 걸리지
  // 않는다. 제로폭 공백(U+200B)과 이모지를 섞어 두 패널 모두 행이 생기게 한다.
  'text-count': { kind: 'text', values: ['안녕하세요\u200B 반갑습니다 \u{1F600}'] },
  percent: { kind: 'text', values: ['25', '200'] },
  // epoch 도 두 방향이 독립된 폼이다. 값이 하나면 '날짜 → 타임스탬프' 쪽 결과
  // 목록이 빈 안내 문구로 남는다.
  epoch: { kind: 'text', values: ['1700000000', '2023-11-15 07:13:20'] },
  'time-calc': { kind: 'text', values: ['01:30:00', '00:45:30'] },
  'json-diff': { kind: 'text', values: ['{"a":1}', '{"a":2}'] },
  // exif 는 파일을 받는 유일한 도구다. 'none' 으로 선언돼 있던 동안에는 빈
  // 드롭존만 열어두고 지나가서, handleFile 안에 역지오코딩 fetch 를 심어도
  // 런타임 가드가 전부 초록색이었다(exifr 청크는 import 조차 되지 않았다).
  exif: {
    kind: 'file',
    path: join(FIXTURES, 'gps-sample.jpg'),
    // 메타데이터 표에 행이 생겼다는 것은 handleFile 의 async 경로가 끝까지
    // 돌았다는 뜻이다.
    settledSelector: '#tool-root .exif-table tr',
  },
  /*
   * jasypt 는 마스터 비밀번호가 없으면 두 결과 카드가 모두 빈 안내 문구로 남는다 —
   * 복호화 결과 textarea 도 암호화 결과 목록도 값이 없으므로, 결과 자리의 색과
   * 좁은 화면 레이아웃이 한 번도 검사되지 않는다. 그래서 `secret` 까지 채운다.
   * values 는 DOM 순서(복호화 입력, 암호화 입력)이고 둘 다 textarea 다.
   * 비밀번호 'test1!' + 이 암호문은 실제 Jasypt 1.9.3 출력이라 결과가 'root' 로 나온다.
   */
  jasypt: {
    kind: 'text',
    values: ['ENC(xYIzsUiigr3pQj5xO0KWvg==)', 'root'],
    secret: 'test1!',
  },
  /*
   * jwt 는 비밀키가 없으면 서명 검증 자리가 "비밀키를 입력하면…" 안내로만 남아,
   * 유효 판정의 색이 한 번도 검사되지 않는다. 그래서 secret 까지 채운다.
   * 이 토큰과 비밀키는 node:crypto 로 생성해 실행 검증한 벡터다(HS256, 서명 유효).
   */
  jwt: {
    kind: 'text',
    values: [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Iu2Zjeq4uOuPmSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.aQGiu-ZTHs_BwR6lFho9PK5PZezSt5yh65zWYeZZwYc',
    ],
    secret: 'your-256-bit-secret',
  },
  /*
   * cron 은 표현식이 없으면 결과 목록 둘이 모두 빈 안내 문구로 남아, 결과 자리의
   * 색과 좁은 화면 레이아웃이 한 번도 검사되지 않는다. 사내에서 실제로 쓰는
   * Spring 6필드 표현식을 준다.
   */
  cron: { kind: 'text', values: ['0 0 09 08,13,21 * *'] },
  /*
   * chmod 는 모드가 없으면 결과 목록 둘이 빈 안내 문구로 남는다. 특수 비트가 있는
   * 값을 줘서 요약·경고 자리의 색까지 검사되게 한다.
   */
  chmod: { kind: 'text', values: ['4755'] },
  /*
   * totp 는 비밀키와 계정이 둘 다 있어야 QR·URI·코드가 채워진다. 비밀키는
   * type=password 라 secret 항목으로, 발급자·계정은 text 입력이라 values 로 준다.
   * 이 비밀키는 RFC 6238 의 공개 테스트 seed 라 비밀이 아니다.
   */
  totp: {
    kind: 'text',
    values: ['다우오피스', 'rimichoi@daou.co.kr'],
    secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  },
};

export function sampleFor(id: string): SampleInput {
  return SAMPLE_INPUT[id] ?? { kind: 'text', values: ['test'] };
}
