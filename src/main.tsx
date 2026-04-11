import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppFeedbackProvider } from './components/AppFeedback'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppFeedbackProvider>
      <App />
    </AppFeedbackProvider>
  </StrictMode>,
)
