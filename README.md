# PM 작업 노트 (PM Blog)

IT 서비스 기획을 공부하며 PM/PO 포트폴리오를 쌓아가는 개인 블로그입니다.
사용자 인터뷰·데스크 리서치·데이터 분석으로 문제를 정의하고, 작게 실험해 검증하는 과정을 기록합니다.

- 호스팅: GitHub Pages
- 저장소: [summer-kim626/PM-blog](https://github.com/summer-kim626/PM-blog)

## 주요 기능

| 영역 | 설명 |
| --- | --- |
| 글 보드 | 카테고리 탭으로 필터링되는 발행된 글 목록 |
| 관리자 `/admin` | **카드뉴스** 탭: AI 요약·카드뉴스 생성 / **아티클** 탭: 마크다운으로 글 작성, AI로 이해를 돕는 도형(figure) 넣기, GitHub 토큰으로 바로 발행 |
| 소개 | 블로그와 작성자 소개 |

## 폴더 구조

```
PM-blog/
├── index.html                  # 메인 페이지 (글 목록 데이터·스크립트 포함)
├── posts/                      # 개별 글 HTML (YYYY-MM-DD-slug.html)
├── assets/tailwind.css         # 빌드된 Tailwind CSS (커밋 대상)
├── src/tailwind.input.css      # Tailwind 입력 파일
├── tailwind.config.js          # 색·글꼴은 index.html :root CSS 변수(토큰)를 참조
└── mini-project-01/            # 미니 프로젝트 01: 블로그 AI 기능 기획·개발
    ├── README.md
    ├── docs/PRD.md
    └── logs/decision-log.md
```

## 로컬 실행

빌드 도구 없이 정적 파일로 동작합니다. `fetch`를 쓰기 때문에 `file://` 대신 로컬 서버로 여는 것을 권장합니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 을 엽니다.

## 스타일 빌드 (Tailwind CSS)

HTML에서 클래스를 추가·변경했다면 CSS를 다시 빌드해 `assets/tailwind.css`를 커밋합니다.

```bash
npm install
```

```bash
npm run build:css
```

작업 중 자동 빌드가 필요하면 `npm run watch:css`를 사용합니다.

## 새 글 추가하기

관리자 페이지(`/admin/#articles`)에서 마크다운으로 쓰고 **발행**하면 아래 1~2단계가 자동으로 됩니다(원본은 `posts/md/`에 남습니다). 직접 HTML로 쓸 때는:

1. `posts/YYYY-MM-DD-slug.html` 파일을 만듭니다. (기존 글 파일을 복사해 쓰면 편합니다.)
2. `index.html`의 `posts` 배열에 항목을 추가합니다.

```js
{ date: "2026-11-24", cat: "카테고리", title: "글 제목", desc: "한 줄 요약", url: "posts/2026-11-24-slug.html" }
```

- `url`을 `"#"`으로 두면 작성 예정 글로 보고 화면에 표시하지 않습니다.
- `cat` 값은 카테고리 탭으로 자동 생성됩니다.

3. 새 클래스를 썼다면 `npm run build:css`를 실행합니다.

## 글 조회수 (GA4)

`.github/workflows/update-views.yml`이 6시간마다 GA4에서 글별 페이지 조회수를 받아 `data/views.json`에 저장하고, 글 상단과 관리자 아티클 탭에 보여 줍니다. 처음 한 번 아래 설정이 필요합니다.

1. [Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 고르고 **Google Analytics Data API**를 사용 설정합니다.
2. **IAM 및 관리자 → 서비스 계정**에서 서비스 계정을 만들고, **키 → 키 추가 → JSON**으로 키 파일을 받습니다.
3. GA4 **관리 → 속성 액세스 관리**에 서비스 계정 이메일(`…@….iam.gserviceaccount.com`)을 **뷰어**로 추가합니다.
4. GA4 **관리 → 속성 세부정보**의 **속성 ID**(숫자)를 확인합니다.
5. 레포 **Settings → Secrets and variables → Actions**에 추가합니다.
   - `GA4_PROPERTY_ID`: 4의 숫자
   - `GA4_SERVICE_ACCOUNT_JSON`: 2에서 받은 JSON 파일 내용 전체
6. **Actions → Update post views → Run workflow**로 한 번 실행해 확인합니다.

## 미니 프로젝트

| 프로젝트 | 내용 |
| --- | --- |
| [Mini Project 01](mini-project-01/README.md) | 블로그 독자·관리자를 위한 AI 기능을 기획 → 디자인 → 개발하여 워크플로우 자동화 |

## 커밋 컨벤션

`타입: 내용` 형식으로 한국어로 작성합니다.

| 타입 | 용도 |
| --- | --- |
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 작성·수정 |
| `style` | 디자인·스타일 변경 |
| `chore` | 설정·자동화 등 기타 작업 |
