// src/services/fetchers.js
/**
 * Fetches REAL player data (season stats + per-game logs) from free public APIs.
 * Each fetcher returns an array of:
 *   {
 *     id, name, teamId, teamName, position,
 *     stats: { propName: seasonAvgPerGame, ... },
 *     gameLogs: { propName: [values, most-recent-first], ... },
 *     sources: ['source description']
 *   }
 *
 * Sources (all verified live, zero fabrication):
 *  NFL  – ESPN site API rosters + ESPN v3 athlete gamelogs
 *  NBA  – ESPN site API rosters + ESPN v3 athlete gamelogs
 *  MLB  – MLB Stats API (statsapi.mlb.com) season + gameLog per player
 *  NHL  – NHL API (api.nhle.com summary + api-web.nhle.com game-log)
 */

const axios = require('axios');

// Shared axios instance with timeout
const http = axios.create({ timeout: 15000 });

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function safeGet(url, label) {
  try {
    const resp = await http.get(url);
    return resp.data;
  } catch (e) {
    console.warn(`[fetchers] ${label} fetch failed: ${e.message} (${url})`);
    return null;
  }
}

/** Run async fn over items with limited concurrency, preserving order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        console.warn(`[fetchers] mapLimit item ${i} failed: ${e.message}`);
        results[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function mean(arr) {
  const vals = arr.filter(v => v !== null);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ─── ESPN helpers (NFL + NBA) ────────────────────────────────────────────────
async function espnTeams(league) {
  const data = await safeGet(
    `https://site.api.espn.com/apis/site/v2/sports/${league}/teams`,
    'ESPN teams'
  );
  return ((data?.sports?.[0]?.leagues?.[0]?.teams) || []).map(t => t.team).filter(Boolean);
}

async function espnRoster(league, teamId) {
  const data = await safeGet(
    `https://site.api.espn.com/apis/site/v2/sports/${league}/teams/${teamId}/roster`,
    'ESPN roster'
  );
  const out = [];
  for (const group of data?.athletes || []) {
    if (Array.isArray(group?.items)) {
      // NFL-style: groups keyed by position (offense/defense/specialTeam/...)
      for (const item of group.items) out.push(item);
    } else if (group?.fullName || group?.id) {
      // NBA-style: flat array of athlete objects
      out.push(group);
    }
  }
  return out; // [{ id, fullName, position: { abbreviation }, ... }]
}

/**
 * Fetch an athlete's real per-game logs from ESPN's v3 gamelog endpoint.
 * Returns { games: [{ gameId, date, week, stats: {statName: value} }], regularSeasonOnly }
 * ordered most-recent-first, restricted to the Regular Season (playoffs excluded).
 */
