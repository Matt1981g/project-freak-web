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

  useEffect(() => {
    const unsubscribe = projectFreakAppAccess.subscribe((available) => {
      setReady(available)
      if (available) setEverReady(true)
    })

    const reacquire_on_foreground = () => {
      if (document.visibilityState === 'visible') {
        projectFreakAppAccess.ensure_access()
      }
    }
    document.addEventListener('visibilitychange', reacquire_on_foreground)
    window.addEventListener('pageshow', reacquire_on_foreground)
    window.addEventListener('focus', reacquire_on_foreground)
    return () => {
      document.removeEventListener('visibilitychange', reacquire_on_foreground)
      window.removeEventListener('pageshow', reacquire_on_foreground)
      window.removeEventListener('focus', reacquire_on_foreground)
      unsubscribe()
    }
  }, [])

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
