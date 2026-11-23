# Mi Cava — Roadmap Maestro
**Versión:** 2.9 — conciliación de UX-P01 a UX-P11 · **Fecha de corte:** 2026-11-23 · **Responsable de decisiones:** conversación ChatGPT `00 — Roadmap y decisiones de producto`

> Este archivo es un registro de producto y pendientes, no una autorización de implementación. Toda modificación de código, infraestructura, seguridad, datos o despliegue requiere análisis y aprobación separados. La información histórica está en conciliación: «por verificar» no significa «pendiente confirmado».

## Visión y principios
Mi Cava es una biblioteca personal de vinos, no solo un inventario. Permite guardar vinos, mantener stock, abrir botellas propias y registrar experiencias sin stock. Debe aprender de preferencias declaradas, favoritos, puntuaciones y consumos para ofrecer valor personalizado. Evolución: excelente Cava personal → inteligencia personal → Descubrir/social. Producto multiplataforma: web actual; aplicaciones Android e iOS como objetivo estratégico confirmado, sin fecha ni tecnología aprobadas. La Cava y los datos privados no se comparten por defecto. Recomendaciones comerciales futuras deberán distinguirse de las personales.

## Estado por frentes
| Frente | Estado al corte | Conversación |
|---|---|---|
| Etapa 5 — Abrir e historial | Cerrada y probada | 02 |
| Etapa 6 — UX y beta | Beta cerrada activa; validación continua | 03 |
| UX-20 — Guardar / tener / abrir / probar sin stock | Cerrada y en Producción | 03 / 00 |
| Etapa 7 — Inteligencia personal | En desarrollo por subetapas: 7.3 cerrada; 7.4 abierta para primera experiencia visible | 00 / 05.3 / 05.4 |
| Etapa 7.1 — Datos de inteligencia | Migración de modelo de inteligencia registrada como aplicada en Producción en revisión del 09/11/2026; validación y antecedentes documentados; conservar controles pendientes de seguridad por SEC-01 | 05 / 99 |
| Etapa 7.2 — Onboarding | **CERRADA 15/11/2026**. Migración 7.2-A aplicada/verificada; frontend 7.2-B publicado PR #7, merge f729c2f; Preview 14/14, Producción 6/6; monitoreo sin 4xx/5xx (cierre informado por usuario) | 05 |
| Etapa 7.3 — Inteligencia y conocimiento personal | **CERRADA 22/11/2026**. 7.3-A (base autenticada, contexto, candidatos y soporte de sesiones) y 7.3-B (conocimiento personal y evidencias); integración 23/23 Docker Desktop, PR #8, merge `9a804a9`, Producción READY; sin nuevas migraciones; escrituras de inferencias desactivadas | 00 / 05.3; soporte técnico 99 |
| Etapa 7.4 — «Elegir de mi cava» | **ABIERTA — diseño y desarrollo, publicación no autorizada**. Recomendar al entrar entre vinos con stock: una opción principal y hasta dos alternativas, refinamiento posterior; inicia medición | 00 / 05.4; soporte técnico 99 |
| UX-21 — Ajustes de vistas | Cerrada; merge en main y cuatro verificaciones de Producción informadas como OK | 03 / 00 |
| Etapa 7.5 — Otras puertas de «¿Qué tomo?» | Futuro: «Acompañar una comida» y «Quiero que me sorprendas» reservados para 7.5; sin implementación autorizada | 00 / 05.4 → futuro 05.5 |
| Etapa 8 — Descubrir | Futuro, no autorizado | 00 |
| Mobile — Android / iOS | Objetivo estratégico, ejecución sin programar | 00 / 99 |
| Legal, privacidad y marca | Frente paralelo activo | 04 |
| Metodología, infraestructura y seguridad | Frente paralelo activo | 99 |

## Registro central de pendientes
Estados posibles: **pendiente de evaluación**, **por verificar**, **en diseño**, **aprobado**, **en ejecución**, **cerrado**, **descartado**. Prioridad es de *revisión*, no autorización de implementación.

