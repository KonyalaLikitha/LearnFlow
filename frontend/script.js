// ── Config ────────────────────────────────────────────────────────────────────
let API_BASE = localStorage.getItem('api_base') || 'http://127.0.0.1:5000';

// ── State ─────────────────────────────────────────────────────────────────────
let currentFlashcards = [];
let fcIndex           = 0;
let uploadedFile      = null;

// ── Page routing ──────────────────────────────────────────────────────────────
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`page-${name}`).classList.add('active');
    document.querySelector(`.nav-item[data-page="${name}"]`).classList.add('active');

    const titles = { home:'Dashboard', analyzer:'Study Analyzer', flashcards:'Flashcards', history:'History', settings:'Settings' };
    document.getElementById('topbar-title').textContent = titles[name] || name;

    if (name === 'flashcards') renderFlashcardPage();
    if (name === 'history')    renderHistory();
    if (name === 'home')       updateStats();

    // close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); showPage(item.dataset.page); });
});

document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// ── File upload ───────────────────────────────────────────────────────────────
const uploadArea      = document.getElementById('upload-area');
const fileInput       = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'var(--border)';
});

uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!['application/pdf', 'text/plain'].includes(file.type)) {
        showError('Please upload a PDF or TXT file'); return;
    }
    uploadedFile = file;
    fileNameDisplay.textContent  = `📎 ${file.name}`;
    fileNameDisplay.style.display = 'inline-block';
}

// ── Analyze ───────────────────────────────────────────────────────────────────
document.getElementById('analyze-btn').addEventListener('click', async function () {
    const text = document.getElementById('study-text').value.trim();

    if (!text && !uploadedFile) {
        showError('Please paste some study material or upload a file first.'); return;
    }

    setStatus('loading', 'Analyzing...');
    setLoading(true);
    hideError();
    document.getElementById('output-panel').style.display = 'none';

    try {
        let response;
        if (uploadedFile) {
            const form = new FormData();
            form.append('file', uploadedFile);
            response = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
        } else {
            response = await fetch(`${API_BASE}/analyze`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ text }),
            });
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Server error');

        renderOutput(data);
        saveToHistory(data, text || uploadedFile.name);
        updateStats();
        setStatus('ready', 'Done ✓');

    } catch (err) {
        showError(`Error: ${err.message}`);
        setStatus('error', 'Error');
    } finally {
        setLoading(false);
    }
});

// ── Render output ─────────────────────────────────────────────────────────────
function renderOutput(data) {
    // Summary
    document.getElementById('summary-content').textContent = data.summary || '—';

    // Concepts
    const conceptsEl = document.getElementById('concepts-content');
    conceptsEl.innerHTML = '';
    (data.concepts || []).forEach(({ term, definition }) => {
        const div = document.createElement('div');
        div.className = 'concept-item';
        div.innerHTML = `<strong>${term}</strong> — ${definition}`;
        conceptsEl.appendChild(div);
    });

    // Flashcards
    currentFlashcards = data.flashcards || [];
    fcIndex = 0;
    document.getElementById('fc-count-badge').textContent =
        `${currentFlashcards.length} flashcard${currentFlashcards.length !== 1 ? 's' : ''} generated`;

    document.getElementById('output-panel').style.display = 'flex';
}

// ── Flashcard page ────────────────────────────────────────────────────────────
function renderFlashcardPage() {
    const viewer   = document.getElementById('flashcard-viewer');
    const empty    = document.getElementById('no-flashcards');

    if (!currentFlashcards.length) {
        viewer.style.display = 'none';
        empty.style.display  = 'block';
        return;
    }

    empty.style.display  = 'none';
    viewer.style.display = 'block';
    renderCard();
    renderMiniGrid();
}

function renderCard() {
    const fc = currentFlashcards[fcIndex];
    document.getElementById('fc-question').textContent = fc.question;
    document.getElementById('fc-answer').textContent   = fc.answer;
    document.getElementById('fc-counter').textContent  = `${fcIndex + 1} / ${currentFlashcards.length}`;

    const pct = ((fcIndex + 1) / currentFlashcards.length) * 100;
    document.getElementById('fc-progress-fill').style.width = `${pct}%`;

    // reset flip
    document.getElementById('main-flashcard').classList.remove('flipped');

    // highlight mini
    document.querySelectorAll('.fc-mini').forEach((el, i) => {
        el.classList.toggle('active-mini', i === fcIndex);
    });
}

