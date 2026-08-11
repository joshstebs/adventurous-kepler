// scripts/backtest.js
/**
 * Walk-forward backtest of the prop prediction engine.
 *
 * For every player + prop with enough history, we walk through each game:
 *   - predict game t using ONLY games [0, t) (the model as it would have
 *     been at that moment — no lookahead)
 *   - compare the over/under call against the real outcome
 *
 * Variants compared:
 *   V1  current engine (decay-weighted recent avg, rounded line, floor 0.5)
 *   V2  line anchored to season average (books-style)
 *   V3  line from 50/50 blend of recent-weighted pred + season avg
 *   V4  empirical P(over): fraction of the last 15 games that cleared the
 *       V1 line; pick over when P >= 0.5, edge = |P - 0.5|
 *
 * Baselines: always-over / always-under at each variant's own lines, and 50%.
 *
 * Usage: node scripts/backtest.js [sport]
 */
const { fetchPlayers } = require('../src/services/fetchers');
const { roundLine } = require('../src/predictions');

const SPORTS = process.argv[2] ? [process.argv[2].toUpperCase()] : ['MLB', 'NFL', 'NBA', 'NHL'];

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function decayWeights(n) {
  const lambda = 0.6;
  const w = [];
  for (let i = 0; i < n; i++) w.push(Math.pow(lambda, i));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / s);
}

function weightedAvg(valuesRecentFirst, w) {
  return valuesRecentFirst.reduce((s, v, i) => s + (w[i] || 0) * v, 0);
}

/** The engine's predicted value given the games BEFORE game t (chronological). */
function predictValue(pastChrono, seasonAvg) {
  const recent = [...pastChrono].slice(-10).reverse(); // most recent first
  if (recent.length >= 5) {
    return weightedAvg(recent, decayWeights(recent.length));
  }
  if (recent.length >= 2) {
    return 0.6 * weightedAvg(recent, decayWeights(recent.length)) + 0.4 * seasonAvg;
  }
  return seasonAvg;
}

/** V1 grade: last-10 hit rate vs the line. */
function gradeFor(pastChrono, line) {
  const last10 = [...pastChrono].slice(-10).reverse();
  if (!last10.length) return 'D';
  const hit = last10.filter(v => v >= line).length / last10.length;
  return hit >= 0.7 ? 'A' : hit >= 0.6 ? 'B' : hit >= 0.5 ? 'C' : 'D';
}

async function backtestSport(sport) {
  const players = await fetchPlayers(sport);
  const rows = []; // one row per (player, prop, game)
  const byProp = {};
  const byGrade = { A: { n: 0, correct: 0 }, B: { n: 0, correct: 0 }, C: { n: 0, correct: 0 }, D: { n: 0, correct: 0 } };
  const byVenue = { home: { n: 0, correct: 0, sum: 0 }, away: { n: 0, correct: 0, sum: 0 } };

  for (const p of players) {
    for (const [prop, logsRecentFirst] of Object.entries(p.gameLogs || {})) {
      if (!Array.isArray(logsRecentFirst) || logsRecentFirst.length < 15) continue;
      const chrono = [...logsRecentFirst].reverse(); // oldest first
      const gamesMeta = (p.games || []).slice().reverse(); // chronological to match
      const N = chrono.length;

      for (let t = 10; t < N; t++) {
        const past = chrono.slice(0, t);
        const seasonAvg = mean(past);
        const pred = predictValue(past, seasonAvg);

        const line1 = roundLine(pred, prop);
        const line2 = roundLine(seasonAvg, prop);
        const line3 = roundLine(0.5 * pred + 0.5 * seasonAvg, prop);

        const outcome = chrono[t];
        const venue = gamesMeta[t]?.homeAway || '';

        // V4: empirical over probability from last 15 games vs line1
        const last15 = [...past].slice(-15);
        const pOver = last15.filter(v => v >= line1).length / last15.length;

        rows.push({ player: p.name, prop, t, outcome, pred, seasonAvg, line1, line2, line3, pOver, venue });

        // Grade calibration (V1)
        const grade = gradeFor(past, line1);
        const call = pred >= line1;
        const correct = call === (outcome >= line1);
        byGrade[grade].n++;
        if (correct) byGrade[grade].correct++;

        if (venue === 'home' || venue === 'away') {
          byVenue[venue].n++;
          if (correct) byVenue[venue].correct++;
          byVenue[venue].sum += outcome;
        }

        if (!byProp[prop]) byProp[prop] = { n: 0, correct: 0, overRate: 0 };
        byProp[prop].n++;
        if (correct) byProp[prop].correct++;
        if (outcome >= line1) byProp[prop].overRate++;
      }
    }
  }

  const acc = (rowsArr, lineKey) => {
    const n = rowsArr.length;
    if (!n) return { n: 0, acc: 0, overCall: 0 };
    let correct = 0;
    let overCall = 0;
    for (const r of rowsArr) {
      const line = r[lineKey];
      const call = r.pred >= line;
      if (call) overCall++;
      if (call === (r.outcome >= line)) correct++;
    }
    return { n, acc: correct / n, overCall: overCall / n };
  };

  // V4 accuracy: pick = pOver >= 0.5 (call over when empirical P >= 0.5)
  const v4 = { n: rows.length, correct: 0, overCall: 0, edgeCorrect: 0, edgeN: 0 };
  for (const r of rows) {
    const call = r.pOver >= 0.5;
    const correct = call === (r.outcome >= r.line1);
    if (call) v4.overCall++;
    if (correct) v4.correct++;
    const edge = Math.abs(r.pOver - 0.5);
    if (edge >= 0.2) {
      v4.edgeN++;
      if (correct) v4.edgeCorrect++;
    }
  }

  // Edge buckets for V1: |pred - line1|
  const edges = { '>= 1.5': { n: 0, correct: 0 }, '1.0-1.5': { n: 0, correct: 0 }, '0.5-1.0': { n: 0, correct: 0 }, '< 0.5': { n: 0, correct: 0 } };
  for (const r of rows) {
    const e = Math.abs(r.pred - r.line1);
    const bucket = e >= 1.5 ? '>= 1.5' : e >= 1.0 ? '1.0-1.5' : e >= 0.5 ? '0.5-1.0' : '< 0.5';
    edges[bucket].n++;
    if ((r.pred >= r.line1) === (r.outcome >= r.line1)) edges[bucket].correct++;
  }

  return {
    sport,
    players: players.length,
    samples: rows.length,
    v1: acc(rows, 'line1'),
    v2: acc(rows, 'line2'),
    v3: acc(rows, 'line3'),
    v4: { n: v4.n, acc: v4.n ? v4.correct / v4.n : 0, overCall: v4.n ? v4.overCall / v4.n : 0, edgeN: v4.edgeN, edgeAcc: v4.edgeN ? v4.edgeCorrect / v4.edgeN : 0 },
    baselines: {
      alwaysOver: rows.length ? rows.filter(r => r.outcome >= r.line1).length / rows.length : 0,
      alwaysUnder: rows.length ? rows.filter(r => r.outcome < r.line1).length / rows.length : 0,
    },
    grades: Object.fromEntries(Object.entries(byGrade).map(([g, v]) => [g, { n: v.n, acc: v.n ? v.correct / v.n : 0 }])),
    venues: Object.fromEntries(Object.entries(byVenue).map(([k, v]) => [k, { n: v.n, acc: v.n ? v.correct / v.n : 0, avg: v.n ? v.sum / v.n : 0 }])),
    edges: Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, { n: v.n, acc: v.n ? v.correct / v.n : 0 }])),
    byProp: Object.fromEntries(Object.entries(byProp).map(([k, v]) => [k, { n: v.n, acc: v.correct / v.n, overRate: v.overRate / v.n }])),
  };
}