| ID | Tema | Origen | Estado | Prioridad | Dependencia / disparador | Conversación |
|---|---|---|---|---|---|---|
| UX-22 | Personalidad e interacción del onboarding: microinteracciones y respuestas visuales manteniendo elegancia | 7.2-B, validación 15/11/2026 (14/14 funcional) | Pendiente de evaluación; no bloqueó cierre de 7.2 | Media provisional | Feedback de testers | 05 / 03 |
| SEC-01 | Revisar hallazgos preexistentes de seguridad de Supabase/Auth; determinar exposición efectiva y medidas | Revisión previa a publicación 7.2, 15/11/2026 | Pendiente de análisis; sin cambios autorizados | Alta para análisis | Antes de ampliar beta; revisión técnica específica | 99 |
| DATA-01 | Normalización de origen: provincia vs región; Valle de Uco / Uco Valley / Mendoza | Etapas 6 y 7 | Pendiente de evaluación | Media | Cuando filtros o inteligencia requieran origen confiable | 05 / 99 |
| UX-P01 | Imagen principal clickeable para iniciar foto/galería | Feedback beta Etapa 6 | Implementado en código de main: superficie fotográfica abre selector cámara/galería; comportamiento táctil y accesibilidad por validar | Por definir | Verificar en móvil y teclado antes de cierre UX | 03 |
| UX-P02 | Miniatura de fotografía en revisión de datos | Feedback beta Etapa 6 | Implementado en código de main: imagen visible y ampliable en «Revisá los datos»; presentación en dispositivos por validar | Por definir | Prueba visual de alta real | 03 |
| UX-P03 | Navegación «Atrás» en alta de vino | Feedback beta Etapa 6 | Implementado en código de main: botón Atrás entre selección y revisión; conserva foto y borrador; prueba UX por validar | Por definir | Prueba de retroceso y preservación de datos | 03 |
| UX-P04 | Redundancia de «Prefiero cargar a mano» | Feedback beta Etapa 6 | Cambio implementado en main: carga manual solo como recuperación si falla IA; decisión de descubribilidad/accessibilidad por evaluar | Por definir | Validar caminos sin IA y con fallo; no concluir UX cerrada | 03 |
| UX-P05 | Fotografías con varias botellas | Feedback beta Etapa 6 | Implementado tratamiento en código de main: si IA indica múltiples vinos, solicita otra foto sin seleccionar uno arbitrariamente; respuesta de IA no validada aquí | Por definir | Prueba con foto real de varias etiquetas | 03 |
| UX-P06 | Ilustración/ícono de copa y consistencia visual | Feedback beta Etapa 5/6 | En código actual hay íconos Wine/placeholder; juicio de consistencia visual sin verificar | Por definir | Revisión visual con capturas / beta | 03 |
| UX-P07 | Tutorial inicial / globos de ayuda | Ideas Etapa 6 | Idea pendiente de evaluación, no deducir necesidad por existencia de onboarding | Baja provisional | Feedback de testers nuevos; evitar tutorial si no hace falta | 03 |
| UX-P08 | Consistencia de nombre «Mi Cava» vs «Cava Vinos» | Etapa 6 / marca | Pendiente por decisión de arquitectura marcaria M01; no confirmado conflicto en UI actual | Media | Conciliar marca M01 y textos visibles | 04 / 03 |
| UX-P09 | Refresco/loader al regresar a la app | Etapa 6 | Parcialmente abordado en main: recargas posteriores mantienen grilla visible y descartan resultados obsoletos; caso específico volver a pestaña/app sin probar | Por definir | Reproducir retorno a app, foco de pestaña y conectividad | 03 |
| UX-P10 | Historial global de consumos, además del historial por vino | Etapa 5/6 | No se verificó pantalla global; el código confirma «Tus experiencias» por vino; propuesta de historial global pendiente de evaluación | Baja provisional | Feedback y utilidad del acceso global | 03 / 00 |
| UX-P11 | Utilidad y presentación de favoritos, puntuaciones y comentarios | Etapas 5–7 | Capacidades presentes: corazón en ficha/vistas/filtro; promedio de puntuaciones derivado de consumos; experiencias por vino; utilidad con testers sigue en evaluación | Media | Medir uso real, sin cerrar por mera existencia de controles | 05 / 03 |
| PRIV-01 | Privacidad, acceso y posible marca de agua en fotos | Etapa 6 / frente legal | Pendiente de análisis en frente específico | Alta antes de compartir públicamente | Revisión de Storage y futuro Descubrir | 04 / 99 |
| LEG-01 | Términos, privacidad, cookies, tratamiento de imágenes y proveedores | Frente legal | En análisis | Alta antes de apertura amplia | Trabajo jurídico 04 | 04 |
| M01 | Protección de marcas Mi Cava / CavaVinos en Argentina | Frente 04.1 | En análisis; arancel de búsqueda fonética de MI CAVA clase 42 abonado 23/11/2026 (INV-006); búsqueda pendiente de acreditación/resultado; **no confundir búsqueda con solicitud de registro marcario** | Alta estratégica | Acreditación, resultado y evaluación de antecedentes → titular y estrategia de presentación | 04.1 |
| L01 | Estructura jurídica y titularidad de activos | Frente 04 | Futuro según secuencia aprobada | Media | Tras avance M01 | 04 |
| SOC-01 | Descubrir, Cavas compartidas, visibilidad y rol viewer | Roadmap | Futuro | Por definir | Después de consolidar valor personal y privacidad | 00 |
| MOB-01 | Aplicación móvil Android e iOS | Visión del producto | Objetivo confirmado; no iniciado | Estratégica, ejecución sin fecha | Evaluar momento tras validar producto | 00 / 99 |
| COM-01 | Recomendaciones de compra, bodegas/vinotecas y posible monetización | Visión Etapa 7+ | Futuro, sin autorización comercial | Por definir | Confianza, calidad del recomendador y separación de patrocinio | 00 / 05 |
| TECH-01 | Conciliar documentación, migraciones y baseline técnico | Auditoría histórica de octubre 2026 | **Parcialmente resuelto**: baseline SQL de Producción documentado e integrado en PR #1; resto de hallazgos históricos por verificar | Alta de gobernanza | Contrastar observaciones de 10/10 con versiones y pruebas actuales; SEC-01 por separado | 99 |

