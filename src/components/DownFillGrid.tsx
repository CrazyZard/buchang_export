import type { DownFillGrid as DownFillGridData } from '../types'

interface DownFillGridPreviewProps {
  grid: DownFillGridData
  title?: string
  className?: string
}

export function DownFillGridPreview({ grid, title, className = '' }: DownFillGridPreviewProps) {
  if (grid.columns.length === 0) return null

  const displayTitle = title ?? grid.title

  return (
    <div className={`down-fill-grid ${className}`.trim()}>
      {displayTitle ? <div className="down-fill-grid-title">{displayTitle}</div> : null}
      <table className="down-fill-grid-table">
        <tbody>
          <tr>
            {grid.columns.map((column) => (
              <td key={`size-${column.id}`} className="down-fill-grid-cell label-latin">
                {column.size}
              </td>
            ))}
          </tr>
          <tr>
            {grid.columns.map((column) => (
              <td key={`weight-${column.id}`} className="down-fill-grid-cell label-latin">
                {column.weight}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
