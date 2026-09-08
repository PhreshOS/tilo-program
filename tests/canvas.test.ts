import { describe, expect, it } from "vitest"
import CanvasNodes from "../client/view/canvas/nodes"
import type { BoardItem } from "../shared/board"

const item: BoardItem = { identity: "dd9b9330-6bb9-4357-b80c-c021e4ff8f36", revision: 4, kind: "card", text: "Idea", color: "amber", x: 10, y: 20, width: 200, height: 140 }
function canvas() { const state = new CanvasNodes(); state.receive([item]); return state }

describe("Canvas geometry", () => {
  it("keeps drag previews local and commits only the final geometry", () => {
    const state = canvas()
    expect(state.change([{ type: "position", id: item.identity, position: { x: 30, y: 40 }, dragging: true }])).toEqual([])
    expect(state.change([{ type: "position", id: item.identity, position: { x: 50, y: 60 }, dragging: false }])).toEqual([
      { action: "item.update", identity: item.identity, revision: 4, patch: { x: 50, y: 60, width: 200, height: 140 } }
    ])
  })
  it("commits keyboard movement through the same geometry contract", () => {
    const state = canvas()
    expect(state.change([{ type: "position", id: item.identity, position: { x: 15, y: 20 }, dragging: false }])[0]).toMatchObject({ patch: { x: 15 }, revision: 4 })
  })
  it("ignores measurements but commits a completed resize including its position", () => {
    const state = canvas()
    expect(state.change([{ type: "dimensions", id: item.identity, dimensions: { width: 200, height: 140 } }])).toEqual([])
    expect(state.change([
      { type: "position", id: item.identity, position: { x: 5, y: 15 } },
      { type: "dimensions", id: item.identity, dimensions: { width: 205, height: 145 }, resizing: true, setAttributes: true }
    ])).toEqual([])
    expect(state.change([{ type: "dimensions", id: item.identity, dimensions: { width: 205, height: 145 }, resizing: false }])[0])
      .toMatchObject({ revision: 4, patch: { x: 5, y: 15, width: 205, height: 145 } })
  })
  it("preserves the gesture's starting revision if another writer edits that item", () => {
    const state = canvas()
    state.change([{ type: "position", id: item.identity, position: { x: 30, y: 40 }, dragging: true }])
    state.receive([{ ...item, revision: 5, text: "Remote change" }])
    const operations = state.change([{ type: "position", id: item.identity, position: { x: 50, y: 60 }, dragging: false }])
    expect(operations[0]).toMatchObject({ revision: 4 })
    state.receive([{ ...item, revision: 5, text: "Remote change" }])
    expect(state.value[0].position).toEqual({ x: 10, y: 20 })
    expect(state.value[0].data.item.text).toBe("Remote change")
  })
  it("does not commit selection, unchanged geometry, or deleted targets", () => {
    const state = canvas()
    expect(state.change([{ type: "select", id: item.identity, selected: true }])).toEqual([])
    expect(state.change([{ type: "position", id: item.identity, position: { x: 10, y: 20 }, dragging: false }])).toEqual([])
    state.receive([])
    expect(state.change([{ type: "position", id: item.identity, position: { x: 20, y: 30 }, dragging: false }])).toEqual([])
  })
})
