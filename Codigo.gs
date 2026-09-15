/**
 * SISTEMA DE TRAZABILIDAD NOTARIAL
 * Hoja: Registro_Escrituras  |  Parámetros: Parametros  |  Ingesta: Google Forms
 */

/* ============================================================
 * 1. CONFIGURACIÓN
 * ============================================================ */

const SHEET_REGISTRO = 'Registro_Escrituras';
const SHEET_PARAMETROS = 'Parametros';
const FORM_ID = '1RUdN-RWFT0Hs0cs3JVpVKq6PA9acgrBYoea0gZfAVpw';

const COL = {
  NUMERO_ESCRITURA: 1,               // A
  FECHA_ESCRITURA: 2,                // B  manual
  PROYECTO: 3,                       // C
  COMPRADOR: 4,                      // D  manual
  TIPO_PAGO: 5,                      // E  manual
  VIS_NO_VIS: 6,                     // F  manual
  ESTADO_GLOBAL: 7,                  // G  calculada
  FECHA_SALIDA_NOTARIA: 8,           // H  calculada
  CHECK_LLEGADA_CONSTRUCTORA: 9,     // I
  FECHA_LLEGADA_CONSTRUCTORA: 10,    // J  calculada
  CHECK_REQUIERE_CORRECCION: 11,     // K
  CHECK_PASA_LEGALIZACION: 12,       // L
  FECHA_LEGALIZACION: 13,            // M  calculada
  CHECK_SUBE_SELLOS_FIRMAS: 14,      // N
  FECHA_SELLOS_FIRMAS: 15,           // O  calculada
  CHECK_BAJADA_REGISTRO: 16,         // P
  FECHA_BAJADA_REGISTRO: 17,         // Q  calculada
  MES_ANIO_FILTRO: 18,               // R  calculada, oculta
  ULTIMA_MODIFICACION_POR: 19,       // S  calculada
  OBSERVACIONES: 20                  // T  manual
};

const HEADERS = [
  'Número Escritura', 'Fecha Escritura', 'Proyecto', 'Comprador',
  'Tipo de Pago', 'VIS o No VIS',
  'Estado Global', 'Fecha Salida Notaría',
  'Check Llegada', 'Fecha Llegada',
  'Check Requiere Corrección',
  'Check Pasa Legalización', 'Fecha Legalización',
  'Check Sube Sellos Firmas', 'Fecha Sellos Firmas',
  'Check Bajada Registro', 'Fecha Bajada Registro',
  'Mes Año Filtro', 'Última Modificación Por', 'Observaciones'
];

/**
 * REGISTRO HISTÓRICO CONGELADO — describe el encabezado tal como estaba en la
 * hoja ANTES de agregar Comprador. No se actualiza cuando se renombra una
 * columna en HEADERS: si se cambia, la migración deja de reconocer una hoja
 * vieja legítima y valida contra un layout que nunca existió.
 */
const HEADERS_PRE_COMPRADOR = [
  'Número Escritura', 'Fecha Escritura', 'Proyecto', 'Tipo de Pago', 'VIS o No VIS',
  'Estado Global', 'Fecha Salida Notaría',
  'Check Llegada Constructora', 'Fecha Llegada Constructora',
  'Check Requiere Corrección',
  'Check Pasa Legalización', 'Fecha Legalización',
  'Check Sube Sellos Firmas', 'Fecha Sellos Firmas',
  'Check Bajada Registro', 'Fecha Bajada Registro',
  'Mes Año Filtro', 'Última Modificación Por', 'Observaciones'
];

const ESTADOS = {
  SIN_INICIAR: '',
  ENVIADO_CONSTRUCTORA: 'Enviado a Cliente',
  EN_REVISION: 'Devuelto por el Cliente',
  EN_CORRECCION: 'En Corrección',
  EN_LEGALIZACION: 'En Legalización',
  EN_SELLOS_FIRMAS: 'En Sellos y Firmas',
  LISTO_REGISTRO: 'Listo para Registro'
};

// Valores que entran en fórmulas. Nunca escribir estos textos a mano dentro de
// una fórmula: si cambian acá y quedan hardcodeados allá, la regla deja de
// coincidir y no avisa.
const TIPO_PAGO_HIPOTECA = 'V Hipoteca';
const VIS_APLICA = 'VIS';

const TIPOS_PAGO = ['Contado', TIPO_PAGO_HIPOTECA, 'Leasing'];
const OPCIONES_VIS = [VIS_APLICA, 'No VIS'];

/**
 * Valores viejos que quedaron escritos en la hoja y su equivalente actual.
 * Al renombrar un estado o una opción, agregar acá la equivalencia:
 * verificarLayout() los detecta y migrarValoresLegados() los reescribe.
 */
const VALORES_LEGADOS = {};
VALORES_LEGADOS[COL.ESTADO_GLOBAL] = {
  'Enviado a Constructora': ESTADOS.ENVIADO_CONSTRUCTORA,
  'Devuelto por la Constructora': ESTADOS.EN_REVISION,
  'Devuelto por el cliente': ESTADOS.EN_REVISION
};
VALORES_LEGADOS[COL.TIPO_PAGO] = {
  'Hipoteca': TIPO_PAGO_HIPOTECA
};

/**
 * Máquina de estados. Cada paso declara qué lo habilita (`requiere`), y esa
 * declaración es lo que se valida al marcar. Agregar un paso nuevo = agregar
 * una entrada acá; no hay que tocar handleEdit ni calcularEstado.
 *   requiere.tipo 'check' -> la columna debe estar en TRUE
 *   requiere.tipo 'fecha' -> la columna debe tener una fecha
 */
const FLUJO = [
  {
    checkCol: COL.CHECK_LLEGADA_CONSTRUCTORA,
    dateCol: COL.FECHA_LLEGADA_CONSTRUCTORA,
    estado: ESTADOS.EN_REVISION,
    requiere: { col: COL.FECHA_SALIDA_NOTARIA, tipo: 'fecha', etiqueta: 'Fecha Salida Notaría' }
  },
  {
    checkCol: COL.CHECK_REQUIERE_CORRECCION,
    dateCol: null,
    estado: ESTADOS.EN_CORRECCION,
    requiere: { col: COL.CHECK_LLEGADA_CONSTRUCTORA, tipo: 'check', etiqueta: 'Llegada del Cliente' }
  },
  {
    checkCol: COL.CHECK_PASA_LEGALIZACION,
    dateCol: COL.FECHA_LEGALIZACION,
    estado: ESTADOS.EN_LEGALIZACION,
    requiere: { col: COL.CHECK_LLEGADA_CONSTRUCTORA, tipo: 'check', etiqueta: 'Llegada del Cliente' }
  },
  {
    checkCol: COL.CHECK_SUBE_SELLOS_FIRMAS,
    dateCol: COL.FECHA_SELLOS_FIRMAS,
    estado: ESTADOS.EN_SELLOS_FIRMAS,
    requiere: { col: COL.CHECK_PASA_LEGALIZACION, tipo: 'check', etiqueta: 'Pasa Legalización' }
  },
  {
    checkCol: COL.CHECK_BAJADA_REGISTRO,
    dateCol: COL.FECHA_BAJADA_REGISTRO,
    estado: ESTADOS.LISTO_REGISTRO,
    requiere: { col: COL.CHECK_SUBE_SELLOS_FIRMAS, tipo: 'check', etiqueta: 'Sube Sellos y Firmas' }
  }
];

