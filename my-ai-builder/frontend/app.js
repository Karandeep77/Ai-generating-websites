// app.js - fixed preview and project loading

const BACKEND_URL = "";

// ── STATE ─────────────────────────────────────────────────────────────
let currentHTML      = null;
let currentProjectId = null;
let currentView      = "preview";
let currentCodeTab   = "html";
let parsedCode       = { html: "", css: "", js: "" };

// ── ON PAGE LOAD ──────────────────────────────────────────────────────
window.addEventListener("load", () => {
  loadAllProjects();
});

// ── LOAD ALL PROJECTS ─────────────────────────────────────────────────
async function loadAllProjects() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/projects`);
    const data = await res.json();
    if (data.success) renderProjectsList(data.projects);
  } catch (err) {
    console.error("Could not load projects:", err.message);
  }
}

// ── RENDER SIDEBAR ────────────────────────────────────────────────────
function renderProjectsList(projects) {
  const container = document.getElementById("projectsList");
  if (!projects.length) {
    container.innerHTML = `<p class="empty-msg">No projects yet.<br>Generate your first website!</p>`;
    return;
  }
  container.innerHTML = projects.map(p => `
    <div class="project-card ${p.id === currentProjectId ? "active" : ""}"
         id="project-card-${p.id}"
         onclick="loadProject(${p.id})">
      <div class="project-card-name"
           contenteditable="true" spellcheck="false"
           onclick="event.stopPropagation()"
           onblur="renameProject(${p.id}, this)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           title="Click to rename">${escapeHtml(p.name)}</div>
      <div class="project-card-date">${formatDate(p.updated_at)}</div>
      <button class="project-card-delete"
              onclick="event.stopPropagation();deleteProject(${p.id})"
              title="Delete">✕</button>
    </div>
  `).join("");
}

// ── LOAD ONE PROJECT ──────────────────────────────────────────────────
async function loadProject(id) {
  try {
    showStatus("Loading project...", "loading");

    const res  = await fetch(`${BACKEND_URL}/api/projects/${id}`);
    const data = await res.json();
    if (!data.success) throw new Error("Not found");

    const p      = data.project;
    currentHTML      = p.html;
    currentProjectId = p.id;

    // ── KEY FIX: always display the RAW html, never a modified version ──
    displayPreview(currentHTML);

    // Parse for code tabs (only used when user clicks </> Code)
    parsedCode = extractCodeParts(currentHTML);

    document.getElementById("currentProjectName").textContent = p.name;
    document.getElementById("modifyBtn").disabled   = false;
    document.getElementById("downloadBtn").disabled = false;
    document.getElementById("codeToggle").disabled  = false;

    switchView("preview");

    document.querySelectorAll(".project-card").forEach(c => c.classList.remove("active"));
    const card = document.getElementById(`project-card-${id}`);
    if (card) card.classList.add("active");

    hideStatus();
    showExplanation(`Loaded: "${p.name}"`);

  } catch (err) {
    console.error("Load project error:", err);
    showStatus("❌ Could not load project: " + err.message, "error");
  }
}

// ── START NEW PROJECT ─────────────────────────────────────────────────
function startNewProject() {
  currentHTML      = null;
  currentProjectId = null;
  parsedCode       = { html: "", css: "", js: "" };

  // Clean up blob URL if exists
  const iframe = document.getElementById("previewFrame");
  if (iframe._blobUrl) {
    URL.revokeObjectURL(iframe._blobUrl);
    iframe._blobUrl = null;
  }
  iframe.src    = "";
  iframe.srcdoc = "";

  document.getElementById("currentProjectName").textContent = "Live Preview";
  document.getElementById("promptInput").value              = "";
  document.getElementById("modifyBtn").disabled             = true;
  document.getElementById("downloadBtn").disabled           = true;
  document.getElementById("codeToggle").disabled            = true;
  document.getElementById("chatHistory").innerHTML          = "";
  document.getElementById("explanation").classList.add("hidden");
  document.getElementById("codeDisplay").innerHTML          = "";

  switchView("preview");
  hideStatus();
  document.querySelectorAll(".project-card").forEach(c => c.classList.remove("active"));
  document.getElementById("promptInput").focus();
}

// ── GENERATE WEBSITE ──────────────────────────────────────────────────
async function generateWebsite() {
  const prompt = document.getElementById("promptInput").value.trim();
  if (!prompt) { showStatus("Please enter a description first!", "error"); return; }

  showStatus("⏳ Generating your website... (10-20 seconds)", "loading");
  disableButtons(true);

  try {
    const res  = await fetch(`${BACKEND_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error || "Something went wrong");

    currentHTML      = data.html;
    currentProjectId = data.projectId;

    // ── Always show raw HTML in preview ──
    displayPreview(currentHTML);

    // Parse for code tabs
    parsedCode = extractCodeParts(currentHTML);

    showExplanation(data.explanation);
    addToHistory(prompt, "Generated");

    document.getElementById("modifyBtn").disabled   = false;
    document.getElementById("downloadBtn").disabled = false;
    document.getElementById("codeToggle").disabled  = false;
    document.getElementById("promptInput").value    = "";

    const name = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
    document.getElementById("currentProjectName").textContent = name;

    await loadAllProjects();
    document.querySelectorAll(".project-card").forEach(c => c.classList.remove("active"));
    const card = document.getElementById(`project-card-${currentProjectId}`);
    if (card) card.classList.add("active");

    hideStatus();

  } catch (err) {
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
    const res  = await fetch(`${BACKEND_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        prompt,
        existingCode: currentHTML,
        projectId:    currentProjectId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error || "Something went wrong");

    currentHTML = data.html;
    parsedCode  = extractCodeParts(currentHTML);

    // ── Always show raw HTML in preview ──
    displayPreview(currentHTML);

    // If user is on code view, refresh it too
    if (currentView === "code") showCodeTab(currentCodeTab);

    showExplanation(data.explanation);
    addToHistory(prompt, "Modified");
    document.getElementById("promptInput").value = "";

    await loadAllProjects();
    hideStatus();

  } catch (err) {
    showStatus("❌ Error: " + err.message, "error");
  } finally {
    disableButtons(false);
  }
}

// displayPreview - fixed using blob URL instead of srcdoc
// Blob URLs are unique every single time so browser never gets stuck

function displayPreview(html) {
  const iframe = document.getElementById("previewFrame");

  // Revoke previous blob URL to free memory
  if (iframe._blobUrl) {
    URL.revokeObjectURL(iframe._blobUrl);
    iframe._blobUrl = null;
  }

  // Create a fresh blob URL every time — browser treats it as a new page
  const blob    = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);

  // Store it on the iframe element so we can revoke it next time
  iframe._blobUrl = blobUrl;

  // Reset iframe completely before loading
  iframe.src = "";
  setTimeout(() => {
    iframe.src = blobUrl;
  }, 30);
}

// ── VIEW TOGGLE (Preview ↔ Code) ──────────────────────────────────────
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
    btn.classList.toggle(
      "active",
      btn.textContent.trim().toLowerCase().startsWith(tab === "js" ? "java" : tab)
    );
  });
  showCodeTab(tab);
}

function showCodeTab(tab) {
  const display = document.getElementById("codeDisplay");
  const code    = parsedCode[tab] || (tab === "js" ? "// No JavaScript found" : tab === "css" ? "/* No CSS found */" : "");
  display.innerHTML = highlightCode(code, tab);
}

// ── EXTRACT HTML/CSS/JS FROM FULL HTML ───────────────────────────────
// IMPORTANT: this is ONLY for the Code tab display
// The preview ALWAYS uses the original unmodified HTML
function extractCodeParts(fullHtml) {
  if (!fullHtml) return { html: "", css: "", js: "" };

  // Extract CSS — get content inside ALL <style> tags
  let css = "";
  const cssMatches = fullHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (cssMatches) {
    css = cssMatches
      .map(block => block.replace(/<style[^>]*>/i, "").replace(/<\/style>/i, ""))
      .join("\n\n")
      .trim();
  }

  // Extract JS — get content inside ALL <script> tags
  let js = "";
  const jsMatches = fullHtml.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsMatches) {
    js = jsMatches
      .map(block => block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, ""))
      .join("\n\n")
      .trim();
  }

  // For HTML tab — show the full original so user sees the complete structure
  // Just label where CSS and JS are
  const html = fullHtml.trim();

  return {
    html: html || "<!-- No HTML found -->",
    css:  css  || "/* No CSS found */",
    js:   js   || "// No JavaScript found",
  };
}

// ── SYNTAX HIGHLIGHTER ────────────────────────────────────────────────
function highlightCode(code, type) {
  let escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (type === "html") {
    return escaped
      .replace(/(&lt;\/?)([\w]+)/g, '$1<span class="token-tag">$2</span>')
      .replace(/([\w-]+=)(".*?")/g, '<span class="token-attr">$1</span><span class="token-string">$2</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="token-comment">$1</span>');
  }

  if (type === "css") {
    return escaped
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>')
      .replace(/([.#]?[\w-]+)\s*\{/g, '<span class="token-tag">$1</span> {')
      .replace(/([\w-]+)(\s*:)(\s*)([^;}\n]+)/g,
        '<span class="token-property">$1</span>$2$3<span class="token-value">$4</span>');
  }

  if (type === "js") {
    return escaped
      .replace(/(\/\/[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|new|this|async|await|import|export|default|true|false|null|undefined)\b/g,
        '<span class="token-keyword">$1</span>')
      .replace(/(\w+)(?=\s*\()/g, '<span class="token-function">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>')
      .replace(/(".*?"|'.*?'|`[\s\S]*?`)/g, '<span class="token-string">$1</span>');
  }

  return escaped;
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

// ── RENAME ────────────────────────────────────────────────────────────
async function renameProject(id, element) {
  const newName = element.textContent.trim();
  if (!newName) { element.textContent = "Untitled"; return; }
  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newName }),
    });
    if (id === currentProjectId) {
      document.getElementById("currentProjectName").textContent = newName;
    }
  } catch (err) {
    console.error("Rename failed:", err.message);
  }
}

// ── DELETE ────────────────────────────────────────────────────────────
async function deleteProject(id) {
  if (!confirm("Delete this project? This cannot be undone.")) return;
  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}`, { method: "DELETE" });
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
document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "Enter") generateWebsite();
});