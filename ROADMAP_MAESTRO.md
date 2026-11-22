# Mi Cava — Roadmap Maestro
**Versión:** 2.4 — cierre de Etapa 7.3 y apertura de 7.4 · **Fecha de corte:** 2026-11-22 · **Responsable de decisiones:** conversación ChatGPT `00 — Roadmap y decisiones de producto`

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
| Etapa 7.1 — Datos de inteligencia | Trabajo de base realizado; contrastar estado final | 05 / 99 |
| Etapa 7.2 — Onboarding | **CERRADA 15/11/2026**. Migración 7.2-A aplicada/verificada; frontend 7.2-B publicado PR #7, merge f729c2f; Preview 14/14, Producción 6/6; monitoreo sin 4xx/5xx (cierre informado por usuario) | 05 |
| Etapa 7.3 — Inteligencia y conocimiento personal | **CERRADA 22/11/2026**. 7.3-A (base autenticada, contexto, candidatos y soporte de sesiones) y 7.3-B (conocimiento personal y evidencias); integración 23/23 Docker Desktop, PR #8, merge `9a804a9`, Producción READY; sin nuevas migraciones; escrituras de inferencias desactivadas | 00 / 05.3; soporte técnico 99 |
| Etapa 7.4 — «Elegir de mi cava» | **ABIERTA — diseño y desarrollo, publicación no autorizada**. Recomendar al entrar entre vinos con stock: una opción principal y hasta dos alternativas, refinamiento posterior; inicia medición | 00 / 05.4; soporte técnico 99 |
| UX-21 — Ajustes de vistas | Cerrada; merge en main y cuatro verificaciones de Producción informadas como OK | 03 / 00 |
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
| UX-P01 | Imagen principal clickeable para iniciar foto/galería | Feedback beta Etapa 6 | Por verificar si ya se resolvió | Por definir | Conciliación con Producción | 03 |
| UX-P02 | Miniatura de fotografía en revisión de datos | Feedback beta Etapa 6 | Por verificar | Por definir | Conciliación con Producción | 03 |
| UX-P03 | Navegación «Atrás» en alta de vino | Feedback beta Etapa 6 | Por verificar | Por definir | Conciliación con Producción | 03 |
| UX-P04 | Redundancia de «Prefiero cargar a mano» | Feedback beta Etapa 6 | Por verificar | Por definir | Conciliación con Producción | 03 |
| UX-P05 | Fotografías con varias botellas | Feedback beta Etapa 6 | Por verificar | Por definir | Validar incidencia y tratamiento actual | 03 |
| UX-P06 | Ilustración/ícono de copa y consistencia visual | Feedback beta Etapa 5/6 | Intervención previa informada; verificar si resta algo | Por definir | Conciliación con Producción | 03 |
| UX-P07 | Tutorial inicial / globos de ayuda | Ideas Etapa 6 | Pendiente de evaluación | Baja provisional | Solo con evidencia de dificultad de uso | 03 |
| UX-P08 | Consistencia de nombre «Mi Cava» vs «Cava Vinos» | Etapa 6 / marca | Pendiente de evaluación | Media | Definición de arquitectura de marca | 04 / 03 |
| UX-P09 | Refresco/loader al regresar a la app | Etapa 6 | Por verificar | Por definir | Reproducción con beta | 03 |
| UX-P10 | Historial global de consumos, además del historial por vino | Etapa 5/6 | Pendiente de evaluación | Baja provisional | Feedback de beta | 03 / 00 |
| UX-P11 | Utilidad y presentación de favoritos, puntuaciones y comentarios | Etapas 5–7 | Seguimiento de uso | Media | Feedback + inteligencia personal | 05 / 03 |
| PRIV-01 | Privacidad, acceso y posible marca de agua en fotos | Etapa 6 / frente legal | Pendiente de análisis en frente específico | Alta antes de compartir públicamente | Revisión de Storage y futuro Descubrir | 04 / 99 |
| LEG-01 | Términos, privacidad, cookies, tratamiento de imágenes y proveedores | Frente legal | En análisis | Alta antes de apertura amplia | Trabajo jurídico 04 | 04 |
| M01 | Protección de marcas Mi Cava / CavaVinos en Argentina | Frente 04.1 | En análisis; presentación no autorizada | Alta estratégica | Arquitectura → clases → antecedentes → titular → costos | 04.1 |
| L01 | Estructura jurídica y titularidad de activos | Frente 04 | Futuro según secuencia aprobada | Media | Tras avance M01 | 04 |
| SOC-01 | Descubrir, Cavas compartidas, visibilidad y rol viewer | Roadmap | Futuro | Por definir | Después de consolidar valor personal y privacidad | 00 |
| MOB-01 | Aplicación móvil Android e iOS | Visión del producto | Objetivo confirmado; no iniciado | Estratégica, ejecución sin fecha | Evaluar momento tras validar producto | 00 / 99 |
| COM-01 | Recomendaciones de compra, bodegas/vinotecas y posible monetización | Visión Etapa 7+ | Futuro, sin autorización comercial | Por definir | Confianza, calidad del recomendador y separación de patrocinio | 00 / 05 |
| TECH-01 | Conciliar documentación, migraciones y baseline técnico | Auditoría histórica | Por verificar estado actual | Alta de gobernanza | Revisión con 99, sin asumir que sigue abierto | 99 |

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
