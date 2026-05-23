---
name: code-real-builder
description: Use when the testing domain is unclear, multiple domains apply at once (e.g. UI + security + backend), or the request is "test everything" / "full audit". For a single known domain, invoke the domain subskill directly instead.
---

# Code Real Builder

## Overview

Testing skill router. Use when the domain is ambiguous or multiple domains apply. For a single clear domain, go directly to that subskill — skipping this router is correct.

## When to Use This Skill vs Going Direct

| Situation | Action |
|-----------|--------|
| "Test our checkout page" — clearly UI | Go direct: `website-ui-deep-qa` |
| "Full audit — UI, APIs, and security" — multiple domains | Use this router first |
| "Test our app" — domain unclear | Use this router to pick the right subskill |
| "Run backend contract tests" — no backend subskill yet | Use this router, note gap |

## Domain Map

| Domain | Subskill | Status |
|--------|----------|--------|
| Website / web app — layout, a11y, forms, network, security, responsive, SEO, CSRF, auth, flow bypass, 46 helpers | `website-ui-deep-qa` | ✅ Active |
| Backend REST/GraphQL, API contracts, rate limits | — | Planned |
| Security deep dive — OWASP, dep CVEs, injection | — | Planned (partial: `website-ui-deep-qa` covers DOM security, headers, CSRF, auth) |
| Test quality — coverage, flaky tests, mutation | — | Planned |
| Backtesting — strategy, P&L, lookahead bias | — | Planned |
| User experience — flows, drop-off, rage clicks | — | Planned |
| Frontend components — contracts, render regression | — | Planned |
| Deploy & infra — env hygiene, secrets in CI | — | Planned |

## Active Subskill: UI / Web App

**REQUIRED SUB-SKILL:** Use `website-ui-deep-qa`

Invoke as: `/website-ui-deep-qa <user request or URL>`

Covers 46 helper categories. Supports Playwright MCP (live), Playwright Test (automated), source-code inspection.

**Partial coverage for planned domains:** DOM security, response leak scanning, CSRF, auth surface, network headers, and cookie audits are already in `website-ui-deep-qa`. For a deep security-only audit, note the gap and use what's available.
