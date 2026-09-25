import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import App from './App'
import { setStaticCatalog } from './api/capability'
import { runtimeMode, type RuntimeMode } from './api/runtimeMode'
import { createStaticTransport, loadStaticManifest } from './api/staticCatalog'
import { setTransport } from './api/transport'
import { bindUrlState } from './state/urlState'
import './styles.css'
import './lab.css'

/** Shown instead of the lab when the static catalogue cannot be loaded. */
function StartupError({ message }: { message: string }) {
  return (
    <main
      className="startup-error"
      role="alert"
      style={{
        maxWidth: '40rem',
        margin: '15vh auto',
        padding: '0 24px',
        color: '#fff',
        font: '16px/1.7 system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <h1 style={{ fontSize: '22px', fontWeight: 600 }}>静态教材版无法启动</h1>
      <p>无法加载预计算数据目录：{message}</p>
      <p>
        请刷新页面重试；如果问题持续，可以在本地运行 <code>quviz serve</code> 使用实时计算版。
      </p>
    </main>
  )
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Install the data layer the build mode asks for, then mount the app.
 *
 * The static catalogue must be in place before the first render: the first
 * scene request, the capability answers the panel shows and the URL state all
 * read it. The data directory is resolved against the document, so the same
 * bundle works at "/" and under a GitHub Pages sub-path.
 */
export async function bootstrap(container: HTMLElement, mode: RuntimeMode): Promise<Root> {
  const root = createRoot(container)
  if (mode === 'static') {
    try {
      const dataBase = new URL('data/', document.baseURI)
      const manifest = await loadStaticManifest(dataBase)
      setTransport(createStaticTransport(manifest, dataBase))
      setStaticCatalog(manifest)
    } catch (error) {
      root.render(<StartupError message={errorText(error)} />)
      return root
    }
  }
  bindUrlState()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return root
}

void bootstrap(document.getElementById('root')!, runtimeMode())
