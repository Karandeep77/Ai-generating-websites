const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MODES = new Set(["frontend_only", "backend_only", "full_stack"]);

function classifyProjectMode(prompt, existingArtifact = null) {
  const text = String(prompt || "").toLowerCase();
  const existingMode = existingArtifact?.mode;

  if (/\b(frontend only|only frontend|static site|landing page|portfolio|brochure)\b/.test(text)) {
    return "frontend_only";
  }
  if (/\b(backend only|only backend|api only|server only|rest api|apis only)\b/.test(text)) {
    return "backend_only";
  }
  if (/\b(full stack|fullstack|frontend and backend|backend and frontend)\b/.test(text)) {
    return "full_stack";
  }
  if (existingMode === "backend_only" || existingMode === "full_stack") {
    return existingMode;
  }
  if (/\b(e-?commerce|store|shop|cart|checkout|order|orders|inventory|product management|login|signup|sign up|auth|database|dashboard|booking|marketplace|admin panel)\b/.test(text)) {
    return "full_stack";
  }
  if (/\b(api|backend|server|database|sqlite|jwt|crud|endpoint|endpoints)\b/.test(text)) {
    return "backend_only";
  }

  return "frontend_only";
}

async function generateProjectArtifact(prompt, existingArtifact = null) {
  const targetMode = classifyProjectMode(prompt, existingArtifact);
  const systemPrompt = buildSystemPrompt(targetMode);
  const userMessage = buildUserMessage(prompt, targetMode, existingArtifact);

  const first = await callClaude(systemPrompt, userMessage);
  let artifact = normalizeArtifact(parseJsonObject(first), targetMode);
  let validation = validateArtifact(artifact);

  if (!validation.valid) {
    const repairMessage = [
      userMessage,
      "",
      "The generated artifact failed validation.",
      "Validation errors:",
      validation.errors.map(err => `- ${err}`).join("\n"),
      "",
      "Return a corrected JSON artifact only.",
      JSON.stringify(artifact).slice(0, 20000),
    ].join("\n");

    const repaired = await callClaude(systemPrompt, repairMessage);
    artifact = normalizeArtifact(parseJsonObject(repaired), targetMode);
    validation = validateArtifact(artifact);
  }

  artifact.validation = validation;
  artifact.integrationChecks = [
    ...artifact.integrationChecks,
    ...validation.checks,
  ];

  return artifact;
}

function buildSystemPrompt(targetMode) {
  return `You generate production-minded project artifacts for a prompt-driven website builder.

Return ONLY valid JSON. No markdown fences, no prose outside JSON.

Required top-level shape:
{
  "mode": "frontend_only" | "backend_only" | "full_stack",
  "summary": "short project summary",
  "frontendFiles": [{"path":"frontend/index.html","content":"..."}],
  "backendFiles": [{"path":"backend/server.js","content":"..."}],
  "databaseSchema": [{"table":"products","columns":["id INTEGER PRIMARY KEY","name TEXT NOT NULL"]}],
  "apiSpec": [{"method":"GET","path":"/api/products","purpose":"List products","auth":false,"request":"none","response":"array of products"}],
  "integrationChecks": [{"name":"Products API","status":"pass","details":"Frontend fetches GET /api/products and backend implements it"}],
  "explanation": "one short sentence"
}

Target mode: ${targetMode}

Rules:
1. Use Node.js, Express, SQLite, and JWT when backend code is needed.
2. Backend code must be multi-file, not one giant file, with clear route files.
3. Include backend/package.json, backend/server.js, backend/database/db.js, backend/.env.example, and README.md when backend code is needed.
4. If auth is needed, include signup/login routes, bcryptjs password hashing, JWT signing, and auth middleware.
5. If frontend files are generated, frontend API calls must match apiSpec exactly.
6. If backend files are generated, every apiSpec endpoint must be implemented in backend code.
7. Backend-only mode must have no frontendFiles.
8. Full-stack mode must have both frontendFiles and backendFiles.
9. Frontend-only mode must have frontendFiles and no backendFiles.
10. Keep dependencies minimal: express, cors, dotenv, sqlite3, bcryptjs, jsonwebtoken.
11. Generated code must be plain text strings inside JSON values.
12. Do not include secrets. Use .env.example placeholders.`;
}

function buildUserMessage(prompt, targetMode, existingArtifact) {
  const parts = [
    `User prompt: ${prompt}`,
    `Classified mode: ${targetMode}`,
  ];

  if (existingArtifact) {
    parts.push("Existing project artifact summary:");
    parts.push(JSON.stringify({
      mode: existingArtifact.mode,
      summary: existingArtifact.summary,
      apiSpec: existingArtifact.apiSpec,
      files: existingArtifact.files?.map(file => ({ path: file.path, file_type: file.file_type })),
    }).slice(0, 20000));
    parts.push("Modify the existing project logically and return the complete updated artifact.");
  } else {
    parts.push("Create a new complete artifact.");
  }

  return parts.join("\n\n");
}

async function callClaude(system, userMessage) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 20000,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content[0].text.trim();
}

