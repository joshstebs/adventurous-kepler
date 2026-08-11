import React, { useState, useMemo } from 'react';

function PropTable({ propsData, favorites = [], onToggleFavorite, onSelectProp }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 25;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const getSortableValue = (row, key) => {
    if (key === 'edge') {
      const line = row.bookmakerLine ?? row.bookmaker_line;
      if (line === undefined || line === null || row.predictedValue === undefined) return -Infinity;
      return Number(row.predictedValue) - Number(line);
    }
    if (key === 'teamName') {
      return row.teamName || row.team || row.teamId || '';
    }
    if (key === 'confidence') {
      const c = row.confidence;
      if (typeof c === 'object' && c !== null) return c.lower ?? 0;
      return c ?? 0;
    }
    return row[key] ?? '';
  };

  const filteredAndSortedData = useMemo(() => {
    let data = [...propsData];
    
    if (search.trim() !== '') {
      const lowerSearch = search.toLowerCase();
      data = data.filter(row => {
        const name = row.playerName || row.name || '';
        return name.toLowerCase().includes(lowerSearch);
      });
    }

    if (sortKey) {
      data.sort((a, b) => {
        const aVal = getSortableValue(a, sortKey);
        const bVal = getSortableValue(b, sortKey);
        if (aVal < bVal) return sortAsc ? -1 : 1;
        if (aVal > bVal) return sortAsc ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [propsData, sortKey, sortAsc, search]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredAndSortedData.slice(start, start + rowsPerPage);
  }, [filteredAndSortedData, page]);

  const totalPages = Math.ceil(filteredAndSortedData.length / rowsPerPage);

  if (!propsData || propsData.length === 0) {
    return (
      <div className="glass" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📊</div>
        <h3 style={{ color: 'var(--text-muted)' }}>No predictions available at this time.</h3>
      </div>
    );
  }

  const renderStar = (playerId) => {
    const isFav = favorites.includes(playerId);
    return (
      <span
        className={`star ${isFav ? 'pulse' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(playerId) }}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFav ? '★' : '☆'}
      </span>
    );
  };

  const renderConfidenceRange = (row) => {
    const conf = row.confidence;
    let lower = typeof conf === 'object' && conf !== null ? conf.lower : (row.confidenceLower ?? row.confidence_lower);
    let upper = typeof conf === 'object' && conf !== null ? conf.upper : (row.confidenceUpper ?? row.confidence_upper);

    if (lower !== undefined && upper !== undefined && lower !== null && upper !== null) {
      const l = Number(lower);
      const u = Number(upper);
      if (!isNaN(l) && !isNaN(u)) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{l.toFixed(2)} – {u.toFixed(2)}</span>
            <div style={{ width: '100%', height: '4px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: 'linear-gradient(90deg, var(--accent), var(--accent2))', 
                width: `${Math.min(100, Math.max(0, ((u-l)/u)*100))}%` 
              }} />
            </div>
          </div>
        );
      }
    }
    if (typeof conf === 'number' && !isNaN(conf)) {
      return <span style={{ fontWeight: 600 }}>{conf.toFixed(2)}</span>;
    }
    if (conf !== undefined && conf !== null) {
      return String(conf);
    }
    return '-';
  };

  const renderEdge = (row) => {
    const line = row.bookmakerLine ?? row.bookmaker_line;
    const pred = row.predictedValue;
    if (line === undefined || line === null || pred === undefined || pred === null) {
      return '-';
    }
    const edgeVal = Number(pred) - Number(line);
    if (isNaN(edgeVal)) return '-';

    const formatted = (edgeVal > 0 ? '+' : '') + edgeVal.toFixed(2);
    const className = edgeVal > 0 ? 'pill pill-high' : edgeVal < 0 ? 'pill pill-low' : 'pill pill-med';
    return <span className={className}>{formatted}</span>;
  };

  const getPredictionPillClass = (row) => {
    // Just a heuristic to color it
    const conf = row.confidence;
    let val = 0;
    if (typeof conf === 'number') val = conf;
    else if (conf && conf.lower) val = conf.lower;
    
    if (val > 0.8) return 'pill-high';
    if (val < 0.4) return 'pill-low';
    return 'pill-med';
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <span style={{opacity:0.3}}>↕</span>;
    return <span>{sortAsc ? '▲' : '▼'}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Search by player name..." 
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: '100%', maxWidth: '300px' }}
        />
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th className="sticky-col" onClick={() => handleSort('playerName')}>
                Player <SortIcon colKey="playerName" />
              </th>
              <th onClick={() => handleSort('teamName')}>
                Team <SortIcon colKey="teamName" />
              </th>
              <th onClick={() => handleSort('propName')}>
                Prop <SortIcon colKey="propName" />
              </th>
              <th onClick={() => handleSort('predictedValue')}>
                Prediction <SortIcon colKey="predictedValue" />
              </th>
              <th onClick={() => handleSort('confidence')}>
                Confidence <SortIcon colKey="confidence" />
              </th>
              <th onClick={() => handleSort('edge')}>
                Edge <SortIcon colKey="edge" />
              </th>
              <th>Fav</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, idx) => (
              <tr
                key={row.id || `${row.playerId}-${idx}`}
                style={{ animationDelay: `${idx * 0.05}s`, cursor: 'pointer' }}
                onClick={() => onSelectProp && onSelectProp(row)}
                title="View prop details"
              >
                <td className="sticky-col" style={{ fontWeight: 600, color: '#fff' }}>
                  {row.playerName || row.name || 'Unknown'}
                </td>
                <td>
                  <span style={{ color: 'var(--text-muted)' }}>{row.teamName || row.team || row.teamId || '-'}</span>
                </td>
                <td>
                  <span style={{ background: 'var(--surface)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                    {row.propName}
                  </span>
                </td>
                <td>
                  <span className={`pill ${getPredictionPillClass(row)}`} style={{ fontSize: '1rem' }}>
                    {row.predictedValue}
                  </span>
                </td>
                <td>{renderConfidenceRange(row)}</td>
                <td>{renderEdge(row)}</td>
                <td>{renderStar(row.playerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--glass-border)' }}>
        <button 
          className="button" 
          disabled={page === 1} 
          onClick={() => setPage(p => p - 1)}
          style={{ background: 'var(--surface)', boxShadow: 'none' }}
        >
          Previous
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Page <strong style={{ color: '#fff' }}>{page}</strong> of {totalPages || 1}
        </span>
        <button 
          className="button" 
          disabled={page === totalPages || totalPages === 0} 
          onClick={() => setPage(p => p + 1)}
          style={{ background: 'var(--surface)', boxShadow: 'none' }}
        >
          Next
        </button>
      </div>

    </div>
  );
}

export default PropTable;
