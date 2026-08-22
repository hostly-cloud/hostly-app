# Hostly — Agent Instructions

Hostly is a production SaaS POS platform for restaurants, bars and hospitality groups. Treat every change as production-sensitive.

## Read first
Before making product, architecture, data, UI or operational decisions, consult the canonical documentation in this order:

1. `docs/00_HOSTLY_PRODUCT_BIBLE.md`
2. `docs/11_HOSTLY_ENGINEERING_CONSTITUTION.md`
3. `docs/01_HOSTLY_ARCHITECTURE_GUIDE.md`
4. `docs/02_HOSTLY_DESIGN_SYSTEM.md`
5. The module-specific references under `docs/`

Cursor-specific standing rules also live in `.cursor/rules/hostly.mdc`. Do not contradict them.

## Non-negotiable rules
- One important change per iteration.
- Preserve multi-tenant isolation through `restaurantId` in auth, Firestore, Storage, server logic and UI.
- Do not break TPV, Carta, KDS, Reservas, Inventario, Firestore or production flows.
- Prefer the smallest safe change over broad refactors.
- Reuse existing components, hooks, utilities, types and services before creating new ones.
- Keep UI, business logic and data access separated where practical.
- Think first like a restaurant operator, then like a developer.
- Prioritize touch-first tablet/mobile operation, speed, few clicks and visual consistency.
- Do not commit, push, merge or deploy unless the user explicitly asks for that action.

## Before editing code
State briefly:
- specialist role
- objective understood
- main risk
- minimum proposed solution
- files to touch
- files explicitly out of scope

## Validation
Before declaring a task complete, run or explain why you could not run:
- `npx tsc --noEmit`
- `npm run build`
- relevant targeted tests for the changed module

For Firebase Rules, indexes, Auth, Storage or deployment-sensitive changes, always state whether a deploy is required, the exact command, and how to validate it.

## Completion report
Return:
- what changed
- what did not change
- files modified
- validation results
- remaining risks
- what the user should validate operationally

## AI-assisted modernization
When working on an existing area, do not assume the original implementation is still optimal. Proactively identify newer, safer or simpler approaches that are now practical with current tooling or AI capabilities, but do not silently expand scope. Propose such improvements separately unless they are necessary for the requested fix.

## Agent split
Default collaboration model:
- Cursor: functional logic, data flows, backend-facing behavior, operational fixes.
- Codex: visual/global consistency, broad UI-system changes, cross-cutting codebase review.
- ChatGPT: architecture, prioritization, repository-grounded review, PR/diff/CI auditing and coordination.

This split is a default, not a hard technical boundary. Use the tool best suited to the task while preserving the rules above.
