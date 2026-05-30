/* =========================================================
   Puchar Felka 2016 — logika aplikacji
   ========================================================= */
(function () {
  'use strict';

  // ---------- Stan ----------
  let state = null;          // dane turnieju
  let editMode = false;
  let editPin = '';
  let saveTimer = null;
  let savePending = false;
  let es = null;             // EventSource (SSE)
  let suppressEvents = false; // ignoruj zdarzenia "data" tuż po własnym zapisie

  // ---------- Skróty ----------
  const $ = (sel) => document.querySelector(sel);
  const groupsEl = $('#groups');
  const loadingEl = $('#loading');

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  function teamColor(name) {
    let h = 0;
    for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h}, 62%, 46%)`;
  }

  // ---------- Obliczanie tabeli ----------
  function computeStandings(group) {
    const s = (state.settings) || { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 };
    const rows = {};
    (group.teams || []).forEach((t) => {
      rows[t.id] = { teamId: t.id, name: t.name, M: 0, W: 0, R: 0, P: 0, gf: 0, ga: 0, diff: 0, pts: 0 };
    });
    (group.matches || []).forEach((m) => {
      if (!m.played || m.homeScore == null || m.awayScore == null) return;
      const h = rows[m.homeId], a = rows[m.awayId];
      if (!h || !a) return;
      const hs = Number(m.homeScore), as = Number(m.awayScore);
      h.M++; a.M++;
      h.gf += hs; h.ga += as;
      a.gf += as; a.ga += hs;
      if (hs > as) { h.W++; a.P++; h.pts += s.pointsWin; a.pts += s.pointsLoss; }
      else if (hs < as) { a.W++; h.P++; a.pts += s.pointsWin; h.pts += s.pointsLoss; }
      else { h.R++; a.R++; h.pts += s.pointsDraw; a.pts += s.pointsDraw; }
    });
    const arr = Object.values(rows).map((r) => { r.diff = r.gf - r.ga; return r; });
    arr.sort((x, y) =>
      y.pts - x.pts || y.diff - x.diff || y.gf - x.gf || x.name.localeCompare(y.name, 'pl')
    );
    return arr;
  }

  function teamName(group, id) {
    const t = (group.teams || []).find((x) => x.id === id);
    return t ? t.name : '—';
  }

  // ---------- Render: nagłówek / meta ----------
  function renderMeta() {
    const nameEl = $('#t-name');
    const yearEl = $('#t-year');
    const subEl = $('#t-subtitle');
    $('#qualify-n').textContent = (state.settings && state.settings.qualifyCount) || 2;

    if (editMode) {
      nameEl.innerHTML = `<input class="meta-input meta-name" value="${esc(state.tournamentName)}" />`;
      yearEl.innerHTML = `<input class="meta-input meta-year" value="${esc(state.year)}" size="4" />`;
      subEl.innerHTML = `<input class="meta-input meta-sub" value="${esc(state.subtitle)}" />`;
      nameEl.querySelector('input').addEventListener('input', (e) => { state.tournamentName = e.target.value; scheduleSave(); });
      yearEl.querySelector('input').addEventListener('input', (e) => { state.year = e.target.value; scheduleSave(); });
      subEl.querySelector('input').addEventListener('input', (e) => { state.subtitle = e.target.value; scheduleSave(); });
    } else {
      nameEl.textContent = state.tournamentName || 'Turniej';
      yearEl.textContent = state.year || '';
      subEl.textContent = state.subtitle || '';
    }
    document.title = `${state.tournamentName || 'Turniej'} ${state.year || ''} — tabela`.trim();
  }

  // ---------- Render: cały widok ----------
  function render() {
    renderMeta();
    groupsEl.innerHTML = '';
    loadingEl.hidden = true;

    (state.groups || []).forEach((group, idx) => {
      const card = buildGroupCard(group);
      card.style.animationDelay = (idx * 70) + 'ms';
      groupsEl.appendChild(card);
    });

    if (state.updatedAt) {
      const d = new Date(state.updatedAt);
      $('#updated-at').textContent = 'Ostatnia aktualizacja: ' +
        d.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
    }
  }

  function buildGroupCard(group) {
    const card = document.createElement('section');
    card.className = 'group-card';
    card.dataset.groupId = group.id;

    // Nagłówek grupy
    const head = document.createElement('div');
    head.className = 'group-head';
    if (editMode) {
      head.innerHTML = `
        <input class="group-title-input" value="${esc(group.name)}" />
        <div class="group-head-actions">
          <button class="btn btn-mini btn-danger" data-act="del-group">Usuń grupę</button>
        </div>`;
      head.querySelector('.group-title-input').addEventListener('input', (e) => {
        group.name = e.target.value; scheduleSave();
      });
      head.querySelector('[data-act="del-group"]').addEventListener('click', () => deleteGroup(group.id));
    } else {
      head.innerHTML = `<h3 class="group-title">${esc(group.name)}</h3>`;
    }
    card.appendChild(head);

    // Tabela wyników (zawsze widoczna — także w edycji jako podgląd na żywo)
    const tableWrap = document.createElement('div');
    tableWrap.className = 'standings-wrap';
    tableWrap.appendChild(buildStandingsTable(group));
    card.appendChild(tableWrap);

    if (editMode) {
      card.appendChild(buildTeamsEditor(group));
      card.appendChild(buildMatchesEditor(group));
    } else {
      card.appendChild(buildMatchesView(group));
    }
    return card;
  }

  function buildStandingsTable(group) {
    const qualify = (state.settings && state.settings.qualifyCount) || 0;
    const rows = computeStandings(group);
    const table = document.createElement('table');
    table.className = 'standings';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-pos">#</th>
          <th class="col-team">Drużyna</th>
          <th title="Rozegrane mecze">M</th>
          <th title="Wygrane">W</th>
          <th title="Remisy">R</th>
          <th title="Porażki">P</th>
          <th class="col-hide-sm" title="Bramki zdobyte:stracone">Bramki</th>
          <th class="col-hide-sm" title="Różnica bramek">+/−</th>
          <th title="Punkty">Pkt</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (qualify && i < qualify) tr.className = 'qualify';
      const diffClass = r.diff > 0 ? 'pos' : (r.diff < 0 ? 'neg' : '');
      const diffStr = (r.diff > 0 ? '+' : '') + r.diff;
      tr.innerHTML = `
        <td class="col-pos">${i + 1}</td>
        <td class="col-team">
          <span class="team-cell">
            <span class="team-badge" style="background:${teamColor(r.name)}">${esc(initials(r.name))}</span>
            <span>${esc(r.name)}</span>
          </span>
        </td>
        <td>${r.M}</td>
        <td>${r.W}</td>
        <td>${r.R}</td>
        <td>${r.P}</td>
        <td class="col-goals col-hide-sm">${r.gf}:${r.ga}</td>
        <td class="col-diff col-hide-sm ${diffClass}">${diffStr}</td>
        <td class="col-pts">${r.pts}</td>`;
      tbody.appendChild(tr);
    });
    return table;
  }

  function updateStandings(groupId) {
    const card = groupsEl.querySelector(`[data-group-id="${groupId}"]`);
    if (!card) return;
    const group = state.groups.find((g) => g.id === groupId);
    const wrap = card.querySelector('.standings-wrap');
    wrap.innerHTML = '';
    wrap.appendChild(buildStandingsTable(group));
  }

  // ---------- Widok meczów (tryb tylko do odczytu) ----------
  function buildMatchesView(group) {
    const wrap = document.createElement('div');
    wrap.className = 'matches';
    const matches = group.matches || [];
    const list = document.createElement('div');
    list.className = 'matches-list';
    list.hidden = true;

    matches.forEach((m) => {
      const played = m.played && m.homeScore != null && m.awayScore != null;
      const row = document.createElement('div');
      row.className = 'match-row' + (played ? ' played' : '');
      row.innerHTML = `
        <span class="match-home">${esc(teamName(group, m.homeId))}</span>
        <span class="match-score ${played ? '' : 'empty'}">${played ? m.homeScore + ' : ' + m.awayScore : '– : –'}</span>
        <span class="match-away">${esc(teamName(group, m.awayId))}</span>`;
      list.appendChild(row);
    });

    const toggle = document.createElement('button');
    toggle.className = 'matches-toggle';
    toggle.textContent = `▾ Pokaż mecze (${matches.length})`;
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      toggle.textContent = (list.hidden ? '▾ Pokaż' : '▴ Ukryj') + ` mecze (${matches.length})`;
    });

    wrap.appendChild(toggle);
    wrap.appendChild(list);
    return wrap;
  }

  // ---------- Edytor drużyn ----------
  function buildTeamsEditor(group) {
    const sec = document.createElement('div');
    sec.className = 'edit-section';
    sec.innerHTML = '<h4>Drużyny</h4>';

    (group.teams || []).forEach((t) => {
      const row = document.createElement('div');
      row.className = 'team-edit-row';
      row.innerHTML = `
        <span class="team-badge" style="background:${teamColor(t.name)}">${esc(initials(t.name))}</span>
        <input class="team-name-input" value="${esc(t.name)}" />
        <button class="btn btn-mini btn-danger">Usuń</button>`;
      const input = row.querySelector('input');
      input.addEventListener('input', (e) => {
        t.name = e.target.value;
        row.querySelector('.team-badge').textContent = initials(t.name);
        row.querySelector('.team-badge').style.background = teamColor(t.name);
        updateStandings(group.id);
        scheduleSave();
      });
      row.querySelector('button').addEventListener('click', () => deleteTeam(group.id, t.id));
      sec.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'add-team-row';
    addRow.innerHTML = `
      <input class="team-name-input" placeholder="Nazwa nowej drużyny" />
      <button class="btn btn-mini btn-save">+ Dodaj</button>`;
    const addInput = addRow.querySelector('input');
    const doAdd = () => {
      const name = addInput.value.trim();
      if (!name) return;
      group.teams.push({ id: uid('team'), name });
      scheduleSave();
      render();
    };
    addRow.querySelector('button').addEventListener('click', doAdd);
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    sec.appendChild(addRow);
    return sec;
  }

  // ---------- Edytor meczów ----------
  function buildMatchesEditor(group) {
    const sec = document.createElement('div');
    sec.className = 'edit-section';
    sec.innerHTML = '<h4>Mecze i wyniki</h4>';

    const list = document.createElement('div');
    list.className = 'matches-list';

    (group.matches || []).forEach((m) => {
      const row = document.createElement('div');
      row.className = 'match-row' + (m.played ? ' played' : '');
      row.innerHTML = `
        <span class="match-home">${esc(teamName(group, m.homeId))}</span>
        <span style="display:flex;align-items:center;gap:6px;justify-content:center">
          <input class="score-input s-home" type="number" min="0" inputmode="numeric" value="${m.homeScore != null ? m.homeScore : ''}" />
          <span class="score-sep">:</span>
          <input class="score-input s-away" type="number" min="0" inputmode="numeric" value="${m.awayScore != null ? m.awayScore : ''}" />
        </span>
        <span class="match-away" style="display:flex;align-items:center;gap:6px;justify-content:flex-start">
          ${esc(teamName(group, m.awayId))}
          <button class="btn btn-mini btn-danger" title="Usuń mecz">✕</button>
        </span>`;
      const sh = row.querySelector('.s-home');
      const sa = row.querySelector('.s-away');
      const onScore = () => {
        const hv = sh.value === '' ? null : Math.max(0, parseInt(sh.value, 10) || 0);
        const av = sa.value === '' ? null : Math.max(0, parseInt(sa.value, 10) || 0);
        m.homeScore = hv; m.awayScore = av;
        m.played = (hv != null && av != null);
        row.classList.toggle('played', m.played);
        updateStandings(group.id);
        scheduleSave();
      };
      sh.addEventListener('input', onScore);
      sa.addEventListener('input', onScore);
      row.querySelector('.btn-danger').addEventListener('click', () => {
        group.matches = group.matches.filter((x) => x.id !== m.id);
        updateStandings(group.id);
        scheduleSave();
        render();
      });
      list.appendChild(row);
    });
    sec.appendChild(list);

    // Akcje: generowanie i ręczne dodawanie
    const actions = document.createElement('div');
    actions.className = 'add-team-row';
    actions.style.flexWrap = 'wrap';
    actions.innerHTML = `
      <button class="btn btn-mini btn-ghost" data-act="gen" style="background:var(--blue);border-color:var(--blue)">⚙ Generuj mecze (każdy z każdym)</button>
      <button class="btn btn-mini btn-save" data-act="add">+ Dodaj mecz</button>`;
    actions.querySelector('[data-act="gen"]').addEventListener('click', () => generateMatches(group.id));
    actions.querySelector('[data-act="add"]').addEventListener('click', () => addMatch(group.id));
    sec.appendChild(actions);
    return sec;
  }

  // ---------- Operacje edycji ----------
  function addGroup() {
    const n = (state.groups || []).length;
    const letter = String.fromCharCode(65 + n);
    state.groups.push({ id: uid('grp'), name: 'Grupa ' + letter, teams: [], matches: [] });
    scheduleSave();
    render();
  }
  function deleteGroup(id) {
    const g = state.groups.find((x) => x.id === id);
    if (!confirm(`Usunąć „${g ? g.name : ''}" wraz z drużynami i meczami?`)) return;
    state.groups = state.groups.filter((x) => x.id !== id);
    scheduleSave();
    render();
  }
  function deleteTeam(groupId, teamId) {
    const g = state.groups.find((x) => x.id === groupId);
    g.teams = g.teams.filter((t) => t.id !== teamId);
    // usuń mecze z udziałem tej drużyny
    g.matches = g.matches.filter((m) => m.homeId !== teamId && m.awayId !== teamId);
    scheduleSave();
    render();
  }
  function generateMatches(groupId) {
    const g = state.groups.find((x) => x.id === groupId);
    if ((g.teams || []).length < 2) { toast('Dodaj co najmniej 2 drużyny.', true); return; }
    if ((g.matches || []).length && !confirm('To zastąpi obecną listę meczów w tej grupie. Kontynuować?')) return;
    const ms = [];
    for (let i = 0; i < g.teams.length; i++) {
      for (let j = i + 1; j < g.teams.length; j++) {
        ms.push({ id: uid('m'), homeId: g.teams[i].id, awayId: g.teams[j].id, homeScore: null, awayScore: null, played: false });
      }
    }
    g.matches = ms;
    scheduleSave();
    render();
  }
  function addMatch(groupId) {
    const g = state.groups.find((x) => x.id === groupId);
    if ((g.teams || []).length < 2) { toast('Najpierw dodaj drużyny.', true); return; }
    g.matches.push({ id: uid('m'), homeId: g.teams[0].id, awayId: g.teams[1].id, homeScore: null, awayScore: null, played: false });
    scheduleSave();
    render();
  }

  // ---------- Ustawienia (modal) ----------
  function openSettings() {
    const s = state.settings || (state.settings = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2 });
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-card">
        <h3>Ustawienia turnieju</h3>
        <label style="display:block;margin:10px 0 4px;font-weight:600;color:#5566895c">Nazwa turnieju</label>
        <input class="team-name-input" id="set-name" value="${esc(state.tournamentName)}" style="width:100%" />
        <label style="display:block;margin:10px 0 4px;font-weight:600">Rok</label>
        <input class="team-name-input" id="set-year" value="${esc(state.year)}" style="width:100%" />
        <label style="display:block;margin:10px 0 4px;font-weight:600">Podtytuł</label>
        <input class="team-name-input" id="set-sub" value="${esc(state.subtitle)}" style="width:100%" />
        <label style="display:block;margin:10px 0 4px;font-weight:600">Ile drużyn awansuje z grupy</label>
        <input class="team-name-input" id="set-qual" type="number" min="0" value="${s.qualifyCount || 0}" style="width:100%" />
        <div style="display:flex;gap:10px;margin-top:10px">
          <div style="flex:1"><label style="font-size:12px;color:#6b78a0">Pkt za wygraną</label>
            <input class="team-name-input" id="set-w" type="number" value="${s.pointsWin}" style="width:100%" /></div>
          <div style="flex:1"><label style="font-size:12px;color:#6b78a0">Pkt za remis</label>
            <input class="team-name-input" id="set-d" type="number" value="${s.pointsDraw}" style="width:100%" /></div>
        </div>
        <div class="modal-actions" style="margin-top:18px">
          <button class="btn btn-ghost" id="set-cancel" style="background:#eef1fb;color:#444">Anuluj</button>
          <button class="btn btn-save" id="set-save">Zapisz</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#set-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#set-save').addEventListener('click', () => {
      state.tournamentName = modal.querySelector('#set-name').value.trim() || state.tournamentName;
      state.year = modal.querySelector('#set-year').value.trim();
      state.subtitle = modal.querySelector('#set-sub').value.trim();
      s.qualifyCount = Math.max(0, parseInt(modal.querySelector('#set-qual').value, 10) || 0);
      s.pointsWin = parseInt(modal.querySelector('#set-w').value, 10) || 0;
      s.pointsDraw = parseInt(modal.querySelector('#set-d').value, 10) || 0;
      modal.remove();
      scheduleSave();
      render();
    });
  }

  // ---------- Zapis ----------
  function setSaveStatus(text, cls) {
    const el = $('#save-status');
    el.textContent = text;
    el.className = 'save-status' + (cls ? ' ' + cls : '');
  }
  function scheduleSave() {
    savePending = true;
    setSaveStatus('Niezapisane zmiany…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (!savePending) return;
    setSaveStatus('Zapisywanie…', 'saving');
    suppressEvents = true;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-edit-pin': editPin },
        body: JSON.stringify(state),
      });
      const out = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setSaveStatus('Błędny PIN — zmiany niezapisane', 'error');
          openPinModal(true);
        } else {
          setSaveStatus('Błąd zapisu: ' + (out.error || res.status), 'error');
        }
        return;
      }
      savePending = false;
      state.updatedAt = out.updatedAt;
      const t = new Date(out.updatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSaveStatus('Zapisano ✓ ' + t);
      if (state.updatedAt) {
        $('#updated-at').textContent = 'Ostatnia aktualizacja: ' +
          new Date(state.updatedAt).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
      }
    } catch (e) {
      setSaveStatus('Błąd sieci: ' + e.message, 'error');
    } finally {
      setTimeout(() => { suppressEvents = false; }, 400);
    }
  }

  // ---------- Wczytywanie danych ----------
  async function loadData() {
    const res = await fetch('/api/data', { cache: 'no-store' });
    state = await res.json();
    if (!state.settings) state.settings = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2 };
    if (!Array.isArray(state.groups)) state.groups = [];
    render();
  }

  // ---------- SSE: synchronizacja + live-reload ----------
  function connectSSE() {
    if (es) es.close();
    es = new EventSource('/api/events');
    const dot = $('#live-dot');
    es.onopen = () => dot.classList.add('on');
    es.onerror = () => dot.classList.remove('on');
    es.addEventListener('reload', () => {
      // zmiana pliku źródłowego (HTML/CSS/JS) — odśwież po wypchnięciu zapisu
      if (savePending) saveNow();
      setTimeout(() => location.reload(), 300);
    });
    es.addEventListener('data', async () => {
      // ktoś inny zmienił dane — odśwież, jeśli sami nie edytujemy
      if (editMode || suppressEvents) return;
      await loadData();
      toast('Tabela zaktualizowana na żywo');
    });
  }

  // ---------- Tryb edycji + PIN ----------
  function enterEditMode() {
    editMode = true;
    document.body.classList.add('editing');
    $('#edit-toggle').classList.add('active');
    $('#edit-toggle').innerHTML = '<span class="ico">✓</span> Zakończ edycję';
    $('#edit-bar').hidden = false;
    setSaveStatus('');
    render();
  }
  function exitEditMode() {
    editMode = false;
    document.body.classList.remove('editing');
    $('#edit-toggle').classList.remove('active');
    $('#edit-toggle').innerHTML = '<span class="ico">✎</span> Tryb edycji';
    $('#edit-bar').hidden = true;
    if (savePending) saveNow();
    render();
  }

  function openPinModal(reopen) {
    const modal = $('#pin-modal');
    const input = $('#pin-input');
    modal.hidden = false;
    input.value = reopen ? '' : editPin;
    input.focus();

    const ok = () => {
      editPin = input.value;
      modal.hidden = true;
      if (!editMode) enterEditMode();
      else if (savePending) saveNow();
    };
    const cancel = () => { modal.hidden = true; };

    $('#pin-ok').onclick = ok;
    $('#pin-cancel').onclick = cancel;
    input.onkeydown = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); };
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); }, 2600);
  }

  // ---------- Inicjalizacja ----------
  function init() {
    $('#edit-toggle').addEventListener('click', () => {
      if (editMode) exitEditMode();
      else openPinModal(false);
    });
    $('#save-now').addEventListener('click', saveNow);
    $('#add-group').addEventListener('click', addGroup);
    $('#edit-meta').addEventListener('click', openSettings);

    loadData().catch((e) => {
      loadingEl.textContent = 'Błąd wczytywania danych: ' + e.message;
    });
    connectSSE();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
