/* ===== Análisis estructural: matriz justificada, plano de cuadrantes y simulación ===== */
const LS = 'micmac-v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const key = (a, b) => a + '>' + b;
let uid = 1;function defaults(lang = (typeof currentLang !== 'undefined' ? currentLang : 'es')) {
  const sourceVars = (lang === 'en' && typeof DEFAULT_VARS_EN !== 'undefined') ? DEFAULT_VARS_EN : DEFAULT_VARS;
  const vars = sourceVars.map(([code, name, desc, x0]) => ({ id: 'v' + uid++, code, name, desc, x0 }));
  const byCode = Object.fromEntries(vars.map(v => [v.code, v.id]));
  const links = {};
  DEFAULT_LINKS.forEach(([a, b, v, concept, evidence, src]) => {
    const k = key(byCode[a], byCode[b]);
    const t = (typeof DEFAULT_DELAYS !== 'undefined' ? DEFAULT_DELAYS[a + '>' + b] : 1.5) ?? (v ? 1.5 : 0);
    links[k] = { v, t, concept, evidence, src };
  });
  return { vars, links, ints: [{ vid: byCode.INV, type: 'sust', mag: 2, start: 3, dur: 18 }], params: { beta: .15, lambda: .05, steps: 50 } };
}
let S = (() => { try { const s = JSON.parse(localStorage.getItem(LS)); if (s && s.vars) { uid = 1000; return s; } } catch (e) { } return defaults(); })();
const save = () => localStorage.setItem(LS, JSON.stringify(S));
const V = () => S.vars;
const idx = id => V().findIndex(v => v.id === id);
const L = (a, b) => S.links[key(a, b)];
const val = (a, b) => (L(a, b)?.v) || 0;
const del = (a, b) => S.links[key(a, b)]?.t ?? ((typeof DEFAULT_DELAYS !== 'undefined' ? DEFAULT_DELAYS[code(a) + '>' + code(b)] : 1.5) ?? (val(a, b) ? 1.5 : 0));
const ui = { sel: null, selVar: null, hidden: new Set(), view: 'abs', dynSel: null };

/* ---------- Colores / cuadrantes ---------- */
function getQuad() {
  const _t = typeof t === 'function' ? t : (k => k);
  return {
    power: { name: _t('q_power_name'), color: '#34d399', short: _t('q_power_short'),
      concept: _t('q_power_concept'), action: _t('q_power_action') },
    conflict: { name: _t('q_conflict_name'), color: '#f59e0b', short: _t('q_conflict_short'),
      concept: _t('q_conflict_concept'), action: _t('q_conflict_action') },
    result: { name: _t('q_result_name'), color: '#a78bfa', short: _t('q_result_short'),
      concept: _t('q_result_concept'), action: _t('q_result_action') },
    auto: { name: _t('q_auto_name'), color: '#64748b', short: _t('q_auto_short'),
      concept: _t('q_auto_concept'), action: _t('q_auto_action') }
  };
}
const QUAD = new Proxy({}, { get: (target, prop) => getQuad()[prop] });
const quadOf = (infl, dep, ty, tx) => infl >= ty ? (dep >= tx ? 'conflict' : 'power') : (dep >= tx ? 'result' : 'auto');
const cellBg = v => v === 0 ? 'transparent' : (v > 0 ? `rgba(56,189,248,${.18 + .25 * v})` : `rgba(251,113,133,${.18 + .25 * -v})`);
const pillBg = v => v === 0 ? '#475569' : v > 0 ? '#38bdf8' : '#fb7185';
const varColor = i => `hsl(${(i * 360 / Math.max(V().length, 1) + 200) % 360},72%,62%)`;
const sgn = v => (v > 0 ? '+' : '') + v;
const code = id => V()[idx(id)]?.code || '?';
const name = id => V()[idx(id)]?.name || '?';

/* ---------- Pestañas ---------- */
$('#tabs').onclick = e => {
  const t = e.target.dataset.tab; if (!t) return;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b === e.target));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
  renderAll();
};

/* ---------- 1. Variables ---------- */
function renderVars() {
  $('#vars-table').innerHTML = `<tr><th>${t('th_code')}</th><th>${t('th_name')}</th><th>${t('th_desc')}</th><th>${t('th_x0')}</th><th></th></tr>` +
    V().map(v => `<tr><td><input class="code" data-id="${v.id}" data-f="code" value="${esc(v.code)}"></td>
    <td><input data-id="${v.id}" data-f="name" value="${esc(v.name)}"></td>
    <td><input data-id="${v.id}" data-f="desc" value="${esc(v.desc)}"></td>
    <td><input class="num" type="number" min="0" max="100" data-id="${v.id}" data-f="x0" value="${v.x0}"></td>
    <td><button class="x" data-del="${v.id}" title="${currentLang === 'en' ? 'Delete' : 'Eliminar'}">✕</button></td></tr>`).join('');
}
$('#vars-table').oninput = e => {
  const { id, f } = e.target.dataset; if (!id) return;
  const v = V()[idx(id)]; v[f] = f === 'x0' ? clamp(+e.target.value || 0, 0, 100) : (f === 'code' ? e.target.value.toUpperCase() : e.target.value); save();
};
$('#vars-table').onclick = e => {
  const id = e.target.dataset.del; if (!id) return;
  if (V().length <= 2) return alert(t('alert_min_vars'));
  S.vars.splice(idx(id), 1);
  Object.keys(S.links).forEach(k => { if (k.split('>').includes(id)) delete S.links[k]; });
  S.ints = S.ints.filter(i => i.vid !== id); ui.sel = null; ui.selVar = null; save(); renderAll();
};
$('#add-var').onclick = () => { S.vars.push({ id: 'v' + uid++, code: 'V' + (V().length + 1), name: currentLang === 'en' ? 'New variable' : 'Nueva variable', desc: '', x0: 50 }); save(); renderVars(); };

