Plan

Plan: Extend AI Website Builder To Generate Backend And Full-Stack Projects
Summary
Create a new Markdown planning file, recommended name BACKEND_GENERATION_PLAN.md, that explains how to evolve the current frontend-only generator into a prompt-driven frontend/backend/full-stack generator.

Best approach: use a structured multi-step generation pipeline rather than asking the AI for one big code blob. The system should first classify the user request, then generate a project blueprint, then generate typed files, then validate API/frontend compatibility. This is more accurate and more money-friendly because it avoids repeated failed generations and keeps backend output predictable.

Architecture Options Considered
Single LLM call that returns frontend + backend code

Simple to add, but low accuracy for full-stack projects.
High risk of mismatched API routes, broken auth, missing database schema, and malformed JSON.
Not recommended.
Agentic AI that freely creates files and fixes itself

Powerful, but expensive and harder to control.
Better for future advanced project generation, not the first backend-generation version.
Useful later for ZIP export, deployment, and automated repair loops.
Wrangler / Cloudflare Workers backend generation

Good future deployment target, especially with Workers + D1.
Wrangler has strong local development and D1 support, but it adds platform-specific complexity now.
Not best for the first version because the current app is already Node/Express/SQLite.
Recommended: structured planner + template-based Node/Express backend generation

Best fit for current codebase.
Reuses the existing Node/Express/SQLite stack.
Cheaper than full agentic workflows.
More accurate because the AI outputs a strict project specification first, then code is generated around known templates.
Recommended Implementation
Add a generation pipeline with three phases:

Intent classification: decide frontend_only, backend_only, or full_stack.
Project blueprint: produce structured JSON containing entities, database tables, API endpoints, auth needs, frontend pages, and integration requirements.
Code generation: generate project files from the blueprint.
Replace the current { html, explanation }-only AI contract with a structured artifact contract:

mode
summary
frontendFiles
backendFiles
databaseSchema
apiSpec
integrationChecks
explanation
Keep the current frontend-only flow working:

Existing prompts can still produce a single previewable HTML file.
New backend/full-stack prompts create richer project artifacts.
Store generated projects as multi-file artifacts instead of only projects.html:

Add a project_files table with project_id, path, file_type, and content.
Keep projects.html temporarily for backward compatibility with old projects.
Backend generation should initially target:

Node.js
Express
SQLite
JWT authentication when needed
REST APIs
.env.example
package.json
database schema/init file
clear route files such as products, auth, orders, users
Full-stack generation should enforce API compatibility:

Frontend must call only endpoints listed in the generated API spec.
Backend must implement every endpoint the frontend uses.
Request/response shapes must match.
Auth-protected routes must be marked consistently in frontend and backend.
Backend-only generation should produce:

Backend source files
API documentation
Database schema
Example requests
No frontend preview requirement.
Full-stack preview should remain frontend-first for now:

Show generated frontend preview as today.
For backend/full-stack projects, display generated API summary and validation status.
Do not execute untrusted generated backend code inside the main production server.
Validation Strategy
Add a lightweight validation step after generation:

Parse the structured JSON response.
Verify required files exist for the selected mode.
Verify frontend API calls match generated backend routes.
Verify backend route files include required methods and paths.
Verify database tables exist for generated entities.
Fail gracefully with a retry/repair prompt if validation fails.
Use structured outputs where possible for the AI response to reduce malformed JSON.

Keep generation deterministic by using templates for common backend pieces:

Express app setup
Auth middleware
SQLite connection
CRUD route pattern
Error response pattern
Money-Friendly Model Strategy
Use one smaller/cheaper classification call first.
Use one main generation call only after the mode and blueprint are clear.
Avoid full autonomous agent loops in v1.
Add a repair call only when validation fails.
Cache project blueprints and previous generated files so modifications do not regenerate everything.
Future Enhancements
ZIP download for generated multi-file projects.
One-click deployment:
Frontend-only: Netlify, already close to current behavior.
Full-stack Node/Express: Render or Railway.
Serverless backend: Cloudflare Workers + D1 using Wrangler.
Test generation:
API smoke tests
Example seed data
Generated README per project
Sandboxed backend execution for live testing.
Test Cases
Prompt: Create an e-commerce website selling mobiles and laptops

Expected mode: full_stack
Generates product schema, product APIs, auth APIs, frontend product listing, login/signup, and matching API calls.
Prompt: Create only backend APIs for a todo app with login

Expected mode: backend_only
Generates Express backend, SQLite schema, auth, todo CRUD APIs, and no frontend files.
Prompt: Create a portfolio website for a designer

Expected mode: frontend_only
Existing frontend preview behavior still works.
Prompt: Add cart and checkout to this e-commerce project

Expected behavior: modifies existing full-stack project, updates frontend and backend consistently.
Assumptions
The first backend-generation version should use Node/Express/SQLite because it matches the current app.
Wrangler/Cloudflare Workers should be treated as a future deployment target, not the default v1 backend generator.
Generated backend code should be stored and downloadable later, but not executed directly inside the main app for safety.
The current UI can remain prompt-driven, with mode detection handled by the backend.
