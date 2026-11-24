/* ============================================================================
 * TUS EXTRACTOS: EL PASO DEL REGISTRO Y LA TARJETA DE LA APP
 * 13 de noviembre de 2026
 *
 * Joan: «quiero validar si el cliente no es empleado que pueda subir los
 * estractos bancarios». Y sus decisiones de ese día (mandan sobre el plan del
 * 9-nov, RECETA-PLAN-VERIFICACION-Y-RIESGO.md, F3):
 *   1. se le ofrece a quien NO es empleado (seOfrece: cualquier ocupación del
 *      registro salvo «Empleado»; una opción nueva, como «Desempleado» o
 *      «Estudiante» del plan, entra sola);
 *   2. va DENTRO DEL REGISTRO, como el fondo de pensiones: opcional, después de
 *      «De qué vives», con «Lo hago después» que existe de verdad desde la
 *      cuenta (tarjetaDeCuenta, en el Perfil de play/ y en Inicio de
 *      app/socio.html);
 *   3. los archivos se guardan mientras tenga cuenta, y el cliente los quita
 *      cuando quiera (extracto_retirar);
 *   4. se publica con este texto y después se le manda al abogado;
 *   5. solo Joan los ve (con su clave; ninguna función del equipo los devuelve).
 *
 * ES EL MODELO DE LA HISTORIA LABORAL (app/historia-laboral.js), copiado y no
 * compartido: aquella tiene su texto, su autorización, su versión y sus
 * funciones de la base, y cambiarla para servir a las dos habría obligado a
 * subirle la versión en cada página que la pide y a volver a probar todo lo
 * que ya se arregló allá en tres rondas. Lo que sí se toma de allá, porque es
 * puro y no sabe de quién es el archivo, se busca al usarlo (H()):
 * prepararArchivo (el tipo por los primeros bytes, el achique, y las imágenes
 * SIN sus metadatos —el EXIF trae dónde se tomó la foto—), el portapapeles
 * (leerPortapapeles, blobsDePegar), llamarConToken y minutosFuera. Sin
 * app/historia-laboral.js, este paso no aparece (disponible()).
 *
 * Las reglas de la base están en base/20261113c_los_extractos.sql: el teléfono
 * se puede saltar todo lo de aquí, y la base lo vuelve a mirar.
 *
 * LO QUE SE PIDE, EN PALABRAS DE TODOS LOS DÍAS: los extractos de los últimos
 * 3 meses de la cuenta donde le pagan o le llega la plata (Nequi, Daviplata o
 * el banco), que se bajan desde la app de su banco. En PDF (el mejor: tres, uno
 * por mes), en pantallazos (hasta 5) o con «📋 Pegar». NUNCA la clave: ni la
 * del banco, ni la de Nequi, ni la del PDF (si el banco le puso una, se sube
 * igual). Obtener datos personales sin estar facultado es delito (Código
 * Penal, art. 269F), y ninguna pantalla ni función de la base la recibe.
 *
 * LO QUE NO HACE, Y POR ESO NINGÚN TEXTO LO DICE: no lee el extracto, no lo
 * confirma con el banco, no le pone puntos a nadie y no cambia la garantía. Lo
 * mira Joan, y anota en la ficha lo que le entra (panel/extractos-crm.js).
 *
 * LA VUELTA DE LA CÁMARA, Y LO QUE ESTE PASO HACE MEJOR. Bajar un extracto es
 * salir a la app del banco, y afuera corre el reloj de la cámara
 * (app/escaner-cedula.js, MINUTOS_VUELTA_DE_LA_CAMARA): si el teléfono cierra
 * la página y pasa más de ese rato, el arranque de play/ borra la cédula, la
 * selfie y lo escogido aquí (la regla del teléfono prestado, que no se afloja).
 * La historia laboral avisaba ANTES del botón que saca de la página; aquí no
 * hay botón (la persona sale sola a su banco), así que el aviso va arriba de
 * todo, antes de la casilla, con los minutos de la regla y el camino que no
 * pierde nada: «Lo hago después», y subirlos desde la cuenta, donde salir no
 * borra nada. Y lo que ya pasó a la COLA de la cuenta (al tocar «Abrir mi
 * cuenta») no lo toca el arranque: sobrevive a salir a Nequi hasta el día
 * siguiente y sube al volver a entrar.
 *
 * DÓNDE ESPERA EN EL REGISTRO (el guardadero), como en la historia laboral:
 *   · lo escogido (la autorización) vive como el borrador (localStorage, por
 *     intento y celular), y se va con «Empezar de cero», con el cambio de
 *     celular y al abrir la cuenta (pasa a la cola);
 *   · los ARCHIVOS viven en IndexedDB (otra base: tg_extractos), atados al
 *     intento y al celular; se sueltan al salir del registro y caducan al día;
 *     sin IndexedDB esperan en la memoria de la página, y la pantalla lo dice;
 *   · al abrir la cuenta pasan a la COLA de esa cuenta, y solo su sesión los
 *     sube (subirCola).
 * ==========================================================================*/

