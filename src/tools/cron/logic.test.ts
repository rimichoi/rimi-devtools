import { describe, it, expect } from 'vitest';
import { parseCron, nextRuns, formatKst, formatUtc } from './logic';
import { SPRING_VECTORS } from './vectors';

/*
 * 기대값은 상수에서 가져오지 않고 리터럴로 적는다. 예외는 SPRING_VECTORS 하나인데,
 * 그건 내가 지어낸 값이 아니라 **실제 Spring 5.3.19 라이브러리가 낸 출력**이라
 * 오라클로서 의미가 있다(tools/cron-vectors/README.md 참고). 구현이 그 값에
 * 맞춰지는 게 목적이므로 상수 대 상수 비교가 아니다.
 */

/*
 * 'YYYY-MM-DDTHH:MM:SS' (KST) → epoch ms.
 *
 * **구현의 KST_OFFSET_MS 를 쓰지 않는다.** 그걸 쓰면 기준 시각을 만들 때와 결과를
 * 읽을 때 같은 상수가 양쪽에서 상쇄되어, 오프셋이 9시간이든 0이든 88개 벡터가
 * 전부 통과한다(실제로 그랬다 — mutation 으로 발견했다). 여기서는 '+09:00' 을
 * 리터럴로 적어 구현과 독립된 오라클로 둔다.
 */
function kst(civil: string): number {
  const at = Date.parse(`${civil}+09:00`);
  if (Number.isNaN(at)) throw new Error(`시각 형식이 아니다: ${civil}`);
  return at;
}

function parsed(expr: string) {
  const result = parseCron(expr);
  if (!result.ok) throw new Error(`파싱 실패: ${result.error}`);
  if (result.value.kind !== 'parsed') throw new Error(`parsed 가 아니라 ${result.value.kind} 였다`);
  return result.value;
}

function runs(expr: string, base: string, count = 3): string[] {
  return nextRuns(parsed(expr), kst(base), count).runs.map(formatKst);
}

describe('시각 표기', () => {
  /*
   * 오프셋을 리터럴로 못 박는다. 구현 상수를 참조하면 어떤 값이든 통과한다.
   */
  it('epoch 0 은 KST 로 1970-01-01 09:00:00 이다', () => {
    expect(formatKst(0)).toBe('1970-01-01T09:00:00');
  });

  it('epoch 0 은 UTC 로 1970-01-01 00:00:00 이다', () => {
    expect(formatUtc(0)).toBe('1970-01-01T00:00:00');
  });

  it('KST 표기와 UTC 표기는 같은 순간에 대해 9시간 차이다', () => {
    // 2026-08-24 13:45:30 UTC
    const at = Date.parse('2026-08-24T13:45:30Z');
    expect(formatUtc(at)).toBe('2026-08-24T13:45:30');
    expect(formatKst(at)).toBe('2026-08-24T22:45:30');
  });
});

describe('parseCron — 방언 판별', () => {
  it('6필드는 Spring 으로 읽는다', () => {
    expect(parsed('0 0 8 * * *').dialect).toBe('spring6');
  });

  it('5필드는 표준 crontab 으로 읽는다', () => {
    expect(parsed('0 8 * * *').dialect).toBe('crontab5');
  });

  it('공백이 여러 칸이어도 필드로 나눈다', () => {
    expect(parsed('0   0    8 * * *').dialect).toBe('spring6');
  });

  it('앞뒤 공백을 잘라낸다', () => {
    expect(parsed('  0 0 8 * * *  ').dialect).toBe('spring6');
  });

  it('빈 입력은 오류가 아니라 빈 결과다', () => {
    const result = parseCron('');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe('empty');
  });

  it('필드가 4개면 오류다', () => {
    expect(parseCron('0 8 * *').ok).toBe(false);
  });

  it('필드가 7개(Quartz 의 연도 필드)면 그렇다고 말한다', () => {
    const result = parseCron('0 0 8 * * ? 2026');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('필드가 7개입니다. Quartz 의 연도 필드는 지원하지 않습니다.');
  });
});

