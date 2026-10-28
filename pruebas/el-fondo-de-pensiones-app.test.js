/* ============================================================================
 * «TU HISTORIA LABORAL» EN LA APP DEL CLIENTE — 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones-app.test.js
 *
 * El «Lo hago después» del registro tiene que existir de verdad: es la tarjeta
 * de app/socio.html, en la espera de quien todavía no está junto a su
 * historial y en Inicio. Con su sesión, y solo con ella: cada cosa sale con
 * SU token. Si la base no tiene las funciones (404), la tarjeta no aparece.
 * Y la casilla del registro promete «puedo quitarla desde mi cuenta en la
 * app»: aquí se quita.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirSocio } = require('./banco-socio.js');
const { asentar, hasta } = require('./esperar.js');

const AHORA = Date.parse('2026-11-03T15:00:00Z');
const SESION = JSON.stringify({ access_token: 'token-de-ana', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222' });
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PAQUETE = { garantia: { total: 145000, acumulada: 145000 }, creditos: [], respaldados: [],
  socio: { codigo: 'CL-0007' }, perfil: { datos: {} }, referidos: { total: 0, pagaron: 0, lista: [] } };

/* Una nube de mentira: la cuenta (junta o no), el chat callado, y lo del fondo. */
function nube(o) {
  o = o || {};
  const mia = { ok: true, autorizacion: o.autorizacion || null, archivos: o.archivos || [] };
  return (url, cuerpo) => {
    if (/rpc\/mi_cuenta$/.test(url)) return o.junta
      ? { status: 200, cuerpo: { ok: true, vinculada: true, nombre: 'Ana Prueba', datos: PAQUETE, actualizado_en: '2026-11-03T14:00:00Z' } }
      : { status: 200, cuerpo: { ok: true, vinculada: false } };
    if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-11-03T14:55:00Z' } } };
    if (/rpc\/chat_/.test(url)) return { status: 200, cuerpo: { ok: true, mensajes: [], servicio: 0, cobranza: 0, creditos: 0, total: 0 } };
    if (/rpc\/pension_/.test(url) && o.apagado) return { status: 404, cuerpo: { message: 'no existe' } };
    if (/rpc\/pension_mia$/.test(url)) return { status: 200, cuerpo: mia };
    if (/rpc\/pension_autorizar$/.test(url)) {
      /* Como la base (P6): sin versión solo cambia el fondo de una autorización vigente. */
      if (cuerpo.p_version == null) {
        if (!mia.autorizacion || mia.autorizacion.revocada_en) return { status: 200, cuerpo: { ok: false, motivo: 'sin_autorizacion' } };
        mia.autorizacion.fondos = cuerpo.p_fondos;
        return { status: 200, cuerpo: { ok: true, fondos: cuerpo.p_fondos, version: mia.autorizacion.version } };
      }
      mia.autorizacion = { fondos: cuerpo.p_fondos, version: cuerpo.p_version, recibida_en: '2026-11-03T15:00:00Z', revocada_en: null };
      return { status: 200, cuerpo: { ok: true, fondos: cuerpo.p_fondos } };
    }
    if (/rpc\/pension_retirar$/.test(url)) {
      const n = mia.archivos.length; mia.archivos = [];
      if (mia.autorizacion) { mia.autorizacion.revocada_en = '2026-11-03T15:05:00Z'; mia.autorizacion.fondos = []; }
      return { status: 200, cuerpo: { ok: true, borrados: n } };
    }
    if (/rpc\/pension_quitar$/.test(url)) { mia.archivos = mia.archivos.filter(a => a.id !== cuerpo.p_id); return { status: 200, cuerpo: { ok: true, borrados: 1 } }; }
    if (/rpc\/pension_subir$/.test(url)) {
      const id = 900 + mia.archivos.length, n = Buffer.from(cuerpo.p_archivo, 'base64').length;
      mia.archivos.push({ id, tipo: 'png', bytes: n, creado_en: '2026-11-03T15:01:00Z' });
      return { status: 200, cuerpo: { ok: true, id, tipo: 'png', bytes: n } };
    }
    return { status: 404, cuerpo: {} };
  };
}
const pension = A => A.llamadas.filter(l => /rpc\/pension_/.test(l.url));
const cambio = (A, que, valor, archivos) => A.elem('hlCuerpo')._oyentes.change.forEach(f => f({ target: {
  getAttribute: k => (k === 'data-hl' ? que : null), checked: valor === true, value: valor, files: archivos || [] } }));
