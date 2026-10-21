/* Ejemplo genérico editable: Transformación digital de una institución educativa.
   Cada vínculo trae: concepto (mecanismo causal), evidencia práctica observable e indicador sugerido
   para verificarlo con datos propios. Reemplace por sus variables y evidencias reales. */
const DEFAULT_VARS = [
  ['LID', 'Liderazgo directivo', 'Capacidad de la dirección de fijar prioridades, patrocinar proyectos y comunicar el rumbo.', 60],
  ['INV', 'Inversión y presupuesto', 'Recursos económicos disponibles para tecnología, formación y mantenimiento.', 50],
  ['INF', 'Infraestructura tecnológica', 'Plataformas, conectividad, equipos y soporte técnico.', 45],
  ['COM', 'Competencias docentes', 'Dominio pedagógico y digital del cuerpo docente.', 40],
  ['CUL', 'Cultura de innovación', 'Disposición colectiva a experimentar, compartir y aprender de errores.', 40],
  ['EXP', 'Experiencia estudiantil', 'Calidad percibida del aprendizaje y de los servicios.', 50],
  ['RES', 'Resistencia al cambio', 'Oposición activa o pasiva a nuevas formas de trabajo.', 60],
  ['RET', 'Retención estudiantil', 'Proporción de estudiantes que continúan sus estudios.', 55],
  ['NOR', 'Normativa y acreditación', 'Exigencias externas de calidad y regulación (variable exógena).', 50]
];

