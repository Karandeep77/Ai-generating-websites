const express = require("express");
const router  = express.Router();
const { generateWebsite } = require("../services/claude");
const {
  classifyProjectMode,
  generateProjectArtifact,
} = require("../services/artifactGenerator");
const db = require("../database/db");
const { requireAuth } = require("../middleware/authMiddleware");

const PLAN_LIMITS = {
  free:    { websites: 2,      modifications: 5      },
  starter: { websites: 15,     modifications: 30     },
  pro:     { websites: 50,     modifications: 150    },
  agency:  { websites: 999999, modifications: 999999 },
};

router.post("/", requireAuth, async (req, res) => {
  const { prompt, existingCode, projectId } = req.body;
  const userId = req.user.id;
  const cleanPrompt = (prompt || "").trim();

  if (!cleanPrompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(500).json({ error: "User not found" });

    const existingProject = projectId
      ? await dbGet(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId])
      : null;
    if (projectId && !existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    const existingFiles = existingProject
      ? await dbAll(`SELECT path, file_type, content FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY id ASC`, [projectId, userId])
      : [];
    const existingArtifact = existingProject ? projectToArtifact(existingProject, existingFiles) : null;
    const mode = classifyProjectMode(cleanPrompt, existingArtifact);

    await enforcePlanLimits(user, userId, Boolean(existingProject));

    let result;
    if (mode === "frontend_only") {
      result = await generateFrontendOnly(cleanPrompt, existingProject, existingCode);
    } else {
      result = await generateBackendCapable(cleanPrompt, existingArtifact);
    }

    let savedProjectId = projectId;
    if (existingProject) {
      await updateProject(savedProjectId, userId, cleanPrompt, result);
    } else {
      savedProjectId = await insertProject(userId, cleanPrompt, result);
    }

    await replaceProjectFiles(savedProjectId, userId, result.files);
    await saveProjectMessages(savedProjectId, userId, cleanPrompt, result.explanation);
    await incrementUsage(user, userId, Boolean(existingProject));

    res.json({
      success: true,
      projectId: savedProjectId,
      html: result.html,
      mode: result.mode,
      summary: result.summary,
      files: publicFiles(result.files),
      apiSpec: result.apiSpec,
      integrationChecks: result.integrationChecks,
      explanation: result.explanation,
    });
  } catch (error) {
    console.error("=== GENERATION ERROR ===");
    console.error(error.message);
    if (error.status === 403) {
      return res.status(403).json({
        error: "limit_reached",
        message: error.publicMessage || error.message,
      });
    }
    res.status(error.status || 500).json({
      error: error.publicMessage || "Failed to generate project. Please try again.",
      details: error.message,
    });
  }
});

async function generateFrontendOnly(prompt, existingProject, existingCode) {
  const currentHtml = existingProject?.html || existingCode || null;
  const generated = await generateWebsite(prompt, currentHtml);
  const html = String(generated.html || "");
  return {
    mode: "frontend_only",
    summary: "Frontend website",
    html,
    files: [{ path: "frontend/index.html", file_type: "frontend", content: html }],
    apiSpec: [],
    integrationChecks: [],
    explanation: generated.explanation || "Website generated.",
  };
}

async function generateBackendCapable(prompt, existingArtifact) {
  const artifact = await generateProjectArtifact(prompt, existingArtifact);
  const files = [
    ...artifact.frontendFiles.map(file => ({ ...file, file_type: "frontend" })),
    ...artifact.backendFiles.map(file => ({ ...file, file_type: "backend" })),
  ];
  const html = artifact.mode === "backend_only"
    ? backendSummaryHtml(artifact)
    : artifact.frontendHtml || backendSummaryHtml(artifact);

  return {
    mode: artifact.mode,
    summary: artifact.summary,
    html,
    files,
    apiSpec: artifact.apiSpec,
    integrationChecks: artifact.integrationChecks,
    explanation: artifact.explanation,
  };
}

