// src/services/oddsApi.js
async function fetchOdds(sport) {
  const sportKeys = {
    MLB: 'baseball_mlb',
    NFL: 'americanfootball_nfl',
    NBA: 'basketball_nba',
    NHL: 'icehockey_nhl'
  };
  
  const sportKey = sportKeys[sport.toUpperCase()];
  if (!sportKey) return [];
  
  const apiKey = process.env.ODDS_API_KEY || '';
  if (!apiKey) return [];
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Odds API error:', response.status, response.statusText);
      return [];
    }
    const data = await response.json();
    return data.map(event => ({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commence_time: event.commence_time,
      bookmakers: event.bookmakers || []
    }));
  } catch (error) {
    console.error('Failed to fetch odds:', error);
    return [];
  }
}

module.exports = { fetchOdds };