(async () => {
  const all = [];
  for (const sport of SPORTS) {
    console.log(`\n=== Backtesting ${sport} (fetching real data...) ===`);
    const r = await backtestSport(sport);
    all.push(r);
    console.log(`players=${r.players} samples=${r.samples}`);
    const fmt = (x) => `${(x.acc * 100).toFixed(1)}% (n=${x.n})`;
    console.log(`  V1 current engine : ${fmt(r.v1)}  over-call=${(r.v1.overCall * 100).toFixed(0)}%`);
    console.log(`  V2 season-avg line: ${fmt(r.v2)}  over-call=${(r.v2.overCall * 100).toFixed(0)}%`);
    console.log(`  V3 blend line     : ${fmt(r.v3)}  over-call=${(r.v3.overCall * 100).toFixed(0)}%`);
    console.log(`  V4 empirical P    : ${fmt(r.v4)}  over-call=${(r.v4.overCall * 100).toFixed(0)}%  edge(>=.2): ${(r.v4.edgeAcc * 100).toFixed(1)}% (n=${r.v4.edgeN})`);
    console.log(`  baselines: alwaysOver=${(r.baselines.alwaysOver * 100).toFixed(1)}% alwaysUnder=${(r.baselines.alwaysUnder * 100).toFixed(1)}%`);
    console.log(`  by grade: ${Object.entries(r.grades).map(([g, v]) => `${g}:${(v.acc * 100).toFixed(0)}%`).join(' ')}`);
    console.log(`  by venue: ${Object.entries(r.venues).map(([k, v]) => `${k}:${(v.acc * 100).toFixed(0)}% avg=${v.avg.toFixed(1)}`).join(' ')}`);
    console.log(`  edge buckets: ${Object.entries(r.edges).map(([k, v]) => `${k}:${(v.acc * 100).toFixed(0)}%`).join(' ')}`);
    console.log('  worst props:');
    Object.entries(r.byProp).sort((a, b) => a[1].acc - b[1].acc).slice(0, 4).forEach(([k, v]) =>
      console.log(`    ${k}: acc=${(v.acc * 100).toFixed(1)}% n=${v.n} overRate=${(v.overRate * 100).toFixed(0)}%`));
  }
  require('fs').writeFileSync(
    require('path').join(__dirname, '..', 'data', 'backtest.json'),
    JSON.stringify(all, null, 2)
  );
  console.log('\nSaved data/backtest.json');
})();