describe('parseCron — 지원하지 않는 것을 조용히 넘기지 않는다', () => {
  it('L 을 지원하지 않는다고 말한다', () => {
    const result = parseCron('0 0 12 L * *');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('L · W · # 는 지원하지 않습니다. 일 필드의 "L" 을 다르게 적어 주세요.');
    }
  });

  it('# 을 지원하지 않는다고 말한다', () => {
    const result = parseCron('0 0 12 ? * 2#1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('L · W · # 는 지원하지 않습니다. 요일 필드의 "2#1" 을 다르게 적어 주세요.');
    }
  });

  it('범위를 벗어난 값은 오류다', () => {
    expect(parseCron('0 0 25 * * *').ok).toBe(false);
    expect(parseCron('0 60 * * * *').ok).toBe(false);
    expect(parseCron('0 0 0 32 * *').ok).toBe(false);
    expect(parseCron('0 0 0 * 13 *').ok).toBe(false);
    expect(parseCron('0 0 0 * * 8').ok).toBe(false);
  });

  it('알 수 없는 이름은 오류다', () => {
    expect(parseCron('0 0 0 * * FUNDAY').ok).toBe(false);
    expect(parseCron('0 0 0 * SMARCH *').ok).toBe(false);
  });

  it('거꾸로 된 범위는 오류다', () => {
    expect(parseCron('0 0 18-9 * * *').ok).toBe(false);
  });

  it('스텝이 0 이면 오류다', () => {
    expect(parseCron('0 */0 * * * *').ok).toBe(false);
  });
});

describe('parseCron — 필드 해석', () => {
  it('앞자리 0 을 그대로 읽는다 (사내 표현식에 08, 05 가 실제로 있다)', () => {
    const value = parsed('0 05 09 * * *');
    expect(value.fields.find((f) => f.key === 'hour')?.values).toEqual([9]);
    expect(value.fields.find((f) => f.key === 'minute')?.values).toEqual([5]);
  });

  it('요일 0 과 7 을 모두 일요일로 읽는다', () => {
    expect(parsed('0 0 12 * * 0').fields.find((f) => f.key === 'dow')?.values).toEqual([0]);
    expect(parsed('0 0 12 * * 7').fields.find((f) => f.key === 'dow')?.values).toEqual([0]);
    expect(parsed('0 0 12 * * SUN').fields.find((f) => f.key === 'dow')?.values).toEqual([0]);
  });

  it('요일 이름은 대소문자를 가리지 않는다', () => {
    expect(parsed('0 0 12 * * mon').fields.find((f) => f.key === 'dow')?.values).toEqual([1]);
  });

  it('? 는 * 와 같게 읽고, 제한으로 세지 않는다', () => {
    const dom = parsed('0 0 12 ? * MON').fields.find((f) => f.key === 'dom');
    expect(dom?.restricted).toBe(false);
  });

  it('범위와 목록과 스텝을 편다', () => {
    expect(parsed('0 10-20/5 * * * *').fields.find((f) => f.key === 'minute')?.values).toEqual([10, 15, 20]);
    expect(parsed('0 0 6,18 * * *').fields.find((f) => f.key === 'hour')?.values).toEqual([6, 18]);
    expect(parsed('0 0/15 * * * *').fields.find((f) => f.key === 'minute')?.values).toEqual([0, 15, 30, 45]);
  });

  it('5필드에는 초 필드가 없고 매분 0초에 돈다', () => {
    const value = parsed('30 8 * * *');
    expect(value.fields.map((f) => f.key)).toEqual(['minute', 'hour', 'dom', 'month', 'dow']);
    expect(value.secondValues).toEqual([0]);
  });
});

describe('nextRuns — Spring 실물이 낸 값과 일치한다', () => {
  /*
   * 이 프로젝트에서 가장 중요한 단언이다. 크론 해석은 구현체마다 조용히 다르고,
   * 틀려도 화면은 그럴듯한 시각을 보여준다.
   */
  for (const vector of SPRING_VECTORS) {
    it(`${vector.expr}  (기준 ${vector.base})`, () => {
      expect(runs(vector.expr, vector.base, vector.next.length)).toEqual([...vector.next]);
    });
  }
});

