# Security Policy

## Supported code

Only the latest `main` branch is supported.

## Reporting a vulnerability

Do **not** open a public issue for suspected vulnerabilities, leaked credentials, authentication bypasses, access-control flaws, or other sensitive security problems.

Report security issues privately to the repository owner through GitHub's private vulnerability reporting feature when available.

Please include:

- affected component and version/commit
- reproduction steps
- impact assessment
- proof of concept, if safe to share
- suggested remediation, if known

## Secrets and credentials

This repository must never contain production credentials, API tokens, private keys, customer data, database dumps, or environment files containing real secrets.

Only sanitized placeholders may appear in `.env.example` and documentation.

If a secret is accidentally committed, treat it as compromised: revoke/rotate it immediately, then remove it from the repository and history where appropriate.

## Dependency and supply-chain security

Changes that add or substantially upgrade dependencies should explain why the dependency is required. Security-sensitive dependency updates should be prioritized and validated through CI before merge.
