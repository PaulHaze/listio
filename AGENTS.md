## Agent skills

### `$start-task` context

- Work source: `docs/sprints/`; use the sprint file whose two-digit numeric prefix
  matches the requested sprint number (for example, `01` maps to
  `docs/sprints/01_Scaffolding_Astro_Vitest_Cloudflare.md`). The sprint file is
  the canonical implementation brief.
- Branch convention: `sprint-NN` (for example, `sprint-01`). The user creates
  and manages sprint branches; the skill must not create, switch, rename, merge,
  or delete branches.
- Implementation agent: `gpt-5.6-luna` at maximum reasoning effort.
- Sprints are completed one at a time in numeric order, as listed in
  `docs/sprints/README.md`.
- Audit destination: `docs/audits/sprint-NN-astra-audit.md`.

### `$audit-commit` context

- Task directory: `docs/sprints/`
- Implementation file: the unique sprint Markdown file in `docs/sprints/` whose
  two-digit filename prefix matches the requested sprint number
- Audit report directory: `docs/audits/`
- Audit report filename: `sprint-NN-astra-audit.md`, with `NN` replaced by the
  two-digit sprint number

### Work tracking

No GitHub Issues. Work is tracked as numbered sprint files in `docs/sprints/`, worked one at a time in order. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
