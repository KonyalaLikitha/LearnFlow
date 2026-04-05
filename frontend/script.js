// ── Config ────────────────────────────────────────────────────────────────────
let API_BASE = localStorage.getItem('api_base') || 'http://127.0.0.1:5000';

// ── State ─────────────────────────────────────────────────────────────────────
let currentFlashcards = [];
let fcIndex           = 0;
let uploadedFile      = null;
let quizMode          = false;
let quizScore         = 0;
let quizIncorrect     = 0;
let quizAnswered      = false;  // has user revealed answer for current card

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

    // Core concepts
    renderConceptList('core-concepts-content', data.core_concepts || []);

    // Supporting concepts
    renderConceptList('supporting-concepts-content', data.supporting_concepts || []);

    // Wire toggle
    const toggle = document.getElementById('toggle-supporting');
    toggle.checked = true;
    toggle.onchange = () => {
        document.getElementById('supporting-concepts-content').style.display =
            toggle.checked ? 'block' : 'none';
    };

    // Relationships graph
    renderGraph(data.relationships || [], data.core_concepts || [], data.supporting_concepts || []);

    // Flashcards
    currentFlashcards = data.flashcards || [];
    fcIndex = 0;
    document.getElementById('fc-count-badge').textContent =
        `${currentFlashcards.length} flashcard${currentFlashcards.length !== 1 ? 's' : ''} generated`;

    document.getElementById('output-panel').style.display = 'flex';
}

function renderConceptList(containerId, concepts) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    if (!concepts.length) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">None found.</p>';
        return;
    }
    concepts.forEach(({ term, definition }) => {
        const div = document.createElement('div');
        div.className = 'concept-item';
        div.innerHTML = `<strong>${term}</strong> — ${definition}`;
        el.appendChild(div);
    });
}

// ── Knowledge Graph ────────────────────────────────────────────────────────────
function renderGraph(relationships, coreList, supportList) {
    // ─ text fallback list ─
    const listEl = document.getElementById('graph-text-list');
    listEl.innerHTML = '';
    if (!relationships.length) {
        listEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">No relationships found.</p>';
        document.getElementById('graph-svg-wrap').style.display = 'none';
        return;
    }
    document.getElementById('graph-svg-wrap').style.display = 'block';
    relationships.forEach(({ source, relation, target }) => {
        const row = document.createElement('div');
        row.className = 'rel-row';
        row.innerHTML =
            `<span class="rel-source">${source}</span>` +
            `<span class="rel-arrow">→ ${relation} →</span>` +
            `<span class="rel-target">${target}</span>`;
        listEl.appendChild(row);
    });

    // ─ SVG graph ─
    const svg    = document.getElementById('knowledge-graph');
    const W      = svg.parentElement.clientWidth || 700;
    const H      = 360;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    const coreTerms    = new Set(coreList.map(c => c.term.toLowerCase()));
    const supportTerms = new Set(supportList.map(c => c.term.toLowerCase()));

    // collect unique nodes
    const nodeMap = {};
    relationships.forEach(({ source, target }) => {
        [source, target].forEach(t => { if (t) nodeMap[t] = nodeMap[t] || { id: t, connections: 0 }; });
    });
    relationships.forEach(({ source, target }) => {
        if (nodeMap[source]) nodeMap[source].connections++;
        if (nodeMap[target]) nodeMap[target].connections++;
    });

    const nodes = Object.values(nodeMap);
    const total = nodes.length;

    // arrange in a circle
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) * 0.36;
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / total - Math.PI / 2;
        node.x = cx + r * Math.cos(angle);
        node.y = cy + r * Math.sin(angle);
    });

    // defs: arrowhead marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/>
        </marker>`;
    svg.appendChild(defs);

    // draw edges
    relationships.forEach(({ source, relation, target }) => {
        const s = nodeMap[source], t = nodeMap[target];
        if (!s || !t) return;

        const g    = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', s.x); line.setAttribute('y1', s.y);
        line.setAttribute('x2', t.x); line.setAttribute('y2', t.y);
        line.setAttribute('stroke', '#cbd5e1');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('marker-end', 'url(#arrow)');

        const mx   = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
        const lbl  = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', mx); lbl.setAttribute('y', my - 5);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '10');
        lbl.setAttribute('fill', '#94a3b8');
        lbl.textContent = relation;

        g.appendChild(line); g.appendChild(lbl);
        svg.appendChild(g);
    });

    // draw nodes
    nodes.forEach(node => {
        const key      = node.id.toLowerCase();
        const isCore   = coreTerms.has(key);
        const isSupport = supportTerms.has(key);
        const fill     = isCore ? '#6366f1' : isSupport ? '#8b5cf6' : '#64748b';
        const radius   = 10 + Math.min(node.connections * 3, 12);

        const g      = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = 'default';

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x); circle.setAttribute('cy', node.y);
        circle.setAttribute('r',  radius);
        circle.setAttribute('fill', fill);
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '2');

        // tooltip on hover
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${node.id} (${node.connections} connections)`;

        const words  = node.id.split(' ');
        const label  = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', node.x);
        label.setAttribute('y', node.y + radius + 14);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', isCore ? '700' : '400');
        label.setAttribute('fill', '#1e293b');

        // wrap long labels onto two lines
        if (words.length > 2) {
            const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            t1.setAttribute('x', node.x); t1.setAttribute('dy', '0');
            t1.textContent = words.slice(0, 2).join(' ');
            const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            t2.setAttribute('x', node.x); t2.setAttribute('dy', '13');
            t2.textContent = words.slice(2).join(' ');
            label.appendChild(t1); label.appendChild(t2);
        } else {
            label.textContent = node.id;
        }

        g.appendChild(circle); g.appendChild(title); g.appendChild(label);
        svg.appendChild(g);
    });
}

