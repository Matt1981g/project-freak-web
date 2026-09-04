import { Navigate, NavLink, Route, Routes } from 'react-router'
import { CoachScreen } from './features/coach/CoachScreen'
import { ExerciseLibraryScreen } from './features/exercises/ExerciseLibraryScreen'
import { HistoryScreen } from './features/history/HistoryScreen'
import { ExerciseHistoryScreen } from './features/history/ExerciseHistoryScreen'
import { PlanScreen } from './features/plan/PlanScreen'
import { PrioritiesScreen } from './features/priorities/PrioritiesScreen'
import { WorkoutScreen } from './features/workout/WorkoutScreen'
import './App.css'

function App() {
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
        <nav className="app-nav" aria-label="Primary">
          <NavLink
            to="/plan"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'
            }
          >
            Plan
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'
            }
          >
            History
          </NavLink>
          <NavLink
            to="/priorities"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'
            }
          >
            Priorities
          </NavLink>
          <NavLink
            to="/coach"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'
            }
          >
            Coach
          </NavLink>
          <NavLink
            to="/exercises"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'
            }
          >
            Exercises
          </NavLink>
        </nav>
        <div className="phase-chip">PHASE 11</div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/plan" replace />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/priorities" element={<PrioritiesScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/coach" element={<CoachScreen />} />
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