**SEC-01 — detalle de referencia:** (1) ocho funciones SECURITY DEFINER del baseline con ejecución reportada por anon/authenticated; (2) RLS sin policies en `analytics_identity`; (3) protección de contraseñas filtradas de Supabase Auth desactivada. Son hallazgos reportados, no vulnerabilidades confirmadas. No publicar detalles adicionales de explotación en este repositorio público. Revisar permisos, flujos, exposición y severidad antes de decidir cambios.

## Decisiones de Etapa 7 que NO deben perderse
- Perfil declarado + perfil aprendido + contexto actual; favorito y puntuaciones explícitas son señales fuertes; tener stock o registrar un vino no demuestra gusto.
- Onboarding de preferencias visual, breve y no excluyente; tipos, cepas, nivel de conocimiento. Bodegas fue una idea inicial y quedó postergada del onboarding 7.2.
- Preferencias de tipo priorizan el orden de cepas, no excluyen variedades. Selecciones persistentes al expandir/contraer.
- No confundir precio histórico con presupuesto explícito; el origen/región requiere normalización.
- `¿Qué tomo?`: situación + gustos + Cava/historial + conocimiento de vinos; distinguir lo tengo, lo tomé/conozco y lo nuevo.
- Persistir hechos/señales originales y derivar métricas reconstruibles; inferencias respaldadas por evidencia. Mi Cava administra la memoria personal, no el modelo externo.
- Recomendación independiente; contenido patrocinado futuro claramente distinguido.

## Reglas de mantenimiento
1. Cada nuevo PIN se incorpora con ID, descripción, origen, estado, prioridad, dependencia/disparador y conversación responsable. No inventar fechas ni cierres.
2. Al comenzar una etapa, revisar sus PINs; al cerrarla, reconciliar lo implementado, descartado y diferido con evidencia.
3. «Por verificar» obliga a comprobar estado actual antes de planificar trabajo; un informe antiguo no prevalece sobre producción actual.
4. Toda propuesta de ejecución requiere autorización separada. **Este documento no autoriza implementación ni despliegue.**
5. Actualizar este archivo mediante cambios documentales revisables; mantener historia de cambios en Git.
6. Los puntos históricos aún no recuperados se agregan cuando se obtenga evidencia; no se borran ideas por no recordarlas hoy.

## Próxima conciliación
Auditar conversaciones 02, 03, 04, 05 y 99, contrastar cada PIN con el estado actual, detectar duplicados, y confirmar responsables y disparadores. No alterar código ni base de datos como parte de esa conciliación.

## Conciliación histórica — pasada 1 (15/11/2026)
**Confirmaciones procedentes de informes del usuario:** UX-20 cerrada y en Producción; UX-21 mergeada a `main` con cuatro comprobaciones de Producción satisfactorias; Etapa 7.2-B validada funcionalmente 14/14 (sin inferir publicación). Ninguno de esos hitos autoriza nuevos cambios.

**Pendientes confirmados:** UX-22 (evaluación UX con testers), SEC-01 (análisis de riesgo previo a ampliación de beta), DATA-01 (normalización de origen para usos futuros), MOB-01 (objetivo estratégico), M01 y frentes legales según secuencia. Los otros ítems «por verificar» no se convierten en bugs activos por figurar en esta lista.

**Aclaración sobre onboarding:** La idea inicial de preguntar bodegas no debe confundirse con una decisión vigente de 7.2: se descartó del onboarding inicial y se conserva como evolución posible del perfil. La selección de tipos prioriza el orden de cepas, no excluye otras. La pregunta de nivel de conocimiento sí integra el diseño de 7.2.

**Fuentes y límites de esta pasada:** conversaciones y decisiones disponibles en el Proyecto; archivo maestro en esta rama; consulta a issues/PRs del repositorio sin resultados adicionales para la búsqueda efectuada. No se ha inspeccionado exhaustivamente todo el historial de Git ni comprobado manualmente cada pantalla de Producción. Se requiere una segunda pasada sobre artefactos y cierres específicos de los chats 02/03/05/99 antes de declarar el inventario completo.

**Regla de cierre:** el registro de un hito informado como cerrado conserva su fuente (confirmación del usuario). El estado de despliegue de otro hito no se deduce por proximidad de fecha o etapa.

## Conciliación histórica — pasada 2 (15/11/2026)
**Evidencia adicional de GitHub:**
- Merge `195aa8c`: UX-21, vistas de biblioteca (tarjetas, cuadrícula compacta, lista compacta); coincide con la confirmación del usuario de las cuatro pruebas en Producción.
- Commit `b798e41`: 7.2-A, persistencia del onboarding con marca temporal resuelta en PostgreSQL, sin reloj del dispositivo.
- Commit `4deafef`: 7.2-B, cinco pantallas (bienvenida, tipos, variedades, conocimiento y cierre), invitación discreta y «Mis preferencias»; incluye pruebas E2E.
- Commit `81ae9ce`: ajustes de 7.2-B, expansión de variedades con selección estable, descripciones de conocimiento, transiciones breves y progreso de tres preguntas.
- Commit `9bb9064`: corrección de duplicación/séptima variedad sugerida y pruebas adicionales de integración.
- Merge `f729c2f`: integración de Etapa 7.2 (datos + interfaz) en `main`.

