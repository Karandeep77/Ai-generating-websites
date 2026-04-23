// projects.js - rewritten for sqlite3 (async/callback style)

const express = require("express");
const router  = express.Router();
const db      = require("../database/db");

// ── GET ALL PROJECTS ──────────────────────────────────────────────────
router.get("/", (req, res) => {
  db.all(
    `SELECT id, name, prompt, created_at, updated_at 
     FROM projects ORDER BY updated_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error("Fetch all error:", err.message);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json({ success: true, projects: rows });
    }
  );
});

// ── GET ONE PROJECT ───────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  db.get(
    `SELECT * FROM projects WHERE id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) {
        console.error("Fetch one error:", err.message);
        return res.status(500).json({ error: "Failed to fetch project" });
      }
      if (!row) return res.status(404).json({ error: "Project not found" });
      res.json({ success: true, project: row });
    }
  );
});

// ── RENAME PROJECT ────────────────────────────────────────────────────
router.put("/:id", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  db.run(
    `UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?`,
    [name.trim(), req.params.id],
    (err) => {
      if (err) {
        console.error("Rename error:", err.message);
        return res.status(500).json({ error: "Failed to rename project" });
      }
      res.json({ success: true });
    }
  );
});

// ── DELETE PROJECT ────────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  db.run(
    `DELETE FROM projects WHERE id = ?`,
    [req.params.id],
    (err) => {
      if (err) {
        console.error("Delete error:", err.message);
        return res.status(500).json({ error: "Failed to delete project" });
      }
      res.json({ success: true });
    }
  );
});

module.exports = router;