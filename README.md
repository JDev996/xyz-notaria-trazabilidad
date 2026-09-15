# Sistema de Trazabilidad Notarial

Gestión, auditoría y trazabilidad automatizada de escrituras públicas en una notaría. Controla el ciclo de vida de cada escritura desde que sale de la notaría hacia el cliente hasta su inscripción final en el registro, minimizando errores humanos y protegiendo la inmutabilidad del historial.

Construido sobre Google Sheets + Apps Script, con ingesta por Google Forms.

---

## Índice

- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Máquina de estados](#máquina-de-estados)
- [Instalación](#instalación)
- [Mantenimiento](#mantenimiento)
- [Vulnerabilidades y limitaciones conocidas](#vulnerabilidades-y-limitaciones-conocidas)
- [Historia del proyecto](#historia-del-proyecto)
- [Respaldos](#respaldos)

---

## Arquitectura

| Capa | Tecnología |
|---|---|
| Base de datos | Google Sheets — hojas `Registro_Escrituras` y `Parametros` |
| Ingesta | Google Forms conectado a la hoja |
| Lógica de negocio | Google Apps Script (`Codigo.gs`) |
| Reportes externos | Python (pandas, openpyxl, smtplib) — fuera de este repo |

Tres disparadores instalables:

| Trigger | Función | Cuándo |
|---|---|---|
| `onEdit` | `handleEdit` | Cada edición en la hoja |
| `onFormSubmit` | `procesarEnvioFormulario` | Cada envío del formulario |
| Temporal | `crearSeparadorDeMes` | Día 1 de cada mes, 00:00 |
| Temporal | `respaldoMensual` | Día 1 de cada mes, 02:00 |

### Principios de diseño

**Idempotencia.** Toda operación ejecutada dos veces debe dejar el mismo resultado que ejecutada una vez. Los dos bugs más destructivos del sistema venían de violar esto: una función re-estampaba fechas ya escritas, otra re-provisionaba filas que ya tenían datos.

**Una sola fuente de verdad por dato.** Los proyectos viven en `Parametros!A2:A`. Las opciones de los desplegables y los textos que aparecen dentro de fórmulas viven en constantes compartidas. Un texto duplicado en dos lugares siempre termina desincronizado, y el que falla en silencio es el de la fórmula.

**Lotes, no celda por celda.** En Apps Script lo caro no es el cálculo, son los viajes a Google. Una llamada que trae 1.000 filas cuesta casi lo mismo que una que trae 1.

**Prevenir antes que reaccionar.** `onEdit` es reactivo: se entera después de que el dato ya cambió. Los rangos protegidos son lo único que impide de verdad la edición manual de las columnas calculadas.

---

## Modelo de datos

Hoja `Registro_Escrituras`, 20 columnas:

| Col | Campo | Tipo |
|---|---|---|
| A | Número Escritura | Texto libre |
| B | Fecha Escritura | Fecha (calendario) |
| C | Proyecto | Desplegable desde `Parametros` |
| D | Comprador | Texto libre |
| E | Tipo de Pago | Desplegable — Contado / V Hipoteca / Leasing |
| F | VIS o No VIS | Desplegable |
| G | Estado Global | **Calculada, protegida** |
| H | Fecha Salida Notaría | Fecha (calendario), editable |
| I | Check Llegada | Checkbox |
| J | Fecha Llegada | **Calculada, protegida** |
| K | Check Requiere Corrección | Checkbox |
| L | Check Pasa Legalización | Checkbox |
| M | Fecha Legalización | **Calculada, protegida** |
| N | Check Sube Sellos Firmas | Checkbox |
| O | Fecha Sellos Firmas | **Calculada, protegida** |
| P | Check Bajada Registro | Checkbox |
| Q | Fecha Bajada Registro | **Calculada, protegida** |
| R | Mes Año Filtro | **Calculada, protegida, oculta** |
| S | Última Modificación Por | **Calculada, protegida** |
| T | Observaciones | Texto libre |

Cada columna tiene exactamente un rol, declarado en una constante: `COLUMNAS_TEXTO_LIBRE`, `COLUMNAS_FECHA_MANUAL`, `COLUMNAS_CHECK`, `COLUMNAS_CALCULADAS`.

---

## Máquina de estados

```
Sin Iniciar
    ↓  (se carga Fecha Salida Notaría)
Enviado a Cliente
    ↓  (Check Llegada)
Devuelto por el Cliente
    ↓  (Check Requiere Corrección)  →  En Corrección
    ↓  (Check Pasa Legalización)
En Legalización
    ↓  (Check Sube Sellos Firmas)
En Sellos y Firmas
    ↓  (Check Bajada Registro)
Listo para Registro
```

Cada paso declara su prerrequisito en `FLUJO`:

```js
{
  checkCol: COL.CHECK_BAJADA_REGISTRO,
  dateCol:  COL.FECHA_BAJADA_REGISTRO,
  estado:   ESTADOS.LISTO_REGISTRO,
  requiere: { col: COL.CHECK_SUBE_SELLOS_FIRMAS, tipo: 'check', etiqueta: 'Sube Sellos y Firmas' }
}
```

Agregar un paso nuevo es agregar una entrada a `FLUJO`. No hay que tocar `handleEdit` ni `calcularEstado`.

### Reglas de auditoría

- Un paso marcado **no se puede desmarcar**. El intento queda registrado en `Última Modificación Por`.
- La fecha de un paso **solo se estampa la primera vez**. Una fecha cargada es historia y no se pisa.
- Los pasos **no se pueden marcar fuera de orden**, ni de a uno ni pegando varios a la vez.

---

## Instalación

> ⚠️ **Hacé una copia de la hoja antes de correr cualquier función que toque la estructura.** Las funciones de migración son de un solo uso.

1. Pegar `Codigo.gs` en el editor de Apps Script del spreadsheet.
2. Ajustar `FORM_ID` al ID del Google Form propio (ver [Vulnerabilidades](#1--el-form_id-está-escrito-en-el-código)).
3. Cargar los proyectos reales en `Parametros!A2:A`.
4. Ejecutar `INSTALAR_TODOS_LOS_MOTORES()`.
5. Recargar la pestaña del spreadsheet para que aparezca el menú **Trazabilidad**.

Para una hoja nueva desde cero, correr `setupInicial()` antes del paso 4.

---

## Mantenimiento

Menú **Trazabilidad** en el spreadsheet:

| Acción | Qué hace |
|---|---|
| Verificar layout | Ancho del encabezado, cada encabezado contra el esperado, valores viejos sin migrar, proyectos huérfanos |
| Recalcular estados | Reaplica `calcularEstado()` sobre todas las filas y reporta las que corrigió |
| Migrar valores viejos | Reescribe valores renombrados según `VALORES_LEGADOS` |
| Respaldar ahora | Copia nativa a Drive |
| Agregar 200 filas | Extiende la capacidad |
| Reaplicar formato y protecciones | Reconstrucción idempotente de toda la configuración |
| Sincronizar formulario | Actualiza las opciones del Form desde `Parametros` |

### Rutina mensual (5 minutos)

1. Verificar layout
2. Recalcular estados
3. Confirmar que apareció el respaldo del mes

### Al renombrar cualquier etiqueta

Renombrar un estado o una opción de desplegable **no cambia los datos ya escritos**. El procedimiento es:

1. Cambiar la constante.
2. Agregar la equivalencia a `VALORES_LEGADOS`.
3. Correr **Migrar valores viejos**.
4. Verificar que el texto no esté escrito a mano dentro de una fórmula.

### Qué se reescribe en cada configuración

| Se reconstruye | Fuente de verdad |
|---|---|
| Encabezados y formato de la fila 1 | `HEADERS` / `aplicarEstetica()` |
| Desplegable de Proyecto | **`Parametros!A2:A`** |
| Desplegables de Tipo de Pago y VIS | `TIPOS_PAGO` / `OPCIONES_VIS` |
| Calendarios | `COLUMNAS_FECHA_MANUAL` |
| Reglas condicionales del sistema | `refrescarFormatoCondicionalEstado()` |
| Protecciones `SYS_CALC_` | `COLUMNAS_CALCULADAS` |

**Nunca se tocan:** los datos de las filas 2 en adelante, las reglas condicionales creadas por el usuario, y las protecciones creadas a mano.

Configurar a mano una columna que el script administra no sirve: se pierde en la próxima reconstrucción. Si algo tiene que sobrevivir, va en `Parametros` o en una constante.

---

## Vulnerabilidades y limitaciones conocidas

### 1. 🔴 El `FORM_ID` está escrito en el código

```js
const FORM_ID = '1RUd...';
```

Publicar este repo **en público expone ese identificador**. Un ID de formulario permite construir su URL de respuesta, o sea que cualquiera que lo tenga puede enviar registros al sistema.

**Mitigación recomendada:** repositorio privado. Si el repo tiene que ser público, mover el ID a propiedades del script:

```js
// Una sola vez, desde el editor:
// PropertiesService.getScriptProperties().setProperty('FORM_ID', '1RUd...');
const FORM_ID = PropertiesService.getScriptProperties().getProperty('FORM_ID');
```

El ID del spreadsheet **no** está en el código: se usa `getActiveSpreadsheet()`.

### 2. 🟠 La auditoría tiene un techo estructural

Está montada sobre `onEdit`. Cualquiera con permiso de edición puede abrir el editor de Apps Script, **borrar el trigger** y trabajar sin dejar rastro. Ninguna corrección dentro de este archivo resuelve eso.

Auditoría con valor probatorio requiere una de estas dos:
- un log *append-only* en una hoja que los usuarios no puedan editar;
- mover las escrituras a un Web App que corra como el dueño.

### 3. 🟠 La identificación del editor no siempre está disponible

```js
Session.getActiveUser().getEmail()   // vacío si el editor no comparte dominio con el dueño
e.user.getEmail()                     // misma limitación
```

En una cuenta de consumidor (`@gmail.com`) con colaboradores externos, esto devuelve vacío casi siempre y la columna registra `Usuario no identificado`. El código prefiere `e.user` y cae a `getActiveUser()`, pero la limitación es de la plataforma.

### 4. 🟠 "Requiere Corrección" se puede desmarcar con pegado múltiple

`e.oldValue` solo existe en ediciones de una sola celda. Para los pasos con columna de fecha, la fecha cargada sirve de prueba de que estuvieron marcados. **`CHECK_REQUIERE_CORRECCION` no tiene columna de fecha**, así que en una edición múltiple no hay forma de saberlo.

Se resuelve agregándole una columna `Fecha Corrección`, con el mismo patrón que protege a los otros cuatro pasos.

### 5. 🟡 La validación de datos puede rechazar escrituras del script

`setValue()` y `setValues()` **respetan** una validación creada con `setAllowInvalid(false)`: no escriben, lanzan excepción. Dentro de un trigger, esa excepción no la ve nadie hasta que alguien revisa Ejecuciones.

Está mitigado en los dos puntos donde importa (`migrarValoresLegados` limpia la validación antes de escribir; `procesarEnvioFormulario` detecta el proyecto desconocido y lo marca en Observaciones en vez de perder el envío), pero es una trampa a tener presente en cualquier código nuevo que escriba en columnas con desplegable.

### 6. 🟡 Límites de cuota de Apps Script

`handleEdit` recorre fila por fila. Una edición de más de `MAX_FILAS_POR_EDICION` (200) se rechaza con aviso antes de acercarse al límite de 6 minutos del trigger instalable.

### 7. 🟡 La ingesta depende del título de las preguntas del Form

`e.namedValues` se indexa por el título de la pregunta. Renombrar "Numero de Escritura" o "Proyecto" en el formulario rompe la ingesta. El código valida y lanza error explícito, pero el error solo se ve en Ejecuciones.

### 8. 🟡 No hay entorno de pruebas

Toda la verificación se hizo sobre lógica pura, fuera de Sheets. Eso cubre la máquina de estados y la coherencia del layout, pero no el comportamiento real de la API. Los tres errores más costosos de la auditoría fueron todos afirmaciones sobre cómo se comporta Sheets, no sobre la lógica.

---

## Historia del proyecto

Ver [`CHANGELOG.md`](CHANGELOG.md) para el detalle cronológico y [`docs/`](docs/) para los informes completos.

### Resumen

El sistema pasó por una auditoría QA externa que lo calificó **5.5/10** y dictaminó **NO-GO para producción**, con tres bloqueantes. Una revisión posterior confirmó esos tres, encontró **cinco más que el informe externo no vio** —dos de ellos destructivos en uso normal— y los cerró todos.

| Bloqueante | Origen |
|---|---|
| El flujo no validaba transiciones de estado | Informe externo |
| El historial se alteraba con pegado múltiple | Informe externo |
| Los campos de estado no estaban protegidos | Informe externo |
| Pegar `TRUE` sobre un paso ya marcado reescribía su fecha histórica | Auditoría interna |
| El contador de filas se desincronizaba y borraba checkboxes con datos | Auditoría interna |
| `primeraFilaLibre()` escribía en huecos intermedios del historial | Auditoría interna |
| La guarda de ingesta usaba `&&` donde iba `\|\|` | Auditoría interna |
| El pegado masivo se saltaba la máquina de estados entera | Revisión final |

Calificación actual: **8/10 para producción**. Lo que falta para más no está en este archivo: auditoría con valor probatorio y un entorno de pruebas.

### Los tres patrones que explican casi todos los bugs

**1. Idempotencia.** Ninguna función distinguía entre "hacer algo" y "volver a hacer algo ya hecho". Una re-estampaba fechas, otra re-provisionaba filas con datos.

**2. Cachés sin invalidación.** Un contador de filas guardado en propiedades del documento se desincronizaba un poco cada mes, hasta que la auto-extensión corría sobre filas con datos y las borraba. Se eliminó: la capacidad ahora se deriva siempre de la hoja.

**3. El pegado múltiple es el caso normal, no el borde.** Los tres bugs más graves del proyecto aparecían solo al pegar varias celdas a la vez. Las pruebas siempre se hacían de a un paso, que es el camino que uno imagina, no el que usan los usuarios.

---

## Respaldos

`respaldoMensual()` hace una **copia nativa de Drive** a la carpeta `Respaldos Trazabilidad Notarial`, conserva las últimas 12 y manda el resto a la papelera. Corre sola el día 1 de cada mes.

Una copia nativa conserva checkboxes, validaciones, formato, el script y su propio historial de versiones.

> Un `.xlsx` exportado **no es un respaldo**. Pierde el script, los triggers, los rangos protegidos, y los checkboxes se vuelven texto `TRUE`/`FALSE`. Sirve para leer los datos de un mes sin Google; no sirve para volver atrás.

También conviene saber: el historial de versiones de Google Sheets es excelente para deshacer un error, pero **vive dentro del archivo**. Si alguien borra el spreadsheet, se va con él.

---

## Licencia

Software interno. Todos los derechos reservados.
