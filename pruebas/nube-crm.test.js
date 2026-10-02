/* ===========================================================================
 * EL CRM SUBE SOLO — panel/nube-crm.js, Etapa 1 de RECETA-NUBE-CRM.md
 * 1 de octubre de 2026.
 *
 * Joan: «quiero ver este CRM desde mi celular». La primera entrega es que el
 * CRM del computador suba solo, para que el celular esté siempre al día. Subir
 * parece inofensivo y no lo es: un diff contra un espejo que miente es una
 * máquina de borrar con la bendición del control de revisiones. Estas pruebas
 * son los centinelas de la receta, corridos contra el nube.js de verdad y un
 * doble de panel_empujar con LAS TRES RAMAS del SQL:
 *     revisión null  → fila nueva (o choque si el aparato jura una revisión)
 *     revisión = base → escribe y sube uno
 *     otra            → CHOQUE, no escribe
 *
 *   · la invariante del espejo, con rondas al azar;
 *   · ningún borrado sin renglón en db.nubeBorrados, 200 rondas al azar;
 *   · la puerta del sello (incluida la escritura del MISMO largo);
 *   · el espejo que no cabe;
 *   · el choque congelado que no gotea;
 *   · la siembra con las migraciones de cargar();
 *   · el freno, por fichas y con nombres;
 *   · y que el CRM sigue abriendo sin NubeCRM y sin nube.
 *
 * El azar va con semilla fija: una prueba que cambia sola no se puede repetir.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const N = require('../panel/nube.js');
const { crear } = require('../panel/nube-crm.js');

const {
  RAIZ, KEY, ESPEJO, SELLO, ESTADO, DUENO, TABLAS, CAMPO, clon, azar, almacenDoble,
  servidor, fnv, pestana, RELOJ, montar, socio, credito, cartera, leerDisco, espejoDisco,
  congeladas, sembrar, invariante
} = require('./banco-nube-crm.js');

/* ======================================================================== */
describe('la subida y la invariante del espejo', () => {

  test('la primera vez empareja, sube todo y el espejo dice EXACTAMENTE lo que hay', async () => {
    const m = montar({ db: cartera(6, 2) });
    assert.equal(m.C.estado().cinta.fase, 'falta-emparejar', 'sin espejo no se puede subir nada');
    assert.equal(m.srv.lotes.length, 0);
    await m.C.emparejar();
    assert.ok(m.vent.modal, 'emparejar no le enseñó a Joan los montones antes de decidir');
    assert.match(m.vent.modal.h, /Solo acá · 18/, 'los 6 socios y 12 créditos tienen que salir como nuevos');
    assert.match(m.vent.modal.h, /Socio 0/, 'los montones van con NOMBRES, no solo cifras');
    assert.equal(m.srv.lotes.length, 0, 'emparejar subió algo antes del «sí»');
    const r = await m.C.confirmarEmparejar();
    assert.equal(r.resultado.completa, true);
    assert.equal(Object.keys(m.srv.socios).length, 6);
    assert.equal(Object.keys(m.srv.creditos).length, 12);
    assert.ok(m.srv.ajustes.asignaciones, 'las asignaciones (ajuste que solo suma) no subieron');
    assert.equal(m.srv.ajustes.config, undefined, 'config NO viaja en esta etapa');
    assert.equal(m.srv.ajustes.plantillas, undefined, 'plantillas NO viajan en esta etapa');
    invariante(m.alm, 'primera subida');
    /* Las fotos no viajan: ni las cuatro del socio ni la del comprobante. */
    const s0 = m.srv.socios.C0.datos, p0 = m.srv.creditos.P0.datos;
    assert.equal(s0.cedulaFrenteFoto, undefined, 'la cédula subió a la nube');
    assert.equal(s0.selfieFoto, undefined, 'la SELFIE subió a la nube (dato biométrico, Ley 1581)');
    assert.equal(p0.comprobantes[0].foto, undefined, 'la foto del comprobante subió');
    const est = m.C.estado();
    assert.equal(est.cinta.fase, 'al-dia');
    assert.match(est.cinta.l1, /GUARDADA está en la nube/);
    assert.equal(est.cinta.clase, 'calma');
    assert.match(est.cinta.l2, /v2026-10-01/, 'la cinta no lleva la versión: con caché vieja no hay cómo saberlo');
  });

  test('una vuelta sin cambios no llama a la nube', async () => {
    const m = montar({ db: cartera(3, 1) });
    await sembrar(m);
    const antes = m.srv.lotes.length;
    await m.C.vuelta(true);
    await m.C.vuelta(false);
    assert.equal(m.srv.lotes.length, antes, 'se mandó un lote vacío o repetido');
  });

  test('INVARIANTE con 40 rondas al azar: el PC edita, el celular edita, y nada se pisa sin choque', async () => {
    for (const semilla of [11, 23, 97]) {
      const r = azar(semilla);
      const m = montar({ db: cartera(8, 3) });
      await sembrar(m);
      let siguienteSocio = 8, siguienteCredito = 24;
      /* Lo que el celular tocó NO baja en esta etapa: en la nube puede ser distinto
         de la cartera sin que nadie haya perdido nada. */
      const delCelular = new Set();
      for (let ronda = 0; ronda < 40; ronda++) {
        const db = m.tab.leer();
        const tocadasPC = new Set(), tocadasCel = new Map();
        const acciones = 1 + Math.floor(r() * 3);
        for (let a = 0; a < acciones; a++) {
          const x = r();
          if (x < 0.35 && db.prestamos.length) {
            const p = db.prestamos[Math.floor(r() * db.prestamos.length)];
            p.abonos = (p.abonos || []).concat([{ fecha: '2026-10-0' + (1 + (ronda % 9)), monto: 1000 * (ronda + 1) }]);
            tocadasPC.add('creditos|' + p.id);
          } else if (x < 0.5 && db.prestamos.length) {
            const p = db.prestamos[Math.floor(r() * db.prestamos.length)];
            p.pagado = !p.pagado; p.fechaPagado = p.pagado ? '2026-10-01' : null;
            tocadasPC.add('creditos|' + p.id);
          } else if (x < 0.65) {
            const s = socio(siguienteSocio++); db.socios.push(s); db.contadores.cliente++;
            tocadasPC.add('socios|' + s.id);
          } else if (x < 0.75 && db.socios.length) {
            const p = credito(siguienteCredito++, Number(db.socios[0].id.slice(1)));
            db.prestamos.push(p); db.contadores.credito++;
            tocadasPC.add('creditos|' + p.id);
          } else {
            /* el celular cobra en la calle sobre una fila que ya está arriba */
            const ids = Object.keys(m.srv.creditos).filter(id => !m.srv.creditos[id].borrado);
            if (!ids.length) continue;
            const id = ids[Math.floor(r() * ids.length)];
            m.srv.celular('creditos', id, d => { d.montoRecibido = 5000 * (ronda + 1); });
            tocadasCel.set('creditos|' + id, m.srv.creditos[id].datos.montoRecibido);
            delCelular.add('creditos|' + id);
          }
        }
        m.tab.guardar(db);
        await m.C.vuelta(false);
        invariante(m.alm, 'semilla ' + semilla + ' ronda ' + ronda);
        /* Lo que cobró el celular SIGUE en la nube: o el PC no tocó la fila, o
           chocó y quedó congelada. Nunca pisada en silencio. */
        for (const [k, monto] of tocadasCel) {
          const id = k.split('|')[1];
          assert.equal(m.srv.creditos[id].datos.montoRecibido, monto,
            'semilla ' + semilla + ' ronda ' + ronda + ': el cobro del celular en ' + id + ' se perdió sin choque');
          if (tocadasPC.has(k)) assert.ok(congeladas(m.alm)[k], 'el PC y el celular tocaron ' + id + ' y no quedó congelada');
        }
        /* Y lo que no está congelado, en la nube es lo que tiene la cartera. */
        const cong = congeladas(m.alm), disco = leerDisco(m.alm);
        TABLAS.forEach(t => (disco[CAMPO[t]] || []).forEach(f => {
          if (cong[t + '|' + f.id] || delCelular.has(t + '|' + f.id)) return;
          assert.equal(N.jsonCanonico(m.srv[t][f.id].datos), N.jsonCanonico(N.sinFotos(f)),
            'semilla ' + semilla + ' ronda ' + ronda + ': ' + f.id + ' no quedó en la nube como en la cartera');
        }));
      }
    }
  });

  test('la vuelta sube en pedazos de 50 y anota cada pedazo antes del siguiente', async () => {
    const m = montar({ db: cartera(40, 2) });
    await sembrar(m);
    const lotes = m.srv.lotes;
    assert.ok(lotes.length >= 3, 'se esperaban varios pedazos, hubo ' + lotes.length);
    lotes.forEach(l => {
      const n = TABLAS.concat(['ajustes']).reduce((s, t) => s + (l[t] || []).length, 0);
      assert.ok(n <= 50, 'un pedazo de ' + n + ' filas');
    });
    /* entre dos empujar, el espejo se escribió: la ventana «confirmado arriba,
       sin anotar abajo» es de un solo pedazo */
    const escr = m.alm.escrituras.filter(k => k === ESPEJO).length;
    assert.ok(escr >= lotes.length, 'el espejo se escribió ' + escr + ' veces para ' + lotes.length + ' pedazos');
  });
});

