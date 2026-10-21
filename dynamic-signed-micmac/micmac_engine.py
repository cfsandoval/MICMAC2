"""
micmac_engine.py
================
Motor matemático de "Dynamic Signed-MICMAC Studio".

Supera tres limitaciones del MICMAC clásico (Godet):
  1. Convergencia trivial (Perron-Frobenius) al elevar la matriz a la potencia k:
     se reemplaza por el operador convergente de Katz-Bonacich / inversa de Leontief.
  2. Ausencia de polaridad: se trabaja con impactos con signo en [-3, 3].
  3. Ausencia de fricción temporal: cada impacto se descuenta con exp(-lambda * t_ij).

Incorpora la base existente del sistema (Transformación Digital Educativa / 9 variables)
y la serialización multi-hoja a Excel con todas las matrices intermedias, indicadores y diagnósticos.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Dict, List, Optional, Tuple

import numpy as np
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
import pandas as pd

LAMBDA_MIN, LAMBDA_MAX = 0.01, 0.50
ALPHA_RATIO_MIN, ALPHA_RATIO_MAX = 0.01, 0.99
EPS = 1e-12


class MicmacError(ValueError):
    """Error de validación o de cálculo matemático controlado."""


# --------------------------------------------------------------------------- #
# Base original del proyecto (Transformación Digital Educativa - 9 variables)
# --------------------------------------------------------------------------- #
BASE_VARIABLES_INFO: List[Tuple[str, str, str, float]] = [
    ("LID", "Liderazgo directivo", "Capacidad de la dirección de fijar prioridades, patrocinar proyectos y comunicar el rumbo.", 60.0),
    ("INV", "Inversión y presupuesto", "Recursos económicos disponibles para tecnología, formación y mantenimiento.", 50.0),
    ("INF", "Infraestructura tecnológica", "Plataformas, conectividad, equipos y soporte técnico.", 45.0),
    ("COM", "Competencias docentes", "Dominio pedagógico y digital del cuerpo docente.", 40.0),
    ("CUL", "Cultura de innovación", "Disposición colectiva a experimentar, compartir y aprender de errores.", 40.0),
    ("EXP", "Experiencia estudiantil", "Calidad percibida del aprendizaje y de los servicios.", 50.0),
    ("RES", "Resistencia al cambio", "Oposición activa o pasiva a nuevas formas de trabajo.", 60.0),
    ("RET", "Retención estudiantil", "Proporción de estudiantes que continúan sus estudios.", 55.0),
    ("NOR", "Normativa y acreditación", "Exigencias externas de calidad y regulación (variable exógena).", 50.0),
]

# Cruces originales con polaridad, retardos temporales estimados y justificaciones
BASE_LINKS: List[Tuple[str, str, float, float, str, str, str]] = [
    ("LID", "INV", 3.0, 1.0,
     "Teoría de agencia / poder de asignación: quien decide prioridades controla el flujo de recursos. Relación directa e inmediata.",
     "Los proyectos con patrocinio directivo explícito se financian primero; los demás quedan en lista de espera.",
     "% del presupuesto de TI aprobado a proyectos con patrocinador directivo"),

    ("LID", "CUL", 3.0, 2.0,
     "Los líderes modelan valores: la cultura es en gran parte el comportamiento que la dirección premia o tolera (Schein).",
     "Instituciones donde la dirección participa en pilotos muestran mayor iniciativa docente espontánea.",
     "N.º de iniciativas docentes nuevas por semestre"),

    ("LID", "RES", -2.0, 1.5,
     "Gestión del cambio (Kotter): una visión clara y urgencia comunicada reduce la resistencia, pero no la elimina.",
     "Cuando el rector explica el propósito en claustros docentes, bajan las objeciones formales.",
     "Encuesta de aceptación del cambio (escala 1-5)"),

    ("LID", "COM", 2.0, 2.0,
     "La dirección prioriza tiempo y programas de formación; el efecto depende del presupuesto y la cultura.",
     "Se asignan horas de descarga para capacitación solo si la dirección lo define en el plan anual.",
     "Horas de formación docente por año"),

    ("INV", "INF", 3.0, 1.0,
     "Función de producción: la infraestructura es capital que solo se crea o mantiene con inversión directa.",
     "Sin partida de renovación, la conectividad y equipos envejecen; con ella, el tiempo de caída de servicios disminuye.",
     "Disponibilidad de plataforma (%) vs. inversión anual"),

    ("INV", "COM", 2.0, 2.0,
     "Capital humano: la inversión financia cursos, licencias y asesoría pedagógica.",
     "Presupuestos de formación mayores se asocian a más docentes certificados con retorno rezagado.",
     "% de docentes certificados en competencias digitales"),

    ("INV", "EXP", 1.0, 1.5,
     "Efecto indirecto: el dinero mejora la experiencia solo mediante infraestructura y docentes.",
     "Mejoras de servicios menores (wifi en zonas comunes, biblioteca digital) tienen impacto visible pero acotado.",
     "Satisfacción con servicios tecnológicos (encuesta)"),

    ("INF", "EXP", 3.0, 0.5,
     "Calidad de servicio: disponibilidad y usabilidad de plataformas condiciona directamente el acceso al aprendizaje.",
     "Caídas del aula virtual en exámenes generan reclamos inmediatos y caída en la satisfacción.",
     "Incidentes de plataforma y NPS estudiantil"),

    ("INF", "COM", 1.0, 1.5,
     "Facilita la práctica: sin herramientas no se desarrollan competencias, aunque por sí solas no las generan.",
     "Docentes con buen equipamiento usan más recursos digitales; el salto de calidad depende de la formación.",
     "Uso semanal de la plataforma por docente"),

    ("INF", "RET", 1.0, 2.0,
     "Efecto indirecto: la infraestructura evita deserción por barreras de acceso técnico, en especial virtual.",
     "Estudiantes sin conectividad o plataforma estable abandonan con más frecuencia en modalidades híbridas.",
     "Deserción en programas virtuales vs. presenciales"),

    ("INF", "CUL", 1.0, 2.5,
     "Las herramientas habilitan prácticas colaborativas, pero la cultura depende de las dinámicas colectivas.",
     "Espacios y plataformas de co-creación aumentan la colaboración si existen incentivos institucionales.",
     "N.º de proyectos interdisciplinarios activos"),

    ("COM", "EXP", 3.0, 1.0,
     "El docente es el principal mediador de la experiencia de aprendizaje (efecto directo, fuerte y poco sustituible).",
     "Cursos con docentes formados en diseño instruccional y pedagogía activa obtienen mejores evaluaciones estudiantiles.",
     "Evaluación docente por parte de los estudiantes"),

    ("COM", "CUL", 2.0, 2.0,
     "Docentes competentes y seguros comparten prácticas y se convierten en referentes que difunden la innovación.",
     "Comunidades de práctica espontáneas surgen donde existen docentes líderes con dominio técnico pedagógico.",
     "Participación docente en comunidades de práctica"),

    ("COM", "RES", -2.0, 1.5,
     "La resistencia nace en parte de la inseguridad; mayor dominio reduce el temor a nuevas herramientas (autoeficacia, Bandura).",
     "Tras talleres prácticos de acompañamiento, disminuye el rechazo declarado a emplear nuevas plataformas.",
     "Reportes de rechazo / solicitudes de excepción tecnológica"),

    ("CUL", "COM", 2.0, 2.0,
     "Una cultura de aprendizaje impulsa la autoformación y el intercambio entre pares de forma voluntaria.",
     "En unidades académicas con clima colaborativo, los docentes asisten a formación sin obligatoriedad.",
     "Cursos tomados voluntariamente por el claustro"),

    ("CUL", "RES", -3.0, 2.0,
     "La resistencia es un fenómeno cultural; una cultura que valora experimentar la neutraliza de forma profunda.",
     "Equipos con tradición de proyectos piloto adoptan cambios tecnológicos con menor fricción y dilación.",
     "Tiempo promedio de adopción de nuevas herramientas"),

    ("CUL", "EXP", 1.0, 1.5,
     "La cultura enriquece la experiencia indirectamente mediante metodologías docentes innovadoras.",
     "Innovaciones locales en el aula aparecen en diversas asignaturas enriqueciendo el aprendizaje.",
     "Cursos con innovación curricular documentada"),

    ("EXP", "RET", 3.0, 1.0,
     "Teoría de integración de Tinto: la satisfacción y el compromiso académico son el predictor directo de permanencia.",
     "Los programas académicos con mayor satisfacción estudiantil presentan menor abandono semestral.",
     "Tasa de retención semestral vs. satisfacción estudiantil"),

    ("EXP", "LID", 1.0, 3.0,
     "Retroalimentación: la satisfacción estudiantil refuerza o desgasta la legitimidad y respaldo del liderazgo rectoral.",
     "Resultados positivos en encuestas institucionales son empleados para ratificar la gestión rectoral.",
     "Menciones de resultados estudiantiles en informes de gestión"),

    ("RET", "INV", 2.0, 1.5,
     "Modelo de ingresos por matrícula: una menor deserción libera flujo de caja recurrente para reinversión institucional.",
     "Ciclos con menor deserción aumentan la recaudación disponible para presupuesto operativo del siguiente año.",
     "Ingresos netos por matrícula asignados a reinversión"),

    ("RET", "LID", 1.0, 2.0,
     "La retención es un indicador de impacto que condiciona el respaldo del consejo directivo a la rectoría.",
     "Caídas severas en retención motivan revisiones prioritarias del consejo hacia el plan directivo.",
     "Acuerdos del consejo directivo vinculados a retención"),

    ("RES", "COM", -2.0, 1.0,
     "La resistencia activa o pasiva bloquea la participación en capacitación y retrasa la adopción de competencias.",
     "Docentes en resistencia formal no asisten a programas de formación aun cuando se ofrecen con descarga horaria.",
     "Tasa de inasistencia o deserción en capacitaciones"),

    ("RES", "CUL", -2.0, 1.5,
     "Los opositores activos desalientan a sus pares y erosionan el clima de confianza para experimentar (contagio social).",
     "Comentarios escépticos y cuestionamientos recurrentes en claustros frenan la expansión de pilotos.",
     "Proyectos piloto suspendidos por oposición interna"),

    ("RES", "INF", -1.0, 1.0,
     "Retrasa la adopción de herramientas tecnológicas adquiridas (subutilización de licencias e infraestructura).",
     "Sistemas o plataformas contratadas exhiben baja tasa de activación o rechazo al uso regular.",
     "Tasa de subutilización de licencias de plataforma"),

    ("NOR", "LID", 1.0, 3.0,
     "Isomorfismo coercitivo institucional: las normativas y requerimientos del ministerio orientan la agenda directiva.",
     "Tras procesos de acreditación se incorporan metas de transformación digital en el plan rectoral.",
     "Objetivos del plan rectoral derivados de acreditación"),

    ("NOR", "INV", 1.0, 2.0,
     "Exigencias externas de acreditación justifican rubros presupuestarios específicos de cumplimiento.",
     "Se abren partidas prioritarias para subsanar observaciones de pares evaluadores.",
     "Partidas presupuestarias asignadas a cumplimiento normativo"),

    ("NOR", "CUL", 1.0, 3.0,
     "Los estándares normativos de calidad promueven prácticas regulares que con el tiempo se asimilan en la cultura.",
     "Rutinas de autoevaluación continua se mantienen vivas aun fuera de ventanas de auditoría.",
     "Unidades con ciclos de autoevaluación activos"),
]

DEMO_VARIABLES: List[str] = [f"{code} · {name}" for code, name, _, _ in BASE_VARIABLES_INFO]
DEMO_DESCRIPCIONES: Dict[str, str] = {
    f"{code} · {name}": desc for code, name, desc, _ in BASE_VARIABLES_INFO
}


def demo_matrices() -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Devuelve (A, T) del sistema base como DataFrames n×n con nombres descriptivos."""
    n = len(DEMO_VARIABLES)
    code_to_name = {code: f"{code} · {name}" for code, name, _, _ in BASE_VARIABLES_INFO}
    A = pd.DataFrame(np.zeros((n, n)), index=DEMO_VARIABLES, columns=DEMO_VARIABLES)
    T = A.copy()
    for o, d, v, t, _, _, _ in BASE_LINKS:
        o_name = code_to_name[o]
        d_name = code_to_name[d]
        A.loc[o_name, d_name] = v
        T.loc[o_name, d_name] = t
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
    t[a == 0] = 0.0
    np.fill_diagonal(t, 0.0)
    return pd.DataFrame(a, index=names, columns=names), pd.DataFrame(t, index=names, columns=names)


