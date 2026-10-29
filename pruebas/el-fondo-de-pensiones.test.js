/* ============================================================================
 * TU FONDO DE PENSIONES: LA LISTA, LOS TEXTOS, EL GUARDADERO Y LA COLA
 * 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones.test.js
 *
 * Lo puro de app/fondos-pension.js y app/historia-laboral.js, sin navegador:
 *   · la lista: las direcciones OFICIALES (https y del dominio de cada fondo)
 *     y las mismas reglas de combinación que la base;
 *   · los textos: la autorización dice lo que la ley pide decir y nada que el
 *     código no haga (nunca «verificado», nunca «30 días»), y nace SIN marcar;
 *   · el tipo por los primeros bytes, como la base;
 *   · el guardadero del registro: lo escogido atado al intento y al celular,
 *     los archivos que caducan al día, la cola de la cuenta;
 *   · la subida de la cola: autorización primero, de uno en uno, y lo que
 *     pasa cuando la base dice que no o la señal se cae.
 * La base está en pruebas/el-fondo-de-pensiones-postgres.test.js; la pantalla,
 * en pruebas/el-fondo-de-pensiones-pantallas.test.js.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const FP = require('../app/fondos-pension.js');
const HL = require('../app/historia-laboral.js');

const bytes = s => new Uint8Array(Buffer.from(s, 'binary'));
const blob = s => new Blob([Buffer.from(s, 'binary')]);
const PDF = '%PDF-1.4\n% de mentira\n%%EOF\n';
/* 28-oct-2026 (arreglo de los leves, P3) — las imágenes de mentira llevan su
   estructura de verdad (bloques de PNG, segmentos de JPEG, trozos de WEBP bien
   formados): desde hoy se leen por dentro para quitarles los metadatos, y una
   que no se deja leer no se guarda. Los CRC van en cero: nadie los mira. */
const trozoPng = (tipo, datos) => {
  const d = Buffer.from(datos, 'binary'), l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  return Buffer.concat([l, Buffer.from(tipo, 'binary'), d, Buffer.alloc(4)]);
};
const pngDe = (...trozos) => Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), ...trozos.map(t => Buffer.from(t, 'binary'))]);
const IHDR = trozoPng('IHDR', '\0\0\0\x10\0\0\0\x10\x08\x02\0\0\0');
const PNG = pngDe(IHDR, trozoPng('IDAT', 'pixeles de mentira'), trozoPng('IEND', '')).toString('binary');

