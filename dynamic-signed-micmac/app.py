"""
app.py — Dynamic Signed-MICMAC Studio
Interfaz Streamlit para el análisis estructural prospectivo con polaridad,
fricción temporal y propagación convergente (Katz-Bonacich / Leontief).

Ejecutar:  streamlit run app.py
"""
from __future__ import annotations

import math
from typing import List, Optional, Tuple

import networkx as nx
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import micmac_engine as me

st.set_page_config(page_title="Dynamic Signed-MICMAC Studio", page_icon="🧭", layout="wide")

st.markdown(
    """
<style>
.block-container{padding-top:1.4rem;max-width:1500px}
h1,h2,h3{letter-spacing:-.01em}
.kpi{border:1px solid rgba(120,130,255,.25);border-radius:14px;padding:12px 16px;
     background:linear-gradient(135deg,rgba(124,140,255,.10),rgba(34,211,238,.06))}
.kpi b{font-size:1.5rem;display:block}.kpi span{font-size:.8rem;opacity:.75}
.tag{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.78rem;margin:2px 4px 2px 0;color:#06101c;font-weight:600}
</style>""",
    unsafe_allow_html=True,
)

COLOR_CUAD = {
    "Variable motriz / de entrada": "#34d399",
    "Variable de enlace / reto": "#f59e0b",
    "Variable dependiente / de resultado": "#a78bfa",
    "Variable autónoma": "#94a3b8",
}


# --------------------------------------------------------------------------- #
# Estado y barra lateral
# --------------------------------------------------------------------------- #
def init_estado() -> None:
    if "A" not in st.session_state:
        A, T = me.demo_matrices()
        st.session_state.A, st.session_state.T = A, T
        st.session_state.origen = "Demostración territorial (8 variables)"


def sidebar() -> Tuple[float, float, str, float, float, bool]:
    st.sidebar.title("🧭 Signed-MICMAC")
    st.sidebar.caption("Parámetros del modelo dinámico")
    lam = st.sidebar.slider("Tasa de descuento temporal λ", me.LAMBDA_MIN, me.LAMBDA_MAX, 0.10, 0.01,
                            help="Decaimiento exponencial del impacto con el retardo: w = a·e^(−λt).")
    alpha_ratio = st.sidebar.slider("Ratio de convergencia espectral (α·ρ)", 0.05, 0.99, 0.80, 0.01,
                                    help="α = ratio / ρ(|W|). Debe ser < 1 para que la serie de cadenas indirectas converja.")
    criterio = st.sidebar.radio("Línea divisoria de cuadrantes", ["media", "mediana"], horizontal=True)
    omega_trampa = st.sidebar.slider("Umbral de trampa de política Ω (%)", 5, 80, 30, 5,
                                     help="Una variable motriz en el MICMAC clásico con Ω superior a este valor se marca como trampa.")
    umbral_red = st.sidebar.slider("Umbral del grafo (% del flujo máx.)", 0, 90, 15, 5,
                                   help="Se omiten las aristas con intensidad inferior a este porcentaje del máximo.")
    st.sidebar.divider()
    st.sidebar.subheader("Datos")
    st.sidebar.caption(f"Origen actual: **{st.session_state.origen}**")
    if st.sidebar.button("↺ Restaurar dataset de demostración", use_container_width=True):
        A, T = me.demo_matrices()
        st.session_state.A, st.session_state.T = A, T
        st.session_state.origen = "Demostración territorial (8 variables)"
        st.session_state.pop("ed_A", None); st.session_state.pop("ed_T", None)
        st.rerun()
    up = st.sidebar.file_uploader("Cargar Excel (hojas Matriz_A y Matriz_T)", type=["xlsx"])
    cs = st.sidebar.file_uploader("…o dos CSV (A y T)", type=["csv"], accept_multiple_files=True)
    try:
        if up is not None and st.session_state.get("_ult_up") != up.file_id:
            A, T = me.leer_excel(up)
            st.session_state.A, st.session_state.T = A, T
            st.session_state.origen = f"Excel: {up.name}"; st.session_state._ult_up = up.file_id
            st.session_state.pop("ed_A", None); st.session_state.pop("ed_T", None); st.rerun()
        if len(cs) == 2:
            key = "|".join(sorted(f.file_id for f in cs))
            if st.session_state.get("_ult_csv") != key:
                es_t = lambda f: any(s in f.name.lower() for s in ("retard", "matriz_t", "_t.", "-t."))
                ft = next((f for f in cs if es_t(f)), cs[1])
                fa = cs[0] if ft is cs[1] else cs[1]
                A, T = me.leer_csv(fa, ft)
                st.session_state.A, st.session_state.T = A, T
                st.session_state.origen = f"CSV: {fa.name} + {ft.name}"; st.session_state._ult_csv = key
                st.session_state.pop("ed_A", None); st.session_state.pop("ed_T", None); st.rerun()
        elif len(cs) == 1:
            st.sidebar.info("Suba ambos CSV (matriz A y matriz T). El archivo de retardos se reconoce si su nombre contiene «retardo», «Matriz_T» o termina en _T; si no, se toma como el segundo.")
    except me.MicmacError as exc:
        st.sidebar.error(str(exc))
    return lam, alpha_ratio, criterio, omega_trampa, umbral_red, True


