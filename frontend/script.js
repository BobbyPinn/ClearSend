// ============================================================
// SETTINGS: reads API URL from config.js (CONFIG object).
// If the API call fails and ENABLE_MOCK_FALLBACK is true,
// falls back to fake demo data.
const API_URL = CONFIG.API_URL || "";
// ============================================================

const CHANNELS = ["Email", "Social post", "Client follow-up"];
let channel = "Email";
let history = [];

// ---------- switching screens ----------
function show(name) {
  for (const id of ["review", "results", "history"]) {
    document.getElementById(id).classList.toggle("hidden", id !== name);
  }
  document.getElementById("navReview").classList.toggle("active", name !== "history");
  document.getElementById("navHistory").classList.toggle("active", name === "history");
  if (name === "history") drawHistory();
  window.scrollTo(0, 0);
}

// ---------- screen 1: compose ----------
function drawChips() {
  document.getElementById("chips").innerHTML = CHANNELS.map(c =>
    `<button class="chip ${c === channel ? "on" : ""}" onclick="pickChannel('${c}')">${c}</button>`
  ).join("");
}

function pickChannel(c) {
  channel = c;
  drawChips();
}

function useSample() {
  document.getElementById("text").value =
    "Hi Jordan,\n\nGreat speaking with you today. This fund is guaranteed to grow 12% a year and is basically risk-free. Act now before it's gone!\n\nBest,\nMaria";
}

async function runReview() {
  const text = document.getElementById("text").value.trim();
  if (!text) {
    document.getElementById("text").focus();
    return;
  }
  const btn = document.getElementById("reviewBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Reviewing…`;

  // Allow the in-flight request to be cancelled from the overlay.
  reviewController = new AbortController();
  let cancelled = false;
  showLoading();

  try {
    let result;
    if (API_URL) {
      try {
        const res = await fetch(API_URL + "/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, communicationType: { "Email": "client_email", "Social post": "social_post", "Client follow-up": "client_follow_up" }[channel], audience: "existing_client" }),
          signal: reviewController.signal,
        });
        if (!res.ok) throw new Error("The review service returned " + res.status);
        const raw = await res.json();
        result = normalizeResponse(raw, text);
      } catch (apiErr) {
        // User cancelled: abort quietly, no fallback, no error alert.
        if (apiErr.name === "AbortError") {
          cancelled = true;
          return;
        }
        // Fall back to mock data if the API errors (when enabled)
        if (CONFIG.ENABLE_MOCK_FALLBACK) {
          console.warn("API call failed, using mock fallback:", apiErr.message);
          result = await fakeReview(text);
          result.summary = "⚠ DEMO DATA (API unavailable). " + result.summary;
        } else {
          throw apiErr;
        }
      }
    } else {
      result = await fakeReview(text);
    }
    result.original = result.original || text;
    result.channel = result.channel || channel;
    result.createdAt = result.createdAt || new Date().toISOString();
    result.flags = result.flags || [];

    history.unshift(result);
    document.getElementById("logCount").textContent = history.length;
    drawResults(result);
    show("results");
  } catch (e) {
    alert("Couldn't review the message. " + e.message);
  } finally {
    hideLoading();
    reviewController = null;
    btn.disabled = false;
    btn.textContent = "Review message";
  }
}

// ---------- loading overlay ----------
let reviewController = null;

function showLoading() {
  const el = document.getElementById("loadingOverlay");
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
}

function hideLoading() {
  const el = document.getElementById("loadingOverlay");
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
}

// Cancel an in-flight review from the overlay's Cancel button.
function cancelReview() {
  if (reviewController) reviewController.abort();
}

