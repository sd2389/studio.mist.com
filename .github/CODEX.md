# Codex PR review (ChatGPT)

This repository uses **ChatGPT Codex** via the GitHub App **`chatgpt-codex-connector`** (not a GitHub Actions workflow, not `OPENAI_API_KEY`).

## Mist SoT

Full notes live in the vault: `mist-vault/05-Operations/Codex-code-review.md`  
Canonical working example: **`sd2389/studio.mist.com`** (bot reviews on PRs).

## Enable (one-time per remote)

1. Install/configure the App: https://github.com/apps/chatgpt-codex-connector/installations/new — grant this repo.
2. Codex settings: https://chatgpt.com/codex/cloud/settings/general — turn on **Automatic review** for this repository.
3. Open a PR (or comment `@codex review`) — expect `chatgpt-codex-connector[bot]` to post a review.

## Triggers

- PR opened / draft marked ready (Automatic review, when enabled)
- Manual: `@codex review` or `@codex security review` on the PR

Direct pushes to `main` without a PR are outside this App surface. Prefer PRs for swarm / agent branches.

## Swarm / ecosystem TODO

Codex is an automated PR safety net. Ecosystem task YAML `REVIEW` → `DONE` stays **coordinator-owned** — Codex does not mark tasks done.

## Do not

- Add DevJewels deploy secrets or DJ remotes for “review”
- Invent a parallel `openai/codex-action` + `OPENAI_API_KEY` workflow unless Mist SoT explicitly switches off the App path
