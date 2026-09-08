import { z } from "zod"

const identity = z.uuid()
const revision = z.number().int().nonnegative()
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const size = z.number().finite().min(60).max(4000)
export const title = z.string().trim().min(1).max(120)
export const itemFields = z.strictObject({
  kind: z.enum(["card", "text", "rectangle", "ellipse"]),
  text: z.string().max(20_000),
  color: z.enum(["neutral", "blue", "green", "amber", "pink", "violet"]),
  x: coordinate, y: coordinate, width: size, height: size
})
export const itemInput = itemFields.extend({ identity })
export const item = itemInput.extend({ revision })
export const connectionInput = z.strictObject({ identity, from: identity, to: identity, label: z.string().max(200) })
export const connection = connectionInput.extend({ revision })
export const operation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("item.add"), item: itemInput }),
  z.strictObject({ action: z.literal("item.update"), identity, revision, patch: itemFields.partial().refine(value => Object.keys(value).length > 0, "An update must change at least one field") }),
  z.strictObject({ action: z.literal("item.remove"), identity, revision }),
  z.strictObject({ action: z.literal("connection.add"), connection: connectionInput }),
  z.strictObject({ action: z.literal("connection.update"), identity, revision, label: z.string().max(200) }),
  z.strictObject({ action: z.literal("connection.remove"), identity, revision })
])
export const listRequest = z.undefined()
export const boardRequest = z.strictObject({ board: identity })
export const createRequest = z.strictObject({ title })
export const renameRequest = boardRequest.extend({ title, revision })
export const deleteRequest = boardRequest.extend({ revision })
export const applyRequest = boardRequest.extend({ request: identity, operations: z.array(operation).min(1).max(100) })
export const historyRequest = boardRequest.extend({ after: z.number().int().min(-1).default(-1), limit: z.number().int().min(1).max(100).default(30) })
export const historyOperation = z.union([z.array(operation), z.strictObject({ action: z.enum(["board.create", "board.rename"]), title })])
export const snapshot = z.strictObject({
  identity, title, revision,
  createdAt: z.string(), updatedAt: z.string(),
  items: z.array(item).max(1000), connections: z.array(connection).max(3000)
})

export type BoardItem = z.infer<typeof item>
export type ItemInput = z.infer<typeof itemInput>
export type BoardConnection = z.infer<typeof connection>
export type Operation = z.infer<typeof operation>
export type ApplyRequest = z.infer<typeof applyRequest>
export type BoardSnapshot = z.infer<typeof snapshot>
export type BoardSummary = Omit<BoardSnapshot, "items" | "connections"> & { items: number }
export type BoardChange = { identity: string, revision: number, snapshot: BoardSnapshot | null }
export type HistoryEntry = { revision: number, request: string | null, operation: z.infer<typeof historyOperation>, createdAt: string }
export type BoardEvents = { "board.changed": BoardChange }

export interface BoardRequests {
  "board.list": { input: undefined, output: BoardSummary[] }
  "board.create": { input: z.infer<typeof createRequest>, output: BoardSnapshot }
  "board.read": { input: z.infer<typeof boardRequest>, output: BoardSnapshot }
  "board.rename": { input: z.infer<typeof renameRequest>, output: BoardSnapshot }
  "board.delete": { input: z.infer<typeof deleteRequest>, output: null }
  "board.apply": { input: ApplyRequest, output: BoardSnapshot }
  "board.history": { input: z.input<typeof historyRequest>, output: HistoryEntry[] }
}

export interface BoardAPI {
  request<Event extends keyof BoardRequests>(event: Event, input: BoardRequests[Event]["input"]): Promise<BoardRequests[Event]["output"]>
  subscribe(receive: (change: BoardChange) => void): () => void
}

export function summary(board: BoardSnapshot): BoardSummary {
  const { connections: _, items, ...metadata } = board
  return { ...metadata, items: items.length }
}