async function espnGameLog(league, athleteId) {
  const data = await safeGet(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${athleteId}/gamelog`,
    'ESPN gamelog'
  );
  if (!data || !Array.isArray(data.names)) return null;

  const seasonTypes = data.seasonTypes || [];
  const regular =
    seasonTypes.find(s => /regular season/i.test(s.displayName || '')) || seasonTypes[0];
  if (!regular) return null;

  // eventId -> stat values, from every category of the regular season
  const statsById = {};
  for (const cat of regular.categories || []) {
    for (const e of cat.events || []) {
      if (e.eventId && Array.isArray(e.stats)) statsById[e.eventId] = e.stats;
    }
  }

  const eventsById = data.events || {};
  const gameIds = Object.keys(statsById)
    .filter(id => eventsById[id])
    .sort((a, b) =>
      String(eventsById[b].gameDate || '').localeCompare(String(eventsById[a].gameDate || ''))
    );

  const games = gameIds.map(id => {
    const row = {};
    const values = statsById[id];
    data.names.forEach((name, i) => {
      const raw = values[i];
      // Keep composite stats like "12-21" as strings for later parsing
      row[name] =
        typeof raw === 'string' && raw.includes('-') && !raw.startsWith('-')
          ? raw
          : toNum(raw);
    });
    const ev = eventsById[id] || {};
    return {
      gameId: id,
      date: ev.gameDate || null,
      week: ev.week || null,
      opponent: ev.opponent?.displayName || null,
      opponentAbbrev: ev.opponent?.abbreviation || null,
      homeAway: ev.atVs === 'vs' ? 'home' : ev.atVs === '@' ? 'away' : '',
      stats: row,
    };
  });

  return { games, names: data.names };
}

/** Build { propName: [values most-recent-first] } + season averages from ESPN games. */
function buildLogsFromGames(games, nameMap) {
  const logs = {};
  const avgs = {};
  for (const [prop, espnName] of Object.entries(nameMap)) {
    const values = games
      .map(g => g.stats[espnName])
      .filter(v => v !== null && v !== undefined);
    if (values.length >= 2) {
      logs[prop] = values; // already most-recent-first
      avgs[prop] = Number(mean(values).toFixed(1));
    }
  }
  return { logs, avgs };
}

/** ESPN "3PM-3PA" style composite stat -> made count. */
function madeFromComposite(val) {
  if (val === null || val === undefined) return null;
  const s = String(val);
  const m = s.match(/^(\d+)\s*-\s*\d+$/);
  return m ? Number(m[1]) : null;
}

/** Attach CDN image URLs + per-game opponent metadata to an ESPN-sourced player. */
function enrichEspnPlayer(pl, gl, leagueSlug, logoAbbrev) {
  return {
    ...pl,
    photoUrl: `https://a.espncdn.com/i/headshots/${leagueSlug}/players/full/${pl.id}.png`,
    teamLogoUrl: `https://a.espncdn.com/i/teamlogos/${leagueSlug}/500/${(logoAbbrev || '').toLowerCase()}.png`,
    games: (gl.games || []).map(g => ({
      date: g.date,
      opponent: g.opponent,
      opponentAbbrev: g.opponentAbbrev,
      homeAway: g.homeAway,
    })),
  };
}

// ─── NFL ───────────────────────────────────────────────────────────────────────
const NFL_PROP_MAP = {
  passingYards: 'passingYards',
  passingTDs: 'passingTouchdowns',
  rushingYards: 'rushingYards',
  receivingYards: 'receivingYards',
  receptions: 'receptions',
  interceptions: 'interceptions',
};

async function fetchNFL() {
  const teams = await espnTeams('football/nfl');
  if (!teams.length) return [];

  const rosters = await mapLimit(teams, 6, async t => ({
    team: t,
    players: await espnRoster('football/nfl', t.id),
  }));

  // Per team take: QB1-2, RB1-2, WR1-3, TE1 (roster order = depth chart order)
  const selected = [];
  for (const { team, players } of rosters) {
    const caps = { QB: 2, RB: 2, WR: 3, TE: 1 };
    const counts = {};
    for (const p of players) {
      const pos = p.position?.abbreviation;
      if (!(pos in caps)) continue;
      counts[pos] = (counts[pos] || 0) + 1;
      if (counts[pos] > caps[pos]) continue;
      selected.push({
        id: String(p.id),
        name: p.fullName,
        position: pos,
        teamId: String(team.id),
        teamName: team.displayName || team.name,
        teamAbbrev: team.abbreviation || '',
      });
    }
  }

  const withLogs = await mapLimit(selected, 8, async pl => {
    const gl = await espnGameLog('football/nfl', pl.id);
    if (!gl || !gl.games.length) return null;
    const { logs, avgs } = buildLogsFromGames(gl.games, NFL_PROP_MAP);
    if (!Object.keys(logs).length) return null;
    return enrichEspnPlayer(
      { ...pl, stats: avgs, gameLogs: logs, sources: ['ESPN NFL 2025-26'] },
      gl,
      'nfl',
      pl.teamAbbrev
    );
  });

  return withLogs.filter(Boolean).slice(0, 200);
}

