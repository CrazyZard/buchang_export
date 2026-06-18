interface LanguageSelectorProps {
  languages: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

function normalizeSelection(languages: string[], selected: string[]): string[] {
  return languages.filter((lang) => selected.includes(lang))
}

export function LanguageSelector({ languages, selected, onChange }: LanguageSelectorProps) {
  const checked = normalizeSelection(languages, selected)

  const applySelection = (next: string[]) => {
    onChange(normalizeSelection(languages, next))
  }

  const toggle = (lang: string) => {
    if (checked.includes(lang)) {
      applySelection(checked.filter((item) => item !== lang))
    } else {
      applySelection([...checked, lang])
    }
  }

  return (
    <div className="language-selector">
      <div className="language-selector-header">
        <span className="dict-label">出稿语言</span>
        <span className="dict-meta">
          已选 {checked.length} / {languages.length}：{checked.length > 0 ? checked.join('、') : '无'}
        </span>
      </div>
      <div className="language-options">
        {languages.map((lang) => (
          <label key={lang} className="language-option">
            <input
              type="checkbox"
              checked={checked.includes(lang)}
              onChange={() => toggle(lang)}
            />
            <span>{lang}</span>
          </label>
        ))}
      </div>
      <div className="language-actions">
        <button type="button" className="btn-link" onClick={() => applySelection(languages)}>
          全选
        </button>
        <button type="button" className="btn-link" onClick={() => applySelection([])}>
          清空
        </button>
      </div>
    </div>
  )
}