/* ======================================================================== */
describe('ningún borrado sin renglón (RECETA, centinela de la Etapa 1)', () => {

  test('200 rondas al azar: quitar filas, cartera vieja, modo equipo, importar, traer, lectura a medias', async () => {
    const r = azar(20261001);
    const m = montar({ db: cartera(12, 2) });
    await sembrar(m);
    const viejas = [leerDisco(m.alm)];
    let borradosDeVerdad = 0, rondasConLote = 0;
    const escenarios = {};
    for (let ronda = 0; ronda < 200; ronda++) {
      const desde = m.srv.lotes.length;
      /* Tras una lectura a medias, la pestaña vuelve a escribir lo que tiene en
         memoria: es lo que pasa con el siguiente guardar(). */
      let db;
      try { db = m.tab.leer(); } catch (e) { db = clon(viejas[viejas.length - 1]); m.tab.guardar(db); }
      const x = r();
      let esc;
      if (x < 0.15) {
        /* quitar filas a pelo, sin renglón: lo que deja una cartera a medias */
        esc = 'quitar-filas';
        db.prestamos = db.prestamos.filter(() => r() > 0.4);
        db.socios = db.socios.filter(() => r() > 0.2);
        m.tab.guardar(db);
      } else if (x < 0.27) {
        /* la cartera de las 8:00 escrita por la misma pestaña (el sello cuadra) */
        esc = 'cartera-vieja';
        m.tab.guardar(clon(viejas[Math.floor(r() * viejas.length)]));
      } else if (x < 0.37) {
        /* modoEquipo(): DB vacía, y alguien llama a guardar() */
        esc = 'vaciar';
        m.tab.guardar({ socios: [], prestamos: [], respaldados: [], papelera: [], papeleraSocios: [],
          invitaciones: [], plantillas: {}, config: { negocio: 'Tu Garantía' },
          contadores: { cliente: 0, credito: 0, respaldado: 0 },
          equipo: [], asignaciones: [], prospectos: [], bases: [], actosComision: [] });
      } else if (x < 0.47) {
        /* importar(): reemplaza la cartera y borra espejo y sello */
        esc = 'importar';
        m.alm.setItem(KEY, JSON.stringify(viejas[Math.floor(r() * viejas.length)]));
        m.alm.removeItem(ESPEJO); m.alm.removeItem(SELLO);
      } else if (x < 0.55) {
        /* traer.html: escribe la cartera con lo de la nube y borra espejo y sello */
        esc = 'traer';
        const p = await m.srv.traer(null);
        m.alm.setItem(KEY, JSON.stringify(N.aplicarPaquete(null, p).db));
        m.alm.removeItem(ESPEJO); m.alm.removeItem(SELLO);
      } else if (x < 0.6) {
        /* una lectura a medias: el texto cortado */
        esc = 'lectura-a-medias';
        const t = m.alm.getItem(KEY) || '{}';
        m.alm.setItem(KEY, t.slice(0, Math.floor(t.length / 2)));
      } else if (x < 0.8 && db.prestamos.length) {
        /* el borrado DE VERDAD: papelera + renglón, en el mismo guardar() */
        esc = 'borrado-legitimo';
        const p = db.prestamos[Math.floor(r() * db.prestamos.length)];
        db.papelera = (db.papelera || []).concat([p]);
        db.prestamos = db.prestamos.filter(q => q.id !== p.id);
        db.nubeBorrados = (db.nubeBorrados || []).concat([{ tabla: 'creditos', id: p.id, cuando: '2026-10-01' }]);
        m.tab.guardar(db);
      } else {
        /* trabajo normal: una ficha nueva o un abono */
        esc = 'normal';
        if (r() < 0.5 || !db.prestamos.length) { const n = 100 + ronda; db.socios.push(socio(n)); db.prestamos.push(credito(n, n)); }
        else db.prestamos[0].abonos = (db.prestamos[0].abonos || []).concat([{ fecha: '2026-10-02', monto: ronda + 1 }]);
        m.tab.guardar(db);
        viejas.push(leerDisco(m.alm));
      }
      escenarios[esc] = (escenarios[esc] || 0) + 1;
      /* La cartera que el disco tiene AHORA es la que manda. */
      let renglones = new Set();
      try { (JSON.parse(m.alm.getItem(KEY)).nubeBorrados || []).forEach(b => renglones.add(b.tabla + '|' + b.id)); } catch (e) { renglones = new Set(); }

      /* La pestaña de verdad recarga cuando la cinta se lo pide (sello roto). */
      let est = m.C.estado();
      if (est.cinta.fase === 'sello-roto' && r() < 0.7) { await m.C.accion(); est = m.C.estado(); }
      else await m.C.vuelta(false);
      if (m.C.estado().cinta.fase === 'falta-emparejar' && r() < 0.8) { await m.C.emparejar(); await m.C.confirmarEmparejar(); }
      if (m.C.estado().cinta.fase === 'borrados-esperan') await m.C.accion();

      const nuevos = m.srv.lotes.slice(desde);
      if (nuevos.length) rondasConLote++;
      nuevos.forEach(l => TABLAS.forEach(t => (l[t] || []).forEach(f => {
        if (!f.borrado) return;
        assert.ok(renglones.has(t + '|' + f.id),
          'ronda ' + ronda + ' (' + esc + '): se mandó BORRADO ' + t + '/' + f.id + ' sin renglón en nubeBorrados');
        borradosDeVerdad++;
      })));
    }
    /* Una prueba que no ve borrados de verdad no prueba que los deje pasar. */
    assert.ok(borradosDeVerdad >= 5, 'solo ' + borradosDeVerdad + ' borrados legítimos llegaron: la prueba se volvió muda');
    assert.ok(rondasConLote >= 40, 'solo ' + rondasConLote + ' rondas subieron algo');
    ['quitar-filas', 'cartera-vieja', 'vaciar', 'importar', 'traer', 'lectura-a-medias', 'borrado-legitimo']
      .forEach(e => assert.ok(escenarios[e] >= 3, 'el escenario «' + e + '» casi no salió: ' + (escenarios[e] || 0)));
  });

  test('una fila VIVA en la cartera no se borra aunque esté en la lista', () => {
    /* Un respaldo importado con una lista vieja no puede matar una ficha viva. */
    const esp = { socios: { C1: { revision: 3, json: '{"id":"C1"}' } }, creditos: {}, respaldados: {} };
    const db = { socios: [{ id: 'C1' }], prestamos: [], respaldados: [], nubeBorrados: [{ tabla: 'socios', id: 'C1' }] };
    const C = crear({ nube: N, almacen: almacenDoble() });
    assert.deepEqual(C._puro.borradosExplicitos(db, esp), []);
  });

  test('y una que la nube no tiene, o que ya está borrada allá, tampoco viaja', () => {
    const esp = { socios: { C2: { revision: 4, json: '{"id":"C2"}', borrado: true } }, creditos: {}, respaldados: {} };
    const db = { socios: [], prestamos: [], respaldados: [],
      nubeBorrados: [{ tabla: 'socios', id: 'C2' }, { tabla: 'creditos', id: 'P9' }] };
    const C = crear({ nube: N, almacen: almacenDoble() });
    assert.deepEqual(C._puro.borradosExplicitos(db, esp), []);
  });

  /* 1-oct-2026 (segunda vuelta) — antes la fila viajaba con el último dato
     conocido y la ficha borrada se quedaba entera en la nube (Ley 1581). Ahora
     viaja vacía; el último dato se queda AFUERA de la fila, solo para el freno. */
  test('el borrado sale contra la revisión del espejo, SIN datos; lo conocido queda afuera para el freno', () => {
    const esp = { socios: {}, creditos: { P1: { revision: 7, json: '{"capital":300000,"id":"P1","socioId":"C1"}' } }, respaldados: {} };
    const db = { socios: [], prestamos: [], respaldados: [], nubeBorrados: [{ tabla: 'creditos', id: 'P1' }] };
    const C = crear({ nube: N, almacen: almacenDoble() });
    const b = C._puro.borradosExplicitos(db, esp);
    assert.equal(b.length, 1);
    assert.deepEqual(b[0].fila, { id: 'P1', datos: null, revision_base: 7, borrado: true });
    assert.deepEqual(b[0].datos, { capital: 300000, id: 'P1', socioId: 'C1' });
  });
});

