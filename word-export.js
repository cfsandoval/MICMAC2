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
          text: isEn ? "2. CLASSICAL STRUCTURAL ANALYSIS (MICMAC GODET)" : "2. ANÁLISIS ESTRUCTURAL CLÁSICO (MICMAC DE GODET)",
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
          text: isEn ? "3. 4D DYNAMIC CONVERGENT MODEL (SPECTRAL & POLARITY)" : "3. MODELO DINÁMICO CONVERGENTE 4D (KATZ-BONACICH Y POLARIDAD)",
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
            ? "The dynamic model introduces three critical innovations: (1) Time friction exp(-λt) accounting for implementation delays, (2) Signed polarity [-3, 3] revealing feedback loop cancellations, and (3) Resolvent attenuation S = (I - αW)⁻¹W overcoming Perron-Frobenius power collapse."
            : "El modelo dinámico introduce tres innovaciones fundamentales: (1) Fricción temporal continua exp(-λt) que castiga los rezagos de implementación, (2) Polaridad con signos [-3, 3] que identifica bucles positivos y negativos, y (3) Operador resolvente S = (I - αW)⁻¹W que supera la convergencia trivial de Perron-Frobenius del método tradicional."
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

  // Interpretación ampliada de Palancas, Trampas y Bucles
  children.push(
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [new TextRun({ text: isEn ? "4.1 Strategic Diagnostic Findings — Levers, Traps, Amplifiers, Stabilizers:" : "4.1 Hallazgos Estratégicos Críticos — Palancas, Trampas, Amplificadores, Estabilizadores:", bold: true, color: "1E3A8A", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({ text: isEn ? "\u2605 Consistent Master Levers: " : "\u2605 Palancas Maestras Consistentes: ", bold: true, color: "059669" }),
        new TextRun({ text: (palancas.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None identified' : 'Ninguna identificada')) + '. ' }),
        new TextRun({
          text: isEn
            ? `CRITICAL RECOMMENDATION: These variables exhibit high Net Motricity and low Ambiguity (\u03a9). Their causal paths are coherent and free from destructive internal pushback (Bonacich, 1987). They should receive 70\u201380% of leadership focus and budget allocation. From Meadows\u2019 (1999) Leverage Points theory, these correspond to the highest-order leverage points: changing the goals, rules, or paradigms of the system. Sterman (2000, p. 350) calls these \u2018high-leverage policy interventions\u2019 because they exploit the structure\u2019s own dynamics. If a variable is simultaneously a Godet driver AND a dynamic lever, it receives absolute strategic priority.`
            : `RECOMENDACI\u00d3N CR\u00cdTICA: Estas variables exhiben alta Motricidad Neta Efectiva y baja Ambig\u00fcedad (\u03a9 reducido). Su se\u00f1al viaja limpia sin cancelarse en la red (Bonacich, 1987). Deben constituir el 70\u201380% del presupuesto y la gesti\u00f3n directiva. Desde la teor\u00eda de Puntos de Apalancamiento de Meadows (1999), estas corresponden a los puntos de apalancamiento de mayor orden: cambiar las metas, reglas o paradigmas del sistema. Sterman (2000, p. 350) las denomina \u2018intervenciones de pol\u00edtica de alto apalancamiento\u2019. Si una variable es simult\u00e1neamente motriz de Godet Y palanca din\u00e1mica, recibe la m\u00e1xima prioridad estrat\u00e9gica absoluta.`
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({ text: isEn ? "\u26a0 Policy Traps & Causal Mirages: " : "\u26a0 Trampas de Pol\u00edtica y Espejismos Causales: ", bold: true, color: "E11D48" }),
        new TextRun({ text: (trampas.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None detected' : 'Ninguna detectada')) + '. ' }),
        new TextRun({
          text: isEn
            ? `EXECUTIVE WARNING: These variables appear highly motrice under classical Godet analysis (Godet, 2001), but suffer severe dissipation (\u03a9 > 30%) due to opposing balancing loops. This corresponds to the \u2018Fixes that Fail\u2019 and \u2018Limits to Growth\u2019 system archetypes (Senge, 1990, pp. 103\u2013145; Meadows, 2008, pp. 112\u2013145). The balancing loops generating ambiguity often represent: (a) organizational resistance to change (Kotter, 1996); (b) resource constraints that re-emerge after superficial fixes (Sterman, 2000); (c) cultural norms resisting innovation (Schein, 2010). Before intervening, leadership must first dismantle the resistance loops \u2014 this is a PREREQUISITE condition, not optional.`
            : `ADVERTENCIA DIRECTIVA: Parecen grandes motores en el MICMAC cl\u00e1sico de Godet (Godet, 2001), pero sufren una severa p\u00e9rdida por cancelaci\u00f3n de bucles opuestos (\u03a9 elevado > 30%). Esto corresponde a los arquetipos sist\u00e9micos \u2018Soluciones que Fracasan\u2019 y \u2018L\u00edmites al Crecimiento\u2019 (Senge, 1990, pp. 103\u2013145; Meadows, 2008, pp. 112\u2013145). Los bucles equilibradores que generan ambig\u00fcedad representan frecuentemente: (a) resistencia organizacional al cambio (Kotter, 1996); (b) restricciones de recursos que reemergen tras soluciones superficiales (Sterman, 2000); (c) normas culturales que resisten la innovaci\u00f3n (Schein, 2010). Destrabar los bucles de resistencia es una condici\u00f3n PREVIA, no un complemento opcional.`
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({ text: isEn ? "\uD83D\uDD04 Positive Self-Loops (Snowball / Virtuous Cycle Effect): " : "\uD83D\uDD04 Bucles Propios Expansivos (Ciclo Virtuoso / Efecto Bola de Nieve): ", bold: true, color: "0284C7" }),
        new TextRun({ text: (amplificadores.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None' : 'Ninguno')) + '. ' }),
        new TextRun({
          text: isEn
            ? `F > 0 (75th percentile): These nodes return energy amplified through reinforcing loops across the network \u2014 Senge\u2019s \u2018Virtuous Cycle\u2019 archetype (Senge, 1990, pp. 77\u201389). Once triggered, they compound over time. Strategic implication: Use as \u2018seed variables\u2019 for a positive tipping point. If combined with master levers, the system can self-amplify toward desired outcomes without continuous external pressure (Meadows, 2008).`
            : `F > 0 (percentil 75): Estos nodos retornan energ\u00eda amplificada a trav\u00e9s de bucles reforzadores de la red \u2014 el arquetipo del \u2018Ciclo Virtuoso\u2019 de Senge (1990, pp. 77\u201389). Una vez activados, se componen a lo largo del tiempo. Implicaci\u00f3n estrat\u00e9gica: Usarlos como \u2018variables semilla\u2019 para un punto de inflexi\u00f3n positivo. Combinados con palancas maestras, el sistema puede auto-amplificarse hacia los resultados deseados sin presi\u00f3n externa continua (Meadows, 2008).`
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({ text: isEn ? "\uD83D\uDEE1 Stabilizer Nodes (Negative Self-Loops, Q1): " : "\uD83D\uDEE1 Nodos Estabilizadores (Bucles Propios Negativos, Q1): ", bold: true, color: "7C3AED" }),
        new TextRun({ text: (estabilizadores.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None' : 'Ninguno')) + '. ' }),
        new TextRun({
          text: isEn
            ? `F < 0 (25th percentile): These variables act as internal stabilizers or shock absorbers. They naturally resist deviation from equilibrium. From control theory (Sterman, 2000, pp. 96\u2013110), they represent \u2018goal-seeking feedback loops\u2019 providing system homeostasis. Strategic implication: Do not try to amplify them \u2014 leverage their stabilizing role to buffer shocks while levers are activated.`
            : `F < 0 (percentil 25): Estas variables act\u00faan como estabilizadores internos o amortiguadores de choques. Resisten naturalmente la desviaci\u00f3n del equilibrio. Desde la teor\u00eda de control (Sterman, 2000, pp. 96\u2013110), representan \u2018bucles buscadores de meta\u2019 que proveen homeostasis sist\u00e9mica. Implicaci\u00f3n estrat\u00e9gica: No intentar amplificarlos \u2014 aprovechar su rol estabilizador para amortiguar choques mientras se activan las palancas.`
        })
      ]
    })
  );

  // Tabla comparativa completa
  const dynHeaders = isEn
    ? ["No.", "Code", "Variable Name", "Classic Mot", "Net Mot", "Ambiguity Ω", "Self-Loop F", "Dynamic Quadrant", "Strategic Diagnosis"]
    : ["N°", "Cód", "Nombre Variable", "Mot. Clásica", "Mot. Neta", "Ambigüedad Ω", "Bucle F", "Cuadrante Dinámico", "Diagnóstico Estratégico"];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderLight,
      rows: [
        new TableRow({
          tableHeader: true,
          children: dynHeaders.map(h => new TableCell({
            shading: { fill: "1E293B" },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 17 })] })]
          }))
        }),
        ...dynamicRows.map((r, idx) => new TableRow({
          children: [
            (idx + 1).toString(),
            r.v.code,
            r.v.name,
            r.mc.toFixed(1),
            r.mn.toFixed(2),
            `${r.om_i.toFixed(1)} %`,
            `${r.f_i >= 0 ? '+' : ''}${r.f_i.toFixed(2)}`,
            r.quadName,
            r.esPalanca ? (isEn ? "★ Master Lever" : "★ Palanca Maestra") : (r.esTrampa ? (isEn ? "⚠ Policy Trap" : "⚠ Trampa Política") : (isEn ? "Regular" : "Evolución Regular"))
          ].map((cText, cIdx) => new TableCell({
            shading: { fill: idx % 2 === 0 ? "F8FAFC" : "FFFFFF" },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: cIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
              children: [new TextRun({
                text: cText,
                bold: cIdx === 0 || cIdx === 1 || cIdx === 8,
                color: cIdx === 8 && cText.includes("★") ? "059669" : (cIdx === 8 && cText.includes("⚠") ? "E11D48" : "1F2937"),
                size: 16
              })]
            })]
          }))
        }))
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
          text: isEn ? "4. DYNAMIC SIMULATION & TEMPORAL TRAJECTORIES" : "4. SIMULACIÓN TEMPORAL Y DINÁMICA DE TRAYECTORIAS",
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

  // 6. FUNDAMENTOS TEÓRICO-METODOLÓGICOS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 100 },
      children: [new TextRun({ text: isEn ? "6. THEORETICAL & METHODOLOGICAL FOUNDATIONS" : "6. FUNDAMENTOS TE\u00d3RICO-METODOL\u00d3GICOS", bold: true, size: 28, color: "1E3A8A" })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "6.1 Classical MICMAC (Godet, 1994; Godet & Durance, 2011)" : "6.1 MICMAC Cl\u00e1sico (Godet, 1994; Godet & Durance, 2011)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: isEn
        ? "Developed by Michel Godet at LIPSOR (Paris), MICMAC classifies variables on a motricity-dependence plane via matrix power iteration B = A + A\u00b2 + A\u00b3 + \u2026 The fundamental limitation is that Perron-Frobenius theory guarantees collapse onto the dominant eigenvector at high powers, erasing structural nuances (Bonacich, 1987). Quadrant classification: (I) Motrices/Power: high motricity, low dep. \u2014 upstream levers; (II) Clave/Conflict: high both \u2014 strategic pivot, volatile; (III) Resultado/Dependent: high dep., low motricity \u2014 outcome KPIs; (IV) Aut\u00f3nomas/Auto: low both \u2014 decoupled, exclude from priority action."
        : "Desarrollado por Michel Godet en el LIPSOR (Par\u00eds), MICMAC clasifica variables en un plano motricidad-dependencia v\u00eda iteraci\u00f3n de potencias matriciales B = A + A\u00b2 + A\u00b3 + \u2026 La limitaci\u00f3n fundamental es que el teorema de Perron-Frobenius garantiza el colapso sobre el autovector dominante a altas potencias, borrando los matices estructurales (Bonacich, 1987). Clasificaci\u00f3n de cuadrantes: (I) Motrices/Poder: alta motricidad, baja dep. \u2014 palancas aguas arriba; (II) Clave/Conflicto: alta ambas \u2014 pivote estrat\u00e9gico, vol\u00e1til; (III) Resultado/Dependiente: alta dep., baja motricidad \u2014 KPIs de resultado; (IV) Aut\u00f3nomas/Auto: baja ambas \u2014 desacopladas, excluir de acci\u00f3n prioritaria." })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "6.2 Katz-Bonacich Spectral Resolvent (Katz, 1953; Bonacich, 1987; Leontief, 1951)" : "6.2 Resolvente Espectral de Katz-Bonacich (Katz, 1953; Bonacich, 1987; Leontief, 1951)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: isEn
        ? `S = \u03b1W + \u03b1\u00b2W\u00b2 + \u2026 = \u03b1(I \u2212 \u03b1W)\u207b\u00b9W, converges iff \u03b1 < 1/\u03c1(W). Equivalent to Leontief inverse (I\u2212A)\u207b\u00b9 in Input-Output Economics (Leontief, 1951). Current \u03b1\u00b7\u03c1 = ${alphaRatio.toFixed(3)} (${alphaRatio < 1 ? 'STABLE' : 'UNSTABLE \u2014 interpret with caution'}). Preserves all structural heterogeneity without collapsing onto the dominant mode \u2014 the key mathematical advantage over classical MICMAC.`
        : `S = \u03b1W + \u03b1\u00b2W\u00b2 + \u2026 = \u03b1(I \u2212 \u03b1W)\u207b\u00b9W, converge sii \u03b1 < 1/\u03c1(W). Equivalente a la inversa de Leontief (I\u2212A)\u207b\u00b9 en Econom\u00eda de Insumo-Producto (Leontief, 1951). \u03b1\u00b7\u03c1 actual = ${alphaRatio.toFixed(3)} (${alphaRatio < 1 ? 'ESTABLE' : 'INESTABLE \u2014 interpretar con cautela'}). Preserva toda la heterogeneidad estructural sin colapsar sobre el modo dominante \u2014 la ventaja matem\u00e1tica clave sobre el MICMAC cl\u00e1sico.` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "6.3 Temporal Friction & Implementation Delays (Sterman, 2000; Richardson, 1991)" : "6.3 Fricci\u00f3n Temporal y Retardos de Implementaci\u00f3n (Sterman, 2000; Richardson, 1991)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 60 },
      children: [new TextRun({ text: isEn
        ? `\u03c9\u1d62\u1d63 = exp(\u2212\u03bb\u00b7t\u1d62\u1d63). Effective matrix W\u1d49\u1da0\u1da0 = W \u2299 \u03a9 (Hadamard product). Current \u03bb = ${simLambda}. High-\u03bb pairs lose influence rapidly; low-\u03bb pairs maintain structural importance across long horizons. This formally captures Sterman\u2019s (2000) policy resistance due to implementation lags, and aligns with Richardson\u2019s (1991) feedback thought tradition.`
        : `\u03c9\u1d62\u1d63 = exp(\u2212\u03bb\u00b7t\u1d62\u1d63). Matriz efectiva W\u1d49\u1da0\u1da0 = W \u2299 \u03a9 (producto de Hadamard). \u03bb actual = ${simLambda}. Los pares con \u03bb alto pierden influencia r\u00e1pidamente; los pares con \u03bb bajo mantienen importancia estructural en horizontes largos. Esto captura formalmente la resistencia pol\u00edtica por retardos de implementaci\u00f3n de Sterman (2000) y se alinea con la tradici\u00f3n de retroalimentaci\u00f3n de Richardson (1991).` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [new TextRun({ text: isEn ? "6.4 Signed Polarity & Feedback Loop Ambiguity (Meadows, 2008; Senge, 1990)" : "6.4 Polaridad con Signo y Ambig\u00fcedad de Bucles de Retroalimentaci\u00f3n (Meadows, 2008; Senge, 1990)", bold: true, color: "1D4ED8", size: 20 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 120 },
      children: [new TextRun({ text: isEn
        ? `\u03a9 = |M_brute_pos \u2212 M_brute_neg| / M_brute_total \u00d7 100%. High \u03a9 = 'fixes that fail' archetype (Meadows, 2008, pp. 112\u2013145). Classical Godet uses |W|, erasing this distinction. The signed extension reveals which variables are contested by competing feedback loops \u2014 the systemic archetype Senge (1990) identifies as 'policy resistance' and 'limits to growth'. Mean system ambiguity \u03a9\u0304 = ${meanOmega.toFixed(1)}%.`
        : `\u03a9 = |M_bruta_pos \u2212 M_bruta_neg| / M_bruta_total \u00d7 100%. \u03a9 elevado = arquetipo 'soluciones que fracasan' (Meadows, 2008, pp. 112\u2013145). El MICMAC cl\u00e1sico de Godet usa |W|, borrando esta distinci\u00f3n. La extensi\u00f3n con signo revela qu\u00e9 variables est\u00e1n disputadas por bucles de retroalimentaci\u00f3n competidores \u2014 el arquetipo sist\u00e9mico que Senge (1990) identifica como 'resistencia pol\u00edtica' y 'l\u00edmites al crecimiento'. Ambig\u00fcedad media del sistema \u03a9\u0304 = ${meanOmega.toFixed(1)}%.` })]
    })
  );

  // 7. HOJA DE RUTA ESTRATÉGICA POR HORIZONTE TEMPORAL
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: isEn ? "7. STRATEGIC ROADMAP — PHASED POLICY RECOMMENDATIONS" : "7. HOJA DE RUTA ESTRAT\u00c9GICA \u2014 RECOMENDACIONES POR HORIZONTE TEMPORAL", bold: true, size: 28, color: "1E3A8A" })]
    }),
    new Paragraph({
      spacing: { before: 60, after: 40 },
      children: [new TextRun({ text: isEn ? "Short Term (0\u201312 months): Structural Foundations" : "Corto Plazo (0\u201312 meses): Cimientos Estructurales", bold: true, color: "059669", size: 22 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 80 },
      children: [new TextRun({ text: isEn
        ? `1. Sequencing before resource injection: Never push Policy Traps (${trampas.map(v=>v.code).join(', ')||'N/A'}) without first resolving resistance loops (Sterman, 2000, p. 5; Kotter, 1996). 2. Prioritize Master Levers (${palancas.map(v=>v.code).join(', ')||'N/A'}): allocate 70\u201380% of budget and executive attention \u2014 low \u03a9 guarantees efficient causal transmission (Meadows, 1999; Bonacich, 1987). 3. Activate reinforcing seed nodes (${amplificadores.map(v=>v.code).join(', ')||'N/A'}): small early wins compound through virtuous cycles (Senge, 1990, p. 88).`
        : `1. Secuenciaci\u00f3n antes de inyectar recursos: No presionar Trampas de Pol\u00edtica (${trampas.map(v=>v.code).join(', ')||'N/A'}) sin haber resuelto primero los bucles de resistencia (Sterman, 2000, p. 5; Kotter, 1996). 2. Priorizar Palancas Maestras (${palancas.map(v=>v.code).join(', ')||'N/A'}): asignar 70\u201380% del presupuesto y atenci\u00f3n ejecutiva \u2014 el bajo \u03a9 garantiza transmisi\u00f3n causal eficiente (Meadows, 1999; Bonacich, 1987). 3. Activar nodos semilla reforzadores (${amplificadores.map(v=>v.code).join(', ')||'N/A'}): peque\u00f1as victorias tempranas se componen mediante ciclos virtuosos (Senge, 1990, p. 88).` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: isEn ? "Medium Term (1\u20133 years): Systemic Momentum" : "Mediano Plazo (1\u20133 a\u00f1os): Momentum Sist\u00e9mico", bold: true, color: "D97706", size: 22 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 80 },
      children: [new TextRun({ text: isEn
        ? `4. Dismantle resistance loops: Address balancing loops generating \u03a9 in trap variables \u2014 organizational (Kotter, 1996), cultural (Schein, 2010), or resource-based (Sterman, 2000). Beware 'Shifting the Burden' archetype (Senge, 1990, pp. 103\u2013117). 5. Monitor strategic/critical variables (${enlaceClas.join(', ')||'N/A'}): their high interactivity demands real-time feedback dashboards (OECD, 2010). 6. Use simulation timing data (Section 5) to anticipate peak displacement windows and prepare organizational capacity for delayed effects (Sterman, 2000, Chapter 11).`
        : `4. Desactivar bucles de resistencia: Abordar bucles equilibradores que generan \u03a9 en variables trampa \u2014 organizacionales (Kotter, 1996), culturales (Schein, 2010) o basados en recursos (Sterman, 2000). Precauci\u00f3n: arquetipo 'Desplazando la Carga' (Senge, 1990, pp. 103\u2013117). 5. Monitorear variables estrat\u00e9gicas/cr\u00edticas (${enlaceClas.join(', ')||'N/A'}): su alta interactividad exige dashboards de retroalimentaci\u00f3n en tiempo real (OCDE, 2010). 6. Usar datos de temporalizaci\u00f3n de simulaci\u00f3n (Secci\u00f3n 5) para anticipar ventanas de desplazamiento m\u00e1ximo y preparar capacidad organizacional para efectos retardados (Sterman, 2000, Cap\u00edtulo 11).` })]
    }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: isEn ? "Long Term (3\u201310 years): Structural Transformation" : "Largo Plazo (3\u201310 a\u00f1os): Transformaci\u00f3n Estructural", bold: true, color: "7C3AED", size: 22 })]
    }),
    new Paragraph({
      spacing: { before: 30, after: 120 },
      children: [new TextRun({ text: isEn
        ? `7. Continuous monitoring via result variables (${dependientesClas.join(', ')||'N/A'}): establish periodic evaluations aligned with \u03bb = ${simLambda} friction rate (OECD, 2010; Senge, 1990). 8. Annual recalibration of W matrix: as causal relationships evolve, the spectral structure changes (Godet & Durance, 2011). Previously trapped variables may become levers and vice versa \u2014 this structural learning is fundamental (Sterman, 2000). 9. Structural learning & scenario planning: use the extended MICMAC as a shared mental model (Senge, 1990, pp. 174\u2013204) for strategic dialogue. Regular scenario exercises reveal possible evolutionary trajectories (Godet & Durance, 2011; Schwartz, 1991).`
        : `7. Monitoreo continuo v\u00eda variables de resultado (${dependientesClas.join(', ')||'N/A'}): establecer evaluaciones peri\u00f3dicas alineadas con tasa de fricci\u00f3n \u03bb = ${simLambda} (OCDE, 2010; Senge, 1990). 8. Recalibraci\u00f3n anual de la matriz W: a medida que las relaciones causales evolucionan, la estructura espectral cambia (Godet & Durance, 2011). Variables previamente atrapadas pueden convertirse en palancas y viceversa \u2014 este aprendizaje estructural es fundamental (Sterman, 2000). 9. Aprendizaje estructural y planificaci\u00f3n de escenarios: usar el MICMAC extendido como modelo mental compartido (Senge, 1990, pp. 174\u2013204) para el di\u00e1logo estrat\u00e9gico. Los ejercicios de escenarios regulares revelan posibles trayectorias evolutivas (Godet & Durance, 2011; Schwartz, 1991).` })]
    })
  );

  // 8. LIMITACIONES Y SUPUESTOS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: isEn ? "8. LIMITATIONS, ASSUMPTIONS & VALIDITY CONDITIONS" : "8. LIMITACIONES, SUPUESTOS Y CONDICIONES DE VALIDEZ", bold: true, size: 28, color: "1E3A8A" })]
    }),
    new Paragraph({
      spacing: { before: 60, after: 100 },
      children: [new TextRun({ text: isEn
        ? `(1) Linearity: MICMAC assumes linear causal relationships. Non-linear thresholds and chaotic dynamics (Lorenz, 1963) are not captured. Complement with Agent-Based Modeling or full System Dynamics simulation (Sterman, 2000) for highly non-linear systems. (2) Expert elicitation bias: W\u1d62\u2c7c values are expert judgments subject to anchoring, availability heuristic, and groupthink (Kahneman, 2011; Montibeller & von Winterfeldt, 2015). Triangulate with empirical data (time series, meta-analysis). (3) Convergence condition: mathematical validity requires \u03b1\u00b7\u03c1(|W|) = ${alphaRatio.toFixed(3)} < 1 \u2014 ${alphaRatio < 1 ? 'SATISFIED' : 'VIOLATED \u2014 results are mathematically invalid without parameter correction'}. (4) Static structure: W is assumed stable over the analysis horizon. In VUCA environments, reassess more frequently (Godet & Durance, 2011). (5) Delay estimates: t\u1d62\u1d63 parameters are estimated; sensitivity analysis by varying \u03bb and individual delays is recommended (Sterman, 2000, Chapter 21).`
        : `(1) Linealidad: MICMAC asume relaciones causales lineales. Los umbrales no lineales y la din\u00e1mica ca\u00f3tica (Lorenz, 1963) no se capturan. Complementar con Modelado Basado en Agentes o simulaci\u00f3n de Flujos y Acervos (Sterman, 2000) para sistemas altamente no lineales. (2) Sesgo de elicitaci\u00f3n experta: los valores W\u1d62\u1d63 son juicios expertos sujetos a anclaje, heur\u00edstica de disponibilidad y pensamiento grupal (Kahneman, 2011; Montibeller & von Winterfeldt, 2015). Triangular con datos emp\u00edricos (series temporales, meta-an\u00e1lisis). (3) Condici\u00f3n de convergencia: validez matem\u00e1tica requiere \u03b1\u00b7\u03c1(|W|) = ${alphaRatio.toFixed(3)} < 1 \u2014 ${alphaRatio < 1 ? 'SATISFECHA' : 'VIOLADA \u2014 resultados matem\u00e1ticamente inv\u00e1lidos sin correcci\u00f3n de par\u00e1metros'}. (4) Estructura est\u00e1tica: se asume W estable en el horizonte de an\u00e1lisis. En entornos VUCA, reevaluar con mayor frecuencia (Godet & Durance, 2011). (5) Estimaciones de retardo: los par\u00e1metros t\u1d62\u1d63 son estimados; se recomienda an\u00e1lisis de sensibilidad variando \u03bb y retardos individuales (Sterman, 2000, Cap\u00edtulo 21).` })]
    })
  );

  // 9. REFERENCIAS BIBLIOGRÁFICAS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: isEn ? "9. BIBLIOGRAPHIC REFERENCES (APA 7th ed.)" : "9. REFERENCIAS BIBLIOGR\u00c1FICAS (APA 7.\u00aa ed.)", bold: true, size: 28, color: "1E3A8A" })]
    })
  );
  const biblioRefs = [
    "Barab\u00e1si, A.-L. (2016). Network science. Cambridge University Press. http://networksciencebook.com",
    "Bonacich, P. (1987). Power and centrality: A family of measures. American Journal of Sociology, 92(5), 1170\u20131182. https://doi.org/10.1086/228631",
    "Godet, M. (1994). De la anticipation \u00e0 l\u2019action: Manuel de prospective et de strat\u00e9gie. Dunod.",
    "Godet, M. (2001). Creating futures: Scenario planning as a strategic management tool. Economica.",
    "Godet, M. & Durance, P. (2011). La prospective strat\u00e9gique pour les entreprises et les territoires. Dunod/UNESCO.",
    "Kahneman, D. (2011). Thinking, fast and slow. Farrar, Straus and Giroux.",
    "Katz, L. (1953). A new status index derived from sociometric analysis. Psychometrika, 18(1), 39\u201343. https://doi.org/10.1007/BF02289026",
    "Kotter, J. P. (1996). Leading change. Harvard Business School Press.",
    "Leontief, W. (1951). The structure of the American economy, 1919\u20131939: An empirical application of equilibrium analysis (2nd ed.). Oxford University Press.",
    "Lorenz, E. N. (1963). Deterministic nonperiodic flow. Journal of the Atmospheric Sciences, 20(2), 130\u2013141.",
    "Meadows, D. H. (1999). Leverage points: Places to intervene in a system. Sustainability Institute.",
    "Meadows, D. H. (2008). Thinking in systems: A primer (D. Wright, Ed.). Chelsea Green Publishing.",
    "Montibeller, G. & von Winterfeldt, D. (2015). Cognitive and motivational biases in decision and risk analysis. Risk Analysis, 35(7), 1230\u20131251. https://doi.org/10.1111/risa.12360",
    "OECD. (2010). Glossary of key terms in evaluation and results-based management. OECD/DAC.",
    "Richardson, G. P. (1991). Feedback thought in social science and systems theory. University of Pennsylvania Press.",
    "Schein, E. H. (2010). Organizational culture and leadership (4th ed.). Jossey-Bass.",
    "Schwartz, P. (1991). The art of the long view: Planning for the future in an uncertain world. Doubleday.",
    "Senge, P. M. (1990). The fifth discipline: The art and practice of the learning organization. Doubleday/Currency.",
    "Sterman, J. D. (2000). Business dynamics: Systems thinking and modeling for a complex world. Irwin/McGraw-Hill.",
    "von Luxburg, U. (2007). A tutorial on spectral clustering. Statistics and Computing, 17(4), 395\u2013416. https://doi.org/10.1007/s11222-007-9033-z"
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
