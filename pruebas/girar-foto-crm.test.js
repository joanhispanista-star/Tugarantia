/* ============================================================================
 * ↻ GIRAR UNA FOTO DEL REGISTRO EN EL CRM — panel/crm.html, ejecutado
 * 8 de octubre de 2026.
 *
 *   node --test pruebas/girar-foto-crm.test.js
 *
 * Joan, el 8-oct: tomó a mano la foto del respaldo de su cédula y «cuando la
 * tomé, en el CRM se ve al revés». La causa está en la captura de play/ (el
 * recorte del marco de pie se gira siempre hacia el mismo lado); aquí se
 * prueba la otra mitad: que en el CRM cada foto del registro tenga su «↻
 * Girar», y que lo girado
 *
 *   · se vea girado (en la miniatura Y en el enlace que la amplía);
 *   · se recuerde en este navegador con una llave sacada del CONTENIDO de la
 *     foto —otra foto del mismo celular no sale girada—, sin guardar la foto;
 *   · pase a la ficha al guardarla, al cruzarla o al girarla desde la ficha;
 *   · y NUNCA reescriba la foto de la nube: esa es la evidencia que subió la
 *     persona.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const REVERSO = 'data:image/jpeg;base64,RVNUQS1FUy1MQS1DRURVTEEtUE9SLURFVFJBUw==';
const FRENTE = 'data:image/jpeg;base64,RVNUQS1FUy1MQS1DRURVTEEtUE9SLURFTEFOVEU=';
const OTRO_REVERSO = 'data:image/jpeg;base64,T1RSTy1SRVZFUlNPLURFTC1NSVNNTy1DRUxVTEFS';

function nubeCon(fotos) {
  const llamadas = [];
  const red = (url, cfg) => {
    llamadas.push(String(url));
    const cuerpo = (() => { try { return JSON.parse((cfg && cfg.body) || '{}'); } catch (e) { return {}; } })();
    if (String(url).includes('archivos_de_registro')) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ fotos: fotos || {}, huella: null })) });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(cuerpo.p_ids ? '[]' : 'null') });
  };
  return { red, llamadas };
}
function crm(fotos, cartera) {
  const n = nubeCon(fotos);
  const P = abrirPanel({ red: n.red });
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.cargarCartera(cartera || { socios: [], prestamos: [] });
  P.llamadas = n.llamadas;
  return P;
}
/* Un lienzo y una Image de mentira: lo justo para ver QUÉ se dibuja girado y
   con qué medidas. En Node no hay ninguno de los dos; sin ellos el CRM deja la
   foto como llegó (y eso también se prueba). */
function conLienzo(P) {
  const dibujos = [];
  P.ctx.Image = class {
    set src(v) { this._src = v; this.naturalWidth = 900; this.naturalHeight = 568; setImmediate(() => this.onload && this.onload()); }
    get src() { return this._src; }
  };
  const crear = P.ctx.document.createElement;
  P.ctx.document.createElement = tag => {
    if (tag !== 'canvas') return crear(tag);
    const c = { width: 0, height: 0,
      getContext: () => ({ translate() {}, rotate(r) { c.rot = r; }, drawImage() {} }),
      toDataURL: () => { dibujos.push({ w: c.width, h: c.height, grados: Math.round((c.rot || 0) * 180 / Math.PI) });
        return 'data:image/jpeg;base64,R0lSQURB' + c.width + 'x' + c.height; } };
    return c;
  };
  return dibujos;
}
const registro = () => ({ id: 9, nombre: 'Ana', cedula: '52000000', telefono: '3001234567', estado: 'nuevo',
  datos: { nombres: 'Ana' }, huella: null, creado_en: '2026-10-08T15:00:00Z' });
const giros = P => JSON.parse(P.almacen.tg_giros_fotos_v1 || '{}');

