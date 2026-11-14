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
 *   22-oct-2026 — YA NO ES DEL BOTÓN. Joan: «quiero que se pueda automatizar
 *   todo lo que se sube a la nube». Lo que el botón protegía de verdad era una
 *   cosa: no subir una cartera VIEJA. Eso ya se puede comprobar sin preguntar,
 *   porque desde el 1-oct la cartera de Joan sube sola (nube-crm.js) y se
 *   empareja contra la nube: si este computador quedó emparejado y no hay
 *   ninguna ficha en discusión, lo que dice la cartera coincide con lo que la
 *   nube ya tenía o lo agrega, y entonces es la de hoy. La subida sola se
 *   enciende ahí misma, sola (cfg.libroAlDia → NubeCRM.libroAlDia). Mientras
 *   espera, la línea dice QUÉ espera y qué va a pasar, sin botón. Importar un
 *   respaldo sigue pausando. El botón queda en Ajustes → Avanzado para el
 *   caso raro (un computador sin sesión de la nube que igual quiere subir ya).
 *
 *   23-oct-2026 — «EMPAREJADA Y SIN DISCUSIÓN» NO ERA «LA DE HOY». Aquí decía
 *   que una cartera vieja no pasaba porque «la nube tiene algo que ella no y
 *   eso queda en discusión». No: lo que SOLO está en la nube (el crédito
 *   nuevo que un respaldo viejo no tiene) nunca entra en discusión, y un
 *   origen viejo emparejado hace semanas no choca con nada porque no tiene
 *   nada que subir. Los dos encendían esto solo y le subían al cliente su
 *   deuda sin ese crédito o sin ese abono. Ahora NubeCRM.libroAlDia dice «sí»
 *   solo si, además, una comparación con la nube hecha en ESTA sesión no
 *   encontró nada más nuevo allá que acá. Si lo encontró, la línea lo dice
 *   («la nube tiene N fichas más nuevas») y manda a juntarlas en ☁ Subir.
 *
 * 14-nov-2026 — CLIENTE POR CLIENTE, Y LA FICHA QUE JOAN ESTÁ JUNTANDO.
 *   Con 23 fichas en discusión (tocadas aquí y en el celular) esta pieza no
 *   le subía a NADIE, y el toque de «Juntar y desembolsar» de un cliente se
 *   quedaba sin su ficha arriba: Joan no podía registrar el crédito que el
 *   cliente ya había aceptado. Joan: «eso de subir a la nube manualmente
 *   quítalo, quiero que sea automático». Dos cambios:
 *   1. Mientras la cartera no está comprobada entera, la vuelta pregunta
 *      cliente por cliente (cfg.libroPorCliente → NubeCRM.libroPorCliente, la
 *      misma pregunta con que el equipo se publica desde el 22-oct): suben
 *      solos los que coinciden con la nube o solo le agregan, y esperan los
 *      que tienen algo en discusión o algo más nuevo allá. Lo que no se puede
 *      atar a un cliente (un ajuste en discusión, que le cambia la cuenta a
 *      todos) los frena a todos, como antes. Subir así NO enciende la subida
 *      para siempre (habilitado): cada vuelta vuelve a preguntar, hasta que la
 *      cartera entera quede comprobada.
 *   2. subirUna(socioId): la ficha del cliente que Joan está juntando sube
 *      aunque esté en discusión, porque es Joan quien actúa sobre ESE cliente
 *      y es aquí donde le va a registrar el crédito. Sube solo esa —un
 *      respaldo viejo no le cambia nada a nadie más— y con todas las demás
 *      puertas: el sello, lo no guardado, la señal, la conexión, el freno de
 *      la clave (no lo salta: cada intento gasta el de todos) y una cartera ya
 *      emparejada con la nube. Lo de la nube no se toca: la discusión sigue
 *      para que Joan la decida cuando quiera, y el cuadro de crm.html le dice
 *      antes que la app del cliente va a mostrar lo de este computador.
 *   La revisión adversaria del mismo día (antes de publicar) encontró cuatro
 *   cosas aquí, y quedaron así:
 *   · Los que esperan no viajan, pero la reja de LA FILA QUE OTRA FICHA
 *     TODAVÍA OCUPA los sigue viendo (planDeSubida, o.fuera). Quitarlos del
 *     plan ya armado dejaba subir a la ficha cuyo celular es la llave de la
 *     que espera, y la nube le quitaba la fila (su unión y su chat).
 *   · SUELTAS: la ficha que Joan juntó (subirUna, o soltar desde crm.html al
 *     juntar su cuenta) deja de esperar. Si no, el crédito que se le registra
 *     enseguida no le llegaba a su app hasta decidir TODO en ☁ Subir. Sube
 *     también cuando esperan todos (subirSueltas), ella sola. Vale 12 horas
 *     (SUELTA_MS): sin caducar, lo que Joan le cobraba después en el celular
 *     quedaba debajo de lo de este computador para siempre.
 *   · Quien trajo a uno de los que esperan también espera: su paquete cuenta
 *     si su referido pagó, con la ficha de acá, que es la que no coincide.
 *   · libroCambio no vuelve a preguntar lo ya dicho: con un ajuste en
 *     discusión, cada repintada traía la nube entera cada 5 min, para nada.
 *   Y la segunda revisión (el mismo día, antes de publicar), cinco más:
 *   · Con la pausa de un RESPALDO importado no se sube cliente por cliente:
 *     esperan todos, como antes (solo suben las sueltas). Cada paquete lleva
 *     las cifras del grupo y los referidos de la cartera ENTERA, y con un
 *     respaldo viejo los que «coinciden» subían con lo del respaldo: a todos
 *     les bajaba «créditos pagados», y a quien trajo a alguien que el respaldo
 *     no tiene, su referido pagado y sus 5.000 de garantía.
 *   · La suelta caduca a las 12 horas (SUELTA_MS, arriba).
 *   · Un respaldo que entra mientras una subida está en el aire: lo que
 *     contesta la nube era de la cartera de antes y no se anota (ni huella ni
 *     suelta) en la importada. Se ve por `reemplazos`, que va en el estado
 *     guardado para que lo vea también otra pestaña; y soltar(id, llave) solo
 *     suelta si esa llave sigue siendo la confirmada.
 *   · LA FILA QUE OTRA FICHA TODAVÍA OCUPA, también para la ficha SIN cédula
 *     (planDeSubida y subirUna): su upsert cae en la fila de su celular, y si
 *     esa es la llave con que otra ficha vive hoy en la nube, la cuenta de la
 *     otra pasaba a ver su nombre y su deuda. Espera siempre. Lo que el
 *     cliente solo no cierra (cuando la otra sube con su llave nueva, su fila
 *     vieja se queda en la nube con su unión, y este computador ya no la
 *     recuerda) lo cierra una migración de sincronizar_socios que no está
 *     aplicada: PLAN-FILA-SIN-CEDULA.md.
 *   · Quien «trajo» a uno de los que esperan cuenta solo si es una ficha de
 *     esta cartera: borrar una ficha no limpia el referidoPor de sus referidos.
 *   Y esSuelta(id), para que crm.html diga cuándo un crédito recién registrado
 *   todavía no le llega a la app de quien ya tenía la cuenta junta.
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
 *   · 7-oct-2026 — NO MANDA NINGÚN CÓDIGO. Joan apagó los códigos de acceso
 *     (base/20261007_una_puerta.sql): cada paquete viaja con codigo:null y
 *     codigo_forzar:false, con el botón o sin él. Lo que sigue en este punto
 *     es la regla de antes, que se queda escrita porque explica por qué la
 *     nube conserva el código viejo (el coalesce) y por qué ya no hay
 *     «retenidos» en la línea:
 *     NO CAMBIA EL CÓDIGO DE NADIE. La subida automática manda siempre
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
/* 23-oct-2026 — LA FIRMA DE LLEGADA. Las páginas piden este archivo con la
   versión en la dirección (…?v=139) y, antes de arrancar su bloque grande,
   miran que haya firmado aquí. Sin la firma, lo que corrió no es este archivo:
   no llegó, o el service worker contestó otra cosa (el v138, sin señal,
   contesta index.html a lo que no guardó), o una caché dio el de antes, que
   no tiene esta línea. Entonces la página dice que se recargue en vez de
   escribir con piezas de dos versiones.
   Va PRIMERO a propósito: firma que llegó ESTE archivo. Si más abajo algo
   revienta en algún teléfono, eso no es mezclar versiones, y la página sigue
   como siempre (cada una se protege sola sin el módulo); con la firma al
   final, ese teléfono quedaría frenado en «recarga» para siempre. En Node no
   hay document y no hace nada. Ver «¿LLEGÓ LO QUE PEDÍ?» en las páginas y la
   nota de v139 en sw.js. */
