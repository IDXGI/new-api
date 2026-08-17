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
const AUDIT_ANSWER_PREVIEW_RUNE_LIMIT = 160

function getAuditAnswerPreview(answerText: string | undefined): string {
  if (!answerText) return ''

  const text = answerText.trimStart()
  let preview = ''
  let runeCount = 0
  let truncated = false

  for (const character of text) {
    if (runeCount >= AUDIT_ANSWER_PREVIEW_RUNE_LIMIT) {
      truncated = true
      break
    }
    preview += character
    runeCount += 1
  }

  preview = preview.trimEnd()
  if (!preview) return ''
  return truncated ? `${preview}…` : preview
}

export function CommonLogAuditPreview(props: {
  answerText?: string
  requestId?: string
  auditLabel: string
  unavailableLabel: string
  onOpen: (requestId: string) => void
}) {
  const requestId = props.requestId?.trim() ?? ''
  const canOpen = requestId !== ''
  const answerPreview = getAuditAnswerPreview(props.answerText)
  let displayText = '—'
  if (canOpen) {
    displayText = answerPreview || props.auditLabel
  }

  return (
    <button
      type='button'
      className='focus-visible:ring-ring block w-full min-w-0 rounded-sm text-left text-xs leading-relaxed focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default'
      aria-label={props.auditLabel}
      title={canOpen ? props.auditLabel : props.unavailableLabel}
      disabled={!canOpen}
      onClick={(event) => {
        event.stopPropagation()
        if (canOpen) props.onOpen(requestId)
      }}
    >
      <span className='text-muted-foreground hover:text-foreground line-clamp-2 break-all transition-colors'>
        {displayText}
      </span>
    </button>
  )
}
