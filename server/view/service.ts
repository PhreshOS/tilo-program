import { context } from "@phreshos/server"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import Boards from "../core/boards"

/** Binds the Board API to this Endpoint; no caller-specific operation syntax. */
export default async function serve() {
  if (await context.name() !== "tilo-server") throw new Error("Tilo's Server must run in the named tilo-server Process")
  const program = await context.program()
  const directory = await program.data.path()
  await mkdir(directory, { recursive: true })
  const boards = new Boards(join(directory, "boards.sqlite"))
  boards.subscribe(change => context.publish("board.changed", change))
  context.answer("board.list", message => boards.list(message.payload))
  context.answer("board.create", message => boards.create(message.payload))
  context.answer("board.read", message => boards.read(message.payload))
  context.answer("board.rename", message => boards.rename(message.payload))
  context.answer("board.delete", message => boards.delete(message.payload))
  context.answer("board.apply", message => boards.apply(message.payload))
  context.answer("board.history", message => boards.history(message.payload))
  process.once("exit", () => boards.close())
}