(function () { try { var s = document.currentScript; if (s && s.src) (window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1; } catch (e) {} })();

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = { crear: fabrica }; return; }
  if (!raiz) return;
  /* Si esto revienta al cargar, el botón manual sigue donde estaba y la
     comprobación de crm.html (1,5 s después) dice que no cargó. */
  try { raiz.HistorialesAuto = fabrica({}); } catch (e) { /* el botón sigue */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (entorno) {
  'use strict';

  var VERSION = '2026-11-14';
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
  /* 22-oct-2026 — cuando la nube contesta mal o no se alcanza CON internet,
     la espera crece: 3, 6, 12, 24 y después cada 30 min. Sin señal se queda en
     3 (lo que falla ahí es el wifi, no la nube, y el aviso `online` ayuda). */
  var REINTENTO_TOPE_MS = 30 * 60000;
  /* Un casillero del freno de clave_ok. Ver LA CLAVE EQUIVOCADA, arriba. */
  var REINTENTO_CLAVE_MS = 15 * 60000;
  var GRUPO_MS = 6 * 3600000;
  /* Cuánto vale una SUELTA desde que Joan la juntó (ver LA SUELTA CADUCA, en
     porCliente): lo que se le registra ese día, no lo que venga después. */
  var SUELTA_MS = 12 * 3600000;
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
      /* Cuándo se encendió la subida sola en este computador. Sin esto no
         arranca. 22-oct-2026: la enciende la propia vuelta en cuanto la
         cartera está comprobada (YA NO ES DEL BOTÓN), o el botón de Avanzado. */
      habilitado: e.habilitado || null,
      /* 22-oct-2026 — quién la encendió: 'solo' (la cartera quedó emparejada
         sin discusión) o 'boton' (Ajustes → Avanzado). La barra lo dice. */
      habilitadoPor: e.habilitadoPor || null,
      /* Por qué se pausó, si se pausó: {motivo:'respaldo', en}. */
      pausa: e.pausa || null,
      /* 14-nov-2026 (revisión) — LAS QUE JOAN JUNTÓ: {socioId: iso}. Ver
         SUELTAS, en porCliente. Un respaldo importado las olvida (carteraReemplazada). */
      sueltas: objeto(e.sueltas),
      /* 14-nov-2026 (verificación) — cuántas carteras enteras entraron (un
         respaldo): carteraReemplazada lo sube. Una subida que salió antes y
         contesta después ya no anota nada (subir). En el estado y no en
         memoria: el respaldo puede entrar por otra pestaña. */
      reemplazos: num(e.reemplazos)
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
     (s.codigoAcceso): esta huella no expone nada que no esté ahí.
     7-oct-2026: ya no se usa para decidir nada (ningún código viaja); se
     queda porque las huellas guardadas en joan_crm_historiales la llevan. */
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
      /* 14-nov-2026 (revisión) — LOS QUE ESPERAN (o.fuera, CLIENTE POR CLIENTE)
         no viajan, pero SIGUEN en `todos`: la reja de LA FILA QUE OTRA FICHA
         TODAVÍA OCUPA (abajo) tiene que verlos. Quitarlos después del plan,
         como se hacía, dejaba subir sola a la ficha cuyo celular es la llave
         con que la que espera vive en la nube, y la nube le quitaba la fila
         (su unión y su chat) a la que espera. `o.solo`, al revés: viajan
         solo esas (subirSueltas), con la misma reja. */
      if (objeto(o.fuera)[id]) return;
      if (o.solo && !objeto(o.solo)[id]) return;
      /* 7-oct-2026 — NINGÚN CÓDIGO VIAJA, ni solo ni con el botón. Joan apagó
         los códigos de acceso (base/20261007_una_puerta.sql): el cliente entra
         con su celular y su contraseña, y la nube ya no deja usar un código
         para nada. Mandar uno solo serviría para sembrar una llave muerta. Se
         manda null y codigo_forzar:false siempre —sincronizar_socios conserva
         lo que tenga, con su `coalesce`— y los paquetes siguen subiendo igual.
         Por eso tampoco hay «retenidos»: ya no hay un código que esperar. La
         lista se sigue devolviendo vacía para no cambiarle la forma al plan. */
      var retenido = false;
      var h = huellaPaquete(x), g = huellaGrupo(x);
      var item = {
        cedula: texto(x.cedula), telefono: texto(x.telefono), nombre: x.nombre || 'Socio',
        codigo: null,
        codigo_forzar: false,
        datos: x.datos
      };
      /* `k`: la llave con que el cliente queda viviendo en la nube. Sirve para
         saber qué fila ocupa todavía y si la está estrenando. */
      var nuevo = { h: h, c: rec ? texto(rec.c) : '', g: g, k: t.ident };
      var e = { id: id, nombre: texto(x.nombre) || 'Socio', item: item, rec: nuevo, retenido: retenido,
                ident: t.ident, cel: t.cel, migra: !!(rec && rec.k && rec.k !== t.ident) };
      var propio = !rec || rec.h !== h || rec.k !== t.ident;
      if (o.manual || propio) propios.push(e);
      else if (rec.g !== g) grupo.push(e);
    });
    var tg = Date.parse(o.grupoEn || '');
    var grupoListo = grupo.length > 0 && (isNaN(tg) || (num(o.ahora) - tg) >= GRUPO_MS);
    var enviar = propios.concat(grupoListo ? grupo : []);

    /* LA FILA QUE OTRA FICHA TODAVÍA OCUPA. Si X cae en la fila con que OTRA
       ficha Y vive hoy en la nube (la llave que la nube le confirmó, rec.k),
       le roba esa fila. Cae de dos maneras:
         · su upsert, en la fila de SU llave (X sin cédula: su celular). La
           nube conserva la unión de la fila (el coalesce del on conflict) y le
           pone encima el nombre y los datos de X: la cuenta de Y pasa a ver la
           ficha de X. Ninguna subida le libera antes esa fila (la mudanza de Y
           lee la fila de SU celular de hoy, y si fuera esta, X y Y ya chocan
           por 'celular'): X espera siempre.
         · su mudanza (X con cédula), que lee y BORRA la fila de su celular: la
           nube le corta la unión a Y (20261007c) y se lleva la fila. Basta con
           que Y la mude antes, y eso pasa solo si Y viaja en esta subida CON
           ESE celular hoy (sincronizar_socios lee `where cedula = cel`, el
           celular de hoy) y va primero (abajo). Si no, X espera.
       14-nov-2026 (verificación) — antes solo se miraba el celular de X con
       cédula, y bastaba con que Y viajara: X sin cédula caía en la fila (y la
       unión) de la que espera, y Y con otro celular no liberaba nada. */
    var ocupada = {}, celDe = {}, van = {}, fila = {}, antes = {}, porCedula = {};
    todos.forEach(function (t) { celDe[t.id] = t.cel; if (t.rec && t.rec.k) ocupada[t.rec.k] = t.id; });
    enviar.forEach(function (e) { van[e.id] = true; });
    enviar.forEach(function (e) {
      var suya = ocupada[e.ident];
      if (suya != null && suya !== e.id) { fila[e.id] = suya; porCedula[e.id] = e.ident !== e.cel; return; }
      var otro = (e.cel && e.cel !== e.ident) ? ocupada[e.cel] : null;
      if (otro == null || otro === e.id) return;
      if (van[otro] && celDe[otro] === e.cel) antes[e.id] = otro;
      else fila[e.id] = otro;
    });
    /* Si la que tenía que mudar la fila espera, la que la necesitaba también. */
    for (var sigue = true; sigue;) {
      sigue = false;
      Object.keys(antes).forEach(function (x) { if (fila[antes[x]] && !fila[x]) { fila[x] = antes[x]; sigue = true; } });
    }
    if (Object.keys(fila).length) {
      var libre = function (e) { return !fila[e.id]; };
      enviar.forEach(function (e) {
        if (fila[e.id]) chocan.push({ id: e.id, nombre: e.nombre, motivo: 'fila', con: fila[e.id], cual: porCedula[e.id] ? 'cedula' : 'celular' });
      });
      propios = propios.filter(libre); grupo = grupo.filter(libre);
      retenidos = retenidos.filter(libre); enviar = enviar.filter(libre);
    }
    /* Las que estrenan llave, primero: mudan su fila antes de que la reclame
       otra con ese celular (sincronizar_socios va en orden, en una sola
       transacción por pedazo, y los pedazos van uno tras otro). Y antes que
       todas, la que libera la fila que otra de esta subida necesita: si las
       dos estrenaban llave, iban en el orden de la cartera. (La que libera
       nunca necesita a otra: su celular es su propia fila vieja.) */
    var libera = {};
    Object.keys(antes).forEach(function (x) { if (!fila[x]) libera[antes[x]] = true; });
    enviar = enviar.filter(function (e) { return libera[e.id]; })
      .concat(enviar.filter(function (e) { return !libera[e.id] && e.migra; }))
      .concat(enviar.filter(function (e) { return !libera[e.id] && !e.migra; }));
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
    /* 14-nov-2026 — los que la vuelta dejó esperando (CLIENTE POR CLIENTE): la
       línea no dice «al día» sin contarlos. */
    var ap = objeto(x.apartados), nAp = num(ap.n);
    /* (revisión) quien trajo a uno de ellos espera por eso, no por su ficha:
       se cuenta aparte, o la línea decía que su ficha no coincide. */
    var nTrajo = Math.min(num(ap.trajo), nAp), nDir = nAp - nTrajo;
    /* (segunda revisión, 14-nov) Esta frase culpa al celular, y no hace falta
       otra para el respaldo: con la pausa de un respaldo importado nadie se
       aparta cliente por cliente (vuelta), así que aquí no llega. La línea dice
       «Importaste un respaldo» y el «Ojo» del cuadro de crm.html nombra la
       causa (delRespaldoSinComprobar). */
    if (nDir) {
      extra += ' · ' + (nDir === 1 ? 'espera 1 cliente cuya ficha' : 'esperan ' + nDir + ' clientes cuyas fichas') +
        (ap.motivo === 'nube-mas-nueva'
          ? (nDir === 1 ? ' tiene' : ' tienen') + ' algo más nuevo en la nube (lo del celular): ' + (nDir === 1 ? 've' : 'ven') +
            ' lo último que subió hasta que lo juntes en <a href="subir.html" target="_blank" rel="noopener">☁ Subir</a> (paso 6)'
          : ' no ' + (nDir === 1 ? 'coincide' : 'coinciden') + ' con la nube (' + (nDir === 1 ? 'la tocaste' : 'las tocaste') +
            ' aquí y en el celular): ' + (nDir === 1 ? 've' : 'ven') + ' lo último que subió hasta que elijas en ' +
            '<a href="subir.html" target="_blank" rel="noopener">☁ Subir</a> (paso 7)') +
        '; si juntas su cuenta, su ficha sube igual';
    }
    if (nTrajo) {
      extra += ' · ' + (nTrajo === 1 ? 'espera 1 cliente que trajo a otro' : 'esperan ' + nTrajo + ' clientes que trajeron a otros') +
        ' con la ficha por decidir: su garantía cuenta si ' + (nTrajo === 1 ? 'ese referido pagó' : 'esos referidos pagaron') +
        ', y eso se sabe cuando decidas';
    }
    /* (revisión) mientras los demás esperan, las fichas que juntaste suben. */
    var nSu = (u.fase === 'esperando-libro' && LIBRO_EMPAREJADO[texto(u.motivo)]) ? num(x.sueltas) : 0;
    if (nSu) {
      extra += ' · ' + (nSu === 1 ? 'la ficha del cliente que juntaste sube igual' : 'las fichas de los ' + nSu + ' clientes que juntaste suben igual');
    }
    var cola = (n ? ' · ' + esperan : '') + extra;
    var hayQueVer = pl && (num(pl.retenidos) || num(pl.chocan) || nAp);

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
    if (u.fase === 'esperando-libro') {
      /* 22-oct-2026 — antes «toca ☁ Subir historiales una vez». Ya no se toca
         nada: se dice qué falta comprobar y qué va a pasar (YA NO ES DEL
         BOTÓN, arriba). */
      var resp = u.pausa === 'respaldo';
      var falta = {
        'sin-conectar': 'Para comprobarlo, este computador tiene que estar conectado a la nube con tu correo (<a href="subir.html" target="_blank" rel="noopener">☁ Subir</a>, paso 1)',
        'en-discusion': 'Hay ' + plural(num(u.congeladas) || 1, 'ficha', 'fichas') + ' de tu cartera en discusión con la nube: en cuanto decidas en <a href="subir.html" target="_blank" rel="noopener">☁ Subir</a> (paso 7), suben solos',
        'libro-distinto': 'La nube tiene otra cartera: decide en la línea ☁ de tu cartera y después suben solos',
        'sello-roto': 'Otra página cambió tu cartera: recarga esta pestaña y suben solos',
        'otra-pestana': 'Los sube la otra pestaña del CRM, que es la que está emparejada',
        'sin-modulo': 'No cargó la subida de la cartera (nube-crm.js), que es la que lo comprueba: recarga con Ctrl+Shift+R',
        'cartera-ilegible': 'No pude leer tu cartera guardada: exporta un respaldo desde Ajustes antes de tocar nada',
        /* 23-oct-2026 — ver «EMPAREJADA Y SIN DISCUSIÓN» NO ERA «LA DE HOY», arriba.
           Y solo cuenta lo de ESTA cartera: las fichas de otra cartera sobre
           la que Joan emparejó con su sí no llegan aquí (nube-crm.js, LO QUE
           ERA DE LA OTRA CARTERA). Si llegaran, «más nuevas» sería falso y
           «júntalas» mezclaría los clientes de la otra con los de esta. */
        'nube-mas-nueva': 'La nube tiene ' + plural(num(u.fichas) || 1, 'ficha más nueva', 'fichas más nuevas') +
          ' que esta cartera (lo que cobraste desde el celular, o lo que un respaldo viejo no alcanzó a tener). ' +
          'No subo hasta que las juntes con lo tuyo en <a href="subir.html" target="_blank" rel="noopener">☁ Subir</a> (paso 6, «Aplicar»): después suben solos',
        'comparando': 'Estoy comparando tu cartera con lo que hay en la nube; si allá no hay nada más nuevo, suben solos',
        'sin-comparar': 'No pude comparar tu cartera con la nube (' + esc(u.detalle || 'la nube no contestó') + ')' +
          (num(u.espera) ? ': pruebo otra vez sola en ' + Math.max(1, Math.round(num(u.espera) / 60000)) + ' min' : ''),
        'navegador-lleno': 'El navegador está lleno y no pude terminar de emparejar tu cartera con la nube: exporta un respaldo desde Ajustes y libera espacio'
      }[u.motivo] || 'Estoy emparejando tu cartera con la nube; en cuanto termine, suben solos';
      return c('esperando-libro', u.motivo === 'sin-modulo' || u.motivo === 'cartera-ilegible' || u.motivo === 'navegador-lleno' ? 'mal' : 'ojo',
        resp ? 'Importaste un respaldo: los historiales vuelven a subir solos en cuanto compruebe que es tu cartera de hoy'
             : 'Los historiales empiezan a subir solos en cuanto compruebe que esta es tu cartera de hoy',
        falta + ' · así una cartera vieja abierta en otro navegador no le cambia a tus clientes lo que ya ven' +
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
    /* 22-oct-2026 — los dos fallos de la nube, en ROJO y con la espera de
       verdad (crece con cada fallo seguido: programarReintento). */
    var enMin = 'pruebo otra vez en ' + Math.max(1, Math.round((num(u.espera) || REINTENTO_MS) / 60000)) + ' min';
    if (u.fase === 'error') {
      return c('error', 'mal', 'No pude subir: ' + esperan,
        esc(u.motivo || 'La nube no contestó bien.') + ' · ' + enMin + ' · si sigue, revisa el internet o toca 🔌 Probar conexión en Ajustes · clic para reintentar ya' + extra);
    }
    if (u.fase === 'sin-llegar' && x.enLinea !== false) {
      return c('sin-llegar', 'mal', 'No pude llegar a la nube' + (n ? ': ' + esperan : ''),
        '¿Hay internet? Si hay, revisa la URL en Ajustes y toca 🔌 Probar conexión · ' + enMin + ' · clic para reintentar ya' + extra);
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
    return c('al-dia', hayQueVer ? 'ojo' : 'calma', venAlDia + (nAp ? ', menos ' + plural(nAp, 'cliente', 'clientes') : ''),
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
  /* 14-nov-2026 — los clientes que la última vuelta dejó esperando (CLIENTE
     POR CLIENTE, arriba): {ids, n, motivo, congeladas, fichas}, o null. */
  var _apartados = null;
  var _quietud = null, _primera = null, _reintento = null, _ocupadoT = null, _pintarT = null;
  var _reloj = null, _periodico = null;

  function esEquipo() { try { return !!(cfg.equipo && cfg.equipo()); } catch (e) { return true; } }
  /* Si no sabe, dice que SÍ (la regla de estoyOcupado en crm.html): se aplaza. */
  function ocupado() { try { return !!(cfg.ocupado && cfg.ocupado()); } catch (e) { return true; } }
  /* ¿El último guardar() no entró? Si no sabe, dice que no: crm.html es quien
     lo sabe, y una pestaña sin ese enganche se comporta como antes. */
  function sinGuardar() { try { return !!(cfg.sinGuardar && cfg.sinGuardar()); } catch (e) { return false; } }
  /* 22-oct-2026 — ¿la cartera es la de hoy? La contesta nube-crm.js (crm.html
     la pasa como cfg.libroAlDia). Si no hay quién conteste, dice que NO: sin
     esa comprobación esto vuelve a ser subir a ciegas. */
  function libroAlDia() {
    try {
      if (typeof cfg.libroAlDia !== 'function') return { ok: false, motivo: 'sin-modulo' };
      return objeto(cfg.libroAlDia());
    } catch (e) { return { ok: false, motivo: 'sin-modulo' }; }
  }
  /* 14-nov-2026 — ¿QUIÉNES NO PUEDEN SUBIR TODAVÍA? (CLIENTE POR CLIENTE,
     arriba). Solo cuando lo que falta son fichas concretas: en discusión o más
     nuevas en la nube. Devuelve {ids, n, motivo, congeladas, fichas}, o null si
     no se puede decir de quién es lo que falta (sin la pregunta, o con algo que
     no se ata a ningún cliente): entonces esperan todos, como antes. Si lo que
     falta para saberlo es la comparación con la nube (viene en camino, o falló
     y espera), devuelve {ids: null, motivo, espera, detalle}: la línea dice eso,
     que es lo que de verdad se espera, y no «decide en ☁ Subir». */
  function porCliente(lib) {
    var m = texto(objeto(lib).motivo);
    if (m !== 'en-discusion' && m !== 'nube-mas-nueva') return null;
    if (typeof cfg.libroPorCliente !== 'function') return null;
    var r;
    try { r = objeto(cfg.libroPorCliente()); } catch (e) { return null; }
    var rm = texto(r.motivo);
    if (rm === 'comparando' || rm === 'sin-comparar') return { ids: null, motivo: rm, espera: num(r.espera), detalle: texto(r.detalle) };
    if (r.ok || (rm !== 'en-discusion' && rm !== 'nube-mas-nueva')) return null;
    if (num(r.sinCliente)) return null;
    /* SUELTAS (revisión del 14-nov) — la ficha que Joan juntó (subirUna la
       subió, o la nube juntó su cuenta) ya muestra en su app lo de este
       computador, como le avisó el cuadro. Retenerla no protege nada: solo se
       comía el crédito que se le registra enseguida y lo que se le anote
       después. Deja de esperar hasta que la cartera quede comprobada (y
       entonces ya no espera nadie) o entre un respaldo. No se olvida cuando
       sale de la discusión: con algo que no se ata a ningún cliente esperan
       todos, y ella tiene que seguir subiendo (subirSueltas).
       LA SUELTA CADUCA (verificación del mismo día): lo de arriba vale el día
       del toque. Si después la nube recibe algo más nuevo de ese cliente (lo
       que Joan le cobra esa noche en el celular), lo de este computador ya no
       es lo último, y sin caducar no volvía a esperar nunca: al día siguiente
       subía al poner el PIN, con la comparación en camino, el crédito sin el
       pago y un día más de mora (la mora viaja hecha), cada día, y la línea
       no lo contaba. Vale SUELTA_MS (sueltasVigentes); después espera como
       cualquiera, y juntar otra vez su cuenta la vuelve a soltar. */
    var directos = objeto(r.clientes), sueltas = sueltasVigentes(leerEstado());
    var ids = {}, n = 0, trajo = 0;
    Object.keys(directos).forEach(function (k) { if (!sueltas[k]) { ids[String(k)] = true; n++; } });
    /* QUIEN LOS TRAJO también espera: su paquete cuenta si su referido pagó
       (referidos, y los 5.000 de su garantía: app/puente.js referidosDe), y
       eso sale de la ficha de ACÁ del referido, que es la que no coincide.
       Subirlo le bajaba la garantía con lo que la nube ya sabía pagado. */
    /* (segunda revisión, 14-nov) Solo si quien trajo es una ficha de esta
       cartera: borrar una ficha (va a papeleraSocios) no limpia el referidoPor
       de sus referidos, y la línea contaba como «cliente que trajo a otro» que
       espera a alguien que ya no existe ni sube («menos 2 clientes»). */
    var socios = lista(objeto(leerJSON(LLAVE_CARTERA, null)).socios), deLaCartera = {};
    socios.forEach(function (s) { if (s && s.id != null) deLaCartera[String(s.id)] = true; });
    socios.forEach(function (s) {
      var por = (s && s.referidoPor != null) ? String(s.referidoPor) : '';
      if (por && deLaCartera[por] && directos[String(s.id)] && !ids[por] && !sueltas[por]) { ids[por] = true; trajo++; }
    });
    if (!Object.keys(directos).length) return null;
    return { ids: ids, n: n + trajo, trajo: trajo, motivo: rm, congeladas: num(r.congeladas), fichas: num(r.fichas) };
  }
  /* crm.html, al juntar una cuenta (juntarCuentaEnLaNube): su ficha deja de
     esperar aunque ya hubiera subido antes (entonces subirUna no corre). Con la
     subida ya encendida no hay nadie esperando y no se anota nada. */
  /* (verificación del 14-nov) `llave`: la que la reja de juntarCuentaEnLaNube
     vio confirmada antes de llamar a la nube. Si ya no es la de este estado
     (entró un respaldo mientras la nube juntaba, y el estado olvidó las
     huellas), no se suelta nada en la cartera importada. */
  function soltar(socioId, llave) {
    var id = texto(socioId), est = leerEstado();
    if (!id || est.habilitado || sueltasVigentes(est)[id]) return;
    if (llave != null && texto(objeto(est.socios[id]).k) !== texto(llave)) return;
    est.sueltas[id] = iso();
    guardarEstado(est);
  }
  /* Las sueltas que todavía valen (LA SUELTA CADUCA, en porCliente). Las
     vencidas se quedan en el estado sin contar: juntar otra vez las renueva. */
  function sueltasVigentes(est) {
    var s = objeto(objeto(est).sueltas), out = {}, ya = ahora();
    Object.keys(s).forEach(function (k) {
      var t = Date.parse(texto(s[k]));
      if (!isNaN(t) && ya - t < SUELTA_MS) out[k] = s[k];
    });
    return out;
  }
  /* Mientras los demás esperan la comparación o la decisión (algo que no se ata
     a ningún cliente), las sueltas suben solas, ellas y nadie más. Sin cartera
     emparejada, ni una. */
  function subirSueltas(con, lib) {
    if (!LIBRO_EMPAREJADO[texto(objeto(lib).motivo)]) return null;
    var est = leerEstado(), solo = {}, hay = false;
    Object.keys(sueltasVigentes(est)).forEach(function (k) { solo[k] = true; hay = true; });
    if (!hay || sinGuardar() || !enLinea() || frenoPuesto(con)) return null;
    var plan;
    try { plan = armarPlan(false, { solo: solo }); } catch (e) { return null; }
    if (!plan.enviar.length) return null;
    return subir(plan, con, { una: true });
  }
  /* Lo que contesta NubeCRM.libroAlDia con la cartera YA emparejada con la nube
     (su fase 'lista'): con estas, la ficha que Joan junta puede subir sola
     (subirUna). Con las demás —emparejando, la nube con otra cartera, sin
     sesión, el navegador lleno— todavía no se sabe si esta cartera es la de
     hoy, y no sube ni una. */
  var LIBRO_EMPAREJADO = { 'al-dia': true, 'en-discusion': true, 'nube-mas-nueva': true, 'comparando': true, 'sin-comparar': true };
  function frenoPuesto(con) {
    var c = con || conexion();
    return !!(_freno && c.ok && _freno.claveDe === c.huellaClave &&
              ahora() - num(_freno.ms) < REINTENTO_CLAVE_MS - 1000);
  }

  /* `op` (14-nov-2026): {fuera} los que esperan, {solo} los únicos que viajan
     (ver planDeSubida), {lote} el que ya armó esta misma vuelta, para no
     armarlo dos veces. */
  function armarPlan(manual, op) {
    var o = objeto(op);
    if (!o.lote && typeof cfg.lote !== 'function') throw new Error('crm.html no le pasó el lote');
    var lote = o.lote || lista(cfg.lote(true));
    var est = leerEstado();
    var plan = planDeSubida(lote, est.socios, { manual: manual, ahora: ahora(), grupoEn: est.grupoEn, fuera: o.fuera, solo: o.solo });
    plan.lote = lote;
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
      habilitado: !!est.habilitado, habilitadoPor: est.habilitadoPor, version: VERSION, ahora: ahora(),
      apartados: _apartados ? { n: _apartados.n, trajo: num(_apartados.trajo), motivo: _apartados.motivo } : null,
      sueltas: est.habilitado ? 0 : Object.keys(sueltasVigentes(est)).length,
      /* (verificación, 14-nov) Por qué está pausada, aunque la vuelta no esté
         esperando ('respaldo' mientras el respaldo importado no quede
         comprobado): la línea y el «Ojo» de crm.html lo dicen con su causa. */
      pausa: est.habilitado ? null : (texto(objeto(est.pausa).motivo) || null)
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
  function anotar(pedazo, manual, una) {
    var est = leerEstado();
    pedazo.forEach(function (e) { est.socios[e.id] = e.rec; });
    /* 14-nov-2026 — «tus clientes ven lo de las 8:51» habla de todos: la ficha
       que sube sola (subirUna) no lo mueve. */
    if (!una) est.ultimaSubida = iso();
    /* (revisión) La que subió sola ya muestra lo de este computador: deja de
       esperar (SUELTAS, en porCliente), o el crédito que se le registra
       enseguida no le llegaba a su app. */
    if (una && !est.habilitado) pedazo.forEach(function (e) { est.sueltas[e.id] = iso(); });
    if (manual) {
      if (!est.habilitado) est.habilitadoPor = 'boton';
      est.habilitado = est.habilitado || iso(); est.pausa = null; est.sueltas = {};
    }
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

  /* 22-oct-2026 — los fallos de la nube seguidos (error, sin-llegar): con
     cada uno la espera se dobla hasta REINTENTO_TOPE_MS. Se ponen en cero en
     cuanto una vuelta sale bien. */
  var _fallosNube = 0;
  function programarReintento() {
    desprogramar(_reintento); _reintento = null;
    if (_apagado || !_ultimo) return;
    var f = _ultimo.fase, ms = 0;
    if (f === 'clave') ms = REINTENTO_CLAVE_MS;
    else if (f === 'sin-senal') ms = REINTENTO_MS;
    else if (f === 'sin-llegar' || f === 'error') {
      _fallosNube++;
      ms = Math.min(REINTENTO_TOPE_MS, REINTENTO_MS * Math.pow(2, _fallosNube - 1));
    }
    if (ms) {
      _ultimo.espera = ms;
      _reintento = programar(function () { _reintento = null; vuelta(false); }, ms);
    }
  }

  function subir(plan, con, op) {
    var manual = !!(op && op.manual);
    /* 14-nov-2026 — `una`: la ficha que Joan está juntando, sola (subirUna). No
       dice nada de los demás: ni las cifras del grupo, ni la última revisión,
       ni cuántos esperan, ni la hora de «tus clientes ven»; y lo que la línea
       esperaba antes (la cartera por comprobar) lo sigue esperando. */
    var una = !!(op && op.una);
    var envio = plan.enviar;
    /* Las cifras del grupo quedan al día para todos si esta vuelta las lleva a
       todos los que les faltaban (o no le faltaban a nadie). */
    var conGrupo = !una && (manual || plan.grupoListo || !plan.grupo.length);
    var res = { ok: false, total: envio.length, subidos: 0, aceptados: 0, confirmados: [], fase: null, motivo: '',
                chocan: plan.chocan.map(function (c) { return c.nombre; }) };
    var previo = _ultimo;
    /* (verificación del 14-nov) La cartera con que sale esta subida: ver abajo,
       antes de anotar. */
    var reemplazos0 = leerEstado().reemplazos;
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
        if (p === 'sello-roto' || (p === 'otra-pestana' && !manual && !una)) {
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
          /* (verificación del 14-nov) ENTRÓ UN RESPALDO MIENTRAS ESTE PEDAZO IBA
             EN EL AIRE: aquí (importar() de crm.html corre entero, con su
             confirm y su alert, antes de que se atienda la respuesta) o en otra
             pestaña. Lo que confirma es de la cartera de ANTES: anotarlo dejaba
             en la importada su huella y, con `una`, la SUELTA que el respaldo
             acababa de olvidar, y ya emparejado subía la ficha vieja del
             respaldo aunque estuviera en discusión. No se anota nada, y la línea
             sigue con lo que dijo carteraReemplazada. */
          if (leerEstado().reemplazos !== reemplazos0) {
            res.fase = 'reemplazada';
            res.motivo = 'Entró un respaldo mientras subía: lo que iba en camino era de la cartera de antes, y no lo cuento como subido.';
            return false;
          }
          anotar(pz, manual, una);
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
      if (res.ok && una) {
        /* Un fallo de antes (la nube caída, la clave) ya no es cierto: subió. */
        _ultimo = (previo && previo.fase === 'esperando-libro') ? previo : null;
        _fallosNube = 0;
      } else if (res.ok) {
        var est = leerEstado();
        if (conGrupo) est.grupoEn = iso();
        est.ultimaRevision = iso();
        podar(est, plan);
        guardarEstado(est);
        _ultimo = null;
        _fallosNube = 0;
      }
      return res;
    }, function (e) {
      _ultimo = { fase: 'error', motivo: 'Falló la subida (' + texto(e && e.message).slice(0, 80) + ')', cuando: iso(), ms: ahora() };
      res.fase = 'error';
      return res;
    }).then(function (r) {
      _enVuelta = false; _subiendo = 0; _promesa = null;
      if (_plan && !una) {
        var resta = Math.max(0, r.total - r.subidos);
        _plan.pendientes = manual ? (r.ok ? 0 : resta) : resta;
        if (manual && r.ok) { _plan.retenidos = 0; _plan.grupo = 0; }
        if (!manual && r.ok && conGrupo) _plan.grupo = 0;
      }
      if (!r.ok && !r.motivo) r.motivo = textoDeFallo(_ultimo || { fase: r.fase });
      if (!(una && r.ok)) programarReintento();
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
    /* 22-oct-2026 — LA PRIMERA VEZ YA NO ES DEL BOTÓN (YA NO ES DEL BOTÓN,
       arriba): se enciende sola en cuanto la cartera está emparejada con la
       nube y sin fichas en discusión. Mientras no, espera y lo dice. Ni el
       clic en la línea se salta esa comprobación: es lo que protege a los
       clientes de una cartera vieja. */
    var est0 = leerEstado(), aparte = null;
    if (!est0.habilitado) {
      var lib = libroAlDia();
      /* 14-nov-2026 — CLIENTE POR CLIENTE (arriba): si lo que falta son
         fichas de clientes concretos, suben los demás. Con la pausa de un
         respaldo importado, NO (revisión 2): el respaldo es casi siempre una
         cartera VIEJA, y cada paquete lleva las cifras del grupo y los
         referidos sacados de la cartera entera, con las fichas viejas que
         esperan y sin las que solo están en la nube. Subir a «los que
         coinciden» le bajaba a todos «créditos pagados» a lo del respaldo, y a
         quien trajo a alguien que el respaldo no tiene, su referido pagado.
         Esperan todos, como antes, hasta que la cartera quede comprobada (eso
         quita la pausa, abajo). Las que Joan junta suben igual (SUELTAS). */
      if (!lib.ok && !objeto(est0.pausa).motivo) aparte = porCliente(lib);
      if (!lib.ok && !(aparte && aparte.ids)) {
        var ver = aparte || lib;
        aparte = null;
        _apartados = null;
        _ultimo = { fase: 'esperando-libro', motivo: texto(ver.motivo), congeladas: num(lib.congeladas),
                    fichas: num(lib.fichas), espera: num(ver.espera), detalle: texto(ver.detalle),
                    pausa: texto(objeto(est0.pausa).motivo) };
        /* (revisión) Las que Joan juntó suben igual, ellas solas (SUELTAS, en
           porCliente): aquí iba a esperar también el crédito que acaba de
           registrarles. La línea sigue diciendo lo que esperan los demás. */
        var van = subirSueltas(con, lib);
        pintar();
        return van ? van.then(function () { return estado(); }) : Promise.resolve(estado());
      }
      if (lib.ok) {
        est0.habilitado = iso();
        est0.habilitadoPor = 'solo';
        est0.pausa = null;
        est0.sueltas = {};   // ya no espera nadie: no hay nada que soltar
        guardarEstado(est0);
      }
    }
    _apartados = aparte;
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

    /* 14-nov-2026 — los que esperan no viajan, ni por sus cifras del grupo: lo
       de la nube puede ser más nuevo que lo de acá (ver CLIENTE POR CLIENTE). */
    if (aparte) {
      /* (revisión) Se arma de nuevo con ellos fuera, no se filtra: así la reja
         de la fila ocupada los ve (planDeSubida, o.fuera). Mismo lote. */
      try { plan = armarPlan(false, { fuera: aparte.ids, lote: plan.lote }); }
      catch (e) {
        _ultimo = { fase: 'error', motivo: 'No pude armar los paquetes de tus clientes (' + texto(e && e.message).slice(0, 80) + ')',
                    cuando: iso(), ms: ahora() };
        pintar();
        return Promise.resolve(estado());
      }
      _plan = resumirPlan(plan, false);
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
   * código regenerado, y enciende la subida sola en este computador aunque la
   * cartera no esté comprobada (22-oct-2026: vive en Ajustes → Avanzado, para
   * el computador sin sesión de la nube).
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

  /**
   * 14-nov-2026 — LA FICHA QUE JOAN ESTÁ JUNTANDO, SOLA (CLIENTE POR CLIENTE,
   * arriba). La llama el toque de crm.html antes de juntar la cuenta del
   * cliente con su ficha: sin su fila en la nube no hay con qué juntarla.
   * Devuelve lo mismo que subirTodo; `fase` dice por qué no subió.
   */
  function subirUna(socioId) {
    var id = texto(socioId);
    function fallo(fase, motivo) {
      return { ok: false, fase: fase, total: 0, subidos: 0, aceptados: 0, confirmados: [], chocan: [],
               motivo: motivo || textoDeFallo({ fase: fase }) };
    }
    if (_apagado || !_configurado) return Promise.resolve(fallo('apagado'));
    if (_enVuelta && _promesa) return _promesa.then(function () { return subirUna(id); });
    if (esEquipo()) { apagar(); return Promise.resolve(fallo('apagado')); }
    /* «otra-pestana» sí deja, como el botón: Joan está tocando en ESTA. */
    var p = puerta();
    if (p === 'sello-roto') { _ultimo = { fase: p, cuando: iso() }; pintar(); return Promise.resolve(fallo(p)); }
    if (sinGuardar()) return Promise.resolve(fallo('sin-guardar', 'Tu cartera no se pudo guardar en este navegador, y no subo lo que no quedó guardado.'));
    if (!enLinea()) return Promise.resolve(fallo('sin-senal'));
    var con = conexion();
    if (!con.ok) return Promise.resolve(fallo('sin-config', textoDeFallo({ fase: 'sin-config', motivo: con.motivo })));
    /* El freno de la clave NO se salta, ni por orden de Joan: cada intento con
       la clave mala gasta uno de los 10 que la nube les da a todos cada 15 min. */
    if (frenoPuesto(con)) return Promise.resolve(fallo('clave'));
    if (!leerEstado().habilitado) {
      var lib = libroAlDia();
      if (!lib.ok && !LIBRO_EMPAREJADO[texto(lib.motivo)]) {
        var t = textoCinta({ ultimo: { fase: 'esperando-libro', motivo: texto(lib.motivo), detalle: texto(lib.detalle) } });
        return Promise.resolve(fallo('esperando-libro', texto(t.l2).split(' · ')[0]));
      }
    }
    latir();
    var plan;
    try { plan = armarPlan(true); }
    catch (e) { return Promise.resolve(fallo('error', 'No pude armar el paquete de su ficha (' + texto(e && e.message).slice(0, 80) + ').')); }
    var una = null;
    plan.enviar.forEach(function (x) { if (x.id === id) una = x; });
    /* LA FILA QUE OTRA FICHA TODAVÍA OCUPA (planDeSubida). El nombre de la
       otra sale del lote: puede no viajar (choca, o espera). */
    function porLaFila(otro, cual) {
      var suyo = null;
      lista(plan.lote).forEach(function (x) { if (x && x.socioId != null && String(x.socioId) === String(otro)) suyo = x; });
      return Promise.resolve(fallo('fila', (cual === 'cedula' ? 'Su cédula' : 'Su celular') + ' es todavía la llave con que ' +
        (suyo ? texto(suyo.nombre) || 'Socio' : 'otra ficha de tu cartera') +
        ' vive en la nube: si son la misma persona, junta las dos fichas; si no, corrige el número.'));
    }
    if (!una) {
      var ch = null;
      plan.chocan.forEach(function (c) { if (c.id === id) ch = c; });
      /* 14-nov-2026 (verificación) — la que planDeSubida apartó por la fila no
         «tiene el mismo celular que otra ficha»: su llave es la fila de otra. */
      if (ch && ch.motivo === 'fila') return porLaFila(ch.con, ch.cual);
      return Promise.resolve(fallo(ch ? 'chocan' : 'nada', ch
        ? 'Su ficha tiene el mismo celular o la misma cédula que otra ficha de tu cartera: la nube las tomaría por la misma persona.'
        : 'Su ficha no tiene celular ni cédula, y sin uno de los dos no sube.'));
    }
    /* Allá basta con que la otra viaje primero con ese celular; aquí viaja
       sola, así que no sube si su llave (sin cédula: su celular) o el celular
       que su mudanza lee son la fila de otra. 14-nov-2026 (verificación) —
       antes solo se miraba el celular de la ficha con cédula. */
    var regs = leerEstado().socios, otro = null, cual = '';
    Object.keys(regs).forEach(function (k) {
      var rk = texto(objeto(regs[k]).k);
      if (k === id || !plan.vivos[k] || !rk) return;
      if (rk === una.ident) { otro = k; cual = (una.ident === una.cel) ? 'celular' : 'cedula'; }
      else if (una.cel && rk === una.cel) { otro = k; cual = 'celular'; }
    });
    if (otro != null) return porLaFila(otro, cual);
    return subir({ enviar: [una], propios: [una], grupo: [], grupoListo: false, retenidos: [], chocan: [],
                   total: 1, vivos: plan.vivos, llaves: plan.llaves }, con, { una: true });
  }

  /* importar() de crm.html: entró una cartera entera de un archivo. Las huellas
     describen la de antes y la del respaldo suele ser VIEJA: la subida sola se
     pausa hasta que el respaldo quede emparejado con la nube sin discusión
     (22-oct-2026: antes, hasta el botón). Lo que ya se subió sigue arriba;
     solo se olvida qué era. */
  function carteraReemplazada(motivo) {
    var est = leerEstado();
    _mem = null;
    guardarEstado({ v: 1, socios: {}, ultimaSubida: est.ultimaSubida, ultimaRevision: null, grupoEn: null,
                    habilitado: null, habilitadoPor: null, pausa: { motivo: texto(motivo) || 'otra', en: iso() },
                    reemplazos: est.reemplazos + 1 });
    desprogramar(_quietud); _quietud = null;
    _cambio = false;
    _plan = null;
    _apartados = null;
    if (_configurado && !_apagado) {
      /* 22-oct-2026 — ya no espera al botón: espera a que el respaldo quede
         emparejado con la nube sin discusión (lo mira libroCambio y el reloj). */
      _ultimo = { fase: 'esperando-libro', motivo: 'falta-emparejar', pausa: texto(motivo) };
      pintarPronto();
    }
  }

  /* 22-oct-2026 — nube-crm.js avisa (por crm.html) cada vez que se repinta:
     si esta pieza está esperando a que la cartera quede comprobada y ya lo
     está, arranca. Si no espera nada, no hace nada: se llama seguido. */
  function libroCambio() {
    if (_apagado || !_configurado || _enVuelta) return;
    if (!_ultimo || _ultimo.fase !== 'esperando-libro') return;
    var lib = libroAlDia();
    /* 14-nov-2026 — CLIENTE POR CLIENTE: si ya se sabe de quiénes es lo que
       falta, suben los demás. La vuelta deja la línea fuera de «esperando», así
       que esto no se repite en cada repintada. */
    /* (revisión) Lo ya dicho no se vuelve a preguntar en cada repintada: con
       algo que no se ata a ningún cliente, porCliente contesta null y la línea
       queda con lo de libroAlDia, y cada pregunta con la comparación vencida
       traía la nube entera (12 veces por hora, para nada). Se pregunta si
       libroAlDia cambió, o si lo dicho fue «comparando»/«sin-comparar» (su
       motivo es otro). La vuelta (90 s tras un cambio, 30 min) sigue
       preguntando cliente por cliente. */
    var igual = !lib.ok && texto(lib.motivo) === texto(_ultimo.motivo) &&
                num(lib.congeladas) === num(_ultimo.congeladas) && num(lib.fichas) === num(_ultimo.fichas);
    /* (revisión 2) Con la pausa del respaldo la vuelta no sube cliente por
       cliente: preguntarlo aquí solo traería la nube para nada. */
    var pc = (lib.ok || igual || objeto(leerEstado().pausa).motivo) ? null : porCliente(lib);
    if (pc && pc.ids) { vuelta(false); return; }
    if (!lib.ok) {
      /* 23-oct-2026 — lo que se espera puede cambiar sin que esto suba nada:
         «comparando» pasa a «la nube tiene N fichas más nuevas» cuando vuelve
         la traída. Si la línea se quedara con lo de antes, diría que sigue
         comparando algo que ya se sabe. */
      var ver = pc || lib;
      var cambio = texto(ver.motivo) !== texto(_ultimo.motivo) || num(lib.fichas) !== num(_ultimo.fichas) ||
                   num(lib.congeladas) !== num(_ultimo.congeladas) || texto(ver.detalle) !== texto(_ultimo.detalle);
      if (cambio) {
        _ultimo = { fase: 'esperando-libro', motivo: texto(ver.motivo), congeladas: num(lib.congeladas),
                    fichas: num(lib.fichas), espera: num(ver.espera), detalle: texto(ver.detalle), pausa: _ultimo.pausa };
        pintar();
      }
      return;
    }
    vuelta(false);
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
      /* 22-oct-2026 — con la línea común de crm.html, la barra lateral lleva
         UNA línea («☁ Todo sube solo») y esta no se inyecta. */
      if (cfg.sinCinta) { if (c && c.parentNode) c.parentNode.removeChild(c); return null; }
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
        /* 22-oct-2026 — lo que falló, en rojo (.alerta.mal de crm.html). */
        var tono = t.clase === 'mal' ? 'mal hist-barra' : t.clase === 'ojo' ? 'warn hist-barra' : t.clase === 'calma' ? 'ok hist-barra' : 'info hist-barra';
        barra.innerHTML = '<div class="alerta ' + tono + '" role="button" tabindex="0" onclick="HistorialesAuto.accion()">' +
          '<b>📲 ' + t.l1 + '</b><div class="l2">' + t.l2 + '</div>' +
          /* 22-oct-2026 — decía «desde la primera vez que tocas ☁ Subir
             historiales». Ya no hay que tocar nada (YA NO ES DEL BOTÓN). */
          '<div class="l3">Los historiales de tus clientes suben solos en cuanto este computador está emparejado con la nube, ' +
          'cliente por cliente: el que no coincide con la nube (lo tocaste aquí y en el celular) espera a que elijas, y los demás suben igual ' +
          '(así compruebo que es tu cartera de hoy): al entrar, tras 90 s sin cambios, al volver la señal y cada 30 min. ' +
          'Al juntar la cuenta de un cliente, su ficha sube en ese momento. ' +
          (r.habilitadoPor === 'solo' ? 'Aquí se encendió sola. ' : '') +
          'Sube solo el cliente que cambió; las cifras del grupo se refrescan para todos cada 6 h. ' +
          'En Avanzado, «☁ Subir historiales» sube a todos ya. ' +
          'Ningún código de acceso viaja: tus clientes entran con su celular y su contraseña. Dos fichas con el mismo celular o la misma cédula no suben hasta que ' +
          'las corrijas: la nube las tomaría por la misma persona. · versión ' + esc(VERSION) + '</div></div>';
      }
    } catch (e) { /* nada más que hacer */ }
    /* 22-oct-2026 — la línea común de crm.html se repinta con esta. */
    try { if (typeof cfg.alPintar === 'function') cfg.alPintar(); } catch (e) { /* la barra ya dijo lo suyo */ }
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
    /* 22-oct-2026 — esperando a que la cartera quede comprobada: el clic mira
       otra vez (si ya lo está, sube) y lleva a Ajustes, donde está el detalle.
       No se salta la comprobación. */
    if (f === 'esperando-libro') { irAjustes(); return vuelta(true); }
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
      /* 22-oct-2026 — si espera a que la cartera quede comprobada, lo mira
         acá también: el aviso de nube-crm.js puede no llegar (un crm.html
         viejo sin el enganche). */
      try { libroCambio(); } catch (e) { /* la vuelta lo vuelve a mirar */ }
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
    /* 7-oct-2026 — ¿Con qué llave quedó este cliente en la nube, según la
       última subida que la nube CONFIRMÓ desde este computador? null si
       todavía no subió. crm.html la pregunta para juntar la cuenta del
       cliente nuevo que Joan aprobó: juntar antes de que su ficha esté
       arriba es preguntarle a la nube por una fila que no existe. */
    llaveConfirmada: function (socioId) {
      var r = objeto(leerEstado().socios[String(socioId)]);
      return r.k ? texto(r.k) : null;
    },
    algoCambio: algoCambio,
    conexionCambio: conexionCambio,
    carteraReemplazada: carteraReemplazada,
    libroCambio: libroCambio,
    vuelta: vuelta,
    subirTodo: subirTodo,
    subirUna: subirUna,
    soltar: soltar,
    /* (segunda revisión, 14-nov) Si su ficha sube aunque los demás esperen
       (una suelta vigente). crm.html lo pregunta al registrarle un crédito a
       quien ya tenía la cuenta junta: si no es suelta y su ficha espera, su
       app no lo muestra todavía, y el aviso lo dice. */
    esSuelta: function (socioId) { var est = leerEstado(); return !est.habilitado && !!sueltasVigentes(est)[texto(socioId)]; },
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
