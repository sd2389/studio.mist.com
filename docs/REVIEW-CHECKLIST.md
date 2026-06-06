# PR review checklist (architecture)

- [ ] Business logic not buried in Next route handlers or FastAPI routers without passing through a service.
- [ ] New code respects feature boundaries (`@/features/*` barrels).
- [ ] Function names read like plain English.
- [ ] No duplicated normalization/rules—prefer shared domain module.
- [ ] Lint + typecheck pass; `npm run check:boundaries` passes; touched flows smoke-tested when feasible (see `QUALITY-GATES.md`).
- [ ] Breaking folder/API changes noted in PR description; ADR added if structural.