/* ---------- 2. Matriz ---------- */
const hasJust = l => l && (l.concept || '').trim().length > 10 && (l.evidence || '').trim().length > 10;
function sums() {
  const n = V().length, inf = Array(n).fill(0), dep = Array(n).fill(0);
  V().forEach((a, i) => V().forEach((b, j) => { if (i !== j) { const x = Math.abs(val(a.id, b.id)); inf[i] += x; dep[j] += x; } }));
  return { inf, dep };
}
function renderMatrix() {
  const { inf, dep } = sums();
  let h = `<tr><th></th>${V().map(v => `<th title="${esc(v.name)}">${esc(v.code)}</th>`).join('')}<th>${t('th_sum_infl')}</th></tr>`;
  V().forEach((a, i) => {
    h += `<tr><th>${esc(a.code)}</th>`;
    V().forEach((b, j) => {
      if (i === j) { h += `<td class="diag"></td>`; return; }
      const l = L(a.id, b.id), v = l?.v || 0, miss = v !== 0 && !hasJust(l);
      const sel = ui.sel && ui.sel[0] === a.id && ui.sel[1] === b.id;
      h += `<td class="cell${sel ? ' sel' : ''}${miss ? ' miss' : ''}" data-a="${a.id}" data-b="${b.id}" style="background:${cellBg(v)}">${v === 0 ? '<span style="opacity:.25">·</span>' : sgn(v)}</td>`;
    });
    h += `<td class="tot">${inf[i]}</td></tr>`;
  });
  h += `<tr><th>${t('th_sum_dep')}</th>${dep.map(d => `<td class="tot">${d}</td>`).join('')}<td></td></tr>`;
  $('#matrix').innerHTML = h;
  const nz = Object.values(S.links).filter(l => l.v), ok = nz.filter(hasJust).length;
  $('#completeness').textContent = `${t('completeness_prefix')} ${ok}/${nz.length}`;
  $('#completeness').style.color = ok === nz.length ? '#34d399' : '#fbbf24';
  $('#matrix-legend').innerHTML = [-3, -2, -1, 0, 1, 2, 3].map(v => `<span><span class="sw" style="background:${v === 0 ? '#1c2540' : cellBg(v)}"></span>${sgn(v)}</span>`).join('') + `<span>${t('legend_note')}</span>`;
}
function renderRubric() {
  const r = $('#rubric');
  if (!r) return;
  r.innerHTML = `
    <div><b>${t('r_0_title')}</b>${t('r_0_desc')}</div>
    <div><b>${t('r_1_title')}</b>${t('r_1_desc')}</div>
    <div><b>${t('r_2_title')}</b>${t('r_2_desc')}</div>
    <div><b>${t('r_3_title')}</b>${t('r_3_desc')}</div>
    <div><b>${t('r_sign_title')}</b>${t('r_sign_desc')}</div>
    <div><b>${t('r_how_title')}</b>${t('r_how_desc')}</div>
  `;
}
renderRubric();
$('#matrix').onclick = e => { const c = e.target.closest('.cell'); if (c) { ui.sel = [c.dataset.a, c.dataset.b]; renderMatrix(); renderEditor(); } };
$('#matrix').onmousemove = e => {
  const c = e.target.closest('.cell'); if (!c) return tip(null);
  const l = L(c.dataset.a, c.dataset.b);
  tip(e, `<b>${esc(code(c.dataset.a))} → ${esc(code(c.dataset.b))}</b> (${sgn(l?.v || 0)})<br>${l?.concept ? esc(l.concept.slice(0, 160)) + '…' : t('tip_matrix_no_dir')}`);
};
$('#matrix').onmouseleave = () => tip(null);
function tip(e, html) {
  const tEl = $('#tip'); if (!e) { tEl.style.opacity = 0; return; }
  tEl.innerHTML = html; tEl.style.opacity = 1;
  tEl.style.left = Math.min(e.clientX + 14, innerWidth - 360) + 'px'; tEl.style.top = (e.clientY + 14) + 'px';
}
function autoZero(a, b) {
  return t('ed_auto_zero');
}
function renderEditor() {
  const box = $('#cell-editor');
  if (!ui.sel) { box.innerHTML = `<h2>${t('ed_title')}</h2><p class="muted">${t('ed_empty')}</p>`; return; }
  const [a, b] = ui.sel, l = L(a, b) || { v: 0, concept: '', evidence: '', src: '' };
  box.innerHTML = `<div class="ed"><h2>${t('ed_title')}</h2>
  <div class="link-title">${esc(name(a))} <span style="color:var(--acc2)">→</span> ${esc(name(b))}</div>
  <label>${t('ed_val_lbl')}</label>
  <div class="scale">${[-3, -2, -1, 0, 1, 2, 3].map(v => `<button data-v="${v}" class="${l.v === v ? 'on' : ''}" style="${l.v === v ? 'background:' + pillBg(v) : ''}">${sgn(v)}</button>`).join('')}</div>
  ${l.v === 0 ? `<p class="muted" style="margin-top:12px">${esc(autoZero(a, b))}</p>` : ''}
  <label>${t('ed_concept_lbl')}</label><textarea data-f="concept" placeholder="${t('ed_concept_ph')}">${esc(l.concept)}</textarea>
  <label>${t('ed_evidence_lbl')}</label><textarea data-f="evidence" placeholder="${t('ed_evidence_ph')}">${esc(l.evidence)}</textarea>
  <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;margin-top:8px">
    <div><label style="margin:6px 0 2px">${t('ed_delay_lbl')}</label><input type="number" min="0" max="20" step="0.5" data-f="t" value="${esc(del(a, b))}"></div>
    <div><label style="margin:6px 0 2px">${t('ed_source_lbl')}</label><input data-f="src" value="${esc(l.src || '')}" placeholder="${t('ed_source_ph')}"></div>
  </div>
  ${l.v !== 0 && !hasJust(l) ? `<div class="warn">${t('ed_warn_missing')}</div>` : ''}</div>`;
}
$('#cell-editor').onclick = e => {
  const v = e.target.dataset.v; if (v === undefined || !ui.sel) return;
  const k = key(...ui.sel); S.links[k] = S.links[k] || { v: 0, t: del(...ui.sel), concept: '', evidence: '', src: '' };
  S.links[k].v = +v; save(); renderMatrix(); renderEditor(); renderLog(); renderDynamic();
};
$('#cell-editor').oninput = e => {
  const f = e.target.dataset.f; if (!f || !ui.sel) return;
  const k = key(...ui.sel); S.links[k] = S.links[k] || { v: 0, t: del(...ui.sel), concept: '', evidence: '', src: '' };
  if (f === 't') S.links[k].t = Math.max(0, +e.target.value || 0); else S.links[k][f] = e.target.value;
  save(); renderMatrix(); renderLog(); renderDynamic();
};
function renderLog() {
  const f = $('#log-filter').value;
  const rows = Object.entries(S.links).filter(([k, l]) => l.v && idx(k.split('>')[0]) >= 0 && idx(k.split('>')[1]) >= 0)
    .filter(([k, l]) => f === 'all' || (f === 'missing' && !hasJust(l)) || (f === 'neg' && l.v < 0) || (['1', '2', '3'].includes(f) && Math.abs(l.v) === +f))
    .sort((x, y) => Math.abs(y[1].v) - Math.abs(x[1].v));
  $('#log').innerHTML = `<tr><th>${t('th_origin')} → ${t('th_dest')}</th><th>${t('th_val')}</th><th>${t('th_concept')}</th><th>${t('th_evidence')}</th><th>${t('th_source')}</th></tr>` +
    (rows.map(([k, l]) => { const [a, b] = k.split('>'); return `<tr class="clickable" data-a="${a}" data-b="${b}"><td><b>${esc(code(a))} → ${esc(code(b))}</b></td><td><span class="pill" style="background:${pillBg(l.v)}">${sgn(l.v)}</span></td><td>${esc(l.concept) || '<i class="muted">—</i>'}</td><td>${esc(l.evidence) || '<i class="muted">—</i>'}</td><td>${esc(l.src)}</td></tr>`; }).join('') || `<tr><td colspan="5" class="muted">${currentLang === 'en' ? 'No results.' : 'Sin resultados.'}</td></tr>`);
}
$('#log-filter').onchange = renderLog;
$('#log').onclick = e => { const r = e.target.closest('tr.clickable'); if (r) { ui.sel = [r.dataset.a, r.dataset.b]; renderMatrix(); renderEditor(); scrollTo({ top: 0, behavior: 'smooth' }); } };

