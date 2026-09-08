import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Background, Controls, Handle, MarkerType, MiniMap, NodeResizer, Position, ReactFlow, ReactFlowProvider,
  useEdgesState, useReactFlow, type Edge, type NodeProps, type OnSelectionChangeParams } from "@xyflow/react"
import { Button, Surface } from "@phreshos/react-ui"
import type Application from "../../core/application"
import type { BoardItem, BoardSnapshot, Operation } from "../../../shared/board"
import { ItemEditor, ConnectionEditor } from "../editor"
import useCommand from "../command"
import CanvasNodes, { type ItemNode } from "./nodes"

const nodeTypes = { item: ItemView }

function ItemView({ data, selected, isConnectable }: NodeProps<ItemNode>) {
  return <div className={`canvas-item ${data.item.kind} tint-${data.item.color}`}>
    <NodeResizer isVisible={selected && isConnectable} minWidth={60} minHeight={60} maxWidth={4000} maxHeight={4000} />
    <Handle type="target" position={Position.Left} />
    <p>{data.item.text || (data.item.kind === "text" ? "Text" : "")}</p>
    <Handle type="source" position={Position.Right} />
  </div>
}

export default function Canvas(props: { board: BoardSnapshot, application: Application, connected: boolean, pending: number }) {
  return <ReactFlowProvider><BoardCanvas {...props} /></ReactFlowProvider>
}

