# Firebase 일기장 변경 감사 · 2026-10-12

## 구성과 변경 사유

사용자가 Firebase 백엔드·Google 로그인·Firebase 배포와 신규 프로젝트·서울 저장 지역을 요청했다. 신규 프로젝트는 `classroom-diary-098bae6e`, 웹앱은 `1:1056246312900:web:05b5aa0aa01a29b6c3be91`, Firestore는 `(default)` Standard Native / `asia-northeast3`이다. 데이터베이스 삭제 보호를 활성화했다. Enterprise 생성은 자동 승인 검토가 미승인 비용·조건 변경을 이유로 거부하여, 검토가 제시한 안전한 대안인 Standard로 진행했다. 유료 요금제 전환·결제 계정 연결을 수행하지 않았다.

배포 주소: https://classroom-diary-098bae6e.web.app/#/diary . Firebase Hosting에 기존 허브와 Google 로그인 일기장을 포함한 별도 빌드를 배포한다. 기존 일반 공개 빌드는 계속 일기를 제외하며, 기존 로컬 실행과 로컬 암호화 파일을 유지한다. 로컬 기록의 클라우드 이관이나 동기화는 수행하지 않는다.

## 데이터와 권한

`diaryVaults/{Auth UID}`에는 version·iterations·salt·iv·revision·count·createdAt·updatedAt만 저장한다. `parts/{0..11}`에는 revision·index·ciphertext만 저장한다. 날짜·제목·기분·본문은 기존 PBKDF2-SHA-256 600,000회 / AES-256-GCM으로 브라우저에서 암호화한 뒤 전송한다. 암호화 키는 비추출 가능 키이며 메모리에만 둔다. 비밀번호를 Firebase나 파일에 저장하지 않는다. Google 로그인은 계정 접근 인증, 별도의 일기장 비밀번호는 내용 복호화에 사용한다.

암호문은 조각당 700,000자, 최대 12조각, 클라이언트에서 총 8MiB로 제한한다. 단일 Firestore 문서 크기 제한을 넘지 않으며 전체 조각과 헤더를 같은 트랜잭션에 저장한다. 헤더 revision 비교로 오래된 클라이언트의 덮어쓰기를 거부한다. 읽기 전후 revision을 비교해 혼합된 세대를 복호화하지 않는다. 파일 축소 시 남은 조각을 같은 트랜잭션에서 정리한다. 읽기·복호화가 실패해도 기존 데이터를 빈 기록으로 덮어쓰지 않는다.

Google 제공자로 인증한 UID만 자기 문서와 조각에 get/create/update할 수 있다. 컬렉션 list, 타인 접근, 헤더 delete, 알려지지 않은 컬렉션은 거부한다. 모든 create/update에 필수·허용 필드, 타입, 길이, 범위, revision 형식 검증을 적용한다. salt·createdAt을 업데이트에서 고정하고 updatedAt은 서버 시각과 일치시킨다. 활성 조각 삭제는 거부하고, 축소 후 남은 조각과 이미 없는 조각의 삭제만 허용한다. UID는 문서 경로에서 정하므로 사용자 입력 ownerId나 역할에 의존하지 않는다. admin·이메일·평문 필드를 추가하면 규칙이 거부한다.

## 개인정보·시크릿·예외

앱은 Google Auth의 이름·이메일을 별도 Firestore 문서에 복사하거나 화면·로그에 출력하지 않는다. Google Auth 자체는 로그인 제공자 정책에 따라 계정 프로필을 처리한다. 로그인 persistence는 inMemoryPersistence, Firestore는 영구 캐시가 없는 Lite SDK를 사용한다. 일기·키·세션을 앱의 localStorage/sessionStorage에 저장하지 않는다. 다른 기존 게임의 비식별 최고점 저장 동작은 유지한다. 잠금·로그아웃·이탈에서 평문 DOM과 참조를 제거하나 메모리 보안 소거를 보장하지 않는다.

Firebase의 공개 Web API 키·프로젝트 식별자는 `firebase/public-config.json`에만 있으며 관리자 시크릿이 아니다. 서버 서비스 계정·관리자 키를 브라우저에 포함하지 않는다. 권한 경계는 Firestore 규칙이다. OAuth 지원 연락처는 현재 CLI 계정에서 실행 중 읽어 사용하며 하드코딩하지 않는다. 임시 운영 설정은 OS 임시 폴더에 만들고 성공·실패 모두 정리한다. 저장소 소스·배포 파일·출력에는 해당 연락처를 포함하지 않는다.

