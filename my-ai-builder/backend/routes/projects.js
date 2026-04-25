const express = require("express");
const router  = express.Router();
const db      = require("../database/db");
const { requireAuth } = require("../middleware/authMiddleware");

// Protect all project routes
router.use(requireAuth);

// ── GET ALL PROJECTS for logged in user ───────────────────────────────
router.get("/", (req, res) => {
  db.all(
    `SELECT id, name, prompt, created_at, updated_at
     FROM projects
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error("Fetch projects error:", err.message);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json({ success: true, projects: rows || [] });
    }
  );
});

// ── GET ONE PROJECT ───────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  db.get(
    `SELECT * FROM projects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id],
    (err, row) => {
      if (err)  return res.status(500).json({ error: "Failed to fetch project" });
      if (!row) return res.status(404).json({ error: "Project not found" });
      res.json({ success: true, project: row });
    }
  );
});

// ── RENAME PROJECT ────────────────────────────────────────────────────
router.put("/:id", (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

  db.run(
    `UPDATE projects SET name = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [name.trim(), req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to rename" });
      res.json({ success: true });
    }
  );
});

// ── DELETE PROJECT ────────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  db.run(
    `DELETE FROM projects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to delete" });
      res.json({ success: true });
    }
  );
});

module.exports = router;