// authMiddleware.js
// This runs BEFORE any protected route
// If token is missing or invalid → request is blocked

const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

// Standard auth — any logged in user can pass
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Login required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;  // attach user info to request
    next();              // let the request continue
  } catch {
    return res.status(401).json({ error: "Invalid or expired token. Please login again." });
  }
}

// Admin only — blocks normal users
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };