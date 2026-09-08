import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react"
import type { BoardItem, Operation } from "../../../shared/board"

export type ItemNode = Node<{ item: BoardItem }, "item">

/** Local gestures are previews. Only completed geometry changes become commands. */
export default class CanvasNodes {
  public value: ItemNode[] = []

  public receive(items: BoardItem[]) {
    const previous = new Map(this.value.map(node => [node.id, node]))
    this.value = items.map(item => {
      const old = previous.get(item.identity)
      if (old?.dragging || old?.resizing) return old
      return { id: item.identity, type: "item", data: { item }, position: { x: item.x, y: item.y },
        width: item.width, height: item.height, selected: old?.selected ?? false }
    })
  }

  public change(changes: NodeChange<ItemNode>[]): Operation[] {
    this.value = applyNodeChanges(changes, this.value)
    const finished = new Set(changes.flatMap(change =>
      (change.type === "position" && change.dragging === false) || (change.type === "dimensions" && change.resizing === false) ? [change.id] : []))
    return this.value.filter(node => finished.has(node.id)).flatMap(node => {
      const item = node.data.item
      const geometry = { x: node.position.x, y: node.position.y, width: node.width ?? item.width, height: node.height ?? item.height }
      if (geometry.x === item.x && geometry.y === item.y && geometry.width === item.width && geometry.height === item.height) return []
      return [{ action: "item.update", identity: item.identity, revision: item.revision, patch: geometry }]
    })
  }
}