# --------------------------------------------------------------------------- #
# Utilidades de texto y gráficos
# --------------------------------------------------------------------------- #
def tooltip(nombre: str, r: pd.Series) -> str:
    f = r["Bucle propio (F)"]
    bucle = "amplificador (retroalimentación positiva)" if f > 0 else "regulador / homeostático" if f < 0 else "neutro"
    trampa = "<br><b>⚠ Trampa de política:</b> parece muy motriz en el MICMAC clásico, pero gran parte se neutraliza." if r["Trampa de política"] else ""
    return (f"<b>{nombre}</b><br>{r['Cuadrante']}<br>"
            f"Motricidad neta: {r['Motricidad neta']:.3f} · Dependencia neta: {r['Dependencia neta']:.3f}<br>"
            f"Bucle propio F = {f:+.3f} → {bucle}<br>Ambigüedad Ω = {r['Ambigüedad Ω (%)']:.1f} %<br>"
            f"Rango clásico {r['Rango clásico']} → dinámico {r['Rango dinámico']}<br>"
            f"<i>{r['Diagnóstico']}</i>{trampa}")


def fig_plano(c: pd.DataFrame, criterio: str) -> go.Figure:
    ud, um = me.umbrales(c, criterio)
    xmax, ymax = c["Dependencia neta"].max() * 1.18 + 1e-9, c["Motricidad neta"].max() * 1.18 + 1e-9
    fig = go.Figure()
    zonas = [("Variable motriz / de entrada", 0, ud, um, ymax), ("Variable de enlace / reto", ud, xmax, um, ymax),
             ("Variable autónoma", 0, ud, 0, um), ("Variable dependiente / de resultado", ud, xmax, 0, um)]
    for nom, x0, x1, y0, y1 in zonas:
        fig.add_shape(type="rect", x0=x0, x1=x1, y0=y0, y1=y1, fillcolor=COLOR_CUAD[nom], opacity=0.10, line_width=0, layer="below")
        fig.add_annotation(x=x0 + (x1 - x0) * (0.03 if x0 == 0 else 0.97), y=y1 - (y1 - y0) * 0.05 if y0 else y0 + (y1 - y0) * 0.06,
                           text=f"<b>{nom.replace('Variable ', '').upper()}</b>", showarrow=False, font=dict(color=COLOR_CUAD[nom], size=12),
                           xanchor="left" if x0 == 0 else "right", yanchor="top" if y0 else "bottom")
    fig.add_vline(x=ud, line_dash="dash", line_color="white", opacity=.7)
    fig.add_hline(y=um, line_dash="dash", line_color="white", opacity=.7)
    omega = c["Ambigüedad Ω (%)"]
    fig.add_trace(go.Scatter(
        x=c["Dependencia neta"], y=c["Motricidad neta"], mode="markers+text", text=c.index, textposition="top center",
        textfont=dict(size=12), hovertext=[tooltip(n, r) for n, r in c.iterrows()], hoverinfo="text",
        marker=dict(size=14 + omega * 0.75, sizemode="diameter", color=c["Bucle propio (F)"], colorscale="RdBu_r", cmid=0,
                    line=dict(width=[3 if t else 1 for t in c["Trampa de política"]], color=["#fbbf24" if t else "#0b0f1a" for t in c["Trampa de política"]]),
                    colorbar=dict(title="Bucle propio F<br>(− regula / + amplifica)"), opacity=.92)))
    fig.update_layout(template="plotly_dark", height=640, xaxis=dict(title="Dependencia neta efectiva (Dⁿᵉᵗᵃ)", range=[0, xmax]),
                      yaxis=dict(title="Motricidad neta efectiva (Mⁿᵉᵗᵃ)", range=[0, ymax]), margin=dict(l=10, r=10, t=30, b=10),
                      title="Plano estratégico: tamaño = Ω (contradicción estructural) · color = bucle propio F · borde dorado = trampa de política")
    return fig


