import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { MsalProvider } from './components/MsalProvider'
import PowerProvider from './powerprovider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MsalProvider>
        <PowerProvider>
          <App />
        </PowerProvider>
      </MsalProvider>
    </BrowserRouter>
  </StrictMode>,
)
