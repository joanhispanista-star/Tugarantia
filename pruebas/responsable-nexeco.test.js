/* ============================================================================
 * QUIÉN RESPONDE, Y LO QUE DICEN LOS TEXTOS LEGALES — 8 de octubre de 2026
 *
 *   node --test pruebas/responsable-nexeco.test.js
 *
 * Joan, el 8-oct, leyendo los textos legales mientras se registraba:
 *   · «el punto 1 quién responde por tus datos veo que está mi información
 *     personal, quiero que quites mi información de ahí y mi dirección»;
 *   · «en términos y condiciones también tenemos mi nombre y mis datos
 *     personales, quítalos»;
 *   · «el punto 2 dice que hay que tener un código de invitación, pero eso no
 *     es cierto»;
 *   · «el punto 3 hay que modificarlo: no quiero que se indique cuánto se paga
 *     ni que existe la modalidad quincenal; eso lo defino yo desde el CRM»;
 *   · «el punto 4, lo mismo, quítalo»;
 *   · «el punto 7 da un ejemplo en centavos, mejor uno con 100.000 pesos, y que
 *     expliques que el costo moratorio incluso lo puedes negociar».
 * Y decidió que la responsable sea NEXECO S.A.S. El NIT, la dirección y el
 * correo de la sociedad todavía no se conocen.
 *
 * Lo que cuidan estas pruebas, en orden de lo que más cuesta si se rompe:
 *   1. NINGÚN DATO PERSONAL DE JOAN en lo que lee el cliente.
 *   2. UN SOLO BLOQUE por documento con los datos de NEXECO, y lo que falta se
 *      ve como pendiente —nunca un NIT inventado—. Mientras falte, la prueba
 *      sale como TODO (no rompe la batería, pero se ve en cada corrida); cuando
 *      llegue, exige un NIT con su dígito de verificación bueno y los mismos
 *      valores en los dos documentos.
 *   3. LOS TÉRMINOS NO PUBLICAN PRECIO NI MODALIDAD, y cada cifra que queda sale
 *      del motor.
 *   4. LA POLÍTICA DICE LO NUEVO Y ES VERDAD: correo obligatorio y dirección
 *      opcional (contra CAMPOS), el servicio de ubicación por IP es el que el
 *      código llama de verdad, y la fecha de la política es la versión de la
 *      autorización que se guarda.
 *   5. EL AVISO A LOS SOCIOS: la app lo muestra una vez y se cierra, y el CRM
 *      tiene la plantilla de WhatsApp.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../app/motor.js');
const U = require('../app/cuenta.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const blanco = s => s.replace(/[^\n]/g, ' ');
/* Fuera los comentarios de HTML, de bloque y de línea. El de línea respeta el
   «//» de una dirección («https://…»): solo cuenta si no viene después de «:». */
const sinComentarios = t => String(t)
  .replace(/<!--[\s\S]*?-->/g, blanco)
  .replace(/\/\*[\s\S]*?\*\//g, blanco)
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + blanco(m.slice(a.length)));
/* Lo que el navegador pinta de un HTML estático: sin estilos, sin guiones, sin
   comentarios y sin etiquetas. */
const visible = html => sinComentarios(html)
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const pesos = n => '$' + Math.round(n).toLocaleString('es-CO');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const enPalabras = iso => { const [a, m, d] = iso.split('-').map(Number); return d + ' de ' + MESES[m - 1] + ' de ' + a; };

const PRIV = leer('legal/privacidad.html');
const TERM = leer('legal/terminos.html');
const DOCS = { 'legal/privacidad.html': PRIV, 'legal/terminos.html': TERM };

/* Lo que identifica a Joan como persona natural.
   8-oct-2026 (segunda vuelta) — SU APELLIDO, SU CÉDULA Y SU DIRECCIÓN YA NO
   ESTÁN ESCRITOS AQUÍ. Esta prueba los tenía en claro para buscarlos, y el
   repositorio es público y se sirve en tugarantia.net: la prueba que los
   protegía los publicaba. Viven en pruebas/privado/datos-de-joan.json, que no
   se sube (ver pruebas/datos-privados.js). Sin ese archivo se vigila lo que no
   es secreto —su nombre y su usuario público— y la prueba lo dice como TODO. */
const LOCALES = require('./datos-privados.js').patronesLocales();
const DATOS_DE_JOAN = [/Joan/i, /hispanista/i].concat(LOCALES || []);
const SIN_LISTA = LOCALES ? {} : { todo: 'falta pruebas/privado/datos-de-joan.json (la lista local de los datos de Joan): ' +
  'solo se vigilan su nombre y su usuario. Ver pruebas/datos-privados.js.' };

