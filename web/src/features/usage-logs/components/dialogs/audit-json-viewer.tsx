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
import { json } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { tags as highlightTags } from '@lezer/highlight'
import { Braces } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export const AUDIT_JSON_AUTO_HIGHLIGHT_LIMIT = 1 << 20

type AuditJsonViewerProps = {
  ariaLabel: string
  payloadKey: string
  value: unknown
}

const auditJsonHighlightStyle = HighlightStyle.define([
  { tag: highlightTags.propertyName, class: 'audit-json-property' },
  { tag: highlightTags.string, class: 'audit-json-string' },
  { tag: highlightTags.number, class: 'audit-json-number' },
  {
    tag: [highlightTags.bool, highlightTags.null],
    class: 'audit-json-literal',
  },
  {
    tag: [highlightTags.punctuation, highlightTags.bracket],
    class: 'audit-json-punctuation',
  },
  { tag: highlightTags.invalid, class: 'audit-json-invalid' },
])

const auditJsonEditorTheme = EditorView.theme({
  '&': {
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '0.75rem',
    maxHeight: '26.25rem',
    minHeight: '12rem',
    minWidth: '0',
    width: '100%',
  },
  '.cm-content': {
    caretColor: 'transparent',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.25rem',
    minHeight: '12rem',
    minWidth: '0',
    padding: '0.75rem 1rem 1rem 0.5rem',
    width: '100%',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    background: 'var(--muted)',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6875rem',
    lineHeight: '1.25rem',
  },
  '.cm-line': {
    overflowWrap: 'anywhere',
    padding: '0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2.75rem',
    padding: '0 0.75rem 0 0.5rem',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.25rem',
    maxHeight: '26.25rem',
    minHeight: '12rem',
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    background:
      'color-mix(in oklch, var(--primary) 24%, transparent) !important',
  },
  '.audit-json-property': {
    color: 'var(--chart-1)',
  },
  '.audit-json-string': {
    color: 'var(--chart-5)',
  },
  '.audit-json-number': {
    color: 'var(--chart-4)',
  },
  '.audit-json-literal': {
    color: 'var(--chart-3)',
  },
  '.audit-json-punctuation': {
    color: 'var(--muted-foreground)',
  },
  '.audit-json-invalid': {
    color: 'var(--destructive)',
    textDecoration: 'underline wavy',
  },
})

function stringifyJsonValue(value: unknown) {
  if (value == null || value === '') {
    return '-'
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function syntaxExtensions(enabled: boolean): Extension {
  if (!enabled) {
    return []
  }
  return [json(), syntaxHighlighting(auditJsonHighlightStyle)]
}

export default function AuditJsonViewer(props: AuditJsonViewerProps) {
  const { t } = useTranslation()
  const editorHostRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const languageCompartmentRef = useRef(new Compartment())
  const code = useMemo(() => stringifyJsonValue(props.value), [props.value])
  const initialCodeRef = useRef(code)
  const initialAriaLabelRef = useRef(props.ariaLabel)
  const appliedCodeRef = useRef(code)
  const [highlightedLargePayloadKey, setHighlightedLargePayloadKey] = useState<
    string | null
  >(null)
  const isLargePayload = code.length > AUDIT_JSON_AUTO_HIGHLIGHT_LIMIT
  const highlightEnabled =
    !isLargePayload || highlightedLargePayloadKey === props.payloadKey
  const appliedHighlightRef = useRef(highlightEnabled)

  useEffect(() => {
    const host = editorHostRef.current
    if (!host) {
      return
    }

    const view = new EditorView({
      doc: initialCodeRef.current,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        auditJsonEditorTheme,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        languageCompartmentRef.current.of(
          syntaxExtensions(appliedHighlightRef.current)
        ),
      ],
      parent: host,
    })
    view.contentDOM.setAttribute('aria-label', initialAriaLabelRef.current)
    view.contentDOM.setAttribute('aria-readonly', 'true')
    editorViewRef.current = view

    return () => {
      view.destroy()
      editorViewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view || appliedHighlightRef.current === highlightEnabled) {
      return
    }
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        syntaxExtensions(highlightEnabled)
      ),
    })
    appliedHighlightRef.current = highlightEnabled
  }, [highlightEnabled])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view || appliedCodeRef.current === code) {
      return
    }
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: code,
      },
    })
    appliedCodeRef.current = code
  }, [code])

  useEffect(() => {
    const content = editorViewRef.current?.contentDOM
    if (content) {
      content.setAttribute('aria-label', props.ariaLabel)
    }
  }, [props.ariaLabel])

  return (
    <div
      aria-label={props.ariaLabel}
      className='flex w-full max-w-full min-w-0 flex-col gap-2 overflow-hidden'
      data-highlight-enabled={highlightEnabled ? 'true' : 'false'}
      data-large-payload={isLargePayload ? 'true' : 'false'}
      role='region'
    >
      {isLargePayload && !highlightEnabled && (
        <Alert>
          <Braces />
          <AlertTitle>{t('Large JSON payload')}</AlertTitle>
          <AlertDescription>
            {t(
              'Syntax highlighting is disabled by default to keep large payloads responsive.'
            )}
          </AlertDescription>
          <div className='col-start-2 mt-2'>
            <Button
              size='xs'
              type='button'
              variant='outline'
              onClick={() => setHighlightedLargePayloadKey(props.payloadKey)}
            >
              {t('Enable syntax highlighting')}
            </Button>
          </div>
        </Alert>
      )}
      {isLargePayload && highlightEnabled && (
        <div className='flex justify-end'>
          <Button
            size='xs'
            type='button'
            variant='ghost'
            onClick={() => setHighlightedLargePayloadKey(null)}
          >
            {t('Disable syntax highlighting')}
          </Button>
        </div>
      )}
      <div
        className='bg-background w-full max-w-full min-w-0 overflow-hidden rounded-lg border'
        ref={editorHostRef}
      />
    </div>
  )
}