/* ---------- 3. Plano influencia-dependencia ---------- */
function scores(mode, K) {
  const n = V().length, A = V().map(a => V().map(b => a.id === b.id ? 0 : Math.abs(val(a.id, b.id)) / 3));
  const mul = (X, Y) => X.map(r => Y[0].map((_, j) => r.reduce((s, x, k) => s + x * Y[k][j], 0)));
  let T = A.map(r => r.slice());
  if (mode === 'indirect') { let P = A; T = A.map(r => r.slice()); for (let k = 2; k <= K; k++) { P = mul(P, A); const att = Math.pow(.6, k - 1); T = T.map((r, i) => r.map((x, j) => x + att * P[i][j])); } }
  const inf = T.map(r => r.reduce((s, x) => s + x, 0)), dep = T[0].map((_, j) => T.reduce((s, r) => s + r[j], 0));
  const mx = Math.max(...inf, ...dep, 1e-9);
  return { inf: inf.map(x => x / mx * 100), dep: dep.map(x => x / mx * 100), rawI: inf, rawD: dep };
}
const med = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
function planeData() {
  const mode = $('#pl-mode').value, K = +$('#pl-k').value, thr = $('#pl-thr').value;
  const sc = scores(mode, K), dir = scores('direct', 1);
  const f = { mean, median: med, mid: a => (Math.min(...a) + Math.max(...a)) / 2 }[thr];
  const tx = f(sc.dep), ty = f(sc.inf);
  const rk = a => a.map(x => 1 + a.filter(y => y > x + 1e-9).length);
  return { mode, K, sc, dir, tx, ty, thr, rkI: rk(sc.inf), rkD: rk(dir.inf), q: V().map((_, i) => quadOf(sc.inf[i], sc.dep[i], ty, tx)) };
}
let PD = null;
function renderPlane() {
  $('#pl-k-out').textContent = $('#pl-k').value; $('#pl-k').disabled = $('#pl-mode').value === 'direct';
  PD = planeData(); const { sc, tx, ty, q } = PD, n = V().length;
  const W = 780, H = 620, m = { l: 66, r: 20, t: 20, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  let x0 = 0, x1 = 100, y0 = 0, y1 = 100;
  if ($('#pl-zoom').checked) {
    const dom = (a, t) => { const lo = Math.min(...a, t), hi = Math.max(...a, t), p = Math.max(4, (hi - lo) * .14); return [Math.max(0, lo - p), Math.min(105, hi + p)]; };
    [x0, x1] = dom(sc.dep, tx); [y0, y1] = dom(sc.inf, ty);
  }
  const X = v => m.l + (v - x0) / (x1 - x0) * pw, Y = v => m.t + ph - (v - y0) / (y1 - y0) * ph;
  const zones = [['power', m.l, m.t, X(tx) - m.l, Y(ty) - m.t], ['conflict', X(tx), m.t, m.l + pw - X(tx), Y(ty) - m.t], ['auto', m.l, Y(ty), X(tx) - m.l, m.t + ph - Y(ty)], ['result', X(tx), Y(ty), m.l + pw - X(tx), m.t + ph - Y(ty)]];
  let s = `<svg viewBox="0 0 ${W} ${H}" id="plane-svg"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#94a3ff"/></marker></defs>`;
  zones.forEach(([k, x, y, w, h]) => {
    s += `<rect x="${x}" y="${y}" width="${Math.max(w, 0)}" height="${Math.max(h, 0)}" fill="${QUAD[k].color}" opacity=".13"/>`;
    const right = k === 'conflict' || k === 'result', bottom = k === 'auto' || k === 'result';
    s += `<text x="${right ? x + w - 12 : x + 12}" y="${bottom ? y + h - 14 : y + 26}" text-anchor="${right ? 'end' : 'start'}" fill="${QUAD[k].color}" font-size="15" font-weight="700" opacity=".9">${QUAD[k].short.toUpperCase()}</text>`;
  });
  for (let i = 0; i <= 5; i++) {
    const vx = x0 + (x1 - x0) * i / 5, vy = y0 + (y1 - y0) * i / 5;
    s += `<line x1="${X(vx)}" x2="${X(vx)}" y1="${m.t}" y2="${m.t + ph}" stroke="#94a3ff" opacity=".07"/><line y1="${Y(vy)}" y2="${Y(vy)}" x1="${m.l}" x2="${m.l + pw}" stroke="#94a3ff" opacity=".07"/>
    <text x="${X(vx)}" y="${m.t + ph + 18}" text-anchor="middle" fill="#93a0c4" font-size="11">${vx.toFixed(0)}</text><text x="${m.l - 8}" y="${Y(vy) + 4}" text-anchor="end" fill="#93a0c4" font-size="11">${vy.toFixed(0)}</text>`;
  }
  s += `<line x1="${X(tx)}" x2="${X(tx)}" y1="${m.t}" y2="${m.t + ph}" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 4" opacity=".75"/><line y1="${Y(ty)}" y2="${Y(ty)}" x1="${m.l}" x2="${m.l + pw}" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 4" opacity=".75"/>
  <text x="${X(tx) + 5}" y="${m.t + ph - 6}" fill="#fff" font-size="10" opacity=".7">${t('tip_threshold_dep')} ${tx.toFixed(1)}</text><text x="${m.l + 6}" y="${Y(ty) - 5}" fill="#fff" font-size="10" opacity=".7">${t('tip_threshold_mot')} ${ty.toFixed(1)}</text>
  <text x="${m.l + pw / 2}" y="${H - 12}" text-anchor="middle" fill="#e8ecf8" font-size="13" font-weight="600">${t('axis_dep_pct')}</text><text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" fill="#e8ecf8" font-size="13" font-weight="600">${t('axis_infl_pct')}</text>`;
  /* posiciones con desplazamiento de duplicados */
  const pts = V().map((v, i) => ({ i, x: X(sc.dep[i]), y: Y(sc.inf[i]), r: 7 + (sc.inf[i] + sc.dep[i]) / 200 * 9 }));
  const seen = {}; pts.forEach(p => { const k = p.x.toFixed(0) + '_' + p.y.toFixed(0); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) { const a = seen[k] * 2.4; p.x += Math.cos(a) * 9; p.y += Math.sin(a) * 9; } });
  if ($('#pl-links').checked) V().forEach((a, i) => V().forEach((b, j) => { if (Math.abs(val(a.id, b.id)) === 3) { const p = pts[i], r = pts[j], d = Math.hypot(r.x - p.x, r.y - p.y) || 1; s += `<line x1="${p.x + (r.x - p.x) / d * p.r}" y1="${p.y + (r.y - p.y) / d * p.r}" x2="${r.x - (r.x - p.x) / d * (r.r + 4)}" y2="${r.y - (r.y - p.y) / d * (r.r + 4)}" stroke="#94a3ff" opacity=".45" marker-end="url(#ar)"/>`; } }));
  /* etiquetas sin solaparse */
  const lb = pts.map(p => ({ w: V()[p.i].code.length * 8.2 + 6, h: 15, x: p.x + p.r + 3, y: p.y - 7 }));
  for (let it = 0; it < 80; it++) {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const A = lb[a], B = lb[b], ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        if (ox > 0 && oy > 0) { if (oy < ox) { const d = oy / 2 + .5 * (A.y < B.y ? 1 : -1) * 0; const dir = A.y <= B.y ? -1 : 1; A.y += dir * oy / 2; B.y -= dir * oy / 2; } else { const dir = A.x <= B.x ? -1 : 1; A.x += dir * ox / 2; B.x -= dir * ox / 2; } }
      }
      pts.forEach((p, k) => { const A = lb[a], cx = Math.max(A.x, Math.min(p.x, A.x + A.w)), cy = Math.max(A.y, Math.min(p.y, A.y + A.h)); const d = Math.hypot(cx - p.x, cy - p.y); if (d < p.r + 2) { const ux = (cx - p.x) || 1, uy = (cy - p.y) || 0, l = Math.hypot(ux, uy) || 1; A.x += ux / l * (p.r + 2 - d + .5); A.y += uy / l * (p.r + 2 - d + .5); } });
      lb[a].x = clamp(lb[a].x, m.l + 2, m.l + pw - lb[a].w); lb[a].y = clamp(lb[a].y, m.t + 2, m.t + ph - 16);
    }
  }
  pts.forEach(p => {
    const v = V()[p.i], c = QUAD[q[p.i]].color, sel = ui.selVar === v.id, L2 = lb[p.i];
    const lx = L2.x + L2.w / 2, ly = L2.y + L2.h / 2, far = Math.hypot(lx - p.x, ly - p.y) > p.r + 18;
    if (far) s += `<line x1="${p.x}" y1="${p.y}" x2="${lx}" y2="${ly}" stroke="${c}" opacity=".6"/>`;
    s += `<circle class="bubble" data-id="${v.id}" cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${c}" fill-opacity=".85" stroke="${sel ? '#fff' : '#0b0f1a'}" stroke-width="${sel ? 3 : 1.5}"/>
    <text x="${L2.x + 3}" y="${L2.y + 12}" fill="#fff" font-size="12.5" font-weight="700" font-family="JetBrains Mono" paint-order="stroke" stroke="#0b0f1a" stroke-width="3" pointer-events="none">${esc(v.code)}</text>`;
  });
  $('#plane-wrap').innerHTML = s + '</svg>';
  /* tabla de posiciones */
  const order = [...V().keys()].sort((a, b) => sc.inf[b] - sc.inf[a]);
  $('#rank').innerHTML = `<tr><th>Var.</th><th>${t('th_infl')}</th><th>${t('th_dep')}</th><th>${t('th_quad')}</th>${PD.mode === 'indirect' ? `<th>${currentLang === 'en' ? 'Rank Δ' : 'Rango Δ'}</th>` : ''}</tr>` + order.map(i => {
    const border = Math.abs(sc.inf[i] - ty) < (y1 - y0) * .04 || Math.abs(sc.dep[i] - tx) < (x1 - x0) * .04;
    const dr = PD.rkD[i] - PD.rkI[i];
    return `<tr class="clickable ${ui.selVar === V()[i].id ? 'sel' : ''}" data-id="${V()[i].id}"><td><b>${esc(V()[i].code)}</b></td><td>${sc.inf[i].toFixed(1)}</td><td>${sc.dep[i].toFixed(1)}</td><td><span class="badge" style="background:${QUAD[q[i]].color}">${QUAD[q[i]].short}</span>${border ? ` <span title="${currentLang === 'en' ? 'Near threshold' : 'Cerca del umbral'}" style="color:#fbbf24">≈</span>` : ''}</td>${PD.mode === 'indirect' ? `<td>${dr === 0 ? '=' : (dr > 0 ? '▲' + dr : '▼' + -dr)}</td>` : ''}</tr>`;
  }).join('');
  renderDetail();
  renderQuadCards();
}
$('#plane-wrap').onclick = e => { const id = e.target.dataset?.id; if (id) { ui.selVar = id; renderPlane(); } };
$('#plane-wrap').onmousemove = e => {
  const id = e.target.dataset?.id; if (!id || !PD) return tip(null);
  const i = idx(id); tip(e, `<b>${esc(V()[i].name)}</b><br>${t('th_infl')} ${PD.sc.inf[i].toFixed(1)}% · ${t('th_dep')} ${PD.sc.dep[i].toFixed(1)}%<br>${QUAD[PD.q[i]].name}`);
};
$('#plane-wrap').onmouseleave = () => tip(null);
$('#rank').onclick = e => { const r = e.target.closest('tr.clickable'); if (r) { ui.selVar = r.dataset.id; renderPlane(); } };
['#pl-mode', '#pl-k', '#pl-thr', '#pl-zoom', '#pl-links'].forEach(s => $(s).oninput = renderPlane);

