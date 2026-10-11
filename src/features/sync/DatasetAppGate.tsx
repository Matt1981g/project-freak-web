import { useEffect, useState, type PropsWithChildren } from 'react'
import { projectFreakAppAccess } from '../../application/sync/datasetAppAccess'

/**
 * A tab must receive a shared app lease before mounting any routes which
 * read/write IndexedDB. During local restore the app stays mounted but inert,
 * preserving BackupScreen's progress/result state until the lease resumes.
 */
export function DatasetAppGate({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false)
  const [ever_ready, setEverReady] = useState(false)

  useEffect(() => projectFreakAppAccess.subscribe((available) => {
    setReady(available)
    if (available) setEverReady(true)
  }), [])

  return (
    <>
      {ever_ready && (
        <div inert={!ready} aria-hidden={!ready}>
          {children}
        </div>
      )}
      {!ready && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            padding: '2rem',
            color: '#c6ff00',
            background: '#080807',
            fontWeight: 900,
          }}
        >
          PF DATA MAINTENANCE — waiting for safe database access.
          Do not log sets until this screen clears.
        </div>
      )}
    </>
  )
}
