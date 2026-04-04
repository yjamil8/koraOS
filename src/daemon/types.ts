export type DaemonSessionState = 'active' | 'idle' | 'closed'

export type DaemonSessionRecord = {
  id: string
  projectPath: string
  transcriptPath: string
  createdAt: string
  updatedAt: string
  ownerPid: number | null
  ownerClientId: string | null
  state: DaemonSessionState
  history: unknown[]
}

export type DaemonSessionSummary = Omit<DaemonSessionRecord, 'history'> & {
  historyCount: number
}
