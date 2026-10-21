/* ===== Análisis estructural: matriz justificada, plano de cuadrantes y simulación ===== */
const LS = 'micmac-v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const key = (a, b) => a + '>' + b;
let uid = 1;

function defaults() {
  const vars = DEFAULT_VARS.map(([code, name, desc, x0]) => ({ id: 'v' + uid++, code, name, desc, x0 }));
  const byCode = Object.fromEntries(vars.map(v => [v.code, v.id]));
  const links = {};
  DEFAULT_LINKS.forEach(([a, b, v, concept, evidence, src]) => links[key(byCode[a], byCode[b])] = { v, concept, evidence, src });
  return { vars, links, ints: [{ vid: byCode.INV, type: 'sust', mag: 2, start: 3, dur: 18 }], params: { beta: .15, lambda: .05, steps: 50 } };
}
let S = (() => { try { const s = JSON.parse(localStorage.getItem(LS)); if (s && s.vars) { uid = 1000; return s; } } catch (e) { } return defaults(); })();
const save = () => localStorage.setItem(LS, JSON.stringify(S));
const V = () => S.vars;
const idx = id => V().findIndex(v => v.id === id);
const L = (a, b) => S.links[key(a, b)];
const val = (a, b) => (L(a, b)?.v) || 0;
const ui = { sel: null, selVar: null, hidden: new Set(), view: 'abs' };

/* ---------- Colores / cuadrantes ---------- */
const QUAD = {
  power: { name: 'Zona de poder · Motrices', color: '#34d399', short: 'Poder',
    concept: 'Alta influencia y baja dependencia. Determinan el sistema y casi no son afectadas por él. Son las palancas de intervención: actuar sobre ellas produce efectos amplios y predecibles.',
    action: 'Priorizar: son el punto de partida de la estrategia y de la gestión del cambio.' },
  conflict: { name: 'Zona de conflicto · Enlace', color: '#f59e0b', short: 'Conflicto',
    concept: 'Alta influencia y alta dependencia. Son inestables: toda acción sobre ellas se propaga y retorna amplificada o amortiguada (bucles de retroalimentación).',
    action: 'Gestionar con cuidado: intervenir en conjunto y monitorear efectos de retorno.' },
  result: { name: 'Zona de resultados · Dependientes', color: '#a78bfa', short: 'Resultado',
    concept: 'Baja influencia y alta dependencia. Reflejan el estado del sistema: son los indicadores de éxito, no las palancas.',
    action: 'Usar como tablero de control; no intervenir directamente, sino mediante las variables motrices.' },
  auto: { name: 'Zona autónoma · Excluidas', color: '#64748b', short: 'Autónoma',
    concept: 'Baja influencia y baja dependencia. Poco conectadas con el resto: evolucionan por su cuenta o son marginales para la dinámica estudiada.',
    action: 'Seguimiento mínimo; revisar si realmente deben formar parte del análisis.' }
};
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
  $('#vars-table').innerHTML = `<tr><th>Código</th><th>Nombre</th><th>Descripción</th><th>Valor inicial</th><th></th></tr>` +
    V().map(v => `<tr><td><input class="code" data-id="${v.id}" data-f="code" value="${esc(v.code)}"></td>
    <td><input data-id="${v.id}" data-f="name" value="${esc(v.name)}"></td>
    <td><input data-id="${v.id}" data-f="desc" value="${esc(v.desc)}"></td>
    <td><input class="num" type="number" min="0" max="100" data-id="${v.id}" data-f="x0" value="${v.x0}"></td>
    <td><button class="x" data-del="${v.id}" title="Eliminar">✕</button></td></tr>`).join('');
}
$('#vars-table').oninput = e => {
  const { id, f } = e.target.dataset; if (!id) return;
  const v = V()[idx(id)]; v[f] = f === 'x0' ? clamp(+e.target.value || 0, 0, 100) : (f === 'code' ? e.target.value.toUpperCase() : e.target.value); save();
};
$('#vars-table').onclick = e => {
  const id = e.target.dataset.del; if (!id) return;
  if (V().length <= 2) return alert('Se requieren al menos 2 variables.');
  S.vars.splice(idx(id), 1);
  Object.keys(S.links).forEach(k => { if (k.split('>').includes(id)) delete S.links[k]; });
  S.ints = S.ints.filter(i => i.vid !== id); ui.sel = null; ui.selVar = null; save(); renderAll();
};
$('#add-var').onclick = () => { S.vars.push({ id: 'v' + uid++, code: 'V' + (V().length + 1), name: 'Nueva variable', desc: '', x0: 50 }); save(); renderVars(); };

