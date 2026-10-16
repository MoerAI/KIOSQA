# KioskProof를 위한 GitHub QA 하네스 조사·검증

검토일: 2026-10-14, Asia/Seoul  
산출물: `KioskProof-PRD.md`의 기술 선택 및 검증 기준에 대한 근거  
검증 원칙: README 주장, 소스 구현, 공개 CI, 직접 실행 결과를 분리한다. GitHub 공개 저장소라고 재사용 가능한 오픈소스는 아니다.

## 1. 최종 결론

**기존 AI QA 앱을 그대로 포크하지 말고, Playwright Test를 검증 엔진으로 재사용하고 Gemini 분석·수정 루프를 얇게 얹는 방식이 가장 적합하다.**

- Playwright: 테스트 실행, 브라우저 제어, trace/report 등 핵심 기반으로 채택.
- Playwright Test Agents: planner/generator 분리 구조 참고. healer가 합격 기준을 바꾸도록 두지는 않음.
- Stagehand: 추후 자연어 탐색이 필요할 때 선택 의존성. 4시간 MVP에는 생략.
- Magnitude: 시각적 조작의 참고 사례. 통합 및 모델 호환 검증 부담 때문에 MVP 필수 의존성에서 제외.
- AI-Automation-QA-Engineer: 가장 비슷한 개념 사례이나 독점 라이선스 및 검증 결함으로 재사용 제외.

이 조사는 어느 전체 AI 자동수정 스택이 Gemini로 안정적으로 동작한다고 입증한 벤치마크가 아니다. 실제로 확인한 범위와 미확인 범위를 아래에 명시한다.

## 2. 사례 A: Microsoft Playwright + Test Agents

저장소: https://github.com/microsoft/playwright  
검토 소스: `ccd519ec3de6bf3f1339499fb234f5e969b33844`  
로컬 설치 패키지: `@playwright/test@1.64.1`, `dotenv@17.2.3`  
라이선스: Playwright 패키지의 Apache-2.0 LICENSE 확인. 개별 예제 package.json의 ISC 표기와 프로젝트 전체 라이선스 범위를 혼동하지 말 것.

### 무엇을 구현했나
공식 Test Agents는 planner, generator, healer로 나뉜다. planner가 테스트 계획을 작성하고 generator가 실행 가능한 Playwright 테스트를 만든다. healer는 실패한 테스트를 재생하고 selector, 대기 조건, 예상값 등을 바꾼다.