function renderDetail() {
  const box = $('#var-detail');
  if (!ui.selVar || idx(ui.selVar) < 0) {
    box.innerHTML = `<h2>${currentLang === 'en' ? 'Position Justification' : 'Justificación de la posición'}</h2><p class="muted">${currentLang === 'en' ? 'Select a variable on the chart or table to inspect why it falls in its quadrant: which crossover linkages build its influence and dependence.' : 'Seleccione una variable en el gráfico o en la tabla para ver por qué cae en su cuadrante: qué cruces suman su influencia y su dependencia, con su concepto y evidencia.'}</p>`;
    return;
  }
  const i = idx(ui.selVar), v = V()[i], q = PD.q[i], Q = QUAD[q], id = v.id;
  const outs = V().filter(b => b.id !== id && val(id, b.id)).map(b => ({ b, l: L(id, b.id) })).sort((a, b) => Math.abs(b.l.v) - Math.abs(a.l.v));
  const ins = V().filter(b => b.id !== id && val(b.id, id)).map(b => ({ b, l: L(b.id, id) })).sort((a, b) => Math.abs(b.l.v) - Math.abs(a.l.v));
  const list = (arr, out) => arr.length ? arr.map(({ b, l }) => `<div class="lk" style="border-color:${pillBg(l.v)}"><b>${out ? esc(v.code) + ' → ' + esc(b.code) : esc(b.code) + ' → ' + esc(v.code)}</b> <span class="pill" style="background:${pillBg(l.v)}">${sgn(l.v)}</span><br>${esc(l.concept) || `<i>${currentLang === 'en' ? 'no concept' : 'sin concepto'}</i>`}<small>${currentLang === 'en' ? 'Evidence:' : 'Evidencia:'} ${esc(l.evidence) || '—'}</small></div>`).join('') : `<p class="muted">${currentLang === 'en' ? 'No direct linkages registered.' : 'Ningún vínculo directo registrado.'}</p>`;
  const rI = PD.sc.rawI[i], rD = PD.sc.rawD[i], inf = PD.sc.inf[i], dep = PD.sc.dep[i];
  const sumO = outs.reduce((s, o) => s + Math.abs(o.l.v), 0), sumI = ins.reduce((s, o) => s + Math.abs(o.l.v), 0);
  box.innerHTML = `<div class="card-head"><h2>${esc(v.code)} · ${esc(v.name)}</h2><span class="badge" style="background:${Q.color}">${Q.name}</span></div>
  <p class="muted"><b style="color:var(--txt)">${currentLang === 'en' ? 'Result interpretation:' : 'Lectura del resultado:'}</b> ${t('th_infl')} <b>${inf.toFixed(1)}%</b> ${inf >= PD.ty ? '≥' : '<'} ${currentLang === 'en' ? 'threshold' : 'umbral'} ${PD.ty.toFixed(1)}% ${currentLang === 'en' ? 'and' : 'y'} ${t('th_dep')} <b>${dep.toFixed(1)}%</b> ${dep >= PD.tx ? '≥' : '<'} ${currentLang === 'en' ? 'threshold' : 'umbral'} ${PD.tx.toFixed(1)}%. ${PD.mode === 'direct' ? (currentLang === 'en' ? `Influence = row sum = ${sumO} (of ${3 * (V().length - 1)} max); dependence = col sum = ${sumI}.` : `Influencia = suma de la fila = ${sumO} (de ${3 * (V().length - 1)} posibles); dependencia = suma de la columna = ${sumI}.`) : (currentLang === 'en' ? `Indirect values: paths up to ${PD.K} steps with 0.6 attenuation (gross infl ${rI.toFixed(2)}, gross dep ${rD.toFixed(2)}).` : `Valores indirectos: caminos de hasta ${PD.K} pasos con atenuación 0,6 por paso adicional (influencia bruta ${rI.toFixed(2)}, dependencia bruta ${rD.toFixed(2)}).`)}</p>
  <p class="muted"><b style="color:var(--txt)">${currentLang === 'en' ? 'Concept:' : 'Concepto:'}</b> ${Q.concept}<br><b style="color:var(--txt)">${currentLang === 'en' ? 'Practical implication:' : 'Implicación práctica:'}</b> ${Q.action}</p>
  <div class="detail-grid"><div><h3>${currentLang === 'en' ? 'Influences (sum ' + sumO + ')' : 'Influye en (suma ' + sumO + ')'}</h3>${list(outs, true)}</div><div><h3>${currentLang === 'en' ? 'Depends on (sum ' + sumI + ')' : 'Depende de (suma ' + sumI + ')'}</h3>${list(ins, false)}</div></div>`;
}
function renderQuadCards() {
  $('#quad-cards').innerHTML = Object.entries(QUAD).map(([k, q]) => `<div class="qc" style="background:${q.color}18"><h4><span class="dot" style="background:${q.color}"></span>${q.name}</h4>${q.concept}<br><b style="color:var(--txt)">→ ${q.action}</b></div>`).join('');
}
renderQuadCards();

