import { Navigate, NavLink, Route, Routes } from 'react-router'
import { ExerciseLibraryScreen } from './features/exercises/ExerciseLibraryScreen'
import { PlanScreen } from './features/plan/PlanScreen'
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
            to="/exercises"
            className={({ isActive }) =>
              isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link'
            }
          >
            Exercises
          </NavLink>
        </nav>
        <div className="phase-chip">PHASE 5</div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/plan" replace />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/exercises" element={<ExerciseLibraryScreen />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
