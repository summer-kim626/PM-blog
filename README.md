# PM 작업 노트 (PM Blog)

IT 서비스 기획을 공부하며 PM/PO 포트폴리오를 쌓아가는 개인 블로그입니다.
사용자 인터뷰·데스크 리서치·데이터 분석으로 문제를 정의하고, 작게 실험해 검증하는 과정을 기록합니다.

- 호스팅: GitHub Pages
- 저장소: [summer-kim626/PM-blog](https://github.com/summer-kim626/PM-blog)

## 주요 기능

| 영역 | 설명 |
| --- | --- |
| 글 보드 | 카테고리 탭으로 필터링되는 칸반형 보드. **발행됨 / 작성 예정** 두 칸으로 나뉩니다. |
| 서울 날씨 위젯 | GitHub Actions가 1시간마다 갱신하는 `data/weather.json`을 읽어 사이드바에 표시합니다. |
| 쉬어가는 코너 | [The Cat API](https://thecatapi.com/) 랜덤 고양이 사진, [PokéAPI](https://pokeapi.co/) 랜덤 포켓몬 카드. API 호출 실패 시 목업 이미지로 대체됩니다. |
| 소개 | 블로그와 작성자 소개 |

## 폴더 구조

```
PM-blog/
├── index.html                  # 메인 페이지 (글 목록 데이터·스크립트 포함)
├── posts/                      # 개별 글 HTML (YYYY-MM-DD-slug.html)
├── assets/tailwind.css         # 빌드된 Tailwind CSS (커밋 대상)
├── src/tailwind.input.css      # Tailwind 입력 파일
├── tailwind.config.js          # 색·글꼴은 index.html :root CSS 변수(토큰)를 참조
├── data/weather.json           # 서울 날씨 (Actions가 자동 갱신)
├── .github/workflows/
│   └── update-weather.yml      # 날씨 갱신 워크플로우
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

1. `posts/YYYY-MM-DD-slug.html` 파일을 만듭니다. (기존 글 파일을 복사해 쓰면 편합니다.)
2. `index.html`의 `posts` 배열에 항목을 추가합니다.

```js
{ date: "2026-11-24", cat: "카테고리", title: "글 제목", desc: "한 줄 요약", url: "posts/2026-11-24-slug.html" }
```

- `url`을 `"#"`으로 두면 **작성 예정** 칸에 표시됩니다.
- `cat` 값은 카테고리 탭으로 자동 생성됩니다.

3. 새 클래스를 썼다면 `npm run build:css`를 실행합니다.

## 날씨 자동 갱신

`.github/workflows/update-weather.yml`이 매시 17분(UTC)에 OpenWeather API를 호출해 필요한 값만 `data/weather.json`에 저장하고 커밋합니다. Actions 탭에서 수동 실행(`workflow_dispatch`)도 가능합니다.

- API 키는 레포 **Settings → Secrets and variables → Actions**의 `OPENWEATHER_API_KEY`에 보관하므로 코드에 노출되지 않습니다.
- 프런트엔드는 `raw.githubusercontent.com`의 최신 파일을 먼저 읽고, 실패하면 같은 경로의 `data/weather.json`을 읽습니다.

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
