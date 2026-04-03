import React, { createContext, useContext, useMemo } from 'react'
import { Mailbox } from '../utils/mailbox.js'

const MailboxContext = createContext<Mailbox | undefined>(undefined)
let fallbackMailbox: Mailbox | null = null

type Props = {
  children: React.ReactNode
}

export function MailboxProvider({ children }: Props): React.ReactNode {
  const mailbox = useMemo(() => new Mailbox(), [])
  return (
    <MailboxContext.Provider value={mailbox}>{children}</MailboxContext.Provider>
  )
}

export function useMailbox(): Mailbox {
  const mailbox = useContext(MailboxContext)
  if (mailbox) {
    return mailbox
  }

  // Fallback for startup paths that render before provider wiring settles.
  if (!fallbackMailbox) {
    fallbackMailbox = new Mailbox()
  }
  return fallbackMailbox
}
