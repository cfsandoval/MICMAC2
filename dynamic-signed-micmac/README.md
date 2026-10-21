# Micmac extendido 🧭

Aplicación modular interactiva en Python (`Streamlit`, `NumPy`, `Pandas`, `SciPy`, `Plotly`, `NetworkX`) para el **análisis estructural prospectivo avanzado**.

Supera las tres limitaciones del método MICMAC clásico de Michel Godet:
1. **Convergencia garantizada:** reemplaza la potencia $k$ (convergencia trivial hacia el autovector dominante por Perron-Frobenius) por el **operador de Katz-Bonacich / Inversa de Leontief** con factor de atenuación espectral $\alpha = \text{ratio} / \rho(|W|)$.
2. **Polaridad de impactos ($[-3, 3]$):** computa impactos de refuerzo (+) e inhibición (−), permitiendo identificar **bucles propios** $F_i$ y el **índice de contradicción/ambigüedad estructural** $\Omega_i$.
3. **Fricción temporal:** descuenta impactos directos según retardos temporales ($T$) mediante decaimiento exponencial $W = A \circ e^{-\lambda T}$.

---

## 🚀 Puesta en marcha rápida

### Requisitos
- Python 3.10 o superior

### Instalación y ejecución
```bash
# Navegar a la carpeta
cd dynamic-signed-micmac

# Crear entorno virtual e instalar dependencias
python -m venv .venv
.\.venv\Scripts\activate       # En Windows
# source .venv/bin/activate    # En Linux / macOS

pip install -r requirements.txt

# Ejecutar tests matemáticos
python test_engine.py

# Iniciar la aplicación web
streamlit run app.py
```

---

## 📐 Estructura de módulos

- **`micmac_engine.py`**: Motor matemático puro y tipado.
  - Validación de matrices $A$ y $T$.
  - Descuento temporal $W = A \circ e^{-\lambda T}$.
  - Cálculo de radio espectral $\rho(|W|)$ y factor $\alpha$.
  - Propagación de cadenas indirectas: $S^{bruta} = |W|(I - \alpha |W|)^{-1}$ y $S^{neta} = W(I - \alpha W)^{-1}$.
  - Indicadores estructurales ($M^{clas}, D^{clas}, M^{bruta}, D^{bruta}, M^{neta}, D^{neta}, F_i, \Omega_i$).
  - Clasificación en 4 cuadrantes, detección de "Trampas de Política" y roles prospectivos.
  - Generación de aristas para la red causal de flujos netos indirectos.
- **`app.py`**: Interfaz de usuario en Streamlit con 6 vistas:
  1. **📥 Datos:** Editor interactivo bidireccional para $A$ y $T$, carga/descarga Excel/CSV y dataset territorial precargado (8 variables).
  2. **🎯 Plano estratégico 4D:** Scatter plot de burbujas en Plotly con $D^{neta}$ vs $M^{neta}$, tamaño $=\Omega_i$, color $=F_i$ (escala `RdBu_r`) y bordes de advertencia para trampas de política.
  3. **⚖ Clásico vs. Dinámico:** Barras agrupadas normalizadas y gráfico de pendientes (*bump chart*) para visualizar el cambio de ranking y variables paradójicas.
  4. **🕸 Red causal:** Grafo dirigido con NetworkX + Plotly, filtrado por umbral de flujo y diferenciando aristas positivas (verdes) y negativas (rojas punteadas).
  5. **🩺 Diagnóstico:** Intérprete prospectivo automatizado con clasificación en *Palancas Maestras*, *Espejismos*, *Estabilizadores Homeostáticos* y *Nodos Bola de Nieve*, más heatmaps de $S^{bruta}$ y $S^{neta}$.
  6. **📐 Metodología:** Exposición matemática completa con fórmulas LaTeX renderizadas.
- **`test_engine.py`**: Suite de tests unitarios y validación analítica de propiedades matriciales.
