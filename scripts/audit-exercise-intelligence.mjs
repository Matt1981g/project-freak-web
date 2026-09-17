import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

// Read-only audit. Optional simulation operates on copies and never restores data.
const [input, output, mode] = process.argv.slice(2)
if (!input || !output || (mode && mode !== '--simulate-backfill')) {
  throw new Error('Usage: npm run audit:intelligence -- <backup-or-coach-export.json> <report.json> [--simulate-backfill]')
}
if (resolve(input) === resolve(output)) throw new Error('Report must not overwrite the source export.')
const source = JSON.parse(await readFile(input, 'utf8'))
const catalogue = source.database?.tables?.exercises ?? source.coach_context?.exercise_catalogue ?? source.exercises
if (!Array.isArray(catalogue) || catalogue.some((item) => !item || !(item.id || item.exercise_id) || !(item.canonical_name || item.exercise_name))) {
  throw new Error('Expected a PF backup, coach export or exercise catalogue with IDs and names.')
}
const exercises = catalogue.map((item) => ({
  ...item, id: item.id ?? item.exercise_id, canonical_name: item.canonical_name ?? item.exercise_name,
  archived_at: item.archived_at ?? null, deleted_at: item.deleted_at ?? null,
}))
const aliases = source.database?.tables?.exercise_aliases ?? source.coach_context?.exercise_aliases ?? []
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { inspect_exercise_intelligence } = await server.ssrLoadModule('/src/application/exercises/exerciseIntelligenceAudit.ts')
  const report = {
    source_exported_at: source.exported_at ?? source.created_at ?? null,
    scope: 'Only the records in the supplied export; not a live database verification.',
    stored: inspect_exercise_intelligence(exercises, aliases),
  }
  if (mode === '--simulate-backfill') {
    const { classify_exercise_intelligence } = await server.ssrLoadModule('/src/application/exercises/exerciseIntelligence.ts')
    const { classify_known_legacy_exercise } = await server.ssrLoadModule('/src/application/exercises/exerciseIntelligenceLegacy.ts')
    report.simulated = inspect_exercise_intelligence(exercises.map((exercise) => ({
      ...exercise,
      exercise_intelligence: exercise.exercise_intelligence ?? classify_known_legacy_exercise(exercise) ?? classify_exercise_intelligence(exercise),
    })), aliases)
  }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ stored: report.stored.status, active: report.stored.active_exercises,
    findings: report.stored.findings.length, simulated_findings: report.simulated?.findings.length, report: output }))
} finally {
  await server.close()
}
