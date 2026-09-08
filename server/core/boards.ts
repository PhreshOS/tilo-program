import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { applyRequest, createRequest, renameRequest, deleteRequest, listRequest, boardRequest, historyRequest, historyOperation, snapshot, summary,
  type BoardSnapshot, type BoardChange, type BoardItem, type BoardConnection, type HistoryEntry } from "../../shared/board"

/** Board authority: atomic persistence, optimistic revisions, and committed changes. */
export default class Boards {
  private readonly database: DatabaseSync
  private readonly events = new EventEmitter()

  public constructor(path: string) {
    this.database = new DatabaseSync(path)
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS boards (identity TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history (
        board TEXT NOT NULL REFERENCES boards(identity) ON DELETE CASCADE,
        revision INTEGER NOT NULL, request TEXT, operation TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(board, revision), UNIQUE(board, request)
      );`)
  }

  public close() { this.database.close(); this.events.removeAllListeners() }
  public subscribe(receive: (change: BoardChange) => void) {
    this.events.on("change", receive)
    return () => { this.events.off("change", receive) }
  }

  public list(input?: unknown) {
    listRequest.parse(input)
    return this.database.prepare("SELECT data FROM boards").all()
      .map(row => summary(snapshot.parse(JSON.parse(String(row.data)))))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  public read(input: unknown): BoardSnapshot {
    const { board } = boardRequest.parse(input)
    const row = this.database.prepare("SELECT data FROM boards WHERE identity = ?").get(board)
    if (!row) throw new Error("BOARD_NOT_FOUND: This Board no longer exists")
    return snapshot.parse(JSON.parse(String(row.data)))
  }

  public create(input: unknown) {
    const { title } = createRequest.parse(input)
    const now = new Date().toISOString()
    const board: BoardSnapshot = { identity: randomUUID(), title, revision: 0, createdAt: now, updatedAt: now, items: [], connections: [] }
    this.transaction(() => {
      this.database.prepare("INSERT INTO boards VALUES (?, ?)").run(board.identity, JSON.stringify(board))
      this.record(board, null, JSON.stringify({ action: "board.create", title }))
    })
    this.publish(board)
    return board
  }

  public rename(input: unknown) {
    const request = renameRequest.parse(input)
    const board = this.transaction(() => {
      const board = this.read({ board: request.board })
      this.expectRevision(board, request.revision)
      board.title = request.title
      board.revision++
      board.updatedAt = new Date().toISOString()
      this.save(board, null, JSON.stringify({ action: "board.rename", title: request.title }))
      return board
    })
    this.publish(board)
    return board
  }

  public delete(input: unknown): null {
    const request = deleteRequest.parse(input)
    const board = this.transaction(() => {
      const board = this.read({ board: request.board })
      this.expectRevision(board, request.revision)
      this.database.prepare("DELETE FROM boards WHERE identity = ?").run(board.identity)
      return board
    })
    this.events.emit("change", { identity: board.identity, revision: board.revision + 1, snapshot: null } satisfies BoardChange)
    return null
  }

  public apply(input: unknown) {
    const request = applyRequest.parse(input)
    let committed = false
    const board = this.transaction(() => {
      const board = this.read({ board: request.board })
      const encoded = JSON.stringify(request.operations)
      const previous = this.database.prepare("SELECT operation FROM history WHERE board = ? AND request = ?").get(board.identity, request.request)
      if (previous) {
        if (previous.operation !== encoded) throw new Error("REQUEST_REUSED: Use a new request identity for different operations")
        return board
      }
      const next = board.revision + 1
      const items = new Map(board.items.map(item => [item.identity, item]))
      const connections = new Map(board.connections.map(edge => [edge.identity, edge]))
      for (const operation of request.operations) {
        switch (operation.action) {
          case "item.add":
            if (items.has(operation.item.identity)) throw new Error("ITEM_EXISTS: Choose a new item identity")
            items.set(operation.item.identity, { ...operation.item, revision: next })
            break
          case "item.update": {
            const item = this.find(items, operation.identity, operation.revision)
            items.set(item.identity, { ...item, ...operation.patch, revision: next })
            break
          }
          case "item.remove":
            this.find(items, operation.identity, operation.revision)
            items.delete(operation.identity)
            for (const [id, edge] of connections) if (edge.from === operation.identity || edge.to === operation.identity) connections.delete(id)
            break
          case "connection.add": {
            const edge = operation.connection
            if (connections.has(edge.identity)) throw new Error("CONNECTION_EXISTS: Choose a new connection identity")
            if (edge.from === edge.to || !items.has(edge.from) || !items.has(edge.to)) throw new Error("INVALID_CONNECTION: Two distinct existing items are required")
            connections.set(edge.identity, { ...edge, revision: next })
            break
          }
          case "connection.update": {
            const edge = this.find(connections, operation.identity, operation.revision)
            connections.set(edge.identity, { ...edge, label: operation.label, revision: next })
            break
          }
          case "connection.remove":
            this.find(connections, operation.identity, operation.revision)
            connections.delete(operation.identity)
            break
        }
      }
      board.items = [...items.values()]
      board.connections = [...connections.values()]
      board.revision = next
      board.updatedAt = new Date().toISOString()
      snapshot.parse(board)
      this.save(board, request.request, encoded)
      committed = true
      return board
    })
    if (committed) this.publish(board)
    return board
  }

  public history(input: unknown): HistoryEntry[] {
    const request = historyRequest.parse(input)
    this.read({ board: request.board })
    return this.database.prepare("SELECT revision, request, operation, created_at FROM history WHERE board = ? AND revision > ? ORDER BY revision LIMIT ?")
      .all(request.board, request.after, request.limit).map(row => ({
        revision: Number(row.revision), request: row.request === null ? null : String(row.request),
        operation: historyOperation.parse(JSON.parse(String(row.operation))), createdAt: String(row.created_at)
      }))
  }

  private find<T extends BoardItem | BoardConnection>(items: Map<string, T>, identity: string, revision: number): T {
    const item = items.get(identity)
    if (!item) throw new Error("ITEM_NOT_FOUND: The target no longer exists")
    this.expectRevision(item, revision)
    return item
  }
  private expectRevision(value: { revision: number }, expected: number) {
    if (value.revision !== expected) throw new Error(`CONFLICT: Expected revision ${expected}, current revision is ${value.revision}. Read the Board and reapply your intended change.`)
  }
  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE")
    try { const result = operation(); this.database.exec("COMMIT"); return result }
    catch (error) { this.database.exec("ROLLBACK"); throw error }
  }
  private save(board: BoardSnapshot, request: string | null, operation: string) {
    this.database.prepare("UPDATE boards SET data = ? WHERE identity = ?").run(JSON.stringify(board), board.identity)
    this.record(board, request, operation)
  }
  private record(board: BoardSnapshot, request: string | null, operation: string) {
    this.database.prepare("INSERT INTO history VALUES (?, ?, ?, ?, ?)").run(board.identity, board.revision, request, operation, board.updatedAt)
  }
  private publish(board: BoardSnapshot) {
    this.events.emit("change", { identity: board.identity, revision: board.revision, snapshot: board } satisfies BoardChange)
  }
}
