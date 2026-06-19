const cfg = window.APP_CONFIG || {};
const STORAGE_KEY = "jptokenizer_api_key";

function show(el) { el.style.display = ""; }
function hide(el) { el.style.display = "none"; }
function openModal(el) {
  show(el);
  document.body.classList.add("modal-open");
}
function closeModal(el) {
  hide(el);
  document.body.classList.remove("modal-open");
}

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
const readingTranslated = document.getElementById("readingTranslated");
const keyHelpOverlay   = document.getElementById("keyHelpOverlay");
const howToGetKeyLink  = document.getElementById("howToGetKeyLink");
const keyHelpClose     = document.getElementById("keyHelpClose");
const keyHelpClose2    = document.getElementById("keyHelpClose2");

if (keyHelpOverlay && keyHelpOverlay.parentElement !== document.body) {
  document.body.appendChild(keyHelpOverlay);
}

howToGetKeyLink.addEventListener("click", function (e) {
  e.preventDefault();
  if (!apiKey) {
    openModal(keyHelpOverlay);
  }
});
keyHelpClose.addEventListener("click", function () { closeModal(keyHelpOverlay); });
keyHelpClose2.addEventListener("click", function () { closeModal(keyHelpOverlay); });
keyHelpOverlay.addEventListener("click", function (e) {
  if (e.target === keyHelpOverlay) closeModal(keyHelpOverlay);
});

let apiKey = localStorage.getItem(STORAGE_KEY) || "";

if (apiKey) {
  closeModal(keyHelpOverlay);
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
  const rawText = inputText.value;
  const preparedInput = prepareInputForAnalysis(rawText);
  if (!preparedInput.normalizedText) { errorText.textContent = "Please enter some Japanese text."; return; }

  loadingText.textContent = "Analyzing...";
  analyzeBtn.disabled = true;

  try {
    const result = await analyzeText(preparedInput);
    renderRows(result.rows);
    readingHiragana.textContent = result.hiragana_reading;
    readingRomaji.textContent   = result.romaji_reading;
    readingTranslated.textContent = result.translated || "";
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

async function analyzeText(preparedInput) {
  const modelCandidates = buildModelCandidates();
  const retryLimit = Number.isInteger(cfg.retryLimit) ? cfg.retryLimit : 2;
  let lastError = null;

  for (const modelName of modelCandidates) {
    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      try {
        const data = await requestAnalyze(preparedInput, modelName);
        const rows = data?.tokens;
        if (!Array.isArray(rows) || rows.length === 0) throw new Error("Invalid response from API.");
        return {
          rows,
          hiragana_reading: data.hiragana_reading || "",
          romaji_reading:   data.romaji_reading || "",
          translated:       data.translated || ""
        };
      } catch (err) {
        lastError = err;
        const retryable = isRetryableStatus(err?.status);
        const hasNextTry = attempt < retryLimit;
        if (retryable && hasNextTry) {
          await waitMs(backoffMs(attempt));
          continue;
        }
        if (!retryable) {
          throw err;
        }
      }
    }
  }

  if (isRetryableStatus(lastError?.status)) {
    throw new Error("Gemini API is currently busy. Please try again in a few seconds.");
  }
  throw lastError || new Error("Failed to analyze text.");
}

function buildModelCandidates() {
  const fromConfig = Array.isArray(cfg.fallbackModels) ? cfg.fallbackModels : [];
  const candidates = [cfg.geminiModel, ...fromConfig, "gemini-2.5-flash-lite", "gemini-2.5-flash"]
    .map(m => String(m || "").trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

async function requestAnalyze(text, modelName) {
  const model = encodeURIComponent(modelName);
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
          translated:       { type: "STRING" },
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
        required: ["hiragana_reading", "romaji_reading", "translated", "tokens"]
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
    const err = new Error(buildApiErrorMessage(resp.status, raw));
    err.status = resp.status;
    throw err;
  }

  const parsed = JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!parsed) throw new Error("Empty response from API.");

  const cleaned = parsed.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

function buildApiErrorMessage(status, raw) {
  let msg = `Error (${status})`;
  try {
    const detail = JSON.parse(raw)?.error?.message || "";
    if (detail) msg += ": " + detail.split("\n")[0];
  } catch {}
  return msg;
}

function isRetryableStatus(status) {
  return [429, 500, 502, 503, 504].includes(Number(status));
}

function backoffMs(attempt) {
  const base = 500;
  return base * (2 ** attempt) + Math.floor(Math.random() * 250);
}

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPrompt(inputText) {
  const normalizedText = inputText?.normalizedText || "";
  const originalText = inputText?.originalText || normalizedText;
  const choiceLikeSegments = Array.isArray(inputText?.choiceLikeSegments) ? inputText.choiceLikeSegments : [];
  const advisoryLine = choiceLikeSegments.length > 0
    ? `Detected parenthetical segments that may be option-like: ${choiceLikeSegments.map(s => s.raw).join(" | ")}`
    : "Detected parenthetical segments that may be option-like: none";
  const interpretationHints = Array.isArray(inputText?.interpretationHints) ? inputText.interpretationHints : [];
  const nonSpokenSegments = Array.isArray(inputText?.nonSpokenParentheticalSegments)
    ? inputText.nonSpokenParentheticalSegments
    : [];
  const nonSpokenLine = nonSpokenSegments.length > 0
    ? `Non-spoken parenthetical candidates for reading sections: ${nonSpokenSegments.join(" | ")}`
    : "Non-spoken parenthetical candidates for reading sections: none";

  return [
    "You are a Japanese tokenizer and lexical explainer.",
    "Output strictly as JSON matching the schema.",
    "Rules:",
    "1) Segment the full Japanese input into tokens with no omissions.",
    "1a) Keep punctuation/symbols that appear in input (e.g., parentheses, slashes, ellipsis marks) represented in tokenization and reflected in readings.",
    "2) For each token provide: token (JP surface form), romaji (Hepburn), pos_en (part of speech in English), meaning_en (concise English meaning).",
    "3) Preserve all user-provided text. Do not drop or ignore parenthetical content unless it is literally empty.",
    "4) For hiragana_reading: produce a speakable reading string in hiragana with natural pause spacing.",
    "5) For romaji_reading: same as hiragana_reading but in Hepburn romaji with the same spacing.",
    "5a) If non-spoken parenthetical candidates are provided, exclude those segments from hiragana_reading and romaji_reading only. Keep tokenization for the full original input.",
    "5b) Also provide translated: a natural full-sentence English translation of the normalized full sentence.",
    "6) Input may be all-hiragana with odd spacing from copy-paste. Infer natural word boundaries and intended lexical forms from context.",
    "7) Parenthetical text can be semantically essential (e.g., conditions, concessions, clarifications). Include it in analysis by default.",
    "8) If parenthetical options are shorthand with ellipsis (e.g., とても〜/あまり〜/ぜんぜん), treat them as attaching to the nearest prior predicate/expression and explain that relation in natural English.",
    "9) If the Japanese is incomplete or colloquial, infer only minimally necessary omitted meaning. Stay conservative and avoid semantic drift.",
    "10) Keep token sequence faithful to the input characters. Use meaning_en to provide context-aware English glosses.",
    "11) Do not include markdown, comments, or extra keys.",
    "Original user input:", originalText,
    "Normalized full sentence:", normalizedText,
    advisoryLine,
    nonSpokenLine,
    "Interpretation hints:",
    ...interpretationHints
  ].join("\n");
}

function normalizeJapaneseInput(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[~～]/g, "〜")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\u3000]+/g, "")
    .trim();
}

