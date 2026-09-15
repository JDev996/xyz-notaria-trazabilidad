# Changelog

Historia de cambios del Sistema de Trazabilidad Notarial.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [2.0.0] — 2026-09-15

Reescritura completa tras una auditoría QA. Cierra los tres bloqueantes del informe externo y cinco defectos adicionales encontrados en la revisión interna.

### Añadido

- **Columna `Comprador`** (D), de carga manual y texto libre, entre `Proyecto` y `Tipo de Pago`.
- **Validación de transición de estado.** Cada paso declara su prerrequisito en `FLUJO` y se rechaza si no se cumple. Agregar un paso nuevo ya no requiere tocar `handleEdit` ni `calcularEstado`.
- **Rangos protegidos** sobre las siete columnas calculadas.
- **Calendario en `Fecha Salida Notaría`**, ahora editable para corregir el timestamp del formulario cuando no coincide con la fecha real de salida.
- **Detección de duplicados** de número de escritura: se registra igual y se marca en `Observaciones`.
- **`verificarLayout()`** — chequeo de salud: ancho del encabezado, encabezado por encabezado, valores viejos sin migrar y proyectos usados que no figuran en `Parametros`.
- **`recalcularTodosLosEstados()`** — reaplica el cálculo sobre todas las filas y reporta las corregidas.
- **`migrarValoresLegados()`** + mapa `VALORES_LEGADOS` — reescribe valores renombrados. Idempotente e independiente del orden de ejecución.
- **`respaldoMensual()`** — copia nativa a Drive, retención de 12, automática el día 1.
- **`repararCompradorDuplicado()`** — reparación verificada del incidente de columna duplicada.
- **Menú `Trazabilidad`** en el spreadsheet.
- **Registro del intento fallido de desmarcar** un paso en `Última Modificación Por`.

### Corregido

- 🔴 **Pegar `TRUE` sobre un paso ya marcado reescribía su fecha histórica.** La rama de "marcado" no distinguía entre pasar de FALSE a TRUE y ya estar en TRUE, así que un pegado o un Ctrl+D sobre el bloque de checkboxes reescribía todas las fechas del lote con la fecha del día. Ahora la fecha se estampa solo la primera vez.
- 🔴 **La auto-extensión de filas borraba checkboxes con datos.** `crearSeparadorDeMes()` insertaba una fila física sin actualizar el contador `ULTIMA_FILA_PROVISIONADA`; tras varios meses `agregarMasFilas()` arrancaba dentro de la zona con datos y `insertCheckboxes()` los ponía en FALSE. Se eliminó el contador: la capacidad se deriva de `getMaxRows()` y `provisionarFilas()` aborta si el bloque no está vacío.
- 🔴 **El pegado masivo se saltaba la máquina de estados.** Como la edición ya ocurrió cuando corre el trigger, pegar `TRUE` sobre todos los checkboxes hacía que cada paso viera su prerrequisito satisfecho por el mismo pegado. Ahora un paso previo marcado en la misma edición solo cuenta si su fecha ya estaba cargada.
- 🔴 **El estado podía saltarse pasos.** `calcularEstado()` era una cascada de prioridad de checkboxes, sin validación de orden.
- 🔴 **Los campos de estado no estaban protegidos**, y el código previo había eliminado las protecciones existentes sin recrearlas.
- 🟠 **`primeraFilaLibre()` buscaba el primer hueco**, no el final. Si alguien borraba una fila intermedia, el siguiente envío escribía ahí, bajo el separador de mes equivocado.
- 🟠 **La guarda de ingesta usaba `&&` donde iba `||`**: solo fallaba si faltaban las dos preguntas, así que un renombre de "Numero de Escritura" grababa escrituras sin número.
- 🟠 **`setChoiceValues([])` lanzaba excepción** al quedarse `Parametros` sin proyectos.
- 🟠 **`refrescarFormatoCondicionalEstado()` borraba reglas ajenas.** Ahora conserva las que no reconoce como propias.
- 🟠 **`Mes Año Filtro` tenía dos significados incompatibles** según el camino que la escribiera. Unificado: manda `Fecha Escritura`, y si no hay, `Fecha Salida`.
- 🟠 **La auditoría no identificaba al editor.** Se prefiere `e.user` con caída a `getActiveUser()`, y ahora también se estampa al editar fechas manuales.
- 🟠 **Un envío de formulario con un proyecto ausente de `Parametros` se perdía.** La validación de "rechazar entrada" hacía fallar el `setValue()` dentro del trigger. Ahora se limpia la validación de esa celda, se registra el envío y se marca en `Observaciones`.
- 🟡 **`handleEdit()` procesaba celda por celda.** Un pegado de 200×20 generaba miles de llamadas al Spreadsheet. Ahora lee la fila completa una vez, calcula en memoria y escribe solo lo que cambió. Corta con aviso sobre 200 filas.
- 🟡 **`INSTALAR_TODOS_LOS_MOTORES()` borraba todos los triggers del proyecto**, incluidos los que no le pertenecen. Ahora solo borra los cuatro propios.
- 🟡 **`verificarLayout()` podía lanzar excepción** en una hoja más angosta que el layout esperado.
- 🟡 **La migración escaneaba celdas combinadas fila por fila**, con cientos de round-trips. Reemplazado por una sola llamada a `getMergedRanges()`.
- 🟡 **`agregarMasFilas()` reaplicaba validaciones y protecciones sobre toda la hoja.** Como se invoca dentro del lock durante un envío de formulario, podía retener el lock más de los 30 s de `waitLock()` y hacer caducar envíos concurrentes. Ahora aplica solo al bloque nuevo y estira las protecciones con `setRange()`.

