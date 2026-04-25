// app.js — complete file with auth on every fetch call

// ── AUTH GUARD ────────────────────────────────────────────────────────
(function checkAuth() {
  if (!localStorage.getItem("token")) {
    window.location.href = "/login.html";
  }
})();

const BACKEND_URL = "";

// ── AUTH HEADERS — sent with every request ────────────────────────────
function authHeaders() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  };
}

// ── LOGOUT ────────────────────────────────────────────────────────────
function logout() {
  localStorage.clear();
  window.location.href = "/login.html";
}

// ── STATE ─────────────────────────────────────────────────────────────
let currentHTML      = null;
let currentProjectId = null;
let currentView      = "preview";
let currentCodeTab   = "html";
let parsedCode       = { html: "", css: "", js: "" };

// ── ON PAGE LOAD ──────────────────────────────────────────────────────
window.addEventListener("load", () => {
  const email = localStorage.getItem("email");
  const role  = localStorage.getItem("role");

  const emailEl = document.getElementById("userEmail");
  const roleEl  = document.getElementById("userRole");
  if (emailEl && email) emailEl.textContent = email;
  if (roleEl  && role)  roleEl.textContent  = role === "admin" ? "⭐ Admin" : "User";

  loadAllProjects();
});

// ── LOAD ALL PROJECTS ─────────────────────────────────────────────────
async function loadAllProjects() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/projects`, {
      headers: authHeaders()
    });

    // If token expired or invalid, go back to login
    if (res.status === 401) {
      logout();
      return;
    }

    const data = await res.json();
    if (data.success) renderProjectsList(data.projects);

  } catch (err) {
    console.error("Could not load projects:", err.message);
  }
}

// ── RENDER SIDEBAR LIST ───────────────────────────────────────────────
function renderProjectsList(projects) {
  const container = document.getElementById("projectsList");

  if (!projects || projects.length === 0) {
    container.innerHTML = `<p class="empty-msg">No projects yet.<br/>Generate your first website!</p>`;
    return;
  }

  container.innerHTML = projects.map(p => `
    <div class="project-card ${p.id === currentProjectId ? "active" : ""}"
         id="project-card-${p.id}"
         onclick="loadProject(${p.id})">
      <span class="project-card-name"
            contenteditable="true"
            spellcheck="false"
            onclick="event.stopPropagation()"
            onblur="renameProject(${p.id}, this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
            title="Click to rename">${escapeHtml(p.name)}</span>
      <div class="project-card-date">${formatDate(p.updated_at)}</div>
      <button class="project-card-delete"
              onclick="event.stopPropagation(); deleteProject(${p.id})"
              title="Delete">✕</button>
    </div>
  `).join("");
}

// ── LOAD ONE PROJECT ──────────────────────────────────────────────────
async function loadProject(id) {
  try {
    showStatus("Loading...", "loading");

    const res  = await fetch(`${BACKEND_URL}/api/projects/${id}`, {
      headers: authHeaders()
    });

    if (res.status === 401) { logout(); return; }

    const data = await res.json();
    if (!data.success) throw new Error("Project not found");

    const p          = data.project;
    currentHTML      = p.html;
    currentProjectId = p.id;
    parsedCode       = extractCodeParts(currentHTML);

    displayPreview(currentHTML);

    document.getElementById("currentProjectName").textContent = p.name;
    document.getElementById("modifyBtn").disabled             = false;
    document.getElementById("downloadBtn").disabled           = false;
    document.getElementById("codeToggle").disabled            = false;

    switchView("preview");

    document.querySelectorAll(".project-card").forEach(c => c.classList.remove("active"));
    const card = document.getElementById(`project-card-${id}`);
    if (card) card.classList.add("active");

    hideStatus();
    showExplanation(`Loaded: "${p.name}"`);

  } catch (err) {
    console.error("Load error:", err);
    showStatus("❌ Could not load project", "error");
  }
}

// ── START NEW PROJECT ─────────────────────────────────────────────────
function startNewProject() {
  currentHTML      = null;
  currentProjectId = null;
  parsedCode       = { html: "", css: "", js: "" };

  const iframe = document.getElementById("previewFrame");
  if (iframe._blobUrl) {
    URL.revokeObjectURL(iframe._blobUrl);
    iframe._blobUrl = null;
  }
  iframe.src = "about:blank";

  document.getElementById("currentProjectName").textContent = "Live Preview";
  document.getElementById("promptInput").value              = "";
  document.getElementById("modifyBtn").disabled             = true;
  document.getElementById("downloadBtn").disabled           = true;
  document.getElementById("codeToggle").disabled            = true;
  document.getElementById("chatHistory").innerHTML          = "";
  document.getElementById("codeDisplay").innerHTML          = "";
  document.getElementById("explanation").classList.add("hidden");

  switchView("preview");
  hideStatus();
  document.querySelectorAll(".project-card").forEach(c => c.classList.remove("active"));
  document.getElementById("promptInput").focus();
}

// ── GENERATE WEBSITE ──────────────────────────────────────────────────
async function generateWebsite() {
  const prompt = document.getElementById("promptInput").value.trim();
  if (!prompt) {
    showStatus("Please enter a description first!", "error");
    return;
  }

  showStatus("⏳ Generating your website... (10-20 seconds)", "loading");
  disableButtons(true);

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method:  "POST",
      headers: authHeaders(),
      body:    JSON.stringify({ prompt }),
    });

    // Token expired
    if (res.status === 401) { logout(); return; }

    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error || "Something went wrong");

    currentHTML      = data.html;
    currentProjectId = data.projectId;
    parsedCode       = extractCodeParts(currentHTML);

    displayPreview(currentHTML);
    showExplanation(data.explanation);
    addToHistory(prompt, "Generated");

    document.getElementById("modifyBtn").disabled   = false;
    document.getElementById("downloadBtn").disabled = false;
    document.getElementById("codeToggle").disabled  = false;
    document.getElementById("promptInput").value    = "";

    const name = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
    document.getElementById("currentProjectName").textContent = name;

    await loadAllProjects();

    // Highlight the newly saved project
    document.querySelectorAll(".project-card").forEach(c => c.classList.remove("active"));
    const card = document.getElementById(`project-card-${currentProjectId}`);
    if (card) card.classList.add("active");

    hideStatus();

  } catch (err) {
    console.error("Generate error:", err);
    showStatus("❌ Error: " + err.message, "error");
  } finally {
    disableButtons(false);
  }
}

// ── MODIFY WEBSITE ────────────────────────────────────────────────────
async function modifyWebsite() {
  const prompt = document.getElementById("promptInput").value.trim();
  if (!prompt)      { showStatus("Describe what you want to change!", "error"); return; }
  if (!currentHTML) { showStatus("Generate a website first!", "error"); return; }

  showStatus("⏳ Modifying your website...", "loading");
  disableButtons(true);

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method:  "POST",
      headers: authHeaders(),
      body:    JSON.stringify({
        prompt,
        existingCode: currentHTML,
        projectId:    currentProjectId,
      }),
    });

    if (res.status === 401) { logout(); return; }

    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error || "Something went wrong");

    currentHTML = data.html;
    parsedCode  = extractCodeParts(currentHTML);

    displayPreview(currentHTML);
    if (currentView === "code") showCodeTab(currentCodeTab);

    showExplanation(data.explanation);
    addToHistory(prompt, "Modified");
    document.getElementById("promptInput").value = "";

    await loadAllProjects();
    hideStatus();

  } catch (err) {
    console.error("Modify error:", err);
    showStatus("❌ Error: " + err.message, "error");
  } finally {
    disableButtons(false);
  }
}

// ── DISPLAY PREVIEW ───────────────────────────────────────────────────
function displayPreview(html) {
  const iframe = document.getElementById("previewFrame");

  if (iframe._blobUrl) {
    URL.revokeObjectURL(iframe._blobUrl);
    iframe._blobUrl = null;
  }

  const blob    = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  iframe._blobUrl = blobUrl;

  iframe.src = "about:blank";
  setTimeout(() => { iframe.src = blobUrl; }, 30);
}

// ── VIEW TOGGLE ───────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;

  const previewView   = document.getElementById("previewView");
  const codeView      = document.getElementById("codeView");
  const previewToggle = document.getElementById("previewToggle");
  const codeToggle    = document.getElementById("codeToggle");

  if (view === "preview") {
    previewView.classList.remove("hidden");
    codeView.classList.add("hidden");
    previewToggle.classList.add("active");
    codeToggle.classList.remove("active");
  } else {
    previewView.classList.add("hidden");
    codeView.classList.remove("hidden");
    previewToggle.classList.remove("active");
    codeToggle.classList.add("active");
    showCodeTab(currentCodeTab);
  }
}

// ── CODE TABS ─────────────────────────────────────────────────────────
function switchCodeTab(tab) {
  currentCodeTab = tab;
  document.querySelectorAll(".code-tab").forEach(btn => {
    const label = btn.textContent.trim().toLowerCase();
    btn.classList.toggle("active",
      (tab === "html" && label === "html") ||
      (tab === "css"  && label === "css")  ||
      (tab === "js"   && label === "javascript")
    );
  });
  showCodeTab(tab);
}

function showCodeTab(tab) {
  const display = document.getElementById("codeDisplay");
  const code    = parsedCode[tab] ||
    (tab === "js" ? "// No JavaScript found" :
     tab === "css" ? "/* No CSS found */" : "");
  display.innerHTML = highlightCode(code, tab);
}

// ── EXTRACT CODE PARTS ────────────────────────────────────────────────
function extractCodeParts(fullHtml) {
  if (!fullHtml) return { html: "", css: "", js: "" };

  const cssMatches = fullHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  const css = cssMatches
    .map(b => b.replace(/<style[^>]*>/i, "").replace(/<\/style>/i, ""))
    .join("\n\n").trim();

  const jsMatches = fullHtml.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const js = jsMatches
    .map(b => b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, ""))
    .join("\n\n").trim();

  return {
    html: fullHtml.trim() || "<!-- No HTML found -->",
    css:  css  || "/* No CSS found */",
    js:   js   || "// No JavaScript found",
  };
}

// ── SYNTAX HIGHLIGHTER ────────────────────────────────────────────────
function highlightCode(code, type) {
  let e = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (type === "html") {
    return e
      .replace(/(&lt;\/?)([\w]+)/g, '$1<span class="token-tag">$2</span>')
      .replace(/([\w-]+=)(".*?")/g,  '<span class="token-attr">$1</span><span class="token-string">$2</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="token-comment">$1</span>');
  }
  if (type === "css") {
    return e
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>')
      .replace(/([.#]?[\w-]+)\s*\{/g,  '<span class="token-tag">$1</span> {')
      .replace(/([\w-]+)(\s*:)(\s*)([^;}\n]+)/g,
        '<span class="token-property">$1</span>$2$3<span class="token-value">$4</span>');
  }
  if (type === "js") {
    return e
      .replace(/(\/\/[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|new|this|async|await|import|export|default|true|false|null|undefined)\b/g,
        '<span class="token-keyword">$1</span>')
      .replace(/(\w+)(?=\s*\()/g, '<span class="token-function">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>')
      .replace(/(".*?"|'.*?'|`[\s\S]*?`)/g, '<span class="token-string">$1</span>');
  }
  return e;
}

// ── COPY CODE ─────────────────────────────────────────────────────────
function copyCode() {
  const code = parsedCode[currentCodeTab] || "";
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector(".copy-btn");
    btn.textContent = "✓ Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "📋 Copy";
      btn.classList.remove("copied");
    }, 2000);
  });
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────
function downloadCode() {
  if (!currentHTML) return;
  const blob = new Blob([currentHTML], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "my-website.html";
  a.click();
  URL.revokeObjectURL(url);
}

// ── RENAME PROJECT ────────────────────────────────────────────────────
async function renameProject(id, element) {
  const newName = element.textContent.trim();
  if (!newName) { element.textContent = "Untitled"; return; }

  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}`, {
      method:  "PUT",
      headers: authHeaders(),
      body:    JSON.stringify({ name: newName }),
    });
    if (id === currentProjectId) {
      document.getElementById("currentProjectName").textContent = newName;
    }
  } catch (err) {
    console.error("Rename failed:", err.message);
  }
}