/* ======================================================================== */
describe('la puerta del sello', () => {

  test('alguien escribe la cartera por fuera: la vuelta NO manda nada y la cinta queda en rojo', async () => {
    const m = montar({ db: cartera(4, 1) });
    await sembrar(m);
    const antes = m.srv.lotes.length;
    /* importar/otra pestaña/subir.html: la cartera cambia y el sello no */
    const db = leerDisco(m.alm);
    db.prestamos[0].abonos.push({ fecha: '2026-10-01', monto: 50000 });
    m.alm.setItem(KEY, JSON.stringify(db));
    await m.C.vuelta(true);
    assert.equal(m.srv.lotes.length, antes, 'se subió una cartera que esta pestaña no escribió');
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'sello-roto');
    assert.equal(e.cinta.clase, 'mal');
    assert.match(e.cinta.l2, /subir\.html, traer\.html o un respaldo importado/);
  });

  test('una escritura ajena del MISMO LARGO también se caza (260.000 → 240.000)', async () => {
    const m = montar({ db: cartera(3, 1) });
    await sembrar(m);
    const antes = m.srv.lotes.length;
    const t = m.alm.getItem(KEY);
    const db = JSON.parse(t);
    db.prestamos[0].capital = 200000; /* era 100000: mismo largo */
    const t2 = JSON.stringify(db);
    assert.equal(t2.length, t.length, 'la prueba necesita el mismo largo');
    m.alm.setItem(KEY, t2);
    await m.C.vuelta(true);
    assert.equal(m.srv.lotes.length, antes, 'el largo no cambió y la puerta la dejó pasar: hace falta la huella');
    assert.equal(m.C.estado().cinta.fase, 'sello-roto');
  });

  test('recargar desde la cinta vuelve a sellar y la subida sigue', async () => {
    const m = montar({ db: cartera(3, 1) });
    await sembrar(m);
    const db = leerDisco(m.alm);
    db.socios[0].nombre = 'Socio cambiado por fuera';
    m.alm.setItem(KEY, JSON.stringify(db));
    await m.C.vuelta(true);
    assert.equal(m.C.estado().cinta.fase, 'sello-roto');
    await m.C.accion();   // el botón: DB=cargar(); sello; render()
    assert.equal(m.srv.socios.C0.datos.nombre, 'Socio cambiado por fuera');
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
  });

  test('otra pestaña VIVA con la misma cartera: esta no sube, sin rojo', async () => {
    const alm = almacenDoble();
    const m = montar({ alm, db: cartera(3, 1) });
    await sembrar(m);
    /* la pestaña B abre y entra con el PIN: lee y reclama */
    const B = pestana(alm, 'B');
    B.leer(); B.reclamar();
    alm.setItem(DUENO, JSON.stringify({ id: 'B', latido: RELOJ, enVuelta: false }));
    const db = m.tab.leer(); // A no escribe nada; solo mira
    void db;
    const antes = m.srv.lotes.length;
    await m.C.vuelta(false);
    assert.equal(m.srv.lotes.length, antes);
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'otra-pestana');
    assert.equal(e.cinta.clase, 'neutro', 'dos pestañas abiertas no es una alarma');
  });

  test('si la otra pestaña murió, esta retoma sola el turno', async () => {
    const alm = almacenDoble();
    const m = montar({ alm, db: cartera(3, 1) });
    await sembrar(m);
    const B = pestana(alm, 'B');
    B.leer(); B.reclamar();
    alm.setItem(DUENO, JSON.stringify({ id: 'B', latido: RELOJ - 10 * 60000, enVuelta: false }));
    /* A guarda algo: guardar() reclama el sello porque escribió */
    const db = m.tab.leer();
    db.prestamos[0].pagado = true;
    m.tab.guardar(db);
    await m.C.vuelta(false);
    assert.equal(m.srv.creditos.P0.datos.pagado, true);
  });

  test('LA PESTAÑA VIEJA que guarda encima: el espejo se suelta y el cobro del celular sobrevive', async () => {
    /* El escenario de la receta: la pestaña de las 8:00 escribe encima de lo
       que otra escribió a las 10:00. La puerta solo mira en cada vuelta; si la
       vieja guarda ANTES, sin esta cura su cartera retrocedida ya lleva sello. */
    const alm = almacenDoble();
    const A = montar({ alm, db: cartera(3, 1) });
    await sembrar(A);
    const B = pestana(alm, 'B');
    const memoriaB = B.leer();                    // B abre a las 8:00
    const dbA = A.tab.leer();                     // A sigue trabajando
    dbA.prestamos[0].abonos.push({ fecha: '2026-10-01', monto: 70000 });
    A.tab.guardar(dbA);
    await A.C.vuelta(false);                      // el abono sube
    assert.equal(A.srv.creditos.P0.datos.abonos.length, 1);
    memoriaB.socios[0].telefono = '3119999999';   // B edita su copia vieja
    B.guardar(memoriaB);                          // y guarda ENCIMA
    assert.equal(alm.getItem(ESPEJO), null, 'la pestaña vieja pisó la cartera y el espejo siguió afirmándola');
    /* B pasa a ser la que sube; empareja y NO pisa el abono */
    const mB = montar({ alm, srv: A.srv, tab: B });
    await mB.C.emparejar();
    /* Las DOS fichas salen en discusión: el crédito con el abono (lo cambió la
       nube) y el socio con el teléfono (lo cambió B). Sin espejo no hay forma
       de saber de qué lado cambió cada una, y por eso no se pisa ninguna. */
    assert.match(mB.vent.modal.h, /Distintas · 2/, 'el crédito con el abono tenía que salir en discusión');
    await mB.C.confirmarEmparejar();
    assert.equal(A.srv.creditos.P0.datos.abonos.length, 1, 'EL ABONO DEL CELULAR SE PERDIÓ');
    assert.ok(congeladas(alm)['creditos|P0'], 'el crédito en discusión no quedó congelado');
    assert.ok(congeladas(alm)['socios|C0'], 'el teléfono que cambió B se subió sin que Joan decidiera');
    assert.notEqual(A.srv.socios.C0.datos.telefono, '3119999999');
    assert.equal(mB.C.estado().cinta.fase, 'congeladas');
  });
});

