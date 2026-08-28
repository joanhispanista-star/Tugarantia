/* ============================================================================
 * Pruebas del paquete de cumplimiento — app/cumplimiento.js y la ficha de Play
 *
 *   cd pruebas && node --test cumplimiento.test.js
 *
 * Lo que cuidan: que la declaración que se le da a Google NO pueda desviarse de
 * lo que la app hace. Una Data Safety que no coincide con el comportamiento real
 * es motivo de suspensión, y es de las pocas cosas que Google verifica de oficio.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../app/cumplimiento.js');
const U = require('../app/cuenta.js');
const C = require('../app/creditos.js');
const { generar, CORTA } = require('../herramientas/ficha-play.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const FECHA = '2026-08-15';

/* ==========================================================================
 * SEGURIDAD DE LOS DATOS
 * ======================================================================== */

describe('la declaración de datos se deriva, no se escribe', () => {

  test('TODO campo del formulario tiene su categoría', () => {
    /* El centinela central de la etapa. Si alguien agrega un campo a CAMPOS y no
       le pone categoría, la declaración de Play deja de cubrirlo y la app pasa a
       recoger un dato que no declaró. Eso es suspensión, no una advertencia. */
    const sin = K.datosSinCategoria();
    assert.deepEqual(sin.map(d => d.id), [],
      'campos sin categoría de Data Safety: ' + sin.map(d => d.id).join(', ') +
      '. Asígnalas en CATEGORIA, en app/cumplimiento.js.');
  });

  test('la lista NO repite los campos: los lee de cuenta.js', () => {
    /* Si estuvieran copiados, se separarían el primer día. */
    const ids = K.datosQueRecoge().map(d => d.id);
    U.CAMPOS.forEach(c => assert.ok(ids.includes(c.id), 'falta ' + c.id + ' en la declaración'));
    const fuente = leer('app/cumplimiento.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(fuente, /U\.CAMPOS\.map/, 'la declaración tiene que leer CAMPOS, no copiarlo');
  });

  test('el propósito y el "obligatorio" salen del campo, no de una copia', () => {
    const decl = K.datosQueRecoge();
    U.CAMPOS.forEach(c => {
      const d = decl.find(x => x.id === c.id);
      assert.equal(d.proposito, c.porque, c.id + ': el propósito se separó del porqué');
      assert.equal(d.obligatorio, c.obligatorio, c.id + ': lo obligatorio se separó');
    });
  });

  test('declara también lo que NO viene del formulario', () => {
    /* Contraseña, fotos e historial no están en CAMPOS y son justo lo que se
       olvida declarar, porque no hay de dónde derivarlo. */
    const ids = K.datosQueRecoge().map(d => d.id);
    ['contrasena', 'foto_cedula', 'foto_rostro', 'historial_credito']
      .forEach(x => assert.ok(ids.includes(x), 'falta declarar ' + x));
  });

  test('la foto del rostro se declara como FOTO, no como biometría', () => {
    /* La diferencia no es de redacción. Un dato biométrico es dato sensible bajo
       la Ley 1581 y dispara obligaciones aparte. Acá se guarda la imagen y nada
       más: la detección en pantalla es un asistente de encuadre. Si algún día se
       guarda un vector facial, esta prueba tiene que caerse. */
    const d = K.datosQueRecoge().find(x => x.id === 'foto_rostro');
    assert.match(d.categoria, /Fotos/);
    assert.match(d.nota, /plantilla biométrica/);
    assert.ok(!/biometr/i.test(d.categoria), 'no se declara como biometría');
    const app = leer('play/index.html') + leer('app/cuenta.js');
    ['faceapi', 'FaceMesh', 'descriptor', 'embedding', 'faceDescriptor']
      .forEach(p => assert.ok(app.indexOf(p) === -1,
        'apareció «' + p + '»: eso ya sería tratar biometría y cambia la declaración'));
  });

  test('NADA se comparte con terceros, y la app no trae con qué', () => {
    K.datosQueRecoge().forEach(d =>
      assert.equal(d.compartido, false, d.id + ' figura como compartido'));
    /* Contestar "no comparto" y meter un SDK de medición es la incoherencia que
       suspende. Se comprueba que no haya ninguno. */
    const app = leer('play/index.html');
    ['googletagmanager', 'google-analytics', 'gtag(', 'facebook.net', 'fbq(',
     'hotjar', 'mixpanel', 'sentry', 'appsflyer', 'onesignal']
      .forEach(p => assert.ok(app.toLowerCase().indexOf(p.toLowerCase()) === -1,
        'la app carga «' + p + '», así que sí comparte datos con un tercero'));
  });

  test('la app no llama a ningún servidor que no sea el suyo', () => {
    const app = leer('play/index.html').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const urls = [...app.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase());
    /* wa.me es el WhatsApp de Joan. El de Supabase entró el 24-ago-2026, cuando
       la conexión pasó a venir horneada (registro abierto): es el servidor
       PROPIO de la app — ahí viven los datos que la ficha declara recoger —,
       no un tercero que mida ni comparta. Un dominio NUEVO en esta lista sí
       tiene que hacer sonar la alarma: agregarlo exige poder decir de quién es
       y qué dato se le manda. */
    const permitidos = ['wa.me', 'wnsioekvjspwtghbodbg.supabase.co'];
    [...new Set(urls)].forEach(h => assert.ok(permitidos.includes(h),
      'la app llama a ' + h + ', que no está declarado en Data Safety'));
  });
});

/* ==========================================================================
 * LA DIVULGACIÓN
 * ======================================================================== */

describe('la divulgación del crédito dice la verdad', () => {

  test('trae lo que Google exige, sin faltar nada', () => {
    const d = K.divulgacion(FECHA);
    assert.equal(d.puede, true);
    ['plazo_minimo_meses', 'plazo_maximo_meses', 'tae_maxima', 'ejemplo', 'texto']
      .forEach(k => assert.ok(d[k] !== undefined, 'falta ' + k));
    ['capital', 'meses', 'cuota', 'costo_total', 'total_a_pagar']
      .forEach(k => assert.ok(d.ejemplo[k] > 0, 'el ejemplo no trae ' + k));
  });

  test('el ejemplo CUADRA: capital + costo = total', () => {
    const e = K.divulgacion(FECHA).ejemplo;
    assert.equal(e.capital + e.costo_total, e.total_a_pagar);
    assert.equal(e.cuota * e.meses <= e.total_a_pagar + e.meses, true,
      'las cuotas no pueden sumar más que el total');
  });

  test('la TAE que se publica es la que se COBRA, no el techo', () => {
    /* Publicar el techo sería anunciar una tasa que no cobramos. Y publicar algo
       por debajo de lo que se cobra es peor: es publicidad engañosa. */
    const d = K.divulgacion(FECHA);
    const s = C.simular({ perfil: 'preferente', capital: K.CAPITAL_EJEMPLO, fecha_desembolso: FECHA });
    assert.equal(d.tae_maxima, s.efectivo_anual, 'la TAE publicada no es la del producto');
    assert.ok(d.tae_maxima < d.techo_del_mes, 'la TAE no puede llegar al techo');
  });

  test('el plazo publicado nunca puede ser menor a 61 días', () => {
    const d = K.divulgacion(FECHA);
    assert.ok(d.plazo_minimo_meses * 30 > 60,
      'se estaría publicando un plazo que la política de Play prohíbe');
  });

  test('el texto NO promete nada que el producto no haga', () => {
    const t = K.divulgacion(FECHA).texto;
    assert.match(t, /Sin cuotas de manejo, sin seguros y sin cargos adicionales/);
    assert.match(t, /Tasa efectiva anual máxima/);
    assert.match(t, /Plazo mínimo y máximo/);
    ['desde', 'hasta el', 'aprobación inmediata', 'sin requisitos', 'garantizado']
      .forEach(p => assert.ok(t.toLowerCase().indexOf(p) === -1,
        'el texto dice «' + p + '», que promete algo que no se puede garantizar'));
  });

  test('sin techo certificado SÍ se divulga: la tasa fija no depende de él', () => {
    /* 27-ago-2026, invertida a sabiendas junto con la de creditos.test.js. La
       divulgación que exige Google es plazo, TAE y ejemplo del costo — y las
       tres salen ahora de la tasa fija, no del techo del mes. Publicarlas sin
       la certificación no es inventar nada: es decir lo que se cobra.

       Lo que NO se puede inventar es el techo mismo, y por eso viaja null. */
    const d = K.divulgacion('2027-09-15');
    assert.equal(d.puede, true, 'la divulgación volvió a depender del techo del mes');
    assert.ok(d.texto && d.texto.length > 40, 'no hay texto de divulgación');
    assert.ok(d.tae_maxima > 0 && d.ejemplo.cuota > 0, 'la divulgación salió sin cifras');
  });

  test('el MISMO texto está en la app, no una copia parecida', () => {
    /* Google compara la ficha con lo que dice la app. Si fueran dos textos, se
       separarían y esa diferencia es exactamente lo que se revisa. */
    const app = leer('play/index.html').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(app, /divulgacionHoy\(\)/, 'la app no muestra la divulgación');
    assert.match(app, /K\.divulgacion\(|Cumplimiento/, 'la app tiene que pedirla, no escribirla');
    assert.ok(app.indexOf('Tasa efectiva anual máxima:') === -1,
      'el texto de la divulgación está escrito a mano en la app');
  });
});

/* ==========================================================================
 * EL BORRADO DE LA CUENTA
 * ======================================================================== */

describe('borrar la cuenta, como exige Play', () => {

  test('existe la página pública, y sin necesidad de entrar', () => {
    const p = leer('play/borrar-cuenta.html');
    assert.match(p, /Borrar mi cuenta/);
    assert.ok(p.indexOf('contrasena') === -1 && p.indexOf('password') === -1,
      'la página pública no puede pedir contraseña: Play la exige SIN tener que entrar');
    assert.match(K.BORRADO.url_publica, /borrar-cuenta\.html$/);
  });

  test('dice qué se borra Y qué no, con el motivo', () => {
    assert.ok(K.BORRADO.se_borra.length >= 4);
    assert.ok(K.BORRADO.se_conserva.length >= 1,
      'si no se conserva nada, sobra la sección; si se conserva algo, hay que decirlo');
    K.BORRADO.se_conserva.forEach(x => {
      assert.ok(x.que && x.cuanto && x.porque, 'una conservación sin motivo escrito');
      assert.ok(x.porque.length > 40, 'el motivo de «' + x.que + '» es demasiado corto');
    });
  });

  test('la página y la app prometen lo MISMO', () => {
    /* Las dos leen de BORRADO. Si una escribiera su lista, prometerían distinto
       y la de la app sería la que nadie revisa. */
    const pagina = leer('play/borrar-cuenta.html');
    const app = leer('play/index.html');
    assert.match(pagina, /B\.se_borra/);
    assert.match(app, /B\.se_borra/);
    assert.ok(pagina.indexOf('Tu celular, tu correo y tu dirección.') === -1,
      'la página tiene la lista escrita a mano en vez de leerla');
  });

  test('se puede llegar desde la app', () => {
    assert.match(leer('play/index.html'), /borrar-cuenta\.html/);
  });
});

/* ==========================================================================
 * LA FICHA
 * ======================================================================== */

describe('la ficha de Play se genera y cuadra', () => {

  test('la descripción corta cabe en 80 caracteres', () => {
    assert.ok(CORTA.length <= 80, CORTA.length + ' caracteres');
    assert.ok(CORTA.length > 30, 'demasiado corta para decir algo');
  });

  test('el generador es determinista: dos corridas dan lo mismo', () => {
    /* Si metiera la fecha de hoy por dentro, el archivo cambiaría solo y nadie
       sabría si cambió porque cambió algo o porque pasó un día. */
    assert.equal(generar(FECHA), generar(FECHA));
  });

  test('la ficha se genera aunque falte la certificación del mes', () => {
    /* Antes se negaba, y era coherente con el precio pegado al techo. Con tasa
       fija, negarse dejaría a Joan sin poder regenerar su ficha de Play el
       primer día de cualquier mes — por un dato que ya no manda en el precio. */
    const f = generar('2027-09-15');
    assert.ok(f.length > 500, 'la ficha salió vacía sin certificación del mes');
  });

  test('el archivo en el repositorio está al día', () => {
    /* Esta es la que se cae cuando alguien agrega un campo y no regenera. El
       mensaje dice qué hacer, porque si no la reacción es borrar la prueba. */
    const enDisco = leer('PLAY-FICHA.md');
    assert.equal(enDisco, generar(FECHA),
      'PLAY-FICHA.md quedó desactualizado. Regenéralo:\n' +
      '    node herramientas/ficha-play.js ' + FECHA);
  });

  test('la ficha trae las respuestas completas de Data Safety', () => {
    const f = generar(FECHA);
    K.datosQueRecoge().forEach(d =>
      assert.ok(f.indexOf(d.etiqueta) >= 0, 'la ficha no menciona «' + d.etiqueta + '»'));
    K.NO_RECOGE.forEach(x =>
      assert.ok(f.indexOf(x) >= 0, 'la ficha no declara que NO recoge «' + x + '»'));
    assert.match(f, /Ningún dato se comparte con terceros/);
    assert.match(f, /borrar-cuenta\.html/);
  });

  test('y dice lo que le falta, en vez de aparentar que está completa', () => {
    const f = generar(FECHA);
    assert.match(f, /Capturas de pantalla/);
    assert.match(f, /12 testers/);
    assert.match(f, /\[NOMBRE\]/, 'tiene que recordar los huecos de legal/');
  });
});
