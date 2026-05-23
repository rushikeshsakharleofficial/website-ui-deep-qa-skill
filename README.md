<div align="center">

# sys-admin

**A Claude Code plugin with QA, database auditing, and task-tracking skills.**  
Install once. Invoke from any project. Add your own skills freely.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## What is this?

`sys-admin` is an open-source Claude Code plugin that bundles a growing set of QA and productivity skills. Each skill is a focused instruction file Claude loads on demand — no runtime, no server, no build step.

**100% open. Fork it, modify it, add your own skills. MIT licensed.**

---

## Skills

| Skill | Invocation | What it does |
|:------|:-----------|:-------------|
| Router | `/sys-admin:sys-admin` | Picks the right subskill when the domain is unclear or multiple apply |
| UI / Web QA | `/sys-admin:website-ui-deep-qa` | Deep QA of any website: layout, forms, a11y, network, security, responsive, SEO — 46 check categories with Playwright |
| SQL / DB audit | `/sys-admin:sql-deep-qa` | Audits the SQL layer: injection, schema, indexes, migrations, ORM patterns, multi-tenancy, credentials — 12 check categories |
| Smart Todo | `/sys-admin:smart-todo` | **Mandatory for any 3+ step task.** Decomposes work into a tracked list, updates status in real time, surfaces blockers |

---

## Installation

**Requirements:** Claude Code CLI, Node.js 18+, npm

```bash
git clone https://github.com/rushikeshsakharleofficial/sys-admin.git
cd sys-admin
bash install.sh
```

Restart Claude Code. All four skills appear in the `/` picker under the `sys-admin:` namespace.

> The script copies skill files to `~/.claude/plugins/cache/sys-admin/`, writes manifests, registers the plugin, and enables it automatically.

---

## Usage

### UI / Web QA

```text
/sys-admin:website-ui-deep-qa Test the checkout flow on http://localhost:3000
```

Supports three modes:

- **Playwright MCP** (live browser, exploratory) — preferred when MCP is connected
- **Playwright Test** (automated, repeatable) — runs `tests/deep-ui/ui-deep-qa.spec.ts`
- **Source inspection** — static analysis when no running app is available

```bash
# Run the bundled Playwright suite
npm install && npx playwright install
BASE_URL=http://localhost:3000 npm test

# Scope to one browser/viewport
npm run test:chromium   # desktop 1440×900
npm run test:mobile     # mobile 390×844
npm run test:headed     # visible browser window
npm run report          # open HTML report
```

Artifacts land in `qa-artifacts/`: screenshots, network records, storage snapshots, a11y findings, console errors, and a `final-report.md`.

### SQL / DB audit

```text
/sys-admin:sql-deep-qa Audit the database layer in ./src
```

Works from source code alone or against a live DB (read-only). Covers: SQL injection in all ORM patterns, schema integrity, missing/unnecessary indexes, N+1 queries, migration safety, connection pooling, sensitive column exposure, tenant isolation, credential hygiene, and transaction safety.

### Smart Todo

```text
/sys-admin:smart-todo
```

Automatically invoked before any multi-step task. Creates a `TodoWrite` list with priority tags (`[P1]`/`[P2]`/`[P3]`/`[BLOCKER]`), updates status as work progresses, and delivers a completion summary.

### Router

```text
/sys-admin:sys-admin Audit our entire app — UI, database, and security
```

Use when the scope spans multiple domains. The router reads the request and dispatches to the right subskills.

---

## Configuration

### Seed routes (website-ui-deep-qa)

Edit `tests/deep-ui/helpers/routes.ts` to set the initial routes the spec visits:

```typescript
export const seedRoutes: string[] = [
  '/',
  '/login',
  '/dashboard',
  '/settings',
];
```

Additional routes are discovered automatically via visible `<a href>` links at runtime.

### BASE_URL

`BASE_URL` defaults to `http://localhost:3000` when not set. Override per run:

```bash
BASE_URL=http://localhost:8080 npm test
```

### Visual regression baselines

Update baselines only when changes are intentional:

```bash
BASE_URL=http://localhost:3000 npx playwright test --update-snapshots
```

