// login.js

const BACKEND_URL = "";
const REQUEST_TIMEOUT_MS = 45000;

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  return {};
}

window.addEventListener("load", async () => {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await apiFetch("/api/auth/me", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      redirectAfterLogin(data.user.role);
    } else {
      // Token invalid — clear and stay on login page
      localStorage.clear();
    }
  } catch {}
});

function switchTab(tab) {
  document.getElementById("loginForm").classList.toggle("hidden",    tab !== "login");
  document.getElementById("registerForm").classList.toggle("hidden", tab !== "register");
  document.getElementById("loginTab").classList.toggle("active",     tab === "login");
  document.getElementById("registerTab").classList.toggle("active",  tab === "register");

  const title = document.querySelector(".auth-title");
  const subtitle = document.querySelector(".auth-subtitle");
  if (title) title.textContent = tab === "login" ? "Start building today" : "Create your account";
  if (subtitle) {
    subtitle.textContent = tab === "login"
      ? "Sign in to continue to your website builder."
      : "Create an account to save projects and build websites with AI.";
  }
}

async function doLogin() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl    = document.getElementById("loginError");
  const btn      = document.getElementById("loginBtn");

  errEl.classList.add("hidden");
  btn.disabled    = true;
  btn.textContent = "Logging in...";

  try {
    const res  = await apiFetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await readResponse(res);

    if (!res.ok) {
      errEl.textContent = data.error || "Login failed";
      errEl.classList.remove("hidden");
      return;
    }

    // ── Save ALL user info to localStorage ──
    localStorage.setItem("token", data.token);
    localStorage.setItem("role",  data.role);
    localStorage.setItem("email", data.email);   // ← critical
    localStorage.setItem("name",  data.name || data.email.split("@")[0]);

    console.log("Saved to localStorage:", data.email, data.role);

    redirectAfterLogin(data.role);

  } catch (err) {
    errEl.textContent = err.name === "AbortError"
      ? "Server is taking too long to respond. Please try again in a minute."
      : "Could not connect to server";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Sign In";
  }
}

async function doRegister() {
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm  = document.getElementById("regConfirm").value;
  const errEl    = document.getElementById("registerError");
  const btn      = document.getElementById("registerBtn");

  errEl.classList.add("hidden");

  if (password !== confirm) {
    errEl.textContent = "Passwords do not match";
    errEl.classList.remove("hidden");
    return;
  }

  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters";
    errEl.classList.remove("hidden");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Creating account...";

  try {
    const res  = await apiFetch("/api/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await readResponse(res);

    if (!res.ok) {
      errEl.textContent = data.error || "Registration failed";
      errEl.classList.remove("hidden");
      return;
    }

    // ── Save ALL user info to localStorage ──
    localStorage.setItem("token", data.token);
    localStorage.setItem("role",  data.role);
    localStorage.setItem("email", data.email);   // ← critical
    localStorage.setItem("name",  data.name || data.email.split("@")[0]);

    redirectAfterLogin(data.role);

  } catch (err) {
    errEl.textContent = err.name === "AbortError"
      ? "Server is taking too long to respond. Please try again in a minute."
      : "Could not connect to server";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Create Account";
  }
}

function redirectAfterLogin(role) {
  window.location.href = role === "admin" ? "/admin.html" : "/builder.html";
}

document.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const loginVisible = !document.getElementById("loginForm").classList.contains("hidden");
    loginVisible ? doLogin() : doRegister();
  }
});