// ─── NBA ───────────────────────────────────────────────────────────────────────
// The 40 stars shown by the app (real 2024-25 stat lines live on the backend
// data layer only as a name list — actual values come from ESPN gamelogs now).
const NBA_STAR_NAMES = [
  'Shai Gilgeous-Alexander', 'Giannis Antetokounmpo', 'Luka Doncic',
  'Jayson Tatum', 'Nikola Jokic', 'Anthony Edwards', 'LeBron James',
  'Donovan Mitchell', 'Karl-Anthony Towns', 'Cade Cunningham', 'Jaylen Brown',
  'Stephen Curry', 'Damian Lillard', 'Kevin Durant', 'Joel Embiid',
  'Tyrese Haliburton', 'James Harden', 'Trae Young', 'Paolo Banchero',
  'Jalen Brunson', 'Evan Mobley', 'Anthony Davis', 'Alperen Sengun',
  'Victor Wembanyama', 'Devin Booker', 'Bam Adebayo', 'Kristaps Porzingis',
  'Zion Williamson', 'Ja Morant', 'Darius Garland', 'Brandon Ingram',
  'Scottie Barnes', "De'Aaron Fox", 'Khris Middleton', 'Kyrie Irving',
  'OG Anunoby', 'Draymond Green', 'Myles Turner', 'Mikal Bridges', 'Franz Wagner',
];

const NBA_PROP_MAP = {
  points: 'points',
  assists: 'assists',
  rebounds: 'totalRebounds',
  steals: 'steals',
  blocks: 'blocks',
  threePointersMade: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
};

async function fetchNBA() {
  const teams = await espnTeams('basketball/nba');
  if (!teams.length) return [];

  const rosters = await mapLimit(teams, 6, async t => ({
    team: t,
    players: await espnRoster('basketball/nba', t.id),
  }));

  // Match the star list against real rosters by name
  const wanted = new Set(NBA_STAR_NAMES.map(normName));
  const matched = [];
  for (const { team, players } of rosters) {
    for (const p of players) {
      if (wanted.has(normName(p.fullName))) {
        matched.push({
          id: String(p.id),
          name: p.fullName,
          position: p.position?.abbreviation || '',
          teamId: String(team.id),
          teamName: team.displayName || team.name,
          teamAbbrev: team.abbreviation || '',
        });
      }
    }
  }

  const withLogs = await mapLimit(matched, 8, async pl => {
    const gl = await espnGameLog('basketball/nba', pl.id);
    if (!gl || !gl.games.length) return null;
    // Rebuild logs with composite-stat parsing for 3PM
    const logs = {};
    const avgs = {};
    for (const [prop, espnName] of Object.entries(NBA_PROP_MAP)) {
      let values = gl.games
        .map(g => g.stats[espnName])
        .map(v => (espnName.includes('-') ? madeFromComposite(v) : v))
        .filter(v => v !== null && v !== undefined);
      if (values.length >= 2) {
        logs[prop] = values;
        avgs[prop] = Number(mean(values).toFixed(1));
      }
    }
    if (!Object.keys(logs).length) return null;
    return enrichEspnPlayer(
      { ...pl, stats: avgs, gameLogs: logs, sources: ['ESPN NBA 2025-26'] },
      gl,
      'nba',
      pl.teamAbbrev
    );
  });

  return withLogs.filter(Boolean);
}

// ─── MLB ───────────────────────────────────────────────────────────────────────
const MLB_SEASON = 2026;

