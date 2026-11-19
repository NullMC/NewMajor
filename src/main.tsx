import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import { App } from '@/app/App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { CartProvider } from '@/features/cart/CartProvider'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import { UiProvider } from '@/components/ui/Toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider>
      <AuthProvider>
        <SettingsProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </SettingsProvider>
      </AuthProvider>
    </UiProvider>
  </StrictMode>,
)
