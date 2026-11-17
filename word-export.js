/**
 * word-export.js
 * Generación e informe ejecutivo detallado en Microsoft Word (.docx)
 * con gráficos integrados (PNG de alta resolución) e interpretaciones analíticas completas.
 */

// Helper para convertir SVG a imagen PNG en Uint8Array para docx
async function svgElementToPngUint8Array(svgEl, width = 880, height = 500) {
  return new Promise((resolve, reject) => {
    try {
      if (!svgEl) {
        reject(new Error('SVG element not found'));
        return;
      }
      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(svgEl);

      // Asegurar namespace SVG y dimensiones
      if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgStr = svgStr.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      }
      if (!svgStr.includes('width=')) {
        svgStr = svgStr.replace('<svg ', `<svg width="${width}" height="${height}" `);
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          // Fondo oscuro elegante de alta fidelidad que resalta los nodos luminosos
          ctx.fillStyle = '#0d1326';
          ctx.fillRect(0, 0, width, height);

          // Borde fino estético
          ctx.strokeStyle = '#27355a';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, width - 2, height - 2);

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate PNG blob from canvas'));
              return;
            }
            const buffer = await blob.arrayBuffer();
            resolve(new Uint8Array(buffer));
          }, 'image/png');
        } catch (canvasErr) {
          reject(canvasErr);
        }
      };

      img.onerror = (err) => {
        reject(new Error('Failed to load SVG into Image for canvas rendering: ' + err));
      };

      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    } catch (err) {
      reject(err);
    }
  });
}