async function fetchMLB() {
  const teamsData = await safeGet('https://statsapi.mlb.com/api/v1/teams?sportId=1', 'MLB teams');
  const teamsMap = {};
  (teamsData?.teams || []).forEach(t => {
    teamsMap[t.id] = { name: t.name, abbreviation: t.abbreviation || '' };
  });

  const playersData = await safeGet(
    `https://statsapi.mlb.com/api/v1/sports/1/players?season=${MLB_SEASON}&gameType=R`,
    'MLB players'
  );
  const people = playersData?.people || [];
  const peopleMap = {};
  people.forEach(p => {
    peopleMap[p.id] = p;
  });

  const hittingData = await safeGet(
    `https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${MLB_SEASON}&playerPool=all&limit=500`,
    'MLB hitting'
  );
  const pitchingData = await safeGet(
    `https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${MLB_SEASON}&playerPool=all&limit=500`,
    'MLB pitching'
  );

  const playersStats = {};
  const gamesPlayed = {};

  (hittingData?.stats?.[0]?.splits || []).forEach(s => {
    if (!s.player?.id) return;
    const pid = s.player.id;
    const st = s.stat;
    playersStats[pid] = {
      ...(playersStats[pid] || {}),
      hits: (playersStats[pid]?.hits || 0) + (st.hits || 0),
      doubles: (playersStats[pid]?.doubles || 0) + (st.doubles || 0),
      triples: (playersStats[pid]?.triples || 0) + (st.triples || 0),
      homeRuns: (playersStats[pid]?.homeRuns || 0) + (st.homeRuns || 0),
      rbis: (playersStats[pid]?.rbis || 0) + (st.rbi || 0),
      walks: (playersStats[pid]?.walks || 0) + (st.baseOnBalls || 0),
      strikeouts: (playersStats[pid]?.strikeouts || 0) + (st.strikeOuts || 0),
    };
    gamesPlayed[pid] = (gamesPlayed[pid] || 0) + (st.gamesPlayed || 0);
  });

  (pitchingData?.stats?.[0]?.splits || []).forEach(s => {
    if (!s.player?.id) return;
    const pid = s.player.id;
    const st = s.stat;
    playersStats[pid] = {
      ...(playersStats[pid] || {}),
      strikeouts: (playersStats[pid]?.strikeouts || 0) + (st.strikeOuts || 0),
    };
    // A pitcher's games played for pitching
    gamesPlayed[pid] = Math.max(gamesPlayed[pid] || 0, st.gamesPlayed || 0);
  });

  // Compute totalBases from components
  for (const st of Object.values(playersStats)) {
    st.totalBases = (st.hits || 0) + (st.doubles || 0) + 2 * (st.triples || 0) + 3 * (st.homeRuns || 0);
  }

  const validPlayers = [];
  for (const [pidStr, st] of Object.entries(playersStats)) {
    const pid = Number(pidStr);
    const p = peopleMap[pid];
    if (!p) continue;
    if (!(st.hits > 0 || st.homeRuns > 0 || st.rbis > 0 || st.walks > 0 || st.strikeouts > 0)) continue;
    const teamId = p.currentTeam?.id || null;
    const teamInfo = teamsMap[teamId] || {};
    validPlayers.push({
      id: String(p.id),
      name: p.fullName || 'Unknown',
      position: p.primaryPosition?.abbreviation || '',
      teamId: String(teamId || ''),
      teamName: teamInfo.name || 'Unknown',
      teamAbbrev: teamInfo.abbreviation || '',
      stats: st,
      gamesPlayed: gamesPlayed[pidStr] || 0,
      sources: ['MLB Stats API'],
    });
  }

  validPlayers.sort((a, b) => (b.stats.hits + b.stats.strikeouts) - (a.stats.hits + a.stats.strikeouts));
  const top = validPlayers.slice(0, 60);

  // Real per-game logs for the top players (hitting group; pitchers also get pitching logs)
  const withLogs = await mapLimit(top, 6, async pl => {
    const groups = pl.position === 'P' ? ['pitching', 'hitting'] : ['hitting'];
    const logs = {};
    let gamesMeta = null;
    for (const group of groups) {
      const data = await safeGet(
        `https://statsapi.mlb.com/api/v1/people/${pl.id}/stats?stats=gameLog&group=${group}&season=${MLB_SEASON}&gameType=R`,
        `MLB gameLog ${pl.name}`
      );
      const splits = data?.stats?.[0]?.splits || [];
      // most recent first
      const ordered = [...splits].reverse();
      if (!gamesMeta && ordered.length) {
        gamesMeta = ordered.map(sp => {
          const opp = teamsMap[sp.opponent?.id] || {};
          return {
            date: sp.date || null,
            opponent: sp.opponent?.name || opp.name || 'Unknown',
            opponentAbbrev: opp.abbreviation || '',
            homeAway: sp.isHome === true ? 'home' : sp.isHome === false ? 'away' : '',
          };
        });
      }
      const map = {
        hits: 'hits',
        homeRuns: 'homeRuns',
        rbis: 'rbi',
        walks: 'baseOnBalls',
        strikeouts: 'strikeOuts',
      };
      for (const [prop, key] of Object.entries(map)) {
        const values = ordered.map(sp => toNum(sp.stat?.[key])).filter(v => v !== null);
        if (values.length >= 2 && !(prop in logs)) {
          logs[prop] = values;
        }
      }
      // totalBases per game
      const tb = ordered.map(sp => {
        const st = sp.stat || {};
        if (st.hits === undefined) return null;
        return toNum((st.hits || 0) + (st.doubles || 0) + 2 * (st.triples || 0) + 3 * (st.homeRuns || 0));
      }).filter(v => v !== null);
      if (tb.length >= 2 && !('totalBases' in logs)) {
        logs.totalBases = tb;
      }
    }
    if (!Object.keys(logs).length) return null;

    const stats = {};
    for (const [prop, values] of Object.entries(logs)) {
      stats[prop] = Number(mean(values).toFixed(1));
    }
    return {
      id: pl.id,
      name: pl.name,
      position: pl.position,
      teamId: pl.teamId,
      teamName: pl.teamName,
      teamAbbrev: pl.teamAbbrev,
      photoUrl:
        `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,d_people:generic:prof:current.png,q_auto:best,f_auto/v1/people/${pl.id}/headshot/67/current`,
      teamLogoUrl: pl.teamId ? `https://www.mlbstatic.com/team-logos/${pl.teamId}.svg` : null,
      games: gamesMeta,
      stats,
      gameLogs: logs,
      sources: ['MLB Stats API 2026'],
    };
  });

  return withLogs.filter(Boolean);
}

