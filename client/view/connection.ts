import { context, system } from "@phreshos/client"
import { boardRequest, type BoardAPI, type BoardEvents, type BoardRequests } from "../../shared/board"
import Application from "../core/application"

/** The Client SDK adapter is outside the Tilo application's contract. */
export function connect() {
  const service = system.service<BoardEvents>({ program: "tilo", process: "tilo-server", endpoint: "server" })
  async function ready() {
    if (!await service.exists()) {
      const program = await context.program()
      await program.process.findOrCreate({ name: "tilo-server", server: { service: true }, client: false })
    }
    await service.waitReady(30_000)
  }
  const api: BoardAPI = {
    async request<Event extends keyof BoardRequests>(event: Event, input: BoardRequests[Event]["input"]) {
      await ready()
      return service.timeout(15_000).ask<BoardRequests[Event]["output"]>(event, input)
    },
    subscribe(receive) { return service.subscribe("board.changed", receive) }
  }
  const application = new Application(api)
  const stop = service.lifecycle.subscribe("stop", () => application.disconnected())
  const start = service.lifecycle.subscribe("start", () => { void application.start() })
  void application.start().then(async () => {
    const identity = await context.option("board")
    if (identity) await application.open(boardRequest.parse({ board: identity }).board)
  }).catch(error => application.failed(error))
  return { application, dispose() { stop(); start(); application.dispose() } }
}