/* ======================================================================== */
describe('el espejo que no cabe', () => {

  test('la vuelta aborta, el espejo en disco queda EXACTO, y la cinta dice por qué con las dos cifras', async () => {
    const m = montar({ db: cartera(4, 1) });
    await sembrar(m);
    const db = m.tab.leer();
    db.prestamos[0].pagado = true;
    m.tab.guardar(db);
    const espejoAntes = m.alm.getItem(ESPEJO);
    m.alm.llenas[ESPEJO] = true;
    const r = await m.C.vuelta(true);
    assert.equal(m.alm.getItem(ESPEJO), espejoAntes, 'el espejo en disco cambió aunque no cupo');
    assert.equal(r.resultado.completa, false, 'la vuelta siguió como si nada');
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'espejo-no-cabe');
    assert.equal(e.cinta.clase, 'mal');
    assert.match(e.cinta.l2, /pesa [\d.,]+ KB y el espejo [\d.,]+ KB/, 'no dice las dos cifras');
    /* Lo que subió, subió: la cinta no puede decir que se perdió */
    assert.match(e.cinta.l2, /lo ya subido está bien/);
    assert.equal(m.srv.creditos.P0.datos.pagado, true);
  });

  test('si el espejo no cabe al emparejar, no se da por emparejado', async () => {
    const m = montar({ db: cartera(2, 1) });
    await m.C.emparejar();
    m.alm.llenas[ESPEJO] = true;
    await m.C.confirmarEmparejar();
    assert.equal(m.alm.getItem(ESPEJO), null);
    assert.equal(m.srv.lotes.length, 0, 'subió sin espejo');
    assert.equal(m.C.estado().cinta.fase, 'espejo-no-cabe', 'la cinta no dice por qué no se emparejó');
    /* liberado el espacio, el clic vuelve a ofrecer emparejar */
    m.alm.llenas[ESPEJO] = false;
    await m.C.accion();
    assert.ok(m.vent.modal, 'tras liberar espacio, el clic no volvió a ofrecer emparejar');
  });
});