def fig_ranking(c: pd.DataFrame) -> Tuple[go.Figure, go.Figure]:
    d = c.sort_values("Motricidad neta")
    norm = lambda s: s / s.max() * 100 if s.max() > 0 else s
    bars = go.Figure()
    bars.add_bar(y=d.index, x=norm(d["Motricidad clásica"]), name="MICMAC clásico (|A|)", orientation="h", marker_color="#64748b")
    bars.add_bar(y=d.index, x=norm(d["Motricidad bruta"]), name="Dinámico bruto (S bruta)", orientation="h", marker_color="#7c8cff")
    bars.add_bar(y=d.index, x=norm(d["Motricidad neta"]), name="Dinámico neto con signos", orientation="h", marker_color="#22d3ee")
    bars.update_layout(template="plotly_dark", barmode="group", height=520, xaxis_title="Motricidad (% del máximo de cada método)",
                       margin=dict(l=10, r=10, t=30, b=10), legend=dict(orientation="h", y=1.08))
    sl = go.Figure()
    for n, r in c.iterrows():
        col = "#fb7185" if r["Cambio de rango"] < 0 else "#34d399" if r["Cambio de rango"] > 0 else "#94a3b8"
        sl.add_trace(go.Scatter(x=[0, 1], y=[r["Rango clásico"], r["Rango dinámico"]], mode="lines+markers+text",
                                line=dict(color=col, width=4 if r["Trampa de política"] else 2, dash="solid"),
                                text=[f"{n}", f"{n}"], textposition=["middle left", "middle right"], hoverinfo="text",
                                hovertext=f"{n}: {r['Rango clásico']}° → {r['Rango dinámico']}°", showlegend=False))
    sl.update_layout(template="plotly_dark", height=520, margin=dict(l=150, r=150, t=40, b=10),
                     yaxis=dict(autorange="reversed", title="Posición (1 = más motriz)", dtick=1),
                     xaxis=dict(tickvals=[0, 1], ticktext=["MICMAC clásico", "MICMAC dinámico con signos"], range=[-.05, 1.05]),
                     title="Cambio de jerarquía (verde = sube · rojo = baja)")
    return bars, sl


def aristas_desde(Z: np.ndarray, nombres: List[str], umbral_abs: float) -> pd.DataFrame:
    filas = [(nombres[i], nombres[j], float(Z[i, j])) for i in range(len(nombres)) for j in range(len(nombres))
             if i != j and abs(Z[i, j]) >= umbral_abs and abs(Z[i, j]) > 1e-12]
    return pd.DataFrame(filas, columns=["Origen", "Destino", "Valor"])


