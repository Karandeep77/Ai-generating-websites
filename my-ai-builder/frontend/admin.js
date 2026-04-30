// admin.js — Admin dashboard logic

// ── AUTH GUARD — admin only ───────────────────────────────────────────
(function checkAdmin() {
  const token = localStorage.getItem("token");
  const role  = localStorage.getItem("role");
  if (!token || role !== "admin") {
    window.location.href = "/";
  }
})();

const BACKEND_URL    = "";
let   currentSection = "overview";

function authHeaders() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  };
}

function logout() {
  localStorage.clear();
  window.location.href = "/";
}

// ── ON PAGE LOAD ──────────────────────────────────────────────────────
window.addEventListener("load", () => {
  const email = localStorage.getItem("email");
  if (email) document.getElementById("adminEmail").textContent = email;
  loadStats();
  loadOverview();
});

// ── NAVIGATION ────────────────────────────────────────────────────────
function showSection(name) {
  currentSection = name;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.id === `nav-${name}`);
  });

  document.querySelectorAll(".section").forEach(sec => {
    sec.classList.toggle("hidden", sec.id !== `section-${name}`);
  });

  const titles = {
    overview: ["Overview",  "Welcome back. Here's what's happening."],
    users:    ["Users",     "All registered users on your platform."],
    projects: ["Projects",  "All generated projects across all users."],
  };
  const [title, sub] = titles[name] || ["Dashboard", ""];
  document.getElementById("pageTitle").textContent    = title;
  document.getElementById("pageSubtitle").textContent = sub;

  if (name === "overview") loadOverview();
  if (name === "users")    loadUsers();
  if (name === "projects") loadProjects();
}

function refreshCurrentSection() {
  loadStats();
  showSection(currentSection);
}

// ── LOAD STATS ────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/admin/stats`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) { logout(); return; }
    const data = await res.json();
    if (!data.success) return;

    document.getElementById("statUsers").textContent    = data.total_users    || 0;
    document.getElementById("statProjects").textContent = data.total_projects  || 0;
    document.getElementById("statToday").textContent    = data.generated_today || 0;

    const cost = (data.generated_today || 0) * 3;
    document.getElementById("statCost").textContent = `₹${cost}`;
  } catch (err) {
    console.error("Stats error:", err.message);
  }
}

// ── LOAD OVERVIEW ─────────────────────────────────────────────────────
async function loadOverview() {
  const container = document.getElementById("recentActivity");
  container.innerHTML = `<div class="loading-msg">Loading recent activity...</div>`;

  try {
    const res  = await fetch(`${BACKEND_URL}/api/admin/projects`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error("Failed");

    const recent = (data.projects || []).slice(0, 15);

    if (recent.length === 0) {
      container.innerHTML = `<div class="loading-msg">No activity yet.</div>`;
      return;
    }

    container.innerHTML = recent.map(p => `
      <div class="activity-item">
        <div>
          <div class="activity-name">${escapeHtml(p.name)}</div>
          <div class="activity-meta">by ${escapeHtml(p.user_email || "Unknown user")}</div>
        </div>
        <div class="activity-time">${formatDate(p.updated_at)}</div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div class="loading-msg">Failed to load activity.</div>`;
  }
}

// ── LOAD USERS ────────────────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById("usersTable");
  tbody.innerHTML = `<tr><td colspan="6" class="loading-msg">Loading users...</td></tr>`;

  try {
    const res  = await fetch(`${BACKEND_URL}/api/admin/users`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error("Failed");

    const users = data.users || [];
    document.getElementById("usersCount").textContent = users.length;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-msg">No users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>#${u.id}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td>${u.project_count || 0}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          ${u.role !== "admin"
            ? `<button class="btn-delete" onclick="confirmDelete('user', ${u.id}, '${escapeHtml(u.email)}')">Delete</button>`
            : `<span style="color:var(--text-dim);font-size:12px">Protected</span>`
          }
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-msg">Failed to load users.</td></tr>`;
  }
}

// ── LOAD PROJECTS ─────────────────────────────────────────────────────
async function loadProjects() {
  const tbody = document.getElementById("projectsTable");
  tbody.innerHTML = `<tr><td colspan="6" class="loading-msg">Loading projects...</td></tr>`;

  try {
    const res  = await fetch(`${BACKEND_URL}/api/admin/projects`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error("Failed");

    const projects = data.projects || [];
    document.getElementById("projectsCount").textContent = projects.length;

    if (projects.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-msg">No projects found.</td></tr>`;
      return;
    }

    tbody.innerHTML = projects.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.user_email || "Unknown")}</td>
        <td>${formatDate(p.created_at)}</td>
        <td>${formatDate(p.updated_at)}</td>
        <td>
          <button class="btn-delete"
                  onclick="confirmDelete('project', ${p.id}, '${escapeHtml(p.name)}')">
            Delete
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-msg">Failed to load projects.</td></tr>`;
  }
}

// ── CONFIRM DELETE MODAL ──────────────────────────────────────────────
function confirmDelete(type, id, name) {
  document.getElementById("modalTitle").textContent =
    `Delete this ${type}?`;
  document.getElementById("modalMessage").textContent =
    type === "user"
      ? `"${name}" and ALL their projects will be permanently deleted.`
      : `"${name}" will be permanently deleted.`;

  const confirmBtn = document.getElementById("modalConfirm");
  confirmBtn.onclick = () => {
    closeModal();
    type === "user" ? deleteUser(id) : deleteProject(id);
  };

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

document.getElementById("modal").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

// ── DELETE USER ───────────────────────────────────────────────────────
async function deleteUser(id) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/admin/users/${id}`, {
      method: "DELETE", headers: authHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadStats();
    loadUsers();
  } catch (err) {
    alert("Failed to delete user: " + err.message);
  }
}

// ── DELETE PROJECT ────────────────────────────────────────────────────
async function deleteProject(id) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/admin/projects/${id}`, {
      method: "DELETE", headers: authHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadStats();
    loadProjects();
  } catch (err) {
    alert("Failed to delete project: " + err.message);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}
