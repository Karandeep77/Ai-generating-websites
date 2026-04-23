// generate.js - safe HTML storage

const express = require("express");
const router  = express.Router();
const { generateWebsite } = require("../services/claude");
const db = require("../database/db");

router.post("/", async (req, res) => {
  const { prompt, existingCode, projectId } = req.body;

  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    console.log("Generating for prompt:", prompt.substring(0, 60));

    const result = await generateWebsite(prompt, existingCode || null);

    // Verify html is a proper string before saving
    const htmlToSave = String(result.html);
    console.log("HTML to save, length:", htmlToSave.length);

    if (projectId) {
      // Update existing
      db.run(
        `UPDATE projects SET html = ?, prompt = ?, updated_at = datetime('now') WHERE id = ?`,
        [htmlToSave, prompt, projectId],
        function(err) {
          if (err) {
            console.error("Update error:", err.message);
            return res.status(500).json({ error: "Failed to update project" });
          }
          console.log("Project updated, id:", projectId);
          res.json({
            success:     true,
            html:        htmlToSave,
            explanation: result.explanation || "Website updated.",
            projectId:   projectId,
          });
        }
      );

    } else {
      // Insert new
      const projectName = prompt.length > 40
        ? prompt.substring(0, 40) + "..."
        : prompt;

      db.run(
        `INSERT INTO projects (name, prompt, html) VALUES (?, ?, ?)`,
        [projectName, prompt, htmlToSave],
        function(err) {
          if (err) {
            console.error("Insert error:", err.message);
            return res.status(500).json({ error: "Failed to save project" });
          }
          console.log("New project saved, id:", this.lastID);
          res.json({
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