import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { initialize_pwa_runtime } from './application/pwa/pwaRuntime'
import { DatasetAppGate } from './features/sync/DatasetAppGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <DatasetAppGate>
        <App />
      </DatasetAppGate>
    </HashRouter>
  </StrictMode>,
)

if (import.meta.env.PROD) {
  void initialize_pwa_runtime()
}
