# Backend And Full-Stack Generation Plan

## Goal

Extend the current AI Website Builder from frontend-only generation into a prompt-driven system that can generate:

- Frontend-only projects
- Backend-only projects
- Full-stack projects with frontend and backend integration

The recommended v1 approach is a structured generation pipeline, not a fully autonomous agent. This keeps cost lower and improves accuracy because the system classifies the prompt, asks for a typed artifact, validates it, and stores files in a predictable format.

## Options Considered

### Single LLM Call For Everything

This is the simplest option, but it is fragile. A single response containing frontend, backend, database code, API docs, and integration logic is more likely to produce malformed JSON, missing files, mismatched routes, or incompatible request/response shapes.

Not recommended for v1.

### Fully Agentic Code Generation

An agent could generate files, run tests, inspect failures, and repair code. This can produce strong results, but it is more expensive, slower, and harder to control safely. It also requires sandboxed execution before generated backend code can be tested or deployed.

Recommended later, not as the first implementation.

### Wrangler / Cloudflare Workers

Wrangler is a good future deployment path for serverless projects using Cloudflare Workers and D1. It is not the best v1 target because the current application already uses Node.js, Express, and SQLite.

Recommended as a future deployment target.

### Recommended V1: Structured Pipeline + Node/Express/SQLite

The best first implementation is:

1. Classify prompt intent.
2. Generate a structured project artifact.
3. Validate frontend/backend/API compatibility.
4. Store generated files and metadata.
5. Show frontend preview or backend/API summary in the UI.

This is accurate enough for v1, cheaper than agent loops, and fits the current codebase.

## Implemented V1 Architecture

### Classification

Prompt mode is classified as:

- `frontend_only`
- `backend_only`
- `full_stack`

The classifier is local and keyword-based for cost efficiency. Frontend-only prompts continue using the existing website generator. Backend-only and full-stack prompts use the structured artifact generator.

### Structured Artifact Contract

Backend-capable generation returns:

```json
{
  "mode": "backend_only",
  "summary": "Project summary",
  "frontendFiles": [],
  "backendFiles": [],
  "databaseSchema": [],
  "apiSpec": [],
  "integrationChecks": [],
  "explanation": "Short explanation"
}
```

### Backend Target Stack

Generated backend projects target:

- Node.js
- Express
- SQLite
- JWT auth when needed
- bcryptjs for password hashing
- REST APIs
- `.env.example`
- minimal dependencies

### Storage

The existing `projects.html` column remains for backward compatibility and preview.

Generated multi-file artifacts are stored in `project_files`:

- `project_id`
- `user_id`
- `path`
- `file_type`
- `content`

Project metadata also stores:

- mode
- summary
- API spec JSON
- integration checks JSON

### Validation

The artifact validator checks:

- Required frontend/backend files exist for the selected mode.
- Backend-capable projects include an API spec.
- API endpoints appear to be implemented in generated backend files.
- Frontend fetch calls are listed in the API spec.

If a generated artifact fails critical validation, the system asks the model for one repair response.

## Current Limitations

- Generated backend code is stored but not executed inside the main app.
- Full-stack deployment is intentionally disabled for now.
- Frontend-only deployment still uses the existing Netlify flow.
- ZIP download is planned for a future iteration.
- Validation is static and lightweight; it does not run generated backend code.

## Future Enhancements

- ZIP download for generated project files.
- Sandboxed generated backend execution.
- Full-stack deployment to Render or Railway.
- Serverless deployment using Cloudflare Workers, D1, and Wrangler.
- Generated API tests and seed data.
- Stronger integration validation with generated smoke tests.
