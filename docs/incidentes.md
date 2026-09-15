# Incidentes y postmortems

---

## INC-001 — Columna `Comprador` insertada dos veces

**Fecha:** 14 de septiembre de 2026
**Severidad:** alta — desalineación de datos, sin pérdida
**Estado:** resuelto

### Qué pasó

Tras ejecutar `migrarAgregarColumnaComprador()` una segunda vez, la hoja quedó con **21 columnas** en vez de 20. Dos columnas vacías entre `Proyecto` y `Tipo de Pago`, encabezado `Observaciones` duplicado, y todos los datos corridos una posición desde D en adelante: `Hipoteca` aparecía bajo el encabezado "VIS o No VIS".

Ningún dato se perdió. Quedaron bajo la etiqueta equivocada.

### Causa raíz

Dos decisiones que por separado eran razonables y juntas se anularon:

1. La guarda de idempotencia usaba `D1 === 'Comprador'` como marca de "ya migré".
2. La migración limpiaba la columna nueva con `clearContent()` **desde la fila 1**, para quitarle el desplegable que hereda de su vecina izquierda. Eso borraba D1, o sea la marca.

El encabezado se reescribía después, en `aplicarEstetica()`. Pero esa función corre dentro de `ejecutarPaso()`, que **se traga los errores por diseño** para que un fallo cosmético no tumbe la migración. Si ese paso fallaba, la hoja quedaba migrada pero sin marca, y la siguiente corrida insertaba otra columna.

> **Lección:** una marca de idempotencia no puede depender de un paso al que se le permitió fallar en silencio. Tolerancia a fallos y detección de "ya corrí" se contradicen si comparten estado.

### Correcciones

**Guarda estructural**, independiente de cualquier texto que un paso pueda no haber escrito:

```js
const ancho = anchoEncabezado(sheet);
if (ancho >= HEADERS.length) throw new Error('La migración ya se corrió.');
```

**La marca se escribe antes de cualquier paso falible:**

```js
sheet.insertColumnAfter(COL.PROYECTO);
sheet.getRange(1, COL.COMPRADOR).setValue('Comprador');   // inmediata
// recién después se limpia, y desde la fila 2
```

**`repararCompradorDuplicado()`** — verifica que sobre exactamente una columna, que las dos candidatas estén vacías en todas las filas, desarma los separadores, borra la sobrante, rearma y revalida. Aborta con detalle si algo no cuadra.

### Nota sobre el diagnóstico

La primera versión de la reparación abortó con `La hoja tiene 30 columnas; se esperaban 21`. El error estaba en la métrica: usaba `getMaxColumns()`, que mide el **ancho de la grilla** —incluidas las columnas en blanco del final— cuando lo que importaba era el **ancho del encabezado**. Se agregó `anchoEncabezado()` y `getMaxColumns()` quedó restringido a chequeos de capacidad.

---

## INC-002 — La validación de datos rechazó una migración de valores

**Fecha:** 14 de septiembre de 2026
**Severidad:** baja — la operación se detuvo sin escribir nada
**Estado:** resuelto

### Qué pasó

```
Exception: Los datos que ingresaste en la celda E3 infringen las reglas de
validación de datos establecidas. Ingresa uno de los siguientes valores:
Contado, Hipoteca, Leasing.
```

`migrarValoresLegados()` intentaba escribir `V Hipoteca` mientras la validación instalada en la hoja todavía era la lista vieja.

### Causa raíz

Una afirmación falsa en la auditoría previa: *"las escrituras por script ignoran la validación de datos"*.

**Es al revés.** `Range.setValue()` y `Range.setValues()` **respetan** una validación creada con `setAllowInvalid(false)`: no escriben el valor, lanzan excepción.

### Implicación descubierta

El riesgo real era el opuesto al documentado. No es que el formulario pueda inyectar proyectos inválidos: es que **si lo intenta, el envío se pierde**. `procesarEnvioFormulario()` corre dentro de un trigger; la excepción aborta la función, la fila queda a medio escribir y la escritura nunca se registra.

Escenario: alguien quita un proyecto de `Parametros` mientras un formulario ya abierto todavía lo ofrece.

### Correcciones

`migrarValoresLegados()` limpia la validación, escribe, y reinstala la lista actualizada al final — así no depende del orden de ejecución.

`procesarEnvioFormulario()` detecta el proyecto desconocido, limpia la validación de esa celda, registra el envío igual y lo marca en `Observaciones`. Registrar y señalizar es mejor que rechazar: el envío ya ocurrió en el mundo real.

> **Lección:** la validación de datos de Sheets con "rechazar entrada" es una restricción del backend, no un aviso de interfaz. Y una afirmación sobre cómo se comporta una API no está verificada hasta que algo la ejecuta.

---

## INC-003 — Los proyectos del desplegable se reiniciaron

**Fecha:** 15 de septiembre de 2026
**Severidad:** baja — configuración, sin pérdida de datos
**Estado:** abierto (requiere acción manual)

### Qué pasó

Los 8 proyectos reales se habían cargado como validación manual sobre la columna C. Al correr la configuración, el desplegable volvió a los tres proyectos de prueba y las filas existentes quedaron marcadas como valor inválido.

### Causa raíz

No es un defecto: es el diseño funcionando. `aplicarDesplegablesBloque()` reconstruye la validación leyendo `Parametros!A2:A`, que seguía con los valores de prueba. Todo lo que se configure a mano sobre una columna administrada por el script se pierde en la próxima reconstrucción.

### Corrección

Cargar los proyectos reales en `Parametros!A2:A`. Eso además sincroniza el Google Form, que hasta entonces ofrecía los proyectos de prueba a quien lo llenara.

Se agregó `proyectosHuerfanos()`, que `verificarLayout()` usa para reportar proyectos presentes en los datos pero ausentes de `Parametros` — el chequeo que habría detectado esto antes del reinicio.