/* ======================================================================== */
describe('el choque congelado', () => {

  test('no vuelve a salir en el lote, no gotea panel_choques, y lo demás sigue subiendo', async () => {
    const m = montar({ db: cartera(4, 1) });
    await sembrar(m);
    m.srv.celular('creditos', 'P1', d => { d.montoRecibido = 240000; d.pagado = true; });
    let db = m.tab.leer();
    db.prestamos[1].pagado = true; db.prestamos[1].montoRecibido = 260000;
    m.tab.guardar(db);
    await m.C.vuelta(false);
    assert.equal(m.srv.creditos.P1.datos.montoRecibido, 240000, 'el cobro del celular se pisó');
    assert.equal(m.srv.choquesTabla, 1);
    /* las dos versiones, en disco */
    const ch = JSON.parse(m.alm.getItem('joan_panel_choques') || '[]');
    assert.equal(ch.length, 1);
    assert.equal(ch[0].mio.montoRecibido, 260000);
    assert.equal(ch[0].suyo.montoRecibido, 240000);
    assert.equal(ch[0].dispositivo, 'computador');
    assert.ok(congeladas(m.alm)['creditos|P1']);
    /* Y el orden: las dos versiones a disco ANTES de mover el espejo. */
    const i = m.alm.escrituras.lastIndexOf('joan_panel_choques'), j = m.alm.escrituras.lastIndexOf(ESPEJO);
    assert.ok(i > -1 && i < j, 'el espejo se movió antes de guardar las dos versiones del choque');

    for (let k = 0; k < 3; k++) {
      db = m.tab.leer();
      db.socios[k].notaRiesgo = 'vuelta ' + k;
      m.tab.guardar(db);
      const desde = m.srv.lotes.length;
      await m.C.vuelta(false);
      const nuevos = m.srv.lotes.slice(desde);
      nuevos.forEach(l => assert.ok(!(l.creditos || []).some(f => f.id === 'P1'), 'la fila congelada volvió a salir'));
      assert.equal(m.srv.socios['C' + k].datos.notaRiesgo, 'vuelta ' + k, 'un choque apagó la subida de lo demás');
    }
    assert.equal(m.srv.choquesTabla, 1, 'panel_choques goteó: el mismo choque se insertó otra vez');
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'congeladas');
    assert.equal(e.cinta.clase, 'mal');
    assert.match(e.cinta.l2, /☁ Subir/, 'no dice dónde se decide');
  });

  test('cuando subir.html decide y mueve el espejo, la fila se suelta', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    m.srv.celular('creditos', 'P0', d => { d.pagado = true; });
    const db = m.tab.leer(); db.prestamos[0].montoRecibido = 1; m.tab.guardar(db);
    await m.C.vuelta(false);
    assert.ok(congeladas(m.alm)['creditos|P0']);
    /* subir.html «dejar lo de la nube»: escribe cartera Y espejo a la revisión del servidor */
    const p = await m.srv.traer(null);
    const fila = p.creditos.find(f => f.id === 'P0');
    const db2 = m.tab.leer();
    db2.prestamos[0] = Object.assign({}, fila.datos);
    m.alm.setItem(KEY, JSON.stringify(db2));
    const esp = espejoDisco(m.alm);
    esp.creditos.P0 = { revision: fila.revision, json: N.jsonCanonico(fila.datos), borrado: false };
    m.alm.setItem(ESPEJO, JSON.stringify(esp));
    await m.C.accion();   // la puerta pide recargar (subir.html escribió la cartera)
    assert.equal(congeladas(m.alm)['creditos|P0'], undefined, 'resuelta en subir.html y sigue congelada');
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
  });
});

/* ======================================================================== */
describe('la siembra con las migraciones de cargar()', () => {

  test('cartera con los campos de cargar() + nube cruda + espejo vacío → cero «distintas», nada con revision_base null', async () => {
    const srv = servidor();
    /* lo que subió subir.html: la forma CRUDA, sin los campos que cargar() agrega */
    const crudo = cartera(5, 2);
    crudo.socios.forEach(s => { delete s.notaRiesgo; delete s.ajusteGarantia; delete s.telefono2; });
    await srv.empujar('computador', N.armarLote(crudo, N.espejoVacio(), { claves: ['asignaciones'], marcarBorrados: false }));
    const lotesAntes = srv.lotes.length;
    const m = montar({ srv, db: cartera(5, 2) });
    await m.C.emparejar();
    assert.doesNotMatch(m.vent.modal.h, /Distintas/, 'la siembra puso en discusión fichas que solo tienen los campos de cargar()');
    await m.C.confirmarEmparejar();
    srv.lotes.slice(lotesAntes).forEach(l => TABLAS.forEach(t => (l[t] || []).forEach(f => {
      assert.notEqual(f.revision_base, null, 'la primera subida mandó ' + f.id + ' como nueva y el servidor ya la tenía');
    })));
    assert.equal(srv.choquesTabla, 0, 'la siembra fabricó choques');
    invariante(m.alm, 'siembra');
  });

  test('la ficha BORRADA en la nube y viva acá no se adopta ni resucita', async () => {
    const srv = servidor();
    const db = cartera(2, 0);
    await srv.empujar('computador', N.armarLote(db, N.espejoVacio(), { claves: [], marcarBorrados: false }));
    srv.socios.C1.borrado = true; srv.socios.C1.revision++;
    const m = montar({ srv, db });
    await m.C.emparejar();
    assert.match(m.vent.modal.h, /Borradas en la nube y vivas acá · 1/);
    await m.C.confirmarEmparejar();
    assert.equal(srv.socios.C1.borrado, true, 'la subida resucitó una ficha borrada en la nube');
    assert.ok(congeladas(m.alm)['socios|C1']);
  });

  test('los ajustes idénticos se adoptan; los distintos se congelan, no se pisan', async () => {
    const srv = servidor();
    const db = cartera(1, 0);
    db.actosComision = [{ tipo: 'desbloqueo', asesor_id: 'E1', socio_id: 'C0', credito_id: 'P0', fecha: '2026-09-30' }];
    await srv.empujar('computador', N.armarLote(db, N.espejoVacio(), { claves: ['asignaciones', 'actosComision'], marcarBorrados: false }));
    /* el celular suma una asignación en la nube */
    srv.ajustes.asignaciones.datos = srv.ajustes.asignaciones.datos.concat([{ socio_id: 'C9', asesor_id: 'E2', desde: '2026-10-01' }]);
    srv.ajustes.asignaciones.revision++;
    const m = montar({ srv, db });
    await sembrar(m);
    assert.equal(srv.ajustes.asignaciones.datos.length, 2, 'la lista del celular se pisó con la del computador');
    assert.ok(congeladas(m.alm)['ajustes|asignaciones']);
    assert.equal(congeladas(m.alm)['ajustes|actosComision'], undefined, 'un ajuste idéntico quedó en discusión');
    assert.equal(srv.choquesTabla, 0);
  });
});

