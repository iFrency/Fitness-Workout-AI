import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useAppStore } from '../ui/store'
import { backRouter } from './backButton'

/** Wires Android-only behaviour. Safe to call on the web, where it does nothing. */
export function installNativeShell(): void {
  if (!Capacitor.isNativePlatform()) return
  CapacitorApp.addListener('backButton', () => {
    const { page, go } = useAppStore.getState()
    backRouter.handle(page, go, () => void CapacitorApp.exitApp())
  }).catch((err: unknown) => console.error('返回键监听注册失败', err))
}
