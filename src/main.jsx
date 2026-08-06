import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { BRAND } from './brand.js'
import './index.css'

// Keeps the browser tab in step with the app name, so changing brand.js is
// genuinely the only edit needed.
document.title = BRAND.name

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