/* Un PNG con sus bloques bien formados (los CRC en cero: nadie los mira). */
const trozoPng = (tipo, datos) => {
  const d = Buffer.from(datos, 'binary'), l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  return Buffer.concat([l, Buffer.from(tipo, 'binary'), d, Buffer.alloc(4)]);
};
const pngDe = pixeles => Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), trozoPng('IHDR', '\0\0\0\x10\0\0\0\x10\x08\x02\0\0\0'),
  trozoPng('IDAT', pixeles), trozoPng('IEND', '')]);

describe('dónde aparece', () => {
  test('en la espera (todavía no está junto a su historial), con «Subirla»; pide lo suyo con SU sesión', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube() });
    await asentar(30);
    assert.match(A.elem('entrarCuerpo').innerHTML, /<div id="hlCuenta"><\/div>/);
    const t = plano(A.elem('hlCuenta').innerHTML);
    assert.match(t, /📄 Tu historia laboral · opcional/);
    assert.match(t, /Todavía no nos la das\./);
    assert.match(A.elem('hlCuenta').innerHTML, /id="hlAbrir"[^>]*>Subirla</);
    const l = pension(A);
    assert.equal(l[0].url.replace(/^.*rpc\//, ''), 'pension_mia');
    assert.equal(l[0].cab.Authorization, 'Bearer token-de-ana', 'no la pidió con la sesión del cliente');
  });

  test('en Inicio, a quien ya está junto, también', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ junta: true }) });
    await asentar(30);
    assert.ok(A.visible('pCuenta'));
    assert.match(A.elem('cuerpo').innerHTML, /<div id="hlCuenta"><\/div>/);
    assert.match(plano(A.elem('hlCuenta').innerHTML), /Tu historia laboral/);
  });

  test('si la base todavía no tiene las funciones (404), la tarjeta no aparece: no se ofrece lo que no funciona', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({ apagado: true }) });
    await asentar(30);
    assert.equal(A.elem('hlCuenta').innerHTML, '');
    assert.equal(A.ev('HL_APAGADO'), true);
  });

  test('sin sesión no hay tarjeta (ni llamada)', async () => {
    const A = abrirSocio({ ahora: AHORA, red: nube() });
    await asentar(30);
    assert.equal(pension(A).length, 0);
    assert.equal(A.ev('montarHistoriaLaboral(), document.getElementById("hlCuenta").innerHTML'), '');
  });

  test('sin sus archivos (un service worker viejo), no hay tarjeta y la app sigue', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube(), sin: ['historia-laboral.js', 'fondos-pension.js'] });
    await asentar(30);
    assert.ok(A.visible('pEntrar'));
    assert.equal(A.elem('hlCuenta').innerHTML, '');
    assert.equal(pension(A).length, 0);
  });
});

