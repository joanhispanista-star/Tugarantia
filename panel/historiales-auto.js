/* ===========================================================================
 * HISTORIALES-AUTO — lo que ven tus clientes sube solo.
 * 7 de octubre de 2026.
 *
 * Joan, el 7-oct: «quiero que el punto 1 sea automático, no manual». El punto 1
 * era «☁ Subir historiales» (Ajustes → 📲 Compartir con mis clientes): el
 * paquete que cada cliente ve en app/socio.html (su garantía, su cupo, sus
 * créditos, lo que debe hoy) solo llegaba a la nube cuando Joan se acordaba de
 * ir a Ajustes y tocarlo. Un cobro anotado a las 9 seguía saliendo como deuda
 * en el celular del cliente hasta ese día. Con 28 clientes y la marca de
 * «revisado» sin usar en ninguno, el botón no protegía nada: solo atrasaba.
 *
 * La cartera de Joan ya subía sola desde el 1-oct (panel/nube-crm.js). Esto
 * es lo mismo para el OTRO paquete, el de los clientes, y copia sus reglas de
 * tiempo y de honestidad:
 *
 * CUÁNDO SUBE
 *   · al entrar (5 s después del PIN), una vez;
 *   · tras 90 s SIN CAMBIOS después de cada guardar() —una operación larga
 *     guarda varias veces y el reloj se reinicia: sube cuando terminó—; también
 *     cuando OTRA página reemplaza la cartera (traer.html, subir.html, otra
 *     pestaña): el aviso `storage` arma el mismo reloj;
 *   · al volver la señal, y cada 30 min (por si cambió el día: la mora del
 *     paquete se cuenta hasta hoy);
 *   · cuando Joan toca la línea de estado o el botón de siempre.
 *   Nunca debajo de Joan: si estoyOcupado() (un modal, un campo con el cursor,
 *   Ajustes o Plantillas abiertos) espera 15 s y vuelve a mirar. Nunca antes
 *   del PIN (crm.html llama a configurar() dentro de entrar()) y nunca en modo
 *   equipo (modoEquipo() lo apaga, y además cada vuelta lo pregunta).
 *
 * QUÉ SUBE: SOLO LOS CLIENTES CUYO PAQUETE CAMBIÓ
 *   Por cada cliente se guarda la HUELLA del último paquete que la nube
 *   CONFIRMÓ (llave joan_crm_historiales, ~60 caracteres por cliente) y la
 *   llave con que vive en la nube. Se escribe solo cuando sincronizar_socios
 *   contestó bien —y aceptó a TODOS los del pedazo—: si la respuesta no llega,
 *   el cliente sigue pendiente y sale en la vuelta siguiente.
 *
 *   LAS CIFRAS DEL GRUPO VAN APARTE. Cada paquete lleva `comunidad` (cuántos
 *   socios, cuánto se ha prestado, la puntualidad del grupo: puente.js), que
 *   es la MISMA para todos y cambia con el pago de cualquiera. Si contaran
 *   como cambio, cada pago subiría a toda la cartera —con 300 clientes, 300
 *   paquetes por cada cobro—. Así que la huella del cliente NO las mira: sube
 *   lo suyo en cuanto cambia (y lleva las cifras del grupo de ese momento), y
 *   a los demás se les refrescan las del grupo como mucho cada 6 horas. La
 *   línea de estado lo dice cuando hay alguna por refrescar.
 *
 * 7-oct-2026 (segunda vuelta) — LO QUE ENCONTRÓ LA REVISIÓN. Dos revisiones
 * adversarias probaron esto contra un sincronizar_socios que sí muda mensajes
 * y vinculaciones, y encontraron lo que sigue. Las pruebas de cada punto están
 * en pruebas/historiales-auto-revision.test.js, y todas fallaban antes.
 *
 * LA PRIMERA VEZ EN UN COMPUTADOR ES DEL BOTÓN
 *   La cartera vive por ORIGEN: cada puerto, cada https, cada navegador tiene
 *   la suya, y hay orígenes con carteras de agosto (localhost:8899, un file://
 *   viejo) que guardan la conexión a la nube. Abrir uno de esos marcadores y
 *   poner el PIN subía, sin preguntar, deudas que ya se pagaron y códigos que
 *   Joan ya había cambiado. nube-crm.js no sube nada hasta que Joan dice «sí»
 *   una vez (emparejar); esto tampoco: la subida sola arranca en un computador
 *   solo DESPUÉS de que Joan toque «☁ Subir historiales» ahí una vez (el botón
 *   pregunta). Importar un respaldo la vuelve a pausar hasta el botón
 *   (carteraReemplazada): un respaldo es, casi siempre, una cartera vieja.
 *   La línea lo dice con UNA acción: «toca ☁ Subir historiales una vez».
 *
 * DOS FICHAS, UNA FILA: NO SUBEN
 *   sincronizar_socios identifica a cada cliente por su cédula o, si no tiene,
 *   por su celular. Cuando un cliente CON cédula sube, la nube borra la fila
 *   que tenga su celular por llave y se queda con sus mensajes, su código y su
 *   vinculación (base/20260914b_tres_canales.sql §5-bis: está hecho para el
 *   cliente que estrena cédula). Con la pareja que comparte línea —Ana con
 *   cédula, Beto sin cédula, el mismo WhatsApp— subir a Ana borraba a Beto,
 *   le daba a Ana el chat de Beto y dejaba la sesión del teléfono de Beto
 *   viendo la ficha de Ana. Con el botón también pasaba; subiendo uno por uno,
 *   peor, porque Beto no volvía. Y dos fichas con la misma cédula (cliente
 *   antiguo y ficha nueva) se turnaban el código según cuál cambió último.
 *   Por eso, si dos fichas de la cartera caerían en la misma fila, o el
 *   celular de una es la llave de otra, NINGUNA de las dos sube —ni sola ni
 *   con el botón— y la línea las nombra con el arreglo: ponerle la cédula a
 *   quien no la tiene, juntar las repetidas o corregir el número. Cuando una
 *   ficha estrena cédula, va PRIMERO en la subida (para que mude su fila antes
 *   de que otra con ese celular la reclame), y la que tiene ese celular espera
 *   si la que lo ocupaba no viaja. La causa de fondo está en el SQL (rescata
 *   lo de la fila del celular sin mirar de quién es): eso es otra migración.
 *
 * LO QUE NO QUEDÓ GUARDADO NO SUBE
 *   Con el navegador lleno guardar() avisa «NO SE PUDO GUARDAR» y la cartera en
 *   memoria queda por delante del disco. Subir eso le mostraba al cliente un
 *   pago que desaparecía al recargar. Mientras crm.html diga que el último
 *   guardado no entró (cfg.sinGuardar), no sube.
 *
 * LO QUE ESTO NO HACE NUNCA
 *   · NO CAMBIA EL CÓDIGO DE NADIE. La subida automática manda siempre
 *     codigo_forzar:false, y el código del cliente solo si es el MISMO que ya
 *     confirmó la nube desde este computador o si nunca le había subido uno
 *     (llenar un hueco, no cambiar una llave: es lo que hizo siempre el botón).
 *     Un código REGENERADO (codigoForzar) o distinto del último que subió (un
 *     respaldo viejo importado, otra cartera traída) viaja como null —la nube
 *     conserva el que tiene, ver el `coalesce` de sincronizar_socios en
 *     base/20260914b_tres_canales.sql— y la línea de estado dice «1 código
 *     nuevo espera ☁ Subir historiales». Cambiar una llave que el cliente ya
 *     tiene lo deja afuera: eso lo decide Joan con el botón, que es lo que el
 *     aviso de «Cambiar código» le promete («en cuanto vuelvas a subir»).
 *     Tampoco genera códigos: no llama a nada que los cree.
 *   · NO PREGUNTA NI GRITA: ni confirm() ni alert(). Lo que falla lo dice la
 *     línea de estado, con UNA acción. Un aviso que salta solo cada 90 s se
 *     aprende a cerrar sin leer.
 *   · NO DICE «TODO BIEN» SI ALGO FALTA: la línea nunca dice que tus clientes
 *     ven lo último si quedó algo sin subir o la última subida falló. Y no
 *     dice «sin internet» si hay internet y lo que no se alcanza es la nube
 *     (una URL mal escrita, un proyecto pausado).
 *   · NO ESCRIBE 'joan_socios_v1' (escribirTexto() lanza si alguien lo intenta)
 *     ni toca el sello de la cartera (salvo cuando Joan toca la línea de «otra
 *     pestaña»: ahí lo pide con retomarSello, que es de crm.html).
 *   · NO BORRA nada de la nube: sincronizar_socios solo inserta o actualiza.
 *     Por eso la ficha que Joan borra sigue publicada, y la línea lo cuenta.
 *
 * LA CLAVE EQUIVOCADA NO SE REINTENTA CADA 90 s. clave_ok (base/supabase.sql
 * y base/20261002d) frena la fuerza bruta con un tope GLOBAL de 10 intentos
 * fallidos cada 15 minutos, y no distingue a Joan de un atacante: un CRM con
 * la clave vieja probando tras cada guardar() se comería ese tope y dejaría
 * sin nube a revision.html y a los Registrados. Tras un «clave incorrecta» la
 * subida automática espera 15 min (un casillero del freno) antes de probar
 * otra vez sola. Tocar la línea lleva a Ajustes SIN gastar un intento; prueban
 * ya «Guardar conexión», «🔌 Probar conexión» y el botón.
 *
 * UNA SOLA PESTAÑA SUBE. Si otra página escribió la cartera y esta pestaña no
 * la ha recargado, su DB en memoria es vieja: subirla pisaría el paquete bueno
 * del cliente con uno atrasado. Entonces no sube y lo dice (sello-roto). Si el
 * texto del disco SÍ es el de esta pestaña, lo que sube es lo bueno; solo
 * queda no mandar lo mismo desde dos pestañas: sube la que tiene el sello, o
 * —si esa no late en joan_crm_historiales_dueno, por ejemplo porque corre un
 * crm.html de antes de esta pieza— la que sí late. Antes se miraba el latido
 * de nube-crm.js, y una pestaña vieja con nube-crm dejaba a todos sin subir.
 *
 * MEDIDO (node 22, banco de pruebas con crm.html de verdad):
 *   · el lote de 300 socios y 900 créditos tardaba 1.967 ms, y 1.713 eran
 *     fotoComunidad recalculada por cada socio. Con las cifras del grupo
 *     calculadas una vez por lote (migrarSocio, 4º parámetro, 7-oct): 38 ms el
 *     lote; la vuelta entera sin cambios (lote + plan + huellas), ~160 ms.
 *   · 300 clientes la primera vez: 12 llamadas de 25. Después, un cobro es
 *     UNA llamada con UN cliente.
 * Las pruebas: pruebas/historiales-auto.test.js y
 * pruebas/historiales-auto-revision.test.js.
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = { crear: fabrica }; return; }
  if (!raiz) return;
  /* Si esto revienta al cargar, el botón manual sigue donde estaba y la
     comprobación de crm.html (1,5 s después) dice que no cargó. */
  try { raiz.HistorialesAuto = fabrica({}); } catch (e) { /* el botón sigue */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (entorno) {
  'use strict';

  var VERSION = '2026-10-07b';
  var E = entorno || {};
  var G = (typeof globalThis !== 'undefined') ? globalThis : {};

  /* =========================================================================
   * CONSTANTES
   * =======================================================================*/
  /* Esta llave NO se escribe nunca desde acá: está para que escribirTexto()
     pueda negarse con nombre propio. */
  var LLAVE_CARTERA = 'joan_socios_v1';
  var LLAVE_SELLO = 'joan_crm_sello';
  var LLAVE_ESTADO = 'joan_crm_historiales';
  /* El latido de la pestaña que sube historiales. Propio, NO el de nube-crm.js
     (joan_crm_sync_dueno): ver UNA SOLA PESTAÑA SUBE, arriba. */
  var LLAVE_DUENO_HIST = 'joan_crm_historiales_dueno';

  var QUIETUD_MS = 90000;
  var PRIMERA_MS = 5000;
  var OCUPADO_MS = 15000;
  /* Sin red o con la nube caída: se vuelve a probar sola. Un wifi que falla
     con el navegador creyéndose en línea no dispara `online` (lección de
     nube-crm.js del 1-oct), así que no basta con esperar ese aviso. */
  var REINTENTO_MS = 3 * 60000;
  /* Un casillero del freno de clave_ok. Ver LA CLAVE EQUIVOCADA, arriba. */
  var REINTENTO_CLAVE_MS = 15 * 60000;
  var GRUPO_MS = 6 * 3600000;
  var REVISION_MS = 30 * 60000;
  var RELOJ_MS = 30000;
  /* Una llamada que no contesta en 40 s se corta y se cuenta como error. Sin
     esto, una conexión colgada dejaba la línea en «Subiendo… unos segundos»
     para siempre y el botón esperándola. 40 y no 30: no comparte número con
     el reloj de la línea (RELOJ_MS), y un pedazo de 25 tarda ~1 s. */
  var LIMITE_MS = 40000;
  /* Igual que nube-crm.js: Chrome corre los relojes de una pestaña de fondo
     una vez por minuto, así que el latido de la otra pestaña tarda en llegar. */
  var VIVA_MS = 150000;
  /* 25 clientes por llamada (~60 KB). El botón de siempre mandaba la cartera
     entera de una: con 28 clientes daba igual, con 300 serían ~750 KB en una
     sola transacción contra el statement_timeout del rol anon. Cada pedazo
     confirmado se anota antes de mandar el siguiente: un corte a mitad deja
     subido lo que subió y pendiente lo demás. */
  var POR_PEDAZO = 25;

  /* =========================================================================
   * UTILIDADES (sin dependencias, mismo estilo que nube-crm.js)
   * =======================================================================*/
  function lista(v) { return Array.isArray(v) ? v : []; }
  function objeto(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function num(v) { return Number(v) || 0; }
  function texto(v) { return v == null ? '' : String(v); }
  function digitos(v) { return texto(v).replace(/\D/g, ''); }
  function esc(s) {
    return texto(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }
  function ahora() { return E.ahora ? E.ahora() : Date.now(); }
  function iso() { return new Date(ahora()).toISOString(); }
  function programar(f, ms) { return E.programar ? E.programar(f, ms) : setTimeout(f, ms); }
  function desprogramar(t) { if (t == null) return; if (E.desprogramar) E.desprogramar(t); else clearTimeout(t); }
  function cadaRato(f, ms) { return E.cadaRato ? E.cadaRato(f, ms) : setInterval(f, ms); }
  function pararRato(t) { if (t == null) return; try { if (E.pararRato) E.pararRato(t); else clearInterval(t); } catch (e) { /* nada */ } }
  function ventana() { return E.ventana || G; }
  function documento() { return E.documento !== undefined ? E.documento : (G.document || null); }
  function enLinea() {
    if (E.enLinea) return E.enLinea();
    try { return !(G.navigator && G.navigator.onLine === false); } catch (e) { return true; }
  }

  /* La huella: FNV-1a de 32 bits (la misma de crm.html) más el largo. Una
     colisión haría que un cambio NO subiera, así que se le suma el largo: dos
     paquetes distintos con la misma huella Y el mismo largo no van a pasar en
     esta vida. */
  function huella(t) {
    t = texto(t);
    var h = 0x811c9dc5;
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + '.' + t.length.toString(36);
  }

  /* ------------------------------------------------------------------ disco */
  function almacen() {
    if (E.almacen) return E.almacen;
    try { return G.localStorage || null; } catch (e) { return null; }
  }
  function leerTexto(llave) {
    var a = almacen(); if (!a) return null;
    try { return a.getItem(llave); } catch (e) { return null; }
  }
  function leerJSON(llave, porDefecto) {
    var t = leerTexto(llave); if (!t) return porDefecto;
    try { return JSON.parse(t); } catch (e) { return porDefecto; }
  }
  /* El cinturón, igual que en nube-crm.js: si alguien escribe acá la cartera,
     se cae su prueba y no la cartera de Joan. */
  function escribirTexto(llave, t) {
    if (llave === LLAVE_CARTERA) {
      throw new Error('historiales-auto.js no escribe nunca ' + LLAVE_CARTERA + ': la cartera solo la escribe crm.html.');
    }
    var a = almacen(); if (!a) return false;
    try { a.setItem(llave, t); return true; } catch (e) { return false; }
  }
  function quitar(llave) {
    var a = almacen(); if (!a) return;
    try { a.removeItem(llave); } catch (e) { /* nada */ }
  }

  /* Las huellas viven en el disco, y también en memoria si el disco no las
     dejó escribir (navegador lleno): sin esto, un disco lleno subiría a todos
     los clientes en cada vuelta. */
  var _mem = null;
  function leerEstado() {
    var e = _mem ? JSON.parse(JSON.stringify(_mem)) : objeto(leerJSON(LLAVE_ESTADO, null));
    return {
      v: 1,
      socios: objeto(e.socios),
      ultimaSubida: e.ultimaSubida || null,
      ultimaRevision: e.ultimaRevision || null,
      grupoEn: e.grupoEn || null,
      /* Cuándo Joan tocó el botón por primera vez en este computador. Sin
         esto, la subida sola no arranca (LA PRIMERA VEZ ES DEL BOTÓN). */
      habilitado: e.habilitado || null,
      /* Por qué se pausó, si se pausó: {motivo:'respaldo', en}. */
      pausa: e.pausa || null
    };
  }
  function guardarEstado(est) {
    var t;
    try { t = JSON.stringify(est); } catch (e) { return false; }
    if (escribirTexto(LLAVE_ESTADO, t)) { _mem = null; return true; }
    _mem = JSON.parse(t);
    return false;
  }

  /* =========================================================================
   * PARTE PURA — QUÉ SUBIR
   * =======================================================================*/
  function normalizarCodigo(c) {
    try {
      if (E.normalizarCodigo) return E.normalizarCodigo(c) || '';
      if (cfg && typeof cfg.normalizarCodigo === 'function') return cfg.normalizarCodigo(c) || '';
      if (G.MotorReglas && G.MotorReglas.normalizarCodigoAcceso) return G.MotorReglas.normalizarCodigoAcceso(c) || '';
    } catch (e) { /* abajo */ }
    return texto(c).trim().toUpperCase();
  }

  /* De quién es el paquete. crm.html lo marca con socioId (loteMigracion(true));
     sin él, la llave del cliente en la nube. */
  function llaveDe(x) { return x.socioId != null ? String(x.socioId) : 'k:' + texto(x.cedula || x.telefono); }

  /* La huella de lo que el cliente VE de sí mismo: identidad, nombre y su
     paquete SIN las cifras del grupo (ver LAS CIFRAS DEL GRUPO, arriba). El
     código va aparte (huellaCodigo) porque tiene su propia regla. */
  function huellaPaquete(x) {
    var d = objeto(x && x.datos), sin = {};
    Object.keys(d).forEach(function (k) { if (k !== 'comunidad') sin[k] = d[k]; });
    return huella(JSON.stringify([texto(x.cedula), texto(x.telefono), texto(x.nombre), sin]));
  }
  function huellaGrupo(x) { return huella(JSON.stringify(objeto(x && x.datos).comunidad || null)); }
  /* El código en el disco ya está en claro dentro de la cartera
     (s.codigoAcceso): esta huella no expone nada que no esté ahí. */
  function huellaCodigo(cod) { return cod ? huella('codigo|' + cod) : ''; }

  /* DOS FICHAS, UNA FILA (ver arriba). La llave de la nube se calcula IGUAL
     que en sincronizar_socios: los dígitos de la cédula o, si no hay, el
     celular. Choca:
       'llave'    dos fichas con la misma llave (misma cédula, o las dos sin
                  cédula y con el mismo celular): en la nube son UNA fila;
       'celular'  el celular de una ficha con cédula es la llave de otra: al
                  subir la primera, la nube borra la fila de la segunda y se
                  queda con su chat, su código y su vinculación.
     Chocan las dos partes: subir cualquiera de ellas hace el daño. */
  function fichasQueChocan(todos) {
    var porLlave = {}, choque = {};
    todos.forEach(function (t) { (porLlave[t.ident] = porLlave[t.ident] || []).push(t); });
    todos.forEach(function (t) {
      if (porLlave[t.ident].length > 1) {
        porLlave[t.ident].forEach(function (u) { choque[u.id] = choque[u.id] || 'llave'; });
      }
      if (t.cel && t.cel !== t.ident && porLlave[t.cel]) {
        choque[t.id] = choque[t.id] || 'celular';
        porLlave[t.cel].forEach(function (u) { choque[u.id] = choque[u.id] || 'celular'; });
      }
    });
    return choque;
  }

  /**
   * El plan de una vuelta, sin red. Recibe el lote de crm.html (con socioId) y
   * las huellas confirmadas; devuelve qué mandar y qué anotar SI la nube dice
   * que sí:
   *   propios   clientes cuyo paquete o código-que-se-puede-mandar cambió
   *   grupo     clientes a los que solo les faltan las cifras del grupo nuevas
   *   enviar    propios, más grupo si ya tocaba refrescarlo (6 h), con los
   *             que estrenan llave PRIMERO
   *   retenidos clientes con un código nuevo que la subida automática NO manda
   *   chocan    fichas que no suben (ni con el botón) porque la nube las
   *             tomaría por otra persona: [{id, nombre, motivo}]
   * Con {manual:true} (el botón) van todos los que no chocan, con su código y
   * su codigo_forzar tal cual los tiene el CRM: lo que el botón mandó siempre.
   */
  function planDeSubida(lote, registros, op) {
    var o = objeto(op), regs = objeto(registros);
    var norm = typeof o.normalizar === 'function' ? o.normalizar : normalizarCodigo;
    var todos = [], vivos = {}, llaves = {};
    lista(lote).forEach(function (x) {
      if (!x) return;
      var cel = digitos(x.telefono), ident = digitos(x.cedula) || cel;
      if (!ident) return;
      var id = llaveDe(x);
      if (vivos[id]) return;
      vivos[id] = true;
      llaves[ident] = true;
      todos.push({ x: x, id: id, cel: cel, ident: ident, rec: regs[id] ? objeto(regs[id]) : null });
    });
    var choque = fichasQueChocan(todos);
    var propios = [], grupo = [], retenidos = [], chocan = [];
    todos.forEach(function (t) {
      var x = t.x, id = t.id, rec = t.rec;
      if (choque[id]) { chocan.push({ id: id, nombre: texto(x.nombre) || 'Socio', motivo: choque[id] }); return; }
      var cod = norm(x.codigo) || '';
      var hc = huellaCodigo(cod);
      /* LA REGLA DEL CÓDIGO (ver LO QUE ESTO NO HACE NUNCA). */
      var mandar, retenido = false;
      if (o.manual) mandar = true;
      else if (!cod) mandar = false;
      else if (x.codigo_forzar) { mandar = false; retenido = true; }
      else if (!rec || !rec.c || rec.c === hc) mandar = true;
      else { mandar = false; retenido = true; }
      var h = huellaPaquete(x), g = huellaGrupo(x);
      var item = {
        cedula: texto(x.cedula), telefono: texto(x.telefono), nombre: x.nombre || 'Socio',
        codigo: mandar ? (x.codigo == null ? null : x.codigo) : null,
        codigo_forzar: o.manual ? !!x.codigo_forzar : false,
        datos: x.datos
      };
      /* `k`: la llave con que el cliente queda viviendo en la nube. Sirve para
         saber qué fila ocupa todavía y si la está estrenando. */
      var nuevo = { h: h, c: (mandar && cod) ? hc : (rec ? texto(rec.c) : ''), g: g, k: t.ident };
      var e = { id: id, nombre: texto(x.nombre) || 'Socio', item: item, rec: nuevo, retenido: retenido,
                ident: t.ident, cel: t.cel, migra: !!(rec && rec.k && rec.k !== t.ident) };
      if (retenido) retenidos.push(e);
      var propio = !rec || rec.h !== h || rec.k !== t.ident || (mandar && !!cod && rec.c !== hc);
      if (o.manual || propio) propios.push(e);
      else if (rec.g !== g) grupo.push(e);
    });
    var tg = Date.parse(o.grupoEn || '');
    var grupoListo = grupo.length > 0 && (isNaN(tg) || (num(o.ahora) - tg) >= GRUPO_MS);
    var enviar = propios.concat(grupoListo ? grupo : []);

    /* LA FILA QUE OTRA FICHA TODAVÍA OCUPA. Si el celular de X es la llave con
       que OTRA ficha Y vive hoy en la nube (Y estrenó cédula y todavía no
       subió), subir X primero le roba a Y su fila. Si Y viaja en esta misma
       subida, basta con que vaya antes (abajo); si no viaja, X espera. */
    var ocupada = {}, van = {}, fila = {};
    todos.forEach(function (t) { if (t.rec && t.rec.k) ocupada[t.rec.k] = t.id; });
    enviar.forEach(function (e) { van[e.id] = true; });
    enviar.forEach(function (e) {
      var otro = (e.cel && e.cel !== e.ident) ? ocupada[e.cel] : null;
      if (otro != null && otro !== e.id && !van[otro]) fila[e.id] = true;
    });
    if (Object.keys(fila).length) {
      var libre = function (e) { return !fila[e.id]; };
      enviar.forEach(function (e) { if (fila[e.id]) chocan.push({ id: e.id, nombre: e.nombre, motivo: 'fila' }); });
      propios = propios.filter(libre); grupo = grupo.filter(libre);
      retenidos = retenidos.filter(libre); enviar = enviar.filter(libre);
    }
    /* Las que estrenan llave, primero: mudan su fila antes de que la reclame
       otra con ese celular (sincronizar_socios va en orden, en una sola
       transacción por pedazo, y los pedazos van uno tras otro). */
    enviar = enviar.filter(function (e) { return e.migra; }).concat(enviar.filter(function (e) { return !e.migra; }));
    return {
      propios: propios, grupo: grupo, grupoListo: grupoListo, retenidos: retenidos, chocan: chocan,
      enviar: enviar, total: Object.keys(vivos).length, vivos: vivos, llaves: llaves
    };
  }

  function partir(l, n) {
    var out = [];
    for (var i = 0; i < l.length; i += n) out.push(l.slice(i, i + n));
    return out;
  }

  /* Lo que contestó sincronizar_socios, en una fase. El orden importa: un 404
     puede traer cualquier texto, y la clave equivocada llega como 400 con el
     mensaje EXACTO del `raise exception` (con y sin tilde: hay migraciones de
     las dos). Antes bastaba que el texto dijera «clave»: un 300 de PostgREST
     (PGRST203, dos versiones de la función) nombra `p_clave` y se leía como
     clave rechazada, con 15 min de espera para nada. */
  var RE_CLAVE = /clave de sincronizaci(?:o|ó|\\u00f3)n incorrecta/i;
  function clasificar(r) {
    var x = objeto(r);
    if (x.tiempo) return { fase: 'error', motivo: 'La nube no contestó en ' + Math.round(LIMITE_MS / 1000) + ' s' };
    /* Un fetch rechazado con el navegador EN LÍNEA no es «sin internet»: es
       que la nube no se alcanza (URL mal escrita, proyecto pausado, CORS). */
    if (x.red === false) return { fase: x.enLinea ? 'sin-llegar' : 'sin-senal' };
    if (x.ok) {
      var n = parseInt(texto(x.texto).replace(/[^\d-]/g, ''), 10);
      return { fase: 'ok', aceptados: isNaN(n) ? null : n };
    }
    var t = texto(x.texto);
    if (num(x.status) === 404) return { fase: 'falta-funcion' };
    if (RE_CLAVE.test(t)) return { fase: 'clave' };
    if (num(x.status) === 401 || num(x.status) === 403) return { fase: 'llave' };
    return { fase: 'error', status: num(x.status),
             motivo: 'La nube respondió ' + (num(x.status) || 'con un error') + (t ? ': ' + t.slice(0, 120) : '') };
  }

  /* --------------------------------------------------------- textos y horas */
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function hace(cuando, ahoraMs) {
    var t = Date.parse(cuando);
    if (!cuando || isNaN(t)) return '';
    var min = Math.floor((ahoraMs - t) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' min';
    if (min < 24 * 60) return 'hace ' + Math.floor(min / 60) + ' h';
    var d = new Date(t);
    return 'el ' + d.getDate() + '-' + MESES[d.getMonth()];
  }
  /* «lo de hace 2 min», pero «lo del 5-oct»: «lo de el» no se dice. */
  function loDe(cuando, ahoraMs) {
    var h = hace(cuando, ahoraMs);
    return h.indexOf('el ') === 0 ? 'lo del ' + h.slice(3) : 'lo de ' + h;
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function masTarde(a, b) {
    var ta = Date.parse(a || ''), tb = Date.parse(b || '');
    if (isNaN(ta)) return isNaN(tb) ? null : b;
    if (isNaN(tb)) return a;
    return tb > ta ? b : a;
  }

  /**
   * LA LÍNEA DE ESTADO, con las palabras de Joan. Dos renglones: l1 lo que
   * pasa, l2 el detalle y lo que hace un clic. Tres tonos: calma (nada
   * pendiente), ojo (algo espera) y mal (algo que Joan tiene que arreglar).
   * Primero lo que falló, después lo que espera, y solo al final «tus clientes
   * ven lo de hace X» sin nada detrás: así no puede decir que está todo arriba
   * cuando no lo está.
   */
  function textoCinta(r) {
    var x = objeto(r), u = objeto(x.ultimo), pl = x.plan ? objeto(x.plan) : null;
    var ya = num(x.ahora) || ahora();
    var c = function (fase, clase, l1, l2) { return { fase: fase, clase: clase, l1: l1, l2: l2 }; };
    var n = pl ? num(pl.pendientes) : 0;
    var esperan = n ? plural(n, 'cliente', 'clientes') + ' con cambios esperando subir' : 'los cambios esperan';
    var venLo = x.ultimaSubida ? 'Tus clientes ven ' + loDe(x.ultimaSubida, ya)
                               : 'Todavía no he subido historiales desde este computador';
    /* 7-oct (segunda vuelta) — cuando la última revisión NO encontró nada que
       subir, lo que ven es lo de ESA revisión: tras días sin cambios decía
       «lo del 4-oct», que se lee como atrasado sin estarlo. Solo para los
       estados sin fallo; los de fallo hablan de la última subida. */
    var vistoEn = masTarde(x.ultimaSubida, x.ultimaRevision);
    var venAlDia = vistoEn ? 'Tus clientes ven ' + loDe(vistoEn, ya) : venLo;
    var extra = '';
    if (pl && num(pl.retenidos)) {
      extra += ' · ' + plural(num(pl.retenidos), 'código nuevo espera', 'códigos nuevos esperan') + ' ☁ Subir historiales';
    }
    if (pl && num(pl.chocan)) {
      var nc = num(pl.chocan);
      extra += ' · ' + plural(nc, 'cliente comparte', 'clientes comparten') + ' celular o cédula con otra ficha y no ' +
        (nc === 1 ? 'sube' : 'suben') + (pl.chocanNombres ? ' (' + esc(pl.chocanNombres) + ')' : '') +
        ': ponle la cédula a quien no la tiene, junta las fichas repetidas o corrige el número';
    }
    if (pl && num(pl.sinLlave)) {
      extra += ' · ' + plural(num(pl.sinLlave), 'cliente sin celular ni cédula no sube', 'clientes sin celular ni cédula no suben');
    }
    if (pl && num(pl.borrados)) {
      extra += ' · ' + plural(num(pl.borrados), 'ficha que borraste sigue en la nube', 'fichas que borraste siguen en la nube') +
        ' (la subida no borra)';
    }
    var cola = (n ? ' · ' + esperan : '') + extra;
    var hayQueVer = pl && (num(pl.retenidos) || num(pl.chocan));

    if (x.fase === 'apagado') return c('apagado', 'neutro', '', '');
    if (x.enVuelta) {
      return c('subiendo', 'calma', 'Subiendo ' + plural(num(x.subiendo), 'cliente', 'clientes') + '…', 'unos segundos' + extra);
    }
    if (u.fase === 'sello-roto') {
      return c('sello-roto', 'mal', 'Otra página cambió tu cartera: desde esta pestaña no subo los historiales',
        'clic para recargarla y subir' + cola);
    }
    if (u.fase === 'otra-pestana') {
      return c('otra-pestana', 'neutro', 'Los historiales los sube la otra pestaña del CRM', 'clic para subirlos desde esta');
    }
    if (u.fase === 'sin-config') {
      return c('sin-config', 'mal', 'Sin conexión a la nube: configúrala en Ajustes',
        (u.motivo === 'corta' ? 'Tu clave de sincronización es muy corta: la nube pide 12 caracteres o más · ' : '') +
        (x.ultimaSubida ? venLo + '; lo nuevo espera' : 'Lo que cambies acá no les llega a tus clientes') + cola);
    }
    if (u.fase === 'primera-vez') {
      var resp = u.motivo === 'respaldo';
      return c('primera-vez', 'ojo',
        resp ? 'Importaste un respaldo: los historiales no suben solos hasta que lo confirmes'
             : 'Los historiales todavía no suben solos en este computador',
        (resp ? 'Cuando estés seguro de que esta es tu cartera de hoy, toca ☁ Subir historiales (Ajustes → Compartir con mis clientes); desde ahí vuelven a subir solos'
              : 'Toca ☁ Subir historiales una vez (Ajustes → Compartir con mis clientes) y desde ahí suben solos con cada cambio') +
        (x.ultimaSubida ? ' · ' + venLo : '') + extra);
    }
    if (u.fase === 'sin-guardar') {
      return c('sin-guardar', 'mal', 'Tu cartera no se pudo guardar: no subo lo que no quedó guardado',
        'Baja el respaldo (el aviso rojo de abajo). En cuanto vuelva a guardar, subo lo pendiente' +
        (x.ultimaSubida ? ' · ' + venLo : '') + extra);
    }
    if (u.fase === 'clave') {
      return c('clave', 'mal', 'La nube no aceptó tu clave de sincronización',
        'Revísala en Ajustes y toca «Guardar conexión» o «🔌 Probar conexión». Si está bien, es el freno de intentos de la nube: pruebo otra vez sola en 15 min' + cola);
    }
    if (u.fase === 'llave') {
      return c('llave', 'mal', 'La nube no aceptó la llave anon', 'Revísala en Ajustes (Supabase → Settings → API)' + cola);
    }
    if (u.fase === 'falta-funcion') {
      return c('falta-funcion', 'mal', 'A la nube le falta la función de los historiales',
        'Corre base/supabase.sql en el SQL Editor de Supabase' + cola);
    }
    if (u.fase === 'parcial') {
      return c('parcial', 'mal',
        'La nube aceptó ' + num(u.aceptados) + ' de ' + plural(num(u.de), 'cliente', 'clientes') + ': le falta una actualización',
        'Corre base/supabase.sql en el SQL Editor de Supabase; mientras, ' + (n ? esperan : 'lo nuevo espera') +
        ' · clic para reintentar' + extra);
    }
    if (u.fase === 'error') {
      return c('error', 'ojo', 'No pude subir: ' + esperan,
        esc(u.motivo || 'La nube no contestó bien.') + ' · pruebo otra vez en 3 min · clic para reintentar ya' + extra);
    }
    if (u.fase === 'sin-llegar' && x.enLinea !== false) {
      return c('sin-llegar', 'ojo', 'No pude llegar a la nube' + (n ? ': ' + esperan : ''),
        '¿Hay internet? Si hay, revisa la URL en Ajustes y toca 🔌 Probar conexión · pruebo otra vez en 3 min · clic para reintentar ya' + extra);
    }
    if (u.fase === 'sin-senal' || u.fase === 'sin-llegar' || x.enLinea === false) {
      if (!n && !x.esperando) return c('sin-senal', 'neutro', 'Sin internet', 'nada esperando subir · ' + venAlDia + extra);
      return c('sin-senal', 'ojo', 'Sin internet: ' + esperan, 'suben solos cuando vuelva la señal · ' + venLo + extra);
    }
    /* «ocupado» solo si de verdad hay algo esperando: la vuelta de cada 30 min
       también se aplaza mientras Joan escribe, y sin un cambio de por medio
       decir «hay cambios por subir» sería inventarlo. */
    if (x.ocupado && (n || x.cambio)) {
      return c('ocupado', 'ojo', n ? esperan.charAt(0).toUpperCase() + esperan.slice(1) : 'Hay cambios por subir',
        'suben solos cuando termines lo que estás haciendo · clic para subir ya' + extra);
    }
    if (x.esperando) {
      return c('esperando', 'ojo', venAlDia, 'Hubo cambios: subo lo de quien cambió tras 90 s sin cambios · clic para subir ya' + extra);
    }
    if (!pl) return c('revisando', 'calma', 'Revisando lo que ven tus clientes…', '');
    if (n > 0) return c('pendientes', 'ojo', esperan.charAt(0).toUpperCase() + esperan.slice(1), 'clic para subir ya' + extra);
    if (!num(pl.total)) {
      return c('nada', 'neutro', 'Todavía no hay clientes para subir', 'necesitan celular o cédula en su ficha' + extra);
    }
    return c('al-dia', hayQueVer ? 'ojo' : 'calma', venAlDia,
      (hayQueVer ? 'nada más esperando subir' : 'nada esperando subir') +
      (num(pl.grupo) ? ' · las cifras del grupo se refrescan cada 6 h' : '') + extra);
  }

  /* Lo mismo dicho para el texto del botón manual (sbEstado de Ajustes). */
  function textoDeFallo(u) {
    var x = objeto(u), f = x.fase;
    if (f === 'sin-config') {
      return x.motivo === 'corta'
        ? 'Tu clave de sincronización es muy corta: la nube pide 12 caracteres o más.'
        : 'Primero pega la URL, la llave anon y tu clave, y dale a «Guardar conexión».';
    }
    if (f === 'clave') return 'La clave de sincronización no coincide con la de la base (o la nube tiene puesto el freno de intentos: espera 15 min).';
    if (f === 'llave') return 'La nube no aceptó la llave anon: revísala en Ajustes.';
    if (f === 'falta-funcion') return 'A la nube le falta la función sincronizar_socios: corre base/supabase.sql.';
    if (f === 'parcial') return 'La nube aceptó solo ' + num(x.aceptados) + ' de ' + num(x.de) + ': le falta una actualización. Corre base/supabase.sql en el SQL Editor de Supabase.';
    if (f === 'sin-senal') return 'No hubo conexión. Revisa el internet y vuelve a intentar.';
    if (f === 'sin-llegar') return 'No pude llegar a la nube: revisa el internet, o la URL de Ajustes con «🔌 Probar conexión».';
    if (f === 'sello-roto') return 'Otra página cambió tu cartera: recarga esta pestaña y vuelve a subir.';
    if (f === 'nada') return 'No hay clientes con celular ni cédula para subir.';
    if (f === 'chocan') return 'Ninguno se puede subir.';
    if (f === 'apagado') return 'La subida de historiales está apagada en esta pestaña.';
    return texto(x.motivo) || 'La nube no contestó bien.';
  }

  /* =========================================================================
   * LA PUERTA DEL SELLO — ¿lo que hay en el disco es exactamente lo último que
   * ESTA pestaña escribió o leyó? (ver UNA SOLA PESTAÑA SUBE, arriba)
   *   ok            sí, y sube esta
   *   sello-roto    no: otra página escribió la cartera; la DB de acá es vieja
   *   otra-pestana  sí, pero ya sube otra pestaña viva
   * No escribe nada: pintar() la usa para no dejar puesto un aviso viejo.
   * =======================================================================*/
  var cfg = {};
  function vivo(d) {
    var x = objeto(d);
    if (typeof x.latido !== 'number') return false;
    var dt = ahora() - x.latido;
    return dt < VIVA_MS && dt > -VIVA_MS;
  }
  function miSello() { try { return objeto(cfg.sello ? cfg.sello() : null); } catch (e) { return {}; } }
  function selloDisco() { return objeto(leerJSON(LLAVE_SELLO, null)); }
  function puerta() {
    if (typeof cfg.sello !== 'function') return 'ok';      // fuera de crm.html no hay sello que mirar
    var mio = miSello();
    if (mio.largo == null) return 'sello-roto';
    var t = texto(leerTexto(LLAVE_CARTERA));
    var coincide = t.length === mio.largo &&
      (mio.huella == null || typeof cfg.huella !== 'function' || cfg.huella(t) === mio.huella);
    if (!coincide) return 'sello-roto';
    /* El texto es el de esta pestaña: lo que subiría es lo bueno. Queda solo
       no mandarlo dos veces. La del sello sube siempre; otra, solo si no hay
       nadie más subiendo historiales (un latido vivo en SU llave). */
    var disco = selloDisco();
    if (disco.quien && disco.quien === mio.quien) return 'ok';
    var dueno = objeto(leerJSON(LLAVE_DUENO_HIST, null));
    if (dueno.id && dueno.id !== mio.quien && vivo(dueno)) return 'otra-pestana';
    return 'ok';
  }
  /* El latido: «esta pestaña es la que sube historiales». Se escribe cuando la
     puerta dice que sí (cada vuelta y cada 30 s) y se suelta si deja de serlo. */
  function latir() {
    var mio = miSello(); if (!mio.quien) return;
    escribirTexto(LLAVE_DUENO_HIST, JSON.stringify({ id: mio.quien, latido: ahora() }));
  }
  function soltarLatido() {
    var mio = miSello(), d = objeto(leerJSON(LLAVE_DUENO_HIST, null));
    if (mio.quien && d.id === mio.quien) quitar(LLAVE_DUENO_HIST);
  }

  /* =========================================================================
   * LA CONEXIÓN Y LA RED
   * =======================================================================*/
  function conexion() {
    var c = {};
    try { c = objeto(cfg.conexion ? cfg.conexion() : null); } catch (e) { c = {}; }
    var url = texto(c.url).trim().replace(/\/+$/, ''), anon = texto(c.anon).trim(), clave = texto(c.clave);
    if (!url || !anon || !clave) return { ok: false, motivo: 'faltan' };
    /* clave_ok la rechaza igual, pero contándola como intento fallido del
       freno global: mejor no mandarla. */
    if (clave.length < 12) return { ok: false, motivo: 'corta' };
    return { ok: true, url: url, anon: anon, clave: clave, huellaClave: huella('clave|' + clave) };
  }

  function enviarPedazo(con, items) {
    var cuerpo = JSON.stringify({ p_clave: con.clave, p_lote: items });
    var sinRed = function () { return { red: false, enLinea: enLinea() }; };
    var ctrl = null;
    try { if (typeof G.AbortController === 'function') ctrl = new G.AbortController(); } catch (e) { ctrl = null; }
    var p;
    try {
      if (E.enviar) p = E.enviar(con, items, cuerpo);
      else {
        var init = { method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: con.anon, Authorization: 'Bearer ' + con.anon },
          body: cuerpo };
        if (ctrl) init.signal = ctrl.signal;
        var url = con.url + '/rest/v1/rpc/sincronizar_socios';
        if (E.fetch) p = E.fetch(url, init);
        else if (typeof G.fetch === 'function') p = G.fetch(url, init);
        else return Promise.resolve({ red: false });
      }
    } catch (e) { return Promise.resolve(sinRed()); }
    var respuesta = Promise.resolve(p).then(function (r) {
      var x = objeto(r);
      if (x.red === false) return x;
      if (typeof x.text !== 'function') return { ok: !!x.ok, status: num(x.status), texto: texto(x.texto) };
      return Promise.resolve(x.text()).then(
        function (t) { return { ok: !!x.ok, status: num(x.status), texto: texto(t) }; },
        function () { return { ok: !!x.ok, status: num(x.status), texto: '' }; });
    }, sinRed);
    /* EL TIEMPO LÍMITE (ver LIMITE_MS). Lo que llegue después del corte no
       cuenta: el pedazo ya se dio por no subido y sale en la vuelta siguiente
       (sincronizar_socios es idempotente: mandarlo otra vez no daña). */
    return new Promise(function (resolver) {
      var hecho = false, t = null;
      function fin(r) { if (hecho) return; hecho = true; desprogramar(t); t = null; resolver(r); }
      t = programar(function () {
        t = null;
        try { if (ctrl) ctrl.abort(); } catch (e) { /* nada */ }
        fin({ tiempo: true });
      }, LIMITE_MS);
      respuesta.then(fin, function () { fin(sinRed()); });
    });
  }

  /* =========================================================================
   * EL ESTADO DE ESTE MOMENTO
   * =======================================================================*/
  var _apagado = false, _configurado = false, _enVuelta = false, _promesa = null;
  var _ultimo = null;     // lo que pasó en la última vuelta que no salió bien
  var _plan = null;       // el resumen del último plan: {pendientes, grupo, retenidos, chocan, total, sinLlave, borrados}
  var _subiendo = 0, _ocupado = false;
  /* Hubo un guardar() desde el último plan: hay algo que mirar. */
  var _cambio = false;
  /* La última clave que la nube rechazó y cuándo: aparte de _ultimo, para que
     otro aviso (sin señal, otra pestaña) no borre la espera de 15 min. */
  var _freno = null;
  var _quietud = null, _primera = null, _reintento = null, _ocupadoT = null, _pintarT = null;
  var _reloj = null, _periodico = null;

  function esEquipo() { try { return !!(cfg.equipo && cfg.equipo()); } catch (e) { return true; } }
  /* Si no sabe, dice que SÍ (la regla de estoyOcupado en crm.html): se aplaza. */
  function ocupado() { try { return !!(cfg.ocupado && cfg.ocupado()); } catch (e) { return true; } }
  /* ¿El último guardar() no entró? Si no sabe, dice que no: crm.html es quien
     lo sabe, y una pestaña sin ese enganche se comporta como antes. */
  function sinGuardar() { try { return !!(cfg.sinGuardar && cfg.sinGuardar()); } catch (e) { return false; } }
  function frenoPuesto(con) {
    var c = con || conexion();
    return !!(_freno && c.ok && _freno.claveDe === c.huellaClave &&
              ahora() - num(_freno.ms) < REINTENTO_CLAVE_MS - 1000);
  }

  function armarPlan(manual) {
    if (typeof cfg.lote !== 'function') throw new Error('crm.html no le pasó el lote');
    var lote = lista(cfg.lote(true));
    var est = leerEstado();
    var plan = planDeSubida(lote, est.socios, { manual: manual, ahora: ahora(), grupoEn: est.grupoEn });
    var cuantos = plan.total;
    try { if (cfg.cuantos) cuantos = num(cfg.cuantos()); } catch (e) { cuantos = plan.total; }
    plan.sinLlave = Math.max(0, cuantos - plan.total);
    /* Las fichas que subieron desde acá y ya no están en la cartera: su fila
       sigue en la nube (ver podar). Con una cartera que se leyó vacía no se
       cuenta nada: no se acusa a Joan de haber borrado a todos. */
    var borrados = 0;
    if (Object.keys(plan.vivos).length) {
      Object.keys(est.socios).forEach(function (k) {
        if (plan.vivos[k]) return;
        var r = objeto(est.socios[k]);
        if (r.k && plan.llaves[r.k]) return;
        borrados++;
      });
    }
    plan.borrados = borrados;
    return plan;
  }
  function resumirPlan(plan, manual) {
    var nombres = plan.chocan.slice(0, 3).map(function (c) { return c.nombre; }).join(', ') + (plan.chocan.length > 3 ? '…' : '');
    return {
      pendientes: plan.enviar.length,
      grupo: plan.grupoListo ? 0 : plan.grupo.length,
      retenidos: manual ? 0 : plan.retenidos.length,
      chocan: plan.chocan.length, chocanNombres: nombres,
      total: plan.total, sinLlave: plan.sinLlave, borrados: plan.borrados || 0
    };
  }

  function resumen() {
    var est = leerEstado();
    return {
      fase: _apagado ? 'apagado' : null, ultimo: _ultimo, enVuelta: _enVuelta, subiendo: _subiendo,
      plan: _plan, esperando: _quietud != null, ocupado: _ocupado, cambio: _cambio, enLinea: enLinea(),
      ultimaSubida: est.ultimaSubida, ultimaRevision: est.ultimaRevision, grupoEn: est.grupoEn,
      habilitado: !!est.habilitado, version: VERSION, ahora: ahora()
    };
  }
  function estado() {
    var r = resumen();
    r.cinta = textoCinta(r);
    return r;
  }

  /* =========================================================================
   * LA SUBIDA
   * =======================================================================*/
  /* El pedazo se anota SOLO acá, con la respuesta buena en la mano. El del
     botón, además, enciende la subida sola en este computador. */
  function anotar(pedazo, manual) {
    var est = leerEstado();
    pedazo.forEach(function (e) { est.socios[e.id] = e.rec; });
    est.ultimaSubida = iso();
    if (manual) { est.habilitado = est.habilitado || iso(); est.pausa = null; }
    guardarEstado(est);
  }
  /* Las huellas de quien ya no está en la cartera NO se tiran: su fila sigue
     publicada (sincronizar_socios no borra) y la línea lo cuenta. Se olvidan
     solo cuando otra ficha viva ocupa esa misma fila: entonces ya es de ella.
     Con una cartera leída vacía no se toca nada. */
  function podar(est, plan) {
    var v = objeto(plan.vivos), llaves = objeto(plan.llaves);
    if (!Object.keys(v).length) return;
    Object.keys(est.socios).forEach(function (k) {
      if (v[k]) return;
      var r = objeto(est.socios[k]);
      if (r.k && llaves[r.k]) delete est.socios[k];
    });
  }

  function programarReintento() {
    desprogramar(_reintento); _reintento = null;
    if (_apagado || !_ultimo) return;
    var f = _ultimo.fase;
    var ms = f === 'clave' ? REINTENTO_CLAVE_MS : (f === 'sin-senal' || f === 'sin-llegar' || f === 'error') ? REINTENTO_MS : 0;
    if (ms) _reintento = programar(function () { _reintento = null; vuelta(false); }, ms);
  }

  function subir(plan, con, op) {
    var manual = !!(op && op.manual);
    var envio = plan.enviar;
    /* Las cifras del grupo quedan al día para todos si esta vuelta las lleva a
       todos los que les faltaban (o no le faltaban a nadie). */
    var conGrupo = manual || plan.grupoListo || !plan.grupo.length;
    var res = { ok: false, total: envio.length, subidos: 0, aceptados: 0, confirmados: [], fase: null, motivo: '',
                chocan: plan.chocan.map(function (c) { return c.nombre; }) };
    _enVuelta = true; _subiendo = envio.length; _ultimo = null;
    pintar();
    var cadena = Promise.resolve(true);
    partir(envio, POR_PEDAZO).forEach(function (pz) {
      cadena = cadena.then(function (seguir) {
        if (!seguir) return false;
        if (_apagado || esEquipo()) { res.fase = 'apagado'; return false; }
        /* Antes de cada pedazo, otra vez la puerta: si otra página escribió la
           cartera mientras subía, lo que falta se calculó de una DB vieja. */
        var p = puerta();
        if (p === 'sello-roto' || (p === 'otra-pestana' && !manual)) {
          _ultimo = { fase: p, cuando: iso() }; res.fase = p; return false;
        }
        return enviarPedazo(con, pz.map(function (e) { return e.item; })).then(function (r) {
          var k = clasificar(r);
          if (k.fase !== 'ok') {
            _ultimo = { fase: k.fase, status: k.status, motivo: k.motivo, cuando: iso() };
            if (k.fase === 'clave') _freno = { claveDe: con.huellaClave, ms: ahora() };
            res.fase = k.fase;
            return false;
          }
          /* La nube contó menos de los que se mandaron: un sincronizar_socios
             viejo (el de agosto solo conocía la cédula) se salta a los demás
             sin quejarse. No se sabe cuáles: no se anota NINGUNO del pedazo. */
          if (k.aceptados != null && k.aceptados < pz.length) {
            _ultimo = { fase: 'parcial', aceptados: k.aceptados, de: pz.length, cuando: iso() };
            res.fase = 'parcial';
            return false;
          }
          anotar(pz, manual);
          _freno = null;
          res.subidos += pz.length;
          res.aceptados += num(k.aceptados);
          pz.forEach(function (e) { res.confirmados.push(e.id); });
          _subiendo = Math.max(0, _subiendo - pz.length);
          return true;
        });
      });
    });
    _promesa = cadena.then(function (todo) {
      res.ok = !!todo && !res.fase;
      if (res.ok) {
        var est = leerEstado();
        if (conGrupo) est.grupoEn = iso();
        est.ultimaRevision = iso();
        podar(est, plan);
        guardarEstado(est);
        _ultimo = null;
      }
      return res;
    }, function (e) {
      _ultimo = { fase: 'error', motivo: 'Falló la subida (' + texto(e && e.message).slice(0, 80) + ')', cuando: iso(), ms: ahora() };
      res.fase = 'error';
      return res;
    }).then(function (r) {
      _enVuelta = false; _subiendo = 0; _promesa = null;
      if (_plan) {
        var resta = Math.max(0, r.total - r.subidos);
        _plan.pendientes = manual ? (r.ok ? 0 : resta) : resta;
        if (manual && r.ok) { _plan.retenidos = 0; _plan.grupo = 0; }
        if (!manual && r.ok && conGrupo) _plan.grupo = 0;
      }
      if (!r.ok && !r.motivo) r.motivo = textoDeFallo(_ultimo || { fase: r.fase });
      programarReintento();
      /* Un cambio cuyos 90 s se cumplieron con esta subida en el aire se topó
         con vuelta() ocupada y se quedó sin reloj: sin esto esperaba hasta la
         vuelta de 30 min con la línea diciendo «nada esperando subir». */
      if (!_apagado && _cambio && _quietud == null) {
        _quietud = programar(function () { _quietud = null; vuelta(false); }, QUIETUD_MS);
      }
      pintar();
      return r;
    });
    return _promesa;
  }

  /**
   * UNA VUELTA de la subida automática. porOrdenDeJoan = el clic: no espera a
   * que deje de estar ocupado ni al freno de la clave.
   */
  function vuelta(porOrdenDeJoan) {
    if (_apagado || !_configurado) return Promise.resolve(estado());
    if (_enVuelta && _promesa) return _promesa.then(function () { return estado(); });
    if (esEquipo()) { apagar(); return Promise.resolve(estado()); }
    var porOrden = !!porOrdenDeJoan;
    desprogramar(_ocupadoT); _ocupadoT = null;
    if (porOrden) { desprogramar(_quietud); _quietud = null; }
    /* Un cambio que todavía se está asentando (sus 90 s no han pasado) lo sube
       su propio reloj: la vuelta del arranque, la de cada 30 min o la de
       `online` no se le adelantan a media operación. */
    if (!porOrden && _quietud != null) { pintar(); return Promise.resolve(estado()); }
    if (!porOrden && ocupado()) {
      _ocupado = true;
      _ocupadoT = programar(function () { _ocupadoT = null; vuelta(false); }, OCUPADO_MS);
      pintar();
      return Promise.resolve(estado());
    }
    _ocupado = false;

    var p = puerta();
    if (p !== 'ok') {
      if (p === 'sello-roto') soltarLatido();
      _ultimo = { fase: p, cuando: iso() }; pintar(); return Promise.resolve(estado());
    }
    latir();

    var plan;
    try { plan = armarPlan(false); }
    catch (e) {
      _ultimo = { fase: 'error', motivo: 'No pude armar los paquetes de tus clientes (' + texto(e && e.message).slice(0, 80) + ')',
                  cuando: iso(), ms: ahora() };
      pintar();
      return Promise.resolve(estado());
    }
    _plan = resumirPlan(plan, false);
    _cambio = false;

    var con = conexion();
    if (!con.ok) { _ultimo = { fase: 'sin-config', motivo: con.motivo }; pintar(); return Promise.resolve(estado()); }
    /* LA PRIMERA VEZ ES DEL BOTÓN (ver arriba): ni el clic en la línea la salta. */
    var est0 = leerEstado();
    if (!est0.habilitado) {
      _ultimo = { fase: 'primera-vez', motivo: texto(objeto(est0.pausa).motivo) };
      pintar();
      return Promise.resolve(estado());
    }
    if (sinGuardar()) { _ultimo = { fase: 'sin-guardar', cuando: iso() }; pintar(); return Promise.resolve(estado()); }
    if (!enLinea()) { _ultimo = { fase: 'sin-senal', cuando: iso() }; programarReintento(); pintar(); return Promise.resolve(estado()); }
    if (!porOrden && frenoPuesto(con)) {
      _ultimo = { fase: 'clave', cuando: iso() };
      /* Que quede UN reloj para cuando se cumplan los 15 min, aunque otro
         aviso de por medio (sin señal) haya cambiado el que había. */
      if (_reintento == null) {
        _reintento = programar(function () { _reintento = null; vuelta(false); },
          Math.max(1000, REINTENTO_CLAVE_MS - (ahora() - num(_freno.ms))));
      }
      pintar();
      return Promise.resolve(estado());
    }

    if (!plan.enviar.length) {
      var est = leerEstado();
      est.ultimaRevision = iso();
      if (!plan.grupo.length) est.grupoEn = iso();
      podar(est, plan);
      guardarEstado(est);
      _ultimo = null;
      pintar();
      return Promise.resolve(estado());
    }
    return subir(plan, con, { manual: false }).then(function () { return estado(); });
  }

  /**
   * EL BOTÓN DE SIEMPRE («☁ Subir historiales»): sube a TODOS los que no
   * chocan, con su código y su codigo_forzar tal cual, en pedazos, y anota las
   * huellas de lo que la nube confirmó. Es el único camino que cambia un
   * código regenerado, y el que enciende la subida sola en este computador.
   * Lo llama sincronizarSocios() de crm.html DESPUÉS de su confirm(): las
   * preguntas son de esa pantalla, no de esta pieza.
   * Devuelve {ok, total, subidos, aceptados, confirmados:[ids], chocan:[nombres], fase, motivo}.
   */
  function subirTodo() {
    function fallo(fase, motivo, chocan) {
      return { ok: false, fase: fase, total: 0, subidos: 0, aceptados: 0, confirmados: [], chocan: chocan || [],
               motivo: motivo || textoDeFallo({ fase: fase }) };
    }
    if (_apagado) return Promise.resolve(fallo('apagado'));
    if (!_configurado) return Promise.resolve(fallo('apagado'));
    if (_enVuelta && _promesa) return _promesa.then(function () { return subirTodo(); });
    if (esEquipo()) { apagar(); return Promise.resolve(fallo('apagado')); }
    /* «otra-pestana» sí deja: el texto del disco es el de esta pestaña, así que
       lo que sube es lo bueno. «sello-roto» no: esta DB es vieja. */
    var p = puerta();
    if (p === 'sello-roto') { _ultimo = { fase: p, cuando: iso() }; pintar(); return Promise.resolve(fallo(p)); }
    latir();
    var con = conexion();
    if (!con.ok) { _ultimo = { fase: 'sin-config', motivo: con.motivo }; pintar(); return Promise.resolve(fallo('sin-config', textoDeFallo({ fase: 'sin-config', motivo: con.motivo }))); }
    var plan;
    try { plan = armarPlan(true); }
    catch (e) { return Promise.resolve(fallo('error', 'No pude armar los paquetes de tus clientes (' + texto(e && e.message).slice(0, 80) + ').')); }
    var chocan = plan.chocan.map(function (c) { return c.nombre; });
    if (!plan.enviar.length) return Promise.resolve(fallo(chocan.length ? 'chocan' : 'nada', null, chocan));
    desprogramar(_quietud); _quietud = null;
    _plan = resumirPlan(plan, true);
    _cambio = false;
    return subir(plan, con, { manual: true });
  }

  /* importar() de crm.html: entró una cartera entera de un archivo. Las huellas
     describen la de antes y la del respaldo suele ser VIEJA: la subida sola se
     pausa hasta que Joan toque el botón (LA PRIMERA VEZ ES DEL BOTÓN). Lo que
     ya se subió sigue arriba; solo se olvida qué era. */
  function carteraReemplazada(motivo) {
    var est = leerEstado();
    _mem = null;
    guardarEstado({ v: 1, socios: {}, ultimaSubida: est.ultimaSubida, ultimaRevision: null, grupoEn: null,
                    habilitado: null, pausa: { motivo: texto(motivo) || 'otra', en: iso() } });
    desprogramar(_quietud); _quietud = null;
    _cambio = false;
    _plan = null;
    if (_configurado && !_apagado) {
      _ultimo = { fase: 'primera-vez', motivo: texto(motivo) };
      pintarPronto();
    }
  }

  /* =========================================================================
   * LO QUE SE VE
   * =======================================================================*/
  var ESTILO = '' +
    '.hist-cinta{margin-top:6px;width:100%;box-sizing:border-box;font-size:11px;border-radius:10px;padding:9px 10px;line-height:1.4;position:relative;z-index:2;cursor:pointer;' +
    'background:rgba(var(--papel-rgb),.08);color:rgba(var(--blanco-laca-rgb),.74);border-left:3px solid rgba(var(--blanco-laca-rgb),.35)}' +
    '.hist-cinta:empty{display:none}' +
    '.hist-cinta b{display:block;font-size:11.5px;margin-bottom:2px;color:var(--blanco-laca)}' +
    '.hist-cinta.calma{border-left-color:rgba(var(--amarillo-rgb),.85)}' +
    '.hist-cinta.ojo{background:rgba(var(--amarillo-rgb),.13);color:var(--amarillo);border-left-color:var(--amarillo)}' +
    '.hist-cinta.ojo b{color:var(--amarillo)}' +
    '.hist-cinta.mal{background:color-mix(in srgb,var(--rojo-laca) 16%,transparent);border-left-color:var(--rojo-laca)}' +
    '.hist-cinta:focus-visible{outline:2px solid var(--rojo-laca);outline-offset:2px}' +
    '.hist-barra{cursor:pointer;margin-bottom:12px}.hist-barra.mal{border-left:4px solid var(--rojo)}' +
    '.hist-barra .l2{margin-top:2px}.hist-barra .l3{margin-top:8px;font-size:12px;opacity:.85}';

  function ponerEstilo() {
    var doc = documento();
    try {
      if (!doc || !doc.head || !doc.createElement || !doc.getElementById) return;
      var ya = doc.getElementById('histAutoEstilo');
      if (ya && ya.parentNode) return;
      var s = doc.createElement('style');
      s.id = 'histAutoEstilo';
      s.textContent = ESTILO;
      doc.head.appendChild(s);
    } catch (e) { /* sin estilo se lee igual */ }
  }

  /* En la barra lateral, debajo de la cinta de la cartera (nube-crm.js) o, si
     esa no está, debajo del horario. Si la barra no está, la de Ajustes sigue
     diciendo lo mismo. */
  function asegurarCinta() {
    var doc = documento();
    try {
      if (!doc || !doc.getElementById) return null;
      var c = doc.getElementById('histCinta');
      if (c && c.parentNode) return c;
      var ref = doc.getElementById('nubeCinta');
      if (!ref || !ref.parentNode) ref = doc.getElementById('horarioBox');
      if (!ref || !ref.parentNode || !doc.createElement) return null;
      c = doc.createElement('div');
      c.id = 'histCinta';
      c.className = 'hist-cinta';
      if (c.setAttribute) { c.setAttribute('role', 'button'); c.setAttribute('tabindex', '0'); c.setAttribute('aria-live', 'polite'); }
      c.onclick = function () { accion(); };
      c.onkeydown = function (ev) {
        if (ev && (ev.key === 'Enter' || ev.key === ' ')) { if (ev.preventDefault) ev.preventDefault(); accion(); }
      };
      if (ref.nextSibling) ref.parentNode.insertBefore(c, ref.nextSibling); else ref.parentNode.appendChild(c);
      return c;
    } catch (e) { return null; }
  }

  function pintar() {
    if (!_configurado) return;
    /* Un «otra página cambió tu cartera» que ya no es cierto (crm.html la
       recargó sola) no se queda puesto hasta la vuelta siguiente. */
    if (_ultimo && !_enVuelta && (_ultimo.fase === 'sello-roto' || _ultimo.fase === 'otra-pestana')) {
      var ahoraP = puerta();
      if (ahoraP !== _ultimo.fase) _ultimo = ahoraP === 'ok' ? null : { fase: ahoraP, cuando: iso() };
    }
    var r = resumen(), t = textoCinta(r);
    var cinta = asegurarCinta();
    try {
      if (cinta) {
        if (t.fase === 'apagado') { cinta.innerHTML = ''; cinta.className = 'hist-cinta'; }
        else { cinta.className = 'hist-cinta ' + t.clase; cinta.innerHTML = '<b>📲 ' + t.l1 + '</b>' + t.l2; }
      }
    } catch (e) { /* la de Ajustes sigue */ }
    var barra = cfg.barra;
    try {
      if (barra) {
        if (t.fase === 'apagado') { barra.innerHTML = ''; return; }
        var tono = t.clase === 'mal' ? 'warn hist-barra mal' : t.clase === 'ojo' ? 'warn hist-barra' : t.clase === 'calma' ? 'ok hist-barra' : 'info hist-barra';
        barra.innerHTML = '<div class="alerta ' + tono + '" role="button" tabindex="0" onclick="HistorialesAuto.accion()">' +
          '<b>📲 ' + t.l1 + '</b><div class="l2">' + t.l2 + '</div>' +
          '<div class="l3">Los historiales de tus clientes suben solos desde la primera vez que tocas «☁ Subir historiales» ' +
          'en este computador: al entrar, tras 90 s sin cambios, al volver la señal y cada 30 min. Sube solo el cliente ' +
          'que cambió; las cifras del grupo se refrescan para todos cada 6 h. El botón sube a todos ya, y es el único ' +
          'que cambia un código que regeneraste. Dos fichas con el mismo celular o la misma cédula no suben hasta que ' +
          'las corrijas: la nube las tomaría por la misma persona. · versión ' + esc(VERSION) + '</div></div>';
      }
    } catch (e) { /* nada más que hacer */ }
  }
  function pintarPronto() {
    if (_pintarT != null) return;
    _pintarT = programar(function () { _pintarT = null; pintar(); }, 400);
  }

  /* El clic hace lo que la línea dice que hace. */
  function irAjustes() { try { if (cfg.irAjustes) cfg.irAjustes(); } catch (e) { /* sigue */ } }
  function accion() {
    if (_apagado || !_configurado) return Promise.resolve(estado());
    var f = textoCinta(resumen()).fase;
    /* El botón está en Ajustes; la línea no se lo salta. */
    if (f === 'primera-vez') { irAjustes(); pintar(); return Promise.resolve(estado()); }
    /* Con el freno puesto, el clic NO prueba: cada intento con la clave mala
       es uno de los 10 que la nube le da a todos cada 15 min. Lleva a Ajustes,
       donde «Guardar conexión» y «🔌 Probar conexión» sí prueban ya. */
    if (f === 'clave' && frenoPuesto()) { irAjustes(); pintar(); return Promise.resolve(estado()); }
    /* Lo que no quedó guardado no sube por mucho que se toque: el aviso rojo de
       crm.html es el que tiene el botón del respaldo. */
    if (f === 'sin-guardar') { pintar(); return Promise.resolve(estado()); }
    if (f === 'sin-config' || f === 'clave' || f === 'llave' || f === 'falta-funcion') {
      irAjustes();
      /* Y prueba ya: si lo arregló en Supabase, el clic es el reintento. Sin
         conexión configurada no sale ninguna llamada. */
      return vuelta(true);
    }
    if (f === 'sello-roto') {
      try { if (cfg.recargar) cfg.recargar(); } catch (e) { /* la puerta lo vuelve a mirar */ }
      return vuelta(true);
    }
    if (f === 'otra-pestana') {
      try { if (cfg.retomarSello) cfg.retomarSello(); } catch (e) { /* idem */ }
      return vuelta(true);
    }
    return vuelta(true);
  }

  /* =========================================================================
   * CUÁNDO
   * =======================================================================*/
  function algoCambio() {
    if (_apagado || !_configurado) return;
    _cambio = true;
    desprogramar(_quietud);
    _quietud = programar(function () { _quietud = null; vuelta(false); }, QUIETUD_MS);
    pintarPronto();
  }

  /* «Guardar conexión» y «🔌 Probar conexión» en Ajustes. Es una orden de Joan:
     prueba ya, aunque esté en Ajustes (que para estoyOcupado() es estar
     ocupado), y suelta la espera de 15 min de una clave rechazada. */
  function conexionCambio() {
    if (_apagado || !_configurado) return;
    if (_ultimo && /^(sin-config|clave|llave|falta-funcion|sin-llegar)$/.test(_ultimo.fase)) _ultimo = null;
    _freno = null;
    desprogramar(_primera);
    _primera = programar(function () { _primera = null; vuelta(true); }, 1500);
    pintarPronto();
  }

  function escuchar() {
    var w = ventana();
    if (!w || typeof w.addEventListener !== 'function') return;
    w.addEventListener('online', function () { if (!_apagado) vuelta(false); });
    w.addEventListener('offline', function () { if (!_apagado) pintar(); });
    w.addEventListener('storage', function (ev) {
      if (_apagado || !ev) return;
      /* OTRA PÁGINA ESCRIBIÓ LA CARTERA (traer.html, subir.html, otra pestaña;
         `key` null es un localStorage.clear()). crm.html la recarga sola si
         Joan no está en medio de algo; acá se arma el mismo reloj de 90 s que
         tras un guardar(): sin esto la línea decía «nada esperando subir»
         hasta la vuelta de 30 min, con clientes cambiados. Si la recarga
         todavía no pasó, la vuelta lo verá (sello-roto) y lo dirá. */
      if (ev.key === LLAVE_CARTERA || ev.key === null) { algoCambio(); return; }
      /* Lo que sube la otra pestaña se ve acá también. */
      if (ev.key === LLAVE_ESTADO || ev.key === LLAVE_SELLO || ev.key === LLAVE_DUENO_HIST) pintarPronto();
    });
  }

  /**
   * crm.html llama esto DENTRO de entrar(), después del PIN, y nunca en modo
   * equipo. Recibe:
   *   barra       el div #historialesBarra de Ajustes
   *   lote        loteMigracion: con `true` marca cada paquete con su socioId
   *   cuantos     () => cuántos clientes tiene la cartera (para decir cuántos
   *               no suben por no tener celular ni cédula)
   *   conexion    sbCfg: {url, anon, clave}
   *   ocupado     estoyOcupado
   *   equipo      () => ¿esta pestaña está en modo equipo?
   *   sinGuardar  () => ¿el último guardar() no entró al disco? (7-oct, 2ª vuelta)
   *   sello, huella, retomarSello, recargar   el contrato del sello, el mismo
   *               que recibe nube-crm.js
   *   irAjustes   () => irA('cfg')
   *   normalizarCodigo   MotorReglas.normalizarCodigoAcceso
   */
  function configurar(c) {
    if (_apagado) return api;
    cfg = objeto(c);
    if (_configurado) { pintar(); return api; }
    if (esEquipo()) { apagar(); return api; }
    _configurado = true;
    ponerEstilo();
    escuchar();
    _reloj = cadaRato(function () {
      if (_apagado || _enVuelta) return;
      try { if (puerta() === 'ok') latir(); } catch (e) { /* la vuelta lo vuelve a mirar */ }
      pintar();
    }, RELOJ_MS);
    _periodico = cadaRato(function () { if (!_apagado && !_enVuelta) vuelta(false); }, REVISION_MS);
    pintar();
    _primera = programar(function () { _primera = null; vuelta(false); }, PRIMERA_MS);
    return api;
  }

  /* modoEquipo() lo apaga con una línea suya, y se queda apagado. */
  function apagar() {
    _apagado = true;
    [_quietud, _primera, _reintento, _ocupadoT, _pintarT].forEach(desprogramar);
    _quietud = _primera = _reintento = _ocupadoT = _pintarT = null;
    pararRato(_reloj); pararRato(_periodico); _reloj = _periodico = null;
    try { soltarLatido(); } catch (e) { /* nada */ }
    try { var d = documento(), c = d && d.getElementById && d.getElementById('histCinta'); if (c && c.parentNode) c.parentNode.removeChild(c); } catch (e) { /* nada */ }
    try { if (cfg.barra) cfg.barra.innerHTML = ''; } catch (e) { /* nada */ }
  }

  /* Para las pruebas y para quien quiera esperar la vuelta en curso. */
  function listo() { return _promesa ? _promesa.then(function () { return estado(); }) : Promise.resolve(estado()); }

  var api = {
    VERSION: VERSION,
    configurar: configurar,
    configurado: function () { return _configurado && !_apagado; },
    /* ¿Joan ya tocó el botón en este computador? (probarSupabase lo pregunta
       para no prometer «suben solos desde ya» cuando todavía no.) */
    habilitado: function () { return !!leerEstado().habilitado; },
    algoCambio: algoCambio,
    conexionCambio: conexionCambio,
    carteraReemplazada: carteraReemplazada,
    vuelta: vuelta,
    subirTodo: subirTodo,
    estado: estado,
    accion: accion,
    apagar: apagar,
    listo: listo,
    /* Las piezas puras, para pruebas/historiales-auto*.test.js. */
    _puro: {
      LLAVE_ESTADO: LLAVE_ESTADO, LLAVE_DUENO_HIST: LLAVE_DUENO_HIST, POR_PEDAZO: POR_PEDAZO, QUIETUD_MS: QUIETUD_MS,
      GRUPO_MS: GRUPO_MS, REINTENTO_MS: REINTENTO_MS, REINTENTO_CLAVE_MS: REINTENTO_CLAVE_MS, PRIMERA_MS: PRIMERA_MS,
      LIMITE_MS: LIMITE_MS,
      planDeSubida: planDeSubida, textoCinta: textoCinta, textoDeFallo: textoDeFallo, clasificar: clasificar,
      huella: huella, huellaPaquete: huellaPaquete, escribirTexto: escribirTexto, loDe: loDe
    }
  };
  return api;
});