// ── Flashcard page ────────────────────────────────────────────────────────────
function renderFlashcardPage() {
    const viewer = document.getElementById('flashcard-viewer');
    const empty  = document.getElementById('no-flashcards');

    if (!currentFlashcards.length) {
        viewer.style.display = 'none';
        empty.style.display  = 'block';
        return;
    }
    empty.style.display  = 'none';
    viewer.style.display = 'block';
    document.getElementById('quiz-result').style.display = 'none';
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

    // always reset flip on card change
    document.getElementById('main-flashcard').classList.remove('flipped');

    if (quizMode) {
        quizAnswered = false;
        // lock mark buttons until answer is shown
        document.getElementById('fc-mark-correct').disabled   = true;
        document.getElementById('fc-mark-incorrect').disabled = true;
        document.getElementById('fc-show-answer').disabled    = false;
        document.getElementById('fc-tap-hint').style.display  = 'none';
    } else {
        document.getElementById('fc-tap-hint').style.display  = 'inline';
    }

    // disable prev/next at edges
    document.getElementById('fc-prev').disabled = fcIndex === 0;
    document.getElementById('fc-next').disabled = fcIndex === currentFlashcards.length - 1;

    // highlight mini grid
    document.querySelectorAll('.fc-mini').forEach((el, i) =>
        el.classList.toggle('active-mini', i === fcIndex));
}

function renderMiniGrid() {
    const grid = document.getElementById('fc-all-grid');
    grid.innerHTML = '';
    currentFlashcards.forEach(({ question }, i) => {
        const div = document.createElement('div');
        div.className = `fc-mini${i === fcIndex ? ' active-mini' : ''}`;
        div.innerHTML = `<div class="fc-mini-num">${i + 1}</div><div class="fc-mini-q">${question}</div>`;
        div.addEventListener('click', () => { fcIndex = i; renderCard(); });
        grid.appendChild(div);
    });
}

function updateQuizScorebar() {
    const remaining = currentFlashcards.length - quizScore - quizIncorrect;
    document.getElementById('score-correct').textContent   = `✅ ${quizScore} Correct`;
    document.getElementById('score-incorrect').textContent = `❌ ${quizIncorrect} Incorrect`;
    document.getElementById('score-remaining').textContent = `📋 ${remaining} Remaining`;
}

function enterQuizMode() {
    quizMode      = true;
    quizScore     = 0;
    quizIncorrect = 0;
    quizAnswered  = false;
    fcIndex       = 0;

    document.getElementById('fc-quiz-toggle').textContent    = '❌ Exit Quiz';
    document.getElementById('fc-quiz-toggle').classList.add('btn-quiz-active');
    document.getElementById('fc-study-controls').style.display = 'none';
    document.getElementById('fc-quiz-controls').style.display  = 'flex';
    document.getElementById('quiz-scorebar').style.display     = 'flex';
    document.getElementById('quiz-result').style.display       = 'none';
    document.getElementById('fc-all-grid').style.display       = 'none';

    updateQuizScorebar();
    renderCard();
}