// Columnas de texto libre. Se les limpia la validación de forma explícita:
// al insertar una columna, Sheets le copia la validación de su vecina izquierda.
const COLUMNAS_TEXTO_LIBRE = [COL.NUMERO_ESCRITURA, COL.COMPRADOR, COL.OBSERVACIONES];

/**
 * Fechas que se cargan a mano, con selector de calendario.
 * Fecha Salida Notaría la escribe el formulario con la marca de tiempo del
 * envío, que no siempre es el día real en que salió la escritura: por eso se
 * puede corregir. Queda fuera de COLUMNAS_CALCULADAS, y todo cambio manual
 * sobre ella se registra en Última Modificación Por.
 */
const COLUMNAS_FECHA_MANUAL = [COL.FECHA_ESCRITURA, COL.FECHA_SALIDA_NOTARIA];

// Columnas que escribe el sistema. Se protegen contra edición manual.
const COLUMNAS_CALCULADAS = [
  COL.ESTADO_GLOBAL, COL.FECHA_LLEGADA_CONSTRUCTORA,
  COL.FECHA_LEGALIZACION, COL.FECHA_SELLOS_FIRMAS, COL.FECHA_BAJADA_REGISTRO,
  COL.MES_ANIO_FILTRO, COL.ULTIMA_MODIFICACION_POR
];

const COLUMNAS_CHECK = FLUJO.map(paso => paso.checkCol);

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const DIAS_ALERTA_VENCIMIENTO = 75;

const FILAS_MINIMAS_DISPONIBLES = 20;
const TAMANO_LOTE_EXTENSION = 200;
const MAX_FILAS_POR_EDICION = 200;   // corta ediciones gigantes antes del timeout de GAS
const PREFIJO_PROTECCION = 'SYS_CALC_';

/* ============================================================
 * 2. UTILIDADES
 * ============================================================ */

function obtenerHojaRegistro() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTRO);
  if (!sheet) throw new Error('No existe la hoja ' + SHEET_REGISTRO);
  return sheet;
}

function columnaALetra(col) {
  let letra = '';
  while (col > 0) {
    const resto = (col - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    col = Math.floor((col - 1) / 26);
  }
  return letra;
}

function obtenerEtiquetaMes(fecha) {
  return MESES[fecha.getMonth()] + ' DE ' + fecha.getFullYear();
}

function esEtiquetaMes(valor) {
  return typeof valor === 'string' && /^[A-ZÁÉÍÓÚÑ]+ DE \d{4}$/.test(valor.trim());
}

function celdaVacia(valor) {
  return valor === '' || valor === null || valor === undefined;
}

/**
 * Cuántas columnas usa realmente el encabezado. NO es getMaxColumns(): eso
 * cuenta el ancho de la grilla, que incluye columnas en blanco al final y no
 * dice nada sobre el layout.
 */
function anchoEncabezado(sheet) {
  const fila = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  for (let i = fila.length - 1; i >= 0; i--) {
    if (!celdaVacia(fila[i])) return i + 1;
  }
  return 0;
}

function avisar(mensaje, titulo) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(mensaje, titulo || 'Trazabilidad', 8);
  } catch (err) {
    Logger.log(titulo + ': ' + mensaje);
  }
}

/**
 * Corre un paso de configuración y registra el fallo en vez de tumbar todo.
 * Estética, desplegables y protecciones son cosméticos: si uno falla no debe
 * impedir que la migración o la instalación de triggers terminen.
 */
function ejecutarPaso(nombre, fn) {
  try {
    fn();
    Logger.log('OK: ' + nombre);
    return true;
  } catch (err) {
    Logger.log('FALLÓ ' + nombre + ': ' + err.message);
    return false;
  }
}

/* ============================================================
 * 3. GEOMETRÍA DE FILAS
 * La capacidad de la hoja se deriva siempre de getMaxRows(). No hay contador
 * cacheado: un contador desincronizado hacía que provisionarFilas() corriera
 * sobre filas con datos y insertCheckboxes() los borrara.
 * ============================================================ */

function ultimaFilaConDatos(sheet) {
  const maxFilas = sheet.getMaxRows();
  if (maxFilas < 2) return 1;

  // Una fila "tiene datos" si hay algo en A, B o C (los separadores de mes
  // llevan su etiqueta en A, así que también cuentan y no se pisan).
  const valores = sheet.getRange(2, COL.NUMERO_ESCRITURA, maxFilas - 1, COL.PROYECTO).getValues();
  for (let i = valores.length - 1; i >= 0; i--) {
    if (valores[i].some(v => !celdaVacia(v))) return i + 2;
  }
  return 1;
}

function primeraFilaLibre(sheet) {
  // Siempre después del último dato, nunca en un hueco intermedio: escribir en
  // un hueco metería la escritura bajo el separador de mes equivocado.
  const fila = ultimaFilaConDatos(sheet) + 1;
  if (sheet.getMaxRows() - fila < FILAS_MINIMAS_DISPONIBLES) {
    agregarMasFilas(TAMANO_LOTE_EXTENSION);
  }
  return fila;
}

function provisionarFilas(sheet, filaInicio, cantidad) {
  // insertCheckboxes() pone en FALSE todas las celdas del rango. Si el bloque
  // tuviera datos, los destruiría: por eso se aborta en vez de continuar.
  const bloque = sheet.getRange(filaInicio, 1, cantidad, HEADERS.length).getValues();
  const tieneDatos = bloque.some(fila => fila.some(v => !celdaVacia(v) && v !== false));
  if (tieneDatos) {
    throw new Error('provisionarFilas() abortada: el bloque ' + filaInicio + '-' +
      (filaInicio + cantidad - 1) + ' ya tiene datos.');
  }

  COLUMNAS_CHECK.forEach(col => {
    const rango = sheet.getRange(filaInicio, col, cantidad, 1);
    rango.insertCheckboxes();
    rango.setBorder(true, true, true, true, true, true);
  });
}

function agregarMasFilas(cantidad) {
  const sheet = obtenerHojaRegistro();
  const filaInicio = sheet.getMaxRows() + 1;

  sheet.insertRowsAfter(sheet.getMaxRows(), cantidad);
  provisionarFilas(sheet, filaInicio, cantidad);

  // Solo sobre el bloque nuevo. Reaplicar validaciones y protecciones sobre
  // toda la hoja hacía que una extensión disparada por un envío de formulario
  // retuviera el lock durante minutos, y los envíos en paralelo caducaran.
  aplicarDesplegablesBloque(sheet, filaInicio, cantidad);
  extenderProteccionesHasta(sheet, sheet.getMaxRows());
  refrescarFormatoCondicionalEstado(sheet);

  SpreadsheetApp.flush();
  Logger.log('Agregadas ' + cantidad + ' filas desde la ' + filaInicio + '.');
}

function agregarMasFilas200() {
  conLockDeFilaLibre(() => agregarMasFilas(TAMANO_LOTE_EXTENSION));
}

