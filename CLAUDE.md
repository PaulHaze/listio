# CLAUDE.md

This repo's shared agent instructions (issue tracker, triage labels, domain docs) live in [`AGENTS.md`](./AGENTS.md) — read that first, since it's the master file used by both Claude and Codex.

Claude-specific instructions go below.

## Current Working Task

Used by `/audit-commit`, `/audit-sum`, `/audit-action` and `/summary`.

- **Branch convention:** `sprint-{nn}` (two-digit, e.g. `sprint-01`). `{nn}` is the sprint number.
- **Task doc:** the sprint file in `docs/sprints/` whose two-digit prefix matches `{nn}` (e.g. `sprint-01` → `docs/sprints/01_Scaffolding_Astro_Vitest_Cloudflare.md`). Each sprint has its own file, so the whole file is the task scope. There are no `Task NN` headings to match.
- **Cross-cutting context:** [`list-combiner-spec.md`](./list-combiner-spec.md), [`docs/implementation-plan.md`](./docs/implementation-plan.md), [`CONTEXT.md`](./CONTEXT.md) and [`docs/adr/`](./docs/adr/). Read the parts that bear on the changed files.
- **Audits folder:** `docs/audits/`
- **Claude audit filename:** `sprint-{nn}-claude-audit.md` (e.g. `docs/audits/sprint-01-claude-audit.md`)
- **GPT (Astra) audit filename:** `sprint-{nn}-astra-audit.md`. Use this in place of the default `{branch}-gpt-audit.md` wherever a skill looks for the GPT/Sol audit.
- **Audit summary filename:** `sprint-{nn}-audit-summary.md`
