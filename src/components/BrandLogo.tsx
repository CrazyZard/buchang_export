import { useTemplate } from '../context/TemplateContext'
import { useSelectedLogo } from '../context/SelectedLogoContext'
import { InlineSvg } from './InlineSvg'

export function BrandLogo({ className = '' }: { className?: string }) {
  const template = useTemplate()
  const { logoSvg: selectedSvg } = useSelectedLogo()
  const logoSvg = selectedSvg ?? template.logoSvg

  return (
    <InlineSvg
      markup={logoSvg}
      className={`label-brand-logo ${className}`.trim()}
      ariaLabel={template.logoAlt}
    />
  )
}
