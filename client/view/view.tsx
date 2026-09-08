import { Component, StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import App from "./app"
import "@xyflow/react/dist/style.css"
import "./style.css"

export default function render() {
  createRoot(document.body).render(<StrictMode><FailureBoundary><App /></FailureBoundary></StrictMode>)
}

class FailureBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  public state: { error: Error | null } = { error: null }
  public static getDerivedStateFromError(error: Error) { return { error } }
  public render() {
    return this.state.error ? <div className="loading" role="alert"><h1>Tilo could not start</h1>
      <p>{this.state.error.message}</p><button onClick={() => location.reload()}>Reload</button></div> : this.props.children
  }
}
