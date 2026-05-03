(function checkAuth() {
  if (!localStorage.getItem("token")) window.location.href = "/";
})();

const BACKEND_URL = "";

let currentHTML = null;
let currentProjectId = null;
let currentProjectName = "New project";
let currentDeployUrl = null;
let currentMode = "frontend_only";
let currentFiles = [];
let currentApiSpec = [];
let currentIntegrationChecks = [];
let isWorking = false;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`,
  };
}

function logout() {
  localStorage.clear();
  window.location.href = "/";
}

window.addEventListener("load", () => {
  hydrateAccount();
  setupPromptInput();
  startNewProject(false);
  loadAllProjects();
  checkAndShowUpgradePrompt();
});

function hydrateAccount() {
  const email = localStorage.getItem("email") || "User";
  const role = localStorage.getItem("role") || "free";

  document.getElementById("userEmail").textContent = email;
  document.getElementById("userRole").textContent = role === "admin" ? "ADMIN" : role.toUpperCase();
  document.getElementById("userInitial").textContent = email[0]?.toUpperCase() || "U";
}

function setupPromptInput() {
  const input = document.getElementById("promptInput");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  });
}

async function loadAllProjects() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/projects`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (data.success) renderProjectsList(data.projects || []);
  } catch (err) {
    console.error("Could not load projects:", err.message);
  }
}

function renderProjectsList(projects) {
  const container = document.getElementById("projectsList");
  if (!projects.length) {
    container.innerHTML = `<div class="empty-msg">No projects yet.<br/>Start with a prompt.</div>`;
    return;
  }

  container.innerHTML = projects.map(project => `
    <div class="project-card ${project.id === currentProjectId ? "active" : ""}" id="project-card-${project.id}" onclick="loadProject(${project.id})">
      <span class="project-card-name"
            contenteditable="true"
            spellcheck="false"
            onclick="event.stopPropagation()"
            onblur="renameProject(${project.id}, this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">${escapeHtml(project.name)}</span>
      <div class="project-card-meta">
        ${project.deployed_url ? `<span class="live-dot" title="Live"></span>` : ""}
        <span>${formatDate(project.updated_at || project.created_at)}</span>
      </div>
      <button class="delete-project" onclick="event.stopPropagation(); deleteProject(${project.id})" title="Delete">x</button>
    </div>
  `).join("");
}

