// deploy.js — fixed version with proper HTML encoding

const express         = require("express");
const router          = express.Router();
const https           = require("https");
const JSZip           = require("jszip");
const db              = require("../database/db");
const { requireAuth } = require("../middleware/authMiddleware");

const DEPLOY_LIMITS = {
  free:    1,
  starter: 10,
  pro:     999999,
  agency:  999999,
};

// ── GET DEPLOYMENTS ───────────────────────────────────────────────────
router.get("/", requireAuth, (req, res) => {
  db.all(
    `SELECT * FROM deployments WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch deployments" });
      res.json({ success: true, deployments: rows || [] });
    }
  );
});

// ── DEPLOY ────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { projectId } = req.body;
  const userId        = req.user.id;

  if (!projectId) return res.status(400).json({ error: "Project ID is required" });
  if (!process.env.NETLIFY_TOKEN) return res.status(500).json({ error: "NETLIFY_TOKEN not set in .env" });

  db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
    if (err || !user) return res.status(500).json({ error: "User not found" });

    if (user.role !== "admin") {
      const limit = DEPLOY_LIMITS[user.plan] || DEPLOY_LIMITS.free;
      db.get(`SELECT COUNT(*) as count FROM deployments WHERE user_id = ?`, [userId], async (err, row) => {
        if (err) return res.status(500).json({ error: "Failed to check limits" });
        if ((row.count || 0) >= limit) {
          return res.status(403).json({
            error:        "deploy_limit_reached",
            message:      `Your ${user.plan} plan allows ${limit === 1 ? "1 deployment" : limit + " deployments"}. Upgrade to deploy more.`,
            current_plan: user.plan,
          });
        }
        await doDeploy(res, userId, projectId);
      });
    } else {
      await doDeploy(res, userId, projectId);
    }
  });
});

// ── CORE DEPLOY LOGIC ─────────────────────────────────────────────────
async function doDeploy(res, userId, projectId) {
  try {
    // 1. Get project HTML from DB
    const project = await dbGet(
      `SELECT * FROM projects WHERE id = ? AND user_id = ?`,
      [projectId, userId]
    );
    if (!project) throw new Error("Project not found");

    console.log("Deploying:", project.name, "| HTML length:", project.html.length);

    // 2. Clean the HTML — fix any encoding issues
    // Convert to Buffer using UTF-8 to handle all special characters
    const htmlBuffer = Buffer.from(project.html, "utf8");

    // 3. Build ZIP
    const zip = new JSZip();
    zip.file("index.html", htmlBuffer);
    zip.file("_redirects", `/  /index.html  200\n/*  /index.html  200\n`);
    zip.file("_headers", `/index.html\n  Content-Type: text/html; charset=utf-8\n\n/*\n  X-Content-Type-Options: nosniff\n`);

    const zipBuffer = await zip.generateAsync({
      type:             "nodebuffer",
      compression:      "DEFLATE",
      compressionOptions: { level: 6 }
    });

    console.log("ZIP created:", zipBuffer.length, "bytes");

    // 4. Create Netlify site
    const siteName = `aibuilder-u${userId}-p${projectId}`;
    const site     = await netlifyJSON("POST", "/api/v1/sites", { name: siteName });

    if (!site.id) throw new Error(site.message || "Failed to create Netlify site");
    console.log("Site created:", site.id, "→", site.ssl_url);

    // 5. Upload ZIP
    const deploy = await netlifyZip(`/api/v1/sites/${site.id}/deploys`, zipBuffer);
    if (!deploy.id) throw new Error(deploy.message || "Failed to upload ZIP");
    console.log("Deploy started:", deploy.id, "state:", deploy.state);

    // 6. Poll until ready
    const finalUrl = await pollDeploy(deploy.id, site.ssl_url || site.url);
    console.log("Live at:", finalUrl);

    // 7. Save to DB
    db.run(
      `INSERT INTO deployments (user_id, project_id, project_name, url, site_name, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [userId, projectId, project.name, finalUrl, siteName]
    );
    db.run(`UPDATE projects SET deployed_url = ? WHERE id = ?`, [finalUrl, projectId]);

    res.json({ success: true, url: finalUrl, message: "Website deployed successfully!" });

  } catch (err) {
    console.error("Deploy error:", err.message);
    res.status(500).json({ error: "Deployment failed: " + err.message });
  }
}

// ── NETLIFY: JSON request ─────────────────────────────────────────────
function netlifyJSON(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.netlify.com", path, method,
      headers: {
        "Authorization": `Bearer ${process.env.NETLIFY_TOKEN}`,
        "Content-Type":  "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error("Netlify JSON parse error: " + d.substring(0, 200))); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── NETLIFY: ZIP upload ───────────────────────────────────────────────
function netlifyZip(path, zipBuffer) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.netlify.com", path, method: "POST",
      headers: {
        "Authorization":  `Bearer ${process.env.NETLIFY_TOKEN}`,
        "Content-Type":   "application/zip",
        "Content-Length": zipBuffer.length,
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        console.log("ZIP upload status:", res.statusCode);
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error("ZIP upload parse error: " + d.substring(0, 200))); }
      });
    });
    req.on("error", reject);
    req.write(zipBuffer);
    req.end();
  });
}

// ── POLL UNTIL DEPLOY READY ───────────────────────────────────────────
async function pollDeploy(deployId, fallbackUrl) {
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    try {
      const d = await netlifyJSON("GET", `/api/v1/deploys/${deployId}`);
      console.log(`Poll ${i + 1}: state=${d.state}`);
      if (d.state === "ready") return d.ssl_url || d.url || fallbackUrl;
      if (d.state === "error") throw new Error("Deploy error: " + (d.error_message || "unknown"));
    } catch (e) {
      console.warn("Poll error:", e.message);
    }
  }
  return fallbackUrl;
}

// ── HELPERS ───────────────────────────────────────────────────────────
function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── DELETE ────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, (req, res) => {
  db.run(
    `DELETE FROM deployments WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to delete" });
      res.json({ success: true });
    }
  );
});

module.exports = router;
