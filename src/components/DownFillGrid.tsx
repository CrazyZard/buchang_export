import { Fragment } from 'react'
import type { DownFillGrid as DownFillGridData } from '../types'

interface DownFillGridPreviewProps {
  grid: DownFillGridData
  title?: string
  className?: string
}

function chunkColumns<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export function DownFillGridPreview({ grid, title, className = '' }: DownFillGridPreviewProps) {
  if (grid.columns.length === 0) return null

  const displayTitle = title ?? grid.title
  const chunks = chunkColumns(grid.columns, 4)

  // 如果有括号后缀（如"充绒量：(单位：克)"），拆成左右两部分
  const parenIdx = displayTitle ? displayTitle.indexOf('(') : -1
  const titleMain = parenIdx > 0 ? displayTitle.slice(0, parenIdx).trimEnd() : displayTitle
  const titleSuffix = parenIdx > 0 ? displayTitle.slice(parenIdx) : ''

  return (
    <div className={`down-fill-grid ${className}`.trim()}>
      {displayTitle ? (
        titleSuffix ? (
          <div className="down-fill-grid-title down-fill-grid-title--split">
            <span className="down-fill-grid-title-main">{titleMain}</span>
            <span className="down-fill-grid-title-suffix">{titleSuffix}</span>
          </div>
        ) : (
          <div className="down-fill-grid-title">{displayTitle}</div>
        )
      ) : null}
      <table className="down-fill-grid-table">
        <tbody>
          {chunks.map((chunk, chunkIdx) => (
            <Fragment key={`chunk-${chunkIdx}`}>
              <tr>
                {chunk.map((column) => (
                  <td key={`size-${column.id}`} className="down-fill-grid-cell down-fill-grid-cell--size label-latin">
                    {column.size.split('\n').map((line, i) => (
                      <span key={i}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
              <tr>
                {chunk.map((column) => (
                  <td key={`weight-${column.id}`} className="down-fill-grid-cell down-fill-grid-cell--weight label-latin">
                    {column.weight}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
