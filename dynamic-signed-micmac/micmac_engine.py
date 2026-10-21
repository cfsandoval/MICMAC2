"""
micmac_engine.py
================
Motor matemático de "Dynamic Signed-MICMAC Studio".

Supera tres limitaciones del MICMAC clásico (Godet):
  1. Convergencia trivial (Perron-Frobenius) al elevar la matriz a la potencia k:
     se reemplaza por el operador convergente de Katz-Bonacich / inversa de Leontief.
  2. Ausencia de polaridad: se trabaja con impactos con signo en [-3, 3].
  3. Ausencia de fricción temporal: cada impacto se descuenta con exp(-lambda * t_ij).

Todas las funciones son puras (sin efectos secundarios) y están tipadas.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

LAMBDA_MIN, LAMBDA_MAX = 0.01, 0.50
ALPHA_RATIO_MIN, ALPHA_RATIO_MAX = 0.01, 0.99
EPS = 1e-12


class MicmacError(ValueError):
    """Error de validación o de cálculo matemático controlado."""


# --------------------------------------------------------------------------- #
# Dataset de demostración: sistema territorial / ambiental (8 variables)
# --------------------------------------------------------------------------- #
DEMO_VARIABLES: List[str] = [
    "Gobernanza territorial",
    "Inversión pública",
    "Presión urbana",
    "Cobertura forestal",
    "Disponibilidad hídrica",
    "Actividad agropecuaria",
    "Calidad de vida",
    "Cambio climático",
]
DEMO_DESCRIPCIONES: Dict[str, str] = {
    "Gobernanza territorial": "Capacidad institucional de planificar, regular y hacer cumplir.",
    "Inversión pública": "Recursos públicos para infraestructura, conservación y servicios.",
    "Presión urbana": "Expansión de la mancha urbana y demanda de suelo y servicios.",
    "Cobertura forestal": "Superficie y calidad de ecosistemas boscosos.",
    "Disponibilidad hídrica": "Oferta de agua en cantidad y calidad para usos humanos y ecosistémicos.",
    "Actividad agropecuaria": "Intensidad productiva agrícola y ganadera.",
    "Calidad de vida": "Bienestar, salud, ingresos y acceso a servicios de la población.",
    "Cambio climático": "Alteración de temperatura y precipitación (variable fuertemente exógena).",
}

# Impactos directos [origen, destino, valor, retardo en años]
_DEMO_LINKS: List[Tuple[str, str, float, float]] = [
    ("Gobernanza territorial", "Inversión pública", 2, 1),
    ("Gobernanza territorial", "Presión urbana", -2, 3),
    ("Gobernanza territorial", "Cobertura forestal", 3, 4),
    ("Gobernanza territorial", "Actividad agropecuaria", -1, 3),
    ("Inversión pública", "Calidad de vida", 3, 2),
    ("Inversión pública", "Disponibilidad hídrica", 2, 4),
    ("Inversión pública", "Cobertura forestal", 1, 5),
    ("Inversión pública", "Presión urbana", 1, 3),
    ("Presión urbana", "Cobertura forestal", -3, 3),
    ("Presión urbana", "Disponibilidad hídrica", -2, 2),
    ("Presión urbana", "Calidad de vida", 1, 2),
    ("Presión urbana", "Cambio climático", 1, 8),
    ("Cobertura forestal", "Disponibilidad hídrica", 3, 5),
    ("Cobertura forestal", "Cambio climático", -2, 10),
    ("Cobertura forestal", "Calidad de vida", 1, 4),
    ("Disponibilidad hídrica", "Actividad agropecuaria", 3, 1),
    ("Disponibilidad hídrica", "Calidad de vida", 3, 1),
    ("Actividad agropecuaria", "Cobertura forestal", -3, 3),
    ("Actividad agropecuaria", "Calidad de vida", 2, 2),
    ("Actividad agropecuaria", "Inversión pública", 1, 2),
    ("Actividad agropecuaria", "Cambio climático", 1, 8),
    ("Calidad de vida", "Presión urbana", 2, 3),
    ("Calidad de vida", "Gobernanza territorial", 1, 4),
    ("Cambio climático", "Disponibilidad hídrica", -3, 4),
    ("Cambio climático", "Actividad agropecuaria", -2, 3),
    ("Cambio climático", "Cobertura forestal", -1, 6),
    ("Cambio climático", "Calidad de vida", -1, 5),
]


def demo_matrices() -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Devuelve (A, T) del dataset de demostración como DataFrames n×n."""
    n = len(DEMO_VARIABLES)
    A = pd.DataFrame(np.zeros((n, n)), index=DEMO_VARIABLES, columns=DEMO_VARIABLES)
    T = A.copy()
    for o, d, v, t in _DEMO_LINKS:
        A.loc[o, d] = v
        T.loc[o, d] = t
    return A, T


