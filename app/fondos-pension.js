/* ============================================================================
 * LOS FONDOS DE PENSIONES Y CÓMO SE PIDE LA HISTORIA LABORAL EN CADA UNO
 * Consultado el 28 de octubre de 2026.
 *
 * Joan (28-oct-2026): «que aparezca la lista del fondo de pensiones en el que
 * está el cliente y que desde la aplicación lo podamos redirigir a la página
 * del fondo de pensiones». Esta es esa lista, en su propio archivo para
 * ponerla al día sin tocar nada más (como app/bancos-colombia.js): cambia una
 * dirección o un paso, cambia la fecha de arriba, y el registro, la app y el
 * CRM la leen igual.
 *
 * DE DÓNDE SALE: la investigación del 28-oct (pensiones.md), que leyó las
 * páginas oficiales de cada fondo ese día. Colfondos no deja leer sus páginas
 * a un programa (403): lo suyo sale de lo que el buscador muestra de ellas.
 *
 * LO QUE DECIDE ESTA LISTA, Y POR QUÉ:
 *   · El documento que se pide es la HISTORIA LABORAL (semanas, empleadores,
 *     aportes), nunca el certificado de afiliación —cualquiera lo baja con una
 *     cédula ajena y no dice si la persona trabaja— ni el extracto con el
 *     saldo, que no sirve para un crédito y es más dato del necesario.
 *   · Colpensiones, Porvenir y Protección la mandan AL CORREO del afiliado
 *     con solo la cédula; Colfondos y Skandia piden entrar con el usuario y
 *     la clave del afiliado. Esa clave es de la persona y de su fondo: la app
 *     no la pide nunca ni entra por nadie (Código Penal, art. 269F).
 *   · Ningún fondo tiene validador, código ni API (revisado el 28-oct): en
 *     ninguna pantalla se puede decir «verificado con tu fondo».
 *   · La página se abre en el NAVEGADOR (otra pestaña), nunca dentro de la
 *     app: así la clave de la persona no pasa por aquí, y no parece phishing.
 *     La dirección sale SOLO de esta lista, nunca de un dato.
 *   · Colpensiones y UN fondo privado pueden ir juntos: con la reforma (Ley
 *     2381 de 2024, avalada en lo principal por la C-264 de 2026; prevista
 *     para el 1-abr-2027, la fecha se puede mover) mucha gente cotizará lo
 *     nuevo en Colpensiones y tendrá lo viejo en su fondo privado.
 *   · «No sé» se resuelve mirando el desprendible, la planilla o el RUAF, que
 *     la persona consulta para sí misma: sus términos prohíben que un tercero
 *     use esa información, así que aquí no se sube nada del RUAF.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.FondosPension = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONSULTADO = '2026-10-28';

  /* `como`: 'correo' = te la mandan al correo registrado con la cédula;
     'usuario' = entras con tu usuario y tu clave del fondo.
     `dominio`: el que se le muestra a la persona junto al botón, para que
     sepa a dónde va. `notaCrm`: lo que Joan necesita saber al mirarla. */
  var FONDOS = [
    { codigo: 'colpensiones', nombre: 'Colpensiones', regimen: 'prima_media', como: 'correo',
      url: 'https://sede.colpensiones.gov.co/tramite/updInfo/55/',
      dominio: 'sede.colpensiones.gov.co',
      pasos: ['Escoge tu tipo de documento y escribe tu número.',
              'La página te muestra una parte de tu correo registrado: allá te llega tu historia laboral («reporte de semanas cotizadas»), casi siempre en minutos.',
              'Si el PDF te pide contraseña, suele ser tu número de documento, sin puntos.'],
      nota: 'Si no tienes un correo registrado con Colpensiones, la página te lo dice: tendrías que registrarte en su Sede Electrónica. Puedes hacerlo después.',
      notaCrm: 'Suele llegar con contraseña: el número de documento, sin puntos.' },
    { codigo: 'porvenir', nombre: 'Porvenir', regimen: 'afp', como: 'correo',
      url: 'https://www.porvenir.com.co/web/certificados-y-extractos/certificado-de-historia-laboral',
      dominio: 'porvenir.com.co',
      pasos: ['Escoge tu tipo de documento, escribe tu número y marca «No soy un robot».',
              'La página te muestra tu correo registrado con Porvenir: allá te llega tu historia laboral.'],
      nota: 'Pide la historia laboral, no el certificado de afiliación: ese solo dice que estás afiliado.',
      notaCrm: 'Trae solo lo cotizado en fondos privados; lo de Colpensiones va aparte.' },
    { codigo: 'proteccion', nombre: 'Protección', regimen: 'afp', como: 'correo',
      url: 'https://www.proteccion.com/portalafiliados/afiliados/certifacil',
      dominio: 'proteccion.com',
      pasos: ['Entra a Certifácil con tu cédula: no necesitas usuario ni clave.',
              'Toca «Generar certificados» y escoge Pensión obligatoria → «Constancia de Historia Laboral».',
              'Escoge cómo recibirla: te llega al correo que les diste.'],
      nota: '',
      notaCrm: 'Según fuentes de 2017, el PDF puede abrir con la cédula como contraseña: sin confirmar.' },
    { codigo: 'colfondos', nombre: 'Colfondos', regimen: 'afp', como: 'usuario',
      url: 'https://www.colfondos.com.co/dxp/acceso-de-usuarios',
      dominio: 'colfondos.com.co',
      pasos: ['Entra con tu correo y tu contraseña de Colfondos. Esa contraseña es tuya y de tu fondo: no nos la des nunca.',
              'En Pensiones Obligatorias → «Historia Laboral», descárgala en PDF.'],
      nota: 'Si te deja escoger, descárgala en PDF y no en Excel.',
      notaCrm: 'También se baja en Excel, que se edita en segundos: vale el PDF.' },
    /* 28-oct-2026 (arreglo, ronda 2) — decía «Busca «Historia laboral» y
       descárgala», y esa descarga no la había visto nadie (pensiones.md la
       dejó sin confirmar). La guía oficial de Skandia
       (como-consultar-tu-historia-laboral.pdf, la que enlaza la página que
       abre el botón) la muestra EN PANTALLA: «Tu saldo» arriba, y periodos
       que el afiliado puede editar y agregar. En sus cinco páginas no dice
       cómo descargarla, y la página misma (leída el 28-oct) habla de «ver tu
       historia laboral». Quien no encontraba la descarga se quedaba sin
       camino, o mandaba pantallazos con su saldo, que la política dice que
       no pedimos. Ahora el paso dice lo que se sabe: se ve en pantalla; si
       hay cómo bajarla en PDF, mejor; si no, pantallazos tal como salen y SIN
       el saldo. El WhatsApp sí está en su página oficial (asesoría
       pensional): «Sami», opción 1, «Solicitar certificados/Historia Laboral
       - Semanas»; cómo entrega el documento no lo dice. */
    { codigo: 'skandia', nombre: 'Skandia', regimen: 'afp', como: 'usuario',
      url: 'https://www.skandia.co/fondo-pensiones-obligatorias/historia-laboral',
      dominio: 'skandia.co',
      pasos: ['Entra al Portal de Clientes con tu usuario y tu contraseña de Skandia. Esa contraseña es tuya y de tu fondo: no nos la des nunca.',
              'Escoge tu contrato de Pensión Obligatoria y toca «Historia Laboral»: ahí la ves en pantalla.',
              'Si te deja bajarla en PDF, súbela así. Si no, tómale pantallazos tal como sale, sin editar nada, y deja por fuera tu saldo: no lo necesitamos.'],
      nota: 'También la puedes pedir por el WhatsApp de Skandia: escríbele a Sami y escoge «Solicitar certificados/Historia Laboral - Semanas». El número está en su página de asesoría pensional.',
      notaCrm: 'Su portal la muestra en pantalla (la guía oficial no dice cómo bajarla): lo normal es que lleguen pantallazos. Arriba sale el saldo: no lo pedimos y no se usa. Y ahí el afiliado puede editar y agregar periodos (quedan como solicitud): un pantallazo puede traer cifras que escribió él.' }
  ];

  /* Las dos que no son un fondo: van solas, nunca con otra. */
  var OTRAS = [
    { codigo: 'no_se', nombre: 'No sé en cuál estoy',
      texto: 'Lo dice tu desprendible de pago o tu planilla de seguridad social. También lo puedes consultar tú en el RUAF del Ministerio de Salud: míralo y vuelve aquí a marcar tu fondo. No nos subas nada del RUAF.',
      url: 'https://ruaf.sispro.gov.co/', dominio: 'ruaf.sispro.gov.co' },
    { codigo: 'nunca', nombre: 'Nunca he cotizado',
      texto: 'No pasa nada: sigue con tu registro. Tu solicitud sigue igual.' }
  ];

  var TODOS = FONDOS.concat(OTRAS);

  /** El fondo (o la opción) por su código; null si no está en la lista. */
  function porCodigo(codigo) {
    var c = String(codigo == null ? '' : codigo);
    for (var i = 0; i < TODOS.length; i++) if (TODOS[i].codigo === c) return TODOS[i];
    return null;
  }
  function esAfp(codigo) { var f = porCodigo(codigo); return !!(f && f.regimen === 'afp'); }
  function esFondo(codigo) { var f = porCodigo(codigo); return !!(f && f.regimen); }

  /** La dirección oficial de un FONDO: SOLO la de la lista, https y de su
      dominio. «No sé» no es un fondo: su enlace al RUAF va aparte. */
  function urlOficial(codigo) {
    var f = porCodigo(codigo);
    if (!f || !f.url || !f.regimen) return '';
    var m = /^https:\/\/([^\/?#]+)\//.exec(f.url);
    if (!m) return '';
    var host = m[1].toLowerCase();
    return (host === f.dominio || host.slice(-(f.dominio.length + 1)) === '.' + f.dominio) ? f.url : '';
  }

  /** En el orden de la lista y sin repetir; lo que no está, fuera. */
  function ordenar(fondos) {
    var l = Array.isArray(fondos) ? fondos.map(String) : [];
    return TODOS.map(function (f) { return f.codigo; }).filter(function (c) { return l.indexOf(c) >= 0; });
  }

  /**
   * ¿Esa combinación vale? Las mismas reglas que pension_autorizar en la base:
   * «No sé» y «Nunca he cotizado» van solos, y Colpensiones puede ir con UN
   * fondo privado. Una lista vacía vale (autorizó y no escogió).
   * @returns {ok, fondos, motivo}
   */
  function revisar(fondos) {
    var crudos = Array.isArray(fondos) ? fondos.map(String) : [];
    if (crudos.some(function (c) { return !porCodigo(c); })) return { ok: false, fondos: [], motivo: 'fondos' };
    var l = ordenar(crudos);
    var solos = l.filter(function (c) { return c === 'no_se' || c === 'nunca'; });
    var afp = l.filter(esAfp);
    if (l.length > 2 || (solos.length && l.length > 1) || afp.length > 1) return { ok: false, fondos: l, motivo: 'fondos' };
    return { ok: true, fondos: l, motivo: '' };
  }

  /**
   * Marcar o desmarcar uno, sin dejar una combinación que no vale: marcar
   * «No sé» o «Nunca» deja solo ese; marcar un fondo quita «No sé» y
   * «Nunca»; marcar un fondo privado quita el otro privado (Colpensiones se
   * queda).
   */
  function alternar(fondos, codigo) {
    var l = ordenar(fondos), c = String(codigo || '');
    if (!porCodigo(c)) return l;
    if (l.indexOf(c) >= 0) return l.filter(function (x) { return x !== c; });
    if (c === 'no_se' || c === 'nunca') return [c];
    var r = l.filter(function (x) { return x !== 'no_se' && x !== 'nunca'; });
    if (esAfp(c)) r = r.filter(function (x) { return !esAfp(x); });
    return ordenar(r.concat([c]));
  }

  /** Los nombres, para leer: «Colpensiones y Porvenir». */
  function nombres(fondos) {
    var n = ordenar(fondos).map(function (c) { return porCodigo(c).nombre; });
    return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
  }

  return {
    CONSULTADO: CONSULTADO,
    FONDOS: FONDOS.map(function (f) { return Object.assign({}, f, { pasos: f.pasos.slice() }); }),
    OTRAS: OTRAS.map(function (f) { return Object.assign({}, f); }),
    porCodigo: porCodigo,
    esAfp: esAfp,
    esFondo: esFondo,
    urlOficial: urlOficial,
    ordenar: ordenar,
    revisar: revisar,
    alternar: alternar,
    nombres: nombres
  };
});