/* ============================================================
 * 4. LOCK
 * Envuelve el tramo completo buscar-fila -> escribir. Si solo se protegiera la
 * búsqueda, dos triggers podrían calcular la misma fila libre.
 * ============================================================ */

function conLockDeFilaLibre(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    throw new Error('No se pudo obtener el lock de escritura en 30 s: ' + err);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * 5. ESTADO Y AUDITORÍA
 * ============================================================ */

function calcularEstado(fila) {
  if (fila[COL.CHECK_BAJADA_REGISTRO - 1] === true) return ESTADOS.LISTO_REGISTRO;
  if (fila[COL.CHECK_SUBE_SELLOS_FIRMAS - 1] === true) return ESTADOS.EN_SELLOS_FIRMAS;
  if (fila[COL.CHECK_PASA_LEGALIZACION - 1] === true) return ESTADOS.EN_LEGALIZACION;
  if (fila[COL.CHECK_REQUIERE_CORRECCION - 1] === true) return ESTADOS.EN_CORRECCION;
  if (fila[COL.CHECK_LLEGADA_CONSTRUCTORA - 1] === true) return ESTADOS.EN_REVISION;
  if (fila[COL.FECHA_SALIDA_NOTARIA - 1] instanceof Date) return ESTADOS.ENVIADO_CONSTRUCTORA;
  return ESTADOS.SIN_INICIAR;
}

/**
 * Devuelve null si el paso se puede marcar, o el motivo del rechazo.
 *
 * `columnasTocadas` importa: cuando se pegan varios checks de golpe, la hoja ya
 * tiene todos en TRUE antes de que corra el trigger, así que cada paso vería su
 * requisito "cumplido" por el mismo pegado y el flujo entero se saltaría en una
 * sola acción. Un paso previo marcado en la MISMA edición solo cuenta si su
 * fecha ya estaba cargada, que es la prueba de que se registró antes.
 */
function validarPrerrequisito(valoresFila, paso, columnasTocadas) {
  if (!paso.requiere) return null;
  const req = paso.requiere;
  const valor = valoresFila[req.col - 1];

  if (req.tipo === 'fecha') {
    return (valor instanceof Date) ? null : 'Falta ' + req.etiqueta + '.';
  }

  if (valor !== true) return 'Falta completar el paso previo: ' + req.etiqueta + '.';

  if (columnasTocadas && columnasTocadas.indexOf(req.col) !== -1) {
    const previo = FLUJO.find(f => f.checkCol === req.col);
    if (previo && previo.dateCol && !(valoresFila[previo.dateCol - 1] instanceof Date)) {
      return 'No se puede registrar "' + req.etiqueta + '" y este paso en la misma edición. ' +
        'Marcá los pasos de a uno.';
    }
  }
  return null;
}

function obtenerEmailEditor(e) {
  // e.user identifica a quien editó; getActiveUser() devuelve vacío cuando el
  // editor no está en el mismo dominio que el dueño del script.
  try {
    if (e && e.user) {
      const email = e.user.getEmail();
      if (email) return email;
    }
  } catch (err) { /* sigue al fallback */ }

  try {
    return Session.getActiveUser().getEmail() || 'Usuario no identificado';
  } catch (err) {
    return 'Usuario no identificado';
  }
}

function textoAuditoria(e, detalle) {
  const base = obtenerEmailEditor(e) + ' — ' + new Date().toLocaleString();
  return detalle ? base + ' — ' + detalle : base;
}

/* ============================================================
 * 6. TRIGGER DE EDICIÓN
 * Se procesa fila por fila (no celda por celda) leyendo la fila completa una
 * sola vez: un pegado grande generaba miles de llamadas al Spreadsheet.
 * ============================================================ */

function handleEdit(e) {
  const sheet = e.range.getSheet();

  if (sheet.getName() === SHEET_PARAMETROS) {
    manejarEdicionParametros(e);
    return;
  }
  if (sheet.getName() !== SHEET_REGISTRO) return;

  const filaInicio = e.range.getRow();
  const numFilas = e.range.getNumRows();

  if (numFilas > MAX_FILAS_POR_EDICION) {
    avisar('Edición de ' + numFilas + ' filas: supera el máximo de ' + MAX_FILAS_POR_EDICION +
      '. No se recalculó nada. Hacelo en bloques más chicos.', 'Edición demasiado grande');
    return;
  }

  const colInicio = e.range.getColumn();
  const numCols = e.range.getNumColumns();
  const columnasTocadas = [];
  for (let i = 0; i < numCols; i++) columnasTocadas.push(colInicio + i);

  for (let dFila = 0; dFila < numFilas; dFila++) {
    const row = filaInicio + dFila;
    if (row === 1) continue;
    procesarFilaEditada(sheet, row, columnasTocadas, e);
  }
}

function procesarFilaEditada(sheet, row, columnasTocadas, e) {
  const valores = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];

  if (esEtiquetaMes(valores[COL.NUMERO_ESCRITURA - 1])) return; // separador de mes

  const esCeldaUnica = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  const cambios = {};   // columna -> valor a escribir
  let recalcularEstado = false;

  columnasTocadas.forEach(col => {
    if (COLUMNAS_FECHA_MANUAL.indexOf(col) !== -1) {
      manejarCambioFechaManual(valores, cambios, col, e);
      // Solo la fecha de salida participa del estado (dispara "Enviado a Cliente").
      if (col === COL.FECHA_SALIDA_NOTARIA) recalcularEstado = true;
      return;
    }

    const paso = FLUJO.find(f => f.checkCol === col);
    if (!paso) return;

    if (valores[col - 1] === true) {
      manejarPasoMarcado(sheet, row, valores, cambios, paso, e, columnasTocadas);
    } else {
      manejarPasoDesmarcado(sheet, row, valores, paso, e, esCeldaUnica);
    }
    recalcularEstado = true;
  });

  // Escritura al final y en lote, ya con los valores en memoria actualizados.
  Object.keys(cambios).forEach(col => { valores[Number(col) - 1] = cambios[col]; });

  if (recalcularEstado) {
    cambios[COL.ESTADO_GLOBAL] = calcularEstado(valores);
  }
  Object.keys(cambios).forEach(col => {
    sheet.getRange(row, Number(col)).setValue(cambios[col]);
  });
}

/**
 * Un único criterio para el mes de filtro: manda la Fecha Escritura, y si no
 * hay, la Fecha Salida. Antes cada camino usaba una distinta y la columna
 * significaba dos cosas según quién la hubiera escrito.
 */
function calcularMesFiltro(valores) {
  const escritura = valores[COL.FECHA_ESCRITURA - 1];
  if (escritura instanceof Date) return obtenerEtiquetaMes(escritura);

  const salida = valores[COL.FECHA_SALIDA_NOTARIA - 1];
  if (salida instanceof Date) return obtenerEtiquetaMes(salida);

  return '';
}

