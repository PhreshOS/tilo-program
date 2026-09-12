import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react"
import { desktop, system } from "@phreshos/client"
import { DesktopProvider, SystemProvider, useDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { AppearanceProvider, Button, Surface, useThemedValue } from "@phreshos/react-ui"
import { connect } from "./connection"
import type Application from "../core/application"
import useCommand from "./command"

const Canvas = lazy(() => import("./canvas/canvas"))

export default function App() {
  return <SystemProvider system={system} fallback={<p className="loading">Connecting to System…</p>}>
    <DesktopProvider desktop={desktop} fallback={<p className="loading">Connecting to Desktop…</p>}><Theme /></DesktopProvider>
  </SystemProvider>
}
function Theme() {
  const appearance = useSystemAppearance()
  const { theme } = useDesktopPreferences()
  return <AppearanceProvider appearance={appearance} theme={theme}><Session /></AppearanceProvider>
}
function Session() {
  const [application, setApplication] = useState<Application | null>(null)
  useEffect(() => {
    const connection = connect()
    setApplication(connection.application)
    return connection.dispose
  }, [])
  return application ? <Workspace application={application} /> : <p className="loading">Opening Tilo…</p>
}
function Workspace({ application }: { application: Application }) {
  const state = useSyncExternalStore(application.subscribe, application.snapshot)
  const command = useCommand(application)
  const appearance = useSystemAppearance()
  const variables = {
    "--board-bg": useThemedValue(appearance.colors).background, "--board-fg": useThemedValue(appearance.colors).foreground,
    // Item colors are Board content, not aliases for the System's semantic colors.
    "--board-blue": "#538ad9", "--board-green": "#329b76",
    "--board-amber": "#c89a39", "--board-pink": "#cb6386", "--board-violet": "#9674ce"
  } as CSSProperties
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  return <div className="workspace" style={variables}>
    <Surface className="library">
      <div className="library-title"><img src={new URL("../../icon.svg", import.meta.url).href} alt="" /><div><strong>Tilo</strong><small>Think together.</small></div></div>
      <Button onPress={() => setCreating(true)} disabled={state.status !== "ready"}>+ New board</Button>
      {creating && <form className="new-board" onSubmit={event => {
        event.preventDefault()
        void command.run(async () => { await application.create(name); setName(""); setCreating(false) })
      }}><input aria-label="Board title" value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Give your board a name" required autoFocus />
        <div className="row"><Button type="submit" pending={command.pending}>Create</Button><Button onPress={() => setCreating(false)}>Cancel</Button></div>
      </form>}
      <div role="navigation" aria-label="Boards" className="board-list">{state.boards.map(board => <button key={board.identity} className={`board-entry ${state.board?.identity === board.identity ? "selected" : ""}`}
        onClick={() => void application.open(board.identity)}><strong>{board.title}</strong><small>{board.items} items · rev {board.revision}</small></button>)}</div>
      <div className="library-status"><span className={`status ${state.status}`}>{state.status === "ready" ? "Live · shared Server" : state.status === "connecting" ? "Connecting…" : "Disconnected"}</span>
        {state.status === "failed" && <Button onPress={() => void application.start()}>Reconnect</Button>}
        <small>Every saved edit is shared with connected people and agents.</small>
      </div>
    </Surface>
    <div className="workspace-content">
      {state.error && <div className="error" role="alert"><span>{state.error}</span><button aria-label="Dismiss error" onClick={() => application.dismissError()}>×</button></div>}
      {state.board === undefined || (!state.board && state.status === "connecting") ? <p className="loading">Loading boards…</p> : state.board ?
        <Suspense fallback={<p className="loading">Loading canvas…</p>}><Canvas key={state.board.identity} board={state.board} application={application} connected={state.status === "ready"} pending={state.pending} /></Suspense> : state.status === "failed" ?
        <p className="loading">Tilo is disconnected. Use Reconnect to try again.</p> :
        <div className="empty"><span className="empty-mark">▧</span><h1>Space for the next idea.</h1><p>Create a board or open one from the library.<br />Your canvas is shared. Your point of view is yours.</p><Button onPress={() => setCreating(true)} disabled={state.status !== "ready"}>Create your first board</Button></div>}
    </div>
  </div>
}
