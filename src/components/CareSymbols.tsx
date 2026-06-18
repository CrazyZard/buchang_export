import type { CareSymbolKey, LabelData } from '../types'
import { CARE_SYMBOL_ASSETS } from '../assets/care-symbols'
import { InlineSvg } from './InlineSvg'
import {
  ALL_CARE_SYMBOL_KEYS,
  isAutoCareSymbol,
  resolveCareSymbols,
} from '../utils/careSymbols'

interface CareSymbolsProps {
  symbols: CareSymbolKey[]
  size?: 'sm' | 'md'
}

function CareSymbolIcon({ symbolKey, size }: { symbolKey: CareSymbolKey; size: 'sm' | 'md' }) {
  const asset = CARE_SYMBOL_ASSETS[symbolKey]
  const className = size === 'sm' ? 'care-symbol-img care-symbol-img--sm' : 'care-symbol-img'
  return <InlineSvg markup={asset.svg} className={className} />
}

export function CareSymbols({ symbols, size = 'md' }: CareSymbolsProps) {
  return (
    <div className={`care-symbols care-symbols--${size}`}>
      {symbols.map((key) => (
        <span key={key} className="care-symbol" aria-hidden="true">
          <CareSymbolIcon symbolKey={key} size={size} />
        </span>
      ))}
    </div>
  )
}

interface CareSymbolPickerProps {
  data: LabelData
  onChange: (symbols: CareSymbolKey[]) => void
}

export function CareSymbolPicker({ data, onChange }: CareSymbolPickerProps) {
  const resolved = resolveCareSymbols(data)

  const toggle = (key: CareSymbolKey) => {
    if (isAutoCareSymbol(key)) return

    const selected = data.careSymbols
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key))
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div className="care-symbol-picker">
      {ALL_CARE_SYMBOL_KEYS.map((key) => {
        const isAuto = isAutoCareSymbol(key)
        const isActive = isAuto ? resolved.includes(key) : data.careSymbols.includes(key)

        return (
          <button
            key={key}
            type="button"
            className={`care-symbol-btn ${isActive ? 'active' : ''} ${isAuto ? 'care-symbol-btn--auto' : ''}`}
            onClick={() => toggle(key)}
            disabled={isAuto}
            aria-label={CARE_SYMBOL_ASSETS[key].label}
            aria-pressed={isActive}
            title={isAuto ? '随「干洗说明」自动显示，不可手动切换' : CARE_SYMBOL_ASSETS[key].label}
          >
            <CareSymbolIcon symbolKey={key} size="md" />
          </button>
        )
      })}
    </div>
  )
}