describe('nextRuns — 일과 요일이 둘 다 제한된 경우', () => {
  /*
   * 방언이 갈리는 지점이다. Spring 6필드는 AND(둘 다 맞아야), POSIX crontab
   * 5필드는 OR(하나만 맞아도)이다. 실측으로 확인했다 —
   * tools/cron-vectors/README.md 참고.
   */
  it('Spring 6필드는 1일이면서 월요일인 날만 잡는다 (AND)', () => {
    // 2026-01-01 은 1일이지만 목요일이라 건너뛴다.
    expect(runs('0 0 12 1 * MON', '2026-01-01T00:00:00')).toEqual([
      '2026-06-01T12:00:00',
      '2027-02-01T12:00:00',
      '2027-03-01T12:00:00',
    ]);
  });

  it('표준 crontab 5필드는 1일이거나 월요일이면 잡는다 (OR)', () => {
    // 2026-01-01(목, 1일) → 1일이라서 잡힌다. 2026-01-05 는 월요일이라 잡힌다.
    expect(runs('0 12 1 * MON', '2026-01-01T00:00:00')).toEqual([
      '2026-01-01T12:00:00',
      '2026-01-05T12:00:00',
      '2026-01-12T12:00:00',
    ]);
  });

  it('한쪽만 제한되면 5필드도 6필드도 같은 답을 낸다', () => {
    expect(runs('0 12 * * MON', '2026-01-01T00:00:00')).toEqual([
      '2026-01-05T12:00:00',
      '2026-01-12T12:00:00',
      '2026-01-19T12:00:00',
    ]);
  });

  it('둘 다 제한되면 방언이 갈린다고 위험 경고를 낸다', () => {
    const warning = parsed('0 0 12 1 * MON').warnings.find((w) => w.severity === 'danger');
    expect(warning?.message).toBe(
      '일과 요일이 둘 다 지정됐습니다. Spring(6필드)은 둘 다 맞는 날에만 실행하고, 표준 crontab(5필드)은 둘 중 하나만 맞아도 실행합니다. 여기서는 Spring 규칙으로 계산했습니다.',
    );
  });

  it('한쪽만 제한되면 그 경고를 내지 않는다', () => {
    expect(parsed('0 0 12 * * MON').warnings.filter((w) => w.severity === 'danger')).toEqual([]);
  });
});

