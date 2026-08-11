import React, { useState } from 'react';

function MoneylineTable({ moneylineData }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!moneylineData || moneylineData.length === 0) return null;

  const renderWinProbBar = (homeProb, awayProb) => {
    // simple visual bar
    const h = homeProb || 0;
    const a = awayProb || 0;
    const total = h + a || 1;
    const hPct = (h / total) * 100;
    const aPct = 100 - hPct;

    const getColor = (pct) => {
      if (pct > 60) return 'var(--accent3)';
      if (pct > 40) return 'var(--warn)';
      return 'var(--danger)';
    };

    return (
      <div style={{ width: '100px', height: '6px', display: 'flex', borderRadius: '3px', overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ width: `${hPct}%`, background: getColor(hPct), transition: 'width 1s ease' }} title={`Home: ${(hPct).toFixed(1)}%`} />
        <div style={{ width: `${aPct}%`, background: getColor(aPct), transition: 'width 1s ease' }} title={`Away: ${(aPct).toFixed(1)}%`} />
      </div>
    );
  };

  // Team info may be a plain string (legacy) or an object { teamName, teamLogoUrl, teamAbbrev }
  const resolveTeam = (t) => {
    if (t && typeof t === 'object') {
      return {
        name: t.teamName || t.name || '?',
        logo: t.teamLogoUrl || t.logo || null,
        abbrev: t.teamAbbrev || null,
      };
    }
    return { name: t || '?', logo: null, abbrev: null };
  };

  const TeamLogo = ({ team }) => {
    if (team.logo) {
      return (
        <img
          src={team.logo}
          alt={team.abbrev || 'team logo'}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          referrerPolicy="no-referrer"
          loading="lazy"
          style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }}
        />
      );
    }
    if (team.abbrev) {
      return <span style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-dim)' }}>{team.abbrev}</span>;
    }
    return null;
  };

  return (
    <div className="glass" style={{ marginTop: '2rem', padding: '0', overflow: 'hidden' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem',
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: '1.2rem',
          fontWeight: 700,
          cursor: 'pointer'
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '4px', height: '16px', borderRadius: '2px', background: 'linear-gradient(180deg, var(--accent), var(--accent-purple))' }} />
          Moneyline Predictions
        </span>
        <span style={{ 
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
          transition: 'transform 0.3s ease' 
        }}>▼</span>
      </button>

      <div style={{
        maxHeight: isOpen ? '1000px' : '0',
        opacity: isOpen ? 1 : 0,
        transition: 'all 0.3s ease',
        overflow: 'hidden'
      }}>
        <div className="table-container" style={{ borderRadius: '0 0 var(--radius) var(--radius)', borderTop: '1px solid var(--border)', border: 'none', boxShadow: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Matchup</th>
                <th>Win Probability</th>
                <th>Model Odds</th>
                <th>Book Odds</th>
                <th>Edge</th>
              </tr>
            </thead>
            <tbody>
              {moneylineData.map((row, idx) => {
                const edge = (row.modelImpliedOdds || 0) - (row.sportsbookOdds || 0);
                const isPos = edge > 0;
                const home = resolveTeam(row.homeTeam);
                const away = resolveTeam(row.awayTeam);
                return (
                  <tr
                    key={idx}
                    style={{ animationDelay: `${idx * 0.05}s`, transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <TeamLogo team={home} />
                          {home.name} (H)
                        </span>
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          vs <TeamLogo team={away} />
                          {away.name} (A)
                        </span>
                      </div>
                    </td>
                    <td>{renderWinProbBar(row.homeWinProb, row.awayWinProb)}</td>
                    <td><span className="pill pill-med">{row.modelImpliedOdds}</span></td>
                    <td><span className="pill" style={{ background: 'var(--surface)' }}>{row.sportsbookOdds}</span></td>
                    <td>
                      <span className={isPos ? 'pill pill-high' : 'pill pill-low'}>
                        {isPos ? '+' : ''}{edge.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MoneylineTable;