// ── DELETE PROJECT ────────────────────────────────────────────────────
async function deleteProject(id) {
  if (!confirm("Delete this project? This cannot be undone.")) return;

  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}`, {
      method:  "DELETE",
      headers: authHeaders(),
    });
    if (id === currentProjectId) startNewProject();
    await loadAllProjects();
  } catch (err) {
    showStatus("❌ Could not delete project", "error");
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────
function showStatus(message, type) {
  const el = document.getElementById("statusMessage");
  el.textContent = message;
  el.className   = `status ${type}`;
  el.classList.remove("hidden");
}

function hideStatus() {
  document.getElementById("statusMessage").classList.add("hidden");
}

function showExplanation(text) {
  const el = document.getElementById("explanation");
  el.textContent = "💡 " + text;
  el.classList.remove("hidden");
}

function disableButtons(state) {
  document.getElementById("generateBtn").disabled = state;
  if (state) document.getElementById("modifyBtn").disabled = true;
}

function addToHistory(prompt, action) {
  const container = document.getElementById("chatHistory");
  const item      = document.createElement("div");
  item.className  = "chat-item";
  item.innerHTML  = `<span>${action}:</span> ${escapeHtml(prompt)}`;
  container.prepend(item);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

// Ctrl+Enter to generate
document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "Enter") generateWebsite();
});
