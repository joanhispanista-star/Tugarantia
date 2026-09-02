/* ===========================================================================
 * NUBE — la cartera de Joan deja de vivir en un solo computador.
 * 11 de agosto de 2026.
 *
 * EL PROBLEMA, EN UNA LÍNEA: la base entera del Panel vive en
 * localStorage['joan_socios_v1'], que es del NAVEGADOR DE ESA MÁQUINA. Joan
 * abre crm.html en el celular, en la calle, y ve una cartera vacía. No es un
 * bug de pantalla: ahí de verdad no hay nada.
 *
 * Este archivo es la única puerta entre esa base y Supabase. Hace dos cosas y
 * ninguna más:
 *
 *   1. PARTE PURA — calcular qué cambió, qué hay que mandar, qué llegó y cómo
 *      se junta con lo que ya había. Sin red, sin localStorage, sin mutar nada
 *      de lo que recibe. Es la parte que se prueba con `node --test`, y es
 *      donde está el riesgo de verdad: acá se decide si un cobro del martes se
 *      pierde o no.
 *   2. PARTE CON RED — hablar con Supabase por fetch a pelo (sin SDK) y
 *      guardar en el navegador la caché, la cola de salida y la sesión.
 *
 * LO QUE ESTE ARCHIVO NO HACE, Y NO PUEDE HACER:
 *   · No calcula cupo, garantía, liquidación, mora, niveles ni códigos. Eso lo
 *     hacen MotorReglas y PuenteTuGarantia, y son la única verdad. Este
 *     proyecto ya tuvo doce copias de la misma cuenta contestando distinto; no
 *     se agrega la trece.
 *   · No escribe NUNCA en localStorage['joan_socios_v1']. En el computador,
 *     crm.html, subir.html y espejo.html comparten origen: una sola línea
 *     descuidada acá le pisa a Joan la cartera de verdad. Por eso la caché del
 *     celular vive en 'joan_panel_espejo' y la cola en 'joan_panel_cola'.
 *   · No sube fotos. Ver sinFotos() más abajo: pesan en base64 y la selfie es
 *     dato biométrico (Ley 1581, art. 5). En la interfaz se DICE que se quedan
 *     en el computador; no se calla.
 *
 * EL MODELO MENTAL, PARA EL QUE VENGA DETRÁS. Tres cosas distintas que es fácil
 * confundir:
 *
 *     db      lo que el Panel tiene HOY en este aparato (la forma de cargar()).
 *     espejo  lo ÚLTIMO QUE SABEMOS que está en la nube: por cada fila, su
 *             revisión y el JSON exacto que se subió. Sirve para dos cosas:
 *             calcular el diff (qué cambió de verdad) y saber contra qué
 *             revisión estamos escribiendo.
 *     cola    lo que se hizo en la calle y TODAVÍA NO SUBIÓ. Vive en el disco
 *             del navegador desde el mismo momento en que se hace la acción,
 *             así que sobrevive a quedarse sin señal y a que se cierre la
 *             pestaña. Se vacía fila por fila, solo cuando el servidor
 *             confirma esa fila.
 *
 * Y la regla que ordena todo: NADA SE BORRA DE LA COLA SIN CONFIRMACIÓN DEL
 * SERVIDOR, y cuando hay choque se guardan LAS DOS VERSIONES antes de
 * preguntarle nada a nadie.
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.NubeTuGarantia = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* =========================================================================
   * CONSTANTES Y LLAVES DE DISCO
   * =======================================================================*/

  /* La conexión con Supabase YA existe en el Panel y se llama así. Se reusa a
     propósito: si nube.js abriera su propia llave, Joan tendría que escribir la
     URL y la llave anónima dos veces y un día no coincidirían.
     OJO: el campo `clave` de ese objeto es de la sincronización vieja con los
     socios (crm.html la manda en cada rpc de invitaciones y registros). Acá NO
     se toca ni se borra — guardarConfig lo conserva. */
  var LLAVE_CONFIG = 'joan_socios_sb';
  var LLAVE_SESION = 'joan_panel_sesion';
  var LLAVE_ESPEJO = 'joan_panel_espejo';
  var LLAVE_COLA = 'joan_panel_cola';
  var LLAVE_CHOQUES = 'joan_panel_choques';
  /* Esta constante NO se usa para escribir. Está acá escrita una sola vez para
     que quede negro sobre blanco de qué llave hay que mantenerse lejos. */
  var LLAVE_PANEL_PROHIBIDA_DE_ESCRIBIR = 'joan_socios_v1';

  /* Las tres tablas de filas. `creditos` en la nube es `prestamos` en el db del
     Panel: el nombre viejo se queda en el disco de Joan y el nuevo en el
     servidor, y la traducción vive acá, en un solo sitio. */
  var TABLAS = ['socios', 'creditos', 'respaldados'];
  var CAMPO_DB = { socios: 'socios', creditos: 'prestamos', respaldados: 'respaldados' };

  /* Todo lo que no es una fila con id viaja como "ajuste": un jsonb por clave.
     Son pocos y no cambian casi nunca, así que no vale la pena darles tabla. */
  var CLAVES_AJUSTES = ['config', 'plantillas', 'papelera', 'papeleraSocios', 'invitaciones'];
  /* La papelera guarda fichas y créditos borrados ENTEROS (con cédula, teléfono
     y todo). legal/privacidad.html promete que lo borrado se borra: subirla a un
     servidor es exactamente lo contrario. Por eso subir.html ofrece la casilla
     "no subir la papelera" MARCADA por defecto y pasa estas claves. */
  var CLAVES_AJUSTES_SIN_PAPELERA = ['config', 'plantillas', 'invitaciones'];

  /* Los campos que llevan una imagen en base64. Los cuatro primeros son del
     socio; el quinto, `foto`, va dentro de cada comprobante del crédito. */
  var CAMPOS_FOTO = ['cedulaFrenteFoto', 'cedulaReversoFoto', 'selfieFoto', 'cedulaFoto'];

  /* ---------------------------------------------- las listas que SOLO SUMAN --
     Estas listas nunca se editan ni se reordenan: solo se les agrega al final.
     Por eso son las únicas que se pueden fusionar sin preguntarle a nadie —
     juntar dos versiones no puede perder nada ni inventar nada.
     La identidad de un elemento es la concatenación de los campos que van acá,
     y salen de cómo los escribe crm.html:
       gestiones     {fecha, canal, plantilla}                (crm.html:1673)
                     {…, hora, tipo, grupo, origen}           (espejo.html, la tanda)
       comprobantes  {fecha, tipo, monto, foto}               (crm.html:2082)
       prorrogas     {fecha, ciclo, monto, mora, ...}         (crm.html:2247)
       abonosCapital {fecha, monto, ciclo|cuotaPlan, ...}     (crm.html:2325,2367)
       abonos        {fecha, monto}                           (esquema viejo)
       condonaciones {fecha, costo, mora, motivo, quien}      (espejo.html cobrar;
                     desde el 2-sep-2026 también crm.html —pagarTotal,
                     registrarProrroga y cumplirAcuerdo— con `sobre:'prorroga'`
                     cuando el perdón fue al prorrogar; `sobre` queda FUERA de
                     la identidad, como `motivo` y `quien`)

     14-ago-2026 — POR QUÉ LOS DESCUENTOS SON UNA LISTA Y NO UN CAMPO.
     Un descuento perdonado es un HECHO fechado, igual que una prórroga: pasó, y
     no se deshace porque el otro aparato tenga una versión de la ficha sin él.
     Si viviera en un campo suelto (`condonado`), la fusión lo trataría como
     pisable y «mandar lo mío encima» borraría el descuento que Joan registró en
     el computador — plata perdonada que desaparece de los libros sin que nadie
     se entere, que es exactamente el defecto que este archivo vino a evitar.
     Como lista, los dos se conservan y la suma de la quincena sigue cuadrando.
     La identidad NO incluye `motivo` ni `quien`: el mismo perdón anotado desde
     el celular y desde el computador es UN solo hecho aunque el texto del motivo
     se haya escrito distinto, y meterlo en la identidad lo duplicaría.
     `foto` queda FUERA de la identidad de un comprobante a propósito: el
     comprobante que subió sin foto y el mismo con foto son el mismo hecho, y si
     la foto entrara en la identidad se duplicarían al fusionar.

     14-ago-2026 — LA GESTIÓN DE LA TANDA TRAE CUATRO CAMPOS MÁS Y NINGUNO ENTRA
     EN LA IDENTIDAD, POR LA MISMA RAZÓN QUE LA FOTO.
     La tanda (panel/tanda.js, sección «Tanda» de espejo.html) escribe además
     `hora` (la hora real del contacto, que la Ley 2300 obliga a poder probar y
     que crm.html no guarda), `tipo` ('cobro'|'servicio'), `grupo` y `origen`.
     Si cualquiera de ellos entrara en la identidad, el MISMO contacto anotado
     desde el celular y desde el computador serían dos gestiones distintas, y el
     tope de la Ley 2300 —que se cuenta sobre esta lista— contaría dos contactos
     donde hubo uno. El tope quedaría más apretado de lo que la ley pide: no es
     ilegal, pero le bloquea clientes a Joan sin motivo y le enseña a
     desconfiar del aviso, que es como se termina saltando el que sí importa.

     EL «HECHO» DE LA TANDA ES ESTA MISMA LISTA, NO UN REGISTRO NUEVO.
     Se decidió así justamente porque las gestiones SOLO SUMAN: un choque entre
     el computador y el celular no puede borrar un «ya lo contacté». Si la tanda
     llevara su propio marcador de avance en un campo pisable, «mandar lo mío
     encima» lo borraría y la tanda volvería a ofrecer a alguien al que Joan ya
     le escribió — o sea, un segundo contacto el mismo día, que es exactamente
     lo que el artículo 3 prohíbe. La sincronización es, acá, parte del
     cumplimiento legal. */
  var LISTAS_SOCIO = {
    gestiones: ['fecha', 'canal', 'plantilla']
  };
  var LISTAS_CREDITO = {
    prorrogas: ['fecha', 'ciclo', 'monto'],
    abonos: ['fecha', 'monto'],
    abonosCapital: ['fecha', 'monto'],
    comprobantes: ['fecha', 'tipo', 'monto'],
    condonaciones: ['fecha', 'costo', 'mora']
  };
  var LISTAS_RESPALDADO = {
    comprobantes: ['fecha', 'tipo', 'monto']
  };
  /* El mapa completo, para cuando quien llama no sabe de qué tabla es la fila.
     Es la unión de los tres de arriba: una fila de socios no tiene `prorrogas`
     y fusionarFila simplemente no encuentra la lista y sigue. */
  var LISTAS_QUE_SUMAN = mezclar(LISTAS_SOCIO, LISTAS_CREDITO, LISTAS_RESPALDADO);

  /* Los campos donde una fusión automática SÍ perdería plata o cambiaría un
     hecho. No se resuelven solos NUNCA: van al aviso de choque para que decida
     Joan. La lista es documentación —fusionarFila no la necesita, porque su
     regla es "todo lo que no es lista que suma, se avisa"—, pero está acá
     escrita para que se entienda de qué estamos hablando. */
  var CAMPOS_PISABLES_TIPICOS = ['pagado', 'fechaPagado', 'capital', 'total',
    'cicloActual', 'cicloPago', 'nombre', 'cedula', 'telefono', 'estado',
    /* 14-ago-2026 — `montoRecibido` es la plata que de verdad entró, y es el
       campo que decide un choque de cobro: 240.000 con descuento en el celular
       contra 260.000 «pagó todo» en el computador son dos hechos incompatibles y
       los tiene que separar Joan, no un merge. Sale a la pantalla del choque por
       la vía de siempre (fusionarFila lo devuelve en `pisables`). */
    'montoRecibido', 'costoCausado', 'moraCausada', 'saldoAFavor'];

  var CONTADORES = ['cliente', 'credito', 'respaldado'];

  /* =========================================================================
   * UTILIDADES MÍNIMAS (mismo estilo que app/puente.js: sin dependencias)
   * =======================================================================*/
  function lista(v) { return Array.isArray(v) ? v : []; }
  function objeto(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function num(v) { return Number(v) || 0; }
  function texto(v) { return v == null ? '' : String(v); }
  function tiene(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  /* Copia profunda por JSON. Todo lo que viaja acá es dato serializable (es lo
     mismo que guarda localStorage y lo mismo que acepta jsonb), así que no hace
     falta más, y de paso garantiza que nada de lo que devolvemos comparta
     referencia con lo que nos dieron. */
  function clonar(v) {
    if (v === undefined) return undefined;
    if (v === null || typeof v !== 'object') return v;
    return JSON.parse(JSON.stringify(v));
  }
  function igual(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }

  /* -------------------------------------------------- JSON EN ORDEN CANÓNICO
     LA TRAMPA QUE NOS COSTÓ ESTE ARCHIVO, ESCRITA PARA QUE NO VUELVA:
     jsonb de PostgreSQL NO guarda el orden de las llaves. Las almacena
     ordenadas por longitud y después por bytes. O sea que un socio que sube
     así:
         {"id":"s1","numero":48,"nombre":"Ana","telefono":"300…"}
     vuelve del servidor así:
         {"id":"s1","nombre":"Ana","numero":48,"telefono":"300…"}
     Es EL MISMO DATO. Pero JSON.stringify da dos textos distintos, y todo el
     diff de este archivo compara textos. Con JSON.stringify a secas pasaban dos
     cosas, las dos malas: el computador resubía la cartera COMPLETA en cada
     sincronización, y toda fila que el celular hubiera tocado le salía a Joan
     como choque falso. El aviso rojo —que es justo lo que este archivo vino a
     construir— se volvía ruido, y un aviso que siempre se equivoca se aprende a
     pasar de largo: el choque de verdad quedaba enterrado entre cien inventados.

     Por eso NADA que se vaya a comparar contra algo que pasó por jsonb se
     serializa con JSON.stringify. Se serializa con esto, que escribe las llaves
     de cada objeto ordenadas, recursivamente, en los DOS lados de la
     comparación. Solo así "no cambió" quiere decir de verdad "no cambió".

     No se usa para MANDAR datos (eso lo hace JSON.stringify del fetch, y da
     igual el orden): se usa solo para comparar y para guardar el espejo. */
  function jsonCanonico(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    /* Un objeto con toJSON (una fecha, por ejemplo) se serializa por su propia
       regla, igual que haría JSON.stringify. Hoy no debería llegar ninguno —
       todo esto sale de JSON.parse—, pero si llega, mejor que quede como texto
       y no como '{}'. */
    if (typeof v.toJSON === 'function') return jsonCanonico(v.toJSON());
    if (Array.isArray(v)) {
      /* El orden de un array SÍ es dato y jsonb lo respeta: no se toca. */
      return '[' + v.map(function (x) { return x === undefined ? 'null' : jsonCanonico(x); }).join(',') + ']';
    }
    var partes = [];
    Object.keys(v).sort().forEach(function (k) {
      if (v[k] === undefined) return;   // JSON.stringify también las omite
      partes.push(JSON.stringify(k) + ':' + jsonCanonico(v[k]));
    });
    return '{' + partes.join(',') + '}';
  }

  /* Un espejo guardado en disco por una versión anterior trae los json escritos
     con JSON.stringify, sin ordenar. Se vuelven a canonizar al leerlos: si no,
     la primera sincronización después de actualizar vería como "cambiado" todo
     lo que solo tiene las llaves en otro orden — exactamente el problema que
     acabamos de tapar, resucitado por la caché vieja. Si el texto no es JSON
     válido se deja como está: peor que un espejo raro es reventar la carga. */
  function recanonizar(txt) {
    try { return jsonCanonico(JSON.parse(txt)); } catch (e) { return txt; }
  }
  function mezclar() {
    var salida = {};
    for (var i = 0; i < arguments.length; i++) {
      var o = objeto(arguments[i]);
      for (var k in o) if (tiene(o, k)) salida[k] = o[k];
    }
    return salida;
  }
  function idDe(fila) {
    if (!fila || typeof fila !== 'object') return '';
    return fila.id == null ? '' : String(fila.id);
  }
  /* Un valor "tiene contenido" si de verdad hay algo guardado. null, '' y false
     no son una foto: son un campo vacío que el Panel crea por defecto. */
  function conContenido(v) { return !(v === undefined || v === null || v === '' || v === false); }

  /* =========================================================================
   * PARTE PURA — 1. LAS FOTOS NO VIAJAN
   * =======================================================================*/

  /**
   * Copia de `obj` sin las fotos. NO muta el original — ni el objeto ni sus
   * comprobantes.
   *
   * POR QUÉ NO VIAJAN, dicho una vez:
   *   · pesan. Una cédula por lado y una selfie en base64 son cientos de KB por
   *     socio; con 200 socios el "sube tu cartera" se vuelve una subida de
   *     medio giga que se corta a la mitad y deja todo por la mitad;
   *   · la selfie es dato biométrico (Ley 1581 art. 5, dato sensible). Mandarla
   *     a un servidor es una decisión con consecuencias legales, y se toma
   *     aparte, con su tratamiento y su autorización, no de refilón dentro de
   *     una sincronización.
   * Fase 1: las fotos se quedan en el computador. Y se DICE en pantalla.
   *
   * Un campo vacío (null o '') no es una foto y se deja donde está: quitarlo
   * solo le cambiaría la forma al objeto sin proteger nada, y el Panel lo crea
   * en null por defecto en cada carga.
   */
  function sinFotos(obj) {
    if (Array.isArray(obj)) return obj.map(sinFotos);
    if (!obj || typeof obj !== 'object') return obj;
    var copia = clonar(obj);
    CAMPOS_FOTO.forEach(function (c) { if (conContenido(copia[c])) delete copia[c]; });
    if (Array.isArray(copia.comprobantes)) {
      copia.comprobantes = copia.comprobantes.map(function (c) {
        if (c && typeof c === 'object' && conContenido(c.foto)) { var d = clonar(c); delete d.foto; return d; }
        return c;
      });
    }
    return copia;
  }

  /** El db entero sin fotos. Lo usa subir.html para pesar el paquete "con" y
      "sin" y poder mostrarle a Joan los dos números de verdad, medidos. */
  function dbSinFotos(db) {
    var d = clonar(objeto(db));
    ['socios', 'prestamos', 'respaldados', 'papelera', 'papeleraSocios'].forEach(function (c) {
      if (Array.isArray(d[c])) d[c] = d[c].map(sinFotos);
    });
    return d;
  }

  /* =========================================================================
   * PARTE PURA — 2. EL ESPEJO
   * =======================================================================*/

  /* Un espejo vacío: la primera subida de la vida. Todo va con revision_base
     null, que para panel_empujar quiere decir "fila nueva". */
  function espejoVacio() {
    return { socios: {}, creditos: {}, respaldados: {}, ajustes: {}, servidor_ahora: null };
  }

  /* Copia defensiva del espejo que nos den. Cualquier función pura que reciba
     un espejo pasa por acá: así ninguna puede modificar el que tiene guardado
     quien llamó, y de paso se tolera un espejo a medias (o de una versión
     vieja) sin reventar. */
  function normalizarEspejo(espejo) {
    var e = espejoVacio(), fuente = objeto(espejo);
    TABLAS.concat(['ajustes']).forEach(function (t) {
      var filas = objeto(fuente[t]);
      for (var id in filas) if (tiene(filas, id)) {
        var f = objeto(filas[id]);
        e[t][id] = {
          revision: num(f.revision),
          json: typeof f.json === 'string' ? recanonizar(f.json) : jsonCanonico(f.datos),
          borrado: !!f.borrado,
          actualizado_en: f.actualizado_en || null,
          actualizado_por: f.actualizado_por || null
        };
      }
    });
    e.servidor_ahora = fuente.servidor_ahora || null;
    return e;
  }

  /**
   * El espejo que hay que guardar después de un `traer`: por cada fila, la
   * revisión y el JSON exacto que quedó en el servidor.
   *
   * @param {object} paquete  lo que devolvió panel_traer
   * @param {object} [previo] el espejo anterior. Se usa SOLO cuando el paquete
   *                 es incremental (completo:false): ahí vienen únicamente las
   *                 filas que cambiaron, y las demás siguen siendo las de
   *                 antes. Con completo:true el paquete ES la nube entera y el
   *                 espejo anterior se descarta — si no, una fila borrada a
   *                 mano en el servidor se quedaría viva en el espejo para
   *                 siempre.
   */
  function espejoDe(paquete, previo) {
    var p = objeto(paquete);
    var e = (p.completo === true) ? espejoVacio() : normalizarEspejo(previo);
    TABLAS.forEach(function (t) {
      lista(p[t]).forEach(function (f) {
        var id = idDe(f);
        if (!id) return;
        e[t][id] = {
          revision: num(f.revision),
          /* Se guarda el JSON, no el objeto: el diff de armarLote compara
             textos. Y se guarda EN ORDEN CANÓNICO porque este dato acaba de
             volver de un jsonb, que reordenó las llaves; comparar contra el
             texto crudo del servidor daría "cambió" en filas que nadie tocó.
             Ver jsonCanonico() arriba. */
          json: jsonCanonico(f.datos),
          borrado: !!f.borrado,
          actualizado_en: f.actualizado_en || null,
          actualizado_por: f.actualizado_por || null
        };
      });
    });
    lista(p.ajustes).forEach(function (a) {
      if (!a || a.clave == null) return;
      e.ajustes[String(a.clave)] = {
        revision: num(a.revision),
        json: jsonCanonico(a.datos),
        borrado: false,
        actualizado_en: a.actualizado_en || null,
        actualizado_por: a.actualizado_por || null
      };
    });
    /* La marca de agua para el próximo traer incremental. Es la hora DEL
       SERVIDOR y no la del aparato a propósito: el reloj del celular de Joan
       puede estar cinco minutos adelantado, y con eso se saltaría filas. */
    if (p.servidor_ahora) e.servidor_ahora = p.servidor_ahora;
    return e;
  }

  /**
   * El espejo después de un `empujar`. Dos mitades, y las dos importan:
   *   · lo que SÍ se escribió (respuesta.revisiones) queda con su revisión
   *     nueva y con el JSON que mandamos: es exactamente lo que hay allá;
   *   · lo que CHOCÓ NO SE TOCA: conserva la entrada vieja del espejo.
   *
   * ESA SEGUNDA MITAD ESTABA AL REVÉS, Y COSTABA EL COBRO DEL MARTES. Antes,
   * una fila que chocaba quedaba en el espejo con la revisión y los datos DEL
   * SERVIDOR, con el argumento de que si no, chocaría en bucle. Lo que pasaba
   * de verdad era peor que un bucle:
   *
   *   14:40 el computador manda su copia de las 8:00 → CHOQUE, no se escribe
   *         nada (bien), y el espejo pasa a decir "vas por la revisión 2".
   *   14:45 Joan aprieta subir otra vez sin haber resuelto nada. armarLote ve
   *         que su cartera local (pagado:false) no coincide con el espejo
   *         (pagado:true) y lo manda como si fuera una edición suya, ahora sí
   *         contra la revisión 2. El servidor lo acepta. EL COBRO DE LAS 10:15
   *         DESAPARECE, sin choque, sin aviso y sin que nadie pueda notarlo.
   *
   * Y de paso el espejo dejaba mentir a la pantalla: subir.html decide si una
   * fila entra en la lista de choques comparando la revisión del espejo con la
   * del servidor, así que con el espejo ya adelantado la fila salía como "sin
   * cambio" y nunca llegaba al paso 7 — justo donde su propio texto le promete
   * a Joan que la va a poder resolver.
   *
   * Con la entrada vieja intacta, la próxima subida vuelve a salir contra la
   * revisión de antes y el servidor vuelve a contestar CHOQUE. Eso no es un
   * bucle: es la ficha quedándose a la vista hasta que Joan decida. El espejo
   * avanza cuando la decisión se toma, y solo entonces: si gana la nube, la
   * fila se aplica y el espejo lo registra por espejoDe; si Joan elige "lo mío
   * encima", la pantalla vuelve a mandarla explícitamente contra la revisión
   * del servidor y esa sí pisa, porque él lo pidió.
   */
  function espejoTrasEmpujar(espejo, lote, respuesta) {
    var e = normalizarEspejo(espejo);
    /* Una segunda copia del espejo de ANTES, para poder devolver a su sitio las
       filas que chocaron sin depender del orden en que se recorran las dos
       listas de la respuesta. */
    var previo = normalizarEspejo(espejo);
    var l = objeto(lote), r = objeto(respuesta);
    var enviadas = {};
    TABLAS.forEach(function (t) {
      lista(l[t]).forEach(function (f) { enviadas[t + '' + idDe(f)] = f; });
    });
    lista(l.ajustes).forEach(function (a) { enviadas['ajustes' + texto(a && a.clave)] = a; });

    lista(r.revisiones).forEach(function (rev) {
      if (!rev) return;
      var t = texto(rev.tabla), id = texto(rev.id);
      if (!e[t]) return;
      var enviada = enviadas[t + '' + id];
      if (!enviada) return;
      e[t][id] = {
        revision: num(rev.revision),
        /* Canónico igual que en espejoDe: esta fila la mandamos nosotros, pero
           la próxima vez que se traiga vendrá reordenada por jsonb. Los dos
           caminos tienen que producir el MISMO texto o el espejo se contradice
           consigo mismo según por dónde se haya llenado. */
        json: jsonCanonico(enviada.datos),
        borrado: !!enviada.borrado,
        actualizado_en: rev.actualizado_en || null,
        actualizado_por: rev.actualizado_por || null
      };
    });
    /* Lo que chocó se deja EXACTAMENTE como estaba. Se recorre igual, y no para
       escribir: para poder deshacer si una misma fila vino confirmada y chocada
       en la misma respuesta (no debería pasar, pero si pasa, manda el choque:
       entre adelantar de más y adelantar de menos, adelantar de menos solo
       cuesta una vuelta más y adelantar de más cuesta un cobro). */
    lista(r.choques).forEach(function (ch) {
      if (!ch) return;
      var t = texto(ch.tabla), id = texto(ch.id);
      if (!e[t]) return;
      var antes = previo[t][id];
      if (antes) e[t][id] = antes; else delete e[t][id];
    });
    return e;
  }

  /* =========================================================================
   * PARTE PURA — 3. QUÉ MANDAR (el diff)
   * =======================================================================*/

  /**
   * El lote a empujar: SOLO lo que cambió contra el espejo.
   *
   * @param {object} db      la base del Panel (la forma que devuelve cargar())
   * @param {object} espejo  lo último que sabemos que está en la nube
   * @param {object} [opciones]
   *        · claves          qué ajustes mandar. Por defecto los cinco.
   *        · sinPapelera     atajo para dejar fuera papelera y papeleraSocios.
   *        · marcarBorrados  (por defecto true) una fila que estaba en el
   *                          espejo y ya no está en el db se manda con
   *                          borrado:true. OJO: esto SOLO vale si `db` es la
   *                          base COMPLETA. Pasarle un db filtrado marcaría
   *                          como borrado todo lo que no venga en él.
   *        · conFotos        (por defecto false) mandar las fotos igual. Solo
   *                          para un respaldo local; en la nube no van.
   *
   * @returns {{socios:Array, creditos:Array, respaldados:Array, ajustes:Array,
   *            omitidas:Array}}
   *   Cada fila: {id, datos, revision_base, borrado}. revision_base null quiere
   *   decir "fila nueva"; si el servidor la encuentra, es CHOQUE — que es justo
   *   lo que tiene que pasar cuando dos aparatos crearon la misma fila.
   */
  function armarLote(db, espejo, opciones) {
    var o = objeto(opciones);
    var esp = normalizarEspejo(espejo);
    var claves = Array.isArray(o.claves) ? o.claves
      : (o.sinPapelera ? CLAVES_AJUSTES_SIN_PAPELERA : CLAVES_AJUSTES);
    var marcarBorrados = o.marcarBorrados !== false;
    var conFotos = o.conFotos === true;
    var d = objeto(db);
    var lote = { socios: [], creditos: [], respaldados: [], ajustes: [], omitidas: [] };

    TABLAS.forEach(function (t) {
      var filas = lista(d[CAMPO_DB[t]]);
      var vistos = {};
      filas.forEach(function (fila, i) {
        var id = idDe(fila);
        if (!id) {
          /* Una fila sin id no se puede subir (el id es la llave primaria) y
             tampoco se puede callar: se devuelve para que la pantalla lo diga.
             Tragársela sería perder un socio en silencio. */
          lote.omitidas.push({ tabla: t, posicion: i, motivo: 'la fila no tiene id' });
          return;
        }
        vistos[id] = true;
        var datos = conFotos ? clonar(fila) : sinFotos(fila);
        /* Canónico, no JSON.stringify: al otro lado de esta comparación está el
           espejo, que viene de un jsonb con las llaves reordenadas. Con
           JSON.stringify esta línea decía "cambió" en TODAS las filas y el
           computador resubía la cartera entera cada vez. */
        var json = jsonCanonico(datos);
        var ant = esp[t][id];
        if (ant && !ant.borrado && ant.json === json) return;  // no cambió: no viaja
        lote[t].push({ id: id, datos: datos, revision_base: ant ? ant.revision : null, borrado: false });
      });
      if (!marcarBorrados) return;
      Object.keys(esp[t]).forEach(function (id) {
        var ant = esp[t][id];
        if (vistos[id] || ant.borrado) return;
        /* Se manda el último dato conocido junto con el borrado: así el
           servidor conserva de qué fila se trataba (para la bitácora y para
           poder deshacer) en vez de quedarse con un id pelado. */
        var datos = null;
        try { datos = JSON.parse(ant.json); } catch (e) { datos = null; }
        lote[t].push({ id: id, datos: datos, revision_base: ant.revision, borrado: true });
      });
    });

    claves.forEach(function (clave) {
      if (d[clave] === undefined) return;   // lo que este aparato no tiene, no lo pisa
      var datos = conFotos ? clonar(d[clave]) : sinFotos(d[clave]);
      var json = jsonCanonico(datos);
      var ant = esp.ajustes[clave];
      if (ant && ant.json === json) return;
      lote.ajustes.push({ clave: clave, datos: datos, revision_base: ant ? ant.revision : null });
    });

    return lote;
  }

  /** Cuántas filas trae un lote (sin contar las omitidas, que no viajan). */
  function tamanoLote(lote) {
    var l = objeto(lote), n = 0;
    TABLAS.concat(['ajustes']).forEach(function (t) { n += lista(l[t]).length; });
    return n;
  }

  /** Un lote solo con lo que panel_empujar entiende. Todo lo demás (omitidas,
      notas de la pantalla) se queda en casa: no se manda basura al servidor. */
  function loteLimpio(lote) {
    var l = objeto(lote), s = { socios: [], creditos: [], respaldados: [], ajustes: [] };
    TABLAS.forEach(function (t) {
      s[t] = lista(l[t]).map(function (f) {
        return { id: texto(f && f.id), datos: clonar(f && f.datos), revision_base: (f && f.revision_base) || null, borrado: !!(f && f.borrado) };
      });
    });
    s.ajustes = lista(l.ajustes).map(function (a) {
      return { clave: texto(a && a.clave), datos: clonar(a && a.datos), revision_base: (a && a.revision_base) || null };
    });
    return s;
  }

  /** Partir un lote en pedazos de `n` filas. La subida inicial de Joan son
      cientos de filas y un solo POST gigante se cae por timeout justo cuando
      peor viene; además, así la barra de avance dice algo real. */
  function partirLote(lote, n) {
    var tope = num(n) > 0 ? num(n) : 200;
    var l = loteLimpio(lote), pedazos = [], actual = null, cuenta = 0;
    function nuevo() { actual = { socios: [], creditos: [], respaldados: [], ajustes: [] }; pedazos.push(actual); cuenta = 0; }
    nuevo();
    TABLAS.concat(['ajustes']).forEach(function (t) {
      lista(l[t]).forEach(function (f) {
        if (cuenta >= tope) nuevo();
        actual[t].push(f); cuenta++;
      });
    });
    return pedazos.filter(function (p) {
      return p.socios.length || p.creditos.length || p.respaldados.length || p.ajustes.length;
    });
  }

  /* =========================================================================
   * PARTE PURA — 4. QUÉ LLEGÓ (aplicar lo que trajo la nube)
   * =======================================================================*/

  /* La forma EXACTA que devuelve cargar() de crm.html (línea 652), para que
     PuenteTuGarantia lea esto sin enterarse de que vino de la nube.

     Lo que a propósito NO se pone acá: los valores por defecto de `config`
     (costoBasePct, pin, negocio…) y el texto de `plantillas`. Esos los pone
     cargar() del Panel y el motor, y copiarlos acá sería una segunda verdad de
     las que ya nos costaron caras: el día que Joan cambie el costo base, este
     archivo estaría reponiendo el 20% viejo por detrás. Acá se garantiza la
     FORMA (que existan y sean del tipo correcto); el CONTENIDO por defecto lo
     pone quien manda. */
  function dbBase(db) {
    var d = clonar(objeto(db));
    d.socios = lista(d.socios).length ? lista(d.socios) : lista(d.clientes);
    d.prestamos = lista(d.prestamos);
    d.respaldados = lista(d.respaldados);
    d.papelera = lista(d.papelera);
    d.papeleraSocios = lista(d.papeleraSocios);
    d.invitaciones = lista(d.invitaciones);
    d.plantillas = objeto(d.plantillas);
    d.config = objeto(d.config);
    d.contadores = mezclar({ cliente: 0, credito: 0, respaldado: 0 }, objeto(d.contadores));
    return d;
  }

  /**
   * Aplica al db lo que trajo panel_traer. Devuelve un db NUEVO: el que
   * recibió no se toca ni una coma.
   *
   * QUÉ HACE Y QUÉ NO: aplica lo que dice el servidor, que es la verdad
   * compartida. No fusiona listas ni intenta adivinar quién tiene razón —para
   * eso está fusionarFila, y la usa la pantalla del choque, con Joan mirando.
   * El orden correcto de una sincronización es EMPUJAR PRIMERO (ahí salen los
   * choques, con las dos versiones a salvo) y TRAER DESPUÉS. Al revés, lo de la
   * nube pisa lo que este aparato todavía no subió.
   *
   * Los contadores no se pisan: se sube al MÁXIMO. Un contador que baja es un
   * número de cliente repetido, y dos socios distintos con el mismo número es
   * un lío que después no se desarma.
   *
   * @returns {{db:object, cambios:{socios:number, creditos:number,
   *            respaldados:number, ajustes:number}}}
   */
  function aplicarPaquete(db, paquete) {
    var base = dbBase(db);
    var p = objeto(paquete);
    var cambios = { socios: 0, creditos: 0, respaldados: 0, ajustes: 0 };

    TABLAS.forEach(function (t) {
      var campo = CAMPO_DB[t];
      var filas = base[campo].slice();
      var indice = {};
      filas.forEach(function (f, i) { var id = idDe(f); if (id) indice[id] = i; });

      lista(p[t]).forEach(function (inc) {
        var id = idDe(inc);
        if (!id) return;
        var pos = indice[id];
        if (inc.borrado) {
          if (pos !== undefined) { filas[pos] = null; delete indice[id]; cambios[t]++; }
          return;
        }
        var datos = clonar(inc.datos);
        /* Una fila sin datos no puede borrar la que hay: preferir lo viejo
           antes que dejar al socio sin ficha por un jsonb en null. */
        if (!datos || typeof datos !== 'object') return;
        if (datos.id === undefined) datos.id = id;
        if (pos === undefined) { filas.push(datos); indice[id] = filas.length - 1; cambios[t]++; }
        else if (!igual(filas[pos], datos)) { filas[pos] = datos; cambios[t]++; }
      });

      base[campo] = filas.filter(Boolean);
    });

    lista(p.ajustes).forEach(function (a) {
      if (!a || a.clave == null) return;
      var clave = String(a.clave);
      /* Una clave que este archivo no conoce no se escribe en el db: sería
         meterle al Panel un campo que nadie sabe leer. Si algún día hace falta
         una nueva, se agrega arriba, en CLAVES_AJUSTES, y se dice por qué. */
      if (CLAVES_AJUSTES.indexOf(clave) < 0) return;
      var datos = clonar(a.datos);
      if (datos === undefined || datos === null) return;
      if (!igual(base[clave], datos)) { base[clave] = datos; cambios.ajustes++; }
    });

    if (p.contadores) {
      CONTADORES.forEach(function (k) {
        var v = num(p.contadores[k]);
        if (v > num(base.contadores[k])) base.contadores[k] = v;
      });
    }

    return { db: base, cambios: cambios };
  }

  /**
   * Un paquete con la forma de panel_traer, armado a partir de un lote. Sirve
   * para dos cosas de verdad (no es un juguete de pruebas):
   *   · volver a poner encima del db lo que todavía está en la cola, para que
   *     Joan siga viendo en pantalla lo que hizo en la calle aunque no haya
   *     subido;
   *   · probar la ida y vuelta (db → lote → paquete → db) sin servidor.
   * Las revisiones que inventa son locales y no valen para escribir: el número
   * de verdad lo pone el servidor y llega en la respuesta de panel_empujar.
   */
  function paqueteDeLote(lote, opciones) {
    var l = objeto(lote), o = objeto(opciones);
    var p = {
      servidor_ahora: o.servidor_ahora || null,
      completo: o.completo !== false,
      socios: [], creditos: [], respaldados: [], ajustes: [],
      contadores: mezclar({ cliente: 0, credito: 0, respaldado: 0 }, objeto(o.contadores))
    };
    TABLAS.forEach(function (t) {
      p[t] = lista(l[t]).map(function (f) {
        return {
          id: texto(f && f.id), datos: clonar(f && f.datos),
          revision: num(f && f.revision_base) + 1, borrado: !!(f && f.borrado),
          actualizado_en: (f && f.cuando) || o.servidor_ahora || null,
          actualizado_por: o.dispositivo || (f && f.dispositivo) || null
        };
      });
    });
    p.ajustes = lista(l.ajustes).map(function (a) {
      return {
        clave: texto(a && a.clave), datos: clonar(a && a.datos),
        revision: num(a && a.revision_base) + 1,
        actualizado_en: o.servidor_ahora || null,
        actualizado_por: o.dispositivo || null
      };
    });
    return p;
  }

  /* =========================================================================
   * PARTE PURA — 5. FUSIONAR (lo único que se puede juntar sin preguntar)
   * =======================================================================*/

  /* La fecha con la que se ordena un elemento de una lista que suma. Se prueban
     los nombres que de verdad usa el repo, en orden. Un elemento sin ninguna
     fecha (dato viejo) se va al principio y conserva su orden relativo: no hay
     con qué ubicarlo, y ponerlo al final fingiría que es reciente. */
  var CAMPOS_FECHA = ['fecha', 'cuando', 'fechaPago', 'fechaPagado', 'creado'];
  function fechaDe(el) {
    if (!el || typeof el !== 'object') return '';
    for (var i = 0; i < CAMPOS_FECHA.length; i++) {
      var v = el[CAMPOS_FECHA[i]];
      if (v) return String(v);
    }
    return '';
  }
  /* La identidad de un elemento: los campos que lo hacen ser él. Con JSON y no
     con un pegote de textos para que "15" y 15 no se confundan, y para que un
     valor con un separador adentro no invente una identidad ajena.
     Sin `campos`, la identidad es el elemento entero: dos elementos idénticos
     son, sin discusión, el mismo. */
  function identidad(el, campos) {
    if (Array.isArray(campos) && campos.length) {
      return JSON.stringify(campos.map(function (c) {
        var v = (el && typeof el === 'object') ? el[c] : undefined;
        return v === undefined ? null : v;
      }));
    }
    return JSON.stringify(el === undefined ? null : el);
  }

  /**
   * Unión de dos listas que SOLO SUMAN, sin duplicados y ordenada por fecha.
   *
   * Da igual en qué orden vengan y da igual cuál sea "la mía": el resultado es
   * el mismo. Eso es justo lo que la hace segura — un pago registrado en el
   * celular y una gestión anotada en el computador el mismo día conviven, no
   * compiten. Si un elemento está en las dos, gana el PRIMERO que aparece (el
   * de `mias`) y se le COMPLETAN los campos que solo traía el otro.
   *
   * 14-ago-2026 — POR QUÉ SE COMPLETA, Y POR QUÉ ANTES ESTABA MAL.
   * Hasta hoy el primero ganaba entero y el otro se descartaba entero. Con dos
   * versiones del mismo hecho escritas por aparatos distintos —que es
   * exactamente lo que produce la tanda: el celular anota la gestión con `hora`
   * y el computador la misma gestión sin `hora`— el resultado dependía de quién
   * fuera "el mío", y el campo que solo tenía uno se perdía en silencio. O sea
   * que la propiedad que esta función promete en el párrafo de arriba, y que su
   * propia prueba dice vigilar, no se cumplía en cuanto los dos lados no eran
   * idénticos.
   * Completar es SIEMPRE seguro: nunca se pisa un valor, solo se rellenan los
   * campos que el ganador no tiene. Si los dos traen el campo con valores
   * distintos, manda el del ganador y no se inventa nada.
   */
  function fusionarListas(mias, suyas, campos) {
    var salida = [], vistos = {};
    [lista(mias), lista(suyas)].forEach(function (l) {
      l.forEach(function (el) {
        var llave = identidad(el, campos);
        if (tiene(vistos, llave)) {
          /* El mismo hecho, otra vez: no se agrega, pero se aprovecha lo que
             traiga de más. Solo objetos — un elemento suelto (un texto, un
             número) no tiene campos que completar. */
          var ganador = salida[vistos[llave]];
          if (ganador && typeof ganador === 'object' && !Array.isArray(ganador) &&
              el && typeof el === 'object' && !Array.isArray(el)) {
            Object.keys(el).forEach(function (k) {
              if (!tiene(ganador, k)) ganador[k] = clonar(el[k]);
            });
          }
          return;
        }
        vistos[llave] = salida.length;
        salida.push(clonar(el));
      });
    });
    /* Orden estable: por fecha, y entre iguales por el orden en que entraron.
       Se decora con el índice en vez de confiar en la estabilidad del sort del
       motor de turno. */
    return salida.map(function (el, i) { return { el: el, i: i, f: fechaDe(el) }; })
      .sort(function (a, b) {
        if (a.f !== b.f) return a.f < b.f ? -1 : 1;
        return a.i - b.i;
      })
      .map(function (x) { return x.el; });
  }

  /* Acepta las listas como mapa {nombre:campos}, como array de nombres, o
     nada (y entonces son todas las conocidas). */
  function mapaDeListas(listas) {
    if (!listas) return LISTAS_QUE_SUMAN;
    if (Array.isArray(listas)) {
      var m = {};
      listas.forEach(function (n) { m[n] = LISTAS_QUE_SUMAN[n] || null; });
      return m;
    }
    return objeto(listas);
  }

  /**
   * Junta dos versiones de la MISMA fila.
   *
   * Lo que hace: fusiona las listas que solo suman (gestiones, comprobantes,
   * prórrogas, abonos) — ahí no se puede perder nada.
   *
   * Lo que NO hace, y es lo importante: NO resuelve sola ni un solo campo
   * pisable. `pagado`, `fechaPagado`, `capital`, `nombre`, `cedula`… se quedan
   * como estaban en la MÍA y la diferencia se devuelve en `pisables` para que
   * la pantalla muestre las dos versiones y decida Joan. Elegir por él sería
   * exactamente el defecto que este archivo viene a evitar: el martes de cobro,
   * el celular marca pagado a las 10:15 y el computador guarda a las 14:40 con
   * su copia de las 8:00. Un merge "inteligente" ahí borra un cobro y nadie se
   * entera hasta que el cliente reclama.
   *
   * Un campo que solo existe en la de la nube sí se copia: no hay nada mío que
   * pisar, y no copiarlo sería perderlo.
   *
   * @returns {{fila:object, pisables:Array<{campo,mio,suyo}>, hayChoque:boolean}}
   *   `fila` es "lo mío, con las listas completas": es lo que se manda si Joan
   *   elige [Mandar lo mío encima].
   */
  function fusionarFila(mia, suya, listas) {
    var m = objeto(mia), s = objeto(suya);
    var mapa = mapaDeListas(listas);
    var fila = clonar(m);
    var pisables = [];

    Object.keys(mapa).forEach(function (nombre) {
      if (!Array.isArray(m[nombre]) && !Array.isArray(s[nombre])) return;
      fila[nombre] = fusionarListas(m[nombre], s[nombre], mapa[nombre]);
    });

    var claves = {};
    Object.keys(m).forEach(function (k) { claves[k] = true; });
    Object.keys(s).forEach(function (k) { claves[k] = true; });
    Object.keys(claves).forEach(function (k) {
      if (tiene(mapa, k)) return;                 // ya se fusionó arriba
      if (igual(m[k], s[k])) return;              // dicen lo mismo: no hay nada que decidir
      if (!tiene(m, k)) { fila[k] = clonar(s[k]); return; }  // solo está allá: no pisa nada
      pisables.push({ campo: k, mio: clonar(m[k]), suyo: clonar(s[k]) });
    });

    return { fila: fila, pisables: pisables, hayChoque: pisables.length > 0 };
  }

  /* =========================================================================
   * PARTE PURA — 6. LA COLA DE SALIDA
   *
   * La cola es un ARRAY de cambios ya hechos en este aparato y todavía no
   * confirmados por el servidor. Cada cambio:
   *
   *   {tabla:'creditos'|'socios'|'respaldados'|'ajustes',
   *    id | clave, datos, revision_base, borrado, cuando, que}
   *
   * Por qué un array y no "el db entero pendiente": porque hay que poder sacar
   * de la cola EXACTAMENTE las filas que el servidor confirmó y dejar adentro
   * las que chocaron. Un "pendiente: sí/no" global no distingue, y el primer
   * choque obligaría a reintentar todo o a perder algo.
   *
   * Se guarda en disco en cada cambio (ver encolarYGuardar): si el celular se
   * queda sin señal en la mitad de una cuadra, o Joan cierra la pestaña, la
   * cola está en localStorage['joan_panel_cola'] y sigue ahí mañana.
   * =======================================================================*/

  function colaVacia() { return []; }
  function llaveDeCambio(c) {
    var t = texto(c && c.tabla) || 'socios';
    return t + '' + texto(c && (t === 'ajustes' ? c.clave : c.id));
  }

  /**
   * Mete un cambio en la cola y devuelve una cola NUEVA (no muta la que
   * recibe). Si ya había un cambio pendiente para esa misma fila:
   *   · se queda el DATO MÁS NUEVO (es el estado actual de la fila), y
   *   · se conserva el revision_base del PRIMERO.
   * Lo segundo es la línea que hace que el choque se detecte: revision_base es
   * "contra qué versión del servidor empecé a trabajar". Si cada edición local
   * lo refrescara, el segundo intento pasaría como si nada y le pisaría al otro
   * aparato lo que hizo en el medio.
   */
  function encolar(cola, cambio) {
    var salida = lista(cola).map(clonar);
    var c = clonar(objeto(cambio));
    if (!c.tabla) c.tabla = 'socios';
    if (!c.cuando) c.cuando = new Date().toISOString();
    var llave = llaveDeCambio(c);
    for (var i = 0; i < salida.length; i++) {
      if (llaveDeCambio(salida[i]) !== llave) continue;
      /* Manda el revision_base del PRIMERO, incluso cuando es null: null quiere
         decir "esta fila la creé yo y el servidor no la tiene". Si la segunda
         edición lo cambiara, una fila creada a la vez en los dos aparatos
         entraría pisando en vez de avisar. */
      if (tiene(salida[i], 'revision_base')) c.revision_base = salida[i].revision_base;
      salida[i] = c;
      return salida;
    }
    salida.push(c);
    return salida;
  }

  /** El lote que sale de la cola, listo para panel_empujar. */
  function loteDeCola(cola) {
    var lote = { socios: [], creditos: [], respaldados: [], ajustes: [], omitidas: [] };
    lista(cola).forEach(function (c) {
      if (!c) return;
      var t = texto(c.tabla);
      if (t === 'ajustes') {
        if (!c.clave) { lote.omitidas.push({ tabla: t, motivo: 'el ajuste no tiene clave' }); return; }
        lote.ajustes.push({ clave: String(c.clave), datos: clonar(c.datos), revision_base: c.revision_base == null ? null : num(c.revision_base) });
        return;
      }
      if (TABLAS.indexOf(t) < 0) { lote.omitidas.push({ tabla: t, motivo: 'tabla desconocida' }); return; }
      if (c.id == null) { lote.omitidas.push({ tabla: t, motivo: 'el cambio no tiene id' }); return; }
      lote[t].push({
        id: String(c.id), datos: clonar(c.datos),
        revision_base: c.revision_base == null ? null : num(c.revision_base),
        borrado: !!c.borrado
      });
    });
    return lote;
  }

  /**
   * Saca de la cola SOLO lo que el servidor confirmó. Lo que chocó se queda
   * adentro (marcado), y lo que ni se intentó también.
   *
   * Es la regla más importante del archivo: una fila sale de la cola cuando el
   * servidor dice su número de revisión nueva, y nunca antes. Si la respuesta
   * llega a medias, si el celular pierde la señal en la mitad, si la pestaña se
   * cierra — lo que no se confirmó sigue esperando.
   */
  function quitarDeCola(cola, respuesta) {
    var r = objeto(respuesta), confirmadas = {};
    lista(r.revisiones).forEach(function (rev) {
      if (rev) confirmadas[texto(rev.tabla) + '' + texto(rev.id)] = true;
    });
    var chocadas = {};
    lista(r.choques).forEach(function (ch) {
      if (ch) chocadas[texto(ch.tabla) + '' + texto(ch.id)] = ch;
    });
    return lista(cola).map(clonar).filter(function (c) {
      return !confirmadas[llaveDeCambio(c)];
    }).map(function (c) {
      var ch = chocadas[llaveDeCambio(c)];
      if (ch) { c.choque = true; c.choque_en = ch.actualizado_en || null; }
      return c;
    });
  }

  /**
   * Cuántas cosas esperan subir. Es el número del aviso honesto de la pantalla
   * ("3 esperando subir"), así que cuenta FILAS que van a viajar: si Joan tocó
   * el mismo crédito tres veces, es una sola cosa pendiente.
   * Aguanta que le pasen la cola, un lote o un paquete: la pantalla no tiene
   * por qué saber en qué forma está lo pendiente.
   */
  function contarPendientes(cola) {
    if (!cola) return 0;
    if (Array.isArray(cola)) {
      var vistos = {}, n = 0;
      cola.forEach(function (c) {
        var k = llaveDeCambio(c);
        if (tiene(vistos, k)) return;
        vistos[k] = true; n++;
      });
      return n;
    }
    if (typeof cola !== 'object') return 0;
    if (Array.isArray(cola.cambios)) return contarPendientes(cola.cambios);
    if (Array.isArray(cola.cola)) return contarPendientes(cola.cola);
    return tamanoLote(cola);
  }

  /**
   * Las dos versiones de cada choque, juntas y listas para guardar ANTES de
   * mostrarle nada a nadie. `mio` es lo que este aparato quiso escribir y
   * `suyo` lo que había en el servidor: mientras Joan decide, las dos están en
   * el disco. Ninguna se puede evaporar por cerrar la pestaña.
   */
  function choquesDe(lote, respuesta, dispositivo) {
    var l = objeto(lote), r = objeto(respuesta), mios = {};
    TABLAS.forEach(function (t) {
      lista(l[t]).forEach(function (f) { mios[t + '' + idDe(f)] = f && f.datos; });
    });
    lista(l.ajustes).forEach(function (a) { mios['ajustes' + texto(a && a.clave)] = a && a.datos; });
    return lista(r.choques).map(function (ch) {
      var llave = texto(ch && ch.tabla) + '' + texto(ch && ch.id);
      return {
        tabla: texto(ch && ch.tabla),
        id: texto(ch && ch.id),
        mio: clonar(mios[llave] === undefined ? null : mios[llave]),
        suyo: clonar(ch && ch.datos_servidor),
        revision_servidor: num(ch && ch.revision_servidor),
        actualizado_por: (ch && ch.actualizado_por) || null,
        actualizado_en: (ch && ch.actualizado_en) || null,
        dispositivo: dispositivo || null,
        cuando: new Date().toISOString(),
        resuelto_como: null
      };
    });
  }

  /* =========================================================================
   * PARTE CON RED — de acá para abajo solo corre en el navegador.
   *
   * Nada de esto se ejecuta al cargar el archivo: en node, `require` de
   * panel/nube.js no toca localStorage ni fetch. Por eso todas las lecturas de
   * disco están DENTRO de las funciones y ninguna afuera.
   * =======================================================================*/

  function almacen() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      return localStorage;
    } catch (e) { return null; }   // Safari en privado tira al leer la propiedad
  }
  function leerJSON(llave, porDefecto) {
    var a = almacen();
    if (!a) return porDefecto;
    try {
      var t = a.getItem(llave);
      return t ? JSON.parse(t) : porDefecto;
    } catch (e) { return porDefecto; }
  }
  function escribirJSON(llave, valor) {
    /* El cinturón de seguridad de todo el archivo. Si algún día alguien escribe
       acá la llave del Panel por descuido, se le cae la prueba y no la cartera
       de Joan. */
    if (llave === LLAVE_PANEL_PROHIBIDA_DE_ESCRIBIR) {
      throw new Error('nube.js no escribe nunca en ' + LLAVE_PANEL_PROHIBIDA_DE_ESCRIBIR + ': ahí vive la cartera del Panel.');
    }
    var a = almacen();
    if (!a) return false;
    try { a.setItem(llave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }    // sin espacio: quien llama decide qué decir
  }

  /* ------------------------------------------------------------- conexión */
  function config() {
    var c = objeto(leerJSON(LLAVE_CONFIG, {}));
    return { url: texto(c.url).replace(/\/+$/, ''), anon: texto(c.anon), clave: texto(c.clave) };
  }
  /** Guarda url y llave anónima CONSERVANDO `clave`, que es de la
      sincronización vieja con los socios y la sigue usando crm.html. */
  function guardarConfig(nueva) {
    var vieja = objeto(leerJSON(LLAVE_CONFIG, {}));
    var n = objeto(nueva);
    var c = {
      url: texto(n.url !== undefined ? n.url : vieja.url).replace(/\/+$/, ''),
      anon: texto(n.anon !== undefined ? n.anon : vieja.anon),
      clave: texto(vieja.clave)     // NO se toca. Ver el comentario de LLAVE_CONFIG.
    };
    escribirJSON(LLAVE_CONFIG, c);
    return c;
  }
  function hayConexion() { var c = config(); return !!(c.url && c.anon); }

  /* --------------------------------------------------------------- errores */
  var SIN_RED = 'Sin internet. Lo que hiciste queda guardado y sube solo cuando vuelva.';
  var SESION_VENCIDA = 'Se venció la sesión. Entra otra vez.';
  function fallo(motivo, extra) {
    var e = mezclar({ motivo: motivo }, objeto(extra));
    return e;
  }
  /* Un solo sitio para traducir un error de Supabase a algo que Joan entienda,
     igual que errNube() en crm.html. Todo lo que sale de acá está escrito para
     que se pueda leer parado en la calle. */
  function motivoDe(estado, cuerpo, quien) {
    var t = texto(cuerpo);
    if (estado === 404) return 'Tu base todavía no tiene «' + quien + '». Corre base/20260811_panel_nube.sql en el SQL Editor de Supabase.';
    if (estado === 401 || estado === 403) return SESION_VENCIDA;
    if (t.indexOf('no autorizado') >= 0) return 'Tu usuario entró bien, pero no está en la lista de dueños. Falta meter tu uid en la tabla panel_duenos (paso 6 de la receta).';
    if (t.indexOf('invalid_grant') >= 0 || t.indexOf('Invalid login') >= 0) return 'El correo o la contraseña no coinciden.';
    if (t.indexOf('Email logins are disabled') >= 0) return 'La entrada por correo está apagada en Supabase (Authentication → Providers → Email).';
    return 'Supabase respondió ' + estado + ': ' + t.slice(0, 140);
  }
  function pedir(url, opciones, quien) {
    if (typeof fetch !== 'function') return Promise.reject(fallo('Este navegador no puede hablar con la nube.'));
    if (typeof navigator === 'object' && navigator && navigator.onLine === false) return Promise.reject(fallo(SIN_RED, { sin_red: true }));
    return fetch(url, opciones).then(function (r) {
      return r.text().then(function (t) {
        var cuerpo = null;
        try { cuerpo = t ? JSON.parse(t) : null; } catch (e) { cuerpo = t; }
        if (r.ok) return cuerpo;
        throw fallo(motivoDe(r.status, t, quien), { estado: r.status, cuerpo: cuerpo });
      });
    }, function () {
      /* fetch solo rechaza cuando no hubo respuesta: sin red, DNS caído, CORS.
         Para el que está en la calle es siempre lo mismo, y lo que necesita
         saber es que no perdió nada. */
      throw fallo(SIN_RED, { sin_red: true });
    });
  }

  /* --------------------------------------------------------------- sesión */
  function sesion() {
    var s = leerJSON(LLAVE_SESION, null);
    if (!s || !s.access_token) return null;
    return s;
  }
  function guardarSesion(datos, correo) {
    var d = objeto(datos);
    if (!d.access_token) return null;
    var s = {
      access_token: d.access_token,
      refresh_token: d.refresh_token || (sesion() || {}).refresh_token || '',
      /* Se guarda el instante de vencimiento y no los segundos que faltaban:
         un `expires_in` guardado tal cual envejece en el disco y a la hora
         siguiente miente. */
      expira_en: Date.now() + (num(d.expires_in) || 3600) * 1000,
      correo: correo || (objeto(d.user).email) || (sesion() || {}).correo || ''
    };
    escribirJSON(LLAVE_SESION, s);
    return s;
  }
  function borrarSesion() {
    var a = almacen();
    if (a) { try { a.removeItem(LLAVE_SESION); } catch (e) { /* nada que hacer */ } }
  }
  function conectado() {
    var s = sesion();
    return !!(s && s.access_token && hayConexion());
  }

  function entrar(correo, contrasena) {
    var c = config();
    if (!c.url || !c.anon) return Promise.reject(fallo('Falta la conexión: la URL del proyecto y la llave anónima.'));
    return pedir(c.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.anon },
      body: JSON.stringify({ email: texto(correo).trim(), password: texto(contrasena) })
    }, 'entrar').then(function (r) {
      var s = guardarSesion(r, texto(correo).trim());
      if (!s) throw fallo('Supabase no devolvió la sesión. Vuelve a intentar.');
      return s;
    });
  }

  function refrescar() {
    var c = config(), s = sesion();
    if (!s || !s.refresh_token) return Promise.reject(fallo(SESION_VENCIDA));
    return pedir(c.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.anon },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }, 'refrescar').then(function (r) {
      var n = guardarSesion(r, s.correo);
      if (!n) throw fallo(SESION_VENCIDA);
      return n;
    }, function () {
      /* Si el refresh no sirve, la sesión local ya no vale para nada: dejarla
         puesta solo consigue que cada acción falle con un error distinto. */
      borrarSesion();
      throw fallo(SESION_VENCIDA);
    });
  }

  function salir() {
    var c = config(), s = sesion();
    var terminar = function () { borrarSesion(); return true; };
    if (!s || !c.url) return Promise.resolve(terminar());
    return pedir(c.url + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.anon, Authorization: 'Bearer ' + s.access_token },
      body: '{}'
    }, 'salir').then(terminar, terminar);   // salir SIEMPRE sale, haya red o no
  }

  /* ------------------------------------------------------------------ rpc */
  /**
   * La única puerta hacia las funciones de la base. Un 401 se reintenta UNA
   * vez, refrescando la sesión: el token de Supabase dura una hora y a Joan no
   * se le puede pedir que vuelva a escribir la contraseña en la mitad de un
   * cobro. Si el segundo intento también falla, se lo dice claro y se acabó —
   * reintentar en bucle solo esconde el problema.
   */
  function rpc(fn, cuerpo) {
    var c = config();
    if (!c.url || !c.anon) return Promise.reject(fallo('Todavía no conectaste la nube (URL del proyecto y llave anónima).'));
    var s = sesion();
    if (!s) return Promise.reject(fallo('Todavía no entraste con tu correo y contraseña.'));

    function intentar(tok) {
      return pedir(c.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: c.anon,
          Authorization: 'Bearer ' + tok
        },
        body: JSON.stringify(cuerpo || {})
      }, fn);
    }

    return intentar(s.access_token).catch(function (e) {
      if (!e || e.estado !== 401) throw e;
      return refrescar().then(function (n) { return intentar(n.access_token); });
    });
  }

  function traer(desde) {
    return rpc('panel_traer', { p_desde: desde || null });
  }
  function empujar(dispositivo, lote) {
    return rpc('panel_empujar', { p_dispositivo: texto(dispositivo) || 'sin nombre', p_lote: loteLimpio(lote) });
  }
  function siguienteNumero(nombre) {
    return rpc('panel_siguiente_numero', { p_nombre: texto(nombre) });
  }
  /** Solo para la primera subida: pone el contador en el máximo entre lo que
      hay y lo que trae el Panel, para que el celular no emita un número de
      cliente que ya existe en el computador. Nunca lo baja. */
  function sembrarContador(nombre, valor) {
    return rpc('panel_sembrar_contador', { p_nombre: texto(nombre), p_valor: num(valor) });
  }

  /* ============================================================ disco local */

  /** La caché del celular: el espejo (para el diff) y el db (para pintar).
      NUNCA en 'joan_socios_v1'. En el computador comparten origen y esa llave
      es la cartera de verdad de Joan. */
  function leerLocal() {
    var g = objeto(leerJSON(LLAVE_ESPEJO, null));
    return {
      espejo: normalizarEspejo(g.espejo),
      db: g.db ? g.db : null,
      guardado_en: g.guardado_en || null
    };
  }
  function guardarLocal(datos) {
    var d = objeto(datos), actual = leerLocal();
    return escribirJSON(LLAVE_ESPEJO, {
      v: 1,
      espejo: d.espejo !== undefined ? d.espejo : actual.espejo,
      db: d.db !== undefined ? d.db : actual.db,
      guardado_en: new Date().toISOString()
    });
  }
  function leerCola() { return lista(leerJSON(LLAVE_COLA, [])); }
  function guardarCola(cola) { return escribirJSON(LLAVE_COLA, lista(cola)); }
  /** Encolar Y GUARDAR, en la misma llamada y a propósito: si la pantalla
      encolara y guardara por separado, un cierre de pestaña en el medio
      dejaría el cambio en la memoria y no en el disco. Devuelve la cola nueva
      para que quien llamó pinte "N esperando subir" con el número de verdad. */
  function encolarYGuardar(cambio) {
    var cola = encolar(leerCola(), cambio);
    guardarCola(cola);
    return cola;
  }
  function pendientes() { return contarPendientes(leerCola()); }

  function leerChoques() { return lista(leerJSON(LLAVE_CHOQUES, [])); }
  function guardarChoques(ch) { return escribirJSON(LLAVE_CHOQUES, lista(ch)); }
  function agregarChoques(nuevos) {
    var todos = leerChoques();
    lista(nuevos).forEach(function (ch) {
      var i = -1;
      todos.forEach(function (v, k) { if (v && v.tabla === ch.tabla && v.id === ch.id && !v.resuelto_como) i = k; });
      if (i >= 0) todos[i] = ch; else todos.push(ch);
    });
    guardarChoques(todos);
    return todos;
  }

  /* ================================================ subir y bajar completos */

  /**
   * Sube lo que hay en la cola, por pedazos, y deja el disco coherente pase lo
   * que pase:
   *   · lo confirmado sale de la cola y entra al espejo;
   *   · lo que chocó se queda en la cola marcado, y las DOS versiones quedan
   *     guardadas en 'joan_panel_choques' ANTES de que ninguna pantalla
   *     pregunte nada;
   *   · si se cae la red en la mitad, lo que ya se confirmó no se vuelve a
   *     mandar y lo que no, sigue esperando.
   *
   * @returns {Promise<{aplicados:number, choques:Array, pendientes:number}>}
   */
  function subirCola(dispositivo, opciones) {
    var o = objeto(opciones);
    var cola = leerCola();
    if (!cola.length) return Promise.resolve({ aplicados: 0, choques: [], pendientes: 0 });
    var pedazos = partirLote(loteDeCola(cola), o.porLote || 200);
    var resultado = { aplicados: 0, choques: [], pendientes: 0 };

    var cadena = Promise.resolve();
    pedazos.forEach(function (pedazo) {
      cadena = cadena.then(function () {
        return empujar(dispositivo, pedazo).then(function (r) {
          var resp = objeto(r);
          resultado.aplicados += num(resp.aplicados);
          var ch = choquesDe(pedazo, resp, dispositivo);
          if (ch.length) { agregarChoques(ch); resultado.choques = resultado.choques.concat(ch); }
          guardarLocal({ espejo: espejoTrasEmpujar(leerLocal().espejo, pedazo, resp) });
          guardarCola(quitarDeCola(leerCola(), resp));
          if (typeof o.avance === 'function') o.avance(resultado.aplicados, contarPendientes(leerCola()));
        });
      });
    });

    return cadena.then(function () {
      resultado.pendientes = pendientes();
      return resultado;
    });
  }

  /**
   * Trae lo que hay en la nube y lo deja aplicado en la caché local.
   *
   * `desde` sale del espejo (la hora DEL SERVIDOR de la última vez), así que en
   * la calle se baja solo lo que cambió. Sin espejo, se baja todo.
   *
   * Lo que quedó en la cola se vuelve a poner ENCIMA de lo que trajo la nube:
   * Joan tiene que seguir viendo en pantalla lo que hizo hace diez minutos
   * aunque todavía no haya subido. Si eso además chocó, el aviso rojo ya está
   * guardado y se lo va a mostrar la pantalla; lo que no puede pasar es que su
   * trabajo desaparezca solo.
   */
  function bajar(opciones) {
    var o = objeto(opciones);
    var local = leerLocal();
    var desde = o.completo === true ? null : (local.espejo.servidor_ahora || null);
    return traer(desde).then(function (paquete) {
      var p = objeto(paquete);
      var base = p.completo ? null : local.db;
      var r = aplicarPaquete(base, p);
      var cola = leerCola();
      var db = cola.length ? aplicarPaquete(r.db, paqueteDeLote(loteDeCola(cola), { completo: false })).db : r.db;
      var espejo = espejoDe(p, local.espejo);
      guardarLocal({ espejo: espejo, db: db });
      return { db: db, cambios: r.cambios, paquete: p, espejo: espejo, pendientes: contarPendientes(cola) };
    });
  }

  /** El ciclo completo, en el orden que no pierde nada: PRIMERO subir (ahí
      salen los choques, con las dos versiones a salvo) y DESPUÉS bajar. Al
      revés, lo de la nube pisa lo que este aparato todavía no había mandado. */
  function sincronizar(dispositivo, opciones) {
    return subirCola(dispositivo, opciones).then(function (s) {
      return bajar(opciones).then(function (b) {
        return { subida: s, bajada: b, choques: s.choques, pendientes: pendientes() };
      });
    });
  }

  /* Una suposición, no un dato: sirve para rellenar el campo "actualizado_por"
     con algo útil sin preguntarle nada a Joan. Cada pantalla puede mandar el
     nombre que quiera. */
  function dispositivoPorDefecto() {
    try {
      var ua = (typeof navigator === 'object' && navigator && navigator.userAgent) || '';
      return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'celular' : 'computador';
    } catch (e) { return 'computador'; }
  }

  /** Cuánto pesa, en KB, lo que se va a mandar. Medido sobre el JSON de
      verdad —el mismo texto que viaja—, no estimado. */
  function pesoKB(valor) {
    var t = JSON.stringify(valor === undefined ? null : valor) || '';
    if (typeof TextEncoder === 'function') {
      try { return Math.round(new TextEncoder().encode(t).length / 102.4) / 10; } catch (e) { /* sigue abajo */ }
    }
    /* Sin TextEncoder (node viejo) se cuenta por byte de UTF-8 a mano: las
       tildes y las eñes ocupan dos, y este proyecto está entero en español. */
    var n = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      n += c < 0x80 ? 1 : (c < 0x800 ? 2 : 3);
    }
    return Math.round(n / 102.4) / 10;
  }

  /* =========================================================================
   * LO QUE SE EXPORTA
   * =======================================================================*/
  return {
    VERSION: '2026-08-11',

    /* constantes, para que las pantallas no las escriban a mano */
    LLAVE_CONFIG: LLAVE_CONFIG,
    LLAVE_SESION: LLAVE_SESION,
    LLAVE_ESPEJO: LLAVE_ESPEJO,
    LLAVE_COLA: LLAVE_COLA,
    LLAVE_CHOQUES: LLAVE_CHOQUES,
    TABLAS: TABLAS,
    CAMPO_DB: CAMPO_DB,
    CLAVES_AJUSTES: CLAVES_AJUSTES,
    CLAVES_AJUSTES_SIN_PAPELERA: CLAVES_AJUSTES_SIN_PAPELERA,
    CAMPOS_FOTO: CAMPOS_FOTO,
    LISTAS_SOCIO: LISTAS_SOCIO,
    LISTAS_CREDITO: LISTAS_CREDITO,
    LISTAS_RESPALDADO: LISTAS_RESPALDADO,
    LISTAS_QUE_SUMAN: LISTAS_QUE_SUMAN,
    CAMPOS_PISABLES_TIPICOS: CAMPOS_PISABLES_TIPICOS,

    /* --- parte pura (lo que prueban pruebas/nube.test.js) --- */
    /* jsonCanonico se exporta porque subir.html tiene que comparar con la MISMA
       regla que usa el espejo. Dos formas de serializar en el mismo flujo es
       otra vez una segunda verdad, y de esa ya sabemos cómo termina. */
    jsonCanonico: jsonCanonico,
    sinFotos: sinFotos,
    dbSinFotos: dbSinFotos,
    espejoVacio: espejoVacio,
    espejoDe: espejoDe,
    espejoTrasEmpujar: espejoTrasEmpujar,
    armarLote: armarLote,
    loteLimpio: loteLimpio,
    partirLote: partirLote,
    tamanoLote: tamanoLote,
    aplicarPaquete: aplicarPaquete,
    paqueteDeLote: paqueteDeLote,
    fusionarListas: fusionarListas,
    fusionarFila: fusionarFila,
    colaVacia: colaVacia,
    encolar: encolar,
    loteDeCola: loteDeCola,
    quitarDeCola: quitarDeCola,
    contarPendientes: contarPendientes,
    choquesDe: choquesDe,
    dbBase: dbBase,
    pesoKB: pesoKB,

    /* --- parte con red y disco (solo navegador) --- */
    config: config,
    guardarConfig: guardarConfig,
    hayConexion: hayConexion,
    entrar: entrar,
    refrescar: refrescar,
    salir: salir,
    sesion: sesion,
    conectado: conectado,
    rpc: rpc,
    traer: traer,
    empujar: empujar,
    siguienteNumero: siguienteNumero,
    sembrarContador: sembrarContador,
    leerLocal: leerLocal,
    guardarLocal: guardarLocal,
    leerCola: leerCola,
    guardarCola: guardarCola,
    encolarYGuardar: encolarYGuardar,
    pendientes: pendientes,
    leerChoques: leerChoques,
    guardarChoques: guardarChoques,
    agregarChoques: agregarChoques,
    subirCola: subirCola,
    bajar: bajar,
    sincronizar: sincronizar,
    dispositivoPorDefecto: dispositivoPorDefecto
  };
});
