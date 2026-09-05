import { useState } from 'react'
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router'
import { AnalysisScreen } from './features/analysis/AnalysisScreen'
import { DailySessionPrompt } from './features/home/DailySessionPrompt'
import { BackupScreen } from './features/backup/BackupScreen'
import { CoachScreen } from './features/coach/CoachScreen'
import { ExerciseLibraryScreen } from './features/exercises/ExerciseLibraryScreen'
import { HistoryScreen } from './features/history/HistoryScreen'
import { ExerciseHistoryScreen } from './features/history/ExerciseHistoryScreen'
import { PlanScreen } from './features/plan/PlanScreen'
import { PrioritiesScreen } from './features/priorities/PrioritiesScreen'
import { PwaInstallControl } from './features/pwa/PwaInstallControl'
import { AutoSyncRuntime } from './features/sync/AutoSyncRuntime'
import { SyncScreen } from './features/sync/SyncScreen'
import { WorkoutScreen } from './features/workout/WorkoutScreen'
import './App.css'

function App() {
  const location = useLocation()
  const [mobile_more_open, setMobileMoreOpen] = useState(false)
  const secondary_mobile_active = [
    '/priorities',
    '/coach',
    '/backup',
    '/exercises',
  ].some((path) => location.pathname.startsWith(path))

  const nav_class = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          PF
        </div>
        <div className="brand-copy">
          <span>PROJECT FREAK</span>
          <small>LOCAL TRAINING DATABASE</small>
        </div>
        <nav className="app-nav app-nav-desktop" aria-label="Primary">
          <NavLink to="/plan" className={nav_class}>
            Plan
          </NavLink>
          <NavLink to="/history" className={nav_class}>
            History
          </NavLink>
          <NavLink to="/analysis" className={nav_class}>
            Analysis
          </NavLink>
          <NavLink to="/priorities" className={nav_class}>
            Priorities
          </NavLink>
          <NavLink to="/coach" className={nav_class}>
            Coach
          </NavLink>
          <NavLink to="/sync" className={nav_class}>
            Sync
          </NavLink>
          <NavLink to="/backup" className={nav_class}>
            Backup
          </NavLink>
          <NavLink to="/exercises" className={nav_class}>
            Exercises
          </NavLink>
        </nav>

        <nav className="app-nav app-nav-mobile" aria-label="Primary mobile">
          <NavLink to="/plan" className={nav_class}>
            Plan
          </NavLink>
          <NavLink to="/history" className={nav_class}>
            History
          </NavLink>
          <NavLink to="/analysis" className={nav_class}>
            Analysis
          </NavLink>
          <NavLink to="/sync" className={nav_class}>
            Sync
          </NavLink>
          <button
            type="button"
            className={
              mobile_more_open || secondary_mobile_active
                ? 'app-nav-more app-nav-more-active'
                : 'app-nav-more'
            }
            aria-label={mobile_more_open ? 'Close more menu' : 'Open more menu'}
            aria-expanded={mobile_more_open}
            aria-controls="app-mobile-more-menu"
            onClick={() => setMobileMoreOpen((current) => !current)}
          >
            +
          </button>
        </nav>

        {mobile_more_open && (
          <nav
            id="app-mobile-more-menu"
            className="app-mobile-more"
            aria-label="More"
          >
            <NavLink
              to="/priorities"
              className={nav_class}
              onClick={() => setMobileMoreOpen(false)}
            >
              Priorities
            </NavLink>
            <NavLink
              to="/coach"
              className={nav_class}
              onClick={() => setMobileMoreOpen(false)}
            >
              Coach
            </NavLink>
            <NavLink
              to="/backup"
              className={nav_class}
              onClick={() => setMobileMoreOpen(false)}
            >
              Backup
            </NavLink>
            <NavLink
              to="/exercises"
              className={nav_class}
              onClick={() => setMobileMoreOpen(false)}
            >
              Exercises
            </NavLink>
          </nav>
        )}
        <PwaInstallControl />
        <div className="phase-chip">PHASE 15</div>
      </header>

      <AutoSyncRuntime />
      <DailySessionPrompt />

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/plan" replace />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/priorities" element={<PrioritiesScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/analysis" element={<AnalysisScreen />} />
          <Route path="/coach" element={<CoachScreen />} />
          <Route path="/sync" element={<SyncScreen />} />
          <Route path="/backup" element={<BackupScreen />} />
          <Route
            path="/history/exercise/:exercise_id"
            element={<ExerciseHistoryScreen />}
          />

          <Route
            path="/workout/:completed_session_id"
            element={<WorkoutScreen />}
          />
          <Route path="/exercises" element={<ExerciseLibraryScreen />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
