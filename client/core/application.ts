import { summary, type BoardAPI, type BoardChange, type BoardSnapshot, type BoardSummary, type Operation } from "../../shared/board"

export interface ApplicationState {
  status: "connecting" | "ready" | "failed"
  boards: BoardSummary[]
  board: BoardSnapshot | null | undefined
  pending: number
  error: string | null
}

/** A live Board projection. Selection and navigation remain local to this Client. */
export default class Application {
  private state: ApplicationState = { status: "connecting", boards: [], board: null, pending: 0, error: null }
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void
  private selected: string | null = null
  private selection = 0
  private disposed = false
  private buffered: BoardChange[] | null = null
  private loading: Promise<void> | null = null
  private readonly revisions = new Map<string, number>()
  public constructor(private readonly api: BoardAPI) {
    this.unsubscribe = api.subscribe(change => { this.buffered?.push(change); this.receive(change) })
  }
  public readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  public readonly snapshot = () => this.state
  public dispose() { this.disposed = true; this.unsubscribe(); this.listeners.clear() }
  public dismissError() { this.set({ error: null }) }
  public failed(error: unknown) { this.set({ error: String(error) }) }
  public disconnected() { this.set({ status: "failed", error: "Tilo Server disconnected. Reconnect before editing." }) }

  public start(): Promise<void> {
    if (this.loading) return this.loading
    this.set({ status: "connecting", error: null })
    this.buffered = []
    const loading = this.api.request("board.list", undefined).then(async boards => {
      this.set({ boards, status: "ready" })
      for (const change of this.buffered ?? []) this.receive(change)
      if (this.selected) await this.open(this.selected)
    }).catch(error => { this.set({ status: "failed", error: String(error) }) }).finally(() => {
      this.buffered = null
      this.loading = null
    })
    this.loading = loading
    return loading
  }

  public async open(identity: string) {
    const selection = ++this.selection
    this.selected = identity
    this.set({ board: undefined })
    try {
      const board = await this.api.request("board.read", { board: identity })
      if (selection === this.selection && this.selected === identity) this.receive({ identity, revision: board.revision, snapshot: board })
    } catch (error) {
      if (selection === this.selection) this.set({ board: null, error: String(error) })
    }
  }

  public async create(title: string) {
    return this.work(async () => {
      const board = await this.api.request("board.create", { title })
      this.selection++
      this.selected = board.identity
      this.receive({ identity: board.identity, revision: board.revision, snapshot: board })
    })
  }
  public async rename(title: string) {
    const board = this.current()
    return this.work(async () => {
      const next = await this.api.request("board.rename", { board: board.identity, revision: board.revision, title })
      this.receive({ identity: next.identity, revision: next.revision, snapshot: next })
    })
  }
  public async delete() {
    const board = this.current()
    return this.work(async () => {
      await this.api.request("board.delete", { board: board.identity, revision: board.revision })
      this.receive({ identity: board.identity, revision: board.revision + 1, snapshot: null })
    })
  }
  public async apply(operations: Operation[]) {
    const board = this.current()
    return this.work(async () => {
      try {
        const next = await this.api.request("board.apply", { board: board.identity, request: crypto.randomUUID(), operations })
        this.receive({ identity: next.identity, revision: next.revision, snapshot: next })
      } catch (error) {
        // Reconcile failed optimistic gestures, but never automatically retry stale edits.
        const current = await this.api.request("board.read", { board: board.identity }).catch(() => null)
        if (current) this.receive({ identity: current.identity, revision: current.revision, snapshot: current })
        throw error
      }
    })
  }
  private current() {
    if (this.state.status !== "ready" || !this.state.board) throw new Error("Open a connected Board first")
    return this.state.board
  }
  private async work<T>(operation: () => Promise<T>) {
    this.set({ pending: this.state.pending + 1, error: null })
    try { return await operation() }
    catch (error) { this.set({ error: String(error) }); throw error }
    finally { this.set({ pending: this.state.pending - 1 }) }
  }
  private receive(change: BoardChange) {
    if ((this.revisions.get(change.identity) ?? -1) > change.revision) return
    this.revisions.set(change.identity, change.revision)
    const boards = this.state.boards.filter(board => board.identity !== change.identity)
    if (change.snapshot) boards.push(summary(change.snapshot))
    boards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const patch: Partial<ApplicationState> = { boards }
    if (this.selected === change.identity) {
      if (!this.state.board || this.state.board.revision <= change.revision) patch.board = change.snapshot
      if (!change.snapshot) { this.selected = null; this.selection++ }
    }
    this.set(patch)
  }
  private set(patch: Partial<ApplicationState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}
