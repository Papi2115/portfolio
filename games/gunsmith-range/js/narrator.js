// narrator.js — Kpt. Maras dialogue/subtitle system for GUNSMITH RANGE.
//
// Self-contained ES module: injects its own <style> + container DOM at load,
// exposes say() / sayOnce() / clearQueue(). No external deps, no other files touched.
//
// Public API (frozen contract — main menu & mission system call these exact names):
//   say(lines, opts={})           -> queue a sequence of subtitle lines
//   sayOnce(key, lines, opts={})  -> like say(), but only ever once per browser
//   clearQueue()                  -> dismiss current + empty the queue
//
// opts: { speaker='KPT. MARAS', instant=false, onDone=fn, msPerLine=<number> }

const DEFAULT_SPEAKER = 'CAPT. MARAS';
const MS_PER_CHAR = 50;      // reading-time heuristic
const MIN_MS = 1800;         // floor per line
const MAX_MS = 6000;         // ceiling per line
const SEEN_PREFIX = 'narrator_seen_';

// --- internal state ---------------------------------------------------------

const queue = [];            // array of jobs: { lines: [str...], opts }
// Keys of sayOnce() jobs already queued this SESSION but not yet marked "seen"
// in localStorage (seen is written only when the job actually starts). Guards
// against duplicate enqueues when sayOnce(key) is called repeatedly — e.g. every
// frame from a proximity check — while a *previous* job is still playing and the
// key hasn't been persisted yet. Purely in-memory; localStorage takes over once
// the job starts. Does not change the public sayOnce() contract.
const pendingKeys = new Set();
let running = false;         // whether a job is currently being processed
let currentJob = null;       // job aktualnie w trakcie odtwarzania (running===true) — potrzebny,
                             // by clearQueue() mógł odpalić onDone przerwanego pokazu (patrz niżej)
let lineTimer = null;        // active setTimeout id for auto-advance
let els = null;              // { box, portrait, speaker, text } once mounted

// --- DOM / style bootstrap --------------------------------------------------