function exitQuizMode() {
    quizMode = false;
    document.getElementById('fc-quiz-toggle').textContent = '🎯 Start Quiz Mode';
    document.getElementById('fc-quiz-toggle').classList.remove('btn-quiz-active');
    document.getElementById('fc-study-controls').style.display = 'flex';
    document.getElementById('fc-quiz-controls').style.display  = 'none';
    document.getElementById('quiz-scorebar').style.display     = 'none';
    document.getElementById('quiz-result').style.display       = 'none';
    document.getElementById('fc-all-grid').style.display       = 'grid';
    renderCard();
    renderMiniGrid();
}

function showQuizResult() {
    const total  = currentFlashcards.length;
    const pct    = Math.round((quizScore / total) * 100);
    const emoji  = pct === 100 ? '🌟' : pct >= 60 ? '👍' : '💪';
    const msg    = pct === 100 ? 'Perfect score!' : pct >= 60 ? 'Good job, keep it up!' : 'Keep practising!';

    document.getElementById('quiz-result-title').textContent =
        `${emoji} You got ${quizScore} / ${total} correct`;
    document.getElementById('quiz-result-text').textContent  =
        `${pct}% — ${msg}`;

    document.getElementById('quiz-result').style.display       = 'block';
    document.getElementById('fc-quiz-controls').style.display  = 'none';
    document.getElementById('fc-progress-fill').style.width    = `${pct}%`;
}

// ── Flashcard event listeners ─────────────────────────────────────────────────
document.getElementById('main-flashcard').addEventListener('click', () => {
    if (!quizMode) document.getElementById('main-flashcard').classList.toggle('flipped');
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

document.getElementById('fc-quiz-toggle').addEventListener('click', () => {
    quizMode ? exitQuizMode() : enterQuizMode();
});

document.getElementById('fc-show-answer').addEventListener('click', () => {
    document.getElementById('main-flashcard').classList.add('flipped');
    document.getElementById('fc-mark-correct').disabled   = false;
    document.getElementById('fc-mark-incorrect').disabled = false;
    document.getElementById('fc-show-answer').disabled    = true;
    quizAnswered = true;
});

document.getElementById('fc-mark-correct').addEventListener('click', () => {
    if (!quizAnswered) return;
    quizScore++;
    updateQuizScorebar();
    advanceQuiz();
});

document.getElementById('fc-mark-incorrect').addEventListener('click', () => {
    if (!quizAnswered) return;
    quizIncorrect++;
    updateQuizScorebar();
    advanceQuiz();
});

function advanceQuiz() {
    if (fcIndex < currentFlashcards.length - 1) {
        fcIndex++;
        renderCard();
    } else {
        showQuizResult();
    }
}

document.getElementById('fc-shuffle').addEventListener('click', () => {
    for (let i = currentFlashcards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentFlashcards[i], currentFlashcards[j]] = [currentFlashcards[j], currentFlashcards[i]];
    }
    fcIndex = 0;
    renderCard();
    renderMiniGrid();
});

document.getElementById('fc-restart').addEventListener('click', () => {
    fcIndex = 0;
    if (quizMode) enterQuizMode(); else renderCard();
});

document.getElementById('fc-quiz-again').addEventListener('click', () => {
    enterQuizMode();
});

// ── History ───────────────────────────────────────────────────────────────────
function saveToHistory(data, label) {
    const history = getHistory();
    history.unshift({
        id:                 Date.now(),
        label:              label.substring(0, 80),
        date:               new Date().toLocaleString(),
        summary:            data.summary,
        core_concepts:      data.core_concepts,
        supporting_concepts: data.supporting_concepts,
        relationships:      data.relationships,
        flashcards:         data.flashcards,
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
                <span class="badge">🔥 ${(item.core_concepts||[]).length} core</span>
                <span class="badge">💡 ${(item.supporting_concepts||[]).length} supporting</span>
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
    const totalCo = history.reduce((s, h) =>
        s + (h.core_concepts||[]).length + (h.supporting_concepts||[]).length, 0);
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
