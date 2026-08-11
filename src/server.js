// src/server.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { fetchPlayers } = require('./services/fetchers');
const { fetchOdds } = require('./services/oddsApi');
const { computePredictions } = require('./predictions');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Allow the Vite dev server (localhost:5173) and any other origin to call the API
app.use(cors());
app.use(express.json());

const authRouter = require('./routes/auth');
const favoritesRouter = require('./routes/favorites');
app.use('/api/auth', authRouter);
app.use('/api/favorites', favoritesRouter);

// In-memory cache: full refreshes hit many upstream APIs, so serve fresh
// predictions for CACHE_TTL_MS before recomputing.
const cache = {};

async function buildPredictions(sport) {
  const [players, oddsResult] = await Promise.all([fetchPlayers(sport), fetchOdds(sport)]);
  const odds = oddsResult.featured || [];
  const props = oddsResult.props || [];
  const predictions = computePredictions(sport, players, odds, props);
  predictions.odds = odds;
  predictions.props = props;
  predictions.generatedAt = new Date().toISOString();
  predictions.playerCount = players.length;
  return predictions;
}

app.get('/api/:sport', async (req, res) => {
  const sport = req.params.sport.toUpperCase();
  const validSports = ['MLB', 'NFL', 'NHL', 'NBA'];
  if (!validSports.includes(sport)) {
    return res.status(400).json({ error: 'Invalid sport. Choose from MLB, NFL, NBA, NHL.' });
  }
  try {
    const cached = cache[sport];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const predictions = await buildPredictions(sport);

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    fs.writeFileSync(path.join(dataDir, `${sport}.json`), JSON.stringify(predictions, null, 2));

    cache[sport] = { ts: Date.now(), data: predictions };
    res.json(predictions);
  } catch (err) {
    console.error('Error processing request:', err);
    res.status(500).json({ error: 'Failed to fetch data or compute predictions.' });
  }
});

if (require.main === module) {
  require('./cron');
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
