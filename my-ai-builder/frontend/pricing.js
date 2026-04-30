// pricing.js

(function checkAuth() {
  if (!localStorage.getItem("token")) {
    window.location.href = "/";
  }
})();

const BACKEND_URL = "";
let   currentPlan = "free";

function authHeaders() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  };
}

// ── ON LOAD ───────────────────────────────────────────────────────────
window.addEventListener("load", () => {
  loadUsage();
  loadPaymentHistory();
});

// ── LOAD USAGE + CURRENT PLAN ─────────────────────────────────────────
async function loadUsage() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/payments/usage`, { headers: authHeaders() });
    if (res.status === 401) { localStorage.clear(); window.location.href = "/"; return; }
    const data = await res.json();
    if (!data.success) return;

    currentPlan = data.plan;

    // Update badge
    const badge = document.getElementById("currentPlanBadge");
    if (badge) badge.textContent = `Current: ${data.plan.toUpperCase()}`;

    // Usage bars
    const wUsed  = data.used.websites;
    const wLimit = data.limits.websites;
    const mUsed  = data.used.modifications;
    const mLimit = data.limits.modifications;

    const wPct = wLimit >= 999999 ? 5 : Math.min((wUsed / wLimit) * 100, 100);
    const mPct = mLimit >= 999999 ? 5 : Math.min((mUsed / mLimit) * 100, 100);

    document.getElementById("websitesFill").style.width = wPct + "%";
    document.getElementById("modsFill").style.width     = mPct + "%";
    document.getElementById("websitesText").textContent =
      wLimit >= 999999 ? `${wUsed} / ∞` : `${wUsed} / ${wLimit}`;
    document.getElementById("modsText").textContent =
      mLimit >= 999999 ? `${mUsed} / ∞` : `${mUsed} / ${mLimit}`;

    updatePlanButtons(data.plan);

  } catch (err) {
    console.error("Usage load error:", err.message);
  }
}

// ── UPDATE PLAN BUTTONS ───────────────────────────────────────────────
function updatePlanButtons(activePlan) {
  const plans = ["free", "starter", "pro", "agency"];

  plans.forEach(p => {
    const card = document.getElementById(`plan-${p}`);
    const btn  = document.getElementById(`btn-${p}`);
    if (!card || !btn) return;

    if (p === activePlan) {
      card.classList.add("active-plan");
      btn.disabled    = true;
      btn.textContent = "✓ Current Plan";
      btn.className   = "plan-btn current";
    } else {
      card.classList.remove("active-plan");
      btn.disabled  = false;
      btn.className = "plan-btn upgrade";
    }
  });
}

// ── START PAYMENT ─────────────────────────────────────────────────────
async function startPayment(planId) {
  try {
    document.getElementById("loadingModal").classList.remove("hidden");

    const res  = await fetch(`${BACKEND_URL}/api/payments/create-order`, {
      method:  "POST",
      headers: authHeaders(),
      body:    JSON.stringify({ planId }),
    });
    const data = await res.json();
    document.getElementById("loadingModal").classList.add("hidden");

    if (!res.ok) throw new Error(data.error || "Failed to create order");

    // Open Razorpay checkout
    const options = {
      key:          data.key_id,
      amount:       data.amount,
      currency:     data.currency,
      name:         "AI Website Builder",
      description:  `${data.plan_name} Plan — 1 Month`,
      order_id:     data.order_id,
      prefill: {
        email: localStorage.getItem("email") || "",
      },
      theme: { color: "#2563eb" },
      handler: async function(response) {
        await verifyPayment(response);
      },
      modal: {
        ondismiss: function() {
          console.log("Payment popup closed");
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
    rzp.on("payment.failed", function(response) {
      alert("Payment failed: " + response.error.description);
    });

  } catch (err) {
    document.getElementById("loadingModal").classList.add("hidden");
    alert("Error: " + err.message);
  }
}

// ── VERIFY PAYMENT ────────────────────────────────────────────────────
async function verifyPayment(response) {
  try {
    document.getElementById("loadingModal").classList.remove("hidden");

    const res  = await fetch(`${BACKEND_URL}/api/payments/verify`, {
      method:  "POST",
      headers: authHeaders(),
      body:    JSON.stringify({
        razorpay_order_id:   response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature:  response.razorpay_signature,
      }),
    });

    document.getElementById("loadingModal").classList.add("hidden");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verification failed");

    document.getElementById("successMessage").textContent = data.message;
    document.getElementById("successModal").classList.remove("hidden");

    loadUsage();
    loadPaymentHistory();

  } catch (err) {
    document.getElementById("loadingModal").classList.add("hidden");
    alert("Verification error: " + err.message);
  }
}

// ── LOAD PAYMENT HISTORY ──────────────────────────────────────────────
async function loadPaymentHistory() {
  const container = document.getElementById("paymentHistory");

  try {
    const res  = await fetch(`${BACKEND_URL}/api/payments/history`, { headers: authHeaders() });
    const data = await res.json();

    if (!data.payments || data.payments.length === 0) {
      container.innerHTML = `<p class="dim-msg">No payments yet.</p>`;
      return;
    }

    container.innerHTML = data.payments.map(p => `
      <div class="history-item">
        <div>
          <div class="history-plan">${p.plan} Plan</div>
          <div class="history-date">${formatDate(p.created_at)}</div>
        </div>
        <div style="text-align:right">
          <div class="history-amount">₹${p.amount}</div>
          <span class="badge ${p.status === 'paid' ? 'badge-green' : 'badge-amber'}">${p.status}</span>
        </div>
      </div>
    `).join("");

  } catch (err) {
    container.innerHTML = `<p class="dim-msg">Could not load history.</p>`;
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}