function ensureMounted() {
  if (els) return els;
  if (typeof document === 'undefined') return null; // guard for non-DOM env

  // Inject stylesheet once.
  if (!document.getElementById('narrator-style')) {
    const style = document.createElement('style');
    style.id = 'narrator-style';
    style.textContent = `
      #narrator-box {
        position: fixed;
        left: 50%;
        bottom: 180px;
        transform: translateX(-50%);
        max-width: min(720px, 84%); /* % — box w skalowanym #hud, nie vw (ta sama klasa co #wpanel/.mm-frame) */
        display: none; /* toggled to flex when shown */
        opacity: 0;
        transition: opacity .25s ease;
        box-sizing: border-box;
        padding: 14px 20px;
        gap: 14px;
        align-items: flex-start;
        background: rgba(8,18,13,.88);
        border: 1px solid rgba(77,255,160,.35);
        border-radius: 12px;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 10px 40px rgba(0,0,0,.6);
        font-family: 'Segoe UI', Arial, sans-serif;
        pointer-events: none;
        z-index: 50;
      }
      #narrator-box.narrator-show { opacity: 1; }
      #narrator-portrait {
        flex: 0 0 auto;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(77,255,160,.12);
        border: 1px solid rgba(77,255,160,.35);
        color: #4dffa0;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 1px;
      }
      #narrator-body { flex: 1 1 auto; min-width: 0; }
      #narrator-speaker {
        color: #4dffa0;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 3.5px;
        font-size: 12px;
        margin-bottom: 5px;
      }
      #narrator-text {
        color: #e8fff2;
        font-size: 15.5px;
        letter-spacing: normal;
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);
  }

  // The HUD uses pointer-events:none; append there if present so we match the
  // existing HUD layering, else fall back to body. Container is pointer-events:none
  // regardless so it never blocks pointer-lock / mouse.
  const host = document.getElementById('hud') || document.body;

  let box = document.getElementById('narrator-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'narrator-box';

    const portrait = document.createElement('div');
    portrait.id = 'narrator-portrait';
    portrait.textContent = 'CM';

    const body = document.createElement('div');
    body.id = 'narrator-body';

    const speaker = document.createElement('div');
    speaker.id = 'narrator-speaker';

    const text = document.createElement('div');
    text.id = 'narrator-text';

    body.appendChild(speaker);
    body.appendChild(text);
    box.appendChild(portrait);
    box.appendChild(body);
    host.appendChild(box);
  }

  els = {
    box,
    portrait: box.querySelector('#narrator-portrait'),
    speaker: box.querySelector('#narrator-speaker'),
    text: box.querySelector('#narrator-text'),
  };
  return els;
}

// --- helpers ----------------------------------------------------------------

function normalizeLines(lines) {
  let arr;
  if (Array.isArray(lines)) arr = lines;
  else if (lines == null) arr = [];
  else arr = [lines];
  // Coerce to strings and drop empty/whitespace-only lines so an empty string
  // or [] never gets stuck showing forever.
  return arr
    .map((l) => (l == null ? '' : String(l)))
    .filter((l) => l.trim().length > 0);
}

function computeDuration(line, opts) {
  if (opts && typeof opts.msPerLine === 'number' && isFinite(opts.msPerLine)) {
    return Math.max(0, opts.msPerLine);
  }
  const ms = line.length * MS_PER_CHAR;
  return Math.min(MAX_MS, Math.max(MIN_MS, ms));
}

function showBox() {
  const e = ensureMounted();
  if (!e) return;
  e.box.style.display = 'flex';
  // Force reflow so the opacity transition actually plays from 0.
  void e.box.offsetWidth;
  e.box.classList.add('narrator-show');
}

function hideBox() {
  const e = ensureMounted();
  if (!e) return;
  e.box.classList.remove('narrator-show');
  e.box.style.display = 'none';
}

function clearTimer() {
  if (lineTimer !== null) {
    clearTimeout(lineTimer);
    lineTimer = null;
  }
}

// --- queue processing -------------------------------------------------------

function processNext() {
  if (running) return;
  const job = queue.shift();
  if (!job) {
    hideBox();
    return;
  }
  running = true;
  currentJob = job;
  runJob(job);
}

function runJob(job) {
  const e = ensureMounted();
  if (!e) {
    // No DOM available — just finish immediately so onDone still fires.
    finishJob(job);
    return;
  }

  // Fire the internal start hook (sayOnce uses this to mark the entry as seen
  // the moment its first line begins — showing once matters more than finishing).
  if (typeof job._onStart === 'function') {
    try { job._onStart(); } catch (err) { /* ignore */ }
    job._onStart = null;
  }

  const speaker = (job.opts && job.opts.speaker) || DEFAULT_SPEAKER;
  e.speaker.textContent = speaker;

  let idx = 0;
  const lines = job.lines;

  const advance = () => {
    clearTimer();
    if (idx >= lines.length) {
      finishJob(job);
      return;
    }
    const line = lines[idx];
    e.text.textContent = line;
    showBox();
    const dur = computeDuration(line, job.opts);
    idx += 1;
    lineTimer = setTimeout(advance, dur);
  };

  advance();
}

function finishJob(job) {
  clearTimer();
  running = false;
  currentJob = null;
  const onDone = job && job.opts && job.opts.onDone;
  // Hide before invoking onDone; processNext() re-shows if there's more queued.
  if (queue.length === 0) hideBox();
  if (typeof onDone === 'function') {
    try { onDone(); } catch (err) { /* swallow — narrator must not break callers */ }
  }
  processNext();
}

// --- public API -------------------------------------------------------------

export function say(lines, opts = {}) {
  const normalized = normalizeLines(lines);
  if (normalized.length === 0) return; // nothing to show, no-op
  queue.push({ lines: normalized, opts: opts || {} });
  processNext();
}

export function sayOnce(key, lines, opts = {}) {
  // Check localStorage BEFORE queueing so repeat loads never re-show, and mark
  // seen at the moment it STARTS showing (showing once > showing to completion).
  const storageKey = SEEN_PREFIX + String(key == null ? '' : key);

  let seen = false;
  try {
    seen = typeof localStorage !== 'undefined' &&
           localStorage.getItem(storageKey) !== null;
  } catch (err) {
    seen = false; // localStorage unavailable (private mode etc.) — degrade to always-show
  }
  if (seen) return; // silent no-op, not even queued

  // Also guard against duplicate enqueues WITHIN this session: if this key is
  // already sitting in the queue but hasn't started yet (so "seen" isn't written
  // to localStorage), a repeated call — e.g. a per-frame proximity check firing
  // every frame while an earlier job still plays — must not pile on more copies.
  if (pendingKeys.has(storageKey)) return;

  const normalized = normalizeLines(lines);
  if (normalized.length === 0) return;

  // Wrap onDone is not where we mark seen — we mark it when the job actually
  // starts its first line. Intercept via a lightweight wrapper on the job.
  const userOpts = opts || {};
  const wrapped = Object.assign({}, userOpts);
  let marked = false;
  const markSeen = () => {
    if (marked) return;
    marked = true;
    // Job has started — localStorage now owns "seen" gating, so the in-memory
    // pending guard for this key is no longer needed; drop it to keep the Set small.
    pendingKeys.delete(storageKey);
    try { localStorage.setItem(storageKey, '1'); } catch (err) { /* ignore */ }
  };

  // We need "mark on start". runJob calls showBox on the first advance; simplest
  // reliable hook: mark seen right before we enqueue-run, guarded so it only
  // fires when this job actually begins. Since processNext runs synchronously to
  // the first line when idle, and queued jobs begin later, wrap onDone is too
  // late — instead we mark via an onStart-style shim using a getter on lines.
  // Practical approach: mark seen synchronously if the queue is idle (job starts
  // now), otherwise mark when the previous job finishes and this one starts.
  // The robust general solution: attach a marker the runner calls. We add an
  // internal _onStart to the job.
  pendingKeys.add(storageKey);
  queue.push({ lines: normalized, opts: wrapped, _onStart: markSeen });
  processNext();
}

export function clearQueue() {
  clearTimer();
  // Jeśli akurat GRA jakiś job — jest przerywany, więc jego onDone musi jeszcze
  // odpalić (semantyka: "ten pokaz się zakończył/został przerwany"). Bez tego
  // callbacki sprzątające (np. hide promptu [F]/myszki w tutorialu) zawisłyby na
  // stałe, gdy misja woła clearQueue() w trakcie narracji. Odpalamy TYLKO dla joba
  // w `running` (currentJob) — joby wciąż w kolejce nigdy nie ruszyły, więc ich
  // onDone się NIE należy. Robimy to PRZED resetem stanu.
  if (currentJob) {
    const onDone = currentJob.opts && currentJob.opts.onDone;
    currentJob = null;
    if (typeof onDone === 'function') {
      try { onDone(); } catch (err) { /* swallow — narrator must not break callers */ }
    }
  }
  queue.length = 0;
  running = false;
  // Drop any not-yet-started sayOnce keys: their jobs are being discarded and
  // "seen" was never written, so they must be allowed to queue again later this
  // session rather than stay permanently blocked by a stale pending entry.
  pendingKeys.clear();
  hideBox();
}
