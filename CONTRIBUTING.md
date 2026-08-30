# Contributing

Mist Studio is a public source repository with a protected review workflow. Direct changes to `main` are not part of the contribution process.

## Required workflow

1. Fork the repository or create a feature branch if you have write access.
2. Keep each change narrowly scoped.
3. Open a pull request against `main`.
4. Explain the problem, implementation, tests, security impact, and rollback considerations.
5. Do not merge until required CI checks pass and required review is complete.

## Before opening a pull request

Run:

```bash
npm ci
npm run lint
npm run check:boundaries
npm test
npm run build
```

For rendering changes, also run the relevant golden/render tests.

Backend changes must include or update tests when behavior changes and must preserve Alembic migration correctness.

## Pull-request rules

- No direct commits to `main`.
- No force pushes to protected branches.
- No merge while required checks are failing or pending.
- No secrets, real credentials, customer data, proprietary assets, or production dumps.
- No disabling tests, lint rules, type checks, security checks, or architectural boundaries merely to make CI pass.
- No broad dependency additions without justification.
- No unrelated refactors in feature/fix PRs.
- Security-sensitive changes require explicit reviewer attention.
- Changes to authentication, authorization, billing/credits, storage, upload handling, rendering workers, CI/CD, or deployment configuration must document failure and rollback behavior.

## Engineering expectations

Prefer root-cause fixes over workarounds. Preserve service boundaries. Treat API inputs and uploaded files as untrusted. Keep operations idempotent where retries are possible. Avoid logging secrets, access tokens, signed URLs, or sensitive user content.

## Commit and PR quality

Use descriptive commit messages and keep generated/build artifacts out of commits unless the repository intentionally tracks them.

A pull request may be closed if it is unsafe, untested, excessively broad, unrelated to the project, or cannot be maintained.