import React, { useState } from 'react';

// Deterministic muted dark gradients for the initials fallback (picked via name hash)
const GRADIENTS = [
  'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)', // deep blue → indigo
  'linear-gradient(135deg, #134e4a 0%, #0f172a 100%)', // teal → slate
  'linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%)', // violet → indigo-950
  'linear-gradient(135deg, #701a3c 0%, #2a0a1a 100%)', // dark rose
  'linear-gradient(135deg, #0c4a6e 0%, #082f49 100%)', // sky-900
  'linear-gradient(135deg, #3f3f46 0%, #18181b 100%)', // zinc
  'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', // emerald-900
  'linear-gradient(135deg, #7f1d1d 0%, #1c1917 100%)', // red-900
];

const hashString = (s = '') => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
};

const getInitials = (name) => {
  if (!name) return null;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Fallback-cascade avatar: player photo → team logo → initials circle.
 */
function PlayerAvatar({ photoUrl, teamLogoUrl, teamAbbrev, name, size = 40, rounded = true }) {
  // 0 = show photo, 1 = photo failed → show team logo, 2 = both failed → initials
  const [stage, setStage] = useState(0);

  const radius = rounded ? '50%' : Math.min(8, Math.round(size * 0.28));
  const boxStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  };

  // Stage 0 — player photo
  if (photoUrl && stage === 0) {
    return (
      <img
        src={photoUrl}
        alt={name || teamAbbrev || 'player'}
        onError={() => setStage(1)}
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{ ...boxStyle, objectFit: 'cover' }}
      />
    );
  }

  // Stage 1 — team logo on a subtle dark chip (or no photo at all)
  if (teamLogoUrl && stage <= 1) {
    return (
      <div style={{ ...boxStyle, background: 'rgba(11, 15, 23, 0.9)' }}>
        <img
          src={teamLogoUrl}
          alt={teamAbbrev || 'team logo'}
          onError={() => setStage(2)}
          referrerPolicy="no-referrer"
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: size >= 28 ? 2 : 1 }}
        />
      </div>
    );
  }

  // Stage 2 — initials circle with a deterministic gradient
  const initials = getInitials(name) || (teamAbbrev ? teamAbbrev.slice(0, 2).toUpperCase() : '?');
  const gradient = GRADIENTS[hashString(name || teamAbbrev || '?') % GRADIENTS.length];
  return (
    <div
      style={{
        ...boxStyle,
        background: gradient,
        color: '#fff',
        fontSize: Math.max(9, Math.round(size * 0.38)),
        fontWeight: 800,
        letterSpacing: '0.02em',
      }}
    >
      {initials}
    </div>
  );
}

export default PlayerAvatar;
