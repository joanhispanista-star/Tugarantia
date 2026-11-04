/* ===========================================================================
 * LAS FOTOS NO VIAJAN, Y EL CUPO NO BAJA POR ESO — E1, 4-nov-2026
 *
 *   node --test pruebas/las-fotos-no-bajan-el-cupo.test.js
 *
 * Medido el 3-nov con los archivos de verdad: la misma ficha da 56.000 de cupo
 * en el computador y 18.000 en el Panel del bolsillo. sinFotos borraba también el
 * token `foto:reg:…`, que no es una foto sino dónde está, y la garantía por datos
 * (motor.js, hayDato) solo mira si el campo tiene algo: 10.000 + 10.000 + 18.000
 * menos, sin un error en ninguna parte.
 *
 * LA CURA, del plan: el puntero se queda y la foto de verdad pasa a una marca. La
 * marca también es un puntero: dice dónde NO está. Ninguna foto real sube a la
 * nube, que es promesa de la casa (la selfie es dato biométrico, Ley 1581 art. 5).
 *
 *   foto:reg:…            el puntero de siempre: la foto está en la nube del registro
 *   foto:otro-aparato     la tomó Joan con su cámara y vive en ese aparato
 *   foto:se-perdio        vivía aquí, y el navegador se llenó (dbSinFotos)
 *
 * Lo que eso obliga a cuidar, y se vigila aquí: la marca cede ante la foto de
 * verdad al bajar (devolverFotos), un puntero distinto nunca es un choque que
 * Joan tenga que decidir (fusionarFila, espejoDeAdopcion), y la ficha dice qué
 * significa cada marca en vez de «esa foto no tiene una dirección que yo entienda».
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const N = require('../panel/nube.js');
const P = require('../app/puente.js');
const { abrirPanel } = require('./banco-panel.js');
const { abrirEspejo } = require('./banco-espejo.js');

const clon = v => JSON.parse(JSON.stringify(v));
const RAIZ = path.join(__dirname, '..');
const FOTO = 'data:image/jpeg;base64,' + 'A'.repeat(400);
const OTRO = 'foto:otro-aparato', PERDIDA = 'foto:se-perdio';
const TOKEN = t => 'foto:reg:3001112233/' + t;
const ficha = extra => Object.assign({ id: 's1', numero: 1, nombre: 'Ficha Inventada', cedula: '52000111', telefono: '3001112233', gestiones: [] }, extra || {});
const conTokens = () => ficha({ cedulaFrenteFoto: TOKEN('cedula_frente'), cedulaReversoFoto: TOKEN('cedula_reverso'), selfieFoto: TOKEN('selfie') });
const conFotos = () => ficha({ cedulaFrenteFoto: FOTO, cedulaReversoFoto: FOTO, selfieFoto: FOTO });
const mide = o => {
  const db = { socios: [o], prestamos: [], respaldados: [], config: {} };
  const paq = P.migrarSocio(db, o);
  return { garantia: paq.garantia.total, cupo: P.cupoDelSocio(db, o, paq.garantia.nivel).cupo };
};
const dbDe = s => ({ socios: [s], prestamos: [], respaldados: [], config: { negocio: 'Tu Garantía' }, contadores: { cliente: 1, credito: 0, respaldado: 0 }, plantillas: {} });
/* Lo que recibe el otro aparato: la subida entera, de ida y vuelta por la forma de la nube. */
const loQueBaja = db => N.aplicarPaquete(null, N.paqueteDeLote(N.armarLote(db, N.espejoVacio()), { completo: true })).db;

