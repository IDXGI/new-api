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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { UsageLogsProvider, useUsageLogsContext } from '../usage-logs-provider'

const getRequestAuditByRequestId = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-admin', () => ({
  useIsAdmin: () => true,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { self_use_mode_enabled: true },
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('../../api', () => ({
  getRequestAuditByMjId: vi.fn(),
  getRequestAuditByRequestId,
  getRequestAuditByTaskId: vi.fn(),
}))

function AuditStateProbe() {
  const {
    auditDialogOpen,
    auditLoading,
    auditRecord,
    closeAuditDialog,
    openAuditByRequestId,
  } = useUsageLogsContext()

  return (
    <div>
      <span data-testid='audit-open'>{String(auditDialogOpen)}</span>
      <span data-testid='audit-loading'>{String(auditLoading)}</span>
      <span data-testid='audit-record'>
        {auditRecord?.request_id ?? 'none'}
      </span>
      <button type='button' onClick={() => openAuditByRequestId('req-stable')}>
        Open
      </button>
      <button type='button' onClick={closeAuditDialog}>
        Close
      </button>
    </div>
  )
}

describe('usage logs audit dialog state', () => {
  test('opens after loading and retains its content during the close animation', async () => {
    let resolveAudit: (value: {
      success: boolean
      data: { request_id: string }
    }) => void = () => undefined
    getRequestAuditByRequestId.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAudit = resolve
        })
    )

    render(
      <UsageLogsProvider>
        <AuditStateProbe />
      </UsageLogsProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByTestId('audit-loading')).toHaveTextContent('true')
    expect(screen.getByTestId('audit-open')).toHaveTextContent('false')
    expect(screen.getByTestId('audit-record')).toHaveTextContent('none')

    await act(async () => {
      resolveAudit({
        success: true,
        data: { request_id: 'req-stable' },
      })
    })

    expect(screen.getByTestId('audit-loading')).toHaveTextContent('false')
    expect(screen.getByTestId('audit-open')).toHaveTextContent('true')
    expect(screen.getByTestId('audit-record')).toHaveTextContent('req-stable')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByTestId('audit-open')).toHaveTextContent('false')
    expect(screen.getByTestId('audit-record')).toHaveTextContent('req-stable')
  })
})
