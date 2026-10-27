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
      spacing: { before: 60, after: 120 },
      children: [
        new TextRun({
          text: isEn
            ? "This strategic prospective report evaluates the institutional system through an extended MICMAC methodology, overcoming the historical mathematical limits of the traditional Godet method. By incorporating the Katz-Bonacich spectral resolvent operator, continuous time friction discount, and signed loop polarity, the system reveals hidden systemic contradictions and identifies the optimal levers for intervention."
            : "El presente informe prospectivo evalúa el sistema institucional a través de la metodología MICMAC extendida, superando las limitaciones matemáticas del enfoque tradicional de Michel Godet. Al incorporar el operador resolvente de Katz-Bonacich, el descuento por fricción temporal continuo y la polaridad con signo de los bucles causales, el análisis devela contradicciones sistémicas ocultas y define los puntos óptimos de apalancamiento."
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

  // Interpretación de Palancas y Trampas
  children.push(
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [
        new TextRun({
          text: isEn ? "Strategic Diagnostic Findings (Levers & Traps):" : "Hallazgos Estratégicos Críticos (Palancas Maestras y Trampas):",
          bold: true,
          color: "1E3A8A",
          size: 20
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "★ Consistent Master Levers: " : "★ Palancas Maestras Consistentes: ", bold: true, color: "059669" }),
        new TextRun({ text: palancas.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None identified' : 'Ninguna identificada') + '. ' }),
        new TextRun({
          text: isEn
            ? "CRITICAL RECOMMENDATION: These variables exhibit high Net Motricity and low Ambiguity (Ω). Their causal paths are coherent and free from destructive internal pushback. They should receive 70-80% of leadership focus and budget allocation."
            : "RECOMENDACIÓN CLAVE: Estas variables exhiben alta Motricidad Neta Efectiva y baja Ambigüedad (Ω reducido). Su señal viaja limpia sin cancelarse en la red. Deben constituir el núcleo del presupuesto y la gestión directiva."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({ text: isEn ? "⚠ Policy Traps & Causal Mirages: " : "⚠ Trampas de Política y Espejismos Causales: ", bold: true, color: "E11D48" }),
        new TextRun({ text: trampas.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None detected' : 'Ninguna detectada') + '. ' }),
        new TextRun({
          text: isEn
            ? "EXECUTIVE WARNING: These variables appear highly motrice under classical Godet analysis, but suffer severe dissipation (Ω > 30%) due to opposing balancing loops. Pushing them in isolation triggers organizational resistance and heavy costs with near-zero net payoff. Before intervening, leadership must first dismantle the resistance loops."
            : "ADVERTENCIA DIRECTIVA: Parecen grandes motores en el MICMAC clásico de Godet, pero sufren una severa pérdida por fricción y cancelación de bucles opuestos (elevado Ω). Invertir recursos masivos en ellas de forma aislada genera frustración y sobrecostos. Se requiere destrabar previamente la cultura y resistencias antes de presionarlas."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({ text: isEn ? "🔄 Positive Self-Loops (Snowball Effect): " : "🔄 Bucles Propios Expansivos (Efecto Bola de Nieve): ", bold: true, color: "0284C7" }),
        new TextRun({ text: amplificadores.map(v => `${v.code} (${v.name})`).join(', ') || (isEn ? 'None' : 'Ninguno') + '. ' }),
        new TextRun({
          text: isEn
            ? "These nodes have F > 0: any investment returns amplified through reinforcing loops across the academic and organizational network."
            : "Presentan F > 0: la energía inyectada retorna amplificada al punto de partida a través de cadenas docentes y de experiencia institucional."
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

  // 6. HOJA DE RUTA Y CONCLUSIONES ESTRATÉGICAS
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: isEn ? "5. STRATEGIC ROADMAP & POLICY RECOMMENDATIONS" : "5. HOJA DE RUTA Y RECOMENDACIONES DE POLÍTICA INSTITUCIONAL",
          bold: true,
          size: 28,
          color: "1E3A8A"
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: isEn
            ? "1. Sequence Before Injecting Resources: Never attempt isolated pushes on Policy Traps without first resolving underlying cultural resistance and operational bottlenecks."
            : "1. Secuenciación Estratégica: No intervenir de manera aislada en las Trampas de Política sin haber desactivado previamente las resistencias culturales y los cuellos de botella organizacionales."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({
          text: isEn
            ? "2. Concentrate Budget on Consistent Levers: Focus institutional capital and execution capacity on identified master levers, which guarantee maximum net impact with minimal dissipation."
            : "2. Concentración Presupuestaria en Palancas Maestras: Dirigir el esfuerzo financiero e institucional prioritariamente hacia las Palancas Maestras Consistentes, garantizando el máximo retorno con mínima disipación causal."
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: isEn
            ? "3. Continuous Monitoring: Track dependent result variables as early-warning barometers, establishing periodic evaluations aligned with the calculated time friction rate (λ)."
            : "3. Monitoreo Continuo y Barómetro de Resultados: Evaluar periódicamente las variables del cuadrante de salida como indicadores de éxito, calibrando el ritmo de avance según la tasa de fricción temporal (λ)."
        })
      ]
    })
  );

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
