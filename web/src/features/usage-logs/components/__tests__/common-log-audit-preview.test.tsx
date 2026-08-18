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
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { CommonLogAuditPreview } from '../columns/common-log-audit-preview'

const getRequestAuditPayloadByRequestId = vi.hoisted(() => vi.fn())

vi.mock('../../api', () => ({
  getRequestAuditPayloadByRequestId,
}))

function renderPreview(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('common log audit preview', () => {
  beforeEach(() => {
    getRequestAuditPayloadByRequestId.mockReset()
    getRequestAuditPayloadByRequestId.mockResolvedValue({
      success: true,
      data: { aggregated_text: 'Loaded full answer' },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('renders only a bounded answer prefix for long audit text', () => {
    const hiddenTail = 'TAIL_MUST_NOT_ENTER_THE_DOM'
    const answerText = `${'回答内容'.repeat(100)}${hiddenTail}`

    renderPreview(
      <CommonLogAuditPreview
        answerText={answerText}
        hasAudit
        requestId='req-long-answer'
        auditLabel='Audit'
        unavailableLabel='Unavailable'
        onOpen={() => undefined}
      />
    )

    const preview = screen.getByRole('button', { name: 'Audit' })
    const previewText = preview.querySelector('span')
    expect(preview).not.toHaveTextContent(hiddenTail)
    expect(preview).toHaveAttribute('data-disable-active-scale')
    expect(previewText).toHaveClass(
      'line-clamp-2',
      'break-all',
      'whitespace-normal'
    )
    expect(preview.textContent).toMatch(/…$/)
    expect([...(preview.textContent?.slice(0, -1) ?? '')]).toHaveLength(160)
  })

  test('opens the audit dialog when the answer preview is clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    renderPreview(
      <CommonLogAuditPreview
        answerText='Answer preview'
        hasAudit
        requestId='req-click'
        auditLabel='Audit'
        unavailableLabel='Unavailable'
        onOpen={onOpen}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Audit' }))

    expect(onOpen).toHaveBeenCalledWith('req-click')
  })

  test('loads the full answer in a smaller themed popup after a half-second hover', async () => {
    vi.useFakeTimers()
    const answerText = 'Short answer preview'
    const fullAnswerText = `First complete answer line\nSecond complete answer line that is absent from the list preview.`
    getRequestAuditPayloadByRequestId.mockResolvedValue({
      success: true,
      data: { aggregated_text: fullAnswerText },
    })

    renderPreview(
      <CommonLogAuditPreview
        answerText={answerText}
        hasAudit
        requestId='req-hover'
        auditLabel='Audit'
        unavailableLabel='Unavailable'
        onOpen={() => undefined}
      />
    )

    const preview = screen.getByRole('button', { name: 'Audit' })
    fireEvent.pointerMove(preview, { clientX: 120, clientY: 80 })
    fireEvent.pointerEnter(preview, { pointerType: 'mouse' })
    fireEvent.mouseEnter(preview)
    fireEvent.mouseMove(preview, { clientX: 120, clientY: 80 })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(getRequestAuditPayloadByRequestId).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
      await vi.runOnlyPendingTimersAsync()
    })
    const hoverPreview = screen.getByRole('tooltip')
    expect(hoverPreview.textContent).toBe(fullAnswerText)
    expect(getRequestAuditPayloadByRequestId).toHaveBeenCalledWith(
      'req-hover',
      'answer'
    )
    expect(hoverPreview).toHaveClass(
      'bg-popover',
      'text-popover-foreground',
      'max-h-64',
      'overflow-x-hidden',
      'overflow-y-auto',
      'overscroll-contain',
      'text-xs'
    )
    expect(hoverPreview.firstElementChild).toHaveClass(
      'min-w-0',
      'whitespace-pre-wrap',
      '[overflow-wrap:anywhere]'
    )
    expect(hoverPreview.parentElement).toHaveStyle({ position: 'fixed' })
  })

  test('keeps the answer preview open while the pointer moves into its scroll area', async () => {
    vi.useFakeTimers()

    renderPreview(
      <CommonLogAuditPreview
        answerText={'Scrollable answer line\n'.repeat(20)}
        hasAudit
        requestId='req-scroll-preview'
        auditLabel='Audit'
        unavailableLabel='Unavailable'
        onOpen={() => undefined}
      />
    )

    const preview = screen.getByRole('button', { name: 'Audit' })
    fireEvent.pointerMove(preview, { clientX: 120, clientY: 80 })
    fireEvent.pointerEnter(preview, { pointerType: 'mouse' })
    fireEvent.mouseEnter(preview)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    const hoverPreview = screen.getByRole('tooltip')
    fireEvent.pointerLeave(preview, { relatedTarget: hoverPreview })
    fireEvent.mouseLeave(preview, { relatedTarget: hoverPreview })
    fireEvent.pointerEnter(hoverPreview, { relatedTarget: preview })
    fireEvent.mouseEnter(hoverPreview, { relatedTarget: preview })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  test('does not present a missing audit record as an available audit', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    renderPreview(
      <CommonLogAuditPreview
        answerText=''
        hasAudit={false}
        requestId='req-no-answer'
        auditLabel='Audit'
        unavailableLabel='Unavailable'
        onOpen={onOpen}
      />
    )

    const preview = screen.getByRole('button', { name: 'Audit' })
    expect(preview).toHaveTextContent('—')
    expect(preview).toBeDisabled()

    await user.click(preview)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
