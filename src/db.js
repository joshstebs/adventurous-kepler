/**
 * db.js – Pure-JS SQLite persistence using `@sqlite.org/sqlite-wasm` fallback.
 * We use `better-sqlite3` if available (requires build tools), otherwise fall
 * back to a simple JSON-file store so the server still runs on Windows without
 * native compilation.
 *
 * To use the real SQLite store, install build tools once:
 *   npm install -g windows-build-tools   (run as Admin)
 *   npm install better-sqlite3
 */

const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ─── Try better-sqlite3 (native, fast) ────────────────────────────────────────
let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(path.join(dataDir, 'app.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      player_id TEXT,
      sport TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
  console.log('[db] Using better-sqlite3');
} catch (e) {
  // ─── Fallback: JSON file store ─────────────────────────────────────────────
  console.warn('[db] better-sqlite3 unavailable, using JSON fallback store:', e.message);
  const storeFile = path.join(dataDir, 'db.json');
  const load = () => {
    if (!fs.existsSync(storeFile)) return { users: [], favorites: [] };
    try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return { users: [], favorites: [] }; }
  };
  const save = (data) => fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));

  db = {
    _type: 'json',
    prepare(sql) {
      // Minimal SQL interpreter for the ops used by routes/auth.js & routes/favorites.js
      return {
        get: (...args) => {
          const store = load();
          if (sql.includes('users') && sql.includes('username')) {
            return store.users.find(u => u.username === args[0]) || undefined;
          }
          if (sql.includes('users') && sql.includes('id')) {
            return store.users.find(u => u.id === args[0]) || undefined;
          }
          if (sql.includes('favorites')) {
            return store.favorites.find(f => f.user_id === args[0] && f.player_id === args[1]) || undefined;
          }
        },
        all: (...args) => {
          const store = load();
          if (sql.includes('favorites')) {
            return store.favorites.filter(f => f.user_id === args[0]);
          }
          return [];
        },
        run: (...args) => {
          const store = load();
          if (sql.toLowerCase().startsWith('insert into users')) {
            const id = (store.users[store.users.length - 1]?.id || 0) + 1;
            store.users.push({ id, username: args[0], password_hash: args[1] });
            save(store);
            return { lastInsertRowid: id };
          }
          if (sql.toLowerCase().startsWith('insert into favorites')) {
            const id = (store.favorites[store.favorites.length - 1]?.id || 0) + 1;
            store.favorites.push({ id, user_id: args[0], player_id: args[1], sport: args[2] });
            save(store);
            return { lastInsertRowid: id };
          }
          if (sql.toLowerCase().startsWith('delete from favorites')) {
            let data = load();
            data.favorites = data.favorites.filter(
              f => !(f.user_id === args[0] && f.player_id === args[1])
            );
            save(data);
            return {};
          }
          return {};
        },
      };
    },
  };
}

module.exports = db;
