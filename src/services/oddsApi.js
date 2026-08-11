// src/services/oddsApi.js
/**
 * The Odds API (the-odds-api.com) v4.
 *
 * Featured markets (h2h, spreads, totals) are available on the configured plan
 * and are fetched with real bookmaker lines.
 *
 * Player-prop markets require a Business plan or higher on The Odds API. We
 * attempt to fetch them on every call; if the plan does not support them the
 * API rejects the request and we return props: [] — the app then labels its
 * prop lines `lineSource: 'model'`. The props path activates automatically
 * when the API key is upgraded (no code change needed).
 */

const BASE = 'https://api.the-odds-api.com/v4';

const SPORT_KEYS = {
  MLB: 'baseball_mlb',
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
};

const PROPS_MARKETS = {
  MLB: 'batter_hits,batter_total_bases,batter_rbis,batter_home_runs,pitcher_strikeouts',
  NBA: 'player_points,player_assists,player_rebounds,player_threes',
  NFL: 'player_pass_yds,player_pass_td,player_rush_yds,player_rec_yds,player_receptions',
  NHL: 'player_points,player_goals,player_assists,player_shots_on_goal,player_saves',
};

let warnedPropsUnsupported = false;

function buildUrl(sport, markets) {
  const apiKey = process.env.ODDS_API_KEY || '';
  const sportKey = SPORT_KEYS[sport.toUpperCase()];
  if (!sportKey || !apiKey) return null;
  return (
    `${BASE}/sports/${sportKey}/odds/?apiKey=${apiKey}` +
    `&regions=us&markets=${markets}&oddsFormat=american`
  );
}

/** Normalize an Odds API bookmaker entry into our slim shape. */
function slimEvent(event) {
  return {
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commence_time: event.commence_time,
    bookmakers: (event.bookmakers || []).map(b => ({
      key: b.key,
      title: b.title,
      markets: (b.markets || []).map(m => ({
        key: m.key,
        outcomes: m.outcomes,
      })),
    })),
  };
}

async function fetchFeatured(sport) {
  const url = buildUrl(sport, 'h2h,spreads,totals');
  if (!url) return [];
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Odds API featured error:', response.status, response.statusText);
      return [];
    }
    const data = await response.json();
    return (data || []).map(slimEvent);
  } catch (error) {
    console.error('Failed to fetch featured odds:', error);
    return [];
  }
}

/** Try to fetch player-prop markets; [] when the plan doesn't support them. */
async function fetchProps(sport) {
  const markets = PROPS_MARKETS[sport.toUpperCase()];
  const url = buildUrl(sport, markets);
  if (!url || !markets) return [];
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (!warnedPropsUnsupported) {
        console.warn(
          `[oddsApi] Player-prop markets not available on this plan (${response.status}) — ` +
            'prop lines will be model-based until the Odds API plan supports props.'
        );
        warnedPropsUnsupported = true;
      }
      return [];
    }
    const data = await response.json();
    const props = [];
    for (const event of data || []) {
      for (const book of event.bookmakers || []) {
        for (const market of book.markets || []) {
          for (const outcome of market.outcomes || []) {
            if (outcome.name && outcome.point !== undefined) {
              props.push({
                market: market.key,
                player: outcome.player || null,
                name: outcome.name,
                point: outcome.point,
                price: outcome.price,
                bookmaker: book.title,
                commence_time: event.commence_time,
              });
            }
          }
        }
      }
    }
    return props;
  } catch (error) {
    console.error('Failed to fetch prop odds:', error);
    return [];
  }
}

/**
 * Returns { featured, props } — real bookmaker lines where the plan allows,
 * empty arrays otherwise.
 */
async function fetchOdds(sport) {
  const [featured, props] = await Promise.all([fetchFeatured(sport), fetchProps(sport)]);
  return { featured, props };
}

module.exports = { fetchOdds };
