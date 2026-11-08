# 메트로챗 인수 현황

인수일: 2026-11-08. 프로젝트 가칭은 **메트로챗**, 패키지·로컬 디렉토리명은 `metro-chat`으로 정리했습니다.

## 경로와 실행

- 현재 경로: `/Users/jay/Developer/project-bookey/metro-chat`
- 이전 경로: `/Users/jay/Developer/project-bookey/bamboo-forest`
- 체험 실행: `SUBWAY_DEMO=1 npm start`
- 실제 API 실행: `SEOUL_SUBWAY_API_KEY=발급받은키 npm start`
- 접속: `http://127.0.0.1:3212/metro-chat/`
- 검증: `npm test`

로컬 디렉토리·브랜드 변경과 서버 이전은 별개입니다. 공개 URL과 API·쿠키 경로는 `/metro-chat/`으로 변경했습니다. systemd 서비스 `bamboo-forest`, 서버 경로 `/opt/bamboo-forest`, nginx 설정 파일명은 유지했습니다. 2026-11-08 공개 서버 확인과 배포를 완료했습니다. Git 커밋은 수행하지 않았습니다.

## 인수한 구현

2호선 본선·9호선 일반열차의 역·방향·열차 선택, 열차별 SSE 채팅, 하차, 세션 복구, 모바일 화면과 명시적 체험 모드가 구현되어 있습니다. 방은 모드·한국 시각 오전 3시 기준 운행일·노선·방향·열차번호로 구분합니다. 세부 정책과 실행 방법은 README.md를 참고하세요.

실제 인증키로 서울시 API를 호출한 검증은 아직 남아 있습니다. 테스트는 모의 응답으로 API 파싱·캐시·오류 처리를 검증합니다. health의 `live`는 키 설정 여부만 나타냅니다. 실제 탑승 인증, 목적역 도착 감지, 영구 기록, 신고·차단, 다중 서버 상태 공유는 없습니다.

## 다음 작업 순서

1. 서울시 지하철 인증키를 실행 환경에 설정한 뒤 실제 도착정보의 열차번호·방향·생성 시각을 검증합니다. 키를 저장소에 기록하지 않습니다.
2. 이미 탑승한 사용자가 열차를 찾는 흐름을 보완합니다. 현재는 역 도착정보에서 열차를 선택합니다.
3. 실시간 열차 위치정보 API를 연결하고 노선도에 위치를 표시합니다.
4. 2호선 단축·입고 운행의 목적역 도달 검사와 열차번호 재사용 시 운행 회차 구분을 보완합니다.
5. 수도권 노선·환승·급행 정차역 데이터를 확장합니다.
6. 하차 알림·자동 종료 정책을 보완합니다.
7. 운영 기능·부하 검증 후 기존 서버와 릴리스 상태를 확인하고 배포합니다.

## 작업 보존

기존 미커밋 변경·미추적 파일·Git 이력은 그대로 보존했습니다. 작업 디렉토리 초기화나 미추적 파일 삭제를 피하세요. 기존 숲의 world.mjs와 테스트도 남아 있습니다.

이름 변경 직전 소스 백업(Git 이력 제외):
`/Users/jay/Developer/project-bookey-backups/bamboo-forest-before-metro-chat-20261108.tar.gz`

인수인계서에 기록된 `/private/tmp/bamboo-before-subway/`는 인수 시점에 존재하지 않았습니다. 위 백업은 지하철 전환이 완료된 소스의 사본입니다.

## 참고

- [실시간 도착정보 API 명세](https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-12764&srvType=A)
- [실시간 열차 위치정보 API 명세](https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-12601&srvType=A)

## 2026-11-08 배포 기록

