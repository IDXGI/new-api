/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { Column, Table as TanstackTable } from '@tanstack/react-table'

import { isContentSizedColumn } from './content-sized-columns'
import type { DataTableColumnWidthMode } from './types'

export function DataTableColgroup<TData>(props: {
  table: TanstackTable<TData>
  widthMode?: DataTableColumnWidthMode
}) {
  const columns = props.table.getVisibleLeafColumns()
  const sizedColumns = columns.filter(
    (column) => !isContentSizedColumn(column.id)
  )
  const totalSize = sizedColumns.reduce((sum, col) => sum + col.getSize(), 0)
  const columnSizing = props.table.getState().columnSizing

  return (
    <colgroup>
      {columns.map((column) => {
        const width = getColumnWidth(
          props.table,
          column,
          totalSize,
          props.widthMode ?? 'proportional',
          columnSizing[column.id]
        )

        return <col key={column.id} style={{ width }} />
      })}
    </colgroup>
  )
}

function getColumnWidth<TData>(
  table: TanstackTable<TData>,
  column: Column<TData, unknown>,
  totalSize: number,
  widthMode: DataTableColumnWidthMode,
  userSize: number | undefined
) {
  if (widthMode === 'adaptive') {
    if (
      typeof userSize === 'number' &&
      Number.isFinite(userSize) &&
      userSize > 0
    ) {
      return `${userSize}px`
    }

    const columnWidthMode = column.columnDef.meta?.widthMode ?? 'preferred'
    if (columnWidthMode === 'content' || isContentSizedColumn(column.id)) {
      return '1%'
    }

    if (columnWidthMode === 'flex') {
      return undefined
    }

    return `${column.getSize()}px`
  }

  if (isContentSizedColumn(column.id)) {
    return '1%'
  }

  if (table.options.enableColumnResizing === true) {
    return `${column.getSize()}px`
  }

  if (totalSize <= 0) {
    return undefined
  }

  return `${(column.getSize() / totalSize) * 100}%`
}