function backendSummaryHtml(artifact) {
  const endpoints = artifact.apiSpec
    .map(endpoint => `<li><strong>${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.path)}</strong> - ${escapeHtml(endpoint.purpose || "API endpoint")}</li>`)
    .join("");
  const files = [...artifact.backendFiles, ...artifact.frontendFiles]
    .map(file => `<li>${escapeHtml(file.path)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(artifact.summary)}</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#eef7ff;color:#111827}
    main{max-width:900px;margin:0 auto;padding:48px 24px}
    section{background:#fff;border:1px solid #dbeafe;border-radius:10px;padding:22px;margin:18px 0;box-shadow:0 12px 35px rgba(15,23,42,.08)}
    h1{margin:0 0 10px;color:#1d4ed8} li{margin:8px 0;line-height:1.5}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(artifact.mode === "backend_only" ? "Backend project generated" : "Full-stack project generated")}</h1>
    <p>${escapeHtml(artifact.summary)}</p>
    <section><h2>API endpoints</h2><ul>${endpoints || "<li>No endpoints listed.</li>"}</ul></section>
    <section><h2>Generated files</h2><ul>${files || "<li>No files listed.</li>"}</ul></section>
  </main>
</body>
</html>`;
}

async function enforcePlanLimits(user, userId, isModification) {
  if (user.role === "admin") return;

  const plan = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  await resetUsageIfNeeded(user, userId);

  if (!isModification && (user.websites_used || 0) >= plan.websites) {
    const err = new Error(`You've used all ${plan.websites} website generations this month.`);
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
  if (isModification && (user.modifications_used || 0) >= plan.modifications) {
    const err = new Error(`You've used all ${plan.modifications} modifications this month.`);
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
}

async function resetUsageIfNeeded(user, userId) {
  const now = new Date();
  const resetAt = user.usage_reset_at ? new Date(user.usage_reset_at) : new Date(0);
  if (now < resetAt) return;

  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  await dbRun(
    `UPDATE users SET websites_used = 0, modifications_used = 0, usage_reset_at = ? WHERE id = ?`,
    [nextReset, userId],
  );
  user.websites_used = 0;
  user.modifications_used = 0;
}

async function incrementUsage(user, userId, isModification) {
  if (user.role === "admin") return;
  if (isModification) {
    await dbRun(`UPDATE users SET modifications_used = COALESCE(modifications_used, 0) + 1 WHERE id = ?`, [userId]);
  } else {
    await dbRun(`UPDATE users SET websites_used = COALESCE(websites_used, 0) + 1 WHERE id = ?`, [userId]);
  }
}

async function insertProject(userId, prompt, result) {
  const name = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
  const run = await dbRun(
    `INSERT INTO projects (user_id, name, prompt, html, mode, summary, api_spec, integration_checks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, name, prompt, result.html, result.mode, result.summary, JSON.stringify(result.apiSpec), JSON.stringify(result.integrationChecks)],
  );
  return run.lastID;
}

async function updateProject(projectId, userId, prompt, result) {
  await dbRun(
    `UPDATE projects
     SET html = ?, prompt = ?, mode = ?, summary = ?, api_spec = ?, integration_checks = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [result.html, prompt, result.mode, result.summary, JSON.stringify(result.apiSpec), JSON.stringify(result.integrationChecks), projectId, userId],
  );
}

async function replaceProjectFiles(projectId, userId, files) {
  await dbRun(`DELETE FROM project_files WHERE project_id = ? AND user_id = ?`, [projectId, userId]);
  for (const file of files) {
    await dbRun(
      `INSERT INTO project_files (project_id, user_id, path, file_type, content)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, userId, file.path, file.file_type, file.content],
    );
  }
}

async function saveProjectMessages(projectId, userId, prompt, explanation) {
  const messages = [
    ["user", prompt],
    ["assistant", explanation],
  ];
  for (const [role, content] of messages) {
    await dbRun(
      `INSERT INTO project_messages (project_id, user_id, role, content)
       VALUES (?, ?, ?, ?)`,
      [projectId, userId, role, content],
    );
  }
}

function projectToArtifact(project, files) {
  const mode = project.mode || "frontend_only";
  return {
    mode,
    summary: project.summary || "",
    html: project.html || "",
    apiSpec: parseJson(project.api_spec, []),
    integrationChecks: parseJson(project.integration_checks, []),
    files,
    frontendFiles: files.filter(file => file.file_type === "frontend"),
    backendFiles: files.filter(file => file.file_type === "backend"),
  };
}

function publicFiles(files) {
  return files.map(file => ({
    path: file.path,
    file_type: file.file_type,
    size: Buffer.byteLength(file.content || "", "utf8"),
  }));
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function dbAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = router;
