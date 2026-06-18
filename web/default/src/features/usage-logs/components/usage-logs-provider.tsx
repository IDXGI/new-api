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
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  getRequestAuditByMjId,
  getRequestAuditByRequestId,
  getRequestAuditByTaskId,
} from '../api'
import type { ChannelAffinityInfo, RequestAuditRecord } from '../types'

interface UsageLogsContextValue {
  selectedUserId: number | null
  setSelectedUserId: (userId: number | null) => void
  userInfoDialogOpen: boolean
  setUserInfoDialogOpen: (open: boolean) => void
  affinityTarget: ChannelAffinityInfo | null
  setAffinityTarget: (target: ChannelAffinityInfo | null) => void
  affinityDialogOpen: boolean
  setAffinityDialogOpen: (open: boolean) => void
  sensitiveVisible: boolean
  setSensitiveVisible: (visible: boolean) => void
  auditDialogOpen: boolean
  auditRecord: RequestAuditRecord | null
  auditLoading: boolean
  auditPayloadLoading: boolean
  openAuditByRequestId: (requestId: string) => void
  openAuditByTaskId: (taskId: string) => void
  openAuditByMjId: (mjId: string) => void
  closeAuditDialog: () => void
}

const UsageLogsContext = createContext<UsageLogsContextValue | undefined>(
  undefined
)

export function UsageLogsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [userInfoDialogOpen, setUserInfoDialogOpen] = useState(false)
  const [affinityTarget, setAffinityTarget] =
    useState<ChannelAffinityInfo | null>(null)
  const [affinityDialogOpen, setAffinityDialogOpen] = useState(false)
  const [sensitiveVisible, setSensitiveVisible] = useState(true)
  const [auditDialogOpen, setAuditDialogOpen] = useState(false)
  const [auditRecord, setAuditRecord] = useState<RequestAuditRecord | null>(
    null
  )
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditPayloadLoading, setAuditPayloadLoading] = useState(false)
  const auditRequestSeqRef = useRef(0)

  const loadAuditPayloadByRequestId = useCallback(
    async (requestId: string, requestSeq = auditRequestSeqRef.current) => {
      if (!requestId) return
      setAuditPayloadLoading(true)
      try {
        const result = await getRequestAuditByRequestId(requestId)
        if (requestSeq !== auditRequestSeqRef.current) return
        if (result.success && result.data) {
          setAuditRecord((prev) => {
            if (!prev || prev.request_id !== requestId) return result.data!
            return { ...prev, ...result.data }
          })
        } else {
          toast.error(result.message || t('Failed to load request audit'))
        }
      } catch {
        if (requestSeq === auditRequestSeqRef.current) {
          toast.error(t('Failed to load request audit'))
        }
      } finally {
        if (requestSeq === auditRequestSeqRef.current) {
          setAuditPayloadLoading(false)
        }
      }
    },
    [t]
  )

  const openAudit = useCallback(
    async (
      targetId: string,
      loader: (
        id: string,
        includePayloads?: boolean
      ) => ReturnType<typeof getRequestAuditByRequestId>,
      emptyMessage: string
    ) => {
      if (!targetId) {
        toast.error(emptyMessage)
        return
      }

      const requestSeq = auditRequestSeqRef.current + 1
      auditRequestSeqRef.current = requestSeq
      setAuditDialogOpen(true)
      setAuditRecord(null)
      setAuditLoading(true)
      setAuditPayloadLoading(false)

      try {
        const result = await loader(targetId, false)
        if (requestSeq !== auditRequestSeqRef.current) return
        if (result.success && result.data) {
          setAuditRecord(result.data)
          setAuditLoading(false)
          void loadAuditPayloadByRequestId(result.data.request_id, requestSeq)
        } else {
          setAuditDialogOpen(false)
          setAuditRecord(null)
          setAuditLoading(false)
          toast.error(result.message || t('Failed to load request audit'))
        }
      } catch {
        if (requestSeq !== auditRequestSeqRef.current) return
        setAuditDialogOpen(false)
        setAuditRecord(null)
        setAuditLoading(false)
        toast.error(t('Failed to load request audit'))
      }
    },
    [loadAuditPayloadByRequestId, t]
  )

  const openAuditByRequestId = useCallback(
    (requestId: string) => {
      void openAudit(
        requestId,
        getRequestAuditByRequestId,
        t('This log has no request ID available')
      )
    },
    [openAudit, t]
  )

  const openAuditByTaskId = useCallback(
    (taskId: string) => {
      void openAudit(
        taskId,
        getRequestAuditByTaskId,
        t('This task has no task ID available')
      )
    },
    [openAudit, t]
  )

  const openAuditByMjId = useCallback(
    (mjId: string) => {
      void openAudit(
        mjId,
        getRequestAuditByMjId,
        t('This drawing task has no task ID available')
      )
    },
    [openAudit, t]
  )

  const closeAuditDialog = useCallback(() => {
    auditRequestSeqRef.current += 1
    setAuditDialogOpen(false)
    setAuditLoading(false)
    setAuditPayloadLoading(false)
    setAuditRecord(null)
  }, [])

  return (
    <UsageLogsContext.Provider
      value={{
        selectedUserId,
        setSelectedUserId,
        userInfoDialogOpen,
        setUserInfoDialogOpen,
        affinityTarget,
        setAffinityTarget,
        affinityDialogOpen,
        setAffinityDialogOpen,
        sensitiveVisible,
        setSensitiveVisible,
        auditDialogOpen,
        auditRecord,
        auditLoading,
        auditPayloadLoading,
        openAuditByRequestId,
        openAuditByTaskId,
        openAuditByMjId,
        closeAuditDialog,
      }}
    >
      {children}
    </UsageLogsContext.Provider>
  )
}

export function useUsageLogsContext() {
  const context = useContext(UsageLogsContext)
  if (!context) {
    throw new Error('useUsageLogsContext must be used within UsageLogsProvider')
  }
  return context
}
