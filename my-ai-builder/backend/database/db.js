const sqlite3 = require("sqlite3").verbose();
const path    = require("path");
const fs      = require("fs");
const bcrypt  = require("bcryptjs");

const DB_PATH = process.env.NODE_ENV === "production"
  ? "/data/projects.db"
  : path.join(__dirname, "projects.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("Database connection failed:", err.message);
  else     console.log("Database connected ✓");
});

db.serialize(() => {

  // ── USERS TABLE ───────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT,
      email             TEXT UNIQUE NOT NULL,
      password          TEXT NOT NULL,
      role              TEXT DEFAULT 'user',
      plan              TEXT DEFAULT 'free',
      plan_expires_at   TEXT,
      websites_used     INTEGER DEFAULT 0,
      modifications_used INTEGER DEFAULT 0,
      usage_reset_at    TEXT DEFAULT (datetime('now', 'start of month', '+1 month')),
      created_at        TEXT DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) console.error("Users table error:", err.message);
    else {
      console.log("Users table ready ✓");
      addColumnSafe("users", "plan",                "TEXT DEFAULT 'free'");
      addColumnSafe("users", "plan_expires_at",     "TEXT");
      addColumnSafe("users", "websites_used",       "INTEGER DEFAULT 0");
      addColumnSafe("users", "modifications_used",  "INTEGER DEFAULT 0");
      addColumnSafe("users", "usage_reset_at",      "TEXT DEFAULT (datetime('now'))");
      createDefaultAdmin();
    }
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
      addColumnSafe("projects", "user_id", "INTEGER");
      addColumnSafe("projects", "deployed_url", "TEXT");
    }
  });

  // ── PAYMENTS TABLE ────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL,
      razorpay_order_id  TEXT,
      razorpay_payment_id TEXT,
      plan               TEXT NOT NULL,
      amount             INTEGER NOT NULL,
      status             TEXT DEFAULT 'created',
      created_at         TEXT DEFAULT (datetime('now'))
    )
  `, (err) => {
    if (err) console.error("Payments table error:", err.message);
    else     console.log("Payments table ready ✓");
  });

// Deployments table
db.run(`
  CREATE TABLE IF NOT EXISTS deployments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    project_id   INTEGER,
    project_name TEXT,
    url          TEXT NOT NULL,
    site_name    TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  )
`, (err) => {
  if (err) console.error("Deployments table error:", err.message);
  else     console.log("Deployments table ready ✓");
});

addColumnSafe("projects", "deployed_url", "TEXT");
});


// Safely add column if it doesn't exist
function addColumnSafe(table, column, definition) {
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, () => {});
}

// Create default admin
async function createDefaultAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log("Default admin not created: ADMIN_EMAIL and ADMIN_PASSWORD are not set");
    return;
  }

  if (adminPassword.length < 8) {
    console.error("Default admin not created: ADMIN_PASSWORD must be at least 8 characters");
    return;
  }

  const normalizedEmail = adminEmail.toLowerCase().trim();

  if (normalizedEmail !== "admin@admin.com") {
    db.run(
      `DELETE FROM users WHERE email = ? AND role = 'admin'`,
      ["admin@admin.com"],
      (err) => {
        if (err) console.error("Could not remove old default admin:", err.message);
      }
    );
  }

  db.get(`SELECT id FROM users WHERE email = ?`, [normalizedEmail], async (err, row) => {
    if (row) { console.log("Admin exists ✓"); return; }
    const hash = await bcrypt.hash(adminPassword, 10);
    db.run(
      `INSERT INTO users (name, email, password, role, plan) VALUES (?, ?, ?, ?, ?)`,
      ["Admin", normalizedEmail, hash, "admin", "agency"],
      (err) => {
        if (!err) console.log(`Default admin created: ${normalizedEmail}`);
      }
    );
  });
}

module.exports = db;
