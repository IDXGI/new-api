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
import { describe, expect, test } from 'vitest'

import AuditJsonViewer from '../audit-json-viewer'

describe('AuditJsonViewer', () => {
  test('syntax-highlights a normal JSON payload', async () => {
    render(
      <AuditJsonViewer
        ariaLabel='Client Request'
        value={{ enabled: true, model: 'gpt-5', tokens: 42 }}
      />
    )

    const viewer = screen.getByRole('region', { name: 'Client Request' })
    expect(viewer).toHaveAttribute('data-highlight-enabled', 'true')
    await waitFor(() => {
      expect(viewer.querySelector('.audit-json-property')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-string')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-number')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-literal')).toBeInTheDocument()
      expect(viewer.querySelector('.cm-lineWrapping')).toBeInTheDocument()
    })
  })

  test('always syntax-highlights a large JSON payload', async () => {
    render(
      <AuditJsonViewer
        ariaLabel='Upstream Response'
        value={{ body: 'x'.repeat((1 << 20) + 1) }}
      />
    )

    const viewer = screen.getByRole('region', { name: 'Upstream Response' })
    expect(viewer).toHaveAttribute('data-highlight-enabled', 'true')
    expect(
      screen.queryByRole('button', { name: /syntax highlighting/i })
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(viewer.querySelector('.audit-json-property')).toBeInTheDocument()
      expect(viewer.querySelector('.audit-json-string')).toBeInTheDocument()
    })
  })
})
