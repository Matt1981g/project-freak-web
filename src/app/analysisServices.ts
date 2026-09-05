import { load_analysis_dashboard_data } from '../application/analysis/dashboard'
import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'

const repositories = create_repositories(projectFreakDb)

export function load_analysis_dashboard() {
  return load_analysis_dashboard_data(repositories)
}