/* ---------- 4. Simulación ---------- */
function simulate() {
  const n = V().length, { beta, lambda, steps } = S.params;
  const W = V().map(a => V().map(b => a.id === b.id ? 0 : val(a.id, b.id) / 3));
  let d = Array(n).fill(0); const x = [V().map(v => v.x0)]; const dl = [d.slice()];
  for (let t = 1; t <= steps; t++) {
    const u = Array(n).fill(0);
    S.ints.forEach(it => { const i = idx(it.vid); if (i < 0) return; if (it.type === 'pulse' ? t === +it.start : t >= +it.start && t < +it.start + +it.dur) u[i] += +it.mag; });
    const nd = d.map((di, i) => { let inc = 0; for (let j = 0; j < n; j++) inc += W[j][i] * d[j]; return di + beta * inc - lambda * di + u[i]; });
    d = nd.map((di, i) => clamp(V()[i].x0 + di, 0, 100) - V()[i].x0);
    x.push(d.map((di, i) => V()[i].x0 + di)); dl.push(d.slice());
  }
  return { x, dl };
}
function renderInts() {
  const hdr = `<div class="int int-h"><span>${currentLang === 'en' ? 'Type' : 'Tipo'}</span><span>${currentLang === 'en' ? 'Magnitude' : 'Magnitud'}</span><span>${currentLang === 'en' ? 'Start t' : 'Inicio t'}</span><span>${currentLang === 'en' ? 'Duration' : 'Duración'}</span><span></span></div>`;
  $('#interventions').innerHTML = V().map((v, i) => {
    const mine = S.ints.map((it, k) => [it, k]).filter(([it]) => it.vid === v.id);
    return `<div class="vblock"><div class="vhead"><span class="dot" style="background:${varColor(i)}"></span><b>${esc(v.code)}</b><span class="muted">${esc(v.name)}</span><span class="cnt">${mine.length ? mine.length + ' ' + (mine.length > 1 ? t('int_unit_multi') : t('int_unit_single')) : t('int_unit_none')}</span><button class="btn ghost sm" data-add="${v.id}">${t('int_add_btn')}</button></div>` +
      (mine.length ? hdr + mine.map(([it, k]) => `<div class="int"><select data-k="${k}" data-f="type"><option value="pulse" ${it.type === 'pulse' ? 'selected' : ''}>${t('int_pulse_opt')}</option><option value="sust" ${it.type === 'sust' ? 'selected' : ''}>${t('int_sust_opt')}</option></select>
      <input type="number" step="0.5" data-k="${k}" data-f="mag" value="${it.mag}"><input type="number" min="1" data-k="${k}" data-f="start" value="${it.start}">
      <input type="number" min="1" data-k="${k}" data-f="dur" value="${it.dur}" ${it.type === 'pulse' ? 'disabled' : ''}><button class="x" data-del="${k}">✕</button></div>`).join('') : '') + '</div>';
  }).join('') + `<p class="muted" style="margin:4px 0 0">${t('int_help_text')}</p>`;
  $('#quick').innerHTML = V().map(v => `<span class="chip" data-q="${v.id}">${esc(v.code)}</span>`).join('');
  [['beta', 'p-beta', 'o-beta'], ['lambda', 'p-lambda', 'o-lambda'], ['steps', 'p-steps', 'o-steps']].forEach(([k, i, o]) => { $('#' + i).value = S.params[k]; $('#' + o).textContent = S.params[k]; });
}
const intHandler = e => {
  const t = e.target, k = t.dataset.k; if (k === undefined) return;
  const f = t.dataset.f; S.ints[k][f] = ['mag', 'start', 'dur'].includes(f) ? +t.value : t.value; save();
  if (e.type === 'change') renderInts(); renderChart();
};
$('#interventions').oninput = intHandler; $('#interventions').onchange = intHandler;
$('#interventions').onclick = e => { if (e.target.dataset.add) { S.ints.push({ vid: e.target.dataset.add, type: 'sust', mag: 2, start: 1, dur: 10 }); save(); renderInts(); renderChart(); return; } if (e.target.dataset.del !== undefined) { S.ints.splice(+e.target.dataset.del, 1); save(); renderInts(); renderChart(); } };
$('#quick').onclick = e => { const q = e.target.dataset.q; if (q) { S.ints = [{ vid: q, type: 'pulse', mag: 20, start: 1, dur: 1 }]; save(); renderInts(); renderChart(); } };
[['beta', 'p-beta', 'o-beta'], ['lambda', 'p-lambda', 'o-lambda'], ['steps', 'p-steps', 'o-steps']].forEach(([k, i, o]) => $('#' + i).oninput = e => { S.params[k] = +e.target.value; $('#' + o).textContent = e.target.value; save(); renderChart(); });
$('#v-abs').onclick = () => { ui.view = 'abs'; $('#v-abs').classList.add('active'); $('#v-delta').classList.remove('active'); renderChart(); };
$('#v-delta').onclick = () => { ui.view = 'delta'; $('#v-delta').classList.add('active'); $('#v-abs').classList.remove('active'); renderChart(); };
$('#legend').onclick = e => { const id = e.target.dataset.id; if (!id) return; ui.hidden.has(id) ? ui.hidden.delete(id) : ui.hidden.add(id); renderChart(); };
let SIM = null;
function renderChart() {
  SIM = simulate(); const n = V().length, T = S.params.steps, data = ui.view === 'abs' ? SIM.x : SIM.dl;
  const vis = V().map((v, i) => i).filter(i => !ui.hidden.has(V()[i].id));
  $('#legend').innerHTML = V().map((v, i) => `<span class="chip ${ui.hidden.has(v.id) ? '' : 'on'}" data-id="${v.id}" style="color:${varColor(i)}" title="${esc(v.name)}">${esc(v.code)}</span>`).join('');
  const W = 900, H = 430, m = { l: 52, r: 16, t: 14, b: 38 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  let lo = Infinity, hi = -Infinity; vis.forEach(i => data.forEach(r => { lo = Math.min(lo, r[i]); hi = Math.max(hi, r[i]); }));
  if (!isFinite(lo)) { lo = 0; hi = 100; }
  if (ui.view === 'abs') { lo = Math.max(0, Math.floor(lo / 5) * 5 - 5); hi = Math.min(100, Math.ceil(hi / 5) * 5 + 5); } else { const a = Math.max(Math.abs(lo), Math.abs(hi), 2); lo = -a * 1.1; hi = a * 1.1; }
  if (hi - lo < 10) { hi = lo + 10; }
  const X = t => m.l + t / T * pw, Y = v => m.t + ph - (v - lo) / (hi - lo) * ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" id="chart-svg">`;
  for (let k = 0; k <= 5; k++) { const v = lo + (hi - lo) * k / 5; s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="#94a3ff" opacity=".1"/><text x="${m.l - 8}" y="${Y(v) + 4}" fill="#93a0c4" font-size="11" text-anchor="end">${v.toFixed(0)}</text>`; }
  for (let k = 0; k <= 10; k++) { const t = Math.round(T * k / 10); s += `<text x="${X(t)}" y="${H - 14}" fill="#93a0c4" font-size="11" text-anchor="middle">${t}</text>`; }
  s += `<text x="${m.l + pw / 2}" y="${H - 1}" fill="#93a0c4" font-size="11" text-anchor="middle">${t('th_time_steps')}</text>`;
  if (ui.view === 'delta') s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(0)}" y2="${Y(0)}" stroke="#fff" opacity=".4"/>`;
  S.ints.forEach(it => { const a = +it.start, b = it.type === 'pulse' ? a : +it.start + +it.dur; if (a <= T) s += it.type === 'pulse' ? `<line x1="${X(a)}" x2="${X(a)}" y1="${m.t}" y2="${m.t + ph}" stroke="#fbbf24" stroke-dasharray="3 4" opacity=".5"/>` : `<rect x="${X(a)}" y="${m.t}" width="${Math.max(X(Math.min(b, T)) - X(a), 1)}" height="${ph}" fill="#fbbf24" opacity=".06"/>`; });
  vis.forEach(i => {
    const c = varColor(i);
    if (ui.view === 'abs') s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(V()[i].x0)}" y2="${Y(V()[i].x0)}" stroke="${c}" stroke-dasharray="2 5" opacity=".28"/>`;
    s += `<path d="${data.map((r, t) => (t ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(r[i]).toFixed(1)).join('')}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>`;
    s += `<text x="${X(T) - 2}" y="${Y(data[T][i]) - 5}" fill="${c}" font-size="11" font-weight="700" text-anchor="end">${esc(V()[i].code)}</text>`;
  });
  s += `<line id="hv" y1="${m.t}" y2="${m.t + ph}" stroke="#fff" opacity="0"/><rect id="hv-r" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  $('#chart-wrap').innerHTML = s;
  const r = $('#hv-r'), hv = $('#hv');
  r.onmousemove = e => {
    const bb = r.getBoundingClientRect(), tVal = clamp(Math.round((e.clientX - bb.left) / bb.width * T), 0, T);
    hv.setAttribute('x1', X(tVal)); hv.setAttribute('x2', X(tVal)); hv.setAttribute('opacity', .6);
    $('#hover-read').innerHTML = `<b style="color:var(--txt)">t = ${tVal}</b> · ` + [...vis].sort((a, b) => data[tVal][b] - data[tVal][a]).map(i => `<span style="color:${varColor(i)}">${esc(V()[i].code)} ${data[tVal][i].toFixed(1)}</span>`).join(' · ');
  };
  r.onmouseleave = () => hv.setAttribute('opacity', 0);
  if (!$('#hover-read').innerHTML) $('#hover-read').textContent = t('hover_read_default');
  /* impacto */
  const rows = V().map((v, i) => { let pk = 0, pt = 0; SIM.dl.forEach((r, t) => { if (Math.abs(r[i]) > Math.abs(pk)) { pk = r[i]; pt = t; } }); return { v, i, base: v.x0, fin: SIM.x[T][i], df: SIM.dl[T][i], pk, pt }; }).sort((a, b) => Math.abs(b.pk) - Math.abs(a.pk));
  const mxp = Math.max(...rows.map(r => Math.abs(r.pk)), 1e-9);
  $('#impact').innerHTML = `<tr><th>Variable</th><th>${t('th_initial')}</th><th>${t('th_final')}</th><th>${t('th_dfinal')}</th><th>${t('th_peak')}</th><th style="width:30%">${t('th_mag')}</th></tr>` + rows.map(r => `<tr><td><span class="dot" style="background:${varColor(r.i)}"></span><b>${esc(r.v.code)}</b> ${esc(r.v.name)}</td><td>${r.base.toFixed(0)}</td><td>${r.fin.toFixed(1)}</td><td style="color:${r.df >= 0 ? '#38bdf8' : '#fb7185'}">${sgn(+r.df.toFixed(1))}</td><td>${sgn(+r.pk.toFixed(1))} (t=${r.pt})</td><td><div class="bar" style="width:${Math.abs(r.pk) / mxp * 100}%;background:${r.pk >= 0 ? '' : '#fb7185'}"></div></td></tr>`).join('');
}

/* ---------- 5. Dynamic Signed-MICMAC (Katz-Bonacich / Leontief) ---------- */
let dynMatrixView = 'w';

function solveLinearSystem(A, B) {
  const n = A.length, m = B[0].length;
  const M = Array.from({ length: n }, (_, i) => [...A[i], ...B[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-12) throw new Error("Matriz casi singular");
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const piv = M[i][i];
    for (let j = i; j < n + m; j++) M[i][j] /= piv;
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j < n + m; j++) M[k][j] -= factor * M[i][j];
      }
    }
  }
  return Array.from({ length: n }, (_, i) => M[i].slice(n));
}

function spectralRadius(M) {
  const n = M.length;
  const shift = 2.0;
  const S = M.map((r, i) => r.map((v, j) => (i === j ? v + shift : v)));
  let x = Array(n).fill(1 / Math.sqrt(n));
  let rhoS = 0;
  for (let iter = 0; iter < 120; iter++) {
    const y = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) y[i] += S[i][j] * x[j];
    }
    const norm = Math.hypot(...y);
    if (norm < 1e-12) return 0;
    x = y.map(v => v / norm);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      let rowDot = 0;
      for (let j = 0; j < n; j++) rowDot += S[i][j] * x[j];
      num += x[i] * rowDot;
      den += x[i] * x[i];
    }
    rhoS = num / den;
  }
  return Math.max(0, rhoS - shift);
}

function computeDynamicMicmac(lam = 0.10, alphaRatio = 0.80) {
  const vars = V();
  const n = vars.length;
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  const T = Array.from({ length: n }, () => Array(n).fill(0));
  const W = Array.from({ length: n }, () => Array(n).fill(0));
  const absW = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const a_ij = val(vars[i].id, vars[j].id);
        const t_ij = del(vars[i].id, vars[j].id);
        A[i][j] = a_ij;
        T[i][j] = t_ij;
        const w_ij = a_ij * Math.exp(-lam * t_ij);
        W[i][j] = w_ij;
        absW[i][j] = Math.abs(w_ij);
      }
    }
  }

  const rho = spectralRadius(absW);
  const alpha = rho > 1e-12 ? alphaRatio / rho : 1.0;

  const I = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const Mb = I.map((row, i) => row.map((v, j) => v - alpha * absW[i][j]));
  const Mn = I.map((row, i) => row.map((v, j) => v - alpha * W[i][j]));

  let S_bruta, S_neta;
  try {
    S_bruta = solveLinearSystem(Mb, absW);
    S_neta = solveLinearSystem(Mn, W);
  } catch (e) {
    S_bruta = absW;
    S_neta = W;
  }

  const M_clas = Array(n).fill(0);
  const D_clas = Array(n).fill(0);
  const M_bruta_sum = Array(n).fill(0);
  const D_bruta_sum = Array(n).fill(0);
  const M_neta_sum = Array(n).fill(0);
  const D_neta_sum = Array(n).fill(0);
  const F = Array(n).fill(0);
  const Omega = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    F[i] = S_neta[i][i];
    for (let j = 0; j < n; j++) {
      M_clas[i] += Math.abs(A[i][j]);
      D_clas[j] += Math.abs(A[i][j]);
      M_bruta_sum[i] += S_bruta[i][j];
      D_bruta_sum[j] += S_bruta[i][j];
      if (i !== j) {
        M_neta_sum[i] += Math.abs(S_neta[i][j]);
        D_neta_sum[j] += Math.abs(S_neta[i][j]);
      }
    }
    Omega[i] = M_bruta_sum[i] > 1e-9 ? Math.max(0, Math.min(100, (1 - M_neta_sum[i] / M_bruta_sum[i]) * 100)) : 0;
  }

  return { vars, A, T, W, absW, rho, alpha, S_bruta, S_neta, M_clas, D_clas, M_bruta_sum, D_bruta_sum, M_neta_sum, D_neta_sum, F, Omega };
}

function quantile(arr, q) {
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function renderDynamic() {
  const lamEl = $('#dyn-lambda');
  if (!lamEl) return;
  const lam = +lamEl.value || 0.10;
  const alphaRatio = +$('#dyn-alpha-ratio').value || 0.80;
  const crit = $('#dyn-criterio').value || 'media';
  const omegaTrampa = +$('#dyn-omega-trampa').value || 30;

  $('#dyn-lambda-out').textContent = lam.toFixed(2);
  $('#dyn-alpha-out').textContent = alphaRatio.toFixed(2);
  $('#dyn-omega-out').textContent = omegaTrampa + ' %';

  const res = computeDynamicMicmac(lam, alphaRatio);
  const n = res.vars.length;

  $('#kpi-rho').textContent = res.rho.toFixed(3);
  $('#kpi-alpha').textContent = res.alpha.toFixed(3);
  const meanOmega = res.Omega.reduce((a, b) => a + b, 0) / n;
  $('#kpi-omega').textContent = meanOmega.toFixed(1) + ' %';

  // Ranks
  const rankClas = res.M_clas.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const rClasMap = {};
  rankClas.forEach((item, r) => rClasMap[item.i] = r + 1);

  const rankNet = res.M_neta_sum.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const rNetMap = {};
  rankNet.forEach((item, r) => rNetMap[item.i] = r + 1);

  // Umbrales
  const uDep = crit === 'media' ? res.D_neta_sum.reduce((a, b) => a + b, 0) / n : quantile(res.D_neta_sum, 0.5);
  const uMot = crit === 'media' ? res.M_neta_sum.reduce((a, b) => a + b, 0) / n : quantile(res.M_neta_sum, 0.5);

  const medClas = quantile(res.M_clas, 0.5);
  const medMn = quantile(res.M_neta_sum, 0.5);
  const medMb = quantile(res.M_bruta_sum, 0.5);
  const medOm = quantile(res.Omega, 0.5);
  const q3Om = quantile(res.Omega, 0.75);
  const q1F = quantile(res.F, 0.25);
  const q3F = quantile(res.F, 0.75);

  let numPalancas = 0, numTrampas = 0;
  const rows = res.vars.map((v, i) => {
    const mn = res.M_neta_sum[i], dn = res.D_neta_sum[i], mb = res.M_bruta_sum[i];
    const f_i = res.F[i], om_i = res.Omega[i];
    const rC = rClasMap[i], rN = rNetMap[i], dR = rC - rN;
    
    // Cuadrante
    let quadKey = 'auto', quadName = QUAD.auto.name;
    if (mn >= uMot) {
      if (dn >= uDep) { quadKey = 'conflict'; quadName = QUAD.conflict.name; }
      else { quadKey = 'power'; quadName = QUAD.power.name; }
    } else {
      if (dn >= uDep) { quadKey = 'result'; quadName = QUAD.result.name; }
      else { quadKey = 'auto'; quadName = QUAD.auto.name; }
    }

    const esTrampa = (res.M_clas[i] >= medClas) && (om_i > omegaTrampa);
    if (esTrampa) numTrampas++;

    const tags = [];
    if (mn >= medMn && om_i <= medOm) { tags.push(t('role_palanca')); numPalancas++; }
    if (mb >= medMb && om_i >= q3Om) tags.push(t('role_espejismo'));
    if (f_i < 0 && f_i <= q1F) tags.push(t('role_bucle_neg'));
    if (f_i > 0 && f_i >= q3F) tags.push(t('role_bucle_pos'));
    const rol = tags.length ? tags.join(' · ') : t('role_regular');

    return { v, i, mc: res.M_clas[i], dc: res.D_clas[i], mb, mn, dn, f_i, om_i, rC, rN, dR, quadKey, quadName, esTrampa, rol };
  });

  $('#kpi-palancas').textContent = numPalancas;
  $('#kpi-trampas').textContent = numTrampas;

  // Render SVG 4D Plane
  const W = 880, H = 500, m = { l: 60, r: 24, t: 30, b: 50 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const maxD = Math.max(...rows.map(r => r.dn), uDep * 1.25, 5);
  const maxM = Math.max(...rows.map(r => r.mn), uMot * 1.25, 5);
  const maxMb = Math.max(...rows.map(r => r.mb), 1);

  const X = d => m.l + (d / maxD) * pw;
  const Y = mo => m.t + ph - (mo / maxM) * ph;

  let s = `<svg viewBox="0 0 ${W} ${H}" id="dyn-svg">`;
  // Quadrant backgrounds
  const xMid = X(uDep), yMid = Y(uMot);
  s += `<rect x="${m.l}" y="${m.t}" width="${xMid - m.l}" height="${yMid - m.t}" fill="rgba(52,211,153,.04)"/>`;
  s += `<rect x="${xMid}" y="${m.t}" width="${m.l + pw - xMid}" height="${yMid - m.t}" fill="rgba(245,158,11,.04)"/>`;
  s += `<rect x="${xMid}" y="${yMid}" width="${m.l + pw - xMid}" height="${m.t + ph - yMid}" fill="rgba(167,139,250,.04)"/>`;
  s += `<rect x="${m.l}" y="${yMid}" width="${xMid - m.l}" height="${m.t + ph - yMid}" fill="rgba(100,116,139,.04)"/>`;

  // Threshold lines
  s += `<line x1="${xMid}" x2="${xMid}" y1="${m.t}" y2="${m.t + ph}" stroke="#94a3ff" stroke-dasharray="4 4" opacity=".4"/>`;
  s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${yMid}" y2="${yMid}" stroke="#94a3ff" stroke-dasharray="4 4" opacity=".4"/>`;
  s += `<text x="${xMid + 6}" y="${m.t + 16}" fill="#93a0c4" font-size="11">${t('tip_threshold_dep')} (${uDep.toFixed(1)})</text>`;
  s += `<text x="${m.l + 6}" y="${yMid - 6}" fill="#93a0c4" font-size="11">${t('tip_threshold_mot')} (${uMot.toFixed(1)})</text>`;

  // Axes ticks
  for (let k = 0; k <= 5; k++) {
    const vd = (maxD * k) / 5, vm = (maxM * k) / 5;
    s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(vm)}" y2="${Y(vm)}" stroke="#94a3ff" opacity=".08"/>`;
    s += `<text x="${m.l - 8}" y="${Y(vm) + 4}" fill="#93a0c4" font-size="10" text-anchor="end">${vm.toFixed(0)}</text>`;
    s += `<text x="${X(vd)}" y="${H - 24}" fill="#93a0c4" font-size="10" text-anchor="middle">${vd.toFixed(0)}</text>`;
  }
  s += `<text x="${m.l + pw / 2}" y="${H - 6}" fill="#93a0c4" font-size="11" text-anchor="middle">${t('dyn_axis_x')}</text>`;
  s += `<text x="16" y="${m.t + ph / 2}" fill="#93a0c4" font-size="11" text-anchor="middle" transform="rotate(-90 16 ${m.t + ph / 2})">${t('dyn_axis_y')}</text>`;

  // Draw points
  rows.forEach(r => {
    const cx = X(r.dn), cy = Y(r.mn);
    const radius = 9 + 14 * (r.mb / maxMb);
    const fillCol = r.f_i >= 0 ? 'rgba(52,211,153,.8)' : 'rgba(251,113,133,.8)';
    const strokeCol = r.esTrampa ? '#fb7185' : (r.om_i > 25 ? '#fbbf24' : '#fff');
    const strokeW = 1.5 + 3.0 * (r.om_i / 100);

    s += `<g class="dyn-bubble" data-id="${r.v.id}" style="cursor:pointer">`;
    s += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fillCol}" stroke="${strokeCol}" stroke-width="${strokeW.toFixed(1)}"/>`;
    s += `<text x="${cx}" y="${cy + 4}" fill="#06101c" font-size="11" font-weight="700" text-anchor="middle">${esc(r.v.code)}</text>`;
    s += `<text x="${cx}" y="${cy - radius - 5}" fill="#e8ecf8" font-size="11" font-weight="600" text-anchor="middle">${esc(r.v.name.slice(0, 16))}</text>`;
    s += `</g>`;
  });
  s += `</svg>`;
  $('#dyn-plane-wrap').innerHTML = s;

  // Tooltip on dynamic SVG
  document.querySelectorAll('.dyn-bubble').forEach(el => {
    const r = rows.find(x => x.v.id === el.dataset.id);
    if (!r) return;
    el.onmousemove = e => {
      tip(e, `<b>${esc(r.v.code)} · ${esc(r.v.name)}</b><br>` +
             `${t('tip_quad')} <b>${esc(QUAD[r.quadKey]?.name || r.quadName)}</b><br>` +
             `${t('tip_mot_neta')} <b>${r.mn.toFixed(2)}</b> (${t('tip_clasica')} ${r.mc})<br>` +
             `${t('tip_dep_neta')} <b>${r.dn.toFixed(2)}</b> (${t('tip_clasica')} ${r.dc})<br>` +
             `${t('tip_bucle')} <b style="color:${r.f_i >= 0 ? '#34d399' : '#fb7185'}">${r.f_i >= 0 ? '+' : ''}${r.f_i.toFixed(3)}</b> (${r.f_i >= 0 ? t('tip_amp') : t('tip_reg')})<br>` +
             `${t('tip_omega')} <b>${r.om_i.toFixed(1)} %</b><br>` +
             `${t('tip_dr')} <b>${r.dR >= 0 ? '+' : ''}${r.dR}</b><br>` +
             (r.esTrampa ? `<span style="color:#fb7185">${t('tip_trap_warn')}</span><br>` : '') +
             `${t('tip_role')} <i>${esc(r.rol)}</i>`);
    };
    el.onmouseleave = () => tip(null);
  });

  // Render diagnostic side table
  $('#dyn-diag-table').innerHTML = `<tr><th>Variable</th><th>${t('th_dyn_quad')}</th><th>${t('th_dyn_f')}</th><th>Ω</th></tr>` +
    rows.map(r => `<tr>
      <td><b>${esc(r.v.code)}</b> ${esc(r.v.name)}</td>
      <td><span class="tag-badge" style="background:${QUAD[r.quadKey]?.color || '#94a3b8'};color:#06101c">${esc(QUAD[r.quadKey]?.short || r.quadName)}</span></td>
      <td style="color:${r.f_i >= 0 ? '#34d399' : '#fb7185'}">${sgn(+r.f_i.toFixed(2))}</td>
      <td style="color:${r.om_i > 25 ? '#fbbf24' : 'inherit'}">${r.om_i.toFixed(0)}%</td>
    </tr>`).join('');

  // Render full comparative table
  $('#dyn-full-table').innerHTML = `<tr>
    <th>${t('th_code')}</th><th>Variable</th><th>${t('th_dyn_mc')}</th><th>${t('th_dyn_mn')}</th><th>${t('th_dyn_rc')}</th><th>${t('th_dyn_rn')}</th><th>${t('th_dyn_dr')}</th>
    <th>${t('th_dyn_dn')}</th><th>${t('th_dyn_f')}</th><th>${t('th_dyn_om')}</th><th>${t('th_dyn_quad')}</th><th>${t('th_dyn_trap')}</th><th>${t('th_dyn_role')}</th>
  </tr>` + rows.map(r => {
    let rolBadgeClass = 'role-badge';
    if (r.rol.includes('Palanca') || r.rol.includes('Lever')) rolBadgeClass += ' role-palanca';
    else if (r.rol.includes('espejismo') || r.rol.includes('Mirage')) rolBadgeClass += ' role-espejismo';
    else if (r.rol.includes('nieve') || r.rol.includes('Snowball')) rolBadgeClass += ' role-bucle-pos';
    else if (r.rol.includes('homeostático') || r.rol.includes('Stabilizer')) rolBadgeClass += ' role-bucle-neg';

    return `<tr>
      <td><b>${esc(r.v.code)}</b></td>
      <td>${esc(r.v.name)}</td>
      <td>${r.mc.toFixed(0)}</td>
      <td><b>${r.mn.toFixed(2)}</b></td>
      <td>${r.rC}</td>
      <td><b>${r.rN}</b></td>
      <td style="color:${r.dR > 0 ? '#34d399' : (r.dR < 0 ? '#fb7185' : 'inherit')}"><b>${r.dR > 0 ? '▲ +' + r.dR : (r.dR < 0 ? '▼ ' + r.dR : '=')}</b></td>
      <td>${r.dn.toFixed(2)}</td>
      <td style="color:${r.f_i >= 0 ? '#34d399' : '#fb7185'}"><b>${sgn(+r.f_i.toFixed(3))}</b></td>
      <td style="color:${r.om_i > 25 ? '#fbbf24' : 'inherit'}">${r.om_i.toFixed(1)}%</td>
      <td><span class="tag-badge" style="background:${QUAD[r.quadKey]?.color || '#94a3b8'};color:#06101c">${esc(QUAD[r.quadKey]?.name || r.quadName)}</span></td>
      <td>${r.esTrampa ? `<span style="color:#fb7185;font-weight:700">⚠ ${currentLang === 'en' ? 'YES' : 'SÍ'}</span>` : '<span style="opacity:.5">No</span>'}</td>
      <td><span class="${rolBadgeClass}">${esc(r.rol)}</span></td>
    </tr>`;
  }).join('');

  // Render switchable matrix view
  renderDynMatrixView(res);

  // Render Executive Prospective Report
  const palancasStr = rows.filter(r => r.rol.includes('Palanca') || r.rol.includes('Lever')).map(r => `<b>${esc(r.v.code)} (${esc(r.v.name)})</b>`).join(', ') || t('rep_palancas_none');
  const espejismosStr = rows.filter(r => r.rol.includes('espejismo') || r.rol.includes('Mirage')).map(r => `<b>${esc(r.v.code)} (${esc(r.v.name)})</b>`).join(', ') || t('rep_trampas_none');
  const bolasStr = rows.filter(r => r.rol.includes('nieve') || r.rol.includes('Snowball')).map(r => `<b>${esc(r.v.code)} (${esc(r.v.name)})</b>`).join(', ') || t('rep_bucles_none');

  $('#dyn-report').innerHTML = `
    <p><b>${t('rep_synthesis_title')}</b> ${t('rep_synthesis_body', { rho: res.rho.toFixed(3), alpha: res.alpha.toFixed(3), omega: meanOmega.toFixed(1) })}</p>
    <p><b>${t('rep_palancas_title')}</b> ${t('rep_palancas_body', { vars: palancasStr })}</p>
    <p><b>${t('rep_trampas_title')}</b> ${t('rep_trampas_body', { vars: espejismosStr })}</p>
    <p><b>${t('rep_bucles_title')}</b> ${t('rep_bucles_body', { vars: bolasStr })}</p>
  `;
}