# --------------------------------------------------------------------------- #
# Validación y E/S
# --------------------------------------------------------------------------- #
def validar_matrices(A: pd.DataFrame, T: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Valida y normaliza A y T. Lanza MicmacError ante inconsistencias."""
    if A.shape[0] != A.shape[1]:
        raise MicmacError("La matriz A debe ser cuadrada.")
    if A.shape != T.shape:
        raise MicmacError("Las matrices A y T deben tener las mismas dimensiones.")
    if A.shape[0] < 2:
        raise MicmacError("Se requieren al menos 2 variables.")
    A = A.copy().apply(pd.to_numeric, errors="coerce")
    T = T.copy().apply(pd.to_numeric, errors="coerce")
    if A.isna().any().any() or T.isna().any().any():
        raise MicmacError("Las matrices contienen celdas vacías o no numéricas.")
    names = list(A.index)
    if len(set(names)) != len(names):
        raise MicmacError("Los nombres de variables deben ser únicos.")
    T.index, T.columns, A.columns = names, names, names
    if (A.abs().to_numpy() > 3 + EPS).any():
        raise MicmacError("Los valores de A deben estar en el rango [-3, 3].")
    if (T.to_numpy() < 0).any():
        raise MicmacError("Los retardos de T deben ser no negativos.")
    a = A.to_numpy(float).copy()
    np.fill_diagonal(a, 0.0)
    t = T.to_numpy(float).copy()
    t[a == 0] = 0.0  # si a_ij = 0 entonces t_ij = 0
    np.fill_diagonal(t, 0.0)
    return pd.DataFrame(a, index=names, columns=names), pd.DataFrame(t, index=names, columns=names)


def leer_excel(archivo) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Lee un .xlsx con hojas 'Matriz_A' y 'Matriz_T'."""
    try:
        hojas = pd.read_excel(archivo, sheet_name=["Matriz_A", "Matriz_T"], index_col=0)
    except Exception as exc:  # noqa: BLE001
        raise MicmacError(f"No se pudo leer el Excel (se esperan las hojas Matriz_A y Matriz_T): {exc}") from exc
    return validar_matrices(hojas["Matriz_A"], hojas["Matriz_T"])


def leer_csv(archivo_a, archivo_t) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Lee dos CSV (A y T) con la primera columna como nombre de variable."""
    try:
        return validar_matrices(pd.read_csv(archivo_a, index_col=0), pd.read_csv(archivo_t, index_col=0))
    except MicmacError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise MicmacError(f"No se pudieron leer los CSV: {exc}") from exc


def a_excel_bytes(A: pd.DataFrame, T: pd.DataFrame, resultados: Optional[pd.DataFrame] = None) -> bytes:
    """Serializa A, T (y opcionalmente indicadores) a un .xlsx en memoria."""
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        A.to_excel(w, sheet_name="Matriz_A")
        T.to_excel(w, sheet_name="Matriz_T")
        if resultados is not None:
            resultados.to_excel(w, sheet_name="Indicadores")
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# Núcleo matemático
# --------------------------------------------------------------------------- #
def radio_espectral(M: np.ndarray) -> float:
    """Radio espectral ρ(M) = máx |μ_k|."""
    try:
        return float(np.max(np.abs(np.linalg.eigvals(M))))
    except np.linalg.LinAlgError as exc:
        raise MicmacError(f"No se pudieron calcular los valores propios: {exc}") from exc


def matriz_descontada(A: np.ndarray, T: np.ndarray, lam: float) -> np.ndarray:
    """W = A ∘ exp(-λ T) (producto de Hadamard), con diagonal nula."""
    if not (LAMBDA_MIN <= lam <= LAMBDA_MAX):
        raise MicmacError(f"λ debe estar en [{LAMBDA_MIN}, {LAMBDA_MAX}].")
    W = A * np.exp(-lam * T)
    np.fill_diagonal(W, 0.0)
    return W


def operador_katz(W: np.ndarray, alpha: float) -> np.ndarray:
    """Calcula W (I - αW)^-1 resolviendo el sistema lineal (más estable que invertir)."""
    n = W.shape[0]
    M = np.eye(n) - alpha * W
    if np.linalg.cond(M) > 1e12:
        raise MicmacError("La matriz (I - αW) es casi singular; reduzca alpha_ratio.")
    try:
        # X (I-αW) = W  ->  (I-αW)^T X^T = W^T
        return np.linalg.solve(M.T, W.T).T
    except np.linalg.LinAlgError as exc:
        raise MicmacError(f"Matriz singular al propagar el impacto: {exc}") from exc


@dataclass
class Resultado:
    """Contenedor de todos los resultados del motor."""
    variables: List[str]
    A: np.ndarray
    T: np.ndarray
    W: np.ndarray
    rho: float
    alpha: float
    S_bruta: np.ndarray
    S_neta: np.ndarray
    indicadores: pd.DataFrame = field(default_factory=pd.DataFrame)
    advertencias: List[str] = field(default_factory=list)


def calcular(A_df: pd.DataFrame, T_df: pd.DataFrame, lam: float = 0.10, alpha_ratio: float = 0.80) -> Resultado:
    """Ejecuta el pipeline completo del Signed-MICMAC dinámico."""
    if not (0 < alpha_ratio < 1):
        raise MicmacError("alpha_ratio debe estar en el intervalo (0, 1).")
    A_df, T_df = validar_matrices(A_df, T_df)
    names = list(A_df.index)
    A, T = A_df.to_numpy(float), T_df.to_numpy(float)
    n = len(names)
    adv: List[str] = []

    W = matriz_descontada(A, T, lam)
    absW = np.abs(W)
    rho = radio_espectral(absW)
    if rho < EPS:
        if np.any(absW > 0):
            alpha = 1.0
            adv.append("ρ(|W|) = 0: el sistema es acíclico (sin bucles), la serie de rutas es finita y converge para cualquier α; se usa α = 1 (suma exacta de todas las rutas).")
        else:
            alpha = 0.0
            adv.append("No hay impactos efectivos (|W| = 0): no existen cadenas causales que propagar.")
    else:
        alpha = alpha_ratio / rho

    S_bruta = operador_katz(absW, alpha)
    S_neta = operador_katz(W, alpha)

    off = ~np.eye(n, dtype=bool)
    absA = np.abs(A)
    M_clas, D_clas = absA.sum(axis=1), absA.sum(axis=0)
    M_bruta, D_bruta = S_bruta.sum(axis=1), S_bruta.sum(axis=0)
    F = np.diag(S_neta).copy()
    M_neta = np.where(off, np.abs(S_neta), 0).sum(axis=1)
    D_neta = np.where(off, np.abs(S_neta), 0).sum(axis=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        omega = np.where(M_bruta > EPS, (1 - M_neta / M_bruta) * 100.0, 0.0)
    omega = np.clip(omega, 0.0, 100.0)

    ind = pd.DataFrame({
        "Motricidad clásica": M_clas, "Dependencia clásica": D_clas,
        "Motricidad bruta": M_bruta, "Dependencia bruta": D_bruta,
        "Motricidad neta": M_neta, "Dependencia neta": D_neta,
        "Bucle propio (F)": F, "Ambigüedad Ω (%)": omega,
    }, index=names)
    ind.index.name = "Variable"
    return Resultado(names, A, T, W, rho, alpha, S_bruta, S_neta, ind, adv)


# --------------------------------------------------------------------------- #
# Interpretación prospectiva
# --------------------------------------------------------------------------- #
def umbrales(ind: pd.DataFrame, criterio: str = "media") -> Tuple[float, float]:
    """Umbrales (dependencia, motricidad) netos que dividen el plano."""
    f = np.mean if criterio == "media" else np.median
    return float(f(ind["Dependencia neta"])), float(f(ind["Motricidad neta"]))


def cuadrante(d: float, m: float, ud: float, um: float) -> str:
    if m >= um:
        return "Variable de enlace / reto" if d >= ud else "Variable motriz / de entrada"
    return "Variable dependiente / de resultado" if d >= ud else "Variable autónoma"


def clasificar(ind: pd.DataFrame, criterio: str = "media", omega_trampa: float = 30.0) -> pd.DataFrame:
    """Añade cuadrante, rangos, trampas de política y roles diagnósticos."""
    out = ind.copy()
    ud, um = umbrales(out, criterio)
    out["Cuadrante"] = [cuadrante(d, m, ud, um) for d, m in zip(out["Dependencia neta"], out["Motricidad neta"])]
    out["Rango clásico"] = out["Motricidad clásica"].rank(ascending=False, method="min").astype(int)
    out["Rango dinámico"] = out["Motricidad neta"].rank(ascending=False, method="min").astype(int)
    out["Cambio de rango"] = out["Rango clásico"] - out["Rango dinámico"]  # + = sube en el modelo dinámico
    med_clas = out["Motricidad clásica"].median()
    out["Trampa de política"] = (out["Motricidad clásica"] >= med_clas) & (out["Ambigüedad Ω (%)"] > omega_trampa)

    q1_f, q3_f = out["Bucle propio (F)"].quantile([0.25, 0.75])
    med_mn, med_om = out["Motricidad neta"].median(), out["Ambigüedad Ω (%)"].median()
    med_mb, q3_om = out["Motricidad bruta"].median(), out["Ambigüedad Ω (%)"].quantile(0.75)

    roles: List[str] = []
    for _, r in out.iterrows():
        tags: List[str] = []
        if r["Motricidad neta"] >= med_mn and r["Ambigüedad Ω (%)"] <= med_om:
            tags.append("Palanca maestra consistente")
        if r["Motricidad bruta"] >= med_mb and r["Ambigüedad Ω (%)"] >= q3_om:
            tags.append("Falsa variable clave (espejismo)")
        if r["Bucle propio (F)"] < 0 and r["Bucle propio (F)"] <= q1_f:
            tags.append("Estabilizador homeostático")
        if r["Bucle propio (F)"] > 0 and r["Bucle propio (F)"] >= q3_f:
            tags.append("Nodo de efecto bola de nieve")
        roles.append("; ".join(tags) if tags else "Sin rol destacado")
    out["Diagnóstico"] = roles
    return out


def red_indirecta(res: Resultado, umbral: float) -> pd.DataFrame:
    """Flujos netos indirectos (S_neta - W), fuera de la diagonal, con |valor| ≥ umbral."""
    Z = res.S_neta - res.W
    filas = []
    for i, o in enumerate(res.variables):
        for j, d in enumerate(res.variables):
            if i != j and abs(Z[i, j]) >= umbral:
                filas.append((o, d, float(Z[i, j])))
    return pd.DataFrame(filas, columns=["Origen", "Destino", "Flujo neto indirecto"])
