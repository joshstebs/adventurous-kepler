// src/predictions.js
/**
 * Compute player prop predictions and team moneyline predictions.
 *
 * All inputs come from real data fetched by src/services/fetchers.js:
 *   players[].gameLogs = { propName: [per-game values, most-recent-first] }
 *   players[].stats    = { propName: season average per game }
 *
 * NO simulated/random data is produced anywhere in this pipeline.
 *
 * For each player + prop we:
 *   - take the real per-game values for the last N games
 *   - compute an exponentially-weighted recent average (deterministic)
 *   - blend with the season average when fewer than 5 games are available
 *   - use the sportsbook line when real prop odds are available
 *     (passed via `propsLines`), otherwise a rounded model line
 *     explicitly labelled lineSource: 'model'
 *   - derive last-5/last-10 hit rates, averages and a confidence grade from
 *     the real game logs
 *
 * Moneyline predictions use sportsbook implied probability when real h2h odds
 * are available, with a real recent-form adjustment (no random generation).
 */

/** Helper: exponential decay weights for last N games. */
function decayWeights(n) {
  const lambda = 0.6; // decay per game older
  const weights = [];
  for (let i = 0; i < n; i++) {
    weights.push(Math.pow(lambda, i));
  }
  const sum = weights.reduce((a, v) => a + v, 0);
  return weights.map(w => w / sum);
}

/** Round a model line sensibly: counting stats to integer, others to 0.5.
 *  Never below 0.5 — a 0 line makes every outcome "over" and is meaningless. */
const INT_PROPS = new Set([
  'hits', 'homeRuns', 'rbis', 'walks', 'strikeouts', 'totalBases',
  'passingTDs', 'interceptions', 'receptions', 'steals', 'blocks',
  'threePointersMade', 'goals', 'assists', 'saves', 'shotsOnGoal',
  'plusMinus', 'powerPlayPoints',
]);
function roundLine(value, propName) {
  const raw = INT_PROPS.has(propName) ? Math.round(value) : Math.round(value * 2) / 2;
  return Math.max(0.5, raw);
}

/** Map Odds API market keys to our prop names. */
const MARKET_TO_PROP = {
  player_points: 'points',
  player_assists: 'assists',
  player_rebounds: 'rebounds',
  player_threes: 'threePointersMade',
  batter_hits: 'hits',
  batter_total_bases: 'totalBases',
  batter_rbis: 'rbis',
  batter_home_runs: 'homeRuns',
  pitcher_strikeouts: 'strikeouts',
  player_pass_yds: 'passingYards',
  player_pass_td: 'passingTDs',
  player_rush_yds: 'rushingYards',
  player_rec_yds: 'receivingYards',
  player_receptions: 'receptions',
  player_goals: 'goals',
  player_shots_on_goal: 'shotsOnGoal',
  player_saves: 'saves',
};

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Index real sportsbook prop lines for fast lookup.
 * propsLines: array of Odds API prop-market entries:
 *   [{ market, player: {name}, outcomes: [{ name:'Over 23.5', point, price }] }]
 * Returns Map keyed by `${normPlayerName}|${propName}` -> { line, price, bookmaker }
 */
function indexPropsLines(propsLines) {
  const map = new Map();
  for (const entry of propsLines || []) {
    const prop = MARKET_TO_PROP[entry.market];
    const playerName = normName(entry.player?.name || entry.name);
    if (!prop || !playerName) continue;
    for (const outcome of entry.outcomes || []) {
      if (typeof outcome.point !== 'number') continue;
      const key = `${playerName}|${prop}`;
      const existing = map.get(key);
      if (!existing || (outcome.price || 0) > existing.price) {
        map.set(key, {
          line: outcome.point,
          price: outcome.price,
          bookmaker: entry.bookmaker || null,
          market: entry.market,
        });
      }
    }
  }
  return map;
}

/**
 * Prop prediction pipeline. `players` come from fetchers.js:
 *   { id, name, teamId, teamName, position, stats, gameLogs, sources }
 */
