const { computePredictions } = require('../predictions.js');

describe('computePredictions', () => {
  const sports = ['MLB', 'NFL', 'NBA', 'NHL'];

  const mockPlayerData = {
    MLB: [
      { id: 'p-mlb-1', name: 'Aaron Judge', stats: { teamId: 'NYY', totalBases: 3 }, sources: ['ESPN'] },
      { id: 'p-mlb-2', name: 'Shohei Ohtani', stats: { teamId: 'LAD', totalBases: 4 }, sources: ['MLBStats'] }
    ],
    NFL: [
      { id: 'p-nfl-1', name: 'Patrick Mahomes', stats: { teamId: 'KC', passingYards: 300 }, sources: ['ESPN'] }
    ],
    NBA: [
      { id: 'p-nba-1', name: 'LeBron James', stats: { teamId: 'LAL', points: 28 }, sources: ['ESPN'] }
    ],
    NHL: [
      { id: 'p-nhl-1', name: 'Connor McDavid', stats: { teamId: 'EDM', goals: 2 }, sources: ['NHLStats'] }
    ]
  };

  sports.forEach(sport => {
    describe(`${sport} predictions`, () => {
      it(`should return prop_predictions and moneyline_predictions for ${sport}`, () => {
        const players = mockPlayerData[sport];
        const result = computePredictions(sport, players);

        // Assert prop_predictions is a non-empty array
        expect(Array.isArray(result.prop_predictions)).toBe(true);
        expect(result.prop_predictions.length).toBeGreaterThan(0);

        // Assert each item has playerId, propName, predictedValue (number), confidence (object)
        result.prop_predictions.forEach(item => {
          expect(item).toHaveProperty('playerId');
          expect(item).toHaveProperty('propName');
          expect(typeof item.predictedValue).toBe('number');
          expect(typeof item.confidence).toBe('object');
          expect(item.confidence).not.toBeNull();
        });

        // Assert moneyline_predictions is an array where each item has teamId, winProbability (0-1), impliedOdds (number)
        expect(Array.isArray(result.moneyline_predictions)).toBe(true);
        result.moneyline_predictions.forEach(item => {
          expect(item).toHaveProperty('teamId');
          expect(typeof item.winProbability).toBe('number');
          expect(item.winProbability).toBeGreaterThanOrEqual(0);
          expect(item.winProbability).toBeLessThanOrEqual(1);
          expect(typeof item.impliedOdds).toBe('number');
        });
      });
    });
  });
});