function prepareInputForAnalysis(rawValue) {
  const originalText = String(rawValue || "").trim();
  const normalized = normalizeJapaneseInput(originalText);
  if (!normalized) {
    return { originalText, normalizedText: "", choiceLikeSegments: [] };
  }

  return {
    originalText,
    normalizedText: normalized,
    choiceLikeSegments: detectChoiceLikeSegments(normalized),
    interpretationHints: buildInterpretationHints(normalized),
    nonSpokenParentheticalSegments: detectNonSpokenParentheticalSegments(normalized)
  };
}

function detectChoiceLikeSegments(text) {
  const segments = [];
  const matches = text.matchAll(/[（(]([^()（）]+)[)）]/g);
  for (const m of matches) {
    const inside = normalizeJapaneseInput(m[1] || "");
    if (!inside) continue;
    if (/[\/／|｜]/.test(inside)) {
      const options = inside
        .split(/[\/／|｜]/)
        .map(s => normalizeJapaneseInput(s))
        .filter(Boolean);
      segments.push({
        raw: inside,
        options,
        hasEllipsis: options.some(opt => /[〜…]+$/.test(opt))
      });
    }
  }
  return segments;
}

function buildInterpretationHints(text) {
  const segments = detectChoiceLikeSegments(text);
  if (segments.length === 0) {
    return ["- No special shorthand options detected."];
  }

  const beforeParen = text.split(/[（(]/)[0] || "";
  const anchor = inferAttachmentAnchor(beforeParen);
  const hints = ["- Shorthand options detected in parentheses; interpret them in relation to the surrounding clause."];

  for (const seg of segments) {
    if (seg.hasEllipsis) {
      hints.push(`- Segment '${seg.raw}' includes ellipsis; infer omitted continuation from nearest prior expression '${anchor || beforeParen || "context"}'.`);
      hints.push("- For English glosses, prefer contextual readings (e.g., 'very [predicate]', 'not very [predicate]', 'not at all [predicate]') when appropriate.");
    } else {
      hints.push(`- Segment '${seg.raw}' appears to be alternatives; keep semantics aligned with the same local context.`);
    }
  }
  return hints;
}

function inferAttachmentAnchor(text) {
  const cleaned = String(text || "").replace(/[、。！？!?]+$/g, "");
  if (!cleaned) return "";
  const maxLen = 12;
  return cleaned.slice(-maxLen);
}

function detectNonSpokenParentheticalSegments(text) {
  const segments = [];
  const matches = text.matchAll(/[（(]([^()（）]+)[)）]/g);
  for (const m of matches) {
    const inside = normalizeJapaneseInput(m[1] || "");
    if (!inside) continue;

    const hasAlternatives = /[\/／|｜]/.test(inside);
    const hasEllipsis = /[〜…]/.test(inside);
    const looksLikeOptionList = hasAlternatives && (hasEllipsis || inside.length <= 24);

    if (looksLikeOptionList) {
      segments.push(inside);
    }
  }
  return segments;
}

function renderRows(rows) {
  resultsBody.innerHTML = rows.map(r =>
    `<tr><td>${esc(r.token)}</td><td>${esc(r.romaji)}</td><td>${esc(r.pos_en)}</td><td>${esc(r.meaning_en)}</td></tr>`
  ).join("");
}

function esc(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