function BoardCanvas({ board, application, connected, pending }: { board: BoardSnapshot, application: Application, connected: boolean, pending: number }) {
  const command = useCommand(application)
  const [projection] = useState(() => new CanvasNodes())
  const [nodes, setNodes] = useState<ItemNode[]>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selection, setSelection] = useState<{ nodes: string[], edges: string[] }>({ nodes: [], edges: [] })
  const [minimap, setMinimap] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [name, setName] = useState(board.title)
  const viewport = useRef<HTMLDivElement>(null)
  const flow = useReactFlow<ItemNode>()
  const select = useCallback(({ nodes, edges }: OnSelectionChangeParams) => setSelection({ nodes: nodes.map(node => node.id), edges: edges.map(edge => edge.id) }), [])

  useEffect(() => {
    projection.receive(board.items)
    setNodes(projection.value)
    setEdges(previous => board.connections.map(edge => ({
      id: edge.identity, source: edge.from, target: edge.to, label: edge.label,
      markerEnd: { type: MarkerType.ArrowClosed }, selected: previous.find(old => old.id === edge.identity)?.selected ?? false
    })))
  }, [board, projection, setEdges])

  function add(kind: BoardItem["kind"]) {
    const rect = viewport.current!.getBoundingClientRect()
    const position = flow.screenToFlowPosition({ x: rect.left + rect.width / 2 - 100, y: rect.top + rect.height / 2 - 60 })
    void command.run(() => application.apply([{ action: "item.add", item: {
      identity: crypto.randomUUID(), kind, text: kind === "card" ? "New idea" : kind === "text" ? "Add your text" : "",
      color: kind === "card" ? "amber" : "neutral", x: position.x, y: position.y,
      width: kind === "text" ? 240 : 200, height: kind === "text" ? 80 : 140
    } }]))
  }
  function remove() {
    const removing = new Set(selection.nodes)
    const operations: Operation[] = board.connections.filter(edge => selection.edges.includes(edge.identity) && !removing.has(edge.from) && !removing.has(edge.to))
      .map(edge => ({ action: "connection.remove", identity: edge.identity, revision: edge.revision }))
    operations.push(...board.items.filter(item => removing.has(item.identity)).map(item => ({ action: "item.remove" as const, identity: item.identity, revision: item.revision })))
    if (operations.length) void command.run(() => application.apply(operations))
  }
  const selected = selection.nodes.length === 1 ? board.items.find(item => item.identity === selection.nodes[0]) : null
  const edge = selection.nodes.length === 0 && selection.edges.length === 1 ? board.connections.find(edge => edge.identity === selection.edges[0]) : null
  const count = selection.nodes.length + selection.edges.length
  const empty = board.items.length === 0
  const edgeOptions = useMemo(() => ({ style: { stroke: "var(--board-fg)", strokeWidth: 2 }, labelStyle: { fill: "var(--board-fg)" }, labelBgStyle: { fill: "var(--board-bg)" } }), [])

  return <div className="board-workspace">
    <div className="board-header">
      <div className="board-heading"><small>SHARED CANVAS</small><h1>{board.title}</h1></div>
      <span className="save-state" role="status">{!connected ? "Read-only · disconnected" : pending ? "Saving…" : `Saved · revision ${board.revision}`}</span>
      <Button onPress={() => { setName(board.title); setRenaming(true) }} disabled={!connected}>Rename</Button>
      <Button onPress={() => setDeleting(true)} disabled={!connected}>Delete board</Button>
    </div>
    {renaming && <form className="inline-dialog" onSubmit={event => { event.preventDefault(); void command.run(async () => { await application.rename(name); setRenaming(false) }) }}>
      <input aria-label="New board title" value={name} onChange={event => setName(event.target.value)} maxLength={120} required autoFocus />
      <Button type="submit" pending={pending > 0}>Save title</Button><Button onPress={() => setRenaming(false)}>Cancel</Button>
    </form>}
    {deleting && <div className="inline-dialog" role="alert"><span>Delete this board and all its content? This cannot be undone.</span>
      <Button onPress={() => { void command.run(() => application.delete()) }} pending={pending > 0}>Confirm delete</Button><Button onPress={() => setDeleting(false)}>Cancel</Button></div>}
    <div className="board-tools" aria-label="Canvas tools">
      <Button onPress={() => add("card")} disabled={!connected}>+ Card</Button><Button onPress={() => add("text")} disabled={!connected}>Text</Button>
      <Button onPress={() => add("rectangle")} disabled={!connected}>Rectangle</Button><Button onPress={() => add("ellipse")} disabled={!connected}>Ellipse</Button>
      <span className="tool-divider" /><Button onPress={remove} disabled={!connected || count === 0}>Delete {count || "selection"}</Button>
      <Button onPress={() => setMinimap(value => !value)}>{minimap ? "Hide map" : "Show map"}</Button>
      <span className="canvas-hint">Drag to select · Space to pan · Connect the dots</span>
    </div>
    <div className="canvas-body"><div className="canvas" ref={viewport}>
      <ReactFlow<ItemNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes => {
        const operations = projection.change(changes)
        setNodes(projection.value)
        if (connected && operations.length) void command.run(() => application.apply(operations))
      }} onEdgesChange={onEdgesChange}
        onSelectionChange={select} nodesDraggable={connected} nodesConnectable={connected} deleteKeyCode={null}
        onConnect={({ source, target }) => { if (source && target && connected) void command.run(() => application.apply([{ action: "connection.add", connection: { identity: crypto.randomUUID(), from: source, to: target, label: "" } }])) }}
        selectionOnDrag panOnDrag={[1, 2]} panOnScroll minZoom={0.1} maxZoom={3} defaultEdgeOptions={edgeOptions}>
        <Background gap={24} size={1} color="color-mix(in srgb, var(--board-fg) 20%, transparent)" />
        <Controls showInteractive={false} />{minimap && <MiniMap pannable zoomable />}
      </ReactFlow>
      {empty && <div className="canvas-empty"><h2>Start with one idea.</h2><p>Add a card, write a thought, or connect a few shapes.</p></div>}
    </div>
    <Surface className="inspector">
      <h2>{selected ? "Item" : edge ? "Connection" : "Details"}</h2>
      {selected ? <ItemEditor key={selected.identity} item={selected} application={application} disabled={!connected} /> : edge ?
        <ConnectionEditor key={edge.identity} connection={edge} application={application} disabled={!connected} /> :
        <p className="muted">Select one item to edit it. Drag its corners to resize. Select several items to move or remove them together.</p>}
      <div className="board-information"><span>{board.items.length} items · {board.connections.length} connections</span><label>Board identity<input value={board.identity} readOnly onFocus={event => event.target.select()} /></label><small>People and agents address this same board. Viewport and selection stay local.</small></div>
    </Surface></div>
  </div>
}
