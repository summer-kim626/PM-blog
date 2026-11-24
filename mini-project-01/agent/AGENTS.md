# AGENTS.md — 에이전트용 지침

> 이 저장소에서 작업하는 AI 에이전트(Claude Code 등)가 따르는 규칙이다.
> 루트 `CLAUDE.md`가 이 파일을 불러오므로 매 세션 자동으로 적용된다.
> 무엇을 왜 만드는지는 [PRD](../docs/PRD.md), 지금까지의 결정은 [의사결정 로그](../logs/decision-log.md)를 따른다.

## 1. 프로젝트 한 줄 요약

`posts/*.html`에 새 글을 푸시하면 GitHub Actions가 AI로 **3줄 요약 + 인스타그램 카드뉴스(1080×1350, 5~7장) + 캡션·해시태그**를 만들어 `data/cardnews/<slug>/`에 커밋한다. 관리자는 `/admin`에서 상태를 보고 결과를 내려받는다.

- 마감: **2026-11-25(수) 16:50**. 이 시각 이후 커밋은 제출되지 않는다.
- 범위는 PRD 4.1(MoSCoW)을 따른다. **Won't 항목(인스타그램 자동 업로드)은 구현하지 않는다.**

## 2. 저장소 구조와 작업 위치

| 경로 | 용도 | 비고 |
| --- | --- | --- |
| `posts/YYYY-MM-DD-slug.html` | 블로그 글 (입력) | 파일명의 `slug`가 카드뉴스 폴더 이름이 된다 |
| `index.html` | 메인 페이지, `posts` 배열 | 글 목록 데이터가 스크립트 안에 있다 |
| `cardnews/template.html` | 카드 HTML 템플릿 (F4) | `?src=<JSON>&scale=<배율>`, 샘플은 `cardnews/sample.json` |
| `cardnews/figures.js` | 카드 도형 라이브러리 | 전체 도형 확인: `template.html?scale=0.2&src=figures-test.json` |
| `scripts/cardnews/` | F2~F4 스크립트 | `extract`(F2) · `generate`+`validate`(F3) · `render`(F4) · `run`(전체). 실행: `npm run cardnews -- posts/<파일>.html [--skip-ai]` |
| `.env` | 로컬 실행용 키 | `.env.example`을 복사해 쓴다. 커밋하지 않는다(`.gitignore`) |
| `data/cardnews/<slug>/` | 생성 결과 (출력) | `summary.json`, `card-01.png` … |
| `data/cardnews/index.json` | 글별 생성 상태 | `{ slug: { status, generated_at, cards, warnings, error } }`, status는 `done`·`warning`·`failed` |
| `admin/index.html` | 관리자 페이지 `/admin` (F7) | 열: 글 제목 / 생성 유무 / 미리보기 / 다운로드 / 재생성 (PRD 4.3). 다운로드는 `<slug>-cardnews.zip`(PNG 전 장 + `caption.txt`, JSZip, D-010). 키·토큰을 다루지 않는다, `noindex` |
| `.github/workflows/` | 자동화 | 기존 `update-weather.yml` 구조를 참고한다 |
| `mini-project-01/` | 제출 문서 | PRD, 로그, 테스트 보고서, 스크린샷 |

- 소스코드의 새 위치가 생기면 의사결정 로그에 기록한다.
- 디자인 토큰은 각 HTML의 `:root` CSS 변수를 쓴다. 새 색상을 하드코딩하지 않는다.

## 3. AI 생성 규칙 (F3)

- 모델은 Google `gemini-3.8-flash`(무료 등급)를 쓴다. 다른 모델로 바꾸려면 먼저 사용자에게 묻는다.
- 입력은 글의 `<article>` 안 텍스트만 쓴다. 글 1편당 호출은 재시도 포함 최대 2회.

### 3-1. 출력 JSON 스키마

```json
{
  "slug": "2026-11-18-start-pm-blog",
  "title": "글 제목",
  "category": "index.html posts 배열의 cat 값 (표지 칩에 표시)",
  "summary": ["요약 1", "요약 2", "요약 3"],
  "cards": [
    { "type": "cover", "headline": "표지 문구", "sub": "보조 문구" },
    { "type": "point", "headline": "핵심 문구", "body": "설명",
      "figure": { "shape": "versus", "labels": ["결과물", "판단 근거"] } },
    { "type": "cta", "headline": "마무리 문구", "body": "블로그에서 전문 보기" }
  ],
  "caption": "인스타그램 캡션",
  "hashtags": ["#PM", "#서비스기획"],
  "generated_at": "ISO 8601"
}
```

### 3-2. 프롬프트 규칙

