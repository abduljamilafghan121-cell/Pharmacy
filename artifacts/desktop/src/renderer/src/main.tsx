import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { initApiClient } from './lib/apiClient'
import './index.css'

const queryClient = new QueryClient()

// initApiClient reads the saved session token from the OS secure store via
// IPC, so the app waits for it before mounting — otherwise the first
// authenticated render would race the token load.
void initApiClient().then(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  )
})