def fig_red(res: me.Resultado, c: pd.DataFrame, Z: np.ndarray, pct: float) -> Tuple[go.Figure, pd.DataFrame]:
    off = Z.copy(); np.fill_diagonal(off, 0)
    mx = np.abs(off).max()
    ar = aristas_desde(Z, res.variables, mx * pct / 100.0)
    G = nx.DiGraph(); G.add_nodes_from(res.variables)
    for _, r in ar.iterrows():
        G.add_edge(r["Origen"], r["Destino"], w=r["Valor"])
    pos = nx.circular_layout(G) if len(G) <= 12 else nx.spring_layout(G, seed=42)
    fig = go.Figure()
    for o, d, dat in G.edges(data=True):
        (x0, y0), (x1, y1) = pos[o], pos[d]
        pos_ = dat["w"] > 0
        col = "#34d399" if pos_ else "#fb7185"
        wd = 1 + 5 * abs(dat["w"]) / mx
        fig.add_trace(go.Scatter(x=[x0, x1], y=[y0, y1], mode="lines", line=dict(color=col, width=wd, dash="solid" if pos_ else "dash"),
                                 hoverinfo="text", hovertext=f"{o} → {d}: {dat['w']:+.3f}", showlegend=False, opacity=.8))
        L = math.hypot(x1 - x0, y1 - y0) or 1
        t = 1 - (0.11 / L)  # punta de flecha cerca del destino
        fig.add_trace(go.Scatter(x=[x0 + (x1 - x0) * t], y=[y0 + (y1 - y0) * t], mode="markers", hoverinfo="skip", showlegend=False,
                                 marker=dict(symbol="arrow", size=11 + wd, color=col, angle=math.degrees(math.atan2(x1 - x0, y1 - y0)), angleref="up")))
    fig.add_trace(go.Scatter(x=[pos[v][0] for v in G], y=[pos[v][1] for v in G], mode="markers+text", text=list(G.nodes), textposition="top center",
                             hovertext=[tooltip(v, c.loc[v]) for v in G], hoverinfo="text",
                             marker=dict(size=[16 + 40 * c.loc[v, "Motricidad neta"] / (c["Motricidad neta"].max() + 1e-9) for v in G],
                                         color=[c.loc[v, "Bucle propio (F)"] for v in G], colorscale="RdBu_r", cmid=0,
                                         line=dict(color="#0b0f1a", width=1.5), colorbar=dict(title="Bucle F")), showlegend=False))
    fig.update_layout(template="plotly_dark", height=680, xaxis=dict(visible=False), yaxis=dict(visible=False, scaleanchor="x"),
                      margin=dict(l=10, r=10, t=10, b=10))
    return fig, ar