function renderMiniGrid() {
    const grid = document.getElementById('fc-all-grid');
    grid.innerHTML = '';
    currentFlashcards.forEach(({ question, answer }, i) => {
        const div = document.createElement('div');
        div.className = `fc-mini${i === fcIndex ? ' active-mini' : ''}`;
        div.innerHTML = `<div class="fc-mini-q">${question}</div><div class="fc-mini-a">${answer}</div>`;
        div.addEventListener('click', () => { fcIndex = i; renderCard(); });
        grid.appendChild(div);
    });
}

document.getElementById('main-flashcard').addEventListener('click', () => {
    document.getElementById('main-flashcard').classList.toggle('flipped');
});

document.getElementById('fc-flip').addEventListener('click', () => {
    document.getElementById('main-flashcard').classList.toggle('flipped');
});

document.getElementById('fc-prev').addEventListener('click', () => {
    if (fcIndex > 0) { fcIndex--; renderCard(); }
});

document.getElementById('fc-next').addEventListener('click', () => {
    if (fcIndex < currentFlashcards.length - 1) { fcIndex++; renderCard(); }
});

// ── History ───────────────────────────────────────────────────────────────────
function saveToHistory(data, label) {
    const history = getHistory();
    history.unshift({
        id:        Date.now(),
        label:     label.substring(0, 80),
        date:      new Date().toLocaleString(),
        summary:   data.summary,
        concepts:  data.concepts,
        flashcards: data.flashcards,
    });
    localStorage.setItem('ssa_history', JSON.stringify(history.slice(0, 20)));
}

function getHistory() {
    try { return JSON.parse(localStorage.getItem('ssa_history') || '[]'); }
    catch { return []; }
}

function renderHistory() {
    const history = getHistory();
    const list    = document.getElementById('history-list');
    const empty   = document.getElementById('no-history');

    list.innerHTML = '';

    if (!history.length) {
        empty.style.display = 'block'; return;
    }

    empty.style.display = 'none';
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div>
                <div class="history-meta">${item.date}</div>
                <div class="history-preview">${item.summary ? item.summary.substring(0, 120) + '…' : item.label}</div>
            </div>
            <div class="history-badges">
                <span class="badge">💡 ${(item.concepts||[]).length} concepts</span>
                <span class="badge">🃏 ${(item.flashcards||[]).length} cards</span>
            </div>`;
        div.addEventListener('click', () => {
            currentFlashcards = item.flashcards || [];
            fcIndex = 0;
            renderOutput(item);
            showPage('analyzer');
        });
        list.appendChild(div);
    });
}

function clearHistory() {
    if (confirm('Clear all history?')) {
        localStorage.removeItem('ssa_history');
        renderHistory();
        updateStats();
    }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
    const history = getHistory();
    const totalFC = history.reduce((s, h) => s + (h.flashcards||[]).length, 0);
    const totalCo = history.reduce((s, h) => s + (h.concepts||[]).length, 0);
    document.getElementById('stat-sessions').textContent   = history.length;
    document.getElementById('stat-flashcards').textContent = totalFC;
    document.getElementById('stat-concepts').textContent   = totalCo;
}

// ── Settings ──────────────────────────────────────────────────────────────────
function saveSettings() {
    const url = document.getElementById('setting-api-url').value.trim();
    if (url) { API_BASE = url; localStorage.setItem('api_base', url); }
    alert('Settings saved!');
}

document.getElementById('setting-api-url').value = API_BASE;

// ── UI helpers ────────────────────────────────────────────────────────────────
function setLoading(on) {
    const btn = document.getElementById('analyze-btn');
    btn.querySelector('.btn-text').style.display   = on ? 'none'         : 'inline-flex';
    btn.querySelector('.btn-loader').style.display = on ? 'inline-flex'  : 'none';
    btn.disabled = on;
}

function setStatus(type, text) {
    const dot  = document.getElementById('status-dot');
    const label = document.getElementById('status-text');
    dot.className  = `status-dot ${type === 'ready' ? '' : type}`;
    label.textContent = text;
}

function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent    = msg;
    el.style.display  = 'block';
}

function hideError() {
    document.getElementById('error-msg').style.display = 'none';
}

function copyText(elementId) {
    const text = document.getElementById(elementId).innerText;
    navigator.clipboard.writeText(text)
        .then(() => { setStatus('ready', 'Copied!'); setTimeout(() => setStatus('ready','Ready'), 2000); })
        .catch(() => showError('Copy failed'));
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateStats();
