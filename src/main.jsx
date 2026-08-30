import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.js'
import { reloadForNewBuild } from './utils/appVersion.js'
import { isOffline } from './utils/networkErrors.js'

// Vite reports a failed module preload here before the import itself rejects.
// Catching it at the window means a deploy that landed under an open tab is
// recovered even when the failure happens outside a React render.
window.addEventListener('vite:preloadError', (event) => {
  if (!isOffline() && reloadForNewBuild()) event.preventDefault()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
