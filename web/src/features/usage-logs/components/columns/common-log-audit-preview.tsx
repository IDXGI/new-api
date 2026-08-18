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
import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

import { getRequestAuditPayloadByRequestId } from '../../api'

const AUDIT_ANSWER_PREVIEW_RUNE_LIMIT = 160
const AUDIT_ANSWER_HOVER_DELAY_MS = 500
const AUDIT_ANSWER_HOVER_CLOSE_DELAY_MS = 200
const AUDIT_ANSWER_TEXT_SIZE = 'text-[13px] leading-relaxed'

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

function AuditAnswerHoverContent(props: {
  fallbackText: string
  requestId: string
}) {
  const fullAnswerQuery = useQuery({
    queryKey: ['request-audit', 'payload', props.requestId, 'answer'],
    queryFn: async () => {
      const result = await getRequestAuditPayloadByRequestId(
        props.requestId,
        'answer'
      )
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Request audit unavailable')
      }
      const fullAnswerText = result.data.aggregated_text?.trim() ?? ''
      return fullAnswerText || props.fallbackText
    },
    enabled: props.requestId !== '',
    placeholderData: props.fallbackText,
    retry: false,
    staleTime: Infinity,
  })
  const answerText = fullAnswerQuery.data?.trim() || props.fallbackText

  return (
    <div
      className='min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap'
      aria-busy={fullAnswerQuery.isFetching}
    >
      {answerText}
    </div>
  )
}

export function CommonLogAuditPreview(props: {
  answerText?: string
  hasAudit?: boolean
  requestId?: string
  auditLabel: string
  unavailableLabel: string
  onOpen: (requestId: string) => void
}) {
  const requestId = props.requestId?.trim() ?? ''
  const answerPreview = getAuditAnswerPreview(props.answerText)
  const canOpen = requestId !== '' && (props.hasAudit || answerPreview !== '')
  const displayText = answerPreview || '—'
  const hoverText = props.answerText?.trim() ?? ''
  let nativeTitle: string | undefined
  if (!hoverText) {
    nativeTitle = canOpen ? props.auditLabel : props.unavailableLabel
  }
  const cursorPositionRef = useRef({ x: 0, y: 0 })
  const cursorAnchor = useMemo(
    () => ({
      getBoundingClientRect: () => {
        const { x, y } = cursorPositionRef.current
        return {
          bottom: y,
          height: 0,
          left: x,
          right: x,
          top: y,
          width: 0,
          x,
          y,
          toJSON: () => ({ x, y, width: 0, height: 0 }),
        } as DOMRect
      },
    }),
    []
  )

  return (
    <HoverCard>
      <HoverCardTrigger
        delay={AUDIT_ANSWER_HOVER_DELAY_MS}
        closeDelay={AUDIT_ANSWER_HOVER_CLOSE_DELAY_MS}
        render={
          <button
            type='button'
            className={`focus-visible:ring-ring block w-full min-w-0 border-0 bg-transparent p-0 text-left focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default ${AUDIT_ANSWER_TEXT_SIZE}`}
            data-disable-active-scale
            aria-label={props.auditLabel}
            title={nativeTitle}
            disabled={!canOpen}
            onPointerEnter={(event) => {
              cursorPositionRef.current = {
                x: event.clientX,
                y: event.clientY,
              }
            }}
            onPointerMove={(event) => {
              cursorPositionRef.current = {
                x: event.clientX,
                y: event.clientY,
              }
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (canOpen) props.onOpen(requestId)
            }}
          />
        }
      >
        <span className='text-muted-foreground hover:text-foreground line-clamp-2 break-all whitespace-normal transition-colors'>
          {displayText}
        </span>
      </HoverCardTrigger>
      {hoverText && (
        <HoverCardContent
          role='tooltip'
          align='start'
          anchor={cursorAnchor}
          positionMethod='fixed'
          side='bottom'
          sideOffset={10}
          className={`max-h-64 w-80 max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain p-3 text-left ${AUDIT_ANSWER_TEXT_SIZE}`}
        >
          <AuditAnswerHoverContent
            fallbackText={hoverText}
            requestId={requestId}
          />
        </HoverCardContent>
      )}
    </HoverCard>
  )
}
