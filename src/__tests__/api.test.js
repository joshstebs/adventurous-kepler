const request = require('supertest');
const { fetchPlayers } = require('../services/fetchers');
const { fetchOdds } = require('../services/oddsApi');
const app = require('../server.js');

jest.mock('../services/fetchers', () => ({
  fetchPlayers: jest.fn()
}));

jest.mock('../services/oddsApi', () => ({
  fetchOdds: jest.fn()
}));

describe('API Endpoints', () => {
  const staticPlayers = [
    {
      id: 'player-1',
      name: 'Test Player',
      teamId: 'TEST_TEAM',
      teamName: 'Test Team',
      stats: { points: 20, goals: 2, passingYards: 250, totalBases: 3 },
      gameLogs: {
        points: [25, 18, 22, 30, 15, 21, 19, 24, 20, 17],
        goals: [1, 0, 2, 1, 0, 3, 0, 1, 2, 0],
        passingYards: [280, 210, 300, 240, 190, 260, 220, 310, 250, 200],
        totalBases: [3, 1, 4, 2, 0, 3, 2, 4, 1, 2],
      },
      sources: ['Test Source'],
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    fetchPlayers.mockResolvedValue(staticPlayers);
    fetchOdds.mockResolvedValue({ featured: [], props: [] });
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
