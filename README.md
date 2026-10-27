# Micmac extendido ◈

Aplicación web integral para el **Análisis Estructural Prospectivo (Método MICMAC de Michel Godet)** y el **Modelo Dinámico Convergente 4D (Operador de Katz-Bonacich / Inversa de Leontief)**.

Desarrollada en tecnologías web estándar (HTML5, Vanilla CSS, JavaScript, SVG y SheetJS), **100% optimizada para despliegue estático continuo en Vercel a través de GitHub** (sin servidores Python, sin Streamlit y sin tiempos de compilación).

---

## 🚀 Despliegue en Vercel (vía GitHub)

La aplicación está preconfigurada con [`vercel.json`](./vercel.json) y [`.vercelignore`](./.vercelignore) para conectarse directamente a Vercel:

1. Ingrese a [vercel.com/new](https://vercel.com/new) con su cuenta de GitHub.
2. Seleccione e importe el repositorio **`cfsandoval/MICMAC2`**.
3. **Configuración de Vercel (automática):**
   - **Framework Preset:** `Other`
   - **Root Directory:** `./`
   - **Build Command:** `None` (vacío)
   - **Output Directory:** `./` (vacío)
4. Haga clic en **Deploy**.
5. ¡Listo! Vercel desplegará la aplicación en segundos en una URL global segura `https://micmac2.vercel.app` (o su dominio asignado).

> 🔄 **CI/CD Automático:** Cada `git push` a la rama `main` activará un nuevo despliegue instantáneo en Vercel.

---

## 🧭 Funcionalidades de Micmac Extendido

1. **Variables y Matriz Justificada:**
   - Base de 9 variables de transformación digital con 27 impactos causales justificados conceptual y empíricamente.
   - Escala ordinal $[-3, 3]$ con signo de refuerzo (+) o inhibición (−).
   - Retardos temporales estimados $T$ (años) por cruce.

2. **Plano de Influencia–Dependencia Clásico (Godet):**
   - Análisis directo e indirecto (caminos hasta $k$).
   - Cuadrantes prospectivos de Godet (Variables Motrices/Determinantes, Variables Críticas/Estratégicas o de Enlace, Variables de Resultado/Salida y Variables Autónomas) con umbrales configurables (media, mediana, punto medio).

3. **Simulación Temporal Continua:**
   - Propagación de perturbaciones y políticas externas (impulsos rápidos o intervenciones sostenidas).
   - Acotamiento físico dinámico y trayectorias multivariables.

4. **Signed-MICMAC Dinámico 4D (Katz-Bonacich / Leontief):**
   - Supera la convergencia trivial de Perron-Frobenius elevando matrices a potencia $k$.
   - Fricción temporal $w_{ij} = a_{ij} \cdot e^{-\lambda t_{ij}}$.
   - Propagación sistémica convergente mediante resolvente matricial $(I - \alpha W)^{-1}$.
   - Detección de bucles propios $F_i$ e índice de contradicción/ambigüedad estructural $\Omega_i$.
   - Identificación automática de **Palancas Maestras Consistentes** y **Trampas de Política (Espejismos)**.

5. **Exportación a Excel Multi-Hoja (.xlsx):**
   - Descarga directa del libro estructurado [`analisis_micmac_convergente.xlsx`](./analisis_micmac_convergente.xlsx) con 11 hojas (Base de variables, Justificaciones, Matrices $A$, $T$, $W$, $S^{bruta}$, $S^{neta}$, Flujos Indirectos, Indicadores 4D e Informe Ejecutivo).

---

## 💻 Ejecución Local

Solo necesita abrir [`index.html`](./index.html) en cualquier navegador moderno, o servir la carpeta localmente:

```bash
npx serve .
# o con python:
python -m http.server 3000
```