// ---------- screen 2: results ----------
function drawResults(r) {
  const headline = {
    high: r.escalate ? "Hold for compliance review" : "Fix before sending",
    medium: "Edit before sending",
    low: "Clear to send",
  }[r.riskLevel] || "Review complete";

  const changed = r.rewrite && r.rewrite !== r.original;

  const notes = r.flags.length
    ? r.flags.map((f, i) => `
        <div class="note ${f.severity}" data-n="${i}" onmouseenter="light(${i})" onmouseleave="light(-1)" onclick="light(${i})">
          <span class="num">${i + 1}</span>
          <div>
            <h3>${escapeHtml(f.category)} <span class="sev ${f.severity}">${escapeHtml(f.severity.toUpperCase())}</span></h3>
            <p class="phrase">"${escapeHtml(f.phrase)}"</p>
            <p>${escapeHtml(f.explanation)}</p>
            ${f.policyRef ? `<span class="policy">Policy: ${escapeHtml(f.policyRef)}</span>` : ""}
          </div>
        </div>`).join("")
    : `<p class="margin-empty">Nothing flagged. No promises, risk claims, or pressure language found.</p>`;

  document.getElementById("results").innerHTML = `
    <div class="verdict ${r.riskLevel}">
      <div>
        <h1>${headline}</h1>
        <p class="level">${escapeHtml(r.riskLevel.toUpperCase())} concern</p>
        <p>${escapeHtml(r.summary)}${r.escalate ? " This one has been sent to compliance." : ""}</p>
      </div>
      <div class="audit">${escapeHtml(r.channel)} · ${formatTime(r.createdAt)}Review ID: <strong>${escapeHtml(r.id)}</strong></div>
    </div>

    <div class="sheet markup">
      <div class="draft">
        <p class="sheet-title">Your draft</p>
        <p class="letter">${markUp(r.original, r.flags)}</p>
      </div>
      <aside class="margin">
        <p class="sheet-title">${r.flags.length ? r.flags.length + " note" + (r.flags.length > 1 ? "s" : "") : "Notes"}</p>
        ${notes}
      </aside>
    </div>

    ${changed ? `
      <div class="sheet cleared">
        <div class="cleared-head">
          <p class="sheet-title">Compliant version</p>
          <button class="primary" id="copyBtn" onclick="copyRewrite()">Copy compliant version</button>
        </div>
        <p class="letter">${escapeHtml(r.rewrite)}</p>
      </div>` : ""}

    <div class="after">
      <button class="secondary" onclick="newReview()">Review another message</button>
    </div>`;

  window._currentRewrite = r.rewrite;
}

// Wraps each flagged phrase in a numbered, underlined span
function markUp(text, flags) {
  const spans = [];
  flags.forEach((f, i) => {
    const at = text.toLowerCase().indexOf(f.phrase.toLowerCase());
    if (at >= 0) spans.push({ start: at, end: at + f.phrase.length, i, severity: f.severity });
  });
  spans.sort((a, b) => a.start - b.start);

  let html = "";
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue; // skip overlaps
    html += escapeHtml(text.slice(pos, s.start));
    html += `<span class="hit ${s.severity}" data-n="${s.i}" onmouseenter="light(${s.i})" onmouseleave="light(-1)">${escapeHtml(text.slice(s.start, s.end))}<sup>${s.i + 1}</sup></span>`;
    pos = s.end;
  }
  return html + escapeHtml(text.slice(pos));
}

// Highlights a phrase and its matching note together
function light(n) {
  document.querySelectorAll(".hit, .note").forEach(el => {
    el.classList.toggle("lit", Number(el.dataset.n) === n);
  });
}

function copyRewrite() {
  navigator.clipboard.writeText(window._currentRewrite || "");
  const btn = document.getElementById("copyBtn");
  btn.textContent = "Copied";
  setTimeout(() => (btn.textContent = "Copy compliant version"), 1600);
}

function newReview() {
  document.getElementById("text").value = "";
  show("review");
  document.getElementById("text").focus();
}

// ---------- screen 3: audit log ----------
function drawHistory() {
  const label = { high: "Held", medium: "Edits needed", low: "Cleared" };
  const box = document.getElementById("historyRows");

  if (!history.length) {
    box.innerHTML = `
      <div class="log-empty">
        No messages reviewed yet.<br>
        <button class="secondary" onclick="show('review')">Review your first message</button>
      </div>`;
    return;
  }

  box.innerHTML = history.map((r, i) => `
    <button class="log-row" onclick="drawResults(history[${i}]); show('results')">
      <span class="log-time">${formatTime(r.createdAt)}</span>
      <span class="log-channel">${escapeHtml(r.channel)}</span>
      <span class="log-text">${escapeHtml(r.original.replace(/\s+/g, " "))}</span>
      <span class="status ${r.riskLevel}">${label[r.riskLevel]}${r.escalate ? ", escalated" : ""}</span>
    </button>`).join("");
}

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ============================================================
// Converts the backend response shape into the frontend shape.
//   concernLevel      -> riskLevel (lowercased)
//   issues[]          -> flags[] (severity lowercased, policyReference -> policyRef)
//   suggestedRewrite  -> rewrite
// Generates id, summary, and escalate when the backend omits them.
// ============================================================
function normalizeResponse(raw, originalText) {
  // Defensive: if API Gateway isn't using Lambda proxy integration, the
  // browser may receive the raw Lambda envelope { statusCode, headers, body }
  // where `body` is a JSON string. Unwrap it so we read the real payload
  // instead of silently defaulting everything to "low"/no-issues.
  if (raw && typeof raw === "object" && "body" in raw && "statusCode" in raw) {
    try {
      raw = typeof raw.body === "string" ? JSON.parse(raw.body) : raw.body;
    } catch (e) {
      throw new Error("Could not parse review service response body.");
    }
  }

  // Surface backend-reported errors (e.g., { error: "..." }) instead of
  // treating them as a clean "all clear" result.
  if (raw && raw.error) {
    throw new Error(raw.error);
  }

  const riskLevel = String(raw.concernLevel || "low").toLowerCase();

  const flags = (raw.issues || []).map(issue => ({
    phrase: issue.phrase,
    category: issue.category,
    severity: String(issue.severity || "low").toLowerCase(),
    explanation: issue.explanation,
    policyRef: issue.policyReference,
  }));

  const rewrite = raw.suggestedRewrite || "";

  const highCount = flags.filter(f => f.severity === "high").length;

  // escalate when the backend doesn't say so: true if 2+ high-severity issues
  const escalate = raw.escalate != null ? raw.escalate : highCount >= 2;

  // summary: use backend's if present, otherwise build a sensible one
  const summary = raw.summary || (flags.length
    ? `${flags.length} issue${flags.length > 1 ? "s" : ""} marked below, with a compliant version ready to send.`
    : "No issues found. This message is ready to send as written.");

  // id: use backend's if present, otherwise generate one
  const id = raw.reviewID || raw.reviewId || raw.id || ("CS-" + String(Date.now()).slice(-6));

  return {
    id,
    riskLevel,
    summary,
    flags,
    rewrite: rewrite || originalText,
    escalate,
  };
}

