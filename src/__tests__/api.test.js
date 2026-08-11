const request = require('supertest');
const { fetchPlayers } = require('../services/fetchers');
const app = require('../server.js');

jest.mock('../services/fetchers', () => ({
  fetchPlayers: jest.fn()
}));

describe('API Endpoints', () => {
  const staticPlayers = [
    {
      id: 'player-1',
      name: 'Test Player',
      stats: { teamId: 'TEST_TEAM', points: 20, goals: 2, passingYards: 250, totalBases: 3 },
      sources: ['ESPN']
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    fetchPlayers.mockResolvedValue(staticPlayers);
  });

  const sports = ['mlb', 'nfl', 'nba', 'nhl'];

  sports.forEach(sport => {
    it(`GET /api/${sport} returns 200 and JSON with prop_predictions and moneyline_predictions`, async () => {
      const response = await request(app)
        .get(`/api/${sport}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('prop_predictions');
      expect(response.body).toHaveProperty('moneyline_predictions');
      expect(Array.isArray(response.body.prop_predictions)).toBe(true);
      expect(Array.isArray(response.body.moneyline_predictions)).toBe(true);
      expect(fetchPlayers).toHaveBeenCalledWith(sport.toUpperCase());
    });
  });

  it('GET /api/invalid returns 400', async () => {
    const response = await request(app)
      .get('/api/invalid')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(fetchPlayers).not.toHaveBeenCalled();
  });
});