- 공개 주소: https://www.bookey.site/bamboo-forest/
- 서버: `ec2-user@43.200.154.240`
- 현재 릴리스: `/opt/bamboo-forest/releases/metro-chat-20261108-v1`
- 이전 릴리스: `/opt/bamboo-forest/releases/multiplayer-20261104-v1`
- 배포 설정 백업: `/opt/bamboo-forest/deploy-backup.Y30LK7`
- 로컬 배포 아카이브: `/private/tmp/metro-chat-20261108-v1.tar.gz`
- SHA-256: `0c781fbcdf8473bf47da1c8db2cc71df697b9b017030fbcd1c82c8a46e1551b5`
- 확인 결과: 서비스 active, NRestarts=0, nginx 설정 검사 통과, 공개 HTTPS health 정상, 메트로챗 제목 확인, 공개 client.js와 로컬 원본 일치.
- 운영 모드: `unconfigured`. `/opt/bamboo-forest/subway.env`가 없으며 체험 모드는 활성화하지 않았습니다. 실제 채팅방 입장을 위해 API 키 설정과 실제 응답 검증이 필요합니다.
- 배포 기록은 배포 후 로컬 문서에 추가했으므로 해당 릴리스 아카이브의 문서에는 포함되지 않습니다.

## URL 변경

공개 주소를 `https://www.bookey.site/metro-chat/`으로 변경하고 `metro-chat-20261108-v2` 배포를 완료했습니다. 이전 `/bamboo-forest/` URL은 경로와 쿼리를 유지해 새 URL로 리다이렉트합니다. 인증키 신청서의 사용 URL도 새 주소를 사용합니다. 서비스 이름·서버 설치 경로는 유지하며, 새 쿠키 경로를 사용하므로 기존 사용자는 새 세션으로 연결됩니다.

- URL 변경 릴리스: `/opt/bamboo-forest/releases/metro-chat-20261108-v2`
- 복구 대상: `/opt/bamboo-forest/releases/metro-chat-20261108-v1`
- 배포 설정 백업: `/opt/bamboo-forest/deploy-backup.Yg096S`
- 검증: 테스트 6개 통과, 공개 화면·client.js 원본 일치, 이전 URL의 경로·쿼리 보존 리다이렉트, 새 경로의 Secure/HttpOnly 세션 쿠키와 열차 조회 API 확인. 서비스 active, NRestarts=0.
- API 키는 아직 미설정이며 체험 모드는 꺼져 있습니다.

## 인증키 설정과 실제 API 응답 확인

- 제공받은 인증키를 서버 `/opt/bamboo-forest/subway.env`에 root:root, 권한 600으로 설정했습니다. 로컬 `subway.env`도 권한 600이며 `.gitignore`로 제외했습니다. 배포 아카이브에는 인증키를 포함하지 않습니다.
- 현재 릴리스: `/opt/bamboo-forest/releases/metro-chat-20261108-v3`, 이전 릴리스 v2, 설정 백업 `/opt/bamboo-forest/deploy-backup.TzupSC`.
- 실제 서울시 응답에서 최상위 `code: INFO-200`(해당 데이터 없음)을 확인하고, 이 응답을 정상 빈 목록으로 처리하도록 보완했습니다. 인증 오류의 최상위 코드도 처리하며 회귀 테스트를 추가했습니다. 테스트 6개 통과.
- 공개 API에서 강남 2호선·여의도 9호선 조회 모두 HTTP 200, mode=live, 열차 0건을 확인했습니다. 실제 운행 중인 열차번호·방향·채팅방 입장은 추가 검증이 필요합니다. 데이터가 없는 이유는 응답만으로 확정하지 않았습니다.
- 서비스 active, NRestarts=0, 체험 모드는 비활성입니다.

## 역별 첫차·막차 배포 (2026-11-08)

