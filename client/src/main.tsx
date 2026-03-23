import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'
import { QueryProvider } from './providers/QueryProvider'
import { OnboardingProvider } from './contexts/OnboardingContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryProvider>
            <OnboardingProvider>
                <App />
            </OnboardingProvider>
        </QueryProvider>
    </React.StrictMode>,
)
