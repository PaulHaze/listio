## Agent skills

### `$start-task` context

- Work source: `docs/sprints/`; use the sprint file whose two-digit numeric prefix
  matches the requested sprint number (for example, `01` maps to
  `docs/sprints/01_Scaffolding_Astro_Vitest_Cloudflare.md`). The sprint file is
  the canonical implementation brief.
- Branch convention: `sprint-NN` (for example, `sprint-01`). The user creates
  and manages sprint branches; the skill must not create, switch, rename, merge,
  or delete branches.
- Implementation agent: `gpt-6.1-sol` at medium reasoning effort.
- Audit agent: `gpt-6-astra` at high reasoning effort, in a fresh context
  after the implementation commit is complete. Invoke `$audit-commit` and
  write only the declared audit report; do not implement audit findings.
- Sprints are completed one at a time in numeric order, as listed in
  `docs/sprints/README.md`.
- Audit destination: `docs/audits/sprint-NN-audit-astra.md`, with `NN` replaced
  by the requested two-digit sprint number (for example, `sprint-02-audit-astra.md`).

### `$audit-commit` context

- Task directory: `docs/sprints/`
- Implementation file: the unique sprint Markdown file in `docs/sprints/` whose
  two-digit filename prefix matches the requested sprint number
- Audit report directory: `docs/audits/`
- Audit report filename: `sprint-NN-audit-astra.md`, with `NN` replaced by the
  two-digit sprint number

### `/audit-commit` context (Claude / Opus)

Used by Claude Code's `/audit-commit`, `/audit-sum`, `/audit-action` and
`/summary`. The `$audit-commit` block above is Astra's (Codex); this one is
Opus's.

- Branch convention: `sprint-{nn}` (two-digit). `{nn}` is the sprint number.
- Task doc: the file in `docs/sprints/` whose two-digit prefix matches `{nn}`
  (e.g. `sprint-03` → `docs/sprints/03_Storage_Nuvio_Addon.md`). The whole
  file is the task scope; there are no `Task NN` headings to match.
- Audits directory: `docs/audits/`
- Claude audit filename: `sprint-{nn}-audit-opus.md`
- After writing the Opus audit, `/audit-commit` runs `/audit-sum` if
  `docs/audits/sprint-{nn}-audit-astra.md` exists; otherwise it skips with a
  one-line note.

### `$audit-sum` context

- Audits directory: `docs/audits/`
- Claude audit (input): `sprint-{nn}-audit-opus.md`. Auditor label: **Opus**.
- Counterpart audit (input, read-only, owned by Astra):
  `sprint-{nn}-audit-astra.md`. Auditor label: **Astra** (use this wherever
  the skill says `Sol`/`GPT`).
- Consolidated summary (output): `sprint-{nn}-audit-summary.md`
- Summary heading line: `Combined findings of Astra and Opus audits:`
- Completeness rule: every finding in the Astra audit must appear in the
  summary with all its information: severity, `file:line` references,
  reasoning, evidence, and Astra's suggested fix. The same applies to every
  Opus finding. Never drop, merge or shorten away an auditor's details. Put
  Astra's proposed fix in the `Suggested fix:` line, and add an alternative
  only as a clearly labelled extra. Include any Astra notes that aren't
  findings (verification run, coverage notes, positive observations) in a
  short `Auditor notes` section at the end, attributed by auditor.

### `$new-task` context

- Parent branch: `main`
- Push flag: `true`
- Branch naming: `sprint-{nn}`

### Work tracking

No GitHub Issues. Work is tracked as numbered sprint files in `docs/sprints/`, worked one at a time in order. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
