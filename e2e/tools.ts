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
 */
export type SampleInput =
  | { kind: 'text'; values: string[] }
  | { kind: 'file'; path: string; settledSelector: string }
  | { kind: 'none' };

export const SAMPLE_INPUT: Record<string, SampleInput> = {
  'json-format': { kind: 'text', values: ['{"id":1,"name":"다우","tags":["a","b"]}'] },
  'sql-format': { kind: 'text', values: ['select a,b from t where a=1'] },
  base64: { kind: 'text', values: ['안녕하세요'] },
  'url-encode': { kind: 'text', values: ['https://a.com/b?q=한글 검색'] },
  // 이 값은 네 결과 패널을 **전부** 채워야 한다. 평범한 한글 문장만 넣으면
  // 'EUC-KR 로 표현할 수 없는 문자' 와 '보이지 않는 문자' 패널이 빈 안내 문구로
  // 남아서, 그 목록의 행 색이 대비 측정에도 좁은 화면 검사에도 한 번도 걸리지
  // 않는다. 제로폭 공백(U+200B)과 이모지를 섞어 두 패널 모두 행이 생기게 한다.
  'text-count': { kind: 'text', values: ['안녕하세요\u200B 반갑습니다 \u{1F600}'] },
  percent: { kind: 'text', values: ['25', '200'] },
  epoch: { kind: 'text', values: ['1700000000'] },
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
};

export function sampleFor(id: string): SampleInput {
  return SAMPLE_INPUT[id] ?? { kind: 'text', values: ['test'] };
}