// ============================================================
// FAKE DATA: stands in for the real backend until API_URL is set.
// ============================================================
const RULES = [
  {
    pattern: /\b(?:is |are )?guarantee[ds]? to\b/i,
    category: "Promise of performance",
    severity: "high",
    explanation: "Advisors can't promise investment results. Returns are never guaranteed.",
    policyRef: "Communications Policy 4.2",
    fix: "aims to",
  },
  {
    pattern: /\b\d+(?:\.\d+)?% (?:a|per) year\b/i,
    category: "Projected return",
    severity: "medium",
    explanation: "Specific return figures need a reasonable basis and full disclosures.",
    policyRef: "Communications Policy 4.5",
    fix: "over time",
  },
  {
    pattern: /\b(?:basically |completely |totally )?(?:risk[- ]free|no risk)\b/i,
    category: "Misleading risk claim",
    severity: "high",
    explanation: "Every investment carries risk. Calling one risk-free misleads the client.",
    policyRef: "Communications Policy 4.3",
    fix: "designed to manage risk",
  },
  {
    pattern: /\bcan'?t lose\b/i,
    category: "Promise of performance",
    severity: "high",
    explanation: "Implies a certain outcome, which isn't permitted.",
    policyRef: "Communications Policy 4.2",
    fix: "has growth potential",
  },
  {
    pattern: /\bthe best (fund|investment)\b/i,
    category: "Unsupported superlative",
    severity: "medium",
    explanation: "Claims like \"the best\" need evidence and context.",
    policyRef: "Communications Policy 5.1",
    fix: "a strong $1",
  },
  {
    pattern: /\b(?:act now|don'?t miss out|limited time)\b[^.!?\n]*[.!?]?/i,
    category: "Pressure to act",
    severity: "medium",
    explanation: "Urgency can push a client into a decision before they're ready.",
    policyRef: "Communications Policy 6.4",
    fix: "Happy to walk through whether it fits your goals.",
  },
];

function fakeReview(text) {
  const flags = [];
  let rewrite = text;

  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (m) {
      flags.push({
        phrase: m[0],
        category: rule.category,
        severity: rule.severity,
        explanation: rule.explanation,
        policyRef: rule.policyRef,
      });
      rewrite = rewrite.replace(rule.pattern, rule.fix);
    }
  }

  const highCount = flags.filter(f => f.severity === "high").length;
  if (flags.length) {
    rewrite = rewrite.trimEnd() + "\n\nInvesting involves risk, including possible loss of principal. Past performance does not guarantee future results.";
  }

  const result = {
    id: "CS-" + String(Date.now()).slice(-6),
    riskLevel: highCount ? "high" : flags.length ? "medium" : "low",
    summary: flags.length
      ? `${flags.length} issue${flags.length > 1 ? "s" : ""} marked below, with a compliant version ready to send.`
      : "No issues found. This message is ready to send as written.",
    flags,
    rewrite: flags.length ? rewrite : text,
    escalate: highCount >= 2,
  };

  return new Promise(resolve => setTimeout(() => resolve(result), 800));
}

drawChips();