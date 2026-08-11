import React from 'react';

const CHART_H = 70;  // px — height of the bar area
const LABEL_H = 18; // px — height of the game label row

/**
 * Mini bar chart with a dashed prop-line overlay.
 *
 * @param {Array} values    numeric game logs, most recent first
 * @param {number} line     the prop line (dashed overlay)
 * @param {number} maxBars  max bars shown
 * @param {Array|null} opponents  optional, aligned with values (index 0 = most recent).
 *   Each entry is { opponentAbbrev, homeAway, opponent?, date? } or a plain string abbrev.
 *   When provided, bottom labels show opponent abbrevs ('@BOS' away, 'NYY' home)
 *   instead of 'G-N'; hover tooltips include value + opponent + date.
 */
function MiniBarChart({ values = [], line = 0, maxBars = 10, opponents = null }) {
  // Extract numeric values from array (supports numbers or objects like { value: x })
  const extracted = (values || []).map(v => {
    if (typeof v === 'object' && v !== null) {
      return Number(v.value ?? v.val ?? 0);
    }
    return Number(v) || 0;
  });

  // Take up to maxBars items (most recent first)
  const raw = extracted.slice(0, maxBars);

  // Oldest game on left, newest on right
  const chartValues = [...raw].reverse();

  if (chartValues.length === 0) {
    return (
      <div style={{ height: CHART_H + LABEL_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        No data
      </div>
    );
  }

  const n = raw.length;

  // Opponent entry for a bar at chart index i (leftmost = oldest = opponents[n-1])
  const oppFor = (i) => {
    if (!Array.isArray(opponents)) return null;
    return opponents[n - 1 - i];
  };

  // Bottom label: opponent abbrev ('@BOS' away) or 'G-N' fallback
  const labelFor = (i) => {
    const opp = oppFor(i);
    if (opp == null) return `G-${n - i}`;
    let abbrev = null;
    let homeAway = null;
    if (typeof opp === 'string') {
      abbrev = opp;
    } else if (typeof opp === 'object') {
      abbrev = opp.opponentAbbrev || null;
      homeAway = opp.homeAway || null;
    }
    if (!abbrev) return '—';
    return (homeAway === 'away' ? '@' : '') + abbrev;
  };

  // Hover tooltip: "G-1 · 24 vs BOS (Apr 9)" when metadata exists
  const titleFor = (i, val) => {
    const opp = oppFor(i);
    let extra = '';
    if (opp && typeof opp === 'object') {
      const parts = [];
      if (opp.opponent) parts.push(`vs ${opp.opponent}`);
      else if (opp.opponentAbbrev) parts.push(`vs ${opp.opponentAbbrev}`);
      if (opp.date) parts.push(String(opp.date).slice(0, 10));
      if (parts.length) extra = ` · ${parts.join(' ')}`;
    }
    return `G-${n - i} · ${val}${extra}`;
  };

  const numericLine = Number(line) || 0;
  const dataMax = Math.max(...chartValues, numericLine);
  // Add 20% headroom so the tallest bar doesn't touch the top
  const maxVal = dataMax > 0 ? dataMax * 1.2 : 10;

  // Distance from bottom of bar area where the dashed line sits (in px)
  const lineBottomPx = Math.min((numericLine / maxVal) * CHART_H, CHART_H);

  return (
    <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>

      {/* ── Bar area ─────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: CHART_H,
        display: 'flex',
        alignItems: 'flex-end',
        gap: '4px',
        background: 'rgba(255,255,255,0.025)',
        borderRadius: '10px',
        padding: '6px 6px 0',
        boxSizing: 'border-box',
      }}>

        {/* Subtle gridlines for readability */}
        {[0.33, 0.66].map(f => (
          <div key={f} style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: f * CHART_H,
            height: 0,
            borderTop: '1px solid rgba(255,255,255,0.045)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        ))}

        {/* Dashed prop-line (absolutely positioned inside bar area) */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: lineBottomPx,
          height: 0,
          borderTop: '2px dashed var(--accent)',
          opacity: 0.7,
          zIndex: 3,
          pointerEvents: 'none',
        }} />

        {/* Line-value chip on the right end of the dashed line */}
        {numericLine > 0 && (
          <div style={{
            position: 'absolute',
            right: 4,
            bottom: Math.min(lineBottomPx - 13, CHART_H - 16),
            fontSize: '8px',
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--accent)',
            background: 'rgba(0,0,0,0.55)',
            padding: '2px 4px',
            borderRadius: '4px',
            zIndex: 4,
            pointerEvents: 'none',
            letterSpacing: '0.02em',
          }}>
            L {numericLine % 1 === 0 ? numericLine : numericLine.toFixed(1)}
          </div>
        )}

        {chartValues.map((val, i) => {
          const numVal = Number(val) || 0;
          const barH = Math.max(Math.round((numVal / maxVal) * (CHART_H - 6)), 3);
          const isOver = numVal >= numericLine;

          return (
            <div
              key={i}
              title={titleFor(i, numVal)}
              className="mini-bar-col"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                position: 'relative',
                zIndex: 1,
                minWidth: 0,
              }}
            >
              {/* Value label */}
              <span style={{
                fontSize: '9px',
                fontWeight: 700,
                color: isOver ? '#34d399' : '#f87171',
                lineHeight: 1,
                marginBottom: '3px',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}>
                {numVal % 1 === 0 ? numVal : numVal.toFixed(1)}
              </span>

              {/* Bar */}
              <div
                className="mini-bar"
                style={{
                  width: '100%',
                  maxWidth: 26,
                  height: barH,
                  background: isOver
                    ? 'linear-gradient(180deg, #34d399 0%, #10b981 55%, #047857 100%)'
                    : 'linear-gradient(180deg, #f87171 0%, #ef4444 55%, #991b1b 100%)',
                  borderRadius: '5px 5px 2px 2px',
                  boxShadow: isOver
                    ? '0 0 8px rgba(16,185,129,0.25)'
                    : '0 0 8px rgba(239,68,68,0.2)',
                  transition: 'height 0.35s ease, filter 0.15s ease, box-shadow 0.15s ease',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Game / opponent labels ───────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '4px',
        width: '100%',
        height: LABEL_H,
        alignItems: 'center',
        marginTop: '3px',
      }}>
        {chartValues.map((_, i) => (
          <div
            key={i}
            title={titleFor(i, chartValues[i])}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'center',
              fontSize: '9px',
              fontWeight: Array.isArray(opponents) ? 700 : 400,
              color: Array.isArray(opponents) ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              padding: '0 2px',
            }}
          >
            {labelFor(i)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MiniBarChart;