function computePropPredictions(sport, players, propsLinesMap) {
  const propsMap = {
    MLB: ['totalBases', 'strikeouts', 'homeRuns', 'hits', 'rbis', 'walks'],
    NFL: ['passingYards', 'passingTDs', 'rushingYards', 'receivingYards', 'receptions', 'interceptions'],
    NBA: ['points', 'assists', 'rebounds', 'steals', 'blocks', 'threePointersMade'],
    NHL: ['goals', 'assists', 'saves', 'shotsOnGoal', 'plusMinus', 'powerPlayPoints'],
  };
  const props = propsMap[sport] || ['value'];
  const predictions = [];

  players.forEach(p => {
    const logs = p.gameLogs || {};
    const stats = p.stats || {};

    props.forEach(propName => {
      const real = (logs[propName] || []).filter(v => typeof v === 'number' && Number.isFinite(v));
      const seasonAvg = typeof stats[propName] === 'number' ? stats[propName] : 0;
      const hasAnySignal = seasonAvg > 0 || real.some(v => v > 0);
      if (!hasAnySignal) return;

      const recent = real.slice(0, 10);

      // Predicted value: decay-weighted average of the real last-N games,
      // blended toward the season average when we have few games.
      let predictedValue;
      if (recent.length >= 5) {
        const w = decayWeights(recent.length);
        predictedValue = recent.reduce((sum, v, i) => sum + w[i] * v, 0);
      } else if (recent.length >= 2) {
        const w = decayWeights(recent.length);
        const weighted = recent.reduce((sum, v, i) => sum + w[i] * v, 0);
        predictedValue = 0.6 * weighted + 0.4 * seasonAvg;
      } else {
        predictedValue = seasonAvg;
      }

      // Real sportsbook line when available, otherwise a clearly-labelled model line
      const lineKey = `${normName(p.name)}|${propName}`;
      const book = propsLinesMap ? propsLinesMap.get(lineKey) : null;
      const line = book ? book.line : roundLine(predictedValue, propName);

      // Hit rates against the line from REAL games
      const last10 = recent.slice(0, 10);
      const last5 = recent.slice(0, 5);
      const last10Hits = last10.filter(v => v >= line).length;
      const last5Hits = last5.filter(v => v >= line).length;
      const last10HitPct = last10.length ? Math.round((last10Hits / last10.length) * 100) : 0;
      const last5HitPct = last5.length ? Math.round((last5Hits / last5.length) * 100) : 0;
      const last10Avg = last10.length ? Number((last10.reduce((a, b) => a + b, 0) / last10.length).toFixed(1)) : 0;
      const last5Avg = last5.length ? Number((last5.reduce((a, b) => a + b, 0) / last5.length).toFixed(1)) : 0;

      // Confidence interval from the real observed range
      const min10 = last10.length ? Math.min(...last10) : predictedValue;
      const max10 = last10.length ? Math.max(...last10) : predictedValue;

      // Confidence grade from real hit rate (over last 10 when available)
      const hitPct = last10HitPct;
      const grade = hitPct >= 70 ? 'A' : hitPct >= 60 ? 'B' : hitPct >= 50 ? 'C' : 'D';

      predictions.push({
        playerId: p.id,
        playerName: p.name,
        teamId: p.teamId || 'UNKNOWN_TEAM',
        teamName: p.teamName || 'Unknown',
        teamAbbrev: p.teamAbbrev || '',
        photoUrl: p.photoUrl || null,
        teamLogoUrl: p.teamLogoUrl || null,
        nextGame: p.nextGame || null,
        propName,
        predictedValue: Number(predictedValue.toFixed(2)),
        line,
        lineSource: book ? 'sportsbook' : 'model',
        bookmaker: book ? book.bookmaker : null,
        confidence: {
          lower: Number(Math.min(min10, predictedValue).toFixed(2)),
          upper: Number(Math.max(max10, predictedValue).toFixed(2)),
        },
        gameLogs: recent,
        games: (p.games || []).slice(0, 10),
        last5HitPct,
        last10HitPct,
        last5Avg,
        last10Avg,
        seasonAvg: Number(seasonAvg.toFixed(1)),
        lastGame: recent.length ? recent[0] : null,
        grade,
        sourceMetadata: p.sources || [],
      });
    });
  });

  return predictions;
}

