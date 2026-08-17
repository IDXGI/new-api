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
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { tags as highlightTags } from '@lezer/highlight'
import { useEffect, useMemo, useRef } from 'react'

type AuditJsonViewerProps = {
  ariaLabel: string
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
    fontSize: '0.8125rem',
    maxHeight: '26.25rem',
    minHeight: '12rem',
    minWidth: '0',
    width: '100%',
  },
  '.cm-content': {
    caretColor: 'transparent',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.375rem',
    minHeight: '12rem',
    minWidth: '0',
    padding: '0.75rem 1rem 1rem 0.5rem',
    width: '100%',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    background: 'var(--background)',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    lineHeight: '1.375rem',
  },
  '.cm-line': {
    overflowWrap: 'anywhere',
    padding: '0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2rem',
    padding: '0 0.375rem 0 0.25rem',
    textAlign: 'right',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.375rem',
    maxHeight: '26.25rem',
    minHeight: '12rem',
    overflowX: 'hidden',
    overflowY: 'auto',
    scrollbarColor: 'var(--border) var(--background)',
    scrollbarWidth: 'auto',
  },
  '.cm-scroller::-webkit-scrollbar': {
    height: '12px',
    width: '12px',
  },
  '.cm-scroller::-webkit-scrollbar-track': {
    background: 'var(--background)',
  },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--border)',
    border: '2px solid var(--background)',
    borderRadius: '999px',
  },
  '.cm-scroller::-webkit-scrollbar-thumb:hover': {
    background: 'var(--muted-foreground)',
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

export default function AuditJsonViewer(props: AuditJsonViewerProps) {
  const editorHostRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const code = useMemo(() => stringifyJsonValue(props.value), [props.value])
  const initialCodeRef = useRef(code)
  const initialAriaLabelRef = useRef(props.ariaLabel)
  const appliedCodeRef = useRef(code)

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
        json(),
        syntaxHighlighting(auditJsonHighlightStyle),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
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
      className='w-full max-w-full min-w-0 overflow-hidden'
      data-highlight-enabled='true'
      role='region'
    >
      <div
        className='bg-background w-full max-w-full min-w-0 overflow-hidden rounded-lg border'
        ref={editorHostRef}
      />
    </div>
  )
}
