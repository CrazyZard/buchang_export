import { useState } from 'react'

interface CompositionPasteInputProps {
  onApply: (text: string) => void
}

const PLACEHOLDER = `主面料：
大身面层：62.0%聚酯纤维38.0%棉
大身底层：94.2%聚酯纤维5.8%氨纶
腰拼接面料：100%棉
（配料除外）`

export function CompositionPasteInput({ onApply }: CompositionPasteInputProps) {
  const [text, setText] = useState('')

  const handleApply = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onApply(trimmed)
  }

  return (
    <div className="composition-paste">
      <label className="field field--full">
        <span>成分粘贴导入</span>
        <textarea
          rows={6}
          value={text}
          placeholder={PLACEHOLDER}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="composition-paste-actions">
        <button type="button" className="btn-secondary" onClick={handleApply}>
          解析并插入
        </button>
        <button type="button" className="btn-link" onClick={() => setText('')}>
          清空
        </button>
      </div>
    </div>
  )
}