describe('el cupo sale igual en todos los aparatos', () => {
  test('LA MEDICIÓN: con los tres tokens, 56.000 antes y después de sinFotos', () => {
    assert.deepEqual(mide(conTokens()), { garantia: 56000, cupo: 56000 }, 'la maqueta ya no mide lo que medía');
    assert.deepEqual(mide(N.sinFotos(conTokens())), { garantia: 56000, cupo: 56000 }, 'sinFotos le bajó el cupo a la ficha');
  });

  test('con fotos de verdad tampoco baja', () => {
    assert.deepEqual(mide(conFotos()), { garantia: 56000, cupo: 56000 });
    assert.deepEqual(mide(N.sinFotos(conFotos())), { garantia: 56000, cupo: 56000 });
  });

  test('sin fotos da lo que tiene que dar: no se regala nada', () => {
    assert.deepEqual(mide(ficha()), { garantia: 18000, cupo: 18000 });
    assert.deepEqual(mide(N.sinFotos(ficha())), { garantia: 18000, cupo: 18000 });
    assert.deepEqual(mide(N.sinFotos(ficha({ selfieFoto: null, cedulaFrenteFoto: '' }))), { garantia: 18000, cupo: 18000 });
  });

  test('un solo lado y una selfie: cada foto vale lo suyo, en los dos aparatos', () => {
    const f = ficha({ cedulaFrenteFoto: FOTO, selfieFoto: TOKEN('selfie') });
    assert.deepEqual(mide(N.sinFotos(f)), mide(f));
  });

  test('de punta a punta: subir, bajar en otro aparato, y la ficha da lo mismo', () => {
    [conTokens(), conFotos(), ficha()].forEach(s => {
      const pc = mide(clon(s));
      const alla = loQueBaja(dbDe(clon(s))).socios[0];
      assert.deepEqual(mide(alla), pc, 'en el otro aparato el cupo salió distinto');
    });
  });

  test('el navegador se llena y se pierden las fotos: el cupo no baja por eso', () => {
    const d = N.dbSinFotos(dbDe(conFotos()));
    assert.deepEqual(mide(d.socios[0]), { garantia: 56000, cupo: 56000 });
  });

  test('las páginas de verdad: el Panel del bolsillo y el CRM dicen la misma cifra', () => {
    /* Las dos cargan la ficha con sus valores por defecto (whatsappIgual da 2.000 más
       que la maqueta de arriba); lo que se vigila es que digan lo mismo. */
    const enPanel = s => {
      const E = abrirEspejo({ cartera: loQueBaja(dbDe(s)), sesion: true, ahora: '2026-11-03T15:00:00' });
      return { garantia: E.ev('P.migrarSocio(DB, DB.socios[0]).garantia.total'),
        cupo: E.ev('P.cupoDelSocio(DB, DB.socios[0], P.migrarSocio(DB, DB.socios[0]).garantia.nivel).cupo') };
    };
    const enCRM = s => {
      const C = abrirPanel({ ahora: '2026-11-03T15:00:00' });
      C.cargarCartera(dbDe(s));
      return { garantia: C.ev('migrarSocio(DB.socios[0]).garantia.total'),
        cupo: C.ev('PUENTE.cupoDelSocio(DB, DB.socios[0], migrarSocio(DB.socios[0]).garantia.nivel).cupo') };
    };
    [conTokens(), conFotos(), ficha()].forEach(s => {
      assert.deepEqual(enPanel(clon(s)), enCRM(clon(s)), 'el iPhone y el computador dicen dos cifras para la misma ficha');
    });
    assert.equal(enPanel(conTokens()).garantia - enPanel(ficha()).garantia, 38000, 'las tres fotos valen 10.000 + 10.000 + 18.000');
  });
});