/* ======================================================================== */
describe('el freno de borrados, por fichas y con nombres', () => {

  test('borrar UN cliente con seis créditos no frena (son 7 filas, pero una ficha)', async () => {
    const m = montar({ db: cartera(28, 0) });
    let db = m.tab.leer();
    for (let i = 0; i < 6; i++) db.prestamos.push(credito(100 + i, 5));
    m.tab.guardar(db);
    await sembrar(m);
    db = m.tab.leer();
    const ps = db.prestamos.filter(p => p.socioId === 'C5');
    db.socios = db.socios.filter(s => s.id !== 'C5');
    db.prestamos = db.prestamos.filter(p => p.socioId !== 'C5');
    db.nubeBorrados = [{ tabla: 'socios', id: 'C5' }].concat(ps.map(p => ({ tabla: 'creditos', id: p.id })));
    m.tab.guardar(db);
    await m.C.vuelta(false);
    assert.equal(m.srv.socios.C5.borrado, true, 'el freno paró el borrado de un solo cliente');
    assert.ok(ps.every(p => m.srv.creditos[p.id].borrado), 'sus créditos no se borraron con él');
    assert.equal(m.vent.confirmes.length, 0, 'se le preguntó a Joan por un borrado normal');
  });

  test('cuatro fichas: se frenan los borrados, lo demás sube, y el sí lleva los nombres', async () => {
    const m = montar({ db: cartera(28, 1) });
    await sembrar(m);
    const db = m.tab.leer();
    const van = ['C1', 'C2', 'C3', 'C4'];
    db.nubeBorrados = [];
    van.forEach(id => {
      db.nubeBorrados.push({ tabla: 'socios', id });
      db.prestamos.filter(p => p.socioId === id).forEach(p => db.nubeBorrados.push({ tabla: 'creditos', id: p.id }));
    });
    db.socios = db.socios.filter(s => !van.includes(s.id));
    db.prestamos = db.prestamos.filter(p => !van.includes(p.socioId));
    db.socios[0].notaRiesgo = 'esto sí sube';
    m.tab.guardar(db);
    await m.C.vuelta(false);
    assert.equal(m.srv.socios.C0.datos.notaRiesgo, 'esto sí sube', 'el freno paró TODO el lote');
    assert.equal(m.srv.socios.C1.borrado, false, 'el freno dejó pasar cuatro fichas sin preguntar');
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'borrados-esperan');
    assert.match(e.cinta.l1, /4 fichas borradas esperan tu sí/);
    m.vent.confirmar = false;
    await m.C.accion();
    assert.match(m.vent.confirmes[0], /Socio 1 · CL-0002 y su crédito/, 'el sí no lleva los nombres');
    assert.equal(m.srv.socios.C1.borrado, false, 'Joan dijo que no y se borró igual');
    m.vent.confirmar = true;
    await m.C.accion();
    van.forEach(id => assert.equal(m.srv.socios[id].borrado, true, id + ' no se borró tras el sí'));
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
  });

  test('frenoPorFichas: el tope es el mayor entre 3 y el 5% de las fichas del espejo', () => {
    const C = crear({ nube: N, almacen: almacenDoble() });
    const esp = n => { const e = { socios: {} }; for (let i = 0; i < n; i++) e.socios['C' + i] = { revision: 1, json: '{}' }; return e; };
    const borr = n => Array.from({ length: n }, (_, i) => ({ tabla: 'socios', fila: { id: 'C' + i, datos: {} } }));
    assert.equal(C._puro.frenoPorFichas(borr(3), esp(28)).frena, false);
    assert.equal(C._puro.frenoPorFichas(borr(4), esp(28)).frena, true);
    assert.equal(C._puro.frenoPorFichas(borr(40), esp(1000)).frena, false, 'con mil fichas el tope es 50');
    assert.equal(C._puro.frenoPorFichas(borr(51), esp(1000)).frena, true);
  });
});

/* ======================================================================== */
describe('lo que no puede hacer nunca', () => {

  test('NubeCRM no escribe la cartera por ningún camino', async () => {
    const m = montar({ db: cartera(5, 2) });
    const antes = m.alm.escrituras.filter(k => k === KEY).length;
    await sembrar(m);
    const db = m.tab.leer(); db.prestamos[0].pagado = true; m.tab.guardar(db);
    const tras = m.alm.escrituras.filter(k => k === KEY).length;
    await m.C.vuelta(true);
    await m.C.accion();
    m.srv.celular('creditos', 'P0', d => { d.x = 1; });
    const db2 = m.tab.leer(); db2.prestamos[0].y = 2; m.tab.guardar(db2);
    const tras2 = m.alm.escrituras.filter(k => k === KEY).length;
    await m.C.vuelta(false);
    assert.equal(antes, 1);
    assert.equal(tras, 2);
    assert.equal(m.alm.escrituras.filter(k => k === KEY).length, tras2, 'NubeCRM escribió joan_socios_v1');
    assert.throws(() => m.C._puro.escribirTexto(KEY, '{}'), /no escribe nunca joan_socios_v1/);
  });

  test('sin conectar: no llama a la nube, no pregunta nada, y dice UNA cosa con calma', async () => {
    const m = montar({ db: cartera(3, 1), conectado: false });
    await m.C.vuelta(true);
    await m.C.vuelta(false);
    await m.C.accion();
    assert.equal(m.srv.lotes.length, 0);
    assert.equal(m.vent.confirmes.length, 0, 'se le preguntó algo a Joan sin estar conectado');
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'sin-conectar');
    assert.equal(e.cinta.clase, 'neutro', 'sin conectar no es una alarma');
    assert.match(e.cinta.l2, /Conéctate una vez en <a href="subir\.html" target="_blank" rel="noopener">☁ Subir<\/a>/);
    /* y no se programa ningún reintento: lo único programado es el arranque */
    assert.ok(m.timers.every(t => t.ms === 2000 || t.ms === 400), 'sin conexión se programó un reintento: ' +
      m.timers.map(t => t.ms).join(','));
  });

  test('sin señal: no se intenta nada y se dice que todo queda guardado acá', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    const db = m.tab.leer(); db.prestamos[0].pagado = true; m.tab.guardar(db);
    m.estadoRed.enLinea = false;
    const antes = m.srv.lotes.length;
    await m.C.vuelta(true);
    assert.equal(m.srv.lotes.length, antes);
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'sin-senal');
    assert.match(e.cinta.l1, /Sin señal — todo queda guardado acá/);
    assert.match(e.cinta.l2, /1 cambio espera subir/);
  });

  test('apagado (modo equipo): la vuelta no hace nada', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    m.C.apagar();
    const db = m.tab.leer(); db.prestamos[0].pagado = true; m.tab.guardar(db);
    const antes = m.srv.lotes.length;
    await m.C.vuelta(true);
    m.C.algoCambio();
    assert.equal(m.srv.lotes.length, antes);
  });

  test('«Tu cartera GUARDADA» solo con nada pendiente, congelado ni fallido', async () => {
    const m = montar({ db: cartera(2, 1) });
    await sembrar(m);
    assert.equal(m.C.estado().cinta.fase, 'al-dia');
    const db = m.tab.leer(); db.prestamos[0].pagado = true; m.tab.guardar(db);
    m.C.algoCambio();
    /* antes de la vuelta: el disco tiene algo que la nube no */
    m.timers.filter(t => t.ms === 400).forEach(t => t.f());
    const e = m.C.estado();
    assert.equal(e.cinta.fase, 'pendientes');
    assert.doesNotMatch(e.cinta.l1, /está en la nube/);
    assert.match(e.cinta.l1, /1 cambio esperando subir/);
    /* los 90 s de quietud */
    assert.ok(m.timers.some(t => t.ms === 90000), 'algoCambio no programó la subida tras 90 s de calma');
  });

  test('los contadores se siembran una vez, y solo si subieron', async () => {
    const m = montar({ db: cartera(3, 1) });
    await sembrar(m);
    assert.deepEqual(m.srv.sembrados, [['cliente', 3], ['credito', 3]]);
    await m.C.vuelta(true);
    assert.equal(m.srv.sembrados.length, 2, 'se volvió a sembrar sin que nada subiera');
    const db = m.tab.leer(); db.socios.push(socio(50)); db.contadores.cliente = 4; m.tab.guardar(db);
    await m.C.vuelta(false);
    assert.deepEqual(m.srv.sembrados[2], ['cliente', 4]);
  });

  test('el detector de números repetidos dice cuál y de quién', () => {
    const C = crear({ nube: N, almacen: almacenDoble() });
    const db = { socios: [{ id: 'a', numero: 49, nombre: 'Ana' }, { id: 'b', numero: 49, nombre: 'Luis' }, { id: 'c', numero: 50, nombre: 'Eva' }],
                 prestamos: [], respaldados: [] };
    const r = C._puro.numerosRepetidos(db);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].nombres, ['Ana', 'Luis']);
  });
});

