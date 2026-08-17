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
import { describe, expect, test, vi } from 'vitest'

import { CommonLogAuditPreview } from '../columns/common-log-audit-preview'

describe('common log audit preview', () => {
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
