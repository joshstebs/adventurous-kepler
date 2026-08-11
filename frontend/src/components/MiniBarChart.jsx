import React from 'react';

const CHART_H = 70;  // px — height of the bar area
const LABEL_H = 16; // px — height of the game label row

function MiniBarChart({ values = [], line = 0, maxBars = 10 }) {
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
        gap: '3px',
      }}>

        {/* Dashed prop-line (absolutely positioned inside bar area) */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: lineBottomPx,
          height: 0,
          borderTop: '2px dashed var(--accent)',
          opacity: 0.75,
          zIndex: 3,
          pointerEvents: 'none',
        }} />

        {chartValues.map((val, i) => {
          const numVal = Number(val) || 0;
          const barH = Math.max(Math.round((numVal / maxVal) * CHART_H), 3);
          const isOver = numVal >= numericLine;

          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {/* Value label */}
              <span style={{
                fontSize: '8px',
                fontWeight: 700,
                color: isOver ? '#10b981' : '#ef4444',
                lineHeight: 1,
                marginBottom: '2px',
                whiteSpace: 'nowrap',
              }}>
                {numVal % 1 === 0 ? numVal : numVal.toFixed(1)}
              </span>

              {/* Bar */}
              <div style={{
                width: '100%',
                height: barH,
                background: isOver
                  ? 'linear-gradient(to top, #047857, #10b981)'
                  : 'linear-gradient(to top, #991b1b, #ef4444)',
                borderRadius: '3px 3px 0 0',
                transition: 'height 0.35s ease',
              }} />
            </div>
          );
        })}
      </div>

      {/* ── Game index labels ────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '3px',
        width: '100%',
        height: LABEL_H,
        alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        marginTop: '2px',
      }}>
        {chartValues.map((_, i) => (
          <div key={i} style={{
            flex: 1,
            textAlign: 'center',
            fontSize: '8px',
            color: 'var(--text-muted)',
          }}>
            G-{chartValues.length - i}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MiniBarChart;
