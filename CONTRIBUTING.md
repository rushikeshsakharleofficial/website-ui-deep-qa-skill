# Contributing to sys-admin

This project is 100% open source — MIT licensed. Fork it, change it any way you like, add skills, extend existing ones, or submit pull requests back. No CLA, no bureaucracy.

---

## Ways to contribute

| Type | What to do |
|:-----|:-----------|
| **Add a new skill** | The most valuable contribution. One `SKILL.md` file. |
| **Improve an existing skill** | Better coverage, clearer instructions, new check categories. |
| **Add a Playwright helper** | Extend `tests/deep-ui/helpers/` for the UI skill. |
| **Fix a bug** | Open an issue or submit a PR directly. |
| **Report a defect** | Open a GitHub issue with steps to reproduce. |

---

## Adding a new skill (most common contribution)

A skill is a single `SKILL.md` file with YAML frontmatter. No build step, no dependencies.

### Step 1 — Create the skill

```bash
mkdir -p skills/my-skill
```

Create `skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: Use when [specific triggering conditions — not a workflow summary]
---

# My Skill

## Overview
[What this skill does in 1-2 sentences]

## Checks / Steps
[The actual instructions Claude should follow]
```

**Frontmatter rules:**

- `name`: letters, numbers, hyphens only — no spaces or special characters
- `description`: triggering conditions only — never summarize the skill's workflow (Claude reads this to decide whether to load the skill, not to follow it)

### Step 2 — Wire it into the installer

Add a sync block to `install.sh` (after the last existing skill block):

```bash
# my-skill
mkdir -p "$PLUGIN_CACHE/skills/my-skill"
cp "$REPO_DIR/skills/my-skill/SKILL.md" \
   "$PLUGIN_CACHE/skills/my-skill/SKILL.md"
```

### Step 3 — Add a row to the router

Edit `skills/sys-admin/SKILL.md` — add your skill to the Domain Map table:

```markdown
| My domain description | `my-skill` | ✅ Active |
```

### Step 4 — Test locally

```bash
bash install.sh
```

Then in a fresh Claude Code session (after restart):

```text
/sys-admin:my-skill
```

Verify the skill loads and Claude follows its instructions.

### Step 5 — Submit a PR

```bash
git checkout -b feat/my-skill
git add skills/my-skill/ install.sh skills/sys-admin/SKILL.md
git commit -m "feat: add my-skill — [one-line description]"
git push origin feat/my-skill
```

Open a pull request. Describe: what the skill covers, what gap it fills, and how you verified it.

---

## Improving an existing skill

Edit the `SKILL.md` file directly in `skills/<skill-name>/SKILL.md`. Re-run `install.sh` to sync to the plugin cache. Verify the change in a fresh Claude Code session.

**Quality bar for all skill edits:**

- **Explicit** — every check is spelled out; do not rely on Claude inferring intent
- **Safe** — never remove or weaken safety boundaries
- **Suitable for weaker models** — specific enough for a less capable model to follow without ambiguity
- **Honest** — if something is not tested, say so

For `website-ui-deep-qa` specifically: never remove the non-negotiable inspect-first rule or any safety boundary.

---

## Extending the Playwright test harness (`website-ui-deep-qa`)

The UI skill ships with 46+ Playwright helpers in `tests/deep-ui/helpers/`. Each helper is one TypeScript file with a focused audit function.

### Add a new helper

1. Create `tests/deep-ui/helpers/my-check.ts`:

```typescript
import { Page } from '@playwright/test';
import { writeJsonArtifact } from './report';

export async function auditMyCheck(page: Page, route: string): Promise<string[]> {
  const issues: string[] = [];
  // ... audit logic
  await writeJsonArtifact('my-check', route, issues);
  return issues;
}
```

2. Import and call from `tests/deep-ui/ui-deep-qa.spec.ts`:

```typescript
import { auditMyCheck } from './helpers/my-check';
// inside the per-route loop:
const myIssues = await auditMyCheck(page, route);
```

3. Add entries to the fix plan in `tests/deep-ui/helpers/fix-plan.ts` if the check produces fixable findings.

4. Type-check before committing:

```bash
npm run typecheck
```

**Keep `SKILL.md` and the Playwright spec in sync** — the spec implements what the skill describes. If you add a check to the spec, document it in `SKILL.md`. If you document a check in `SKILL.md`, add it to the spec.

---

## Development setup

```bash
git clone https://github.com/rushikeshsakharleofficial/sys-admin.git
cd sys-admin
npm install
npx playwright install
```

Verify the TypeScript compiles:

```bash
npm run typecheck
```

Run the Playwright suite against a local app:

```bash
BASE_URL=http://localhost:3000 npm test
```

---

## Pull request checklist

Before submitting:

- [ ] `npm run typecheck` passes (if you touched any `.ts` file)
- [ ] `install.sh` includes a sync block for any new skill
- [ ] New skill is listed in `skills/sys-admin/SKILL.md` routing table
- [ ] SKILL.md frontmatter `name` uses only letters, numbers, and hyphens
- [ ] SKILL.md `description` describes triggering conditions, not workflow
- [ ] No safety boundaries removed or weakened
- [ ] PR description explains what the skill covers and how it was verified

---

## Reporting bugs and issues

Open a GitHub issue at [github.com/rushikeshsakharleofficial/sys-admin/issues](https://github.com/rushikeshsakharleofficial/sys-admin/issues).

For a **bug report**, include:
- Which skill was invoked
- What Claude did vs. what you expected
- The prompt you used

For a **feature request**, describe the domain gap and what a new skill would cover.

---

## License

By contributing, you agree your contributions are released under the [MIT License](LICENSE) that covers this project.
