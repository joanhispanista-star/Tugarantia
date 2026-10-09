/* ============================================================================
 * LA UBICACIÓN APROXIMADA POR INTERNET — 8 de octubre de 2026
 *
 * Joan, el 8-oct: «no es necesario preguntar por la dirección, mejor con la
 * dirección IP validamos una ubicación aproximada y la dejamos anotada
 * automáticamente». La dirección pasó a ser opcional en el registro, así que
 * esto es lo que le queda a Joan para saber de dónde le escriben.
 *
 * QUÉ ES Y QUÉ NO ES. La IP la guarda la base al recibir las fotos del registro
 * (huella.ip, la cabecera de la petición: no la manda el teléfono). Un servicio
 * de geolocalización dice en qué ciudad está esa red. Eso NO es la casa de
 * nadie: con datos del celular, el operador puede sacar a toda una región por
 * una sola ciudad, y una VPN la pone en otro país. Por eso cada renglón dice
 * «aproximada» y «no es la dirección», siempre, y nunca se usa para decidir
 * nada solo.
 *
 * DÓNDE SE PREGUNTA: SOLO EN EL NAVEGADOR DE JOAN (el CRM y panel/revision.html).
 * Nunca desde el teléfono del cliente: play/ no carga este archivo. Así el
 * servicio de afuera ve la IP del cliente una vez, desde la herramienta de
 * Tu Garantía, y no la ve cada vez que el cliente abre la app.
 *
 * EL SERVICIO: ipwho.is (de ipwhois.io). Escogido el 8-oct-2026 leyendo sus
 * condiciones (https://ipwhois.io/pricing y https://ipwhois.io/documentation):
 *   · plan gratis SIN llave y SIN registro: no hay ningún secreto que guardar,
 *     y una llave en una página estática sería pública;
 *   · «Commercial use allowed» en el plan gratis (sus términos: uso personal
 *     o «internal business purposes», que es esto: una herramienta interna);
 *   · HTTPS y CORS abiertos (Access-Control-Allow-Origin: *, comprobado con
 *     curl ese día), así que el navegador lo puede llamar directo;
 *   · 1.000 consultas al día (desde un sitio web se cuentan por dominio); Joan
 *     revisa decenas, no miles, y cada IP se pregunta UNA vez (abajo);
 *   · trae ciudad y departamento, y los da en español (lang=es).
 * Se descartaron: ipapi.co (su plan gratis es una prueba «not for production
 * use»), IPinfo Lite (solo trae el país, y pide token) y ip-api.com (el gratis
 * no tiene HTTPS y no es para uso comercial).
 *
 * UNA VEZ POR IP. Lo consultado se guarda (a) en la nube, dentro del registro
 * (huella.ubicacion_ip, base/20261008_ubicacion_por_ip.sql), lo hace la página
 * que llama; (b) en la ficha del cliente, y (c) aquí, en una caché del
 * navegador que le pasen (localStorage en el CRM, sessionStorage en la
 * revisión). Lo que falla por la red no se guarda: la próxima vez se vuelve a
 * intentar.
 *
 * TODO LO QUE CONTESTA EL SERVICIO ES DE AFUERA. Se lee campo por campo, se
 * recorta, se le quitan los caracteres de control, y quien lo pinta lo escapa.
 * La IP se valida ANTES de armar la dirección de la consulta: lo que no tiene
 * forma de IP no llega a la URL.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(raiz);
  else raiz.UbicacionIP = fabrica(raiz);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';

  var FUENTE = {
    nombre: 'ipwho.is',
    sitio: 'https://ipwho.is',
    condiciones: 'https://ipwhois.io/pricing',
    leidas: '2026-10-08'
  };
  var URL_BASE = 'https://ipwho.is/';
  /* Solo lo que se pinta: menos datos de afuera, menos que validar. */
  var CAMPOS = 'success,message,ip,city,region,country,country_code,connection.isp,connection.org';
  var LLAVE = 'tg_ubicacion_ip_v1';
  /* 300 IPs son meses de registros. Pasando de ahí se olvidan las más viejas:
     la caché es una comodidad, la nube y la ficha son las que guardan. */
  var MAX_ENTRADAS = 300;
  /* 8-oct-2026 (segunda vuelta) — Y NADA SE QUEDA MÁS DE 90 DÍAS en el
     navegador (lo marcó la revisión de seguridad: IP → ciudad y operador sin
     fecha de vencimiento, y sobrevivía a «Borrar y repetir»). Lo que importa
     ya quedó anotado en el registro o en la ficha. */
  var VIDA_CACHE_MS = 90 * 86400000;

  /* ==========================================================================
   * SOLO CON LA AUTORIZACIÓN NUEVA — 8-oct-2026 (segunda vuelta)
   *
   * La política que aceptó quien se registró ANTES del 8-oct decía que la IP
   * «no sirve para ubicarte» y no nombraba ningún servicio de afuera. Mandar
   * su IP a ipwho.is es una finalidad nueva y un tercero nuevo, y la Ley 1581
   * (art. 5 del Decreto 1377) pide autorización NUEVA para eso: las
   * revisiones de ley y de seguridad lo marcaron. Así que solo se consulta la
   * IP de un registro que traiga autorizacion_version desde esta fecha (play/
   * la manda en los datos del registro desde la segunda vuelta del 8-oct). Sin
   * versión —todos los de antes— no se consulta, y se dice.
   * ======================================================================== */
  var DESDE_POLITICA = '2026-10-08';
  function autorizaUbicacion(datos) {
    var v = datos && typeof datos === 'object' ? String(datos.autorizacion_version || '') : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= DESDE_POLITICA;
  }

  /* ==========================================================================
   * UNA CADENA DE IPs — 8-oct-2026 (segunda vuelta)
   *
   * huella.ip guarda la cabecera x-forwarded-for entera. Si el proxy de la base
   * AGREGA la IP real a lo que mandó el teléfono en vez de reemplazarlo, la
   * PRIMERA de la lista la puede escribir el propio teléfono: alguien con VPN
   * afuera podría poner una IP de Bogotá y aparecer en Bogotá, sin la marca de
   * «Fuera de Colombia». No se sabe todavía qué hace el proxy (hay que mirarlo
   * en la base, ver el informe del 8-oct). Mientras tanto, cuando la cadena trae
   * MÁS DE UNA IP PÚBLICA, se avisa y se muestran todas: la ubicación de la
   * primera puede no ser real.
   * ======================================================================== */
  function ipsPublicas(v) {
    return limpio(v, 400).split(',').map(function (x) {
      var c = ipConsultable(x);
      return c.motivo ? '' : c.ip;
    }).filter(Boolean);
  }
  function cadenaSospechosa(v) { return ipsPublicas(v).length > 1; }
  /** Olvidar una IP de la caché (al borrar el registro de esa persona). */
  function olvidarIP(almacen, v) {
    var ip = normalizarIP(v);
    if (!ip || !almacen || typeof almacen.getItem !== 'function') return false;
    try {
      var g = JSON.parse(almacen.getItem(LLAVE) || 'null');
      if (!g || !g.ips || !g.ips[ip]) return false;
      delete g.ips[ip];
      almacen.setItem(LLAVE, JSON.stringify({ v: 1, ips: g.ips }));
      return true;
    } catch (e) { return false; }
  }
  var ESPERA_MS = 8000;
  /* Un 429 (el servicio dice «basta por hoy») apaga las consultas un rato en
     vez de seguir golpeando: cada intento de más cuenta contra el mismo cupo. */
  var PAUSA_LIMITE_MS = 15 * 60 * 1000;
  /* Dos a la vez: la bandeja puede traer cuarenta registros y no hace falta
     abrirle cuarenta conexiones a un servicio gratis. */
  var EN_PARALELO = 2;

  function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* Texto de afuera: sin caracteres de control, sin espacios de sobra, recortado. */
  function limpio(v, max) {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    return String(v).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, max || 80);
  }

  /* ==========================================================================
   * LA IP
   * ======================================================================== */

  /* La primera de la lista (la cabecera puede traer «cliente, proxy»), sin el
     prefijo de IPv4 metida en IPv6. Devuelve '' si no tiene forma de IP. */
  function normalizarIP(v) {
    var s = limpio(v, 200).split(',')[0].trim().toLowerCase();
    s = s.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
    if (esIPv4(s)) return s;
    if (esIPv6(s)) return s;
    return '';
  }
  function partesIPv4(s) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return null;
    var p = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    return p.every(function (n) { return n >= 0 && n <= 255; }) ? p : null;
  }
  function esIPv4(s) { return !!partesIPv4(s); }
  function esIPv6(s) {
    if (!/^[0-9a-f:]{2,39}$/.test(s)) return false;
    if ((s.match(/:/g) || []).length < 2) return false;
    if (s.indexOf(':::') >= 0) return false;
    var dobles = s.split('::').length - 1;
    if (dobles > 1) return false;
    var grupos = s.split(':').filter(function (g) { return g !== ''; });
    if (grupos.some(function (g) { return g.length > 4; })) return false;
    return dobles === 1 ? grupos.length < 8 : grupos.length === 8;
  }

  /* Las redes que no salen a internet (o no tienen ubicación): preguntarlas
     gasta una consulta para que el servicio conteste «Reserved range». */
  function esPrivada(ip) {
    var p = partesIPv4(ip);
    if (p) {
      var a = p[0], b = p[1];
      return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||        // CGNAT del operador
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0 && p[2] === 0) ||
        (a === 198 && (b === 18 || b === 19));
    }
    if (ip === '::' || ip === '::1') return true;
    return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^2001:0?db8:/.test(ip);
  }

  /**
   * ¿Se puede preguntar por esta IP?
   * @returns {ip, motivo}: motivo '' si sí; 'sin_ip' | 'invalida' | 'privada' si no.
   */
  function ipConsultable(v) {
    var crudo = limpio(v, 200);
    if (!crudo) return { ip: '', motivo: 'sin_ip' };
    var ip = normalizarIP(crudo);
    if (!ip) return { ip: '', motivo: 'invalida' };
    if (esPrivada(ip)) return { ip: ip, motivo: 'privada' };
    return { ip: ip, motivo: '' };
  }

  /* La dirección de la consulta. La IP ya pasó por normalizarIP: solo dígitos,
     a-f, puntos y dos puntos. Se codifica igual, por si acaso. */
  function urlConsulta(ip) {
    var c = ipConsultable(ip);
    if (c.motivo) return '';
    return URL_BASE + encodeURIComponent(c.ip).replace(/%3A/gi, ':') + '?lang=es&fields=' + CAMPOS;
  }

  /* ==========================================================================
   * LA RESPUESTA
   * ======================================================================== */

  function hoyISO() {
    var d = new Date();
    var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function fechaISO(v) {
    var s = limpio(v, 40);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }

  /**
   * Lo que contestó el servicio, convertido en lo único que se guarda.
   * @returns {ip, ciudad, region, pais, codigo_pais, red, fuente, consultada} o null
   */
  function ubicacionDe(json, ip, hoy) {
    if (!esObjeto(json) || json.success !== true) return null;
    var pedida = normalizarIP(ip);
    if (!pedida) return null;
    /* Si contesta por OTRA IP (un proxy, un error del servicio), no es esta. */
    var dice = normalizarIP(json.ip);
    if (dice && dice !== pedida) return null;
    var con = esObjeto(json.connection) ? json.connection : {};
    var cod = limpio(json.country_code, 4).toUpperCase();
    var u = {
      ip: pedida,
      ciudad: limpio(json.city, 80),
      region: limpio(json.region, 80),
      pais: limpio(json.country, 80),
      codigo_pais: /^[A-Z]{2}$/.test(cod) ? cod : '',
      red: limpio(con.isp || con.org, 120),
      fuente: FUENTE.nombre,
      consultada: fechaISO(hoy) || hoyISO()
    };
    if (!u.ciudad && !u.region && !u.pais) return null;
    return u;
  }

  /**
   * Una ubicación guardada (en la nube, en la ficha o en la caché) vuelve a
   * pasar por la misma reja antes de pintarse: esas tres las puede escribir
   * alguien más. Solo vale si es de ESTA IP — la huella cambia de IP si el
   * teléfono vuelve a subir fotos desde otra red, y la ubicación vieja no.
   */
  function ubicacionValida(u, ip) {
    if (!esObjeto(u)) return null;
    var pedida = normalizarIP(ip);
    if (!pedida || normalizarIP(u.ip) !== pedida) return null;
    var cod = limpio(u.codigo_pais, 4).toUpperCase();
    var v = {
      ip: pedida,
      ciudad: limpio(u.ciudad, 80),
      region: limpio(u.region, 80),
      pais: limpio(u.pais, 80),
      codigo_pais: /^[A-Z]{2}$/.test(cod) ? cod : '',
      red: limpio(u.red, 120),
      fuente: /^[a-z0-9.-]{1,40}$/i.test(String(u.fuente || '')) ? String(u.fuente) : FUENTE.nombre,
      consultada: fechaISO(u.consultada)
    };
    if (!v.ciudad && !v.region && !v.pais) return null;
    return v;
  }

  /* ==========================================================================
   * LAS PALABRAS
   * ======================================================================== */

  function sinTildes(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* «Bogotá», «Medellín, Antioquia», «Miami, Florida, Estados Unidos». El
     departamento se calla cuando repite la ciudad (ipwho.is dice «Bogotá,
     Distrito Capital de Bogotá»), y el país solo se dice si no es Colombia:
     ahí sí es noticia. */
  function lugar(u) {
    if (!esObjeto(u)) return '';
    var ciudad = limpio(u.ciudad, 80), region = limpio(u.region, 80), pais = limpio(u.pais, 80);
    var partes = [];
    if (ciudad) partes.push(ciudad);
    if (region && !(ciudad && sinTildes(region).indexOf(sinTildes(ciudad)) >= 0)) partes.push(region);
    var cod = limpio(u.codigo_pais, 4).toUpperCase();
    if (pais && (cod !== 'CO' || !partes.length)) partes.push(pais);
    return partes.join(', ');
  }
  function fueraDeColombia(u) {
    return esObjeto(u) && !!u.codigo_pais && String(u.codigo_pais).toUpperCase() !== 'CO';
  }
  /* La frase entera, tal como la pidió Joan. Texto plano: quien la pinta escapa. */
  function frase(u) {
    var l = lugar(u);
    return l ? 'Ubicación aproximada por internet: ' + l + ' (no es la dirección)' : '';
  }

  /* El renglón honesto cuando no hay ubicación. Ninguno culpa al cliente: que
     no se sepa de dónde es la red no dice nada de la persona. */
  var TEXTO_FALLO = {
    sin_ip: 'Sin IP guardada para este registro: no hay de dónde sacar la ubicación aproximada.',
    invalida: 'La IP guardada no tiene forma de IP: no se consultó la ubicación.',
    privada: 'La IP es de una red privada: no tiene ubicación en internet.',
    sin_datos: 'El servicio de ubicación no tiene ciudad para esa IP.',
    limite: 'El servicio de ubicación (ipwho.is) pidió una pausa: se vuelve a intentar más tarde.',
    servicio: 'El servicio de ubicación (ipwho.is) no contestó bien: se vuelve a intentar la próxima vez que lo abras.',
    sin_conexion: 'No pude consultar la ubicación aproximada (sin conexión con ipwho.is): se vuelve a intentar la próxima vez que lo abras.',
    sin_red: 'Este navegador no puede hacer la consulta de ubicación.',
    /* 8-oct-2026 (segunda vuelta) — ver autorizaUbicacion. */
    anterior: 'Se registró con la política de datos anterior al 8-oct-2026, que no autoriza consultar su IP en un servicio de afuera: no se consulta.',
    sin_modulo: 'No cargó app/ubicacion-ip.js: la ubicación aproximada no se consultó. Recarga la página.'
  };
  function fraseFallo(motivo) { return TEXTO_FALLO[motivo] || TEXTO_FALLO.servicio; }

  /* ==========================================================================
   * EL CONSULTOR: una vez por IP, dos a la vez, con caché
   * ======================================================================== */

  /**
   * @param o.fetch     la función de red (la de la página)
   * @param o.almacen   donde se recuerda lo consultado (getItem/setItem), o null
   * @param o.lecturas  otros almacenes que solo se LEEN (la revisión lee la
   *                    caché del CRM sin escribirle: el localStorage es suyo)
   * @param o.llave     la llave de la caché (por defecto tg_ubicacion_ip_v1)
   * @param o.hoy       () => 'AAAA-MM-DD'
   * @param o.ahora     () => milisegundos (para la pausa del 429)
   * @param o.espera    milisegundos antes de dar la consulta por perdida
   * @param o.setTimeout, o.clearTimeout  los de la página (para la espera)
   */
  function crearConsultor(opciones) {
    var o = opciones || {};
    var pedir = typeof o.fetch === 'function' ? o.fetch : null;
    var almacen = o.almacen || null;
    var lecturas = Array.isArray(o.lecturas) ? o.lecturas.filter(Boolean) : [];
    var llave = o.llave || LLAVE;
    var hoy = typeof o.hoy === 'function' ? o.hoy : hoyISO;
    var ahora = typeof o.ahora === 'function' ? o.ahora : function () { return Date.now(); };
    var espera = Number(o.espera) > 0 ? Number(o.espera) : ESPERA_MS;
    var temporizador = typeof o.setTimeout === 'function' ? o.setTimeout
      : (typeof raiz.setTimeout === 'function' ? raiz.setTimeout.bind(raiz) : null);
    var desarmar = typeof o.clearTimeout === 'function' ? o.clearTimeout
      : (typeof raiz.clearTimeout === 'function' ? raiz.clearTimeout.bind(raiz) : null);

    var memoria = {};       // ip -> ubicación
    var definitivas = {};   // ip -> motivo que no cambia en esta sesión (privada, sin_datos)
    var enCurso = {};       // ip -> promesa
    var cola = [];
    var activas = 0;
    var pausaHasta = 0;

    function leerDe(a) {
      if (!a || typeof a.getItem !== 'function') return null;
      try {
        var g = JSON.parse(a.getItem(llave) || 'null');
        return esObjeto(g) && esObjeto(g.ips) ? g : null;
      } catch (e) { return null; }
    }
    function vigente(x) {
      var t = Number(x && x.t) || 0;
      return t > 0 && (ahora() - t) <= VIDA_CACHE_MS;
    }
    function deCache(ip) {
      var fuentes = [almacen].concat(lecturas);
      for (var i = 0; i < fuentes.length; i++) {
        var g = leerDe(fuentes[i]);
        var x = g && g.ips[ip];
        var u = x && vigente(x) && ubicacionValida(x.u, ip);
        if (u) return u;
      }
      return null;
    }
    function aCache(ip, u) {
      if (!almacen || typeof almacen.setItem !== 'function') return;
      try {
        var g = leerDe(almacen) || { v: 1, ips: {} };
        g.ips[ip] = { u: u, t: ahora() };
        /* Lo vencido se va al escribir (ver VIDA_CACHE_MS). */
        Object.keys(g.ips).forEach(function (k) { if (!vigente(g.ips[k])) delete g.ips[k]; });
        var ips = Object.keys(g.ips);
        if (ips.length > MAX_ENTRADAS) {
          ips.sort(function (a, b) { return (Number(g.ips[a].t) || 0) - (Number(g.ips[b].t) || 0); })
            .slice(0, ips.length - MAX_ENTRADAS).forEach(function (k) { delete g.ips[k]; });
        }
        almacen.setItem(llave, JSON.stringify({ v: 1, ips: g.ips }));
      } catch (e) { /* sin espacio o sin almacén: queda en memoria, y ya */ }
    }

    /** Lo que ya se sabe de esa IP sin preguntarle a nadie, o null. */
    function conocida(v) {
      var c = ipConsultable(v);
      if (c.motivo) return null;
      if (memoria[c.ip]) return memoria[c.ip];
      var u = deCache(c.ip);
      if (u) memoria[c.ip] = u;
      return u;
    }
    /** Anotar una ubicación que la página ya trae (de la nube o de la ficha). */
    function anotar(v, u) {
      var c = ipConsultable(v);
      if (c.motivo) return null;
      var ok = ubicacionValida(u, c.ip);
      if (!ok) return null;
      memoria[c.ip] = ok;
      if (!deCache(c.ip)) aCache(c.ip, ok);
      return ok;
    }

    function siguiente() {
      while (activas < EN_PARALELO && cola.length) {
        var t = cola.shift();
        activas++;
        t();
      }
    }

    /* LA ESPERA CORTA LA PETICIÓN, NO LA PROMESA. Con AbortController el
       navegador suelta la conexión de verdad a los ocho segundos, y la cola de
       dos a la vez no se queda trancada detrás de una consulta colgada. Donde
       no hay AbortController no hay espera: el navegador corta solo, más tarde. */
    function controlDeEspera() {
      var AC = raiz.AbortController;
      if (typeof AC !== 'function' || !temporizador) return null;
      var c = new AC();
      var t = temporizador(function () { try { c.abort(); } catch (e) { /* ya terminó */ } }, espera);
      /* Que la espera no mantenga vivo un proceso de Node (las pruebas) y que
         se suelte apenas contesta el servicio. */
      if (t && typeof t.unref === 'function') t.unref();
      return { ctrl: c, soltar: function () { if (desarmar) { try { desarmar(t); } catch (e) { /* nada */ } } } };
    }

    function preguntar(ip) {
      var vigia = controlDeEspera();
      var ctrl = vigia ? vigia.ctrl : null;
      var soltar = function (x) { if (vigia) vigia.soltar(); return x; };
      return Promise.resolve().then(function () {
        /* Sin cookies y sin decir desde qué página se pregunta: al servicio le
           basta la IP. */
        var cfg = { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' };
        if (ctrl) cfg.signal = ctrl.signal;
        return pedir(urlConsulta(ip), cfg);
      }).then(function (r) {
        var st = Number(r && r.status) || 0;
        if (st === 429) { pausaHasta = ahora() + PAUSA_LIMITE_MS; return { ok: false, motivo: 'limite' }; }
        if (!r || (r.ok === false) || (st && (st < 200 || st >= 300))) return { ok: false, motivo: 'servicio' };
        var leer = typeof r.text === 'function' ? r.text() : (typeof r.json === 'function' ? r.json() : null);
        return Promise.resolve(leer).then(function (t) {
          var j = t;
          if (typeof t === 'string') { try { j = JSON.parse(t); } catch (e) { j = null; } }
          if (!esObjeto(j)) return { ok: false, motivo: 'servicio' };
          if (j.success !== true) {
            var m = limpio(j.message, 80).toLowerCase();
            var motivo = /reserved|private|reservad/.test(m) ? 'privada'
              : /invalid|inv[aá]lid/.test(m) ? 'invalida'
              : /limit/.test(m) ? 'limite' : 'sin_datos';
            if (motivo === 'limite') pausaHasta = ahora() + PAUSA_LIMITE_MS;
            else definitivas[ip] = motivo;
            return { ok: false, motivo: motivo };
          }
          var u = ubicacionDe(j, ip, hoy());
          if (!u) { definitivas[ip] = 'sin_datos'; return { ok: false, motivo: 'sin_datos' }; }
          memoria[ip] = u;
          aCache(ip, u);
          return { ok: true, ubicacion: u, de: 'red' };
        });
      }).then(soltar, function () { return soltar({ ok: false, motivo: 'sin_conexion' }); });
    }

    /**
     * La ubicación aproximada de una IP. Nunca lanza.
     * @returns Promise de {ok:true, ubicacion, de:'memoria'|'cache'|'red'}
     *                  o {ok:false, motivo}  (ver fraseFallo)
     */
    function consultar(v) {
      var c = ipConsultable(v);
      if (c.motivo) return Promise.resolve({ ok: false, motivo: c.motivo });
      var ip = c.ip;
      if (memoria[ip]) return Promise.resolve({ ok: true, ubicacion: memoria[ip], de: 'memoria' });
      var guardada = deCache(ip);
      if (guardada) { memoria[ip] = guardada; return Promise.resolve({ ok: true, ubicacion: guardada, de: 'cache' }); }
      if (definitivas[ip]) return Promise.resolve({ ok: false, motivo: definitivas[ip] });
      if (enCurso[ip]) return enCurso[ip];
      if (!pedir) return Promise.resolve({ ok: false, motivo: 'sin_red' });
      if (ahora() < pausaHasta) return Promise.resolve({ ok: false, motivo: 'limite' });
      var p = new Promise(function (res) {
        cola.push(function () {
          var fin = function (x) { activas--; delete enCurso[ip]; res(x); siguiente(); };
          /* Pudo entrar una pausa (429) mientras esperaba turno. */
          if (ahora() < pausaHasta) { fin({ ok: false, motivo: 'limite' }); return; }
          var q;
          try { q = preguntar(ip); } catch (e) { q = Promise.resolve({ ok: false, motivo: 'sin_conexion' }); }
          q.then(fin, function () { fin({ ok: false, motivo: 'sin_conexion' }); });
        });
      });
      enCurso[ip] = p;
      siguiente();
      return p;
    }

    return { consultar: consultar, conocida: conocida, anotar: anotar };
  }

  return {
    FUENTE: { nombre: FUENTE.nombre, sitio: FUENTE.sitio, condiciones: FUENTE.condiciones, leidas: FUENTE.leidas },
    LLAVE: LLAVE,
    MAX_ENTRADAS: MAX_ENTRADAS,
    VIDA_CACHE_MS: VIDA_CACHE_MS,
    DESDE_POLITICA: DESDE_POLITICA,
    autorizaUbicacion: autorizaUbicacion,
    ipsPublicas: ipsPublicas,
    cadenaSospechosa: cadenaSospechosa,
    olvidarIP: olvidarIP,
    normalizarIP: normalizarIP,
    esPrivada: esPrivada,
    ipConsultable: ipConsultable,
    urlConsulta: urlConsulta,
    ubicacionDe: ubicacionDe,
    ubicacionValida: ubicacionValida,
    lugar: lugar,
    fueraDeColombia: fueraDeColombia,
    frase: frase,
    fraseFallo: fraseFallo,
    crearConsultor: crearConsultor
  };
});
