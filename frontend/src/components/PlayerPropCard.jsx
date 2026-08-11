import React, { useState } from 'react';
import MiniBarChart from './MiniBarChart';

function PlayerPropCard({ player, isFavorite, onToggleFavorite, sport, onSelectProp }) {
  const [chartView, setChartView] = useState('last5'); // 'last5', 'last10', 'season'
  const [selectedSide, setSelectedSide] = useState(null); // 'over', 'under'
  const [expanded, setExpanded] = useState(false);

  // Fallbacks for data fields
  const playerId = player.playerId || player.id;
  const playerName = player.playerName || player.name || 'Unknown';
  const teamName = player.teamName || player.team || player.teamId || 'NBA';
  const propName = player.propName || 'Points';
  const predictedValue = Number(player.predictedValue || player.predicted_value || 0);
  const line = Number(player.bookmakerLine || player.bookmaker_line || player.line || predictedValue || 0);
  
  // Game logs fallback
  const defaultLogs = Array(10).fill(0).map(() => Number((Math.max(1, (line || 10) + (Math.random() * 8 - 4))).toFixed(1)));
  const rawLogs = player.gameLogs || player.game_logs || defaultLogs;
  const gameLogs = (rawLogs || []).map(v => typeof v === 'object' && v !== null ? Number(v.value ?? v.val ?? 0) : Number(v) || 0);

  // Stats
  const last5HitPct = player.last5HitPct ?? 60;
  const last10HitPct = player.last10HitPct ?? 70;
  const seasonHitPct = player.seasonHitPct ?? 53;
  const last5Avg = player.last5Avg ?? (line + 1.2).toFixed(1);
  const last10Avg = player.last10Avg ?? (line + 0.8).toFixed(1);
  const seasonAvg = player.seasonAvg ?? line.toFixed(1);
  const lastGame = player.lastGame ?? (line + 2.0).toFixed(1);
  
  // Calculate grade based on edge if not provided
  const edge = predictedValue - line;
  let grade = player.grade;
  if (!grade) {
    if (edge > 2) grade = 'A';
    else if (edge > 1) grade = 'B';
    else if (edge > 0) grade = 'C';
    else grade = 'D';
  }

  // Derive Team Abbreviation (e.g. LAL, LAC, BOS, PHO, KC, NYK)
  const getTeamAbbrev = (name) => {
    if (!name || name === 'Unknown') return 'TEAM';
    const words = name.split(' ');
    if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
    if (words.length === 2) return (words[0][0] + words[1].substring(0, 2)).toUpperCase();
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  };

  const teamAbbrev = getTeamAbbrev(teamName);

  // Team avatar badge color map
  const getBadgeBg = (abbrev) => {
    if (abbrev.includes('LAL') || abbrev.includes('GSW')) return '#eab308'; // Yellow
    if (abbrev.includes('LAC') || abbrev.includes('BOS') || abbrev.includes('PHI')) return '#10b981'; // Green/Emerald
    if (abbrev.includes('NYK') || abbrev.includes('PHO') || abbrev.includes('SAC')) return '#a855f7'; // Purple
    if (abbrev.includes('CHI') || abbrev.includes('HOU') || abbrev.includes('MIA')) return '#ef4444'; // Red
    return '#3b82f6'; // Blue
  };

  const badgeBg = getBadgeBg(teamAbbrev);

  return (
    <div
      className="prop-card"
      onClick={() => onSelectProp && onSelectProp(player)}
      title="View prop details"
      style={{ cursor: 'pointer' }}
    >
      {/* ── Card Header ─────────────────────────────────────── */}
      <div className="card-header">
        <div className="player-info-group">
          {/* Team Avatar Badge */}
          <div className="team-avatar-badge" style={{ backgroundColor: badgeBg }}>
            {teamAbbrev}
          </div>

          <div className="player-names-col">
            <div className="player-name-text">{playerName}</div>
            <div className="prop-line-text">{line} {propName}</div>
            
            <div className="team-tags-row">
              <span className="badge-tag-team" style={{ backgroundColor: badgeBg }}>{teamAbbrev}</span>
              <span className="badge-tag-league">{sport || 'NBA'}</span>
              <span className="matchup-time-text">Tue 7:00pm vs Opp</span>
            </div>
          </div>
        </div>

        {/* Over / Under Side Buttons */}
        <div className="side-buttons-group">
          <button 
            className={`over-under-btn ${selectedSide === 'over' ? 'btn-over' : 'btn-outline'}`}
            onClick={(e) => { e.stopPropagation(); setSelectedSide(selectedSide === 'over' ? null : 'over') }}
          >
            OVER
          </button>
          <button 
            className={`over-under-btn ${selectedSide === 'under' ? 'btn-under' : 'btn-outline'}`}
            onClick={(e) => { e.stopPropagation(); setSelectedSide(selectedSide === 'under' ? null : 'under') }}
          >
            UNDER
          </button>
        </div>
      </div>

      {/* ── 3 Key Stat Pills Row ────────────────────────────── */}
      <div className="stat-badges-row">
        <div className="stat-pill-box pill-box-green">
          <span className="pill-box-title">Projection</span>
          <span className="pill-box-val">{predictedValue.toFixed(1)}</span>
        </div>
        <div className="stat-pill-box pill-box-green">
          <span className="pill-box-title">Last 5 Hit%</span>
          <span className="pill-box-val">{last5HitPct}% O</span>
        </div>
        <div className="stat-pill-box pill-box-green">
          <span className="pill-box-title">Season Hit%</span>
          <span className="pill-box-val">{seasonHitPct}% O</span>
        </div>
      </div>

      {/* ── Mini Bar Chart ───────────────────────────────────── */}
      <div style={{ background: '#0f141f', borderRadius: '8px', padding: '0.6rem', border: '1px solid #1c2638' }}>
        {chartView === 'season' ? (
          <div style={{ height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: '800', color: '#10b981' }}>{seasonAvg}</span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Season Average</span>
          </div>
        ) : (
          <MiniBarChart values={gameLogs} line={line} maxBars={chartView === 'last5' ? 5 : 10} />
        )}

        {/* Chart View Switcher Tabs */}
        <div className="chart-tabs-bar">
          <button 
            className={`chart-tab-btn ${chartView === 'last5' ? 'active' : ''}`}
            onClick={() => setChartView('last5')}
          >
            Last 5
          </button>
          <button 
            className={`chart-tab-btn ${chartView === 'last10' ? 'active' : ''}`}
            onClick={() => setChartView('last10')}
          >
            Last 10
          </button>
          <button 
            className={`chart-tab-btn ${chartView === 'season' ? 'active' : ''}`}
            onClick={() => setChartView('season')}
          >
            Season
          </button>
        </div>
      </div>

      {/* ── Card Footer Controls ────────────────────────────── */}
      <div className="card-footer-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span 
            style={{ cursor: 'pointer', fontSize: '0.9rem', color: '#94a3b8' }}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            title="Toggle Detailed Breakdown"
          >
            ⓘ
          </span>
          <div className="grade-pills-inline">
            <span className={`grade-chip ${grade === 'A' ? 'active-A' : ''}`}>A</span>
            <span className={`grade-chip ${grade === 'B' ? 'active-B' : ''}`}>B</span>
            <span className={`grade-chip ${grade === 'C' ? 'active-C' : ''}`}>C</span>
            <span className={`grade-chip ${grade === 'D' ? 'active-D' : ''}`}>D</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span 
            className={`star ${isFavorite ? 'pulse' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(playerId) }}
            style={{ fontSize: '1rem', cursor: 'pointer', color: isFavorite ? '#eab308' : '#64748b' }}
          >
            {isFavorite ? '★' : '☆'}
          </span>
          <span>👁 0 Watchers</span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>
            L5: {last5HitPct}% O
          </span>
        </div>
      </div>

      {/* ── Expandable 3x3 Stats Breakdown Matrix ───────────── */}
      {expanded && (
        <div className="expanded-stats-grid">
          <div className="stat-cell-box cell-green">
            <span className="stat-cell-lbl">Projection</span>
            <span className="stat-cell-num">{predictedValue.toFixed(1)}</span>
          </div>
          <div className="stat-cell-box cell-green">
            <span className="stat-cell-lbl">Consensus</span>
            <span className="stat-cell-num">{line}</span>
          </div>
          <div className="stat-cell-box cell-red">
            <span className="stat-cell-lbl">Last Game</span>
            <span className="stat-cell-num">{lastGame}</span>
          </div>

          <div className="stat-cell-box cell-green">
            <span className="stat-cell-lbl">Last 5 Hit%</span>
            <span className="stat-cell-num">{last5HitPct}% O</span>
          </div>
          <div className="stat-cell-box cell-green">
            <span className="stat-cell-lbl">Last 10 Hit%</span>
            <span className="stat-cell-num">{last10HitPct}% O</span>
          </div>
          <div className="stat-cell-box cell-green">
            <span className="stat-cell-lbl">Season Hit%</span>
            <span className="stat-cell-num">{seasonHitPct}% O</span>
          </div>

          <div className="stat-cell-box cell-cyan">
            <span className="stat-cell-lbl">Last 5 Avg</span>
            <span className="stat-cell-num">{last5Avg}</span>
          </div>
          <div className="stat-cell-box cell-cyan">
            <span className="stat-cell-lbl">Last 10 Avg</span>
            <span className="stat-cell-num">{last10Avg}</span>
          </div>
          <div className="stat-cell-box cell-cyan">
            <span className="stat-cell-lbl">Season Avg</span>
            <span className="stat-cell-num">{seasonAvg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerPropCard;
