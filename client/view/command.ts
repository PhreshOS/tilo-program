import { useEffect } from "react"
import usePromise from "../../libs/react-promise"
import type Application from "../core/application"

/** Finite View operations report their failures in the workspace's error region. */
export default function useCommand(application: Application) {
  const command = usePromise(async (execute: () => Promise<unknown>) => execute())
  const error = command.exception?.current
  useEffect(() => { if (error !== undefined) application.failed(error) }, [application, error])
  return { run: command.safeExecute, pending: command.isPending }
}