function renderDynMatrixView(res) {
  const box = $('#dyn-matrix-view');
  if (!box) return;
  let M = res.W;
  if (dynMatrixView === 'sbruta') M = res.S_bruta;
  else if (dynMatrixView === 'sneta') M = res.S_neta;
  else if (dynMatrixView === 'z') {
    M = res.S_neta.map((row, i) => row.map((v, j) => (i === j ? 0 : v - res.W[i][j])));
  }

  let h = `<tr><th>Fila \\ Col</th>${res.vars.map(v => `<th title="${esc(v.name)}">${esc(v.code)}</th>`).join('')}</tr>`;
  res.vars.forEach((a, i) => {
    h += `<tr><th>${esc(a.code)}</th>`;
    res.vars.forEach((b, j) => {
      const val = M[i][j];
      if (i === j && dynMatrixView !== 'sneta') {
        h += `<td class="diag" style="text-align:center">—</td>`;
      } else {
        const valStr = val.toFixed(2);
        const col = val > 0.05 ? '#38bdf8' : (val < -0.05 ? '#fb7185' : 'inherit');
        h += `<td style="text-align:right;color:${col};font-family:'JetBrains Mono'">${valStr}</td>`;
      }
    });
    h += `</tr>`;
  });
  box.innerHTML = h;
}

