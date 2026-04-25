// login.js

const BACKEND_URL = "";

// On page load — if already logged in, go straight to app
window.addEventListener("load", async () => {
  const token = localStorage.getItem("token");
  if (!token) return;

  // Verify token is still valid
  try {
    const res  = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      redirectAfterLogin(data.user.role);
    }
  } catch {}
});

function switchTab(tab) {
  document.getElementById("loginForm").classList.toggle("hidden",    tab !== "login");
  document.getElementById("registerForm").classList.toggle("hidden", tab !== "register");
  document.getElementById("loginTab").classList.toggle("active",     tab === "login");
  document.getElementById("registerTab").classList.toggle("active",  tab === "register");
}

async function doLogin() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl    = document.getElementById("loginError");
  const btn      = document.querySelector("#loginForm .btn-primary");

  errEl.classList.add("hidden");
  btn.disabled    = true;
  btn.textContent = "Logging in...";

  try {
    const res  = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || "Login failed";
      errEl.classList.remove("hidden");
      return;
    }

    // Save token and user info to localStorage
    localStorage.setItem("token", data.token);
    localStorage.setItem("role",  data.role);
    localStorage.setItem("email", data.email);

    redirectAfterLogin(data.role);

  } catch {
    errEl.textContent = "Could not connect to server";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Login →";
  }
}

async function doRegister() {
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm  = document.getElementById("regConfirm").value;
  const errEl    = document.getElementById("registerError");
  const btn      = document.querySelector("#registerForm .btn-primary");

  errEl.classList.add("hidden");

  if (password !== confirm) {
    errEl.textContent = "Passwords do not match";
    errEl.classList.remove("hidden");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Creating account...";

  try {
    const res  = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || "Registration failed";
      errEl.classList.remove("hidden");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("role",  data.role);
    localStorage.setItem("email", data.email);

    redirectAfterLogin(data.role);

  } catch {
    errEl.textContent = "Could not connect to server";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Create Account →";
  }
}

function redirectAfterLogin(role) {
  // Admin goes to admin dashboard, users go to main app
  window.location.href = role === "admin" ? "/admin.html" : "/index.html";
}

// Allow Enter key to submit
document.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const loginVisible = !document.getElementById("loginForm").classList.contains("hidden");
    loginVisible ? doLogin() : doRegister();
  }
});