def leer_excel(archivo) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Lee un .xlsx con hojas 'Matriz_A' (o '4_Matriz_A_Polaridad') y 'Matriz_T'."""
    try:
        xl = pd.ExcelFile(archivo)
        sheet_a = next((s for s in xl.sheet_names if "matriz_a" in s.lower()), None)
        sheet_t = next((s for s in xl.sheet_names if "matriz_t" in s.lower()), None)
        if not sheet_a or not sheet_t:
            raise MicmacError(f"Hojas requeridas no encontradas. Hojas presentes: {xl.sheet_names}")
        df_a = pd.read_excel(xl, sheet_name=sheet_a, index_col=0)
        df_t = pd.read_excel(xl, sheet_name=sheet_t, index_col=0)
    except Exception as exc:
        raise MicmacError(f"No se pudo leer el archivo Excel: {exc}") from exc
    return validar_matrices(df_a, df_t)


def leer_csv(archivo_a, archivo_t) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Lee dos CSV (A y T) con la primera columna como nombre de variable."""
    try:
        return validar_matrices(pd.read_csv(archivo_a, index_col=0), pd.read_csv(archivo_t, index_col=0))
    except MicmacError:
        raise
    except Exception as exc:
        raise MicmacError(f"No se pudieron leer los CSV: {exc}") from exc