describe('nextRuns — 경계', () => {
  it('기준 시각과 정확히 같은 시각은 내놓지 않는다 (다음 실행이다)', () => {
    expect(runs('0 0 8 * * *', '2026-01-01T08:00:00', 1)).toEqual(['2026-01-02T08:00:00']);
  });

  it('1초 전이면 그 시각을 내놓는다', () => {
    expect(runs('0 0 8 * * *', '2026-01-01T07:59:59', 1)).toEqual(['2026-01-01T08:00:00']);
  });

  it('윤년 2월 29일은 윤년만 잡는다', () => {
    expect(runs('0 0 0 29 2 *', '2026-01-01T00:00:00')).toEqual([
      '2028-02-29T00:00:00',
      '2032-02-29T00:00:00',
      '2036-02-29T00:00:00',
    ]);
  });

  it('31일은 31일이 있는 달만 잡는다', () => {
    expect(runs('0 0 0 31 * *', '2026-01-01T00:00:00')).toEqual([
      '2026-01-31T00:00:00',
      '2026-03-31T00:00:00',
      '2026-05-31T00:00:00',
    ]);
  });

  it('영원히 오지 않는 날짜는 빈 목록을 돌려주고 불가능이라고 말한다 (2월 30일)', () => {
    const result = nextRuns(parsed('0 0 0 30 2 *'), kst('2026-01-01T00:00:00'), 3);
    expect(result.runs).toEqual([]);
    expect(result.impossible).toBe(true);
    expect(result.truncated).toBe(false);
  });

  /*
   * 교차 리뷰(sonnet)가 잡은 결함의 회귀 가드. 탐색 간격을 9년으로 뒀을 때,
   * 일·월·요일이 함께 제한된 멀쩡한 표현식이 "실행되지 않습니다" 로 나왔다.
   * 1900~2400년 구간의 모든 (월, 일, 요일) 조합을 훑어 최악 간격을 재보니
   * 40년이었다(2월 29일이면서 특정 요일).
   *
   * 아래 기대값은 내가 지어낸 것이 아니라 Spring 5.3.19 CronExpression 에
   * 직접 물어본 답이다.
   */
  it('일·월·요일이 함께 제한돼 12년 뒤에나 도는 표현식도 찾아낸다', () => {
    expect(runs('0 0 9 1 1 MON', '2091-06-01T00:00:00')).toEqual([
      '2103-01-01T09:00:00',
      '2114-01-01T09:00:00',
      '2120-01-01T09:00:00',
    ]);
  });

  it('2월 29일이면서 월요일 — 간격이 40년까지 벌어져도 찾아낸다', () => {
    expect(runs('0 0 0 29 2 MON', '2000-01-01T00:00:00')).toEqual([
      '2016-02-29T00:00:00',
      '2044-02-29T00:00:00',
      '2072-02-29T00:00:00',
    ]);
  });

  it('그 표현식은 불가능도 잘림도 아니다 — 실제로 도는 배치다', () => {
    const result = nextRuns(parsed('0 0 9 1 1 MON'), kst('2091-06-01T00:00:00'), 3);
    expect(result.impossible).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('4월 31일처럼 그 달에 없는 날도 불가능이다', () => {
    expect(nextRuns(parsed('0 0 0 31 4 *'), kst('2026-01-01T00:00:00'), 3).impossible).toBe(true);
  });

  it('31일이 있는 달이 하나라도 있으면 불가능이 아니다', () => {
    expect(nextRuns(parsed('0 0 0 31 4,5 *'), kst('2026-01-01T00:00:00'), 1).impossible).toBe(false);
  });

  it('연말을 넘어간다', () => {
    expect(runs('0 0 0 1 1 *', '2026-08-24T13:45:30', 2)).toEqual([
      '2027-01-01T00:00:00',
      '2028-01-01T00:00:00',
    ]);
  });
});

describe('설명 문구', () => {
  it('매일 같은 시각이면 그렇게 말한다', () => {
    expect(parsed('0 5 9 * * *').summary).toBe('매일 09:05:00');
  });

  it('요일이 지정되면 매주로 말한다', () => {
    expect(parsed('0 0 12 * * MON').summary).toBe('매주 월요일 12:00:00');
  });

  it('일자가 지정되면 매월로 말한다', () => {
    expect(parsed('0 0 9 8,13,21 * *').summary).toBe('매월 8, 13, 21일 09:00:00');
  });

  it('초 단위 반복은 시각 하나로 뭉치지 않는다', () => {
    expect(parsed('0 */5 * * * *').summary).toBe('매일 매시 5분마다 0초');
  });

  it('월이 지정되면 앞에 붙는다', () => {
    expect(parsed('0 0 0 1 1 *').summary).toBe('매년 1월 1일 00:00:00');
  });
});

describe('교차 리뷰(opus)가 지목한 사각지대', () => {
  /*
   * H1. 이 도구의 존재 이유가 AND/OR 문구인데, 그 문구를 재는 단언이 없었다.
   * spring6 의 "이면서" 를 crontab5 의 "또는" 으로 바꿔도 전 테스트가 통과했다.
   */
  it('Spring 6필드의 요약은 둘 다 맞아야 한다고 말한다', () => {
    expect(parsed('0 0 12 1 * MON').summary).toBe('매월 1일이면서 월요일인 날 12:00:00');
  });

  it('표준 crontab 5필드의 요약은 둘 중 하나라고 말한다', () => {
    expect(parsed('0 12 1 * MON').summary).toBe('매월 1일 또는 월요일 12:00:00');
  });

  /*
   * B3. 월이 지정되는 순간 요약이 요일 조건을 통째로 버렸다. 실행 목록은 AND 로
   * 맞게 나오는데 요약만 틀려서 화면 안에서 자기모순이었다.
   */
  it('월이 지정돼도 요일 조건을 요약에서 버리지 않는다', () => {
    expect(parsed('0 0 12 1 1 MON').summary).toBe('매년 1월 1일이면서 월요일인 날 12:00:00');
  });

  it('월 + 요일만 지정된 경우도 요일이 남는다', () => {
    expect(parsed('0 0 12 * 1 MON').summary).toBe('매년 1월 월요일 12:00:00');
  });

  /*
   * H3. `W` 를 거절한다는 주장을 재는 단언이 L 과 # 뿐이었다. 정규식에서 W 를
   * 빼도 전 테스트가 통과했다.
   */
  it('일 필드의 15W 를 거절한다', () => {
    const result = parseCron('0 0 12 15W * *');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('L · W · # 는 지원하지 않습니다');
  });

  it('LW 를 거절한다', () => {
    expect(parseCron('0 0 12 LW * *').ok).toBe(false);
  });

  it('요일 필드의 5L 을 거절한다', () => {
    expect(parseCron('0 0 12 * * 5L').ok).toBe(false);
  });

  /* H5. 0개를 요청했는데 1개를 돌려줘도 아무도 몰랐다. */
  it('0개를 요청하면 0개를 돌려준다', () => {
    expect(nextRuns(parsed('0 0 8 * * *'), kst('2026-01-01T00:00:00'), 0).runs).toEqual([]);
  });

  it('음수를 요청해도 0개를 돌려준다', () => {
    expect(nextRuns(parsed('0 0 8 * * *'), kst('2026-01-01T00:00:00'), -3).runs).toEqual([]);
  });

  /*
   * S2. 표준 crontab 의 OR 규칙은 "값이 제한됐는가" 가 아니라 "필드 첫 글자가
   * `*` 인가" 로 갈린다(Vixie 의 DOM_STAR / DOW_STAR). 그래서 일 필드가
   * 와일드카드+스텝이면 OR 이 아니라 AND 다.
   */
  it('5필드에서 일 필드가 와일드카드+스텝이면 OR 이 아니라 AND 다', () => {
    // 홀수일 "이면서" 월요일. OR 이었다면 홀수일이 전부 나온다.
    expect(runs('0 12 */2 * MON', '2026-01-01T00:00:00')).toEqual([
      '2026-01-05T12:00:00',
      '2026-01-19T12:00:00',
      '2026-02-09T12:00:00',
    ]);
  });

  it('그 경우에는 방언이 갈린다는 경고도 내지 않는다', () => {
    expect(parsed('0 12 */2 * MON').warnings).toEqual([]);
    expect(parsed('0 0 12 */2 * MON').warnings).toEqual([]);
  });
});

describe('요일 규격 — Spring 실측으로 확정한 것', () => {
  /*
   * 처음엔 SUN=0 으로 적었고 흔한 표현식은 우연히 맞았다. 아래는 어긋났던 셋이다.
   * 기대값은 전부 Spring 5.3.19 에 직접 물어본 답이다(vectors.ts 에도 들어 있다).
   */
  it('요일 이름은 SUN=7 이라 SAT-SUN 이 거꾸로가 아니다', () => {
    expect(parsed('0 0 0 * * SAT-SUN').fields.find((f) => f.key === 'dow')?.values).toEqual([0, 6]);
  });

  it('MON-SUN 은 1-7, 곧 모든 요일이다', () => {
    expect(parsed('0 0 0 * * MON-SUN').fields.find((f) => f.key === 'dow')?.values).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('와일드카드는 0-7 이 아니라 1-7 로 펼쳐진다', () => {
    // 1,3,5,7 = 월·수·금·일. 0-7 로 펼치면 일·화·목·토가 되어 전부 어긋난다.
    expect(parsed('0 0 0 * * */2').fields.find((f) => f.key === 'dow')?.values).toEqual([0, 1, 3, 5]);
  });

  it('범위의 시작이 7이면 0으로 낮춘다 — 7-7 은 매일이다', () => {
    expect(parsed('0 0 0 * * 7-7').fields.find((f) => f.key === 'dow')?.values).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('7-0 은 일요일 하나다', () => {
    expect(parsed('0 0 0 * * 7-0').fields.find((f) => f.key === 'dow')?.values).toEqual([0]);
  });

  it('0/2 는 와일드카드와 달리 0부터 시작한다', () => {
    // 0,2,4,6 = 일·화·목·토
    expect(parsed('0 0 0 * * 0/2').fields.find((f) => f.key === 'dow')?.values).toEqual([0, 2, 4, 6]);
  });
});

describe('? 는 일·요일 필드에서만 쓸 수 있다', () => {
  /* Spring 실측: 나머지 필드의 ? 는 파싱 오류다. 조용히 받아주면 "잘 돈다" 는 틀린 신호가 된다. */
  it('분 필드의 ? 를 거절한다', () => {
    const result = parseCron('0 ? 12 * * *');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('? 는 일·요일 필드에서만 쓸 수 있습니다. 분 필드에는 * 를 쓰세요.');
  });

  it('월 필드의 ? 를 거절한다 — Quartz 습관으로 가장 흔한 실수다', () => {
    expect(parseCron('0 0 12 * ? *').ok).toBe(false);
  });

  it('초·시 필드의 ? 도 거절한다', () => {
    expect(parseCron('? 0 12 * * *').ok).toBe(false);
    expect(parseCron('0 0 ? * * *').ok).toBe(false);
  });

  it('? 에 간격을 붙이면 거절한다', () => {
    expect(parseCron('0 0 0 * * ?/2').ok).toBe(false);
  });

  it('일·요일 필드의 ? 는 그대로 받는다', () => {
    expect(parseCron('0 0 12 ? * MON').ok).toBe(true);
    expect(parseCron('0 0 12 * * ?').ok).toBe(true);
  });
});