function manejarCambioFechaManual(valores, cambios, col, e) {
  const valor = valores[col - 1];
  const etiqueta = HEADERS[col - 1];

  // Texto que parece fecha pero no lo es: rompe la alerta de vencimiento.
  if (!celdaVacia(valor) && !(valor instanceof Date)) {
    avisar(etiqueta + ' no quedó como fecha. Cargala con el calendario.', 'Fecha inválida');
    return;
  }

  // Borrar la fecha de salida con pasos ya registrados deja el flujo sin origen.
  if (col === COL.FECHA_SALIDA_NOTARIA && celdaVacia(valor)) {
    const marcados = COLUMNAS_CHECK.filter(c => valores[c - 1] === true).length;
    if (marcados > 0) {
      avisar('Se borró ' + etiqueta + ' con ' + marcados + ' paso(s) ya registrado(s): ' +
        'el historial queda sin fecha de origen.', 'Revisar');
    }
  }

  cambios[COL.MES_ANIO_FILTRO] = calcularMesFiltro(valores);
  cambios[COL.ULTIMA_MODIFICACION_POR] = textoAuditoria(e, 'editó ' + etiqueta);
}

function manejarPasoMarcado(sheet, row, valores, cambios, paso, e, columnasTocadas) {
  const motivoRechazo = validarPrerrequisito(valores, paso, columnasTocadas);
  if (motivoRechazo) {
    sheet.getRange(row, paso.checkCol).setValue(false);
    valores[paso.checkCol - 1] = false;
    avisar(motivoRechazo + ' El paso se desmarcó.', 'Paso fuera de orden');
    return;
  }

  // Solo se estampa la PRIMERA vez. Una fecha ya cargada es historia: volver a
  // escribirla (por un pegado o un relleno) borraría la cronología real.
  if (paso.dateCol) {
    if (valores[paso.dateCol - 1] instanceof Date) return;
    cambios[paso.dateCol] = new Date();
  }
  cambios[COL.ULTIMA_MODIFICACION_POR] = textoAuditoria(e);
}

function manejarPasoDesmarcado(sheet, row, valores, paso, e, esCeldaUnica) {
  // En edición de una sola celda e.oldValue es exacto. En edición múltiple no
  // existe: para los pasos con fecha, una fecha cargada prueba que ya se marcó.
  const yaEstabaMarcado = esCeldaUnica
    ? e.oldValue === 'TRUE'
    : (paso.dateCol ? valores[paso.dateCol - 1] instanceof Date : false);

  if (!yaEstabaMarcado) return;

  sheet.getRange(row, paso.checkCol).setValue(true);
  valores[paso.checkCol - 1] = true;
  sheet.getRange(row, COL.ULTIMA_MODIFICACION_POR)
    .setValue(textoAuditoria(e, 'intento de desmarcar ' + HEADERS[paso.checkCol - 1]));
  avisar('Este paso ya quedó registrado y no se puede desmarcar.', 'Escritura auditada');
}

/* ============================================================
 * 7. INGESTA DESDE EL FORMULARIO
 * ============================================================ */

function procesarEnvioFormulario(e) {
  conLockDeFilaLibre(() => {
    const sheet = obtenerHojaRegistro();

    const numEscritura = (e.namedValues['Numero de Escritura'] || [])[0] || '';
    const proyecto = (e.namedValues['Proyecto'] || [])[0] || '';

    // Cualquiera de las dos que falte invalida el envío: una fila sin número de
    // escritura no es rastreable.
    if (!numEscritura || !proyecto) {
      throw new Error('Respuesta incompleta. "Numero de Escritura"="' + numEscritura +
        '", "Proyecto"="' + proyecto + '". Revisá que los títulos del formulario coincidan.');
    }

    const filaLibre = primeraFilaLibre(sheet);
    const timestamp = (e.values && e.values[0]) ? new Date(e.values[0]) : new Date();
    const fechaValida = isNaN(timestamp.getTime()) ? new Date() : timestamp;

    const notas = [];

    const duplicada = buscarFilaPorNumeroEscritura(sheet, numEscritura, filaLibre);
    if (duplicada) {
      notas.push('⚠ POSIBLE DUPLICADO de la fila ' + duplicada + ' (misma escritura).');
    }

    // Proyecto tiene validación de "rechazar entrada", y setValue() la respeta:
    // si el formulario manda un proyecto que ya no está en Parametros, lanzaría
    // excepción y se perdería el envío. Se registra igual y se marca.
    const celdaProyecto = sheet.getRange(filaLibre, COL.PROYECTO);
    if (leerProyectosParametros().indexOf(proyecto) === -1) {
      celdaProyecto.clearDataValidations();
      notas.push('⚠ El proyecto "' + proyecto + '" no figura en Parametros.');
    }

    sheet.getRange(filaLibre, COL.NUMERO_ESCRITURA).setValue(numEscritura);
    celdaProyecto.setValue(proyecto);
    sheet.getRange(filaLibre, COL.FECHA_SALIDA_NOTARIA).setValue(fechaValida);
    sheet.getRange(filaLibre, COL.MES_ANIO_FILTRO).setValue(obtenerEtiquetaMes(fechaValida));

    if (notas.length > 0) {
      sheet.getRange(filaLibre, COL.OBSERVACIONES).setValue(notas.join(' '));
    }

    const filaCompleta = sheet.getRange(filaLibre, 1, 1, HEADERS.length).getValues()[0];
    sheet.getRange(filaLibre, COL.ESTADO_GLOBAL).setValue(calcularEstado(filaCompleta));
  });
}

/** Devuelve la primera fila con ese número de escritura, o null. */
function buscarFilaPorNumeroEscritura(sheet, numero, hastaFila) {
  if (hastaFila < 2) return null;
  const valores = sheet.getRange(2, COL.NUMERO_ESCRITURA, hastaFila - 1, 1).getValues();
  const buscado = String(numero).trim();

  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i][0]).trim() === buscado && !celdaVacia(valores[i][0])) return i + 2;
  }
  return null;
}

/* ============================================================
 * 8. SEPARADOR DE MES
 * ============================================================ */

function crearSeparadorDeMes() {
  conLockDeFilaLibre(() => {
    const sheet = obtenerHojaRegistro();
    const etiquetaMes = obtenerEtiquetaMes(new Date());
    const filaInsercion = primeraFilaLibre(sheet);

    sheet.insertRowBefore(filaInsercion);

    const rango = sheet.getRange(filaInsercion, 1, 1, HEADERS.length);
    rango.clearDataValidations();   // la fila hereda los checkboxes de la de arriba
    rango.clearContent();
    rango.merge();
    rango.setValue(etiquetaMes);
    rango.setBackground('#fce5cd')
      .setFontWeight('bold')
      .setFontSize(14)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    sheet.setRowHeight(filaInsercion, 30);
  });
}

function instalarTriggerMensual() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'crearSeparadorDeMes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('crearSeparadorDeMes').timeBased().onMonthDay(1).atHour(0).create();
}

/* ============================================================
 * 9. VALIDACIONES, FORMATO Y PROTECCIONES
 * ============================================================ */

function aplicarEstetica() {
  const sheet = obtenerHojaRegistro();

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setValues([HEADERS]);
  headerRange
    .setBackground('#FFFF00')
    .setFontColor('#000000')
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true);

  sheet.setRowHeight(1, 50);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(COL.COMPRADOR, 220);
  sheet.hideColumns(COL.MES_ANIO_FILTRO);

  refrescarFormatoCondicionalEstado(sheet);
}

function aplicarDesplegablesSheet() {
  const sheet = obtenerHojaRegistro();
  aplicarDesplegablesBloque(sheet, 2, Math.max(sheet.getMaxRows() - 1, 1));
}