describe('cada foto del registro tiene su ↻ Girar', () => {

  test('en «👁 Ver datos», un botón por foto, FUERA del enlace que la abre', async () => {
    const P = crm({ cedula_frente: FRENTE, cedula_reverso: REVERSO });
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(9)');
    await asentar();
    const h = P.elems.regFotos.innerHTML;
    assert.match(h, /<\/a><button type="button" class="btn-girar" onclick="girarFotoRegistro\('reverso'\)"[^>]*>↻ Girar<\/button>/);
    assert.match(h, /onclick="girarFotoRegistro\('frente'\)"/);
    assert.ok(!/<a[^>]*>[^]*?<button[^>]*btn-girar[^]*?<\/a>/.test(h.replace(/<\/a>[^]*$/, '</a>')),
      'el botón quedó dentro del enlace: tocarlo abriría la foto');
  });

  test('girar se recuerda en este navegador: 90, 180, 270 y vuelta a derecho', async () => {
    const P = crm({ cedula_reverso: REVERSO });
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(9)');
    await asentar();
    const k = P.ev('claveGiro(' + JSON.stringify(REVERSO) + ')');
    [90, 180, 270].forEach(g => { P.ev("girarFotoRegistro('reverso')"); assert.equal(giros(P)[k], g); });
    P.ev("girarFotoRegistro('reverso')");
    assert.equal(giros(P)[k], undefined, 'a los 360° tenía que olvidarse, no quedar en 0');
    assert.ok(!/base64|RVNUQS/.test(P.almacen.tg_giros_fotos_v1 || ''), 'se guardó la foto en el navegador');
  });

  test('la llave es del CONTENIDO: otra foto del mismo celular no sale girada', () => {
    const P = crm();
    P.ev('guardarGiroLocal(claveGiro(' + JSON.stringify(REVERSO) + '),180)');
    assert.equal(P.ev('giroDe(' + JSON.stringify(REVERSO) + ')'), 180);
    assert.equal(P.ev('giroDe(' + JSON.stringify(OTRO_REVERSO) + ')'), 0,
      'la foto nueva del mismo número salió con el giro de la vieja');
    assert.equal(P.ev('giroDe("foto:reg:3001234567/cedula_reverso")'), 0, 'un token sin foto no tiene llave');
  });

  test('se ve girada: en la miniatura y en el enlace que la amplía, con las medidas cambiadas', async () => {
    const P = crm({ cedula_reverso: REVERSO });
    const dibujos = conLienzo(P);
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(9)');
    await asentar();
    const img = P.elems.regFoto_reverso;
    img.parentElement = { tagName: 'A', href: REVERSO };
    P.ev("girarFotoRegistro('reverso')");
    await asentar();
    assert.deepEqual(dibujos[0], { w: 568, h: 900, grados: 90 }, 'el lienzo no se volteó para 90°');
    assert.equal(img.src, 'data:image/jpeg;base64,R0lSQURB568x900');
    assert.equal(img.parentElement.href, img.src, 'la miniatura se giró pero el enlace sigue abriendo la de cabeza');
    P.ev("girarFotoRegistro('reverso')");
    await asentar();
    assert.deepEqual(dibujos[1], { w: 900, h: 568, grados: 180 });
  });

  test('al volver a abrirlo, sale como se dejó', async () => {
    const P = crm({ cedula_reverso: REVERSO });
    const dibujos = conLienzo(P);
    P.ev('guardarGiroLocal(claveGiro(' + JSON.stringify(REVERSO) + '),180)');
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(9)');
    await asentar();
    assert.equal(dibujos.length, 1);
    assert.equal(dibujos[0].grados, 180);
    assert.match(P.elems.regFoto_reverso.src, /R0lSQURB/);
  });

  test('sin lienzo (o sin memoria) la foto se queda como llegó: nunca una imagen rota', async () => {
    const P = crm({ cedula_reverso: REVERSO });   // sin conLienzo: en Node no hay Image
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(9)');
    await asentar();
    const img = P.elems.regFoto_reverso;
    img.src = REVERSO;
    P.ev("girarFotoRegistro('reverso')");
    await asentar();
    assert.equal(img.src, REVERSO);
  });

  test('girar NO reescribe la foto de la nube: no sale ninguna petición', async () => {
    const P = crm({ cedula_reverso: REVERSO });
    conLienzo(P);
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(9)');
    await asentar();
    const antes = P.llamadas.length;
    P.ev("girarFotoRegistro('reverso')");
    await asentar();
    assert.equal(P.llamadas.length, antes, 'girar habló con la nube: ' + P.llamadas.slice(antes).join(', '));
  });

  test('si la foto todavía no llegó, lo dice', () => {
    const P = crm();
    P.ev("girarFotoRegistro('reverso')");
    assert.match(P.ev('(window._avisos||[]).join(" | ")'), /todavía no ha llegado/);
  });
});

