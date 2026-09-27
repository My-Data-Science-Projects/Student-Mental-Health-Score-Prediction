/* ------------------------------------------------------------------
   Student Mental Health Score — front end for the FastAPI service.
   Change API_BASE if your server runs on a different host or port.
------------------------------------------------------------------ */

const API_BASE = "http://127.0.0.1:8000";

const MIN_SCORE = 0;
const MAX_SCORE = 10;
const ARC_LENGTH = Math.PI * 110;   // semicircle, radius 110

const form       = document.getElementById("predict-form");
const submitBtn  = document.getElementById("submit-btn");
const resetBtn   = document.getElementById("reset-btn");
const scoreEl    = document.getElementById("score");
const bandEl     = document.getElementById("band");
const statusEl   = document.getElementById("status");
const valueArc   = document.getElementById("gauge-value");
const needle     = document.getElementById("needle");
const budgetEl   = document.getElementById("budget");
const budgetNote = document.getElementById("budget-note");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- gauge tick marks ---------- */

function drawTicks() {
  const g = document.getElementById("gauge-ticks");
  const cx = 150, cy = 150;
  const NS = "http://www.w3.org/2000/svg";

  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI - (i / 10) * Math.PI;   // 180deg -> 0deg
    const major = i % 5 === 0;
    const rOuter = major ? 92 : 94;
    const rInner = major ? 82 : 87;

    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", cx + Math.cos(angle) * rInner);
    line.setAttribute("y1", cy - Math.sin(angle) * rInner);
    line.setAttribute("x2", cx + Math.cos(angle) * rOuter);
    line.setAttribute("y2", cy - Math.sin(angle) * rOuter);
    line.setAttribute("class", major ? "tick tick-major" : "tick");
    g.appendChild(line);

    if (major) {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", cx + Math.cos(angle) * 70);
      t.setAttribute("y", cy - Math.sin(angle) * 70 + 4);
      t.setAttribute("class", "tick-label");
      t.textContent = i;
      g.appendChild(t);
    }
  }
}
drawTicks();

/* ---------- slider readouts + 24 hour budget ---------- */

const hourSliders = document.querySelectorAll('input[type="range"][data-budget]');

function formatValue(input) {
  const v = parseFloat(input.value);
  return input.dataset.budget !== undefined ? v.toFixed(1) + " h" : String(v);
}

function syncOutputs() {
  document.querySelectorAll('input[type="range"]').forEach(input => {
    const out = document.getElementById(input.id + "-out");
    if (out) out.textContent = formatValue(input);
  });
}

function syncBudget() {
  let total = 0;
  hourSliders.forEach(s => {
    const hrs = parseFloat(s.value);
    total += hrs;
    const seg = document.getElementById("seg-" + s.dataset.budget);
    if (seg) seg.style.width = Math.min(hrs / 24, 1) * 100 + "%";
  });

  const rounded = Math.round(total * 10) / 10;
  const over = rounded > 24;
  budgetEl.classList.toggle("over", over);
  budgetNote.textContent = over
    ? `${rounded} hours entered — that is ${Math.round((rounded - 24) * 10) / 10} more than a day holds`
    : `${rounded} of 24 hours accounted for`;
}

form.addEventListener("input", e => {
  if (e.target.type === "range") { syncOutputs(); syncBudget(); }
});

syncOutputs();
syncBudget();

/* ---------- score bands ---------- */

function bandFor(score) {
  if (score < 5)  return { label: "Low — poor wellbeing signals",  color: "#C2456B" };
  if (score < 7)  return { label: "Moderate — room to improve",    color: "#E0A458" };
  return            { label: "Healthy — strong wellbeing signals", color: "#2E9E7B" };
}

/* ---------- gauge rendering ---------- */

function renderGauge(score) {
  const clamped = Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
  const pct = (clamped - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);

  valueArc.style.strokeDashoffset = ARC_LENGTH * (1 - pct);
  needle.style.transform = `rotate(${-90 + pct * 180}deg)`;

  const band = bandFor(clamped);
  scoreEl.style.color = band.color;
  bandEl.textContent = band.label;
  bandEl.classList.add("has-value");

  countTo(score);
}

function countTo(target) {
  if (reduceMotion) { scoreEl.textContent = target.toFixed(2); return; }

  const start = performance.now();
  const duration = 900;

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    scoreEl.textContent = (target * eased).toFixed(2);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function clearGauge() {
  valueArc.style.strokeDashoffset = ARC_LENGTH;
  needle.style.transform = "rotate(-90deg)";
  scoreEl.textContent = "—";
  scoreEl.style.color = "";
  bandEl.textContent = "Fill in the form and predict to see a score";
  bandEl.classList.remove("has-value");
  statusEl.textContent = "";
  statusEl.classList.remove("error");
}

/* ---------- build the request body ---------- */

function collectPayload() {
  const fd = new FormData(form);
  return {
    age:                     parseInt(fd.get("age"), 10),
    gender:                  fd.get("gender"),
    academic_level:          fd.get("academic_level"),
    most_used_platform:      fd.get("most_used_platform"),
    purpose_of_use:          fd.get("purpose_of_use"),
    avg_daily_usage_hours:   parseFloat(fd.get("avg_daily_usage_hours")),
    daily_unlocks:           parseInt(fd.get("daily_unlocks"), 10),
    study_hours:             parseFloat(fd.get("study_hours")),
    physical_activity_hours: parseFloat(fd.get("physical_activity_hours")),
    sleep_hours_per_night:   parseFloat(fd.get("sleep_hours_per_night")),
    stress_level:            fd.get("stress_level")
  };
}

/* ---------- submit ---------- */

form.addEventListener("submit", async e => {
  e.preventDefault();

  const age = parseInt(document.getElementById("age").value, 10);
  if (!Number.isFinite(age) || age < 10 || age > 100) {
    setError("Enter an age between 10 and 100.");
    document.getElementById("age").focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Predicting…";
  statusEl.classList.remove("error");
  statusEl.textContent = "Sending to the model…";

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectPayload())
    });

    if (!res.ok) {
      let detail = `Server returned ${res.status}.`;
      try {
        const err = await res.json();
        if (Array.isArray(err.detail) && err.detail.length) {
          const d = err.detail[0];
          detail = `${d.loc?.slice(-1)[0] ?? "Input"}: ${d.msg}`;
        } else if (typeof err.detail === "string") {
          detail = err.detail;
        }
      } catch (_) { /* response was not JSON */ }
      setError(detail);
      return;
    }

    const data = await res.json();
    renderGauge(data.predicted_mental_health_score);
    statusEl.textContent = "";

    if (window.matchMedia("(max-width: 860px)").matches) {
      document.getElementById("result-panel")
        .scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }

  } catch (_) {
    setError(`Could not reach the API at ${API_BASE}. Start it with: uvicorn main:app --reload`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Predict score";
  }
});

function setError(message) {
  statusEl.textContent = message;
  statusEl.classList.add("error");
}

/* ---------- reset ---------- */

resetBtn.addEventListener("click", () => {
  form.reset();
  syncOutputs();
  syncBudget();
  clearGauge();
});
