import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { getCanonicalRedirectUrl } from './lib/canonicalHost'

const canonicalRedirectUrl = getCanonicalRedirectUrl(window.location)

if (canonicalRedirectUrl) {
  window.location.replace(canonicalRedirectUrl)
} else {
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  )
}