/* ---------- 2. Matriz ---------- */
const hasJust = l => l && (l.concept || '').trim().length > 10 && (l.evidence || '').trim().length > 10;
function sums() {
  const n = V().length, inf = Array(n).fill(0), dep = Array(n).fill(0);
  V().forEach((a, i) => V().forEach((b, j) => { if (i !== j) { const x = Math.abs(val(a.id, b.id)); inf[i] += x; dep[j] += x; } }));
  return { inf, dep };
}
function renderMatrix() {
  const { inf, dep } = sums();
  let h = `<tr><th></th>${V().map(v => `<th title="${esc(v.name)}">${esc(v.code)}</th>`).join('')}<th>Σ infl.</th></tr>`;
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
  h += `<tr><th>Σ dep.</th>${dep.map(d => `<td class="tot">${d}</td>`).join('')}<td></td></tr>`;
  $('#matrix').innerHTML = h;
  const nz = Object.values(S.links).filter(l => l.v), ok = nz.filter(hasJust).length;
  $('#completeness').textContent = `Justificados: ${ok}/${nz.length}`;
  $('#completeness').style.color = ok === nz.length ? '#34d399' : '#fbbf24';
}
$('#matrix-legend').innerHTML = [-3, -2, -1, 0, 1, 2, 3].map(v => `<span><span class="sw" style="background:${v === 0 ? '#1c2540' : cellBg(v)}"></span>${sgn(v)}</span>`).join('') + '<span>· «!» = valor sin justificación completa</span>';
$('#rubric').innerHTML = `
<div><b>0 · Sin influencia</b>No existe un mecanismo causal plausible entre ambas variables en el horizonte analizado.</div>
<div><b>±1 · Débil</b>Efecto indirecto, lento o condicionado a terceras variables. Puede ser omitido sin cambiar la dinámica general.</div>
<div><b>±2 · Moderada</b>Efecto reconocible y repetible, pero con atenuantes, sustitutos o dependencia de otro factor.</div>
<div><b>±3 · Fuerte</b>Efecto directo, rápido y difícil de sustituir. Verificado con evidencia observable.</div>
<div><b>Signo</b>+ : al subir la causa sube el efecto. − : al subir la causa baja el efecto (p. ej. reduce resistencia).</div>
<div><b>Cómo justificar</b>(1) Mecanismo conceptual: por qué ocurre. (2) Evidencia práctica: caso/dato observable. (3) Indicador para verificarlo con datos propios.</div>`;
$('#matrix').onclick = e => { const c = e.target.closest('.cell'); if (c) { ui.sel = [c.dataset.a, c.dataset.b]; renderMatrix(); renderEditor(); } };
$('#matrix').onmousemove = e => {
  const c = e.target.closest('.cell'); if (!c) return tip(null);
  const l = L(c.dataset.a, c.dataset.b);
  tip(e, `<b>${esc(code(c.dataset.a))} → ${esc(code(c.dataset.b))}</b> (${sgn(l?.v || 0)})<br>${l?.concept ? esc(l.concept.slice(0, 160)) + '…' : 'Sin influencia directa registrada.'}`);
};
$('#matrix').onmouseleave = () => tip(null);
function tip(e, html) {
  const t = $('#tip'); if (!e) { t.style.opacity = 0; return; }
  t.innerHTML = html; t.style.opacity = 1;
  t.style.left = Math.min(e.clientX + 14, innerWidth - 360) + 'px'; t.style.top = (e.clientY + 14) + 'px';
}
function autoZero(a, b) {
  return `Sin influencia directa: no se identifica un mecanismo causal por el cual «${name(a)}» modifique de forma directa a «${name(b)}» en el horizonte de análisis. Cualquier efecto pasa por otras variables y se captura como influencia indirecta (MICMAC). Si existe evidencia en contrario, asigne un valor y documéntela.`;
}
function renderEditor() {
  const box = $('#cell-editor');
  if (!ui.sel) { box.innerHTML = '<h2>Detalle del cruce</h2><p class="muted">Seleccione una celda de la matriz para ver el valor, su justificación conceptual y la evidencia práctica.</p>'; return; }
  const [a, b] = ui.sel, l = L(a, b) || { v: 0, concept: '', evidence: '', src: '' };
  box.innerHTML = `<div class="ed"><h2>Detalle del cruce</h2>
  <div class="link-title">${esc(name(a))} <span style="color:var(--acc2)">→</span> ${esc(name(b))}</div>
  <label>Valor de influencia</label>
  <div class="scale">${[-3, -2, -1, 0, 1, 2, 3].map(v => `<button data-v="${v}" class="${l.v === v ? 'on' : ''}" style="${l.v === v ? 'background:' + pillBg(v) : ''}">${sgn(v)}</button>`).join('')}</div>
  ${l.v === 0 ? `<p class="muted" style="margin-top:12px">${esc(autoZero(a, b))}</p>` : ''}
  <label>Justificación conceptual (mecanismo causal)</label><textarea data-f="concept" placeholder="¿Por qué A influye en B? Teoría o lógica causal...">${esc(l.concept)}</textarea>
  <label>Evidencia práctica (caso o dato observable)</label><textarea data-f="evidence" placeholder="Caso real, dato, observación que respalda el valor...">${esc(l.evidence)}</textarea>
  <label>Indicador / fuente para verificar</label><input data-f="src" value="${esc(l.src || '')}" placeholder="Indicador, documento o fuente">
  ${l.v !== 0 && !hasJust(l) ? '<div class="warn">⚠ Falta justificación completa (concepto y evidencia).</div>' : ''}</div>`;
}
$('#cell-editor').onclick = e => {
  const v = e.target.dataset.v; if (v === undefined || !ui.sel) return;
  const k = key(...ui.sel); S.links[k] = S.links[k] || { v: 0, concept: '', evidence: '', src: '' };
  S.links[k].v = +v; save(); renderMatrix(); renderEditor(); renderLog();
};
$('#cell-editor').oninput = e => {
  const f = e.target.dataset.f; if (!f || !ui.sel) return;
  const k = key(...ui.sel); S.links[k] = S.links[k] || { v: 0, concept: '', evidence: '', src: '' };
  S.links[k][f] = e.target.value; save(); renderMatrix(); renderLog();
};
function renderLog() {
  const f = $('#log-filter').value;
  const rows = Object.entries(S.links).filter(([k, l]) => l.v && idx(k.split('>')[0]) >= 0 && idx(k.split('>')[1]) >= 0)
    .filter(([k, l]) => f === 'all' || (f === 'missing' && !hasJust(l)) || (f === 'neg' && l.v < 0) || (['1', '2', '3'].includes(f) && Math.abs(l.v) === +f))
    .sort((x, y) => Math.abs(y[1].v) - Math.abs(x[1].v));
  $('#log').innerHTML = `<tr><th>Cruce</th><th>Valor</th><th>Concepto</th><th>Evidencia práctica</th><th>Indicador</th></tr>` +
    (rows.map(([k, l]) => { const [a, b] = k.split('>'); return `<tr class="clickable" data-a="${a}" data-b="${b}"><td><b>${esc(code(a))} → ${esc(code(b))}</b></td><td><span class="pill" style="background:${pillBg(l.v)}">${sgn(l.v)}</span></td><td>${esc(l.concept) || '<i class="muted">—</i>'}</td><td>${esc(l.evidence) || '<i class="muted">—</i>'}</td><td>${esc(l.src)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Sin resultados.</td></tr>');
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
  <text x="${X(tx) + 5}" y="${m.t + ph - 6}" fill="#fff" font-size="10" opacity=".7">umbral dep. ${tx.toFixed(1)}</text><text x="${m.l + 6}" y="${Y(ty) - 5}" fill="#fff" font-size="10" opacity=".7">umbral infl. ${ty.toFixed(1)}</text>
  <text x="${m.l + pw / 2}" y="${H - 12}" text-anchor="middle" fill="#e8ecf8" font-size="13" font-weight="600">DEPENDENCIA (%) →</text><text transform="translate(16 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" fill="#e8ecf8" font-size="13" font-weight="600">INFLUENCIA (%) →</text>`;
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
  $('#rank').innerHTML = `<tr><th>Var.</th><th>Infl.</th><th>Dep.</th><th>Cuadrante</th>${PD.mode === 'indirect' ? '<th>Rango Δ</th>' : ''}</tr>` + order.map(i => {
    const border = Math.abs(sc.inf[i] - ty) < (y1 - y0) * .04 || Math.abs(sc.dep[i] - tx) < (x1 - x0) * .04;
    const dr = PD.rkD[i] - PD.rkI[i];
    return `<tr class="clickable ${ui.selVar === V()[i].id ? 'sel' : ''}" data-id="${V()[i].id}"><td><b>${esc(V()[i].code)}</b></td><td>${sc.inf[i].toFixed(1)}</td><td>${sc.dep[i].toFixed(1)}</td><td><span class="badge" style="background:${QUAD[q[i]].color}">${QUAD[q[i]].short}</span>${border ? ' <span title="Cerca del umbral" style="color:#fbbf24">≈</span>' : ''}</td>${PD.mode === 'indirect' ? `<td>${dr === 0 ? '=' : (dr > 0 ? '▲' + dr : '▼' + -dr)}</td>` : ''}</tr>`;
  }).join('');
  renderDetail();
}
$('#plane-wrap').onclick = e => { const id = e.target.dataset?.id; if (id) { ui.selVar = id; renderPlane(); } };
$('#plane-wrap').onmousemove = e => {
  const id = e.target.dataset?.id; if (!id || !PD) return tip(null);
  const i = idx(id); tip(e, `<b>${esc(V()[i].name)}</b><br>Influencia ${PD.sc.inf[i].toFixed(1)}% · Dependencia ${PD.sc.dep[i].toFixed(1)}%<br>${QUAD[PD.q[i]].name}`);
};
$('#plane-wrap').onmouseleave = () => tip(null);
$('#rank').onclick = e => { const r = e.target.closest('tr.clickable'); if (r) { ui.selVar = r.dataset.id; renderPlane(); } };
['#pl-mode', '#pl-k', '#pl-thr', '#pl-zoom', '#pl-links'].forEach(s => $(s).oninput = renderPlane);

function renderDetail() {
  const box = $('#var-detail');
  if (!ui.selVar || idx(ui.selVar) < 0) { box.innerHTML = '<h2>Justificación de la posición</h2><p class="muted">Seleccione una variable en el gráfico o en la tabla para ver por qué cae en su cuadrante: qué cruces suman su influencia y su dependencia, con su concepto y evidencia.</p>'; return; }
  const i = idx(ui.selVar), v = V()[i], q = PD.q[i], Q = QUAD[q], id = v.id;
  const outs = V().filter(b => b.id !== id && val(id, b.id)).map(b => ({ b, l: L(id, b.id) })).sort((a, b) => Math.abs(b.l.v) - Math.abs(a.l.v));
  const ins = V().filter(b => b.id !== id && val(b.id, id)).map(b => ({ b, l: L(b.id, id) })).sort((a, b) => Math.abs(b.l.v) - Math.abs(a.l.v));
  const list = (arr, out) => arr.length ? arr.map(({ b, l }) => `<div class="lk" style="border-color:${pillBg(l.v)}"><b>${out ? esc(v.code) + ' → ' + esc(b.code) : esc(b.code) + ' → ' + esc(v.code)}</b> <span class="pill" style="background:${pillBg(l.v)}">${sgn(l.v)}</span><br>${esc(l.concept) || '<i>sin concepto</i>'}<small>Evidencia: ${esc(l.evidence) || '—'}</small></div>`).join('') : '<p class="muted">Ningún vínculo directo registrado.</p>';
  const rI = PD.sc.rawI[i], rD = PD.sc.rawD[i], inf = PD.sc.inf[i], dep = PD.sc.dep[i];
  const sumO = outs.reduce((s, o) => s + Math.abs(o.l.v), 0), sumI = ins.reduce((s, o) => s + Math.abs(o.l.v), 0);
  box.innerHTML = `<div class="card-head"><h2>${esc(v.code)} · ${esc(v.name)}</h2><span class="badge" style="background:${Q.color}">${Q.name}</span></div>
  <p class="muted"><b style="color:var(--txt)">Lectura del resultado:</b> influencia <b>${inf.toFixed(1)}%</b> ${inf >= PD.ty ? '≥' : '<'} umbral ${PD.ty.toFixed(1)}% y dependencia <b>${dep.toFixed(1)}%</b> ${dep >= PD.tx ? '≥' : '<'} umbral ${PD.tx.toFixed(1)}%. ${PD.mode === 'direct' ? `Influencia = suma de la fila = ${sumO} (de ${3 * (V().length - 1)} posibles); dependencia = suma de la columna = ${sumI}.` : `Valores indirectos: caminos de hasta ${PD.K} pasos con atenuación 0,6 por paso adicional (influencia bruta ${rI.toFixed(2)}, dependencia bruta ${rD.toFixed(2)}).`}</p>
  <p class="muted"><b style="color:var(--txt)">Concepto:</b> ${Q.concept}<br><b style="color:var(--txt)">Implicación práctica:</b> ${Q.action}</p>
  <div class="detail-grid"><div><h3>Influye en (suma ${sumO})</h3>${list(outs, true)}</div><div><h3>Depende de (suma ${sumI})</h3>${list(ins, false)}</div></div>`;
}
$('#quad-cards').innerHTML = Object.entries(QUAD).map(([k, q]) => `<div class="qc" style="background:${q.color}18"><h4><span class="dot" style="background:${q.color}"></span>${q.name}</h4>${q.concept}<br><b style="color:var(--txt)">→ ${q.action}</b></div>`).join('');

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
  const hdr = `<div class="int int-h"><span>Tipo</span><span>Magnitud</span><span>Inicio t</span><span>Duración</span><span></span></div>`;
  $('#interventions').innerHTML = V().map((v, i) => {
    const mine = S.ints.map((it, k) => [it, k]).filter(([it]) => it.vid === v.id);
    return `<div class="vblock"><div class="vhead"><span class="dot" style="background:${varColor(i)}"></span><b>${esc(v.code)}</b><span class="muted">${esc(v.name)}</span><span class="cnt">${mine.length ? mine.length + (mine.length > 1 ? ' influencias' : ' influencia') : 'sin influencia'}</span><button class="btn ghost sm" data-add="${v.id}">+ Influencia</button></div>` +
      (mine.length ? hdr + mine.map(([it, k]) => `<div class="int"><select data-k="${k}" data-f="type"><option value="pulse" ${it.type === 'pulse' ? 'selected' : ''}>Pulso (único)</option><option value="sust" ${it.type === 'sust' ? 'selected' : ''}>Sostenida (por paso)</option></select>
      <input type="number" step="0.5" data-k="${k}" data-f="mag" value="${it.mag}"><input type="number" min="1" data-k="${k}" data-f="start" value="${it.start}">
      <input type="number" min="1" data-k="${k}" data-f="dur" value="${it.dur}" ${it.type === 'pulse' ? 'disabled' : ''}><button class="x" data-del="${k}">✕</button></div>`).join('') : '') + '</div>';
  }).join('') + '<p class="muted" style="margin:4px 0 0">Magnitud en puntos (0–100): pulso = puntos aplicados una vez; sostenida = puntos por paso. Negativo = presión a la baja.</p>';
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
  s += `<text x="${m.l + pw / 2}" y="${H - 1}" fill="#93a0c4" font-size="11" text-anchor="middle">pasos de tiempo</text>`;
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
    const bb = r.getBoundingClientRect(), t = clamp(Math.round((e.clientX - bb.left) / bb.width * T), 0, T);
    hv.setAttribute('x1', X(t)); hv.setAttribute('x2', X(t)); hv.setAttribute('opacity', .6);
    $('#hover-read').innerHTML = `<b style="color:var(--txt)">t = ${t}</b> · ` + [...vis].sort((a, b) => data[t][b] - data[t][a]).map(i => `<span style="color:${varColor(i)}">${esc(V()[i].code)} ${data[t][i].toFixed(1)}</span>`).join(' · ');
  };
  r.onmouseleave = () => hv.setAttribute('opacity', 0);
  if (!$('#hover-read').innerHTML) $('#hover-read').textContent = 'Pase el cursor sobre el gráfico para leer los valores por paso. Banda amarilla = periodo de intervención.';
  /* impacto */
  const rows = V().map((v, i) => { let pk = 0, pt = 0; SIM.dl.forEach((r, t) => { if (Math.abs(r[i]) > Math.abs(pk)) { pk = r[i]; pt = t; } }); return { v, i, base: v.x0, fin: SIM.x[T][i], df: SIM.dl[T][i], pk, pt }; }).sort((a, b) => Math.abs(b.pk) - Math.abs(a.pk));
  const mxp = Math.max(...rows.map(r => Math.abs(r.pk)), 1e-9);
  $('#impact').innerHTML = `<tr><th>Variable</th><th>Inicial</th><th>Final</th><th>Δ final</th><th>Pico Δ (paso)</th><th style="width:30%">Magnitud</th></tr>` + rows.map(r => `<tr><td><span class="dot" style="background:${varColor(r.i)}"></span><b>${esc(r.v.code)}</b> ${esc(r.v.name)}</td><td>${r.base.toFixed(0)}</td><td>${r.fin.toFixed(1)}</td><td style="color:${r.df >= 0 ? '#38bdf8' : '#fb7185'}">${sgn(+r.df.toFixed(1))}</td><td>${sgn(+r.pk.toFixed(1))} (t=${r.pt})</td><td><div class="bar" style="width:${Math.abs(r.pk) / mxp * 100}%;background:${r.pk >= 0 ? '' : '#fb7185'}"></div></td></tr>`).join('');
}

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
  } catch (e) { alert('No se pudo exportar: ' + e.message); }
};
$('#file-import').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const o = JSON.parse(t); if (!o.vars || !o.links) throw 0; S = o; uid = 1000; ui.sel = ui.selVar = null; save(); renderAll(); } catch { alert('Archivo inválido'); } }); };
$('#btn-reset').onclick = () => { if (confirm('¿Restablecer al ejemplo original? Se perderán sus cambios.')) { uid = 1; S = defaults(); ui.sel = ui.selVar = null; ui.hidden.clear(); save(); renderAll(); } };

function renderAll() { renderVars(); renderMatrix(); renderEditor(); renderLog(); renderPlane(); renderInts(); renderChart(); }
renderAll();
