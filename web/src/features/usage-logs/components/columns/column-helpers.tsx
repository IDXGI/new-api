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
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardList, Zap } from 'lucide-react'
/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'

import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampToDate, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatDuration } from '../../lib/format'
import { FailReasonDialog } from '../dialogs/fail-reason-dialog'
import { useUsageLogsContext } from '../usage-logs-provider'

/**
 * Cache tooltip component for token display
 */
export function CacheTooltip({
  tokens,
  label,
  color,
}: {
  tokens: number
  label: string
  color: string
}) {
  if (tokens <= 0) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<Zap className={`size-3 flex-shrink-0 ${color}`} />}
        />
        <TooltipContent side='top'>
          <p className='text-xs'>
            {label}: {formatTokens(tokens)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ============================================================================
// Column Definition Factories
// ============================================================================

/**
 * Create a timestamp column - compact mono style matching common logs
 */
export function createTimestampColumn<T>(config: {
  accessorKey: string
  title: string
  unit?: 'seconds' | 'milliseconds'
}): ColumnDef<T> {
  const { accessorKey, title, unit = 'milliseconds' } = config

  return {
    accessorKey,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ row }) => {
      const timestamp = row.getValue(accessorKey) as number
      if (!timestamp) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }
      return (
        <span className='font-mono text-xs tabular-nums'>
          {formatTimestampToDate(timestamp, unit)}
        </span>
      )
    },
    size: 172,
    minSize: 160,
    meta: { label: title, widthMode: 'preferred' },
  }
}

/**
 * Create a duration column - pill style matching common logs timing
 */
export function createDurationColumn<T>(config: {
  submitTimeKey: string
  finishTimeKey: string
  unit?: 'seconds' | 'milliseconds'
  headerLabel: string
  warningThresholdSec?: number
}): ColumnDef<T> {
  const {
    submitTimeKey,
    finishTimeKey,
    unit = 'milliseconds',
    headerLabel,
    warningThresholdSec = 60,
  } = config

  return {
    id: 'duration',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={headerLabel} />
    ),
    cell: ({ row }) => {
      const log = row.original as Record<string, unknown>
      const duration = formatDuration(
        log[submitTimeKey] as number | undefined,
        log[finishTimeKey] as number | undefined,
        unit
      )

      if (!duration) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }

      const variant =
        duration.durationSec > warningThresholdSec ? 'danger' : 'success'

      const durationBgMap: Record<string, string> = {
        success:
          'border border-emerald-200/40 bg-emerald-50/35 !text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:!text-emerald-400',
        warning:
          'border border-amber-200/45 bg-amber-50/35 !text-amber-600 dark:border-amber-900/40 dark:bg-amber-950/15 dark:!text-amber-400',
        danger:
          'border border-rose-200/50 bg-rose-50/35 !text-red-600 dark:border-rose-900/40 dark:bg-rose-950/15 dark:!text-red-400',
      }

      return (
        <StatusBadge
          label={`${duration.durationSec.toFixed(1)}s`}
          variant={variant}
          size='sm'
          copyable={false}
          className={cn('rounded-md font-mono', durationBgMap[variant])}
        />
      )
    },
    meta: { label: headerLabel, widthMode: 'content' },
  }
}

/**
 * Create a channel column (admin only) - #id badge matching common logs
 */
export function createChannelColumn<T>(config: {
  accessorKey?: string
  headerLabel: string
}): ColumnDef<T> {
  const { accessorKey = 'channel_id', headerLabel } = config

  return {
    accessorKey,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={headerLabel} />
    ),
    cell: ({ row }) => {
      const channelId = row.getValue(accessorKey) as number
      if (!channelId) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }
      return (
        <StatusBadge
          label={`#${channelId}`}
          autoColor={String(channelId)}
          copyText={String(channelId)}
          size='sm'
          showDot={false}
          className='font-mono'
        />
      )
    },
    meta: { label: headerLabel, widthMode: 'content' },
  }
}

/**
 * Create a fail reason column - text-xs truncate, hover underline, dialog
 */
export function createFailReasonColumn<T>(config: {
  accessorKey?: string
  headerLabel: string
  cellTitle: string
}): ColumnDef<T> {
  const { accessorKey = 'fail_reason', headerLabel, cellTitle } = config

  return {
    accessorKey,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={headerLabel} />
    ),
    cell: function FailReasonCell({ row }) {
      const failReason = row.getValue(accessorKey) as string
      const [dialogOpen, setDialogOpen] = useState(false)

      if (!failReason) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }

      return (
        <>
          <button
            type='button'
            className='group flex w-full min-w-0 items-center gap-1 text-left text-xs'
            onClick={() => setDialogOpen(true)}
            title={cellTitle}
          >
            <span className='truncate leading-snug text-red-600 group-hover:underline dark:text-red-400'>
              {failReason}
            </span>
          </button>
          <FailReasonDialog
            failReason={failReason}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        </>
      )
    },
    size: 180,
    minSize: 160,
    maxSize: 220,
    meta: { label: headerLabel, widthMode: 'preferred' },
  }
}

/**
 * Create a progress column - compact mono pill
 */
export function createProgressColumn<T>(config: {
  accessorKey?: string
  headerLabel: string
}): ColumnDef<T> {
  const { accessorKey = 'progress', headerLabel } = config

  return {
    accessorKey,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={headerLabel} />
    ),
    cell: ({ row }) => {
      const progress = row.getValue(accessorKey) as string
      if (!progress) {
        return <span className='text-muted-foreground/60 text-xs'>-</span>
      }
      return (
        <span className='border-border/60 bg-muted/30 inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-xs'>
          {progress}
        </span>
      )
    },
    meta: { label: headerLabel, widthMode: 'content' },
  }
}

export function createRequestAuditColumn<T>(config: {
  headerLabel: string
  unavailableLabel: string
  getRequestId?: (log: T) => string | undefined
  getTaskId?: (log: T) => string | undefined
  getMjId?: (log: T) => string | undefined
}): ColumnDef<T> {
  return {
    id: 'audit',
    accessorFn: (log) =>
      config.getRequestId?.(log) ||
      config.getTaskId?.(log) ||
      config.getMjId?.(log) ||
      '',
    header: config.headerLabel,
    cell: function RequestAuditCell({ row }) {
      const { openAuditByRequestId, openAuditByTaskId, openAuditByMjId } =
        useUsageLogsContext()
      const log = row.original
      const requestId = config.getRequestId?.(log)
      const taskId = config.getTaskId?.(log)
      const mjId = config.getMjId?.(log)
      const canOpen = Boolean(requestId || taskId || mjId)

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='w-full justify-center'
                  disabled={!canOpen}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (requestId) {
                      openAuditByRequestId(requestId)
                    } else if (taskId) {
                      openAuditByTaskId(taskId)
                    } else if (mjId) {
                      openAuditByMjId(mjId)
                    }
                  }}
                />
              }
            >
              <ClipboardList data-icon='inline-start' />
              {config.headerLabel}
            </TooltipTrigger>
            <TooltipContent>
              <p className='text-xs'>
                {canOpen ? config.headerLabel : config.unavailableLabel}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    },
    enableHiding: true,
    enableResizing: false,
    size: 110,
    minSize: 110,
    maxSize: 110,
    meta: { label: config.headerLabel, widthMode: 'preferred' },
  }
}
