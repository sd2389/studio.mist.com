## Summary

Describe what changed and why.

## Scope

- [ ] Change is narrowly scoped
- [ ] No unrelated refactors are included

## Validation

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run check:boundaries`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Rendering/golden tests run when relevant
- [ ] Backend tests/migrations validated when relevant

## Security / privacy

- [ ] No secrets, credentials, customer data, private assets, or production dumps are included
- [ ] Authentication/authorization impact reviewed
- [ ] Upload/file-processing risks reviewed where applicable
- [ ] Logs do not expose tokens, signed URLs, or sensitive content

## Reliability

- [ ] Retry/idempotency behavior considered
- [ ] Failure behavior considered
- [ ] Rollback or recovery path described for risky changes

## Screenshots / evidence

Add screenshots, test output, or benchmark evidence when useful.

## Notes for reviewer

Call out security-sensitive, architectural, billing, storage, worker, or deployment changes explicitly.