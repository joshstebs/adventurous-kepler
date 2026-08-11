import React from 'react';

const sports = [
  { id: 'MLB', icon: '⚾', label: 'MLB' },
  { id: 'NFL', icon: '🏈', label: 'NFL' },
  { id: 'NHL', icon: '🏒', label: 'NHL' },
  { id: 'NBA', icon: '🏀', label: 'NBA' },
];

function SportSelector({ selected, onSelect }) {
  return (
    <div style={{
      display: 'flex',
      gap: '1rem',
      overflowX: 'auto',
      paddingBottom: '0.5rem',
      position: 'relative'
    }}>
      {sports.map(sport => {
        const isActive = selected === sport.id;
        return (
          <button
            key={sport.id}
            onClick={() => onSelect(sport.id)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0.75rem 1.5rem',
              color: isActive ? '#fff' : 'var(--text-muted)',
              fontSize: '1.1rem',
              fontWeight: isActive ? '700' : '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              position: 'relative',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
              textShadow: isActive ? '0 0 10px rgba(255,255,255,0.3)' : 'none'
            }}
          >
            <span>{sport.icon}</span>
            <span>{sport.label}</span>
            
            {isActive && (
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: '10%',
                right: '10%',
                height: '3px',
                background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
                borderRadius: '3px 3px 0 0',
                boxShadow: '0 -2px 10px rgba(0, 212, 255, 0.5)'
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SportSelector;
