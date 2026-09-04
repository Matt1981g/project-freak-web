import { load_weekly_training_analysis } from '../application/analysis/weeklyAnalysis'
import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'

const repositories = create_repositories(projectFreakDb)

export function load_analysis_dashboard() {
  return load_weekly_training_analysis(repositories.sessions)
}
