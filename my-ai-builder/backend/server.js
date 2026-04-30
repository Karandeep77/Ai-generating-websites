const express = require("express");
const cors    = require("cors");
const path    = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

if (!process.env.ANTHROPIC_API_KEY) { console.error("No API key!");    process.exit(1); }
if (!process.env.JWT_SECRET)        { console.error("No JWT_SECRET!"); process.exit(1); }
if (!process.env.NETLIFY_TOKEN)     { console.warn("No NETLIFY_TOKEN: deploy will be disabled until it is configured."); }

const generateRoute             = require("./routes/generate");
const projectsRoute             = require("./routes/projects");
const authRoute                 = require("./routes/auth");
const adminRoute                = require("./routes/admin");
const { router: paymentsRoute } = require("./routes/payments");
const deployRoute               = require("./routes/deploy");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

app.use("/api/auth",     authRoute);
app.use("/api/generate", generateRoute);
app.use("/api/projects", projectsRoute);
app.use("/api/admin",    adminRoute);
app.use("/api/payments", paymentsRoute);
app.use("/api/deploy",   deployRoute);

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ Render API: ${process.env.RENDER_API_KEY ? "configured ✓" : "NOT SET ✗"}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other server or set a different PORT in .env.`);
    process.exit(1);
  }
  console.error("Server failed to start:", err.message);
  process.exit(1);
});