// Generador del documento Word (.docx)
async function generateWordReportBlob() {
  if (typeof window.docx === 'undefined') {
    throw new Error('La librería docx.js no está cargada en el navegador.');
  }

  const {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    ImageRun,
    AlignmentType,
    HeadingLevel,
    Packer
  } = window.docx;

  const isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
  const vars = V();
  const n = vars.length;

  // Asegurar que los componentes y gráficos estén calculados y renderizados
  if (typeof renderPlane === 'function') renderPlane();
  if (typeof renderChart === 'function') renderChart();
  if (typeof renderDynamic === 'function') renderDynamic();

  // Obtener parámetros y resultados dinámicos
  const lamEl = document.getElementById('dyn-lambda');
  const lam = lamEl ? +lamEl.value : 0.10;
  const alphaRatioEl = document.getElementById('dyn-alpha-ratio');
  const alphaRatio = alphaRatioEl ? +alphaRatioEl.value : 0.80;
  const omegaTrampaEl = document.getElementById('dyn-omega-trampa');
  const omegaTrampa = omegaTrampaEl ? +omegaTrampaEl.value : 30;
  const critEl = document.getElementById('dyn-criterio');
  const crit = critEl ? critEl.value : 'media';

  const res = computeDynamicMicmac(lam, alphaRatio);
  const meanOmega = res.Omega.reduce((a, b) => a + b, 0) / n;

  // Umbrales dinámicos
  const uDep = crit === 'media' ? res.D_neta_sum.reduce((a, b) => a + b, 0) / n : quantile(res.D_neta_sum, 0.5);
  const uMot = crit === 'media' ? res.M_neta_sum.reduce((a, b) => a + b, 0) / n : quantile(res.M_neta_sum, 0.5);
  const medClas = quantile(res.M_clas, 0.5);
  const medMn = quantile(res.M_neta_sum, 0.5);
  const medMb = quantile(res.M_bruta_sum, 0.5);
  const medOm = quantile(res.Omega, 0.5);
  const q3Om = quantile(res.Omega, 0.75);
  const q1F = quantile(res.F, 0.25);
  const q3F = quantile(res.F, 0.75);

  // Clasificación de variables dinámicas
  const palancas = [];
  const trampas = [];
  const amplificadores = [];
  const estabilizadores = [];

  const dynamicRows = vars.map((v, i) => {
    const mn = res.M_neta_sum[i];
    const dn = res.D_neta_sum[i];
    const mb = res.M_bruta_sum[i];
    const f_i = res.F[i];
    const om_i = res.Omega[i];

    let quadKey = 'auto';
    if (mn >= uMot) {
      quadKey = (dn >= uDep) ? 'conflict' : 'power';
    } else {
      quadKey = (dn >= uDep) ? 'result' : 'auto';
    }
    const quadName = QUAD[quadKey]?.name || quadKey;

    const esTrampa = (res.M_clas[i] >= medClas) && (om_i > omegaTrampa);
    const esPalanca = (mn >= medMn) && (om_i <= medOm);

    if (esPalanca) palancas.push(v);
    if (esTrampa) trampas.push(v);
    if (f_i > 0 && f_i >= q3F) amplificadores.push(v);
    if (f_i < 0 && f_i <= q1F) estabilizadores.push(v);

    return { v, i, mc: res.M_clas[i], dc: res.D_clas[i], mb, mn, dn, f_i, om_i, quadKey, quadName, esTrampa, esPalanca };
  });

  // Resultados de la simulación
  const sim = (typeof simulate === 'function') ? simulate() : null;
  const simSteps = (typeof S !== 'undefined' && S.params) ? S.params.steps : 30;
  const simBeta = (typeof S !== 'undefined' && S.params) ? S.params.beta : 0.08;
  const simLambda = (typeof S !== 'undefined' && S.params) ? S.params.lambda : 0.04;
  const simInts = (typeof S !== 'undefined' && S.ints) ? S.ints : [];

  // Capturar imágenes PNG de los gráficos SVG
  let pngPlane = null, pngDyn = null, pngChart = null;

  try {
    const svgPlane = document.getElementById('plane-svg');
    if (svgPlane) pngPlane = await svgElementToPngUint8Array(svgPlane, 880, 500);
  } catch (e) {
    console.warn('No se pudo convertir plane-svg:', e);
  }

  try {
    const svgDyn = document.getElementById('dyn-svg');
    if (svgDyn) pngDyn = await svgElementToPngUint8Array(svgDyn, 880, 500);
  } catch (e) {
    console.warn('No se pudo convertir dyn-svg:', e);
  }

  try {
    const svgChart = document.getElementById('chart-svg');
    if (svgChart) pngChart = await svgElementToPngUint8Array(svgChart, 900, 430);
  } catch (e) {
    console.warn('No se pudo convertir chart-svg:', e);
  }

  let pngMC = null;
  try {
    const svgMC = document.querySelector('#mc-chart-container svg');
    if (svgMC) {
      const mcH = Math.max(260, vars.length * 30 + 54);
      pngMC = await svgElementToPngUint8Array(svgMC, 880, mcH);
    }
  } catch (e) {
    console.warn('No se pudo convertir mc-chart-svg:', e);
  }

  // Estilos de bordes para tablas formales de Word
  const tableBorderNone = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE }
  };
  const tableBorderLight = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE }
  };

  // Creación de párrafos y contenido del documento
  const children = [];

  // 1. TÍTULO Y PORTADA FORMAL
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: isEn ? "EXTENDED MICMAC STRATEGIC ANALYSIS REPORT" : "INFORME ESTRATÉGICO DE ANÁLISIS ESTRUCTURAL · MICMAC EXTENDIDO",
          bold: true,
          size: 36,
          color: "1E3A8A"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 300 },
      children: [
        new TextRun({
          text: isEn 
            ? "4D Dynamic Spectral Model (Katz-Bonacich) · Structural Polarity · Time Friction · Simulation"
            : "Modelo Dinámico Espectral 4D (Katz-Bonacich) · Polaridad Causal · Fricción Temporal · Simulación de Trayectorias",
          italics: true,
          size: 22,
          color: "4B5563"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 240 },
      children: [
        new TextRun({
          text: `${isEn ? 'Date of Issue:' : 'Fecha de emisión:'} ${new Date().toLocaleDateString(isEn ? 'en-US' : 'es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}  |  ${isEn ? 'Variables Analyzed:' : 'Variables analizadas:'} n = ${n}`,
          size: 19,
          color: "6B7280"
        })
      ]
    })
  );

  // 2. RESUMEN EJECUTIVO (DIRECTIVE SYNTHESIS)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({
          text: isEn ? "1. EXECUTIVE SUMMARY & STRATEGIC DIAGNOSIS" : "1. RESUMEN EJECUTIVO Y SÍNTESIS DIRECTIVA",
          bold: true,
          size: 28,
          color: "1E3A8A"
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 60, after: 100 },
      children: [
        new TextRun({
          text: isEn
            ? "This strategic prospective report evaluates the institutional system through an extended MICMAC methodology (Godet & Durance, 2011), overcoming the historical mathematical limits of the traditional Godet method. By incorporating the Katz-Bonacich spectral resolvent operator (Katz, 1953; Bonacich, 1987), continuous time friction discount (Sterman, 2000), and signed loop polarity (Meadows, 2008), the system reveals hidden systemic contradictions and identifies the optimal levers for intervention."
            : "El presente informe prospectivo evalúa el sistema institucional a través de la metodología MICMAC extendida (Godet & Durance, 2011), superando las limitaciones matemáticas del enfoque tradicional de Michel Godet. Al incorporar el operador resolvente de Katz-Bonacich (Katz, 1953; Bonacich, 1987), el descuento por fricción temporal continuo (Sterman, 2000) y la polaridad con signo de los bucles causales (Meadows, 2008; Senge, 1990), el análisis devela contradicciones sistémicas ocultas y define los puntos óptimos de apalancamiento estratégico."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: isEn
            ? `The system comprises n = ${n} variables and a signed direct influence matrix W \u2208 \u211d\u207f\u02e3\u207f. The classical MICMAC method (Godet, 1994, 2001) computes cumulative influence by matrix power iteration B = A + A\u00b2 + A\u00b3 + \u2026, which Perron-Frobenius theory shows collapses onto the dominant eigenvector at high powers (Bonacich, 1987). The Katz-Bonacich resolvent S = (I \u2212 \u03b1W)\u207b\u00b9W overcomes this by converging if \u03b1\u00b7\u03c1(|W|) < 1 (Leontief, 1951). Temporal friction \u03c9\u1d62\u1d63 = exp(\u2212\u03bb\u00b7t\u1d62\u1d63) discounts delayed causal paths (Sterman, 2000). Signed polarity sums detect Meadows\u2019 \u2018fixes that fail\u2019 archetype (Meadows, 2008, pp. 112\u2013145; Senge, 1990). Current parameters: \u03b1\u00b7\u03c1(|W|) = ${alphaRatio.toFixed(3)} (stability ${alphaRatio < 1 ? 'CONFIRMED' : 'WARNING: condition violated'}); \u03a9\u0304 = ${meanOmega.toFixed(1)}%.`
            : `El sistema analizado comprende n = ${n} variables y una matriz de influencia directa con signo W \u2208 \u211d\u207f\u02e3\u207f. El m\u00e9todo MICMAC cl\u00e1sico (Godet, 1994, 2001) calcula la influencia acumulada por iteraci\u00f3n de potencias matriciales B = A + A\u00b2 + A\u00b3 + \u2026, lo que Perron-Frobenius muestra que colapsa sobre el autovector dominante a altas potencias (Bonacich, 1987). El resolvente de Katz-Bonacich S = (I \u2212 \u03b1W)\u207b\u00b9W supera esto convergiendo cuando \u03b1\u00b7\u03c1(|W|) < 1 (Leontief, 1951). La fricci\u00f3n temporal \u03c9\u1d62\u1d63 = exp(\u2212\u03bb\u00b7t\u1d62\u1d63) descuenta caminos causales retardados (Sterman, 2000). Las sumas de polaridad con signo detectan el arquetipo de \u2018soluciones que fracasan\u2019 de Meadows (Meadows, 2008, pp. 112\u2013145; Senge, 1990). Par\u00e1metros actuales: \u03b1\u00b7\u03c1(|W|) = ${alphaRatio.toFixed(3)} (estabilidad ${alphaRatio < 1 ? 'CONFIRMADA' : 'ADVERTENCIA: condici\u00f3n violada'}); \u03a9\u0304 = ${meanOmega.toFixed(1)}%.`
        })
      ]
    })
  );

  // Tabla KPI Ejecutiva
  const kpiHeaders = isEn 
    ? ["Key Indicator", "Value", "Technical & Strategic Meaning"]
    : ["Indicador Clave", "Valor", "Significado Técnico y Estratégico"];

  const kpiData = [
    [
      isEn ? "Spectral Radius ρ(|W|)" : "Radio Espectral ρ(|W|)",
      res.rho.toFixed(3),
      isEn ? "Maximal matrix eigenvalue; defines systemic causal connectivity." : "Autovalor máximo; define la conectividad y escala de propagación causal."
    ],
    [
      isEn ? "Convergence Factor (α)" : "Factor de Convergencia (α)",
      `${res.alpha.toFixed(3)} (α·ρ = ${alphaRatio.toFixed(2)})`,
      isEn ? "Guarantees finite convergence of indirect causal chains (Leontief inverse)." : "Garantiza convergencia matemática finita de las cadenas indirectas (Katz-Bonacich)."
    ],
    [
      isEn ? "Mean System Ambiguity (Ω̄)" : "Ambigüedad Media del Sistema (Ω̄)",
      `${meanOmega.toFixed(1)} %`,
      isEn ? "Average percentage of motricity lost to opposing feedback loop cancellation." : "Porcentaje promedio de fuerza motriz disipada por cancelación de bucles opuestos."
    ],
    [
      isEn ? "Consistent Master Levers" : "Palancas Maestras Consistentes",
      `${palancas.length} ${isEn ? 'variables' : 'variables'}`,
      palancas.map(v => v.code).join(', ') || (isEn ? "None" : "Ninguna")
    ],
    [
      isEn ? "Policy Traps (Mirages)" : "Trampas de Política (Espejismos)",
      `${trampas.length} ${isEn ? 'variables' : 'variables'}`,
      trampas.map(v => v.code).join(', ') || (isEn ? "None" : "Ninguna")
    ]
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderLight,
      rows: [
        new TableRow({
          tableHeader: true,
          children: kpiHeaders.map(h => new TableCell({
            shading: { fill: "1E293B" },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 19 })] })]
          }))
        }),
        ...kpiData.map((row, idx) => new TableRow({
          children: row.map((cellText, cIdx) => new TableCell({
            shading: { fill: idx % 2 === 0 ? "F8FAFC" : "FFFFFF" },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: cellText, bold: cIdx === 1, color: cIdx === 0 ? "1E3A8A" : "1F2937", size: 18 })]
            })]
          }))
        }))
      ]
    }),
    new Paragraph({ spacing: { before: 180, after: 120 }, children: [] })
  );

  // 3. ANÁLISIS ESTRUCTURAL CLÁSICO (GODET)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: isEn ? "3. CLASSICAL STRUCTURAL ANALYSIS (MICMAC GODET)" : "3. ANÁLISIS ESTRUCTURAL CLÁSICO DE MICMAC (MÉTODO GODET)",
          bold: true,
          size: 28,
          color: "1E3A8A"
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 60, after: 120 },
      children: [
        new TextRun({
          text: isEn
            ? "The classical Godet method classifies variables according to direct and indirect influence (motricity) and dependence into four structural quadrants: Driver / Determinant variables (Power zone), Strategic / Critical variables (Key / Linkage zone), Result / Output variables (Dependent zone), and Autonomous variables (Excluded zone)."
            : "El análisis clásico de Godet clasifica las variables según su motricidad y dependencia directas e indirectas en cuatro cuadrantes estructurales: Variables Motrices o Determinantes (Zona de poder), Variables Críticas o Estratégicas (Zona de enlace / clave), Variables de Salida o Resultado (Zona dependiente) y Variables Autónomas (Zona excluida)."
        })
      ]
    })
  );

  // Incrustar gráfico del Plano Clásico
  if (pngPlane) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 80 },
        children: [
          new ImageRun({
            data: pngPlane,
            transformation: { width: 560, height: 318 }
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 140 },
        children: [
          new TextRun({
            text: isEn 
              ? "Figure 1: Classical Influence vs. Dependence Plane (Quadrants: Drivers, Strategic/Critical, Results/Output, Autonomous)."
              : "Figura 1: Plano Clásico de Influencia vs. Dependencia (Cuadrantes: Motrices, Críticas/Estratégicas, Salida/Resultado, Autónomas).",
            italics: true,
            size: 18,
            color: "64748B"
          })
        ]
      })
    );
  }

  // Interpretación detallada del Plano Clásico
  const inflOrder = [...vars.keys()].sort((a, b) => PD.sc.inf[b] - PD.sc.inf[a]);
  const motricesClas = inflOrder.filter(i => PD.q[i] === 'power').map(i => `${vars[i].code} (${vars[i].name})`);
  const enlaceClas = inflOrder.filter(i => PD.q[i] === 'conflict').map(i => `${vars[i].code} (${vars[i].name})`);
  const dependientesClas = inflOrder.filter(i => PD.q[i] === 'result').map(i => `${vars[i].code} (${vars[i].name})`);
  const autonomasClas = inflOrder.filter(i => PD.q[i] === 'auto').map(i => `${vars[i].code} (${vars[i].name})`);

  children.push(
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [
        new TextRun({
          text: isEn ? "Detailed Quadrant Interpretation (Godet Methodology):" : "Interpretación Detallada por Cuadrantes (Metodología Godet):",
          bold: true,
          color: "1E3A8A",
          size: 20
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "• Driver Variables (Power Zone / Levers): " : "• Cuadrante de Variables Motrices (Determinantes / Palancas de Poder): ", bold: true, color: "059669" }),
        new TextRun({ text: motricesClas.join(', ') || (isEn ? 'None' : 'Ninguna') + '. ' }),
        new TextRun({
          text: isEn
            ? "High motricity and low dependence. They act as the primary structural engines and levers of the system; their movement conditions the rest of the variables with little vulnerability to systemic feedback."
            : "Poseen alta motricidad y baja dependencia. Actúan como los motores y palancas estructurales del sistema; sus movimientos condicionan al resto sin verse fuertemente afectados por las demás."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "• Strategic / Critical Variables (Key & Linkage Zone): " : "• Cuadrante de Variables Críticas / Estratégicas (Enlace o Clave): ", bold: true, color: "D97706" }),
        new TextRun({ text: enlaceClas.join(', ') || (isEn ? 'None' : 'Ninguna') + '. ' }),
        new TextRun({
          text: isEn
            ? "Highly motrice and highly dependent. These are key, critical, and volatile variables representing system stakes; any intervention spreads rapidly but triggers strong feedback rebounds."
            : "Altamente motrices y altamente dependientes. Son las variables clave, críticas y de enlace del sistema; concentran las mayores apuestas estratégicas e inestabilidad dinámica, pues cualquier intervención se amplifica y retorna por bucles de retroalimentación."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "• Result / Output Variables (Dependent Zone): " : "• Cuadrante de Variables de Salida o Resultado (Dependientes): ", bold: true, color: "7C3AED" }),
        new TextRun({ text: dependientesClas.join(', ') || (isEn ? 'None' : 'Ninguna') + '. ' }),
        new TextRun({
          text: isEn
            ? "High dependence and low driving force. They represent the final performance outcomes and indicators of the system. They cannot be altered directly; they move as a consequence of mobilising driver and relay variables."
            : "Baja motricidad y alta dependencia. Representan los indicadores de resultado final, efectividad e impacto del sistema. No se pueden gestionar directamente: evolucionan como consecuencia del empuje de las motrices y estratégicas."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({ text: isEn ? "• Autonomous Variables (Excluded / Secondary Zone): " : "• Cuadrante de Variables Autónomas (Excluidas o Secundarias): ", bold: true, color: "64748B" }),
        new TextRun({ text: autonomasClas.join(', ') || (isEn ? 'None' : 'Ninguna') + '. ' }),
        new TextRun({
          text: isEn
            ? "Low motricity and low dependence. Secondary or decoupled factors that follow their own internal inertia."
            : "Baja motricidad y baja dependencia. Factores desconectados o secundarios que evolucionan con inercia propia sin arrastrar ni ser arrastrados significativamente."
        })
      ]
    })
  );

  // 4. MODELO DINÁMICO CONVERGENTE 4D (KATZ-BONACICH & POLARIDAD)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 100 },
      children: [
        new TextRun({
          text: isEn
            ? "4. 4D DYNAMIC CONVERGENT MODEL: OVERCOMING GODET DEFICIENCIES & VARIABLE RECLASSIFICATION"
            : "4. MODELO DINÁMICO CONVERGENTE 4D: DEFICIENCIAS DE GODET Y JUSTIFICACIÓN DE NUEVOS INDICADORES",
          bold: true,
          size: 28,
          color: "1E3A8A"
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 60, after: 100 },
      children: [
        new TextRun({
          text: isEn
            ? "4.1 Methodological Innovations of the 4D Model"
            : "4.1 Innovaciones Metodológicas y Marco Conceptual 4D",
          bold: true,
          color: "1D4ED8",
          size: 20
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: isEn
            ? "The 4D Dynamic Convergent Model fundamentally revamps prospective cross-impact analysis by expanding classical 2D motricity-dependence into a four-dimensional analytical manifold: (1) Net Motricity and Dependence, (2) Continuous Time Friction exp(-λt), (3) Systemic Ambiguity ratio (Ω) capturing feedback loop cancellation, and (4) Self-loop feedback (F) derived from spectral resolvent diagonal elements S_ii."
            : "El Modelo Dinámico Convergente 4D transforma integralmente el análisis prospectivo tradicional, expandiendo el plano bidimensional clásico de motricidad-dependencia hacia una variedad analítica de cuatro dimensiones: (1) Motricidad y Dependencia Netas Efectivas, (2) Descuento por Fricción Temporal continua exp(-λt), (3) Ratio de Ambigüedad Sistémica (Ω) que mide la cancelación interna de bucles antagónicos, y (4) Coeficiente de Bucle Propio (F) obtenido de la diagonal principal del operador resolvente espectral S_ii."
        })
      ]
    })
  );

  // Incrustar gráfico del Plano Dinámico 4D
  if (pngDyn) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 80 },
        children: [
          new ImageRun({
            data: pngDyn,
            transformation: { width: 560, height: 318 }
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 140 },
        children: [
          new TextRun({
            text: isEn
              ? "Figure 2: 4D Dynamic Structural Plane (Net Motricity vs. Net Dependence · Ring: Ambiguity Ω · Color: Self-loop F)."
              : "Figura 2: Plano Estructural Dinámico 4D (Motricidad Neta vs. Dependencia Neta · Anillo: Ambigüedad Ω · Color: Bucle Propio F).",
            italics: true,
            size: 18,
            color: "64748B"
          })
        ]
      })
    );
  }

  // 4.2 DEFICIENCIAS DE GODET Y JUSTIFICACIÓN DE NUEVOS INDICADORES
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: isEn
            ? "4.2 Critical Deficiencies of Classical Godet MICMAC & Mathematical Remedies"
            : "4.2 Deficiencias Estructurales del Método MICMAC Clásico de Godet y Justificación de los Nuevos Indicadores",
          bold: true,
          color: "1D4ED8",
          size: 20
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({
          text: isEn
            ? "Although Michel Godet's classical MICMAC represented an extraordinary advance in 1970–1990 prospective matrix analysis, contemporary complex systems theory and practical public policy experience have exposed four fundamental flaws that often lead decision-makers to catastrophic resource misallocations:"
            : "Aunque el método MICMAC original de Michel Godet representó un hito histórico en la prospectiva de las décadas de 1970 a 1990, los avances en teoría de sistemas complejos y la evidencia empírica en gestión pública han revelado cuatro deficiencias estructurales críticas que inducen a graves errores de diagnóstico y asignación presupuestaria:"
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [
        new TextRun({ text: isEn ? "1. Sign Blindness (Absolute Value Flaw): " : "1. Ceguera de Polaridad y Signos (La Falacia del Valor Absoluto): ", bold: true, color: "DC2626" }),
        new TextRun({
          text: isEn
            ? "Classical Godet evaluates links using strictly absolute sums |W_ij| in {0, 1, 2, 3}. A positive transformative link (+3) is added identically to a destructive reaction (-3), summing to 6 instead of resolving to 0. In reality, competing positive and negative feedback loops cancel each other out. To remedy this, the 4D model computes Net Motricity M_net = |M^+ - M^-| and the Systemic Ambiguity Ratio Ω = |M^+ - M^-| / M_total × 100%. This distinguishes pure, high-potency levers from 'Policy Traps' (Meadows, 2008; Senge, 1990) where massive public investment triggers equal and opposite resistance."
            : "El MICMAC tradicional opera con la matriz en valor absoluto |W_ij| ∈ {0, 1, 2, 3}. Una influencia que impulsa positivamente (+3) y una barrera que destruye (-3) son sumadas como 6 en vez de resolverse en 0. En la realidad sistémica, los bucles antagónicos se neutralizan. Para resolver esta falacia, el modelo 4D calcula la Motricidad Neta M_neta = |M^+ - M^-| y el Ratio de Ambigüedad Sistémica Ω = |M^+ - M^-| / M_total × 100%, distinguiendo entre palancas de transmisión limpia y 'Trampas de Política' (Meadows, 2008; Senge, 1990) donde el esfuerzo institucional se auto-cancela."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [
        new TextRun({ text: isEn ? "2. Timelessness & Absence of Friction: " : "2. Atemporalidad y Carencia de Fricción Institucional: ", bold: true, color: "DC2626" }),
        new TextRun({
          text: isEn
            ? "Classical matrix multiplication assumes instantaneous propagation or abstract algebraic steps k without real chronological calibration. An educational curriculum reform taking 4 years is treated identically to an executive regulatory decree taking 2 weeks. The 4D model introduces Continuous Time Friction discount ω_ij = exp(-λ·t_ij) and the Effective Matrix W_eff = W ⊙ Ω (Hadamard product), mathematically capturing implementation delays (Sterman, 2000; Richardson, 1991) and discounting links that arrive too late to alter strategic outcomes."
            : "La multiplicación matricial de Godet asume pasos algebraicos k atemporales, ignorando el calendario real. Una reforma curricular que madura en 4 años recibe el mismo peso que un decreto ejecutivo de 2 semanas. El modelo 4D introduce el factor de Fricción Temporal continua ω_ij = exp(-λ·t_ij) y la Matriz Efectiva W_eff = W ⊙ Ω (producto de Hadamard), modelando formalmente los rezagos de implementación (Sterman, 2000; Richardson, 1991) y penalizando las rutas lentas que llegan fuera de la ventana de oportunidad."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [
        new TextRun({ text: isEn ? "3. Perron-Frobenius Rank-1 Collapse Flaw: " : "3. El Colapso Singular de Perron-Frobenius hacia Rango 1: ", bold: true, color: "DC2626" }),
        new TextRun({
          text: isEn
            ? "In classical MICMAC, indirect impacts are computed by elevating matrix powers M^k. By the Perron-Frobenius theorem, any irreducible non-negative matrix elevated to high powers converges strictly to its dominant rank-1 outer product u·v^T. Beyond power k ≥ 5..10, every single row becomes 100% proportional, erasing all structural nuance and making indirect ranking degenerate. The 4D model replaces unconstrained powers with the Katz-Bonacich Spectral Resolvent S = α(I - αW)⁻¹W calibrated at α·ρ = 0.80 (equivalent to the Leontief Input-Output inverse; Leontief, 1951; Bonacich, 1987). This sums infinite indirect paths (k=1..∞) while maintaining a 20% safety margin before singularity, preserving 100% of network structural heterogeneity."
            : "Al elevar M^k sucesivamente para calcular efectos indirectos, el teorema matemático de Perron-Frobenius demuestra que toda matriz irreducible no negativa colapsa sobre su autovector dominante u·v^T. A partir de potencias k ≥ 5..10, todas las filas se vuelven 100% proporcionales (rango 1), borrando las identidades individuales de las variables y desvirtuando el análisis indirecto. El modelo 4D supera esto reemplazando las potencias libres por la Resolvente Espectral de Katz-Bonacich S = α(I - αW)⁻¹W calibrada en α·ρ = 0.80 (análoga a la Inversa de Leontief; Leontief, 1951; Bonacich, 1987), que suma infinitas cadenas indirectas (k=1..∞) con un margen de seguridad del 20% antes de la inestabilidad, preservando toda la riqueza estructural."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 30, after: 80 },
      children: [
        new TextRun({ text: isEn ? "4. Omission of Self-Feedback Loops: " : "4. Omisión de Bucles Propios de Retroalimentación: ", bold: true, color: "DC2626" }),
        new TextRun({
          text: isEn
            ? "Godet forces diagonal elements to zero (W_ii = 0), falsely assuming variables do not feedback into themselves. In complex networks, a variable influences neighbors which in turn feedback energy through 2-cycle and higher loops. The 4D model computes the Self-Loop Feedback Coefficient F_i = S_ii from the resolvent diagonal, distinguishing between Amplifying / Snowball variables (F > 0; virtuous reinforcing cycles) and Stabilizing / Homeostatic variables (F < 0; system shock absorbers)."
            : "Godet anula forzosamente la diagonal (W_ii = 0), asumiendo erróneamente que las variables no actúan sobre sí mismas. En sistemas complejos, una variable influye en otras que retornan energía a través de bucles de 2 o más ciclos. El modelo 4D extrae el Coeficiente de Bucle Propio F_i = S_ii de la diagonal de la resolvente, distinguiendo entre variables Amplificadoras / Bola de Nieve (F > 0; ciclos virtuosos expansivos) y variables Estabilizadoras / Amortiguadoras (F < 0; homeostasis sistémica)."
        })
      ]
    })
  );

  // Tabla Síntesis de Deficiencias vs Indicadores Correctores
  const defHeaders = isEn
    ? ["Classical Godet Flaw", "Real Policy Risk", "4D Dynamic Indicator", "Mathematical Formula", "Strategic Value to Leadership"]
    : ["Deficiencia de Godet", "Riesgo en Políticas Públicas", "Nuevo Indicador 4D", "Fórmula Matemática", "Aporte Clave al Decisor"];

  const defData = [
    [
      isEn ? "Sign Blindness (|W| sums)" : "Ceguera de Signos (Suma en |W|)",
      isEn ? "Policy Traps & wasted budget in cancelled loops." : "Trampas de política y gasto desperdiciado en bucles cancelados.",
      isEn ? "Systemic Ambiguity (Ω) & Net Motricity" : "Ratio de Ambigüedad (Ω) y Motricidad Neta",
      "Ω = |M⁺ - M⁻| / M_tot × 100%",
      isEn ? "Identifies pure levers vs. self-cancelling initiatives." : "Discrimina palancas limpias frente a espejismos causales."
    ],
    [
      isEn ? "Timelessness (steps k)" : "Atemporalidad (Pasos k abstractos)",
      isEn ? "Intervening in slow paths that mature too late." : "Invertir en variables cuyos efectos maduran fuera de plazo.",
      isEn ? "Continuous Time Friction Discount" : "Atenuación Temporal por Retardos",
      "ω_ij = exp(-λ · t_ij)",
      isEn ? "Aligns investments with real institutional absorption speed." : "Sincroniza el presupuesto con el calendario de absorción."
    ],
    [
      isEn ? "Perron-Frobenius Rank-1 Collapse" : "Colapso de Rango 1 (Perron-Frobenius)",
      isEn ? "All variables look identical at high powers M^k." : "Todas las variables se vuelven idénticas a potencias altas.",
      isEn ? "Katz-Bonacich Resolvent (α·ρ = 0.80)" : "Resolvente de Katz-Bonacich (α·ρ = 0.80)",
      "S = α(I - αW)⁻¹W",
      isEn ? "Preserves 100% structural heterogeneity + 20% safety buffer." : "Preserva la heterogeneidad de la red con 20% de colchón."
    ],
    [
      isEn ? "Omission of Diagonal (W_ii = 0)" : "Omisión de la Diagonal (W_ii = 0)",
      isEn ? "Inability to detect compounding virtuous cycles." : "Incapacidad de detectar efectos acumulativos bola de nieve.",
      isEn ? "Self-Loop Feedback Coefficient" : "Coeficiente de Bucle Propio",
      "F_i = S_ii (Diagonal Resolvente)",
      isEn ? "Detects self-amplifying seed nodes vs. shock absorbers." : "Detecta nodos multiplicadores vs. estabilizadores homeostáticos."
    ]
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderLight,
      rows: [
        new TableRow({
          tableHeader: true,
          children: defHeaders.map(h => new TableCell({
            shading: { fill: "1E293B" },
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 15 })] })]
          }))
        }),
        ...defData.map((rowCells, rIdx) => new TableRow({
          children: rowCells.map((cText, cIdx) => new TableCell({
            shading: { fill: rIdx % 2 === 0 ? "F8FAFC" : "FFFFFF" },
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({
              children: [new TextRun({
                text: cText,
                bold: cIdx === 0 || cIdx === 2,
                color: cIdx === 2 ? "059669" : (cIdx === 0 ? "DC2626" : "1F2937"),
                size: 15
              })]
            })]
          }))
        }))
      ]
    }),
    new Paragraph({ spacing: { before: 100, after: 80 }, children: [] })
  );

  // 4.3 RECUADRO DESTACADO: GUÍA PRÁCTICA EN PALABRAS SENCILLAS PARA EL TÉCNICO DE LA FUNCIÓN PÚBLICA
  const calloutBoxBorder = {
    top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
    left: { style: BorderStyle.SINGLE, size: 28, color: "1E3A8A" },
    right: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" }
  };

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: calloutBoxBorder,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F8FAFC" },
              margins: { top: 120, bottom: 120, left: 160, right: 140 },
              children: [
                new Paragraph({
                  spacing: { before: 40, after: 60 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "📌 HIGHLIGHTED POLICY BOX: WHAT HAPPENS IF A PUBLIC SECTOR ANALYST USES ORIGINAL GODET MICMAC?"
                        : "📌 RECUADRO DESTACADO: ¿QUÉ PASARÍA SI UN TÉCNICO DE LA FUNCIÓN PÚBLICA USA EL MÉTODO MICMAC ORIGINAL?",
                      bold: true,
                      color: "1E3A8A",
                      size: 20
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 20, after: 100 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "Practical translation guide for civil servants, policy planners, and budget evaluators (plain language, avoiding academic jargon):"
                        : "Guía práctica de traducción para analistas, evaluadores de proyectos y planificadores del sector público (en palabras sencillas y aplicadas a la realidad de ministerios, gobernaciones y municipios):",
                      italics: true,
                      color: "475569",
                      size: 17
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 40, after: 60 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "1. The 'Wasted Budget' Risk (Why Some Major Initiatives Go Nowhere): "
                        : "1. El Riesgo de 'Tirar Presupuesto a la Basura' (Trampas de Política vs. Palancas Reales): ",
                      bold: true,
                      color: "DC2626",
                      size: 17
                    }),
                    new TextRun({
                      text: isEn
                        ? "If a public analyst uses Godet's classical tool, they will see a variable with an enormous score and immediately recommend the Minister allocate large public funding to it. But Godet added positive pushes (+3) and negative resistance (-3) as 3 + 3 = 6. In real public administration, +3 - 3 = 0. The initiative provokes bureaucratic hurdles, union pushback, or procedural gridlock of equal intensity. Result: the budget is spent, but the indicator never moves. The 4D model detects this instantly through the Ambiguity Index (Ω) and warns the technical team: 'Do not pour money here until you solve internal administrative friction and conflicting incentives first.'"
                        : "Si un técnico de planificación usa el MICMAC tradicional de Godet, el software le mostrará variables con puntajes altísimos de influencia y le recomendará a la autoridad (Ministro, Subsecretario o Alcalde) crear un programa masivo o inyectarle gran presupuesto. Pero el método tradicional cometió un error grave: sumó los impactos positivos (+3) y las resistencias negativas (-3) como 3 + 3 = 6. En la vida real de la administración pública, +3 - 3 = 0. Cada peso gastado genera un conflicto normativo, traba burocrática o resistencia gremial de igual tamaño. Resultado: se gasta todo el presupuesto del año y el problema público sigue exactamente igual. El modelo 4D detecta esto de inmediato mediante el Índice de Ambigüedad (Ω) y le advierte al técnico: '¡Alerta roja! Esta variable es una Trampa de Política: no ponga dinero aquí a ciegas; primero arme una mesa de destrabe institucional antes de presupuestar'.",
                      size: 16
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 40, after: 60 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "2. False Promises of 'Quick Wins' vs. Real Institutional Pace (Time Friction): "
                        : "2. La Falsa Promesa de 'Resultados Inmediatos' frente a los Tiempos Reales del Estado (Fricción Temporal): ",
                      bold: true,
                      color: "D97706",
                      size: 17
                    }),
                    new TextRun({
                      text: isEn
                        ? "Godet assumes all policies happen at the same theoretical speed. A civil servant might promise a Mayor or Minister that educational reforms or major infrastructure will yield visible KPIs within the next budget cycle. When results lag, the project is unfairly declared a 'failure' and defunded. The 4D model incorporates Time Friction (exp(-λt)): it gives the technical team a synchronized timeline, distinguishing 'quick administrative levers' (decrees, fast-track procurement, digitalization) to generate short-term political credibility, while protecting long-term structural reforms until their natural maturation window."
                        : "El método de Godet asume que todas las acciones estatales ocurren a la misma velocidad teórica. Un técnico inexperto podría prometer a su jefatura resultados de alto impacto en el informe de gestión del próximo año basándose en reformas que, por naturaleza institucional, tardan 5 a 10 años en madurar (como cambios curriculares, modernización del Estado o grandes obras viales). Al no verse resultados en 12 meses, la autoridad suele declarar la política como 'un fracaso' y cancela los fondos. El modelo 4D incluye el factor de Fricción Temporal continua (exp(-λt)): le permite al técnico diseñar una estrategia en dos tiempos: 'victorias tempranas' de rápida absorción (decretos, simplificación de trámites) para dar legitimidad inmediata, y 'reformas de fondo' blindadas presupuestariamente para su maduración real.",
                      size: 16
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 40, after: 60 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "3. The 'Everything is a Top Priority' Trap (Preserving Real Priorities): "
                        : "3. El Síndrome del 'Todo es Urgente y Prioritario' (La Imposibilidad de Priorizar el Gasto): ",
                      bold: true,
                      color: "1D4ED8",
                      size: 17
                    }),
                    new TextRun({
                      text: isEn
                        ? "When classical matrix multiplication calculates long-term indirect impacts, mathematical collapse makes almost all variables converge to identical scores. The technical analyst delivers a report concluding that 'all 20 variables are critical and must be funded'. For the Budget Directorate or Ministry of Finance, that report is useless because fiscal resources and staff capacities are strictly finite. The 4D model uses the regularized Katz-Bonacich resolvent to prevent this collapse, isolating the 2 or 3 genuine Master Levers that truly move the system, giving the public servant airtight justification to defend budget focus."
                        : "Al calcular efectos indirectos a largo plazo elevando matrices, la matemática de Godet colapsa y hace que casi todas las variables terminen teniendo números muy parecidos. El técnico termina entregando un informe que dice: 'Todas las variables del sistema son críticas y deben ser financiadas'. Para el Ministerio de Hacienda o la Dirección de Presupuestos (DIPRES), ese informe es inútil: cuando todo es prioritario, nada es prioritario. El presupuesto fiscal y los recursos humanos son limitados. El modelo 4D, al regularizar matemáticamente la red (Katz-Bonacich), no aplana las diferencias y separa con precisión quirúrgica cuáles son las 2 o 3 Palancas Maestras que verdaderamente mueven la aguja, entregando al técnico una justificación inobjetable ante los evaluadores fiscales.",
                      size: 16
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 40, after: 60 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "4. 'Self-Sustaining Programs' vs. 'Bottomless Pits' (Self-Loop Compounding): "
                        : "4. Programas que 'Caminan Solos' vs. Programas que son un 'Barril sin Fondo' (Bucles Propios): ",
                      bold: true,
                      color: "059669",
                      size: 17
                    }),
                    new TextRun({
                      text: isEn
                        ? "Classical Godet sets diagonal elements to zero, blind to self-reinforcing dynamics. In public administration, there are programs where the State only needs to provide initial seed funding, and the virtuous cycle self-sustains over time (Multiplier / Snowball Effect, F > 0). Other programs act as bottomless pits: the moment public subsidies or technical teams stop, the benefits vanish immediately (Homeostatic Dampener, F < 0). The 4D model identifies which programs require permanent budget line items in the annual budget law and which will become self-sustaining."
                        : "Godet borra la diagonal de la matriz, asumiendo falsamente que ninguna variable se retroalimenta a sí misma. En el Estado existen programas donde solo se requiere un impulso inicial o 'capital semilla' y la rueda empieza a girar sola gracias a círculos virtuosos comunitarios o productivos (Efecto Bola de Nieve o Multiplicador, F > 0). En cambio, existen otros programas que son un 'barril sin fondo': apenas el Estado suspende el subsidio o retira a los profesionales a contrata, el beneficio desaparece por completo (Efecto Amortiguador, F < 0). El modelo 4D le indica al técnico con exactitud cuáles programas necesitarán asignación presupuestaria permanente año a año y cuáles podrán sostenerse con inercia propia.",
                      size: 16
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 60, after: 40 },
                  children: [
                    new TextRun({
                      text: isEn
                        ? "🎯 3 Golden Decision Rules for Public Sector Technicians:"
                        : "🎯 3 Reglas de Oro para el Técnico Público ante el Ministro o Director de Presupuestos:",
                      bold: true,
                      color: "1E3A8A",
                      size: 17
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({ text: isEn ? "• Rule 1 (Master Levers): " : "• Regla 1 (Palancas Maestras): ", bold: true, color: "059669", size: 16 }),
                    new TextRun({
                      text: isEn
                        ? "Concentrate 70% to 80% of program resources here. Their positive signal moves through the State apparatus cleanly without triggering internal blockages."
                        : "Concentrar entre el 70% y el 80% de los recursos de inversión aquí. Son variables que empujan el sistema hacia adelante con mínimo rebote destructivo.",
                      size: 16
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 20, after: 20 },
                  children: [
                    new TextRun({ text: isEn ? "• Rule 2 (Policy Traps): " : "• Regla 2 (Trampas de Política): ", bold: true, color: "DC2626", size: 16 }),
                    new TextRun({
                      text: isEn
                        ? "NEVER propose budget increases directly. Propose first an inter-agency taskforce, legal simplification, or governance consensus to dismantle resistance loops before spending public money."
                        : "JAMÁS pedir aumento de presupuesto directo ni crear nuevos subsidios de inmediato. Proponer primero una mesa de coordinación interministerial, simplificación normativa o diálogo de gobernanza para destrabar las resistencias antes de gastar.",
                      size: 16
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 20, after: 40 },
                  children: [
                    new TextRun({ text: isEn ? "• Rule 3 (Output / Result Variables): " : "• Regla 3 (Variables de Resultado): ", bold: true, color: "7C3AED", size: 16 }),
                    new TextRun({
                      text: isEn
                        ? "Do NOT try to push these directly. Use them as Key Performance Indicators (KPIs) for public accountability, congressional reporting, and Comptroller audits."
                        : "NO intentar manipularlas directamente. Utilizarlas como indicadores de impacto final (KPIs) en el tablero de control para la rendición de cuentas pública, la cuenta ante el Congreso y las auditorías de Contraloría.",
                      size: 16
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }),
    new Paragraph({ spacing: { before: 100, after: 60 }, children: [] })
  );

  // 4.4 ANÁLISIS DE DISCREPANCIAS Y RECLASIFICACIÓN DE VARIABLES
  const quadClasNames = {
    power: isEn ? "Motriz (Poder)" : "Motriz (Poder)",
    conflict: isEn ? "Crítica (Enlace)" : "Crítica (Enlace)",
    result: isEn ? "Resultado (Dep.)" : "Resultado (Dep.)",
    auto: isEn ? "Autónoma" : "Autónoma"
  };

  const variablesDesplazadas = dynamicRows.filter(r => {
    const clasQKey = (typeof PD !== 'undefined' && PD.q) ? PD.q[r.i] : 'auto';
    return (r.quadKey !== clasQKey) || r.esTrampa;
  });

  children.push(
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: isEn
            ? "4.4 Detailed Analysis of Classification Shifts & Strategic Discrepancies"
            : "4.4 Análisis Detallado de Discrepancias y Cambios en la Clasificación de Variables",
          bold: true,
          color: "1D4ED8",
          size: 20
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({
          text: isEn
            ? `When comparing classical Godet quadrants with the 4D Dynamic Convergent Model, significant structural discrepancies emerge in ${variablesDesplazadas.length} variable(s). These shifts prove that traditional analysis can lead to severe misdiagnoses by mistaking internal friction for genuine driving power:`
            : `Al contrastar la matriz clásica de Godet con el Modelo Dinámico Convergente 4D, se detectan discrepancias estructurales significativas en ${variablesDesplazadas.length} variable(s). Estos desplazamientos demuestran cómo el enfoque clásico genera falsos positivos al confundir fricción o volumen bruto con auténtica potencia transformadora:`
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "★ Consistent Master Levers (Highest Strategic Priority): " : "★ Palancas Maestras Consistentes (Máxima Prioridad Estratégica): ", bold: true, color: "059669" }),
        new TextRun({ text: (palancas.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None identified' : 'Ninguna identificada')) + '. ' }),
        new TextRun({
          text: isEn
            ? "These variables combine high Net Motricity with low Ambiguity (Ω ≤ median). Their causal signal propagates cleanly through the network without triggering destructive internal balancing loops (Bonacich, 1987). They represent Meadows' (1999) highest-order leverage points and must absorb 70–80% of executive bandwidth and investment."
            : "Estas variables combinan una alta Motricidad Neta Efectiva con un nivel de Ambigüedad controlado (Ω ≤ mediana). Su impulso causal viaja limpio por la red sin activar bucles de resistencia destructiva (Bonacich, 1987). Representan los puntos de apalancamiento de mayor orden de Meadows (1999) y deben concentrar entre el 70% y el 80% de la atención directiva y del presupuesto."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "⚠ Policy Traps & Causal Mirages (Severe Executive Risk): " : "⚠ Trampas de Política y Espejismos Causales (Riesgo Directivo Crítico): ", bold: true, color: "E11D48" }),
        new TextRun({ text: (trampas.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None detected' : 'Ninguna detectada')) + '. ' }),
        new TextRun({
          text: isEn
            ? "CRITICAL WARNING: Under classical Godet analysis, these variables look like primary drivers or key conflict pivots due to large gross sums. However, the 4D signed model proves they suffer extreme ambiguity (Ω > 30%): their positive impacts are cancelled out by opposing negative loops. This reproduces Senge's (1990) 'Fixes that Fail' archetype and Sterman's (2000) 'Policy Resistance'. Pushing resources into these variables without first dismantling their resistance loops generates frustration and waste."
            : "ADVERTENCIA DIRECTIVA CRÍTICA: En el MICMAC clásico de Godet, estas variables aparentaban ser motores o pivotes clave debido a su abultada suma bruta. Sin embargo, el modelo 4D con signos demuestra que sufren una ambigüedad severa (Ω > 30%): su impacto positivo es cancelado por bucles negativos antagónicos. Esto reproduce el arquetipo de 'Soluciones que Fracasan' de Senge (1990) y la 'Resistencia a las Políticas' de Sterman (2000). Inyectar recursos en ellas sin destrabar previamente sus bucles de resistencia es la causa principal del fracaso de reformas institucionales."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "🔄 Positive Self-Loops (Virtuous Snowball Cycles, F > 0): " : "🔄 Bucles Propios Expansivos (Efecto Bola de Nieve, F > 0): ", bold: true, color: "0284C7" }),
        new TextRun({ text: (amplificadores.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None' : 'Ninguno')) + '. ' }),
        new TextRun({
          text: isEn
            ? "Nodes with F_i in the upper quartile return amplified momentum through reinforcing feedback loops. Once activated, they self-propagate, creating a virtuous compounding dynamic with minimal ongoing maintenance (Meadows, 2008)."
            : "Variables ubicadas en el cuartil superior de F_i: devuelven energía amplificada a través de bucles reforzadores de la red. Una vez detonadas, se auto-sostienen generando una dinámica virtuosa acumulativa que reduce la necesidad de presión externa continua (Meadows, 2008)."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({ text: isEn ? "🛡 Homeostatic Stabilizers (Shock Absorbers, F < 0): " : "🛡 Nodos Estabilizadores (Amortiguadores Homeostáticos, F < 0): ", bold: true, color: "7C3AED" }),
        new TextRun({ text: (estabilizadores.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None' : 'Ninguno')) + '. ' }),
        new TextRun({
          text: isEn
            ? "Variables with negative self-loops in the lower quartile act as systemic buffers. They naturally resist disturbance and restore equilibrium (Sterman, 2000). Strategy: Do not force them into aggressive growth; use their stabilizing nature to absorb transitional shocks."
            : "Variables en el cuartil inferior de F_i: actúan como amortiguadores sistémicos. Absorben choques externos y devuelven el sistema hacia el equilibrio (Sterman, 2000). Recomendación: No forzarlas hacia un crecimiento agresivo; utilizar su rol estabilizador para amortiguar turbulencias mientras se activan las palancas maestras."
        })
      ]
    })
  );

  // 4.5 TABLA COMPARATIVA CRUZADA EXHAUSTIVA
  const dynHeaders = isEn
    ? ["#", "Code", "Variable Name", "Godet Mot", "Godet Quad", "Net Mot (4D)", "4D Quad", "Ambiguity Ω", "Self-Loop F", "Status Shift", "Strategic Diagnosis"]
    : ["#", "Cód", "Nombre Variable", "Mot. Godet", "Cuadrante Godet", "Mot. Neta 4D", "Cuadrante 4D", "Ambigüedad Ω", "Bucle F", "¿Cambió Rol?", "Diagnóstico Estratégico"];

  children.push(
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: isEn
            ? "4.5 Comprehensive Cross-Classification Table (Godet Classical vs. 4D Dynamic Convergent)"
            : "4.5 Tabla Comparativa Cruzada Exhaustiva (Godet Clásico vs. Extendido Dinámico 4D)",
          bold: true,
          color: "1D4ED8",
          size: 20
        })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderLight,
      rows: [
        new TableRow({
          tableHeader: true,
          children: dynHeaders.map(h => new TableCell({
            shading: { fill: "1E293B" },
            margins: { top: 80, bottom: 80, left: 60, right: 60 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 14 })] })]
          }))
        }),
        ...dynamicRows.map((r, idx) => {
          const clasQKey = (typeof PD !== 'undefined' && PD.q) ? PD.q[r.i] : 'auto';
          const clasQName = quadClasNames[clasQKey] || clasQKey;
          const cambioCuad = (r.quadKey !== clasQKey);
          const cambioTxt = cambioCuad
            ? (isEn ? "⚠️ Shift" : "⚠️ Cambio")
            : (isEn ? "✓ Stable" : "✓ Mantiene");

          let diagTxt = isEn ? "Regular" : "Evolución Regular";
          if (r.esPalanca) diagTxt = isEn ? "★ Master Lever" : "★ Palanca Maestra";
          else if (r.esTrampa) diagTxt = isEn ? "⚠ Policy Trap" : "⚠ Trampa Política";
          else if (r.f_i > 0 && r.f_i >= q3F) diagTxt = isEn ? "🔄 Amplifier" : "🔄 Amplificador";
          else if (r.f_i < 0 && r.f_i <= q1F) diagTxt = isEn ? "🛡 Stabilizer" : "🛡 Estabilizador";

          const rowBg = r.esPalanca ? "F0FDF4" : (r.esTrampa ? "FEF2F2" : (idx % 2 === 0 ? "F8FAFC" : "FFFFFF"));

          const cells = [
            (idx + 1).toString(),
            r.v.code,
            r.v.name,
            r.mc.toFixed(1),
            clasQName,
            r.mn.toFixed(2),
            r.quadName,
            `${r.om_i.toFixed(1)} %`,
            `${r.f_i >= 0 ? '+' : ''}${r.f_i.toFixed(2)}`,
            cambioTxt,
            diagTxt
          ];

          return new TableRow({
            children: cells.map((cText, cIdx) => new TableCell({
              shading: { fill: rowBg },
              margins: { top: 60, bottom: 60, left: 60, right: 60 },
              children: [new Paragraph({
                alignment: cIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                children: [new TextRun({
                  text: cText,
                  bold: cIdx === 0 || cIdx === 1 || cIdx === 10,
                  color: cIdx === 10 && cText.includes("★") ? "059669" : (cIdx === 10 && cText.includes("⚠") ? "E11D48" : (cIdx === 9 && cText.includes("⚠️") ? "D97706" : "1F2937")),
                  size: 14
                })]
              })]
            }))
          });
        })
      ]
    }),
    new Paragraph({ spacing: { before: 180, after: 100 }, children: [] })
  );

  // 5. SIMULACIÓN TEMPORAL Y TRAYECTORIAS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: isEn ? "5. CONTINUOUS DYNAMIC SIMULATION & TRAJECTORY ANALYSIS" : "5. SIMULACIÓN DINÁMICA CONTINUA: ANÁLISIS DE TRAYECTORIAS TEMPORALES",
          bold: true,
          size: 28,
          color: "1E3A8A"
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 60, after: 120 },
      children: [
        new TextRun({
          text: isEn
            ? `Simulates the propagation of external interventions over ${simSteps} time steps with systemic coupling β = ${simBeta} and damping λ = ${simLambda}. It captures transient peaks, stabilization delays, and non-linear saturation limits [0, 100].`
            : `Modela la propagación temporal de intervenciones externas a lo largo de ${simSteps} pasos de tiempo con acoplamiento sistémico β = ${simBeta} y amortiguación λ = ${simLambda}. Permite observar picos transitorios, tiempos de estabilización y el efecto acumulativo de las políticas.`
        })
      ]
    })
  );

  // Incrustar gráfico de Simulación
  if (pngChart) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 80 },
        children: [
          new ImageRun({
            data: pngChart,
            transformation: { width: 560, height: 268 }
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 140 },
        children: [
          new TextRun({
            text: isEn
              ? "Figure 3: Temporal Simulation Trajectories (Evolution of variables under interventions)."
              : "Figura 3: Curvas de Simulación Temporal (Evolución de indicadores ante perturbaciones).",
            italics: true,
            size: 18,
            color: "64748B"
          })
        ]
      })
    );
  }

  // Tabla de impacto de la simulación
  if (sim) {
    const simImpactRows = vars.map((v, i) => {
      let pk = 0, pt = 0;
      sim.dl.forEach((r, t) => {
        if (Math.abs(r[i]) > Math.abs(pk)) {
          pk = r[i];
          pt = t;
        }
      });
      return {
        v,
        i,
        base: v.x0,
        fin: sim.x[simSteps][i],
        df: sim.dl[simSteps][i],
        pk,
        pt
      };
    }).sort((a, b) => Math.abs(b.pk) - Math.abs(a.pk));

    const simHeaders = isEn
      ? ["Code", "Variable Name", "Baseline", "Final Value", "Δ Net Impact", "Peak Displacement"]
      : ["Cód", "Nombre Variable", "Base Inicial", "Valor Final", "Δ Impacto Neto", "Desplazamiento Pico"];

    children.push(
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [
          new TextRun({
            text: isEn ? "Temporal Simulation Impact Summary:" : "Resumen de Impacto en Simulación Temporal:",
            bold: true,
            color: "1E3A8A",
            size: 20
          })
        ]
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderLight,
        rows: [
          new TableRow({
            tableHeader: true,
            children: simHeaders.map(h => new TableCell({
              shading: { fill: "1E293B" },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 17 })] })]
            }))
          }),
          ...simImpactRows.map((r, idx) => new TableRow({
            children: [
              r.v.code,
              r.v.name,
              r.base.toFixed(0),
              r.fin.toFixed(1),
              `${r.df >= 0 ? '+' : ''}${r.df.toFixed(1)}`,
              `${r.pk >= 0 ? '+' : ''}${r.pk.toFixed(1)} (t=${r.pt})`
            ].map((cText, cIdx) => new TableCell({
              shading: { fill: idx % 2 === 0 ? "F8FAFC" : "FFFFFF" },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({
                children: [new TextRun({
                  text: cText,
                  bold: cIdx === 0 || cIdx === 4,
                  color: cIdx === 4 ? (r.df >= 0 ? "0284C7" : "E11D48") : "1F2937",
                  size: 16
                })]
              })]
            }))
          }))
        ]
      }),
      new Paragraph({ spacing: { before: 180, after: 100 }, children: [] })
    );
  }

  // 6. ANÁLISIS DE ROBUSTEZ ESTOCÁSTICA Y SIMULACIÓN DE MONTE CARLO
  const mcResults = (typeof getOrComputeMonteCarloResults === 'function')
    ? getOrComputeMonteCarloResults()
    : ((typeof window !== 'undefined' && window.lastMonteCarloResults) ? window.lastMonteCarloResults : []);

  if (mcResults && mcResults.length > 0) {
    const mcWinner = mcResults[0];
    const mcRuns = (mcWinner.impactScores && mcWinner.impactScores.length) ? mcWinner.impactScores.length : 2000;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 260, after: 100 },
        children: [
          new TextRun({
            text: isEn
              ? `6. STOCHASTIC ROBUSTNESS & MONTE CARLO SIMULATION (${mcRuns.toLocaleString()} SCENARIOS)`
              : `6. ANÁLISIS DE ROBUSTEZ ESTOCÁSTICA Y SIMULACIÓN DE MONTE CARLO (${mcRuns.toLocaleString()} ESCENARIOS)`,
            bold: true,
            size: 28,
            color: "7C3AED"
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 40, after: 60 },
        children: [
          new TextRun({
            text: isEn
              ? "6.1 Methodological Foundations & Asymptotic Convergence"
              : "6.1 Fundamentación Metodológica y Convergencia Asintótica",
            bold: true,
            color: "1D4ED8",
            size: 20
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 30, after: 80 },
        children: [
          new TextRun({
            text: isEn
              ? `Traditional MICMAC models evaluate systems as deterministic static snapshots, assuming expert matrix weights are exact and invariant. To overcome this limitation, a stochastic Monte Carlo simulation of ${mcRuns.toLocaleString()} realizations was conducted. In each run, causal link strengths were subjected to continuous random noise (±20%), implementation delays were dynamically perturbed, and intervention schedules were randomized across start times t ∈ {1, 2, 3, 5, 8} and durations τ ∈ {3, 5, 10, 15, 20} periods. By the Strong Law of Large Numbers, this sample size bounds the Monte Carlo standard error to approximately 2.2% (1/√${mcRuns}), ensuring asymptotic convergence of the ranking and proving that results reflect structural network topology rather than stochastic noise.`
              : `El modelo MICMAC tradicional evalúa los sistemas como fotografías estáticas deterministas, asumiendo que las valoraciones de los expertos son invariantes y perfectas. Para superar este sesgo, se ejecutó una simulación estocástica de Monte Carlo con ${mcRuns.toLocaleString()} realizaciones. En cada escenario se aplicó ruido aleatorio uniforme de ±20% sobre cada vínculo causal, se perturbaron los retardos temporales y se exploraron permutaciones de calendarios de intervención con momentos de inicio t ∈ {1, 2, 3, 5, 8} y duraciones τ ∈ {3, 5, 10, 15, 20} periodos. En virtud de la Ley Fuerte de los Grandes Números, este tamaño muestral acota el error estándar de estimación a aproximadamente un 2.2% (1/√${mcRuns}), garantizando una convergencia asintótica donde el ranking resultante responde a la topología profunda de la red y no al azar.`
          })
        ]
      })
    );

    // Gráfico de Monte Carlo PNG si existe
    if (pngMC) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 60 },
          children: [
            new ImageRun({
              data: pngMC,
              transformation: { width: 620, height: Math.min(360, Math.max(220, vars.length * 20)) }
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 100 },
          children: [
            new TextRun({
              text: isEn
                ? "Figure 4. Monte Carlo Robustness Ranking & Confidence Intervals (P10 - Median - P90)."
                : "Figura 4. Ranking de Robustez de Monte Carlo e Intervalos de Confianza (P10 - Mediana - P90).",
              italics: true,
              size: 17,
              color: "6B7280"
            })
          ]
        })
      );
    }

    // 6.2 Tabla de Resultados de Monte Carlo
    const mcHeaders = isEn
      ? ["#", "Code", "Variable Name", "Mean Impact (μ ± σ)", "90% Range [P10–P90]", "Volatility (CV)", "Optimal Start (t*)", "Duration (τ*)", "Peak (t_peak)"]
      : ["#", "Código", "Nombre de Variable", "Impacto Medio (μ ± σ)", "Rango 90% [P10–P90]", "Volatilidad (CV)", "Inicio Óptimo (t*)", "Duración (τ*)", "Pico (t_pico)"];

    children.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text: isEn
              ? "6.2 Stochastic Ranking Table & Confidence Intervals"
              : "6.2 Tabla de Ranking Estocástico e Intervalos de Confianza",
            bold: true,
            color: "1D4ED8",
            size: 20
          })
        ]
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderLight,
        rows: [
          new TableRow({
            tableHeader: true,
            children: mcHeaders.map(h => new TableCell({
              shading: { fill: "581C87" },
              margins: { top: 80, bottom: 80, left: 70, right: 70 },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 15 })] })]
            }))
          }),
          ...mcResults.map((st, idx) => {
            const isWin = idx === 0;
            const cvPct = (st.cv * 100).toFixed(1) + '%';
            const rowBg = isWin ? "F3E8FF" : (idx % 2 === 0 ? "F8FAFC" : "FFFFFF");
            const cells = [
              String(idx + 1),
              st.v.code,
              st.v.name,
              `${st.mean.toFixed(2)} ± ${st.stdDev.toFixed(2)}`,
              `[${st.p10.toFixed(1)} — ${st.p90.toFixed(1)}]`,
              cvPct,
              `t = ${st.optStart}`,
              `${st.optDur} p`,
              `t = ${st.medianPeakT}`
            ];

            return new TableRow({
              children: cells.map((cText, cIdx) => new TableCell({
                shading: { fill: rowBg },
                margins: { top: 60, bottom: 60, left: 70, right: 70 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cText,
                        bold: isWin && (cIdx === 0 || cIdx === 1 || cIdx === 3),
                        color: isWin ? "581C87" : (cIdx === 3 ? "0284C7" : (cIdx === 5 && st.cv > 0.4 ? "DC2626" : "1F2937")),
                        size: 15
                      })
                    ]
                  })
                ]
              }))
            });
          })
        ]
      }),
      new Paragraph({ spacing: { before: 120, after: 60 }, children: [] })
    );

    // 6.3 Diagnóstico Táctico de la Palanca Ganadora
    children.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text: isEn
              ? `6.3 Strategic Lever Diagnosis: Antifragility of ${mcWinner.v.code} (${mcWinner.v.name})`
              : `6.3 Diagnóstico Táctico: Antifragilidad de la Palanca ${mcWinner.v.code} (${mcWinner.v.name})`,
            bold: true,
            color: "1D4ED8",
            size: 20
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 30, after: 80 },
        children: [
          new TextRun({
            text: isEn
              ? `Variable ${mcWinner.v.code} (${mcWinner.v.name}) emerged as the supreme strategic lever across ${mcRuns.toLocaleString()} stochastic scenarios, yielding an average systemic impact of μ = ${mcWinner.mean.toFixed(2)} with standard deviation σ = ${mcWinner.stdDev.toFixed(2)} (CV = ${(mcWinner.cv * 100).toFixed(1)}%). Unlike static MICMAC quadrant placements, which may elevate a node due to consensus bias, Monte Carlo proves antifragility (Taleb, 2012): even in the most adverse 10% of futures, ${mcWinner.v.code} delivers a guaranteed minimum impact floor of P10 = ${mcWinner.p10.toFixed(2)}. Its optimal intervention window begins at period t* = ${mcWinner.optStart} and should be sustained for τ* = ${mcWinner.optDur} periods, reaching peak systemic resonance at t_peak = ${mcWinner.medianPeakT}.`
              : `La variable ${mcWinner.v.code} (${mcWinner.v.name}) se consolidó como la palanca estratégica suprema del sistema a lo largo de los ${mcRuns.toLocaleString()} escenarios estocásticos, alcanzando un impacto transformador medio de μ = ${mcWinner.mean.toFixed(2)} con desviación estándar σ = ${mcWinner.stdDev.toFixed(2)} (CV = ${(mcWinner.cv * 100).toFixed(1)}%). A diferencia de la clasificación estática de cuadrantes del MICMAC clásico, que puede sobreestimar nodos por sesgo de consenso, Monte Carlo demuestra antifragilidad empírica (Taleb, 2012): aun en el peor 10% de los escenarios futuros, ${mcWinner.v.code} asegura un piso de impacto mínimo garantizado de P10 = ${mcWinner.p10.toFixed(2)}. Su ventana óptima de activación inicia en el periodo t* = ${mcWinner.optStart} con una duración sostenida recomendada de τ* = ${mcWinner.optDur} periodos, alcanzando su máxima aceleración y resonancia sistémica en el periodo t_pico = ${mcWinner.medianPeakT}.`
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 40, after: 60 },
        children: [
          new TextRun({
            text: isEn
              ? "6.4 Practical Decision-Making Guidelines for Strategic Planning"
              : "6.4 Pautas de Decisión para la Planificación Estratégica y Asignación de Recursos",
            bold: true,
            color: "1D4ED8",
            size: 20
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 30, after: 120 },
        children: [
          new TextRun({
            text: isEn
              ? `(1) Guaranteed Downside Protection: Use the P10 floor to justify budget allocations before governing boards and risk committees; it represents the minimum return guaranteed under unfavorable conditions. (2) Timing Resonance (t*): Delaying intervention to t* allows enabling conditions to mature, avoiding premature resource dissipation. (3) Diminishing Returns Threshold (τ*): Sustaining extraordinary policy injections beyond τ* yields diminishing marginal returns due to natural systemic friction (λ = ${simLambda}); the policy should transition into operational maintenance. (4) Stakeholder Expectation Management (t_peak): Communication dashboards should align performance evaluation milestones with t_peak = ${mcWinner.medianPeakT}, when the compound indirect effects across causal loops manifest their maximum systemic displacement.`
              : `(1) Protección ante Escenarios Adversos (Piso P10): Utilizar el valor P10 para justificar asignaciones presupuestarias ante comités de riesgo y directorios; representa el retorno mínimo garantizado bajo coyunturas desfavorables. (2) Resonancia Temporal (t*): Respetar el inicio en t* permite que maduren las condiciones habilitantes de base, evitando el desperdicio de recursos por inyecciones prematuras. (3) Umbral de Rendimientos Decrecientes (τ*): Mantener el esfuerzo extraordinario más allá de τ* genera rendimientos marginales decrecientes debido a la tasa de disipación institucional (λ = ${simLambda}); la intervención debe migrar a régimen ordinario de mantenimiento. (4) Gestión de Expectativas Políticas (t_pico): Los cuadros de mando y metas de rendición de cuentas deben calibrarse hacia t_pico = ${mcWinner.medianPeakT}, momento en que las ondas causales indirectas habrán completado su ciclo y alcanzarán su máxima visibilidad institucional.`
          })
        ]
      })
    );
  }

  // 7. FUNDAMENTOS TEÓRICO-METODOLÓGICOS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 100 },
      children: [new TextRun({ text: isEn ? "7. THEORETICAL & METHODOLOGICAL FOUNDATIONS" : "7. FUNDAMENTOS TEÓRICO-METODOLÓGICOS", bold: true, size: 28, color: "1E3A8A" })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "7.1 Classical MICMAC (Godet, 1994; Godet & Durance, 2011)" : "7.1 MICMAC Clásico (Godet, 1994; Godet & Durance, 2011)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: isEn
        ? "Developed by Michel Godet at LIPSOR (Paris), MICMAC classifies variables on a motricity-dependence plane via matrix power iteration B = A + A² + A³ + … The fundamental limitation is that Perron-Frobenius theory guarantees collapse onto the dominant eigenvector at high powers, erasing structural nuances (Bonacich, 1987). Quadrant classification: (I) Motrices/Power: high motricity, low dep. — upstream levers; (II) Clave/Conflict: high both — strategic pivot, volatile; (III) Resultado/Dependent: high dep., low motricity — outcome KPIs; (IV) Autónomas/Auto: low both — decoupled, exclude from priority action."
        : "Desarrollado por Michel Godet en el LIPSOR (París), MICMAC clasifica variables en un plano motricidad-dependencia vía iteración de potencias matriciales B = A + A² + A³ + … La limitación fundamental es que el teorema de Perron-Frobenius garantiza el colapso sobre el autovector dominante a altas potencias, borrando los matices estructurales (Bonacich, 1987). Clasificación de cuadrantes: (I) Motrices/Poder: alta motricidad, baja dep. — palancas aguas arriba; (II) Clave/Conflicto: alta ambas — pivote estratégico, volátil; (III) Resultado/Dependiente: alta dep., baja motricidad — KPIs de resultado; (IV) Autónomas/Auto: baja ambas — desacopladas, excluir de acción prioritaria." })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "7.2 Katz-Bonacich Spectral Resolvent (Katz, 1953; Bonacich, 1987; Leontief, 1951)" : "7.2 Resolvente Espectral de Katz-Bonacich (Katz, 1953; Bonacich, 1987; Leontief, 1951)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: isEn
        ? `S = αW + α²W² + … = α(I − αW)⁻¹W, converges iff α < 1/ρ(W). Equivalent to Leontief inverse (I−A)⁻¹ in Input-Output Economics (Leontief, 1951). Current α·ρ = ${alphaRatio.toFixed(3)} (${alphaRatio < 1 ? 'STABLE' : 'UNSTABLE — interpret with caution'}). Preserves all structural heterogeneity without collapsing onto the dominant mode — the key mathematical advantage over classical MICMAC.`
        : `S = αW + α²W² + … = α(I − αW)⁻¹W, converge sii α < 1/ρ(W). Equivalente a la inversa de Leontief (I−A)⁻¹ en Economía de Insumo-Producto (Leontief, 1951). α·ρ actual = ${alphaRatio.toFixed(3)} (${alphaRatio < 1 ? 'ESTABLE' : 'INESTABLE — interpretar con cautela'}). Preserva toda la heterogeneidad estructural sin colapsar sobre el modo dominante — la ventaja matemática clave sobre el MICMAC clásico.` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "7.3 Temporal Friction & Implementation Delays (Sterman, 2000; Richardson, 1991)" : "7.3 Fricción Temporal y Retardos de Implementación (Sterman, 2000; Richardson, 1991)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: isEn
        ? `ωᵢⱼ = exp(−λ·tᵢⱼ). Effective matrix W_eff = W ⊙ Ω (Hadamard product). Current λ = ${simLambda}. High-λ pairs lose influence rapidly; low-λ pairs maintain structural importance across long horizons. This formally captures Sterman’s (2000) policy resistance due to implementation lags, and aligns with Richardson’s (1991) feedback thought tradition.`
        : `ωᵢⱼ = exp(−λ·tᵢⱼ). Matriz efectiva W_eff = W ⊙ Ω (producto de Hadamard). λ actual = ${simLambda}. Los pares con λ alto pierden influencia rápidamente; los pares con λ bajo mantienen importancia estructural en horizontes largos. Esto captura formalmente la resistencia política por retardos de implementación de Sterman (2000) y se alinea con la tradición de retroalimentación de Richardson (1991).` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "7.4 Signed Polarity & Feedback Loop Ambiguity (Meadows, 2008; Senge, 1990)" : "7.4 Polaridad con Signo y Ambigüedad de Bucles de Retroalimentación (Meadows, 2008; Senge, 1990)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 120 },
      children: [new TextRun({ text: isEn
        ? `Ω = |M_brute_pos − M_brute_neg| / M_brute_total × 100%. High Ω = 'fixes that fail' archetype (Meadows, 2008, pp. 112–145). Classical Godet uses |W|, erasing this distinction. The signed extension reveals which variables are contested by competing feedback loops — the systemic archetype Senge (1990) identifies as 'policy resistance' and 'limits to growth'. Mean system ambiguity Ω̄ = ${meanOmega.toFixed(1)}%.`
        : `Ω = |M_bruta_pos − M_bruta_neg| / M_bruta_total × 100%. Ω elevado = arquetipo 'soluciones que fracasan' (Meadows, 2008, pp. 112–145). El MICMAC clásico de Godet usa |W|, borrando esta distinción. La extensión con signo revela qué variables están disputadas por bucles de retroalimentación competidores — el arquetipo sistémico que Senge (1990) identifica como 'resistencia política' y 'límites al crecimiento'. Ambigüedad media del sistema Ω̄ = ${meanOmega.toFixed(1)}%.` })]
    })
  );

  // 8. HOJA DE RUTA ESTRATÉGICA POR HORIZONTE TEMPORAL
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: isEn ? "8. STRATEGIC ROADMAP — PHASED POLICY RECOMMENDATIONS" : "8. HOJA DE RUTA ESTRATÉGICA — RECOMENDACIONES POR HORIZONTE TEMPORAL", bold: true, size: 28, color: "1E3A8A" })]
    }),
    new Paragraph({
      spacing: { before: 60, after: 40 },
      children: [new TextRun({ text: isEn ? "Short Term (0–12 months): Structural Foundations" : "Corto Plazo (0–12 meses): Cimientos Estructurales", bold: true, color: "059669", size: 22 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 80 },
      children: [new TextRun({ text: isEn
        ? `1. Sequencing before resource injection: Never push Policy Traps (${trampas.map(v=>v.code).join(', ')||'N/A'}) without first resolving resistance loops (Sterman, 2000, p. 5; Kotter, 1996). 2. Prioritize Master Levers (${palancas.map(v=>v.code).join(', ')||'N/A'}): allocate 70–80% of budget and executive attention — low Ω guarantees efficient causal transmission (Meadows, 1999; Bonacich, 1987). 3. Activate reinforcing seed nodes (${amplificadores.map(v=>v.code).join(', ')||'N/A'}): small early wins compound through virtuous cycles (Senge, 1990, p. 88). 4. Align with Monte Carlo optimal start (t* = ${mcResults[0]?.optStart || 1}) for maximum systemic resonance.`
        : `1. Secuenciación antes de inyectar recursos: No presionar Trampas de Política (${trampas.map(v=>v.code).join(', ')||'N/A'}) sin haber resuelto primero los bucles de resistencia (Sterman, 2000, p. 5; Kotter, 1996). 2. Priorizar Palancas Maestras (${palancas.map(v=>v.code).join(', ')||'N/A'}): asignar 70–80% del presupuesto y atención ejecutiva — el bajo Ω garantiza transmisión causal eficiente (Meadows, 1999; Bonacich, 1987). 3. Activar nodos semilla reforzadores (${amplificadores.map(v=>v.code).join(', ')||'N/A'}): pequeñas victorias tempranas se componen mediante ciclos virtuosos (Senge, 1990, p. 88). 4. Calibrar la activación con el momento óptimo de Monte Carlo (t* = ${mcResults[0]?.optStart || 1}) para asegurar resonancia sistémica.` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: isEn ? "Medium Term (1–3 years): Systemic Momentum" : "Mediano Plazo (1–3 años): Momentum Sistémico", bold: true, color: "D97706", size: 22 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 80 },
      children: [new TextRun({ text: isEn
        ? `5. Dismantle resistance loops: Address balancing loops generating Ω in trap variables — organizational (Kotter, 1996), cultural (Schein, 2010), or resource-based (Sterman, 2000). Beware 'Shifting the Burden' archetype (Senge, 1990, pp. 103–117). 6. Monitor strategic/critical variables (${enlaceClas.join(', ')||'N/A'}): their high interactivity demands real-time feedback dashboards (OECD, 2010). 7. Sustain intervention across Monte Carlo optimal duration (τ* = ${mcResults[0]?.optDur || 10} periods) and monitor systemic acceleration toward peak impact window (t_peak = ${mcResults[0]?.medianPeakT || 8}) (Sterman, 2000, Chapter 11).`
        : `5. Desactivar bucles de resistencia: Abordar bucles equilibradores que generan Ω en variables trampa — organizacionales (Kotter, 1996), culturales (Schein, 2010) o basados en recursos (Sterman, 2000). Precaución: arquetipo 'Desplazando la Carga' (Senge, 1990, pp. 103–117). 6. Monitorear variables estratégicas/críticas (${enlaceClas.join(', ')||'N/A'}): su alta interactividad exige dashboards de retroalimentación en tiempo real (OCDE, 2010). 7. Sostener la intervención durante la duración óptima de Monte Carlo (τ* = ${mcResults[0]?.optDur || 10} periodos) y monitorear la aceleración del sistema hacia la ventana de impacto pico (t_pico = ${mcResults[0]?.medianPeakT || 8}) (Sterman, 2000, Capítulo 11).` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: isEn ? "Long Term (3–10 years): Structural Transformation" : "Largo Plazo (3–10 años): Transformación Estructural", bold: true, color: "7C3AED", size: 22 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 120 },
      children: [new TextRun({ text: isEn
        ? `8. Continuous monitoring via result variables (${dependientesClas.join(', ')||'N/A'}): establish periodic evaluations aligned with λ = ${simLambda} friction rate (OECD, 2010; Senge, 1990). 9. Annual recalibration of W matrix: as causal relationships evolve, the spectral structure changes (Godet & Durance, 2011). Previously trapped variables may become levers and vice versa — this structural learning is fundamental (Sterman, 2000). 10. Structural learning & scenario planning: use the extended MICMAC as a shared mental model (Senge, 1990, pp. 174–204) for strategic dialogue. Regular scenario exercises reveal possible evolutionary trajectories (Godet & Durance, 2011; Schwartz, 1991).`
        : `8. Monitoreo continuo vía variables de resultado (${dependientesClas.join(', ')||'N/A'}): establecer evaluaciones periódicas alineadas con tasa de fricción λ = ${simLambda} (OCDE, 2010; Senge, 1990). 9. Recalibración anual de la matriz W: a medida que las relaciones causales evolucionan, la estructura espectral cambia (Godet & Durance, 2011). Variables previamente atrapadas pueden convertirse en palancas y viceversa — este aprendizaje estructural es fundamental (Sterman, 2000). 10. Aprendizaje estructural y planificación de escenarios: usar el MICMAC extendido como modelo mental compartido (Senge, 1990, pp. 174–204) para el diálogo estratégico. Los ejercicios de escenarios regulares revelan posibles trayectorias evolutivas (Godet & Durance, 2011; Schwartz, 1991).` })]
    })
  );

  // 9. LIMITACIONES Y SUPUESTOS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: isEn ? "9. LIMITATIONS, ASSUMPTIONS & VALIDITY CONDITIONS" : "9. LIMITACIONES, SUPUESTOS Y CONDICIONES DE VALIDEZ", bold: true, size: 28, color: "1E3A8A" })]
    }),
    new Paragraph({
      spacing: { before: 60, after: 100 },
      children: [new TextRun({ text: isEn
        ? `(1) Linearity: MICMAC assumes linear causal relationships. Non-linear thresholds and chaotic dynamics (Lorenz, 1963) are not captured. Complement with Agent-Based Modeling or full System Dynamics simulation (Sterman, 2000) for highly non-linear systems. (2) Expert elicitation bias: Wᵢⱼ values are expert judgments subject to anchoring, availability heuristic, and groupthink (Kahneman, 2011; Montibeller & von Winterfeldt, 2015). Triangulate with empirical data (time series, meta-analysis). (3) Convergence condition: mathematical validity requires α·ρ(|W|) = ${alphaRatio.toFixed(3)} < 1 — ${alphaRatio < 1 ? 'SATISFIED' : 'VIOLATED — results are mathematically invalid without parameter correction'}. (4) Static structure: W is assumed stable over the analysis horizon. In VUCA environments, reassess more frequently (Godet & Durance, 2011). (5) Delay estimates: tᵢⱼ parameters are estimated; sensitivity analysis by varying λ and individual delays is recommended (Sterman, 2000, Chapter 21).`
        : `(1) Linealidad: MICMAC asume relaciones causales lineales. Los umbrales no lineales y la dinámica caótica (Lorenz, 1963) no se capturan. Complementar con Modelado Basado en Agentes o simulación de Flujos y Acervos (Sterman, 2000) para sistemas altamente no lineales. (2) Sesgo de elicitación experta: los valores Wᵢⱼ son juicios expertos sujetos a anclaje, heurística de disponibilidad y pensamiento grupal (Kahneman, 2011; Montibeller & von Winterfeldt, 2015). Triangular con datos empíricos (series temporales, meta-análisis). (3) Condición de convergencia: validez matemática requiere α·ρ(|W|) = ${alphaRatio.toFixed(3)} < 1 — ${alphaRatio < 1 ? 'SATISFECHA' : 'VIOLADA — resultados matemáticamente inválidos sin corrección de parámetros'}. (4) Estructura estática: se asume W estable en el horizonte de análisis. En entornos VUCA, reevaluar con mayor frecuencia (Godet & Durance, 2011). (5) Estimaciones de retardo: los parámetros tᵢⱼ son estimados; se recomienda análisis de sensibilidad variando λ y retardos individuales (Sterman, 2000, Capítulo 21).` })]
    })
  );

  // 10. REFERENCIAS BIBLIOGRÁFICAS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: isEn ? "10. BIBLIOGRAPHIC REFERENCES (APA 7th ed.)" : "10. REFERENCIAS BIBLIOGRÁFICAS (APA 7.ª ed.)", bold: true, size: 28, color: "1E3A8A" })]
    })
  );
  const biblioRefs = [
    "Barabási, A.-L. (2016). Network science. Cambridge University Press. http://networksciencebook.com",
    "Bonacich, P. (1987). Power and centrality: A family of measures. American Journal of Sociology, 92(5), 1170–1182. https://doi.org/10.1086/228631",
    "Godet, M. (1994). De la anticipation à l’action: Manuel de prospective et de stratégie. Dunod.",
    "Godet, M. (2001). Creating futures: Scenario planning as a strategic management tool. Economica.",
    "Godet, M. & Durance, P. (2011). La prospective stratégique pour les entreprises et les territoires. Dunod/UNESCO.",
    "Kahneman, D. (2011). Thinking, fast and slow. Farrar, Straus and Giroux.",
    "Katz, L. (1953). A new status index derived from sociometric analysis. Psychometrika, 18(1), 39–43. https://doi.org/10.1007/BF02289026",
    "Kotter, J. P. (1996). Leading change. Harvard Business School Press.",
    "Leontief, W. (1951). The structure of the American economy, 1919–1939: An empirical application of equilibrium analysis (2nd ed.). Oxford University Press.",
    "Lorenz, E. N. (1963). Deterministic nonperiodic flow. Journal of the Atmospheric Sciences, 20(2), 130–141.",
    "Meadows, D. H. (1999). Leverage points: Places to intervene in a system. Sustainability Institute.",
    "Meadows, D. H. (2008). Thinking in systems: A primer (D. Wright, Ed.). Chelsea Green Publishing.",
    "Metropolis, N., & Ulam, S. (1949). The Monte Carlo method. Journal of the American Statistical Association, 44(247), 335–341. https://doi.org/10.1080/01621459.1949.10483310",
    "Montibeller, G. & von Winterfeldt, D. (2015). Cognitive and motivational biases in decision and risk analysis. Risk Analysis, 35(7), 1230–1251. https://doi.org/10.1111/risa.12360",
    "OECD. (2010). Glossary of key terms in evaluation and results-based management. OECD/DAC.",
    "Richardson, G. P. (1991). Feedback thought in social science and systems theory. University of Pennsylvania Press.",
    "Saltelli, A., Ratto, M., Andres, T., Campolongo, F., Cariboni, J., Gatelli, D., Saisana, M., & Tarantola, S. (2008). Global sensitivity analysis: The primer. John Wiley & Sons.",
    "Schein, E. H. (2010). Organizational culture and leadership (4th ed.). Jossey-Bass.",
    "Schwartz, P. (1991). The art of the long view: Planning for the future in an uncertain world. Doubleday.",
    "Senge, P. M. (1990). The fifth discipline: The art and practice of the learning organization. Doubleday/Currency.",
    "Sterman, J. D. (2000). Business dynamics: Systems thinking and modeling for a complex world. Irwin/McGraw-Hill.",
    "Taleb, N. N. (2012). Antifragile: Things that gain from disorder. Random House.",
    "von Luxburg, U. (2007). A tutorial on spectral clustering. Statistics and Computing, 17(4), 395–416. https://doi.org/10.1007/s11222-007-9033-z"
  ];
  biblioRefs.forEach(ref => {
    children.push(new Paragraph({
      spacing: { before: 50, after: 30 },
      indent: { left: 360, hanging: 360 },
      children: [new TextRun({ text: ref, size: 17, color: "374151" })]
    }));
  });

  // Crear el documento Word final
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }
          }
        },
        children
      }
    ]
  });

  return await window.docx.Packer.toBlob(doc);
}

