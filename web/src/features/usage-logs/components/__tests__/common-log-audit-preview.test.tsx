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
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { CommonLogAuditPreview } from '../columns/common-log-audit-preview'

describe('common log audit preview', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('renders only a bounded answer prefix for long audit text', () => {
    const hiddenTail = 'TAIL_MUST_NOT_ENTER_THE_DOM'
    const answerText = `${'回答内容'.repeat(100)}${hiddenTail}`

    render(
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

    render(
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

  test('shows a multiline answer preview at the pointer after a one-second hover', async () => {
    vi.useFakeTimers()
    const answerText = `First answer line\nSecond answer line with more detail than the table cell displays.`

    render(
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
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.textContent).toBe(answerText)
    expect(tooltip).toHaveClass('whitespace-pre-wrap', 'break-words')
    expect(tooltip.parentElement).toHaveStyle({ position: 'fixed' })
  })

  test('does not present a missing audit record as an available audit', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
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
