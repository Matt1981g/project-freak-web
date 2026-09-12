import { useEffect, useState } from 'react'
import type { GymProfile } from '../../domain/models'
import { load_gym_profile_state, select_active_gym_profile } from '../../app/projectFreakServices'
import styles from './GymProfilesScreen.module.css'

type State = Awaited<ReturnType<typeof load_gym_profile_state>>

export function GymProfilesScreen() {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load_gym_profile_state().then(setState).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Unable to load gym profiles.')
    })
  }, [])

  async function select(profile: GymProfile) {
    setSaving(profile.id)
    setError(null)
    try {
      await select_active_gym_profile(profile.id)
      setState(await load_gym_profile_state())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change gym.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.heading}>
        <p>TRAINING LOCATION</p>
        <h1>Gym profiles</h1>
        <span>Choose the equipment profile PF records against your next workout.</span>
      </header>
      {error && <div className={styles.error}>{error}</div>}
      {!state ? <div className={styles.state}>Loading gym profiles…</div> : (
        <div className={styles.grid}>
          {state.profiles.map((profile) => {
            const active = profile.id === state.active_gym_id
            return (
              <article className={active ? styles.activeCard : styles.card} key={profile.id}>
                <div className={styles.cardTop}>
                  <span className={styles.kind}>{profile.kind}</span>
                  {active && <strong>ACTIVE</strong>}
                </div>
                <h2>{profile.name}</h2>
                <p>{profile.notes}</p>
                <div className={styles.inventory}>
                  <b>{state.availability_counts[profile.id] ?? 0}</b>
                  <span>available exercises</span>
                </div>
                {!profile.is_inventory_complete && (
                  <div className={styles.audit}>Inventory awaiting your Trident photo audit</div>
                )}
                <button disabled={active || saving !== null} onClick={() => void select(profile)}>
                  {active ? 'Current gym' : saving === profile.id ? 'Switching…' : `Use ${profile.short_name}`}
                </button>
              </article>
            )
          })}
        </div>
      )}
      <section className={styles.rule}>
        <strong>History stays permanent.</strong>
        <span>Changing gym only changes future workout snapshots. Jacksons data is never deleted.</span>
      </section>
    </div>
  )
}
