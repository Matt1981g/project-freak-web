import { Navigate, Route, Routes } from 'react-router'
import { ExerciseLibraryScreen } from './features/exercises/ExerciseLibraryScreen'
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
        <div className="phase-chip">PHASE 4</div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/exercises" replace />} />
          <Route path="/exercises" element={<ExerciseLibraryScreen />} />
          <Route path="*" element={<Navigate to="/exercises" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