describe('ninguna foto real sube a la nube', () => {
  test('una foto de verdad pasa a la marca; el puntero se queda; lo vacío no se toca', () => {
    const s = N.sinFotos(ficha({ cedulaFrenteFoto: FOTO, cedulaReversoFoto: TOKEN('cedula_reverso'), selfieFoto: null, cedulaFoto: '' }));
    assert.equal(s.cedulaFrenteFoto, OTRO);
    assert.equal(s.cedulaReversoFoto, TOKEN('cedula_reverso'));
    assert.equal(s.selfieFoto, null);
    assert.equal(s.cedulaFoto, '');
  });

  test('en el lote no va ni una imagen, tampoco en la papelera ni en los recibos', () => {
    const db = dbDe(conFotos());
    db.prestamos = [{ id: 'P1', socioId: 's1', comprobantes: [{ fecha: '2026-11-01', tipo: 'pago', monto: 1, foto: FOTO }] }];
    db.respaldados = [{ id: 'R1', socioId: 's1', cuotas: [{ n: 1, comprobante: FOTO }] }];
    db.papeleraSocios = [{ borradoEn: '2026-11-01', socio: conFotos(), prestamos: [{ id: 'P9', comprobantes: [{ fecha: '2026-01-01', tipo: 'pago', monto: 1, foto: FOTO }] }] }];
    const t = JSON.stringify(N.armarLote(db, N.espejoVacio()));
    assert.ok(t.indexOf('base64') < 0, 'se coló una imagen en lo que sale por la red');
    assert.ok(t.indexOf('AAAA') < 0);
    assert.ok(t.indexOf(OTRO) > 0, 'la marca no salió');
  });

  test('algo con forma de puntero pero con una imagen adentro no pasa por puntero', () => {
    /* El prefijo solo no basta: «foto:» + cualquier cosa es lo que dejaría subir una
       selfie el día que algo escriba mal un campo. Sale como lo que es: una foto. */
    assert.equal(N.sinFotos(ficha({ selfieFoto: 'foto:' + FOTO })).selfieFoto, OTRO);
    assert.equal(N.sinFotos(ficha({ selfieFoto: 'foto:' + 'A'.repeat(500) })).selfieFoto, OTRO);
    assert.equal(N.sinFotos(ficha({ selfieFoto: 'foto:reg:3001112233/selfie' })).selfieFoto, 'foto:reg:3001112233/selfie');
  });

  test('no toca el original, y pasarla dos veces da lo mismo', () => {
    /* subir.html la pasa dos veces (dbParaSubir y armarLote). */
    const o = conFotos(), c = clon(o);
    const una = N.sinFotos(o);
    assert.deepEqual(o, c, 'subir la cartera le borraría a Joan las fotos de su disco');
    assert.deepEqual(N.sinFotos(una), una);
    const d = N.dbSinFotos(dbDe(conFotos()));
    assert.deepEqual(N.sinFotos(d.socios[0]), d.socios[0], 'la marca de disco se convirtió en la otra al subir');
  });

  test('una ficha sin fotos no cambia de forma: el espejo sigue valiendo y no resube', () => {
    const f = ficha({ selfieFoto: null, comprobantes: [] });
    assert.equal(N.jsonCanonico(N.sinFotos(f)), N.jsonCanonico(f));
    const e = N.espejoVacio();
    e.socios.s1 = { revision: 3, json: N.jsonCanonico(f) };
    assert.equal(N.armarLote(dbDe(f), e, { claves: [] }).socios.length, 0);
  });

  test('una ficha con fotos resube UNA vez, y ya: la cura no deja una subida eterna', () => {
    /* El espejo viene de antes, cuando el campo desaparecía. */
    const conF = conTokens();
    const viejo = clon(conF);
    N.CAMPOS_FOTO.forEach(k => delete viejo[k]);
    const e = N.espejoVacio();
    e.socios.s1 = { revision: 3, json: N.jsonCanonico(viejo) };
    const lote = N.armarLote(dbDe(conF), e, { claves: [] });
    assert.equal(lote.socios.length, 1, 'la ficha con fotos tiene que subir su puntero una vez');
    assert.equal(lote.socios[0].revision_base, 3, 'tiene que subir contra la revisión que conoce');
    const tras = N.espejoTrasEmpujar(e, lote, { revisiones: [{ tabla: 'socios', id: 's1', revision: 4 }], choques: [] });
    assert.equal(N.armarLote(dbDe(conF), tras, { claves: [] }).socios.length, 0, 'sigue subiendo en cada vuelta');
  });
});

describe('las dos marcas', () => {
  test('en el disco, la foto que no cupo queda «se perdió», no «está en otro aparato»', () => {
    /* guardarSinFotos corre en el aparato que la acaba de perder: «vive en el aparato
       donde se tomó» sería mandarlo a buscarla adonde ya no está. */
    const d = N.dbSinFotos(dbDe(conFotos()));
    assert.equal(d.socios[0].selfieFoto, PERDIDA);
    assert.equal(d.socios[0].cedulaFrenteFoto, PERDIDA);
    assert.ok(JSON.stringify(d).indexOf('base64') < 0);
  });

  test('un puntero sobrevive al disco lleno: esas fotos siguen en la nube', () => {
    assert.equal(N.dbSinFotos(dbDe(conTokens())).socios[0].selfieFoto, TOKEN('selfie'));
  });

  test('el CRM de verdad, sin espacio: las cuentas entran, y la ficha lo dice bien', () => {
    const C = abrirPanel({ topeKB: 6 });
    C.ev('DB.socios=[{id:"s1",nombre:"Ana Inventada",selfieFoto:"data:image/jpeg;base64,' + 'A'.repeat(8000) + '"}]; DB.prestamos=[];');
    assert.equal(C.ev('guardar()'), false);
    assert.equal(JSON.parse(C.almacen.joan_socios_v1).socios[0].selfieFoto, PERDIDA);
  });
});