/* ======================================================================== */
describe('1. ningún dato personal de Joan en lo que lee el cliente', () => {

  test('la prueba no publica lo que protege: sus datos no están escritos aquí', SIN_LISTA, () => {
    const yo = fs.readFileSync(__filename, 'utf8');
    (LOCALES || []).forEach(re => assert.ok(!re.test(yo), 'esta prueba volvió a escribir un dato de Joan (' + re + ')'));
    assert.ok(!/\d\.\d{3}\.\d{3}\.\d{3}/.test(yo), 'volvió a haber una cédula escrita con puntos en esta prueba');
  });

  test('los dos documentos legales, ENTEROS (también sus comentarios: se ven con «ver código»)', SIN_LISTA, () => {
    Object.keys(DOCS).forEach(f => DATOS_DE_JOAN.forEach(re =>
      assert.ok(!re.test(DOCS[f]), f + ' volvió a tener ' + re + ': Joan pidió quitar sus datos de aquí')));
  });

  /* Las páginas del cliente y los guiones que cargan (sacados de sus propios
     <script src>, así un guion nuevo entra solo). Aquí se mira el CÓDIGO sin
     comentarios: los comentarios de estos archivos cuentan la historia del
     negocio con nombre propio y eso no se pinta. Lo que se pinta sale de las
     cadenas y del marcado, y ahí «Joan» con mayúscula no puede estar. Los
     nombres internos en minúscula ('joan_socios_v1', cp.por === 'joan') no se
     ven y no cuentan. */
  const PAGINAS = ['index.html', 'play/index.html', 'play/borrar-cuenta.html', 'platachat/index.html',
    'platachat/borrar-cuenta.html', 'app/socio.html', 'descargas/index.html', 'descargas/platachat.html',
    'entrar/index.html'];
  const archivosDelCliente = () => {
    const todos = new Set(PAGINAS);
    PAGINAS.forEach(p => {
      for (const m of leer(p).matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
        if (/^https?:/.test(m[1])) continue;
        const rel = path.posix.normalize(path.posix.join(path.posix.dirname(p), m[1].split(/[?#]/)[0]));
        if (rel.startsWith('app/lib/')) continue;          // librerías de terceros, minificadas
        if (fs.existsSync(path.join(RAIZ, rel))) todos.add(rel);
      }
    });
    return [...todos];
  };

  test('las páginas del cliente y sus guiones no pintan su nombre, su cédula ni su dirección', SIN_LISTA, () => {
    const lista = archivosDelCliente();
    assert.ok(lista.length > PAGINAS.length, 'no encontré los guiones de las páginas: cambió el marcado');
    const PINTABLE = [/\bJoan\b/, /joan\.hispanista/i].concat(LOCALES || []);
    lista.forEach(f => {
      const c = sinComentarios(leer(f));
      PINTABLE.forEach(re => {
        const m = c.match(re);
        if (!m) return;
        const linea = c.slice(0, m.index).split('\n').length;
        assert.fail(f + ':' + linea + ' le muestra al cliente ' + re + ' — «' +
          c.split('\n')[linea - 1].trim().slice(0, 110) + '»');
      });
    });
  });

  /* 8-oct-2026 (segunda vuelta) — Y TAMPOCO EN SUS COMENTARIOS, en todo lo que
     sirve el sitio. La revisión de seguridad encontró su cédula en un
     comentario de app/revision-registro.js, que no carga ninguna página del
     cliente pero GitHub Pages sirve igual (tugarantia.net/app/…). Aquí se mira
     el archivo entero —comentarios incluidos— de cada carpeta que se publica.
     base/ queda afuera A PROPÓSITO y se dice: 20260922c_verificacion_cedula.sql
     ya está aplicada y no se edita (las migraciones aplicadas no se tocan); su
     prueba con datos reales es un riesgo abierto anotado para Joan. */
  test('nada de lo que se publica (app, panel, play, platachat, legal…) trae su apellido, su cédula o su dirección', SIN_LISTA, () => {
    if (!LOCALES) return;
    const CARPETAS = ['app', 'panel', 'play', 'platachat', 'legal', 'descargas', 'entrar'];
    const archivos = ['index.html'];
    const recorrer = d => fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true }).forEach(e => {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) { if (rel !== 'app/lib') recorrer(rel); return; }
      if (/\.(html|js|json|css|md|txt|webmanifest)$/.test(e.name)) archivos.push(rel);
    });
    CARPETAS.forEach(d => { if (fs.existsSync(path.join(RAIZ, d))) recorrer(d); });
    assert.ok(archivos.length > 20, 'no encontré los archivos publicados');
    archivos.forEach(f => {
      const c = leer(f);
      LOCALES.forEach(re => {
        const m = c.match(re);
        if (!m) return;
        const linea = c.slice(0, m.index).split('\n').length;
        assert.fail(f + ':' + linea + ' publica un dato de Joan (' + re + ')');
      });
    });
  });
});

/* ======================================================================== */
describe('2. quién responde: NEXECO S.A.S., en un solo bloque por documento', () => {

  function ficha(html, f) {
    const veces = (html.match(/id="responsable"/g) || []).length;
    assert.equal(veces, 1, f + ' tiene ' + veces + ' bloques id="responsable": tiene que haber UNO');
    const m = html.match(/<section class="ficha" id="responsable"[\s\S]*?<\/section>/);
    assert.ok(m, f + ' perdió el bloque «Quién responde»');
    const datos = {};
    for (const d of m[0].matchAll(/<dd([^>]*)>([\s\S]*?)<\/dd>/g)) {
      const k = (d[1].match(/data-dato="([^"]+)"/) || [])[1];
      if (!k) continue;
      datos[k] = { valor: d[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
                   pendiente: /data-pendiente/.test(d[1]), clase: /class="pendiente"/.test(d[1]) };
    }
    return datos;
  }
  const FICHAS = { 'legal/privacidad.html': ficha(PRIV, 'legal/privacidad.html'),
                   'legal/terminos.html': ficha(TERM, 'legal/terminos.html') };
  /* 8-oct-2026 (segunda vuelta) — y el teléfono: el Decreto 1377 de 2013, art. 13,
     pide dirección, correo Y teléfono del responsable. */
  const PENDIBLES = ['nit', 'direccion', 'correo', 'telefono'];

  test('los dos documentos nombran a NEXECO S.A.S., sociedad por acciones simplificada de Bogotá', () => {
    Object.keys(FICHAS).forEach(f => {
      const x = FICHAS[f];
      assert.equal(x.razon_social && x.razon_social.valor, 'NEXECO S.A.S.', f);
      assert.match(x.domicilio && x.domicilio.valor || '', /Bogotá D\.C\./, f);
      assert.match(DOCS[f], /sociedad por acciones simplificada/i, f);
      PENDIBLES.forEach(k => assert.ok(x[k], f + ' perdió la fila de ' + k + ' del bloque'));
    });
  });

  test('lo que falta se ve como pendiente: ni un número inventado, ni un marcador entre corchetes', () => {
    Object.keys(FICHAS).forEach(f => PENDIBLES.forEach(k => {
      const x = FICHAS[f][k];
      if (!x.pendiente) return;
      assert.ok(x.clase, f + ': ' + k + ' está pendiente y no se ve como pendiente (clase "pendiente")');
      assert.match(x.valor, /publicamos aquí en cuanto/i, f + ': ' + k + ' pendiente sin decir que está pendiente');
      assert.ok(!/\d/.test(x.valor), f + ': ' + k + ' pendiente con un número adentro: «' + x.valor + '»');
    }));
    Object.keys(DOCS).forEach(f => ['[NIT', '[DIRECCI', '[CORREO', 'HAY QUE COMPLETARLO'].forEach(m =>
      assert.ok(DOCS[f].indexOf(m) < 0, f + ' tiene el marcador «' + m + '» a la vista')));
  });

  /* El dígito de verificación de la DIAN: pesos primos de derecha a izquierda,
     residuo módulo 11. Un NIT con el dígito malo es un NIT mal copiado. */
  function nitValido(nit) {
    const m = String(nit).match(/^(\d{3})\.(\d{3})\.(\d{3})-(\d)$/);
    if (!m) return false;
    const cuerpo = m[1] + m[2] + m[3];
    const P = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let s = 0;
    for (let i = 0; i < cuerpo.length; i++) s += Number(cuerpo[cuerpo.length - 1 - i]) * P[i];
    const r = s % 11;
    return Number(m[4]) === (r > 1 ? 11 - r : r);
  }

  test('el dígito de verificación del NIT se calcula bien (la red de la prueba de abajo)', () => {
    assert.equal(nitValido('800.197.268-4'), true, 'NIT de la DIAN');
    assert.equal(nitValido('800.197.268-5'), false);
    assert.equal(nitValido('800197268-4'), false, 'sin puntos no se acepta: los dos documentos lo escriben igual');
  });

  const faltan = [];
  Object.keys(FICHAS).forEach(f => PENDIBLES.forEach(k => {
    if (FICHAS[f][k] && FICHAS[f][k].pendiente) faltan.push(k + ' (' + f.replace('legal/', '') + ')');
  }));
  const opciones = faltan.length
    ? { todo: 'FALTAN DATOS DE NEXECO S.A.S.: ' + faltan.join(', ') + '. Cuando Joan los dé, se escriben en el ' +
              'bloque id="responsable" de los dos documentos y se quitan data-pendiente y la clase "pendiente".' }
    : {};

  /* 8-oct-2026 (segunda vuelta) — MIENTRAS EL CORREO NO EXISTA, NADIE LO MANDA A
     ESCRIBIRLE. La política decía «o al correo del recuadro de arriba. Los dos
     canales valen igual», con el correo pendiente: un canal que no existe no es
     un canal. Y para quien no tiene cuenta (una referencia, alguien que dejó el
     registro a medias) se nombra el que sí existe: el recado de «Olvidé mi
     contraseña». */
  test('ningún texto manda a escribir a un correo que todavía no existe, y quien no tiene cuenta tiene por dónde', () => {
    const correoPendiente = FICHAS['legal/privacidad.html'].correo.pendiente;
    Object.keys(DOCS).forEach(f => {
      const v = visible(DOCS[f]);
      if (correoPendiente) {
        assert.ok(!/al correo del recuadro|escribes al correo|los dos canales valen igual/i.test(v),
          f + ' manda a escribir a un correo que todavía no existe');
      }
      assert.match(v, /Olvidé mi contraseña/, f + ' no le dice a quien no tiene cuenta por dónde escribir');
    });
  });

  test('NIT, dirección, correo y teléfono de NEXECO: completos, con forma buena e iguales en los dos documentos', opciones, () => {
    assert.deepEqual(faltan, [], 'siguen pendientes: ' + faltan.join(', '));
    const P = FICHAS['legal/privacidad.html'], T = FICHAS['legal/terminos.html'];
    PENDIBLES.concat(['razon_social', 'domicilio']).forEach(k =>
      assert.equal(P[k].valor, T[k].valor, 'la política y los términos dicen distinto en ' + k));
    assert.ok(nitValido(P.nit.valor), 'el NIT no tiene la forma 900.123.456-7 o su dígito de verificación no cuadra: ' + P.nit.valor);
    assert.match(P.correo.valor, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'el correo no tiene forma de correo');
    assert.ok(P.direccion.valor.length >= 8, 'la dirección es demasiado corta para ser una dirección');
    assert.match(P.telefono.valor.replace(/\D/g, ''), /^\d{7,12}$/, 'el teléfono no tiene forma de teléfono');
    [P.nit.valor, P.direccion.valor, P.correo.valor, P.telefono.valor].forEach(v => DATOS_DE_JOAN.forEach(re =>
      assert.ok(!re.test(v), 'un dato de Joan se coló como dato de la empresa: ' + v)));
    Object.keys(FICHAS).forEach(f => PENDIBLES.forEach(k =>
      assert.ok(!FICHAS[f][k].clase, f + ': ' + k + ' ya tiene valor y sigue pintado como pendiente')));
  });
});

/* ======================================================================== */
describe('3. los términos: sin precio, sin modalidad, y con lo que pidió Joan', () => {
  const T = visible(TERM);
  const seccion = id => {
    const m = TERM.match(new RegExp('<section id="' + id + '">([\\s\\S]*?)</section>'));
    assert.ok(m, 'terminos.html perdió la sección #' + id);
    return visible(m[1]);
  };

  test('punto 2: el registro es abierto y se entra con celular y contraseña; nada de códigos', () => {
    const s = seccion('quien');
    assert.ok(!/c[oó]digo de invitaci[oó]n|no hay registro abierto|[uú]ltimos cuatro d[ií]gitos/i.test(T),
      'los términos volvieron a pedir un código o a hablar de la entrada vieja');
    assert.match(s, /registro es abierto/i);
    assert.match(s, /tu celular y tu contraseña/);
    assert.match(s, /correo electr[oó]nico/, 'el correo es obligatorio desde el 8-oct y el punto 2 no lo dice');
  });

  test('los viejos puntos 3 y 4 se fueron: ni tabla de productos, ni cortes fijos, ni la palabra quincena', () => {
    assert.ok(!/id="costo"|id="cuando"/.test(TERM), 'volvieron las secciones de precio o de fechas fijas');
    assert.ok(!/quincen/i.test(T), 'los términos le muestran al cliente la modalidad quincenal');
    assert.ok(!/Cu[aá]nto cuesta cada cr[eé]dito|Cu[aá]ndo se paga|fecha de corte|d[ií]a 15 y el [uú]ltimo/i.test(T),
      'volvió el precio de lista o el calendario fijo');
    assert.ok(!/\d\s?%/.test(T), 'un porcentaje en los términos');
    assert.ok(!/centavos/i.test(T), 'volvió el ejemplo en centavos');
  });

  test('punto 3: cada crédito trae sus condiciones y se aceptan antes de recibir la plata', () => {
    const s = seccion('condiciones');
    assert.match(s, /«Las condiciones de este crédito»/);
    assert.match(s, /antes|Solo después te entregamos el dinero/);
    assert.match(s, /no hay crédito y no debes nada/);
    assert.match(s, /calculadora/i);
  });

  test('punto 6 (antes 7): el ejemplo es con $100.000 y sale del motor', () => {
    const s = seccion('garantia');
    assert.ok(s.indexOf('$100.000') >= 0, 'el ejemplo no es con $100.000');
    assert.ok(s.indexOf(pesos(100000 * M.FACTOR_GARANTIA)) >= 0, 'lo que suma un costo de $100.000 no es el del motor');
    assert.ok(s.indexOf(pesos(2 * 100000 * M.FACTOR_GARANTIA)) >= 0, 'el «el doble» del recargo no cuadra con el motor');
    assert.ok(s.indexOf(pesos(100000 * M.FACTOR_GARANTIA_RESPALDADO)) >= 0, 'el préstamo con garantía no suma lo del motor');
    assert.ok(s.indexOf(pesos(100000 * M.FACTOR_GARANTIA_RESPALDADO_MORA)) >= 0);
    assert.ok(s.indexOf(pesos(100000 * M.FACTOR_GARANTIA_MORA_VIEJA)) >= 0, 'la regla de los créditos viejos no es la del motor');
    assert.ok(s.indexOf(pesos(M.CUPON_KYC_MAXIMO)) >= 0 && s.indexOf(pesos(M.GARANTIA_POR_REFERIDO)) >= 0);
    assert.ok(s.indexOf(enPalabras(M.FECHA_MORA_SIN_GARANTIA)) >= 0, 'se perdió la fecha de la regla del recargo');
  });

  test('el recargo se puede negociar, sin prometer un descuento concreto', () => {
    [seccion('atraso'), seccion('garantia')].forEach(s => {
      assert.match(s, /se puede negociar/i);
      assert.match(s, /dar soluciones/i);
    });
    assert.ok(!/descuento (?:del?|de hasta) \$|\d+\s?% de descuento|te (?:rebajamos|perdonamos) (?:el|la) /i.test(T),
      'los términos prometen un descuento concreto');
    assert.match(seccion('atraso'), /No te prometemos un descuento fijo/);
  });

  test('ninguna cifra en pesos que no salga del motor o de un ejemplo declarado', () => {
    /* Cada «$» de los términos tiene que estar aquí. Si aparece uno nuevo, esta
       prueba obliga a decir de dónde sale: un precio escrito a mano es justo lo
       que Joan pidió quitar, y uno que pase el techo de usura es delito. */
    const permitidas = new Set([
      100000, 2 * 100000 * M.FACTOR_GARANTIA, 100000 * M.FACTOR_GARANTIA,
      100000 * M.FACTOR_GARANTIA_MORA_VIEJA, 100000 * M.FACTOR_GARANTIA_RESPALDADO,
      100000 * M.FACTOR_GARANTIA_RESPALDADO_MORA,
      75000,                                   // el factor de antes del 23-sep (nota histórica)
      M.CUPON_KYC_MAXIMO, M.GARANTIA_POR_REFERIDO, M.MONTO_MINIMO, M.CUPO_MAXIMO,
      132250,                                  // el ejemplo de «tu cupo es tu garantía»
      60000, 40000                             // el ejemplo del abono sobre $100.000
    ].concat(M.TRAMOS_NIVEL.map(t => t.desde)).map(Math.round));
    const vistas = [...T.matchAll(/\$\s?([\d.]+)/g)].map(m => Number(m[1].replace(/\./g, '')));
    assert.ok(vistas.length > 10, 'no encontré las cifras: cambió el formato');
    vistas.forEach(n => assert.ok(permitidas.has(n), 'los términos muestran ' + pesos(n) + ', que no sale de ninguna regla'));
    assert.ok(T.indexOf(pesos(M.CUPO_MAXIMO)) >= 0 && T.indexOf(pesos(M.MONTO_MINIMO)) >= 0);
  });

  test('lo que se dice en palabras también es lo del motor', () => {
    assert.equal(M.TOPE_DURO_PRORROGAS, 2, 'el motor cambió el tope de prórrogas: reescribir el punto 5 («hasta dos»)');
    assert.match(seccion('prorroga'), /hasta dos prórrogas por crédito/);
    assert.equal(M.CUOTAS_PLAN_DE_PAGOS, 3, 'el motor cambió las cuotas del plan: reescribir el punto 5 («tres pagos»)');
    assert.match(seccion('prorroga'), /tres pagos/);
    assert.equal(M.DIAS_CASTIGO, 90);
    assert.match(seccion('atraso'), /90 días sin que hagas ni un solo abono/);
  });

  test('las referencias no se usan para cobrar (Ley 2300, art. 4), en los dos documentos', () => {
    Object.keys(DOCS).forEach(f => {
      const v = visible(DOCS[f]);
      assert.ok(!/si no logramos comunicarnos contigo/i.test(v), f + ' vuelve a prometer contactar referencias');
      assert.match(v, /no las llamamos para cobrarte/i, f);
    });
  });
});

/* ======================================================================== */
describe('4. la política dice lo nuevo, y es verdad', () => {
  const P = visible(PRIV);
  const fila = etiqueta => {
    const tr = [...PRIV.matchAll(/<tr><td>([\s\S]*?)<\/tr>/g)].map(m => m[1])
      .find(t => t.replace(/<[^>]+>/g, '').indexOf(etiqueta) >= 0);
    assert.ok(tr, 'la tabla de datos perdió la fila «' + etiqueta + '»');
    const celdas = [...('<td>' + tr).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    return celdas;
  };
  const campo = id => U.CAMPOS.find(c => c.id === id);

  test('la fecha de la política es la versión de la autorización que se guarda, en el registro y en la app', () => {
    const m = PRIV.match(/Última actualización: (\d{1,2}) de (\w+) de (\d{4})/);
    assert.ok(m, 'la política perdió su fecha');
    const iso = m[3] + '-' + String(MESES.indexOf(m[2]) + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0');
    assert.equal(U.VERSION_AUTORIZACION, iso,
      'app/cuenta.js guarda la autorización con otra versión: el que se registra queda aceptando un texto que no es el publicado');
    const socio = (leer('app/socio.html').match(/var VERSION_AUTORIZACION = '([\d-]+)'/) || [])[1];
    assert.equal(socio, iso, 'app/socio.html pide la autorización con la versión vieja');
    assert.equal((leer('legal/terminos.html').match(/Última actualización: ([^<]+)</) || [])[1], enPalabras(iso),
      'los términos y la política se publicaron en fechas distintas');
  });

  test('el correo es obligatorio y la dirección opcional, como en el formulario (CAMPOS)', () => {
    const correo = fila('Tu correo electrónico'), dir = fila('Tu dirección');
    assert.equal(campo('correo').obligatorio, true, 'el formulario dejó el correo opcional y la política dice que es obligatorio');
    assert.match(correo[correo.length - 1], /^Sí/, 'la política no dice que el correo es obligatorio');
    assert.equal(campo('direccion').obligatorio, false, 'el formulario volvió a pedir la dirección y la política dice opcional');
    assert.match(dir[dir.length - 1], /^No/, 'la política no dice que la dirección es opcional');
    assert.ok(!/Ninguno es obligatorio/i.test(P), 'volvió «ninguno es obligatorio», que en el registro no es verdad');
  });

  test('el servicio de ubicación por IP que nombra la política es el que el código llama, y ninguno más', () => {
    /* Los servicios conocidos, agrupados por empresa (una misma empresa puede
       tener dos dominios: ipwho.is es de ipwhois.io). */
    const EMPRESAS = { ipwhois: /ipwho\.is|ipwhois\.(?:io|app)/, ipinfo: /ipinfo\.io/, ipapi: /ipapi\.(?:co|is)/,
      ipapicom: /ip-api\.com/, freeipapi: /freeipapi\.com/, geojs: /geojs\.io/, ipgeolocation: /ipgeolocation\.io/,
      ipdata: /ipdata\.co/, ipregistry: /ipregistry\.co/, dbip: /db-ip\.com/, geoplugin: /geoplugin\.net/,
      ipstack: /ipstack\.com/, bigdatacloud: /bigdatacloud\.net/ };
    const codigo = fs.readdirSync(path.join(RAIZ, 'panel')).filter(f => /\.(html|js)$/.test(f)).map(f => 'panel/' + f)
      .concat(fs.readdirSync(path.join(RAIZ, 'app')).filter(f => /\.js$/.test(f)).map(f => 'app/' + f))
      .map(f => sinComentarios(leer(f))).join('\n');
    const enCodigo = Object.keys(EMPRESAS).filter(k => new RegExp('https?://(?:[\\w-]+\\.)*(?:' + EMPRESAS[k].source + ')').test(codigo));
    const enPolitica = Object.keys(EMPRESAS).filter(k => EMPRESAS[k].test(P));
    assert.ok(enCodigo.length >= 1, 'ningún código consulta la ubicación por IP: la política la promete sin que exista');
    assert.deepEqual(enPolitica.sort(), enCodigo.sort(),
      'la política nombra ' + JSON.stringify(enPolitica) + ' y el código llama a ' + JSON.stringify(enCodigo) +
      ': a quien recibe la IP del cliente hay que nombrarlo (Ley 1581), y nombrar uno que no se usa es mentir');
    assert.match(P, /solo la dirección IP/i, 'no dice que al servicio le llega solo la IP');
    assert.match(P, /nunca desde tu celular/, 'no dice que la consulta la hace el equipo y no el teléfono');
  });

  test('la selfie automática: la detección corre en el celular y no sale nada más que la foto', () => {
    const s = visible((PRIV.match(/<section id="sensibles">([\s\S]*?)<\/section>/) || [])[1] || '');
    assert.match(s, /dentro de tu celular/);
    assert.match(s, /no se guarda ni sale de tu celular/);
    assert.match(s, /lo único que nos llega es la foto/);
    assert.match(s, /No guardamos ninguna huella de tu cara/);
  });

  test('lo que el código de barras trae y no se guarda (RH y sexo) se descarta de verdad', () => {
    assert.match(P, /tipo de sangre \(RH\)/);
    assert.match(P, /se descartan en tu celular/);
    const EC = sinComentarios(leer('app/escaner-cedula.js'));
    assert.match(EC, /delete r\.rh;/, 'escaner-cedula.js dejó de borrar el RH y la política dice que se descarta');
    assert.match(EC, /delete r\.sexo;/, 'escaner-cedula.js dejó de borrar el sexo y la política dice que se descarta');
  });

  test('declara las tablas de la entrada nueva y la constancia de las condiciones aceptadas', () => {
    assert.match(P, /juntamos tu cuenta/i, 'no declara cuándo se junta la cuenta con el historial (tabla vinculos)');
    assert.match(P, /contraseña nueva/i, 'no declara las contraseñas nuevas que da el equipo (tabla claves_nuevas)');
    assert.match(P, /la contraseña no/, 'no dice que la contraseña nueva no se anota');
    assert.match(P, /«Las condiciones de este crédito»/, 'no declara la constancia de las condiciones aceptadas');
    assert.match(P, /Supabase/);
    assert.match(P, /fuera de Colombia/);
  });

  test('dice qué cambió el 8 de octubre de 2026 y que el aviso llega por la app o por WhatsApp', () => {
    const s = visible((PRIV.match(/<section id="cambios">([\s\S]*?)<\/section>/) || [])[1] || '');
    assert.match(s, /Lo que cambió el 8 de octubre de 2026/);
    assert.match(s, /NEXECO S\.A\.S\./);
    assert.match(s, /dentro de la app o por WhatsApp/);
  });
});

/* ======================================================================== */
describe('5. el aviso a los socios: en la app y en el CRM', () => {

  const CFG = { url: 'https://prueba.supabase.co', anon: 'sb_publishable_prueba' };
  const AHORA = Date.parse('2026-10-08T15:00:00Z');
  const CORREO = '573001112222@tugarantia.net';
  const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
    socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };
  const nube = (url, cuerpo) => {
    if (/\/auth\/v1\/token\?grant_type=password$/.test(url)) {
      return cuerpo && cuerpo.password === 'mi-clave-buena' && cuerpo.email === CORREO
        ? { status: 200, cuerpo: { access_token: 'a1', refresh_token: 'r1', expires_at: Math.floor(AHORA / 1000) + 3600, user: { email: CORREO } } }
        : { status: 400, cuerpo: { error: 'invalid_grant' } };
    }
    if (/\/rest\/v1\/rpc\/mi_cuenta$/.test(url)) {
      return { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Adriana Prueba', datos: PAQUETE, actualizado_en: '2026-10-08T14:00:00Z' } };
    }
    if (/\/rest\/v1\/rpc\/chat_leer_sesion$/.test(url)) return { status: 200, cuerpo: { ok: true, canal: cuerpo.p_canal, mensajes: [] } };
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
  async function entrar(local) {
    const A = abrirSocio({ red: nube, ahora: AHORA, local: Object.assign({ socio_cfg: JSON.stringify(CFG) }, local || {}) });
    await asentar();
    A.elem('inCel').value = '3001112222'; A.elem('inClave').value = 'mi-clave-buena';
    A.ev('entrar()');
    await asentar(16);
    return A;
  }

  test('el socio lo ve arriba de Inicio, una vez: «Entendido» lo cierra y no vuelve', async () => {
    const A = await entrar();
    assert.ok(A.visible('pCuenta'), 'no entró: el banco cambió');
    assert.equal(A.ev('S.origen'), 'nube');
    const h = A.ev("vistaInicio()");
    assert.match(h, /id="avisoResponsable"/, 'el aviso no sale en Inicio');
    assert.match(h, /NEXECO S\.A\.S\./);
    assert.match(h, /privacidad\.html#cambios/, 'el aviso no lleva a lo que cambió');
    assert.match(h, /onclick="cerrarAvisoResponsable\(\)">Entendido</);
    assert.ok(h.indexOf('id="avisoResponsable"') < h.indexOf('class="card'), 'el aviso no va primero');
    A.ev('cerrarAvisoResponsable()');
    const llave = A.ev('llaveAvisoResponsable()');
    assert.equal(A.local.getItem(llave), '1', 'cerrarlo no quedó guardado: volvería en cada visita');
    assert.ok(!/avisoResponsable"/.test(A.ev('vistaInicio()')), 'cerrado, sigue saliendo');

    /* Y la próxima visita, con lo guardado, ya no sale. */
    const B = await entrar({ [llave]: '1' });
    assert.ok(!/id="avisoResponsable"/.test(B.ev('vistaInicio()')), 'volvió a salir después de cerrarlo');
  });

  test('si el teléfono no deja guardar, se recuerda mientras la página siga abierta', async () => {
    const A = await entrar();
    A.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    A.ev('cerrarAvisoResponsable()');
    assert.ok(!/id="avisoResponsable"/.test(A.ev('vistaInicio()')));
  });

  test('cuando mira el equipo («ver como él», origen panel) no sale, y la fecha es la de la política', () => {
    const S = sinComentarios(leer('app/socio.html'));
    const f = S.slice(S.indexOf('function avisoResponsable('), S.indexOf('function cerrarAvisoResponsable('));
    assert.match(f, /S\.origen === 'panel'/, 'el aviso le saldría al equipo, y su «Entendido» se lo escondería al cliente');
    const desde = (S.match(/AVISO_RESPONSABLE = \{ desde: '([\d-]+)'/) || [])[1];
    assert.equal(desde, U.VERSION_AUTORIZACION, 'el aviso dice una fecha y la política otra');
  });

  test('el CRM tiene la plantilla de WhatsApp, sin direcciones pegadas y en la voz de siempre', () => {
    const CRM = leer('panel/crm.html');
    const DEF = CRM.slice(CRM.indexOf('const PLANTILLAS_DEF={'), CRM.indexOf('const INVITACION_CON_CODIGO'));
    const i = DEF.indexOf('\n  cambioResponsable:{');
    assert.ok(i >= 0, 'no está la plantilla cambioResponsable');
    const linea = DEF.slice(i).split('\n')[1];
    const m = linea.match(/m:'((?:[^'\\]|\\.)*)'/)[1];
    assert.match(m, /NEXECO S\.A\.S\./);
    assert.ok(m.indexOf(enPalabras(U.VERSION_AUTORIZACION)) >= 0, 'la plantilla no dice desde cuándo, o dice otra fecha');
    assert.match(m, /Te escribimos/);
    assert.ok(!/https?:\/\//.test(m), 'una dirección escrita a mano se queda vieja');
    const tokens = [...m.matchAll(/\{(\w+)\}/g)].map(x => x[1]);
    const tpp = CRM.match(/\n  cambioResponsable:\[([^\]]*)\]/);
    assert.ok(tpp, 'TOKENS_POR_PLANTILLA no tiene cambioResponsable: le ofrecería {saldo} y {monto}, que salen vacíos');
    tokens.forEach(t => assert.ok(tpp[1].indexOf("'" + t + "'") >= 0, 'la plantilla usa {' + t + '} y nadie lo contesta'));
  });
});
