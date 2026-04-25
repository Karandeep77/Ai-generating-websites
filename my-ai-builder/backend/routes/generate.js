const express = require("express");
const router  = express.Router();
const { generateWebsite }  = require("../services/claude");
const db                   = require("../database/db");
const { requireAuth }      = require("../middleware/authMiddleware");

router.post("/", requireAuth, async (req, res) => {
  const { prompt, existingCode, projectId } = req.body;
  const userId = req.user.id;  // comes from JWT token via middleware

  console.log("Generate request — user:", userId, "| prompt:", prompt?.substring(0, 50));

  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const result = await generateWebsite(prompt, existingCode || null);
    const htmlToSave = String(result.html);
    console.log("HTML generated, length:", htmlToSave.length);

    if (projectId) {
      // ── UPDATE existing project ───────────────────────────────────
      // Only update if this project belongs to this user
      db.run(
        `UPDATE projects 
         SET html = ?, prompt = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
        [htmlToSave, prompt, projectId, userId],
        function(err) {
          if (err) {
            console.error("Update error:", err.message);
            return res.status(500).json({ error: "Failed to update project", details: err.message });
          }
          console.log("Project updated, id:", projectId);
          return res.json({
            success:     true,
            html:        htmlToSave,
            explanation: result.explanation || "Website updated.",
            projectId:   projectId,
          });
        }
      );

    } else {
      // ── INSERT new project ────────────────────────────────────────
      const projectName = prompt.length > 40
        ? prompt.substring(0, 40) + "..."
        : prompt;

      console.log("Inserting project — user_id:", userId, "| name:", projectName);

      db.run(
        `INSERT INTO projects (user_id, name, prompt, html)
         VALUES (?, ?, ?, ?)`,
        [userId, projectName, prompt, htmlToSave],
        function(err) {
          if (err) {
            console.error("Insert error:", err.message);
            return res.status(500).json({ error: "Failed to save project", details: err.message });
          }
          console.log("Project saved, id:", this.lastID);
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

module.exports = router;