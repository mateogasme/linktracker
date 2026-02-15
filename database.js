const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'tracker.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_code TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    referer TEXT,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (link_code) REFERENCES links(code) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
  CREATE INDEX IF NOT EXISTS idx_visits_link_code ON visits(link_code);
`);

// Prepared statements
const insertLink = db.prepare(
  'INSERT INTO links (code, original_url) VALUES (?, ?)'
);

const getLinkByCode = db.prepare(
  'SELECT * FROM links WHERE code = ?'
);

const getAllLinks = db.prepare(`
  SELECT l.*, COUNT(v.id) as visit_count
  FROM links l
  LEFT JOIN visits v ON l.code = v.link_code
  GROUP BY l.id
  ORDER BY l.created_at DESC
`);

const insertVisit = db.prepare(
  'INSERT INTO visits (link_code, ip_address, user_agent, referer) VALUES (?, ?, ?, ?)'
);

const getVisitsByCode = db.prepare(
  'SELECT * FROM visits WHERE link_code = ? ORDER BY visited_at DESC'
);

const deleteLinkByCode = db.prepare(
  'DELETE FROM links WHERE code = ?'
);

const deleteVisitsByCode = db.prepare(
  'DELETE FROM visits WHERE link_code = ?'
);

module.exports = {
  db,
  insertLink,
  getLinkByCode,
  getAllLinks,
  insertVisit,
  getVisitsByCode,
  deleteLinkByCode,
  deleteVisitsByCode,
};