async function loadProject(id) {
  try {
    setStatus("Loading project...", "loading");
    const res = await fetch(`${BACKEND_URL}/api/projects/${id}`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Project not found");

    const project = data.project;
    currentProjectId = project.id;
    currentProjectName = project.name;
    currentHTML = project.html;
    currentDeployUrl = project.deployed_url || null;
    currentMode = project.mode || "frontend_only";
    currentFiles = data.files || [];
    currentApiSpec = project.apiSpec || [];
    currentIntegrationChecks = project.integrationChecks || [];

    document.getElementById("currentProjectName").textContent = project.name;
    document.getElementById("promptInput").value = "";
    document.getElementById("promptInput").style.height = "auto";
    document.getElementById("deployBtn").disabled = !isDeployableMode(currentMode);

    displayPreview(currentHTML);
    renderArtifactPanel({
      mode: currentMode,
      summary: project.summary || project.name,
      files: currentFiles,
      apiSpec: currentApiSpec,
      integrationChecks: currentIntegrationChecks,
    });
    renderMessages(data.messages || fallbackMessages(project));
    setDeployedUrl(currentDeployUrl);
    markActiveProject(id);
    clearStatus();
    focusPrompt();
  } catch (err) {
    setStatus("Could not load project: " + err.message, "error");
  }
}

function startNewProject(shouldFocus = true) {
  currentHTML = null;
  currentProjectId = null;
  currentProjectName = "New project";
  currentDeployUrl = null;
  currentMode = "frontend_only";
  currentFiles = [];
  currentApiSpec = [];
  currentIntegrationChecks = [];

  document.getElementById("currentProjectName").textContent = "New project";
  document.getElementById("promptInput").value = "";
  document.getElementById("promptInput").style.height = "auto";
  document.getElementById("conversationList").innerHTML = "";
  document.getElementById("deployBtn").disabled = true;
  setDeployedUrl(null);
  renderArtifactPanel(null);
  clearStatus();
  clearPreview();
  markActiveProject(null);
  renderWelcomeMessage();
  if (shouldFocus) focusPrompt();
}

function renderWelcomeMessage() {
  const conversation = document.getElementById("conversationList");
  conversation.innerHTML = `
    <div class="message assistant">
      <div class="message-avatar">AI</div>
      <div class="message-bubble">Tell me what website you want to build. For example: Create a clean portfolio website for a product designer with case studies and a contact section.</div>
    </div>
  `;
}

async function submitPrompt() {
  if (isWorking) return;
  const input = document.getElementById("promptInput");
  const prompt = input.value.trim();
  if (!prompt) {
    setStatus("Type what you want to build or change first.", "error");
    return;
  }

  isWorking = true;
  input.value = "";
  input.style.height = "auto";
  addMessage("user", prompt);
  
  // Show streaming generation message
  const streamingMsgId = showStreamingMessage("Generating your website");
  setControlsBusy(true);

  try {
    const payload = { prompt };
    if (currentProjectId && currentHTML) {
      payload.projectId = currentProjectId;
      payload.existingCode = currentHTML;
    }

    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    if (res.status === 403 && data.error === "limit_reached") {
      removeStreamingMessage(streamingMsgId);
      setStatus(data.message || "Plan limit reached.", "error");
      showUpgradeBanner();
      return;
    }
    if (!res.ok) throw new Error(data.details || data.error || "Something went wrong");

    // Remove streaming message and show final result
    removeStreamingMessage(streamingMsgId);
    setStatus("");

    currentHTML = data.html;
    currentProjectId = data.projectId;
    currentDeployUrl = null;
    currentMode = data.mode || "frontend_only";
    currentFiles = data.files || [];
    currentApiSpec = data.apiSpec || [];
    currentIntegrationChecks = data.integrationChecks || [];

    displayPreview(currentHTML);
    renderArtifactPanel({
      mode: currentMode,
      summary: data.summary || "Generated project",
      files: currentFiles,
      apiSpec: currentApiSpec,
      integrationChecks: currentIntegrationChecks,
    });
    addMessage("assistant", data.explanation || "Done. Your preview has been updated.", true, true);
    document.getElementById("deployBtn").disabled = !isDeployableMode(currentMode);
    setDeployedUrl(null);

    await loadAllProjects();
    if (currentProjectId) {
      markActiveProject(currentProjectId);
      const cardName = document.querySelector(`#project-card-${currentProjectId} .project-card-name`);
      currentProjectName = cardName?.textContent?.trim() || promptName(prompt);
      document.getElementById("currentProjectName").textContent = currentProjectName;
    }
    clearStatus();
  } catch (err) {
    removeStreamingMessage(streamingMsgId);
    addMessage("assistant", "I could not complete that request. " + err.message);
    setStatus("Error: " + err.message, "error");
  } finally {
    isWorking = false;
    setControlsBusy(false);
    focusPrompt();
  }
}

async function deployWebsite() {
  if (!currentProjectId || isWorking) {
    setStatus("Create or open a project before deploying.", "error");
    return;
  }
  if (!isDeployableMode(currentMode)) {
    setStatus("Deploy is currently available for frontend-only projects. Full-stack deployment is planned for a future release.", "error");
    return;
  }

  isWorking = true;
  setControlsBusy(true);
  setStatus("Deploying your website. This can take 30-60 seconds.", "loading");

  try {
    const res = await fetch(`${BACKEND_URL}/api/deploy`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ projectId: currentProjectId }),
    });
    const data = await res.json();

    if (res.status === 403 && data.error === "deploy_limit_reached") {
      setStatus(data.message || "Deployment limit reached.", "error");
      return;
    }
    if (!res.ok) throw new Error(data.error || "Deployment failed");

    currentDeployUrl = data.url;
    setDeployedUrl(data.url);
    addMessage("assistant", "Your website is live. I added the deployment link above the preview.");
    await loadAllProjects();
    markActiveProject(currentProjectId);
    clearStatus();
  } catch (err) {
    setStatus("Deploy failed: " + err.message, "error");
  } finally {
    isWorking = false;
    setControlsBusy(false);
  }
}

