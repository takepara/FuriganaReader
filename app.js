const cfg = window.APP_CONFIG || {};
const STORAGE_KEY = "jptokenizer_api_key";

function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }

const apiKeySection    = document.getElementById("apiKeySection");
const apiKeyInput      = document.getElementById("apiKeyInput");
const saveKeyBtn       = document.getElementById("saveKeyBtn");
const apiKeyError      = document.getElementById("apiKeyError");
const mainSection      = document.getElementById("mainSection");
const changeKeyBtn     = document.getElementById("changeKeyBtn");
const analyzeBtn       = document.getElementById("analyzeBtn");
const inputText        = document.getElementById("inputText");
const loadingText      = document.getElementById("loadingText");
const errorText        = document.getElementById("errorText");
const resultsBody      = document.getElementById("resultsBody");
const readingSection   = document.getElementById("readingSection");
const readingHiragana  = document.getElementById("readingHiragana");
const readingRomaji    = document.getElementById("readingRomaji");
const keyHelpOverlay   = document.getElementById("keyHelpOverlay");
const howToGetKeyLink  = document.getElementById("howToGetKeyLink");
const keyHelpClose     = document.getElementById("keyHelpClose");
const keyHelpClose2    = document.getElementById("keyHelpClose2");

howToGetKeyLink.addEventListener("click", function (e) {
  e.preventDefault();
  show(keyHelpOverlay);
});
keyHelpClose.addEventListener("click", function () { hide(keyHelpOverlay); });
keyHelpClose2.addEventListener("click", function () { hide(keyHelpOverlay); });
keyHelpOverlay.addEventListener("click", function (e) {
  if (e.target === keyHelpOverlay) hide(keyHelpOverlay);
});

let apiKey = localStorage.getItem(STORAGE_KEY) || "";

if (apiKey) {
  showMain();
} else {
  showKeyForm();
}

saveKeyBtn.addEventListener("click", function () {
  const key = apiKeyInput.value.trim();
  if (!key) { apiKeyError.textContent = "Please enter your API key."; return; }
  apiKeyError.textContent = "";
  apiKey = key;
  localStorage.setItem(STORAGE_KEY, key);
  apiKeyInput.value = "";
  showMain();
});

changeKeyBtn.addEventListener("click", function () {
  apiKey = "";
  localStorage.removeItem(STORAGE_KEY);
  resultsBody.innerHTML = '<tr><td colspan="4" class="placeholder">No results yet.</td></tr>';
  showKeyForm();
});

analyzeBtn.addEventListener("click", async function () {
  errorText.textContent = "";
  const text = inputText.value.trim();
  if (!text) { errorText.textContent = "Please enter some Japanese text."; return; }

  loadingText.textContent = "Analyzing...";
  analyzeBtn.disabled = true;

  try {
    const result = await analyzeText(text);
    renderRows(result.rows);
    readingHiragana.textContent = result.hiragana_reading;
    readingRomaji.textContent   = result.romaji_reading;
    show(readingSection);
  } catch (e) {
    errorText.textContent = e.message;
  } finally {
    loadingText.textContent = "";
    analyzeBtn.disabled = false;
  }
});

function showKeyForm() {
  show(apiKeySection);
  hide(mainSection);
}

function showMain() {
  hide(apiKeySection);
  show(mainSection);
}

async function analyzeText(text) {
  const model = encodeURIComponent(cfg.geminiModel || "gemini-2.5-flash");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(text) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          hiragana_reading: { type: "STRING" },
          romaji_reading:   { type: "STRING" },
          tokens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                token:      { type: "STRING" },
                romaji:     { type: "STRING" },
                pos_en:     { type: "STRING" },
                meaning_en: { type: "STRING" }
              },
              required: ["token", "romaji", "pos_en", "meaning_en"]
            }
          }
        },
        required: ["hiragana_reading", "romaji_reading", "tokens"]
      }
    }
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const raw = await resp.text();
  if (!resp.ok) {
    let msg = `Error (${resp.status})`;
    try {
      const detail = JSON.parse(raw)?.error?.message || "";
      if (detail) msg += ": " + detail.split("\n")[0];
    } catch {}
    throw new Error(msg);
  }

  const parsed = JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!parsed) throw new Error("Empty response from API.");

  const cleaned = parsed.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const data = JSON.parse(cleaned);
  const rows = data?.tokens;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Invalid response from API.");
  return {
    rows,
    hiragana_reading: data.hiragana_reading || "",
    romaji_reading:   data.romaji_reading || ""
  };
}

function buildPrompt(inputText) {
  return [
    "You are a Japanese tokenizer and lexical explainer.",
    "Output strictly as JSON matching the schema.",
    "Rules:",
    "1) Segment the entire Japanese sentence into tokens with no omissions.",
    "2) For each token provide: token (JP surface form), romaji (Hepburn), pos_en (part of speech in English), meaning_en (concise English meaning).",
    "3) For hiragana_reading: write the full sentence in hiragana, inserting a single space at each natural pause point (between phrases/clauses, after particles that end a phrase, before and after verb groups). This is for a learner reading aloud smoothly.",
    "4) For romaji_reading: same as hiragana_reading but in Hepburn romaji with the same spacing.",
    "5) Do not include markdown, comments, or extra keys.",
    "Input:", inputText
  ].join("\n");
}

function renderRows(rows) {
  resultsBody.innerHTML = rows.map(r =>
    `<tr><td>${esc(r.token)}</td><td>${esc(r.romaji)}</td><td>${esc(r.pos_en)}</td><td>${esc(r.meaning_en)}</td></tr>`
  ).join("");
}

function esc(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
