---
name: code-real-builder
description: Use when asked to test, QA, audit, or validate any part of a codebase — UI, security, backend APIs, performance, accessibility, user experience, backtesting, or cross-browser behavior.
---

# Code Real Builder

## Overview

Unified testing skill. All domains inside this one skill directory. Pick domain, load its reference file.

## Domain Routing

| Testing target | Load |
|----------------|------|
| Website / web app — layout, a11y, forms, network, security, responsive, SEO, CSRF, auth, flow bypass, 46 helpers | `@ui-deep-qa.md` |
| Backend REST/GraphQL — contracts, auth headers, rate limits, error handling, schema validation | `backend.md` *(planned)* |
| Security — OWASP top 10, secrets scan, dep CVEs, injection, header/cookie audit | `security.md` *(planned)* |
| Test quality — coverage gaps, flaky tests, assertion quality, mutation score | `test-quality.md` *(planned)* |
| Trading strategies — backtesting, P&L, lookahead bias, signal validation | `backtest.md` *(planned)* |
| User flows — onboarding completion, drop-off, rage clicks, session analysis | `ux.md` *(planned)* |
| Frontend components — prop contracts, render regression, Storybook parity | `frontend.md` *(planned)* |
| Deploy & infra — env var hygiene, secrets in CI logs, rollback readiness | `infra.md` *(planned)* |

## How to Use

1. Match target to domain table above.
2. Load domain file (e.g. `@ui-deep-qa.md`).
3. Follow that file's instructions exactly.

For UI/web testing → load `@ui-deep-qa.md`. Contains full mission, 46-helper catalog, screenshot protocol, defect format, report spec.

## Adding a New Domain

Create `~/.claude/skills/code-real-builder/<domain>.md`, add row to routing table above, add rsync line to `install.sh` in repo.
