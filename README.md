# A starter kit for Astro featuring Tailwind, Dark/Light Theme toggle + Typescript

A starter I use as the basis for all my Astro projects. Feel free to use it in yours by cloning this project.

## Stack

- [Astro 7](https://astro.build) with the React integration, `<ClientRouter />` page transitions, the Fonts API and `@astrojs/sitemap`
- [Tailwind CSS 4](https://tailwindcss.com) (via `@tailwindcss/vite`) + `@tailwindcss/typography` + `tw-animate-css`
- Icons via `astro-icon` with the [Lucide](https://lucide.dev/icons) set (`<Icon name="lucide:sun" />`); custom SVGs go in `src/icons/`
- TypeScript (strict), ESLint 10 (flat config) and Prettier

## Starting a new project

1. Set `site` in `astro.config.mjs` to the deployed URL (used for the sitemap, `robots.txt`, canonical and Open Graph URLs).
2. Update the default `description` in `src/layouts/Layout.astro`, and pass `image` for social share previews.

## Requirements

- Node.js `22.22.3+`, `24.16.0+` (recommended, see `.nvmrc`) or `26.3.0+`
- pnpm 12 (pinned via the `packageManager` field in `package.json`)

## Commands

| Command           | Action                                                        |
| :---------------- | :------------------------------------------------------------ |
| `pnpm install`    | Install dependencies                                          |
| `pnpm dev`        | Start the dev server at `localhost:4321`                      |
| `pnpm check`      | Type-check `.astro` and TypeScript files                      |
| `pnpm build`      | Type-check, then build the production site to `dist/`         |
| `pnpm preview`    | Preview the production build locally                          |
| `pnpm lint`       | Format with Prettier and fix ESLint issues                    |
| `pnpm lint:check` | Check formatting and lint without changing files (used in CI) |

## Notes

- Dark mode is driven by the `data-theme` attribute on `<html>`, which switches the theme colours and Tailwind's `dark:` variant. The initial theme is set by an inline script in `src/layouts/Layout.astro` to avoid a flash of the wrong theme.
- Theme colours live in `src/styles/main.css` as plain CSS variables (light in `:root`, dark in `:root[data-theme='dark']`), exposed as Tailwind colours: `background` (plus `background-100`/`-200`/`-300`, calculated from `--background` with relative colour syntax), `foreground`, `primary`, `primary-muted`, `secondary`, `secondary-muted`, `accent`, `caution`, `alert` and `success` (e.g. `bg-primary text-background`, `text-alert`, `bg-secondary-muted`).
- Fonts are configured under `fonts` in `astro.config.mjs` and downloaded from Fontsource at build time, then self-hosted. `<Font />` in the layout outputs the `@font-face` rules (and preloads Noto Sans); Tailwind's `font-sans`/`font-header` point at the generated CSS variables.
- pnpm only runs install scripts for packages listed under `allowBuilds` in `pnpm-workspace.yaml`. Add new entries there if `pnpm install` reports ignored builds.
- `pmOnFail: ignore` in `pnpm-workspace.yaml` keeps `pnpm-lock.yaml` as a single YAML document, because GitHub's dependency graph can't yet read pnpm 12's two-document format ([dependabot-core#15904](https://github.com/dependabot/dependabot-core/issues/15904)). It can be removed once that's fixed.

## CI and Dependabot

- `.github/workflows/ci.yml` runs `lint:check` and `build` on every push to `main` and every PR.
- Dependabot opens weekly PRs (after a 3-day cooldown on new releases), grouping minor/patch updates for Astro, Tailwind, React and lint/format tooling. Once CI passes, those minor/patch PRs are merged automatically; major updates are left open for review.
