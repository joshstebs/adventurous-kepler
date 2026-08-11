import React from 'react';

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem',
      gap: '1.5rem'
    }}>
      <div style={{
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
        padding: '4px',
        animation: 'spinGradient 1.5s linear infinite'
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: 'var(--bg)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem'
        }}>
          <span style={{ animation: 'spinGradient 1.5s linear infinite reverse' }}>⚾</span>
        </div>
      </div>
      <div style={{
        color: 'var(--accent)',
        fontWeight: 600,
        letterSpacing: '0.05em',
        animation: 'pulseStar 2s ease infinite'
      }}>
        Fetching predictions...
      </div>
    </div>
  );
}

export default LoadingSpinner;
