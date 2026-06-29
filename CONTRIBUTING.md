# Contributing to Cortex

## Versioning — every merge bumps the version

Cortex follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). **Every merged
PR bumps the version and adds a `CHANGELOG.md` entry, in the same PR** — no exceptions:

- **Patch (`0.0.x`)** — a minor bug fix or a docs-only change.
- **Minor (`0.x.0`)** — a significant change, a new feature, or many changes at once.
- **Major (`x.0.0`)** — reserved for v1.0 and beyond.

Concretely, for any PR:

1. Bump `version` in [`package.json`](package.json).
2. Add a dated section to [`CHANGELOG.md`](CHANGELOG.md) under the new version
   (`### Added` / `### Changed` / `### Fixed`), and update the compare links at the bottom.
3. Tag the release on `main` once merged: `git tag vX.Y.Z && git push --tags`.

Why it matters: the dashboard's **self-update** shows the running version and flags when your
checkout is behind. Bumping on every merge means "update available → an actual version change"
every time — instead of an update that appears to do nothing.

## Docs ship with code

Same-repo docs — the README, this file, code comments, inline help — update in the **same PR**
as the change they describe. Documentation that "catches up later" drifts; keep it honest at
every increment.
