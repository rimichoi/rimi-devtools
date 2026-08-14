# rimi devtools

개발할 때 쓰는 유틸리티 모음. **모든 연산이 브라우저 안에서만 일어난다.**

## 왜 만들었나

JSON 포맷터, SQL 포맷터, base64 디코더 같은 도구를 쓸 때마다 운영 payload, 쿼리,
토큰을 외부 사이트에 붙여넣게 된다. 그 사이트들이 데이터를 서버로 보내지 않는다고
적어 두어도 확인할 방법이 없다.

이 사이트는 확인할 수 있게 만들었다.

## 데이터가 나가지 않는다는 근거

주장이 아니라 확인할 수 있는 세 가지다.

1. **CSP 로 막혀 있다.** `connect-src 'self'` 라서 외부 도메인으로 향하는
   fetch/XHR/WebSocket 은 브라우저가 거부한다. `form-action 'none'` 으로 폼 제출을
   통한 우회도 막았다. 어디에 배포하든 항상 적용되는 것은 `index.html` 의 CSP
   meta 태그이고, `public/_headers` 는 Netlify 에 배포됐을 때 같은 정책을 응답
   헤더로 한 번 더 내보낸다(여기에만 `frame-ancestors 'none'` 이 더 붙는다 —
   meta 태그에서는 스펙상 무시되는 directive 라서다). 둘 다, 그리고 둘이 서로
   어긋나지 않는지까지 `e2e/csp.spec.ts` 가 매 CI 마다 검사한다.
2. **CI 가 매번 검사한다.** `e2e/no-egress.spec.ts` 가 모든 도구를 열고 데이터를
   입력한 뒤, 자기 오리진 밖으로 나간 요청이나 CSP 위반이 하나라도 있으면 빌드를
   실패시킨다. 누군가 실수로 CDN 폰트를 추가해도 여기서 걸린다.
3. **입력값을 저장하지 않는다.** localStorage 에 들어가는 것은 테마, 즐겨찾기,
   최근 사용 도구 id 뿐이다. `src/shell/prefs.ts` 가 전부다.

직접 확인하려면 개발자 도구 Network 탭을 열어 두고 아무 도구나 써보면 된다.

## 도구 목록

JSON 포맷 / JSON 비교 / SQL 포맷 / Epoch 변환 / Base64 / URL 인코딩 /
글자수 세기 / 백분율 계산 / 시간·날짜 계산 / EXIF 보기

`Cmd+K` (윈도우는 `Ctrl+K`) 로 바로 이동할 수 있다.

## 오프라인에서도 된다

한 번 방문하면 전체가 캐시된다. 인터넷이 없어도, 사이트가 내려가도 그대로 쓸 수 있다.

## 알아둘 점

- **JSON 의 64비트 정수**: JavaScript 는 `9007199254740991` 을 넘는 정수를 정확히
  다루지 못한다. Long 타입 ID 가 들어오면 값이 바뀌는데, 이 경우 결과 아래에 경고를
  띄운다. 다른 JSON 포맷터는 대부분 조용히 틀린 값을 보여준다.
- **EXIF 의 GPS**: 사진에 촬영 위치가 들어 있으면 경고한다. 지도로 보여주지는
  않는다. 외부 요청이 되기 때문이다.

## 개발

**Node 22.12 이상**이 필요하다. Vite 8 이 요구하는 하한이 22.12 이고, 그보다
낮은 버전에서는 의존성 안쪽에서 module resolution 이나 syntax 오류가 나면서
원인이 Node 버전이라는 신호가 전혀 뜨지 않는다. `package.json` 의 `engines` 가
같은 값(`>=22.12`)을 선언하고 있어 `npm install` 이 먼저 경고해 준다.
CI 와 Netlify 는 22 계열 최신을 쓴다.

```bash
npm install
npm run dev          # 개발 서버
npm test             # 타입 검사 + 단위 + E2E
```

### 도구 추가하기

1. `src/tools/<id>/logic.ts` — 순수 함수. DOM 을 쓰지 않는다.
2. `src/tools/<id>/logic.test.ts` — 테스트를 먼저 쓴다.
3. `src/tools/<id>/index.ts` — `ToolModule` 을 default export 한다.
4. `src/registry.ts` 에 한 줄 등록한다.
5. `e2e/tools.ts` 의 `SAMPLE_INPUT` 에 샘플 입력을 넣는다.

사이드바, 커맨드 팔레트, E2E 테스트는 레지스트리를 보므로 따로 손댈 것이 없다.

**규칙 두 가지만 지키면 된다.** 외부 네트워크 요청을 넣지 않는다. 사용자 입력을
저장하지 않는다.
