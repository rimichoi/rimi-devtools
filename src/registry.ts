import type { Tool } from './types';

export const tools: Tool[] = [
  {
    id: 'json-format',
    name: 'JSON 포맷',
    description: 'JSON 을 읽기 좋게 정렬하거나 한 줄로 압축한다. 64비트 정수 정밀도 손실도 함께 알려준다.',
    keywords: ['json', '포맷', 'format', 'pretty', '정렬', '압축', 'minify', 'viewer'],
    category: 'format',
    load: () => import('./tools/json-format/index').then((m) => m.default),
  },
  {
    id: 'sql-format',
    name: 'SQL 포맷',
    description: 'SQL 을 방언에 맞게 줄바꿈하고 키워드 대소문자를 정리한다.',
    keywords: ['sql', '포맷', 'format', '쿼리', 'query', 'oracle', '정렬'],
    category: 'format',
    load: () => import('./tools/sql-format/index').then((m) => m.default),
  },
  {
    id: 'base64',
    name: 'Base64',
    description: '텍스트와 Base64 사이를 변환한다. UTF-8 한글도 그대로 처리한다.',
    keywords: ['base64', 'b64', '인코딩', '디코딩', 'encode', 'decode'],
    category: 'encode',
    load: () => import('./tools/base64/index').then((m) => m.default),
  },
  {
    id: 'url-encode',
    name: 'URL 인코딩',
    description: 'URL 과 쿼리 값을 퍼센트 인코딩하거나 원래대로 되돌린다.',
    keywords: ['url', 'uri', '퍼센트', 'percent', '인코딩', 'encode', 'decode'],
    category: 'encode',
    load: () => import('./tools/url-encode/index').then((m) => m.default),
  },
  {
    id: 'text-count',
    name: '글자수 세기',
    description:
      '글자수를 자소·코드포인트·UTF-16·UTF-8·EUC-KR 기준으로 함께 세고, 보이지 않는 문자를 찾아낸다.',
    keywords: [
      '글자수',
      '자소',
      '바이트',
      'count',
      'length',
      '텍스트',
      'euc-kr',
      'cp949',
      '제로폭',
      '공백',
      'invisible',
      'zwsp',
    ],
    category: 'calc',
    load: () => import('./tools/text-count/index').then((m) => m.default),
  },
  {
    id: 'percent',
    name: '백분율 계산',
    description: '비율, 증감률, 부분값 같은 백분율 계산을 한다.',
    keywords: ['백분율', '퍼센트', 'percent', '비율', '증감률', '계산'],
    category: 'calc',
    load: () => import('./tools/percent/index').then((m) => m.default),
  },
  {
    id: 'epoch',
    name: 'Epoch 변환',
    description: 'Unix 타임스탬프와 사람이 읽는 날짜를 UTC / KST 로 오간다.',
    keywords: ['epoch', 'unix', '타임스탬프', 'timestamp', '시간', '변환', 'utc', 'kst'],
    category: 'convert',
    load: () => import('./tools/epoch/index').then((m) => m.default),
  },
  {
    id: 'time-calc',
    name: '시간/날짜 계산',
    description: '시간을 더하고 빼거나, 두 날짜 사이 일수를 센다.',
    keywords: ['시간', '날짜', '계산', 'time', 'date', '일수', 'diff', 'd-day'],
    category: 'calc',
    load: () => import('./tools/time-calc/index').then((m) => m.default),
  },
  {
    id: 'json-diff',
    name: 'JSON 비교',
    description: '두 JSON 을 비교해 달라진 부분만 뽑아 보여준다.',
    keywords: ['json', 'diff', '비교', '차이', 'compare'],
    category: 'format',
    load: () => import('./tools/json-diff/index').then((m) => m.default),
  },
  {
    id: 'exif',
    name: 'EXIF 보기',
    description: '사진의 EXIF 메타데이터를 읽고, 촬영 위치(GPS)가 들어 있으면 경고한다.',
    keywords: ['exif', '이미지', '사진', '메타데이터', 'gps', 'metadata'],
    category: 'file',
    load: () => import('./tools/exif/index').then((m) => m.default),
  },
  {
    id: 'jasypt',
    name: 'Jasypt 복호화',
    description:
      'Spring 설정의 ENC(...) 값을 마스터 비밀번호로 풀거나 새로 만든다. PBEWithMD5AndDES 를 브라우저에서 계산한다.',
    keywords: ['jasypt', 'enc', '복호화', '암호화', 'decrypt', 'encrypt', 'pbe', 'des', 'spring', '설정'],
    category: 'encode',
    load: () => import('./tools/jasypt/index').then((m) => m.default),
  },
  {
    id: 'jwt',
    name: 'JWT 디코더',
    description:
      'JWT 의 헤더와 페이로드를 풀어 보고, 만료 시각과 위험 신호를 함께 알려준다. 비밀키를 넣으면 HS256 서명까지 검증한다.',
    keywords: ['jwt', 'token', '토큰', '디코더', 'decode', 'jws', 'bearer', 'exp', '서명'],
    category: 'encode',
    load: () => import('./tools/jwt/index').then((m) => m.default),
  },
  {
    id: 'cron',
    name: '크론 해석',
    description:
      '크론 표현식을 사람이 읽는 말로 풀고 다음 실행 시각을 보여준다. Spring 6필드와 표준 crontab 5필드를 모두 읽는다.',
    keywords: ['cron', '크론', '스케줄', 'schedule', 'quartz', 'spring', '배치', 'batch', '주기'],
    category: 'calc',
    load: () => import('./tools/cron/index').then((m) => m.default),
  },
  {
    id: 'chmod',
    name: 'chmod 권한',
    description:
      '8진수와 rwx 표기를 서로 바꾸고, 누가 무엇을 할 수 있는지와 위험한 설정을 알려준다. setuid · setgid · sticky 도 함께 읽는다.',
    keywords: ['chmod', '권한', 'permission', '755', '644', 'rwx', 'setuid', 'sticky', '8진수', 'octal'],
    category: 'calc',
    load: () => import('./tools/chmod/index').then((m) => m.default),
  },
];

export function findTool(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}
