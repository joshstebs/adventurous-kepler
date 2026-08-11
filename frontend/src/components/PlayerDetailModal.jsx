import React, { useState, useEffect } from 'react';
import MiniBarChart from './MiniBarChart';

const GRADE_META = {
  A: { label: 'Strong', color: '#10b981' },
  B: { label: 'Good', color: '#06b6d4' },
  C: { label: 'Average', color: '#f59e0b' },
  D: { label: 'Weak', color: '#ef4444' },
};

// Format a number as integer when whole, else 1 decimal; '-' for missing
const fmt = (v) => {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};

const pct = (v) => {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  return `${n}%`;
};

function PlayerDetailModal({ prop, onClose }) {
  const [range, setRange] = useState('last10'); // 'last5' | 'last10'

  // Field fallbacks mirroring PlayerPropCard conventions
  const playerName = prop.playerName || prop.name || 'Unknown';
  const teamName = prop.teamName || prop.team || prop.teamId || '-';
  const propName = prop.propName || 'Prop';
  const predictedValue = Number(prop.predictedValue ?? prop.predicted_value ?? 0);
  const line = Number(prop.bookmakerLine ?? prop.bookmaker_line ?? prop.line ?? predictedValue ?? 0);

  // Grade with edge-based fallback (same heuristic as cards)
  const edge = predictedValue - line;
  let grade = prop.grade;
  if (!grade) {
    if (edge > 2) grade = 'A';
    else if (edge > 1) grade = 'B';
    else if (edge > 0) grade = 'C';
    else grade = 'D';
  }
  const gradeMeta = GRADE_META[grade] || GRADE_META.D;

  // Game logs (most recent first); MiniBarChart reverses internally
  const rawLogs = prop.gameLogs || prop.game_logs || [];
  const gameLogs = rawLogs.map(v =>
    typeof v === 'object' && v !== null ? Number(v.value ?? v.val ?? 0) : (Number(v) || 0)
  );
  const shownLogs = range === 'last5' ? gameLogs.slice(0, 5) : gameLogs;

  // Stats — hit% readouts follow the selected range
  const last5Avg = fmt(prop.last5Avg);
  const last10Avg = fmt(prop.last10Avg);
  const seasonAvg = fmt(prop.seasonAvg);

  const conf = prop.confidence;
  const confLower = typeof conf === 'object' && conf !== null ? conf.lower : null;
  const confUpper = typeof conf === 'object' && conf !== null ? conf.upper : null;

  const sources = (Array.isArray(prop.sourceMetadata) ? prop.sourceMetadata : []).filter(Boolean).join(', ');

  const isOver = predictedValue >= line;

  // Esc to close + lock body scroll while open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const teamAbbrev = teamName !== '-'
    ? teamName.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
    : '?';

  const activeCellStyle = (active, color) =>
    active ? { border: `1px solid ${color}`, boxShadow: `inset 0 0 0 1px ${color}` } : {};

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${playerName} ${propName} details`}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(10, 14, 26, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '1rem',
      }}
    >
      <style>{`
        @keyframes modalPopIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          border: '1px solid var(--bg-card-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow)',
          padding: '1.25rem',
          position: 'relative',
          animation: 'modalPopIn 0.22s ease',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.9rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            fontSize: '1.05rem',
            cursor: 'pointer',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          &times;
        </button>

        {/* ── Header: player / team / prop ─────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingRight: '2.5rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-purple))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.8rem',
            flexShrink: 0,
          }}>
            {teamAbbrev}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              {playerName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{teamName}</span>
              <span style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: '#e2e8f0',
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--radius-pill)',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}>
                {propName}
              </span>
            </div>
          </div>

          {/* Grade badge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
            <span style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: gradeMeta.color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              fontWeight: 800,
              boxShadow: `0 0 14px ${gradeMeta.color}55`,
            }}>
              {grade}
            </span>
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: gradeMeta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {gradeMeta.label}
            </span>
          </div>
        </div>

        {/* ── Predicted vs line ────────────────────────────────── */}
        <div style={{
          marginTop: '1rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}>
          <div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
              Predicted vs Line
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.2 }}>
              <span style={{ color: isOver ? '#10b981' : '#ef4444' }}>{fmt(predictedValue)}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.95rem', margin: '0 0.45rem' }}>vs line</span>
              <span style={{ color: '#e2e8f0' }}>{fmt(line)}</span>
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <span style={{
              background: isOver ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isOver ? '#10b981' : '#ef4444',
              border: `1px solid ${isOver ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              padding: '0.2rem 0.7rem',
              borderRadius: 'var(--radius-pill)',
              fontSize: '0.72rem',
              fontWeight: 800,
              display: 'inline-block',
            }}>
              {isOver ? 'OVER' : 'UNDER'}
            </span>
            {confLower !== null && confUpper !== null && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Conf {Number(confLower).toFixed(0)}–{Number(confUpper).toFixed(0)}%
              </div>
            )}
          </div>
        </div>

        {/* ── Chart + Last 5 / Last 10 toggle ──────────────────── */}
        <div style={{
          marginTop: '1rem',
          background: '#0f141f',
          border: '1px solid #1c2638',
          borderRadius: 'var(--radius)',
          padding: '0.8rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Last {range === 'last5' ? '5' : '10'} Games
            </span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button
                className={`chart-tab-btn ${range === 'last5' ? 'active' : ''}`}
                onClick={() => setRange('last5')}
              >
                Last 5
              </button>
              <button
                className={`chart-tab-btn ${range === 'last10' ? 'active' : ''}`}
                onClick={() => setRange('last10')}
              >
                Last 10
              </button>
            </div>
          </div>

          <MiniBarChart values={shownLogs} line={line} maxBars={range === 'last5' ? 5 : 10} />
        </div>

        {/* ── Stats grid ───────────────────────────────────────── */}
        <div className="expanded-stats-grid" style={{ marginTop: '1rem' }}>
          <div className="stat-cell-box cell-cyan" style={activeCellStyle(false, 'rgba(56, 189, 248, 0.7)')}>
            <span className="stat-cell-lbl">Season Avg</span>
            <span className="stat-cell-num">{seasonAvg}</span>
          </div>
          <div className="stat-cell-box cell-cyan" style={activeCellStyle(range === 'last5', 'rgba(56, 189, 248, 0.7)')}>
            <span className="stat-cell-lbl">Last 5 Avg</span>
            <span className="stat-cell-num">{last5Avg}</span>
          </div>
          <div className="stat-cell-box cell-cyan" style={activeCellStyle(range === 'last10', 'rgba(56, 189, 248, 0.7)')}>
            <span className="stat-cell-lbl">Last 10 Avg</span>
            <span className="stat-cell-num">{last10Avg}</span>
          </div>
          <div className="stat-cell-box cell-green" style={activeCellStyle(range === 'last5', 'rgba(52, 211, 153, 0.7)')}>
            <span className="stat-cell-lbl">Last 5 Hit%</span>
            <span className="stat-cell-num">{pct(prop.last5HitPct)}</span>
          </div>
          <div className="stat-cell-box cell-green" style={activeCellStyle(range === 'last10', 'rgba(52, 211, 153, 0.7)')}>
            <span className="stat-cell-lbl">Last 10 Hit%</span>
            <span className="stat-cell-num">{pct(prop.last10HitPct)}</span>
          </div>
        </div>

        {/* ── Data source attribution ──────────────────────────── */}
        <div style={{
          marginTop: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.72rem',
          color: 'var(--text-dim)',
        }}>
          <span style={{ opacity: 0.8 }}>🔎</span>
          <span>
            Data sources:{' '}
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{sources || '—'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default PlayerDetailModal;