$('#dyn-matrix-switch').onclick = e => {
  const m = e.target.dataset.m;
  if (!m) return;
  dynMatrixView = m;
  document.querySelectorAll('#dyn-matrix-switch button').forEach(b => b.classList.toggle('active', b === e.target));
  const res = computeDynamicMicmac(+$('#dyn-lambda').value, +$('#dyn-alpha-ratio').value);
  renderDynMatrixView(res);
};

['#dyn-lambda', '#dyn-alpha-ratio', '#dyn-criterio', '#dyn-omega-trampa'].forEach(sel => {
  const el = $(sel);
  if (el) el.oninput = renderDynamic;
});

/* ---------- Exportar / importar / reset ---------- */
$('#btn-export').onclick = async () => {
  const text = JSON.stringify(S, null, 2), fname = 'analisis-estructural.json';
  try {
    if (window.showSaveFilePicker) {
      const h = await showSaveFilePicker({ suggestedName: fname, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(text); await w.close(); return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = fname; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  } catch (e) { alert(t('alert_export_error') + ' ' + e.message); }
};
$('#file-import').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(tText => {
    try {
      const o = JSON.parse(tText);
      if (!o.vars || !o.links) throw 0;
      S = o; uid = 1000; ui.sel = ui.selVar = null; save(); renderAll();
    } catch {
      alert(t('alert_invalid_file'));
    }
  });
};
$('#btn-reset').onclick = () => {
  if (confirm(t('confirm_reset'))) {
    uid = 1; S = defaults(currentLang); ui.sel = ui.selVar = null; ui.hidden.clear(); save(); renderAll();
  }
};

/* ---------- Sistema de Idiomas / i18n Switcher ---------- */
function applyLanguage(lang) {
  if (typeof setLanguage === 'function') setLanguage(lang);
  
  // Translate static data-i18n elements (support HTML formatted text)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (k) {
      const val = t(k);
      if (val.includes('<') || val.includes('&')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    }
  });

  // Update language label text
  const lblTxt = $('#lang-label-txt');
  if (lblTxt) lblTxt.textContent = lang === 'en' ? 'Language' : 'Idioma';

  // Toggle active button state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Toggle methodology blocks
  const mEs = $('#method-es'), mEn = $('#method-en');
  if (mEs) mEs.style.display = lang === 'es' ? 'block' : 'none';
  if (mEn) mEn.style.display = lang === 'en' ? 'block' : 'none';

  // Sincronizar nombres de variables base si coinciden con los predeterminados
  if (typeof DEFAULT_VARS !== 'undefined' && typeof DEFAULT_VARS_EN !== 'undefined') {
    const fromList = lang === 'en' ? DEFAULT_VARS : DEFAULT_VARS_EN;
    const toList = lang === 'en' ? DEFAULT_VARS_EN : DEFAULT_VARS;
    S.vars.forEach(v => {
      const matchIdx = fromList.findIndex(item => item[0] === v.code && (item[1] === v.name || toList.some(tl => tl[0] === v.code && tl[1] === v.name)));
      if (matchIdx >= 0) {
        v.name = toList[matchIdx][1];
        v.desc = toList[matchIdx][2];
      }
    });
    save();
  }

  // Re-render components
  renderRubric();
  renderAll();
}

// Expose globally for inline onclick
window.applyLanguage = applyLanguage;

const langMenu = $('#lang-menu');
if (langMenu) {
  langMenu.onclick = e => {
    const btn = e.target.closest('.lang-btn');
    if (!btn || !btn.dataset.lang) return;
    applyLanguage(btn.dataset.lang);
  };
}
const bEs = $('#lang-btn-es'), bEn = $('#lang-btn-en');
if (bEs) bEs.onclick = () => applyLanguage('es');
if (bEn) bEn.onclick = () => applyLanguage('en');

function renderAll() {
  renderVars();
  renderMatrix();
  renderEditor();
  renderLog();
  renderPlane();
  renderInts();
  renderChart();
  renderDynamic();
}

// Inicialización de idioma y componentes
applyLanguage(currentLang);