- 현재 릴리스: `/opt/bamboo-forest/releases/metro-chat-20261108-v4`, 복구 대상 v3, 설정 백업 `/opt/bamboo-forest/deploy-backup.wjdceD`.
- timetable.mjs, data/first-last.json, scripts/update-timetable.mjs를 추가했습니다. 공식 OA-15492 공개 표를 받아 역·방향·평일/토요일/휴일별로 판단하고 자정 이후 운행을 처리합니다. 시간표상 막차 이후 실시간 열차가 없으면 다음 첫차를 표시합니다.
- 시간표 하루 단위 갱신, 실패 시 1시간 재시도, 7일 초과 자료는 미확인 처리. 2026~2027년 공휴일·대체공휴일을 반영하며 임시공휴일과 이후 연도 목록은 갱신이 필요합니다.
- 9호선 시간표 방향 코드와 실시간 방향을 별도 매핑합니다. 2호선 지선 중복 행은 본선을 우선하고 본선으로 확정할 수 없으면 미확인 처리합니다. 하차역 도달 여부를 기준으로 한 막차 탐색은 아직 없습니다.
- 테스트 10개 통과. 공식 표 갱신 명령 성공(고유 행 522건). 공개 서비스의 실제 Chromium에서 강남 2호선·여의도 9호선 막차 종료/다음 첫차 안내, 데스크톱·390px 모바일 화면, 가로 넘침 없음, 페이지 오류 없음 확인.
- 임시 스크린샷: `/private/tmp/metro-hours-production-1280.png`, `/private/tmp/metro-hours-production-390.png`. 서비스 active, NRestarts=0.

## 수도권 전체 API 노선 확장 배포 (2026-11-08)

- 현재 릴리스: `/opt/bamboo-forest/releases/metro-chat-20261108-v5`, 복구 대상 v4, 설정 백업 `/opt/bamboo-forest/deploy-backup.ofKji1`. Git 커밋은 하지 않았습니다.
- 서울시 OA-12764 최신 역 코드 첨부(2026-09-02)에 포함된 19개 노선을 구현했습니다. 목록은 README.md 참고. lines.mjs와 원본 출처 data/network-source.json을 추가했습니다. 노선별 역 항목 699개(환승 중복), 선택 가능한 운행 구간 28개입니다.
- 1·2·5호선 지선, 경의중앙선·경춘선 분기, 6호선 단방향 응암 순환, GTX-A 분리 구간, 4호선 진접선 보완을 반영했습니다. 긴 노선도는 스크롤하고 노선·운행 구간은 선택 상자로 고릅니다.
- 같은 열차는 분기/운행 구간 선택이 달라도 기존 노선 ID·방향·열차번호로 같은 방을 사용합니다. 모든 노선에서 종착역 도달을 검사하고 다른 지선·단축 운행·미확인 목적지는 입장을 막습니다. 급행·특급·ITX·직통은 표시하지만 입장은 제한합니다.
- 공식 첫차·막차 데이터는 1~9호선의 고유 행 2,670건으로 확장했습니다. 선택 구간과 첫차/막차 종착역이 맞지 않으면 종료를 단정하지 않습니다. 나머지 10개 노선은 시간표 미확인 상태로 실제 도착정보만 사용합니다.
- 테스트 15개 통과. 로컬 Chromium의 1280px·390px에서 19개 노선/28개 운행 구간의 역 선택, 1호선 채팅·하차, 지도 잘림·페이지 가로 넘침·오류 없음 확인.
- 공개 Chromium에서 19개 노선 각각 실제 열차 조회를 수행해 모두 HTTP 200, live, arrivalError 없음 확인. 현재 심야 응답은 모두 열차 0건입니다. 모든 노선의 실제 운행 중 열차번호·방향·API 제공 범위 검증은 아직 남아 있습니다.
- 공개 화면에서도 19개 노선 선택, 모바일 5호선 마천 구간 선택 및 화면 오류/넘침 없음 확인. 서비스 active, NRestarts=0. 이전 URL 리다이렉트와 인증키 환경 파일은 유지했습니다.
- 배포 아카이브 `/private/tmp/metro-chat-20261108-v5.tar.gz`, SHA-256 `197ed3d721fb65764b095a5abb58c71c2fb4a114800d845e59d1cff5165731e0`. 키 파일은 포함하지 않았습니다.
- 공개 검증 스크린샷: `/private/tmp/metro-network-production-desktop.png`, `/private/tmp/metro-network-production-mobile.png`.