// ─── NHL ───────────────────────────────────────────────────────────────────────
const NHL_SEASON = '20252026';
const NHL_PROP_MAP = {
  goals: 'goals',
  assists: 'assists',
  shotsOnGoal: 'shots',
  plusMinus: 'plusMinus',
  powerPlayPoints: 'powerPlayPoints',
};

async function fetchNHL() {
  const teamsData = await safeGet('https://api.nhle.com/stats/rest/en/team', 'NHL teams');
  const teamsMap = {};
  (teamsData?.data || []).forEach(t => {
    if (t.triCode) teamsMap[t.triCode] = { id: t.id, name: t.fullName || t.name, abbreviation: t.triCode };
  });

  const skatersData = await safeGet(
    `https://api.nhle.com/stats/rest/en/skater/summary?limit=150&cayenneExp=seasonId=${NHL_SEASON}&sort=points&dir=DESC`,
    'NHL skaters'
  );
  const skaters = skatersData?.data || [];

  const goaliesData = await safeGet(
    `https://api.nhle.com/stats/rest/en/goalie/summary?limit=50&cayenneExp=seasonId=${NHL_SEASON}`,
    'NHL goalies'
  );

  const players = [];
  skaters.slice(0, 60).forEach(p => {
    const abbrev = p.teamAbbrevs ? p.teamAbbrevs.split(',')[0] : '';
    const team = teamsMap[abbrev] || { id: '', name: 'Unknown' };
    players.push({
      id: String(p.playerId),
      name: p.skaterFullName || 'Unknown',
      position: p.positionCode || '',
      teamId: String(team.id),
      teamName: team.name,
      teamAbbrev: abbrev,
      gamesPlayed: p.gamesPlayed || 0,
      stats: {
        goals: p.goals || 0,
        assists: p.assists || 0,
        shotsOnGoal: p.shots || 0,
        plusMinus: p.plusMinus || 0,
        powerPlayPoints: p.ppPoints || 0,
      },
    });
  });

  (goaliesData?.data || []).slice(0, 20).forEach(g => {
    const abbrev = g.teamAbbrevs ? g.teamAbbrevs.split(',')[0] : '';
    const team = teamsMap[abbrev] || { id: '', name: 'Unknown' };
    players.push({
      id: String(g.playerId),
      name: g.goalieFullName || 'Unknown',
      position: 'G',
      teamId: String(team.id),
      teamName: team.name,
      teamAbbrev: abbrev,
      gamesPlayed: g.gamesPlayed || 0,
      stats: {
        goals: 0,
        assists: g.assists || 0,
        saves: g.saves || 0,
        shotsOnGoal: 0,
        plusMinus: 0,
        powerPlayPoints: 0,
      },
    });
  });

  // Real per-game logs
  const withLogs = await mapLimit(players, 8, async pl => {
    const data = await safeGet(
      `https://api-web.nhle.com/v1/player/${pl.id}/game-log/${NHL_SEASON}/2`,
      `NHL gameLog ${pl.name}`
    );
    const gameLog = data?.gameLog || [];
    // NHL returns game logs newest-first already — no reordering
    const ordered = gameLog;
    const map = { ...NHL_PROP_MAP };
    const logs = {};
    if (pl.position === 'G') {
      // Goalie logs carry shotsAgainst/goalsAgainst (no saves field);
      // saves = shotsAgainst - goalsAgainst is real arithmetic on real data.
      const values = ordered
        .map(g => {
          const sa = toNum(g.shotsAgainst);
          const ga = toNum(g.goalsAgainst);
          if (sa === null || ga === null) return null;
          return sa - ga;
        })
        .filter(v => v !== null);
      if (values.length >= 2) logs.saves = values;
      delete map.goals;
      delete map.shotsOnGoal;
      delete map.plusMinus;
      delete map.powerPlayPoints;
      delete map.saves;
    }
    for (const [prop, key] of Object.entries(map)) {
      const values = ordered.map(g => toNum(g[key])).filter(v => v !== null);
      if (values.length >= 2) logs[prop] = values;
    }
    if (!Object.keys(logs).length) return null;

    const stats = {};
    for (const [prop, values] of Object.entries(logs)) {
      stats[prop] = Number(mean(values).toFixed(1));
    }
    return {
      id: pl.id,
      name: pl.name,
      position: pl.position,
      teamId: pl.teamId,
      teamName: pl.teamName,
      teamAbbrev: pl.teamAbbrev,
      photoUrl: `https://assets.nhle.com/mugs/nhl/latest/${pl.id}.png`,
      teamLogoUrl: pl.teamAbbrev
        ? `https://assets.nhle.com/logos/nhl/svg/${pl.teamAbbrev}_light.svg`
        : null,
      games: ordered.map(g => {
        const oppName =
          (typeof g.opponentCommonName === 'object' && g.opponentCommonName?.default) ||
          (typeof g.opponentCommonName === 'string' && g.opponentCommonName) ||
          g.opponentAbbrev ||
          'Unknown';
        return {
          date: g.gameDate || null,
          opponent: oppName,
          opponentAbbrev: g.opponentAbbrev || '',
          homeAway: g.homeRoadFlag === 'H' ? 'home' : g.homeRoadFlag === 'R' ? 'away' : '',
        };
      }),
      stats,
      gameLogs: logs,
      sources: ['NHL API 2025-26'],
    };
  });

  return withLogs.filter(Boolean);
}

// ─── Main export ───────────────────────────────────────────────────────────────
async function fetchPlayers(sport) {
  switch (sport) {
    case 'MLB': return fetchMLB();
    case 'NFL': return fetchNFL();
    case 'NHL': return fetchNHL();
    case 'NBA': return fetchNBA();
    default: return [];
  }
}

module.exports = { fetchPlayers };