---

## Testing

Type-check helpers without launching a browser:

```bash
npm run typecheck
```

Run the full Playwright suite (requires a running target app):

```bash
npm install
npx playwright install
BASE_URL=http://localhost:3000 npm test
```

When editing only `SKILL.md` or `skills/` files: verify manually — check frontmatter validity, internal resource paths, and that helper references in SKILL.md still match `tests/deep-ui/helpers/` filenames.

---

## Adding a new skill

Any skill is one file. To add your own:

**1. Create the skill directory and `SKILL.md`:**

```bash
mkdir -p skills/my-skill
cat > skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Use when [triggering conditions for this skill]
---

# My Skill

[Skill instructions here]
EOF
```

**2. Add a sync line to `install.sh`:**

```bash
# my-skill
mkdir -p "$PLUGIN_CACHE/skills/my-skill"
cp "$REPO_DIR/skills/my-skill/SKILL.md" \
   "$PLUGIN_CACHE/skills/my-skill/SKILL.md"
```

**3. Add a row to `skills/sys-admin/SKILL.md` routing table:**

```markdown
| My domain | `my-skill` | ✅ Active |
```

**4. Re-run the installer:**

```bash
bash install.sh
```

Restart Claude Code. Your skill appears as `/sys-admin:my-skill`.

---

## Project structure

```text
install.sh                    installer — runs once, re-run after any change
SKILL.md                      website-ui-deep-qa skill (UI QA, 46 helpers)
AGENTS.md                     Codex/OpenAI-compatible guidance
CLAUDE.md                     Claude Code project guidance
playwright.config.ts          viewport matrix and artifact paths
skills/
  sys-admin/SKILL.md          router skill
  sql-deep-qa/SKILL.md        SQL audit skill
  smart-todo/SKILL.md         task tracking skill
tests/deep-ui/
  ui-deep-qa.spec.ts          main Playwright spec (website-ui-deep-qa)
  helpers/                    46 helper modules (routes, forms, a11y, network, …)
resources/                    checklists and templates
agents/openai.yaml            UI metadata for compatible agents
```

### Viewport matrix (website-ui-deep-qa)

| Project | Viewport |
|:--------|:---------|
| `chromium-desktop-1440` | 1440×900 |
| `chromium-laptop-1366` | 1366×768 |
| `chromium-tablet-1024` | 1024×768 |
| `chromium-mobile-390` | 390×844 |
| `chromium-mobile-360` | 360×640 |
| `firefox-smoke` | 1440×900 |
| `webkit-smoke` | 1440×900 |

---

## Commands

| Command | Purpose |
|:--------|:--------|
| `npm test` | Full Playwright suite — all viewports and browsers |
| `npm run test:chromium` | Chromium desktop 1440×900 only |
| `npm run test:mobile` | Chromium mobile 390×844 only |
| `npm run test:headed` | Headed mode — visible browser window |
| `npm run test:ci` | GitHub Actions reporter format |
| `npm run report` | Open HTML report from last run |
| `npm run typecheck` | Type-check helpers without running tests |

---

## Contributing

1. Fork the repository.
2. Create a branch: `git checkout -b feat/my-skill`.
3. Add or edit skill files in `skills/`.
4. If editing `tests/deep-ui/`, run `npm run typecheck` before submitting.
5. Keep `SKILL.md` (instructions) and `tests/deep-ui/ui-deep-qa.spec.ts` (automation) in sync for the UI skill.
6. Open a pull request — all skill additions and improvements are welcome.

No CLA, no bureaucracy. If your skill is useful, it gets merged.

---

## Safety boundaries

The UI QA skill and Playwright spec never perform the following without explicit confirmation:

- Payments, subscriptions, or billing changes
- Bookings or reservations
- Sending email or public messages
- Destructive account changes or data deletion
- Production deployments or live database migrations

Login, 2FA, and payment flows require a human to take over the browser. Credentials are never requested in chat.

The SQL audit skill runs **read-only** by default. `DROP`, `DELETE`, `TRUNCATE`, and `ALTER TABLE` require explicit confirmation with a stated rollback plan.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
