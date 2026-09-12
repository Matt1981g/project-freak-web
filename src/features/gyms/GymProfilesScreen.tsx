import { useEffect, useState } from 'react'
import type { GymProfile } from '../../domain/models'
import { load_gym_profile_state, select_active_gym_profile, load_gym_equipment, change_gym_equipment, add_new_gym_equipment, save_gym_machine_details } from '../../app/projectFreakServices'
import styles from './GymProfilesScreen.module.css'

type State = Awaited<ReturnType<typeof load_gym_profile_state>>

export function GymProfilesScreen() {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GymProfile | null>(null)
  const [equipment, setEquipment] = useState<Awaited<ReturnType<typeof load_gym_equipment>>>([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', brand: '', model: '', category: '' })
  const [notice, setNotice] = useState<string | null>(null)
  const [details, setDetails] = useState<{ id: string; name: string; brand: string; model: string } | null>(null)

  async function saveDetails() {
    if (!editing || !details) return
    setSaving(details.id)
    setError(null)
    try {
      await save_gym_machine_details(editing.id, details.id, details.brand, details.model)
      setEquipment(await load_gym_equipment(editing.id))
      setDetails(null)
      setNotice('Details saved for this gym only. Existing workout history is unchanged.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save details.')
    } finally { setSaving(null) }
  }

  async function create() {
    if (!editing) return
    setSaving('new-machine')
    setError(null)
    setNotice(null)
    try {
      const exercise = await add_new_gym_equipment(editing.id, draft)
      setEquipment(await load_gym_equipment(editing.id))
      setState(await load_gym_profile_state())
      setSearch(exercise.canonical_name)
      setDraft({ name: '', brand: '', model: '', category: '' })
      setAdding(false)
      setNotice(`${exercise.canonical_name} added to ${editing.name}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create machine.')
    } finally { setSaving(null) }
  }

  async function edit(profile: GymProfile) {
    setSaving(profile.id)
    setError(null)
    try {
      const rows = await load_gym_equipment(profile.id)
      setEquipment(rows)
      setEditing(profile)
      setDetails(null)
      setSearch('')
      setAdding(false)
      setDraft({ name: '', brand: '', model: '', category: '' })
      setNotice(null)
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
          <p>Add or remove existing options, or create a new machine below. Availability changes apply to this gym only.</p>
          {notice && <p role="status">{notice}</p>}
          <button disabled={saving !== null} onClick={() => setAdding(!adding)}>Add new machine / exercise</button>
          {adding && (
            <form onSubmit={event => { event.preventDefault(); void create() }}>
              <fieldset disabled={saving !== null} className={styles.newMachine}>
                <legend>New option for {editing.name}</legend>
                <label>Machine / exercise name (required)
                  <input required maxLength={120} value={draft.name} placeholder="e.g. Leg Press" onChange={event => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>Brand (optional)
                  <input maxLength={120} value={draft.brand} placeholder="e.g. Panatta or Hammer Strength" onChange={event => setDraft({ ...draft, brand: event.target.value })} />
                </label>
                <label>Model / variant (optional)
                  <input maxLength={120} value={draft.model} placeholder="e.g. 45-degree plate-loaded" onChange={event => setDraft({ ...draft, model: event.target.value })} />
                </label>
                <label>Muscle / category (optional)
                  <input maxLength={120} value={draft.category} placeholder="e.g. Quads" onChange={event => setDraft({ ...draft, category: event.target.value })} />
                </label>
                <p>Different brands/models are separate exercises with their own history. This creates a total-reps, normal-load exercise. Muscle mappings can be refined under Exercises.</p>
                <button type="submit">{saving === 'new-machine' ? 'Saving…' : `Save to ${editing.short_name}`}</button>
                <button type="button" onClick={() => setAdding(false)}>Cancel</button>
              </fieldset>
            </form>
          )}
          <label>Search equipment or exercise
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. curl, cable, leg press" />
          </label>
          {details && (
            <form onSubmit={event => { event.preventDefault(); void saveDetails() }}>
              <fieldset className={styles.newMachine} disabled={saving !== null}>
                <legend>Edit {details.name} — {editing.short_name} only</legend>
                <label>Brand (optional)<input maxLength={120} value={details.brand} onChange={event => setDetails({ ...details, brand: event.target.value })} /></label>
                <label>Model / variant (optional)<input maxLength={120} value={details.model} onChange={event => setDetails({ ...details, model: event.target.value })} /></label>
                <p>Use this to identify the same machine. For a different physical machine, create a new option instead. Existing workout history will not be rewritten.</p>
                <button type="submit">Save details</button>
                <button type="button" onClick={() => setDetails(null)}>Cancel</button>
              </fieldset>
            </form>
          )}
          <div className={styles.options}>
            {equipment.filter(row => `${row.display_name} ${row.equipment ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(row => (
              <div key={row.id} className={styles.option}>
                <div><strong>{row.display_name}</strong><small>{row.machine_brand || 'Brand not specified'}{row.machine_model ? ` · ${row.machine_model}` : ''}</small>
                  {row.available && <button disabled={saving !== null} onClick={() => {
                    setDetails({ id: row.id, name: row.canonical_name, brand: row.machine_brand ?? '', model: row.machine_model ?? '' })
                    setAdding(false)
                  }}>Edit details</button>}
                </div>
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
