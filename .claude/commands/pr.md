---
description: Open a pull request with this repo's pre-flight checks — branch cut from current origin/master, production build + tests, a code-review pass on the diff, English-only body with no attribution lines.
argument-hint: [PR title hint]
---

Open a pull request for the current work, with this repository's pre-flight checks.

## Input
$ARGUMENTS — optional PR title hint. If empty, derive it from the commits.

---

## Step 1 - Branch hygiene

```bash
git fetch origin --quiet
git rev-parse --abbrev-ref HEAD
git merge-base --is-ancestor origin/master HEAD && echo "BASE OK" || echo "BASE STALE"
```

Rules:
- **Never open a PR from `master`** — merging to master deploys to production.
  If HEAD is `master`, stop and create a branch first.
- If the base is STALE — the branch was cut from an outdated `origin/master` —
  do **not** rebase. Create a fresh branch off current `origin/master` and
  re-apply the work there. One branch per PR.
- If the branch already has an open PR, this is an update, not a new PR — say so and stop.

---

## Step 2 - Gates

Run both, in this order, and stop at the first failure:

```bash
npm run build
npm test
```

`npm run build` is the production build (`ng build`) — a template/type error
that `ng serve` tolerates fails here, and master = production.

---

## Step 3 - Code review

Run the `code-review` skill on the branch diff at **medium** effort. Skip only
if the human explicitly said to, or if this exact diff was already reviewed in
this session — and say so in the report either way; never imply it ran when it
did not.

- **CONFIRMED correctness findings are a hard stop:** fix them (or get an
  explicit "ship anyway") before opening the PR.
- PLAUSIBLE and quality findings are advisory — list them in the report; fix
  the cheap, obvious ones, file the rest as follow-ups.
- Pay extra attention to this repo's conventions (CLAUDE.md +
  `.coderabbit.yaml` digest): standalone components, signals over
  BehaviorSubject, lazy routes, no SSR assumptions, typed ApiService against
  same-origin /api + /auth, no secrets in code.

This is the pre-publication pass. CodeRabbit (`.coderabbit.yaml`) reviews the
PR *after* it opens — this step is what catches problems while they are still
private.

---

## Step 4 - Compose the PR

Language: **English only** — title and body. The repo is public.

Body structure:

```
## What

<2-4 sentences: the problem, then the change. Lead with the user-visible effect,
not the file list.>

## Why

<the plan doc, design feedback or cross-repo work order that motivated it.>

## Testing

<what was added, and how it was verified — build, Vitest, manual check in the
browser if UI changed.>

## Notes

<API contract assumptions, follow-ups — or "none". Call out any dependency on
an unmerged job-hunter-api change explicitly.>
```

Do **not** add `Co-Authored-By` lines. Do not add a "Generated with" footer unless the human asks.

If routes, pages or conventions changed — update CLAUDE.md in the same branch before opening the PR.

---

## Step 5 - Push and open

```bash
git push -u origin HEAD
gh pr create --base master --title "<title>" --body "<body>"
```

Print the PR URL as a markdown link when done. Remember: merging deploys.

---

## Step 6 - Report

One short summary: branch, gates (pass/fail), code-review findings count (fixed / follow-up), PR link. If anything was skipped, say which and why — never imply a gate ran when it did not.
