import { useEffect, useState } from 'react'
import type { GymProfile } from '../../domain/models'
import { load_gym_profile_state, select_active_gym_profile, load_gym_equipment, change_gym_equipment } from '../../app/projectFreakServices'
import styles from './GymProfilesScreen.module.css'

type State = Awaited<ReturnType<typeof load_gym_profile_state>>

export function GymProfilesScreen() {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GymProfile | null>(null)
  const [equipment, setEquipment] = useState<Awaited<ReturnType<typeof load_gym_equipment>>>([])
  const [search, setSearch] = useState('')

  async function edit(profile: GymProfile) {
    setSaving(profile.id)
    setError(null)
    try {
      const rows = await load_gym_equipment(profile.id)
      setEquipment(rows)
      setEditing(profile)
      setSearch('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load equipment.')
    } finally { setSaving(null) }
  }

  async function toggle(exercise_id: string, available: boolean) {
    if (!editing) return
    setSaving(exercise_id)
    setError(null)
    try {
      await change_gym_equipment(editing.id, exercise_id, available)
      setEquipment(await load_gym_equipment(editing.id))
      setState(await load_gym_profile_state())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save equipment.')
    } finally { setSaving(null) }
  }

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
                  <div className={styles.audit}>Starting list — review against your actual equipment</div>
                )}
                <button disabled={active || saving !== null} onClick={() => void select(profile)}>
                  {active ? 'Current gym' : saving === profile.id ? 'Switching…' : `Use ${profile.short_name}`}
                </button>
                <button disabled={saving !== null} onClick={() => void edit(profile)}>
                  Edit equipment
                </button>
              </article>
            )
          })}
        </div>
      )}
      {editing && (
        <section className={styles.editor} aria-label={`${editing.name} equipment`}>
          <h2>{editing.name} — equipment & exercise options</h2>
          <p>Add or remove options from the existing exercise library. Changes save automatically for this gym only.</p>
          <label>Search equipment or exercise
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. curl, cable, leg press" />
          </label>
          <div className={styles.options}>
            {equipment.filter(row => `${row.canonical_name} ${row.equipment ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(row => (
              <div key={row.id} className={styles.option}>
                <div><strong>{row.canonical_name}</strong><small>{row.equipment ?? 'Equipment not specified'}</small></div>
                <button disabled={saving !== null} aria-label={`${row.available ? 'Remove' : 'Add'} ${row.canonical_name}`}
                  onClick={() => void toggle(row.id, !row.available)}>
                  {saving === row.id ? 'Saving…' : row.available ? 'Remove' : 'Add'}
                </button>
              </div>
            ))}
          </div>
          <button disabled={saving !== null} onClick={() => setEditing(null)}>Done</button>
        </section>
      )}
      <section className={styles.rule}>
        <strong>History stays permanent.</strong>
        <span>Changing gym only changes future workout snapshots. Jacksons data is never deleted.</span>
      </section>
    </div>
  )
}
