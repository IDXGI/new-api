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
import type { ColumnDef } from '@tanstack/react-table'
import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { useCommonLogsColumns } from '../columns/common-logs-columns'
import { useDrawingLogsColumns } from '../columns/drawing-logs-columns'
import { useTaskLogsColumns } from '../columns/task-logs-columns'

vi.mock('../model-badge', () => ({
  ModelBadge: () => null,
}))

type ColumnWithAccessor = ColumnDef<unknown> & {
  accessorKey?: string
}

function getColumn(
  columns: ColumnDef<unknown>[],
  columnId: string
): ColumnDef<unknown> {
  const column = columns.find((candidate) => {
    const resolvedColumn = candidate as ColumnWithAccessor
    return (
      resolvedColumn.id === columnId || resolvedColumn.accessorKey === columnId
    )
  })

  if (!column) {
    throw new Error(`Missing column: ${columnId}`)
  }

  return column
}

describe('usage log adaptive column widths', () => {
  test('uses details as the flexible common-log column', () => {
    const { result } = renderHook(() => useCommonLogsColumns(true, true))
    const columns = result.current as ColumnDef<unknown>[]

    expect(getColumn(columns, 'created_at').meta?.widthMode).toBe('preferred')
    expect(getColumn(columns, 'is_stream').meta?.widthMode).toBe('content')
    expect(getColumn(columns, 'quota').meta?.widthMode).toBe('content')
    expect(getColumn(columns, 'content').meta?.widthMode).toBe('flex')
    expect(getColumn(columns, 'audit').meta?.widthMode).toBe('content')
  })

  test('keeps drawing statuses compact and gives prompt the remaining width', () => {
    const { result } = renderHook(() => useDrawingLogsColumns(true, true))
    const columns = result.current as ColumnDef<unknown>[]

    expect(getColumn(columns, 'action').meta?.widthMode).toBe('content')
    expect(getColumn(columns, 'duration').meta?.widthMode).toBe('content')
    expect(getColumn(columns, 'prompt').meta?.widthMode).toBe('flex')
    expect(getColumn(columns, 'fail_reason').meta?.widthMode).toBe('preferred')
    expect(getColumn(columns, 'audit').meta?.widthMode).toBe('content')
  })

  test('keeps task statuses compact and gives details the remaining width', () => {
    const { result } = renderHook(() => useTaskLogsColumns(true, true))
    const columns = result.current as ColumnDef<unknown>[]

    expect(getColumn(columns, 'status').meta?.widthMode).toBe('content')
    expect(getColumn(columns, 'progress').meta?.widthMode).toBe('content')
    expect(getColumn(columns, 'fail_reason').meta?.widthMode).toBe('flex')
    expect(getColumn(columns, 'audit').meta?.widthMode).toBe('content')
  })
})
