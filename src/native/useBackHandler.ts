import { useEffect, useRef } from 'react'
import { backRouter, type BackHandler } from './backButton'

/** Lets the mounted component answer the Android back button; a no-op on the web. */
export function useBackHandler(handler: BackHandler): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => backRouter.push(() => latest.current()), [])
}