/* [origen, destino, valor(-3..3), concepto, evidencia práctica, indicador] */
const DEFAULT_LINKS = [
  ['LID','INV',3,'Teoría de agencia / poder de asignación: quien decide las prioridades controla el flujo de recursos. Relación directa e inmediata.','Los proyectos con patrocinio directivo explícito se financian primero; los que no lo tienen quedan en lista de espera presupuestaria.','% del presupuesto de TI aprobado a proyectos con patrocinador directivo'],
  ['LID','CUL',3,'Los líderes modelan valores: la cultura es en gran parte el comportamiento que la dirección premia o tolera (Schein).','Instituciones donde la dirección participa en pilotos y reconoce públicamente los intentos fallidos muestran más iniciativas docentes espontáneas.','N.º de iniciativas docentes nuevas por semestre'],
  ['LID','RES',-2,'Gestión del cambio (Kotter): una visión clara y urgencia comunicada reduce la resistencia, pero no la elimina.','Cuando el rector explica el “por qué” del cambio en reuniones con docentes, bajan las objeciones formales; persiste una minoría opositora.','Encuesta de aceptación del cambio (escala 1-5)'],
  ['LID','COM',2,'La dirección prioriza (o no) tiempo y programas de formación; el efecto es relevante pero depende del presupuesto y la cultura.','Se asignan horas de descarga para capacitación solo si la dirección lo define en el plan anual.','Horas de formación docente por año'],
  ['INV','INF',3,'Función de producción: la infraestructura es capital que solo se crea o mantiene con inversión. Efecto directo y casi sin sustitutos.','Sin partida de renovación, la conectividad y los equipos envejecen; con ella, el tiempo de caída de servicios disminuye.','Disponibilidad de plataforma (%) vs. inversión anual'],
  ['INV','COM',2,'Capital humano: la inversión financia cursos, licencias y asesoría pedagógica. Efecto moderado porque también influye la motivación.','Presupuestos de formación mayores se asocian a más docentes certificados, aunque con retorno rezagado.','% de docentes certificados en competencias digitales'],
  ['INV','EXP',1,'Efecto indirecto: el dinero mejora la experiencia solo mediante infraestructura y docentes.','Mejoras de servicios menores (biblioteca, wifi en zonas comunes) tienen impacto visible pero acotado.','Satisfacción con servicios (encuesta)'],
  ['INF','EXP',3,'Calidad de servicio: la disponibilidad y usabilidad de plataformas condiciona directamente el acceso al aprendizaje.','Caídas del aula virtual en periodos de evaluación generan reclamos inmediatos y caída en la satisfacción.','Incidentes de plataforma y NPS estudiantil'],
  ['INF','COM',1,'Facilita la práctica: sin herramientas no se desarrollan competencias, pero las herramientas por sí solas no las generan.','Docentes con buen equipamiento usan más recursos digitales, pero el salto de calidad depende de la formación.','Uso semanal de la plataforma por docente'],
  ['INF','RET',1,'Efecto lejano: la infraestructura evita deserción por barreras de acceso (conectividad), sobre todo en modalidades virtuales.','Estudiantes sin acceso estable a plataforma abandonan con más frecuencia en programas a distancia.','Deserción en programas virtuales vs. presenciales'],
  ['INF','CUL',1,'Las herramientas habilitan prácticas colaborativas, pero la cultura depende sobre todo de las personas.','Espacios y herramientas de co-creación aumentan la colaboración solo si hay incentivos.','N.º de proyectos interdisciplinarios'],
  ['COM','EXP',3,'El docente es el principal mediador de la experiencia de aprendizaje (efecto directo, fuerte y poco sustituible).','Cursos con docentes formados en diseño instruccional obtienen mejores evaluaciones estudiantiles.','Evaluación docente por estudiantes'],
  ['COM','CUL',2,'Docentes competentes y seguros comparten prácticas y se convierten en referentes que difunden la innovación.','Comunidades de práctica surgen donde hay docentes líderes con dominio técnico.','Participación en comunidades de práctica'],
  ['COM','RES',-2,'La resistencia nace en parte de la inseguridad; mayor dominio reduce el temor a nuevas herramientas (autoeficacia, Bandura).','Tras talleres prácticos, baja el rechazo declarado a usar la plataforma.','Reportes de rechazo / solicitudes de excepción'],
  ['CUL','COM',2,'Una cultura de aprendizaje impulsa la autoformación y el intercambio entre pares.','En departamentos con cultura colaborativa, los docentes se capacitan sin que se los obligue.','Cursos tomados voluntariamente'],
  ['CUL','RES',-3,'La resistencia es en esencia un fenómeno cultural; una cultura que valora experimentar la neutraliza de forma fuerte y persistente.','Equipos con tradición de pilotos adoptan cambios con menor fricción incluso con liderazgo débil.','Tiempo de adopción de una nueva herramienta'],
  ['CUL','EXP',1,'La cultura mejora la experiencia de forma indirecta, vía prácticas docentes.','Innovaciones locales aparecen en algunos cursos sin llegar a toda la institución.','Cursos con innovación documentada'],
  ['EXP','RET',3,'Teoría de integración de Tinto: la satisfacción y el compromiso académico son el predictor más directo de permanencia.','Los programas con mayor satisfacción estudiantil presentan menor abandono entre semestres.','Tasa de retención semestral vs. satisfacción'],
  ['EXP','LID',1,'Retroalimentación: los resultados percibidos refuerzan o debilitan la legitimidad y el respaldo del liderazgo.','Resultados positivos en encuestas se usan para sostener decisiones directivas; efecto lento.','Menciones de resultados en informes directivos'],
  ['RET','INV',2,'Modelo de ingresos por matrícula: más estudiantes que permanecen implican más recursos disponibles para inversión.','Los ciclos de menor deserción liberan presupuesto en el siguiente año fiscal.','Ingresos por matrícula y % destinado a inversión'],
  ['RET','LID',1,'La retención es un indicador clave que condiciona el respaldo del consejo a la dirección.','Cuando cae la retención, el consejo exige cambios en la gestión.','Decisiones del consejo asociadas a retención'],
  ['RES','COM',-2,'La resistencia frena la participación en formación y el uso de nuevas prácticas, aunque existan los recursos.','Docentes reacios no asisten a capacitaciones aun siendo gratuitas.','Asistencia a capacitaciones'],
  ['RES','CUL',-2,'Los opositores activos desalientan al resto y erosionan la confianza para experimentar (contagio social).','Rumores y críticas en reuniones frenan pilotos en el departamento.','Pilotos abandonados por oposición interna'],
  ['RES','INF',-1,'Retrasa la adopción de infraestructura ya instalada (subutilización), sin impedir su existencia.','Plataformas costosas permanecen con baja tasa de uso.','Tasa de uso / licencias activas'],
  ['NOR','LID',1,'Presión institucional (isomorfismo coercitivo): las exigencias externas orientan la agenda directiva, de modo débil y a mediano plazo.','Tras procesos de acreditación se incluyen líneas de transformación en el plan estratégico.','Objetivos del plan derivados de acreditación'],
  ['NOR','INV',1,'Las exigencias de acreditación justifican partidas específicas, pero rara vez las determinan por sí solas.','Aparecen rubros “de cumplimiento” en el presupuesto previo a visitas de pares.','Rubros presupuestarios por cumplimiento'],
  ['NOR','CUL',1,'La normativa propone prácticas de calidad que con el tiempo pueden internalizarse.','Rutinas de autoevaluación se mantienen aun fuera de ciclos de acreditación en algunas unidades.','Unidades con autoevaluación continua']
];

/* Retardos temporales estimados en años (t_ij) para fricción temporal */
const DEFAULT_DELAYS = {
  'LID>INV': 1.0, 'LID>CUL': 2.0, 'LID>RES': 1.5, 'LID>COM': 2.0,
  'INV>INF': 1.0, 'INV>COM': 2.0, 'INV>EXP': 1.5,
  'INF>EXP': 0.5, 'INF>COM': 1.5, 'INF>RET': 2.0, 'INF>CUL': 2.5,
  'COM>EXP': 1.0, 'COM>CUL': 2.0, 'COM>RES': 1.5,
  'CUL>COM': 2.0, 'CUL>RES': 2.0, 'CUL>EXP': 1.5,
  'EXP>RET': 1.0, 'EXP>LID': 3.0,
  'RET>INV': 1.5, 'RET>LID': 2.0,
  'RES>COM': 1.0, 'RES>CUL': 1.5, 'RES>INF': 1.0,
  'NOR>LID': 3.0, 'NOR>INV': 2.0, 'NOR>CUL': 3.0
};
