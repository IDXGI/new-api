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
import { useMemo, useRef } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const AUDIT_ANSWER_PREVIEW_RUNE_LIMIT = 160
const AUDIT_ANSWER_HOVER_DELAY_MS = 1000

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
    <TooltipProvider delay={AUDIT_ANSWER_HOVER_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type='button'
              className='focus-visible:ring-ring block w-full min-w-0 border-0 bg-transparent p-0 text-left text-xs leading-relaxed focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default'
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
        </TooltipTrigger>
        {hoverText && (
          <TooltipContent
            align='start'
            anchor={cursorAnchor}
            positionMethod='fixed'
            side='bottom'
            sideOffset={12}
            className='max-h-64 w-80 max-w-[calc(100vw-2rem)] items-start overflow-y-auto px-3 py-2 text-left leading-relaxed break-words whitespace-pre-wrap shadow-md'
          >
            {hoverText}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