**Regla de interpretación:** merge a `main` no equivale a despliegue de Producción. La publicación de 7.2 requiere confirmación por despliegue y/o pruebas en dominio productivo. Los commits no acreditan por sí solos la resolución de los PINs históricos de Etapa 6. UX-22 se mantiene pendiente aunque 7.2-B ya incluya microtransiciones.

**Conciliación pendiente:** validar estado de UX-P01 a UX-P11 con reportes de cierre y experiencia real; revisar si TECH-01 fue mitigado por la documentación y migraciones nuevas; completar antecedentes jurídicos de 04. No reabrir nada por inferencia.

## Hito de cierre — Etapa 7.2 (15/11/2026)
**Estado: CERRADA, publicada y validada en Producción, según acta de cierre aportada por el usuario al chat 00.**
- Migración 7.2-A aplicada y verificada.
- Frontend 7.2-B publicado mediante PR #7; merge `f729c2f`.
- Preview: 14/14 pruebas satisfactorias.
- Producción: 6/6 pruebas satisfactorias.
- Monitoreo posterior: sin errores HTTP 4xx/5xx.
- Documento de cierre citado: `claude/PLAN_PUBLICACION_7_2.md`, sección 10. **No localizado en la ruta de `main` durante esta actualización; referencia documental por verificar, sin poner en duda el cierre comunicado.**
- UX-22 y SEC-01 ya constan en el registro central; se conservan sin duplicados y sin autorización de ejecución.

### Pendientes residuales del cierre (no bloqueantes; estado específico por verificar)
| ID | Asunto | Estado | Prioridad de revisión | Disparador | Responsable |
|---|---|---|---|---|---|
| QA-72-IOS | Pruebas específicas Safari/iOS | Pendiente de verificar alcance y resultado | Media provisional | Antes de dar por cubierta compatibilidad iOS / móvil | 05 / 99 |
| QA-72-RESEND | Pruebas específicas de Resend | Pendiente de verificar alcance y resultado | Media provisional | Antes de ampliar acceso y depender del flujo de emails | 99 |
| QA-72-WSL | Pruebas específicas Windows/WSL | Pendiente de verificar alcance y resultado | Baja provisional | Próxima revisión del entorno de desarrollo | 99 |
| OPS-72-RESTORE | Restauración v3.1 | Pendiente de verificar procedimiento, alcance y evidencia | Alta provisional por posible continuidad operativa; no implica riesgo confirmado | Antes de depender de recuperación ante incidentes | 99 |
| GIT-72-CLEAN | Limpieza opcional de rama GitHub 7.2 | Opcional; no autorizada | Baja | Tras confirmar que no quedan referencias útiles | 99 |

**Estos cinco identificadores son entradas de seguimiento documental, no defectos confirmados ni tareas aprobadas.** Sus detalles técnicos deberán contrastarse con el acta de cierre.

### Próxima prioridad de producto
Con 7.2 cerrada, el foco funcional de Etapa 7 pasa al diseño y desarrollo controlado de **«¿Qué tomo?»** en conversación 05. Antes de implementar: precisar alcance v1, puertas de entrada, contexto personal mínimo, candidatos y reglas de ranking, UX de recomendaciones, observabilidad, pruebas y resguardos de datos. La revisión SEC-01 se prioriza antes de ampliar la beta, en paralelo y sin autorizar cambios. No reabrir 7.2 por UX-22 salvo decisión posterior.

## Hito de cierre — Etapa 7.3 (22/11/2026)
**Estado: CERRADA. Validada, integrada en `main`, desplegada en Producción y documentada.** Responsable de ejecución: **05.3 — Etapa 7.3 · Inteligencia y conocimiento personal**; seguimiento de hito: **00**; cuestiones técnicas transversales: **99**.

