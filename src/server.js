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

// Allow the Vite dev server (localhost:5173) and any other origin to call the API
app.use(cors());
app.use(express.json());

const authRouter = require('./routes/auth');
const favoritesRouter = require('./routes/favorites');
app.use('/api/auth', authRouter);
app.use('/api/favorites', favoritesRouter);

app.get('/api/:sport', async (req, res) => {
  const sport = req.params.sport.toUpperCase();
  const validSports = ['MLB', 'NFL', 'NHL', 'NBA'];
  if (!validSports.includes(sport)) {
    return res.status(400).json({ error: 'Invalid sport. Choose from MLB, NFL, NHL, NBA.' });
  }
  try {
    const players = await fetchPlayers(sport);
    const odds = await fetchOdds(sport);
    const predictions = computePredictions(sport, players, odds);
    predictions.odds = odds;
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    const outPath = path.join(dataDir, `${sport}.json`);
    fs.writeFileSync(outPath, JSON.stringify(predictions, null, 2));
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