describe('la lista de fondos', () => {
  test('los cinco fondos y las dos opciones, con la fecha en que se consultaron', () => {
    assert.deepEqual(FP.FONDOS.map(f => f.codigo), ['colpensiones', 'porvenir', 'proteccion', 'colfondos', 'skandia']);
    assert.deepEqual(FP.OTRAS.map(f => f.codigo), ['no_se', 'nunca']);
    assert.match(FP.CONSULTADO, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('cada botón va a la página OFICIAL que leyó la investigación: https y del dominio del fondo', () => {
    const esperadas = {
      colpensiones: 'https://sede.colpensiones.gov.co/tramite/updInfo/55/',
      porvenir: 'https://www.porvenir.com.co/web/certificados-y-extractos/certificado-de-historia-laboral',
      proteccion: 'https://www.proteccion.com/portalafiliados/afiliados/certifacil',
      colfondos: 'https://www.colfondos.com.co/dxp/acceso-de-usuarios',
      skandia: 'https://www.skandia.co/fondo-pensiones-obligatorias/historia-laboral'
    };
    Object.keys(esperadas).forEach(c => assert.equal(FP.urlOficial(c), esperadas[c], c));
    /* Lo que no está en la lista no tiene dirección (ni un dato la pone). */
    assert.equal(FP.urlOficial('javascript:alert(1)'), '');
    assert.equal(FP.urlOficial('no_se'), '', 'el RUAF no es un fondo: no lleva el botón del fondo');
  });

  test('los que mandan al correo con la cédula y los que piden entrar con usuario', () => {
    const como = Object.fromEntries(FP.FONDOS.map(f => [f.codigo, f.como]));
    assert.deepEqual(como, { colpensiones: 'correo', porvenir: 'correo', proteccion: 'correo', colfondos: 'usuario', skandia: 'usuario' });
    /* Quien entra con su clave lee que esa clave es suya: nunca se nos da. */
    FP.FONDOS.filter(f => f.como === 'usuario').forEach(f =>
      assert.ok(f.pasos.some(p => /no nos la des nunca/.test(p)), f.nombre + ' no dice que su clave no se nos da'));
  });

  /* 28-oct-2026 (arreglo, ronda 2) — SKANDIA: LO QUE ENSEÑA SU GUÍA OFICIAL.
     El paso decía «Busca «Historia laboral» y descárgala», y eso no lo había
     visto nadie: la guía de Skandia (como-consultar-tu-historia-laboral.pdf,
     la que enlaza la página que abre el botón) la muestra EN PANTALLA, con
     «Tu saldo» arriba y periodos que el afiliado puede editar, y en sus cinco
     páginas no dice cómo descargarla. Quien no encontraba la descarga
     mandaba pantallazos con su saldo, que la política dice que no pedimos.
     Con el texto de antes, esta prueba falla. */
  test('Skandia: el paso dice lo que enseña su guía (en pantalla), no ordena una descarga sin confirmar, y pide dejar el saldo por fuera', () => {
    const s = FP.porCodigo('skandia');
    const pasos = s.pasos.join(' ');
    assert.equal(/descárgala/i.test(pasos), false, 'el paso ordena descargar una historia laboral que la guía oficial no enseña a descargar');
    assert.match(pasos, /«Historia Laboral»: ahí la ves en pantalla/, 'no dice que la historia laboral se ve en pantalla');
    assert.match(pasos, /Si te deja bajarla en PDF/, 'el PDF no va como condición');
    assert.match(pasos, /deja por fuera tu saldo: no lo necesitamos/, 'no dice que el saldo se deja por fuera del pantallazo');
    assert.match(pasos, /tal como sale, sin editar nada/, 'no dice que no edite los periodos antes del pantallazo');
    assert.match(s.nota, /Sami/, 'el WhatsApp no dice con quién ni qué opción');
    /* Y Joan, al mirarla en el CRM, lee lo mismo: el saldo no se usa y las cifras pueden ser del afiliado. */
    assert.match(s.notaCrm, /saldo: no lo pedimos y no se usa/);
    assert.match(s.notaCrm, /editar y agregar periodos/);
    const HC = require('../panel/historia-laboral-crm.js');
    const bloque = HC.bloque({ ok: true, celular: '3001112233', archivos: [],
      autorizacion: { fondos: ['skandia'], version: '2026-11-03', autorizada_en: '2026-11-03T15:00:00Z', revocada_en: null } })
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(bloque, /Skandia: .*saldo: no lo pedimos y no se usa/, 'la nota de Skandia no llega al CRM de Joan');
  });

  /* 28-oct-2026 (arreglo de los leves, P15) — la nota de Protección decía
     «Según fuentes de 2017», y la investigación del 28-oct (pensiones.md, §2.0
     y §2.3) cita dos: Semana (2017) y Rankia (actualizado el 15-jun-2026),
     ninguna oficial. Joan decide con esa nota cuánto creerle al PDF. Con el
     texto de antes esto falla. */
  test('la nota de Protección para Joan dice lo que dice la investigación: dos fuentes de segunda mano, 2017 y 2026', () => {
    const n = FP.porCodigo('proteccion').notaCrm;
    assert.equal(/Según fuentes de 2017/.test(n), false, 'la nota sigue citando solo 2017');
    assert.match(n, /Semana, 2017/);
    assert.match(n, /Rankia, actualizada en junio de 2026/);
    assert.match(n, /la página de Protección no lo dice/);
  });

  test('las reglas de combinación son las de la base: «No sé» y «Nunca» solos; Colpensiones con UN privado', () => {
    assert.equal(FP.revisar(['colpensiones', 'porvenir']).ok, true);
    assert.equal(FP.revisar([]).ok, true);
    assert.equal(FP.revisar(['no_se', 'porvenir']).ok, false);
    assert.equal(FP.revisar(['nunca', 'colpensiones']).ok, false);
    assert.equal(FP.revisar(['porvenir', 'proteccion']).ok, false);
    assert.equal(FP.revisar(['colpensiones', 'porvenir', 'skandia']).ok, false);
    assert.equal(FP.revisar(['inventado']).ok, false);
    /* Marcar nunca deja una combinación que no vale. */
    let f = [];
    f = FP.alternar(f, 'porvenir'); assert.deepEqual(f, ['porvenir']);
    f = FP.alternar(f, 'colpensiones'); assert.deepEqual(f, ['colpensiones', 'porvenir']);
    f = FP.alternar(f, 'skandia'); assert.deepEqual(f, ['colpensiones', 'skandia'], 'el segundo privado no reemplazó al primero');
    f = FP.alternar(f, 'no_se'); assert.deepEqual(f, ['no_se']);
    f = FP.alternar(f, 'colfondos'); assert.deepEqual(f, ['colfondos']);
    f = FP.alternar(f, 'colfondos'); assert.deepEqual(f, []);
    assert.equal(FP.nombres(['colpensiones', 'porvenir']), 'Colpensiones y Porvenir');
  });

  test('la misma lista que la base (pension_autorizar) acepta', () => {
    const sql = fs.readFileSync(path.join(RAIZ, 'base', '20261103_el_fondo_de_pensiones.sql'), 'utf8');
    const lista = (sql.match(/x not in \(([^)]*)\)/) || [])[1] || '';
    assert.deepEqual(lista.match(/'(\w+)'/g).map(s => s.slice(1, -1)), FP.FONDOS.concat(FP.OTRAS).map(f => f.codigo));
  });
});

describe('los textos: la autorización dice lo que la ley pide, y nada que el código no haga', () => {
  const T = HL.TEXTOS;
  const todo = [T.autorizacion, T.autorizacionDetalle, T.intro, T.introCuenta].join(' ');
  test('para qué, que es opcional y aparte, cuánto se guarda, quién la ve y cómo se quita', () => {
    ['NEXECO S.A.S.', 'historia laboral', 'nombre de mi fondo de pensiones', 'Para revisar dónde trabajo y cuánto cotizo',
     'Es opcional', 'aparte de la autorización general', 'Nunca me piden la clave de mi fondo',
     'Se guarda mientras tenga cuenta en Tu Garantía', 'la ve solo quien dirige el negocio', 'no el resto del equipo',
     'desde mi cuenta en la app', 'pedir por el chat que la borren',
     /* 28-oct-2026 (arreglo de los leves, P5) — lo de la salud, como de verdad pasa. */
     'incapacidades o licencias, que son datos de salud, quedan guardadas con él, pero no se usan para nada',
     'no estoy obligado a darlas', 'en un pantallazo las puedo tapar']
      .forEach(p => assert.ok(todo.indexOf(p) >= 0, 'la autorización no dice «' + p + '»'));
  });
  /* 28-oct-2026 (arreglo de los leves, P4, P5 y P8) — LOS TEXTOS LEGALES NO SE
     CONTRADICEN NI CALLAN. La política (punto 2) y los términos decían que
     cada dato sube la garantía, y la historia laboral no la sube; la tarjeta
     decía «tu garantía sale de tus pagos», falso para quien se acaba de
     registrar; la casilla y la política callaban que las incapacidades y
     licencias se guardan con el documento; y la política, que vale para
     PlataChat, describía un paso que PlataChat no tiene. Con los textos de
     antes, esto falla. */
  test('la política, los términos y la tarjeta dicen lo mismo de la garantía, la salud y PlataChat', () => {
    const visible = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    const vis = f => visible(fs.readFileSync(path.join(RAIZ, 'legal', f), 'utf8'));
    const P = vis('privacidad.html'), T = vis('terminos.html');
    /* La garantía: donde se dice que cada dato la sube, se dice la excepción. */
    assert.match(P, /cada dato que nos das la sube \(salvo tu historia laboral del fondo de pensiones, que no la cambia/,
      'la política dice que cada dato sube la garantía, sin la excepción de la historia laboral');
    assert.match(T, /Cada dato que entregas te sube esa cifra \(salvo la historia laboral de tu fondo de pensiones, que es opcional y no la cambia\)/,
      'los términos dicen que cada dato sube la garantía, sin la excepción de la historia laboral');
    assert.equal(HL.TEXTOS.introCuenta.slice(-'No cambia tu garantía.'.length), 'No cambia tu garantía.');
    assert.equal(/sale de tus pagos/.test(HL.TEXTOS.introCuenta), false, 'la tarjeta dice que la garantía sale de los pagos: falso para quien recién se registra');
    /* Los términos cambiaron: su fecha y su lista lo dicen (la regla de responsable-nexeco). */
    assert.match(T, /Última actualización: 30 de octubre de 2026/);
    assert.match(T, /Lo que cambió el 30 de octubre de 2026: La historia laboral de tu fondo de pensiones, que puedes darnos si quieres, no sube la garantía que te prestamos/);
    /* La salud: se guarda con el documento, no se usa, no es obligatoria, y se puede tapar. */
    const pension = visible(fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8')
      .split('<h3 id="pension">')[1].split('<section id="sensibles">')[0]);
    ['Si trae incapacidades o licencias, que son datos de salud, quedan guardadas con el documento, pero no las usamos para nada',
     'No estás obligado a darlas: si nos mandas pantallazos, puedes taparlas']
      .forEach(t => assert.ok(pension.indexOf(t) >= 0, 'la política no dice «' + t + '»'));
    [pension, HL.TEXTOS.autorizacionDetalle].forEach(t => assert.equal(/no se guardan|no las guardamos/.test(t), false, 'promete que no se guardan'));
    /* PlataChat: el paso es solo de Tu Garantía, y se dice. */
    assert.match(pension, /es solo de Tu Garantía/);
    assert.match(pension, /PlataChat no te la pide/);
    assert.match(P, /Lo que cambió el 30 de octubre de 2026: En Tu Garantía \(PlataChat no la pide\) puedes darnos/);
  });
  test('ninguna pantalla dice «verificado», ni promete que se borra a los 30 días, ni que sube la garantía', () => {
    const pantallas = JSON.stringify([HL.TEXTOS, HL.MOTIVOS, FP.FONDOS, FP.OTRAS]);
    assert.equal(/verific/i.test(pantallas), false, 'una pantalla habla de verificar con el fondo');
    assert.equal(/30 d[ií]as/.test(pantallas), false, 'dice que se borra a los 30 días: Joan decidió que no');
    assert.equal(/sube tu garant|suma garant|más garant/i.test(pantallas), false, 'promete garantía que el motor no da');
    assert.match(HL.TEXTOS.introCuenta, /No cambia tu garantía/);
  });
  /* 28-oct-2026 (arreglo de los leves, P9) — la ficha de Play (PLAY-FICHA.md,
     que sale de herramientas/ficha-play.js) decía «ni a tu ubicación… Solo la
     cámara» al lado de su propia declaración de la ubicación (desde el 8-sep)
     y de los archivos y pantallazos de la historia laboral. Play está
     descartado como canal, pero es la fuente de la ficha si se retoma, y una
     ficha que no coincide con lo que la app hace es motivo de suspensión. Con
     el texto de antes esto falla. */
  test('la ficha de Play no dice que la app no pide lo que la misma ficha declara (la ubicación, los archivos)', () => {
    const K = require('../app/cumplimiento.js');
    const { generar } = require('../herramientas/ficha-play.js');
    const f = generar('2026-10-01');
    const bloque = f.split('LO QUE ESTA APP NO TE PIDE\n')[1].split('\n')[0];
    const recoge = K.datosQueRecoge().map(d => d.id);
    assert.ok(recoge.includes('ubicacion') && recoge.includes('historia_laboral'), 'la prueba no prueba nada: la ficha ya no declara esto');
    assert.equal(/ni a tu ubicación/.test(bloque), false, 'dice que no accede a la ubicación, y la declara');
    assert.equal(/Solo la cámara, y solo/.test(bloque), false, 'dice «solo la cámara», y declara archivos y pantallazos');
    /* Lo mismo que dice play/ en «Tu autorización» (lo mira
       el-fondo-de-pensiones-registro.test.js en la pantalla). */
    assert.match(bloque, /tu ubicación una sola vez si la autorizas, y los archivos que tú mismo escojas si nos das tu historia laboral/);
    assert.ok(fs.readFileSync(path.join(RAIZ, 'PLAY-FICHA.md'), 'utf8').indexOf(bloque) >= 0, 'PLAY-FICHA.md no está regenerado: node herramientas/ficha-play.js 2026-10-01');
  });

  test('la casilla nace SIN marcar (Decreto 1377, art. 7): solo sale marcada si ya la dio', () => {
    assert.equal(/checked/.test(HL.autorizacionHTML(false)), false);
    assert.match(HL.autorizacionHTML(true), /checked/);
    assert.match(HL.autorizacionHTML(false), /Versión del 30 de octubre de 2026/);
    assert.match(HL.autorizacionHTML(false), /privacidad\.html#pension/);
  });
  test('su versión es la fecha de la política que la describe, y no es la de la autorización general', () => {
    assert.equal(HL.VERSION_AUTORIZACION, '2026-10-30');
    assert.notEqual(HL.VERSION_AUTORIZACION, require('../app/cuenta.js').VERSION_AUTORIZACION);
    const P = fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.match(P, /id="pension"/, 'la política no tiene la sección a la que apunta la casilla');
    assert.match(P.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Lo que cambió el 30 de octubre de 2026:/,
      'la versión de la autorización no es la fecha de ninguna versión publicada de la política');
  });
  /* 28-oct-2026 (segunda revisión, ronda 1) — LA FECHA ES LA DE
     PUBLICACIÓN, Y ESTE LOTE SALE EL VIERNES 30. Las pruebas de arriba solo
     pedían que la casilla, la política y los términos dijeran el MISMO día, y
     los tres decían el 3 de noviembre (el piloto que se había propuesto): del
     viernes 30 al lunes 2, festivo, el paso habría recogido historias
     laborales con una autorización «del 3 de noviembre» mientras la política
     publicada decía que regía la del 27-oct, que no tiene esta finalidad. El
     día de salida es decisión de Joan (28-oct, en la noche: «publícalo con lo
     del viernes»), y por eso está escrito aquí: si el lote sale otro día, se
     cambia este renglón y la prueba dice qué más mover. Con los textos de
     antes falla. */
  const PUBLICACION_DEL_LOTE = '2026-10-30';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const isoDe = t => { const m = String(t).match(/(\d{1,2}) de (\w+) de (\d{4})/); return m ? m[3] + '-' + String(MESES.indexOf(m[2]) + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
  test('la casilla, la política y los términos dicen el día en que el lote sale al sitio, y ninguna fecha es posterior', () => {
    const visible = h => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const P = visible(fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8'));
    const T = visible(fs.readFileSync(path.join(RAIZ, 'legal', 'terminos.html'), 'utf8'));
    const casilla = visible(HL.autorizacionHTML(false));
    assert.equal(HL.VERSION_AUTORIZACION, PUBLICACION_DEL_LOTE, 'la casilla firma una versión que no es el día en que sale');
    assert.equal(isoDe((casilla.match(/Versión del (\d{1,2} de \w+ de \d{4})/) || [])[1]), PUBLICACION_DEL_LOTE, 'la casilla dice otro día');
    const fechas = { 'la política, «Última actualización»': (P.match(/Última actualización: (\d{1,2} de \w+ de \d{4})/) || [])[1],
                     'la política, su primer «Lo que cambió»': (P.match(/Lo que cambió el (\d{1,2} de \w+ de \d{4}):/) || [])[1],
                     'la política, «Esta versión rige desde»': (P.match(/Esta versión rige desde el (\d{1,2} de \w+ de \d{4})/) || [])[1],
                     'los términos, «Última actualización»': (T.match(/Última actualización: (\d{1,2} de \w+ de \d{4})/) || [])[1],
                     'los términos, su primer «Lo que cambió»': (T.match(/Lo que cambió el (\d{1,2} de \w+ de \d{4}):/) || [])[1] };
    Object.keys(fechas).forEach(k => assert.equal(isoDe(fechas[k]), PUBLICACION_DEL_LOTE, k + ' dice «' + fechas[k] + '»'));
    /* Y en ninguno de los dos documentos hay una fecha de versión después del
       día en que sale: una versión que «rige» después de publicada deja lo
       que se firme en el medio sin la política que lo describe. */
    [['legal/privacidad.html', P], ['legal/terminos.html', T]].forEach(([f, d]) =>
      [...d.matchAll(/(?:Última actualización:|Lo que cambió el|rige desde el|rigió desde el) (\d{1,2} de \w+ de \d{4})/g)].forEach(m =>
        assert.ok(isoDe(m[1]) <= PUBLICACION_DEL_LOTE, f + ' tiene una versión del ' + m[1] + ', después del día en que sale el lote')));
  });
  /* 28-oct-2026 (segunda revisión, ronda 1) — EL AVISO DEL PUNTO
     11 DE LOS TÉRMINOS. Los términos cambian con este lote (la historia
     laboral no sube la garantía prestada) y su punto 11 promete avisar
     «dentro de la app… antes de que rija». Ese cambio solo le toca a quien da
     su historia laboral, y para darla tiene que pasar por el paso del registro
     o por la tarjeta de la cuenta: las dos lo dicen arriba de la casilla. El
     registro no lo decía (solo la tarjeta). Con el texto de antes falla. */
  test('quien va a dar su historia laboral lee «no cambia tu garantía» ANTES de la casilla, en el registro y en la cuenta, y los términos lo dicen', () => {
    const plano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ['registro', 'cuenta'].forEach(modo => {
      const h = HL.pantallaHTML({ modo, aut: null, fondos: [], pidio: {}, archivos: [] });
      const t = plano(h), i = t.search(/no cambia tu garantía/i);
      assert.ok(i >= 0, 'en el ' + modo + ' no dice que no cambia la garantía');
      assert.ok(h.search(/no cambia tu garantía/i) < h.indexOf('id="hlAut"'), 'en el ' + modo + ' lo dice después de la casilla');
    });
    const T = plano(fs.readFileSync(path.join(RAIZ, 'legal', 'terminos.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, ' '));
    assert.match(T, /te avisamos dentro de la app o por WhatsApp antes de que rija/, 'la prueba no prueba nada: el punto 11 ya no promete el aviso');
    assert.match(T, /no sube la garantía que te prestamos \(punto 6\): es opcional y aparte, y la app te lo dice antes de que nos la des\./,
      'los términos no dicen cómo se avisa este cambio');
  });
  test('el paso del registro tiene «Lo hago después» a la vista, con o sin autorización', () => {
    const sin = HL.pantallaHTML({ modo: 'registro', aut: null, fondos: [], archivos: [] });
    const con = HL.pantallaHTML({ modo: 'registro', aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {}, archivos: [] });
    [sin, con].forEach(h => assert.match(h, /data-hl="despues"[^>]*>Lo hago después</));
    assert.equal(/data-hl="fondo"/.test(sin), false, 'sin autorización ya pregunta el fondo');
    assert.match(con, /data-hl="fondo" value="porvenir" checked/);
    assert.match(con, /href="https:\/\/www\.porvenir\.com\.co\/[^"]+" target="_blank" rel="noopener noreferrer"/);
    ['📄 Subir el PDF', '🖼️ Subir pantallazos', '📋 Pegar'].forEach(b => assert.ok(con.indexOf(b) >= 0, 'falta «' + b + '»'));
    /* 28-oct-2026 (arreglo de los leves, P11) — y cómo pasar el PDF del correo
       al teléfono, que nada decía: en el registro y en la cuenta. */
    [con, HL.pantallaHTML({ modo: 'cuenta', aut: { version: '2026-11-03' }, fondos: ['colpensiones'], pidio: {}, archivos: [] })].forEach(h =>
      assert.match(h.replace(/<[^>]+>/g, ' '), /¿Te llegó al correo\? Ábrelo en este mismo teléfono, descarga el PDF \(en iPhone: «Guardar en Archivos»\) y escógelo con «📄 Subir el PDF»\./,
        'el paso no dice cómo pasar el PDF del correo al teléfono'));
    assert.ok(con.indexOf('id="hlDelCorreo"') < con.indexOf('id="hlBotonPdf"'), 'la línea del correo no va antes del botón');
    assert.match(con, /accept="application\/pdf,\.pdf"/);
    assert.match(con, /accept="image\/png,image\/jpeg,image\/webp" multiple/);
    assert.equal(/capture=/.test(con), false, 'el PDF y los pantallazos se escogen, no se toman con la cámara');
    assert.equal(/svg|text\/html/.test(con.match(/accept="[^"]*"/g).join(' ')), false);
  });
  /* 28-oct-2026 (arreglo, ronda 1) — El paso manda a la persona a la página
     de su fondo y a su correo, y decía «vuelve a esta pestaña» DEBAJO de los
     botones, sin más. Visto en Chrome sin ventana: volver a los 15 minutos
     con la pestaña recargada borraba la cédula y la selfie (la regla de la
     vuelta de la cámara) y la mandaba al «Paso 1 de 11». La regla se queda;
     lo que cambia es que se dice ANTES de irse, con sus minutos. */
  test('el registro avisa ANTES del primer botón que saca de la página: los minutos de la regla de la cámara, qué se borra y el camino que no pierde nada', () => {
    const min = require('../app/escaner-cedula.js').MINUTOS_VUELTA_DE_LA_CAMARA;
    const reg = f => HL.pantallaHTML({ modo: 'registro', aut: { version: '2026-11-03' }, fondos: f, pidio: {}, archivos: [] });
    const plano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const h = reg(['colpensiones', 'porvenir']);
    const aviso = h.indexOf('id="hlAntesDeIrte"');
    assert.ok(aviso > 0 && aviso < h.indexOf('data-hl="abrir"'), 'el aviso no va antes del primer «Abrir la página»');
    const t = plano(h);
    assert.ok(t.indexOf('vuelve en menos de ' + min + ' minutos') >= 0, 'no dice los minutos de la regla');
    assert.equal(HL.minutosFuera(), min, 'el aviso no lee los minutos de la regla que borra');
    assert.match(t, /por seguridad se borran de él las fotos de tu cédula y de tu cara, y tendrás que volver a tomarlas/);
    assert.match(t, /Si tarda en llegarte, no la esperes: sigue con tu registro y súbela después desde tu cuenta en la app/);
    /* «No sé» también saca de la página (el RUAF): el aviso va, sin lo de subirla. */
    const r = reg(['no_se']);
    assert.ok(r.indexOf('id="hlAntesDeIrte"') >= 0 && r.indexOf('id="hlAntesDeIrte"') < r.indexOf('Abrir el RUAF'), 'sin aviso antes del RUAF');
    assert.equal(/súbela aquí/.test(r.match(/id="hlAntesDeIrte"[\s\S]*?<\/div>/)[0]), false);
    /* «Nunca he cotizado» no saca a nadie; en la app ya hay cuenta y nada se borra por salir. */
    assert.equal(reg(['nunca']).indexOf('hlAntesDeIrte'), -1);
    assert.equal(HL.pantallaHTML({ modo: 'cuenta', aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {}, archivos: [] })
      .indexOf('hlAntesDeIrte'), -1);
    /* Y la lista del registro no promete que se quedan en el teléfono pase lo que pase. */
    const l = plano(HL.pantallaHTML({ modo: 'registro', aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {},
      archivos: [{ id: 'a', tipo: 'pdf', bytes: 10 }] }));
    assert.ok(l.indexOf('Si sales de esta página más de ' + min + ' minutos y el teléfono la cierra, se borran') >= 0,
      'la lista promete que se quedan sin decir cuándo se borran');
  });
});

describe('el tipo sale de los primeros bytes, como en la base', () => {
  test('PDF, JPG, PNG y WEBP sí; SVG, HTML, GIF, un ejecutable o un PDF con un espacio delante, no', () => {
    assert.equal(HL.tipoPorBytes(bytes(PDF)), 'pdf');
    assert.equal(HL.tipoPorBytes(bytes('\xff\xd8\xff\xe0JFIF')), 'jpg');
    assert.equal(HL.tipoPorBytes(bytes(PNG)), 'png');
    assert.equal(HL.tipoPorBytes(bytes('RIFF\x10\x00\x00\x00WEBPVP8 ')), 'webp');
    ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<!doctype html>', 'GIF89a', 'MZ\x90\x00', ' %PDF-1.4', 'RIFF\x10\x00\x00\x00WAVE', '']
      .forEach(s => assert.equal(HL.tipoPorBytes(bytes(s)), null, JSON.stringify(s)));
  });
  test('prepararArchivo: el PDF tal cual, con su huella; lo demás se dice', async () => {
    const r = await HL.prepararArchivo(blob(PDF));
    assert.equal(r.ok, true);
    assert.equal(r.archivo.tipo, 'pdf');
    assert.equal(Buffer.from(r.archivo.base64, 'base64').toString('binary'), PDF);
    assert.equal(r.archivo.sha256, require('node:crypto').createHash('sha256').update(Buffer.from(PDF, 'binary')).digest('hex'));
    assert.equal((await HL.prepararArchivo(blob('<svg onload="x"/>'))).motivo, 'tipo_no_permitido');
    assert.equal((await HL.prepararArchivo(blob(''))).motivo, 'vacio');
    const grande = new Blob([Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(HL.LIMITES.bytes)])]);
    assert.equal((await HL.prepararArchivo(grande)).motivo, 'muy_grande');
    /* Un pantallazo chico sube tal cual (sin achicar: el texto se queda nítido). */
    const p = await HL.prepararArchivo(blob(PNG));
    assert.equal(p.archivo.tipo, 'png');
    assert.equal(p.archivo.bytes, Buffer.from(PNG, 'binary').length);
  });
  test('los topes de la lista, antes de gastar la subida', () => {
    const l = [{ tipo: 'pdf', bytes: 10, sha256: 'a' }, { tipo: 'pdf', bytes: 10, sha256: 'b' }];
    assert.equal(HL.revisarNuevo(l, 'pdf', 10).motivo, 'demasiados_pdf');
    assert.equal(HL.revisarNuevo(l, 'png', 10, 'a').motivo, 'repetido');
    const imgs = l.concat([1, 2, 3, 4, 5].map(i => ({ tipo: 'png', bytes: 10, sha256: 'i' + i })));
    assert.equal(HL.revisarNuevo(imgs, 'jpg', 10).motivo, 'demasiados_img');
    assert.equal(HL.revisarNuevo([], 'pdf', HL.LIMITES.bytes + 1).motivo, 'muy_grande');
    assert.equal(HL.revisarNuevo([{ tipo: 'png', bytes: 3e6 }, { tipo: 'png', bytes: 3e6 }, { tipo: 'png', bytes: 3e6 }, { tipo: 'png', bytes: 3e6 }],
      'pdf', 700000).motivo, 'sin_espacio');
    assert.equal(HL.revisarNuevo([], null, 10).motivo, 'tipo_no_permitido');
    assert.equal(HL.tamanoEnPalabras(230 * 1024), '230 KB');
    assert.equal(HL.tamanoEnPalabras(1.5 * 1048576), '1,5 MB');
    assert.equal(HL.resumen([{ tipo: 'pdf' }, { tipo: 'png' }, { tipo: 'jpg' }]), '1 PDF y 2 pantallazos');
  });
});

/* 28-oct-2026 (arreglo de los leves, P3) — TODA IMAGEN SE GUARDA SIN SUS
   METADATOS. Solo las de más de 1 MB pasaban por el lienzo: una foto de 200
   KB subía con su EXIF, que trae dónde se tomó (casi siempre la casa) y el
   modelo del teléfono. Con el código de antes, el JPEG chico de abajo sale de
   prepararArchivo con «GPSLatitude» y «SM-A146M» adentro, y esta prueba falla. */
describe('las imágenes se guardan sin sus metadatos, pesen lo que pesen', () => {
  const seg = (m, datos) => {
    const d = Buffer.from(datos, 'binary'), l = Buffer.alloc(2); l.writeUInt16BE(d.length + 2);
    return Buffer.concat([Buffer.from([0xff, m]), l, d]);
  };
  /* Una foto de cámara de mentira: su EXIF (con la orientación, si se pide),
     XMP, un perfil de color, MPF, IPTC, un comentario, la imagen, y el video
     de una «foto en movimiento» pegado después del final. */
  const jpegDe = orientacion => Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
    seg(0xe1, 'Exif\0\0' + 'II*\0\x08\0\0\0' + (orientacion
      ? '\x01\0' + '\x12\x01\x03\0\x01\0\0\0' + String.fromCharCode(orientacion) + '\0\0\0' + '\0\0\0\0'
      : '\0\0\0\0\0\0') + ' GPSLatitude 4.6097 GPSLongitude -74.0817 Make samsung Model SM-A146M'),
    seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>4,36.58N</exif:GPSLatitude></x:xmpmeta>'),
    seg(0xe2, 'ICC_PROFILE\0\x01\x01perfil de color'),
    seg(0xe2, 'MPF\0otras fotos'),
    seg(0xed, 'Photoshop 3.0\0IPTC de mentira'),
    seg(0xfe, 'comentario: casa de Maria'),
    seg(0xdb, '\0' + 'Q'.repeat(64)),
    seg(0xc0, '\x08\0\x10\0\x10\x01\x01\x11\0'),
    seg(0xc4, '\0' + 'H'.repeat(20)),
    seg(0xda, '\x01\x01\0\0\x3f\0'),
    Buffer.from('DATOS\xff\x00COMPRIMIDOS\xff\xd0SIGUEN', 'binary'),
    Buffer.from([0xff, 0xd9]),
    Buffer.from('MotionPhoto_Data ftypmp42 el video de la foto en movimiento', 'binary')
  ]);
  const tiene = (b, t) => Buffer.from(b).includes(Buffer.from(t, 'binary'));
  const PRIVADO = ['Exif', 'GPSLatitude', 'SM-A146M', 'samsung', 'xmpmeta', 'MPF', 'Photoshop', 'casa de Maria', 'MotionPhoto', 'ftyp'];

  test('un JPEG chico con GPS y el modelo del teléfono se guarda SIN ellos; la imagen y su color se quedan', async () => {
    const J = jpegDe();
    assert.ok(J.length < HL.LIMITES.achicarDesde, 'la muestra tiene que ser de las que NO pasan por el lienzo');
    const r = await HL.prepararArchivo(new Blob([J]));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.archivo.tipo, 'jpg');
    const guardado = Buffer.from(r.archivo.base64, 'base64');
    PRIVADO.forEach(t => assert.equal(tiene(guardado, t), false, 'lo que se guarda trae «' + t + '»'));
    ['JFIF', 'ICC_PROFILE', 'Q'.repeat(64), 'DATOS\xff\x00COMPRIMIDOS\xff\xd0SIGUEN'].forEach(t =>
      assert.ok(tiene(guardado, t), 'se perdió una parte de la imagen: «' + t.slice(0, 20) + '»'));
    assert.deepEqual([...guardado.subarray(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...guardado.subarray(-2)], [0xff, 0xd9], 'no termina en el final de la imagen');
    assert.equal(r.archivo.bytes, guardado.length);
    assert.equal(r.archivo.sha256, require('node:crypto').createHash('sha256').update(guardado).digest('hex'), 'la huella no es la de lo que se guarda');
  });

  test('la foto que viene de lado según su EXIF va por el lienzo (la dibuja derecha); sin lienzo, igual sale limpia', async () => {
    assert.equal(HL.orientacionJpeg(new Uint8Array(jpegDe(6))), 6);
    assert.equal(HL.orientacionJpeg(new Uint8Array(jpegDe())), 1);
    assert.equal(HL.orientacionJpeg(new Uint8Array(Buffer.from(PNG, 'binary'))), 1);
    const r = await HL.prepararArchivo(new Blob([jpegDe(6)]));   // en Node no hay lienzo
    assert.equal(r.ok, true);
    PRIVADO.forEach(t => assert.equal(tiene(Buffer.from(r.archivo.base64, 'base64'), t), false, '«' + t + '»'));
  });

  test('PNG: solo los bloques que dibujan la imagen y su color; fuera eXIf, tEXt, iTXt, tIME y lo de después', async () => {
    const P = pngDe(IHDR, trozoPng('tEXt', 'Comment\0GPS 4.6097 -74.0817'), trozoPng('eXIf', 'MM\0*\0\0\0\x08 SM-A146M'),
      trozoPng('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>Screenshot</x:xmpmeta>'), trozoPng('tIME', '\x07\xea\x0a\x1c\x0c\0\0'),
      trozoPng('pHYs', '\0\0\x0b\x13\0\0\x0b\x13\x01'), trozoPng('IDAT', 'pixeles'), trozoPng('IEND', ''), 'basura de despues');
    const r = await HL.prepararArchivo(new Blob([P]));
    assert.equal(r.ok, true, JSON.stringify(r));
    const g = Buffer.from(r.archivo.base64, 'base64');
    ['GPS', 'SM-A146M', 'xmpmeta', 'tEXt', 'eXIf', 'iTXt', 'tIME', 'basura'].forEach(t => assert.equal(tiene(g, t), false, '«' + t + '»'));
    ['IHDR', 'pHYs', 'IDATpixeles', 'IEND'].forEach(t => assert.ok(tiene(g, t), 'se perdió «' + t + '»'));
    /* El que no trae nada sale idéntico: el texto de un pantallazo no se toca. */
    assert.equal((await HL.prepararArchivo(blob(PNG))).archivo.base64, Buffer.from(PNG, 'binary').toString('base64'));
  });

  test('WEBP: fuera los trozos EXIF y XMP y sus marcas en VP8X; el tamaño del RIFF se rehace', () => {
    const trozo = (cc, datos) => {
      const d = Buffer.from(datos, 'binary'), l = Buffer.alloc(4); l.writeUInt32LE(d.length);
      return Buffer.concat([Buffer.from(cc, 'binary'), l, d, Buffer.alloc(d.length % 2)]);
    };
    const cuerpo = Buffer.concat([Buffer.from('WEBP'), trozo('VP8X', '\x1c\0\0\0\x0f\0\0\x0f\0\0'), trozo('VP8L', 'pixeles webp'),
      trozo('EXIF', 'MM\0* GPS 4.6097 SM-A146M'), trozo('XMP ', '<x:xmpmeta/>')]);
    const l = Buffer.alloc(4); l.writeUInt32LE(cuerpo.length);
    const W = Buffer.concat([Buffer.from('RIFF'), l, cuerpo]);
    assert.equal(HL.tipoPorBytes(new Uint8Array(W)), 'webp');
    const g = Buffer.from(HL.limpiarMetadatos(new Uint8Array(W), 'webp'));
    ['GPS', 'SM-A146M', 'EXIF', 'XMP ', 'xmpmeta'].forEach(t => assert.equal(tiene(g, t), false, '«' + t + '»'));
    assert.ok(tiene(g, 'VP8X') && tiene(g, 'VP8L') && tiene(g, 'pixeles webp'), 'se perdió la imagen');
    assert.equal(g.readUInt32LE(4), g.length - 8, 'el tamaño del RIFF no es el de lo que queda');
    assert.equal(g[20], 0x10, 'VP8X sigue diciendo que trae EXIF o XMP (o perdió la transparencia)');
  });

  test('la imagen que no se deja leer por dentro, sin lienzo, NO se guarda (nunca sale con lo que traía)', async () => {
    const r = await HL.prepararArchivo(blob('\x89PNG\r\n\x1a\nesto no son bloques de PNG GPS 4.6097'));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'lectura');
    assert.equal(HL.limpiarMetadatos(new Uint8Array(Buffer.from('\xff\xd8\xff\xe1\x00', 'binary')), 'jpg'), null);
    /* El PDF no se toca: es el documento del fondo, y sus huellas dicen si alguien lo volvió a guardar. */
    assert.equal((await HL.prepararArchivo(blob(PDF))).archivo.base64, Buffer.from(PDF, 'binary').toString('base64'));
  });
});

/* Un teléfono de mentira: localStorage y un reloj; sin IndexedDB (la memoria
   de la página), que es justo el caso que la pantalla tiene que decir. */
function telefono(t0) {
  const datos = {}, reloj = { t: t0 || Date.UTC(2026, 10, 3, 15, 0, 0) };
  const ls = { getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); }, removeItem: k => { delete datos[k]; } };
  return { datos, reloj, g: HL.guardadero({ ls, idb: null, ahora: () => reloj.t }) };
}
const A = (tipo, s) => ({ tipo, bytes: Buffer.from(s).length, base64: Buffer.from(s).toString('base64'), sha256: 'h-' + s });

describe('el guardadero del registro', () => {
  test('lo escogido es de ESTE registro: otro intento u otro celular empiezan en blanco', () => {
    const { g } = telefono();
    const e = g.estado('i1', '3001112233');
    e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; g.guardarEstado(e);
    assert.deepEqual(g.estado('i1', '3001112233').fondos, ['porvenir']);
    assert.equal(g.estado('i2', '3001112233').aut, null, 'el registro de otro intento heredó la autorización');
    assert.equal(g.estado('i1', '3009998877').aut, null, 'otro celular heredó la autorización');
  });
  test('sobrevive a la pestaña que se vuelve a abrir (va en el teléfono), y se va a los 7 días', () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); e.pidio = { porvenir: 'y' }; t.g.guardarEstado(e);
    /* La «recarga»: un guardadero nuevo sobre el mismo almacén. */
    const g2 = HL.guardadero({ ls: { getItem: k => t.datos[k] || null, setItem() {}, removeItem() {} }, idb: null, ahora: () => t.reloj.t });
    assert.deepEqual(g2.estado('i1', '3001112233').pidio, { porvenir: 'y' });
    t.reloj.t += 8 * 864e5;
    assert.equal(t.g.estado('i1', '3001112233').aut, null);
  });
  test('los archivos: los topes, sin repetidos, quitar, y la cuenta sin esperar a IndexedDB', async () => {
    const { g } = telefono();
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); g.guardarEstado(e);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-uno'))).ok, true);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-uno'))).motivo, 'repetido');
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-dos'))).ok, true);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-tres'))).motivo, 'demasiados_pdf');
    assert.equal(g.hayArchivosGuardados('i1', '3001112233'), true);
    const r = await g.archivos('i1', '3001112233');
    assert.equal(r.lista.length, 2);
    await g.quitar('i1', '3001112233', r.lista[0].id);
    assert.equal((await g.archivos('i1', '3001112233')).lista.length, 1);
    /* Otro registro no los ve. */
    assert.equal((await g.archivos('i2', '3001112233')).lista.length, 0);
    assert.equal(await g.soloEnMemoria(), true, 'sin IndexedDB tiene que decir que es solo memoria');
  });
  test('soltar los archivos (salir del registro) deja lo escogido; olvidar (empezar de cero) se lleva todo', async () => {
    const { g } = telefono();
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); e.fondos = ['skandia']; g.guardarEstado(e);
    await g.agregar('i1', '3001112233', A('png', '\x89PNG\r\n\x1a\nuno'));
    await g.soltarArchivos();
    assert.equal((await g.archivos('i1', '3001112233')).lista.length, 0);
    assert.equal(g.hayArchivosGuardados('i1', '3001112233'), false);
    assert.deepEqual(g.estado('i1', '3001112233').fondos, ['skandia'], 'soltar los archivos se llevó lo escogido');
    await g.olvidar();
    assert.equal(g.estado('i1', '3001112233').aut, null);
  });
  test('los archivos caducan al día, y se dice que se perdieron', async () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); t.g.guardarEstado(e);
    await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-viejo'));
    t.reloj.t += 25 * 3600e3;
    const r = await t.g.archivos('i1', '3001112233');
    assert.deepEqual([r.lista.length, r.perdidos], [0, true]);
  });
  test('encolar: solo con la autorización, pasa a la cola de ESA cuenta y sale del registro', async () => {
    const t = telefono();
    /* Sin autorización: nada a la cola, y se suelta. */
    await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-x'));
    assert.equal(await t.g.encolar('i1', '3001112233'), false);
    assert.equal(await t.g.cola('3001112233'), null);
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['colpensiones', 'porvenir']; t.g.guardarEstado(e);
    await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-y'));
    assert.equal(await t.g.encolar('i1', '3001112233'), true);
    const c = await t.g.cola('3001112233');
    assert.deepEqual(c.fondos, ['colpensiones', 'porvenir']);
    assert.equal(c.archivos.length, 1);
    assert.equal(c.aut.version, HL.VERSION_AUTORIZACION);
    assert.equal(t.g.estado('i1', '3001112233').aut, null, 'lo escogido se quedó en el registro después de abrir la cuenta');
    assert.equal(await t.g.cola('3009998877'), null, 'otra cuenta ve la cola');
    t.reloj.t += 25 * 3600e3;
    assert.equal(await t.g.cola('3001112233'), null, 'la cola no caducó al día');
  });
});

