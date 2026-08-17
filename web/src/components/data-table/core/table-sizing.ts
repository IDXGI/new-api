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
import type * as React from 'react'

import { isContentSizedColumn } from './content-sized-columns'
import type { DataTableColumnWidthMode } from './types'

const DEFAULT_ADAPTIVE_CONTENT_MAX_WIDTH = 240

export function getAdaptiveColumnMaxWidth<TData>(
  column: Column<TData, unknown>,
  widthMode: DataTableColumnWidthMode
): number | undefined {
  if (widthMode !== 'adaptive') {
    return undefined
  }

  const configuredMaxWidth = column.columnDef.maxSize
  if (
    typeof configuredMaxWidth === 'number' &&
    Number.isFinite(configuredMaxWidth) &&
    configuredMaxWidth > 0
  ) {
    return configuredMaxWidth
  }

  const columnWidthMode = column.columnDef.meta?.widthMode ?? 'preferred'
  if (columnWidthMode === 'flex') {
    return undefined
  }
  if (columnWidthMode === 'content' || isContentSizedColumn(column.id)) {
    return DEFAULT_ADAPTIVE_CONTENT_MAX_WIDTH
  }

  const preferredWidth = column.getSize()
  return Number.isFinite(preferredWidth) && preferredWidth > 0
    ? preferredWidth
    : undefined
}

export function getTableSizeStyle<TData>(
  table: TanstackTable<TData>,
  widthMode: DataTableColumnWidthMode = 'proportional'
): React.CSSProperties {
  if (widthMode === 'adaptive') {
    return {
      minWidth: '100%',
      tableLayout: 'auto',
      width: '100%',
    }
  }

  const width = table
    .getVisibleLeafColumns()
    .filter((column) => !isContentSizedColumn(column.id))
    .reduce((total, column) => total + column.getSize(), 0)

  return {
    minWidth: `max(100%, ${width}px)`,
    tableLayout: 'auto',
    width: '100%',
  }
}