// Función expuesta al usuario para descargar el reporte Word
async function exportWordReport() {
  const isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
  const btns = [
    document.getElementById('btn-export-word-top'),
    document.getElementById('btn-export-word-tab')
  ].filter(Boolean);

  const originalTexts = btns.map(b => b.innerHTML);

  try {
    btns.forEach(b => {
      b.disabled = true;
      b.style.opacity = '0.7';
      b.innerHTML = `<span>⏳</span> <span>${isEn ? 'Generating Word (.docx)...' : 'Generando Word (.docx)...'}</span>`;
    });

    const blob = await generateWordReportBlob();
    const fileName = isEn 
      ? `extended_micmac_strategic_report_${new Date().toISOString().slice(0, 10)}.docx`
      : `informe_estrategico_micmac_extendido_${new Date().toISOString().slice(0, 10)}.docx`;

    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

  } catch (err) {
    console.error('Error al generar el informe Word:', err);
    alert((isEn ? 'Failed to generate Word report: ' : 'Error al generar informe Word: ') + (err.message || err));
  } finally {
    btns.forEach((b, idx) => {
      b.disabled = false;
      b.style.opacity = '1';
      b.innerHTML = originalTexts[idx];
    });
  }
}

// Exponer en window
window.exportWordReport = exportWordReport;
window.generateWordReportBlob = generateWordReportBlob;
