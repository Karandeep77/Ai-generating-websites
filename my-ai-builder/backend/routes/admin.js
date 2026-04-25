// admin.js — admin only endpoints

const express = require("express");
const router  = express.Router();
const db      = require("../database/db");
const { requireAdmin } = require("../middleware/authMiddleware");

// All routes here require admin role
router.use(requireAdmin);

// ── GET ALL USERS ─────────────────────────────────────────────────────
router.get("/users", (req, res) => {
  db.all(
    `SELECT id, name, email, role, created_at,
     (SELECT COUNT(*) FROM projects WHERE user_id = users.id) as project_count
     FROM users ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch users" });
      res.json({ success: true, users: rows });
    }
  );
});

// ── GET ALL PROJECTS (all users) ──────────────────────────────────────
router.get("/projects", (req, res) => {
  db.all(
    `SELECT p.id, p.name, p.prompt, p.created_at, p.updated_at,
            u.email as user_email
     FROM projects p
     LEFT JOIN users u ON p.user_id = u.id
     ORDER BY p.updated_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch projects" });
      res.json({ success: true, projects: rows });
    }
  );
});

// ── USAGE STATS ───────────────────────────────────────────────────────
router.get("/stats", (req, res) => {
  db.get(`SELECT COUNT(*) as total_users FROM users`,    [], (err, users) => {
  db.get(`SELECT COUNT(*) as total_projects FROM projects`, [], (err2, projects) => {
  db.get(`SELECT COUNT(*) as today FROM projects WHERE date(created_at) = date('now')`, [], (err3, today) => {
    res.json({
      success:        true,
      total_users:    users.total_users,
      total_projects: projects.total_projects,
      generated_today: today.today,
    });
  });});});
});

// ── DELETE ANY USER'S PROJECT ─────────────────────────────────────────
router.delete("/projects/:id", (req, res) => {
  db.run(`DELETE FROM projects WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ success: true });
  });
});

// ── DELETE A USER ─────────────────────────────────────────────────────
router.delete("/users/:id", (req, res) => {
  // Prevent deleting yourself
  if (req.user.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  db.run(`DELETE FROM users WHERE id = ?`,    [req.params.id], () => {});
  db.run(`DELETE FROM projects WHERE user_id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ success: true });
  });
});

module.exports = router;