/* ======================================================================== */
describe('el CRM de verdad (crm.html en el banco de pruebas)', () => {
  const { abrirPanel } = require('./banco-panel.js');
  const conNubeCRM = P => vm.runInContext(fs.readFileSync(path.join(RAIZ, 'panel', 'nube-crm.js'), 'utf8'), P.ctx, { filename: 'nube-crm.js' });
  const entrar = P => { P.ev('document.getElementById("pinInput").value = DB.config.pin'); P.ev('entrar()'); };

  test('SIN NubeCRM (el archivo no llegó): abre, entra y guarda igual', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    assert.equal(P.ev('typeof NubeCRM'), 'undefined');
    entrar(P);
    assert.equal(P.ev('guardar()'), true);
    assert.ok(P.almacen[SELLO], 'guardar() no dejó sello');
  });

  test('CON NubeCRM y sin nube configurada: entra, la barra lo dice con calma y nada revienta', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    conNubeCRM(P);
    assert.equal(P.ev('typeof NubeCRM'), 'object', 'nube-crm.js no se publicó como window.NubeCRM');
    entrar(P);
    const barra = P.elems.nubeBarra && P.elems.nubeBarra.innerHTML;
    assert.match(barra || '', /Sin conectar a la nube/, 'la barra de Ajustes no dice que falta conectarse');
    assert.match(barra, /href="subir\.html"/, 'no dice dónde conectarse');
    assert.match(barra, /Todavía no baja nada/, 'no dice que esta etapa no baja');
    assert.match(barra, /selfie es dato biométrico/, 'no dice que las fotos no viajan');
    assert.equal(P.ev('guardar()'), true);
    assert.equal((P.ctx._avisos || []).length, 0, 'saltó un alert');
  });

  test('entrar() reclama el sello para esta pestaña; abrir sin el PIN, no', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    P.ev('_selloDesdeDisco(false)');
    conNubeCRM(P);
    assert.equal(P.almacen[SELLO], undefined, 'una pestaña en la pantalla del PIN le quitó el turno a la que trabaja');
    entrar(P);
    const s = JSON.parse(P.almacen[SELLO]);
    assert.equal(s.quien, P.ev('_TAB'));
    assert.equal(s.largo, P.almacen[KEY].length);
    assert.equal(s.huella, fnv(P.almacen[KEY]), 'la huella de crm.html y la de esta prueba se separaron');
  });

  test('la huella de crm.html es la misma FNV que usa la pestaña de mentira', () => {
    const P = abrirPanel();
    for (const t of ['', 'a', '{"socios":[]}', 'ñandú · 260.000', 'x'.repeat(5000)]) {
      assert.equal(P.ev('_huella(' + JSON.stringify(t) + ')'), fnv(t));
    }
  });

  test('guardar() sobre una cartera que escribió OTRO suelta el espejo; sobre la propia, no', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    P.ev('_selloDesdeDisco(false)');
    P.almacen[ESPEJO] = '{"socios":{"C0":{"revision":3,"json":"{}"}}}';
    assert.equal(P.ev('guardar()'), true);
    assert.ok(P.almacen[ESPEJO], 'guardar() soltó el espejo sin que nadie más escribiera');
    /* otra pestaña escribe la cartera por fuera */
    const otra = JSON.parse(P.almacen[KEY]); otra.socios[0].telefono = '3000000001';
    P.almacen[KEY] = JSON.stringify(otra);
    assert.equal(P.ev('guardar()'), true);
    assert.equal(P.almacen[ESPEJO], undefined, 'la pestaña vieja pisó la cartera ajena y el espejo la siguió afirmando');
    const s = JSON.parse(P.almacen[SELLO]);
    assert.equal(s.largo, P.almacen[KEY].length, 'el sello no describe lo que quedó en el disco');
  });

  test('guardar() SIN espacio que salva sin fotos también sella; si no salva nada, no', () => {
    const P = abrirPanel({ topeKB: 4 });
    P.ev('DB.socios=[{id:"s1",nombre:"Ana",selfieFoto:"data:image/jpeg;base64,' + 'A'.repeat(6000) + '"}]; DB.prestamos=[];');
    assert.equal(P.ev('guardar()'), false);
    const t = P.almacen[KEY];
    assert.ok(t && t.indexOf('AAAA') < 0, 'no se salvó el libro sin fotos');
    assert.equal(JSON.parse(P.almacen[SELLO]).largo, t.length, 'lo que entró sin fotos quedó sin sello');
    const P2 = abrirPanel({ topeKB: 0.001 });
    P2.ev('guardar()');
    assert.equal(P2.almacen[SELLO], undefined, 'se selló una escritura que no entró');
  });

  test('borrar anota el renglón en el MISMO guardar(); devolver lo quita', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(3, 2));
    P.ev('_selloDesdeDisco(false)');
    P.ev('borrarCredito("P0")');
    let d = JSON.parse(P.almacen[KEY]);
    assert.deepEqual(d.nubeBorrados.map(b => b.tabla + '|' + b.id), ['creditos|P0']);
    P.ev('restaurarCredito("P0")');
    d = JSON.parse(P.almacen[KEY]);
    assert.deepEqual(d.nubeBorrados, [], 'devolver el crédito no quitó el renglón: la nube lo borraría igual');
    /* un cliente: la ficha Y su historial (créditos pagados, que es lo único que deja borrar) */
    P.ev('DB.prestamos.filter(p=>p.socioId==="C2").forEach(p=>{p.pagado=true;p.fechaPagado="2026-09-30";});');
    P.ev('borrarCliente("C2")');
    d = JSON.parse(P.almacen[KEY]);
    assert.deepEqual(d.nubeBorrados.map(b => b.tabla + '|' + b.id).sort(), ['creditos|P4', 'creditos|P5', 'socios|C2']);
    P.ev('restaurarCliente("C2")');
    d = JSON.parse(P.almacen[KEY]);
    assert.deepEqual(d.nubeBorrados, []);
  });

  test('modoEquipo() apaga la subida', () => {
    const P = abrirPanel();
    P.cargarCartera(cartera(2, 1));
    conNubeCRM(P);
    entrar(P);
    P.ev('CARTERA_EQUIPO = { yo: { nombre: "Gerente", rol: "gerente" }, gente: [] }');
    try { P.ev('modoEquipo()'); } catch (e) { /* el banco no pinta el modo equipo entero; lo que importa es el interruptor */ }
    assert.equal(P.ev('NubeCRM.estado().cinta.fase'), 'apagado');
  });

  test('el <script src="nube-crm.js"> va DESPUÉS del bloque grande, y el aviso de versión vieja existe', () => {
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const iSrc = CRM.indexOf('<script src="nube-crm.js"></script>');
    assert.ok(iSrc > CRM.indexOf('function entrar(){'), 'nube-crm.js se carga antes de que exista entrar()');
    assert.ok(iSrc < CRM.indexOf("navigator.serviceWorker.register"), 'quedó después del service worker');
    assert.equal(CRM.split('<script src="nube.js"></script>').length - 1, 1, 'nube.js se carga dos veces');
    assert.match(CRM.slice(iSrc, iSrc + 900), /if\(!window\.NubeCRM\)\{ var b=document\.getElementById\('nubeBarra'\)/);
  });

  test('sw.js precarga nube-crm.js', () => {
    const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
    assert.match(SW, /'panel\/nube-crm\.js',/);
  });
});

