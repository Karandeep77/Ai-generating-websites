// claude.js - fixed HTML unescaping

const Anthropic = require("@anthropic-ai/sdk");

console.log("API Key loaded:", process.env.ANTHROPIC_API_KEY ? "YES ✓" : "NO ✗");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateWebsite(userPrompt, existingCode = null) {

  const systemPrompt = `You are an expert web developer. Generate complete websites based on user descriptions.

STRICT OUTPUT RULES:
1. Return ONLY a valid JSON object — nothing else before or after it
2. JSON must have exactly two keys: "html" and "explanation"
3. "html" value must be a valid JSON string — this means:
   - Use \\n for newlines (double backslash n)
   - Use \\" for quotes inside the HTML string
   - NO actual line breaks inside the JSON string value
4. "explanation" is one short sentence
5. HTML must be a complete single file with <style> inside <head> and <script> before </body>
6. Use only system fonts (Arial, Georgia, sans-serif) — no Google Fonts or CDN links
7. Write real content — no placeholder text

Example of correct output:
{"html":"<!DOCTYPE html><html><head><title>Test</title><style>body{margin:0;font-family:Arial;}</style></head><body><h1>Hello</h1><script>console.log('hi');<\\/script></body></html>","explanation":"A simple test page."}`;

  const userMessage = existingCode
    ? `Current website code:\n${existingCode}\n\nChange request: ${userPrompt}`
    : `Build this website: ${userPrompt}`;

  console.log("Calling Claude API...");

  const response = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 16000,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userMessage }],
  });

  console.log("Claude responded.");

  const rawText = response.content[0].text.trim();
  console.log("Raw response preview:", rawText.substring(0, 200));

  // ── STEP 1: Clean any markdown fences ──────────────────────────────
  let cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i,     "")
    .replace(/\s*```$/,      "")
    .trim();

  // ── STEP 2: Find the JSON object boundaries ─────────────────────────
  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON found in Claude response");
  }
  cleaned = cleaned.substring(start, end + 1);

  // ── STEP 3: Try direct JSON parse first ────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
    console.log("JSON parsed successfully.");
  } catch (e) {
    console.warn("Direct JSON.parse failed, trying repair...", e.message);
    parsed = repairAndParse(cleaned);
  }

  if (!parsed || !parsed.html) {
    throw new Error("Claude response missing html field");
  }

  // ── STEP 4: Unescape the HTML string ──────────────────────────────
  // JSON.parse handles \n → newline automatically
  // But if there are leftover literal \n strings, fix them too
  let html = parsed.html;

  // Fix literal \n that weren't parsed as newlines
  html = html.replace(/\\n/g, "\n");
  // Fix literal \t
  html = html.replace(/\\t/g, "\t");
  // Fix escaped quotes that are still escaped
  html = html.replace(/\\"/g, '"');
  // Fix double-escaped backslashes
  html = html.replace(/\\\\/g, "\\");

  // Verify it looks like an HTML document
  if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
    console.warn("HTML doesn't look like a full document, wrapping...");
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
  }

  console.log("Final HTML length:", html.length);
  console.log("HTML preview:", html.substring(0, 150));

  return {
    html,
    explanation: parsed.explanation || "Website generated successfully.",
  };
}

// ── Repair malformed JSON and extract HTML directly ───────────────────
function repairAndParse(text) {
  console.log("Attempting JSON repair...");

  // Method 1: Extract raw HTML directly from the response
  const doctypeMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (doctypeMatch) {
    console.log("Extracted HTML via DOCTYPE match.");
    return { html: doctypeMatch[0], explanation: "Website generated." };
  }

  const htmlTagMatch = text.match(/<html[\s\S]*<\/html>/i);
  if (htmlTagMatch) {
    console.log("Extracted HTML via html tag match.");
    return { html: htmlTagMatch[0], explanation: "Website generated." };
  }

  // Method 2: Manually extract "html" value from broken JSON
  // Find the html key and grab everything until the closing pattern
  const htmlKeyIndex = text.indexOf('"html"');
  if (htmlKeyIndex !== -1) {
    // Find the opening quote of the value
    const valueStart = text.indexOf('"', htmlKeyIndex + 6) + 1;
    if (valueStart > 0) {
      // Find explanation key — html value ends just before it
      const explIndex = text.lastIndexOf('"explanation"');
      if (explIndex > valueStart) {
        // Back up from "explanation" to find end of html string
        let htmlEnd = explIndex - 1;
        // Remove trailing comma, whitespace, closing quote
        while (htmlEnd > valueStart && /[,\s"]/.test(text[htmlEnd])) htmlEnd--;
        
        let rawHtml = text.substring(valueStart, htmlEnd + 1);
        // Unescape
        rawHtml = rawHtml
          .replace(/\\n/g,  "\n")
          .replace(/\\t/g,  "\t")
          .replace(/\\"/g,  '"')
          .replace(/\\\\/g, "\\");

        if (rawHtml.includes("<")) {
          console.log("Extracted HTML via manual key extraction.");
          return { html: rawHtml, explanation: "Website generated." };
        }
      }
    }
  }

  throw new Error("All repair methods failed. Try a simpler prompt.");
}

module.exports = { generateWebsite };