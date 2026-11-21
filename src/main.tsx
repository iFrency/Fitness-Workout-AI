import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installNativeShell } from './native/install'
import './ui/styles.css'

installNativeShell()

createRoot(document.getElementById('root')!).render(<App />)