function aplicarDesplegablesBloque(sheet, filaInicio, cantidad) {
  if (cantidad < 1) return;

  const proyectos = leerProyectosParametros();
  const rangoProyecto = sheet.getRange(filaInicio, COL.PROYECTO, cantidad, 1);
  if (proyectos.length === 0) {
    rangoProyecto.clearDataValidations();
  } else {
    rangoProyecto.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(proyectos, true).setAllowInvalid(false).build());
  }

  sheet.getRange(filaInicio, COL.TIPO_PAGO, cantidad, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(TIPOS_PAGO, true).setAllowInvalid(false).build());

  sheet.getRange(filaInicio, COL.VIS_NO_VIS, cantidad, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(OPCIONES_VIS, true).setAllowInvalid(false).build());

  const reglaFecha = SpreadsheetApp.newDataValidation()
    .requireDate().setAllowInvalid(false).build();
  COLUMNAS_FECHA_MANUAL.forEach(col => {
    sheet.getRange(filaInicio, col, cantidad, 1).setDataValidation(reglaFecha);
  });

  COLUMNAS_TEXTO_LIBRE.forEach(col => {
    sheet.getRange(filaInicio, col, cantidad, 1).clearDataValidations();
  });
}

/** true si la regla la creó este script (para no borrar reglas del usuario). */
function esReglaDelSistema(regla) {
  const cond = regla.getBooleanCondition();
  if (!cond) return false;

  const valores = (cond.getCriteriaValues() || []).map(String);
  return valores.some(v =>
    v.indexOf(ESTADOS.LISTO_REGISTRO) !== -1 || v === ESTADOS.EN_CORRECCION);
}

function refrescarFormatoCondicionalEstado(sheet) {
  const numFilas = Math.max(sheet.getMaxRows() - 1, 1);
  const rangoEstado = sheet.getRange(2, COL.ESTADO_GLOBAL, numFilas, 1);
  const rangoFila = sheet.getRange(2, 1, numFilas, HEADERS.length);

  const colFecha = columnaALetra(COL.FECHA_ESCRITURA);
  const colTipoPago = columnaALetra(COL.TIPO_PAGO);
  const colVis = columnaALetra(COL.VIS_NO_VIS);
  const colEstado = columnaALetra(COL.ESTADO_GLOBAL);
  const colCorreccion = columnaALetra(COL.CHECK_REQUIERE_CORRECCION);

  // Los textos salen de las constantes, no escritos a mano: si mañana cambia
  // "V Hipoteca" o "VIS", la regla los sigue.
  const formulaVencimiento =
    '=AND(OR($' + colTipoPago + '2="' + TIPO_PAGO_HIPOTECA + '",' +
    '$' + colVis + '2="' + VIS_APLICA + '"),' +
    'ISNUMBER($' + colFecha + '2),' +
    'TODAY()-$' + colFecha + '2>' + DIAS_ALERTA_VENCIMIENTO + ',' +
    '$' + colEstado + '2<>"' + ESTADOS.LISTO_REGISTRO + '")';

  const formulaCorreccion =
    '=AND($' + colCorreccion + '2=TRUE,$' + colEstado + '2<>"' + ESTADOS.LISTO_REGISTRO + '")';

  const reglasSistema = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formulaVencimiento)
      .setBackground('#FF0000').setFontColor('#FFFFFF')
      .setRanges([rangoFila]).build(),

    // Una corrección pendiente se ve aunque la escritura ya haya avanzado.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formulaCorreccion)
      .setBackground('#FDE2E2').setFontColor('#B00020')
      .setRanges([rangoFila]).build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(ESTADOS.LISTO_REGISTRO)
      .setBackground('#DFF5D8').setFontColor('#1B5E20')
      .setRanges([rangoEstado]).build()
  ];

  // Si una regla existente no se puede inspeccionar, se conserva: perder una
  // regla del usuario es peor que dejar una duplicada.
  let ajenas = [];
  try {
    ajenas = sheet.getConditionalFormatRules().filter(r => {
      try { return !esReglaDelSistema(r); } catch (err) { return true; }
    });
  } catch (err) {
    Logger.log('No se pudieron leer las reglas existentes: ' + err.message);
  }
  sheet.setConditionalFormatRules(reglasSistema.concat(ajenas));
}

/**
 * Bloquea la edición manual de las columnas que calcula el sistema. handleEdit
 * es reactivo (se entera después); esto es lo único que previene de verdad.
 */
function protegerColumnasCalculadas() {
  const sheet = obtenerHojaRegistro();
  const numFilas = Math.max(sheet.getMaxRows() - 1, 1);

  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => {
    if (p.getDescription().indexOf(PREFIJO_PROTECCION) === 0) p.remove();
  });

  const yo = Session.getEffectiveUser();
  let protegidas = 0;

  COLUMNAS_CALCULADAS.forEach(col => {
    const letra = columnaALetra(col);
    ejecutarPaso('proteger columna ' + letra, () => {
      const proteccion = sheet.getRange(2, col, numFilas, 1).protect();
      proteccion.setDescription(PREFIJO_PROTECCION + letra);

      // No se puede quitar al dueño de su propia protección: filtrarlo antes
      // evita la excepción "You cannot remove yourself".
      const otros = proteccion.getEditors().filter(u => u.getEmail() !== yo.getEmail());
      if (otros.length > 0) proteccion.removeEditors(otros);

      // setDomainEdit solo aplica a cuentas de Workspace; en una cuenta
      // personal lanza excepción, y no pasa nada si se omite.
      try {
        if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
      } catch (err) {
        Logger.log('Columna ' + letra + ': sin dominio Workspace, se omite setDomainEdit.');
      }
      protegidas++;
    });
  });

  Logger.log('Protegidas ' + protegidas + ' de ' + COLUMNAS_CALCULADAS.length + ' columnas.');
}

/**
 * Estira las protecciones existentes hasta la última fila, en vez de borrarlas
 * y recrearlas. Es el camino barato para cuando se extienden filas.
 */
function extenderProteccionesHasta(sheet, ultimaFila) {
  const numFilas = Math.max(ultimaFila - 1, 1);
  const existentes = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(p => p.getDescription().indexOf(PREFIJO_PROTECCION) === 0);

  if (existentes.length === 0) {
    protegerColumnasCalculadas();
    return;
  }

  existentes.forEach(p => {
    ejecutarPaso('extender ' + p.getDescription(), () => {
      const col = p.getRange().getColumn();
      p.setRange(sheet.getRange(2, col, numFilas, 1));
    });
  });
}

/* ============================================================
 * 10. PARÁMETROS Y SINCRONIZACIÓN DEL FORMULARIO
 * ============================================================ */

function manejarEdicionParametros(e) {
  if (e.range.getRow() === 1 || e.range.getColumn() !== 1) return;
  aplicarDesplegablesSheet();
  sincronizarFormulario();
}

function leerProyectosParametros() {
  const parametros = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PARAMETROS);
  if (!parametros) throw new Error('No existe la hoja ' + SHEET_PARAMETROS);

  const ultimaFila = parametros.getLastRow();
  if (ultimaFila < 2) return [];

  return parametros.getRange(2, 1, ultimaFila - 1, 1).getValues()
    .flat()
    .map(v => String(v).trim())
    .filter(v => v !== '');
}

