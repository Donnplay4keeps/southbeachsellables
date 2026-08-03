// =====================================================================
// ems_stdtest — Medical Tablet UI
// =====================================================================

const RESOURCE = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'ems_stdtest';
const POST = async (event, data) => {
    try {
        const r = await fetch(`https://${RESOURCE}/${event}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data || {}),
        });
        return await r.json().catch(() => ({}));
    } catch (_) { return {}; }
};

// ---------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------
const state = {
    mode: 'doctor',        // 'doctor' | 'patient'
    samples: [],
    myTests: [],
    diseases: [],
    doctorId: null,
    currentSample: null,   // sample being tested
    minigame: null,        // active minigame state
    patientRows: [],
};

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

const fmtTime = (unix) => {
    if (!unix) return '—';
    const d = new Date(unix * 1000);
    return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
};
const fmtAgo = (unix) => {
    if (!unix) return '';
    const sec = Math.max(0, Math.floor(Date.now() / 1000 - unix));
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
};
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function toast(msg, kind = 'info') {
    const stack = $('#toast-stack');
    const el = document.createElement('div');
    el.className = `toast ${kind === 'success' ? 'success' : kind === 'error' ? 'error' : ''}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 260);
    }, 3200);
}

function setStatusTime() {
    const t = new Date();
    const h = String(t.getHours()).padStart(2, '0');
    const m = String(t.getMinutes()).padStart(2, '0');
    $('#status-time').textContent = `${h}:${m}`;
}
setInterval(setStatusTime, 30000);
setStatusTime();

// ---------------------------------------------------------------------
// OPEN / CLOSE
// ---------------------------------------------------------------------
function openApp(mode) {
    state.mode = mode || 'doctor';
    document.body.classList.remove('hidden');
    $('#app').classList.remove('hidden');
    $('#mode-badge').textContent = state.mode === 'patient' ? 'PATIENT' : 'DOCTOR';

    if (state.mode === 'patient') {
        // Patient view: hide doctor nav + show patient modal directly
        $('#doctor-nav').style.display = 'none';
        $('.content').style.display = 'none';
        // Patient modal opens in render step below
    } else {
        $('#doctor-nav').style.display = '';
        $('.content').style.display = '';
        showSection('dashboard');
    }
}

function closeApp() {
    $('#app').classList.add('hidden');
    document.body.classList.add('hidden');
    // Persist a pending minigame so it can resume next time the tablet opens
    hideMinigame({ persist: true });
    hideResults();
    hidePatientView();
    POST('close', {});
}

$('#btn-close').addEventListener('click', closeApp);

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!$('#minigame-modal').classList.contains('hidden')) {
            // Pause the minigame and drop back to the tablet — no abandon prompt
            hideMinigame({ persist: true });
            toast('Test paused — click Resume in Lab Queue to continue.', 'info');
            return;
        }
        if (!$('#results-modal').classList.contains('hidden')) { hideResults(); return; }
        if (!$('#patient-view').classList.contains('hidden')) { hidePatientView(); closeApp(); return; }
        closeApp();
    }
});

// ---------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------
function showSection(name) {
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.section === name));
    $$('.section').forEach((s) => s.classList.remove('active'));
    const sec = $(`#section-${name}`);
    if (sec) sec.classList.add('active');
    $('#brand-section').textContent = ({
        dashboard:   'Dashboard',
        request:     'Test Request',
        appointment: 'Current Appointment',
        labqueue:    'Lab Queue',
        tosend:      'Pending Release',
        mytests:     'My History',
        lookup:      'Patient Lookup',
    })[name] || 'Dashboard';

    // Tab-specific actions
    if (name === 'request')     { startNearbyPolling(); }
    else                        { stopNearbyPolling(); }
    if (name === 'labqueue')    { POST('requestLabSamples', {}); }
    if (name === 'tosend')      { POST('requestUnsentResults', {}); }
    if (name === 'appointment') { renderAppointment(); }
}
$$('.nav-item').forEach((b) => b.addEventListener('click', () => showSection(b.dataset.section)));

$('#btn-refresh').addEventListener('click', () => {
    POST('refresh', {});
    toast('Refreshing...', 'info');
});

// ---------------------------------------------------------------------
// RENDER: DASHBOARD + LISTS
// ---------------------------------------------------------------------
function renderDashboard() {
    const samples = state.samples || [];
    const myTests = state.myTests || [];
    $('#s-pending').textContent = samples.length;
    $('#s-total').textContent = myTests.length;

    const today = new Date(); today.setHours(0,0,0,0);
    const todayUnix = today.getTime() / 1000;
    $('#s-today').textContent = myTests.filter(t => (t.tested_at || 0) >= todayUnix).length;
    $('#s-notified').textContent = myTests.filter(t => !!t.notified_at).length;

    renderDiseaseChart();
}

