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
import i18next from 'i18next'
import { beforeAll, describe, expect, test } from 'vitest'

import AuditJsonViewer, {
  AUDIT_JSON_AUTO_HIGHLIGHT_LIMIT,
} from '../audit-json-viewer'

describe('AuditJsonViewer', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Disable syntax highlighting': 'Disable syntax highlighting',
      'Enable syntax highlighting': 'Enable syntax highlighting',
      'Large JSON payload': 'Large JSON payload',
      'Syntax highlighting is disabled by default to keep large payloads responsive.':
        'Syntax highlighting is disabled by default to keep large payloads responsive.',
    })
  })

  test('syntax-highlights a normal JSON payload', async () => {
    render(
      <AuditJsonViewer
        ariaLabel='Client Request'
        payloadKey='request-1:client-request'
        value={{ enabled: true, model: 'gpt-5', tokens: 42 }}
      />
    )

    const viewer = screen.getByRole('region', { name: 'Client Request' })
    expect(viewer).toHaveAttribute('data-highlight-enabled', 'true')
    expect(viewer).toHaveAttribute('data-large-payload', 'false')
    await waitFor(() => {
      expect(viewer.querySelector('.audit-json-property')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-string')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-number')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-literal')).toBeInTheDocument()
      expect(viewer.querySelector('.cm-lineWrapping')).toBeInTheDocument()
    })
  })

  test('requires an explicit action before highlighting a large payload', async () => {
    const user = userEvent.setup()
    render(
      <AuditJsonViewer
        ariaLabel='Upstream Response'
        payloadKey='request-1:upstream-response'
        value={{ body: 'x'.repeat(AUDIT_JSON_AUTO_HIGHLIGHT_LIMIT) }}
      />
    )

    const viewer = screen.getByRole('region', { name: 'Upstream Response' })
    expect(viewer).toHaveAttribute('data-highlight-enabled', 'false')
    expect(viewer).toHaveAttribute('data-large-payload', 'true')

    await user.click(
      screen.getByRole('button', { name: 'Enable syntax highlighting' })
    )

    expect(viewer).toHaveAttribute('data-highlight-enabled', 'true')
    expect(
      screen.getByRole('button', { name: 'Disable syntax highlighting' })
    ).toBeInTheDocument()
  })
})