def resumen_ejecutivo(c: pd.DataFrame, res: me.Resultado, omega_trampa: float) -> str:
    def nombres(mask) -> str:
        v = list(c.index[mask]); return ", ".join(f"**{x}**" for x in v) if v else "_ninguna_"
    pal = c["Diagnóstico"].str.contains("Palanca maestra"); esp = c["Diagnóstico"].str.contains("espejismo")
    est = c["Diagnóstico"].str.contains("homeostático"); bola = c["Diagnóstico"].str.contains("bola de nieve")
    L = [f"El sistema tiene **{len(c)} variables** y un radio espectral ρ(|W|) = **{res.rho:.3f}**; el factor de atenuación resultante es α = **{res.alpha:.3f}**, "
         f"lo que garantiza la convergencia de las cadenas causales indirectas. La ambigüedad media del sistema es **{c['Ambigüedad Ω (%)'].mean():.1f} %**.",
         "",
         f"- 🟢 **Palancas maestras consistentes** (alta motricidad neta y baja ambigüedad): {nombres(pal)}. Intervenir sobre ellas produce efectos amplios cuyo signo se mantiene a lo largo de las rutas indirectas.",
         f"- 🟠 **Falsas variables clave / espejismos** (alta motricidad bruta y ambigüedad en el cuartil superior): {nombres(esp)}. Su influencia aparente se cancela en gran parte por rutas de signo opuesto; priorizarlas puede ser ineficiente.",
         f"- 🔵 **Estabilizadores homeostáticos** (bucle propio F fuertemente negativo): {nombres(est)}. Amortiguan perturbaciones; conviene preservarlas y evitar debilitarlas.",
         f"- 🔴 **Nodos de efecto bola de nieve** (bucle propio F fuertemente positivo): {nombres(bola)}. Amplifican los cambios y concentran el riesgo de desborde; requieren monitoreo y mecanismos de contención."]
    tr = c[c["Trampa de política"]]
    if len(tr):
        L += ["", f"⚠ **Trampas de política** (motrices en el MICMAC clásico con Ω > {omega_trampa:.0f} %): "
              + ", ".join(f"**{n}** (Ω = {r['Ambigüedad Ω (%)']:.0f} %)" for n, r in tr.iterrows()) + "."]
    sube = c["Cambio de rango"].idxmax(); baja = c["Cambio de rango"].idxmin()
    if c.loc[sube, "Cambio de rango"] > 0:
        L.append(f"\n📈 Mayor ascenso al pasar al modelo dinámico: **{sube}** (+{c.loc[sube, 'Cambio de rango']} posiciones). ")
    if c.loc[baja, "Cambio de rango"] < 0:
        L.append(f"📉 Mayor descenso: **{baja}** ({c.loc[baja, 'Cambio de rango']} posiciones).")
    for a in res.advertencias:
        L.append(f"\n> ⚠ {a}")
    return "\n".join(L)


# --------------------------------------------------------------------------- #
# Aplicación
# --------------------------------------------------------------------------- #
init_estado()
lam, alpha_ratio, criterio, omega_trampa, umbral_red, _ = sidebar()

st.title("🧭 Dynamic Signed-MICMAC Studio")
st.caption("Análisis estructural prospectivo con **polaridad**, **fricción temporal** y **propagación convergente** (Katz-Bonacich / inversa de Leontief).")

t_datos, t_plano, t_comp, t_red, t_diag, t_met = st.tabs(
    ["📥 Datos", "🎯 Plano estratégico", "⚖ Clásico vs. dinámico", "🕸 Red causal", "🩺 Diagnóstico", "📐 Metodología"])

with t_datos:
    st.markdown("Edite directamente las matrices. **A**: impacto directo en [−3, 3] (+ refuerza, − inhibe; fila → columna). "
                "**T**: retardo (años o períodos) hasta que el impacto se materializa; se ignora donde A = 0.")
    c1, c2 = st.columns(2)
    n = len(st.session_state.A)
    with c1:
        st.subheader("Matriz A · intensidad y polaridad")
        A_ed = st.data_editor(st.session_state.A, key="ed_A", use_container_width=True, height=36 * (n + 1) + 6,
                              column_config={c: st.column_config.NumberColumn(c, min_value=-3, max_value=3, step=1, format="%d") for c in st.session_state.A.columns})
    with c2:
        st.subheader("Matriz T · retardo temporal")
        T_ed = st.data_editor(st.session_state.T, key="ed_T", use_container_width=True, height=36 * (n + 1) + 6,
                              column_config={c: st.column_config.NumberColumn(c, min_value=0.0, step=0.5, format="%.1f") for c in st.session_state.T.columns})
    st.session_state.A, st.session_state.T = A_ed, T_ed
    st.caption("Dataset de demostración: sistema territorial/ambiental con 27 impactos (positivos y negativos) y retardos de 1 a 10 años. "
               "Las evidencias deben calibrarse con datos reales del territorio.")
    with st.expander("Descripción de las variables de demostración"):
        for k, v in me.DEMO_DESCRIPCIONES.items():
            st.markdown(f"- **{k}**: {v}")

