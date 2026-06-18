import type { CompositionPart, MaterialItem } from '../types'

interface MaterialEditorProps {
  parts: { key: CompositionPart; label: string }[]
  optionalParts?: CompositionPart[]
  requiredParts?: CompositionPart[]
  composition: Record<CompositionPart, MaterialItem[]>
  onChange: (part: CompositionPart, items: MaterialItem[]) => void
}

function newId() {
  return crypto.randomUUID()
}

export function MaterialEditor({
  parts,
  optionalParts = [],
  requiredParts = [],
  composition,
  onChange,
}: MaterialEditorProps) {
  const addItem = (part: CompositionPart) => {
    onChange(part, [...composition[part], { id: newId(), percentage: '', name: '' }])
  }

  const updateItem = (
    part: CompositionPart,
    id: string,
    field: 'percentage' | 'name',
    value: string,
  ) => {
    onChange(
      part,
      composition[part].map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    )
  }

  const removeItem = (part: CompositionPart, id: string) => {
    const next = composition[part].filter((item) => item.id !== id)
    if (requiredParts.includes(part) && next.length === 0) return
    onChange(part, next)
  }

  const isOptionalHidden = (key: CompositionPart) =>
    optionalParts.includes(key) &&
    !requiredParts.includes(key) &&
    composition[key].length === 0

  const visibleParts = parts.filter(({ key }) => !isOptionalHidden(key))
  const hiddenOptionalParts = parts.filter(({ key }) => isOptionalHidden(key))

  return (
    <div className="material-editor">
      {visibleParts.map(({ key, label }) => {
        const isRequired = requiredParts.includes(key)
        const items = composition[key]
        const canRemove = !isRequired || items.length > 1

        return (
          <div key={key} className="material-group">
            <div className="material-group-header">
              <span className="fixed-label">
                {label}
                {isRequired ? '（必填）' : ''}：
              </span>
              <button type="button" className="btn-add" onClick={() => addItem(key)}>
                + 添加成分
              </button>
            </div>
            <div className="material-list">
              {items.length === 0 && (
                <p className="empty-hint">
                  {isRequired ? '请至少添加一条面料成分' : '暂无成分，点击上方按钮添加'}
                </p>
              )}
              {items.map((item) => (
                <div key={item.id} className="material-row">
                  <input
                    type="text"
                    className="input-percentage"
                    placeholder="比例"
                    value={item.percentage}
                    onChange={(e) => updateItem(key, item.id, 'percentage', e.target.value)}
                  />
                  <input
                    type="text"
                    className="input-name"
                    placeholder="材质名称（中文）"
                    value={item.name}
                    onChange={(e) => updateItem(key, item.id, 'name', e.target.value)}
                    list="material-suggestions"
                  />
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => removeItem(key, item.id)}
                    disabled={!canRemove}
                    aria-label="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {hiddenOptionalParts.length > 0 ? (
        <div className="material-optional-actions">
          {hiddenOptionalParts.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="btn-add btn-add--optional"
              onClick={() => addItem(key)}
            >
              + 添加{label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
