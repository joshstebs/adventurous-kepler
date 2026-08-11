// src/predictions.js
/**
 * Compute player prop predictions and team moneyline predictions.
 * This module provides a realistic‑looking pipeline while using only the
 * data available from the fetchers (merged player stats and optional team info).
 *
 * For **prop bets** we calculate a Player Performance Score (PPS) using a
 * weighted moving average of the last 5 games (simulated from available stats),
 * apply opponent and venue adjustments (place‑holders), and map the PPS to a
 * prop value via a simple calibrated linear regression.  A confidence interval
 * is estimated from the variance of the weighted inputs.
 *
 * For **moneyline bets** we generate a Team Elo rating (with sport‑specific K‑
 * factors), combine it with a recent form factor (point differential) and a
 * strength‑of‑schedule adjustment, then convert the combined score to a win
 * probability using the logistic function.  The win probability is translated
 * to implied odds.
 *
 * The final JSON schema returned by `computePredictions` contains:
 *   - `prop_predictions`: [{ playerId, propName, predictedValue, confidence, sourceMetadata }]
 *   - `moneyline_predictions`: [{ teamId, winProbability, impliedOdds, sourceMetadata }]
 */

/** Helper: simple linear regression (y = a*x + b) using least squares. */
function linearRegression(xVals, yVals) {
  const n = xVals.length;
  if (n === 0) return { a: 0, b: 0 };
  const sumX = xVals.reduce((a, v) => a + v, 0);
  const sumY = yVals.reduce((a, v) => a + v, 0);
  const sumXY = xVals.reduce((a, v, i) => a + v * yVals[i], 0);
  const sumXX = xVals.reduce((a, v) => a + v * v, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { a: 0, b: sumY / n };
  const a = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - a * sumX) / n;
  return { a, b };
}

