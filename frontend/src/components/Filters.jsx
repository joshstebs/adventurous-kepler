import React, { useState, useEffect } from 'react';

function Filters({ sport, teamsData, propTypesData, onChange }) {
  const [filters, setFilters] = useState({
    team: '',
    propName: '',
    position: '',
    extra: '',
    grades: []
  });

  useEffect(() => {
    // reset filters on sport change and default to first propName
    const defaultProp = propTypesData.length > 0 ? propTypesData[0] : '';
    const defaultFilters = { team: '', propName: defaultProp, position: '', extra: '', grades: [] };
    setFilters(defaultFilters);
    onChange(defaultFilters);
  }, [sport, propTypesData, onChange]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newFilters = { ...filters, [name]: value };
    setFilters(newFilters);
    onChange(newFilters);
  };

  const handleGradeToggle = (grade) => {
    let newGrades = [...filters.grades];
    if (newGrades.includes(grade)) {
      newGrades = newGrades.filter(g => g !== grade);
    } else {
      newGrades.push(grade);
    }
    const newFilters = { ...filters, grades: newGrades };
    setFilters(newFilters);
    onChange(newFilters);
  };

  const handleClear = () => {
    const defaultProp = propTypesData.length > 0 ? propTypesData[0] : '';
    const defaultFilters = { team: '', propName: defaultProp, position: '', extra: '', grades: [] };
    setFilters(defaultFilters);
    onChange(defaultFilters);
  };

  const gradeOptions = ['A', 'B', 'C', 'D'];

  return (
    <div className="glass" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1.5rem',
      alignItems: 'end',
      padding: '1.5rem'
    }}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Prop Type</label>
        <select name="propName" value={filters.propName} onChange={handleChange}>
          {propTypesData.map((prop, idx) => (
            <option key={idx} value={prop}>{prop}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Grade</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {gradeOptions.map(g => (
            <button
              key={g}
              onClick={() => handleGradeToggle(g)}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: filters.grades.includes(g) ? `var(--accent)` : 'var(--border)',
                background: filters.grades.includes(g) ? `rgba(0, 212, 255, 0.2)` : 'var(--bg2)',
                color: filters.grades.includes(g) ? `var(--accent)` : 'var(--text-muted)',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: filters.grades.includes(g) ? `0 0 10px rgba(0, 212, 255, 0.5)` : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Team</label>
        <select name="team" value={filters.team} onChange={handleChange}>
          <option value="">All Teams</option>
          {teamsData.map((team, idx) => (
            <option key={idx} value={team.teamId || team.teamName}>{team.teamName || team.teamId}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Position</label>
        <select name="position" value={filters.position} onChange={handleChange}>
          <option value="">All Positions</option>
          <option value="G">Guard</option>
          <option value="F">Forward</option>
          <option value="C">Center</option>
          <option value="QB">QB</option>
          <option value="RB">RB</option>
          <option value="WR">WR</option>
          <option value="P">Pitcher</option>
          <option value="C">Catcher</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <button 
          onClick={handleClear}
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--danger)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.2s',
            width: '100%',
            minHeight: '44px'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
        >
          Clear Filters
        </button>
      </div>

    </div>
  );
}

export default Filters;
