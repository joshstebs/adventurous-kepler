// scripts/backtest.js
/**
 * Walk-forward backtest of the prop prediction engine + prop-level diagnostics.
 *
 * For every player + prop with enough history, we walk through each game:
 *   - predict game t using ONLY games [0, t) (no lookahead)
 *   - compare the over/under call against the real outcome
 *
 * Variants (empirical P uses the production formula: (hits+1)/(n+2) over the
 * last 15 games vs the line, with Beta shrinkage):
 *   V1  old engine: call = pred >= integer-rounded line
 *   V4  production engine v2: pick = empirical P >= 0.5 vs integer line
 *   V5  candidate: empirical P vs HALF-line (0.5/1.5/2.5 — book standard)
 *
 * Diagnostics per prop: sample size, accuracy of each variant, over-call rate,
 * push rate (outcome exactly on the line), outcome std dev, and accuracy when
 * the model has >= 0.2 edge.
 *
 * Usage: node scripts/backtest.js [sport]
 */
const fs = require('fs');
const path = require('path');
const { fetchPlayers } = require('../src/services/fetchers');
const { roundLine } = require('../src/predictions'); // production v3: no-push half-lines

const SPORTS = process.argv[2] ? [process.argv[2].toUpperCase()] : ['MLB', 'NFL', 'NBA', 'NHL'];

/** Old production line scheme (pre-v3): counting stats integer, others 0.5. */
const OLD_INT_PROPS = new Set([
  'hits', 'homeRuns', 'rbis', 'walks', 'strikeouts', 'totalBases',
  'passingTDs', 'interceptions', 'receptions', 'steals', 'blocks',
  'threePointersMade', 'goals', 'assists', 'saves', 'shotsOnGoal',
  'plusMinus', 'powerPlayPoints',
]);
function oldRoundLine(value, propName) {
  const raw = OLD_INT_PROPS.has(propName) ? Math.round(value) : Math.round(value * 2) / 2;
  return Math.max(0.5, raw);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
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

/** Production empirical P(over) with shrinkage. */
function pOverShrunken(pastChrono, line, window = 15) {
  const last = [...pastChrono].slice(-window);
  if (last.length < 3) return null;
  const hits = last.filter(v => v >= line).length;
  return (hits + 1) / (last.length + 2);
}

async function backtestSport(sport) {
  const players = await fetchPlayers(sport);
  const byProp = {};

  for (const p of players) {
    for (const [prop, logsRecentFirst] of Object.entries(p.gameLogs || {})) {
      if (!Array.isArray(logsRecentFirst) || logsRecentFirst.length < 15) continue;
      const chrono = [...logsRecentFirst].reverse(); // oldest first
      const N = chrono.length;

      for (let t = 10; t < N; t++) {
        const past = chrono.slice(0, t);
        const seasonAvg = mean(past);
        const pred = predictValue(past, seasonAvg);

        const line1 = oldRoundLine(pred, prop); // old engine's line (reference)
        const line5 = roundLine(pred);           // production v3: no-push half-line

        const outcome = chrono[t];

        const pOver1 = pOverShrunken(past, line1);
        const pOver5 = pOverShrunken(past, line5);

        const rec = byProp[prop] || (byProp[prop] = { n: 0, v1: 0, v4: 0, v5: 0, over5: 0, push5: 0, edgeN5: 0, edge5: 0, sum: 0, sumsq: 0 });

        rec.n++;
        rec.sum += outcome;
        rec.sumsq += outcome * outcome;

        const callV1 = pred >= line1;
        if (callV1 === (outcome >= line1)) rec.v1++;

        if (pOver1 !== null) {
          const callV4 = pOver1 >= 0.5;
          if (callV4 === (outcome >= line1)) rec.v4++;
        }

        if (pOver5 !== null) {
          const callV5 = pOver5 >= 0.5;
          if (callV5 === (outcome >= line5)) rec.v5++;
          if (callV5) rec.over5++;
          if (outcome === line5) rec.push5++;
          const edge = Math.abs(pOver5 - 0.5);
          if (edge >= 0.2) {
            rec.edgeN5++;
            if (callV5 === (outcome >= line5)) rec.edge5++;
          }
        }
      }
    }
  }

  const props = Object.entries(byProp).map(([prop, r]) => {
    const n = r.n;
    const avg = r.sum / n;
    const variance = n > 1 ? (r.sumsq - n * avg * avg) / (n - 1) : 0;
    return {
      prop,
      n,
      v1Acc: r.v1 / n,
      v4Acc: r.v4 / n,
      v5Acc: r.v5 / n,
      overRate: r.over5 / n,
      pushRate: r.push5 / n,
      std: Math.sqrt(Math.max(variance, 0)),
      edgeN: r.edgeN5,
      edgeAcc: r.edgeN5 ? r.edge5 / r.edgeN5 : null,
    };
  });

  const total = props.reduce((a, p) => a + p.n, 0);
  const agg = (fn) => {
    let n = 0, s = 0;
    for (const p of props) { n += p.n; s += p.n * fn(p); }
    return n ? s / n : 0;
  };

  const result = {
    sport,
    players: players.length,
    samples: total,
    v1Acc: agg(p => p.v1Acc),
    v4Acc: agg(p => p.v4Acc),
    v5Acc: agg(p => p.v5Acc),
    v5OverRate: agg(p => p.overRate),
    v5PushRate: agg(p => p.pushRate),
    props,
  };

  // Console: worst props under the production engine (V4) and the half-line candidate
  console.log(`\n=== ${sport} (${total.toLocaleString()} samples, ${players.length} players) ===`);
  console.log(`  old engine (V1)      : ${(result.v1Acc * 100).toFixed(1)}%`);
  console.log(`  production P (V4)    : ${(result.v4Acc * 100).toFixed(1)}%`);
  console.log(`  half-line P (V5)     : ${(result.v5Acc * 100).toFixed(1)}%  (over-call ${(result.v5OverRate * 100).toFixed(0)}%, push ${(result.v5PushRate * 100).toFixed(1)}%)`);
  const sorted = [...props].sort((a, b) => a.v4Acc - b.v4Acc);
  console.log('  worst props (by V4 acc):');
  for (const p of sorted.slice(0, 6)) {
    console.log(
      `    ${p.prop.padEnd(14)} n=${String(p.n).padStart(6)} V1=${(p.v1Acc * 100).toFixed(1).padStart(5)}% V4=${(p.v4Acc * 100).toFixed(1).padStart(5)}% ` +
      `V5=${(p.v5Acc * 100).toFixed(1).padStart(5)}% over=${(p.overRate * 100).toFixed(0)}% push=${(p.pushRate * 100).toFixed(0)}% std=${p.std.toFixed(2)} edgeN=${p.edgeN}`
    );
  }
  console.log('  best props (by V4 acc):');
  for (const p of sorted.slice(-4).reverse()) {
    console.log(
      `    ${p.prop.padEnd(14)} n=${String(p.n).padStart(6)} V1=${(p.v1Acc * 100).toFixed(1).padStart(5)}% V4=${(p.v4Acc * 100).toFixed(1).padStart(5)}% ` +
      `V5=${(p.v5Acc * 100).toFixed(1).padStart(5)}% over=${(p.overRate * 100).toFixed(0)}% push=${(p.pushRate * 100).toFixed(0)}% std=${p.std.toFixed(2)} edgeN=${p.edgeN}`
    );
  }
  return result;
}

(async () => {
  const all = [];
  for (const sport of SPORTS) {
    all.push(await backtestSport(sport));
  }
  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'backtest.json'), JSON.stringify(all, null, 2));
  console.log('\nSaved data/backtest.json');
})();