/* ======================================================================== */
describe('el celular dice cuándo subió el computador', () => {
  /* espejo.html es una página, no un módulo: se recorta la función del archivo
     de verdad, como hace pruebas/cobro.test.js. */
  const FUENTE = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8').replace(/\r\n/g, '\n');
  const i = FUENTE.indexOf('\nfunction textoSubidaPC(');
  const j = FUENTE.indexOf('\n}\n', i);
  const textoSubidaPC = new Function(FUENTE.slice(i + 1, j + 3) + '\nreturn textoSubidaPC;')();
  const AHORA = Date.UTC(2026, 9, 1, 17, 0, 0);
  const srv = AHORA;   // el servidor y el teléfono en la misma hora, salvo donde se dice

  test('las frases', () => {
    assert.equal(textoSubidaPC(null, AHORA), 'Todavía no sé cuándo subió el computador.');
    assert.equal(textoSubidaPC({ falta: true }, AHORA), 'Todavía no sé cuándo subió el computador: falta un paso en la nube.');
    assert.equal(textoSubidaPC({ ultima: null, servidorAhora: new Date(srv).toISOString(), leidoEn: AHORA }, AHORA),
      'El computador todavía no ha subido nada a la nube.');
    const hace = ms => ({ ultima: new Date(srv - ms).toISOString(), servidorAhora: new Date(srv).toISOString(), leidoEn: AHORA });
    assert.equal(textoSubidaPC(hace(20000), AHORA), 'El computador subió hace un momento.');
    assert.equal(textoSubidaPC(hace(12 * 60000), AHORA), 'El computador subió hace 12 min.');
    assert.equal(textoSubidaPC(hace(3 * 3600000 + 5000), AHORA), 'El computador subió hace 3 h.');
    assert.match(textoSubidaPC({ ultima: '2026-09-28T15:00:00Z', servidorAhora: new Date(srv).toISOString(), leidoEn: AHORA }, AHORA),
      /^El computador no ha subido desde el 28-sep\.$/);
  });

  test('el reloj del teléfono corrido no mueve la frase; el tiempo que pasa desde que preguntó, sí', () => {
    const s = { ultima: new Date(srv - 12 * 60000).toISOString(), servidorAhora: new Date(srv).toISOString(), leidoEn: AHORA + 7 * 60000 };
    /* el teléfono va 7 min adelantado: preguntó «a las 17:07» de su reloj */
    assert.equal(textoSubidaPC(s, AHORA + 7 * 60000), 'El computador subió hace 12 min.');
    assert.equal(textoSubidaPC(s, AHORA + 7 * 60000 + 5 * 60000), 'El computador subió hace 17 min.');
  });

  test('un intento posterior donde no entró nada se dice', () => {
    const s = { ultima: new Date(srv - 2 * 3600000).toISOString(), intento: new Date(srv - 5 * 60000).toISOString(),
                servidorAhora: new Date(srv).toISOString(), leidoEn: AHORA };
    assert.equal(textoSubidaPC(s, AHORA), 'El computador subió hace 2 h · lo intentó después y no entró nada.');
  });

  test('espejo.html pregunta después de traer y pinta la línea arriba', () => {
    assert.match(FUENTE, /<div class="traido" id="cabComputador" hidden><\/div>/);
    assert.match(FUENTE, /NUBE\.rpc\('panel_ultima_subida', \{ p_dispositivo: 'computador' \}\)/);
    const k = FUENTE.indexOf('ULTIMO_TRAER = new Date().toISOString();');
    assert.ok(FUENTE.indexOf('traerSubidaPC();', k) > k, 'no se pregunta después de traer');
    assert.match(FUENTE, /e\.estado === 404\) SUBIDA_PC = \{ falta: true \}/, 'sin la función en la nube no se degrada con honestidad');
  });
});

/* ======================================================================== */
describe('la función nueva de la nube', () => {
  const SQL = fs.readFileSync(path.join(RAIZ, 'base', '20261001_panel_ultima_subida.sql'), 'utf8');
  const sinComentarios = SQL.replace(/--[^\n]*/g, '');

  test('cerrada como las del 11-ago: definer, search_path, dueño, y solo authenticated', () => {
    assert.match(sinComentarios, /create or replace function public\.panel_ultima_subida\(p_dispositivo text default 'computador'\)/);
    assert.match(sinComentarios, /security definer\s+set search_path = public/);
    assert.match(sinComentarios, /if not public\.panel_es_dueno\(\) then raise exception 'no autorizado'; end if;/);
    assert.match(sinComentarios, /revoke all on function public\.panel_ultima_subida\(text\) from public, anon, authenticated;/);
    assert.match(sinComentarios, /grant execute on function public\.panel_ultima_subida\(text\) to authenticated;/);
    assert.doesNotMatch(sinComentarios, /to anon|to\s+public/, 'se le concedió a anon o a public');
  });

  test('idempotente y sin tocar datos', () => {
    assert.match(sinComentarios, /create index if not exists panel_bitacora_subidas/);
    assert.doesNotMatch(sinComentarios, /\b(insert|update|delete|drop|truncate|alter)\b/i, 'la migración toca datos o estructura');
  });

  test('«subió» quiere decir que entró al menos una fila', () => {
    assert.match(sinComentarios, /'ultima_subida',\s*\(select max\(b\.cuando\) from public\.panel_bitacora b\s+where b\.que = 'empujar' and b\.dispositivo = v_disp and b\.filas > 0\)/);
  });
});