describe('lo girado pasa a la ficha', () => {

  test('girar desde la ficha lo guarda EN la ficha (viaja con el cliente), sin la foto', async () => {
    const P = crm({}, { socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567',
      gestiones: [], cedulaReversoFoto: REVERSO }], prestamos: [] });
    conLienzo(P);
    P.ev('verCliente("C1")');
    assert.match(P.ev('document.getElementById("mBody").innerHTML'), /onclick="girarFotoFicha\('C1','reverso'\)"/);
    /* El banco no tiene un DOM que resuelva los data-foto: se hace lo que haría
       el resolvedor con esa miniatura. */
    P.ctx.__img = P.ev('document.getElementById("fichaFoto_reverso")'); P.ctx.__img.tagName = 'IMG'; P.ctx.__img.removeAttribute = () => {};
    P.ev('ponerFoto(__img,' + JSON.stringify(REVERSO) + ')');
    P.ev("girarFotoFicha('C1','reverso')");
    await asentar();
    const s = JSON.parse(P.almacen.joan_socios_v1).socios[0];
    const k = P.ev('claveGiro(' + JSON.stringify(REVERSO) + ')');
    assert.deepEqual(s.girosFotos, { [k]: 90 });
    assert.equal(s.cedulaReversoFoto, REVERSO, 'girar cambió la foto guardada en la ficha');
    assert.equal(giros(P)[k], 90, 'tampoco quedó en este navegador');
  });

  test('abrir la ficha en otro aparato (sin nada en el navegador) la muestra girada', async () => {
    const P = crm({}, { socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567',
      gestiones: [], cedulaReversoFoto: REVERSO, girosFotos: {} }], prestamos: [] });
    const dibujos = conLienzo(P);
    const k = P.ev('claveGiro(' + JSON.stringify(REVERSO) + ')');
    P.ev('DB.socios[0].girosFotos[' + JSON.stringify(k) + ']=270');
    P.ev('verCliente("C1")');
    P.ctx.__img = P.ev('document.getElementById("fichaFoto_reverso")'); P.ctx.__img.tagName = 'IMG'; P.ctx.__img.removeAttribute = () => {};
    P.ev('ponerFoto(__img,' + JSON.stringify(REVERSO) + ')');
    await asentar();
    assert.equal(dibujos.length, 1);
    assert.equal(dibujos[0].grados, 270);
  });

  test('guardar la ficha nacida del registro se lleva lo que Joan giró mirando el registro', () => {
    const P = crm();
    P.ev('editarCliente(null,{})');
    /* Lo que el resolvedor deja en memoria cuando trae las fotos del registro. */
    P.ev('_fotosReg={"3001234567":{fotos:{cedula_reverso:' + JSON.stringify(REVERSO) + '}}}');
    P.ev('guardarGiroLocal(claveGiro(' + JSON.stringify(REVERSO) + '),180)');
    P.ev('document.getElementById("fNombre").value="Ana"');
    P.ev('_fotosTmp={frente:null,reverso:"foto:reg:3001234567/cedula_reverso",selfie:null}');
    P.ev('guardarCliente("")');
    const s = JSON.parse(P.almacen.joan_socios_v1).socios[0];
    const k = P.ev('claveGiro(' + JSON.stringify(REVERSO) + ')');
    assert.deepEqual(s.girosFotos, { [k]: 180 });
    assert.equal(s.cedulaReversoFoto, 'foto:reg:3001234567/cedula_reverso', 'se copió la foto en vez del token');
  });

  test('una ficha sin nada girado no gana un campo vacío', () => {
    const P = crm();
    P.ev('editarCliente(null,{})');
    P.ev('document.getElementById("fNombre").value="Beto"');
    P.ev('guardarCliente("")');
    const s = JSON.parse(P.almacen.joan_socios_v1).socios[0];
    assert.equal('girosFotos' in s, false);
  });

  test('cruzar el registro con una ficha también se lleva el giro', async () => {
    const P = crm({ cedula_reverso: REVERSO },
      { socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567', gestiones: [] }], prestamos: [] });
    P.ev('guardarGiroLocal(claveGiro(' + JSON.stringify(REVERSO) + '),90)');
    P.ctx.__r = [registro()]; P.ev('_registros=__r');
    P.ev('aplicarCruce(9,"C1")');
    await asentar();
    const s = JSON.parse(P.almacen.joan_socios_v1).socios[0];
    const k = P.ev('claveGiro(' + JSON.stringify(REVERSO) + ')');
    assert.equal(s.cedulaReversoFoto, 'foto:reg:3001234567/cedula_reverso');
    assert.deepEqual(s.girosFotos, { [k]: 90 });
  });

  test('cerrar la ficha suelta su giro: el registro que se abra después no lo hereda', () => {
    const P = crm({}, { socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001234567',
      gestiones: [], cedulaReversoFoto: REVERSO, girosFotos: { x: 90 } }], prestamos: [] });
    P.ev('verCliente("C1")');
    assert.equal(P.ev('JSON.stringify(_girosFicha)'), '{"x":90}');
    P.ev('cerrarModal()');
    assert.equal(P.ev('_girosFicha'), null);
  });
});