초기 CLI 인증 확인에서 `login:list --json`이 인증 토큰을 출력한 실수가 있었다. 즉시 CLI logout으로 해당 인증을 폐기하고 사용자 인증을 새로 수행했다. 후속 확인은 토큰을 출력하지 않는 프로젝트 접근 검사로 수행했다. 관련 CLI 로그의 계정·인증 필드는 비식별화했다. Firestore Lite SDK의 기본 오류 로그가 UID 경로·요청 본문을 포함할 수 있어 `setLogLevel('silent')`를 적용하고 사용자 화면에는 고정 오류 문구만 표시한다.

네트워크 실패·팝업 차단/취소·허용되지 않은 도메인·계정 변경·암호문 손상·잘못된 비밀번호·용량 초과·동시 저장을 실패로 안내한다. 미저장 이탈 확인과 저장 중 이동 제한을 유지한다. 실패 시 입력을 유지하며 저장 성공을 표시하지 않는다. 계정 변경/로그아웃 시 이전 사용자의 화면을 제거한다. 새로고침하면 메모리 세션이 없어져 다시 Google 로그인·비밀번호 입력이 필요하다. Google 계정 비밀번호 재설정은 일기장 암호화 비밀번호를 복구하지 않는다.

## 공급망·빌드·호스팅

Firebase SDK 13.0.0, esbuild 0.28.2, 규칙 테스트 SDK 6.0.0을 고정 버전·lockfile로 설치했다. npm audit에서 하위 gRPC 고위험 취약점이 확인되어 @grpc/grpc-js를 수정 버전 1.14.6으로 override하고 재검사에서 0건을 확인했다. Firebase CLI 15.33.0은 공식 npm 패키지의 별도 캐시에 설치하여 기존 손상 캐시를 건드리지 않았다. Java 21은 공식 Adoptium 다운로드의 SHA-256을 확인하고 프로젝트 임시 폴더에만 풀어 에뮬레이터에서 사용했다.

Firebase 빌드는 기존 허용 목록·vendor 해시 검사가 있는 공개 빌드에서 시작해 일기 화면·검증된 SDK 번들·공개 설정만 추가한다. data·.env·토큰·운영 설정·코드·테스트·node_modules를 업로드하지 않는다. 파일 해시와 릴리스별 복사본을 build/firebase-releases에 보존한다. 이전 빌드가 수동 변경되거나 vendor 무결성이 달라지면 실패한다. SDK는 자체 번들로 제공하고 Google 로그인에 필요한 apis.google.com만 추가 스크립트 출처로 허용한다. CSP는 Auth·Firestore의 지정된 API 출처만 연결하고, frame-src는 해당 Firebase authDomain으로 한정한다. 예약된 인증 helper는 Firebase의 관리 정책을 유지한다. OCR worker만 Wasm 컴파일을 허용한다. COOP는 same-origin-allow-popups, 나머지 일반 화면은 framing·mime sniffing·referrer·민감 기기 권한을 제한한다. CORS 와일드카드 허용을 추가하지 않는다.

## 검증과 한계

