import { afterEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Boards from "../server/core/boards"
import Application from "../client/core/application"
import type { BoardAPI, BoardChange, BoardRequests, ItemInput, Operation } from "../shared/board"

const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close() })
function store() { const boards = new Boards(":memory:"); cleanup.push(() => boards.close()); return boards }
function card(text = "Idea"): ItemInput {
  return { identity: randomUUID(), kind: "card", text, color: "amber", x: 0, y: 0, width: 200, height: 140 }
}
function edit(boards: Boards, board: string, ...operations: Operation[]) {
  return boards.apply({ board, request: randomUUID(), operations })
}
function api(boards: Boards): BoardAPI {
  const handlers: { [Event in keyof BoardRequests]: (input: BoardRequests[Event]["input"]) => BoardRequests[Event]["output"] } = {
    "board.list": () => boards.list(), "board.create": input => boards.create(input),
    "board.read": input => boards.read(input), "board.rename": input => boards.rename(input),
    "board.delete": input => boards.delete(input), "board.apply": input => boards.apply(input), "board.history": input => boards.history(input)
  }
  return {
    async request<Event extends keyof BoardRequests>(event: Event, input: BoardRequests[Event]["input"]) { return handlers[event](input) },
    subscribe: receive => boards.subscribe(receive)
  }
}

describe("Board authority", () => {
  it("persists boards, content, revisions, and structured history across restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "board-test-"))
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
    const path = join(directory, "boards.sqlite")
    const first = new Boards(path)
    const board = first.create({ title: "Research" })
    const saved = edit(first, board.identity, { action: "item.add", item: card() })
    first.close()
    const second = new Boards(path)
    cleanup.push(() => second.close())
    expect(second.read({ board: board.identity })).toEqual(saved)
    expect(second.list()[0]).toMatchObject({ title: "Research", items: 1, revision: 1 })
    expect(second.history({ board: board.identity }).map(entry => entry.operation)).toEqual([
      { action: "board.create", title: "Research" }, [{ action: "item.add", item: expect.objectContaining({ text: "Idea" }) }]
    ])
  })

  it("accepts simultaneous disjoint edits and rejects stale edits to the same item", () => {
    const boards = store(), board = boards.create({ title: "Shared" }), a = card(), b = card()
    edit(boards, board.identity, { action: "item.add", item: a }, { action: "item.add", item: b })
    edit(boards, board.identity, { action: "item.update", identity: a.identity, revision: 1, patch: { x: 90 } })
    const result = edit(boards, board.identity, { action: "item.update", identity: b.identity, revision: 1, patch: { text: "Agent edit" } })
    expect(result.items.map(item => [item.x, item.text])).toEqual([[90, "Idea"], [0, "Agent edit"]])
    expect(() => edit(boards, board.identity, { action: "item.update", identity: a.identity, revision: 1, patch: { text: "Stale" } })).toThrow("CONFLICT")
    expect(boards.read({ board: board.identity })).toEqual(result)
  })

  it("rolls back the entire failed batch and publishes only committed changes", () => {
    const boards = store(), board = boards.create({ title: "Atomic" }), changes: BoardChange[] = [], item = card()
    boards.subscribe(change => changes.push(change))
    expect(() => edit(boards, board.identity, { action: "item.add", item }, { action: "item.remove", identity: randomUUID(), revision: 0 })).toThrow("ITEM_NOT_FOUND")
    expect(boards.read({ board: board.identity })).toEqual(board)
    expect(changes).toEqual([])
    edit(boards, board.identity, { action: "item.add", item })
    expect(changes).toHaveLength(1)
    expect(changes[0].snapshot?.items).toHaveLength(1)
  })

  it("checks connection endpoints and removes incident connections with their item", () => {
    const boards = store(), board = boards.create({ title: "Links" }), a = card(), b = card()
    const connection = { identity: randomUUID(), from: a.identity, to: b.identity, label: "leads to" }
    const connected = edit(boards, board.identity, { action: "item.add", item: a }, { action: "item.add", item: b }, { action: "connection.add", connection })
    expect(connected.connections[0]).toMatchObject({ label: "leads to", revision: 1 })
    expect(() => edit(boards, board.identity, { action: "connection.add", connection: { ...connection, identity: randomUUID(), to: a.identity } })).toThrow("INVALID_CONNECTION")
    const result = edit(boards, board.identity, { action: "item.remove", identity: a.identity, revision: 1 })
    expect(result.connections).toEqual([])
    expect(result.items).toHaveLength(1)
  })

  it("deduplicates retries and rejects reuse of a request for different operations", () => {
    const boards = store(), board = boards.create({ title: "Retries" })
    const request = { board: board.identity, request: randomUUID(), operations: [{ action: "item.add", item: card() }] }
    const first = boards.apply(request)
    expect(boards.apply(request)).toEqual(first)
    expect(() => boards.apply({ ...request, operations: [{ action: "item.add", item: card() }] })).toThrow("REQUEST_REUSED")
    expect(boards.history({ board: board.identity })).toHaveLength(2)
  })

  it("does not accept an old revision after removing and recreating an item identity", () => {
    const boards = store(), board = boards.create({ title: "Revisions" }), item = card()
    edit(boards, board.identity, { action: "item.add", item })
    edit(boards, board.identity, { action: "item.remove", identity: item.identity, revision: 1 })
    edit(boards, board.identity, { action: "item.add", item })
    expect(() => edit(boards, board.identity, { action: "item.update", identity: item.identity, revision: 1, patch: { text: "Old edit" } })).toThrow("CONFLICT")
  })

  it("validates consumed inputs and bounds while ignoring additional properties", () => {
    const boards = store(), board = boards.create({ title: "Validation" })
    expect(() => boards.create({ title: " " })).toThrow()
    expect(boards.create({ title: "Board", extension: true }).title).toBe("Board")
    expect(() => boards.list({ extension: true })).toThrow()
    for (const width of [0, NaN, Infinity, 4001]) {
      expect(() => edit(boards, board.identity, { action: "item.add", item: { ...card(), width } })).toThrow()
    }
    expect(() => boards.apply({ board: board.identity, request: randomUUID(), operations: [] })).toThrow()
    expect(() => boards.apply({ board: board.identity, request: randomUUID(), operations: Array.from({ length: 101 }, () => ({ action: "item.add", item: card() })) })).toThrow()
  })

  it("guards rename and deletion using the current Board revision", () => {
    const boards = store(), board = boards.create({ title: "Before" })
    const renamed = boards.rename({ board: board.identity, revision: 0, title: "After" })
    expect(renamed.title).toBe("After")
    expect(() => boards.delete({ board: board.identity, revision: 0 })).toThrow("CONFLICT")
    expect(boards.delete({ board: board.identity, revision: 1 })).toBeNull()
    expect(boards.list()).toEqual([])
    expect(() => boards.read({ board: board.identity })).toThrow("BOARD_NOT_FOUND")
  })
})

