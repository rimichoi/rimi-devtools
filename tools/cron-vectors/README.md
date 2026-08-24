# Spring cron 검증 벡터

`src/tools/cron/vectors.ts` 의 값이 어디서 왔는지 남긴다. 손으로 적은 값이 아니라
**실제 Spring Framework 라이브러리가 낸 출력**이다.

## 왜 필요한가

크론 표현식은 구현체마다 조용히 다르게 해석된다. 가장 위험한 차이는 **일(day-of-month)과
요일(day-of-week)이 둘 다 제한됐을 때**다.

- **POSIX/Vixie crontab (5필드)**: 둘 중 **하나라도** 맞으면 실행한다 (OR).
- **Spring `CronExpression` (6필드)**: 둘 **다** 맞아야 실행한다 (AND).

실측으로 확인했다. `0 0 12 1 * MON` 을 Spring 에 물으면 2026-06-01, 2027-02-01,
2027-03-01, 2027-11-01 이 나온다 — 전부 **1일이면서 월요일**인 날이다. 2026-01-01 은
1일이지만 목요일이라 건너뛴다. OR 이었다면 매달 1일과 매주 월요일이 전부 나왔어야 한다.

추측으로 구현했다면 이 도구는 "이 배치 언제 도냐" 에 매번 틀린 답을 하고, 사용자는
그걸 믿었을 것이다. 그래서 벡터를 라이브러리에서 직접 뽑았다.

그 밖에 실측으로 확정한 것:
- 요일 숫자는 0-7 이고 **0 과 7 이 모두 일요일**이다. 1=월요일.
- `?` 는 `*` 와 같게 동작한다.
- Spring 5.3 은 `L` / `W` / `#` 를 지원한다. **이 도구는 지원하지 않는다** — 조용히
  틀리게 읽는 대신 지원하지 않는다고 말한다.

## 재생성

```bash
JDK=$HOME/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home
CP="$HOME/.m2/repository/org/springframework/spring-context/5.3.19/spring-context-5.3.19.jar:$HOME/.m2/repository/org/springframework/spring-core/5.3.19/spring-core-5.3.19.jar"
$JDK/bin/javac -cp "$CP" GenVec.java -d .
$JDK/bin/java -cp "$CP:." GenVec > ../../src/tools/cron/vectors.ts
```

- Spring Framework **5.3.19** (로컬 m2 캐시)
- JDK **temurin-21.0.11**
- 기준 시각대는 `Asia/Seoul`

## CI 는 Java 를 요구하지 않는다

Jasypt 벡터와 같은 규칙이다. 생성기는 저장소에 남기되 **테스트는 생성기에 의존하지
않는다** — 값은 `vectors.ts` 에 박아 두고 그것만 읽는다.
