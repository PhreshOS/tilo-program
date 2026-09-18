# Tilo

Tilo is a persistent, shared visual canvas. Its domain contains Boards, items,
and directed connections. Use this contract to read and edit the same state
that people see. It does not require a Client to be open.

## Service

Program identity: `tilo`. Server Process name: `tilo-server`.
Find or create that named Process with the Server enabled as a service and the
Client disabled. Address its Server Service and wait until ready before asking
the operations below. Do not launch an unnamed Server: one named authority owns
the shared database. Opening Clients does not create additional authorities.

To display a Board, create a Client-only Process of this Program with its launch
`options.board` set to the Board identity. A Client can also choose a Board from
its library. No Client is required for API operations.

## Execute interface

Expose Tilo through the shared Execute request contract. Resolve its
authoritative Server with:

```json
{
  "$domain": "process",
  "$operation": "findOrCreate",
  "program": "tilo",
  "launch": {
    "name": "tilo-server",
    "server": { "service": true },
    "client": false
  }
}
```

Send every operation below through `endpoint.ask` using `program: "tilo"`,
`process: "tilo-server"`, `endpoint: "server"`, the documented request name as
`event`, and its payload as `input`.

## Operations

Request payloads are objects. Unknown fields and invalid values are rejected.
Identities are UUID strings. Timestamps are ISO strings. Revisions are
nonnegative integers.

| Request | Payload | Result |
| --- | --- | --- |
| `board.list` | No payload | `BoardSummary[]`, newest update first |
| `board.create` | `{ title }` | Created `Board` |
| `board.read` | `{ board }` | Current `Board` |
| `board.rename` | `{ board, revision, title }` | Updated `Board` |
| `board.delete` | `{ board, revision }` | `null` |
| `board.apply` | `{ board, request, operations }` | Current committed `Board` |
| `board.history` | `{ board, after?, limit? }` | `HistoryEntry[]` |

`board` identifies the Board. Titles are trimmed, nonempty, and at most 120
characters. Creation generates the Board identity and starts at revision 0.
Rename and deletion require the current Board revision. Deletion is permanent
and removes associated history; obtain the user's intent before deleting work.

History is ordered by increasing revision, strictly after `after` (default
`-1`, including creation). `limit` defaults to 30 and is bounded to 1–100.
Continue with the last returned revision. History is an audit trail, not an undo
or replay API.

## Board values

```ts
Board = {
  identity, title, revision, createdAt, updatedAt,
  items: Item[],
  connections: Connection[]
}

Item = {
  identity, revision,
  kind: "card" | "text" | "rectangle" | "ellipse",
  text, color: "neutral" | "blue" | "green" | "amber" | "pink" | "violet",
  x, y, width, height
}

Connection = { identity, revision, from, to, label }
```

`BoardSummary` contains Board metadata and `items` as a count, without a
connections field. `HistoryEntry` contains `{ revision, request, operation,
createdAt }`. Its `request` is the batch UUID or `null` for Board metadata edits.
`operation` is an array of applied item/connection operations or
`{ action: "board.create" | "board.rename", title }`.

Item coordinates refer to the canvas, not the screen: `x` increases rightward,
`y` downward, both finite and within −1,000,000 to 1,000,000. Width and height
are finite, within 60–4,000. Text has at most 20,000 characters; connection
labels have at most 200. Colors are content labels independent of the active
System theme. A Board contains at most 1,000 items and 3,000 connections.

## Atomic edits

`board.apply` takes a caller-generated UUID `request` and 1–100 ordered
operations. The whole batch commits once, increments the Board revision once,
and publishes one change. Any invalid operation rejects the entire batch.

| Action | Fields besides `action` |
| --- | --- |
| `item.add` | `item`: every Item field except `revision` |
| `item.update` | `identity`, expected item `revision`, nonempty `patch` |
| `item.remove` | `identity`, expected item `revision` |
| `connection.add` | `connection`: every Connection field except `revision` |
| `connection.update` | `identity`, expected connection `revision`, `label` |
| `connection.remove` | `identity`, expected connection `revision` |

An item patch may contain `kind`, `text`, `color`, `x`, `y`, `width`, or `height`.
Connection endpoints are two distinct existing item identities. Items added
earlier in a batch can be connected later in that batch. Removing an item also
removes its incident connections; do not remove them a second time explicitly.
Added or changed entities receive the new Board revision. Combine changes to
one existing item into one patch rather than repeating its old revision in
several operations.

Retry an uncertain `board.apply` using the **same request UUID and operations**.
It will not apply twice and returns the current Board, which may already include
later edits. Reusing that UUID for different operations rejects with
`REQUEST_REUSED`. Use a new UUID for a new intended edit. Other mutations do not
provide this retry deduplication.

## Live changes and conflicts

Subscribe to `board.changed` before listing or reading. The payload is:

```ts
{ identity, revision, snapshot: Board | null }
```

`null` means deletion. Retain the highest revision seen for each identity,
including deleted Boards; ignore older responses or events. Buffer events
during the initial list and replay them after it resolves. On reconnection,
read the catalog and selected Board again. Events are live, not durable replay.

Edits to unrelated items can proceed concurrently. If an entity's expected
revision is stale, `CONFLICT` rejects the edit without overwriting existing
work. Read the Board and reconsider the intended patch; do not blindly retry
with a newer revision. Board rename and deletion similarly guard the whole
Board revision. Missing targets reject with `BOARD_NOT_FOUND` or
`ITEM_NOT_FOUND`; duplicate identities reject with `ITEM_EXISTS` or
`CONNECTION_EXISTS`; invalid connection endpoints reject with
`INVALID_CONNECTION`. Schema errors describe invalid fields.

The Server owns content. Selection, viewport, and unsaved drafts remain local
to each Client. No operation moves another person's camera, changes their
selection, or impersonates their interaction.
