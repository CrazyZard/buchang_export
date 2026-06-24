import { createContext, useContext, useState, type ReactNode } from 'react'

interface SelectedLogoState {
  logoSvg: string | null
  setLogoSvg: (svg: string | null) => void
}

const SelectedLogoContext = createContext<SelectedLogoState | null>(null)

export function SelectedLogoProvider({ children }: { children: ReactNode }) {
  const [logoSvg, setLogoSvg] = useState<string | null>(null)

  return (
    <SelectedLogoContext.Provider value={{ logoSvg, setLogoSvg }}>
      {children}
    </SelectedLogoContext.Provider>
  )
}

export function useSelectedLogo() {
  const ctx = useContext(SelectedLogoContext)
  if (!ctx) {
    throw new Error('useSelectedLogo must be used within SelectedLogoProvider')
  }
  return ctx
}
