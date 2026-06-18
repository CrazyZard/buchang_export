import type { DownFillColumn, DownFillGrid, DownJacketComposition } from '../types'
import { DOWN_JACKET_LABELS } from '../types'

interface DownJacketEditorProps {
  value: DownJacketComposition
  onChange: (value: DownJacketComposition) => void
}

function updateLines(lines: string[], index: number, text: string) {
  return lines.map((line, i) => (i === index ? text : line))
}

function createColumn(): DownFillColumn {
  const id = `col-${Date.now()}`
  return { id, size: '', weight: '' }
}

export function DownJacketEditor({ value, onChange }: DownJacketEditorProps) {
  const updateGrid = (fillGrid: DownFillGrid) => {
    onChange({ ...value, fillGrid })
  }

  const updateColumn = (index: number, patch: Partial<DownFillColumn>) => {
    const columns = value.fillGrid.columns.map((column, i) =>
      i === index ? { ...column, ...patch } : column,
    )
    updateGrid({ ...value.fillGrid, columns })
  }

  const addColumn = () => {
    updateGrid({ ...value.fillGrid, columns: [...value.fillGrid.columns, createColumn()] })
  }

  const removeColumn = (index: number) => {
    updateGrid({
      ...value.fillGrid,
      columns: value.fillGrid.columns.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="down-jacket-editor">
      <div className="down-jacket-lines">
        <div className="field">
          <span>{DOWN_JACKET_LABELS.facing}</span>
          {value.facingLines.map((line, index) => (
            <input
              key={`facing-${index}`}
              type="text"
              value={line}
              onChange={(e) =>
                onChange({
                  ...value,
                  facingLines: updateLines(value.facingLines, index, e.target.value),
                })
              }
            />
          ))}
        </div>

        <label className="field">
          <span>{DOWN_JACKET_LABELS.lining}</span>
          <input
            type="text"
            value={value.liningLine}
            onChange={(e) => onChange({ ...value, liningLine: e.target.value })}
          />
        </label>

        <div className="field">
          <span>{DOWN_JACKET_LABELS.stuffing}</span>
          {value.stuffingLines.map((line, index) => (
            <input
              key={`stuffing-${index}`}
              type="text"
              value={line}
              onChange={(e) =>
                onChange({
                  ...value,
                  stuffingLines: updateLines(value.stuffingLines, index, e.target.value),
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="down-fill-grid-editor">
        <div className="down-fill-grid-editor-head">
          <span>充绒量表格</span>
          <button type="button" className="btn-secondary" onClick={addColumn}>
            + 添加尺码列
          </button>
        </div>

        <label className="field">
          <span>表格标题</span>
          <input
            type="text"
            value={value.fillGrid.title}
            onChange={(e) => updateGrid({ ...value.fillGrid, title: e.target.value })}
          />
        </label>

        <div className="down-fill-grid-editor-table-wrap">
          <table className="down-fill-grid-editor-table">
            <thead>
              <tr>
                <th>尺码</th>
                {value.fillGrid.columns.map((column, index) => (
                  <th key={column.id}>
                    <button
                      type="button"
                      className="down-fill-grid-remove"
                      onClick={() => removeColumn(index)}
                      title="删除此列"
                    >
                      ×
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="down-fill-grid-editor-label">尺码</td>
                {value.fillGrid.columns.map((column, index) => (
                  <td key={`size-${column.id}`}>
                    <input
                      type="text"
                      value={column.size}
                      onChange={(e) => updateColumn(index, { size: e.target.value })}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="down-fill-grid-editor-label">充绒量(g)</td>
                {value.fillGrid.columns.map((column, index) => (
                  <td key={`weight-${column.id}`}>
                    <input
                      type="text"
                      value={column.weight}
                      onChange={(e) => updateColumn(index, { weight: e.target.value })}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
