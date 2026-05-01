import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply persisted theme before first paint so the user doesn't see
// a flash of the wrong theme.
const theme = localStorage.getItem('frame.theme') === 'light' ? 'light' : 'dark'
document.documentElement.setAttribute('data-theme', theme)

createRoot(document.getElementById('root')!).render(<App />)
