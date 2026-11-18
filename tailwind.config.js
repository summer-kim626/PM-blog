/** Tailwind 설정: 색·글꼴은 index.html 의 :root CSS 변수(토큰)를 가리킵니다. */
module.exports = {
  content: ["./index.html", "./posts/**/*.html"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", surface: "var(--surface)", ink: "var(--ink)", muted: "var(--muted)",
        line: "var(--line)", accent: "var(--accent)", "accent-soft": "var(--accent-soft)", mark: "var(--mark)"
      },
      fontFamily: { display: "var(--font-display)", body: "var(--font-body)" }
    }
  }
};