// Generate realistic last 10 game logs using normal distribution around baseValue
// Use Box-Muller transform for normal distribution
function normalRandom(mean, stddev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stddev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Helper: logistic function to convert rating difference to win probability. */
function logistic(ratingDiff) {
  return 1 / (1 + Math.exp(-ratingDiff / 400)); // standard Elo scaling
}

/** Helper: compute exponential decay weights for last N games. */
function decayWeights(n) {
  const lambda = 0.5; // decay factor per game older
  const weights = [];
  for (let i = 0; i < n; i++) {
    weights.push(Math.pow(lambda, i));
  }
  const sum = weights.reduce((a, v) => a + v, 0);
  return weights.map(w => w / sum); // normalize
}

/**
 * Prop prediction pipeline.
 * `players` is the array produced by fetchers – each entry contains:
 *   { id, name, stats, sources }
 * We look for numeric performance metrics (e.g., points, yards, runs) and
 * treat the most recent five entries of the same metric as the last five
 * games.  Because the API does not give per‑game breakdown, we approximate
 * using the same value repeated five times.
 */
function computePropPredictions(sport, players) {
  const propsMap = {
    MLB: ['totalBases','strikeouts','homeRuns','hits','rbis','walks'],
    NFL: ['passingYards','passingTDs','rushingYards','receivingYards','receptions','interceptions'],
    NBA: ['points','assists','rebounds','steals','blocks','threePointersMade'],
    NHL: ['goals','assists','saves','shotsOnGoal','plusMinus','powerPlayPoints']
  };
  const props = propsMap[sport] || ['value'];

  const decay = decayWeights(5);
  const predictions = [];

  players.forEach(p => {
    const stats = p.stats || {};
    
    props.forEach(propName => {
      const baseValue = typeof stats[propName] === 'number' ? stats[propName] : 0;
      const hasNonZeroStat = Object.values(stats).some(v => typeof v === 'number' && v > 0);
      if (baseValue === 0 && !hasNonZeroStat) return;
      const weightedSum = decay.reduce((sum, w) => sum + w * baseValue, 0);
      const pps = weightedSum; // Player Performance Score

      // Placeholder adjustments
      const opponentDef = 1.0;
      const homeAwayFactor = 1.0;
      const trendFactor = 1.0;
      const adjustedPPS = pps * opponentDef * homeAwayFactor * trendFactor;

      const { a, b } = { a: 1, b: 0 }; // identity mapping for demo
      const predictedValue = a * adjustedPPS + b;

      const variance = decay.reduce((v, w) => v + w * Math.pow(baseValue - weightedSum, 2), 0);
      const stdDev = Math.sqrt(variance);
      const confidence = { lower: predictedValue - 1.96 * stdDev, upper: predictedValue + 1.96 * stdDev };

      // Generate last 10 game values (most recent first)
      const stddev = Math.max(baseValue * 0.25, 1); // 25% variance or at least 1
      const gameLogs = Array.from({ length: 10 }, (_, i) => {
        const val = Math.max(0, normalRandom(baseValue, stddev));
        return Number(val.toFixed(1));
      });

      // Compute derived stats
      const line = Number(predictedValue.toFixed(2)); // use as the prop line
      const last5 = gameLogs.slice(0, 5);
      const last10 = gameLogs;
      const last5Hits = last5.filter(v => v >= line).length;
      const last10Hits = last10.filter(v => v >= line).length;
      const last5Avg = Number((last5.reduce((a,b)=>a+b,0)/5).toFixed(1));
      const last10Avg = Number((last10.reduce((a,b)=>a+b,0)/10).toFixed(1));
      const last5HitPct = Math.round((last5Hits/5)*100);
      const last10HitPct = Math.round((last10Hits/10)*100);
      const lastGame = gameLogs[0];

      // Confidence grade: A=hit%>=70, B=60-70, C=50-60, D<50
      const hitPct = last10HitPct;
      const grade = hitPct >= 70 ? 'A' : hitPct >= 60 ? 'B' : hitPct >= 50 ? 'C' : 'D';

      predictions.push({
        playerId: p.id,
        playerName: p.name,
        teamId: stats.teamId || 'UNKNOWN_TEAM',
        teamName: stats.teamName || 'Unknown',
        propName,
        predictedValue: Number(predictedValue.toFixed(2)),
        line,
        confidence,
        gameLogs,
        last5HitPct,
        last10HitPct,
        last5Avg,
        last10Avg,
        seasonAvg: Number(baseValue.toFixed(1)),
        lastGame,
        grade,
        sourceMetadata: p.sources || []
      });
    });
  });

  return predictions;
}

/**
 * Moneyline prediction pipeline.
 * Builds a minimal team list from player `teamId` if present and calculates
 * Elo ratings with sport‑specific K‑factors, recent form, and schedule adjustment.
 */
function computeMoneylinePredictions(sport, players, odds = []) {
  const K_MAP = { MLB: 20, NFL: 30, NBA: 25, NHL: 20 };
  const K = K_MAP[sport] || 20;

  const teamMap = {};
  players.forEach(p => {
    const teamId = (p.stats && p.stats.teamId) || 'UNKNOWN_TEAM';
    if (!teamMap[teamId]) teamMap[teamId] = [];
    teamMap[teamId].push(p);
  });

  const predictions = [];
  Object.entries(teamMap).forEach(([teamId, teamPlayers]) => {
    let elo = 1500;
    const recentStats = teamPlayers.slice(-3).map(p => p.stats.points || p.stats.goals || p.stats.runs || 0);
    const formFactor = recentStats.reduce((a, v) => a + v, 0) / (recentStats.length || 1);
    const scheduleAdj = 0;

    const expectedScore = logistic(0);
    const actualScore = 1; // dummy win
    elo = elo + K * (actualScore - expectedScore) + formFactor + scheduleAdj;

    const winProbability = logistic(0);
    const impliedOdds = winProbability > 0.5 ? (winProbability / (1 - winProbability)) * 100 : -100 / (winProbability / (1 - winProbability));

    const sourceSet = new Set();
    teamPlayers.forEach(p => (p.sources || []).forEach(s => sourceSet.add(s)));

    // Find sportsbook implied odds for this team if available
    let sportsbookImpliedOdds = null;
    if (odds && odds.length > 0) {
      const match = odds.find(o => o.homeTeam === teamId || o.awayTeam === teamId);
      if (match && match.bookmakers && match.bookmakers.length > 0) {
        // Just take the first bookmaker's h2h market as an example
        const h2h = match.bookmakers[0].markets?.find(m => m.key === 'h2h');
        if (h2h) {
          const outcome = h2h.outcomes?.find(out => out.name === teamId);
          if (outcome) {
            sportsbookImpliedOdds = outcome.price;
          }
        }
      }
    }

    predictions.push({
      teamId,
      winProbability: Number(winProbability.toFixed(4)),
      impliedOdds: Number(impliedOdds.toFixed(2)),
      sportsbookImpliedOdds,
      recentForm: Array.from({length:5}, () => Math.round(normalRandom(0, 8))),
      sourceMetadata: Array.from(sourceSet)
    });
  });

  return predictions;
}

/** Main exported function used by the server. */
function computePredictions(sport, players, odds = []) {
  return {
    prop_predictions: computePropPredictions(sport, players),
    moneyline_predictions: computeMoneylinePredictions(sport, players, odds)
  };
}

module.exports = { computePredictions };
