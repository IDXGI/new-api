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
import type { Column, Row, Table } from '@tanstack/react-table'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { DataTableColgroup } from '../core/data-table-colgroup'
import { DataTableRow } from '../core/data-table-row'
import {
  getAdaptiveColumnMaxWidth,
  getTableSizeStyle,
} from '../core/table-sizing'

type RowData = Record<string, unknown>

function createColumn(
  id: string,
  size: number,
  widthMode?: 'content' | 'preferred' | 'flex',
  maxSize?: number
): Column<RowData, unknown> {
  return {
    id,
    columnDef: { maxSize, meta: { widthMode } },
    getSize: () => size,
  } as unknown as Column<RowData, unknown>
}

function createTable(
  columns: Column<RowData, unknown>[],
  columnSizing: Record<string, number> = {}
): Table<RowData> {
  return {
    getVisibleLeafColumns: () => columns,
    getState: () => ({ columnSizing }),
    options: { enableColumnResizing: false },
  } as unknown as Table<RowData>
}

function createRow(column: Column<RowData, unknown>): Row<RowData> {
  const cell = {
    id: `row-1_${column.id}`,
    column,
    getContext: () => ({}),
  }

  return {
    id: 'row-1',
    getIsSelected: () => false,
    getVisibleCells: () => [cell],
  } as unknown as Row<RowData>
}

describe('data table adaptive column widths', () => {
  test('shrinks content columns and leaves flex columns available for remaining space', () => {
    const table = createTable([
      createColumn('status', 150, 'content'),
      createColumn('model', 180, 'preferred'),
      createColumn('details', 200, 'flex'),
    ])

    const { container } = render(
      <table>
        <DataTableColgroup table={table} widthMode='adaptive' />
      </table>
    )
    const columns = container.querySelectorAll('col')

    expect(columns[0]).toHaveStyle({ width: '1%' })
    expect(columns[1]).toHaveStyle({ width: '180px' })
    expect(columns[2].style.width).toBe('')
  })

  test('keeps an explicit user width as a pixel override', () => {
    const table = createTable([createColumn('details', 200, 'flex')], {
      details: 320,
    })

    const { container } = render(
      <table>
        <DataTableColgroup table={table} widthMode='adaptive' />
      </table>
    )

    expect(container.querySelector('col')).toHaveStyle({ width: '320px' })
  })

  test('caps content-sized cells while preserving their intrinsic width below the cap', () => {
    const column = createColumn('model', 180, 'content', 220)
    const { container } = render(
      <table>
        <tbody>
          <DataTableRow row={createRow(column)} columnWidthMode='adaptive' />
        </tbody>
      </table>
    )
    const cell = container.querySelector('td')

    expect(getAdaptiveColumnMaxWidth(column, 'adaptive')).toBe(220)
    expect(cell).toHaveStyle({ maxWidth: '220px' })
    expect(cell?.firstElementChild).toHaveStyle({ maxWidth: '220px' })
  })

  test('uses a shared safety cap for adaptive content columns without an explicit maximum', () => {
    const column = createColumn('channel', 150, 'content')

    expect(getAdaptiveColumnMaxWidth(column, 'adaptive')).toBe(240)
    expect(getAdaptiveColumnMaxWidth(column, 'proportional')).toBeUndefined()
  })

  test('caps preferred columns at their resolved width and leaves flex columns unconstrained', () => {
    const preferredColumn = createColumn('created_at', 180, 'preferred')
    const flexColumn = createColumn('details', 200, 'flex')

    expect(getAdaptiveColumnMaxWidth(preferredColumn, 'adaptive')).toBe(180)
    expect(getAdaptiveColumnMaxWidth(flexColumn, 'adaptive')).toBeUndefined()
  })

  test('preserves proportional sizing as the shared table default', () => {
    const table = createTable([
      createColumn('first', 100),
      createColumn('second', 300),
    ])

    const { container } = render(
      <table>
        <DataTableColgroup table={table} />
      </table>
    )
    const columns = container.querySelectorAll('col')

    expect(columns[0]).toHaveStyle({ width: '25%' })
    expect(columns[1]).toHaveStyle({ width: '75%' })
  })

  test('removes the summed fixed minimum width in adaptive mode', () => {
    const table = createTable([
      createColumn('status', 150, 'content'),
      createColumn('details', 200, 'flex'),
    ])

    expect(getTableSizeStyle(table, 'adaptive')).toEqual({
      minWidth: '100%',
      tableLayout: 'auto',
      width: '100%',
    })
  })
})
