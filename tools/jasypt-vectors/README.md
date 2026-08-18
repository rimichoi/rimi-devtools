# Jasypt 검증 벡터 생성기

`src/tools/jasypt/` 의 PBEWithMD5AndDES 구현이 대조하는 벡터를 만든 스크립트다.
**테스트가 이 스크립트에 의존하지 않는다** — 벡터는 `src/tools/jasypt/vectors.ts` 에
값으로 박혀 있고, 여기 있는 것은 그 값의 출처를 남기고 재생성할 수 있게 하기 위한 것이다.
따라서 CI 에는 Java 가 필요 없다.

## 왜 필요한가

이 도구는 잘못 암호화해도 화면상으로는 성공한 것처럼 보인다. 사용자는 그 값을 설정
파일에 넣고 운영 배포 시점에 터진다. 그래서 기대값을 손으로 적는 대신 **실제 라이브러리가
만든 출력**과 대조한다.

## 무엇을 확인한 규격인가

`~/REPO/BIZ`, `~/REPO/SAL`, `~/REPO/UFIT` 의 설정 파일 9개에서 확인한 팀의 실제 설정:

```
algorithm                = PBEWithMD5AndDES
key-obtention-iterations = 1000
salt-generator           = org.jasypt.salt.RandomSaltGenerator
string-output-type       = base64
iv-generator-classname   = org.jasypt.iv.NoIvGenerator
provider                 = SunJCE
```

## 실행

`jasypt-1.9.3.jar` 이 필요하다. Gradle/Maven 캐시에 이미 있으면 그걸 쓴다.

```bash
JAR=$(find ~/.m2/repository ~/.gradle/caches -name "jasypt-1.9.3.jar" | head -1)
JAVA=~/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home/bin/java

# 종단 벡터 (password / plaintext / ciphertext) — JSON 으로 출력
"$JAVA" -cp "$JAR" GenVectors.java

# 계층별 벡터 — DES 단일 블록 기지 답안 + PBKDF1-MD5 중간값
# jar 없이 JDK 만으로 돈다
"$JAVA" GenLayers.java
```

## GenLayers 가 스스로를 검증하는 방식

`GenLayers` 는 PBKDF1-MD5 를 직접 계산한 뒤, 그 결과로 나온 DES 키와 IV 를 SunJCE 의
raw `DES/CBC/PKCS5Padding` 에 넣어 **Jasypt 가 만든 암호문을 실제로 복호화한다.**
평문이 되돌아오면 중간값이 옳다는 뜻이다. `MATCHES JASYPT = true` 가 그 확인이다.

즉 여기서 나온 중간값은 "내가 이렇게 계산했다"가 아니라 "이 값이 실제로 동작한다"이다.

## 주의

출력에 들어가는 비밀번호와 평문은 전부 이 스크립트 안에 적힌 **예제 값**이다.
팀의 실제 마스터 키나 운영 설정값을 여기에 넣지 마라 — 저장소에 남는다.