/* 28-oct-2026 (arreglo de los leves, P7) — «CADUCAN AL DÍA» ERA PEREZOSO. La
   cola de una cuenta y los archivos de un registro solo se borraban si ESA
   cuenta (o ese registro) volvía a ese teléfono: en el prestado, la historia
   laboral de María (empleadores, salarios) se quedaba para siempre. Ahora
   play/ y app/socio.html barren al arrancar. Con el código de antes no había
   barrido (g.barrer no existía) y esto falla. Va contra un IndexedDB de
   mentira: la memoria de la página nace vacía en cada arranque, y probarla
   sería probar otra cosa. */
describe('lo vencido no se queda en el teléfono', () => {
  const { idbDeMentira } = require('./idb-de-mentira.js');
  const T0 = Date.UTC(2026, 10, 3, 15, 0, 0), HORA = 3600e3;
  const almacen = datos => ({ getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); }, removeItem: k => { delete datos[k]; } });

  test('al arrancar se barre toda cola y todo registro de más de un día, sea de quien sea; lo vigente se queda', async () => {
    const idb = idbDeMentira({
      'cola:3001112233': { celular: '3001112233', t: T0 - 25 * HORA, archivos: [{ id: 'a', base64: 'JVBERi0=' }] },   // María, en el teléfono de Beto
      'cola:3009998877': { celular: '3009998877', t: T0 - HORA, archivos: [{ id: 'b', base64: 'JVBERi0=' }] },       // vigente
      'cola:3005550000': { celular: '3001112233', t: T0, archivos: [] },                                               // no es de ese celular
      reg: { intento: 'i1', celular: '3001112233', t: T0 - 30 * HORA, archivos: [{ id: 'c', base64: 'JVBERi0=' }] },
      'otra-cosa': { t: 0 }                                                                                                // no es nuestra
    });
    const datos = { [HL.LLAVE_ESTADO]: JSON.stringify({ intento: 'i0', celular: '3000000000', t: T0 - 8 * 24 * HORA,
      aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {} }) };
    const g = HL.guardadero({ ls: almacen(datos), idb, ahora: () => T0 });
    const r = await g.barrer('i1', '3001112233');
    assert.deepEqual([...idb.datos.keys()].sort(), ['cola:3009998877', 'otra-cosa'], 'lo vencido se quedó en el teléfono');
    assert.deepEqual([r.borrados, r.perdidos], [3, true], 'no dijo que se perdieron los archivos de este registro');
    assert.equal(HL.LLAVE_ESTADO in datos, false, 'lo escogido de hace 8 días se quedó');
    /* Lo de otro registro no cuenta como «perdido» para este. */
    const idb2 = idbDeMentira({ reg: { intento: 'otro', celular: '3001112233', t: T0 - 30 * HORA, archivos: [{ id: 'x' }] } });
    assert.equal((await HL.guardadero({ ls: almacen({}), idb: idb2, ahora: () => T0 }).barrer('i1', '3001112233')).perdidos, false);
    assert.equal(idb2.datos.size, 0);
  });

  test('si la base dice que ya no hay autorización, la cola se borra entera y la pantalla NO dice «Lo volvemos a intentar»', async () => {
    const idb = idbDeMentira();
    const g = HL.guardadero({ ls: almacen({}), idb, ahora: () => T0 });
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; g.guardarEstado(e);
    await g.agregar('i1', '3001112233', A('pdf', '%PDF-a'));
    await g.agregar('i1', '3001112233', A('pdf', '%PDF-b'));
    await g.encolar('i1', '3001112233');
    const c = await g.cola('3001112233'); c.autorizada = true; await g.guardarCola('3001112233', c);   // ya había autorizado
    const r = await HL.subirCola(g, '3001112233', fn => Promise.resolve(fn === 'pension_subir' ? { ok: false, motivo: 'sin_autorizacion' } : { ok: true }));
    assert.equal(r.estado, 'retirada');
    assert.equal(await g.cola('3001112233'), null, 'la historia laboral de quien retiró su autorización se quedó en el teléfono');
    assert.equal(idb.datos.has('cola:3001112233'), false);
    const a = HL.avisoDeLaCola(r);
    assert.equal(/volvemos a intentar|alcanzó a subir/i.test(a.html), false, 'promete reintentar lo que ya no se va a subir: ' + a.html);
    assert.match(a.html, /tu autorización ya no está vigente\. La borramos de este teléfono\./);
  });
});

