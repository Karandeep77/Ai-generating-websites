const sqlite3 = require("sqlite3").verbose();
const path    = require("path");
const bcrypt  = require("bcryptjs");

const DB_PATH = path.join(__dirname, "projects.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("Database connection failed:", err.message);
  else     console.log("Database connected ✓");
});

// Run migrations in sequence using db.serialize
// This ensures tables are created in order, no race conditions
db.serialize(() => {

  // ── USERS TABLE ───────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      role       TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) console.error("Users table error:", err.message);
    else     console.log("Users table ready ✓");
  });

  // ── PROJECTS TABLE ────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      name       TEXT NOT NULL,
      prompt     TEXT NOT NULL,
      html       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) console.error("Projects table error:", err.message);
    else {
      console.log("Projects table ready ✓");

      // ── SAFELY ADD user_id column if old DB doesn't have it ──────
      // This handles the case where projects.db already existed
      // without the user_id column
      db.run(`ALTER TABLE projects ADD COLUMN user_id INTEGER`, (err) => {
        // Ignore error — it just means column already exists
        if (!err) console.log("Added user_id column to existing projects ✓");
      });
    }
  });

  // ── CREATE DEFAULT ADMIN ──────────────────────────────────────────
  db.get(`SELECT id FROM users WHERE email = ?`, ["admin@admin.com"], async (err, row) => {
    if (row) {
      console.log("Admin account exists ✓");
      return;
    }
    try {
      const hash = await bcrypt.hash("admin123", 10);
      db.run(
        `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
        ["Admin", "admin@admin.com", hash, "admin"],
        (err) => {
          if (err) console.error("Admin creation error:", err.message);
          else     console.log("Default admin created ✓  →  admin@admin.com / admin123");
        }
      );
    } catch(e) {
      console.error("Bcrypt error:", e.message);
    }
  });

});

module.exports = db;