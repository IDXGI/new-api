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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import type { RequestAuditRecord } from '../../../types'
import { RequestAuditDialog } from '../request-audit-dialog'

const auditRecord: RequestAuditRecord = {
  request_id: 'req-audit-tabs',
  route_path: '/v1/responses',
  payloads_loaded: true,
  client_request: { body_json: { model: 'client-request-model' } },
  upstream_request: { body_json: { model: 'upstream-request-model' } },
  upstream_response: { body_json: { model: 'upstream-response-model' } },
  client_response: { body_json: { model: 'client-response-model' } },
  trace: { request_conversion: ['openai_responses', 'claude'] },
}

describe('request audit payload tabs', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value: () => [],
    })
    i18next.addResourceBundle('en', 'translation', {
      'Client Request': 'Client Request',
      'Client Response': 'Client Response',
      Trace: 'Trace',
      'Upstream Request': 'Upstream Request',
      'Upstream Response': 'Upstream Response',
    })
  })

  test('opens on trace and defers large wire payloads until their tab is selected', async () => {
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

    expect(screen.getByRole('tab', { name: 'Trace' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.getByRole('tab', { name: 'Client Request' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Upstream Request' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Upstream Response' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Client Response' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(
      await screen.findByRole('region', { name: 'Trace' })
    ).toHaveTextContent('request_conversion')
    expect(
      screen.queryByRole('region', { name: 'Client Request' })
    ).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-highlight-enabled]')).toHaveLength(
      1
    )

    await user.click(screen.getByRole('tab', { name: 'Upstream Request' }))
    expect(
      await screen.findByRole('region', { name: 'Upstream Request' })
    ).toHaveTextContent('upstream-request-model')
    expect(document.querySelectorAll('[data-highlight-enabled]')).toHaveLength(
      1
    )

    await user.click(screen.getByRole('tab', { name: 'Client Response' }))
    expect(
      await screen.findByRole('region', { name: 'Client Response' })
    ).toHaveTextContent('client-response-model')
    expect(document.querySelectorAll('[data-highlight-enabled]')).toHaveLength(
      1
    )
  })
})