- **본문에 없는 사실·수치·인용을 만들지 않는다.** 확실하지 않으면 빼는 쪽을 택한다.
- 카드는 `cover` 1장 + `point` 3~5장 + `cta` 1장, 합계 5~7장.
- 글자 수 제한: `headline` 20자, `body` 60자, `summary` 각 40자, 해시태그 5~10개.
- 말투는 블로그 본문과 같은 한국어 합니다체(예: "기록합니다", "남깁니다").
- 응답은 JSON만 받는다. 파싱에 실패하면 1회 재시도하고, 그래도 실패하면 워크플로우를 실패로 끝낸다. 빈 결과는 커밋하지 않고, `index.json`에 `failed` 상태와 오류 메시지만 남긴다.
- 블로그에 노출할 때는 **"AI 초안"** 표기를 붙인다.

### 3-3. 카드 도형 (`figure`)

- 카드마다 내용에 맞는 도형을 **아래 목록에서 하나만** 고른다. SVG를 직접 만들지 않는다.
- `labels`는 각 6자 이내, 본문에 나온 단어로만 쓴다. 필요 없으면 빼거나 `figure` 자체를 생략한다.
- 같은 글 안에서 같은 도형을 연달아 쓰지 않는다.

| shape | 언제 쓰나 | labels |
| --- | --- | --- |
| `versus` | 두 가지를 비교·대조 | [A, B] |
| `link` | 두 가지를 잇는 관계 | [A, B, 연결 이름] |
| `contrast` | 고정 vs 변화, 꾸준함 vs 유연함 | [실선, 점선] |
| `tree` | 하나에서 뻗어나가는 생각·성장 | 없음 |
| `steps` | 단계적 과정·성장 | [1단계, 2단계, 3단계] |
| `cycle` | 반복·피드백·회고 | [위, 오른쪽 아래, 왼쪽 아래] |
| `diverge` | 여러 선택지·아이디어로 확장 | [왼쪽, 가운데, 오른쪽] |
| `converge` | 여러 갈래를 하나로 모음·우선순위 | [왼쪽, 가운데, 오른쪽, 결과] |
| `checklist` | 원칙·규칙·할 일 3개 | [항목1, 항목2, 항목3] |
| `magnifier` | 조사·분석·문제 찾기 | [대상] |
| `bulb` | 아이디어·깨달음 | 없음 |
| `chart` | 데이터·지표·증가 | [막대1, 막대2, 막대3] |
| `target` | 목표·핵심 하나에 집중 | [목표] |
| `doc` | 기록·글쓰기·문서 | 없음 |

## 4. 보안 규칙

- API 키는 **GitHub Secrets(`GEMINI_API_KEY`)에만** 둔다. 코드·로그·커밋·브라우저 스크립트에 키를 넣지 않는다.
- 워크플로우에서 키가 비어 있으면 `::error::`로 알리고 바로 종료한다(날씨 워크플로우와 같은 방식).
- API 원본 응답은 저장하지 않고 필요한 값만 남긴다.

## 5. Git 규칙

- 커밋 메시지는 `타입: 내용` 형식, 한국어, 50자 이내, 마침표 없이 명사형으로 끝낸다.
  - 타입: `feat` 기능, `fix` 버그, `docs` 문서, `style` 디자인, `chore` 설정·자동화
  - 예: `feat: 카드뉴스 PNG 렌더링 스크립트 추가`
- 한 커밋에는 한 가지 변경만 담는다. 과제가 중간 커밋 기록을 평가하므로 작업 단위마다 커밋한다.
- PRD·테스트 보고서를 고치면 커밋 메시지에 버전을 적는다. 예: `docs: PRD v0.3 성공 기준 수정`
- 날씨 봇이 1시간마다 커밋하므로 **푸시 전에 `git pull --rebase`**를 한다.
- 워크플로우 봇 커밋은 `chore(cardnews): <slug> 카드뉴스 생성` 형식을 쓴다.
- 사용자가 요청하기 전에는 커밋·푸시하지 않는다.

## 6. 기록 규칙

| 언제 | 어디에 | 무엇을 |
| --- | --- | --- |
| 선택지 중 하나를 고를 때 | `logs/decision-log.md` | 선택지 / 결정 / 이유 / 영향 (D-번호 이어서) |
| 시도가 성공·실패했을 때 | `logs/success-failure.md` | 시도한 것, 결과, 원인, 다음 행동 |
| 기능을 완성했을 때 | `docs/test-report.md` | 기능 ID(F1~F6)별 테스트 방법과 결과 |
| 화면이 바뀌었을 때 | `screenshots/` | 유저플로우 순서대로 번호 붙인 PNG |

- 실패도 지우지 않고 남긴다. 실패 로그도 제출물이다.

## 7. 작업 원칙

- 로컬에서 글 1편으로 F2~F4가 성공한 뒤에 Actions(F1, F5)를 붙인다.
- 범위를 늘리고 싶으면 먼저 사용자에게 묻고, 결정하면 의사결정 로그에 남긴다.
- 문서(PRD, 테스트 보고서)는 각각 **2페이지 이하**를 지킨다.