# --------------------------------------------------------------------------- #
# Núcleo matemático (Katz-Bonacich / Leontief convergente)
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
    """Calcula W (I - αW)^-1 resolviendo el sistema lineal."""
    n = W.shape[0]
    M = np.eye(n) - alpha * W
    if np.linalg.cond(M) > 1e12:
        raise MicmacError("La matriz (I - αW) es casi singular; reduzca alpha_ratio.")
    try:
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
            adv.append("ρ(|W|) = 0: sistema acíclico; la serie finita converge exactamente con α = 1.")
        else:
            alpha = 0.0
            adv.append("No hay impactos efectivos (|W| = 0): no existen cadenas causales.")
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
        omega = np.where(M_bruta > EPS, (1.0 - M_neta / M_bruta) * 100.0, 0.0)
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
# Interpretación y clasificación prospectiva
# --------------------------------------------------------------------------- #
def umbrales(ind: pd.DataFrame, criterio: str = "media") -> Tuple[float, float]:
    f = np.mean if criterio == "media" else np.median
    return float(f(ind["Dependencia neta"])), float(f(ind["Motricidad neta"]))


def cuadrante(d: float, m: float, ud: float, um: float) -> str:
    if m >= um:
        return "Variable de enlace / reto" if d >= ud else "Variable motriz / de entrada"
    return "Variable dependiente / de resultado" if d >= ud else "Variable autónoma"


def clasificar(ind: pd.DataFrame, criterio: str = "media", omega_trampa: float = 30.0) -> pd.DataFrame:
    """Añade cuadrantes, rangos, trampas de política y roles estratégicos."""
    out = ind.copy()
    ud, um = umbrales(out, criterio)
    out["Cuadrante"] = [cuadrante(d, m, ud, um) for d, m in zip(out["Dependencia neta"], out["Motricidad neta"])]
    out["Rango clásico"] = out["Motricidad clásica"].rank(ascending=False, method="min").astype(int)
    out["Rango dinámico"] = out["Motricidad neta"].rank(ascending=False, method="min").astype(int)
    out["Cambio de rango"] = out["Rango clásico"] - out["Rango dinámico"]
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
        roles.append("; ".join(tags) if tags else "Variable de evolución regular")
    out["Diagnóstico"] = roles
    return out


def red_indirecta(res: Resultado, umbral: float) -> pd.DataFrame:
    Z = res.S_neta - res.W
    filas = []
    for i, o in enumerate(res.variables):
        for j, d in enumerate(res.variables):
            if i != j and abs(Z[i, j]) >= umbral:
                filas.append((o, d, float(Z[i, j])))
    return pd.DataFrame(filas, columns=["Origen", "Destino", "Flujo neto indirecto"])


