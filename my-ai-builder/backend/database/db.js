// db.js - uses sqlite3 package (more compatible than better-sqlite3)

const sqlite3 = require("sqlite3").verbose();
const path    = require("path");
const fs      = require("fs");

// Make sure database folder exists
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const DB_PATH = path.join(__dirname, "projects.db");

// Open (or create) the database file
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("Database connected:", DB_PATH);
  }
});

// Create projects table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    prompt     TEXT NOT NULL,
    html       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`, (err) => {
  if (err) console.error("Table creation failed:", err.message);
  else     console.log("Projects table ready ✓");
});

module.exports = db;