try:
    res = me.calcular(st.session_state.A, st.session_state.T, lam, alpha_ratio)
except me.MicmacError as exc:
    st.error(f"Error en los datos o en el cálculo: {exc}")
    st.stop()

c = me.clasificar(res.indicadores, criterio, omega_trampa)
A_out = pd.DataFrame(res.A, index=res.variables, columns=res.variables)
T_out = pd.DataFrame(res.T, index=res.variables, columns=res.variables)
st.sidebar.download_button("⬇ Descargar Excel (A, T e indicadores)", me.a_excel_bytes(A_out, T_out, c),
                           file_name="signed_micmac.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", use_container_width=True)

with t_plano:
    k = st.columns(4)
    for col, (lab, val) in zip(k, [("Variables", f"{len(c)}"), ("ρ(|W|)", f"{res.rho:.3f}"), ("α = ratio/ρ", f"{res.alpha:.3f}"),
                                   ("Ω medio", f"{c['Ambigüedad Ω (%)'].mean():.1f} %")]):
        col.markdown(f'<div class="kpi"><b>{val}</b><span>{lab}</span></div>', unsafe_allow_html=True)
    st.plotly_chart(fig_plano(c, criterio), use_container_width=True)
    st.markdown("".join(f'<span class="tag" style="background:{v}">{k_}</span>' for k_, v in COLOR_CUAD.items()))
    st.dataframe(c[["Cuadrante", "Motricidad neta", "Dependencia neta", "Bucle propio (F)", "Ambigüedad Ω (%)", "Diagnóstico"]].round(3), use_container_width=True)

with t_comp:
    bars, sl = fig_ranking(c)
    cc1, cc2 = st.columns(2)
    cc1.plotly_chart(bars, use_container_width=True)
    cc2.plotly_chart(sl, use_container_width=True)
    st.subheader("⚠ Trampas de política (variables paradójicas)")
    tr = c[c["Trampa de política"]]
    if len(tr):
        st.warning(f"{len(tr)} variable(s) aparecen como muy motrices en el MICMAC clásico, pero pierden más de {omega_trampa:.0f} % de su influencia por cancelación de signos.")
    else:
        st.success("No se detectan trampas de política con el umbral actual.")
    tab = c[["Motricidad clásica", "Rango clásico", "Motricidad neta", "Rango dinámico", "Cambio de rango", "Ambigüedad Ω (%)", "Trampa de política"]].copy()
    tab["Alerta"] = np.where(tab["Trampa de política"], "⚠ Trampa", "")
    st.dataframe(tab.drop(columns=["Trampa de política"]).sort_values("Rango dinámico").round(3), use_container_width=True,
                 column_config={"Ambigüedad Ω (%)": st.column_config.ProgressColumn("Ambigüedad Ω (%)", min_value=0, max_value=100, format="%.1f"),
                                "Cambio de rango": st.column_config.NumberColumn("Cambio de rango (+ sube)", format="%+d")})

with t_red:
    modo = st.radio("Flujos a representar", ["Indirectos netos (S neta − W)", "Impacto directo descontado (W)", "Influencia total neta (S neta)"], horizontal=True)
    Z = {"Indirectos netos (S neta − W)": res.S_neta - res.W, "Impacto directo descontado (W)": res.W, "Influencia total neta (S neta)": res.S_neta}[modo]
    figr, ar = fig_red(res, c, Z, umbral_red)
    st.plotly_chart(figr, use_container_width=True)
    st.caption("Verde sólido: relación neta positiva · rojo punteado: relación neta inhibitoria · grosor ∝ intensidad · tamaño del nodo ∝ motricidad neta · color ∝ bucle propio F.")
    with st.expander(f"Aristas mostradas ({len(ar)})"):
        st.dataframe(ar.sort_values("Valor", key=abs, ascending=False).round(4), use_container_width=True)

