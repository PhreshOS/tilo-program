import { useEffect, useState } from "react"
import { Button } from "@phreshos/react-ui"
import usePromise from "../../libs/react-promise"
import type Application from "../core/application"
import type { BoardItem, BoardConnection } from "../../shared/board"

function useDraft<T extends { revision: number }>(value: T) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { if (!dirty) setDraft(value) }, [value, dirty])
  return {
    draft, dirty, changedElsewhere: dirty && draft.revision !== value.revision,
    update(patch: Partial<T>) { setDraft(current => ({ ...current, ...patch })); setDirty(true) },
    reset() { setDraft(value); setDirty(false) },
    saved() { setDirty(false) }
  }
}

export function ItemEditor({ item, application, disabled }: { item: BoardItem, application: Application, disabled: boolean }) {
  const edit = useDraft(item)
  const save = usePromise(async () => {
    await application.apply([{ action: "item.update", identity: item.identity, revision: edit.draft.revision,
      patch: { text: edit.draft.text, color: edit.draft.color } }])
    edit.saved()
  })
  return <form className="item-editor" onSubmit={event => { event.preventDefault(); void save.safeExecute() }}>
    <label>Content<textarea value={edit.draft.text} maxLength={20_000} rows={7} disabled={save.isPending}
      onChange={event => edit.update({ text: event.target.value })} /></label>
    <label>Color<select value={edit.draft.color} disabled={save.isPending}
      onChange={event => edit.update({ color: event.target.value as BoardItem["color"] })}>
      {["neutral", "blue", "green", "amber", "pink", "violet"].map(value => <option key={value}>{value}</option>)}
    </select></label>
    {edit.changedElsewhere && <p className="conflict">This item changed elsewhere. Your draft is preserved. Reload to edit the latest version.</p>}
    {save.exception && <p role="alert" className="conflict">{String(save.exception.current)}</p>}
    <div className="row"><Button type="submit" pending={save.isPending} disabled={disabled || !edit.dirty || edit.changedElsewhere}>Save</Button>
      <Button onPress={() => { edit.reset(); save.reset() }} disabled={save.isPending}>Reload</Button></div>
    <small className="muted">{item.kind} · revision {item.revision}<br />{Math.round(item.width)} × {Math.round(item.height)}</small>
  </form>
}

export function ConnectionEditor({ connection, application, disabled }: { connection: BoardConnection, application: Application, disabled: boolean }) {
  const edit = useDraft(connection)
  const save = usePromise(async () => {
    await application.apply([{ action: "connection.update", identity: connection.identity, revision: edit.draft.revision, label: edit.draft.label }])
    edit.saved()
  })
  return <form onSubmit={event => { event.preventDefault(); void save.safeExecute() }}>
    <label>Label<input value={edit.draft.label} maxLength={200} disabled={save.isPending} onChange={event => edit.update({ label: event.target.value })} /></label>
    {edit.changedElsewhere && <p className="conflict">This connection changed elsewhere. Your draft is preserved. Reload to edit the latest version.</p>}
    {save.exception && <p role="alert" className="conflict">{String(save.exception.current)}</p>}
    <Button type="submit" pending={save.isPending} disabled={disabled || !edit.dirty || edit.changedElsewhere}>Save label</Button>
    <Button onPress={() => { edit.reset(); save.reset() }} disabled={save.isPending}>Reload</Button>
  </form>
}
