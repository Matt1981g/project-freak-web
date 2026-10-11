import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import { with_atomic_workout_set_save } from './atomicSetSave'

const NAME = 'pf-atomic-set-save-test'

describe('whole-set transaction under interrupted writes', () => {
  let db: ProjectFreakDatabase
  beforeEach(async () => {
    await Dexie.delete(NAME)
    db = new ProjectFreakDatabase(NAME)
    await db.open()
  })
  afterEach(async () => {
    db.close()
    await Dexie.delete(NAME)
  })

  it('rolls back the set, advanced component, audit and outbox when one step fails', async () => {
    const failing = with_atomic_workout_set_save(db, async () => {
      await db.sets.put({ id: 'set-1' } as never)
      await db.set_components.put({ id: 'component-1' } as never)
      await db.audit_events.put({ id: 'audit-1' } as never)
      await db.sync_outbox.put({ id: 'pending-1' } as never)
      throw new Error('Simulated iOS interruption or component write failure')
    })
    await expect(failing).rejects.toThrow('Simulated iOS interruption')
    expect(await db.sets.count()).toBe(0)
    expect(await db.set_components.count()).toBe(0)
    expect(await db.audit_events.count()).toBe(0)
    expect(await db.sync_outbox.count()).toBe(0)
  })

  it('commits the entire logical set graph in one operation on success', async () => {
    await expect(with_atomic_workout_set_save(db, async () => {
      await db.sets.put({ id: 'set-1' } as never)
      await db.set_components.put({ id: 'component-1' } as never)
      await db.audit_events.put({ id: 'audit-1' } as never)
      await db.sync_outbox.put({ id: 'pending-1' } as never)
      return 'committed'
    })).resolves.toBe('committed')
    expect(await db.sets.count()).toBe(1)
    expect(await db.set_components.count()).toBe(1)
    expect(await db.audit_events.count()).toBe(1)
    expect(await db.sync_outbox.count()).toBe(1)
  })
})
