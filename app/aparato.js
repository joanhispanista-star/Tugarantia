/* ============================================================================
 * EL TELÉFONO DE VERDAD — 19 de octubre de 2026
 *
 * Joan: el «tipo de celular» que muestra el panel no es el teléfono del
 * cliente. Tenía razón, y no por un detalle: la base anotaba la cabecera
 * User-Agent, y desde 2023 Chrome en Android manda la MISMA cadena en todos
 * los teléfonos («Android 10; K»: ni la versión ni el modelo son de verdad).
 * La app de Android también, porque es una TWA —Chrome por dentro—. El CRM
 * pintaba «Android 10 · K · Chrome» para un Galaxy A15 con Android 14 y para
 * un Redmi con Android 13. Ver app/cuenta.js (leerUserAgent) para la otra mitad.
 *
 * LO QUE HACE ESTE ARCHIVO. Le pregunta al navegador lo que el navegador SÍ
 * sabe y la cabecera ya no trae: navigator.userAgentData.getHighEntropyValues
 * (Chrome, la app de Android, Edge y Samsung Internet) da el modelo
 * («SM-A155M»), la versión de Android («14») y la del navegador. Lo arma en
 * un objeto pequeño y validado que la página manda a aparato_anotar
 * (base/20261019_aparato_del_telefono.sql) al registrarse, al pedir y al
 * aceptar. Y le da al CRM las palabras para mostrarlo.
 *
 * LO QUE NO PUEDE HACER, Y POR ESO LO DICE:
 *   · iPhone: Safari no tiene userAgentData y Apple no deja a una página saber
 *     el modelo exacto. Se manda «iPhone, iOS 26» y el motivo; no se estima el
 *     modelo por el tamaño de la pantalla (decisión del 19-oct: sería inventar).
 *   · Firefox no lo tiene: solo da la versión de Android.
 *   · Lo que dice el navegador se puede falsificar, igual que la cabecera. Por
 *     eso el CRM lo rotula «Lo informa el navegador del teléfono» y la regla
 *     de fraude (app/revision-registro.js) NO le da más peso: un Galaxy A15 lo
 *     tienen miles, no sirve para decir «es el mismo aparato».
 *   · El modelo llega como código (SM-A155M), no como nombre comercial. Una
 *     tabla de nombres se desactualiza cada mes; se muestra el código y la
 *     marca deducida por el prefijo, y si el prefijo es de dos marcas, se
 *     nombran las dos.
 *
 * NUNCA BLOQUEA. getHighEntropyValues es asíncrono: se le da un límite de
 * tiempo (800 ms) y, pase lo que pase, la promesa se cumple con lo que haya.
 * Nunca se rechaza. La página la llama sin esperar respuesta.
 *
 * LA APP. Que la página va dentro de NUESTRA app de Android no sale en el
 * user-agent (es Chrome). Lo dice document.referrer, «android-app://
 * co.tugarantia.…», pero SOLO en la primera carga: una recarga lo pierde. Por
 * eso se guarda en localStorage al abrir —no en sessionStorage, que Android
 * no devuelve tras la relanzada de la cámara (ver play/index.html,
 * LLAVE_PASO)— y después se cree solo si la página sigue en pantalla
 * completa: el mismo perfil de Chrome abierto como pestaña normal no es la app.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Aparato = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Las listas cerradas. Son las MISMAS que valida la base en aparato_anotar:
     pruebas/aparato.test.js las compara con el archivo SQL, porque si una
     crece de un lado y no del otro la base tira el dato sin avisar. */
  var PLATAFORMAS = ['android', 'ios', 'ipados', 'windows', 'mac', 'linux', 'chromeos', 'otro'];
  var NAVEGADORES = ['Chrome', 'Samsung Internet', 'Edge', 'Opera', 'Firefox', 'Safari',
                     'Navegador Huawei', 'Navegador Xiaomi', 'Brave', 'otro'];
  var VIAS = ['app_tu_garantia', 'app_platachat', 'pagina_instalada', 'navegador',
              'dentro_de_facebook', 'dentro_de_instagram', 'dentro_de_tiktok', 'dentro_de_otra_app'];
  var SIN_MODELO = ['apple_no_lo_entrega', 'el_navegador_no_lo_dice'];
  var FUENTES = ['client_hints', 'user_agent'];
  /* La forma de un modelo y de una versión: igual que en la base. */
  var MODELO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9 ._()+\/-]{0,59}$/;
  var VERSION_SISTEMA = /^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$/;
  var VERSION_NAVEGADOR = /^[0-9]{1,4}$/;

  var TIEMPO = 800;
  var LLAVE_APP = 'tg_abierta_desde_app_v1';
  /* Los tres envoltorios de android/ (twa-play.json, twa-manifest.json,
     twa-platachat.json). Otro paquete en el referrer no es nuestra app. */
  var VIA_DE_PAQUETE = {
    'co.tugarantia.creditos': 'app_tu_garantia',
    'co.tugarantia.socio': 'app_tu_garantia',
    'co.tugarantia.platachat': 'app_platachat'
  };
  var PALABRAS_VIA = {
    app_tu_garantia: 'app Tu Garantía',
    app_platachat: 'app PlataChat',
    pagina_instalada: 'página instalada en la pantalla de inicio'
  };
  var CUANDO = { registro: 'Al registrarse', solicitud: 'Al pedir', aceptacion: 'Al aceptar' };
  var NOTA = {
    informa: 'Lo informa el navegador del teléfono.',
    apple: 'Apple no deja a una página saber el modelo exacto.',
    computador: 'Es un computador, no un celular.',
    viejo: 'El modelo no se supo: el registro es anterior al 19-oct-2026, o su app no lo informó. Solo queda lo que anunció la conexión.',
    cabecera: 'El teléfono no informó más: solo queda lo que anunció la conexión.'
  };

  /* El lector del user-agent es UNO y vive en app/cuenta.js. Se busca al
     usarlo y no al cargar: así no importa en qué orden lleguen los dos. */
  function cuenta() {
    if (typeof module === 'object' && module.exports && typeof require === 'function') return require('./cuenta.js');
    /* global CuentaSocio */
    return typeof CuentaSocio !== 'undefined' ? CuentaSocio : null;
  }
  function palabras() {
    var U = cuenta();
    return (U && U.PALABRAS_APARATO) || {
      plataforma: { windows: 'Windows', mac: 'Mac o iPad', linux: 'Linux', chromeos: 'Chromebook' },
      dentro_de: { facebook: 'dentro de Facebook', instagram: 'dentro de Instagram',
                   tiktok: 'dentro de TikTok', otra_app: 'dentro de otra app' }
    };
  }
  function texto(v) { return v == null ? '' : String(v).trim(); }
  function esObjeto(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /* ==========================================================================
   * LA MARCA, POR EL PREFIJO DEL CÓDIGO
   * ======================================================================== */
  var MARCAS = [
    [/^(SM|GT|SC|SGH|SHV)-/i, 'Samsung'],
    [/^Galaxy\b/i, 'Samsung'],
    [/^(moto\b|motorola\b|XT\d{4})/i, 'Motorola'],
    [/^RMX\d/i, 'realme'],
    [/^realme\b/i, 'realme'],
    /* OPPO y OnePlus comparten los CPH desde que se juntaron. */
    [/^CPH\d/i, 'OPPO u OnePlus'],
    [/^OPPO\b/i, 'OPPO'],
    [/^OnePlus\b/i, 'OnePlus'],
    [/^(V2\d{3}[A-Z]?|vivo\b)/i, 'vivo'],
    [/^TECNO\b/i, 'TECNO'],
    [/^Infinix\b/i, 'Infinix'],
    [/^itel\b/i, 'itel'],
    [/^ZTE\b/i, 'ZTE'],
    [/^HONOR\b/i, 'HONOR'],
    [/^HUAWEI\b/i, 'Huawei'],
    /* ANA-NX9, JNY-LX3, MAR-LX3A: el formato es de Huawei y lo heredó HONOR. */
    [/^[A-Z]{3}-(AL|AN|L|LX|NX|N|TL)\d/i, 'Huawei u HONOR'],
    [/^(Redmi|POCO|Mi\s|MI\s|Xiaomi)/i, 'Xiaomi'],
    /* 2312DRA50G (Redmi Note 13), 23129RAA4G, 220333QL, M2101K6G. */
    [/^(2[0-4]\d{2}[0-9A-Z]{3,7}|M2\d{3}[A-Z0-9]{3,5})$/, 'Xiaomi, Redmi o POCO'],
    [/^Pixel\b/i, 'Google'],
    [/^Nokia\b/i, 'Nokia'],
    [/^LM-/i, 'LG'],
    [/^ASUS/i, 'ASUS'],
    [/^(Lenovo\b|TB-)/i, 'Lenovo']
  ];
  function marcaDeModelo(modelo) {
    var m = texto(modelo);
    if (!m) return '';
    for (var i = 0; i < MARCAS.length; i++) if (MARCAS[i][0].test(m)) return MARCAS[i][1];
    return '';
  }
  /* «Samsung SM-A155M», pero «TECNO KI5q» y no «TECNO TECNO KI5q». */
  function conMarca(modelo) {
    var marca = marcaDeModelo(modelo);
    if (!marca) return modelo;
    var primera = modelo.split(/\s+/)[0].toLowerCase();
    return primera === marca.toLowerCase() ? modelo : marca + ' ' + modelo;
  }

  /* ==========================================================================
   * LA APP DE ANDROID, POR EL REFERRER
   * ======================================================================== */
  function appDeReferrer(ref) {
    var m = /^android-app:\/\/(co\.tugarantia\.[a-z]+)(\/|$)/.exec(texto(ref));
    return m && VIA_DE_PAQUETE[m[1]] ? m[1] : '';
  }
  /** Se llama al abrir la página. Si vino de nuestra app, lo deja anotado en
   *  este teléfono; nunca lanza. Devuelve el paquete, o ''. */
  function recordarApp(doc, almacen) {
    try {
      var pkg = appDeReferrer(doc && doc.referrer);
      if (pkg && almacen && almacen.setItem) almacen.setItem(LLAVE_APP, JSON.stringify({ paquete: pkg, t: Date.now() }));
      return pkg;
    } catch (e) { return ''; }
  }
  function appGuardada(almacen) {
    try {
      var j = JSON.parse((almacen && almacen.getItem && almacen.getItem(LLAVE_APP)) || 'null');
      return j && VIA_DE_PAQUETE[j.paquete] ? j.paquete : '';
    } catch (e) { return ''; }
  }
  function enPantallaCompleta(e) {
    try {
      if (e.navegador && e.navegador.standalone === true) return true;   // iPhone, desde la pantalla de inicio
      var mm = e.matchMedia;
      return !!(mm && (mm('(display-mode: standalone)').matches || mm('(display-mode: fullscreen)').matches));
    } catch (x) { return false; }
  }
  /** Por dónde abrió la página: nuestra app, la página instalada, o el
   *  navegador. Dentro de Facebook y compañía lo dice el user-agent, abajo. */
  function viaDe(entorno) {
    var e = entorno || {};
    var pkg = recordarApp(e.documento, e.almacen);
    if (pkg) return VIA_DE_PAQUETE[pkg];
    var completa = enPantallaCompleta(e);
    var guardado = appGuardada(e.almacen);
    if (guardado && completa) return VIA_DE_PAQUETE[guardado];
    if (completa) return 'pagina_instalada';
    return 'navegador';
  }

  /* ==========================================================================
   * LO QUE SE MANDA
   * ======================================================================== */

  /** Lo que se puede sacar del user-agent, con la forma de lo que se manda.
   *  `extra.via` (por dónde abrió) y `extra.toques` (navigator.maxTouchPoints:
   *  un «Mac» con pantalla táctil es un iPad pidiendo la página de escritorio). */
  function delUserAgent(ua, extra) {
    var U = cuenta();
    var x = extra || {};
    var u = texto(ua);
    var L = U && U.leerUserAgent ? U.leerUserAgent(u) : { plataforma: '' };
    var d = {};
    /* Sin cadena no se sabe nada del aparato: ni siquiera que le falte el
       modelo. Solo por dónde abrió, si se sabe. */
    if (!u) {
      if (texto(x.via)) d.via = texto(x.via);
      return d;
    }
    var plat = L.plataforma || '';
    if (plat === 'mac' && Number(x.toques) > 1) {
      plat = 'ipados';
      var v = /Version\/(\d+)(?:\.(\d+))?/.exec(u);
      if (v) d.sistema_version = v[1] + (v[2] && v[2] !== '0' ? '.' + v[2] : '');
    }
    if (plat) d.plataforma = plat;
    if (L.sistema_version) d.sistema_version = L.sistema_version;
    if (L.sistema_o_mas) d.sistema_o_mas = true;
    if (L.navegador) {
      d.navegador = L.navegador;
      if (L.navegador_version) d.navegador_version = L.navegador_version;
    }
    if (L.modelo) {
      d.modelo = L.modelo;
      d.fuente_modelo = 'user_agent';
    } else {
      d.modelo = null;
      d.sin_modelo = (plat === 'ios' || plat === 'ipados') ? 'apple_no_lo_entrega' : 'el_navegador_no_lo_dice';
    }
    var via = L.dentro_de ? 'dentro_de_' + L.dentro_de : texto(x.via);
    if (via) d.via = via;
    return d;
  }

  var NAVEGADOR_DE_MARCA = {
    'Google Chrome': 'Chrome', 'Microsoft Edge': 'Edge', 'Samsung Internet': 'Samsung Internet',
    'Opera': 'Opera', 'Opera GX': 'Opera', 'Brave': 'Brave', 'Huawei Browser': 'Navegador Huawei'
  };
  var PLATAFORMA_DE_CH = { 'Android': 'android', 'Windows': 'windows', 'macOS': 'mac', 'Linux': 'linux',
                           'Chrome OS': 'chromeos', 'ChromeOS': 'chromeos', 'Chromium OS': 'chromeos' };
  /** Lo que contestó getHighEntropyValues, con la forma de lo que se manda. */
  function deClientHints(alto) {
    var a = esObjeto(alto) ? alto : {};
    var r = {};
    var plat = PLATAFORMA_DE_CH[texto(a.platform)];
    if (plat) r.plataforma = plat;
    var modelo = texto(a.model);
    if (modelo && MODELO_VALIDO.test(modelo)) { r.modelo = modelo; r.fuente_modelo = 'client_hints'; }
    var pv = /^(\d+)(?:\.(\d+))?/.exec(texto(a.platformVersion));
    if (pv) {
      /* En Windows, 13 o más es Windows 11 y de 1 a 10 es Windows 10. */
      if (plat === 'windows') r.sistema_version = Number(pv[1]) >= 13 ? '11' : Number(pv[1]) >= 1 ? '10' : '';
      else if (plat === 'android' || plat === 'mac' || plat === 'chromeos') r.sistema_version = pv[1];
      if (!r.sistema_version) delete r.sistema_version;
    }
    if (typeof a.mobile === 'boolean') r.movil = a.mobile;
    var lista = Array.isArray(a.fullVersionList) && a.fullVersionList.length ? a.fullVersionList
              : (Array.isArray(a.brands) ? a.brands : []);
    for (var i = 0; i < lista.length; i++) {
      var b = lista[i] || {};
      if (texto(b.brand) === 'Android WebView') r.webview = true;
      var nav = NAVEGADOR_DE_MARCA[texto(b.brand)];
      if (nav && !r.navegador) {
        r.navegador = nav;
        var mv = /^(\d+)/.exec(texto(b.version));
        if (mv) r.navegador_version = mv[1];
      }
    }
    return r;
  }

  /* Lo que dijo el navegador pisa lo que se dedujo de la cadena, campo por
     campo, y solo si trae algo: un modelo vacío no borra nada. */
  function mezclar(base, ch) {
    var r = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) r[k] = base[k];
    ['plataforma', 'sistema_version', 'navegador', 'navegador_version', 'movil'].forEach(function (c) {
      if (ch[c] !== undefined && ch[c] !== '') r[c] = ch[c];
    });
    if (ch.sistema_version) delete r.sistema_o_mas;
    if (ch.modelo) { r.modelo = ch.modelo; r.fuente_modelo = 'client_hints'; delete r.sin_modelo; }
    /* El navegador incrustado de alguna app: si la cadena no dijo cuál, se
       dice «otra app»; nunca pisa nuestra app ni a Facebook. */
    if (ch.webview && (!r.via || r.via === 'navegador' || r.via === 'pagina_instalada')) r.via = 'dentro_de_otra_app';
    return r;
  }

  /** Solo lo que la base acepta: las mismas reglas que aparato_anotar. Lo que
   *  no las cumple no viaja (la base lo tiraría igual, sin decir nada). */
  function limpiar(d) {
    var x = esObjeto(d) ? d : {};
    var r = {};
    if (PLATAFORMAS.indexOf(x.plataforma) >= 0) r.plataforma = x.plataforma;
    if (typeof x.sistema_version === 'string' && VERSION_SISTEMA.test(x.sistema_version)) r.sistema_version = x.sistema_version;
    if (x.sistema_o_mas === true) r.sistema_o_mas = true;
    if (typeof x.modelo === 'string' && MODELO_VALIDO.test(x.modelo)) r.modelo = x.modelo;
    else if (x.modelo === null) r.modelo = null;
    if (NAVEGADORES.indexOf(x.navegador) >= 0) r.navegador = x.navegador;
    if (typeof x.navegador_version === 'string' && VERSION_NAVEGADOR.test(x.navegador_version)) r.navegador_version = x.navegador_version;
    if (VIAS.indexOf(x.via) >= 0) r.via = x.via;
    if (SIN_MODELO.indexOf(x.sin_modelo) >= 0 && !r.modelo) r.sin_modelo = x.sin_modelo;
    if (FUENTES.indexOf(x.fuente_modelo) >= 0 && r.modelo) r.fuente_modelo = x.fuente_modelo;
    if (typeof x.movil === 'boolean') r.movil = x.movil;
    return r;
  }

  /**
   * Lo que este teléfono puede decir de sí mismo. `entorno` trae lo del
   * navegador —{navegador, documento, almacen, matchMedia, reloj}— y se pasa
   * entero para poder probarlo sin navegador. Siempre se cumple, nunca se
   * rechaza, y como mucho tarda `opciones.tiempo` (800 ms).
   */
  function leerAparato(entorno, opciones) {
    var e = entorno || {};
    var o = opciones || {};
    var nav = e.navegador || {};
    var base;
    try {
      base = delUserAgent(texto(nav.userAgent), { via: viaDe(e), toques: nav.maxTouchPoints });
    } catch (x) { base = {}; }
    var uad = nav.userAgentData;
    if (!uad || typeof uad.getHighEntropyValues !== 'function') return Promise.resolve(limpiar(base));
    var tiempo = Number(o.tiempo) > 0 ? Number(o.tiempo) : TIEMPO;
    var reloj = typeof e.reloj === 'function' ? e.reloj : (typeof setTimeout === 'function' ? setTimeout : null);
    return new Promise(function (listo) {
      var hecho = false;
      function fin(d) { if (hecho) return; hecho = true; listo(limpiar(d)); }
      if (reloj) { try { reloj(function () { fin(base); }, tiempo); } catch (x) { /* sin reloj, espera a la respuesta */ } }
      var p;
      try { p = uad.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']); }
      catch (x) { fin(base); return; }
      Promise.resolve(p).then(function (alto) {
        var r;
        try { r = mezclar(base, deClientHints(alto)); } catch (x) { r = base; }
        fin(r);
      }, function () { fin(base); });
    });
  }

  /* ==========================================================================
   * LO QUE VE JOAN
   * ======================================================================== */

  /**
   * Lo que informó el teléfono, en palabras, con lo que se sabe y lo que no:
   *   {texto: 'Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía',
   *    nota: 'Lo informa el navegador del teléfono.', sabe: [...], noSabe: [...]}
   * `opciones.sinModelo`: la frase que va donde faltaría el modelo.
   */
  function enPalabras(d, opciones) {
    var x = esObjeto(d) ? d : {};
    var o = opciones || {};
    var P = palabras();
    var partes = [], sabe = [], noSabe = [];
    var modelo = typeof x.modelo === 'string' && MODELO_VALIDO.test(x.modelo) ? x.modelo : '';
    var plat = PLATAFORMAS.indexOf(x.plataforma) >= 0 ? x.plataforma : '';
    var ver = typeof x.sistema_version === 'string' && VERSION_SISTEMA.test(x.sistema_version) ? x.sistema_version : '';
    var movil = plat === 'android' || plat === 'ios' || plat === 'ipados';

    if (modelo) {
      partes.push(conMarca(modelo));
      sabe.push('modelo');
      if (marcaDeModelo(modelo)) sabe.push('marca');
    } else if (movil) {
      noSabe.push('modelo');
    }
    if (plat === 'android') {
      partes.push('Android' + (ver ? ' ' + ver : ''));
      if (!modelo && o.sinModelo) partes.push(o.sinModelo);
    } else if (plat === 'ios' || plat === 'ipados') {
      partes.push(plat === 'ipados' ? 'iPad' : 'iPhone');
      if (ver) partes.push((plat === 'ipados' ? 'iPadOS ' : 'iOS ') + ver + (x.sistema_o_mas === true ? ' o más nuevo' : ''));
    } else if (plat === 'mac') {
      /* Lo dijo el teléfono, que ya descartó el iPad por la pantalla táctil. */
      partes.push('Mac');
    } else if (P.plataforma[plat]) {
      partes.push(P.plataforma[plat]);
    }
    if (ver) sabe.push('sistema'); else if (movil) noSabe.push('sistema');

    var via = VIAS.indexOf(x.via) >= 0 ? x.via : '';
    if (via.indexOf('dentro_de_') === 0) {
      partes.push(P.dentro_de[via.slice('dentro_de_'.length)]);
      sabe.push('via');
    } else {
      if (NAVEGADORES.indexOf(x.navegador) >= 0 && x.navegador !== 'otro') {
        var nv = typeof x.navegador_version === 'string' && VERSION_NAVEGADOR.test(x.navegador_version) ? x.navegador_version : '';
        /* En Safari la versión es la del sistema: se diría dos veces. */
        partes.push(x.navegador + (nv && x.navegador !== 'Safari' ? ' ' + nv : ''));
        sabe.push('navegador');
      }
      if (PALABRAS_VIA[via]) { partes.push(PALABRAS_VIA[via]); sabe.push('via'); }
    }

    var nota;
    if (!movil && plat && plat !== 'otro') nota = NOTA.computador;
    else if (modelo) nota = NOTA.informa;
    else if (plat === 'ios' || plat === 'ipados') nota = NOTA.apple;
    else nota = 'El navegador no dijo el modelo' + (plat === 'android' && !ver ? ' ni la versión de Android' : '') + '.';
    return { texto: partes.join(' · '), nota: nota, sabe: sabe, noSabe: noSabe };
  }

  /* Solo lo que anunció la conexión (la cabecera), en palabras. */
  function deLaCabecera(ua, nota) {
    var u = texto(ua);
    if (!u) return null;
    var d = delUserAgent(u);
    var w = enPalabras(d, { sinModelo: 'el modelo no se supo' });
    if (!w.texto) w.texto = u.slice(0, 60);
    /* La nota de Apple y la del computador siguen siendo la verdad; la de
       «no se supo» solo cuando faltó un modelo que el navegador sí podía dar. */
    if (d.plataforma === 'android' && !d.modelo) w.nota = nota;
    return w;
  }

  /**
   * Para la huella de un registro (bloqueHuella y la ficha del gerente en
   * panel/crm.html). Lo que informó el teléfono si lo hay (aparato_telefono,
   * desde el 19-oct-2026); si no, lo que anunció la conexión, diciendo que el
   * modelo no se supo. Null si no hay nada.
   */
  function deLaHuella(h) {
    if (!esObjeto(h)) return null;
    var at = h.aparato_telefono;
    if (esObjeto(at) && (at.plataforma || at.modelo || at.navegador)) {
      var w = enPalabras(at);
      if (w.texto) return w;
    }
    return deLaCabecera(h.aparato, NOTA.viejo);
  }

  /**
   * Las filas de aparatos_de para el CRM, de la más nueva a la más vieja:
   * {cuando: 'Al pedir', momento, texto, nota, ip, constancia}.
   * La constancia de una aceptación (condiciones_aceptadas, solo la cabecera)
   * sobra si el teléfono informó esa misma aceptación: se quita la que dice
   * menos, no se muestra dos veces lo mismo.
   */
  function filasDeAparatos(lista) {
    var l = (Array.isArray(lista) ? lista : []).filter(esObjeto);
    var avisos = l.filter(function (f) { return f.origen !== 'constancia' && f.cuando === 'aceptacion'; })
      .map(function (f) { return Date.parse(f.momento); });
    return l.filter(function (f) {
      if (f.origen !== 'constancia') return true;
      var t = Date.parse(f.momento);
      return !avisos.some(function (a) { return isFinite(a) && isFinite(t) && Math.abs(a - t) <= 15 * 60000; });
    }).sort(function (a, b) { return String(b.momento || '').localeCompare(String(a.momento || '')); })
      .map(function (f) {
        var dec = esObjeto(f.declarado) && Object.keys(f.declarado).length ? f.declarado : null;
        var w = dec ? enPalabras(dec) : null;
        if (!w || !w.texto) w = deLaCabecera(f.ua, NOTA.cabecera);
        return {
          cuando: (CUANDO[f.cuando] || 'Otra vez') + (f.origen === 'constancia' ? ' (constancia)' : ''),
          momento: texto(f.momento),
          texto: w && w.texto ? w.texto : 'Sin datos del aparato',
          nota: w ? w.nota : '',
          ip: texto(f.ip).split(',')[0].trim(),
          constancia: f.origen === 'constancia'
        };
      });
  }

  return {
    PLATAFORMAS: PLATAFORMAS.slice(),
    NAVEGADORES: NAVEGADORES.slice(),
    VIAS: VIAS.slice(),
    SIN_MODELO: SIN_MODELO.slice(),
    FUENTES: FUENTES.slice(),
    TIEMPO: TIEMPO,
    LLAVE_APP: LLAVE_APP,
    NOTA: NOTA,
    marcaDeModelo: marcaDeModelo,
    appDeReferrer: appDeReferrer,
    recordarApp: recordarApp,
    viaDe: viaDe,
    delUserAgent: delUserAgent,
    deClientHints: deClientHints,
    limpiar: limpiar,
    leerAparato: leerAparato,
    enPalabras: enPalabras,
    deLaHuella: deLaHuella,
    filasDeAparatos: filasDeAparatos
  };
});