describe('lo que hace, con su sesión', () => {
  test('abierta: la autorización SIN marcar; al marcarla se guarda con su versión, sin fondo todavía', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube() });
    await asentar(30);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    const h = A.elem('hlCuerpo').innerHTML;
    assert.match(h, /<input type="checkbox" id="hlAut" data-hl="aut">/, 'la autorización nació marcada');
    assert.match(plano(h), /No cambia tu garantía/);
    assert.equal(/Lo hago después/.test(h), false, 'en la app no hay «después»: ya es el después');
    cambio(A, 'aut', true);
    await asentar(20);
    const aut = pension(A).find(l => /pension_autorizar$/.test(l.url));
    assert.ok(aut, 'marcar la casilla no guardó la autorización');
    assert.deepEqual(aut.cuerpo.p_fondos, []);
    assert.equal(aut.cuerpo.p_version, '2026-11-03');
    assert.equal(aut.cab.Authorization, 'Bearer token-de-ana');
    assert.match(A.elem('hlCuerpo').innerHTML, /data-hl="fondo" value="colpensiones"/, 'con la autorización no apareció la lista de fondos');
    /* Y la salida, YA: la casilla promete «puedo quitarla cuando quiera». El
       botón ya estaba en la tarjeta abierta (escondido), y al autorizar se ve. */
    assert.match(A.elem('hlCuenta').innerHTML, /<button type="button" class="btn sec sm oculto"[^>]*id="hlRetirar">/,
      'la tarjeta abierta sin autorización no trae el botón de retirar: al autorizar aquí no aparecería');
    assert.equal(A.elem('hlRetirar').classList.contains('oculto'), false, 'autorizó en la app y no ve cómo retirarla');
  });

  test('escoger el fondo lo guarda (y Colpensiones con un privado); lo que ya subió se ve con su fecha y se puede quitar', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({
      autorizacion: { fondos: ['colpensiones'], version: '2026-11-03', recibida_en: '2026-11-03T14:00:00Z', revocada_en: null },
      archivos: [{ id: 41, tipo: 'pdf', bytes: 230000, creado_en: '2026-11-03T14:10:00Z' }] }) });
    await asentar(30);
    assert.match(plano(A.elem('hlCuenta').innerHTML), /Ya nos diste 1 PDF\./);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    assert.match(plano(A.elem('hlCuerpo').innerHTML), /PDF · 225 KB · subido el 3-nov/);
    cambio(A, 'fondo', 'porvenir');
    await asentar(20);
    const aut = pension(A).filter(l => /pension_autorizar$/.test(l.url)).pop();
    assert.deepEqual(aut.cuerpo.p_fondos, ['colpensiones', 'porvenir']);
    /* 28-oct-2026 (arreglo de los leves, P6) — CAMBIAR DE FONDO NO ES FIRMAR:
       sin versión ni momento, la base no pisa la constancia. Con el código de
       antes salía con la versión del texto del código, y esto falla. */
    assert.equal(aut.cuerpo.p_version, null, 'cambiar de fondo volvió a firmar la autorización con la versión del código');
    assert.equal(aut.cuerpo.p_momento, null);
    assert.match(A.elem('hlCuerpo').innerHTML, /data-hl="fondo" value="porvenir" checked/, 'el fondo no quedó marcado');
    /* El toque en «Quitar»: el banco no tiene DOM, así que se le da al oyente
       de la caja un botón de mentira con sus atributos. */
    A.elem('hlCuerpo').contains = () => true;
    A.elem('hlCuerpo')._oyentes.click.forEach(f => f({ target: { closest: () => ({ getAttribute: k => (k === 'data-hl' ? 'quitar' : k === 'data-id' ? '41' : null) }) } }));
    await asentar(20);
    const q = pension(A).find(l => /pension_quitar$/.test(l.url));
    assert.ok(q, 'quitar no salió');
    assert.equal(q.cuerpo.p_id, 41);
  });

  /* 28-oct-2026 (arreglo, ronda 1) — «📋 Pegar» subía lo que hubiera en el
     portapapeles en el MISMO toque, sin enseñarlo, y la lista lo llamaba
     «Pantallazo · 1 KB»: la foto de un chat quedaba en la base sin fecha de
     borrado, y la persona ni la había visto. Con el código de antes, el
     primer toque ya llamaba a pension_subir y esta prueba falla. */
  test('«📋 Pegar» enseña lo copiado y pregunta: nada sube sin el «Sí», y lo que sube se ve en la lista', async () => {
    /* Un PNG con sus bloques bien formados: desde el arreglo de los leves (P3)
       se lee por dentro para quitarle los metadatos. */
    const COPIADO = pngDe('FOTO PRIVADA DE UN CHAT');
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({
      autorizacion: { fondos: ['porvenir'], version: '2026-11-03', recibida_en: '2026-11-03T14:00:00Z', revocada_en: null } }),
      navegador: { clipboard: { read: () => Promise.resolve([{ types: ['image/png'],
        getType: () => Promise.resolve(new Blob([COPIADO], { type: 'image/png' })) }]) } } });
    await asentar(30);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    const cuerpo = A.elem('hlCuerpo');
    cuerpo.contains = () => true;
    const toque = que => cuerpo._oyentes.click.forEach(f => f({ target: { closest: () => ({ getAttribute: k => (k === 'data-hl' ? que : null) }) } }));
    const subidas = () => pension(A).filter(l => /pension_subir$/.test(l.url));
    const pregunta = () => /id="hlPegado"/.test(cuerpo.innerHTML);
    toque('pegar');
    await hasta(() => pregunta() || subidas().length > 0, 2000);
    assert.equal(subidas().length, 0, 'un toque en «Pegar» subió lo que había en el portapapeles sin enseñarlo ni preguntar');
    assert.ok(pregunta(), 'lo pegado no se enseñó');
    assert.match(cuerpo.innerHTML, /<img class="hl-vista" data-hl-mini="pegado:0" alt="Lo que copiaste">/);
    assert.match(plano(cuerpo.innerHTML), /¿Es tu historia laboral\? Esto es lo que copiaste\. No lo subimos hasta que toques «Sí, subirla»\./);
    /* «No, no es esta»: no sube nada. */
    toque('pegado-no');
    await asentar(10);
    assert.equal(subidas().length, 0, '«No» subió lo pegado');
    assert.equal(pregunta(), false);
    assert.match(plano(cuerpo.innerHTML), /Listo: no guardamos lo que copiaste\./);
    /* «Sí, subirla»: sube eso, con SU sesión, y la lista lo enseña. */
    toque('pegar');
    assert.ok(await hasta(pregunta, 2000));
    toque('pegado-si');
    assert.ok(await hasta(() => subidas().length === 1 && /id="hlLista"/.test(cuerpo.innerHTML), 2000), 'el «Sí» no subió lo pegado');
    assert.equal(subidas()[0].cuerpo.p_archivo, COPIADO.toString('base64'));
    assert.equal(subidas()[0].cab.Authorization, 'Bearer token-de-ana');
    assert.match(cuerpo.innerHTML, /<img class="hl-mini" data-hl-mini="lista:900" alt="">/, 'la lista no enseña lo que acaba de subir');
    assert.equal(A.elem('hlLinea').textContent, 'Ya nos diste 1 pantallazo.');
  });

  /* 28-oct-2026 (arreglo de los leves, P3) — en la cuenta, igual que en el
     registro: la foto chica sube SIN su EXIF. Con el código de antes, a
     pension_subir llegaban «GPSLatitude» y el modelo del teléfono. */
  test('una foto chica escogida en la tarjeta sube SIN su EXIF (ni dónde se tomó ni el modelo del teléfono)', async () => {
    const seg = (m, d) => { const b = Buffer.from(d, 'binary'), l = Buffer.alloc(2); l.writeUInt16BE(b.length + 2); return Buffer.concat([Buffer.from([0xff, m]), l, b]); };
    const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
      seg(0xe1, 'Exif\0\0II*\0\x08\0\0\0\0\0\0\0\0\0 GPSLatitude 4.6097 Model SM-A146M'),
      seg(0xdb, '\0' + 'Q'.repeat(64)), seg(0xc0, '\x08\0\x10\0\x10\x01\x01\x11\0'), seg(0xda, '\x01\x01\0\0\x3f\0'),
      Buffer.from('LA HOJA IMPRESA', 'binary'), Buffer.from([0xff, 0xd9])]);
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({
      autorizacion: { fondos: ['porvenir'], version: '2026-11-03', recibida_en: '2026-11-03T14:00:00Z', revocada_en: null } }) });
    await asentar(30);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    cambio(A, 'archivo', '', [new Blob([FOTO], { type: 'image/jpeg' })]);
    assert.ok(await hasta(() => pension(A).some(l => /pension_subir$/.test(l.url)), 2000), 'la foto no subió');
    const subida = Buffer.from(pension(A).find(l => /pension_subir$/.test(l.url)).cuerpo.p_archivo, 'base64');
    assert.equal(subida.includes('GPSLatitude'), false, 'la foto subió con dónde se tomó');
    assert.equal(subida.includes('SM-A146M'), false, 'la foto subió con el modelo del teléfono');
    assert.ok(subida.includes('LA HOJA IMPRESA'), 'se perdió la imagen');
  });

  test('RETIRAR la autorización (Ley 1581): un toque, y se borra todo lo subido', async () => {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red: nube({
      autorizacion: { fondos: ['skandia'], version: '2026-11-03', recibida_en: '2026-11-03T14:00:00Z', revocada_en: null },
      archivos: [{ id: 7, tipo: 'png', bytes: 1000, creado_en: '2026-11-03T14:10:00Z' }] }) });
    await asentar(30);
    A.elem('hlAbrir')._oyentes.click[0]();
    await asentar(5);
    assert.match(A.elem('hlCuenta').innerHTML, /id="hlRetirar"[^>]*>Retirar mi autorización y borrar mi historia laboral</);
    A.elem('hlRetirar')._oyentes.click[0]();
    await asentar(20);
    assert.ok(pension(A).some(l => /pension_retirar$/.test(l.url)), 'retirar no salió');
    assert.match(plano(A.elem('hlCuerpo').innerHTML), /Listo: borramos tu historia laboral y quitamos tu autorización\./);
    assert.match(plano(A.elem('hlCuenta').innerHTML), /Todavía no nos la das\./);
  });
});
