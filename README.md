# AI Website Builder

A prompt-driven SaaS web application for generating, editing, previewing, managing, and deploying complete websites with AI.

The app works like a ChatGPT-style website builder: users create projects by typing natural language prompts, continue modifying existing projects through conversation, preview the generated website live, and deploy finished projects.

## Features

- Prompt-based website generation using Anthropic Claude
- ChatGPT-like project workspace
- Project session sidebar with saved user projects
- Natural-language website modification without exposing create/edit modes
- Live website preview with no visible code/source view in the UI
- User registration and JWT login
- Per-user project storage with SQLite
- Project conversation history
- Deploy generated websites to Netlify
- Subscription/usage plans with Razorpay payment hooks
- Admin dashboard for users, projects, and usage stats
- Render deployment configuration included

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Database: SQLite
- AI: Anthropic Claude API
- Deployment provider: Netlify API
- Payments: Razorpay
- Hosting config: Render

## Project Structure

```text
.
+-- server.js                         # Root launcher for backend server
+-- render.yaml                       # Render deployment config
+-- my-ai-builder/
    +-- backend/
    |   +-- server.js                 # Express app entry point
    |   +-- database/db.js            # SQLite setup and migrations
    |   +-- routes/                   # Auth, projects, generate, deploy, admin, payments
    |   +-- services/claude.js        # AI website generation service
    |   +-- package.json
    |   +-- .env                      # Local environment variables, not committed
    +-- frontend/
        +-- index.html                # Landing/login page
        +-- builder.html              # Main prompt-driven builder UI
        +-- app.js                    # Builder behavior
        +-- admin.html                # Admin dashboard
        +-- pricing.html              # Plans and payments page
```

## Requirements

- Node.js 18+
- npm
- Anthropic API key
- Optional: Netlify token for deploys
- Optional: Razorpay keys for paid plans

## Environment Variables

Create this file:

```text
my-ai-builder/backend/.env
```

Use this template:

```env
PORT=3000
NODE_ENV=development

ANTHROPIC_API_KEY=your_anthropic_api_key
JWT_SECRET=replace_with_a_long_random_secret

NETLIFY_TOKEN=your_netlify_token_optional

RAZORPAY_KEY_ID=your_razorpay_key_id_optional
RAZORPAY_KEY_SECRET=your_razorpay_key_secret_optional

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_this_password

# Optional production SQLite path
# SQLITE_DB_PATH=/data/projects.db
```

Important: never commit `.env`, API keys, database files, or tokens to GitHub.

## Installation

Install backend dependencies:

```bash
cd my-ai-builder/backend
npm install
```

## Run Locally

From the repository root:

```bash
node server.js
```

Or from the backend folder:

```bash
cd my-ai-builder/backend
npm start
```

Then open:

```text
http://localhost:3000
```

Main builder:

```text
http://localhost:3000/builder.html
```

Admin dashboard:

```text
http://localhost:3000/admin.html
```

## How It Works

1. A user creates an account or signs in.
2. The user opens the builder and types a prompt such as:

```text
Create a modern portfolio website for a product designer with case studies and a contact section.
```

3. The backend sends the prompt to Claude.
4. Claude returns a complete single-file website.
5. The app saves the project in SQLite and shows a live preview.
6. The user can continue typing prompts to modify the same project.
7. The Deploy button publishes the project to Netlify if `NETLIFY_TOKEN` is configured.

## Notes About Deployment

This project includes `render.yaml` for Render hosting.

For Render:

- Use the root `render.yaml`.
- Set all required environment variables in the Render dashboard.
- `ANTHROPIC_API_KEY` and `JWT_SECRET` are required.
- `NETLIFY_TOKEN` is required only for deployment features.
- Attach a persistent disk at `/data` if you want SQLite data to survive restarts/redeploys.

Recommended production DB variable:

```env
SQLITE_DB_PATH=/data/projects.db
```

If no writable `/data` disk is available, the app can fall back to a temporary SQLite path, but data may reset when the service restarts.

## Plans And Limits

The app has plan-based usage limits:

| Plan | Websites | Modifications |
| --- | ---: | ---: |
| Free | 2 | 5 |
| Starter | 15 | 30 |
| Pro | 50 | 150 |
| Agency/Admin | Unlimited | Unlimited |

Razorpay integration is included for paid plan upgrades, but payments are disabled automatically if Razorpay keys are not configured.

## Deployments

Generated websites are deployed through the Netlify API.

To enable deployments:

1. Create a Netlify personal access token.
2. Add it to `.env` or Render environment variables:

```env
NETLIFY_TOKEN=your_netlify_token
```

Without this token, the app still runs, but deploy requests will fail with a configuration message.

## Common Commands

```bash
# Check backend syntax
cd my-ai-builder
node --check backend/server.js
node --check backend/routes/generate.js
node --check backend/routes/projects.js
node --check backend/database/db.js

# Check frontend JavaScript syntax
node --check frontend/app.js

# Start app from repo root
cd ../
node server.js
```

## Security Notes

- Keep `.env` private.
- Rotate any key that was accidentally committed or shared.
- Use a strong `JWT_SECRET`.
- Use a strong `ADMIN_PASSWORD`.
- Do not expose generated SQLite database files in public repositories.

## License

This project is currently private and marked `UNLICENSED`.