function parseJsonObject(rawText) {
  const cleaned = String(rawText || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in artifact response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeArtifact(raw, fallbackMode) {
  const mode = MODES.has(raw.mode) ? raw.mode : fallbackMode;
  const frontendFiles = normalizeFiles(raw.frontendFiles, "frontend");
  const backendFiles = normalizeFiles(raw.backendFiles, "backend");
  const databaseSchema = Array.isArray(raw.databaseSchema) ? raw.databaseSchema : [];
  const apiSpec = Array.isArray(raw.apiSpec) ? raw.apiSpec.map(normalizeEndpoint).filter(Boolean) : [];
  const integrationChecks = Array.isArray(raw.integrationChecks) ? raw.integrationChecks : [];

  return {
    mode,
    summary: String(raw.summary || "").trim() || defaultSummary(mode),
    frontendFiles,
    backendFiles,
    databaseSchema,
    apiSpec,
    integrationChecks,
    explanation: String(raw.explanation || "").trim() || defaultExplanation(mode),
    frontendHtml: pickFrontendHtml(frontendFiles),
  };
}

function normalizeFiles(files, defaultType) {
  if (!Array.isArray(files)) return [];
  return files
    .filter(file => file && file.path && typeof file.content === "string")
    .map(file => ({
      path: cleanPath(file.path),
      file_type: file.file_type || defaultType,
      content: file.content,
    }))
    .filter(file => file.path && !file.path.includes(".."));
}

function normalizeEndpoint(endpoint) {
  if (!endpoint || !endpoint.method || !endpoint.path) return null;
  return {
    method: String(endpoint.method).toUpperCase(),
    path: normalizeApiPath(endpoint.path),
    purpose: String(endpoint.purpose || ""),
    auth: Boolean(endpoint.auth),
    request: String(endpoint.request || "none"),
    response: String(endpoint.response || ""),
  };
}

function cleanPath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function normalizeApiPath(path) {
  const raw = String(path || "").trim();
  if (!raw) return raw;
  const apiIndex = raw.indexOf("/api/");
  if (apiIndex >= 0) return raw.slice(apiIndex);
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function pickFrontendHtml(frontendFiles) {
  const htmlFile = frontendFiles.find(file => /\.html?$/i.test(file.path));
  return htmlFile?.content || "";
}

function validateArtifact(artifact) {
  const errors = [];
  const checks = [];

  if (artifact.mode === "frontend_only" && artifact.frontendFiles.length === 0) {
    errors.push("Frontend-only artifact must include at least one frontend file.");
  }
  if (artifact.mode === "backend_only" && artifact.backendFiles.length === 0) {
    errors.push("Backend-only artifact must include backend files.");
  }
  if (artifact.mode === "backend_only" && artifact.frontendFiles.length > 0) {
    errors.push("Backend-only artifact must not include frontend files.");
  }
  if (artifact.mode === "full_stack") {
    if (artifact.frontendFiles.length === 0) errors.push("Full-stack artifact must include frontend files.");
    if (artifact.backendFiles.length === 0) errors.push("Full-stack artifact must include backend files.");
  }

  const implementedRoutes = collectImplementedRoutes(artifact.backendFiles);
  const apiRoutes = new Set(artifact.apiSpec.map(endpoint => `${endpoint.method} ${endpoint.path}`));

  for (const endpoint of artifact.apiSpec) {
    const key = `${endpoint.method} ${endpoint.path}`;
    const implemented = implementedRoutes.has(key) || implementedRoutes.has(`USE ${endpoint.path}`);
    checks.push({
      name: key,
      status: implemented || artifact.backendFiles.length === 0 ? "pass" : "warn",
      details: implemented ? "Backend route appears to be implemented." : "Could not confirm backend route from generated files.",
    });
  }

  const frontendCalls = collectFrontendApiCalls(artifact.frontendFiles);
  for (const call of frontendCalls) {
    const pathMatch = [...apiRoutes].some(key => key.endsWith(` ${call}`));
    checks.push({
      name: `Frontend call ${call}`,
      status: pathMatch ? "pass" : "warn",
      details: pathMatch ? "Frontend call is listed in apiSpec." : "Frontend call is not listed in apiSpec.",
    });
  }

  if ((artifact.mode === "backend_only" || artifact.mode === "full_stack") && artifact.apiSpec.length === 0) {
    errors.push("Backend-capable artifact must include apiSpec endpoints.");
  }

  return { valid: errors.length === 0, errors, checks };
}

function collectImplementedRoutes(files) {
  const routes = new Set();
  const methodRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  const useRegex = /(?:app|router)\.use\s*\(\s*["'`]([^"'`]+)["'`]/gi;

  for (const file of files) {
    let match;
    while ((match = methodRegex.exec(file.content))) {
      routes.add(`${match[1].toUpperCase()} ${normalizeApiPath(match[2])}`);
    }
    while ((match = useRegex.exec(file.content))) {
      routes.add(`USE ${normalizeApiPath(match[1])}`);
    }
  }
  return routes;
}

function collectFrontendApiCalls(files) {
  const calls = new Set();
  const fetchRegex = /fetch\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  for (const file of files) {
    let match;
    while ((match = fetchRegex.exec(file.content))) {
      const path = normalizeApiPath(match[1]);
      if (path.includes("/api/") || path.startsWith("/api")) calls.add(path);
    }
  }
  return [...calls];
}

function defaultSummary(mode) {
  if (mode === "backend_only") return "Generated backend API project.";
  if (mode === "full_stack") return "Generated integrated full-stack project.";
  return "Generated frontend project.";
}

function defaultExplanation(mode) {
  if (mode === "backend_only") return "Generated backend files, API specification, and database schema.";
  if (mode === "full_stack") return "Generated frontend and backend files with matching API integration.";
  return "Generated frontend website.";
}

module.exports = {
  classifyProjectMode,
  generateProjectArtifact,
  validateArtifact,
};
