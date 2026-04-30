import './index.css'

// FRAME — Focus, Resource and Activity Management Engine
// Scaffold stub — Iteration 0
// All PRISM domain logic stripped. Shell only.

function App() {
  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="sidebar-logo">FRAME</div>
        <nav className="sidebar-nav">
          <a className="nav-item nav-item-active">Task List</a>
          <a className="nav-item">Dashboard</a>
          <a className="nav-item">Calendar</a>
          <a className="nav-item">Settings</a>
        </nav>
      </div>
      <main className="main-content">
        <div className="placeholder-view">
          <h1>FRAME</h1>
          <p>Focus, Resource and Activity Management Engine</p>
          <p className="muted">Iteration 0 — scaffold complete. Ready for Iteration 1.</p>
        </div>
      </main>
    </div>
  )
}

export default App
