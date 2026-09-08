# Contributing

Tilo owns a shared visual-canvas domain, independent of its consumers.

## Development

```sh
bun install --frozen-lockfile
bun run verify
```

Keep Main → View → Core dependencies one-way. Shared contract changes must
include validation, relevant Server and Client changes, tests, and `agent.md`.
Use published dependencies only; this repository must build without sibling
repositories or a surrounding workspace. Keep generated files and runtime data
outside version control.

## Changes

Exercise simultaneous edits, stale revisions, atomic rollback, persistence,
and reconnect behavior when modifying collaboration. Preserve unsaved drafts
and never silently overwrite another writer. React Flow types stay in View;
the public contract contains only Board domain values. Use React UI defaults
for shared visual controls.