function sincronizarFormulario() {
  const proyectos = leerProyectosParametros();

  // setChoiceValues() lanza excepción con un arreglo vacío.
  if (proyectos.length === 0) {
    avisar('No hay proyectos en Parametros. El formulario quedó sin actualizar.',
      'Sincronización omitida');
    return;
  }

  const form = FormApp.openById(FORM_ID);
  const itemProyecto = form.getItems().find(item =>
    item.getTitle() === 'Proyecto' && item.getType() === FormApp.ItemType.LIST);

  if (!itemProyecto) {
    throw new Error('No se encontró en el formulario una pregunta tipo Lista titulada "Proyecto".');
  }
  itemProyecto.asListItem().setChoiceValues(proyectos);
}

/* ============================================================
 * 11. MIGRACIONES Y REPARACIÓN
 * ============================================================ */

/**
 * Reescribe en la hoja los valores viejos listados en VALORES_LEGADOS.
 * Necesaria cada vez que se renombra un estado o una opción de desplegable:
 * cambiar la constante no toca los datos ya escritos. Idempotente.
 */
function migrarValoresLegados() {
  const sheet = obtenerHojaRegistro();
  const ultima = ultimaFilaConDatos(sheet);
  if (ultima < 2) {
    Logger.log('Sin datos que migrar.');
    return { total: 0, detalle: [] };
  }

  const detalle = [];
  let total = 0;

  Object.keys(VALORES_LEGADOS).forEach(clave => {
    const col = Number(clave);
    const mapa = VALORES_LEGADOS[col];
    const rango = sheet.getRange(2, col, ultima - 1, 1);
    const valores = rango.getValues();
    let cambiadas = 0;

    valores.forEach(fila => {
      const actual = String(fila[0]).trim();
      if (mapa.hasOwnProperty(actual) && actual !== mapa[actual]) {
        fila[0] = mapa[actual];
        cambiadas++;
      }
    });

    if (cambiadas > 0) {
      // setValues() NO se salta la validación: con setAllowInvalid(false)
      // lanza excepción si el valor nuevo todavía no está en la lista vieja.
      // Se limpia, se escribe, y al final se reinstala la lista actualizada.
      rango.clearDataValidations();
      rango.setValues(valores);   // una sola escritura por columna
      detalle.push(HEADERS[col - 1] + ': ' + cambiadas + ' celda(s)');
      total += cambiadas;
    }
  });

  // Reinstala los desplegables con los valores vigentes. Así la función es
  // independiente del orden: no hace falta configurar la hoja antes.
  if (total > 0) ejecutarPaso('reaplicar desplegables', aplicarDesplegablesSheet);

  SpreadsheetApp.flush();
  Logger.log(total === 0
    ? 'No había valores viejos que migrar.'
    : 'Valores migrados -> ' + detalle.join(' | '));
  return { total: total, detalle: detalle };
}

/**
 * Proyectos usados en los datos que no figuran en Parametros.
 * Parametros es la fuente de verdad del desplegable: lo que se configure a mano
 * sobre la columna se pierde en la próxima reconstrucción. Este chequeo avisa
 * antes de que eso pase, en vez de que se note cuando la lista ya se reinició.
 */
function proyectosHuerfanos(sheet) {
  const ultima = ultimaFilaConDatos(sheet);
  if (ultima < 2) return [];

  const validos = leerProyectosParametros();
  if (validos.length === 0) {
    return ['Parametros no tiene ningún proyecto cargado (Parametros!A2:A)'];
  }

  const conteo = {};
  sheet.getRange(2, COL.PROYECTO, ultima - 1, 1).getValues().forEach(f => {
    const valor = String(f[0]).trim();
    if (valor !== '' && validos.indexOf(valor) === -1) {
      conteo[valor] = (conteo[valor] || 0) + 1;
    }
  });

  return Object.keys(conteo).map(p =>
    'proyecto "' + p + '" usado en ' + conteo[p] + ' fila(s) pero ausente de Parametros');
}

/** Cuenta valores viejos sin tocarlos. Lo usa verificarLayout(). */
function contarValoresLegados(sheet) {
  const ultima = ultimaFilaConDatos(sheet);
  if (ultima < 2) return [];

  const hallazgos = [];
  Object.keys(VALORES_LEGADOS).forEach(clave => {
    const col = Number(clave);
    const mapa = VALORES_LEGADOS[col];
    const valores = sheet.getRange(2, col, ultima - 1, 1).getValues();

    const conteo = {};
    valores.forEach(fila => {
      const actual = String(fila[0]).trim();
      if (mapa.hasOwnProperty(actual) && actual !== mapa[actual]) {
        conteo[actual] = (conteo[actual] || 0) + 1;
      }
    });

    Object.keys(conteo).forEach(viejo => {
      hallazgos.push(HEADERS[col - 1] + ': ' + conteo[viejo] + ' celda(s) con "' +
        viejo + '" (ahora es "' + mapa[viejo] + '")');
    });
  });
  return hallazgos;
}

function migrarAgregarColumnaComprador() {
  const sheet = obtenerHojaRegistro();

  // Dos guardas independientes. La estructural no depende de ningún texto que
  // un paso posterior pueda no haber escrito.
  const ancho = anchoEncabezado(sheet);
  if (ancho >= HEADERS.length) {
    throw new Error('El encabezado ya ocupa ' + ancho + ' columnas (el layout migrado tiene ' +
      HEADERS.length + '). La migración ya se corrió. No se insertó nada.');
  }
  if (sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0].indexOf('Comprador') !== -1) {
    throw new Error('Ya existe un encabezado "Comprador". La migración ya se corrió.');
  }

  // Validar el layout COMPLETO antes de tocar nada. Insertar una columna sobre
  // un layout que no es el esperado desalinea toda la hoja.
  const anchoViejo = HEADERS_PRE_COMPRADOR.length;
  if (sheet.getMaxColumns() < anchoViejo) {
    throw new Error('La grilla tiene ' + sheet.getMaxColumns() + ' columnas y hacen falta al ' +
      'menos ' + anchoViejo + ' para leer el encabezado. Migración abortada.');
  }
  const actuales = sheet.getRange(1, 1, 1, anchoViejo).getValues()[0];
  const diferencias = [];
  HEADERS_PRE_COMPRADOR.forEach((esperado, i) => {
    if (String(actuales[i]).trim() !== esperado) {
      diferencias.push(columnaALetra(i + 1) + ': esperaba "' + esperado + '", hay "' + actuales[i] + '"');
    }
  });
  if (diferencias.length > 0) {
    throw new Error('El encabezado no coincide con el layout esperado. Migración abortada.\n' +
      diferencias.join('\n'));
  }

  // Los separadores son celdas combinadas: desarmarlos antes de insertar una
  // columna. Una sola llamada devuelve todos los merges que tocan la columna A.
  const separadores = desarmarSeparadores(sheet);

  sheet.insertColumnAfter(COL.PROYECTO);

  // La marca de idempotencia se escribe ACÁ, antes de cualquier paso que pueda
  // fallar. Si dependiera de aplicarEstetica() —que corre tolerando errores—
  // un fallo dejaría la hoja migrada pero sin marca, y la próxima corrida
  // insertaría una segunda columna.
  sheet.getRange(1, COL.COMPRADOR).setValue('Comprador');

  // La columna nueva hereda formato y validación de Proyecto (su vecina
  // izquierda). Comprador es texto libre: se limpia de la fila 2 hacia abajo,
  // nunca la fila 1.
  if (sheet.getMaxRows() >= 2) {
    sheet.getRange(2, COL.COMPRADOR, sheet.getMaxRows() - 1, 1)
      .clearDataValidations()
      .clearContent()
      .setBackground(null)
      .setFontColor(null);
  }

  rearmarSeparadores(sheet, separadores);

  Logger.log('Estructura migrada: columna Comprador en ' + columnaALetra(COL.COMPRADOR) +
    '. ' + separadores.length + ' separador(es) rearmado(s).');

  finalizarConfiguracion();
  SpreadsheetApp.flush();
}

