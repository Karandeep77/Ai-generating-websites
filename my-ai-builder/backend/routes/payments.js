// payments.js — top section only, replace these lines

const express   = require("express");
const router    = express.Router();
const crypto    = require("crypto");
const db        = require("../database/db");
const { requireAuth } = require("../middleware/authMiddleware");

// Plan definitions
const PLANS = {
  free:    { name: "Free",    price: 0,    websites: 2,      modifications: 5      },
  starter: { name: "Starter", price: 199,  websites: 15,     modifications: 30     },
  pro:     { name: "Pro",     price: 499,  websites: 50,     modifications: 150    },
  agency:  { name: "Agency",  price: 2499, websites: 999999, modifications: 999999 },
};

// ── Initialize Razorpay safely ────────────────────────────────────────
// If keys are missing, payments won't work but server won't crash
let razorpay = null;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    const Razorpay = require("razorpay");
    razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("Razorpay initialized ✓");
  } else {
    console.warn("Razorpay keys missing — payments disabled");
  }
} catch (err) {
  console.error("Razorpay init failed:", err.message);
}

// ── GET CURRENT USER USAGE + PLAN ────────────────────────────────────
router.get("/usage", requireAuth, (req, res) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) return res.status(500).json({ error: "Failed" });

    // Check if usage needs monthly reset
    const now       = new Date();
    const resetAt   = new Date(user.usage_reset_at);
    const needReset = now >= resetAt;

    if (needReset) {
      // Reset usage counters for new month
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      db.run(
        `UPDATE users SET websites_used = 0, modifications_used = 0, usage_reset_at = ? WHERE id = ?`,
        [nextReset, user.id],
        () => {
          user.websites_used      = 0;
          user.modifications_used = 0;
        }
      );
    }

    // Check if paid plan has expired
    if (user.plan !== "free" && user.plan_expires_at) {
      const expired = new Date() > new Date(user.plan_expires_at);
      if (expired) {
        db.run(`UPDATE users SET plan = 'free' WHERE id = ?`, [user.id]);
        user.plan = "free";
      }
    }

    const plan   = PLANS[user.plan] || PLANS.free;
    const isAdmin = user.role === "admin";

    res.json({
      success: true,
      plan:    user.plan,
      role:    user.role,
      limits: {
        websites:      isAdmin ? 999999 : plan.websites,
        modifications: isAdmin ? 999999 : plan.modifications,
      },
      used: {
        websites:      user.websites_used      || 0,
        modifications: user.modifications_used || 0,
      },
      plan_expires_at: user.plan_expires_at || null,
    });
  });
});

// ── CREATE RAZORPAY ORDER ─────────────────────────────────────────────
router.post("/create-order", requireAuth, async (req, res) => {
    if (!razorpay) {
    return res.status(503).json({ error: "Payment system not configured yet" });
  }
  const { planId } = req.body;
  const plan = PLANS[planId];

  if (!plan || plan.price === 0) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  try {
    const order = await razorpay.orders.create({
      amount:   plan.price * 100,  // Razorpay uses paise (₹1 = 100 paise)
      currency: "INR",
      receipt:  `receipt_${req.user.id}_${Date.now()}`,
      notes: {
        user_id: req.user.id,
        plan:    planId,
      }
    });

    // Save order to database
    db.run(
      `INSERT INTO payments (user_id, razorpay_order_id, plan, amount, status)
       VALUES (?, ?, ?, ?, 'created')`,
      [req.user.id, order.id, planId, plan.price]
    );

    console.log("Order created:", order.id, "| Plan:", planId, "| User:", req.user.id);

    res.json({
      success:    true,
      order_id:   order.id,
      amount:     order.amount,
      currency:   order.currency,
      plan:       planId,
      plan_name:  plan.name,
      key_id:     process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("Razorpay order error:", err.message);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

// ── VERIFY PAYMENT (called after successful payment) ──────────────────
router.post("/verify", requireAuth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  // Verify signature — proves payment is genuine, not faked
  const body      = razorpay_order_id + "|" + razorpay_payment_id;
  const expected  = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    console.error("Signature mismatch — possible fraud attempt");
    return res.status(400).json({ error: "Payment verification failed" });
  }

  // Signature matches — upgrade the user's plan
  db.get(
    `SELECT * FROM payments WHERE razorpay_order_id = ?`,
    [razorpay_order_id],
    (err, payment) => {
      if (err || !payment) {
        return res.status(404).json({ error: "Order not found" });
      }

      const planId    = payment.plan;
      const expiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000  // 30 days from now
      ).toISOString();

      // Upgrade user plan
      db.run(
        `UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?`,
        [planId, expiresAt, req.user.id],
        (err) => {
          if (err) return res.status(500).json({ error: "Failed to upgrade plan" });

          // Mark payment as successful
          db.run(
            `UPDATE payments
             SET razorpay_payment_id = ?, status = 'paid'
             WHERE razorpay_order_id = ?`,
            [razorpay_payment_id, razorpay_order_id]
          );

          console.log("Payment verified ✓ | User:", req.user.id, "upgraded to:", planId);

          res.json({
            success:  true,
            plan:     planId,
            expires:  expiresAt,
            message:  `Successfully upgraded to ${PLANS[planId].name}!`,
          });
        }
      );
    }
  );
});

// ── PAYMENT HISTORY ───────────────────────────────────────────────────
router.get("/history", requireAuth, (req, res) => {
  db.all(
    `SELECT razorpay_payment_id, plan, amount, status, created_at
     FROM payments WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed" });
      res.json({ success: true, payments: rows || [] });
    }
  );
});

module.exports = { router, PLANS };