/* 28-oct-2026 (arreglo, ronda 1) — «📋 Pegar» guardaba lo que hubiera en el
   portapapeles en el mismo toque, sin enseñarlo (una foto de un chat quedaba
   como «Pantallazo»). Quien escoge un archivo lo ve en el selector del
   teléfono; quien pega, no. El paso de verdad (pasoDelRegistro) en una caja de
   mentira que guarda sus oyentes: con el código de antes, el primer toque ya
   dejaba el archivo en el teléfono y esta prueba falla. */
/* La caja del paso, de mentira, que guarda sus oyentes. 28-oct-2026 (segunda
   revisión, ronda 2) — sube aquí desde «📋 Pegar»: la usan también las de lo
   que va en camino, más abajo. */
function cajaDeMentira() {
  const oyentes = {};
  const caja = { innerHTML: '', contains: () => true, querySelectorAll: () => [],
    addEventListener: (t, f) => { (oyentes[t] = oyentes[t] || []).push(f); },
    ownerDocument: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } } };
  const toque = que => oyentes.click.forEach(f => f({ target: { closest: () => ({ getAttribute: k => (k === 'data-hl' ? que : null) }) } }));
  const pegarEnElRecuadro = f => oyentes.paste.forEach(o => o({ target: { closest: () => ({}) }, preventDefault() {},
    clipboardData: { items: [{ kind: 'file', type: f.type, getAsFile: () => f }], files: [], getData: () => '' } }));
  /* Escoger archivos en el selector del teléfono (el <input type=file>). */
  const escoger = files => oyentes.change.forEach(f => f({ target: { getAttribute: k => (k === 'data-hl' ? 'archivo' : null), files, value: '' } }));
  /* 28-oct-2026 (arreglador final) — marcar o desmarcar la casilla de la autorización. */
  const marcar = si => oyentes.change.forEach(f => f({ target: { getAttribute: k => (k === 'data-hl' ? 'aut' : null), checked: !!si } }));
  return { caja, toque, pegarEnElRecuadro, escoger, marcar };
}
describe('«📋 Pegar» enseña lo copiado y pregunta antes de guardarlo', () => {
  const { hasta } = require('./esperar.js');
  const COPIADO = pngDe(IHDR, trozoPng('IDAT', 'FOTO PRIVADA DE UN CHAT'), trozoPng('IEND', ''));
  /* 28-oct-2026 (arreglo de los leves, P10) — con la pregunta abierta,
     «Continuar» pasaba de paso y escoger un PDF o un pantallazo la cerraba:
     lo pegado se perdía sin una palabra. Ahora la pregunta espera, y
     «Continuar» se la recuerda. Con el código de antes, escoger el PDF tira lo
     pegado y puedeSeguir no existe: esto falla. */
  test('lo pegado sin contestar no se pierde callado: escoger un archivo no lo tira, y «Continuar» pregunta antes de seguir', async () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; t.g.guardarEstado(e);
    const antes = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: () => Promise.resolve([{ types: ['image/png'],
      getType: () => Promise.resolve(new Blob([COPIADO], { type: 'image/png' })) }]) } });
    try {
      const { caja, toque, escoger } = cajaDeMentira();
      const ctl = HL.pasoDelRegistro(caja, { guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t });
      const pregunta = () => /id="hlPegado"/.test(caja.innerHTML);
      const guardados = async () => (await t.g.archivos('i1', '3001112233')).lista;
      toque('pegar');
      assert.ok(await hasta(pregunta, 2000), 'lo pegado no se enseñó');
      /* Escoge el PDF con la pregunta abierta: el PDF entra, y la pregunta sigue ahí. */
      escoger([new Blob([Buffer.from(PDF, 'binary')], { type: 'application/pdf' })]);
      assert.ok(await hasta(() => /id="hlLista"[\s\S]*📄 PDF/.test(caja.innerHTML), 2000), 'el PDF no entró');
      assert.ok(pregunta(), 'escoger un archivo tiró lo pegado sin decir nada');
      assert.deepEqual((await guardados()).map(x => x.tipo), ['pdf'], 'lo pegado entró sin su «Sí»');
      /* «Continuar» con la pregunta abierta: no sigue, y lo dice debajo de la pregunta. */
      assert.equal(ctl.puedeSeguir(), false, '«Continuar» deja atrás lo pegado sin preguntar');
      const t1 = caja.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      assert.ok(t1.indexOf(HL.TEXTOS.pegadoPendiente) > 0, 'no le dice por qué no sigue');
      assert.ok(caja.innerHTML.indexOf('id="hlPegado"') < caja.innerHTML.indexOf('id="hlAviso"'), 'el aviso no va debajo de la pregunta');
      /* Contestó: ya puede seguir. */
      toque('pegado-no');
      assert.ok(await hasta(() => !pregunta(), 200));
      assert.equal(ctl.puedeSeguir(), true);
    } finally {
      if (antes) Object.defineProperty(navigator, 'clipboard', antes); else delete navigator.clipboard;
    }
  });
  test('en el registro: el botón y el recuadro enseñan lo copiado; solo «Sí, guardarla» lo deja en el teléfono', async () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; t.g.guardarEstado(e);
    const antes = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: () => Promise.resolve([{ types: ['image/png'],
      getType: () => Promise.resolve(new Blob([COPIADO], { type: 'image/png' })) }]) } });
    try {
      const { caja, toque, pegarEnElRecuadro } = cajaDeMentira();
      HL.pasoDelRegistro(caja, { guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t });
      const guardados = async () => (await t.g.archivos('i1', '3001112233')).lista;
      const pregunta = () => /id="hlPegado"/.test(caja.innerHTML);
      toque('pegar');
      /* Lo que pase primero: la pregunta, o la lista con lo ya guardado. */
      await hasta(() => pregunta() || /id="hlLista"/.test(caja.innerHTML), 2000);
      assert.equal((await guardados()).length, 0, 'un toque en «Pegar» guardó lo copiado sin preguntar');
      assert.ok(pregunta(), 'lo pegado no se enseñó');
      assert.match(caja.innerHTML, /<img class="hl-vista" data-hl-mini="pegado:0" alt="Lo que copiaste">/);
      assert.match(caja.innerHTML, /¿Es tu historia laboral\?/);
      assert.match(caja.innerHTML, /data-hl="pegado-si"[^>]*>Sí, guardarla</);
      assert.match(caja.innerHTML, /data-hl="pegado-no"[^>]*>No, no es esta</);
      /* «No»: nada se guarda, y se dice. */
      toque('pegado-no');
      assert.ok(await hasta(() => !pregunta(), 200));
      assert.equal((await guardados()).length, 0, '«No» guardó lo copiado');
      assert.match(caja.innerHTML, /Listo: no guardamos lo que copiaste\./);
      /* El recuadro de mantener presionado también pregunta. */
      pegarEnElRecuadro(new File([COPIADO], 'image.png', { type: 'image/png' }));
      await hasta(() => pregunta() || /id="hlLista"/.test(caja.innerHTML), 2000);
      assert.equal((await guardados()).length, 0, 'lo pegado en el recuadro se guardó sin preguntar');
      assert.ok(pregunta(), 'lo pegado en el recuadro no se enseñó');
      /* «Sí»: ahora sí, y la lista lo enseña con su miniatura. */
      toque('pegado-si');
      assert.ok(await hasta(() => !pregunta() && /id="hlLista"/.test(caja.innerHTML), 2000), '«Sí» no lo guardó');
      const l = await guardados();
      assert.equal(l.length, 1);
      assert.equal(l[0].base64, COPIADO.toString('base64'));
      assert.match(caja.innerHTML, new RegExp('<img class="hl-mini" data-hl-mini="lista:' + l[0].id + '"'), 'la lista no enseña lo guardado');
    } finally {
      if (antes) Object.defineProperty(navigator, 'clipboard', antes); else delete navigator.clipboard;
    }
  });
});

