# 홈페이지 확인 방법

`index.html`을 브라우저로 열면 현재 최종 시안 1을 확인할 수 있습니다.

## 교체 위치

- 히어로 영상: `index.html`의 `.hero-media` 안에 있는 `.video-placeholder` 영역을 `video` 태그로 교체하면 됩니다.
- 현재 히어로 영상 슬롯은 이미 준비되어 있습니다. 아래 파일명으로 저장하면 자동 재생됩니다.
  - 첫 번째: `assets/videos/Drone_pullback_office_tower_Seoul.mp4`
  - 두 번째: `assets/videos/Corporate_video_premium_office_man.mp4`
- 카카오톡 대화 이미지: `index.html`의 `.kakao-slot` 요소 안에 이미지 태그를 넣으면 자동 이동 구조가 그대로 작동합니다.
- 상담 신청 팝업: `무료 상담 신청하기` 버튼을 누르면 열립니다.
- 상담 신청 엔드포인트: 기본값은 `/api/consultation`입니다. Vercel에 배포하면 `api/consultation.js`를 서버리스 함수로 사용할 수 있습니다.

## 추가된 신뢰 섹션

- `상담 전, 가능성을 먼저 검토합니다.`: 업종, 매출, 고용/인증, 신용/대출 기준을 보여주는 사전 검토 섹션입니다.
- `신청부터 승인 이후까지 한 흐름으로 관리합니다.`: 진단부터 승인 후 추가 자금 연계까지의 5단계 진행 절차 섹션입니다.
- `고객 신뢰 요소`: 정직한 사전검토·1:1 전담·종합 솔루션·투명한 절차 등 수치 없는 중립 신뢰요소 섹션입니다.
- `FAQ`: 메인 섹션이 아닌 별도 `faq.html` 페이지로 분리되어 있습니다.

## Supabase 연결

1. Supabase SQL Editor에서 `supabase-schema.sql` 내용을 실행합니다.
2. Vercel 프로젝트 환경변수에 아래 값을 추가합니다.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_CONSULTATION_TABLE=consultation_requests`
   - `SUPABASE_RATE_LIMIT_TABLE=consultation_rate_limits`
   - `RATE_LIMIT_SECRET=충분히 긴 임의 문자열`
   - `ALLOWED_ORIGINS=https://실제도메인,https://Vercel프로젝트주소.vercel.app`
   - 선택: `GOOGLE_SHEETS_WEBHOOK_URL`
   - 선택: `GOOGLE_SHEETS_WEBHOOK_SECRET`
3. 상담 신청 팝업은 `/api/consultation`으로 전송되고, Vercel 서버리스 함수가 Supabase에 저장합니다.

중요: `SUPABASE_SERVICE_ROLE_KEY`는 프론트 코드에 넣지 말고 Vercel Environment Variables에만 넣어야 합니다.

## Google Sheets 연동

Supabase를 원본 DB로 유지하면서 Google Sheets에도 같은 상담 신청 행을 복사할 수 있습니다.

1. Google Sheets에서 새 시트를 만들고 `Extensions > Apps Script`를 엽니다.
2. `docs/google-sheets-webhook.gs` 내용을 붙여넣습니다.
3. Apps Script `Project Settings > Script properties`에 `GOOGLE_SHEETS_WEBHOOK_SECRET` 값을 추가합니다.
4. `Deploy > New deployment > Web app`으로 배포합니다.
   - Execute as: `Me`
   - Who has access: `Anyone`
5. 배포 URL을 Vercel `GOOGLE_SHEETS_WEBHOOK_URL`에 넣습니다.
6. 같은 secret 값을 Vercel `GOOGLE_SHEETS_WEBHOOK_SECRET`에도 넣고 Production 재배포합니다.

Google Sheets 전송에 실패해도 상담 접수 자체는 Supabase에 저장되도록 구성되어 있습니다.

## 보안 설정

- `vercel.json`에서 CSP, 프레임 차단, MIME 스니핑 방지, Referrer/Permissions/HSTS 헤더를 적용합니다.
- `api/consultation.js`는 POST JSON 요청만 허용하고 Origin, 입력값 길이/형식, 선택 옵션, 개인정보 동의, honeypot, 제출 시간, 간단한 rate limit을 검사합니다.
- `api/consultation.js`는 서버리스 인스턴스가 바뀌어도 반복 제출을 제한할 수 있도록 Supabase에 익명화된 IP 해시를 기록합니다.
- `supabase-schema.sql`은 상담 신청 테이블과 rate limit 테이블의 RLS를 켜고 anon/authenticated 역할의 직접 읽기/쓰기 권한을 막습니다.
- 프론트 코드에는 Supabase service role key, Google Sheets webhook secret, API secret, 관리자 토큰을 넣지 않습니다.
- Vercel 환경변수 변경 후에는 Production 재배포가 필요합니다.

## Vercel 배포

Vercel에서 새 프로젝트를 만들고 이 폴더를 연결하면 됩니다.

- Framework Preset: `Other`
- Build Command: 비워둠
- Output Directory: 비워둠
- Install Command: 비워둠

GitHub에 올린 뒤 Vercel에서 `mabasa-homepage` 같은 새 프로젝트명으로 Import하면 됩니다.
