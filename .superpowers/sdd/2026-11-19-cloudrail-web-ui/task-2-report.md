# Task 2 — Shared shell styles

## Files

- `web/src/app/styles/cloudrail-tokens.css` — adds aliases for existing background, surface, border, text, blue/cyan accent, focus, sizing, and radius tokens. The aliases inherit the active root theme, so dark and light colors remain sourced from the existing theme definitions.
- `web/src/app/styles/cloudrail-console.css` — refines the fixed grouped sidebar, active navigation, top bar, page surfaces, filters, tables, drawer surfaces, and keyboard focus. The 960px drawer breakpoint remains in place.
- `web/src/app/styles/cloudrail-ops.css` — refines the compact header, horizontal queue tabs, status badges, review cards, evidence, tables, and focus states. The 700px compact breakpoint remains in place.

No navigation data, route matching, permission checks, review props, API behavior, or action semantics were changed. The new stylesheets are not imported yet because entrypoint wiring is assigned to Task 5.

## Verification

- PostCSS parsed all three CSS files successfully with the project's installed PostCSS dependency.
- `npm run typecheck` — passed (`tsc --noEmit`, exit 0).
- `npm run build` — passed (Next.js production build and static page generation, exit 0).
- `git diff --check` — passed before staging.
- `rg` inspection confirmed the scoped stylesheets retain the 960px console and 700px ops breakpoints and reference existing theme variables.

The production build does not bundle these new stylesheets until Task 5 imports them. The standalone PostCSS parse verifies their syntax; integration bundling remains for the entrypoint task. Next updated `web/next-env.d.ts` during build; that generated-only change was restored to its pre-build content. The pre-existing untracked `web/scripts/scroll-motion.test.mjs` was left untouched.