/* 28-oct-2026 (segunda revisión, ronda 2) — «LO HAGO DESPUÉS» NO ARMA SU
   LÍNEA CON ALGO EN CAMINO, Y PROMETE CON SU CONDICIÓN. Visto en Chrome sin
   ventana (Android de 412 px, CPU ×6): tres pantallazos pesados tardan 2,3 s
   en prepararse; tocado a los 1,5 s, «Lo hago después» decía «Tu autorización
   se guarda…» y al abrir la cuenta subían los tres. Lo mismo con «Continuar» y
   «Volver» a mitad (el paso montado otra vez no sabía de ellos). Y la línea
   con archivos los prometía sin la condición de la lista: 15 minutos en la
   app del banco y el arranque se los llevaba. Con el código de antes, las tres
   fallan. */
describe('«Lo hago después» dice lo que va a pasar con lo escogido', () => {
  const { hasta } = require('./esperar.js');
  const PANTALLAZO = pngDe(IHDR, trozoPng('IDAT', 'pantallazo de la historia laboral'), trozoPng('IEND', ''));
  /* Un archivo que tarda en leerse lo que la prueba diga: como un pantallazo
     pesado en un teléfono barato. */
  function lento(contenido) {
    let soltar;
    const listo = new Promise(r => { soltar = r; });
    const bytes = Uint8Array.from(contenido);
    return { blob: { name: 'Screenshot_20261028.png', arrayBuffer: () => listo.then(() => bytes.buffer) }, soltar: () => soltar() };
  }
  const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const despuesApagado = caja => /id="hlDespues" data-hl="despues" disabled/.test(caja.innerHTML);
  function autorizado() {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-10-30T15:00:00Z'); e.fondos = ['colpensiones']; t.g.guardarEstado(e);
    return t;
  }

  test('con archivos, la línea dice hasta cuándo esperan: la condición de la lista con los minutos de la regla, o la de la memoria', () => {
    const min = require('../app/escaner-cedula.js').MINUTOS_VUELTA_DE_LA_CAMARA;
    const aut = { version: HL.VERSION_AUTORIZACION };
    const con = plano(HL.pistaDespues({ aut, n: 2 }));
    assert.match(con, /^Tu autorización y 2 archivos se guardan con tu registro cuando toques «Abrir mi cuenta»\./);
    assert.ok(con.indexOf('si sales de esta página más de ' + min + ' minutos y el teléfono la cierra, se borran') > 0,
      'promete los archivos sin decir cuándo se borran: ' + con);
    /* La misma condición que dice la lista del paso. */
    const lista = plano(HL.pantallaHTML({ modo: 'registro', aut, fondos: ['porvenir'], pidio: {}, archivos: [{ id: 'a', tipo: 'pdf', bytes: 10 }] }));
    assert.ok(lista.indexOf('Si sales de esta página más de ' + min + ' minutos y el teléfono la cierra, se borran') >= 0);
    /* Si el teléfono no deja guardarlos, cualquier cierre se los lleva: eso, y no los minutos. */
    const mem = plano(HL.pistaDespues({ aut, n: 1, memoria: true }));
    assert.match(mem, /^Tu autorización y 1 archivo se guardan[^.]*\. Hasta entonces los archivos esperan en esta página: este teléfono no deja guardarlos, y si la página se cierra tendrás que escogerlos otra vez\./);
    assert.equal(/minutos/.test(mem), false, mem);
    /* Sin archivos no hay nada que se borre; sin autorización, como antes. */
    assert.equal(/se borran|esperan en/.test(plano(HL.pistaDespues({ aut, n: 0 }))), false);
    assert.match(plano(HL.pistaDespues({ aut: null, n: 2 })), /^Lo dejaste para después\./);
  });

  test('mientras se prepara lo escogido, «Lo hago después» está apagado y su toque no arma la línea; al terminar, sí, y ya lo cuenta', async () => {
    const t = autorizado();
    const { caja, toque, escoger } = cajaDeMentira();
    let despues = 0;
    HL.pasoDelRegistro(caja, { guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t, despues: () => { despues++; } });
    await hasta(() => /id="hlDespues"/.test(caja.innerHTML), 50);
    assert.equal(despuesApagado(caja), false, 'sin nada en camino, «Lo hago después» nace apagado');
    const p = lento(PANTALLAZO);
    escoger([p.blob]);
    assert.ok(despuesApagado(caja), '«Lo hago después» sigue suelto mientras se prepara el pantallazo');
    toque('despues');
    assert.equal(despues, 0, 'el toque armó la línea con el pantallazo todavía en camino');
    p.soltar();
    assert.ok(await hasta(() => /id="hlLista"/.test(caja.innerHTML) && !despuesApagado(caja), 2000), 'al terminar no soltó el botón');
    assert.equal(t.g.hayArchivosGuardados('i1', '3001112233'), true);
    toque('despues');
    assert.equal(despues, 1);
  });

  test('«Continuar» y «Volver» a mitad: el paso que se monta otra vez espera lo que va en camino, lo dice, y al terminar lo enseña', async () => {
    const t = autorizado();
    const A1 = cajaDeMentira();
    HL.pasoDelRegistro(A1.caja, { guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t });
    const p = lento(PANTALLAZO);
    A1.escoger([p.blob]);
    assert.equal(t.g.enCamino(), true, 'el guardadero no sabe lo que va en camino');
    /* «Continuar» y «Volver»: el mismo paso, montado otra vez en otra caja, con el mismo guardadero. */
    const B1 = cajaDeMentira();
    let despues = 0;
    HL.pasoDelRegistro(B1.caja, { guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t, despues: () => { despues++; } });
    assert.ok(despuesApagado(B1.caja), 'el paso montado otra vez deja «Lo hago después» suelto con el pantallazo en camino');
    assert.ok(plano(B1.caja.innerHTML).indexOf(HL.TEXTOS.terminando) >= 0, 'no dice por qué espera');
    B1.toque('despues');
    assert.equal(despues, 0, 'armó la línea sin el pantallazo que venía');
    p.soltar();
    assert.ok(await hasta(() => /id="hlLista"/.test(B1.caja.innerHTML) && !despuesApagado(B1.caja), 2000), 'el paso montado otra vez no enseña lo que llegó');
    assert.equal(plano(B1.caja.innerHTML).indexOf(HL.TEXTOS.terminando), -1, 'el «Un momento» se quedó pegado');
    assert.equal(t.g.enCamino(), false);
    B1.toque('despues');
    assert.equal(despues, 1);
    /* Y lo que la línea va a contar es lo que de verdad espera. */
    assert.equal(t.g.estado('i1', '3001112233').archivos_n, 1);
  });
});

