import { useTemplate } from '../context/TemplateContext'
import { InlineSvg } from './InlineSvg'

export function BrandLogo({ className = '' }: { className?: string }) {
  const template = useTemplate()

  return (
    <InlineSvg
      markup={template.logoSvg}
      className={`label-brand-logo ${className}`.trim()}
      ariaLabel={template.logoAlt}
    />
  )
}
