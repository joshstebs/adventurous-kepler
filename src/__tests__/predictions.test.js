const { computePredictions } = require('../predictions.js');

describe('computePredictions', () => {
  // Real-shaped fixtures: stats = season averages, gameLogs = real per-game
  // values (most recent first). No random/simulated data in these inputs.
  const mockPlayerData = {
    MLB: [
      {
        id: 'p-mlb-1', name: 'Aaron Judge', teamId: 'NYY', teamName: 'New York Yankees',
        stats: { totalBases: 2.2, homeRuns: 0.7, hits: 1.1, rbis: 0.9, walks: 0.8, strikeouts: 1.4 },
        gameLogs: {
          totalBases: [3, 1, 4, 2, 2, 3, 1, 2, 4, 2],
          homeRuns: [1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
          hits: [2, 1, 2, 1, 1, 2, 1, 1, 2, 1],
          rbis: [1, 0, 2, 1, 0, 1, 0, 1, 2, 0],
          walks: [1, 0, 1, 2, 0, 1, 0, 1, 0, 1],
          strikeouts: [1, 2, 0, 1, 2, 1, 2, 1, 0, 2],
        },
        sources: ['MLB Stats API 2026'],
      },
    ],
    NFL: [
      {
        id: 'p-nfl-1', name: 'Patrick Mahomes', teamId: 'KC', teamName: 'Kansas City Chiefs',
        stats: { passingYards: 250.3, passingTDs: 1.5, interceptions: 0.8 },
        gameLogs: {
          passingYards: [320, 210, 289, 245, 301, 180, 275, 260, 310, 225],
          passingTDs: [3, 1, 2, 1, 3, 0, 2, 2, 3, 1],
          interceptions: [0, 1, 0, 2, 0, 1, 0, 0, 1, 0],
        },
        sources: ['ESPN NFL 2025-26'],
      },
    ],
    NBA: [
      {
        id: 'p-nba-1', name: 'Shai Gilgeous-Alexander', teamId: 'OKC', teamName: 'Oklahoma City Thunder',
        stats: { points: 32.7, assists: 6.4, rebounds: 5.5, steals: 2.0, blocks: 1.1, threePointersMade: 2.0 },
        gameLogs: {
          points: [35, 28, 40, 31, 26, 38, 22, 33, 30, 27],
          assists: [7, 5, 8, 6, 4, 9, 5, 7, 6, 5],
          rebounds: [6, 4, 7, 5, 6, 8, 4, 5, 6, 5],
          steals: [2, 1, 3, 2, 1, 2, 1, 3, 2, 1],
          blocks: [1, 0, 2, 1, 0, 1, 1, 2, 0, 1],
          threePointersMade: [2, 1, 3, 2, 1, 2, 2, 3, 1, 2],
        },
        sources: ['ESPN NBA 2025-26'],
      },
    ],
    NHL: [
      {
        id: 'p-nhl-1', name: 'Connor McDavid', teamId: 'EDM', teamName: 'Edmonton Oilers',
        stats: { goals: 0.5, assists: 1.0, shotsOnGoal: 3.2, plusMinus: 0.3, powerPlayPoints: 0.4 },
        gameLogs: {
          goals: [0, 1, 0, 2, 0, 1, 0, 0, 1, 0],
          assists: [1, 2, 0, 1, 2, 1, 1, 0, 2, 1],
          shotsOnGoal: [4, 3, 5, 2, 4, 3, 2, 4, 5, 3],
          plusMinus: [1, 0, 2, -1, 1, 0, 1, 2, 0, 1],
          powerPlayPoints: [0, 1, 0, 1, 0, 0, 1, 0, 1, 0],
        },
        sources: ['NHL API 2025-26'],
      },
    ],
  };

  const sports = ['MLB', 'NFL', 'NBA', 'NHL'];

  sports.forEach(sport => {
    describe(`${sport} predictions`, () => {
      it(`should return prop_predictions and moneyline_predictions for ${sport}`, () => {
        const players = mockPlayerData[sport];
        const result = computePredictions(sport, players);

        // Assert prop_predictions is a non-empty array
        expect(Array.isArray(result.prop_predictions)).toBe(true);
        expect(result.prop_predictions.length).toBeGreaterThan(0);

        // Assert each item has the full real-data contract
        result.prop_predictions.forEach(item => {
          expect(item).toHaveProperty('playerId');
          expect(item).toHaveProperty('propName');
          expect(typeof item.predictedValue).toBe('number');
          expect(typeof item.confidence).toBe('object');
          expect(item.confidence).not.toBeNull();
          expect(Array.isArray(item.gameLogs)).toBe(true);
          expect(item.gameLogs.length).toBeGreaterThan(0);
          expect(typeof item.last10HitPct).toBe('number');
          expect(typeof item.last5HitPct).toBe('number');
          expect(['A', 'B', 'C', 'D']).toContain(item.grade);
          expect(['sportsbook', 'model']).toContain(item.lineSource);
        });

        // Assert moneyline_predictions is an array where each item has teamId,
        // winProbability (0-1), impliedOdds (number)
        expect(Array.isArray(result.moneyline_predictions)).toBe(true);
        result.moneyline_predictions.forEach(item => {
          expect(item).toHaveProperty('teamId');
          expect(typeof item.winProbability).toBe('number');
          expect(item.winProbability).toBeGreaterThanOrEqual(0);
          expect(item.winProbability).toBeLessThanOrEqual(1);
          expect(typeof item.impliedOdds).toBe('number');
        });
      });

      it('gameLogs in the output match the real input logs (no simulation)', () => {
        const players = mockPlayerData[sport];
        const result = computePredictions(sport, players);
        const player = players[0];
        const prop = Object.keys(player.gameLogs)[0];
        const item = result.prop_predictions.find(
          p => p.playerId === player.id && p.propName === prop
        );
        expect(item).toBeDefined();
        // The engine must pass through the real per-game values unchanged
        expect(item.gameLogs).toEqual(player.gameLogs[prop]);
      });

      it('is deterministic — same input, same output (no randomness)', () => {
        const players = mockPlayerData[sport];
        const a = computePredictions(sport, players);
        const b = computePredictions(sport, players);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      });
    });
  });

  describe('sportsbook lines', () => {
    it('uses the sportsbook line when real prop odds are passed in', () => {
      const players = mockPlayerData.NBA;
      const propsLines = [
        {
          market: 'player_points',
          player: { name: 'Shai Gilgeous-Alexander' },
          outcomes: [{ name: 'Over 31.5', point: 31.5, price: -110 }],
          bookmaker: 'DraftKings',
        },
      ];
      const result = computePredictions('NBA', players, [], propsLines);
      const item = result.prop_predictions.find(
        p => p.propName === 'points' && p.playerName === 'Shai Gilgeous-Alexander'
      );
      expect(item.line).toBe(31.5);
      expect(item.lineSource).toBe('sportsbook');
      expect(item.bookmaker).toBe('DraftKings');
    });

    it('labels the line as model when no sportsbook prop odds exist', () => {
      const result = computePredictions('NBA', mockPlayerData.NBA);
      const item = result.prop_predictions.find(p => p.propName === 'points');
      expect(item.lineSource).toBe('model');
    });
  });
});
