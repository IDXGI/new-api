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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import type { RequestAuditRecord } from '../../../types'
import { RequestAuditDialog } from '../request-audit-dialog'

const answerToken = `answer-${'a'.repeat(2048)}`
const payloadToken = `payload-${'b'.repeat(2048)}`

const auditRecord: RequestAuditRecord = {
  request_id: 'req-audit-long-content',
  route_path: '/v1/responses',
  payloads_loaded: true,
  aggregated_text: answerToken,
  client_request: { body_json: { input: payloadToken } },
}

describe('request audit dialog layout', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value: () => [],
    })
  })

  test('keeps long answer and payload tokens inside the dialog width', async () => {
    const user = userEvent.setup()
    render(
      <RequestAuditDialog
        open
        onOpenChange={vi.fn()}
        loading={false}
        payloadLoading={false}
        auditRecord={auditRecord}
        onOpenRequestAudit={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog')
    const scrollArea = dialog.querySelector('[data-slot="scroll-area"]')
    const tabs = dialog.querySelector('[data-slot="tabs"]')
    const tabContent = dialog.querySelector('[data-slot="tabs-content"]')
    const answerBlock = screen.getByText(answerToken)
    await user.click(screen.getByRole('tab', { name: 'Client Request' }))
    const payloadViewer = await screen.findByRole('region', {
      name: 'Client Request',
    })

    expect(scrollArea).toHaveClass(
      'w-full',
      'min-w-0',
      'max-w-full',
      'overflow-x-hidden'
    )
    expect(tabs).toHaveClass('min-w-0', 'max-w-full')
    expect(tabContent).toHaveClass('min-w-0', 'max-w-full')
    expect(answerBlock).toHaveClass(
      'min-w-0',
      'max-w-full',
      '[overflow-wrap:anywhere]'
    )
    expect(payloadViewer).toHaveClass(
      'w-full',
      'min-w-0',
      'max-w-full',
      'overflow-hidden'
    )
    await waitFor(() => {
      expect(payloadViewer.querySelector('.cm-editor')).toBeInTheDocument()
      expect(payloadViewer.querySelector('.cm-scroller')).toBeInTheDocument()
    })
  })
})
