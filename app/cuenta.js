/* ============================================================================
 * LA CUENTA DEL SOCIO — entrar con teléfono y contraseña
 * Etapa 2 del rediseño. 11 de agosto de 2026.
 *
 * Decisión de Joan: el TELÉFONO es el usuario, y el código de WhatsApp se usa
 * para recuperar la contraseña y para confirmar el número al aprobar — no en el
 * registro, porque el registro es público y hasta que Joan apruebe ese socio
 * tiene cupo cero: una cuenta sin verificar no puede hacer nada más que mandar
 * una solicitud.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL TELÉFONO SE CONVIERTE EN UN CORREO POR DENTRO
 *
 * Supabase Auth sabe autenticar por teléfono, pero exige mandar un SMS con
 * código —Twilio, cuenta aparte, y se paga cada mensaje, también los de los que
 * se equivocan y reintentan—. Autenticar por correo es gratis y trae lo mismo
 * que hace falta: hasheo del lado del servidor (bcrypt), freno de intentos y
 * sesiones que no viven en localStorage.
 *
 * Así que el socio escribe su celular y nunca ve un correo; por dentro se arma
 * uno sintético y estable. La contraseña la hashea Supabase, no este archivo:
 * si alguna vez ves una función de hash acá, algo se hizo mal.
 *
 * LO QUE ESTO CUESTA, dicho de frente: el número no queda verificado en el
 * registro. Es aceptable porque una cuenta nueva no puede pedir plata —cupo
 * cero hasta que Joan apruebe— y porque Joan confirma el número por WhatsApp
 * justo antes de asignarle cupo, que es el momento en que empieza a importar.
 *
 * ---------------------------------------------------------------------------
 * LOS PERMISOS QUE ESTA APP NO PIDE, Y POR QUÉ ESTÁ ESCRITO EN CÓDIGO
 *
 * SMS, registro de llamadas, contactos, ubicación precisa, galería. Ninguno.
 *
 * No es una preferencia de estilo: es el filtro con el que Google identifica
 * apps de préstamo abusivas, y pedir uno solo es rechazo automático en Play.
 * En Colombia además son datos de TERCEROS —los que le escribieron a esa
 * persona— que nunca autorizaron nada, y es la conducta por la que la SIC
 * cerró cuatro apps de crédito en abril de 2026.
 *
 * Está como lista y con prueba (PERMISOS_PROHIBIDOS) porque la idea vuelve. Ya
 * volvió una vez. La próxima que alguien —Joan, yo, otra sesión— quiera "pedir
 * los mensajes del banco para conocer mejor al cliente", la prueba se cae y el
 * porqué está escrito acá, en vez de tener otra vez la conversación.
 *
 * Lo que sí se pide: la CÁMARA, y solo en el instante de tomar la foto.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CuentaSocio = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function describir(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'un arreglo';
    return typeof v;
  }

  /* ==========================================================================
   * EL TELÉFONO, QUE ES EL USUARIO
   * ======================================================================== */

  var INDICATIVO = '57';
  var LARGO_CELULAR = 10;          // en Colombia, y siempre empieza por 3
  var DOMINIO_INTERNO = 'socios.tugarantia.co';

  /**
   * Deja el celular en diez dígitos, o null. Perdona el +57, el 57 pegado
   * adelante, espacios, guiones y paréntesis — que es como la gente lo escribe
   * y como lo copia de WhatsApp.
   *
   * Exige que empiece por 3 a propósito: un fijo de Bogotá (601...) no recibe
   * WhatsApp, y este número ES por donde le va a llegar su código. Dejarlo pasar
   * sería crear una cuenta que nunca se puede recuperar.
   */
  function normalizarTelefono(texto) {
    if (typeof texto !== 'string' && typeof texto !== 'number') return null;
    var d = String(texto).replace(/\D/g, '');
    if (d.length === LARGO_CELULAR + INDICATIVO.length && d.indexOf(INDICATIVO) === 0) {
      d = d.slice(INDICATIVO.length);
    }
    if (d.length !== LARGO_CELULAR) return null;
    if (d.charAt(0) !== '3') return null;
    return d;
  }

  function telefonoValido(texto) { return normalizarTelefono(texto) !== null; }

  /**
   * El correo sintético con el que vive la cuenta en Supabase Auth. El socio no
   * lo ve nunca ni lo necesita.
   *
   * Es estable: sale solo del número, sin fecha ni azar. Si cambiara, el socio
   * perdería su cuenta al volver a entrar con el mismo teléfono.
   */
  function correoDeTelefono(texto) {
    var t = normalizarTelefono(texto);
    if (!t) return null;
    return INDICATIVO + t + '@' + DOMINIO_INTERNO;
  }

  /** El camino de vuelta, para que el Panel pueda leer a quién pertenece. */
  function telefonoDeCorreo(correo) {
    if (typeof correo !== 'string') return null;
    var m = new RegExp('^' + INDICATIVO + '(\\d{' + LARGO_CELULAR + '})@' +
                       DOMINIO_INTERNO.replace(/\./g, '\\.') + '$').exec(correo.trim().toLowerCase());
    return m ? m[1] : null;
  }

  /** Para mostrarlo: 300 111 2233. Se lee y se dicta mejor que diez pegados. */
  function telefonoBonito(texto) {
    var t = normalizarTelefono(texto);
    return t ? t.slice(0, 3) + ' ' + t.slice(3, 6) + ' ' + t.slice(6) : '';
  }

  /* ==========================================================================
   * LA CONTRASEÑA
   *
   * Ocho caracteres y tres prohibiciones concretas. No se piden mayúsculas ni
   * símbolos: esas reglas producen "Joan123!" en todos lados, que no es más
   * fuerte y sí es más fácil de olvidar — y acá el que la olvide tiene que
   * escribirle a Joan por WhatsApp, o sea que cada olvido le cuesta tiempo a él.
   *
   * Lo que sí se prohíbe es lo que de verdad se adivina primero: el propio
   * teléfono, la cédula, y el puñado de contraseñas que abren la mitad de las
   * cuentas del mundo.
   * ======================================================================== */

  var LARGO_MINIMO_CLAVE = 8;
  var CLAVES_OBVIAS = [
    '12345678', '123456789', '1234567890', 'contrasena', 'contraseña',
    'password', 'qwertyui', 'colombia', 'tugarantia', '11111111', '00000000',
    'abcd1234', 'iloveyou', 'bogota123'
  ];

  /**
   * @returns {object} {ok, motivo} — el motivo es el texto que ve el socio, así
   *          que está escrito para él y no para un programador.
   */
  function revisarContrasena(clave, datos) {
    var d = datos || {};
    if (typeof clave !== 'string' || clave.length === 0) {
      return { ok: false, motivo: 'Escribe una contraseña.' };
    }
    if (clave.length < LARGO_MINIMO_CLAVE) {
      return { ok: false, motivo: 'Tu contraseña necesita al menos ' + LARGO_MINIMO_CLAVE + ' caracteres.' };
    }
    var plana = clave.toLowerCase();
    if (CLAVES_OBVIAS.indexOf(plana) !== -1) {
      return { ok: false, motivo: 'Esa contraseña es de las que más se prueban. Escoge otra.' };
    }
    /* Un solo carácter repetido pasa el largo mínimo y no protege nada. */
    if (/^(.)\1+$/.test(clave)) {
      return { ok: false, motivo: 'No repitas el mismo carácter: escoge algo que solo sepas tú.' };
    }
    var tel = normalizarTelefono(d.telefono);
    if (tel && clave.replace(/\D/g, '').indexOf(tel) !== -1) {
      return { ok: false, motivo: 'No uses tu número de celular: es lo primero que alguien probaría.' };
    }
    var ced = String(d.cedula || '').replace(/\D/g, '');
    if (ced.length >= 5 && clave.replace(/\D/g, '').indexOf(ced) !== -1) {
      return { ok: false, motivo: 'No uses tu número de cédula: está en cualquier recibo.' };
    }
    return { ok: true, motivo: '' };
  }

  /* ==========================================================================
   * EL FORMULARIO DE VINCULACIÓN
   *
   * Cada campo lleva `porque`. NO es documentación: es el filtro. Joan pidió "no
   * pidas datos que no vayas a usar para decidir", y la única forma de que eso
   * se cumpla dentro de un año es que agregar un campo obligue a escribir para
   * qué sirve. Hay una prueba que falla si un campo llega sin `porque`.
   *
   * Y los `sensible: true` son los que la Ley 1581 trata aparte: piden su propia
   * casilla, separada y opcional, y no se puede condicionar el servicio a que
   * los entregue.
   * ======================================================================== */

  var CAMPOS = [
    /* --- quién es --- */
    { id: 'nombres',      etiqueta: 'Tus nombres',            grupo: 'identidad', tipo: 'texto',  obligatorio: true,
      porque: 'Es a nombre de quién queda el crédito y el contrato.' },
    { id: 'apellidos',    etiqueta: 'Tus apellidos',          grupo: 'identidad', tipo: 'texto',  obligatorio: true,
      porque: 'Lo mismo: el contrato lleva nombre completo.' },
    { id: 'tipo_doc',     etiqueta: 'Tipo de documento',      grupo: 'identidad', tipo: 'opcion', obligatorio: true,
      opciones: ['Cédula de ciudadanía', 'Cédula de extranjería', 'Pasaporte'],
      porque: 'Cambia cómo se valida el número y qué dice el contrato.' },
    { id: 'documento',    etiqueta: 'Número de documento',    grupo: 'identidad', tipo: 'numero', obligatorio: true,
      porque: 'Identifica la cuenta y es con lo que entra a la app.' },
    { id: 'expedicion',   etiqueta: 'Fecha de expedición',    grupo: 'identidad', tipo: 'fecha',  obligatorio: true,
      porque: 'Es el dato que piden las centrales de riesgo para confirmar que la cédula es de quien dice.' },

    /* --- cómo se le habla --- */
    { id: 'celular',      etiqueta: 'Tu celular',             grupo: 'contacto',  tipo: 'celular', obligatorio: true,
      porque: 'Es tu usuario para entrar, y por ahí te llegan los avisos de pago.' },
    { id: 'celular2',     etiqueta: 'Otro celular',           grupo: 'contacto',  tipo: 'celular', obligatorio: false,
      porque: 'Para poder ubicarte si el primero falla. Opcional.' },
    { id: 'correo',       etiqueta: 'Tu correo',              grupo: 'contacto',  tipo: 'correo',  obligatorio: false,
      porque: 'Para mandarte el contrato y los comprobantes. Opcional.' },

    /* --- dónde vive --- */
    { id: 'ciudad',       etiqueta: 'Ciudad',                 grupo: 'domicilio', tipo: 'texto',  obligatorio: true,
      porque: 'Define a qué corte y a qué gestión perteneces.' },
    { id: 'barrio',       etiqueta: 'Barrio',                 grupo: 'domicilio', tipo: 'texto',  obligatorio: true,
      porque: 'Lo mismo, y ayuda a ubicarte si hay que visitarte.' },
    { id: 'direccion',    etiqueta: 'Dirección',              grupo: 'domicilio', tipo: 'texto',  obligatorio: true,
      porque: 'Es la dirección del contrato y a donde se notifica.' },
    { id: 'tipo_vivienda', etiqueta: 'Tu vivienda es',        grupo: 'domicilio', tipo: 'opcion', obligatorio: true,
      opciones: ['Propia', 'Arriendo', 'Familiar', 'Otra'],
      porque: 'Vivienda propia y arriendo pesan distinto al evaluar cuánto te queda libre al mes.' },
    { id: 'anos_direccion', etiqueta: 'Cuánto llevas ahí',    grupo: 'domicilio', tipo: 'opcion', obligatorio: true,
      opciones: ['Menos de 1 año', '1 a 3 años', '3 a 5 años', 'Más de 5 años'],
      porque: 'Cuánto tiempo llevas en un mismo sitio es de los datos que mejor predicen si te vamos a poder ubicar.' },

    /* --- de qué vive --- */
    { id: 'ocupacion',    etiqueta: 'A qué te dedicas',       grupo: 'ingresos',  tipo: 'opcion', obligatorio: true,
      opciones: ['Empleado', 'Independiente', 'Pensionado', 'Otra'],
      porque: 'Decide qué más te preguntamos y cómo se mira la estabilidad de tu ingreso.' },
    { id: 'empresa',      etiqueta: 'Dónde trabajas',         grupo: 'ingresos',  tipo: 'texto',  obligatorio: false,
      porque: 'Para confirmar el ingreso si hace falta. Opcional si eres independiente.' },
    { id: 'cargo',        etiqueta: 'Tu cargo',               grupo: 'ingresos',  tipo: 'texto',  obligatorio: false,
      porque: 'Da contexto al ingreso que declaras. Opcional.' },
    { id: 'antiguedad',   etiqueta: 'Cuánto llevas ahí',      grupo: 'ingresos',  tipo: 'opcion', obligatorio: false,
      opciones: ['Menos de 6 meses', '6 meses a 1 año', '1 a 3 años', 'Más de 3 años'],
      porque: 'La antigüedad es lo que separa un ingreso estable de uno que puede parar el mes que viene.' },
    { id: 'ingreso_mes',  etiqueta: 'Cuánto ganas al mes',    grupo: 'ingresos',  tipo: 'pesos',  obligatorio: true,
      porque: 'Es la mitad de la cuenta de cuánto puedes pagar sin ahogarte.' },
    { id: 'gastos_mes',   etiqueta: 'Cuánto se te va fijo al mes', grupo: 'ingresos', tipo: 'pesos', obligatorio: true,
      porque: 'La otra mitad. Sin esto, el ingreso solo no dice nada.' },
    { id: 'dia_pago',     etiqueta: 'Qué día te pagan',       grupo: 'ingresos',  tipo: 'opcion', obligatorio: true,
      opciones: ['Quincenal (15 y 30)', 'Mensual, fin de mes', 'Semanal', 'No es fijo'],
      porque: 'Para que la fecha de tu cuota caiga después de que te paguen, y no antes.' },

    /* --- quién responde por él --- */
    { id: 'ref1_nombre',  etiqueta: 'Nombre de una referencia', grupo: 'referencias', tipo: 'texto', obligatorio: true,
      porque: 'Alguien que te conozca y con quien podamos hablar si no te ubicamos.' },
    { id: 'ref1_parentesco', etiqueta: 'Qué es tuyo',         grupo: 'referencias', tipo: 'texto', obligatorio: true,
      porque: 'Un familiar y un compañero de trabajo no dan la misma información.' },
    { id: 'ref1_celular', etiqueta: 'Su celular',             grupo: 'referencias', tipo: 'celular', obligatorio: true,
      porque: 'Sin número, la referencia no sirve de nada.' },
    { id: 'ref2_nombre',  etiqueta: 'Nombre de otra referencia', grupo: 'referencias', tipo: 'texto', obligatorio: true,
      porque: 'Dos, para no depender de que una sola conteste el día que haga falta.' },
    { id: 'ref2_parentesco', etiqueta: 'Qué es tuyo',         grupo: 'referencias', tipo: 'texto', obligatorio: true,
      porque: 'Dos referencias del mismo hogar no son dos: conviene que una sea de fuera.' },
    { id: 'ref2_celular', etiqueta: 'Su celular',             grupo: 'referencias', tipo: 'celular', obligatorio: true,
      porque: 'Sin número, la segunda referencia tampoco sirve de nada.' }
  ];

  var GRUPOS = [
    { id: 'identidad',   titulo: 'Quién eres' },
    { id: 'contacto',    titulo: 'Cómo te contactamos' },
    { id: 'domicilio',   titulo: 'Dónde vives' },
    { id: 'ingresos',    titulo: 'De qué vives' },
    { id: 'referencias', titulo: 'Quién puede responder por ti' }
  ];

  function camposDelGrupo(id) {
    return CAMPOS.filter(function (c) { return c.grupo === id; });
  }
  function camposObligatorios() {
    return CAMPOS.filter(function (c) { return c.obligatorio; });
  }

  /**
   * Qué falta para poder mandar el registro.
   * @returns {object} {ok, faltan:[{id, etiqueta}], errores:[{id, motivo}]}
   */
  function revisarVinculacion(datos) {
    var d = datos || {};
    var faltan = [], errores = [];
    CAMPOS.forEach(function (c) {
      var v = d[c.id];
      var vacio = v === undefined || v === null || String(v).trim() === '';
      if (vacio) {
        if (c.obligatorio) faltan.push({ id: c.id, etiqueta: c.etiqueta });
        return;
      }
      if (c.tipo === 'celular' && !telefonoValido(v)) {
        errores.push({ id: c.id, motivo: 'Ese celular no parece de Colombia: son 10 dígitos y empiezan por 3.' });
      }
      if (c.tipo === 'pesos' && !(Number(String(v).replace(/\D/g, '')) > 0)) {
        errores.push({ id: c.id, motivo: 'Escribe un valor en pesos.' });
      }
      if (c.tipo === 'opcion' && c.opciones && c.opciones.indexOf(String(v)) === -1) {
        errores.push({ id: c.id, motivo: 'Escoge una de las opciones.' });
      }
    });
    return { ok: faltan.length === 0 && errores.length === 0, faltan: faltan, errores: errores };
  }

  /* ==========================================================================
   * LA AUTORIZACIÓN DE DATOS (Ley 1581)
   * ======================================================================== */

  var VERSION_AUTORIZACION = '2026-08-11';

  /**
   * Guarda fecha, hora y VERSIÓN del texto aceptado. La versión es lo que
   * permite volver a pedirla el día que cambie la política, en vez de suponer
   * que quien aceptó en agosto aceptó algo que se escribió en octubre.
   */
  function armarAutorizacion(fechaHoraISO, aceptoSensibles) {
    if (typeof fechaHoraISO !== 'string' || !fechaHoraISO) {
      throw new TypeError('fechaHoraISO: se esperaba el momento de la aceptación, llegó ' + describir(fechaHoraISO));
    }
    return {
      version: VERSION_AUTORIZACION,
      momento: fechaHoraISO,
      general: true,
      sensibles: !!aceptoSensibles
    };
  }

  /** ¿Sigue valiendo, o hay que volver a pedirla porque cambió el texto? */
  function autorizacionAlDia(a) {
    return !!(a && a.general === true && a.version === VERSION_AUTORIZACION && a.momento);
  }

  /* ==========================================================================
   * LOS PERMISOS QUE NO SE PIDEN
   * ======================================================================== */

  var PERMISOS_PROHIBIDOS = [
    { permiso: 'READ_SMS',        porque: 'Leer los mensajes es LA firma de las apps de préstamo abusivas. Rechazo automático en Play, y trae datos de terceros que nunca autorizaron nada.' },
    { permiso: 'RECEIVE_SMS',     porque: 'Recibir mensajes es la otra mitad de leerlos, y Play los trata igual: rechazo automático en apps de préstamos.' },
    { permiso: 'READ_CALL_LOG',   porque: 'Play lo prohíbe en apps de préstamos, y no aporta nada a decidir si alguien paga.' },
    { permiso: 'READ_CONTACTS',   porque: 'La agenda es de terceros. Es lo que usan las apps que cobran llamando a los conocidos del deudor.' },
    { permiso: 'ACCESS_FINE_LOCATION', porque: 'Ubicación precisa y continua. Distinto de la ubicación puntual del formulario, que el socio da una vez y a sabiendas.' },
    { permiso: 'READ_EXTERNAL_STORAGE', porque: 'Da acceso a toda la galería. Para una foto de cédula alcanza la cámara, en el instante.' },
    { permiso: 'QUERY_ALL_PACKAGES', porque: 'Saber qué apps tiene instaladas. No decide nada y es vigilancia.' }
  ];

  var PERMISOS_QUE_SI = [
    { permiso: 'CAMERA', porque: 'La foto de la cédula y la del rostro. Se pide en el momento de tomarla, no al abrir la app.' }
  ];

  return {
    VERSION: '2026-08-11',

    /* el teléfono */
    INDICATIVO: INDICATIVO,
    LARGO_CELULAR: LARGO_CELULAR,
    DOMINIO_INTERNO: DOMINIO_INTERNO,
    normalizarTelefono: normalizarTelefono,
    telefonoValido: telefonoValido,
    correoDeTelefono: correoDeTelefono,
    telefonoDeCorreo: telefonoDeCorreo,
    telefonoBonito: telefonoBonito,

    /* la contraseña */
    LARGO_MINIMO_CLAVE: LARGO_MINIMO_CLAVE,
    revisarContrasena: revisarContrasena,

    /* el formulario */
    CAMPOS: CAMPOS,
    GRUPOS: GRUPOS,
    camposDelGrupo: camposDelGrupo,
    camposObligatorios: camposObligatorios,
    revisarVinculacion: revisarVinculacion,

    /* habeas data */
    VERSION_AUTORIZACION: VERSION_AUTORIZACION,
    armarAutorizacion: armarAutorizacion,
    autorizacionAlDia: autorizacionAlDia,

    /* los permisos */
    PERMISOS_PROHIBIDOS: PERMISOS_PROHIBIDOS,
    PERMISOS_QUE_SI: PERMISOS_QUE_SI
  };
});
