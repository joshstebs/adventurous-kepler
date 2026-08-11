const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateToken = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, player_id, sport FROM favorites WHERE user_id = ?');
    const favorites = stmt.all(req.user.id);
    res.json(favorites);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, (req, res) => {
  const { playerId, sport } = req.body;
  if (!playerId || !sport) {
    return res.status(400).json({ error: 'playerId and sport required' });
  }
  
  try {
    const checkStmt = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND player_id = ? AND sport = ?');
    const existing = checkStmt.get(req.user.id, playerId, sport);
    if (existing) {
      return res.json({ message: 'Already in favorites', id: existing.id });
    }

    const insert = db.prepare('INSERT INTO favorites (user_id, player_id, sport) VALUES (?, ?, ?)');
    const info = insert.run(req.user.id, playerId, sport);
    res.json({ id: info.lastInsertRowid, playerId, sport });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:playerId', authenticateToken, (req, res) => {
  const { playerId } = req.params;
  
  try {
    const stmt = db.prepare('DELETE FROM favorites WHERE user_id = ? AND player_id = ?');
    stmt.run(req.user.id, playerId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