/** American odds -> implied win probability (with vig removed via half). */
function americanToProb(price) {
  if (!price) return null;
  const p = Number(price);
  if (!Number.isFinite(p) || p === 0) return null;
  const prob = p > 0 ? 100 / (p + 100) : -p / (-p + 100);
  return Math.min(Math.max(prob, 0.02), 0.98);
}

/** Probability -> American odds. */
function probToAmerican(prob) {
  const p = Math.min(Math.max(prob, 0.05), 0.95);
  const odds = p >= 0.5 ? (p / (1 - p)) * 100 : -100 / (p / (1 - p));
  return Math.round(odds);
}

/**
 * Moneyline prediction pipeline. Uses real sportsbook implied probability when
 * h2h odds exist; otherwise a baseline 0.5 adjusted by real recent form
 * (mean of the team's players' most recent primary-stat value). No randomness.
 */
function computeMoneylinePredictions(sport, players, odds = []) {
  const PRIMARY = { MLB: 'totalBases', NFL: 'passingYards', NBA: 'points', NHL: 'goals' };
  const primary = PRIMARY[sport] || 'points';

  const teamMap = {};
  players.forEach(p => {
    const teamId = p.teamId || 'UNKNOWN_TEAM';
    if (!teamMap[teamId]) teamMap[teamId] = [];
    teamMap[teamId].push(p);
  });

  const predictions = [];
  Object.entries(teamMap).forEach(([teamId, teamPlayers]) => {
    const teamName = teamPlayers[0]?.teamName || 'Unknown';

    // Real recent form: mean of the last real value of the primary stat
    const recentValues = teamPlayers
      .map(p => {
        const arr = (p.gameLogs && p.gameLogs[primary]) || [];
        return arr.length ? arr[0] : null;
      })
      .filter(v => v !== null);
    const formFactor = recentValues.length
      ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length
      : 0;

    // Sportsbook implied probability if h2h odds available (matched by name —
    // The Odds API h2h outcomes use team names, not IDs)
    let winProbability = null;
    let sportsbookImpliedOdds = null;
    const teamKey = normName(teamName);
    const match = (odds || []).find(
      o =>
        normName(o.homeTeam) === teamKey ||
        normName(o.awayTeam) === teamKey ||
        o.homeTeam === teamId ||
        o.awayTeam === teamId
    );
    if (match && match.bookmakers && match.bookmakers.length) {
      const h2h = match.bookmakers[0].markets?.find(m => m.key === 'h2h');
      if (h2h) {
        const outcome = h2h.outcomes?.find(
          out => normName(out.name) === teamKey || out.name === teamId
        );
        if (outcome) {
          sportsbookImpliedOdds = outcome.price;
          winProbability = americanToProb(outcome.price);
        }
      }
    }

    if (winProbability === null) {
      // No book line: baseline 0.5 with a small real-form tilt (capped ±0.05)
      const tilt = Math.min(Math.max(formFactor / 100, -0.05), 0.05);
      winProbability = 0.5 + tilt;
    }

    const impliedOdds = probToAmerican(winProbability);

    const sourceSet = new Set();
    teamPlayers.forEach(p => (p.sources || []).forEach(s => sourceSet.add(s)));

    predictions.push({
      teamId,
      teamName,
      teamAbbrev: teamPlayers[0]?.teamAbbrev || '',
      teamLogoUrl: teamPlayers[0]?.teamLogoUrl || null,
      nextGame: teamPlayers[0]?.nextGame || null,
      winProbability: Number(winProbability.toFixed(4)),
      impliedOdds,
      sportsbookImpliedOdds,
      recentForm: recentValues.slice(0, 5),
      sourceMetadata: Array.from(sourceSet),
    });
  });

  return predictions;
}

/** Main exported function used by the server. */
function computePredictions(sport, players, odds = [], propsLines = []) {
  const propsLinesMap = indexPropsLines(propsLines);
  return {
    prop_predictions: computePropPredictions(sport, players, propsLinesMap),
    moneyline_predictions: computeMoneylinePredictions(sport, players, odds),
  };
}

module.exports = { computePredictions };