- [공식 설명](https://playwright.dev/docs/test-agents)
- [고정 커밋의 healer 정의](https://github.com/microsoft/playwright/blob/ccd519ec3de6bf3f1339499fb234f5e969b33844/packages/playwright/src/agents/playwright-test-healer.agent.md)
- [공식 TodoMVC 예제](https://github.com/microsoft/playwright/tree/ccd519ec3de6bf3f1339499fb234f5e969b33844/examples/todomvc)

### 중요한 차이
healer의 기본 임무는 **앱 버그 수정이 아니라 테스트 수정**이다. 공식 정의에는 assertion/expected value 변경과, 기능이 깨졌다고 판단하면 `test.fixme()`로 건너뛰는 지침도 있다. 이것은 테스트 유지보수 도구로는 이해할 수 있지만, 운영 규칙 위반을 고쳤다는 증거로 그대로 사용하면 안 된다.

KioskProof에서는 테스트 계약을 사람이 승인한 뒤 고정하고, AI가 앱 코드만 수정하게 해야 한다. 테스트 변경이 정말 필요하면 별도 승인·새 계약 버전·새 baseline이 필요하다.

### 직접 실행 결과
환경: macOS arm64, Node v26.5.0, npm 11.17.0.

1. 공식 TodoMVC 소스의 24개 테스트를 내려받아 읽고, 독립 임시 폴더에 패키지 설치. 프로젝트 구현 코드는 작성하지 않음.
2. 첫 실행: 24개 모두 브라우저 바이너리 부재로 시작 전 실패.
3. 전용 임시 경로에 해당 버전 Chromium headless shell과 FFmpeg 설치. 설치 명령은 성공.
4. 두 번째 실행: 24개 모두 브라우저 시작 단계에서 실패. 4개는 `Target page, context or browser has been closed`, 이후 20개는 실행 파일 없음. 초기 로그에는 프로세스 SIGKILL 및 종료 시도 EPERM이 보인다. 정확한 시스템 원인은 확정하지 않았다. 보안 설정을 해제하거나 우회하지 않았다.
5. 따라서 **전체 24개 테스트 통과를 확인하지 못했다.** 이는 24개의 제품 기능 버그가 발견됐다는 뜻도 아니다. 테스트 본문에 도달하기 전 실행 환경 오류다.
6. 별도로 플랫폼이 제공하는 브라우저에서 공식 TodoMVC 페이지를 실제 조작하고, 매 행동 후 accessibility snapshot으로 다음 6개 체크포인트를 확인했다.
   - 빈 입력으로 항목이 생성되지 않음.
   - `Buy groceries` 추가와 활성 항목 1개 표시.
   - 완료 체크 후 활성 항목 0개 표시.
   - 완료 취소 후 활성 항목 1개 표시.
   - 두 번째 항목 추가 후 활성 항목 2개 표시.
   - 완료 항목 삭제 후 미완료 `Walk the dog`만 남고 활성 항목 1개 표시.
7. 6개 체크포인트는 모두 확인됐다. 이것은 **지원 브라우저에서 수행한 순차 스모크 확인**이지, Playwright Test 러너 전체 통과나 AI planner/healer의 성공률 측정이 아니다. 생성한 테스트 항목은 끝에 정리했다.

추가 소스 관찰: `seed.spec.ts`는 초기화 목적의 빈 본문이며, `should-uncomplete-completed-todo.spec.ts`는 토글 동작 이후 명시적인 결과 assertion이 없다. 따라서 테스트 개수나 녹색 결과만으로 검증 강도를 판단하면 안 된다.

- [assertion이 없는 완료 취소 예제](https://github.com/microsoft/playwright/blob/ccd519ec3de6bf3f1339499fb234f5e969b33844/examples/todomvc/tests/completing-todos/should-uncomplete-completed-todo.spec.ts)
- [실행 대상 fixture](https://github.com/microsoft/playwright/blob/ccd519ec3de6bf3f1339499fb234f5e969b33844/examples/todomvc/tests/fixtures.ts)

### 판단
**핵심 기반으로 채택하되, 해커톤 제공 환경에서 브라우저 실행부터 확인.** 검증된 것은 API 키 없이 수행 가능한 일부 실행 흐름과 소스 구조다. 전체 제품·AI 수리 루프가 검증됐다는 의미는 아니다.

## 3. 사례 B: browserbase/stagehand

저장소: https://github.com/browserbase/stagehand  
검토 커밋: `1da7359172f1c057487b8918af118e389fe76615` (2026-10-13)  
SDK 패키지: 4.2.1  
라이선스: [MIT](https://github.com/browserbase/stagehand/blob/1da7359172f1c057487b8918af118e389fe76615/LICENSE)

### 확인된 구현
자연어 `observe/act/extract`와 코드 기반 조작을 결합한다. observe가 실제 selector 후보를 반환하고 이후 실행과 분리되는 구조는 KioskProof의 탐색 단계에 유용하다.

Google provider도 실제 구현되어 있다. `createGoogleGenerativeAI`로 `google/<model>` 요청을 라우팅한다. 다만 provider 코드가 존재하는 것과 특정 행사 모델이 호출 가능하거나 안정적으로 작동하는 것은 별개다.

- [README 사용 구조](https://github.com/browserbase/stagehand/blob/1da7359172f1c057487b8918af118e389fe76615/README.md#L53-L88)
- [Google provider 구현](https://github.com/browserbase/stagehand/blob/1da7359172f1c057487b8918af118e389fe76615/packages/extension/llm/aiSdkClient.ts#L131-L168)
- [모델 설정 검증](https://github.com/browserbase/stagehand/blob/1da7359172f1c057487b8918af118e389fe76615/packages/protocol/schemas.ts#L6-L27)

### 동작 근거와 제한
- unit/browser/integration 및 regression eval 작업이 존재한다. [CI 설정](https://github.com/browserbase/stagehand/blob/1da7359172f1c057487b8918af118e389fe76615/.github/workflows/ci.yml#L575-L621)
- 고정 HEAD의 [Release run은 success](https://github.com/browserbase/stagehand/actions/runs/38485752055). 이는 전체 Gemini E2E 통과 증거가 아니다.
- 관측한 최근 CI는 [action_required](https://github.com/browserbase/stagehand/actions/runs/38549622401), 그 직전은 [failure](https://github.com/browserbase/stagehand/actions/runs/38548880277)였다. 둘은 다른 PR SHA이므로 HEAD의 제품 장애라고 단정하지 않는다. 실패 원인은 확인하지 못했다.
- [Windows headless 종료 지연 #3166](https://github.com/browserbase/stagehand/issues/3166), [Deno extension upload #3152](https://github.com/browserbase/stagehand/issues/3152)가 open으로 관측됐다. 해당 환경의 신고이며 직접 재현한 결과는 아니다.
- 현재 v4는 extension 기반 경로다. 예전 v2/v3 예제를 섞으면 초기 통합 비용이 커진다.

### 판단
**선택적 탐색 계층으로는 유망, MVP 필수 의존성은 비권고.** 고정된 자체 키오스크를 검증하는 데 자연어 탐색까지 도입할 필요가 없다. 이 조사에서는 로컬 Stagehand 설치나 실제 Gemini 호출을 실행하지 않았다.

## 4. 사례 C: magnitudedev/browser-agent

저장소: https://github.com/magnitudedev/browser-agent  
검토 커밋: `f1b587c4173d8242bdb551991de54e70c4d2faf3` (2026-02-08)  
magnitude-core: 0.3.1  
라이선스: [Apache-2.0](https://github.com/magnitudedev/browser-agent/blob/f1b587c4173d8242bdb551991de54e70c4d2faf3/LICENSE)

### 확인된 구현
시각적 좌표 기반 조작과 자연어 테스트를 제공한다. Gemini/Google Vertex provider 타입뿐 아니라 옵션 변환 및 BAML 연결 코드가 존재한다.

- [Google client 타입](https://github.com/magnitudedev/browser-agent/blob/f1b587c4173d8242bdb551991de54e70c4d2faf3/packages/magnitude-core/src/ai/types.ts#L43-L69)
- [옵션 변환](https://github.com/magnitudedev/browser-agent/blob/f1b587c4173d8242bdb551991de54e70c4d2faf3/packages/magnitude-core/src/ai/util.ts#L60-L80)
- [BAML 모델 연결](https://github.com/magnitudedev/browser-agent/blob/f1b587c4173d8242bdb551991de54e70c4d2faf3/packages/magnitude-core/src/ai/modelHarness.ts#L60-L74)

### 제한과 주의점
- 저수준 기본값은 과거 Gemini preview 모델인데, 호환 모델 문서는 Claude Sonnet 4 등을 시각적 act에 권고한다. 당시 문서의 모델 가정을 오늘의 Gemini 전체 능력에 대한 사실로 일반화하면 안 된다. 반대로 provider 존재만으로 시각적 act 안정성이 확인됐다고 말해서도 안 된다.
- BAML 코드 생성, sharp, Patchright alias 의존성이 있어 4시간 통합에 부담이 있다.
- 전체 act에 대한 명시적 시간·단계 예산이 부족한 경로가 관찰된다. [act 루프](https://github.com/magnitudedev/browser-agent/blob/f1b587c4173d8242bdb551991de54e70c4d2faf3/packages/magnitude-core/src/agent/index.ts#L337-L429), [timeout 요청 #121](https://github.com/magnitudedev/browser-agent/issues/121)
- 고정 HEAD [Release 성공](https://github.com/magnitudedev/browser-agent/actions/runs/21805061524)은 확인했다.
- [2026-10-01 CI success](https://github.com/magnitudedev/browser-agent/actions/runs/36828544172)는 다른 PR SHA의 offline tests/build/types 및 package smoke다. 고정 기본 브랜치의 Gemini 실서비스 E2E 성공으로 볼 수 없다.
- [OS 파일창 #152](https://github.com/magnitudedev/browser-agent/issues/152), [Vue 검색 select #154](https://github.com/magnitudedev/browser-agent/issues/154), [BAML 파싱 #102](https://github.com/magnitudedev/browser-agent/issues/102)가 open으로 관측됐다. 직접 재현은 하지 않았다.

README의 WebVoyager 성능 수치는 이 조사에서 재현하지 않았고, 키오스크 업무 규칙 검증 성공률로 사용하지 않았다.

### 판단
**시각적 키오스크 조작 연구에는 참고 가치가 있으나 MVP에서는 제외.** 실제 설치 및 API 기반 end-to-end 실행은 하지 않았다. 이미지상 “완료” 판정은 주문/결제 원장의 결정적 검증을 대체하지 못한다.

## 5. 사례 D: rjsx197047/AI-Automation-QA-Engineer

저장소: https://github.com/rjsx197047/AI-Automation-QA-Engineer  
검토 커밋: `8e15fcc0d7fc79a18a691b6eb634d561274fdaf6`  
라이선스: 독점, all rights reserved. **재사용 가능한 오픈소스로 분류하지 않음.**

### 가장 닮았지만 그대로 가져오면 안 되는 이유
URL 탐색 → 테스트 → 버그 보고 → 소스 수정 → 재시작 → 검증이라는 구조로 KioskProof와 가장 비슷하다. 그러나 소스 검사 결과 중요한 차이가 있었다.

1. [fixer L749–816](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/src/agent/fixer.ts#L749-L816)의 검증은 버그 URL을 열고 HTTP 5xx 등을 검사한다. 원래 실패한 업무 시나리오와 expected/actual assertion을 재실행하지 않는다.
2. [L806–815](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/src/agent/fixer.ts#L806-L815)는 console error가 있어도 `ok: true`를 반환한다.
3. [L384–429](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/src/agent/fixer.ts#L384-L429)는 검증 실패와 별개로 최종 `ok: true`, `verified: false`가 가능하다.
4. [UI L149–160](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/frontend/src/components/ChatPanel.tsx#L149-L160)는 fix_done에서 “Fixed!”를 표시한다.
5. ZIP 수정은 원격 대상에 배포하지 않은 채 결과 ZIP을 돌려주는 경로가 있어, URL 응답 확인만으로 패치 적용을 입증하지 못한다. [관련 코드](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/src/agent/server.ts#L419-L441)

즉 “검증이 아예 없다”가 아니라 **smoke check를 수리 검증으로 표시하고 있으며, 업무 규칙이 고쳐졌다는 증거로는 부족하다**가 정확하다. README의 Limitations도 원래 실패 테스트를 다시 실행하지 않는다는 점을 명시한다.

### 공개 CI·테스트
- 단위 테스트 24개는 라우팅/JWT/bcrypt/보고서/rate limit/ZIP 등을 다룬다. 핵심 fixer의 업무 회귀검증은 포함하지 않는다. [테스트 파일](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/test/unit.test.mts#L1-L221)
- 검토 커밋의 [CI #20](https://github.com/rjsx197047/AI-Automation-QA-Engineer/actions/runs/26646948522)는 Backend 성공, Frontend 실패. 소스에도 [merge conflict marker](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/frontend/src/components/ChatPanel.tsx#L205-L216)가 있다.
- [예약 AI QA #642](https://github.com/rjsx197047/AI-Automation-QA-Engineer/actions/runs/38551804587/job/115811285301)는 대상 URL 없이 CLI 종료. 이것을 실제 앱의 버그 탐지 실패라고 해석하지 않는다.
- 공급자는 [Anthropic/OpenAI/Ollama](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/src/agent/llm.ts#L29-L41)이며 Gemini 네이티브 지원은 확인되지 않았다.

### 라이선스와 판단
[LICENSE](https://github.com/rjsx197047/AI-Automation-QA-Engineer/blob/8e15fcc0d7fc79a18a691b6eb634d561274fdaf6/LICENSE#L9-L20)는 서면 허가 없는 복사·수정·상업/비상업 사용·파생물을 제한한다. 코드 및 의존성은 실행하지 않았고, 산출물에 해당 소스를 재배포하지 않는다.

**포크·포팅·코드 차용 비추천. 공개적으로 관찰 가능한 개념의 비교 대상으로만 사용.**

## 6. PRD에 반영한 결정

### 차별화
“자연어로 테스트한다” 자체가 아니라 **운영 규칙을 고정된 합격 기준으로 바꾸고, 앱만 수정한 뒤 동일 기준으로 재검증한다**는 점을 제품 중심에 둔다.

### MVP
한 개의 새 가상 키오스크, 하나의 중복 주문 버그군, Playwright 기반 검증, Gemini의 근거 기반 진단·소스 diff, 단순한 Cloud 화면 및 보고서 링크. 실제 결제·임의 저장소·자연어 범용 크롤러·화려한 대시보드는 제외한다.

### 반드시 검증할 것
- 일반 구매는 한 번 성공한다.
- 연속 클릭과 서버 직접 중복 요청에도 주문·모의 결제가 하나다.
- 새로운 구매 시도는 정상적으로 다시 성공한다.
- 테스트·fixture·합격값을 바꾼 패치는 거부한다.
- 실패 테스트를 skip/fixme 처리하거나 일부 테스트만 실행해서 성공을 만들지 못한다.
- HTTP 200이나 AI 설명을 성공 판정으로 사용하지 않는다.
- 앱이 관리하는 주문 데이터와 별도 모의 결제 원장을 교차 확인한다. 실제 격리가 없으면 이를 적대적 코드에 대한 독립 oracle이라고 과장하지 않는다.

### 4시간 현실성
솔로 기준으로 빠듯하다. 기존 라이브러리를 활용하되, 서버 렌더링 페이지 + CLI 실행 + native Playwright 보고서로 축소한다. 12:30까지 배포·baseline, 14:10까지 실제 수정 루프가 안 되면 기능 추가를 중단한다. PRD는 성공을 보장하는 일정표가 아니라 컷 기준을 포함한 목표다.

## 7. 미확인·차단 항목

- **[blocked] 로컬 전체 Playwright 테스트 실행:** 24개가 브라우저 시작 전 환경 오류. 최소 다음 단계는 정상 브라우저 실행이 가능한 해커톤 GCP 환경에서 동일 고정 버전/공식 예제를 실행하는 것. 로컬 보안 우회는 수행하지 않음.
- **미검증: AI planner/healer, Stagehand, Magnitude의 실제 모델 기반 E2E.** 이번 조사에서는 외부 모델 호출을 실행하지 않았다. provider 지원 소스와 CI 존재를 실사용 성공률로 바꾸지 않는다.
- **[blocked] 행사 모델 기반 KioskProof 종단 실행:** 제공 계정·모델·허용 실행 환경이 아직 확인되지 않았고, 사전 시연 코드 제작도 금지다. 행사 시작 후 검증할 항목이다.
- 수상 가능성이나 경쟁작 대비 성공률은 측정하지 않았다.

## 8. 산출물과 재현성

- `KioskProof-PRD.md`: 영어 PRD. 행사 소개·제출물 영어 조건을 고려했으며, 현재는 설계 문서이지 구현 완료 선언이 아니다.
- `KioskProof-verification-evidence.zip`: 설치 로그, 두 번의 테스트 결과 JSON/로그, 브라우저 스모크 관찰과 요약. 로컬 사용자 홈 경로는 익명화했다. 독점 저장소 소스, KioskProof 코드, API 키는 포함하지 않는다.

모든 커스텀 하네스·타깃 앱·테스트·UI·수정 패치·시연 녹화는 행사 허용 시간 안에 새로 작성해야 한다. 이번 사전 작업물은 조사와 PRD이며, 조사에 사용한 TodoMVC 예제를 출품물로 재제출하는 계획이 아니다.
