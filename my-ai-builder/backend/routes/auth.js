// auth.js — handles register and login

const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const db      = require("../database/db");

const JWT_SECRET = process.env.JWT_SECRET;

// ── REGISTER ──────────────────────────────────────────────────────────
// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Hash the password — NEVER store plain text passwords
    // 10 = salt rounds (how complex the hash is)
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO users (email, password, role) VALUES (?, ?, 'user')`,
      [email.toLowerCase().trim(), hashedPassword],
      function(err) {
        if (err) {
          // UNIQUE constraint means email already exists
          if (err.message.includes("UNIQUE")) {
            return res.status(400).json({ error: "Email already registered" });
          }
          return res.status(500).json({ error: "Registration failed" });
        }

        // Create JWT token immediately after register (auto login)
        const token = jwt.sign(
          { id: this.lastID, email, role: "user" },
          JWT_SECRET,
          { expiresIn: "7d" }   // token valid for 7 days
        );

        console.log("New user registered:", email);
        res.json({ success: true, token, role: "user", email });
      }
    );
  } catch (err) {
    res.status(500).json({ error: "Server error during registration" });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  db.get(
    `SELECT * FROM users WHERE email = ?`,
    [email.toLowerCase().trim()],
    async (err, user) => {
      if (err)   return res.status(500).json({ error: "Server error" });
      if (!user) return res.status(401).json({ error: "Invalid email or password" });

      // Compare entered password with hashed password in database
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Generate JWT token — contains user id, email and role
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      console.log("User logged in:", user.email, "| Role:", user.role);
      res.json({
        success: true,
        token,
        role:    user.role,
        email:   user.email,
        name:    user.name || user.email.split("@")[0],
      });
    }
  );
});

// ── GET CURRENT USER INFO ─────────────────────────────────────────────
// GET /api/auth/me  (used on page load to verify token is still valid)
router.get("/me", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;