with t_diag:
    st.subheader("Resumen ejecutivo del intérprete prospectivo")
    st.markdown(resumen_ejecutivo(c, res, omega_trampa))
    st.subheader("Indicadores estructurales completos")
    st.dataframe(c.drop(columns=["Trampa de política"]).round(3), use_container_width=True)
    with st.expander("Matrices de influencia total (mapas de calor)"):
        for nombre, M in [("S bruta = |W|(I − α|W|)⁻¹", res.S_bruta), ("S neta = W(I − αW)⁻¹", res.S_neta)]:
            h = go.Figure(go.Heatmap(z=M, x=res.variables, y=res.variables, colorscale="RdBu_r", zmid=0, colorbar=dict(title="valor")))
            h.update_layout(template="plotly_dark", height=460, title=nombre, yaxis=dict(autorange="reversed"), margin=dict(l=10, r=10, t=40, b=10))
            st.plotly_chart(h, use_container_width=True)

with t_met:
    st.markdown("### Fundamentación matemática")
    st.markdown("**Matrices de entrada.** $A\\in[-3,3]^{n\\times n}$ con $a_{ii}=0$ (intensidad y polaridad) y $T\\in\\mathbb{R}_{+}^{n\\times n}$ (retardos), con $t_{ij}=0$ si $a_{ij}=0$.")
    st.markdown("**Impacto efectivo descontado** (producto de Hadamard):"); st.latex(r"w_{ij}=a_{ij}\,e^{-\lambda t_{ij}},\qquad w_{ii}=0,\qquad |W|=(|w_{ij}|)")
    st.markdown("**Convergencia.** Con $\\rho(|W|)$ el radio espectral y $\\alpha=\\text{alpha\\_ratio}/\\rho(|W|)$, $\\text{alpha\\_ratio}\\in(0,1)$, la serie de Neumann converge y:")
    st.latex(r"S^{bruta}=|W|\,(I-\alpha|W|)^{-1},\qquad S^{neta}=W\,(I-\alpha W)^{-1}")
    st.markdown("Como $\\rho(W)\\le\\rho(|W|)$, la condición $\\alpha\\rho(|W|)<1$ garantiza también la convergencia de la versión con signos. Además $|S^{neta}_{ij}|\\le S^{bruta}_{ij}$ (desigualdad triangular término a término), de modo que $\\Omega_i\\in[0,100]$.")
    st.markdown("**Indicadores.**")
    st.latex(r"M^{bruta}_i=\sum_j S^{bruta}_{ij},\quad D^{bruta}_i=\sum_j S^{bruta}_{ji},\quad F_i=S^{neta}_{ii}")
    st.latex(r"M^{neta}_i=\sum_{j\ne i}|S^{neta}_{ij}|,\quad D^{neta}_i=\sum_{j\ne i}|S^{neta}_{ji}|,\quad \Omega_i=\Bigl(1-\frac{M^{neta}_i}{M^{bruta}_i}\Bigr)\cdot100\%")
    st.markdown("""
- **F > 0**: bucle amplificador (retroalimentación positiva). **F < 0**: bucle regulador u homeostático.
- **Ω** mide la fracción de la influencia bruta neutralizada por rutas indirectas de signo opuesto.
- **Trampa de política**: motricidad clásica ≥ mediana y Ω > umbral configurable.
- **Roles diagnósticos** (cuartiles/mediana del conjunto): *palanca maestra* (M neta ≥ mediana y Ω ≤ mediana); *espejismo* (M bruta ≥ mediana y Ω ≥ cuartil 3); *estabilizador* (F < 0 y F ≤ cuartil 1); *bola de nieve* (F > 0 y F ≥ cuartil 3).
- **Limitaciones**: la escala −3…3 es ordinal; los retardos son estimaciones de expertos; los umbrales de clasificación son relativos al conjunto de variables analizado.
""")