// Disease prevalence bar chart — horizontal bars, one per disease,
// width scaled to the highest count.
function renderDiseaseChart() {
    const wrap = $('#disease-chart');
    if (!wrap) return;
    const stats = state.diseaseStats || {};
    const diseases = (state.diseases && state.diseases.length) ? state.diseases : [
        { id: 'chlamydia', name: 'Chlamydia' }, { id: 'gonorrhea', name: 'Gonorrhea' },
        { id: 'syphilis',  name: 'Syphilis'  }, { id: 'herpes',    name: 'Herpes (HSV)' },
        { id: 'hiv',       name: 'HIV'       }, { id: 'hpv',       name: 'HPV' },
    ];
    const total = state.totalTests || 0;

    const counts = diseases.map(d => ({ name: d.name, count: stats[d.id] || 0 }));
    const max = Math.max(1, ...counts.map(c => c.count));
    const anyPositive = counts.some(c => c.count > 0);

    if (total === 0) {
        wrap.innerHTML = '<div class="empty-state">No completed tests yet.</div>';
        return;
    }

    const bars = counts.map(c => {
        const pct = (c.count / max) * 100;
        const widthPct = c.count === 0 ? 0 : Math.max(6, pct); // min visible sliver
        return `
            <div class="dc-row">
                <div class="dc-label">${esc(c.name)}</div>
                <div class="dc-track">
                    <div class="dc-bar ${c.count === 0 ? 'dc-bar-empty' : ''}" style="width:${widthPct}%;">
                        <span class="dc-count">${c.count}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    wrap.innerHTML = `
        <div class="dc-meta">Based on <strong>${total}</strong> completed test${total === 1 ? '' : 's'}${anyPositive ? '' : ' — all clear so far'}</div>
        <div class="dc-bars">${bars}</div>
    `;
}

// ---------------------------------------------------------------------
// v2: NEARBY PATIENTS POLLING
// ---------------------------------------------------------------------
let nearbyTimer = null;
function startNearbyPolling() {
    stopNearbyPolling();
    POST('requestNearby', {});
    nearbyTimer = setInterval(() => POST('requestNearby', {}), 2500);
}
function stopNearbyPolling() {
    if (nearbyTimer) { clearInterval(nearbyTimer); nearbyTimer = null; }
}

function renderNearby(rows) {
    rows = rows || [];
    // Belt-and-suspenders: filter out the viewing doctor by citizen ID,
    // in case any framework quirk lets them slip through server-side.
    if (state.doctorId) {
        rows = rows.filter(p => p.patientId !== state.doctorId);
    }
    $('#pill-nearby').textContent = rows.length;
    $('#nearby-meta').textContent = `${rows.length} ${rows.length === 1 ? 'person' : 'people'} · refreshing every 2.5s`;

    const wrap = $('#nearby-list');
    if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">No one within range. Move closer to a patient.</div>';
        return;
    }
    wrap.innerHTML = rows.map(p => {
        const initials = (p.patientName || 'PT').split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
        const disabled = p.hasRequest || state.appointment;
        return `
            <div class="nearby-row">
                <div class="nearby-avatar">${initials}</div>
                <div class="nearby-info">
                    <div class="nearby-name">${esc(p.patientName)}</div>
                    <div class="nearby-meta-sub">
                        <span><i class="fa-solid fa-ruler"></i> ${p.distance}m</span>
                        ${p.hasRequest ? '<span><i class="fa-solid fa-circle-exclamation"></i> already in test</span>' : ''}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" data-request="${p.source}" ${disabled ? 'disabled' : ''}>
                    <i class="fa-solid fa-paper-plane"></i> Request Test
                </button>
            </div>
        `;
    }).join('');
    wrap.querySelectorAll('[data-request]').forEach(b =>
        b.addEventListener('click', () => {
            const src = Number(b.dataset.request);
            POST('requestPatientTest', { targetSource: src });
            const row = rows.find(r => r.source === src);
            startAppointment({ status: 'pending', patientName: row && row.patientName });
        }));
}

// ---------------------------------------------------------------------
// v3: CURRENT APPOINTMENT — live tracking section
// ---------------------------------------------------------------------
// state.appointment = {
//   requestId, patientName, status, samplesDone, samplesNeeded,
//   panels: { bacterial:{status,ready_at}, ... }
// }
// status flow: pending → accepted → on_bed → drawing → samples_drawn
//              → testing → completed
// ---------------------------------------------------------------------

const APPT_STAGE_INDEX = {
    pending:        0,
    accepted:       1,
    on_bed:         2,
    drawing:        3,
    samples_drawn:  4,
    testing:        4,
    completed:      5,
};

const APPT_STAGE_TEXT = {
    pending:        'Waiting for the patient to accept…',
    accepted:       'Accepted — patient is heading to a bed',
    on_bed:         'Patient is on the bed — go draw blood samples',
    drawing:        'Drawing blood samples…',
    samples_drawn:  'All samples collected — run the lab panels',
    testing:        'Running lab panels…',
    completed:      'Testing complete — file the paperwork',
};

function startAppointment(appt) {
    state.appointment = Object.assign({
        requestId: null, patientName: '—', status: 'pending',
        samplesDone: 0, samplesNeeded: (state.config && state.config.samplesRequired) || 3,
        panels: null,
    }, appt || {});
    $('#nav-appointment').style.display = '';
    renderAppointment();
    showSection('appointment');     // auto-jump to it
}

function updateAppointment(patch) {
    if (!state.appointment) {
        state.appointment = {
            requestId: null, patientName: '—', status: 'pending',
            samplesDone: 0, samplesNeeded: 3, panels: null,
        };
        $('#nav-appointment').style.display = '';
    }
    Object.assign(state.appointment, patch);
    renderAppointment();
}

function clearAppointment() {
    state.appointment = null;
    $('#nav-appointment').style.display = 'none';
    $('#appointment-card').style.display = 'none';
    $('#appointment-empty').style.display = '';
}

function renderAppointment() {
    const a = state.appointment;
    if (!a) {
        $('#appointment-card').style.display = 'none';
        $('#appointment-empty').style.display = '';
        return;
    }
    $('#appointment-empty').style.display = 'none';
    $('#appointment-card').style.display = '';

    // Header
    const initials = (a.patientName || 'PT').split(/\s+/)
        .map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
    $('#appt-avatar').textContent = initials;
    $('#appt-name').textContent   = a.patientName || '—';
    $('#appt-stage').textContent  = APPT_STAGE_TEXT[a.status] || 'Active appointment';

    const needed = a.samplesNeeded || 3;
    const done   = a.samplesDone || 0;
    $('#appt-samples').textContent = `${done}/${needed}`;

    // Stepper
    const cur = APPT_STAGE_INDEX[a.status] !== undefined ? APPT_STAGE_INDEX[a.status] : 0;
    $$('#section-appointment .appt-step').forEach((s, i) => {
        s.classList.remove('active', 'done');
        if (i < cur)      s.classList.add('done');
        else if (i === cur) s.classList.add('active');
    });
    $$('#section-appointment .appt-step-line').forEach((l, i) => {
        l.classList.toggle('done', i < cur);
    });

    // Sample dots
    const dotsWrap = $('#appt-samples-dots');
    let dots = '';
    for (let i = 0; i < needed; i++) {
        const filled = i < done;
        dots += `<div class="appt-sample-dot ${filled ? 'filled' : ''}">
                    <i class="fa-solid ${filled ? 'fa-check' : 'fa-droplet'}"></i>
                    <span>Sample ${i + 1}</span>
                 </div>`;
    }
    dotsWrap.innerHTML = dots;
    // Hide the samples block once we move past drawing
    $('#appt-samples-block').style.display =
        (cur >= APPT_STAGE_INDEX.samples_drawn && done >= needed && a.status !== 'drawing'
            && a.status !== 'on_bed' && a.status !== 'accepted')
        ? 'none' : '';

    // Panels block — visible once samples are drawn
    const panelsBlock = $('#appt-panels-block');
    if (a.panels && (cur >= APPT_STAGE_INDEX.samples_drawn)) {
        panelsBlock.style.display = '';
        const wrap = $('#appt-panels');
        wrap.innerHTML = PANELS.map(meta => {
            const p = a.panels[meta.id] || { status: 'pending' };
            const st = panelStatusLabel(p);
            let right = '';
            if (st.cls === 'incubating') {
                right = `<span class="appt-panel-countdown" data-appt-countdown="${p.ready_at}">${fmtCountdown(p.ready_at)}</span>`;
            } else if (st.cls === 'ready') {
                right = `<span class="appt-panel-ready"><i class="fa-solid fa-check"></i></span>`;
            } else if (st.cls === 'running') {
                right = `<span class="appt-panel-running"><i class="fa-solid fa-spinner fa-spin"></i></span>`;
            } else {
                right = `<span class="appt-panel-pending">—</span>`;
            }
            return `
                <div class="appt-panel appt-panel-${st.cls}">
                    <i class="fa-solid ${meta.icon}"></i>
                    <span class="appt-panel-name">${meta.name}</span>
                    <span class="appt-panel-status">${st.txt}</span>
                    ${right}
                </div>
            `;
        }).join('');
    } else {
        panelsBlock.style.display = 'none';
    }

    // Quick action
    const action = $('#appt-action');
    if (a.status === 'samples_drawn' || a.status === 'testing') {
        action.innerHTML = `<button class="btn btn-primary" id="appt-go-lab">
            <i class="fa-solid fa-microscope"></i> Go to Lab Queue</button>`;
        $('#appt-go-lab').addEventListener('click', () => {
            showSection('labqueue'); POST('requestLabSamples', {});
        });
    } else if (a.status === 'completed') {
        action.innerHTML = `<button class="btn btn-primary" id="appt-go-send">
            <i class="fa-solid fa-paper-plane"></i> Go to Pending Release</button>`;
        $('#appt-go-send').addEventListener('click', () => {
            showSection('tosend'); POST('requestUnsentResults', {});
        });
    } else {
        action.innerHTML = '';
    }
}

$('#appt-cancel') && $('#appt-cancel').addEventListener('click', () => {
    POST('cancelRequest', {});
    clearAppointment();
    showSection('request');
});

// Live countdown ticker for panel timers inside the appointment view
setInterval(() => {
    const sec = $('#section-appointment');
    if (!sec || !sec.classList.contains('active')) return;
    let needRefresh = false;
    $$('#appt-panels [data-appt-countdown]').forEach(el => {
        const r = Number(el.dataset.apptCountdown);
        el.textContent = fmtCountdown(r);
        if ((r * 1000) <= Date.now()) { el.classList.add('ready'); needRefresh = true; }
    });
    if (needRefresh) POST('requestLabSamples', {});
}, 1000);

// ---------------------------------------------------------------------
// v3: LAB QUEUE — render 3 panels per request
// ---------------------------------------------------------------------
const PANELS = [
    { id: 'bacterial', name: 'Bacterial STI Panel', icon: 'fa-bacterium', diseases: ['Chlamydia', 'Gonorrhea'] },
    { id: 'viral',     name: 'Viral STI Panel',     icon: 'fa-virus',     diseases: ['Herpes (HSV)', 'HIV'] },
    { id: 'serology',  name: 'Serology Panel',      icon: 'fa-vial',      diseases: ['Syphilis', 'HPV'] },
];

function panelStatusLabel(p) {
    const s = (p && p.status) || 'pending';
    if (s === 'pending')    return { txt: 'Not started',  cls: 'pending' };
    if (s === 'running')    return { txt: 'In progress',  cls: 'running' };
    if (s === 'incubating') {
        if (p.ready_at && (p.ready_at * 1000) <= Date.now()) {
            return { txt: 'Ready', cls: 'ready' };
        }
        return { txt: 'Incubating', cls: 'incubating' };
    }
    if (s === 'ready')      return { txt: 'Ready', cls: 'ready' };
    return { txt: s, cls: 'pending' };
}

function fmtCountdown(readyAtSec) {
    if (!readyAtSec) return '';
    const remaining = (readyAtSec * 1000) - Date.now();
    if (remaining <= 0) return '00:00';
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function panelsAllReady(panelsObj) {
    if (!panelsObj) return false;
    for (const meta of PANELS) {
        const p = panelsObj[meta.id];
        if (!p) return false;
        const st = (p.status === 'incubating' && p.ready_at && (p.ready_at * 1000) <= Date.now())
            ? 'ready' : p.status;
        if (st !== 'ready') return false;
    }
    return true;
}

let labQueueTickTimer = null;

function renderLabQueue(rows) {
    rows = rows || [];
    state.labQueue = rows;
    $('#pill-labqueue').textContent = rows.length;
    const wrap = $('#labqueue-list');

    if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">No sample sets waiting. Draw blood from a patient first.</div>';
        if (labQueueTickTimer) { clearInterval(labQueueTickTimer); labQueueTickTimer = null; }
        return;
    }

    wrap.innerHTML = rows.map(r => {
        const panels = (r.panels && r.panels.panels) || null;
        const paused = !!(state.savedMinigame && state.savedMinigame.requestId === r.id);

        // Per-panel cards
        const panelHtml = PANELS.map(meta => {
            const p = panels ? panels[meta.id] : null;
            const status = panelStatusLabel(p || {});
            const isReady      = status.cls === 'ready';
            const isIncubating = status.cls === 'incubating';
            const isPending    = status.cls === 'pending';
            const isRunning    = status.cls === 'running';

            // A panel is "resumable" if the server thinks it's still running.
            // If we have matching savedMinigame state we resume at that step;
            // otherwise we restart the panel from step 1 — either way the
            // doctor is never locked out of a panel they've opened.
            const hasSavedState = paused && state.savedMinigame.panelId === meta.id;

            let action = '';
            if (isPending) {
                action = `<button class="btn btn-primary btn-xs" data-panel-start="${r.id}|${meta.id}">
                            <i class="fa-solid fa-play"></i> Start
                          </button>`;
            } else if (isRunning) {
                // Closed mid-test — let them back in.
                const label = hasSavedState ? 'Resume' : 'Continue';
                action = `<button class="btn btn-primary btn-xs" data-panel-resume="${r.id}|${meta.id}">
                            <i class="fa-solid fa-circle-play"></i> ${label}
                          </button>`;
            } else if (isIncubating) {
                action = `<div class="panel-countdown" data-countdown="${p.ready_at}">${fmtCountdown(p.ready_at)}</div>`;
            } else if (isReady) {
                action = `<span class="panel-ready-badge"><i class="fa-solid fa-check"></i> Ready</span>`;
            } else {
                action = `<span class="panel-running-badge"><i class="fa-solid fa-spinner fa-spin"></i></span>`;
            }

            return `
                <div class="panel-card panel-${status.cls}">
                    <div class="panel-card-head">
                        <i class="fa-solid ${meta.icon}"></i>
                        <span class="panel-card-name">${meta.name}</span>
                        <span class="panel-status-pill ${status.cls}">${status.txt}</span>
                    </div>
                    <div class="panel-card-body">
                        <div class="panel-diseases">${meta.diseases.join(' · ')}</div>
                        <div class="panel-action">${action}</div>
                    </div>
                </div>
            `;
        }).join('');

        const allReady = panelsAllReady(panels);
        const fileBtn = allReady
            ? `<button class="btn btn-primary btn-sm" data-file-paperwork="${r.id}">
                   <i class="fa-solid fa-file-medical"></i> File Paperwork
               </button>`
            : `<button class="btn btn-sm" disabled>
                   <i class="fa-solid fa-hourglass-half"></i> Waiting on panels
               </button>`;

        return `
            <div class="labqueue-row">
                <div class="labqueue-row-head">
                    <div>
                        <div class="lb-name">${esc(r.patient_name)}</div>
                        <div class="lb-meta">
                            Request #${r.id} · Citizen ID: <span class="pid">${esc(r.patient_id)}</span> ·
                            Samples drawn ${fmtAgo(r.samples_done_at || r.created_at)}
                        </div>
                    </div>
                    ${fileBtn}
                </div>
                <div class="panel-grid">${panelHtml}</div>
            </div>
        `;
    }).join('');

    // Wire button clicks
    wrap.querySelectorAll('[data-panel-start]').forEach(b =>
        b.addEventListener('click', () => {
            const [rid, pid] = b.dataset.panelStart.split('|');
            POST('startPanel', { requestId: Number(rid), panelId: pid });
        }));
    wrap.querySelectorAll('[data-panel-resume]').forEach(b =>
        b.addEventListener('click', () => {
            const [rid, pid] = b.dataset.panelResume.split('|');
            // Server's resumePanel re-sends the minigame payload for a
            // panel that's already 'running'. The client then resumes at
            // the saved step (if savedMinigame matches) or step 1.
            POST('resumePanel', { requestId: Number(rid), panelId: pid });
        }));
    wrap.querySelectorAll('[data-file-paperwork]').forEach(b =>
        b.addEventListener('click', () => {
            const rid = Number(b.dataset.filePaperwork);
            const row = state.labQueue.find(r => r.id === rid);
            if (!row) return;
            // Open paperwork modal pre-filled with the aggregated truthed results
            const merged = {};
            const panels = row.panels && row.panels.panels;
            if (panels) {
                for (const k of Object.keys(panels)) {
                    const res = panels[k].results || {};
                    for (const d of Object.keys(res)) merged[d] = res[d];
                }
            }
            openPaperworkForRequest({
                requestId: rid, patientId: row.patient_id,
                patientName: row.patient_name, results: merged,
            });
        }));

    // Live countdown ticker (1s) for any incubating panel on screen
    if (labQueueTickTimer) { clearInterval(labQueueTickTimer); labQueueTickTimer = null; }
    const hasCountdown = wrap.querySelector('[data-countdown]');
    if (hasCountdown) {
        labQueueTickTimer = setInterval(() => {
            // If labqueue section is no longer active, stop
            const sec = $('#section-labqueue');
            if (!sec || !sec.classList.contains('active')) {
                clearInterval(labQueueTickTimer); labQueueTickTimer = null; return;
            }
            let allDone = true;
            wrap.querySelectorAll('[data-countdown]').forEach(el => {
                const r = Number(el.dataset.countdown);
                const txt = fmtCountdown(r);
                el.textContent = txt;
                if ((r * 1000) > Date.now()) allDone = false;
                else el.classList.add('ready');
            });
            // When all countdowns elapse, refresh the data so the UI flips to Ready
            if (allDone) POST('requestLabSamples', {});
        }, 1000);
    }
}

function renderMyTests() {
    $('#pill-mytests').textContent = state.myTests.length;
    const wrap = $('#mytests-list');
    if (!state.myTests.length) {
        wrap.innerHTML = '<div class="empty-state">You haven\'t completed any tests yet.</div>';
        return;
    }
    wrap.innerHTML = state.myTests.map(t => {
        const positives = state.diseases.filter(d => (t.results[d.id] === 'positive')).map(d => d.name);
        const summary = positives.length
            ? `<span class="status-pill positive">${positives.length} positive</span>`
            : `<span class="status-pill negative">All clear</span>`;
        const stages = [];
        stages.push(`<span class="status-pill completed">tested ${fmtAgo(t.tested_at)}</span>`);
        if (t.notified_at)  stages.push(`<span class="status-pill notified">notified</span>`);
        if (t.delivered_at) stages.push(`<span class="status-pill delivered">delivered</span>`);
        return `
            <div class="lb-row">
                <div class="lb-rank">#${t.id}</div>
                <div>
                    <div class="lb-name">${esc(t.patient_name)}</div>
                    <div class="lb-meta">
                        <span class="pid">${esc(t.patient_id)}</span> ·
                        Sample #${t.sample_id} · ${fmtTime(t.tested_at)}
                    </div>
                    <div class="lb-meta" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${stages.join('')}</div>
                </div>
                <div></div>
                ${summary}
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------
// PATIENT LOOKUP
// ---------------------------------------------------------------------
let lookupTimeout = null;
$('#lookup-input').addEventListener('input', (e) => {
    const q = e.target.value;
    clearTimeout(lookupTimeout);
    lookupTimeout = setTimeout(() => POST('patientLookup', { query: q }), 250);
});
$('#quick-search').addEventListener('input', (e) => {
    showSection('lookup');
    $('#lookup-input').value = e.target.value;
    clearTimeout(lookupTimeout);
    lookupTimeout = setTimeout(() => POST('patientLookup', { query: e.target.value }), 250);
});

function renderLookup(rows) {
    const wrap = $('#lookup-results');
    if (!rows || !rows.length) {
        wrap.innerHTML = '<div class="empty-state">No matching records.</div>';
        return;
    }
    wrap.innerHTML = rows.map(r => {
        const positives = state.diseases.filter(d => (r.results[d.id] === 'positive')).map(d => d.name);
        const summary = positives.length
            ? `<span class="status-pill positive">${positives.length} positive</span>`
            : `<span class="status-pill negative">All clear</span>`;
        return `
            <div class="lb-row">
                <div class="lb-rank">#${r.id}</div>
                <div>
                    <div class="lb-name">${esc(r.patient_name)}</div>
                    <div class="lb-meta"><span class="pid">${esc(r.patient_id)}</span> · Dr. ${esc(r.doctor_name)} · ${fmtTime(r.tested_at)}</div>
                </div>
                <div></div>
                ${summary}
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------
// v3: TO SEND — paperwork filed but not released to the patient yet
// ---------------------------------------------------------------------
function renderToSend(rows) {
    rows = rows || [];
    state.unsent = rows;
    $('#pill-tosend').textContent = rows.length;
    const wrap = $('#tosend-list');
    if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">Nothing waiting to send.</div>';
        return;
    }
    wrap.innerHTML = rows.map(r => {
        const results = r.results || {};
        const summary = Object.keys(results).map(d => {
            const v = results[d];
            const cls = (v === 'positive') ? 'positive' : (v === 'negative' ? 'negative' : 'inconclusive');
            return `<span class="result-chip ${cls}">${esc(d)}</span>`;
        }).join('');
        return `
            <div class="tosend-row">
                <div class="tosend-head">
                    <div>
                        <div class="lb-name">${esc(r.patient_name)}</div>
                        <div class="lb-meta">
                            Result #${r.id} · Citizen ID: <span class="pid">${esc(r.patient_id)}</span> · Filed ${fmtAgo(r.tested_at)}
                        </div>
                    </div>
                    <div class="tosend-actions">
                        <button class="btn btn-sm" data-preview="${r.id}">
                            <i class="fa-solid fa-eye"></i> Preview
                        </button>
                        <button class="btn btn-primary btn-sm" data-send="${r.id}">
                            <i class="fa-solid fa-paper-plane"></i> Send to Patient
                        </button>
                    </div>
                </div>
                <div class="tosend-summary">${summary}</div>
            </div>
        `;
    }).join('');

    wrap.querySelectorAll('[data-send]').forEach(b =>
        b.addEventListener('click', () => POST('sendResultsToPatient', { resultId: Number(b.dataset.send) })));
    wrap.querySelectorAll('[data-preview]').forEach(b =>
        b.addEventListener('click', () => {
            const r = state.unsent.find(x => x.id === Number(b.dataset.preview));
            if (!r) return;
            openPaperworkPreview(r);
        }));
}

function openPaperworkPreview(r) {
    state.paperwork = null;
    $('#results-sub').innerHTML = `Preview · <strong>${esc(r.patient_name)}</strong> · Filed ${fmtAgo(r.tested_at)}`;

    const diseaseList = state.diseases && state.diseases.length ? state.diseases : [
        { id: 'chlamydia', name: 'Chlamydia' }, { id: 'gonorrhea', name: 'Gonorrhea' },
        { id: 'syphilis',  name: 'Syphilis'  }, { id: 'herpes',    name: 'Herpes (HSV)' },
        { id: 'hiv',       name: 'HIV'       }, { id: 'hpv',       name: 'HPV' },
    ];
    const results = r.results || {};
    $('#results-grid').innerHTML = diseaseList.map(d => {
        const val = results[d.id] || 'inconclusive';
        const pos = val === 'positive';
        const cls = pos ? 'positive' : (val === 'negative' ? 'negative' : 'inconclusive');
        const icon = pos ? 'fa-triangle-exclamation' : (val === 'negative' ? 'fa-check' : 'fa-question');
        const label = val.charAt(0).toUpperCase() + val.slice(1);
        return `
            <div class="result-row result-readonly" data-disease="${esc(d.id)}">
                <div class="result-name">${esc(d.name)}</div>
                <div class="result-readonly-pill ${cls}">
                    <i class="fa-solid ${icon}"></i> ${label}
                </div>
            </div>
        `;
    }).join('');
    $('#results-notes-input').value = r.notes || '';
    if ($('#results-treatment-input')) $('#results-treatment-input').value = r.treatment_plan || '';
    if ($('#results-followup-input'))  $('#results-followup-input').value  = r.follow_up || '';
    $('#results-notes-input').disabled = true;
    if ($('#results-treatment-input')) $('#results-treatment-input').disabled = true;
    if ($('#results-followup-input'))  $('#results-followup-input').disabled  = true;
    $('#results-submit').classList.add('hidden');
    showResults();
}

function resetResultsModal() {
    $('#results-notes-input').disabled = false;
    if ($('#results-treatment-input')) $('#results-treatment-input').disabled = false;
    if ($('#results-followup-input'))  $('#results-followup-input').disabled  = false;
    $('#results-submit').classList.remove('hidden');
}

// =====================================================================
// MINIGAME
// =====================================================================

const STEPS = [
    { id: 'gloves',     name: 'Gloves',     icon: 'fa-hand'        },
    { id: 'sanitize',   name: 'Sanitize',   icon: 'fa-spray-can'   },
    { id: 'label',      name: 'Label Vial', icon: 'fa-tag'         },
    { id: 'centrifuge', name: 'Centrifuge', icon: 'fa-rotate'      },
    { id: 'reagents',   name: 'Reagents',   icon: 'fa-droplet'     },
    { id: 'verify',     name: 'Verify',     icon: 'fa-check-double'},
];

function showMinigame() { $('#minigame-modal').classList.remove('hidden'); }

// hideMinigame(opts):
//   opts.persist = true  (default) → save state to state.savedMinigame so the
//                                    player can resume from the same step.
//   opts.persist = false           → fully discard (used after the test is
//                                    completed or fully abandoned).
function hideMinigame(opts) {
    opts = opts || {};
    const persist = opts.persist !== false;

    // ALWAYS tear down running timers / RAFs / step-specific listeners.
    if (state.minigame) {
        if (state.minigame.timer) {
            clearInterval(state.minigame.timer);
            state.minigame.timer = null;
        }
        if (typeof state.minigame.cleanup === 'function') {
            try { state.minigame.cleanup(); } catch (e) { /* swallow */ }
            state.minigame.cleanup = null;
        }
    }

    // Snapshot just enough to restore the same step on resume.
    if (persist && state.minigame && state.minigame.requestId) {
        state.savedMinigame = {
            requestId:   state.minigame.requestId,
            panelId:     state.minigame.panelId || null,
            sampleId:    state.minigame.sampleId,
            stepIndex:   state.minigame.stepIndex || 0,
            patientId:   state.minigame.patientId,
            patientName: state.minigame.patientName,
            diseases:    state.minigame.diseases,
        };
    } else {
        state.savedMinigame = null;
    }

    $('#minigame-modal').classList.add('hidden');
    // Scrub the stage so no DOM listeners remain attached to old elements.
    const stage = $('#mg-stage');
    if (stage) stage.innerHTML = '';
    const timerText = $('#mg-timer-text');
    if (timerText) timerText.textContent = '--';

    state.minigame = null;
}

$('#mg-close').addEventListener('click', () => {
    // Soft-close: pause and save state. The player can re-open from Lab Queue.
    hideMinigame({ persist: true });
    toast('Test paused — click Resume in Lab Queue to continue.', 'info');
});

function renderSteps() {
    const wrap = $('#mg-steps');
    if (!wrap || !state.minigame) return;
    wrap.innerHTML = STEPS.map((s, i) => {
        let cls = '';
        if (i < state.minigame.stepIndex) cls = 'done';
        else if (i === state.minigame.stepIndex) cls = 'active';
        if (state.minigame.failedStep === i) cls = 'failed';
        return `
            <div class="mg-step ${cls}">
                <i class="fa-solid ${s.icon}"></i>
                <span>${esc(s.name)}</span>
            </div>
        `;
    }).join('');
}

function setInstruction(text) {
    return `<div class="mg-instruction"><i class="fa-solid fa-circle-info" style="color:var(--accent-2);margin-right:6px;"></i>${esc(text)}</div>`;
}

function startTimer(durationMs, onTick, onTimeout) {
    if (!state.minigame) return;
    if (state.minigame.timer) clearInterval(state.minigame.timer);
    const start = Date.now();
    const myTimerId = { i: 0 };
    const update = () => {
        // Bail if the minigame was torn down while we were waiting
        if (!state.minigame || state.minigame.timer !== myTimerId.i) {
            return;
        }
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, durationMs - elapsed);
        const txt = $('#mg-timer-text');
        if (txt) txt.textContent = `${(remaining / 1000).toFixed(1)}s`;
        if (onTick) onTick(remaining);
        if (remaining <= 0) {
            if (state.minigame && state.minigame.timer === myTimerId.i) {
                clearInterval(myTimerId.i);
                state.minigame.timer = null;
            }
            if (onTimeout) onTimeout();
        }
    };
    myTimerId.i = setInterval(update, 100);
    state.minigame.timer = myTimerId.i;
    update();
}

function stopTimer() {
    if (state.minigame && state.minigame.timer) {
        clearInterval(state.minigame.timer);
        state.minigame.timer = null;
    }
    const txt = $('#mg-timer-text');
    if (txt) txt.textContent = '--';
}

function failStep(reason) {
    if (!state.minigame || state.minigame.stepFailed) return;
    state.minigame.stepFailed = true;
    state.minigame.failedStep = state.minigame.stepIndex;
    renderSteps();
    stopTimer();
    toast(reason || 'Step failed. Retry.', 'error');
    $('#mg-retry').disabled = false;
    $('#mg-next').disabled = true;
}

function completeStep() {
    if (!state.minigame || state.minigame.stepCompleted) return;
    state.minigame.stepCompleted = true;
    state.minigame.failedStep = null;
    stopTimer();
    renderSteps();
    toast('Step complete!', 'success');
    $('#mg-retry').disabled = true;
    $('#mg-next').disabled = false;
}

$('#mg-retry').addEventListener('click', () => {
    if (!state.minigame) return;
    state.minigame.stepFailed = false;
    state.minigame.stepCompleted = false;
    state.minigame.failedStep = null;
    $('#mg-retry').disabled = true;
    $('#mg-next').disabled = true;
    setTimeout(() => loadStep(state.minigame.stepIndex), 200);
});

$('#mg-next').addEventListener('click', () => {
    if (!state.minigame || !state.minigame.stepCompleted) return;

    // Tear down the step we're leaving (its timer/interval/listeners).
    if (state.minigame.timer) { clearInterval(state.minigame.timer); state.minigame.timer = null; }
    if (typeof state.minigame.cleanup === 'function') {
        try { state.minigame.cleanup(); } catch (e) { /* swallow */ }
        state.minigame.cleanup = null;
    }

    state.minigame.stepIndex += 1;
    state.minigame.stepCompleted = false;
    state.minigame.stepFailed = false;
    state.minigame.failedStep = null;
    $('#mg-retry').disabled = true;
    $('#mg-next').disabled = true;
    if (state.minigame.stepIndex >= STEPS.length) {
        renderComplete();
    } else {
        loadStep(state.minigame.stepIndex);
    }
});

// ---------------------------------------------------------------------
// STEP IMPLEMENTATIONS
// ---------------------------------------------------------------------

// Public entry — wraps the step builder so a thrown error in any step
// can never permanently freeze the minigame UI. On failure it shows the
// step as "failed" so the doctor can Retry instead of being stuck.
function loadStep(idx) {
    try {
        loadStepInner(idx);
    } catch (err) {
        console.error('[ems_stdtest] step load failed:', err);
        if (state.minigame) {
            // Tear down anything the half-built step may have started
            if (state.minigame.timer) { clearInterval(state.minigame.timer); state.minigame.timer = null; }
            if (typeof state.minigame.cleanup === 'function') {
                try { state.minigame.cleanup(); } catch (e) { /* swallow */ }
                state.minigame.cleanup = null;
            }
            state.minigame.stepFailed = true;
            state.minigame.failedStep = idx;
        }
        try { renderSteps(); } catch (e) { /* swallow */ }
        const stage = $('#mg-stage');
        if (stage) {
            stage.innerHTML = `
                <div class="mg-instruction" style="border-left-color:var(--red);">
                    <i class="fa-solid fa-triangle-exclamation" style="color:var(--red);margin-right:6px;"></i>
                    This step hit an error loading. Click <strong>Retry Step</strong> to try again.
                </div>`;
        }
        const retry = $('#mg-retry'); if (retry) retry.disabled = false;
        const next  = $('#mg-next');  if (next)  next.disabled  = true;
        toast('Step failed to load — use Retry Step.', 'error');
    }
}

function loadStepInner(idx) {
    if (!state.minigame) return;

    // ---- TEAR DOWN the previous step before building the new one ----
    // Each step may register a cleanup() (interval clears, listener
    // removal). If we don't call it here, intervals/listeners from the
    // last step keep running against stale state and freeze the UI.
    if (state.minigame.timer) {
        clearInterval(state.minigame.timer);
        state.minigame.timer = null;
    }
    if (typeof state.minigame.cleanup === 'function') {
        try { state.minigame.cleanup(); } catch (e) { /* swallow */ }
    }
    state.minigame.cleanup = null;          // reset — new step sets its own

    renderSteps();
    const step = STEPS[idx];
    const stage = $('#mg-stage');
    const cfg = state.minigame.cfg;
    state.minigame.stepCompleted = false;
    state.minigame.stepFailed = false;
    state.minigame.stepIndex = idx;          // keep canonical index in sync

    if (step.id === 'gloves') {
        stage.innerHTML = setInstruction("Put on both nitrile gloves before handling the sample. Click each glove to put it on.") + `
            <div class="gloves-scene">
                <div class="glove" data-glove="L"><i class="fa-solid fa-hand"></i></div>
                <div class="glove" data-glove="R"><i class="fa-solid fa-hand"></i></div>
            </div>
        `;
        const on = { L: false, R: false };
        const gloveEls = stage.querySelectorAll('.glove');
        const onClick = (el) => () => {
            if (!state.minigame) return;
            const which = el.dataset.glove;
            if (!on[which]) { on[which] = true; el.classList.add('on'); }
            if (on.L && on.R) completeStep();
        };
        const handlers = [];
        gloveEls.forEach(el => {
            const h = onClick(el);
            handlers.push([el, h]);
            el.addEventListener('click', h);
        });
        // Register cleanup so closing the modal removes all listeners
        state.minigame.cleanup = () => {
            handlers.forEach(([el, h]) => el.removeEventListener('click', h));
        };
        startTimer(cfg.glovesTimeLimit, null, () => failStep('Too slow — patient is waiting!'));
        return;
    }

    if (step.id === 'sanitize') {
        stage.innerHTML = setInstruction("Sanitize the work surface. Drag the swab back and forth across the dashed area until the bar fills.") + `
            <div class="sanitize-scene" id="san-scene">
                <div class="sanitize-area" id="san-area"></div>
                <div class="sanitize-swab" id="san-swab" style="left:50%;top:80%"></div>
                <div class="sanitize-progress"><div class="sanitize-progress-fill" id="san-fill"></div></div>
            </div>
        `;
        const scene = $('#san-scene');
        const area  = $('#san-area');
        const swab  = $('#san-swab');
        const fill  = $('#san-fill');
        let strokes = 0;
        let lastDir = 0; // 1 = right, -1 = left
        let lastX = null;
        const need = cfg.sanitizeStrokesNeeded;

        const onMove = (e) => {
            // Stop counting the moment the step is done/failed or torn down.
            if (!state.minigame || state.minigame.stepCompleted || state.minigame.stepFailed) return;
            const rect = scene.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
            // Only count strokes within the dashed area
            const aRect = area.getBoundingClientRect();
            const inside = e.clientX >= aRect.left && e.clientX <= aRect.right &&
                           e.clientY >= aRect.top && e.clientY <= aRect.bottom;
            swab.style.left = `${x}px`;
            swab.style.top = `${y}px`;
            if (!inside) { lastX = null; return; }
            if (lastX !== null) {
                const dir = Math.sign(x - lastX);
                if (dir !== 0 && dir !== lastDir && Math.abs(x - lastX) > 6) {
                    strokes += 1;
                    lastDir = dir;
                    fill.style.width = `${Math.min(100, (strokes / need) * 100)}%`;
                    if (strokes >= need) completeStep();
                }
            }
            lastX = x;
        };
        scene.addEventListener('mousemove', onMove);
        state.minigame.cleanup = () => scene.removeEventListener('mousemove', onMove);
        startTimer(cfg.sanitizeTimeLimit, null, () => failStep('Sanitization not completed in time.'));
        return;
    }

    if (step.id === 'label') {
        const mg = state.minigame;
        // v3 panels don't carry a single sampleId — fall back to the
        // panelId / requestId so the label step always has a stable ID.
        const patientId = mg.patientId || 'UNKNOWN';
        const sampleId  = (mg.sampleId != null)
            ? mg.sampleId
            : (mg.panelId ? `${mg.panelId}-${mg.requestId || 0}` : (mg.requestId || 0));

        const pidShort  = String(patientId).substring(0, 8);
        const correct   = `${pidShort}-#${sampleId}`;

        // Generate fake plausible labels (different sample/panel suffixes)
        const fakeSuffixes = ['A1', 'B2', 'C3', 'X9', 'Z0', '7K', 'Q4', 'M8'];
        const fakes = new Set();
        let guard = 0;
        while (fakes.size < 3 && guard < 50) {
            guard += 1;
            const suf = fakeSuffixes[Math.floor(Math.random() * fakeSuffixes.length)];
            const fake = `${pidShort}-#${suf}`;
            if (fake !== correct) fakes.add(fake);
        }
        // Safety: if we somehow couldn't make 3 unique fakes, pad them
        while (fakes.size < 3) fakes.add(`${pidShort}-#PAD${fakes.size}`);
        const options = [correct, ...fakes].sort(() => Math.random() - 0.5);

        stage.innerHTML = setInstruction("Apply the correct patient label to the vial. Each vial must match this patient's citizen ID and sample number.") + `
            <div class="label-scene">
                <div class="vial-area">
                    <div class="vial" id="vial-el"></div>
                    <div style="font-size:11px;color:var(--text-mute);text-align:center;">
                        Patient: <strong style="color:var(--text)">${esc(mg.patientName || '—')}</strong><br/>
                        Citizen ID: <span class="pid" style="font-family:ui-monospace,monospace;color:var(--text-dim);">${esc(String(patientId))}</span><br/>
                        Sample ID: <strong style="color:var(--text)">#${esc(String(sampleId))}</strong>
                    </div>
                </div>
                <div>
                    <div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">SELECT THE CORRECT LABEL</div>
                    <div class="label-options" id="label-options">
                        ${options.map(o => `<div class="label-option" data-label="${esc(o)}">${esc(o)}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
        $$('#label-options .label-option').forEach(el => el.addEventListener('click', () => {
            if (state.minigame.stepCompleted || state.minigame.stepFailed) return;
            if (el.dataset.label === correct) {
                el.classList.add('correct');
                const vial = $('#vial-el');
                const labelEl = document.createElement('div');
                labelEl.className = 'vial-label-applied';
                labelEl.textContent = correct;
                vial.appendChild(labelEl);
                completeStep();
            } else {
                el.classList.add('wrong');
                failStep('Wrong label! That belongs to a different sample.');
            }
        }));
        startTimer(cfg.labelTimeLimit, null, () => failStep('Took too long labeling the vial.'));
        return;
    }

    if (step.id === 'centrifuge') {
        stage.innerHTML = setInstruction("Centrifuge the sample. HOLD the SPIN button to bring the dial into the GREEN zone, and keep it there for the full duration.") + `
            <div class="centrifuge-scene">
                <div class="centrifuge-dial">
                    <div class="centrifuge-needle" id="cent-needle"></div>
                    <div class="centrifuge-pivot"></div>
                </div>
                <div class="centrifuge-readout">RPM: <span id="cent-rpm">0</span> · Target: <span class="target">2,400-3,600</span></div>
                <div class="centrifuge-bar"><div class="centrifuge-bar-fill" id="cent-bar"></div></div>
                <div class="centrifuge-controls">
                    <button class="centrifuge-btn" id="cent-btn"><i class="fa-solid fa-bolt"></i></button>
                </div>
            </div>
        `;
        const needle = $('#cent-needle');
        const rpmEl  = $('#cent-rpm');
        const barEl  = $('#cent-bar');
        const btn    = $('#cent-btn');

        // Dial: -90deg (left/0) to +90deg (right/max). Map to 0-6000 RPM.
        // Green zone is the wide middle of the conic gradient (110deg-250deg from -90 start = roughly 20deg to 160deg relative)
        // To make it intuitive: green zone = 40%-60% of bar = RPM 2400-3600.
        let rpm = 0;
        let held = false;
        let elapsed = 0;     // ms in green zone
        const needed = cfg.centrifugeDuration;
        const greenLo = 2400;
        const greenHi = 3600;
        const tickMs = 50;

        const press = (e) => { e.preventDefault(); held = true; btn.classList.add('held'); };
        const release = () => { held = false; btn.classList.remove('held'); };
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
        btn.addEventListener('touchstart', press);
        btn.addEventListener('touchend', release);

        const interval = setInterval(() => {
            if (!state.minigame) { clearInterval(interval); return; }
            if (state.minigame.stepCompleted || state.minigame.stepFailed) { clearInterval(interval); return; }
            // Acceleration / deceleration with random wobble
            if (held) rpm += 180 + (Math.random() * 60 - 30);
            else      rpm -= 240;
            rpm += (Math.random() * 40 - 20);
            rpm = Math.max(0, Math.min(6000, rpm));

            const norm = rpm / 6000;
            const deg = -90 + norm * 180;
            needle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
            rpmEl.textContent = Math.round(rpm).toLocaleString();

            if (rpm >= greenLo && rpm <= greenHi) {
                elapsed += tickMs;
                barEl.style.width = `${Math.min(100, (elapsed / needed) * 100)}%`;
                if (elapsed >= needed) {
                    clearInterval(interval);
                    release();
                    completeStep();
                }
            } else {
                // bleed off progress slowly if outside range
                elapsed = Math.max(0, elapsed - tickMs * 0.5);
                barEl.style.width = `${(elapsed / needed) * 100}%`;
            }
        }, tickMs);
        state.minigame.cleanup = () => {
            clearInterval(interval);
            release();
            btn.removeEventListener('mousedown', press);
            btn.removeEventListener('mouseup', release);
            btn.removeEventListener('mouseleave', release);
            btn.removeEventListener('touchstart', press);
            btn.removeEventListener('touchend', release);
        };
        return;
    }

    if (step.id === 'reagents') {
        const reagents = [
            { id: 'r1', color: 'r-red',    label: 'R-1' },
            { id: 'r2', color: 'r-blue',   label: 'R-2' },
            { id: 'r3', color: 'r-green',  label: 'R-3' },
            { id: 'r4', color: 'r-purple', label: 'R-4' },
            { id: 'r5', color: 'r-amber',  label: 'R-5' },
            { id: 'r6', color: 'r-pink',   label: 'R-6' },
        ];
        // v3 panels send a 2-disease list; fall back to a generic set if missing.
        const diseaseList = (state.minigame.diseases && state.minigame.diseases.length)
            ? state.minigame.diseases
            : [{ id: 'a', name: 'Marker A' }, { id: 'b', name: 'Marker B' }];
        const wellCount = diseaseList.length;
        // Build a mapping: each well wants a specific reagent (random per session)
        const shuffled = [...reagents].sort(() => Math.random() - 0.5);
        const wells = diseaseList.map((d, i) => ({
            id: `w${i}`,
            disease: d,
            wants: shuffled[i % shuffled.length].id,
        }));

        stage.innerHTML = setInstruction("Click a reagent to pick it up, then click the matching well to apply it. Two wrong applications fail the step.") + `
            <div class="reagent-scene">
                <div class="reagent-shelf">
                    <div class="reagent-shelf-title">REAGENT SHELF</div>
                    <div class="reagent-list" id="rg-list">
                        ${reagents.map(r => `<div class="reagent ${r.color}" data-reagent="${r.id}">${r.label}</div>`).join('')}
                    </div>
                </div>
                <div class="well-tray">
                    <div class="well-tray-title">TEST WELLS</div>
                    <div class="well-list" id="well-list">
                        ${wells.map(w => `
                            <div class="well target" data-well="${w.id}" data-wants="${w.wants}">
                                <div class="well-name">${esc(w.disease.name)}</div>
                                <div class="well-code">apply ${reagents.find(r => r.id === w.wants).label}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const reagentEls = $$('#rg-list .reagent');
        const wellEls    = $$('#well-list .well');
        let solved = 0;
        let wrongs = 0;
        const maxWrongs = 2;
        let selectedReagent = null;

        const clearSelection = () => {
            selectedReagent = null;
            reagentEls.forEach(x => x.classList.remove('selected'));
            wellEls.forEach(x => x.classList.remove('armed'));
        };

        reagentEls.forEach(r => {
            r.addEventListener('click', () => {
                if (r.classList.contains('used')) return;
                if (selectedReagent === r.dataset.reagent) {
                    clearSelection(); return;            // click again to deselect
                }
                reagentEls.forEach(x => x.classList.remove('selected'));
                r.classList.add('selected');
                selectedReagent = r.dataset.reagent;
                wellEls.forEach(w => {
                    if (!w.classList.contains('correct')) w.classList.add('armed');
                });
            });
        });

        wellEls.forEach(w => {
            w.addEventListener('click', () => {
                if (w.classList.contains('correct')) return;
                if (!selectedReagent) {
                    // Subtle pulse so they know they need to pick a reagent first
                    w.classList.add('wrong');
                    setTimeout(() => w.classList.remove('wrong'), 220);
                    return;
                }
                const id = selectedReagent;
                if (id === w.dataset.wants) {
                    w.classList.remove('target', 'armed');
                    w.classList.add('correct');
                    const matching = $(`.reagent[data-reagent="${id}"]`);
                    if (matching) {
                        matching.classList.add('used');
                        matching.classList.remove('selected');
                    }
                    clearSelection();
                    solved += 1;
                    if (solved === wells.length) completeStep();
                } else {
                    w.classList.add('wrong');
                    setTimeout(() => w.classList.remove('wrong'), 350);
                    wrongs += 1;
                    clearSelection();
                    if (wrongs >= maxWrongs) failStep('Too many incorrect reagents applied!');
                }
            });
        });

        startTimer(cfg.reagentTimeLimit, null, () => failStep('Time expired during reagent application.'));
        return;
    }

    if (step.id === 'verify') {
        const len = cfg.sequenceLength;
        const buttons = [
            { i: 0, icon: 'fa-vial' },
            { i: 1, icon: 'fa-microscope' },
            { i: 2, icon: 'fa-flask' },
            { i: 3, icon: 'fa-syringe' },
            { i: 4, icon: 'fa-dna' },
            { i: 5, icon: 'fa-pills' },
            { i: 6, icon: 'fa-prescription-bottle' },
            { i: 7, icon: 'fa-eye-dropper' },
        ];
        const sequence = [];
        for (let i = 0; i < len; i++) sequence.push(Math.floor(Math.random() * buttons.length));

        stage.innerHTML = setInstruction("Read & verify the result. Watch the sequence the analyzer flashes, then repeat it.") + `
            <div class="sequence-scene">
                <div class="sequence-instruction" id="seq-msg">Memorize the sequence...</div>
                <div class="sequence-grid" id="seq-grid">
                    ${buttons.map(b => `<div class="sequence-btn" data-seq="${b.i}"><i class="fa-solid ${b.icon}"></i></div>`).join('')}
                </div>
                <div class="sequence-progress" id="seq-progress">
                    ${sequence.map(() => `<div class="sequence-dot"></div>`).join('')}
                </div>
            </div>
        `;
        const grid = $('#seq-grid');
        const msg  = $('#seq-msg');
        const dots = $$('#seq-progress .sequence-dot');

        // Lock input during showing
        let inputLocked = true;
        let inputIndex  = 0;

        // Track every timer this step spawns so cleanup kills them all.
        const flashTimers = [];

        // Show sequence
        let showI = 0;
        const showInterval = setInterval(() => {
            if (!state.minigame || state.minigame.stepCompleted || state.minigame.stepFailed) {
                clearInterval(showInterval);
                return;
            }
            if (showI >= sequence.length) {
                clearInterval(showInterval);
                msg.textContent = 'Now repeat the sequence!';
                inputLocked = false;
                startTimer(cfg.sequenceInputTime, null, () => failStep('Took too long verifying.'));
                return;
            }
            const btn = grid.querySelector(`[data-seq="${sequence[showI]}"]`);
            if (btn) {
                btn.classList.add('flash');
                const ft = setTimeout(() => {
                    if (btn) btn.classList.remove('flash');
                }, Math.max(220, (cfg.sequenceShowTime / len) - 200));
                flashTimers.push(ft);
            }
            showI += 1;
        }, Math.max(450, cfg.sequenceShowTime / len));

        grid.querySelectorAll('.sequence-btn').forEach(b => b.addEventListener('click', () => {
            if (!state.minigame || inputLocked
                || state.minigame.stepCompleted || state.minigame.stepFailed) return;
            const v = Number(b.dataset.seq);
            if (v === sequence[inputIndex]) {
                b.classList.add('correct');
                setTimeout(() => b.classList.remove('correct'), 250);
                if (dots[inputIndex]) dots[inputIndex].classList.add('lit');
                inputIndex += 1;
                if (inputIndex >= sequence.length) {
                    completeStep();
                }
            } else {
                b.classList.add('wrong');
                setTimeout(() => b.classList.remove('wrong'), 350);
                failStep('Incorrect verification sequence!');
            }
        }));

        state.minigame.cleanup = () => {
            clearInterval(showInterval);
            flashTimers.forEach(t => clearTimeout(t));
        };
        return;
    }
}

// ---------------------------------------------------------------------
// COMPLETION → notify server, panel goes to incubation
// ---------------------------------------------------------------------
function renderComplete() {
    stopTimer();
    const stage = $('#mg-stage');
    const mg = state.minigame || {};
    const panelMeta = PANELS.find(p => p.id === mg.panelId);
    const mins = Math.floor((mg.panelDuration || 15 * 60 * 1000) / 60000);

    stage.innerHTML = `
        <div class="mg-complete">
            <div class="mg-complete-icon"><i class="fa-solid fa-check"></i></div>
            <h3>${esc((panelMeta && panelMeta.name) || 'Panel')} loaded into the analyzer</h3>
            <p>Sample is now incubating. Results will be ready in about <strong>${mins} minutes</strong>. You can run another panel or come back later — the analyzer will keep working in the background.</p>
            <button class="btn btn-primary" id="mg-back-queue">
                <i class="fa-solid fa-clipboard-list"></i> Back to Lab Queue
            </button>
        </div>
    `;
    renderSteps();
    $('#mg-retry').disabled = true;
    $('#mg-next').disabled = true;

    // Fire the server event — server flips panel to 'incubating' and sets ready_at
    if (mg.requestId && mg.panelId) {
        POST('panelMinigameDone', { requestId: mg.requestId, panelId: mg.panelId });
    }

    $('#mg-back-queue').addEventListener('click', () => {
        hideMinigame({ persist: false });
        showSection('labqueue');
        POST('requestLabSamples', {});
    });
}

// =====================================================================
// RESULTS ENTRY
// =====================================================================

function showResults() { $('#results-modal').classList.remove('hidden'); }
function hideResults() {
    $('#results-modal').classList.add('hidden');
    resetResultsModal();
}
$('#results-close').addEventListener('click', hideResults);
$('#results-cancel').addEventListener('click', hideResults);

// v3 entry point: opens paperwork for a request whose panels have all
// finished incubating. Results are READ-ONLY — server is the source of truth.
function openPaperworkForRequest(ctx) {
    state.paperwork = {
        requestId:   ctx.requestId,
        patientId:   ctx.patientId,
        patientName: ctx.patientName,
        results:     ctx.results || {},
    };
    $('#results-sub').innerHTML = `Patient: <strong>${esc(ctx.patientName)}</strong> · Request #${ctx.requestId}`;

    const diseaseList = state.diseases && state.diseases.length ? state.diseases : [
        { id: 'chlamydia', name: 'Chlamydia' }, { id: 'gonorrhea', name: 'Gonorrhea' },
        { id: 'syphilis',  name: 'Syphilis'  }, { id: 'herpes',    name: 'Herpes (HSV)' },
        { id: 'hiv',       name: 'HIV'       }, { id: 'hpv',       name: 'HPV' },
    ];

    const grid = $('#results-grid');
    grid.innerHTML = diseaseList.map(d => {
        const val = ctx.results[d.id] || 'inconclusive';
        const pos = val === 'positive';
        const cls = pos ? 'positive' : (val === 'negative' ? 'negative' : 'inconclusive');
        const icon = pos ? 'fa-triangle-exclamation' : (val === 'negative' ? 'fa-check' : 'fa-question');
        const label = val.charAt(0).toUpperCase() + val.slice(1);
        return `
            <div class="result-row result-readonly" data-disease="${esc(d.id)}">
                <div class="result-name">${esc(d.name)}</div>
                <div class="result-readonly-pill ${cls}">
                    <i class="fa-solid ${icon}"></i> ${label}
                </div>
            </div>
        `;
    }).join('');

    $('#results-notes-input').value = '';
    if ($('#results-treatment-input')) $('#results-treatment-input').value = '';
    if ($('#results-followup-input'))  $('#results-followup-input').value  = '';
    showResults();
}

// Legacy v2 entry point — kept for back-compat with old request rows
function openResults() {
    const mg = state.minigame || state.currentSample;
    if (!mg) return;
    $('#results-sub').innerHTML = `Patient: <strong>${esc(mg.patientName)}</strong> · Sample #${mg.sampleId}`;

    const grid = $('#results-grid');
    grid.innerHTML = state.diseases.map(d => {
        const truth = mg.truth ? mg.truth[d.id] : null;
        return `
            <div class="result-row" data-disease="${esc(d.id)}">
                <div class="result-name">${esc(d.name)}</div>
                <button class="result-pick negative ${truth === 'negative' ? 'active' : ''}" data-pick="negative">Negative</button>
                <button class="result-pick positive ${truth === 'positive' ? 'active' : ''}" data-pick="positive">Positive</button>
                <button class="result-pick inconclusive" data-pick="inconclusive">Inconclusive</button>
            </div>
        `;
    }).join('');
    grid.querySelectorAll('.result-row').forEach(row => {
        row.querySelectorAll('.result-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                row.querySelectorAll('.result-pick').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });
    $('#results-notes-input').value = '';
    if ($('#results-treatment-input')) $('#results-treatment-input').value = '';
    if ($('#results-followup-input'))  $('#results-followup-input').value  = '';
    showResults();
}

$('#results-submit').addEventListener('click', () => {
    // v3 path: state.paperwork is set, results are read-only from server
    if (state.paperwork) {
        const pw = state.paperwork;
        const notes         = $('#results-notes-input').value.trim();
        const treatmentPlan = ($('#results-treatment-input') && $('#results-treatment-input').value.trim()) || '';
        const followUp      = ($('#results-followup-input')  && $('#results-followup-input').value.trim())  || '';
        POST('submitPaperwork', {
            requestId: pw.requestId, notes, treatmentPlan, followUp,
        });
        hideResults();
        toast('Paperwork filed. Go to "To Send" to release results to the patient.', 'success');
        state.paperwork = null;
        state.appointment = null;
        $('#active-request').classList.add('hidden');
        return;
    }

    // v2 legacy path
    const mg = state.minigame;
    if (!mg) return;
    const results = {};
    const rows = $$('#results-grid .result-row');
    let missing = 0;
    rows.forEach(row => {
        const d = row.dataset.disease;
        const active = row.querySelector('.result-pick.active');
        if (!active) { missing += 1; return; }
        results[d] = active.dataset.pick;
    });
    if (missing > 0) {
        toast(`Select a result for all ${rows.length} diseases (${missing} missing).`, 'error');
        return;
    }
    const notes         = $('#results-notes-input').value.trim();
    const treatmentPlan = ($('#results-treatment-input') && $('#results-treatment-input').value.trim()) || '';
    const followUp      = ($('#results-followup-input')  && $('#results-followup-input').value.trim())  || '';
    if (mg.requestId) {
        POST('submitPaperwork', { requestId: mg.requestId, results, notes, treatmentPlan, followUp });
    } else {
        POST('submitResults', { sampleId: mg.sampleId, results, notes });
    }
    hideResults();
    toast('Paperwork submitted.', 'success');
    state.minigame = null;
    state.currentSample = null;
    state.appointment = null;
    $('#active-request').classList.add('hidden');
});

// =====================================================================
// PATIENT CONSENT POPUP
// =====================================================================
// Shown to the patient when a doctor sends a test request from the tablet.
// Renders independently of the tablet (works even when #app is hidden).
// =====================================================================
const consentPopup = {
    timer: null,
    interval: null,
    active: null,        // { requestId, deadlineMs }

    show({ requestId, doctorName, timeoutMs }) {
        this.cancel(); // close any in-flight popup first
        this.active = { requestId, deadlineMs: Date.now() + timeoutMs };

        $('#consent-doctor').textContent = doctorName ? `Dr. ${doctorName}` : 'A doctor';
        $('#consent-popup').classList.remove('hidden');
        document.body.classList.remove('hidden');

        // Countdown bar + numeric
        const total = timeoutMs;
        const tick = () => {
            const remaining = Math.max(0, this.active.deadlineMs - Date.now());
            const pct = (remaining / total) * 100;
            $('#consent-timer-bar').style.width = pct + '%';
            $('#consent-countdown').textContent = Math.ceil(remaining / 1000);
            if (remaining <= 0) {
                // Auto-decline
                this.reply(false);
            }
        };
        tick();
        this.interval = setInterval(tick, 200);
    },

    reply(accepted) {
        if (!this.active) return;
        const requestId = this.active.requestId;
        POST('popupReply', { accept: !!accepted, requestId });
        this.hide();
    },

    cancel() {
        // External hide (no reply sent) — e.g. server cancellation
        if (!this.active) return;
        this.hide();
    },

    hide() {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
        this.active = null;
        $('#consent-popup').classList.add('hidden');
        // If the tablet isn't open, re-hide the body so the page is invisible
        if ($('#app').classList.contains('hidden')) {
            document.body.classList.add('hidden');
        }
    },
};

$('#consent-accept').addEventListener('click', () => consentPopup.reply(true));
$('#consent-decline').addEventListener('click', () => consentPopup.reply(false));

// =====================================================================
// PATIENT VIEW
// =====================================================================
function showPatientView() { $('#patient-view').classList.remove('hidden'); }
function hidePatientView() { $('#patient-view').classList.add('hidden'); }
$('#patient-close').addEventListener('click', () => { hidePatientView(); closeApp(); });

function renderPatientView(rows) {
    state.patientRows = rows || [];
    const wrap = $('#patient-results-list');
    if (!rows || !rows.length) {
        wrap.innerHTML = '<div class="empty-state">No results on file.</div>';
        return;
    }
    // We don't have diseases list from server when in patient mode, infer from results keys
    const allKeys = new Set();
    rows.forEach(r => Object.keys(r.results || {}).forEach(k => allKeys.add(k)));
    const diseaseList = [...allKeys];

    wrap.innerHTML = rows.map(r => `
        <div class="patient-result-card">
            <div class="patient-result-head">
                <div class="doc-line">
                    Tested by <strong>Dr. ${esc(r.doctor_name)}</strong><br/>
                    <span style="font-size:11px;color:var(--text-mute);">${fmtTime(r.tested_at)}</span>
                </div>
                <span class="status-pill ${Object.values(r.results||{}).includes('positive') ? 'positive' : 'negative'}">
                    ${Object.values(r.results||{}).includes('positive') ? 'Positive findings' : 'All clear'}
                </span>
            </div>
            <div class="patient-result-grid">
                ${diseaseList.map(k => `
                    <div class="row">
                        <span>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</span>
                        <span class="status-pill ${esc(r.results[k] || 'inconclusive')}">${esc(r.results[k] || 'inconclusive')}</span>
                    </div>
                `).join('')}
            </div>
            ${r.notes ? `<div class="patient-result-notes">Doctor's notes: ${esc(r.notes)}</div>` : ''}
            <div class="patient-result-foot">
                <button class="btn btn-primary btn-sm" data-ack="${r.id}"><i class="fa-solid fa-check"></i> Acknowledge & Pick Up</button>
            </div>
        </div>
    `).join('');
    wrap.querySelectorAll('[data-ack]').forEach(b => b.addEventListener('click', () => {
        POST('patientAck', { resultId: Number(b.dataset.ack) });
        b.closest('.patient-result-card').style.opacity = '0.5';
        b.disabled = true;
        b.innerHTML = '<i class="fa-solid fa-check"></i> Acknowledged';
        toast('Marked as picked up.', 'success');
    }));
}

// =====================================================================
// BEGIN TEST FLOW (doctor)
// =====================================================================
function beginTest(sampleId) {
    const s = state.samples.find(x => x.id === sampleId);
    if (!s) return;
    state.currentSample = s;
    POST('startTest', { sampleId });
}

// =====================================================================
// NUI MESSAGES
// =====================================================================

window.addEventListener('message', (event) => {
    const data = event.data || {};
    switch (data.action) {
        case 'open':
            openApp(data.mode || 'doctor');
            if (data.mode === 'patient') {
                renderPatientView(data.rows || []);
                showPatientView();
            } else if (data.tab) {
                showSection(data.tab);
            }
            break;
        case 'close':
            stopNearbyPolling();
            closeApp();
            break;
        case 'panel:data': {
            const d = data.data || {};
            state.samples      = d.samples || [];
            state.myTests      = d.myTests || [];
            state.diseases     = d.diseases || [];
            state.diseaseStats = d.diseaseStats || {};
            state.totalTests   = d.totalTests || 0;
            state.doctorId     = d.doctorId || null;
            state.config       = Object.assign({ samplesRequired: 3 }, d.config || {});
            renderDashboard();
            renderMyTests();
            break;
        }
        case 'nearby:list':
            renderNearby(data.rows || []);
            break;
        case 'lab:samples':
            renderLabQueue(data.rows || []);
            // Keep the appointment panel view in sync if the active request
            // is one of the lab-queue rows.
            if (state.appointment && state.appointment.requestId) {
                const row = (data.rows || []).find(r => r.id === state.appointment.requestId);
                if (row && row.panels && row.panels.panels) {
                    updateAppointment({ panels: row.panels.panels });
                }
            }
            break;
        case 'request:accepted':
            updateAppointment({ requestId: data.requestId, status: 'accepted' });
            toast('Patient accepted — heading to a bed.', 'success');
            break;
        case 'request:progress':
            updateAppointment({
                requestId:     data.requestId,
                status:        data.stage,
                samplesDone:   data.samplesDone,
                samplesNeeded: data.samplesNeeded,
            });
            if (data.stage === 'on_bed') {
                toast('Patient is on the bed — go draw the blood samples.', 'info');
            } else if (data.stage === 'samples_drawn') {
                toast('All samples collected! Run the lab panels.', 'success');
                // Pull panel data so the appointment view shows the 3 panels
                POST('requestLabSamples', {});
            }
            break;
        case 'request:cancelled':
            clearAppointment();
            toast('Test request cancelled.', 'info');
            break;
        case 'paperwork:submitted':
            state.savedMinigame = null;     // test fully done — drop resume state
            if (state.appointment) updateAppointment({ status: 'completed' });
            POST('requestLabSamples', {});
            POST('requestUnsentResults', {});
            toast('Paperwork filed. Open "To Send" to release to patient.', 'success');
            break;
        case 'panel:incubating':
            POST('requestLabSamples', {});
            break;
        case 'unsent:list':
            renderToSend(data.rows || []);
            break;
        case 'results:sent':
            toast('Results released to patient.', 'success');
            POST('requestUnsentResults', {});
            POST('refresh', {});
            break;
        case 'popup:show':
            consentPopup.show({
                requestId:  data.requestId,
                doctorName: data.doctorName,
                timeoutMs:  data.timeoutMs || 20000,
            });
            break;
        case 'popup:hide':
            consentPopup.cancel();
            break;
        case 'patient:lookup':
            renderLookup(data.rows || []);
            break;
        case 'minigame:begin': {
            const p = data.payload || {};

            // Resume from saved state if it matches this request AND panel
            let startStep = 0;
            let resuming  = false;
            if (state.savedMinigame
                && state.savedMinigame.requestId === p.requestId
                && state.savedMinigame.panelId   === p.panelId) {
                startStep = state.savedMinigame.stepIndex || 0;
                resuming  = startStep > 0;
            }

            state.minigame = {
                sampleId:      p.sampleId,
                requestId:     p.requestId || null,
                panelId:       p.panelId || null,
                panelName:     p.panelName || 'Panel',
                panelDuration: p.panelDuration || 15 * 60 * 1000,
                patientId:     p.patientId,
                patientName:   p.patientName,
                diseases:      p.diseases || state.diseases,
                cfg: ({
                    glovesTimeLimit: 8000,
                    sanitizeStrokesNeeded: 8,
                    sanitizeTimeLimit: 10000,
                    labelTimeLimit: 12000,
                    centrifugeDuration: 6000,
                    reagentTimeLimit: 15000,
                    sequenceLength: 4,
                    sequenceShowTime: 4000,
                    sequenceInputTime: 10000,
                }),
                stepIndex:     startStep,
                stepCompleted: false,
                stepFailed:    false,
                failedStep:    null,
                timer:         null,
                cleanup:       null,
            };
            const subTitle = p.panelName
                ? `Patient: ${p.patientName} · ${p.panelName}`
                : `Patient: ${p.patientName} · Sample #${p.sampleId}`;
            $('#mg-subtitle').textContent = subTitle;
            showMinigame();
            renderSteps();
            loadStep(startStep);
            if (resuming) {
                toast(`Resumed at step ${startStep + 1} of ${STEPS.length}.`, 'success');
            } else if (p.resumed) {
                // Server says this panel was already running, but we have no
                // saved step locally (UI was fully closed) — restart from step 1.
                toast('Restarting this panel from the beginning.', 'info');
            }
            break;
        }
        case 'results:submitted':
            toast(`Results saved (record #${data.resultId}).`, 'success');
            POST('refresh', {});
            break;
    }
});
