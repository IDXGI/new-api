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
import { Check, Clipboard, Copy, FileJson, Link2, Route } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { RequestAuditRecord, RequestAuditRelatedRecord } from '../../types'

const RELATED_FILTER_ALL = 'all'

const LazyAuditJsonViewer = lazy(() => import('./audit-json-viewer'))

function getRelatedCategory(routeGroup?: string) {
  if (!routeGroup) return 'other'
  if (routeGroup.includes('submit')) return 'submit'
  if (routeGroup.includes('fetch')) return 'fetch'
  if (routeGroup.includes('content')) return 'content'
  if (routeGroup.includes('notify')) return 'notify'
  if (routeGroup.includes('seed')) return 'seed'
  return 'other'
}

function getRelatedCategoryLabel(category: string, t: TFunction) {
  switch (category) {
    case RELATED_FILTER_ALL:
      return t('All')
    case 'submit':
      return t('Submit')
    case 'fetch':
      return t('Fetch')
    case 'content':
      return t('Content')
    case 'notify':
      return t('Callback')
    case 'seed':
      return t('Seed')
    default:
      return t('Other')
  }
}

function formatDurationMs(value?: number, emptyAsDash = false) {
  if (value == null || value === 0) return emptyAsDash ? '-' : '0 ms'
  if (!Number.isFinite(value)) return emptyAsDash ? '-' : '0 ms'
  return `${value} ms`
}

function stringifyValue(value: unknown) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getAuditAggregatedText(auditRecord: RequestAuditRecord | null) {
  if (!auditRecord) return ''
  if (typeof auditRecord.aggregated_text === 'string') {
    return auditRecord.aggregated_text.trim()
  }
  const responsePayload = auditRecord.response
  if (responsePayload && typeof responsePayload === 'object') {
    const aggregatedText = (responsePayload as Record<string, unknown>)
      .aggregated_text
    if (typeof aggregatedText === 'string') return aggregatedText.trim()
  }
  return ''
}

function getModelMappingValue(auditRecord: RequestAuditRecord, t: TFunction) {
  const requestedModel = auditRecord.model_name || ''
  const trace = auditRecord.trace
  const traceModelResolution =
    trace && typeof trace === 'object'
      ? ((trace as Record<string, unknown>).model_resolution as
          | Record<string, unknown>
          | undefined)
      : undefined
  const upstreamModel =
    auditRecord.upstream_model_name ||
    String(traceModelResolution?.upstream_model || '')
  const isModelMapped =
    Boolean(traceModelResolution?.is_model_mapped) ||
    Boolean(requestedModel && upstreamModel && requestedModel !== upstreamModel)

  if (!requestedModel && !upstreamModel) return '-'
  if (!isModelMapped || !upstreamModel || requestedModel === upstreamModel) {
    return t('No mapping')
  }
  return `${requestedModel} -> ${upstreamModel}`
}

type TFunction = (key: string, opts?: Record<string, unknown>) => string

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className='grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-3 text-sm'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span
        className={cn(
          'min-w-0 text-xs break-all',
          mono && 'font-mono tabular-nums'
        )}
      >
        {value ?? '-'}
      </span>
    </div>
  )
}

