import { useEffect, useState } from 'react'
import type { GymProfile } from '../../domain/models'
import { load_gym_profile_state, select_active_gym_profile, load_gym_equipment, change_gym_equipment, add_new_gym_equipment, verify_gym_equipment } from '../../app/projectFreakServices'
import { save_gym_machine_identity } from '../../app/gymMachineDetailsService'
import styles from './GymProfilesScreen.module.css'
import { save_equipment_profile_link } from '../../app/equipmentProfileService'

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
  const [details, setDetails] = useState<{
    id: string
    name: string
    display_name: string
    brand: string
    model: string
    setup_notes: string
  } | null>(null)
  const [profileLink, setProfileLink] = useState<{ exercise_id: string; name: string; profile_id: string; label: string } | null>(null)

  async function saveProfileLink() {
    if (!editing || !profileLink) return
    setSaving(profileLink.exercise_id)
    setError(null)
    try {
      await save_equipment_profile_link(editing.id, profileLink.exercise_id, profileLink.profile_id || null, profileLink.label)
      setEquipment(await load_gym_equipment(editing.id))
      setProfileLink(null)
      setNotice('Equipment profile saved. Past workouts are unchanged; new workouts will record this equipment.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save equipment profile.') }
    finally { setSaving(null) }
  }
  const [equipmentView, setEquipmentView] = useState<'available' | 'unconfirmed' | 'all'>('available')

  async function saveDetails() {
    if (!editing || !details) return
    setSaving(details.id)
    setError(null)
    try {
      await save_gym_machine_identity(
        editing.id,
        details.id,
        details.display_name,
        details.brand,
        details.model,
        details.setup_notes,
      )
      setEquipment(await load_gym_equipment(editing.id))
      setDetails(null)
      setNotice('Machine details and setup note saved for this gym only. Existing workout history and exercise ID are unchanged.')
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
      setProfileLink(null)
      setDetails(null)
      setSearch('')
      setAdding(false)
      setDraft({ name: '', brand: '', model: '', category: '' })
      setNotice(null)
      setEquipmentView('available')
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

  async function verify(exercise_id: string, verified: boolean) {
    if (!editing) return
    setSaving(exercise_id)
    setError(null)
    try {
      await verify_gym_equipment(editing.id, exercise_id, verified)
      setEquipment(await load_gym_equipment(editing.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save verification.')
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
          <p>{new Set(equipment.filter(row => row.available && row.equipment_profile).map(row => row.equipment_profile!.id)).size} equipment profiles linked.
            {' '}{equipment.filter(row => row.available && row.equipment_profile?.status === 'needs_review').length} options need equipment confirmation.
            Multiple exercises can share a machine while keeping their own performance records.</p>
          {profileLink && (
            <form onSubmit={event => { event.preventDefault(); void saveProfileLink() }}>
              <fieldset className={styles.newMachine} disabled={saving !== null}>
                <legend>Equipment used for {profileLink.name}</legend>
                <label>Physical machine or equivalent equipment
                  <select value={profileLink.profile_id} onChange={event => setProfileLink({ ...profileLink, profile_id: event.target.value })}>
                    <option value="">Create a separate equipment profile</option>
                    {[...new Map(equipment.filter(row => row.equipment_profile).map(row => [row.equipment_profile!.id, row.equipment_profile!])).values()]
                      .sort((a, b) => a.label.localeCompare(b.label)).map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                  </select>
                </label>
                {!profileLink.profile_id && <label>Distinct equipment label
                  <input required maxLength={120} value={profileLink.label} onChange={event => setProfileLink({ ...profileLink, label: event.target.value })}
                    placeholder="e.g. Hotel gym A — seated cable row" />
                </label>}
                <p>Only link the same physical machine or equipment you know has equivalent loads. Keep different exercise variants separate.</p>
                <button type="submit">Confirm equipment</button>
                <button type="button" onClick={() => setProfileLink(null)}>Cancel</button>
              </fieldset>
            </form>
          )}
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
          <div className={styles.filters}>
            <button type="button" aria-pressed={equipmentView === 'available'} onClick={() => setEquipmentView('available')}>
              Available ({equipment.filter(row => row.available).length})
            </button>
            <button type="button" aria-pressed={equipmentView === 'unconfirmed'} onClick={() => setEquipmentView('unconfirmed')}>
              Needs confirmation ({equipment.filter(row => row.available && (row.gym_notes?.startsWith('[UNCONFIRMED]') || row.equipment_profile?.status === 'needs_review')).length})
            </button>
            <button type="button" aria-pressed={equipmentView === 'all'} onClick={() => setEquipmentView('all')}>
              Show all ({equipment.length})
            </button>
          </div>
          {details && (
            <form onSubmit={event => { event.preventDefault(); void saveDetails() }}>
              <fieldset className={styles.newMachine} disabled={saving !== null}>
                <legend>Edit machine details — {editing.short_name} only</legend>
                <label>Display name
                  <input required maxLength={120} value={details.display_name} onChange={event => setDetails({ ...details, display_name: event.target.value })} />
                </label>
                <label>Brand (optional)<input maxLength={120} value={details.brand} onChange={event => setDetails({ ...details, brand: event.target.value })} /></label>
                <label>Model / variant (optional)<input maxLength={120} value={details.model} onChange={event => setDetails({ ...details, model: event.target.value })} /></label>
                <label>Setup note (optional)
                  <textarea maxLength={500} rows={3} value={details.setup_notes}
                    placeholder="e.g. Seat 4 · backrest 2 · handles neutral"
                    onChange={event => setDetails({ ...details, setup_notes: event.target.value })} />
                </label>
                <p>Use the setup note for repeatable settings such as seat, backrest, pin or handle position. It appears on the machine here and during your workout.</p>
                <p>This changes how the existing machine is identified at {editing.short_name}. Its exercise ID stays the same, so linked workouts, sets and performance history remain intact. Historical workout names are not rewritten.</p>
                <button type="submit">Save machine & setup</button>
                <button type="button" onClick={() => setDetails(null)}>Cancel</button>
              </fieldset>
            </form>
          )}
          <div className={styles.options}>
            {equipment
              .filter(row => (
                equipmentView === 'all' ||
                (equipmentView === 'available' && row.available) ||
                (equipmentView === 'unconfirmed' && row.available && (row.gym_notes?.startsWith('[UNCONFIRMED]') || row.equipment_profile?.status === 'needs_review'))
              ) && `${row.display_name} ${row.equipment ?? ''} ${row.gym_notes ?? ''} ${row.setup_notes ?? ''}`.toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => Number(b.available) - Number(a.available) || a.display_name.localeCompare(b.display_name))
              .map(row => {
                const unconfirmed = row.gym_notes?.startsWith('[UNCONFIRMED]') ?? false
                const confirmed = row.gym_notes?.startsWith('[CONFIRMED]') ?? false
                const note = row.gym_notes?.replace(/^\[(?:UNCONFIRMED|CONFIRMED)\]\s*/, '')
                return (
              <div key={row.id} className={styles.option}>
                <div><strong>{row.display_name}</strong><small>{row.machine_brand || 'Brand not specified'}{row.machine_model ? ` · ${row.machine_model}` : ''}</small>
                  {row.available && row.equipment_profile && <small>Equipment: {row.equipment_profile.label}
                    {row.equipment_profile.status === 'needs_review' ? ' — confirm before comparing loads' : ' — linked'}</small>}
                  {row.available && <button disabled={saving !== null} onClick={() => {
                    setProfileLink({ exercise_id: row.id, name: row.display_name,
                      profile_id: row.equipment_profile?.id ?? '', label: row.display_name })
                    setDetails(null)
                  }}>Link equipment</button>}
                  {row.setup_notes && <small className={styles.setupNote}><b>SETUP</b>{row.setup_notes}</small>}
                  {note && <small className={styles.detail}>{note}</small>}
                  {row.available && (unconfirmed || confirmed) && (
                    <button className={confirmed ? styles.confirmed : styles.unconfirmed} disabled={saving !== null}
                      onClick={() => void verify(row.id, !confirmed)}>
                      {confirmed ? 'Confirmed present' : 'Confirm present'}
                    </button>
                  )}
                  {row.available && <button disabled={saving !== null} onClick={() => {
                    setDetails({
                      id: row.id,
                      name: row.canonical_name,
                      display_name: row.display_name,
                      brand: row.machine_brand ?? '',
                      model: row.machine_model ?? '',
                      setup_notes: row.setup_notes ?? '',
                    })
                    setAdding(false)
                  }}>Edit machine & setup</button>}
                </div>
                <button disabled={saving !== null} aria-label={`${row.available ? 'Remove' : 'Add'} ${row.canonical_name}`}
                  onClick={() => void toggle(row.id, !row.available)}>
                  {saving === row.id ? 'Saving…' : row.available ? 'Remove' : 'Add'}
                </button>
              </div>
                )
              })}
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