- **7.3-A — Base técnica de «¿Qué tomo?»**: endpoint autenticado, lectura de contexto personal, recuperación de candidatos y base para registrar sesiones y recomendaciones.
- **7.3-B — Motor de conocimiento personal**: organiza preferencias y señales de la cava, reconstruye evidencias y distingue hechos explícitos, inferencias, restricciones persistentes y temporales.
- **Control vigente**: las escrituras de inferencias siguen desactivadas; no activar por inferencia de este cierre.
- **Validación comunicada**: 23/23 pruebas de integración aprobadas con Docker Desktop, 17 de A y 6 de B; aislamiento de usuarios con RLS y verificación de ausencia de escrituras en `user_knowledge`.
- **Integración**: [PR #8](https://github.com/kevinbeltran111/mi-cava/pull/8), merge `9a804a9` en `main` (merge confirmado en GitHub).
- **Producción**: [deployment de Vercel](https://vercel.com/cava10/mi-cava/F5FUjTy4xoJSSssw12EjdhU9B31m) comunicado como **READY** y con el código validado. Publicación sin nuevas migraciones.
- **Documentación**: procedimiento de integración Docker actualizado con ruta efectiva Windows, corrida aprobada y referencias a PR/deployment, según cierre de 05.3.
- **Límite de validación**: las pruebas con cuentas reales en Producción **no** formaron parte de la validación 7.3; no registrarlas como aprobadas.
- **Limpieza de rama**: opcional, no bloquea el cierre; no se ordena borrado.
- **Pendientes existentes**: `SEC-01` sigue pendiente de análisis antes de ampliar beta; `TECH-01` conserva su verificación histórica. No duplicar.

## Apertura — Etapa 7.4 · «Elegir de mi cava» (22/11/2026)
**Estado: ABIERTA. Primera experiencia visible de «¿Qué tomo?»; publicación NO autorizada.** Responsable: **05.4 — Etapa 7.4 · Elegir de mi cava**; gobernanza: **00**; soporte técnico según corresponda: **99**.

**Decisión de producto aprobada:** al entrar, recomendar directamente entre **vinos con stock**, con **una opción principal y hasta dos alternativas**. El usuario podrá **refinar o corregir después**. La **medición comienza en 7.4**.

**Fuera del alcance de 7.4 y reservado para 7.5:** «Acompañar una comida» y «Quiero que me sorprendas».

La apertura no habilita desplegar, crear migraciones ni activar escrituras de inferencias. Se requiere autorización separada para toda implementación/publicación que la necesite.

## Inversión y gastos del proyecto — registro inicial
**Origen:** conversación del Proyecto «Registrar gastos de inversión», iniciada en septiembre de 2026; ampliada con gasto OpenAI en noviembre. **Responsable:** 00 / registro de inversión. **Estado:** registro histórico confirmado por el usuario; comprobantes, cotizaciones y posibles gastos adicionales pendientes de conciliación. Esta sección conserva las monedas originales: no sumar ARS y USD entre sí ni asignar un equivalente sin fecha, tipo de cambio y criterio explícitos.

| ID | Fecha registrada | Concepto | Moneda | Importe | Observaciones |
|---|---|---|---|---:|---|
| INV-001 | 2026-09-20 | Créditos Anthropic | USD | 5,00 | Compra de créditos |
| INV-002 | 2026-09-23 | Vercel | USD | 9,99 | Gasto reportado |
| INV-003 | 2026-09-23 | Dominio NIC | ARS | 8.500,00 | Registro de dominio |
| INV-004 | 2026-10-02 | Claude Pro | USD | 20,00 | Suscripción mensual por débito automático informado |
| INV-005 | 2026-11-14* | ChatGPT / OpenAI | USD | 20,00 | Suscripción mensual por débito automático informado; fecha asociada al registro, pendiente de contrastar con comprobante |
| INV-006 | 2026-11-23 | INPI — búsqueda fonética de marca | ARS | 9.249,46 | Arancel de búsqueda fonética; Legal / Marca; pago informado por el usuario |

**Total registrado (sin conversiones):** **ARS 17.749,46** + **USD 54,99**. Son subtotales en monedas diferentes, no un monto conjunto convertible por simple suma.

**Alcance del registro:** costos efectivamente comunicados; no implica que se hayan identificado todos los costos ni que exista una categoría fiscal o contable definida. Claude Pro y ChatGPT/OpenAI son suscripciones mensuales de USD 20 cada una según declaración del usuario, con débito automático y precio actualmente estable. Sus vencimientos efectivos no están confirmados: no inferirlos de la fecha del primer registro. Proyectar USD 40 por mes como gasto **esperado**, pero nunca sumarlo al total **pagado** hasta contar con confirmación del débito o una fuente verificable.

**Reglas para nueva incorporación:** fecha de transacción, concepto/proveedor, moneda, monto, categoría (dominio, infraestructura, IA, otros), periodicidad si fue informada, comprobante opcional, notas y fuente. Usar un ID `INV-` estable para cada movimiento, prevenir duplicados por proveedor-fecha-monto, y guardar quién/ cuándo lo agregó o corrigió.

**Requisitos para la visualización en «Mi Cava — Centro de Proyecto»:** sección independiente **«Inversión y gastos»** en navegación; tarjetas de subtotal por moneda (ARS y USD), tabla cronológica con filtros por proveedor, categoría, fecha y moneda, formulario de alta/edición y exportación CSV/XLSX si está disponible; opcionalmente conversión a una moneda de referencia con cotización, fecha y criterio transparentes. Conservar `INV-` y el historial de cambios. Si el Site guarda ediciones en D1 como propuestas, **no presentarlas como sincronizadas con GitHub** hasta tener mecanismo de conciliación. No alterar otros IDs del backlog ni confundir movimientos financieros con pendientes.

**Nota:** *La fecha del gasto OpenAI proviene del momento de registro recuperado, no de un comprobante verificado. Revisar al conciliar gastos.*

**Seguimiento automático propuesto (23/11/2026):** mantener una tabla separada de suscripciones (proveedor, importe esperado, moneda, periodicidad mensual, fecha de próximo débito por confirmar, estado activa/pausada) y movimientos reales. El Site puede generar vencimientos previstos y recordatorios; una imputación automática como *pagada* requiere verificación autorizada de la transacción o confirmación del usuario. Las ediciones del Site se guardan como propuestas locales hasta conciliar con GitHub. Evitar duplicados por período, proveedor e ID. No hay automatización de contabilización aprobada todavía.

## Consolidación transversal y acceso al proyecto (23/11/2026)
**Objetivo confirmado:** el usuario necesita dos vistas de la MISMA historia: (a) `Mi Cava — Centro de Proyecto`, tablero privado, interactivo, con etapas, hitos, pins, decisiones y gastos; y (b) un Archivo Maestro detallado, consultable y versionado. No tratar la copia importada al Site como fuente definitiva si diverge del documento de GitHub.

### Estado de las herramientas, pendiente de comprobación operativa
- **GitHub:** este `ROADMAP_MAESTRO.md` está en rama `docs/roadmap-maestro-v2` y no en `main`; continúa como archivo oficial de trabajo/versionado. La estructura puede ampliarse sin alterar el producto.
- **Site:** se informó creación y despliegue privado de una primera versión; ediciones posteriores con mejoras de roadmap, colores y «Historial de cambios», y una versión de revisión con gastos y suscripciones. **El estado de despliegue exacto de esta última versión debe comprobarse**. No asumir que la última edición de revisión ya se encuentra en vivo.
- **Datos del Site:** el tablero representa una instantánea del roadmap y guarda ediciones propias como propuestas; no hay sincronización bidireccional confirmada. Los pagos y cambios de estado que surjan en Site deben conciliarse con el registro documental por ID y versión.
- **Privacidad:** el Site se informó de acceso restringido; el repositorio GitHub `kevinbeltran111/mi-cava` es público. No incluir información personal sensible, secretos ni detalles internos de seguridad en su documentación pública.

### Brechas históricas identificadas — no equivalen a tareas de desarrollo
| Área | Qué falta consolidar | Fuente de contraste | Estado |
|---|---|---|---|
| Etapas 1–4 | Descripción, entregables, decisiones, fechas y evidencias de cierre | Historial temprano / GitHub | Por recuperar y verificar |
| Etapa 5 | Detalle de abrir botella, stock, consumos, puntuación y experiencia sin stock | Conversación 02 y cambios de código | Hito principal cerrado; detalle documental por completar |
| Etapa 6 | Resultado actual de UX-P01 a UX-P11; distinguir correcciones ya publicadas de ideas pendientes | Conversación 03, testers, producción | En conciliación |
| Etapa 7.1 | Completar acta de cierre y referencias exactas de pruebas; migración de modelo aplicada según README Supabase (revisión 09/11) | Conversación 05, migraciones y documentación | Parcialmente documentada |
| Etapas 7.2 / 7.3 | Localización de actas y procedimientos completos; actualizar referencias comprobables | Conversaciones 05.2 y 05.3, PR #7 y #8 | Hitos cerrados; documentación parcial ubicada |
| Etapa 7.4 | Subbloques, decisiones detalladas y estado real de integración; no inferir despliegues | Conversación 05.4 | En desarrollo, conciliación continua |
| Marca M01 | Estado de búsqueda fonética, acreditación y decisión de registro marcario | Conversación 04.1 / INPI | Pago de búsqueda confirmado; resultado por verificar |
| Legal L01 / LEG-01 / PRIV-01 | Titularidad de activos, documentos legales, cookies, imágenes, privacidad y fechas de revisión | Conversación 04 | Frente paralelo sin cierre inferido |
| Infraestructura SEC-01 / TECH-01 | Estado efectivo de seguridad, migraciones, auditorías y deuda técnica | Conversación 99 | Análisis por realizar; sin cambios autorizados |
| Finanzas | Conciliar seis movimientos, comprobantes y nuevos débitos; mantener previstos separados de pagados | Conversación Registrar gastos de inversión y Site | Seis movimientos asentados; sincronización pendiente |

### Reglas operativas para cerrar la conciliación
1. **Un ID, un registro.** Nuevas pruebas o decisiones enriquecen un ID preexistente; no lo duplican.
2. **Una etapa puede cerrarse con pendientes residuales.** Los pendientes conservan estado propio sin reabrir por defecto el hito.
3. **Prueba de cierre:** registrar evidencia de código/PR, validación y publicación como hechos distintos. Si solo hay confirmación conversacional, atribuirla claramente.
4. **Preservar el historial de decisiones descartadas** con motivo, fecha/fuente disponible y eventual disparador de revisión.
5. **No sumar costos proyectados al pagado.** El documento financiero mantiene subtotales ARS/USD y el Site no genera pagos reales solo por alcanzar un vencimiento.
6. **Las actualizaciones del Site no quedan automáticamente en GitHub.** Hasta que haya integración validada, el cambio debe importarse/conciliarse explícitamente.
7. **No se autorizan implementaciones por actualizar el roadmap.** Antes de mergear este archivo a `main`, revisar contenidos, riesgos de publicar datos y posibles conflictos con cambios documentales posteriores.

### Orden recomendado de recuperación (no bloquea Etapa 7.4)
1. Completar Etapas 1–6 y el inventario UX histórico; 2. precisar Etapas 7.1 y 7.4; 3. conciliar estado de Legal/Marca/99; 4. incorporar referencias y enlaces accesibles desde el Site; 5. probar consistencia por IDs y conciliación Site ↔ GitHub.


## Reconstrucción histórica — evidencias del producto inicial (23/11/2026)
**Advertencia metodológica:** se identificaron capacidades en el repositorio y en una auditoría técnica histórica del 10/10/2026, pero **NO** hay prueba suficiente para atribuir cada capacidad a un número exacto de Etapa 1, 2, 3 o 4 o asignar una fecha individual de cierre. Se documentan como secuencia histórica funcional **sin inventar hitos formales**. El mapa de etapas 1–4 sigue pendiente de conciliación con sus conversaciones de origen.

### Capacidades tempranas con evidencia histórica
| Bloque funcional histórico | Evidencia documentada | Estado de archivo |
|---|---|---|
| Biblioteca web | SPA React/Vite con Supabase y despliegue Vercel; catalogación de vinos | Existente al baseline de octubre |
| Control de acceso y roles | Inicio por link mágico; roles admin/editor/viewer; solicitudes e invitaciones | Existente al baseline de octubre; comportamiento actual se valida aparte |
| Identificación por fotografía | Foto → identificación IA Anthropic → revisión humana antes de guardar | Existente al baseline de octubre |
| Cava personal y datos privados | Identidad del vino separada de precio/stock/favoritos; roles viewer sin cava | Existente al baseline de octubre |
| Búsqueda y filtros | Bodega, varietal, añada, región/lugar, stock, Tengo/Tomé, Favoritos | Existente al baseline de octubre; versiones posteriores modificaron filtros |
| Duplicados | UX-19, distinguir agregar a vino existente y guardar otro | Confirmada por auditoría histórica; verificar referencia de cierre |
| Abrir y registrar consumo | RPC para descontar stock y registrar experiencia, puntuación y comida | Etapa 5 cerrada según registros de producto |
| UX-20 — Guardar/Tener/Probar | Intenciones separadas en alta; estado «Guardados» definido como stock 0 y sin consumos | Integrado en PR #2; cierre y Producción confirmados por usuario |
| UX-21 — Vistas | Tarjetas, cuadrícula compacta y lista compacta | Integrado en PR #6, comprobaciones de Producción informadas OK |

**Referencias consultadas:** `README.md` y `supabase/README.md` del repositorio, auditoría del 10/10/2026 y commits/PRs. No convertir el texto del README raíz en una descripción de la UX vigente: conserva ejemplos y afirmaciones de fases anteriores, incluso sobre visibilidad de vinos y roles que contradicen la Cava personal actual.

### Conciliación de TECH-01 — evidencia posterior al diagnóstico inicial
La auditoría histórica del 10/10 detectó migraciones ausentes en el repositorio y `schema.sql` desactualizado. El trabajo posterior generó **dos baselines de Producción verificados** (schema público y Storage), movió el SQL antiguo a `supabase/historico/` y documentó el procedimiento en `supabase/README.md`. Fue integrado mediante [PR #1](https://github.com/kevinbeltran111/mi-cava/pull/1), merge `d79a0f2`, con origen en commit `6f63816`.

**Conclusión delimitada:** se resolvió la **falta de baseline versionado a fecha 10/10**. Esto no implica que los hallazgos originales de RLS, Storage, permisos, Realtime, atomicidad o debugging se hayan corregido, ni que todos sigan vigentes: sus estados requieren nueva evaluación de Producción. **SEC-01** es el registro principal de seguridad y no se duplica dentro de TECH-01.

El `supabase/README.md` indica migración `20261025000000_etapa7_modelo_inteligencia.sql` de Etapa 7.1 aplicada (comprobación de historial de Producción el 09/11/2026), seis tablas de inteligencia y pruebas locales. La documentación de ese mismo archivo contiene al menos una afirmación histórica desactualizada sobre 7.2-A («no aplicada»), contradicha por el cierre posterior de 7.2 validado en Producción. Esto exige **lectura con fecha de corte** y no demuestra un problema de despliegue actual.

### Clasificación histórica de observaciones de octubre — no reabrir automáticamente
| Tema de auditoría histórica | Referencia de backlog | Estado para planificación |
|---|---|---|
| Migraciones y baseline sin versionar | TECH-01 | **Resuelto en lo relativo al baseline de 10/10**; revisar mantenimiento documental posterior |
| RLS, privilegios y exposición efectiva | SEC-01 | Pendiente de evaluación por 99, sin vulnerabilidad confirmada por este documento |
| Storage y fotografía de etiquetas | PRIV-01 / SEC-01 | Verificar políticas actuales antes de concluir |
| Realtime, carga no atómica, instrumentación de depuración | TECH-01 | Observaciones del diagnóstico histórico; estado actual por verificar |
| Flujo de ingreso como viewer/editor y referencias antiguas del README | TECH-01 / experiencia de beta | Describir comportamiento actual con evidencia, no usar README histórico como especificación |
| Estado de emails/Resend | QA-72-RESEND | Tiene seguimiento específico posterior; no crear otro ID |
| UX de alta, fotografía y navegación | UX-P01 a UX-P09 | Contrastar con producción o cierres antes de mover estados |

### Siguiente bloque de conciliación
Recuperar el mapa formal de etapas 1–4 de sus registros originales; después, verificar cada `UX-P0x` de Etapa 6 contra sus cierres y la UI real. El hallazgo documental no habilita modificaciones técnicas o de seguridad.

## Conciliación de los 11 pins históricos de UX de Etapa 6 (23/11/2026)
**Fuente examinada:** `src/App.jsx` en `main`, en sus segmentos de alta/foto, ficha/experiencias, estado, filtros y carga; `README.md` y antecedentes de PR #2 (UX-20) / cambios de UX-21. **No se ejecutó la aplicación ni se comprobó el despliegue con un usuario real.** En consecuencia, «implementado en código» no equivale por sí solo a «cerrado y validado en Producción».

| Pin | Evidencia encontrada en código | Estado documental recomendado |
|---|---|---|
| UX-P01 | Superficie fotográfica interactiva y panel con inputs separados para cámara y galería (`setShowPhotoSourceSheet`, `cameraInputRef`, `galleryInputRef`). | Funcionalidad implementada; prueba táctil/accesibilidad pendiente. |
| UX-P02 | En «Revisá los datos» se muestra `draft.foto` y un toque abre zoom (`setShowPhotoZoom`). | Funcionalidad implementada; confirmar experiencia visual. |
| UX-P03 | `canGoBack` / `goBack` y botón `aria-label="Atrás"`; el borrador y la foto se conservan. | Funcionalidad implementada; validar recorrido completo. |
| UX-P04 | La alternativa manual inicial fue retirada de la superficie principal; `Completar los datos manualmente` aparece como recuperación tras error de IA. | Decisión de interfaz materializada; validar que el usuario pueda avanzar sin IA en situaciones relevantes. No marcar resuelto por defecto. |
| UX-P05 | `runIdentify` distingue `multiples_vinos`, indica «Veo más de un vino en la foto» y permite «Elegir otra foto». | Ruta implementada; comportamiento de detección real por probar. |
| UX-P06 | Iconos `Wine` y placeholders, sin prueba visual ni cierre verificable para el comentario histórico. | Mantener por verificar. |
| UX-P07 | La existencia de onboarding 7.2 no prueba que sea necesario ni deseable un tutorial adicional de alta. | Mantener evaluación condicionada a feedback. |
| UX-P08 | Persisten expresiones de producto y referencias a nombres históricos; M01 define estrategia marcaria. | Mantener evaluación ligada a M01. |
| UX-P09 | `hasLoadedOnceRef` mantiene grilla visible en recargas posteriores; `loadSeqRef` evita que cargas solapadas se pisen. | **Parcialmente mitigado en código**. Retorno de foco / recarga al volver a la app sigue sin prueba. |
| UX-P10 | `Tus experiencias` figura en la ficha individual; esta evidencia no acredita historial global de consumos. | Mantener pendiente de evaluación, sin crear defecto. |
| UX-P11 | Favorito directo desde ficha y en vistas compactas; filtro `Solo favoritos`; promedio derivado de `consumos.puntuacion`, experiencias con comida/comentario por vino. | Funcionalidad presente; utilidad y presentación siguen bajo seguimiento. |

**Resultado de esta pasada:** 5 funcionalidades originales materializadas en el código (`UX-P01` a `UX-P05`), 1 caso mitigado parcialmente (`UX-P09`), y 5 ítems de evaluación o revisión histórica (`UX-P06`, `UX-P07`, `UX-P08`, `UX-P10`, `UX-P11`). **Cero pins dados por cerrados en Producción en esta pasada** por falta de prueba específica. El detalle del resultado se enlaza a los IDs preexistentes, sin duplicar tareas.

**Precaución adicional:** la evidencia leída de la interfaz de alta muestra que la carga manual solo aparece al fallar la IA; esto es una decisión UX potencialmente relevante para accesibilidad y conexiones limitadas, no una autorización para cambiarla. Revisar con criterio del producto antes de emitir instrucciones de implementación.

**Próximo contraste prioritario:** probar en la beta actual los caminos concretos de foto, regreso, revisión y varios vinos, y recuperar cierres comunicados en conversación 03, si están disponibles. Un resultado satisfactorio puede convertir «implementado» en «cerrado», con fecha y evidencia. Mantener separado este trabajo del desarrollo activo de la Etapa 7.4.