function AuditSection({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className='bg-muted/20 flex w-full max-w-full min-w-0 flex-col gap-3 rounded-lg border p-3'>
      <div className='flex min-w-0 items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h3 className='text-sm font-semibold'>{title}</h3>
          {description && (
            <p className='text-muted-foreground text-xs'>{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MetricCard({
  label,
  value,
  extra,
}: {
  label: string
  value: string
  extra?: string
}) {
  return (
    <div className='bg-background flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-lg border p-3'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className='text-sm font-semibold break-words'>{value}</span>
      {extra && (
        <span className='text-muted-foreground text-xs break-words'>
          {extra}
        </span>
      )}
    </div>
  )
}

function JsonViewerFallback() {
  return (
    <div className='bg-background flex min-h-48 w-full max-w-full min-w-0 flex-col gap-2 overflow-hidden rounded-lg border p-3'>
      <Skeleton className='h-3 w-1/3' />
      <Skeleton className='h-3 w-4/5' />
      <Skeleton className='h-3 w-2/3' />
      <Skeleton className='h-3 w-3/4' />
    </div>
  )
}

function PayloadPlaceholder({ loading }: { loading: boolean }) {
  const { t } = useTranslation()
  return (
    <Empty className='min-h-56 border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          {loading ? <Spinner /> : <FileJson />}
        </EmptyMedia>
        <EmptyTitle>
          {loading
            ? t('Loading audit payloads')
            : t('Audit payloads not ready')}
        </EmptyTitle>
        <EmptyDescription>
          {loading
            ? t(
                'Client, upstream and trace details are loading in the background'
              )
            : t('Audit details are not available yet. Please try again later.')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function AuditEmptyState({ loading }: { loading: boolean }) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <Empty className='min-h-72 border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>{t('Loading audit overview')}</EmptyTitle>
          <EmptyDescription>
            {t('The dialog is open and details will appear shortly.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Empty className='min-h-72 border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Clipboard />
        </EmptyMedia>
        <EmptyTitle>{t('No audit details')}</EmptyTitle>
        <EmptyDescription>
          {t('No request audit record is available for this entry.')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function RelatedRecordButton({
  record,
  activeRequestId,
  onOpenRequestAudit,
}: {
  record: RequestAuditRelatedRecord
  activeRequestId?: string
  onOpenRequestAudit: (requestId: string) => void
}) {
  const { t } = useTranslation()
  const isActive = record.request_id === activeRequestId
  return (
    <Button
      type='button'
      variant={isActive ? 'secondary' : 'outline'}
      className='h-auto min-w-0 justify-start px-3 py-2'
      disabled={isActive}
      onClick={() => onOpenRequestAudit(record.request_id)}
    >
      <div className='flex min-w-0 flex-col items-start gap-1 text-left'>
        <span className='max-w-full truncate text-xs font-medium'>
          {record.route_group || '-'} · {record.method || '-'} ·{' '}
          {record.status_code ?? '-'}
        </span>
        <span className='text-muted-foreground font-mono text-[11px]'>
          {record.created_at
            ? formatTimestampToDate(record.created_at)
            : t('Unknown time')}
        </span>
      </div>
    </Button>
  )
}

interface RequestAuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  payloadLoading: boolean
  auditRecord: RequestAuditRecord | null
  onOpenRequestAudit: (requestId: string) => void
}

export function RequestAuditDialog({
  open,
  onOpenChange,
  loading,
  payloadLoading,
  auditRecord,
  onOpenRequestAudit,
}: RequestAuditDialogProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const [activeDetailTab, setActiveDetailTab] = useState('trace')
  const [relatedFilter, setRelatedFilter] = useState(RELATED_FILTER_ALL)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    setActiveDetailTab('trace')
    setRelatedFilter(RELATED_FILTER_ALL)
    setCopiedKey(null)
  }, [auditRecord?.request_id, open])

  useEffect(() => {
    if (copiedText == null) {
      setCopiedKey(null)
    }
  }, [copiedText])

  const payloadsLoaded = auditRecord?.payloads_loaded !== false
  const aggregatedText = getAuditAggregatedText(auditRecord)
  const clientRequestPayload =
    auditRecord?.client_request ?? auditRecord?.request
  const upstreamRequestPayload = auditRecord?.upstream_request
  const upstreamResponsePayload = auditRecord?.upstream_response
  const clientResponsePayload =
    auditRecord?.client_response ?? auditRecord?.response
  let activeDetailPayload = auditRecord?.trace
  let activeDetailTitle = t('Trace')
  switch (activeDetailTab) {
    case 'client-request':
      activeDetailPayload = clientRequestPayload
      activeDetailTitle = t('Client Request')
      break
    case 'upstream-request':
      activeDetailPayload = upstreamRequestPayload
      activeDetailTitle = t('Upstream Request')
      break
    case 'upstream-response':
      activeDetailPayload = upstreamResponsePayload
      activeDetailTitle = t('Upstream Response')
      break
    case 'client-response':
      activeDetailPayload = clientResponsePayload
      activeDetailTitle = t('Client Response')
      break
  }
  const relatedRecords = useMemo(
    () =>
      Array.isArray(auditRecord?.related_records)
        ? auditRecord.related_records
        : [],
    [auditRecord?.related_records]
  )

  const relatedFilters = useMemo(() => {
    const counters = new Map<string, number>([
      [RELATED_FILTER_ALL, relatedRecords.length],
    ])
    relatedRecords.forEach((record) => {
      const category = getRelatedCategory(record.route_group)
      counters.set(category, (counters.get(category) || 0) + 1)
    })
    return [...counters.entries()].map(([key, count]) => ({
      key,
      count,
      label: getRelatedCategoryLabel(key, t),
    }))
  }, [relatedRecords, t])

  const filteredRelatedRecords =
    relatedFilter === RELATED_FILTER_ALL
      ? relatedRecords
      : relatedRecords.filter(
          (record) => getRelatedCategory(record.route_group) === relatedFilter
        )

  const handleCopy = (copyKey: string, value: unknown) => {
    const content = stringifyValue(value)
    if (!content) return
    void copyToClipboard(content).then((success) => {
      if (success) {
        setCopiedKey(copyKey)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] min-w-0 overflow-hidden sm:max-w-5xl'>
        <DialogHeader className='min-w-0'>
          <DialogTitle className='flex min-w-0 items-center gap-2'>
            <StatusBadge
              label={t('Audit')}
              variant='info'
              size='sm'
              copyable={false}
            />
            <span className='truncate'>{t('Request Audit Details')}</span>
          </DialogTitle>
          <DialogDescription className='break-all'>
            {auditRecord?.route_path ||
              t('Inspect request, response and relay trace data')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[calc(100dvh-8rem)] w-full max-w-full min-w-0 overflow-x-hidden pr-3 [&_[data-slot=scroll-area-viewport]]:max-w-full [&_[data-slot=scroll-area-viewport]]:min-w-0 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden'>
          {auditRecord ? (
            <div className='flex w-full max-w-full min-w-0 flex-col gap-4 overflow-x-hidden pb-1'>
              <AuditSection
                title={t('Audit Overview')}
                description={t('Route, status and key timing metrics')}
                action={
                  <div className='flex flex-wrap justify-end gap-1.5'>
                    {(
                      [
                        ['request-id', t('Request ID'), auditRecord.request_id],
                        [
                          'client-request',
                          t('Client Request'),
                          clientRequestPayload,
                        ],
                        [
                          'upstream-request',
                          t('Upstream Request'),
                          upstreamRequestPayload,
                        ],
                        [
                          'upstream-response',
                          t('Upstream Response'),
                          upstreamResponsePayload,
                        ],
                        [
                          'client-response',
                          t('Client Response'),
                          clientResponsePayload,
                        ],
                        ['trace', t('Trace'), auditRecord.trace],
                      ] as Array<[string, string, unknown]>
                    ).map(([key, label, value]) => (
                      <Button
                        key={key}
                        type='button'
                        variant='outline'
                        size='xs'
                        disabled={
                          key !== 'request-id' &&
                          (!payloadsLoaded || payloadLoading)
                        }
                        onClick={() => handleCopy(key, value)}
                      >
                        {copiedKey === key ? (
                          <Check data-icon='inline-start' />
                        ) : (
                          <Copy data-icon='inline-start' />
                        )}
                        {label}
                      </Button>
                    ))}
                  </div>
                }
              >
                <div className='flex min-w-0 flex-col gap-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <StatusBadge
                      label={auditRecord.success ? t('Success') : t('Failed')}
                      variant={auditRecord.success ? 'success' : 'danger'}
                      size='sm'
                      copyable={false}
                    />
                    {auditRecord.method && (
                      <StatusBadge
                        label={auditRecord.method}
                        variant='blue'
                        size='sm'
                        copyable={false}
                      />
                    )}
                    {auditRecord.mode && (
                      <StatusBadge
                        label={auditRecord.mode}
                        variant='cyan'
                        size='sm'
                        copyable={false}
                      />
                    )}
                    {auditRecord.route_group && (
                      <StatusBadge
                        label={auditRecord.route_group}
                        variant='neutral'
                        size='sm'
                        copyable={false}
                      />
                    )}
                    <StatusBadge
                      label={
                        auditRecord.is_stream ? t('Stream') : t('Non-stream')
                      }
                      variant={auditRecord.is_stream ? 'green' : 'grey'}
                      size='sm'
                      copyable={false}
                    />
                    {auditRecord.is_playground && (
                      <StatusBadge
                        label='Playground'
                        variant='purple'
                        size='sm'
                        copyable={false}
                      />
                    )}
                  </div>

                  <div className='bg-background rounded-lg border p-3'>
                    <div className='flex min-w-0 items-start gap-2'>
                      <Route className='text-muted-foreground mt-0.5' />
                      <div className='flex min-w-0 flex-col gap-1'>
                        <span className='font-mono text-xs break-all'>
                          {auditRecord.request_id || '-'}
                        </span>
                        <span className='text-muted-foreground text-xs break-all'>
                          {auditRecord.route_path || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                    <MetricCard
                      label={t('Total Latency')}
                      value={formatDurationMs(auditRecord.latency_ms)}
                      extra={`${t('Retry Count')}: ${auditRecord.retry_count || 0}`}
                    />
                    <MetricCard
                      label={t('First Response')}
                      value={formatDurationMs(
                        auditRecord.first_response_ms,
                        true
                      )}
                      extra={`${t('Started At')}: ${formatTimestampToDate(auditRecord.started_at)}`}
                    />
                    <MetricCard
                      label={t('Model Mapping')}
                      value={getModelMappingValue(auditRecord, t)}
                      extra={`${t('Upstream Model')}: ${auditRecord.upstream_model_name || '-'}`}
                    />
                    <MetricCard
                      label={t('Created At')}
                      value={formatTimestampToDate(auditRecord.created_at)}
                      extra={`${t('Finished At')}: ${formatTimestampToDate(auditRecord.finished_at)}`}
                    />
                  </div>
                </div>
              </AuditSection>

              {aggregatedText && (
                <AuditSection
                  title={t('Answer Content')}
                  action={
                    <Button
                      type='button'
                      variant='outline'
                      size='xs'
                      onClick={() =>
                        handleCopy('answer-content', aggregatedText)
                      }
                    >
                      {copiedKey === 'answer-content' ? (
                        <Check data-icon='inline-start' />
                      ) : (
                        <Copy data-icon='inline-start' />
                      )}
                      {t('Copy')}
                    </Button>
                  }
                >
                  <div className='bg-background max-h-72 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-lg border p-3 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap'>
                    {aggregatedText}
                  </div>
                </AuditSection>
              )}

              <div className='grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2'>
                <AuditSection
                  title={t('Request Info')}
                  description={t('Request, time and status fields')}
                >
                  <div className='flex min-w-0 flex-col gap-2'>
                    <DetailRow
                      label={t('Request ID')}
                      value={auditRecord.request_id}
                      mono
                    />
                    <DetailRow label={t('User')} value={auditRecord.username} />
                    <DetailRow label={t('Group')} value={auditRecord.group} />
                    <DetailRow
                      label={t('Route Group')}
                      value={auditRecord.route_group}
                    />
                    <DetailRow
                      label={t('Request Path')}
                      value={auditRecord.route_path}
                    />
                    <DetailRow label={t('Method')} value={auditRecord.method} />
                    <DetailRow
                      label={t('Status Code')}
                      value={auditRecord.status_code ?? '-'}
                    />
                    <DetailRow
                      label={t('Created At')}
                      value={formatTimestampToDate(auditRecord.created_at)}
                      mono
                    />
                    <DetailRow
                      label={t('Finished At')}
                      value={formatTimestampToDate(auditRecord.finished_at)}
                      mono
                    />
                  </div>
                </AuditSection>

                <AuditSection
                  title={t('Relay Info')}
                  description={t('Model, channel, token and task references')}
                >
                  <div className='flex min-w-0 flex-col gap-2'>
                    <DetailRow label={t('Mode')} value={auditRecord.mode} />
                    <DetailRow
                      label={t('Model')}
                      value={auditRecord.model_name}
                    />
                    <DetailRow
                      label={t('Upstream Model')}
                      value={auditRecord.upstream_model_name}
                    />
                    <DetailRow
                      label={t('Relay Format')}
                      value={auditRecord.relay_format}
                    />
                    <DetailRow
                      label={t('Relay Mode')}
                      value={auditRecord.relay_mode}
                    />
                    <DetailRow
                      label={t('Channel')}
                      value={
                        auditRecord.channel_name ||
                        (auditRecord.channel_id
                          ? `#${auditRecord.channel_id}`
                          : '-')
                      }
                    />
                    <DetailRow
                      label={t('Token')}
                      value={auditRecord.token_name}
                    />
                    <DetailRow
                      label={t('Task ID')}
                      value={auditRecord.task_id}
                    />
                    <DetailRow label='MjID' value={auditRecord.mj_id} />
                  </div>
                </AuditSection>
              </div>

              {relatedRecords.length > 0 && (
                <AuditSection
                  title={t('Related Requests')}
                  description={t(
                    'Other audit records from the same task or flow'
                  )}
                >
                  <div className='flex flex-wrap gap-1.5'>
                    {relatedFilters.map((filter) => (
                      <Button
                        key={filter.key}
                        type='button'
                        variant={
                          relatedFilter === filter.key ? 'secondary' : 'ghost'
                        }
                        size='xs'
                        onClick={() => setRelatedFilter(filter.key)}
                      >
                        {filter.label} ({filter.count})
                      </Button>
                    ))}
                  </div>
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
                    {filteredRelatedRecords.map((record) => (
                      <RelatedRecordButton
                        key={record.request_id}
                        record={record}
                        activeRequestId={auditRecord.request_id}
                        onOpenRequestAudit={onOpenRequestAudit}
                      />
                    ))}
                  </div>
                </AuditSection>
              )}

              <AuditSection
                title={t('Audit Payloads')}
                description={
                  payloadsLoaded
                    ? t('Inspect request, response and relay trace data')
                    : t(
                        'Large request and response payloads load after the overview'
                      )
                }
                action={
                  payloadLoading ? (
                    <StatusBadge
                      label={t('Loading payloads')}
                      variant='cyan'
                      size='sm'
                      pulse
                      copyable={false}
                    />
                  ) : null
                }
              >
                <Tabs
                  className='max-w-full min-w-0'
                  value={activeDetailTab}
                  onValueChange={setActiveDetailTab}
                >
                  <TabsList className='h-auto max-w-full flex-wrap justify-start'>
                    <TabsTrigger value='trace'>
                      <Route data-icon='inline-start' />
                      {t('Trace')}
                    </TabsTrigger>
                    <TabsTrigger value='client-request'>
                      <Link2 data-icon='inline-start' />
                      {t('Client Request')}
                    </TabsTrigger>
                    <TabsTrigger value='upstream-request'>
                      <Route data-icon='inline-start' />
                      {t('Upstream Request')}
                    </TabsTrigger>
                    <TabsTrigger value='upstream-response'>
                      <FileJson data-icon='inline-start' />
                      {t('Upstream Response')}
                    </TabsTrigger>
                    <TabsTrigger value='client-response'>
                      <Clipboard data-icon='inline-start' />
                      {t('Client Response')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    className='max-w-full min-w-0'
                    value={activeDetailTab}
                  >
                    {payloadsLoaded ? (
                      <Suspense fallback={<JsonViewerFallback />}>
                        <LazyAuditJsonViewer
                          ariaLabel={activeDetailTitle}
                          value={activeDetailPayload}
                        />
                      </Suspense>
                    ) : (
                      <PayloadPlaceholder loading={payloadLoading} />
                    )}
                  </TabsContent>
                </Tabs>
              </AuditSection>
            </div>
          ) : (
            <AuditEmptyState loading={loading} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
