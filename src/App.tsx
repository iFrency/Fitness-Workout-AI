import { useEffect } from 'react'
import { Done } from './ui/pages/Done'
import { Home } from './ui/pages/Home'
import { Preview } from './ui/pages/Preview'
import { Training } from './ui/pages/Training'
import { useAppStore } from './ui/store'

export function App() {
  const page = useAppStore(s => s.page)
  const catalog = useAppStore(s => s.catalog)
  const loadError = useAppStore(s => s.loadError)
  const boot = useAppStore(s => s.boot)

  useEffect(() => {
    void boot()
  }, [boot])

  if (loadError) {
    return (
      <main className="page center">
        <p>{loadError}</p>
        <button type="button" className="primary" onClick={() => void boot()}>重试</button>
      </main>
    )
  }
  if (!catalog) return <main className="page center"><p>加载中</p></main>
  if (page === 'preview') return <Preview />
  if (page === 'training') return <Training />
  if (page === 'done') return <Done />
  return <Home />
}
