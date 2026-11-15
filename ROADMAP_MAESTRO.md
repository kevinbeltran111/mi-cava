# Mi Cava — Roadmap Maestro
**Versión:** 2.0 inicial · **Fecha de corte:** 2026-11-15 · **Responsable de decisiones:** conversación ChatGPT `00 — Roadmap y decisiones de producto`

> Este archivo es un registro de producto y pendientes, no una autorización de implementación. Toda modificación de código, infraestructura, seguridad, datos o despliegue requiere análisis y aprobación separados. La información histórica está en conciliación: «por verificar» no significa «pendiente confirmado».

## Visión y principios
Mi Cava es una biblioteca personal de vinos, no solo un inventario. Permite guardar vinos, mantener stock, abrir botellas propias y registrar experiencias sin stock. Debe aprender de preferencias declaradas, favoritos, puntuaciones y consumos para ofrecer valor personalizado. Evolución: excelente Cava personal → inteligencia personal → Descubrir/social. Producto multiplataforma: web actual; aplicaciones Android e iOS como objetivo estratégico confirmado, sin fecha ni tecnología aprobadas. La Cava y los datos privados no se comparten por defecto. Recomendaciones comerciales futuras deberán distinguirse de las personales.

## Estado por frentes
| Frente | Estado al corte | Conversación |
|---|---|---|
| Etapa 5 — Abrir e historial | Cerrada y probada | 02 |
| Etapa 6 — UX y beta | Beta cerrada activa; validación continua | 03 |
| UX-20 — Guardar / tener / abrir / probar sin stock | Cerrada y en Producción | 03 / 00 |
| Etapa 7 — Inteligencia personal | En desarrollo por subetapas; verificar cierres y despliegues específicos | 05 |
| Etapa 7.1 — Datos de inteligencia | Trabajo de base realizado; contrastar estado final | 05 / 99 |
| Etapa 7.2 — Onboarding | Validación funcional 7.2-B: 14/14 (15/11/2026); estado de publicación no inferido | 05 |
| Etapa 8 — Descubrir | Futuro, no autorizado | 00 |
| Mobile — Android / iOS | Objetivo estratégico, ejecución sin programar | 00 / 99 |
| Legal, privacidad y marca | Frente paralelo activo | 04 |
| Metodología, infraestructura y seguridad | Frente paralelo activo | 99 |

## Registro central de pendientes
Estados posibles: **pendiente de evaluación**, **por verificar**, **en diseño**, **aprobado**, **en ejecución**, **cerrado**, **descartado**. Prioridad es de *revisión*, no autorización de implementación.

| ID | Tema | Origen | Estado | Prioridad | Dependencia / disparador | Conversación |
|---|---|---|---|---|---|---|
| UX-22 | Personalidad e interacción del onboarding: microinteracciones y respuestas visuales manteniendo elegancia | 7.2-B, validación 15/11/2026 (14/14 funcional) | Pendiente de evaluación; no bloquea 7.2 | Media provisional | Feedback de testers | 05 / 03 |
| SEC-01 | Revisar hallazgos preexistentes de seguridad de Supabase/Auth; determinar exposición efectiva y medidas | Revisión previa a publicación 7.2, 15/11/2026 | Pendiente de análisis; sin cambios autorizados | Alta para análisis | Antes de ampliar beta; revisión técnica específica | 99 |
| DATA-01 | Normalización de origen: provincia vs región; Valle de Uco / Uco Valley / Mendoza | Etapas 6 y 7 | Pendiente de evaluación | Media | Cuando filtros o inteligencia requieran origen confiable | 05 / 99 |
| UX-P01 | Imagen principal clickeable para iniciar foto/galería | Feedback beta Etapa 6 | Por verificar si ya se resolvió | Por definir | Conciliación con Producción | 03 |
| UX-P02 | Miniatura de fotografía en revisión de datos | Feedback beta Etapa 6 | Por verificar | Por definir | Conciliación con Producción | 03 |
| UX-P03 | Navegación «Atrás» en alta de vino | Feedback beta Etapa 6 | Por verificar | Por definir | Conciliación con Producción | 03 |
| UX-P04 | Redundancia de «Prefiero cargar a mano» | Feedback beta Etapa 6 | Por verificar | Por definir | Conciliación con Producción | 03 |
| UX-P05 | Fotografías con varias botellas | Feedback beta Etapa 6 | Por verificar | Por definir | Validar incidencia y tratamiento actual | 03 |
| UX-P06 | Ilustración/ícono de copa y consistencia visual | Feedback beta Etapa 5/6 | Por verificar; hubo corrección previa | Por definir | Conciliación con Producción | 03 |
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