/* 28-oct-2026 (arreglador final, G1 de la ronda 3) — LO QUE SE CUENTA ES LO
   QUE SUBE. Un Android casi sin espacio guardó el PDF y no el pantallazo (la
   lista entera se reescribe, y con el segundo ya no cabía): la escritura
   falló y la lista buena quedó en la memoria de la página, pero la lectura
   prefería la copia de IndexedDB, vieja. La lista enseñaba 1 sin aviso, la
   línea de «Lo hago después» decía 2 (archivos_n, anotado antes de escribir)
   y al abrir la cuenta subía 1. Visto en Chrome sin ventana. Con el código de
   antes esto falla. */
describe('G1: la lista, la línea y la cola cuentan lo mismo aunque el teléfono no deje guardar', () => {
  const { idbDeMentira } = require('./idb-de-mentira.js');
  const T0 = Date.UTC(2026, 9, 30, 15, 0, 0);
  const almacen = datos => ({ getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); }, removeItem: k => { delete datos[k]; } });
  test('el segundo archivo no cabe en IndexedDB: los dos siguen en la página, la lista los enseña y la cola sube los dos', async () => {
    const idb = idbDeMentira({}, { fallaPut: (k, v) => k === 'reg' && !!(v && v.archivos && v.archivos.length >= 2) });
    const g = HL.guardadero({ ls: almacen({}), idb, ahora: () => T0 });
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-10-30T15:00:00Z'); e.fondos = ['porvenir']; g.guardarEstado(e);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-cabe'))).ok, true);
    assert.equal((await g.agregar('i1', '3001112233', A('png', '\x89PNG\r\n\x1a\nno-cabe'))).ok, true);
    assert.equal(idb.datos.get('reg').archivos.length, 1, 'la prueba no prueba nada: el teléfono sí guardó el segundo');
    const r = await g.archivos('i1', '3001112233');
    assert.deepEqual(r.lista.map(x => x.tipo), ['pdf', 'png'], 'la lista lee la copia vieja de IndexedDB y pierde el pantallazo sin decirlo');
    assert.equal(g.enMemoria(), true, 'no sabe que la lista vive en la memoria de la página');
    assert.equal(await g.soloEnMemoria(), true, 'la lista no diría la condición de la memoria');
    assert.equal(await g.encolar('i1', '3001112233'), true);
    assert.equal((await g.cola('3001112233')).archivos.length, 2, 'la cola sube menos de lo que la lista enseñó');
  });
  test('si lo que falla es soltarlos, la página no los vuelve a leer de la copia vieja', async () => {
    let romper = false;
    const idb = idbDeMentira({}, { fallaDelete: () => romper });
    const g = HL.guardadero({ ls: almacen({}), idb, ahora: () => T0 });
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-10-30T15:00:00Z'); g.guardarEstado(e);
    await g.agregar('i1', '3001112233', A('pdf', '%PDF-uno'));
    romper = true;   // el teléfono deja de dejar escribir: soltar no alcanza a borrar
    await g.soltarArchivos();
    assert.ok(idb.datos.has('reg'), 'la prueba no prueba nada: el borrado sí se hizo');
    assert.equal((await g.archivos('i1', '3001112233')).lista.length, 0, 'lo soltado vuelve a aparecer desde la copia vieja');
  });
});

