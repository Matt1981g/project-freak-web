import { useEffect, useMemo, useState } from 'react'
import {
  TRAINING_PRIORITY_AREAS,
  move_priority,
  type MuscleIntentMap,
  type TrainingPriorityArea,
  type TrainingPriorityState,
} from '../../application/priorities/trainingPriorities'
import {
  load_priority_settings,
  save_priority_settings,
} from '../../app/projectFreakServices'
import styles from './PrioritiesScreen.module.css'

export function PrioritiesScreen() {
  const [state, setState] = useState<TrainingPriorityState | null>(null)
  const [order, setOrder] = useState<TrainingPriorityArea[]>([
    ...TRAINING_PRIORITY_AREAS,
  ])
  const [intents, setIntents] = useState<MuscleIntentMap>(() =>
    Object.fromEntries(
      TRAINING_PRIORITY_AREAS.map((area) => [area, 'grow']),
    ) as MuscleIntentMap,
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void load_priority_settings()
      .then((loaded) => {
        if (!active) return
        setState(loaded)
        setOrder([...loaded.current])
        setIntents({ ...loaded.intent_by_area })
      })
      .catch((cause) => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load training priorities.',
        )
      })

    return () => {
      active = false
    }
  }, [])

  const dirty = useMemo(() => {
    if (!state) return false
    return (
      order.some((area, index) => area !== state.current[index]) ||
      TRAINING_PRIORITY_AREAS.some(
        (area) => intents[area] !== state.intent_by_area[area],
      )
    )
  }, [intents, order, state])

  function move(from_index: number, to_index: number) {
    setOrder((current) => move_priority(current, from_index, to_index))
    setSaved(false)
  }

  async function persist() {
    if (saving) return

    setSaving(true)
    setError(null)

    try {
      const updated = await save_priority_settings(order, intents)
      setState(updated)
      setOrder([...updated.current])
      setIntents({ ...updated.intent_by_area })
      setSaved(true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save training priorities.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!state && !error) {
    return <div className={styles.state}>Loading priorities…</div>
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PROGRAMMING INPUT</p>
          <h1>Training Priorities</h1>
          <p>
            Rank all 12 areas, then mark each as Grow or Maintain. Priority
            controls where growth resources go first; intent controls whether
            the Coach should actively progress that area at all.
          </p>
        </div>
        <div className={styles.status}>
          {state?.configured ? 'CONFIGURED' : 'NOT YET CONFIRMED'}
        </div>
      </section>

      <section className={styles.priorityPanel}>
        <div className={styles.panelHeader}>
          <div>
            <span>1 = HIGHEST PRIORITY</span>
            <h2>Your ranking</h2>
          </div>
          <small>
            Move any body part directly to a new rank. Save creates a dated
            snapshot for future programme analysis.
          </small>
        </div>

        <div className={styles.priorityList}>
          {order.map((area, index) => (
            <article className={styles.priorityRow} key={area}>
              <div className={styles.rank}>{index + 1}</div>
              <div className={styles.priorityName}>
                <strong>{area}</strong>
                <div className={styles.intentToggle} role="group" aria-label={`${area} training intent`}>
                  <button
                    type="button"
                    className={intents[area] === 'grow' ? styles.intentActive : undefined}
                    disabled={saving}
                    onClick={() => {
                      setIntents((current) => ({ ...current, [area]: 'grow' }))
                      setSaved(false)
                    }}
                  >
                    GROW
                  </button>
                  <button
                    type="button"
                    className={intents[area] === 'maintain' ? styles.intentMaintain : undefined}
                    disabled={saving}
                    onClick={() => {
                      setIntents((current) => ({ ...current, [area]: 'maintain' }))
                      setSaved(false)
                    }}
                  >
                    MAINTAIN
                  </button>
                </div>
              </div>

              <label className={styles.moveTo}>
                <span>MOVE TO</span>
                <select
                  aria-label={`Move ${area} to priority`}
                  value={index + 1}
                  disabled={saving}
                  onChange={(event) =>
                    move(index, Number(event.target.value) - 1)
                  }
                >
                  {order.map((_, target_index) => (
                    <option key={target_index + 1} value={target_index + 1}>
                      {target_index + 1}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.moveButtons}>
                <button
                  type="button"
                  aria-label={`Move ${area} up`}
                  disabled={saving || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${area} down`}
                  disabled={saving || index === order.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.saveBar}>
          <div>
            {error ? (
              <strong className={styles.error}>{error}</strong>
            ) : saved ? (
              <strong className={styles.saved}>SAVED ✓</strong>
            ) : dirty ? (
              <span>Unsaved priority changes</span>
            ) : state?.configured ? (
              <span>Current ranking saved</span>
            ) : (
              <span>Confirm this ranking before Coach Bridge uses it</span>
            )}
          </div>
          <button
            type="button"
            disabled={
              saving || (!dirty && Boolean(state?.configured) && !error)
            }
            onClick={() => void persist()}
          >
            {saving ? 'SAVING…' : 'SAVE PRIORITIES'}
          </button>
        </div>
      </section>

      {state && state.history.length > 0 && (
        <section className={styles.historyNote}>
          <span>PRIORITY HISTORY</span>
          <strong>{state.history.length} dated snapshot{state.history.length === 1 ? '' : 's'}</strong>
          <small>
            Historical snapshots stay available so future Coach Bridge exports
            can explain why an older programme was biased differently.
          </small>
        </section>
      )}
    </div>
  )
}