/**
 * REPARACIÓN — quita la columna Comprador duplicada.
 * Si la migración corrió dos veces, la hoja queda con una columna vacía de más
 * y los datos corridos respecto de los encabezados. Verifica todo antes de
 * borrar y aborta si algo no cuadra.
 */
function repararCompradorDuplicado() {
  const sheet = obtenerHojaRegistro();

  // Se mide el encabezado, no la grilla: getMaxColumns() incluye las columnas
  // en blanco del final y no dice nada del layout.
  const ancho = anchoEncabezado(sheet);
  const sobrantes = ancho - HEADERS.length;

  if (sobrantes === 0) {
    Logger.log('El encabezado ya ocupa ' + HEADERS.length + ' columnas. Nada que reparar.');
    return { ok: true, problemas: [] };
  }
  if (sobrantes !== 1) {
    throw new Error('El encabezado ocupa ' + ancho + ' columnas; esta reparación solo maneja ' +
      (HEADERS.length + 1) + '. Abortada: revisalo a mano.');
  }

  // Las dos candidatas son D y E: una es Comprador y la otra la duplicada.
  // Solo se borra si AMBAS están completamente vacías en todas las filas.
  const maxFilas = sheet.getMaxRows();
  [COL.COMPRADOR, COL.COMPRADOR + 1].forEach(col => {
    const valores = sheet.getRange(2, col, maxFilas - 1, 1).getValues();
    const conDato = valores.findIndex(f => !celdaVacia(f[0]));
    if (conDato !== -1) {
      throw new Error('La columna ' + columnaALetra(col) + ' tiene datos en la fila ' +
        (conDato + 2) + '. Abortada para no borrarlos.');
    }
  });

  const separadores = desarmarSeparadores(sheet);

  sheet.deleteColumn(COL.COMPRADOR + 1);
  sheet.getRange(1, HEADERS.length + 1).clearContent();   // encabezado huérfano

  rearmarSeparadores(sheet, separadores);
  finalizarConfiguracion();
  SpreadsheetApp.flush();

  const resultado = verificarLayout();
  Logger.log(resultado.ok
    ? 'Reparación completa: ' + HEADERS.length + ' columnas, encabezados alineados.'
    : 'Reparación aplicada pero el layout sigue mal: ' + resultado.problemas.join('; '));
  return resultado;
}

function desarmarSeparadores(sheet) {
  const separadores = [];
  const maxFilas = sheet.getMaxRows();
  if (maxFilas < 2) return separadores;

  sheet.getRange(2, 1, maxFilas - 1, 1).getMergedRanges().forEach(merge => {
    if (merge.getColumn() !== 1 || merge.getNumColumns() < 2) return;
    separadores.push({ fila: merge.getRow(), etiqueta: merge.getValue() });
    merge.breakApart();
  });
  return separadores;
}

function rearmarSeparadores(sheet, separadores) {
  separadores.forEach(sep => {
    const rango = sheet.getRange(sep.fila, 1, 1, HEADERS.length);
    rango.merge();
    rango.setValue(sep.etiqueta);
    rango.setBackground('#fce5cd')
      .setFontWeight('bold')
      .setFontSize(14)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  });
}

/** Chequeo de salud: layout de columnas y valores viejos sin migrar. */
function verificarLayout() {
  const sheet = obtenerHojaRegistro();
  const problemas = [];
  const ancho = anchoEncabezado(sheet);

  if (ancho !== HEADERS.length) {
    problemas.push('el encabezado ocupa ' + ancho + ' columnas, se esperaban ' + HEADERS.length);
  }

  // Nunca pedir más columnas de las que tiene la grilla: getRange() fuera de
  // rango lanza excepción y el chequeo moriría antes de reportar nada.
  const aLeer = Math.min(Math.max(ancho, HEADERS.length), sheet.getMaxColumns());
  const actuales = sheet.getRange(1, 1, 1, aLeer).getValues()[0];
  HEADERS.forEach((esperado, i) => {
    const actual = i < actuales.length ? actuales[i] : '';
    if (String(actual).trim() !== esperado) {
      problemas.push(columnaALetra(i + 1) + ': "' + actual + '" en vez de "' + esperado + '"');
    }
  });

  const legados = contarValoresLegados(sheet);
  legados.forEach(l => problemas.push('valor viejo -> ' + l + '. Corré migrarValoresLegados()'));

  const huerfanos = proyectosHuerfanos(sheet);
  huerfanos.forEach(h => problemas.push('integridad -> ' + h + '. Cargalo en Parametros!A2:A'));

  const resultado = { ok: problemas.length === 0, problemas: problemas };
  Logger.log(resultado.ok ? 'Layout correcto.' : 'Layout con problemas:\n' + problemas.join('\n'));
  return resultado;
}

/**
 * Recalcula Estado Global de todas las filas desde los checkboxes y la fecha
 * de salida. Red de seguridad para mantenimiento: si alguien editó con el
 * trigger caído, o tras migrar valores, deja la columna coherente otra vez.
 * No inventa nada — solo reaplica calcularEstado() sobre lo que ya está.
 */
function recalcularTodosLosEstados() {
  const sheet = obtenerHojaRegistro();
  const ultima = ultimaFilaConDatos(sheet);
  if (ultima < 2) {
    Logger.log('Sin filas que recalcular.');
    return { revisadas: 0, corregidas: 0 };
  }

  const cantidad = ultima - 1;
  const datos = sheet.getRange(2, 1, cantidad, HEADERS.length).getValues();
  const estados = sheet.getRange(2, COL.ESTADO_GLOBAL, cantidad, 1).getValues();
  const detalle = [];

  datos.forEach((fila, i) => {
    if (esEtiquetaMes(fila[COL.NUMERO_ESCRITURA - 1])) return;   // separador
    if (fila.every(v => celdaVacia(v) || v === false)) return;    // fila vacía

    const esperado = calcularEstado(fila);
    if (estados[i][0] !== esperado) {
      detalle.push('fila ' + (i + 2) + ': "' + estados[i][0] + '" -> "' + esperado + '"');
      estados[i][0] = esperado;
    }
  });

  if (detalle.length > 0) {
    sheet.getRange(2, COL.ESTADO_GLOBAL, cantidad, 1).setValues(estados);
    SpreadsheetApp.flush();
  }

  Logger.log(detalle.length === 0
    ? 'Los ' + cantidad + ' registros ya tenían el estado correcto.'
    : 'Estados corregidos (' + detalle.length + '):\n' + detalle.join('\n'));
  return { revisadas: cantidad, corregidas: detalle.length };
}

