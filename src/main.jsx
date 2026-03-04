import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.js'
import { RokuDeviceProvider } from './context/RokuDeviceContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <RokuDeviceProvider>
        <App />
      </RokuDeviceProvider>
    </AuthProvider>
  </StrictMode>,
)