function displayPreview(html) {
  const iframe = document.getElementById("previewFrame");
  if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  iframe._blobUrl = blobUrl;
  iframe.src = blobUrl;

  document.getElementById("emptyPreview").classList.add("hidden");
  document.getElementById("previewShell").classList.add("has-preview");
  document.getElementById("previewState").textContent = "Previewing";
}

function clearPreview() {
  const iframe = document.getElementById("previewFrame");
  if (iframe._blobUrl) {
    URL.revokeObjectURL(iframe._blobUrl);
    iframe._blobUrl = null;
  }
  iframe.src = "about:blank";
  document.getElementById("emptyPreview").classList.remove("hidden");
  document.getElementById("previewShell").classList.remove("has-preview");
  document.getElementById("previewState").textContent = "Ready";
}

function renderMessages(messages) {
  const conversation = document.getElementById("conversationList");
  conversation.innerHTML = "";
  if (!messages.length) {
    renderWelcomeMessage();
    return;
  }
  messages.forEach(message => addMessage(message.role, message.content, false));
}

function fallbackMessages(project) {
  if (!project.prompt) return [];
  return [
    { role: "user", content: project.prompt },
    { role: "assistant", content: "Loaded the latest version of this project." },
  ];
}

function addMessage(role, content, shouldScroll = true, showPreviewBtn = false) {
  const conversation = document.getElementById("conversationList");
  const message = document.createElement("div");
  const isUser = role === "user";
  message.className = `message ${isUser ? "user" : "assistant"}`;
  
  let bubbleContent = `<div class="message-bubble">
    <div>${escapeHtml(content)}</div>`;
  
  if (showPreviewBtn && !isUser) {
    bubbleContent += `<button class="preview-btn" onclick="openFullscreenPreview()">📺 View Fullscreen</button>`;
  }
  
  bubbleContent += `</div>`;
  
  message.innerHTML = `
    <div class="message-avatar">${isUser ? "U" : "AI"}</div>
    ${bubbleContent}
  `;
  conversation.appendChild(message);
  if (shouldScroll) scrollWorkspaceToBottom();
}

function openFullscreenPreview() {
  if (!currentHTML) {
    alert("No preview available");
    return;
  }
  const modal = document.getElementById("fullscreenPreviewModal");
  const iframe = document.getElementById("fullscreenPreviewFrame");
  
  const blob = new Blob([currentHTML], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  iframe.src = blobUrl;
  
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeFullscreenPreview() {
  const modal = document.getElementById("fullscreenPreviewModal");
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeFullscreenPreview();
});

let streamingMessageElement = null;

function showStreamingMessage(text) {
  const conversation = document.getElementById("conversationList");
  const message = document.createElement("div");
  message.className = "message assistant";
  message.id = "streaming-message-" + Date.now();
  
  message.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-bubble streaming">
      <div class="streaming-content">
        <span>${escapeHtml(text)}</span>
        <div class="streaming-dots">
          <div class="streaming-dot"></div>
          <div class="streaming-dot"></div>
          <div class="streaming-dot"></div>
        </div>
      </div>
    </div>
  `;
  
  conversation.appendChild(message);
  scrollWorkspaceToBottom();
  return message.id;
}

function removeStreamingMessage(msgId) {
  const msg = document.getElementById(msgId);
  if (msg) msg.remove();
}

function setDeployedUrl(url) {
  const card = document.getElementById("deployedUrlCard");
  const link = document.getElementById("deployedUrlLink");
  if (!url) {
    card.classList.add("hidden");
    link.href = "#";
    link.textContent = "";
    return;
  }
  link.href = url;
  link.textContent = url;
  card.classList.remove("hidden");
}

function copyDeployedUrl() {
  if (!currentDeployUrl) return;
  navigator.clipboard.writeText(currentDeployUrl).then(() => {
    const btn = document.querySelector(".copy-url-btn");
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = "Copy"; }, 1600);
  });
}

async function renameProject(id, element) {
  const newName = element.textContent.trim();
  if (!newName) {
    element.textContent = "Untitled";
    return;
  }

  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ name: newName }),
    });
    if (id === currentProjectId) {
      currentProjectName = newName;
      document.getElementById("currentProjectName").textContent = newName;
    }
  } catch (err) {
    console.error("Rename failed:", err.message);
  }
}

async function deleteProject(id) {
  if (!confirm("Delete this project? This cannot be undone.")) return;
  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}`, { method: "DELETE", headers: authHeaders() });
    if (id === currentProjectId) startNewProject(false);
    await loadAllProjects();
  } catch (err) {
    setStatus("Could not delete project.", "error");
  }
}

