import { Fragment } from 'react'
import type { DownFillColumn, DownFillGrid, DownJacketComposition } from '../types'
import { DOWN_JACKET_LABELS } from '../types'
import { useTemplate } from '../context/TemplateContext'

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

function chunkedColumns<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export function DownJacketEditor({ value, onChange }: DownJacketEditorProps) {
  const template = useTemplate()
  const isSenmaDown = template.id === 'senma-down'
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

  const addFacingLine = () => {
    onChange({ ...value, facingLines: [...value.facingLines, ''] })
  }
  const removeFacingLine = (index: number) => {
    if (value.facingLines.length <= 1) return
    onChange({ ...value, facingLines: value.facingLines.filter((_, i) => i !== index) })
  }
  const addStuffingLine = () => {
    onChange({ ...value, stuffingLines: [...value.stuffingLines, ''] })
  }
  const removeStuffingLine = (index: number) => {
    if (value.stuffingLines.length <= 1) return
    onChange({ ...value, stuffingLines: value.stuffingLines.filter((_, i) => i !== index) })
  }

  return (
    <div className="down-jacket-editor">
      <div className="down-jacket-lines">
        {isSenmaDown ? (
          <>
            <div className="field">
              <span className="down-jacket-section-label">
                成分行
                <button type="button" className="btn-link btn-plus" onClick={addFacingLine}>+</button>
              </span>
              {value.facingLines.map((line, index) => (
                <div key={`facing-${index}`} className="down-jacket-line-row">
                  <textarea
                    rows={2}
                    value={line}
                    placeholder={`行 ${index + 1}`}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        facingLines: updateLines(value.facingLines, index, e.target.value),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn-link btn-minus"
                    onClick={() => removeFacingLine(index)}
                    disabled={value.facingLines.length <= 1}
                    title="删除此成分行"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <label className="field">
              <span className="down-jacket-section-label">填充物/绒子含量
                <button type="button" className="btn-link btn-plus" onClick={addStuffingLine}>+</button>
              </span>
              {value.stuffingLines.map((line, index) => (
                <div key={`stuffing-${index}`} className="down-jacket-line-row">
                  <textarea
                    rows={2}
                    value={line}
                    placeholder={`行 ${index + 1}`}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        stuffingLines: updateLines(value.stuffingLines, index, e.target.value),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn-link btn-minus"
                    onClick={() => removeStuffingLine(index)}
                    disabled={value.stuffingLines.length <= 1}
                    title="删除此行"
                  >
                    ×
                  </button>
                </div>
              ))}
            </label>
          </>
        ) : (
          <>
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
          </>
        )}
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
            <tbody>
              {chunkedColumns(value.fillGrid.columns, 4).map((chunk, chunkIdx) => {
                const offset = chunkIdx * 4
                return (
                  <Fragment key={`chunk-${chunkIdx}`}>
                    <tr>
                      <td className="down-fill-grid-editor-label">尺码</td>
                      {chunk.map((column, i) => (
                        <td key={`size-${column.id}`}>
                          <textarea
                            rows={3}
                            value={column.size}
                            onChange={(e) => updateColumn(offset + i, { size: e.target.value })}
                          />
                          <button
                            type="button"
                            className="down-fill-grid-remove"
                            onClick={() => removeColumn(offset + i)}
                            title="删除此列"
                          >
                            ×
                          </button>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="down-fill-grid-editor-label">充绒量(g)</td>
                      {chunk.map((column, i) => (
                        <td key={`weight-${column.id}`}>
                          <input
                            type="text"
                            value={column.weight}
                            onChange={(e) => updateColumn(offset + i, { weight: e.target.value })}
                          />
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
