# Tilo

A shared visual whiteboard for PhreshOS. People edit the canvas while agents
use the same Board API. Both work on the same persisted state in real time.

[Program contract](agent.md) · [PhreshOS documentation](https://docs.phreshos.com)

## Role

Tilo owns boards, items, connections, revisions, and history. Its Server is
the authority; each Client renders a live projection. Viewport, selection, and
unsaved editor drafts belong to that Client alone.

The canvas supports cards, text, rectangles, ellipses, directed connections,
multi-selection, dragging, resizing, color labels, zoom, and a minimap. The
inspector edits content and connection labels. Boards can be created, opened,
renamed, and deleted. Every committed edit is saved automatically.

## Development

Requires Node.js 24.15 or later, Bun, and a running PhreshOS System.

```sh
bun install --frozen-lockfile
bun run verify
bun run dev
```

Set `PHRESHOS_HOME` when connecting to a System using a custom home. Tilo does
not choose the System's home or port. Build and package independently with:

```sh
bun run build
bun run pack
```

The default launch opens a Client. It finds or creates the named
`tilo-server` Process, which runs only the Server and remains available after
a Client closes. Multiple Clients can open the same board. Launch a Client with
the string launch option `board` set to a Board identity to open it directly.

## Shared editing

Mutations use optimistic revisions. Edits to different items do not conflict
merely because the Board revision changed. Two stale edits to the same item
cannot silently overwrite each other: the second is rejected and the Client
refreshes the authoritative state. Text drafts are retained while being edited;
the inspector offers Reload when another writer changes the selected item.

An operation batch is atomic. Request identities make a repeated `board.apply`
safe to retry with the same payload. Board rename and deletion use the Board
revision because they act on the whole Board.

Data lives in `boards.sqlite` beneath the Program's data directory, including
revision history. Deleting a Board permanently deletes its content and history.
There is no undo, image upload, grouping, presence cursor, or offline editing in
this first version. The canvas supports up to 1,000 items and 3,000 connections
per Board; a batch contains at most 100 operations.

## Structure

- `shared/board.ts` defines the Program's validated contract.
- `server/core` owns persistence, validation, atomic edits, and revisions.
- `server/view` exposes that API through a Server Endpoint.
- `client/core` maintains the live projection and reconciles responses/events.
- `client/view` connects and renders it with React Flow and React UI defaults.
- `tests` exercises persistence, conflicts, rollback, retries, and live updates.

React Flow's nodes and edges are rendering details, not public Board entities.
No particular agent, CLI, or transport defines the Board contract.

`check` performs static checks, `build` creates distributable output, and `test`
runs Vitest assertions from `tests/`. Run `build` before testing built artifacts.
`verify` runs `check`, `build`, and `test` in order. Operational tooling belongs
in `scripts/`; tests and their fixtures belong in `tests/`. Verification uses
the committed dependency graph without local package substitutions.

## Related repositories

- [Core](https://github.com/PhreshOS/core) defines PhreshOS domain contracts.
- [Client](https://github.com/PhreshOS/client) and
  [Server](https://github.com/PhreshOS/server) connect the Program endpoints.
- [React](https://github.com/PhreshOS/react) adapts System and Desktop state.
- [React UI](https://github.com/PhreshOS/react-ui) supplies shared visual controls.
- [System](https://github.com/PhreshOS/system) runs the Program.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
