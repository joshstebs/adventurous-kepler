import { useState, useEffect, useMemo, useContext, useCallback } from 'react'
import './index.css'
import Filters from './components/Filters'
import useProps from './hooks/useProps'
import AuthModal from './components/AuthModal'
import { AuthProvider, AuthContext } from './context/AuthContext'
import PlayerPropCard from './components/PlayerPropCard'
import API_URL from './api'
import PlayerDetailModal from './components/PlayerDetailModal'

function AppContent() {
  const [sport, setSport] = useState('NBA')
  const { propData, loading, error } = useProps(sport)
  const [filters, setFilters] = useState({})
  const [activeTab, setActiveTab] = useState('props') // 'props', 'picks'
  
  const { user, token, logout } = useContext(AuthContext)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [selectedProp, setSelectedProp] = useState(null)

  // Stable identity — Filters' reset effect depends on this; a new function
  // every render would trigger the reset loop that wiped grade selections.
  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters)
  }, [])

  // Favorites handling
  const [favorites, setFavorites] = useState(() => {
    const stored = localStorage.getItem('favorites')
    return stored ? JSON.parse(stored) : []
  })

  // Fetch server favorites when logged in
  useEffect(() => {
    if (user && token) {
      fetch(`${API_URL}/api/favorites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const serverFavs = data.map(f => f.player_id)
          setFavorites(prev => {
            const merged = Array.from(new Set([...prev, ...serverFavs]))
            localStorage.setItem('favorites', JSON.stringify(merged))
            return merged
          })
        }
      })
      .catch(console.error)
    }
  }, [user, token])

  const onToggleFavorite = async (playerId) => {
    const isAdding = !favorites.includes(playerId)
    
    // Optimistic local update
    setFavorites(prev => {
      const updated = isAdding ? [...prev, playerId] : prev.filter(id => id !== playerId)
      localStorage.setItem('favorites', JSON.stringify(updated))
      return updated
    })

    if (user && token) {
      try {
        if (isAdding) {
          await fetch(`${API_URL}/api/favorites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ playerId, sport })
          })
        } else {
          await fetch(`${API_URL}/api/favorites/${playerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          })
        }
      } catch (err) {
        console.error('Error syncing favorite with server', err)
      }
    }
  }

  const teamsData = useMemo(() => {
    if (!propData || !Array.isArray(propData)) return []
    const map = new Map()
    propData.forEach((item) => {
      const id = item.teamId || item.team
      const name = item.teamName || item.team || id
      if (id && !map.has(id)) {
        map.set(id, { teamId: id, teamName: name })
      }
    })
    return Array.from(map.values())
  }, [propData])

  const propTypesData = useMemo(() => {
    if (!propData || !Array.isArray(propData)) return []
    const set = new Set()
    propData.forEach((item) => {
      if (item.propName) set.add(item.propName)
    })
    return Array.from(set)
  }, [propData])

  const filteredData = useMemo(() => {
    if (!propData || !Array.isArray(propData)) return []
    return propData.filter((item) => {
      if (filters.position && item.position && item.position !== filters.position) return false
      if (filters.team) {
        const itemTeam = item.teamId || item.teamName || item.team
        if (itemTeam !== filters.team) return false
      }
      const propFilter = filters.propName || filters.propType
      if (propFilter && item.propName !== propFilter) return false
      if (filters.extra && item.extra && item.extra !== filters.extra) return false
      
      if (filters.grades && filters.grades.length > 0) {
        let grade = item.grade;
        if (!grade) {
          const line = item.bookmakerLine || item.bookmaker_line || item.line || 0;
          const pred = item.predictedValue || item.predicted_value || 0;
          const edge = Number(pred) - Number(line);
          if (edge > 2) grade = 'A';
          else if (edge > 1) grade = 'B';
          else if (edge > 0) grade = 'C';
          else grade = 'D';
        }
        if (!filters.grades.includes(grade)) return false;
      }
      
      return true
    })
  }, [propData, filters])

  // Count items per grade for grade tabs
  const gradeCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    if (propData && Array.isArray(propData)) {
      propData.forEach(item => {
        let g = item.grade || 'B';
        if (counts[g] !== undefined) counts[g]++;
      });
    }
    return counts;
  }, [propData]);

  // Date selector options
  const [selectedDate, setSelectedDate] = useState('Feb 25');

  return (
    <div className="app-container">
      {/* ── Props Optimizer Header Bar ────────────────────────────── */}
      <header className="header-bar">
        <div className="header-top">
          <div className="header-title">
            <span className="menu-icon">≡</span>
            <a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>Props Optimizer</a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user.username}</span>
                <button 
                  onClick={logout}
                  style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <button className="button" style={{ padding: '0.3rem 0.8rem', minHeight: '32px', fontSize: '0.78rem' }} onClick={() => setShowAuthModal(true)}>
                Login
              </button>
            )}
          </div>
        </div>

        {/* Filter Scroll Pills Bar 1 */}
        <div className="filter-scroll-row" style={{ marginBottom: '0.5rem' }}>
          <button className="nav-pill">Last 5 Hit% ↓</button>
          <button className="nav-pill">PrizePicks + UnderDog</button>
          {['NBA', 'MLB', 'NFL', 'NHL'].map(s => (
            <button 
              key={s} 
              className={`nav-pill ${sport === s ? 'active' : ''}`}
              onClick={() => setSport(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Date Selector Row */}
        <div className="filter-scroll-row" style={{ marginBottom: '0.5rem' }}>
          {['Feb 25', 'BOS @ TOR', 'CLE @ ORL', 'PHO @ MEM', 'LAL @ DAL'].map(d => (
            <button 
              key={d} 
              className={`date-pill ${selectedDate === d ? 'active' : ''}`}
              onClick={() => setSelectedDate(d)}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Grade Pills Tabs Row */}
        <div className="filter-scroll-row">
          {['A', 'B', 'C', 'D'].map(g => {
            const count = gradeCounts[g] || 0;
            const isSelected = filters.grades && filters.grades.includes(g);
            return (
              <button 
                key={g}
                className={`nav-pill ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  let newGrades = filters.grades ? [...filters.grades] : [];
                  if (newGrades.includes(g)) newGrades = newGrades.filter(x => x !== g);
                  else newGrades.push(g);
                  const updated = { ...filters, grades: newGrades };
                  setFilters(updated);
                }}
              >
                {g} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <main className="main-wrapper">
        <Filters
          sport={sport}
          teamsData={teamsData}
          propTypesData={propTypesData}
          grades={filters.grades}
          onChange={handleFilterChange}
        />

        {loading ? (
          <div className="card-grid" style={{ gap: '1.25rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2rem', borderRadius: 'var(--radius)', textAlign: 'center', border: '1px solid var(--danger)' }}>
            <h3>Error loading data</h3>
            <p>{error.message}</p>
          </div>
        ) : (
          <>
            {/* Section title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <span style={{ width: '4px', height: '18px', borderRadius: '2px', background: 'linear-gradient(180deg, var(--accent), var(--accent-purple))' }} />
              <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                Prop Predictions
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>{filteredData.length}</span>
            </div>

            {filteredData.length > 0 ? (
              <div className="card-grid" style={{ gap: '1.25rem' }}>
                {filteredData.map(item => (
                  <PlayerPropCard 
                    key={`${item.playerId || item.id}-${item.propName}`}
                    player={item} 
                    sport={sport} 
                    isFavorite={favorites.includes(item.playerId || item.id)} 
                    onToggleFavorite={onToggleFavorite} 
                    onSelectProp={setSelectedProp} 
                  />
                ))}
              </div>
            ) : (
              <div style={{ background: '#131924', border: '1px solid #1e2736', borderRadius: '12px', textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📊</div>
                <h3 style={{ color: 'var(--text-muted)' }}>No prop predictions match your filters.</h3>
              </div>
            )}

          </>
        )}
      </main>
      {/* ── Props Optimizer Bottom Navigation Bar ─────────────────── */}
      <nav className="bottom-nav-bar">
        <div className={`bottom-nav-item ${activeTab === 'props' ? 'active' : ''}`} onClick={() => setActiveTab('props')}>
          <span className="bottom-nav-icon">⇅</span>
          <span>Props</span>
        </div>
        <div className={`bottom-nav-item ${activeTab === 'picks' ? 'active' : ''}`} onClick={() => setActiveTab('picks')}>
          <span className="bottom-nav-icon" style={{ position: 'relative' }}>
            📋
            {favorites.length > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-8px', background: '#ef4444', color: '#fff', fontSize: '0.6rem', padding: '1px 4px', borderRadius: '9999px', fontWeight: 'bold' }}>
                {favorites.length}
              </span>
            )}
          </span>
          <span>My Picks</span>
        </div>
      </nav>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {selectedProp && <PlayerDetailModal prop={selectedProp} onClose={() => setSelectedProp(null)} />}
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