describe('devolverFotos: la marca cede ante lo que hay aquí', () => {
  const caso = (nube, local) => N.devolverFotos(ficha({ selfieFoto: nube }), ficha({ selfieFoto: local })).selfieFoto;

  test('foto de verdad aquí: gana, venga lo que venga', () => {
    assert.equal(caso(OTRO, FOTO), FOTO, 'la marca se comió la foto de este aparato');
    assert.equal(caso(PERDIDA, FOTO), FOTO);
    assert.equal(caso(TOKEN('selfie'), FOTO), FOTO);
    assert.equal(caso(undefined, FOTO), FOTO);
    assert.equal(caso(null, FOTO), FOTO);
  });

  test('un puntero aquí le gana a una marca, y uno de allá se respeta', () => {
    assert.equal(caso(OTRO, TOKEN('selfie')), TOKEN('selfie'));
    assert.equal(caso('foto:reg:3009998888/selfie', TOKEN('selfie')), 'foto:reg:3009998888/selfie');
    assert.equal(caso(TOKEN('selfie'), OTRO), TOKEN('selfie'), 'una marca no puede tapar un puntero');
    assert.equal(caso(TOKEN('selfie'), null), TOKEN('selfie'));
  });

  test('en este aparato se perdió: la nube no le dice «está en otro aparato»', () => {
    assert.equal(caso(OTRO, PERDIDA), PERDIDA);
  });

  test('LA QUINTA FOTO: el recibo de la cuota vuelve a su cuota', () => {
    /* Medido el 3-nov: ☁ Subir, paso 6 lo perdía. Lo que baja no lo trae, y se escribía encima. */
    const r = { id: 'R1', socioId: 'C1', comprobantes: [{ fecha: '2026-11-01', tipo: 'cuota', monto: 300000, foto: FOTO }],
      cuotas: [{ n: 1, pagado: true, monto: 300000, comprobante: FOTO }, { n: 2, pagado: false, monto: 300000, comprobante: null }] };
    const v = N.devolverFotos(N.sinFotos(r), r);
    assert.equal(v.comprobantes[0].foto, FOTO);
    assert.equal(v.cuotas[0].comprobante, FOTO, 'el recibo de la cuota se perdió al aplicar');
    assert.equal(v.cuotas[1].comprobante, null);
  });

  test('el recibo vuelve por el número de la cuota, no por su posición', () => {
    const local = { id: 'R1', cuotas: [{ n: 1, comprobante: 'RECIBO-1' }, { n: 2, comprobante: 'RECIBO-2' }] };
    const nube = { id: 'R1', cuotas: [{ n: 2 }, { n: 1 }] };
    const v = N.devolverFotos(nube, local);
    assert.equal(v.cuotas[0].comprobante, 'RECIBO-2');
    assert.equal(v.cuotas[1].comprobante, 'RECIBO-1');
  });

  test('un recibo que ya viene no se deja pisar, y no toca lo que le dieron', () => {
    const local = { id: 'R1', cuotas: [{ n: 1, comprobante: 'LOCAL' }] };
    const nube = { id: 'R1', cuotas: [{ n: 1, comprobante: 'YA-ESTABA' }] };
    const c = clon(nube);
    assert.equal(N.devolverFotos(nube, local).cuotas[0].comprobante, 'YA-ESTABA');
    assert.deepEqual(nube, c);
  });

  test('CONTROL: con el nube.js de v142 la marca sí se comía la foto', () => {
    /* Por eso, antes de publicar, se cierran las pestañas de ☁ Subir que estén abiertas:
       una de antes, con su nube.js de antes, escribiría la marca encima de la foto. */
    let fuente;
    try { fuente = execFileSync('git', ['show', 'ee7c3cc:panel/nube.js'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { return; }
    const mod = { exports: {} };
    vm.runInNewContext(fuente, { module: mod, globalThis: {} });
    assert.equal(mod.exports.devolverFotos(ficha({ selfieFoto: OTRO }), ficha({ selfieFoto: FOTO })).selfieFoto, OTRO);
  });
});

describe('una foto nunca es un choque que Joan tenga que decidir', () => {
  const cruces = [
    ['token / nada', TOKEN('selfie'), undefined], ['nada / token', undefined, TOKEN('selfie')],
    ['token / null', TOKEN('selfie'), null], ['null / token', null, TOKEN('selfie')],
    ['marca / null', OTRO, null], ['null / marca', null, OTRO],
    ['token / marca', TOKEN('selfie'), OTRO], ['marca / token', OTRO, TOKEN('selfie')],
    ['token / otro token', TOKEN('selfie'), 'foto:reg:3009998888/selfie'],
    ['otro aparato / se perdió', OTRO, PERDIDA], ['se perdió / otro aparato', PERDIDA, OTRO]
  ];
  cruces.forEach(([nombre, mio, suyo]) => {
    test(nombre + ': sin choque', () => {
      const r = N.fusionarFila(ficha({ selfieFoto: mio }), ficha({ selfieFoto: suyo }), N.LISTAS_QUE_SUMAN);
      assert.equal(r.hayChoque, false, 'le preguntaría a Joan por una foto: ' + JSON.stringify(r.pisables));
    });
  });

  test('en `fila` queda el que más dice: el puntero le gana a la marca, y la marca al vacío', () => {
    const fila = (m, s) => N.fusionarFila(ficha({ selfieFoto: m }), ficha({ selfieFoto: s }), N.LISTAS_QUE_SUMAN).fila.selfieFoto;
    assert.equal(fila(OTRO, TOKEN('selfie')), TOKEN('selfie'));
    assert.equal(fila(TOKEN('selfie'), OTRO), TOKEN('selfie'));
    assert.equal(fila(null, OTRO), OTRO);
    assert.equal(fila(OTRO, null), OTRO);
    assert.equal(fila(PERDIDA, OTRO), OTRO, 'otra copia de la foto existe: hay que seguir diciéndolo');
    assert.equal(fila(TOKEN('selfie'), 'foto:reg:3009998888/selfie'), TOKEN('selfie'), 'entre dos punteros, el mío');
  });

  test('lo demás de la ficha sigue preguntándose', () => {
    const r = N.fusionarFila(ficha({ selfieFoto: TOKEN('selfie'), nombre: 'Uno' }), ficha({ selfieFoto: OTRO, nombre: 'Otro' }), N.LISTAS_QUE_SUMAN);
    assert.equal(r.hayChoque, true);
    assert.deepEqual(r.pisables.map(x => x.campo), ['nombre']);
  });

  test('emparejar: la nube sin el puntero, o con null, no congela la ficha', () => {
    const adopta = datos => N.espejoDeAdopcion(dbDe(conTokens()), { completo: true, socios: [{ id: 's1', datos, revision: 7, borrado: false }] }, null);
    const sinCampo = clon(conTokens());
    N.CAMPOS_FOTO.forEach(k => delete sinCampo[k]);
    assert.deepEqual(adopta(sinCampo).congelar, [], 'la ficha quedó en discusión por no traer el puntero');
    assert.deepEqual(adopta(Object.assign(clon(sinCampo), { selfieFoto: null, cedulaFrenteFoto: null, cedulaReversoFoto: null })).congelar, [],
      'el celular sube null cuando no tiene la foto: eso no contradice a nadie');
    assert.deepEqual(adopta(Object.assign(clon(sinCampo), { selfieFoto: OTRO })).congelar, []);
  });

  test('emparejar: una diferencia de verdad se congela igual, con punteros o sin ellos', () => {
    const r = N.espejoDeAdopcion(dbDe(conTokens()), { completo: true, socios: [{ id: 's1', datos: Object.assign(conTokens(), { nombre: 'Otro Nombre' }), revision: 7, borrado: false }] }, null);
    assert.deepEqual(r.congelar.map(x => x.motivo), ['difieren']);
  });

  test('lo adoptado sube después contra la revisión de la nube, con su puntero', () => {
    const sinCampo = clon(conTokens());
    N.CAMPOS_FOTO.forEach(k => delete sinCampo[k]);
    const r = N.espejoDeAdopcion(dbDe(conTokens()), { completo: true, socios: [{ id: 's1', datos: sinCampo, revision: 7, borrado: false }] }, null);
    const lote = N.armarLote(dbDe(conTokens()), r.espejo, { claves: [], marcarBorrados: false });
    assert.equal(lote.socios.length, 1);
    assert.equal(lote.socios[0].revision_base, 7);
    assert.equal(lote.socios[0].datos.selfieFoto, TOKEN('selfie'));
  });
});

describe('la ficha dice qué significa cada marca', () => {
  function nodoCon(tokens) {
    const nodos = tokens.map(t => ({
      tagName: 'IMG', alt: '', src: null, parentElement: null,
      atributos: { 'data-foto': t }, clases: [],
      classList: { add(c) { this.__p && this.__p.clases.push(c); } },
      getAttribute(k) { return this.atributos[k] === undefined ? null : this.atributos[k]; },
      setAttribute(k, v) { this.atributos[k] = v; },
      removeAttribute(k) { delete this.atributos[k]; }
    }));
    return { nodos, querySelectorAll: () => nodos };
  }
  const resolver = async valor => {
    const C = abrirPanel();
    C.ctx.__caja = nodoCon([valor]);
    await C.ev('resolverFotos(__caja)');
    return C.ctx.__caja.nodos[0].alt;
  };

  test('«otro aparato» manda a donde está, y dice por qué', async () => {
    const t = await resolver(OTRO);
    assert.match(t, /otro aparato/);
    assert.match(t, /no viajan/);
    assert.doesNotMatch(t, /no tiene una direcci/);
  });

  test('«se perdió» no manda a buscarla a ninguna parte que no sea el respaldo', async () => {
    const t = await resolver(PERDIDA);
    assert.match(t, /se perdió/);
    assert.match(t, /respaldo/);
    assert.doesNotMatch(t, /otro aparato/);
  });

  test('CONTROL: un valor que nadie conoce sigue diciendo lo de siempre', async () => {
    assert.match(await resolver('foto:quien-sabe'), /no tiene una direcci/);
  });

  test('la marca no se le pregunta a la nube: no gasta una petición en lo que allá no hay', async () => {
    const C = abrirPanel();
    C.ev('sbListo = function () { return true; }');
    let preguntas = 0;
    C.ctx.__contar = () => { preguntas++; return Promise.resolve({ fotos: {} }); };
    C.ev('archivosDe = __contar');
    C.ctx.__caja = nodoCon([OTRO, PERDIDA]);
    await C.ev('resolverFotos(__caja)');
    assert.equal(preguntas, 0);
  });

  test('si el registro del cliente sí tiene la foto, el puntero reemplaza a la marca', async () => {
    /* Con dbSinFotos de antes el campo quedaba vacío y traerFotosTardias lo volvía a
       llenar. Con la marca, el campo tiene algo: sin esto, nunca más la buscaría. */
    const C = abrirPanel();
    C.cargarCartera(dbDe(ficha({ selfieFoto: PERDIDA, cedulaFrenteFoto: FOTO, cedulaReversoFoto: FOTO })));
    C.ev("sbListo = function () { return true; }; vieneDeRegistro = function () { return true; }; verCliente = function () {}; _fichaVista = 's1';");
    C.ctx.__fotos = () => Promise.resolve({ fotos: { selfie: 'data:image/jpeg;base64,BBBB' } });
    C.ev('archivosDe = __fotos');
    await C.ev('traerFotosTardias(DB.socios[0])');
    assert.equal(C.ev('DB.socios[0].selfieFoto'), TOKEN('selfie'));
    assert.equal(C.ev('DB.socios[0].cedulaFrenteFoto'), FOTO, 'le tocó una foto que sí tenía');
  });
});