async function checkAndShowUpgradePrompt() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/payments/usage`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    const roleEl = document.getElementById("userRole");
    if (roleEl) roleEl.textContent = (data.plan || "free").toUpperCase();

    if (data.used.websites >= data.limits.websites || data.used.modifications >= data.limits.modifications) {
      showUpgradeBanner();
    }
  } catch (err) {
    console.error("Usage check failed:", err.message);
  }
}

function showUpgradeBanner() {
  if (document.getElementById("upgradeBanner")) return;
  const banner = document.createElement("div");
  banner.id = "upgradeBanner";
  banner.className = "live-url-card";
  banner.innerHTML = `
    <span>Your current plan limit has been reached.</span>
    <button class="copy-url-btn" onclick="window.location.href='/pricing.html'">Upgrade</button>
  `;
  const inner = document.querySelector(".workspace-inner");
  inner.insertBefore(banner, inner.firstChild);
}

function setControlsBusy(state) {
  document.getElementById("sendBtn").disabled = state;
  document.getElementById("deployBtn").disabled = state || !currentProjectId || !isDeployableMode(currentMode);
  document.getElementById("promptInput").disabled = state;
}

function renderArtifactPanel(artifact) {
  const panel = document.getElementById("artifactPanel");
  if (!artifact) {
    panel.classList.add("hidden");
    return;
  }

  const shouldShow = artifact.mode !== "frontend_only" || artifact.apiSpec?.length;
  if (!shouldShow) {
    panel.classList.add("hidden");
    return;
  }

  document.getElementById("artifactSummary").textContent = artifact.summary || "Generated project artifact";
  document.getElementById("artifactMode").textContent = formatMode(artifact.mode);
  document.getElementById("artifactFiles").innerHTML = renderFileItems(artifact.files || []);
  document.getElementById("artifactApi").innerHTML = renderApiItems(artifact.apiSpec || []);
  document.getElementById("artifactChecks").innerHTML = renderCheckItems(artifact.integrationChecks || []);
  panel.classList.remove("hidden");
}

function renderFileItems(files) {
  if (!files.length) return `<li>No generated files listed.</li>`;
  return files.map(file => `
    <li><strong>${escapeHtml(file.file_type || "file")}</strong> ${escapeHtml(file.path)} ${file.size ? `(${formatBytes(file.size)})` : ""}</li>
  `).join("");
}

function renderApiItems(apiSpec) {
  if (!apiSpec.length) return `<li>No API endpoints for this project.</li>`;
  return apiSpec.map(endpoint => `
    <li><strong>${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.path)}</strong> ${escapeHtml(endpoint.purpose || "")}</li>
  `).join("");
}

function renderCheckItems(checks) {
  if (!checks.length) return `<li>No integration checks reported.</li>`;
  return checks.slice(0, 8).map(check => {
    const status = check.status === "pass" ? "pass" : "warn";
    return `<li><strong class="check-${status}">${escapeHtml(status.toUpperCase())}</strong> ${escapeHtml(check.name || "Check")}</li>`;
  }).join("");
}

function isDeployableMode(mode) {
  return (mode || "frontend_only") === "frontend_only";
}

function formatMode(mode) {
  return String(mode || "frontend_only").replace(/_/g, " ");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

function setStatus(message, type) {
  const el = document.getElementById("statusMessage");
  el.textContent = message;
  el.className = `status ${type}`;
}

function clearStatus() {
  const el = document.getElementById("statusMessage");
  el.textContent = "";
  el.className = "status hidden";
}

function markActiveProject(id) {
  document.querySelectorAll(".project-card").forEach(card => card.classList.remove("active"));
  if (!id) return;
  const card = document.getElementById(`project-card-${id}`);
  if (card) card.classList.add("active");
}

function scrollWorkspaceToBottom() {
  const workspace = document.getElementById("workspace");
  requestAnimationFrame(() => {
    workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
  });
}

function focusPrompt() {
  document.getElementById("promptInput").focus();
}

function promptName(prompt) {
  return prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr) {
  if (!dateStr) return "Recently";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
