const express = require("express");
const router  = express.Router();
const { generateWebsite }  = require("../services/claude");
const db                   = require("../database/db");
const { requireAuth }      = require("../middleware/authMiddleware");

// Plan limits — defined here so no circular dependency with payments.js
const PLAN_LIMITS = {
  free:    { websites: 2,      modifications: 5      },
  starter: { websites: 15,     modifications: 30     },
  pro:     { websites: 50,     modifications: 150    },
  agency:  { websites: 999999, modifications: 999999 },
};

router.post("/", requireAuth, async (req, res) => {
  const { prompt, existingCode, projectId } = req.body;
  const userId = req.user.id;

  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  // ── GET USER ──────────────────────────────────────────────────────
  db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: "User not found" });
    }

    // ── CHECK LIMITS (skip for admin) ─────────────────────────────
    if (user.role !== "admin") {
      const plan   = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
      const isNew  = !existingCode && !projectId;
      const isMod  = !!existingCode;

      // Safe reset check — only if column exists
      try {
        const now     = new Date();
        const resetAt = user.usage_reset_at ? new Date(user.usage_reset_at) : new Date(0);

        if (now >= resetAt) {
          const nextReset = new Date(
            now.getFullYear(), now.getMonth() + 1, 1
          ).toISOString();

          db.run(
            `UPDATE users SET websites_used = 0, modifications_used = 0,
             usage_reset_at = ? WHERE id = ?`,
            [nextReset, userId],
            () => {}
          );
          user.websites_used      = 0;
          user.modifications_used = 0;
        }
      } catch (e) {
        console.warn("Usage reset skipped:", e.message);
      }

      // Check website limit
      if (isNew && (user.websites_used || 0) >= plan.websites) {
        return res.status(403).json({
          error:        "limit_reached",
          message:      `You've used all ${plan.websites} website generations this month.`,
          limit_type:   "websites",
          current_plan: user.plan,
        });
      }

      // Check modification limit
      if (isMod && (user.modifications_used || 0) >= plan.modifications) {
        return res.status(403).json({
          error:        "limit_reached",
          message:      `You've used all ${plan.modifications} modifications this month.`,
          limit_type:   "modifications",
          current_plan: user.plan,
        });
      }
    }

    // ── GENERATE ──────────────────────────────────────────────────
    try {
      console.log("Generating — user:", userId, "| prompt:", prompt.substring(0, 50));

      const result     = await generateWebsite(prompt, existingCode || null);
      const htmlToSave = String(result.html);

      // Increment usage (safe — ignore if columns missing)
      if (user.role !== "admin") {
        if (!existingCode && !projectId) {
          db.run(
            `UPDATE users SET websites_used = COALESCE(websites_used, 0) + 1 WHERE id = ?`,
            [userId], () => {}
          );
        } else {
          db.run(
            `UPDATE users SET modifications_used = COALESCE(modifications_used, 0) + 1 WHERE id = ?`,
            [userId], () => {}
          );
        }
      }

      if (projectId) {
        db.run(
          `UPDATE projects SET html = ?, prompt = ?, updated_at = datetime('now')
           WHERE id = ? AND user_id = ?`,
          [htmlToSave, prompt, projectId, userId],
          function(err) {
            if (err) {
              console.error("Update error:", err.message);
              return res.status(500).json({ error: "Failed to update project" });
            }
            return res.json({
              success:     true,
              html:        htmlToSave,
              explanation: result.explanation || "Website updated.",
              projectId,
            });
          }
        );
      } else {
        const projectName = prompt.length > 40
          ? prompt.substring(0, 40) + "..."
          : prompt;

        db.run(
          `INSERT INTO projects (user_id, name, prompt, html) VALUES (?, ?, ?, ?)`,
          [userId, projectName, prompt, htmlToSave],
          function(err) {
            if (err) {
              console.error("Insert error:", err.message);
              return res.status(500).json({ error: "Failed to save project" });
            }
            return res.json({
              success:     true,
              html:        htmlToSave,
              explanation: result.explanation || "Website generated.",
              projectId:   this.lastID,
            });
          }
        );
      }

    } catch (error) {
      console.error("=== GENERATION ERROR ===");
      console.error(error.message);
      res.status(500).json({
        error:   "Failed to generate website. Please try again.",
        details: error.message,
      });
    }
  });
});

module.exports = router;