# --------------------------------------------------------------------------- #
# Exportador a Excel Multi-Hoja (Base original + Hojas de nuevos análisis)
# --------------------------------------------------------------------------- #
def crear_libro_excel_completo(
    A_df: pd.DataFrame,
    T_df: pd.DataFrame,
    res: Resultado,
    c_df: pd.DataFrame,
    lam: float = 0.10,
    alpha_ratio: float = 0.80,
) -> openpyxl.Workbook:
    """Crea un libro Excel (.xlsx) estructurado y estilizado profesionalmente."""
    wb = openpyxl.Workbook()
    # Eliminar hoja por defecto al finalizar
    hoja_default = wb.active

    # Paleta de estilos ejecutivos
    font_title = Font(name="Calibri", size=14, bold=True, color="1E293B")
    font_subtitle = Font(name="Calibri", size=10, italic=True, color="64748B")
    font_hdr = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_body = Font(name="Calibri", size=11, color="0F172A")
    font_bold = Font(name="Calibri", size=11, bold=True, color="0F172A")
    
    fill_hdr_base = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Azul marino para base
    fill_hdr_analisis = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")  # Verde azulado para análisis
    fill_hdr_diag = PatternFill(start_color="4338CA", end_color="4338CA", fill_type="solid")  # Índigo para diagnóstico
    fill_tot = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    fill_diag_cell = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    thin_border_side = Side(border_style="thin", color="CBD5E1")
    border_cell = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    def auto_ancho(ws):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or "")
                # Ignorar encabezados de títulos largos fusionados
                if cell.row in (1, 2) and len(val_str) > 30:
                    continue
                max_len = max(max_len, len(val_str))
            ws.column_dimensions[col_letter].width = max(max_len + 3, 11)

    # ---------------------------------------------------------
    # HOJA 1: Base_Variables
    # ---------------------------------------------------------
    ws1 = wb.create_sheet(title="1_Base_Variables")
    ws1.views.sheetView[0].showGridLines = True
    ws1.cell(row=1, column=1, value="BASE ORIGINAL · VARIABLES DEL SISTEMA").font = font_title
    ws1.cell(row=2, column=1, value="Definición institucional, mecanismo conceptual y valor basal inicial (x₀)").font = font_subtitle
    
    headers1 = ["Código", "Nombre de la Variable", "Definición y Alcance Conceptual", "Valor Inicial (x₀)"]
    for col_idx, h in enumerate(headers1, start=1):
        c = ws1.cell(row=4, column=col_idx, value=h)
        c.font, c.fill, c.alignment = font_hdr, fill_hdr_base, align_center
    
    row_idx = 5
    for code, name, desc, x0 in BASE_VARIABLES_INFO:
        ws1.cell(row=row_idx, column=1, value=code).alignment = align_center
        ws1.cell(row=row_idx, column=2, value=name).font = font_bold
        ws1.cell(row=row_idx, column=3, value=desc).alignment = align_left
        c_x0 = ws1.cell(row=row_idx, column=4, value=x0)
        c_x0.alignment = align_right
        c_x0.number_format = "#,##0"
        for col_idx in range(1, 5):
            ws1.cell(row=row_idx, column=col_idx).border = border_cell
        row_idx += 1
    auto_ancho(ws1)

    # ---------------------------------------------------------
    # HOJA 2: Base_Matriz_Directa
    # ---------------------------------------------------------
    ws2 = wb.create_sheet(title="2_Base_Matriz_Directa")
    ws2.views.sheetView[0].showGridLines = True
    ws2.cell(row=1, column=1, value="BASE ORIGINAL · MATRIZ DE INFLUENCIAS DIRECTAS").font = font_title
    ws2.cell(row=2, column=1, value="Lectura Fila → Columna. Signo (+ refuerzo, - inhibición). Sumas en valor absoluto |A|.").font = font_subtitle

    vars_names = list(A_df.index)
    ws2.cell(row=4, column=1, value="Variable (Fila \\ Col)").font = font_hdr
    ws2.cell(row=4, column=1).fill = fill_hdr_base
    ws2.cell(row=4, column=1).alignment = align_center
    for j, v_col in enumerate(vars_names, start=2):
        c = ws2.cell(row=4, column=j, value=v_col)
        c.font, c.fill, c.alignment = font_hdr, fill_hdr_base, align_center
    c_tot = ws2.cell(row=4, column=len(vars_names) + 2, value="Σ Influencia")
    c_tot.font, c_tot.fill, c_tot.alignment = font_hdr, fill_hdr_base, align_center

    a_mat = A_df.to_numpy(float)
    abs_a = np.abs(a_mat)
    for i, v_row in enumerate(vars_names):
        r_num = 5 + i
        ws2.cell(row=r_num, column=1, value=v_row).font = font_bold
        ws2.cell(row=r_num, column=1).border = border_cell
        for j in range(len(vars_names)):
            c = ws2.cell(row=r_num, column=2 + j)
            c.border = border_cell
            c.alignment = align_center
            if i == j:
                c.fill = fill_diag_cell
                c.value = "—"
            else:
                val = a_mat[i, j]
                c.value = int(val) if val == int(val) else val
                if val > 0:
                    c.font = Font(name="Calibri", size=11, bold=True, color="1D4ED8")
                elif val < 0:
                    c.font = Font(name="Calibri", size=11, bold=True, color="B91C1C")
        tot_c = ws2.cell(row=r_num, column=len(vars_names) + 2, value=float(abs_a[i].sum()))
        tot_c.font, tot_c.fill, tot_c.alignment, tot_c.border = font_bold, fill_tot, align_right, border_cell

    tot_r_num = 5 + len(vars_names)
    ws2.cell(row=tot_r_num, column=1, value="Σ Dependencia").font = font_bold
    ws2.cell(row=tot_r_num, column=1).fill = fill_tot
    ws2.cell(row=tot_r_num, column=1).border = border_cell
    for j in range(len(vars_names)):
        c = ws2.cell(row=tot_r_num, column=2 + j, value=float(abs_a[:, j].sum()))
        c.font, c.fill, c.alignment, c.border = font_bold, fill_tot, align_right, border_cell
    auto_ancho(ws2)

    # ---------------------------------------------------------
    # HOJA 3: Base_Justificaciones
    # ---------------------------------------------------------
    ws3 = wb.create_sheet(title="3_Base_Justificaciones")
    ws3.views.sheetView[0].showGridLines = True
    ws3.cell(row=1, column=1, value="BASE ORIGINAL · JUSTIFICACIÓN CONCEPTUAL Y EVIDENCIA PRÁCTICA").font = font_title
    ws3.cell(row=2, column=1, value="Sustento de cada relación causal: mecanismo teórico, evidencia observable e indicador cuantitativo").font = font_subtitle

    headers3 = ["Origen", "Destino", "Impacto (A)", "Retardo T (años)", "Mecanismo Causal Conceptual", "Evidencia Práctica Observable", "Indicador Sugerido"]
    for col_idx, h in enumerate(headers3, start=1):
        c = ws3.cell(row=4, column=col_idx, value=h)
        c.font, c.fill, c.alignment = font_hdr, fill_hdr_base, align_center

    row_idx = 5
    for o, d, v, t, conc, evid, ind_s in BASE_LINKS:
        ws3.cell(row=row_idx, column=1, value=o).alignment = align_center
        ws3.cell(row=row_idx, column=2, value=d).alignment = align_center
        c_v = ws3.cell(row=row_idx, column=3, value=v)
        c_v.alignment = align_center
        c_v.font = Font(name="Calibri", size=11, bold=True, color="1D4ED8" if v > 0 else "B91C1C")
        c_t = ws3.cell(row=row_idx, column=4, value=t)
        c_t.alignment = align_right
        c_t.number_format = "0.0"
        ws3.cell(row=row_idx, column=5, value=conc).alignment = align_left
        ws3.cell(row=row_idx, column=6, value=evid).alignment = align_left
        ws3.cell(row=row_idx, column=7, value=ind_s).alignment = align_left
        for col_idx in range(1, 8):
            ws3.cell(row=row_idx, column=col_idx).border = border_cell
        row_idx += 1
    auto_ancho(ws3)

    # ---------------------------------------------------------
    # HOJAS DE NUEVOS ANÁLISIS: Matrices Matemáticas
    # ---------------------------------------------------------
    def agregar_hoja_matriz(titulo_hoja, titulo_banner, desc_banner, df_matrix, fmt="0.00", color_cond=False):
        ws = wb.create_sheet(title=titulo_hoja)
        ws.views.sheetView[0].showGridLines = True
        ws.cell(row=1, column=1, value=titulo_banner).font = font_title
        ws.cell(row=2, column=1, value=desc_banner).font = font_subtitle
        
        ws.cell(row=4, column=1, value="Variable").font = font_hdr
        ws.cell(row=4, column=1).fill = fill_hdr_analisis
        ws.cell(row=4, column=1).alignment = align_center

        cols = list(df_matrix.columns)
        for j, col_name in enumerate(cols, start=2):
            c = ws.cell(row=4, column=j, value=col_name)
            c.font, c.fill, c.alignment = font_hdr, fill_hdr_analisis, align_center
        
        m_vals = df_matrix.to_numpy(float)
        for i, row_name in enumerate(df_matrix.index):
            r_num = 5 + i
            ws.cell(row=r_num, column=1, value=row_name).font = font_bold
            ws.cell(row=r_num, column=1).border = border_cell
            for j in range(len(cols)):
                c = ws.cell(row=r_num, column=2 + j)
                c.border = border_cell
                c.alignment = align_right
                val = m_vals[i, j]
                c.value = float(val)
                c.number_format = fmt
                if i == j:
                    c.fill = fill_diag_cell
                    if abs(val) < 1e-9:
                        c.value = "—"
                        c.alignment = align_center
                elif color_cond:
                    if val > 0.05:
                        c.font = Font(name="Calibri", size=11, bold=True, color="047857")
                    elif val < -0.05:
                        c.font = Font(name="Calibri", size=11, bold=True, color="BE123C")
        auto_ancho(ws)

    # 4. Matriz A
    agregar_hoja_matriz(
        "4_Matriz_A_Polaridad",
        "NUEVO ANÁLISIS · MATRIZ A (INTENSIDAD Y POLARIDAD)",
        "Impactos causales con polaridad fijada en escala [-3, 3]. Diagonal principal nula.",
        A_df, fmt="0", color_cond=True
    )

    # 5. Matriz T
    agregar_hoja_matriz(
        "5_Matriz_T_Retardos",
        "NUEVO ANÁLISIS · MATRIZ T (RETARDOS TEMPORALES)",
        "Retardo estimado en años (t_ij) para la materialización del impacto causal.",
        T_df, fmt="0.0"
    )

    # 6. Matriz W
    W_df = pd.DataFrame(res.W, index=res.variables, columns=res.variables)
    agregar_hoja_matriz(
        "6_Matriz_W_Efectiva",
        f"NUEVO ANÁLISIS · MATRIZ W DESCONTADA (λ = {lam:.2f})",
        "Impacto efectivo descontado por fricción temporal: w_ij = a_ij · exp(-λ · t_ij).",
        W_df, fmt="0.000", color_cond=True
    )

    # 7. Matriz S_Bruta
    S_bruta_df = pd.DataFrame(res.S_bruta, index=res.variables, columns=res.variables)
    agregar_hoja_matriz(
        "7_Matriz_S_Bruta_Leontief",
        f"NUEVO ANÁLISIS · MATRIZ S^bruta (OPERADOR KATZ-BONACICH, α = {res.alpha:.4f})",
        "S^bruta = |W|(I - α|W|)⁻¹. Acumulación convergente de todas las cadenas causales indirectas infinitas.",
        S_bruta_df, fmt="0.000"
    )

    # 8. Matriz S_Neta
    S_neta_df = pd.DataFrame(res.S_neta, index=res.variables, columns=res.variables)
    agregar_hoja_matriz(
        "8_Matriz_S_Neta_Leontief",
        f"NUEVO ANÁLISIS · MATRIZ S^neta (CONSIGNO Y RETROALIMENTACIÓN)",
        "S^neta = W(I - αW)⁻¹. Efectos netos considerando refuerzos e inhibiciones. Diagonal = Bucle propio F_i.",
        S_neta_df, fmt="0.000", color_cond=True
    )

    # ---------------------------------------------------------
    # HOJA 9: Flujos Netos Indirectos
    # ---------------------------------------------------------
    ws9 = wb.create_sheet(title="9_Flujos_Netos_Indirectos")
    ws9.views.sheetView[0].showGridLines = True
    ws9.cell(row=1, column=1, value="NUEVO ANÁLISIS · MATRIZ DE FLUJOS NETOS INDIRECTOS (S^neta - W)").font = font_title
    ws9.cell(row=2, column=1, value="Aísla el efecto transmitido exclusivamente a través de bucles y mediaciones indirectas.").font = font_subtitle

    Z = res.S_neta - res.W
    Z_df = pd.DataFrame(Z, index=res.variables, columns=res.variables)
    
    ws9.cell(row=4, column=1, value="Variable").font = font_hdr
    ws9.cell(row=4, column=1).fill = fill_hdr_analisis
    ws9.cell(row=4, column=1).alignment = align_center
    for j, col_name in enumerate(res.variables, start=2):
        c = ws9.cell(row=4, column=j, value=col_name)
        c.font, c.fill, c.alignment = font_hdr, fill_hdr_analisis, align_center
    
    for i, row_name in enumerate(res.variables):
        r_num = 5 + i
        ws9.cell(row=r_num, column=1, value=row_name).font = font_bold
        ws9.cell(row=r_num, column=1).border = border_cell
        for j in range(len(res.variables)):
            c = ws9.cell(row=r_num, column=2 + j)
            c.border = border_cell
            c.alignment = align_right
            val = Z[i, j]
            c.value = float(val)
            c.number_format = "0.000"
            if i == j:
                c.fill = fill_diag_cell
            elif val > 0.05:
                c.font = Font(name="Calibri", size=11, bold=True, color="047857")
            elif val < -0.05:
                c.font = Font(name="Calibri", size=11, bold=True, color="BE123C")

    # Tabla resumen de vínculos indirectos más intensos
    r_tab = 5 + len(res.variables) + 2
    ws9.cell(row=r_tab, column=1, value="RANKING DE CADENAS INDIRECTAS MÁS SIGNIFICATIVAS (|Flujo| ≥ 0.05)").font = font_bold
    ws9.cell(row=r_tab + 1, column=1, value="Origen").font = font_hdr; ws9.cell(row=r_tab + 1, column=1).fill = fill_hdr_analisis
    ws9.cell(row=r_tab + 1, column=2, value="Destino").font = font_hdr; ws9.cell(row=r_tab + 1, column=2).fill = fill_hdr_analisis
    ws9.cell(row=r_tab + 1, column=3, value="Flujo Neto Indirecto").font = font_hdr; ws9.cell(row=r_tab + 1, column=3).fill = fill_hdr_analisis
    ws9.cell(row=r_tab + 1, column=4, value="Naturaleza Sistémica").font = font_hdr; ws9.cell(row=r_tab + 1, column=4).fill = fill_hdr_analisis

    ranking_flujos = []
    for i, o_v in enumerate(res.variables):
        for j, d_v in enumerate(res.variables):
            if i != j and abs(Z[i, j]) >= 0.05:
                ranking_flujos.append((o_v, d_v, Z[i, j]))
    ranking_flujos.sort(key=lambda x: abs(x[2]), reverse=True)

    r_row = r_tab + 2
    for o_v, d_v, fl in ranking_flujos:
        ws9.cell(row=r_row, column=1, value=o_v).alignment = align_left
        ws9.cell(row=r_row, column=2, value=d_v).alignment = align_left
        c_fl = ws9.cell(row=r_row, column=3, value=float(fl))
        c_fl.alignment = align_right
        c_fl.number_format = "0.000"
        c_fl.font = Font(name="Calibri", size=11, bold=True, color="047857" if fl > 0 else "BE123C")
        nat = "Impulso / Refuerzo indirecto (+)" if fl > 0 else "Freno / Inhibición indirecta (-)"
        ws9.cell(row=r_row, column=4, value=nat).alignment = align_left
        for col_k in range(1, 5):
            ws9.cell(row=r_row, column=col_k).border = border_cell
        r_row += 1
    auto_ancho(ws9)

    # ---------------------------------------------------------
    # HOJA 10: Indicadores_4D
    # ---------------------------------------------------------
    ws10 = wb.create_sheet(title="10_Indicadores_4D")
    ws10.views.sheetView[0].showGridLines = True
    ws10.cell(row=1, column=1, value="NUEVO ANÁLISIS · TABLERO DE INDICADORES ESTRUCTURALES 4D").font = font_title
    ws10.cell(row=2, column=1, value="Comparación Clásico vs. Dinámico, Índice de Retorno F, Ambigüedad Ω, Trampas de Política y Cuadrantes.").font = font_subtitle

    headers10 = [
        "Variable", "Motricidad Clásica", "Dependencia Clásica", "Rango Clásico",
        "Motricidad Neta", "Dependencia Neta", "Rango Dinámico", "Δ Rango",
        "Bucle Propio (F)", "Ambigüedad Ω (%)", "Cuadrante Dinámico", "Trampa de Política", "Rol Estratégico Diagnóstico"
    ]
    for col_idx, h in enumerate(headers10, start=1):
        c = ws10.cell(row=4, column=col_idx, value=h)
        c.font, c.fill, c.alignment = font_hdr, fill_hdr_diag, align_center

    row_idx = 5
    for var_name, r in c_df.iterrows():
        ws10.cell(row=row_idx, column=1, value=var_name).font = font_bold
        
        c_mc = ws10.cell(row=row_idx, column=2, value=float(r["Motricidad clásica"]))
        c_mc.alignment, c_mc.number_format = align_right, "0.0"
        c_dc = ws10.cell(row=row_idx, column=3, value=float(r["Dependencia clásica"]))
        c_dc.alignment, c_dc.number_format = align_right, "0.0"
        ws10.cell(row=row_idx, column=4, value=int(r["Rango clásico"])).alignment = align_center

        c_mn = ws10.cell(row=row_idx, column=5, value=float(r["Motricidad neta"]))
        c_mn.alignment, c_mn.number_format = align_right, "0.00"
        c_dn = ws10.cell(row=row_idx, column=6, value=float(r["Dependencia neta"]))
        c_dn.alignment, c_dn.number_format = align_right, "0.00"
        ws10.cell(row=row_idx, column=7, value=int(r["Rango dinámico"])).alignment = align_center
        
        c_dr = ws10.cell(row=row_idx, column=8, value=int(r["Cambio de rango"]))
        c_dr.alignment = align_center
        if r["Cambio de rango"] > 0:
            c_dr.font = Font(name="Calibri", size=11, bold=True, color="047857")
        elif r["Cambio de rango"] < 0:
            c_dr.font = Font(name="Calibri", size=11, bold=True, color="BE123C")

        c_f = ws10.cell(row=row_idx, column=9, value=float(r["Bucle propio (F)"]))
        c_f.alignment, c_f.number_format = align_right, "0.000"
        if r["Bucle propio (F)"] > 0:
            c_f.font = Font(name="Calibri", size=11, bold=True, color="047857")
        elif r["Bucle propio (F)"] < 0:
            c_f.font = Font(name="Calibri", size=11, bold=True, color="BE123C")

        c_om = ws10.cell(row=row_idx, column=10, value=float(r["Ambigüedad Ω (%)"]))
        c_om.alignment, c_om.number_format = align_right, "0.0"
        if r["Ambigüedad Ω (%)"] > 30:
            c_om.font = Font(name="Calibri", size=11, bold=True, color="BE123C")

        ws10.cell(row=row_idx, column=11, value=str(r["Cuadrante"])).alignment = align_left
        
        c_tr = ws10.cell(row=row_idx, column=12, value="⚠ SÍ" if r["Trampa de política"] else "No")
        c_tr.alignment = align_center
        if r["Trampa de política"]:
            c_tr.font = Font(name="Calibri", size=11, bold=True, color="BE123C")
            c_tr.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")

        ws10.cell(row=row_idx, column=13, value=str(r["Diagnóstico"])).alignment = align_left

        for col_idx in range(1, 14):
            ws10.cell(row=row_idx, column=col_idx).border = border_cell
        row_idx += 1
    auto_ancho(ws10)

    # ---------------------------------------------------------
    # HOJA 11: Diagnostico_Prospectivo
    # ---------------------------------------------------------
    ws11 = wb.create_sheet(title="11_Diagnostico_Prospectivo")
    ws11.views.sheetView[0].showGridLines = True
    ws11.cell(row=1, column=1, value="INFORME EJECUTIVO · DIAGNÓSTICO ESTRATÉGICO Y RECOMENDACIONES").font = font_title
    ws11.cell(row=2, column=1, value="Interpretación analítica de la dinámica del sistema para la toma de decisiones").font = font_subtitle

    row_d = 4
    ws11.cell(row=row_d, column=1, value="1. PARÁMETROS DEL MODELO MATEMÁTICO").font = font_bold
    row_d += 1
    params_info = [
        ("Tasa de fricción temporal (λ)", f"{lam:.2f} (Decaimiento exponencial w_ij = a_ij · e^(-λt))"),
        ("Radio espectral de |W| ρ(|W|)", f"{res.rho:.4f}"),
        ("Parámetro de Katz α", f"{res.alpha:.4f} (Garantiza convergencia α · ρ = {alpha_ratio:.2f} < 1)"),
        ("Ambigüedad promedio del sistema Ω", f"{c_df['Ambigüedad Ω (%)'].mean():.1f} %"),
    ]
    for p_name, p_val in params_info:
        ws11.cell(row=row_d, column=1, value=p_name).font = font_bold
        ws11.cell(row=row_d, column=2, value=p_val)
        row_d += 1

    row_d += 1
    ws11.cell(row=row_d, column=1, value="2. CLASIFICACIÓN PROSPECTIVA POR ROLES ESTRATÉGICOS").font = font_bold
    row_d += 1

    palancas = c_df[c_df["Diagnóstico"].str.contains("Palanca maestra", na=False)]
    ws11.cell(row=row_d, column=1, value="• PALANCAS MAESTRAS CONSISTENTES (Alta motricidad neta y baja ambigüedad causal):").font = font_bold
    ws11.cell(row=row_d, column=1).font = Font(name="Calibri", size=11, bold=True, color="047857")
    row_d += 1
    for v_name, r in palancas.iterrows():
        ws11.cell(row=row_d, column=1, value=f"   - {v_name}")
        ws11.cell(row=row_d, column=2, value=f"Motricidad neta: {r['Motricidad neta']:.2f} | Ω: {r['Ambigüedad Ω (%)']:.1f}% | Efecto directo de alta tracción y baja contradicción.")
        row_d += 1
    if len(palancas) == 0:
        ws11.cell(row=row_d, column=1, value="   (Ninguna variable cumple simultáneamente ambos umbrales)")
        row_d += 1

    row_d += 1
    espejismos = c_df[c_df["Diagnóstico"].str.contains("espejismo", na=False)]
    ws11.cell(row=row_d, column=1, value="• FALSAS VARIABLES CLAVE O ESPEJISMOS (Alta motricidad bruta pero severa contradicción Ω):").font = font_bold
    ws11.cell(row=row_d, column=1).font = Font(name="Calibri", size=11, bold=True, color="BE123C")
    row_d += 1
    for v_name, r in espejismos.iterrows():
        ws11.cell(row=row_d, column=1, value=f"   - {v_name}")
        ws11.cell(row=row_d, column=2, value=f"Motricidad bruta: {r['Motricidad bruta']:.2f} | Motricidad neta: {r['Motricidad neta']:.2f} | Ω: {r['Ambigüedad Ω (%)']:.1f}% | Sus efectos se disipan o anulan en bucles opuestos.")
        row_d += 1
    if len(espejismos) == 0:
        ws11.cell(row=row_d, column=1, value="   (No se detectaron variables con condición crítica de espejismo)")
        row_d += 1

    row_d += 1
    bucles_pos = c_df[c_df["Diagnóstico"].str.contains("bola de nieve", na=False)]
    ws11.cell(row=row_d, column=1, value="• NODOS DE EFECTO BOLA DE NIEVE (Bucle propio F > 0 alto: refuerzo expansivo):").font = font_bold
    ws11.cell(row=row_d, column=1).font = Font(name="Calibri", size=11, bold=True, color="1D4ED8")
    row_d += 1
    for v_name, r in bucles_pos.iterrows():
        ws11.cell(row=row_d, column=1, value=f"   - {v_name}")
        ws11.cell(row=row_d, column=2, value=f"Bucle propio F: +{r['Bucle propio (F)']:.3f} | Toda inyección sobre este nodo regresa amplificada al punto de partida.")
        row_d += 1

    row_d += 1
    estabilizadores = c_df[c_df["Diagnóstico"].str.contains("Estabilizador", na=False)]
    ws11.cell(row=row_d, column=1, value="• ESTABILIZADORES HOMEOSTÁTICOS (Bucle propio F < 0: autorregulación y freno):").font = font_bold
    ws11.cell(row=row_d, column=1).font = Font(name="Calibri", size=11, bold=True, color="6B7280")
    row_d += 1
    for v_name, r in estabilizadores.iterrows():
        ws11.cell(row=row_d, column=1, value=f"   - {v_name}")
        ws11.cell(row=row_d, column=2, value=f"Bucle propio F: {r['Bucle propio (F)']:.3f} | Actúa como amortiguador sistémico frenando perturbaciones descontroladas.")
        row_d += 1

    row_d += 2
    ws11.cell(row=row_d, column=1, value="3. DIRECTRICES PARA LA TOMA DE DECISIONES").font = font_bold
    row_d += 1
    directrices = [
        "1. Priorizar inversión y foco directivo en las Palancas Maestras Consistentes, pues garantizan traslación efectiva al resto del sistema sin pérdida por contra-reacciones.",
        "2. Evitar el error clásico de focalizarse en 'Espejismos' basándose únicamente en la suma directa de la matriz Godet, ya que desencadenan respuestas compensatorias de resistencia que neutralizan el esfuerzo.",
        "3. Activar y proteger los nodos de bucle expansivo cuando se busque una transformación acelerada, monitoreando simultáneamente la fatiga y resistencia de los actores involucrados.",
        "4. Evaluar las variables dependientes (Experiencia y Retención) como indicadores de tablero de control y nunca como variables de acción directa."
    ]
    for d_text in directrices:
        ws11.cell(row=row_d, column=1, value=d_text)
        row_d += 1
    auto_ancho(ws11)

    # Eliminar hoja en blanco por defecto
    if hoja_default in wb.worksheets and len(wb.worksheets) > 1:
        wb.remove(hoja_default)

    return wb


def a_excel_bytes(
    A: pd.DataFrame,
    T: pd.DataFrame,
    resultados: Optional[pd.DataFrame] = None,
    lam: float = 0.10,
    alpha_ratio: float = 0.80,
) -> bytes:
    """Serializa la base original y los nuevos análisis a un .xlsx profesional en memoria."""
    # Realizar cálculo si no se proporcionó
    try:
        res = calcular(A, T, lam=lam, alpha_ratio=alpha_ratio)
        c = clasificar(res.indicadores) if resultados is None else resultados
        wb = crear_libro_excel_completo(A, T, res, c, lam=lam, alpha_ratio=alpha_ratio)
        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()
    except Exception:
        # Fallback de emergencia
        buf = BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            A.to_excel(w, sheet_name="Matriz_A")
            T.to_excel(w, sheet_name="Matriz_T")
            if resultados is not None:
                resultados.to_excel(w, sheet_name="Indicadores")
        return buf.getvalue()
