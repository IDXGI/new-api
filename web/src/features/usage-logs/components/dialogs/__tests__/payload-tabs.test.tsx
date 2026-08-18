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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import type { ReactElement } from 'react'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { RequestAuditRecord } from '../../../types'
import { RequestAuditDialog } from '../request-audit-dialog'

const getRequestAuditPayloadByRequestId = vi.hoisted(() => vi.fn())

vi.mock('../../../api', () => ({
  getRequestAuditPayloadByRequestId,
}))

const auditRecord: RequestAuditRecord = {
  request_id: 'req-audit-tabs',
  route_path: '/v1/responses',
  payloads_loaded: false,
}

const sectionRecords = {
  trace: { trace: { request_conversion: ['openai_responses', 'claude'] } },
  client_request: {
    client_request: { body_json: { model: 'client-request-model' } },
  },
  upstream_request: {
    upstream_request: { body_json: { model: 'upstream-request-model' } },
  },
  upstream_response: {
    upstream_response: { body_json: { model: 'upstream-response-model' } },
  },
  client_response: {
    client_response: { body_json: { model: 'client-response-model' } },
  },
}

function renderDialog(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
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

  beforeEach(() => {
    getRequestAuditPayloadByRequestId.mockReset()
    getRequestAuditPayloadByRequestId.mockImplementation(
      async (_requestId: string, section: keyof typeof sectionRecords) => ({
        success: true,
        data: {
          request_id: auditRecord.request_id,
          ...sectionRecords[section],
        },
      })
    )
  })

  test('opens on trace and defers large wire payloads until their tab is selected', async () => {
    const user = userEvent.setup()
    renderDialog(
      <RequestAuditDialog
        open
        onOpenChange={vi.fn()}
        loading={false}
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
    expect(getRequestAuditPayloadByRequestId).toHaveBeenCalledWith(
      'req-audit-tabs',
      'trace'
    )
    expect(getRequestAuditPayloadByRequestId).toHaveBeenCalledTimes(1)
    expect(getRequestAuditPayloadByRequestId).not.toHaveBeenCalledWith(
      'req-audit-tabs',
      'client_request'
    )
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

    await user.click(screen.getByRole('tab', { name: 'Trace' }))
    await waitFor(() => {
      expect(
        getRequestAuditPayloadByRequestId.mock.calls.filter(
          ([, section]) => section === 'trace'
        )
      ).toHaveLength(1)
    })
  })

  test('keeps the payload area stable while the first tab request is pending', async () => {
    let resolveTrace: (
      value: Awaited<ReturnType<typeof getRequestAuditPayloadByRequestId>>
    ) => void = () => undefined
    getRequestAuditPayloadByRequestId.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTrace = resolve
        })
    )

    renderDialog(
      <RequestAuditDialog
        open
        onOpenChange={vi.fn()}
        loading={false}
        auditRecord={auditRecord}
        onOpenRequestAudit={vi.fn()}
      />
    )

    const tabContent = document.querySelector('[data-slot="tabs-content"]')
    expect(tabContent).toHaveClass('min-h-[26.25rem]')
    expect(tabContent).toHaveAttribute('aria-busy', 'true')
    expect(tabContent?.firstElementChild).toHaveClass('h-[26.25rem]')
    expect(screen.queryByText('Loading audit payloads')).not.toBeInTheDocument()

    await act(async () => {
      resolveTrace({
        success: true,
        data: {
          request_id: auditRecord.request_id,
          ...sectionRecords.trace,
        },
      })
    })

    expect(
      await screen.findByRole('region', { name: 'Trace' })
    ).toHaveTextContent('request_conversion')
    expect(tabContent).toHaveAttribute('aria-busy', 'false')
  })
})
