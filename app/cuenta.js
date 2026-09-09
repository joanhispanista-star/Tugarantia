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

  /* EL DOMINIO TIENE QUE EXISTIR DE VERDAD — 28-ago-2026, y esto tenía el
     registro abierto ROTO sin que nadie lo supiera.

     Era 'socios.tugarantia.co': un dominio que no existe (y encima .co, cuando
     el de la casa es .net). Supabase valida el dominio del correo antes de
     crear la cuenta y devolvía `email_address_invalid`, así que TODO registro
     nuevo moría ahí. Medido llamando al signup de verdad: con
     @socios.tugarantia.co rechaza, con @socios.tugarantia.net también —el
     subdominio tampoco existe— y con @tugarantia.net pasa, porque ese sí
     resuelve.

     Nadie se rompe al cambiarlo: se comprobó en auth.users que había CERO
     cuentas con el dominio viejo, justamente porque ninguna se pudo crear.

     El buzón sigue sin existir y da igual: el socio nunca ve este correo, es
     solo la forma de que Supabase identifique la cuenta. Lo único que hace
     falta es que el DOMINIO resuelva. */
  var DOMINIO_INTERNO = 'tugarantia.net';

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

  /* ==========================================================================
   * LA CÉDULA LEÍDA DEL CÓDIGO DE BARRAS — 8-sep-2026
   *
   * Pedido de Joan: «únicamente tomando la foto de la cédula, el sistema rellene
   * los datos automáticamente». La cédula amarilla trae al respaldo un código
   * PDF417 con el número, los apellidos, los nombres, el sexo y la fecha de
   * nacimiento, en campos de ancho fijo. La app lo decodifica en el teléfono
   * (ZXing) y esto lo convierte en datos del formulario. NO trae la fecha de
   * expedición: esa la escribe la persona.
   *
   * Dos lecturas, en orden: los anchos fijos que usa la Registraduría, y si no
   * cuadran, una lectura tolerante por tokens. Si ninguna encuentra un número
   * de documento válido, se devuelve null y el formulario se llena a mano —
   * nunca se inventa un dato.
   * ======================================================================== */
  function limpiarNombre(t) {
    return String(t || '').replace(/\u0000/g, ' ').replace(/[^A-ZÁÉÍÓÚÜÑ ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function fechaDeOcho(t) {
    var m = /^(19|20)(\d{2})(\d{2})(\d{2})$/.exec(String(t || '').trim());
    if (!m) return '';
    var mes = Number(m[3]), dia = Number(m[4]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
    return m[1] + m[2] + '-' + m[3] + '-' + m[4];
  }
  function leerCedulaPDF417(texto) {
    var t = String(texto || '');
    if (t.length < 60) return null;
    var s = t.replace(/\u0000/g, ' ');
    var salida = null;

    /* 1. los anchos fijos: número en 48..58, luego cuatro campos de 23. */
    var doc = (s.substr(48, 10) || '').replace(/\D/g, '').replace(/^0+/, '');
    if (/^\d{5,10}$/.test(doc)) {
      var ap1 = limpiarNombre(s.substr(58, 23)), ap2 = limpiarNombre(s.substr(81, 23));
      var n1 = limpiarNombre(s.substr(104, 23)), n2 = limpiarNombre(s.substr(127, 23));
      if (ap1 && n1) {
        salida = {
          documento: doc,
          apellidos: (ap1 + ' ' + ap2).trim(),
          nombres: (n1 + ' ' + n2).trim(),
          sexo: /^[MF]$/.test(s.substr(150, 1)) ? s.substr(150, 1) : '',
          /* Después del sexo viene la fecha (8 dígitos), el código del municipio
             de expedición (5 dígitos) y el RH. Entre versiones del formato hay
             una columna de diferencia, así que en la cola se BUSCA, no se mide. */
          nacimiento: fechaDeOcho((s.substr(150, 14).match(/(19|20)\d{6}/) || [''])[0]),
          rh: ((s.substr(158, 16).match(/(AB|A|B|O)[+-]/) || [''])[0]),
          lectura: 'anchos_fijos'
        };
      }
    }
    if (salida) return salida;

    /* 2. por tokens: un número de 5 a 10 dígitos, y después las palabras en
       mayúscula que lo siguen (apellidos y nombres), el sexo y la fecha. */
    var tokens = s.split(/[\s\u0000]+/).filter(Boolean);
    var i = -1;
    for (var k = 0; k < tokens.length; k++) {
      if (/^\d{5,10}$/.test(tokens[k].replace(/^0+/, '')) && tokens[k].length >= 5) { i = k; break; }
    }
    if (i < 0) return null;
    var palabras = [], sexo = '', nac = '';
    for (var j = i + 1; j < tokens.length && palabras.length < 6; j++) {
      var tk = tokens[j];
      if (/^[MF]$/.test(tk)) { sexo = tk; continue; }
      if (fechaDeOcho(tk)) { nac = fechaDeOcho(tk); continue; }
      if (/^\d+$/.test(tk)) { if (palabras.length) break; else continue; }
      var lp = limpiarNombre(tk);
      if (lp) palabras.push(lp);
    }
    if (palabras.length < 2) return null;
    var mitad = Math.min(2, palabras.length - 1);
    return {
      documento: tokens[i].replace(/^0+/, ''),
      apellidos: palabras.slice(0, mitad).join(' '),
      nombres: palabras.slice(mitad).join(' '),
      sexo: sexo, nacimiento: nac, rh: '', lectura: 'tokens'
    };
  }

  /* EL APARATO, en palabras. La huella la lee la base de las cabeceras de la
     petición (no del teléfono); esto solo traduce el user-agent a algo que Joan
     pueda leer en la ficha: «Android 13 · Samsung SM-A155M · Chrome». */
  function dispositivoDe(ua) {
    var u = String(ua || '');
    if (!u) return '';
    var partes = [];
    var m;
    if ((m = /Android (\d+(?:\.\d+)?)/.exec(u))) {
      partes.push('Android ' + m[1]);
      var mod = /;\s*([^;)]+?)\s+Build\//.exec(u) || /Android [\d.]+;\s*([^;)]+)\)/.exec(u);
      if (mod && mod[1] && !/^[a-z]{2}-[a-z]{2}$/i.test(mod[1].trim())) partes.push(mod[1].trim());
    } else if (/iPhone|iPad/.test(u)) {
      partes.push(/iPad/.test(u) ? 'iPad' : 'iPhone');
      if ((m = /OS (\d+)[_.](\d+)/.exec(u))) partes.push('iOS ' + m[1] + '.' + m[2]);
    } else if (/Windows/.test(u)) {
      partes.push('Windows');
    } else if (/Macintosh/.test(u)) {
      partes.push('Mac');
    } else if (/Linux/.test(u)) {
      partes.push('Linux');
    }
    if (/EdgA?\//.test(u)) partes.push('Edge');
    else if (/SamsungBrowser/.test(u)) partes.push('Samsung Internet');
    else if (/OPR\//.test(u)) partes.push('Opera');
    else if (/Firefox\//.test(u)) partes.push('Firefox');
    else if (/CriOS\//.test(u)) partes.push('Chrome');
    else if (/Chrome\//.test(u)) partes.push('Chrome');
    else if (/Safari\//.test(u)) partes.push('Safari');
    if (/; wv\)|Version\/[\d.]+ Chrome/.test(u) && /Android/.test(u)) partes.push('(app)');
    return partes.join(' · ') || u.slice(0, 60);
  }


  /* ==========================================================================
   * ¿ESTÁ LA CARA EN EL ÓVALO Y QUIETA? — 9 de septiembre de 2026
   *
   * Joan: «quiero que cuando la cara esté centrada la página haga como si
   * escaneara la cara y tome la foto automáticamente, que se vea muy futurista».
   *
   * HASTA HOY LA PANTALLA MENTÍA. El escáner del 8-sep decía «la foto se toma
   * sola cuando tu rostro está quieto y centrado» y disparaba con un reloj: a
   * los 3,2 segundos, mirara la persona a la cámara o al techo. La regla de la
   * casa es que la interfaz no promete lo que el código no hace, así que o se
   * quitaba la frase o se hacía la comprobación. Se hizo la comprobación.
   *
   * LO QUE SE MIDE, Y LO QUE NO. Esto NO reconoce a nadie: no saca un vector
   * facial, no compara con la cédula, no distingue una cara de un cuadro
   * colgado en la pared. Mira cuatro cosas del fotograma —hay luz, hay detalle
   * en el centro, el detalle está DENTRO del óvalo y no afuera, y no se mueve—
   * y con eso decide cuándo apretar el obturador.
   *
   * ES UNA DECISIÓN LEGAL, NO UN ATAJO TÉCNICO. Un detector de rostros de
   * verdad (face-api) en el teléfono convierte la foto en dato BIOMÉTRICO
   * —sensible bajo la Ley 1581— y obliga a rehacer la ficha de Data Safety que
   * hoy declara la selfie como una foto y nada más (app/cumplimiento.js). El
   * parecido con la cédula lo sigue calculando el CRM de Joan, en su
   * computador, donde ese tratamiento sí está declarado. Acá se mide un
   * ENCUADRE, que es lo que hace la cámara de cualquier celular.
   *
   * Y POR ESO LA PANTALLA DICE «ENCUADRE», NO «TE RECONOCÍ». Un cartón con una
   * foto impresa pasaría esta prueba. Quien verifica que la persona es la de la
   * cédula es Joan, mirando las dos fotos en su CRM.
   * ======================================================================== */

  /* Los umbrales, juntos y con nombre, porque son lo único de esto que hay que
     calibrar mirando teléfonos de verdad. Si quedan estrictos, la persona se
     atasca en el paso 3 con el celular en la cara; si quedan flojos, la foto
     sale del techo. Por eso el botón manual nunca desaparece. */
  var ENCUADRE = {
    LUZ_MIN: 32,        // más oscuro que esto es un bolsillo
    LUZ_MAX: 238,       // más claro es una ventana a contraluz
    TEXTURA_MIN: 240,   // varianza del centro: una pared lisa da casi cero
    VENTAJA_CENTRO: 1.25, // el centro tiene que tener MÁS detalle que el borde
    MOVIMIENTO_MAX: 7,  // diferencia media entre dos fotogramas seguidos
    CUADROS: 10         // seguidos en verde antes de disparar (~0,8 s)
  };

  function promedio(v, desde, hasta) {
    var t = 0, n = 0;
    for (var i = desde; i < hasta; i++) { t += v[i]; n++; }
    return n ? t / n : 0;
  }

  /**
   * Mide el encuadre de un fotograma ya reducido a gris.
   *
   * @param gris   valores 0..255 de un cuadro de lado×lado (el interior del óvalo)
   * @param previa el mismo arreglo del fotograma anterior, o null
   * @param lado   cuántos pixeles de lado (por defecto, la raíz de la longitud)
   * @returns {luz, textura, centro, borde, movimiento, ok, falla}
   *          `falla` dice QUÉ falta, para que la pantalla lo diga en castellano
   *          en vez de quedarse muda: 'luz' | 'poca_luz' | 'mucha_luz' |
   *          'lejos' | 'ladeado' | 'movimiento' | ''
   */
  function medirEncuadre(gris, previa, lado) {
    var g = gris || [];
    var n = g.length;
    var L = lado || Math.round(Math.sqrt(n));
    if (!n || L < 8) return { luz: 0, textura: 0, centro: 0, borde: 0, movimiento: 999, ok: false, falla: 'lejos' };

    var luz = promedio(g, 0, n);
    if (luz < ENCUADRE.LUZ_MIN) return { luz: luz, textura: 0, centro: 0, borde: 0, movimiento: 999, ok: false, falla: 'poca_luz' };
    if (luz > ENCUADRE.LUZ_MAX) return { luz: luz, textura: 0, centro: 0, borde: 0, movimiento: 999, ok: false, falla: 'mucha_luz' };

    /* El centro es el cuadrado del medio (la mitad del lado); el borde es todo
       lo demás. Una cara mete su detalle —ojos, cejas, boca, el filo de la
       nariz— en el centro; una pared, un techo o un hombro no. */
    var d0 = Math.floor(L * 0.25), d1 = Math.ceil(L * 0.75);
    var sc = 0, sc2 = 0, nc = 0, sb = 0, sb2 = 0, nb = 0;
    for (var y = 0; y < L; y++) {
      for (var x = 0; x < L; x++) {
        var v = g[y * L + x];
        if (y >= d0 && y < d1 && x >= d0 && x < d1) { sc += v; sc2 += v * v; nc++; }
        else { sb += v; sb2 += v * v; nb++; }
      }
    }
    var centro = nc ? (sc2 / nc) - (sc / nc) * (sc / nc) : 0;
    var borde = nb ? (sb2 / nb) - (sb / nb) * (sb / nb) : 0;

    /* Poco detalle en el centro: o no hay nadie, o está muy lejos. */
    if (centro < ENCUADRE.TEXTURA_MIN) {
      return { luz: luz, textura: centro, centro: centro, borde: borde, movimiento: 999, ok: false, falla: 'lejos' };
    }
    /* Hay detalle, pero el borde tiene tanto o más: la persona está a un lado,
       o lo que se ve es el cuarto entero y no una cara. */
    if (centro < borde * ENCUADRE.VENTAJA_CENTRO) {
      return { luz: luz, textura: centro, centro: centro, borde: borde, movimiento: 999, ok: false, falla: 'ladeado' };
    }

    /* Sin fotograma anterior no se puede decir si está quieto: no es un fallo,
       es que todavía no se sabe. */
    if (!previa || previa.length !== n) {
      return { luz: luz, textura: centro, centro: centro, borde: borde, movimiento: 999, ok: false, falla: 'movimiento' };
    }
    var dif = 0;
    for (var i = 0; i < n; i++) dif += Math.abs(g[i] - previa[i]);
    var mov = dif / n;
    if (mov > ENCUADRE.MOVIMIENTO_MAX) {
      return { luz: luz, textura: centro, centro: centro, borde: borde, movimiento: mov, ok: false, falla: 'movimiento' };
    }
    return { luz: luz, textura: centro, centro: centro, borde: borde, movimiento: mov, ok: true, falla: '' };
  }

  /* Lo que la persona lee en pantalla. Cada frase dice qué hacer, no qué pasó:
     «No te veo» no le sirve a nadie; «acércate un poco» sí. */
  var TEXTO_ENCUADRE = {
    poca_luz: 'Busca un sitio con más luz',
    mucha_luz: 'Demasiada luz atrás: date la vuelta',
    lejos: 'Acerca tu cara al óvalo',
    ladeado: 'Céntrate en el óvalo',
    movimiento: 'Quieto…',
    '': 'Listo'
  };
  function textoDeEncuadre(m) {
    if (!m) return TEXTO_ENCUADRE.lejos;
    return TEXTO_ENCUADRE[m.falla] !== undefined ? TEXTO_ENCUADRE[m.falla] : TEXTO_ENCUADRE.lejos;
  }

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

    /* la cédula leída y el aparato (8-sep-2026) */
    leerCedulaPDF417: leerCedulaPDF417,
    dispositivoDe: dispositivoDe,

    /* el encuadre del rostro (9-sep-2026): la decision de cuando disparar,
       fuera de la pantalla para poder probarla con fotogramas de mentira. */
    medirEncuadre: medirEncuadre,
    textoDeEncuadre: textoDeEncuadre,
    ENCUADRE: ENCUADRE,

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