- 단위 테스트 39개 통과: 기존 도구·로컬 저장·공개 빌드 회귀와 신규 암호문 조각 분리/복원, 다른 revision 혼합·누락·초과 크기 거부.
- Firestore 에뮬레이터 보안 검사 39개 통과: 미인증/타인 get/create/update/delete와 list 차단, orphan 조각·평문/권한 필드·필수 필드 누락·타입 혼동·대형 문자열·범위·salt/createdAt/updatedAt 변경·활성 조각 삭제 차단, 정상 소유자의 원자적 생성·수정 허용. 삭제 규칙 수정 후 전체 공격 검사를 다시 통과했다. 해당 없는 역할·공유·카운터·공개 프로필 기능은 만들지 않아 관련 상승 경로를 제공하지 않는다.
- Auth+Firestore 실제 SDK 에뮬레이터 종단간 통과: 합성 Google 계정 인증, 여러 조각 암호문 저장·복원·새 클라이언트 복원, 다른 계정 차단, 두 클라이언트 동시 수정에서 1건만 성공, 축소 조각 정리, 기록 삭제, 로그아웃 접근 차단.
- 실제 프로젝트의 firestore rules/indexes dry-run 및 배포 컴파일 통과. Hosting·규칙·인덱스 배포 완료.
- Chrome의 로컬·실제 HTTPS 주소 검사 통과: 허브 4개 도구, 일기 로그인 gate, 390px 모바일 넘침 부재, 브라우저 오류·영구 세션 없음, 공개 설정, 일반 CSP·OCR 예외 헤더. 실제 배포 주소에서 Google OAuth 로그인 페이지 진입과 팝업 취소 후 재시도 버튼 복구 확인. 화면 이미지 qa/firebase-login-desktop.png 및 qa/firebase-login-mobile.png 확인.
- 실제 사용자의 일기 내용·비밀번호를 입력하거나 생산 데이터베이스에 테스트 기록을 만들지 않았다. 실제 Google 계정의 로그인 완료 이후 일기 작성은 사용자 검증이 남아 있다. 에뮬레이터 검증은 실제 계정 데이터 검증을 대신하지 않는다. 실제 모바일 기기·Safari/Firefox, 망 차단·팝업 정책·장시간 중단·Google 제공자 장애는 미검증이다.
- 소유자는 자기 암호문을 직접 변조할 수 있으나 복호화 인증은 이를 거부한다. 검증된 클라이언트는 헤더·조각을 원자적으로 쓰며, 악의적인 소유자가 규칙을 만족하는 형식의 손상 암호문을 만드는 것까지 방지하는 서버 복호화 검사는 제공하지 않는다. 운영자/Admin SDK는 일반 보안 규칙을 우회할 수 있으므로 서비스 계정/IAM 관리는 별도 신뢰 경계다. App Check·가입자 허용 목록·자동 백업·사용자 삭제·비밀번호 변경·로컬 동기화는 구현하지 않았다.

## 배포 기록

Google 제공자 활성화 후 `firestore:rules,firestore:indexes,hosting`를 해당 신규 프로젝트에 배포했다. 화면 문구 보완은 hosting만 갱신한다. 기존 프로젝트와 로컬 일기 데이터는 변경하지 않았다. 주요 파일: firebase/cloud-client.mjs, firebase/vault-parts.mjs, firestore.rules, firebase.json, scripts/build-firebase.mjs, scripts/configure-firebase-auth.mjs. 로컬 일반 공개 빌드와 Firebase 빌드는 독립된 산출물이다.

## 2026-10-12 공유 프로젝트 댓글 규칙
전체 허브 teacher-hub의 익명 공개 피드백을 같은 Firebase 프로젝트의 전용 컬렉션에 추가했다. 일기장 Google 소유자 권한과 암호화 구조는 유지한다. classroom-hub/firestore.rules를 teacher-hub/backend/firestore.rules와 동기화했다. Firebase 규칙 배포는 전체 교체이므로 댓글 규칙도 보존한다. 익명 댓글 사용자 일기장 접근 거부 및 기존 일기장 규칙 39개 회귀 검사를 통과했다. 상세 모델·운영 한계·관리자 댓글 삭제는 teacher-hub/backend/README.md 및 SECURITY-AUDIT.md에 기록했다. 프로젝트 사용량을 공유하며 일기장 Hosting과 데이터는 변경하지 않았다.

## 2026-10-16 무료 등록 접수 API
같은 Standard Firestore에 teacherHubRequests/teacherHubRequestWriters/teacherHubRequestQuota 전용 경로를 추가했다. 결제 미연결 상태를 유지하며 GitHub Actions가 접수를 Issue로 전환한다. 처리 계정 custom claim은 접수에 한정하며 Google 일기장과 댓글 쓰기 권한을 주지 않았다. classroom-hub/firestore.rules를 최종 공유 규칙에 동기화했고 일기장39/댓글42/접수53 권한 검사를 통과했다. 재배포 시 전체 공유 규칙을 보존한다. 세부 감사와 운영 중단/인증 교체는 teacher-hub/SECURITY-AUDIT.md 및 backend/README.md에 있다.

## 2026-10-17 댓글 5초 제한·공용 삭제 인증
공유 규칙에서 댓글 작성 제한을 5초로 변경하고 별도 password 공급자+feedbackModerator claim에 댓글 delete만 허용했다. 사용자 선택에 따른 공용 인증이며 일기장 Google 인증·암호화 데이터·접수 권한은 유지한다. 최종 전체 규칙을 classroom-hub/firestore.rules에 동기화했고 일기장39/댓글50/접수53 권한 검사를 통과했다. 일기 데이터는 테스트·변경하지 않았다. 잔여 위험과 운영 대응은 teacher-hub/SECURITY-AUDIT.md 및 backend/README.md에 기록했다.
