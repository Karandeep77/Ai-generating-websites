// login.js

const BACKEND_URL = "";

window.addEventListener("load", async () => {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
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

    // ── Save ALL user info to localStorage ──
    localStorage.setItem("token", data.token);
    localStorage.setItem("role",  data.role);
    localStorage.setItem("email", data.email);   // ← critical
    localStorage.setItem("name",  data.name || data.email.split("@")[0]);

    console.log("Saved to localStorage:", data.email, data.role);

    redirectAfterLogin(data.role);

  } catch (err) {
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

  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters";
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

    // ── Save ALL user info to localStorage ──
    localStorage.setItem("token", data.token);
    localStorage.setItem("role",  data.role);
    localStorage.setItem("email", data.email);   // ← critical
    localStorage.setItem("name",  data.name || data.email.split("@")[0]);

    redirectAfterLogin(data.role);

  } catch (err) {
    errEl.textContent = "Could not connect to server";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Create Account →";
  }
}

function redirectAfterLogin(role) {
  window.location.href = role === "admin" ? "/admin.html" : "/index.html";
}

document.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const loginVisible = !document.getElementById("loginForm").classList.contains("hidden");
    loginVisible ? doLogin() : doRegister();
  }
});