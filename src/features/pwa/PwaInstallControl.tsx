import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

function is_standalone(): boolean {
  const media_standalone = window.matchMedia('(display-mode: standalone)').matches
  const ios_standalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)

  return media_standalone || ios_standalone
}

function install_diagnostic(): string {
  const secure = window.isSecureContext
  const service_worker_supported = 'serviceWorker' in navigator
  const controlled = Boolean(navigator.serviceWorker?.controller)
  const standalone = is_standalone()

  return [
    `Secure context: ${secure ? 'YES' : 'NO'}`,
    `Service worker support: ${service_worker_supported ? 'YES' : 'NO'}`,
    `Service worker controlling page: ${controlled ? 'YES' : 'NO'}`,
    `Already standalone: ${standalone ? 'YES' : 'NO'}`,
    '',
    standalone
      ? 'PROJECT FREAK is already installed/running as an app.'
      : secure && service_worker_supported
        ? 'The browser has not offered the install prompt yet. Reload once after the service worker activates, then check again.'
        : 'Install requires a secure context. localhost counts as secure; a plain http:// LAN IP does not.',
  ].join('\n')
}

export function PwaInstallControl() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() =>
    typeof window === 'undefined' ? false : is_standalone(),
  )

  useEffect(() => {
    function handle_before_install_prompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    function handle_installed() {
      setInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handle_before_install_prompt)
    window.addEventListener('appinstalled', handle_installed)

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handle_before_install_prompt,
      )
      window.removeEventListener('appinstalled', handle_installed)
    }
  }, [])

  if (installed) {
    return (
      <span className="pwa-install-status" title="PROJECT FREAK is installed">
        APP ✓
      </span>
    )
  }

  if (installPrompt) {
    return (
      <button
        type="button"
        className="pwa-install-button"
        onClick={() => {
          const prompt = installPrompt
          setInstallPrompt(null)

          void prompt
            .prompt()
            .then(() => prompt.userChoice)
            .then((choice) => {
              if (choice.outcome !== 'accepted') {
                setInstallPrompt(prompt)
              }
            })
            .catch(() => {
              setInstallPrompt(prompt)
            })
        }}
      >
        INSTALL APP
      </button>
    )
  }

  return (
    <button
      type="button"
      className="pwa-install-check"
      onClick={() => window.alert(install_diagnostic())}
    >
      INSTALL CHECK
    </button>
  )
}