/* ============================================================
 * RESPALDOS
 * Una copia nativa de Drive conserva checkboxes, validaciones, formato e
 * historial de versiones. Un .xlsx exportado no: ahí los checkboxes quedan
 * como texto TRUE/FALSE y se pierden el script y las protecciones. El .xlsx
 * sirve para leer los datos; esta copia sirve para volver atrás.
 * ============================================================ */

const CARPETA_RESPALDOS = 'Respaldos Trazabilidad Notarial';
const RESPALDOS_A_CONSERVAR = 12;

function respaldoMensual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const carpeta = obtenerOCrearCarpetaRespaldos();
  const sello = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const nombre = 'RESPALDO ' + sello + ' — ' + ss.getName();

  const copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
  purgarRespaldosViejos(carpeta);

  Logger.log('Respaldo creado: ' + nombre + ' -> ' + copia.getUrl());
  return copia.getUrl();
}

function obtenerOCrearCarpetaRespaldos() {
  const existentes = DriveApp.getFoldersByName(CARPETA_RESPALDOS);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA_RESPALDOS);
}

/** Manda a la papelera los respaldos más viejos. Solo toca los que creó esta función. */
function purgarRespaldosViejos(carpeta) {
  const respaldos = [];
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    if (archivo.getName().indexOf('RESPALDO ') === 0) {
      respaldos.push({ archivo: archivo, fecha: archivo.getDateCreated() });
    }
  }

  respaldos.sort((a, b) => b.fecha - a.fecha);   // más nuevo primero
  respaldos.slice(RESPALDOS_A_CONSERVAR).forEach(r => {
    r.archivo.setTrashed(true);   // a la papelera, recuperable 30 días
    Logger.log('Respaldo purgado: ' + r.archivo.getName());
  });
}

function instalarTriggerRespaldo() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'respaldoMensual') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('respaldoMensual').timeBased().onMonthDay(1).atHour(2).create();
  Logger.log('Respaldo automático programado: día 1 de cada mes, 2 a.m.');
}

/**
 * Estética, desplegables y protecciones. Es idempotente: se puede correr las
 * veces que haga falta sin tocar datos.
 */
function finalizarConfiguracion() {
  const pasos = [
    ['estética y formato condicional', aplicarEstetica],
    ['desplegables y validaciones', aplicarDesplegablesSheet],
    ['protecciones de columnas calculadas', protegerColumnasCalculadas]
  ];

  const fallidos = pasos.filter(p => !ejecutarPaso(p[0], p[1])).map(p => p[0]);

  if (fallidos.length > 0) {
    avisar('Configuración parcial. Falló: ' + fallidos.join(', ') +
      '. Mirá Ejecuciones en el editor para el detalle.', 'Revisar');
  }
  return fallidos;
}

/* ============================================================
 * 12. SETUP E INSTALADOR
 * ============================================================ */

function setupInicial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(SHEET_REGISTRO) || ss.getSheets()[0];

  if (hoja.getLastRow() > 1) {
    throw new Error('setupInicial() ya se corrió: la hoja tiene datos o checkboxes. ' +
      'Volver a correrla resetearía todo.');
  }

  hoja.setName(SHEET_REGISTRO);
  if (hoja.getMaxColumns() < HEADERS.length) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), HEADERS.length - hoja.getMaxColumns());
  }
  hoja.setColumnWidths(1, HEADERS.length, 150);

  provisionarFilas(hoja, 2, TAMANO_LOTE_EXTENSION);

  let parametros = ss.getSheetByName(SHEET_PARAMETROS);
  if (!parametros) parametros = ss.insertSheet(SHEET_PARAMETROS);
  parametros.getRange('A1').setValue('Proyecto').setFontWeight('bold');

  finalizarConfiguracion();
  SpreadsheetApp.flush();
  Logger.log('Setup inicial completado. Cargá los proyectos en Parametros!A2:A.');
}

/**
 * Restos de versiones anteriores del script. No hay caché que limpiar en Apps
 * Script, pero sí queda estado guardado en el documento.
 */
function limpiarEstadoViejo() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('ULTIMA_FILA_PROVISIONADA') !== null) {
    props.deleteProperty('ULTIMA_FILA_PROVISIONADA');
    Logger.log('Eliminada la propiedad ULTIMA_FILA_PROVISIONADA (ya no se usa).');
  }

  // Solo protecciones con el prefijo viejo conocido: las que creó el usuario
  // a mano no se tocan.
  const sheet = obtenerHojaRegistro();
  let borradas = 0;
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => {
    if (p.getDescription().indexOf('Auditado') === 0) { p.remove(); borradas++; }
  });
  if (borradas > 0) Logger.log('Eliminadas ' + borradas + ' protecciones viejas.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Trazabilidad')
    .addItem('Verificar layout', 'verificarLayout')
    .addItem('Recalcular estados', 'recalcularTodosLosEstados')
    .addItem('Migrar valores viejos', 'migrarValoresLegados')
    .addSeparator()
    .addItem('Respaldar ahora', 'respaldoMensual')
    .addItem('Agregar 200 filas', 'agregarMasFilas200')
    .addItem('Reaplicar formato y protecciones', 'finalizarConfiguracion')
    .addItem('Sincronizar formulario', 'sincronizarFormulario')
    .addSeparator()
    .addItem('Instalar motores', 'INSTALAR_TODOS_LOS_MOTORES')
    .addToUi();
}

function INSTALAR_TODOS_LOS_MOTORES() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Los triggers primero: son lo único imprescindible. Si después falla algo
  // cosmético, el sistema ya quedó funcionando.
  // Solo se borran los propios: un borrado indiscriminado se llevaría puesto
  // cualquier trigger que se agregue a este proyecto más adelante.
  const MIOS = ['handleEdit', 'crearSeparadorDeMes', 'procesarEnvioFormulario', 'respaldoMensual'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (MIOS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('crearSeparadorDeMes').timeBased().onMonthDay(1).atHour(0).create();
  ScriptApp.newTrigger('procesarEnvioFormulario').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('respaldoMensual').timeBased().onMonthDay(1).atHour(2).create();

  ejecutarPaso('limpieza de estado viejo', limpiarEstadoViejo);
  const fallidos = finalizarConfiguracion();
  ejecutarPaso('sincronización del formulario', sincronizarFormulario);

  // No migra datos por su cuenta: solo avisa. Cambiar datos es deliberado.
  const legados = contarValoresLegados(obtenerHojaRegistro());

  let mensaje = fallidos.length === 0
    ? 'Sistema instalado.'
    : 'Triggers instalados. Quedó pendiente: ' + fallidos.join(', ') + '.';
  if (legados.length > 0) {
    mensaje += '\n\nHay valores viejos en la hoja:\n' + legados.join('\n') +
      '\n\nCorré "Migrar valores viejos" desde el menú Trazabilidad.';
  }

  try {
    SpreadsheetApp.getUi().alert(mensaje);
  } catch (err) {
    Logger.log(mensaje);
  }
}
