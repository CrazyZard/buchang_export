import { createContext, useContext, type ReactNode } from 'react'
import type { WashLabelTemplate } from '../templates'

const TemplateContext = createContext<WashLabelTemplate | null>(null)

export function TemplateProvider({
  template,
  children,
}: {
  template: WashLabelTemplate
  children: ReactNode
}) {
  return <TemplateContext.Provider value={template}>{children}</TemplateContext.Provider>
}

export function useTemplate(): WashLabelTemplate {
  const template = useContext(TemplateContext)
  if (!template) {
    throw new Error('useTemplate must be used within TemplateProvider')
  }
  return template
}