/* La firma de llegada (ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la nota de
   v139 en sw.js). Va primero: firma que llegó ESTE archivo. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Extractos = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* La versión del texto de la autorización: la fecha de la política que la
     describe (legal/privacidad.html, «Lo que cambió el 19 de noviembre de
     2026»), que es el día en que sale el lote (la regla del 15-oct: la fecha
     es la de PUBLICACIÓN). Si el lote sale otro día, se mueve aquí, en la
     casilla, en la política y en los términos: pruebas/los-extractos.test.js
     dice qué más. NO es VERSION_AUTORIZACION de app/cuenta.js: esa es la
     general, y no sube (a nadie se le vuelve a pedir nada por esto). */
  var VERSION_AUTORIZACION = '2026-11-19';
  var FECHA_EN_PALABRAS = '19 de noviembre de 2026';

  /* Los topes son los de la base (extracto_subir): aquí se miran antes para
     decirlo sin gastar la subida, y allá otra vez. 3 PDF: los tres meses, que
     Nequi da uno por mes. */
  var LIMITES = {
    bytes: 3145728,            // 3 MB por archivo
    pdf: 3,
    imagenes: 5,
    totalBytes: 12582912       // 12 MB por persona
  };
  var SEGUNDOS_TOPE = 30;      // lo que se espera del teléfono por archivo, como en la historia laboral
  var HORAS_ARCHIVOS = 24;     // lo que espera en el teléfono: como la cola de las fotos
  var DIAS_ESTADO = 7;         // lo escogido (sin archivos): como un borrador
  var LLAVE_ESTADO = 'play_extractos';
  var BASE_DE_DATOS = 'tg_extractos';
  /* Las llaves dentro de esa base, con su propio nombre y no 'reg' y 'cola:' como
     las de la historia laboral: viven en OTRA base de IndexedDB, pero si un
     navegador (o el IndexedDB de mentira de las pruebas) las juntara, soltar los
     extractos no puede soltar la historia laboral, ni barrer una la cola de la
     otra. */
  var REG = 'extractos:reg';
  var COLA = 'extractos:cola:';

  /* Lo que se toma de app/historia-laboral.js (ver la cabecera). Se busca al
     usarlo, y no al cargar, para que el orden de los <script> no importe. */
  function H() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try { return require('./historia-laboral.js'); } catch (e) { /* sigue */ }
    }
    return (typeof globalThis !== 'undefined' && globalThis.HistoriaLaboral) || null;
  }
  /** ¿Está todo lo que hace falta para ofrecerlo? Sin eso, el paso y la tarjeta no aparecen. */
  function disponible() {
    var h = H();
    return !!(h && typeof h.prepararArchivo === 'function' && typeof h.llamarConToken === 'function' &&
              typeof h.leerPortapapeles === 'function' && typeof h.blobsDePegar === 'function');
  }
  function minutosFuera() { var h = H(); var m = h && h.minutosFuera ? Number(h.minutosFuera()) : 0; return m > 0 ? m : 10; }
  function conMinutos(t) { return String(t).replace('{min}', String(minutosFuera())); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  /* La promesa `p`, o `siVence` si no contesta en `ms` (la copia de
     historia-laboral.js: allá no se exporta). */
  function conTope(p, ms, siVence) {
    if (!(ms > 0) || typeof setTimeout !== 'function') return Promise.resolve(p);
    return new Promise(function (res, rej) {
      var hecho = false;
      var reloj = setTimeout(function () { if (!hecho) { hecho = true; res(siVence); } }, ms);
      var fin = function (f, x) { if (hecho) return; hecho = true; try { clearTimeout(reloj); } catch (e) {} f(x); };
      Promise.resolve(p).then(function (x) { fin(res, x); }, function (e) { fin(rej, e); });
    });
  }

  /* --------------------------------------------------------------- a quién */
  /* LA DECISIÓN 1 DE JOAN, ESCRITA PARA QUE UNA OPCIÓN NUEVA ENTRE SOLA. Hoy
     app/cuenta.js (campo 'ocupacion') ofrece Empleado, Independiente,
     Pensionado y Otra; el plan (F2) suma Desempleado y Estudiante. Se ofrece a
     TODO el que dijo algo y no dijo empleado: con mayúsculas, tildes o un
     «Empleado con nómina» de mañana, igual. «Desempleado» no empieza por
     «emplead», así que sí se le ofrece. Sin ocupación (no la ha dicho todavía,
     o un cliente viejo sin registro) no se ofrece: no se sabe. */
  function normal(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  }
  function seOfrece(ocupacion) {
    var o = normal(ocupacion);
    return !!o && !/^emplead[oa](\b|$)/.test(o);
  }

  /* ---------------------------------------------------------------- textos */
  var TEXTOS = {
    /* Arriba de la casilla, en el registro y en la cuenta: «no cambian tu
       garantía» se lee ANTES de dar nada (los términos cambian con esto: el
       punto 6 dice que cada dato sube la garantía prestada, salvo estos). */
    intro: 'Opcional. Tus extractos muestran lo que de verdad te entra cada mes, aunque no tengas un empleo con nómina. ' +
      'Si nos los das, los miramos al revisar tu solicitud, y no cambian tu garantía. Si no, tu registro sigue igual.',
    introCuenta: 'Opcional. Los extractos de los últimos 3 meses de la cuenta donde te llega la plata. Si nos los das, ' +
      'los miramos al revisar tus solicitudes. No cambian tu garantía.',
    queSePide: 'Qué te pedimos: los extractos de los últimos 3 meses de la cuenta donde te pagan o te llega la plata: ' +
      'Nequi, Daviplata o tu banco.',
    comoSeBajan: 'Se bajan desde la app de tu Nequi o de tu banco, en la parte de extractos (a veces se llama ' +
      '«Certificados» o «Documentos»): baja el de cada mes. Si no lo encuentras, sirven pantallazos de tus movimientos ' +
      'donde se vean las fechas y los valores.',
    nuncaClave: 'Nunca te pedimos la clave de tu Nequi, de Daviplata ni de tu banco, ni entramos a tu cuenta. Si alguien te ' +
      'la pide a nombre de Tu Garantía, no se la des.',
    autorizacion: 'Autorizo a NEXECO S.A.S. (Tu Garantía) a recibir y guardar los extractos de mis cuentas que yo suba.',
    /* Lo que la ley pide decir al pedirla (Ley 1581, arts. 9 y 12; Decreto
       1377, arts. 5 y 7): para qué, que es opcional, cuánto se guarda, quién
       la ve y cómo se retira. Cada frase es verdad en el código: los ve solo
       Joan (extracto_archivo pide su clave), se guardan mientras haya cuenta
       (no caducan), se quitan desde la app (extracto_retirar) o por el chat
       (extracto_borrar, desde el CRM), y lo que Joan anota en la ficha es lo
       que le entra al mes y si es regular, en pesos: ningún nombre de nadie
       (panel/extractos-crm.js). Un extracto trae datos de TERCEROS (quien le
       manda plata, a quien le paga) que no autorizaron nada (Decreto 1377, art.
       11), y gastos que pueden decir algo sensible (salud, religión, política):
       se dice, y se dice que no se usan. */
    autorizacionDetalle: 'Para mirar cuánto me entra y con qué regularidad cuando evalúen mis solicitudes de crédito. Es ' +
      'opcional y aparte de la autorización general: sin ella todo sigue igual. Nunca me piden la clave de mi Nequi, de ' +
      'Daviplata ni de mi banco. Los mira una persona, quien dirige el negocio; ningún programa los lee ni los califica, y el ' +
      'resto del equipo no los ve. Se guardan mientras tenga cuenta en Tu Garantía; puedo quitarlos cuando quiera desde mi ' +
      'cuenta en la app, o pedir por el chat que los borren. Un extracto trae nombres de otras personas (quien me manda plata ' +
      'o a quien le pago) y en qué gasto: de eso no se anota nada, y lo que diga de mi salud, mi religión o mi política no se ' +
      'usa para nada. En un pantallazo puedo tapar lo que no quiera mostrar.',
    /* {min}: los minutos de la regla de la cámara (minutosFuera). Ver «LA
       VUELTA DE LA CÁMARA» en la cabecera: va arriba de todo, en el registro. */
    antesDeIrte: 'Si vas a salir a la app de tu banco a bajarlos, vuelve en menos de {min} minutos.',
    antesDeIrteDetalle: 'Si pasas más rato fuera y el teléfono cierra esta página, por seguridad se borran de él las fotos ' +
      'de tu cédula y de tu cara, y lo que escogiste aquí, y tendrás que volver a tomarlas. Si todavía no los tienes, toca ' +
      '«Lo hago después» y súbelos sin afán desde tu cuenta: ahí salir no borra nada.',
    dondeDespues: 'Los subes cuando quieras desde tu cuenta: Perfil → «📄 Tus extractos» (en la app instalada, en Inicio).',
    despuesConAutorizacion: 'Tu autorización de los extractos se guarda con tu registro cuando toques «Abrir mi cuenta».',
    despuesConArchivos: 'Tu autorización de los extractos y {n} se guardan con tu registro cuando toques «Abrir mi cuenta».',
    despuesSeBorran: 'Hasta entonces los archivos esperan en este teléfono: si sales de esta página más de {min} minutos y ' +
      'el teléfono la cierra, se borran.',
    despuesEnMemoria: 'Hasta entonces los archivos esperan en esta página: este teléfono no deja guardarlos, y si la página ' +
      'se cierra tendrás que escogerlos otra vez.',
    despuesQuitar: 'Si cambiaste de idea, toca «Volver» y desmarca la autorización.',
    dondeFalte: 'Lo que te falte lo subes cuando quieras desde tu cuenta: Perfil → «📄 Tus extractos» (en la app instalada, en Inicio).',
    subelos: 'Cuando los tengas, súbelos',
    ayudaFormas: 'El PDF es lo mejor: es el extracto tal como lo da tu banco. Si no, pantallazos de tus movimientos donde se ' +
      'lean tu nombre, las fechas y los valores. Hasta 3 PDF y 5 pantallazos.',
    pdfConClave: 'Si tu banco le puso clave al PDF, súbelo igual: nunca te pedimos esa clave.',
    delBanco: '¿Lo bajaste en este mismo teléfono? Escógelo con «📄 Subir el PDF» (en iPhone, guárdalo antes en Archivos).',
    zonaPegar: 'Mantén presionado aquí y toca «Pegar»',
    pegadoPregunta: '¿Es tu extracto?',
    pegadoAyuda: 'Esto es lo que copiaste. No lo guardamos hasta que toques «Sí, guardarlo».',
    pegadoAyudaCuenta: 'Esto es lo que copiaste. No lo subimos hasta que toques «Sí, subirlo».',
    pegadoNo: 'Listo: no guardamos lo que copiaste.',
    pegadoPendiente: 'Antes de seguir: ¿lo que pegaste es tu extracto? Toca «Sí, guardarlo» o «No, no es este».',
    mirandoPegado: 'Un momento: estamos mirando lo que copiaste. Cuando aparezca, dinos si es tu extracto.',
    quedanAqui: 'Quedan en este teléfono y suben con tu registro cuando toques «Abrir mi cuenta». Si sales de esta página ' +
      'más de {min} minutos y el teléfono la cierra, se borran, como las fotos de tu cédula.',
    soloMemoria: 'Este teléfono no deja guardarlos: si la página se cierra antes de abrir tu cuenta, tendrás que escogerlos otra vez.',
    perdidos: 'Los extractos que habías escogido se borraron de este teléfono porque pasó un rato desde que saliste de la ' +
      'página: escógelos otra vez.',
    perdidosOtroPaso: 'Los extractos que escogiste se borraron de este teléfono porque pasó un rato desde que saliste de la página.',
    perdidosQueHacer: 'Es opcional: puedes volver a «Tus extractos» y escogerlos otra vez, o subirlos después desde tu ' +
      'cuenta: Perfil → «📄 Tus extractos» (en la app instalada, en Inicio).',
    terminando: 'Un momento: estamos terminando con los archivos que escogiste…',
    terminandoCola: 'Un momento: estamos terminando de preparar los extractos que escogiste…',
    subiendoRegistro: 'Un momento: estamos guardando lo que escogiste en tu registro…'
  };

  var MOTIVOS = {
    tipo_no_permitido: 'Ese archivo no es un PDF ni una imagen (JPG, PNG o WEBP). Escoge el PDF de tu extracto, o un pantallazo.',
    muy_grande: 'Ese archivo pesa más de 3 MB. Si es un PDF, escoge el que bajaste de tu banco, sin pasarlo por otras apps; si no, súbelo en pantallazos.',
    demasiados_pdf: 'Ya tienes 3 PDF: quita uno para subir otro.',
    demasiados_img: 'Ya tienes 5 pantallazos: quita uno para subir otro.',
    demasiados: 'Ya tienes el máximo de archivos: quita uno para subir otro.',
    sin_espacio: 'Entre todos tus archivos pasan de 12 MB: quita uno para subir otro.',
    repetido: 'Ese archivo ya está en tu lista.',
    vacio: 'Ese archivo está vacío.',
    no_es_archivo: 'No pudimos leer ese archivo. Prueba otra vez o escoge otro.',
    lectura: 'No pudimos leer ese archivo en este teléfono. Prueba con otro.',
    tardo: 'Ese archivo no terminó de abrirse en este teléfono en ' + SEGUNDOS_TOPE + ' segundos, así que seguimos sin él. ' +
      'Escógelo otra vez o prueba con otro.',
    sin_autorizacion: 'Primero marca la autorización de arriba.',
    desautorizado: 'Quitaste la autorización: no guardamos los archivos que se estaban preparando.',
    version: 'No pudimos guardar tu autorización. Vuelve a intentar.',
    freno: 'Hiciste muchos cambios seguidos. Espera unos minutos y vuelve a intentar.',
    sin_sesion: 'Se cerró tu sesión. Entra otra vez y vuelve a intentar.',
    sesion: 'Se cerró tu sesión. Entra otra vez y vuelve a intentar.',
    sin_red: 'No hay conexión. Revisa tu internet y vuelve a intentar.',
    apagado: 'Esta parte todavía no está encendida en nuestro sistema. Inténtalo más tarde.',
    /* El cortacircuito de extracto_subir (el reparto de los 500 MB, en el
       encabezado de base/20261113c_los_extractos.sql). No es culpa de su
       archivo ni de su señal. Y no se le ofrece mandarlos por el chat: allá no
       los cubren las reglas de estos (su autorización aparte, que los vea solo
       Joan, que se borren al retirarla). */
    lleno: 'Ahora mismo no podemos recibir más extractos. Es opcional: tu cuenta y tus solicitudes siguen igual. Inténtalo más tarde.',
    pegar_vacio: 'No encontramos un pantallazo copiado. Cópialo primero (en tu galería: Compartir → Copiar) y vuelve a tocar «📋 Pegar», o usa «🖼️ Subir pantallazos».',
    pegar_negado: 'Tu teléfono no nos dejó leer lo que copiaste. Mantén presionado el recuadro de abajo y toca «Pegar», o usa «🖼️ Subir pantallazos».',
    pegar_sin_api: 'Mantén presionado el recuadro de abajo y toca «Pegar».',
    pegar_texto: 'Lo que pegaste es texto, no una imagen ni un PDF. Copia el pantallazo, o usa «🖼️ Subir pantallazos».'
  };
  function motivoEnPalabras(m) { return MOTIVOS[m] || 'No pudimos guardar ese archivo. Vuelve a intentar.'; }

  /* ------------------------------------------------------------ los bytes */
  var TIPO_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  function tipoPorBytes(u8) { var h = H(); return h ? h.tipoPorBytes(u8) : null; }
  function bytesDeBase64(t) { var h = H(); return h ? h.bytesDeBase64(t) : new Uint8Array(0); }
  function tamanoEnPalabras(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' bytes';
    if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (Math.round(n / 104857.6) / 10).toString().replace('.', ',') + ' MB';
  }
  function nombreDeTipo(t) { return t === 'pdf' ? 'PDF' : 'Pantallazo'; }
  /** «1 PDF y 2 pantallazos». */
  function resumen(lista) {
    var l = lista || [], p = l.filter(function (a) { return a && a.tipo === 'pdf'; }).length, i = l.length - p, partes = [];
    if (p) partes.push(p + ' PDF');
    if (i) partes.push(i + (i === 1 ? ' pantallazo' : ' pantallazos'));
    return partes.join(' y ');
  }
  /** ¿Cabe uno más de ese tipo y ese tamaño en la lista? Los topes de la base. */
  function revisarNuevo(lista, tipo, bytes, sha) {
    var l = lista || [];
    if (!tipo) return { ok: false, motivo: 'tipo_no_permitido' };
    if (!(bytes > 0)) return { ok: false, motivo: 'vacio' };
    if (bytes > LIMITES.bytes) return { ok: false, motivo: 'muy_grande' };
    if (sha && l.some(function (a) { return a && a.sha256 === sha; })) return { ok: false, motivo: 'repetido' };
    var pdf = l.filter(function (a) { return a && a.tipo === 'pdf'; }).length;
    if (tipo === 'pdf' && pdf >= LIMITES.pdf) return { ok: false, motivo: 'demasiados_pdf' };
    if (tipo !== 'pdf' && l.length - pdf >= LIMITES.imagenes) return { ok: false, motivo: 'demasiados_img' };
    var total = l.reduce(function (t, a) { return t + (Number(a && a.bytes) || 0); }, 0);
    if (total + bytes > LIMITES.totalBytes) return { ok: false, motivo: 'sin_espacio' };
    return { ok: true, motivo: '' };
  }
  function armarAutorizacion(momento) { return { version: VERSION_AUTORIZACION, momento: String(momento || '') }; }
  /** Del archivo escogido o pegado a lo que sube: el de la historia laboral (ver la cabecera). */
  function prepararArchivo(blob) {
    var h = H();
    if (!h) return Promise.resolve({ ok: false, motivo: 'lectura' });
    return h.prepararArchivo(blob);
  }

  /* ------------------------------------------------ el guardadero del registro */
  /**
   * Lo del paso, en el teléfono, mientras no hay cuenta. `o`: {ls, idb, ahora}.
   * El de app/historia-laboral.js sin el fondo, con su propia llave y su propia
   * base (ver la cabecera). Sus arreglos se quedan, cada uno con su porqué allá:
   * la GENERACIÓN («Empezar de cero» deja fuera lo que venía en camino), LO QUE
   * VA EN CAMINO (el paso montado después lo espera), LO DE LA MEMORIA MANDA
   * CUANDO UNA ESCRITURA FALLÓ, el registro ENCOLADO (lo que llega tarde se suma
   * a la cola, nunca a un registro ya cerrado) y el BARRIDO de lo vencido.
   */
  function guardadero(o) {
    o = o || {};
    var ls = o.ls || null, idb = o.idb || null;
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var MEM = {}, ESTADO_MEM = null, persistido = true, dbP = null;
    var GEN = 0;
    var EN_CAMINO = 0, AL_TERMINAR = [], MALOS_EN_CAMINO = [];
    var ENCOLADO = null;

    function abrir() {
      if (dbP) return dbP;
      dbP = new Promise(function (res) {
        if (!idb || typeof idb.open !== 'function') { persistido = false; return res(null); }
        var reloj = null, listo = false, fin = function (d) {
          if (listo) return; listo = true; if (!d) persistido = false;
          try { if (reloj) clearTimeout(reloj); } catch (e) {}
          res(d);
        };
        /* Safari a veces no contesta nunca el open: a los 3 s, la memoria. */
        try { reloj = setTimeout(function () { fin(null); }, 3000); } catch (e) {}
        try {
          var req = idb.open(BASE_DE_DATOS, 1);
          req.onupgradeneeded = function () { try { req.result.createObjectStore('lotes'); } catch (e) {} };
          req.onsuccess = function () { fin(req.result); };
          req.onerror = function () { fin(null); };
          req.onblocked = function () { fin(null); };
        } catch (e) { fin(null); }
      });
      return dbP;
    }
    var deMem = function (llave) { return Object.prototype.hasOwnProperty.call(MEM, llave); };
    function leer(llave) {
      return abrir().then(function (d) {
        if (!d || deMem(llave)) return MEM[llave] || null;
        return new Promise(function (res) {
          try {
            var r = d.transaction('lotes', 'readonly').objectStore('lotes').get(llave);
            r.onsuccess = function () { res(deMem(llave) ? MEM[llave] || null : r.result || null); };
            r.onerror = function () { res(MEM[llave] || null); };
          } catch (e) { res(MEM[llave] || null); }
        });
      });
    }
    function escribir(llave, valor) {
      return abrir().then(function (d) {
        if (!d) { if (valor) MEM[llave] = valor; else delete MEM[llave]; return false; }
        var enMem = function () { persistido = false; MEM[llave] = valor || null; };
        return new Promise(function (res) {
          try {
            var tx = d.transaction('lotes', 'readwrite'), st = tx.objectStore('lotes');
            if (valor) st.put(valor, llave); else st['delete'](llave);
            tx.oncomplete = function () { delete MEM[llave]; res(true); };
            tx.onerror = tx.onabort = function () { enMem(); res(false); };
          } catch (e) { enMem(); res(false); }
        });
      });
    }
    function nuevo(intento, celular) {
      return { intento: String(intento || ''), celular: String(celular || ''), aut: null, despues: false, archivos_n: 0, t: ahora() };
    }
    function leerEstadoCrudo() {
      var e = null;
      try { e = JSON.parse((ls && ls.getItem(LLAVE_ESTADO)) || 'null'); } catch (x) { e = null; }
      return (e && typeof e === 'object') ? e : ESTADO_MEM;
    }
    function vale(x, intento, celular, horas) {
      return !!(x && intento && celular && x.intento === String(intento) && x.celular === String(celular) &&
                ahora() - Number(x.t) >= 0 && ahora() - Number(x.t) < horas * 3600e3);
    }
    function contar(intento, celular, n) {
      var e = leerEstadoCrudo();
      if (!vale(e, intento, celular, DIAS_ESTADO * 24)) return;
      e.archivos_n = n; g.guardarEstado(e);
    }
    function soltarElRegistro() {
      ESTADO_MEM = null;
      try { if (ls) ls.removeItem(LLAVE_ESTADO); } catch (x) {}
      return escribir(REG, null);
    }
    function enFila(enc, f) {
      var p = enc.cadena.then(f);
      enc.cadena = p.then(null, function () {});
      return p;
    }
    function alaCola(enc, a) {
      return enFila(enc, function () {
        return leer(COLA + enc.celular).then(function (c) {
          var vigente = !!(c && typeof c === 'object' && c.celular === enc.celular && c.intento === enc.intento &&
            c.aut && c.aut.version && ahora() - Number(c.t) >= 0 && ahora() - Number(c.t) < HORAS_ARCHIVOS * 3600e3);
          if (!vigente) return { ok: false, motivo: 'sin_autorizacion' };
          var lista = Array.isArray(c.archivos) ? c.archivos : [];
          var rv = revisarNuevo(lista, a && a.tipo, a && a.bytes, a && a.sha256);
          if (!rv.ok) return rv;
          if (lista.some(function (x) { return x.base64 === a.base64; })) return { ok: false, motivo: 'repetido' };
          var id = ahora().toString(36) + Math.random().toString(36).slice(2, 8);
          c.archivos = lista.concat([{ id: id, tipo: a.tipo, bytes: a.bytes, base64: a.base64, sha256: a.sha256 || '' }]);
          return escribir(COLA + enc.celular, c).then(function () { return { ok: true, motivo: '', id: id }; });
        });
      });
    }
    var g = {
      /** Lo escogido en ESTE registro (intento y celular); si no, uno nuevo. */
      estado: function (intento, celular) {
        var e = leerEstadoCrudo();
        if (vale(e, intento, celular, DIAS_ESTADO * 24)) return e;
        return nuevo(intento, celular);
      },
      guardarEstado: function (e) {
        if (!e) return;
        e.t = ahora();
        ESTADO_MEM = e;
        try { if (ls) ls.setItem(LLAVE_ESTADO, JSON.stringify(e)); } catch (x) { /* queda en ESTADO_MEM */ }
      },
      /* Cuántos archivos espera ESTE registro, sin esperar a IndexedDB: el
         arranque de play/ decide con esto, ANTES de pintar nada, si los suelta. */
      hayArchivosGuardados: function (intento, celular) {
        var e = leerEstadoCrudo();
        return !!(vale(e, intento, celular, HORAS_ARCHIVOS) && Number(e.archivos_n) > 0);
      },
      /** Los archivos de este registro. `perdidos`: los había y caducaron. */
      archivos: function (intento, celular) {
        return leer(REG).then(function (r) {
          if (!r) return { lista: [], perdidos: false };
          if (vale(r, intento, celular, HORAS_ARCHIVOS)) return { lista: Array.isArray(r.archivos) ? r.archivos : [], perdidos: false };
          var eranDeEste = !!(r.intento === String(intento) && r.celular === String(celular));
          return escribir(REG, null).then(function () { return { lista: [], perdidos: eranDeEste && !!(r.archivos && r.archivos.length) }; });
        });
      },
      agregar: function (intento, celular, a) {
        var gen = GEN;
        return g.archivos(intento, celular).then(function (r) {
          if (gen !== GEN) return { ok: false, motivo: 'repetido' };
          var enc = ENCOLADO;
          if (enc && enc.abierto && enc.intento === String(intento) && enc.celular === String(celular)) return alaCola(enc, a);
          /* SIN LA AUTORIZACIÓN VIGENTE DE ESTE REGISTRO NO ENTRA NADA, y se
             mira aquí, justo antes de escribir, en lo escogido del guardadero
             (no en la pantalla que pidió guardar, que puede ser una vieja). */
          var x = leerEstadoCrudo();
          if (!(vale(x, intento, celular, DIAS_ESTADO * 24) && x.aut && x.aut.version)) return { ok: false, motivo: 'sin_autorizacion' };
          var rv = revisarNuevo(r.lista, a && a.tipo, a && a.bytes, a && a.sha256);
          if (!rv.ok) return rv;
          if (r.lista.some(function (y) { return y.base64 === a.base64; })) return { ok: false, motivo: 'repetido' };
          var item = { id: ahora().toString(36) + Math.random().toString(36).slice(2, 8), tipo: a.tipo, bytes: a.bytes,
                       base64: a.base64, sha256: a.sha256 || '', nombre: String(a.nombre || '').slice(0, 120), t: ahora() };
          var lista = r.lista.concat([item]);
          contar(intento, celular, lista.length);
          return escribir(REG, { intento: String(intento), celular: String(celular), t: ahora(), archivos: lista })
            .then(function () { return { ok: true, motivo: '', id: item.id }; });
        });
      },
      quitar: function (intento, celular, id) {
        var gen = GEN;
        return g.archivos(intento, celular).then(function (r) {
          if (gen !== GEN) return null;
          var lista = r.lista.filter(function (x) { return x.id !== id; });
          contar(intento, celular, lista.length);
          return escribir(REG, lista.length ? { intento: String(intento), celular: String(celular), t: ahora(), archivos: lista } : null);
        });
      },
      /** Al salir del registro (como las fotos): los archivos se van, lo escogido se queda. */
      soltarArchivos: function () {
        var e = leerEstadoCrudo();
        if (e && Number(e.archivos_n) > 0) { e.archivos_n = 0; g.guardarEstado(e); }
        return escribir(REG, null);
      },
      /** «Empezar de cero», otro celular, o la ocupación que pasó a «Empleado»: todo. */
      olvidar: function () {
        GEN++;
        ESTADO_MEM = null;
        try { if (ls) ls.removeItem(LLAVE_ESTADO); } catch (x) {}
        return g.soltarArchivos();
      },
      /**
       * «Abrir mi cuenta» salió bien: lo de ESTE registro pasa a la cola de
       * esa cuenta, EN EL ACTO; lo que seguía en camino entra después
       * (colaLista dice cuándo). Sin la autorización no se encola nada.
       */
      encolar: function (intento, celular) {
        var e = g.estado(intento, celular);
        var aut = e.aut;
        if (!aut || !aut.version) return g.olvidar().then(function () { return false; });
        var cel = String(celular), cerrar = null;
        var enc = { intento: String(intento), celular: cel, abierto: true, dicho: false, cadena: null, lista: null };
        enc.lista = new Promise(function (r) { cerrar = r; });
        ENCOLADO = enc;
        var desde = MALOS_EN_CAMINO.length;
        var escrita = g.archivos(intento, celular).then(function (r) {
          var cola = { celular: cel, intento: enc.intento, t: ahora(), aut: aut, autorizada: false,
                       archivos: r.lista.map(function (a) { return { id: a.id, tipo: a.tipo, bytes: a.bytes, base64: a.base64, sha256: a.sha256 }; }) };
          return escribir(COLA + cel, cola);
        }).then(function () { return soltarElRegistro(); });
        enc.cadena = escrita.then(null, function () {});
        g.alTerminar(function (malos) {
          var tarde = (malos || []).slice(desde);
          enc.cadena.then(function () { enc.abierto = false; cerrar(tarde); });
        });
        return escrita.then(function () { return true; });
      },
      cola: function (cel) {
        if (!cel) return Promise.resolve(null);
        return leer(COLA + cel).then(function (c) {
          if (!c) return null;
          if (c.celular === String(cel) && ahora() - Number(c.t) >= 0 && ahora() - Number(c.t) < HORAS_ARCHIVOS * 3600e3) return c;
          return escribir(COLA + cel, null).then(function () { return null; });
        });
      },
      guardarCola: function (cel, c) {
        var enc = ENCOLADO;
        if (enc && enc.abierto && enc.celular === String(cel)) return enFila(enc, function () { return escribir(COLA + cel, c || null); });
        return escribir(COLA + cel, c || null);
      },
      colaEnEspera: function (cel) {
        var enc = ENCOLADO;
        return !!(enc && enc.abierto && enc.celular === String(cel) && EN_CAMINO > 0);
      },
      colaLista: function (cel) {
        var enc = ENCOLADO;
        if (!enc || enc.celular !== String(cel)) return Promise.resolve([]);
        return enc.lista.then(function (tarde) {
          if (enc.dicho) return [];
          enc.dicho = true;
          return tarde || [];
        });
      },
      /**
       * EL BARRIDO DE LO VENCIDO: toda cola y todo registro de más de
       * HORAS_ARCHIVOS se va al abrir, sea de quien sea (en el teléfono
       * prestado, los extractos de María no se quedan para siempre), y lo
       * escogido de más de DIAS_ESTADO. `perdidos`: si eran de ESTE registro.
       */
      barrer: function (intento, celular) {
        var e = leerEstadoCrudo();
        if (e && !(ahora() - Number(e.t) >= 0 && ahora() - Number(e.t) < DIAS_ESTADO * 24 * 3600e3)) {
          ESTADO_MEM = null;
          try { if (ls) ls.removeItem(LLAVE_ESTADO); } catch (x) {}
        }
        var res = { borrados: 0, perdidos: false };
        var vencido = function (k, v) {
          if (k !== REG && String(k).indexOf(COLA) !== 0) return false;
          var ok = v && typeof v === 'object' && ahora() - Number(v.t) >= 0 && ahora() - Number(v.t) < HORAS_ARCHIVOS * 3600e3 &&
            (k === REG || String(v.celular) === String(k).slice(COLA.length));
          if (ok) return false;
          if (k === REG && v && intento && celular && v.intento === String(intento) && v.celular === String(celular) &&
              v.archivos && v.archivos.length) res.perdidos = true;
          res.borrados++;
          return true;
        };
        return abrir().then(function (d) {
          if (!d) { Object.keys(MEM).forEach(function (k) { if (vencido(k, MEM[k])) delete MEM[k]; }); return res; }
          return new Promise(function (fin) {
            try {
              var tx = d.transaction('lotes', 'readwrite'), cur = tx.objectStore('lotes').openCursor();
              cur.onsuccess = function () {
                var c = cur.result;
                if (!c) return;
                if (vencido(c.key, c.value)) c['delete']();
                c['continue']();
              };
              tx.oncomplete = function () { fin(res); };
              tx.onerror = tx.onabort = function () { fin(res); };
            } catch (x) { fin(res); }
          });
        });
      },
      soloEnMemoria: function () { return abrir().then(function () { return !persistido; }); },
      enMemoria: function () { return !persistido; },
      enCamino: function (p) {
        if (!arguments.length) return EN_CAMINO > 0;
        EN_CAMINO++;
        var fin = function (malos) {
          if (Array.isArray(malos)) MALOS_EN_CAMINO = MALOS_EN_CAMINO.concat(malos);
          EN_CAMINO = Math.max(0, EN_CAMINO - 1);
          if (EN_CAMINO) return;
          var l = AL_TERMINAR, m = MALOS_EN_CAMINO; AL_TERMINAR = []; MALOS_EN_CAMINO = [];
          l.forEach(function (f) { try { f(m.slice()); } catch (e) {} });
        };
        Promise.resolve(p).then(fin, function () { fin(); });
        return true;
      },
      alTerminar: function (f) { if (EN_CAMINO > 0) AL_TERMINAR.push(f); else f([]); }
    };
    return g;
  }

  /* -------------------------------------------- la subida de la cola, con sesión */
  var RECHAZOS_FINALES = ['muy_grande', 'tipo_no_permitido', 'no_es_archivo', 'vacio', 'demasiados', 'sin_espacio'];
  /**
   * Sube la cola de UNA cuenta con su sesión. `llamar(fn, cuerpo)` es la
   * llamada de la página con el token de esa sesión (rechaza con {status} si
   * la base dice que no). Primero la autorización, después cada archivo, de
   * uno en uno: si la señal se cae a mitad, lo que ya subió no se repite.
   * @returns Promise<{estado, subidos, rechazados, total, pendientes, noLlegaron}> —
   *   estado: 'nada' | 'ok' | 'apagado' | 'sesion' | 'freno' | 'lleno' | 'retirada' | 'sin_red'.
   *   'apagado' es la base sin base/20261113c_los_extractos.sql (404): se
   *   dice y el registro sigue; lo que esperaba se queda en la cola hasta
   *   mañana. 'lleno' (el cortacircuito) no es final: se reintenta.
   *   'retirada' sí: ya no hay autorización vigente, y la cola se borra.
   */
  function subirCola(g, cel, llamar, o) {
    var esperar = (g && typeof g.colaLista === 'function') ? g.colaLista(cel) : null;
    return Promise.resolve(esperar).then(null, function () { return []; }).then(function (tarde) {
      return g.cola(cel).then(function (c) {
        if (!c) return { estado: 'nada', subidos: 0, rechazados: [], total: 0, pendientes: 0, noLlegaron: [] };
        if (o && typeof o.alSubir === 'function') { try { o.alSubir(); } catch (e) {} }
        var res = { estado: 'ok', subidos: 0, rechazados: [], total: c.archivos.length, pendientes: 0,
                    noLlegaron: (tarde || []).filter(function (m) { return m && m !== 'sin_autorizacion'; })
                      .map(function (m) { return { tipo: '', motivo: m }; }) };
        var autorizar = c.autorizada ? Promise.resolve() :
          Promise.resolve(llamar('extracto_autorizar', { p_version: c.aut.version, p_momento: c.aut.momento || null }))
            .then(function (j) {
              if (j && j.ok === true) { c.autorizada = true; return g.guardarCola(cel, c); }
              throw { motivo: (j && j.motivo) || 'rechazo' };
            });
        return autorizar.then(function () {
          return c.archivos.slice().reduce(function (p, a) {
            return p.then(function () {
              return Promise.resolve(llamar('extracto_subir', { p_archivo: a.base64 })).then(function (j) {
                var fuera = function () { c.archivos = c.archivos.filter(function (x) { return x.id !== a.id; }); return g.guardarCola(cel, c); };
                if (j && j.ok === true) { res.subidos++; return fuera(); }
                if (j && RECHAZOS_FINALES.indexOf(j.motivo) >= 0) { res.rechazados.push({ tipo: a.tipo, motivo: j.motivo }); return fuera(); }
                throw { motivo: (j && j.motivo) || 'rechazo' };
              });
            });
          }, Promise.resolve());
        }).then(function () {
          return g.guardarCola(cel, null).then(function () { return res; });
        }, function (e) {
          var st = e && e.status, m = e && e.motivo;
          if (m === 'sin_autorizacion') {
            res.estado = 'retirada'; res.pendientes = 0;
            return g.guardarCola(cel, null).then(function () { return res; });
          }
          res.estado = st === 404 ? 'apagado'
            : (st === 401 || st === 403 || m === 'sin_sesion' || (e && e.sinSesion)) ? 'sesion'
            : m === 'freno' ? 'freno' : m === 'lleno' ? 'lleno' : 'sin_red';
          res.pendientes = c.archivos.length;
          return res;
        });
      });
    });
  }
  function resumenDe(n, r) { return n === r.total ? (n === 1 ? '1 archivo' : n + ' archivos') : n + ' de ' + r.total + ' archivos'; }
  /** Lo que la pantalla dice después de subir la cola: {clase, html} (html '' si no hay nada que decir). */
  function avisoDeLaCola(r) {
    if (!r || r.estado === 'nada') return { clase: '', html: '' };
    /* 13-nov-2026 (remate) — decía «cuando entres a tu cuenta en este
       teléfono», y solo es verdad si entra por ESTA página (play/: «Ir a mi
       cuenta» llama a subirLosExtractosYDecirlo). La app (app/socio.html)
       solo barre lo vencido de la cola; no la sube. Este aviso solo sale en
       play/, así que «desde esta página» es la página que la persona tiene
       delante. (La historia laboral dice lo mismo que decía esto: no se toca
       aquí.) */
    var otraVez = 'Lo volvemos a intentar cuando vuelvas a entrar a tu cuenta desde esta página, en este teléfono, hasta mañana';
    var quedan = otraVez + '. Si no, súbelos desde tu cuenta en la app.';
    if (r.estado === 'ok') {
      var tarde = r.noLlegaron || [], fuera = r.rechazados.concat(tarde);
      var malos = fuera.length
        ? ' No entró ' + (fuera.length === 1 ? 'un archivo' : fuera.length + ' archivos') + ': ' + esc(motivoEnPalabras(fuera[0].motivo)) : '';
      var donde = tarde.length ? ' ' + esc(TEXTOS.dondeFalte) : '';
      if (r.subidos) return { clase: 'verde', html: '<b>Tus extractos llegaron</b> (' + esc(resumenDe(r.subidos, r)) + ').' + malos + donde };
      if (r.rechazados.length) return { clase: 'ambar', html: '<b>Tus extractos no entraron.</b>' + malos + donde };
      return { clase: tarde.length ? 'ambar' : 'verde', html: '<b>Guardamos tu autorización de los extractos.</b> Cuando los tengas, súbelos desde tu cuenta en la app.' + malos };
    }
    /* Sin «súbelos desde tu cuenta»: con la base así, la tarjeta tampoco
       aparece. Se dice lo que de verdad pasa con lo que espera. */
    if (r.estado === 'apagado') return { clase: 'ambar', html: '<b>Tus extractos se quedaron en este teléfono:</b> esta parte todavía no está encendida en nuestro sistema. ' +
      otraVez + '; después se borran de este teléfono. Tu cuenta quedó igual.' };
    if (r.estado === 'freno') return { clase: 'ambar', html: '<b>Tus extractos no alcanzaron a subir</b> por demasiados intentos seguidos. ' + quedan };
    if (r.estado === 'lleno') return { clase: 'ambar', html: '<b>Tus extractos se quedaron en este teléfono:</b> ahora mismo no podemos recibir más extractos. Es opcional: tu cuenta sigue igual. ' + quedan };
    if (r.estado === 'retirada') return { clase: 'ambar', html: '<b>No subimos tus extractos:</b> tu autorización ya no está vigente. Los borramos de este teléfono.' };
    return { clase: 'ambar', html: '<b>Tus extractos no alcanzaron a subir.</b> ' + quedan };
  }
  /**
   * La línea del paso que sigue a «Lo hago después», según lo que ya escogió
   * (como pistaDespues de la historia laboral). `lo`: {aut, n, memoria}.
   */
  function pistaDespues(lo) {
    var x = lo || {}, n = Math.max(0, Math.floor(Number(x.n) || 0));
    if (!(x.aut && x.aut.version)) return '<b>Dejaste tus extractos para después.</b> ' + esc(TEXTOS.dondeDespues);
    var guardado = n ? TEXTOS.despuesConArchivos.replace('{n}', n === 1 ? '1 archivo' : n + ' archivos') : TEXTOS.despuesConAutorizacion;
    var hasta = n ? ' ' + esc(x.memoria ? TEXTOS.despuesEnMemoria : conMinutos(TEXTOS.despuesSeBorran)) : '';
    return '<b>' + esc(guardado) + '</b>' + hasta + ' ' + esc(TEXTOS.despuesQuitar) + ' ' + esc(TEXTOS.dondeFalte);
  }
  /** Para la app: {url, anon, token}. Rechaza con {status}. La de la historia laboral. */
  function llamarConToken(cfg, fn, cuerpo, fetchFn) {
    var h = H();
    if (!h) return Promise.reject({ status: 0 });
    return h.llamarConToken(cfg, fn, cuerpo, fetchFn);
  }

  /* ------------------------------------------------------------- la pantalla */
  var ESTILO = '.ex-que-se-pide{margin-top:var(--e3);padding:var(--e3);border:1px solid var(--linea);border-radius:14px}' +
    '.ex-que-se-pide p{margin:0 0 var(--e2);font-size:14px;line-height:1.5}' +
    '.ex-que-se-pide p:last-child{margin-bottom:0}' +
    '.ex-formas{display:grid;gap:8px;margin-top:var(--e3)}' +
    '.ex-forma{position:relative;margin:0;text-align:center;cursor:pointer}' +
    '.ex-archivo{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden}' +
    '.ex-pegar{margin-top:var(--e3);min-height:84px;padding:14px;border:2px dashed var(--linea);border-radius:14px;' +
      'color:var(--gris);font-size:14px;text-align:center;-webkit-user-select:text;user-select:text;outline:none}' +
    '.ex-pegar:focus{border-color:var(--azul-texto)}' +
    '.ex-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--linea);font-size:14px}' +
    '.ex-item .btn{width:auto;flex:none;padding:8px 12px}' +
    '.ex-despues{margin-top:var(--e3)}' +
    '.ex-que{display:flex;align-items:center;gap:10px;min-width:0}' +
    '.ex-que span{overflow-wrap:anywhere}' +
    '.ex-mini{width:44px;height:44px;flex:none;object-fit:cover;border:1px solid var(--linea);border-radius:8px;background:var(--papel)}' +
    '.ex-pegado{margin-top:var(--e3);padding:var(--e3);border:2px solid var(--azul-texto);border-radius:14px;background:var(--azul-tinte)}' +
    '.ex-vista{display:block;max-width:100%;max-height:320px;margin:var(--e2) auto 0;object-fit:contain;border:1px solid var(--linea);' +
      'border-radius:10px;background:var(--papel)}' +
    '.ex-pdf{margin-top:var(--e2);font-size:14px;font-weight:600;overflow-wrap:anywhere}';
  function ponerEstilo(d) {
    try {
      if (!d || !d.getElementById || d.getElementById('exEstilo')) return;
      var s = d.createElement('style'); s.id = 'exEstilo'; s.textContent = ESTILO;
      (d.head || d.documentElement).appendChild(s);
    } catch (e) {}
  }
  function fechaCorta(iso) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return t.getDate() + '-' + meses[t.getMonth()];
  }

  /** La casilla de la autorización, SIN marcar salvo que ya la haya dado. */
  function autorizacionHTML(marcada) {
    return '<label class="permiso"><input type="checkbox" id="exAut" data-ex="aut"' + (marcada ? ' checked' : '') + '><span>' +
      '<b>' + esc(TEXTOS.autorizacion) + '</b>' +
      '<span class="muted">' + esc(TEXTOS.autorizacionDetalle) + ' Versión del ' + esc(FECHA_EN_PALABRAS) + ' · ' +
      '<a href="../legal/privacidad.html#extractos" target="_blank" rel="noopener">qué dice la política</a>.</span></span></label>';
  }
  /* Qué se pide y cómo se baja, en palabras de todos los días, y que nunca se
     pide la clave: antes de la casilla, para que decida sabiendo. */
  function queSePideHTML() {
    return '<div class="ex-que-se-pide" id="exQueSePide"><p><b>' + esc(TEXTOS.queSePide) + '</b></p>' +
      '<p>' + esc(TEXTOS.comoSeBajan) + '</p><p><b>' + esc(TEXTOS.nuncaClave) + '</b></p></div>';
  }
  /* Ver «LA VUELTA DE LA CÁMARA» en la cabecera: solo en el registro (en la
     cuenta nada se borra por salir), y arriba de todo. */
  function antesDeIrteHTML(modo) {
    if (modo !== 'registro') return '';
    return '<div class="aviso ambar" id="exAntesDeIrte" role="note"><b>' + esc(conMinutos(TEXTOS.antesDeIrte)) + '</b> ' +
      esc(TEXTOS.antesDeIrteDetalle) + '</div>';
  }
  function formasHTML(vm) {
    return '<div class="grupo-tit">' + esc(TEXTOS.subelos) + '</div>' +
      '<div class="ayuda">' + esc(TEXTOS.ayudaFormas) + '</div>' +
      '<div class="ayuda" id="exDelBanco">' + esc(TEXTOS.delBanco) + ' ' + esc(TEXTOS.pdfConClave) + '</div>' +
      '<div class="ex-formas">' +
        '<label class="btn sec sm ex-forma" id="exBotonPdf">📄 Subir el PDF' +
          '<input type="file" class="ex-archivo" accept="application/pdf,.pdf" multiple data-ex="archivo"' + (vm.ocupado ? ' disabled' : '') + '></label>' +
        '<label class="btn sec sm ex-forma" id="exBotonImg">🖼️ Subir pantallazos' +
          '<input type="file" class="ex-archivo" accept="image/png,image/jpeg,image/webp" multiple data-ex="archivo"' + (vm.ocupado ? ' disabled' : '') + '></label>' +
        '<button type="button" class="btn sec sm" id="exBotonPegar" data-ex="pegar"' + (vm.ocupado ? ' disabled' : '') + '>📋 Pegar</button>' +
      '</div>' +
      '<div class="ex-pegar' + (vm.pegando ? '' : ' oculto') + '" id="exPegar" contenteditable="true" data-ex="zona" role="textbox" ' +
        'aria-label="' + esc(TEXTOS.zonaPegar) + '" inputmode="none">' + esc(TEXTOS.zonaPegar) + '</div>' +
      pegadoHTML(vm);
  }
  /* LO PEGADO, ANTES DE GUARDARLO: la imagen (o el nombre y el tamaño del PDF)
     y «¿Es tu extracto?». La imagen NO va en el texto del atributo: el <img>
     lleva solo su clave, y ponerVistas le asigna el src como propiedad. */
  function pegadoHTML(vm) {
    var p = vm.pegado;
    if (!p || !p.listos || !p.listos.length) return '';
    var cuenta = vm.modo !== 'registro', dis = vm.ocupado ? ' disabled' : '';
    return '<div class="ex-pegado" id="exPegado" role="group" aria-label="Lo que copiaste"><b>' + esc(TEXTOS.pegadoPregunta) + '</b>' +
      '<div class="ayuda">' + esc(cuenta ? TEXTOS.pegadoAyudaCuenta : TEXTOS.pegadoAyuda) + '</div>' +
      p.listos.map(function (a, i) {
        return a.tipo === 'pdf'
          ? '<div class="ex-pdf">📄 PDF' + (a.nombre ? ' · ' + esc(a.nombre) : '') + ' · ' + esc(tamanoEnPalabras(a.bytes)) + '</div>'
          : '<img class="ex-vista" data-ex-mini="pegado:' + i + '" alt="Lo que copiaste">';
      }).join('') +
      '<div class="ex-formas">' +
        '<button type="button" class="btn sm" id="exPegadoSi" data-ex="pegado-si"' + dis + '>' + (cuenta ? 'Sí, subirlo' : 'Sí, guardarlo') + '</button>' +
        '<button type="button" class="btn sec sm" id="exPegadoNo" data-ex="pegado-no"' + dis + '>No, no es este</button>' +
      '</div></div>';
  }
  function vistaDe(vm, a) {
    var x = (a && a.base64) ? a : (vm.vistas && a && vm.vistas[String(a.id)]) || null;
    return { imagen: !!(x && x.base64 && x.tipo !== 'pdf' && TIPO_MIME[x.tipo]), nombre: (x && x.nombre) || '', x: x };
  }
  function listaHTML(vm) {
    var l = vm.archivos || [];
    if (!l.length) return '';
    return '<div class="ex-lista" id="exLista" style="margin-top:var(--e3)">' + l.map(function (a) {
      var cuando = a.creado_en ? ' · subido el ' + fechaCorta(a.creado_en) : '';
      var v = vistaDe(vm, a);
      return '<div class="ex-item"><span class="ex-que">' +
        (v.imagen ? '<img class="ex-mini" data-ex-mini="lista:' + esc(a.id) + '" alt="">' : '') +
        '<span>' + (a.tipo === 'pdf' ? '📄 ' : '🖼️ ') + esc(nombreDeTipo(a.tipo)) + (v.nombre ? ' · ' + esc(v.nombre) : '') + ' · ' +
        esc(tamanoEnPalabras(a.bytes)) + esc(cuando) + '</span></span>' +
        '<button type="button" class="btn sec sm" data-ex="quitar" data-id="' + esc(a.id) + '"' + (vm.ocupado ? ' disabled' : '') + '>Quitar</button></div>';
    }).join('') + '</div>' +
    (vm.modo === 'registro' ? '<div class="ayuda">' + esc(vm.soloMemoria ? TEXTOS.soloMemoria : conMinutos(TEXTOS.quedanAqui)) + '</div>' : '');
  }
  function urlDeVista(vm, clave) {
    var k = String(clave || ''), i = k.indexOf(':'), que = k.slice(0, i), id = k.slice(i + 1), x = null;
    if (que === 'pegado') x = vm.pegado && vm.pegado.listos && vm.pegado.listos[Number(id)];
    else if (que === 'lista') {
      var a = (vm.archivos || []).filter(function (y) { return y && String(y.id) === id; })[0];
      x = a ? vistaDe(vm, a).x : null;
    }
    if (!x || !x.base64) return '';
    var t = tipoPorBytes(bytesDeBase64(String(x.base64).slice(0, 24)));
    if (!t || t === 'pdf' || t !== x.tipo) return '';
    return 'data:' + TIPO_MIME[t] + ';base64,' + x.base64;
  }
  function avisoHTML(vm) {
    return '<div class="aviso' + (vm.avisoClase ? ' ' + vm.avisoClase : '') + (vm.aviso ? '' : ' oculto') + '" id="exAviso" role="status">' +
      esc(vm.aviso || '') + '</div>';
  }

  /** Lo de adentro del paso (o de la tarjeta), según el estado. */
  function pantallaHTML(vm) {
    var conAut = !!vm.aut;
    var r = (vm.modo === 'registro'
        ? '<p class="sub">' + esc(TEXTOS.intro) + '</p>' + antesDeIrteHTML(vm.modo) +
          '<button type="button" class="btn sec sm ex-despues" id="exDespues" data-ex="despues"' + (vm.ocupado ? ' disabled' : '') + '>Lo hago después</button>'
        : '<p class="sub">' + esc(TEXTOS.introCuenta) + '</p>') +
      (vm.perdidos ? '<div class="aviso ambar" role="status">' + esc(TEXTOS.perdidos) + '</div>' : '') +
      queSePideHTML() +
      autorizacionHTML(conAut);
    if (!conAut) return r + avisoHTML(vm);
    return r + formasHTML(vm) + avisoHTML(vm) + listaHTML(vm);
  }

  /* ------------------------------------------------------ los toques, una vez */
  /**
   * El controlador común: pinta y escucha. `h` trae lo que cambia entre el
   * registro y la app: leer, autorizar, agregar, quitar, despues, enCamino.
   * Es el de la historia laboral sin el fondo; sus reglas, con su porqué allá:
   * nada entra sin el «Sí» de lo pegado y nada se pierde sin su «No»; sin
   * autorización, lo pegado no se queda; cada archivo con su tope de espera.
   */
  function controlar(caja, vm, h) {
    var d = caja.ownerDocument || (typeof document !== 'undefined' ? document : null);
    ponerEstilo(d);
    var HL = H();
    var msTope = Number(h.msTope) > 0 ? Number(h.msTope) : SEGUNDOS_TOPE * 1000;
    var ponerVistas = function () {
      if (!caja.querySelectorAll) return;
      Array.prototype.forEach.call(caja.querySelectorAll('img[data-ex-mini]') || [], function (im) {
        var u = urlDeVista(vm, im.getAttribute('data-ex-mini'));
        if (u) im.src = u;
      });
    };
    var pintar = function () {
      caja.innerHTML = pantallaHTML(vm);
      try { ponerVistas(); } catch (e) {}
      if (h.alPintar) { try { h.alPintar(); } catch (e) {} }
    };
    var decir = function (m, clase) { vm.aviso = m || ''; vm.avisoClase = clase || (m ? 'ambar' : ''); pintar(); };
    var trabajar = function (p) {
      vm.ocupado = true; pintar();
      var fin = function () { vm.ocupado = false; };
      var q = Promise.resolve(p).then(function (x) { fin(); return x; }, function (e) { fin(); throw e; });
      if (h.enCamino) { try { h.enCamino(q); } catch (e) {} }
      return q;
    };
    var prepararTodos = function (lista) {
      var listos = [], malos = [];
      return lista.reduce(function (p, b) {
        return p.then(function () {
          return conTope(prepararArchivo(b), msTope, { ok: false, motivo: 'tardo' })
            .then(function (r) { if (r.ok) listos.push(r.archivo); else malos.push(r.motivo); });
        });
      }, Promise.resolve()).then(function () { return { listos: listos, malos: malos }; });
    };
    var guardarTodos = function (listos, malos) {
      var m = (malos || []).slice();
      return listos.reduce(function (p, a) {
        return p.then(function () {
          return Promise.resolve(h.agregar(a)).then(function (x) { if (!x || x.ok !== true) m.push((x && x.motivo) || 'rechazo'); });
        });
      }, Promise.resolve()).then(function () { return h.leer(); }).then(function () { return m; });
    };
    var decirMalos = function (malos) {
      var m = malos || [];
      if (m.indexOf('sin_autorizacion') >= 0) {
        if (vm.modo === 'registro') decir(motivoEnPalabras('desautorizado'), 'info');
        else decir(motivoEnPalabras('sin_autorizacion'));
        return;
      }
      if (m.length) decir(motivoEnPalabras(m[0]) + (m.length > 1 ? ' (y ' + (m.length - 1) + ' más)' : ''));
      else decir('');
    };
    var agregarTodos = function (blobs) {
      var lista = Array.prototype.slice.call(blobs || []);
      if (!lista.length) return Promise.resolve();
      vm.aviso = lista.length > 1 ? 'Preparando tus ' + lista.length + ' archivos…' : 'Preparando tu archivo…'; vm.avisoClase = '';
      return trabajar(prepararTodos(lista).then(function (r) { return guardarTodos(r.listos, r.malos); }))
        .then(decirMalos, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
    };
    var mostrarPegado = function (blobs) {
      var lista = Array.prototype.slice.call(blobs || []);
      if (!lista.length || !vm.aut) return Promise.resolve();
      vm.pegando = false; vm.pegado = null;
      vm.aviso = 'Mirando lo que copiaste…'; vm.avisoClase = 'info';
      vm.mirandoPegado = true;
      return trabajar(prepararTodos(lista)).then(function (r) {
        vm.mirandoPegado = false;
        if (!vm.aut) { pintar(); return; }
        if (!r.listos.length) { decirMalos(r.malos.length ? r.malos : ['pegar_vacio']); return; }
        vm.pegado = r;
        decir('');
      }, function () { vm.mirandoPegado = false; if (!vm.aut) { pintar(); return; } decir(motivoEnPalabras('lectura')); });
    };
    caja.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-ex]') : null;
      if (!t || !caja.contains(t)) return;
      var que = t.getAttribute('data-ex');
      if (que === 'despues') { if (!vm.ocupado && h.despues) h.despues(); return; }
      if (que === 'quitar') {
        var id = t.getAttribute('data-id');
        trabajar(Promise.resolve(h.quitar(id)).then(function () { return h.leer(); }))
          .then(function () { decir(''); }, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'pegar') {
        vm.pegado = null;
        vm.mirandoPegado = true;
        decir('Mirando lo que copiaste…', 'info');
        conTope(HL ? HL.leerPortapapeles() : Promise.resolve({ ok: false, blobs: [], motivo: 'pegar_sin_api' }),
                msTope, { ok: false, blobs: [], motivo: 'pegar_negado' }).then(function (r) {
          if (!vm.aut) { vm.mirandoPegado = false; return; }
          if (r.ok && r.blobs.length) return mostrarPegado(r.blobs);
          vm.mirandoPegado = false;
          vm.pegando = true;
          decir(motivoEnPalabras(r.motivo));
        });
        return;
      }
      if (que === 'pegado-si') {
        var p = vm.pegado; vm.pegado = null;
        if (!p || !p.listos || !p.listos.length) { decir(''); return; }
        vm.aviso = p.listos.length > 1 ? 'Guardando tus ' + p.listos.length + ' archivos…' : 'Guardando tu archivo…'; vm.avisoClase = '';
        trabajar(guardarTodos(p.listos, p.malos))
          .then(decirMalos, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'pegado-no') { vm.pegado = null; decir(TEXTOS.pegadoNo, 'info'); }
    });
    caja.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var que = t.getAttribute('data-ex');
      if (que === 'aut') {
        var si = !!t.checked;
        if (!si) vm.pegado = null;   // sin autorización no queda nada pegado esperando
        Promise.resolve(h.autorizar(si)).then(function (r) {
          if (r && r.ok === false) { decir(motivoEnPalabras(r.motivo)); return; }
          return Promise.resolve(h.leer()).then(function () { decir(''); });
        }, function (e) { decir(motivoEnPalabras((e && e.motivo) || 'sin_red')); });
        return;
      }
      if (que === 'archivo') {
        var fs = Array.prototype.slice.call(t.files || []);
        try { t.value = ''; } catch (e) {}
        if (fs.length) agregarTodos(fs);
      }
    });
    caja.addEventListener('paste', function (ev) {
      var t = ev.target;
      if (!t || !t.closest || !t.closest('[data-ex="zona"]')) return;
      var r = HL ? HL.blobsDePegar(ev) : { blobs: [], texto: false };
      try { ev.preventDefault(); } catch (e) {}
      if (r.blobs.length) mostrarPegado(r.blobs);
      else decir(motivoEnPalabras(r.texto ? 'pegar_texto' : 'pegar_vacio'));
    });
    caja.addEventListener('input', function (ev) {
      var z = ev.target && ev.target.closest ? ev.target.closest('[data-ex="zona"]') : null;
      if (!z) return;
      var img = z.querySelector && z.querySelector('img');
      var src = img && img.getAttribute('src');
      z.textContent = TEXTOS.zonaPegar;
      if (!src) return;
      var pedido = /^data:image\/(png|jpeg|webp);base64,/i.test(src)
        ? Promise.resolve(new Blob([bytesDeBase64(src)]))
        : (/^blob:/i.test(src) && typeof fetch === 'function') ? fetch(src).then(function (r) { return r.blob(); }) : null;
      if (!pedido) return decir(motivoEnPalabras('pegar_vacio'));
      pedido.then(function (b) { return mostrarPegado([b]); }, function () { decir(motivoEnPalabras('pegar_vacio')); });
    });
    return { pintar: pintar, decir: decir, decirMalos: decirMalos, vm: vm };
  }

  /* ------------------------------------------------- el paso del registro */
  /**
   * El paso «Tus extractos». `o`: {guardadero, intento, celular, despues(),
   * ahora(), perdidos, msTope}. Todo lo escogido se guarda en el teléfono en
   * el momento (la pestaña se puede cerrar al irse al banco).
   */
  function pasoDelRegistro(caja, o) {
    var g = o.guardadero, intento = String(o.intento || ''), cel = String(o.celular || '');
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var e = g.estado(intento, cel);
    var vm = { modo: 'registro', aut: e.aut, archivos: [], aviso: '', avisoClase: '', pegando: false, pegado: null,
               ocupado: false, soloMemoria: false, perdidos: !!o.perdidos };
    var guardar = function () {
      var x = g.estado(intento, cel);
      x.aut = vm.aut; x.despues = !!e.despues;
      g.guardarEstado(x); e = x;
    };
    var h = {
      msTope: o.msTope,
      leer: function () {
        return g.archivos(intento, cel).then(function (r) {
          vm.archivos = r.lista; if (r.perdidos) vm.perdidos = true;
          return g.soloEnMemoria().then(function (m) { vm.soloMemoria = m; });
        });
      },
      autorizar: function (si) {
        vm.aut = si ? armarAutorizacion(new Date(ahora()).toISOString()) : null;
        guardar();
        return si ? null : g.soltarArchivos();
      },
      agregar: function (a) { return vm.aut ? g.agregar(intento, cel, a) : { ok: false, motivo: 'sin_autorizacion' }; },
      quitar: function (id) { return g.quitar(intento, cel, id); },
      despues: function () {
        if (ctl && ctl.puedeSeguir && !ctl.puedeSeguir()) return;
        e.despues = true; guardar(); if (o.despues) o.despues();
      },
      enCamino: function (q) { if (g.enCamino) g.enCamino(q); }
    };
    var ctl = controlar(caja, vm, h);
    if (g.enCamino && g.enCamino()) {
      vm.ocupado = true; vm.aviso = TEXTOS.terminando; vm.avisoClase = 'info';
      g.alTerminar(function (malos) {
        vm.ocupado = false; vm.aviso = ''; vm.avisoClase = '';
        var decirlo = function () { ctl.decirMalos(malos || []); };
        h.leer().then(decirlo, decirlo);
      });
    }
    /* ¿Se puede seguir? No con lo pegado esperando su «¿Es tu extracto?», ni
       mientras se mira; sin autorización, nada frena. La página lo pregunta
       antes de pasar de paso (siguientePaso, en play/). */
    ctl.puedeSeguir = function () {
      if (!vm.aut) return true;
      if (vm.mirandoPegado) { ctl.decir(TEXTOS.mirandoPegado, 'info'); return false; }
      if (!(vm.pegado && vm.pegado.listos && vm.pegado.listos.length)) return true;
      ctl.decir(TEXTOS.pegadoPendiente, 'ambar');
      try {
        var d = caja.ownerDocument || (typeof document !== 'undefined' ? document : null);
        var p = d && d.getElementById ? d.getElementById('exPegado') : null;
        if (p && p.scrollIntoView) p.scrollIntoView({ block: 'center' });
      } catch (x) {}
      return false;
    };
    ctl.pintar();
    h.leer().then(ctl.pintar, ctl.pintar);
    return ctl;
  }

  /* --------------------------------------------- la tarjeta de la cuenta */
  /**
   * «Sube tus extractos» en la cuenta: el «Lo hago después» de verdad.
   * `o`: {credenciales() → Promise<{url, anon, token}>, fetch, escritura(p),
   * ahora(), confirmar(texto), subida(), ocupacion() (lo que la página sabe
   * de su registro, por si la base no lo dice), guardadero, celular(),
   * alApagado(), alRetirar(), abierta}.
   * A QUIÉN SE LE MUESTRA: a quien no es empleado (seOfrece, con la ocupación
   * que devuelve extracto_mia, la de SU registro, o la que da la página), y
   * a cualquiera que ya haya dado algo (aunque hoy diga «Empleado»: lo suyo
   * lo puede ver y quitar siempre). Mientras no se sabe, no se pinta nada:
   * a un empleado no se le asoma una tarjeta que no es para él.
   * Si la base todavía no tiene las funciones (404), no aparece.
   */
  function tarjetaDeCuenta(caja, o) {
    o = o || {};
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var escritura = typeof o.escritura === 'function' ? o.escritura : function (p) { return p; };
    var vm = { modo: 'cuenta', aut: null, archivos: [], aviso: '', avisoClase: '', pegando: false, pegado: null, vistas: {},
               ocupado: false, abierta: !!o.abierta, cargando: true, subiendo: null, ocupacion: '' };
    var llamar = function (fn, cuerpo, escribe) {
      var p = Promise.resolve(o.credenciales ? o.credenciales() : null).then(function (cfg) {
        return llamarConToken(cfg, fn, cuerpo, o.fetch);
      });
      return escribe ? escritura(p) : p;
    };
    var deError = function (e) {
      var st = e && e.status;
      return { ok: false, motivo: st === 404 ? 'apagado' : (st === 401 || st === 403 || (e && e.sinSesion)) ? 'sesion' : 'sin_red' };
    };
    var porId = function (id) {
      var d = caja.ownerDocument || (typeof document !== 'undefined' ? document : null);
      var x = d && d.getElementById ? d.getElementById(id) : null;
      if (x && typeof caja.contains === 'function' && !caja.contains(x)) x = null;
      if (!x && caja.querySelector) { try { x = caja.querySelector('#' + id); } catch (e) { x = null; } }
      return x;
    };
    var ocupacionDeLaPagina = function () { try { return typeof o.ocupacion === 'function' ? o.ocupacion() : (o.ocupacion || ''); } catch (e) { return ''; } };
    /** ¿Se le muestra? (ver la cabecera de la función). */
    var seMuestra = function () {
      if (vm.apagado) return false;
      if (vm.subiendo) return true;
      if (vm.aut || vm.archivos.length) return true;
      return seOfrece(vm.ocupacion || ocupacionDeLaPagina());
    };
    var linea = function () {
      var n = vm.archivos.length;
      return vm.subiendo ? (vm.subiendo.subio ? 'Mirando lo que tienes guardado…' : TEXTOS.subiendoRegistro)
        : n ? 'Ya nos diste ' + resumen(vm.archivos) + '.' : (vm.aut ? 'Ya nos diste tu autorización. Faltan tus extractos.' : 'Todavía no nos los das.');
    };
    var cuerpoCaja = null, ctl = null;
    var pintarTarjeta = function () {
      if (vm.cargando && !vm.subiendo) { caja.innerHTML = ''; return; }
      if (!seMuestra()) { caja.innerHTML = ''; return; }
      var n = vm.archivos.length;
      caja.innerHTML = '<div class="card" id="exTarjeta"><h3 class="tit">📄 ' + (n ? 'Tus extractos' : 'Sube tus extractos') +
        ' <span class="muted" style="font-weight:400">· opcional</span></h3>' +
        '<p class="sub" id="exLinea">' + esc(linea()) + '</p>' +
        (vm.subiendo ? '' : vm.abierta ? '<div id="exCuerpo"></div>' +
          '<button type="button" class="btn sec sm' + (vm.aut ? '' : ' oculto') + '" style="margin-top:var(--e4)" id="exRetirar">' +
            'Retirar mi autorización y borrar mis extractos</button>'
          : '<button type="button" class="btn sec sm" style="margin-top:var(--e3)" id="exAbrir">' + (n ? 'Ver o cambiar' : 'Subirlos') + '</button>') +
        '</div>';
      var b = porId('exAbrir');
      if (b) b.addEventListener('click', function () { vm.abierta = true; pintarTarjeta(); });
      var r = porId('exRetirar');
      if (r) r.addEventListener('click', retirar);
      cuerpoCaja = vm.subiendo ? null : porId('exCuerpo');
      if (cuerpoCaja) { ctl = controlar(cuerpoCaja, vm, h); ctl.pintar(); }
    };
    /* LO QUE DICE LA BASE SE TOMA EN EL ORDEN EN QUE SE PREGUNTÓ (como en la
       historia laboral): una respuesta más vieja que la última ya tomada no
       cambia nada. */
    var pedidas = 0, tomada = 0;
    var leer = function () {
      var esta = ++pedidas;
      return llamar('extracto_mia', {}).then(function (j) {
        if (esta < tomada) return;
        tomada = esta;
        vm.cargando = false;
        if (!j || j.ok !== true) throw { motivo: (j && j.motivo) || 'sin_red' };
        var a = j.autorizacion;
        vm.aut = (a && !a.revocada_en) ? a : null;
        vm.archivos = j.archivos || [];
        vm.ocupacion = j.ocupacion || '';
      }, function (e) {
        if (esta < tomada) return;
        tomada = esta;
        vm.cargando = false; var m = deError(e).motivo; if (m === 'apagado') vm.apagado = true; throw { motivo: m };
      });
    };
    /* La casilla: esto SÍ es firmar, con la versión del texto que se ve. */
    var autorizar = function () {
      return llamar('extracto_autorizar', { p_version: VERSION_AUTORIZACION, p_momento: new Date(ahora()).toISOString() }, true)
        .then(function (j) { return (j && j.ok === true) ? { ok: true } : { ok: false, motivo: (j && j.motivo) || 'sin_red' }; }, deError);
    };
    /* Retirar también borra lo de esta cuenta que esperaba en ESTE teléfono
       (la cola del registro que no alcanzó a subir). */
    var soltarLaCola = function () {
      var cel = typeof o.celular === 'function' ? o.celular() : o.celular;
      var p = (o.guardadero && cel) ? Promise.resolve(o.guardadero.guardarCola(String(cel), null)).then(null, function () {}) : Promise.resolve();
      return p.then(function () { if (o.alRetirar) { try { o.alRetirar(); } catch (e) {} } });
    };
    var retirar = function () {
      var preguntar = o.confirmar || function (t) { return typeof confirm === 'function' ? confirm(t) : true; };
      if (!preguntar('Vamos a borrar tus extractos y a quitar tu autorización. ¿Seguimos?')) return;
      /* 13-nov-2026 (remate) — la respuesta se MIRA. Antes, un {ok:false}
         (la sesión vencida: 'sin_sesion') seguía como si hubiera salido:
         soltaba la cola de este teléfono sin que la base hubiera borrado
         nada, y el aviso decía «No hay conexión», porque deError de un error
         sin status siempre da sin_red y se miraba antes que e.motivo. */
      llamar('extracto_retirar', {}, true).then(function (j) {
        if (!(j && j.ok === true)) throw { motivo: (j && j.motivo) || 'sin_red' };
        vm.vistas = {}; vm.pegado = null; return soltarLaCola();
      })
        .then(function () { return leer(); })
        .then(function () { vm.aviso = 'Listo: borramos tus extractos y quitamos tu autorización.'; vm.avisoClase = 'verde'; pintarTarjeta(); },
              function (e) { vm.aviso = motivoEnPalabras((e && e.motivo) || deError(e).motivo); vm.avisoClase = 'ambar'; pintarTarjeta(); });
    };
    var h = {
      leer: function () { return leer().then(function () { pintarLinea(); }); },
      autorizar: function (si) {
        if (si) return autorizar();
        /* Desmarcar en la cuenta es retirar: se pregunta, porque borra. */
        retirar();
        return { ok: true };
      },
      agregar: function (a) {
        return llamar('extracto_subir', { p_archivo: a.base64 }, true)
          .then(function (j) {
            if (!(j && j.ok === true)) return { ok: false, motivo: (j && j.motivo) || 'rechazo' };
            if (j.id != null) vm.vistas[String(j.id)] = { tipo: a.tipo, base64: a.tipo === 'pdf' ? '' : a.base64, nombre: a.nombre || '' };
            return { ok: true };
          }, deError);
      },
      quitar: function (id) { return llamar('extracto_quitar', { p_id: Number(id) }, true); },
      alPintar: function () { pintarLinea(); }
    };
    var pintarLinea = function () {
      var l = porId('exLinea');
      if (l) l.textContent = linea();
      var r = porId('exRetirar');
      if (r) r.classList[vm.aut ? 'remove' : 'add']('oculto');
    };
    var fallo = function () {
      if (vm.apagado) { caja.innerHTML = ''; if (o.alApagado) o.alApagado(); return; }
      if (vm.subiendo) return;
      /* Si no se sabe si es para él, no se pinta una tarjeta de error que no
         le toca: solo a quien la página sabe que no es empleado. */
      if (!seOfrece(ocupacionDeLaPagina())) { caja.innerHTML = ''; return; }
      vm.aviso = 'No pude mirar tus extractos. Revisa tu internet y vuelve a abrir esta pantalla.'; vm.avisoClase = 'ambar';
      caja.innerHTML = '<div class="card"><h3 class="tit">📄 Tus extractos</h3><div class="aviso ambar" role="status">' + esc(vm.aviso) + '</div></div>';
    };
    /* MIENTRAS SUBE LO DEL REGISTRO, LA TARJETA NO OFRECE NADA (como en la
       historia laboral): dice que está guardando y, al terminar, se mira sola
       en la base. */
    var esperar = function (p) {
      if (!p || typeof p.then !== 'function' || vm.apagado) return;
      var esta = { subio: false };
      vm.subiendo = esta;
      pintarTarjeta();
      var fin = function () {
        if (vm.subiendo !== esta) return;
        esta.subio = true; pintarTarjeta();
        var listo = function () { if (vm.subiendo === esta) vm.subiendo = null; };
        leer().then(function () { listo(); if (!vm.subiendo) pintarTarjeta(); },
                    function () { listo(); if (!vm.subiendo) fallo(); });
      };
      p.then(fin, fin);
    };
    ponerEstilo(caja.ownerDocument || (typeof document !== 'undefined' ? document : null));
    var enCurso = null;
    try { enCurso = typeof o.subida === 'function' ? o.subida() : null; } catch (e) { enCurso = null; }
    if (enCurso && typeof enCurso.then === 'function') esperar(enCurso);
    else pintarTarjeta();
    leer().then(pintarTarjeta, fallo);
    return { vm: vm, esperar: esperar, seMuestra: seMuestra,
             recargar: function () { return vm.subiendo ? Promise.resolve() : leer().then(pintarTarjeta); } };
  }

  return {
    VERSION: '2026-11-13',
    VERSION_AUTORIZACION: VERSION_AUTORIZACION,
    FECHA_EN_PALABRAS: FECHA_EN_PALABRAS,
    LIMITES: LIMITES,
    HORAS_ARCHIVOS: HORAS_ARCHIVOS,
    SEGUNDOS_TOPE: SEGUNDOS_TOPE,
    DIAS_ESTADO: DIAS_ESTADO,
    LLAVE_ESTADO: LLAVE_ESTADO,
    BASE_DE_DATOS: BASE_DE_DATOS,
    TEXTOS: TEXTOS,
    MOTIVOS: MOTIVOS,
    disponible: disponible,
    seOfrece: seOfrece,
    minutosFuera: minutosFuera,
    motivoEnPalabras: motivoEnPalabras,
    tamanoEnPalabras: tamanoEnPalabras,
    resumen: resumen,
    revisarNuevo: revisarNuevo,
    armarAutorizacion: armarAutorizacion,
    prepararArchivo: prepararArchivo,
    guardadero: guardadero,
    subirCola: subirCola,
    avisoDeLaCola: avisoDeLaCola,
    pistaDespues: pistaDespues,
    llamarConToken: llamarConToken,
    autorizacionHTML: autorizacionHTML,
    pantallaHTML: pantallaHTML,
    pasoDelRegistro: pasoDelRegistro,
    tarjetaDeCuenta: tarjetaDeCuenta
  };
});