### Cambiado

- `Hipoteca` → **`V Hipoteca`** en el desplegable de Tipo de Pago, para que se entienda que es venta.
- `Enviado a Constructora` → **`Enviado a Cliente`**.
- `Devuelto por la Constructora` → **`Devuelto por el Cliente`**.
- `Check Llegada Constructora` → **`Check Llegada`**; `Fecha Llegada Constructora` → **`Fecha Llegada`**.
- Los textos que aparecen dentro de fórmulas (`V Hipoteca`, `VIS`) pasaron a constantes compartidas: `TIPO_PAGO_HIPOTECA`, `VIS_APLICA`. Antes estaban escritos a mano dentro de la fórmula de vencimiento, y renombrar el desplegable habría apagado la alerta de 75 días en silencio.
- Una corrección pendiente ahora se resalta aunque la escritura ya haya avanzado.

### Eliminado

- La propiedad de documento `ULTIMA_FILA_PROVISIONADA`. Era una caché de un dato derivable y toda caché sin invalidación es un bug con fecha.
- `agregarColumnasPagoYVis()` y `limpiarProteccionesViejas()`, funciones vestigiales.

### Datos migrados

| Columna | Antes | Ahora |
|---|---|---|
| Estado Global | `Enviado a Constructora` | `Enviado a Cliente` |
| Estado Global | `Devuelto por la Constructora` | `Devuelto por el Cliente` |
| Tipo de Pago | `Hipoteca` | `V Hipoteca` |

Ejecutadas con `migrarValoresLegados()` sobre las 6 escrituras existentes.

---

## [1.1.0] — 2026-09-14

### Añadido
- Columna `Comprador` insertada mediante `migrarAgregarColumnaComprador()`.

### Incidente
La migración se ejecutó dos veces y dejó la hoja con 21 columnas y los datos corridos una posición. Sin pérdida de datos. Ver [`docs/incidentes.md`](docs/incidentes.md).

---

## [1.0.0] — 2026-09-03

Versión inicial. Auditada externamente el 14 de septiembre de 2026 con veredicto **NO-GO para producción**, calificación 5.5/10.