describe("Live Client projection", () => {
  it("keeps two representations synchronized through the same API", async () => {
    const boards = store(), port = api(boards), first = new Application(port), second = new Application(port)
    cleanup.push(() => { first.dispose(); second.dispose() })
    await Promise.all([first.start(), second.start()])
    await first.create("Together")
    const identity = first.snapshot().board!.identity
    await second.open(identity)
    const a = card("User"), b = card("Agent")
    await first.apply([{ action: "item.add", item: a }, { action: "item.add", item: b }])
    await Promise.all([
      first.apply([{ action: "item.update", identity: a.identity, revision: 1, patch: { x: 200 } }]),
      second.apply([{ action: "item.update", identity: b.identity, revision: 1, patch: { text: "Updated" } }])
    ])
    expect(first.snapshot().board).toEqual(second.snapshot().board)
    expect(first.snapshot().board?.revision).toBe(3)
    await expect(second.apply([{ action: "item.update", identity: a.identity, revision: 1, patch: { x: 900 } }])).rejects.toThrow("CONFLICT")
    expect(second.snapshot().error).toContain("CONFLICT")
    expect(first.snapshot().board).toEqual(second.snapshot().board)
  })

  it("does not resurrect a deleted Board from a late mutation response", async () => {
    const boards = store(), port = api(boards)
    let release!: () => void
    const delayed: BoardAPI = { ...port, async request(event, input) {
      const result = await port.request(event, input)
      if (event === "board.apply") await new Promise<void>(resolve => { release = resolve })
      return result
    } }
    const client = new Application(delayed)
    cleanup.push(() => client.dispose())
    await client.start(); await client.create("Delete race")
    const identity = client.snapshot().board!.identity
    const saving = client.apply([{ action: "item.add", item: card() }])
    await Promise.resolve()
    boards.delete({ board: identity, revision: 1 })
    release(); await saving
    expect(client.snapshot().boards).toEqual([])
    expect(client.snapshot().board).toBeNull()
  })

  it("replays events arriving while the initial catalog is loading", async () => {
    const boards = store(), port = api(boards)
    let release!: () => void
    const delayed: BoardAPI = { ...port, async request(event, input) {
      const result = await port.request(event, input)
      if (event === "board.list") await new Promise<void>(resolve => { release = resolve })
      return result
    } }
    const client = new Application(delayed)
    cleanup.push(() => client.dispose())
    const loading = client.start()
    await Promise.resolve()
    const board = boards.create({ title: "During loading" })
    release(); await loading
    expect(client.snapshot().boards[0]?.identity).toBe(board.identity)
  })
})