/* 28-oct-2026 (arreglador final, ronda 3) — LO QUE SE HACE A MITAD DEL PASO.
   Cuatro caminos vistos en Chrome sin ventana (Android de 412 px, CPU ×6),
   cada uno con su prueba; con el código de antes, todas fallan:
     L1 · «Lo hago después» con la pregunta «¿Es tu historia laboral?» abierta
          pasaba al paso 9 y lo pegado se perdía sin su «No»; «Continuar» sí
          preguntaba (P10).
     ·    Lo pegado que todavía se está mirando: «Continuar» pasaba, el paso
          montado otra vez decía «estamos terminando con los archivos que
          escogiste…» y después no enseñaba nada.
     L2 · Un archivo cuya lectura no termina nunca (la nube del teléfono que no
          lo baja): el paso montado otra vez se quedaba para siempre en «Un
          momento…» con los botones apagados.
     L3 · «Abrir mi cuenta» con pantallazos todavía preparándose: no subían, y
          quedaban huérfanos en el IndexedDB del teléfono.
     L4 · Desmarcar la autorización con cinco preparándose: «Primero marca la
          autorización de arriba. (y 4 más)». */
describe('lo que se hace a mitad del paso (ronda 3)', () => {
  const { hasta } = require('./esperar.js');
  const { idbDeMentira } = require('./idb-de-mentira.js');
  const PANTALLAZO = pngDe(IHDR, trozoPng('IDAT', 'pantallazo de la historia laboral'), trozoPng('IEND', ''));
  const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const despuesApagado = caja => /id="hlDespues" data-hl="despues" disabled/.test(caja.innerHTML);
  /* Un archivo que tarda lo que la prueba diga (o no termina nunca). */
  function lento(contenido, nombre) {
    let soltar;
    const listo = new Promise(r => { soltar = r; });
    const bytes = Uint8Array.from(contenido);
    return { blob: { name: nombre || 'Screenshot_20261028.png', arrayBuffer: () => listo.then(() => bytes.buffer) }, soltar: () => soltar() };
  }
  const colgado = () => ({ name: 'colgado.png', arrayBuffer: () => new Promise(() => {}) });
  function autorizado(idb) {
    const datos = {}, reloj = { t: Date.UTC(2026, 9, 30, 15, 0, 0) };
    const ls = { getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); }, removeItem: k => { delete datos[k]; } };
    const g = HL.guardadero({ ls, idb: idb || null, ahora: () => reloj.t });
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-10-30T15:00:00Z'); e.fondos = ['colpensiones']; g.guardarEstado(e);
    return { g, reloj };
  }
  const paso = (t, caja, mas) => HL.pasoDelRegistro(caja, Object.assign({ guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t }, mas || {}));

  test('L1 · «Lo hago después» con lo pegado esperando su respuesta no pasa: pregunta, como «Continuar»', async () => {
    const t = autorizado();
    const { caja, toque } = cajaDeMentira();
    let despues = 0;
    const ctl = paso(t, caja, { despues: () => { despues++; } });
    await hasta(() => /id="hlDespues"/.test(caja.innerHTML), 50);
    ctl.vm.pegado = { listos: [{ tipo: 'png', bytes: PANTALLAZO.length, base64: PANTALLAZO.toString('base64'), sha256: '' }], malos: [] };
    ctl.pintar();
    toque('despues');
    assert.equal(despues, 0, '«Lo hago después» dejó atrás lo pegado sin su «No»');
    assert.ok(plano(caja.innerHTML).indexOf(HL.TEXTOS.pegadoPendiente) >= 0, 'no le dice por qué no sigue');
    toque('pegado-no');
    assert.ok(await hasta(() => !/id="hlPegado"/.test(caja.innerHTML), 200));
    toque('despues');
    assert.equal(despues, 1, 'ya contestó y «Lo hago después» no pasa');
  });

  test('mientras se mira lo pegado, «Continuar» espera: lo pegado aparece en este paso y pregunta', async () => {
    const t = autorizado();
    const p = lento(PANTALLAZO, 'image.png');
    const antes = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: () => Promise.resolve([{ types: ['image/png'], getType: () => Promise.resolve(p.blob) }]) } });
    try {
      const { caja, toque } = cajaDeMentira();
      const ctl = paso(t, caja);
      toque('pegar');
      assert.ok(await hasta(() => /Mirando lo que copiaste/.test(caja.innerHTML), 200), 'no empezó a mirar lo copiado');
      assert.equal(ctl.puedeSeguir(), false, '«Continuar» deja atrás lo que se está mirando');
      assert.ok(plano(caja.innerHTML).indexOf(HL.TEXTOS.mirandoPegado) >= 0, 'no dice por qué espera');
      p.soltar();
      assert.ok(await hasta(() => /id="hlPegado"/.test(caja.innerHTML), 2000), 'lo pegado no se enseñó');
      assert.equal(ctl.puedeSeguir(), false, 'con la pregunta abierta, sigue preguntando');
      toque('pegado-no');
      assert.ok(await hasta(() => !/id="hlPegado"/.test(caja.innerHTML), 200));
      assert.equal(ctl.puedeSeguir(), true);
    } finally {
      if (antes) Object.defineProperty(navigator, 'clipboard', antes); else delete navigator.clipboard;
    }
  });

  /* El tope va en milisegundos de verdad (msTope): `hasta` cuenta vueltas, no tiempo. */
  const esperarMs = ms => new Promise(r => setTimeout(r, ms));
  test('L2 · un archivo que no termina de leerse: al tope, el paso montado otra vez sigue sin él y lo dice', async () => {
    const t = autorizado();
    const A1 = cajaDeMentira();
    paso(t, A1.caja, { msTope: 40 });
    A1.escoger([colgado()]);
    assert.equal(t.g.enCamino(), true, 'el guardadero no sabe lo que va en camino');
    /* «Continuar» y «Volver»: el mismo paso, montado otra vez. */
    const B1 = cajaDeMentira();
    let despues = 0;
    paso(t, B1.caja, { msTope: 40, despues: () => { despues++; } });
    assert.ok(despuesApagado(B1.caja) && plano(B1.caja.innerHTML).indexOf(HL.TEXTOS.terminando) >= 0, 'no nació esperando');
    await esperarMs(120);
    assert.ok(await hasta(() => !despuesApagado(B1.caja), 200), 'el paso montado otra vez se quedó en «Un momento…» para siempre');
    const dice = plano(B1.caja.innerHTML);
    assert.equal(dice.indexOf(HL.TEXTOS.terminando), -1, 'el «Un momento» se quedó pegado');
    assert.ok(dice.indexOf(HL.MOTIVOS.tardo) >= 0, 'no dice que siguió sin ese archivo: ' + dice.slice(0, 400));
    assert.equal(t.g.enCamino(), false);
    assert.equal((await t.g.archivos('i1', '3001112233')).lista.length, 0);
    B1.toque('despues');
    assert.equal(despues, 1, '«Lo hago después» no se soltó');
    /* Y la pantalla de donde salió el archivo también lo dice, si sigue a la vista. */
    assert.ok(plano(A1.caja.innerHTML).indexOf(HL.MOTIVOS.tardo) >= 0);
  });

  test('L3 · «Abrir mi cuenta» con un pantallazo todavía preparándose: la cola lo espera y lo sube, y nada queda huérfano', async () => {
    const idb = idbDeMentira();
    const t = autorizado(idb);
    const A1 = cajaDeMentira();
    paso(t, A1.caja);
    const p = lento(PANTALLAZO);
    A1.escoger([p.blob]);
    assert.equal(t.g.enCamino(), true, 'la prueba no prueba nada: no hay nada en camino');
    /* «Abrir mi cuenta» salió bien con el pantallazo todavía en camino. */
    const encolado = t.g.encolar('i1', '3001112233');
    await hasta(() => false, 20);
    p.soltar();
    assert.equal(await encolado, true);
    const c = await t.g.cola('3001112233');
    assert.equal(c && c.archivos.length, 1, 'el pantallazo que se preparaba no quedó en la cola: no sube');
    assert.ok(await hasta(() => !idb.datos.has('reg'), 200), 'quedó huérfano en el IndexedDB del teléfono');
    /* Y un archivo que llegara después de abrir la cuenta ya no tiene registro al que entrar. */
    assert.equal((await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-tarde'))).ok, false, 'después de abrir la cuenta, lo que llega tarde se guarda igual');
    await hasta(() => false, 20);
    assert.equal(idb.datos.has('reg'), false, 'lo que llegó tarde quedó huérfano en el teléfono');
  });

  test('L4 · desmarcar la autorización con tres preparándose: un solo aviso, limpio, y nada queda en el teléfono', async () => {
    const t = autorizado();
    const { caja, escoger, marcar } = cajaDeMentira();
    paso(t, caja);
    const ps = ['a.png', 'b.png', 'c.png'].map(n => lento(PANTALLAZO, n));
    escoger(ps.map(p => p.blob));
    marcar(false);   // cambió de idea con los tres en camino
    await hasta(() => false, 20);
    ps.forEach(p => p.soltar());
    assert.ok(await hasta(() => !despuesApagado(caja) && plano(caja.innerHTML).indexOf(HL.MOTIVOS.desautorizado) >= 0, 2000),
      'no dijo qué pasó con lo que se preparaba: ' + plano(caja.innerHTML).slice(0, 300));
    const dice = plano(caja.innerHTML);
    assert.equal(/\(y \d+ más\)/.test(dice), false, 'el aviso se repite: ' + dice);
    assert.equal(dice.split(HL.MOTIVOS.desautorizado).length - 1, 1);
    assert.equal(dice.indexOf(HL.MOTIVOS.sin_autorizacion), -1, 'le pide marcar la autorización que acaba de quitar');
    assert.equal((await t.g.archivos('i1', '3001112233')).lista.length, 0);
  });

  test('L4 · desmarcar en el paso montado otra vez: lo que venía del paso viejo tampoco se guarda, y se dice', async () => {
    const t = autorizado();
    const A1 = cajaDeMentira();
    paso(t, A1.caja);
    const p = lento(PANTALLAZO);
    A1.escoger([p.blob]);
    const B1 = cajaDeMentira();
    paso(t, B1.caja);
    B1.marcar(false);
    p.soltar();
    assert.ok(await hasta(() => !t.g.enCamino() && !despuesApagado(B1.caja), 2000));
    await hasta(() => false, 20);
    assert.equal((await t.g.archivos('i1', '3001112233')).lista.length, 0, 'lo del paso viejo se guardó con la autorización ya quitada');
    assert.ok(plano(B1.caja.innerHTML).indexOf(HL.MOTIVOS.desautorizado) >= 0, 'el paso montado otra vez no dice que no se guardó: ' + plano(B1.caja.innerHTML).slice(0, 300));
  });
});

