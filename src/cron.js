// src/cron.js
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { fetchPlayers } = require('./services/fetchers');
const { computePredictions } = require('./predictions');

// Define sports list
const SPORTS = ['MLB', 'NFL', 'NHL', 'NBA'];

// Function to run for each sport
async function runForAllSports() {
  console.log('Cron job started: fetching and computing predictions');
  for (const sport of SPORTS) {
    try {
      const players = await fetchPlayers(sport);
      const predictions = computePredictions(sport, players);
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
      }
      const outPath = path.join(dataDir, `${sport}.json`);
      fs.writeFileSync(outPath, JSON.stringify(predictions, null, 2));
      console.log(`Saved predictions for ${sport} to ${outPath}`);
    } catch (err) {
      console.error(`Error processing ${sport}:`, err.message);
    }
  }
  console.log('Cron job completed');
}

// Schedule to run nightly at 02:00 AM server local time
cron.schedule('0 2 * * *', () => {
  runForAllSports();
});

// Also export for manual invocation if needed
module.exports = { runForAllSports };
