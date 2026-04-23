const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not found in .env file!");
  process.exit(1);
}

const generateRoute = require("./routes/generate");
const projectsRoute = require("./routes/projects");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// API routes
app.use("/api/generate", generateRoute);
app.use("/api/projects", projectsRoute);

// ── THIS IS THE FIX: Express 5 uses (req, res) directly, no wildcard ──
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ Open in browser: http://localhost:${PORT}`);
  console.log(`✓ API Key: ${process.env.ANTHROPIC_API_KEY.substring(0, 15)}...`);
});