describe('la subida de la cola, con la sesión de la cuenta', () => {
  const preparar = async archivos => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; t.g.guardarEstado(e);
    for (const a of archivos) await t.g.agregar('i1', '3001112233', a);
    await t.g.encolar('i1', '3001112233');
    return t;
  };
  test('la autorización primero, después cada archivo de uno en uno; todo llegó y la cola se va', async () => {
    const t = await preparar([A('pdf', '%PDF-a'), A('png', '\x89PNG\r\n\x1a\nb')]);
    const llamadas = [];
    const r = await HL.subirCola(t.g, '3001112233', (fn, c) => { llamadas.push([fn, c]); return Promise.resolve({ ok: true }); });
    assert.deepEqual(llamadas.map(x => x[0]), ['pension_autorizar', 'pension_subir', 'pension_subir']);
    assert.deepEqual(llamadas[0][1], { p_fondos: ['porvenir'], p_version: '2026-10-30', p_momento: '2026-11-03T15:00:00Z' });
    assert.deepEqual([r.estado, r.subidos, r.total], ['ok', 2, 2]);
    assert.equal(await t.g.cola('3001112233'), null);
    assert.match(HL.avisoDeLaCola(r).html, /Tu historia laboral llegó/);
  });
  test('sin archivos (lo dejó para después): la autorización y el fondo llegan igual', async () => {
    const t = await preparar([]);
    const r = await HL.subirCola(t.g, '3001112233', () => Promise.resolve({ ok: true }));
    assert.deepEqual([r.estado, r.subidos], ['ok', 0]);
    assert.match(HL.avisoDeLaCola(r).html, /Guardamos tu autorización y tu fondo \(Porvenir\)\./);
  });
  /* 28-oct-2026 (arreglo de los leves, P2) — decía «Guardamos tu autorización
     y tu fondo» aunque no hubiera fondo, y también a quien dijo «Nunca he
     cotizado», con «súbela desde tu cuenta» de remate. Con el código de antes
     las cuatro primeras fallan. */
  test('lo que se guardó sin archivos se dice como fue: sin fondo, «No sé», «Nunca he cotizado», uno o dos fondos', async () => {
    const aviso = fondos => HL.avisoDeLaCola({ estado: 'ok', subidos: 0, rechazados: [], total: 0, pendientes: 0, fondos }).html.replace(/<[^>]+>/g, '');
    const sin = aviso([]);
    assert.equal(/tu fondo|tus fondos/.test(sin), false, 'sin fondo, dice que guardó su fondo: ' + sin);
    assert.match(sin, /^Guardamos tu autorización\. Cuando tengas tu historia laboral, súbela desde tu cuenta en la app\.$/);
    const nunca = aviso(['nunca']);
    assert.match(nunca, /^Guardamos tu autorización y que nunca has cotizado\. No tienes que subirnos nada\.$/);
    assert.equal(/súbela|tu fondo/.test(nunca), false, 'a quien nunca cotizó le pide subir su historia laboral: ' + nunca);
    const noSe = aviso(['no_se']);
    assert.equal(/tu fondo \(|tus fondos/.test(noSe), false, noSe);
    assert.match(noSe, /Cuando sepas en qué fondo estás/);
    assert.match(aviso(['colpensiones', 'porvenir']), /Guardamos tu autorización y tus fondos \(Colpensiones y Porvenir\)\./);
    /* Y lo que manda es lo que quedó en la base: si no aceptó los fondos, se autorizó sin fondo. */
    const t = await preparar([]);
    const r = await HL.subirCola(t.g, '3001112233', (fn, c) => Promise.resolve(c.p_fondos && c.p_fondos.length ? { ok: false, motivo: 'fondos' } : { ok: true }));
    assert.deepEqual(r.fondos, []);
    assert.equal(/tu fondo/.test(HL.avisoDeLaCola(r).html), false);
  });
  test('«Nunca he cotizado» en la cuenta no le dice a nadie «sigue con tu registro»', () => {
    const como = modo => HL.pantallaHTML({ modo, aut: { version: '2026-11-03' }, fondos: ['nunca'], pidio: {}, archivos: [] })
      .match(/data-hl-como="nunca"[\s\S]*?<\/div>/)[0];
    assert.match(como('registro'), /sigue con tu registro/);
    assert.equal(/registro/.test(como('cuenta')), false, 'la tarjeta de la cuenta habla de un registro que ya terminó');
    assert.match(como('cuenta'), /No pasa nada: no tienes que subirnos nada\. Tus solicitudes siguen igual\./);
  });
  test('la señal se cae a mitad: lo que subió no se repite, lo demás espera', async () => {
    const t = await preparar([A('pdf', '%PDF-a'), A('pdf', '%PDF-b')]);
    let n = 0;
    const r = await HL.subirCola(t.g, '3001112233', fn => {
      if (fn === 'pension_subir' && ++n === 2) return Promise.reject(new Error('sin señal'));
      return Promise.resolve({ ok: true });
    });
    assert.deepEqual([r.estado, r.subidos, r.pendientes], ['sin_red', 1, 1]);
    const c = await t.g.cola('3001112233');
    assert.equal(c.archivos.length, 1);
    assert.equal(c.autorizada, true, 'la autorización se repetiría');
    const llamadas = [];
    const r2 = await HL.subirCola(t.g, '3001112233', fn => { llamadas.push(fn); return Promise.resolve({ ok: true }); });
    assert.deepEqual(llamadas, ['pension_subir']);
    assert.equal(r2.estado, 'ok');
  });
  test('lo que la base no acepta no se reintenta, y se dice; sin la función (404), se queda en el teléfono', async () => {
    const t = await preparar([A('pdf', '%PDF-a')]);
    const r = await HL.subirCola(t.g, '3001112233', fn => Promise.resolve(fn === 'pension_subir' ? { ok: false, motivo: 'tipo_no_permitido' } : { ok: true }));
    assert.deepEqual([r.estado, r.subidos, r.rechazados.length], ['ok', 0, 1]);
    assert.match(HL.avisoDeLaCola(r).html, /no entró/);
    const t2 = await preparar([A('pdf', '%PDF-a')]);
    const r2 = await HL.subirCola(t2.g, '3001112233', () => Promise.reject(Object.assign(new Error('http 404'), { status: 404 })));
    assert.equal(r2.estado, 'apagado');
    assert.ok(await t2.g.cola('3001112233'), 'con la base sin la migración, la cola se perdió');
    assert.match(HL.avisoDeLaCola(r2).html, /todavía no está encendida/);
    /* 28-oct-2026 (arreglo de los leves, P13) — y sin mandarla a una tarjeta
       que con la base así no aparece; dice lo que de verdad pasa después. */
    assert.equal(/desde tu cuenta|súbela/.test(HL.avisoDeLaCola(r2).html), false, 'promete la tarjeta de la cuenta, que con la base sin la migración no aparece');
    assert.match(HL.avisoDeLaCola(r2).html, /hasta mañana; después se borra de este teléfono\./);
    const r3 = await HL.subirCola(t2.g, '3001112233', () => Promise.reject(Object.assign(new Error('http 401'), { status: 401 })));
    assert.equal(r3.estado, 'sesion');
  });
  /* 28-oct-2026 (arreglo, ronda 2) — el cortacircuito de pension_subir
     (base/20261103, el reparto de los 500 MB) contesta «lleno». Ese archivo
     no tiene nada malo y la base puede volver a tener espacio: no se tira,
     espera en la cola como con el freno. Y la pantalla dice lo que pasó: con
     el código de antes caía en 'sin_red' («no alcanzó a subir»), culpando a
     la señal, y la app decía «No pudimos guardar ese archivo». */
  test('la base llena (el cortacircuito): no se pierde nada, espera en la cola, y se dice sin culpar a la señal', async () => {
    const t = await preparar([A('pdf', '%PDF-a'), A('png', '\x89PNG\r\n\x1a\nb')]);
    const r = await HL.subirCola(t.g, '3001112233', fn => Promise.resolve(fn === 'pension_subir' ? { ok: false, motivo: 'lleno' } : { ok: true }));
    assert.deepEqual([r.estado, r.subidos, r.rechazados.length, r.pendientes], ['lleno', 0, 0, 2]);
    const c = await t.g.cola('3001112233');
    assert.equal(c && c.archivos.length, 2, 'con la base llena, la cola tiró los archivos');
    assert.equal(c.autorizada, true);
    const a = HL.avisoDeLaCola(r);
    assert.equal(a.clase, 'ambar');
    assert.match(a.html, /se quedó en este teléfono:<\/b> ahora mismo no podemos recibir más historias laborales\. Es opcional: tu cuenta sigue igual\./);
    assert.match(a.html, /Lo volvemos a intentar cuando entres a tu cuenta/);
    assert.equal(/alcanzó a subir|conexión|señal/.test(a.html), false, 'culpa a la señal de lo que es la base llena');
    /* En la app, lo mismo con sus palabras; y nunca «mándala por el chat»: allá no la cubren estas reglas. */
    const m = HL.motivoEnPalabras('lleno');
    assert.equal(m, HL.MOTIVOS.lleno);
    assert.match(m, /no podemos recibir más historias laborales\. Es opcional: tu cuenta y tus solicitudes siguen igual/);
    assert.equal(/chat|conexión|internet/.test(m), false);
  });
  test('cada «no» que contesta pension_subir tiene sus palabras en la pantalla (ninguno cae en el genérico)', () => {
    const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'base', '20261103_el_fondo_de_pensiones.sql'), 'utf8')
      .replace(/--[^\n]*/g, '');
    const cuerpo = sql.split(/create or replace function public\.pension_subir/)[1].split(/create or replace function/)[0];
    const motivos = [...new Set([...cuerpo.matchAll(/'motivo', '([a-z_]+)'/g)].map(x => x[1]))];
    assert.ok(motivos.includes('lleno') && motivos.includes('sin_espacio'), 'no leí los motivos de pension_subir: ' + motivos);
    motivos.forEach(k => assert.ok(HL.MOTIVOS[k], 'la base contesta «' + k + '» y la pantalla no tiene cómo decirlo'));
  });
  test('si la base no aceptara los fondos, autoriza sin fondo en vez de reintentar hasta que caduque', async () => {
    const t = await preparar([]);
    const pedidos = [];
    const r = await HL.subirCola(t.g, '3001112233', (fn, c) => {
      pedidos.push(c.p_fondos);
      return Promise.resolve(c.p_fondos.length ? { ok: false, motivo: 'fondos' } : { ok: true });
    });
    assert.deepEqual(pedidos, [['porvenir'], []]);
    assert.equal(r.estado, 'ok');
  });
});

describe('la llamada con el token de la sesión (la app)', () => {
  test('con el token de la sesión, nunca con la llave pública sola; el 404 se distingue', async () => {
    let visto = null;
    const f = (url, o) => { visto = { url, o }; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') }); };
    const j = await HL.llamarConToken({ url: 'https://x.supabase.co/', anon: 'llave', token: 'tok' }, 'pension_mia', {}, f);
    assert.deepEqual(j, { ok: true });
    assert.equal(visto.url, 'https://x.supabase.co/rest/v1/rpc/pension_mia');
    assert.equal(visto.o.headers.Authorization, 'Bearer tok');
    await assert.rejects(HL.llamarConToken({ url: 'u', anon: 'a', token: '' }, 'pension_mia', {}, f), e => e.sinSesion === true);
    const f404 = () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    await assert.rejects(HL.llamarConToken({ url: 'u', anon: 'a', token: 't' }, 'pension_mia', {}, f404), e => e.status === 404);
  });
});
