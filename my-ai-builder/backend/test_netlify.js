// Run this to test Netlify API directly
// node test_netlify.js YOUR_TOKEN

const https  = require("https");
const JSZip  = require("jszip");

const TOKEN = process.argv[2];
if (!TOKEN) { console.log("Usage: node test_netlify.js YOUR_NETLIFY_TOKEN"); process.exit(1); }

async function test() {
  console.log("1. Creating ZIP...");
  const zip = new JSZip();
  zip.file("index.html", `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Site</title>
  <style>
    body { font-family: Arial; background: #1a1a2e; color: white; 
           display: flex; align-items: center; justify-content: center; 
           height: 100vh; margin: 0; }
    h1 { color: #a78bfa; }
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>🎉 It Works!</h1>
    <p>Your AI Website Builder deployed this site.</p>
  </div>
</body>
</html>`);
  zip.file("_headers", `/*\n  Content-Type: text/html; charset=utf-8\n`);
  zip.file("_redirects", `/  /index.html  200\n`);

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  console.log("ZIP size:", zipBuffer.length, "bytes");

  console.log("2. Creating Netlify site...");
  const site = await jsonRequest("POST", "/api/v1/sites", { name: `test-${Date.now()}` });
  
  if (!site.id) {
    console.error("FAILED to create site:", JSON.stringify(site, null, 2));
    return;
  }
  console.log("Site ID:", site.id);
  console.log("Site URL:", site.ssl_url || site.url);

  console.log("3. Uploading ZIP...");
  const deploy = await zipRequest(`/api/v1/sites/${site.id}/deploys`, zipBuffer);
  console.log("Deploy ID:", deploy.id);
  console.log("Deploy state:", deploy.state);
  console.log("Deploy URL:", deploy.ssl_url || deploy.url);
  
  if (deploy.error_message) console.error("Deploy error:", deploy.error_message);

  console.log("4. Waiting for deploy...");
  for (let i = 0; i < 10; i++) {
    await sleep(4000);
    const d = await jsonRequest("GET", `/api/v1/deploys/${deploy.id}`);
    console.log(`   Check ${i+1}: state=${d.state} url=${d.ssl_url || d.url || "none"}`);
    if (d.state === "ready") {
      console.log("\n✅ SUCCESS! Visit:", d.ssl_url || d.url);
      return;
    }
    if (d.state === "error") {
      console.error("\n❌ Deploy failed:", d.error_message);
      return;
    }
  }
  console.log("\nTimed out. Try visiting:", site.ssl_url || site.url);
}

function jsonRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.netlify.com", path, method,
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({raw: d}); } });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function zipRequest(path, zipBuffer) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.netlify.com", path, method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/zip",
        "Content-Length": zipBuffer.length
      }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        console.log("ZIP upload status:", res.statusCode);
        try { resolve(JSON.parse(d)); } catch(e) { resolve({raw: d.substring(0,300)}); }
      });
    });
    req.on("error", reject);
    req.write(zipBuffer);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

test().catch(console.error);
