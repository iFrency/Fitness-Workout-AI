import type { Page } from '../ui/store'

/** A screen-specific reaction to the Android back button (close a sheet, confirm quitting, ...). */
export type BackHandler = () => void

export interface BackRouter {
  /** Registers a handler that takes back presses until the returned remover is called. */
  push(handler: BackHandler): () => void
  handle(page: Page, go: (page: Page) => void, exitApp: () => void): void
}

export function createBackRouter(): BackRouter {
  let handlers: readonly BackHandler[] = []
  return {
    push(handler) {
      const entry: BackHandler = () => handler()
      handlers = [...handlers, entry]
      return () => { handlers = handlers.filter(h => h !== entry) }
    },
    handle(page, go, exitApp) {
      const top = handlers.at(-1)
      if (top) return top()
      if (page === 'home') return exitApp()
      // Training always registers its own confirm-to-quit handler; never drop a workout silently.
      if (page === 'training') return
      go('home')
    },
  }
}

/** The app-wide router the native back-button listener and the pages share. */
export const backRouter: BackRouter = createBackRouter()
