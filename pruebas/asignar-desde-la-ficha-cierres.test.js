'use strict';
/* ============================================================================
 * «👤 ASIGNAR A…»: LOS SEIS DEFECTOS QUE ENCONTRÓ LA REVISIÓN — 23-oct-2026
 *
 *   node --test pruebas/asignar-desde-la-ficha-cierres.test.js
 *
 * La revisión de 79c776f («👤 Asignar a…» en cada ficha) encontró seis cosas
 * que un refutador no pudo tumbar. Cada describe es una, con el CRM corriendo
 * en el banco (pruebas/banco-panel.js) y una nube de mentiras; las mismas,
 * contra un PostgreSQL de verdad, en asignar-desde-la-ficha-cierres-postgres.
 *
 *   1. Asignar a WILLIAN, quitárselo y devolvérselo el mismo día: nube.js
 *      juntaba la tercera fila con la primera (misma persona, mismo asesor,
 *      mismo día) y la tiraba. El aparato armado con «⬇ Traer» quedaba con
 *      «nadie», y al publicar le quitaba el cliente a Willian.
 *   2. Un dato que dejó la versión de antes (la primera fila del día apuntaba
 *      a alguien sin celular y viajó otra con su id): la publicación nueva
 *      mandaba el id de la primera, chocaba con el índice de un día por
 *      persona (23505) y el equipo no recibía NADA más, en cada reintento.
 *   3. «Nunca la cédula, la dirección ni las fotos» era falso: el «🪪 Ver su
 *      ficha» de su «Mi base» las muestra.
 *   4. El aviso de prospecto repetido mandaba a buscarlo en Bases, que pinta
 *      200 y no tenía buscador; y la línea de Equipo prometía su fila.
 *   5. Sin la nube, los cuadros de editar/agregar cliente y de «＋ Agregar
 *      prospecto» prometían publicar y no avisaban antes.
 *   6. «Quitarle la asignación» le borraba al asesor la comisión ganada HOY
 *      (y reasignar se la pasaba al nuevo), con el cuadro diciendo que lo
 *      ganado no se mueve.
 * Cada prueba falla contra 79c776f.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const NUBE = require('../panel/nube.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const HOY = iso(new Date());
const dias = n => { const x = new Date(HOY + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
const MANANA = dias(1);
const tick = () => new Promise(r => setImmediate(r));
async function ticks(n) { for (let i = 0; i < (n || 10); i++) await tick(); }
const WILLIAN = '3000000000', LEIDY = '3000000002', OTRO = '3000000009';
const EQUIPO = [
  { id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: WILLIAN },
  { id: 'a1', nombre: 'LEIDY', rol: 'asesor', estado: 'activo', celular: LEIDY, jefe: 'g1' },
  { id: 'g2', nombre: 'OTRO', rol: 'gerente', estado: 'activo', celular: OTRO }];

/* La nube de mentiras TIENE el índice de un día por persona
   (asignaciones_una_por_dia): si llega otro id para un (persona, día) que ya
   tiene fila, contesta lo que contesta PostgreSQL. Sin eso, el defecto 2 sería
   invisible aquí. */
function abrir(o) {
  o = o || {};
  const P = abrirPanel(o.banco || {});
  P.cargarCartera(Object.assign({
    socios: [{ id: 'C1', numero: 1, nombre: 'Joan Ruiz', telefono: '3103606348', whatsappIgual: true }],
    prestamos: [], prospectos: [], equipo: EQUIPO, asignaciones: [], gestiones: [], actosComision: [],
    config: { negocio: 'Tu Garantía' }
  }, o.db || {}));
  P.ctx._sinNube = !!o.sinNube;
  P.ctx._traer = o.traer || {};
  /* Como un navegador después del PIN: esta pestaña sella la cartera que
     leyó. Sin esto, el banco (que la escribe por fuera) parece «otra pestaña
     cambió tu cartera» y los cuadros avisan eso aunque la nube esté lista. */
  P.ev('_selloDesdeDisco(true)');
  P.ev(`
    var _enviados = [], _cuadros = [], _orden = [];
    sbListo = function () { return !_sinNube; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    window.NubeCRM = { estado: function () { return { fase: 'lista' }; },
      libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) {
      _orden.push(fn);
      if (fn === 'equipo_traer') return Promise.resolve(JSON.parse(JSON.stringify(_traer)));
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') {
        var enLaNube = (_traer.asignaciones || []);
        for (var i = 0; i < (args.p_asignaciones || []).length; i++) {
          var a = args.p_asignaciones[i];
          var otra = enLaNube.filter(function (x) { return x.persona_id === a.persona_id &&
            String(x.desde).slice(0, 10) === String(a.desde).slice(0, 10) && x.id !== a.id; })[0];
          if (otra) return Promise.reject({ motivo: 'duplicate key value violates unique constraint "asignaciones_una_por_dia"' });
        }
        _enviados.push(JSON.parse(JSON.stringify(args)));
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve(null);
    };
  `);
  return P;
}
const aca = v => JSON.parse(JSON.stringify(v));
const cuadros = P => aca(P.ev('_cuadros.slice()'));
const ultimo = P => { const c = cuadros(P); return c[c.length - 1] || ''; };
const enviados = P => aca(P.ev('_enviados.slice()'));
const de = (P, id, f) => P.ev("COMIS.asesorDe(asignaciones(),'" + id + "','" + (f || HOY) + "')");
const cuerpo = P => P.elems.mBody.innerHTML || '';
const filasDe = (pub, id) => (pub.p_asignaciones || []).filter(a => a.persona_id === id);
async function asignar(P, tipo, id, aQuien, volver) {
  P.ev("asignarUno('" + tipo + "','" + id + "'" + (volver ? ",'" + volver + "'" : '') + ')');
  P.ev("document.getElementById('auDestino').value='" + aQuien + "'");
  const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','" + (volver || '') + "')");
  await ticks();
  return r;
}
async function quitar(P, tipo, id) {
  P.ev("asignarUno('" + tipo + "','" + id + "')");
  const r = await P.ev("confirmarAsignarUno('" + tipo + "','" + id + "','',true)");
  await ticks();
  return r;
}
/* Lo que hace un segundo aparato de Joan: la lista viaja como ajuste que sube
   solo (nube-crm.js: armarLote) y vuelve por «⬇ Traer» (traer.html:
   aplicarPaquete(null, paquete)), o se junta con la de la nube en subir.html
   (fusionarAjuste). Las dos pasan por la identidad de LISTAS_DE_AJUSTES. */
function porOtroAparato(lista) {
  const lote = NUBE.armarLote({ socios: [], prestamos: [], asignaciones: lista }, NUBE.espejoVacio(),
    { claves: ['asignaciones'], marcarBorrados: false });
  return aca(NUBE.aplicarPaquete(null, NUBE.paqueteDeLote(lote)).db.asignaciones);
}

/* ======================================================================== */
describe('1 · volver al mismo dueño el mismo día sobrevive a nube.js', () => {

  async function caso(pasos) {
    const P = abrir();
    for (const p of pasos) {
      if (p === 'quitar') await quitar(P, 'cliente', 'C1');
      else await asignar(P, 'cliente', 'C1', p, 'ficha');
    }
    return P;
  }

  for (const pasos of [['g1', 'quitar', 'g1'], ['g1', 'g2', 'quitar', 'g1'], ['g1', 'g2', 'g1']]) {
    test(pasos.join(' → ') + ': el otro aparato y subir.html siguen diciendo WILLIAN, y lo publican así', async () => {
      const P = await caso(pasos);
      assert.equal(de(P, 'C1'), 'g1', 'precondición: en este computador lo atiende Willian');
      const lista = aca(P.ev('asignaciones()'));
      assert.equal(lista.length, pasos.length);

      const juntada = NUBE.fusionarAjuste('asignaciones', lista, lista);
      assert.equal(juntada.length, pasos.length, 'subir.html juntó dos filas distintas en una: ' + JSON.stringify(juntada));
      const traida = porOtroAparato(lista);
      assert.equal(traida.length, pasos.length, '«⬇ Traer» perdió una fila: ' + JSON.stringify(traida));

      const B = abrir({ db: { asignaciones: traida } });
      assert.equal(de(B, 'C1'), 'g1', 'el otro aparato cree que lo atiende otro (' + JSON.stringify(de(B, 'C1')) + ')');
      B.ev("verCliente('C1')");
      assert.match(cuerpo(B), /🧭 <b>WILLIAN<\/b>/, 'la ficha del otro aparato no dice WILLIAN');
      assert.doesNotMatch(cuerpo(B), /Nadie de tu equipo/);
      const hoyDe = aca(B.ev('armarPublicacionEquipo().asig')).filter(a => a.persona_id === 'C1' && a.desde === HOY);
      assert.deepEqual(hoyDe.map(a => a.asesor), [WILLIAN], 'el otro aparato le publicaría a Willian que ya no lo tiene');
    });
  }

  test('lo que SÍ es la misma fila sigue siendo una: el mismo id de dos aparatos, y una fila vieja sin id', () => {
    const fila = { id: 'A1', socio_id: 'C1', asesor_id: 'g1', desde: '2026-10-01' };
    assert.equal(NUBE.fusionarAjuste('asignaciones', [fila], [Object.assign({}, fila)]).length, 1);
    const sinId = { socio_id: 'C1', asesor_id: 'g1', desde: '2026-10-01' };
    assert.equal(NUBE.fusionarAjuste('asignaciones', [sinId], [Object.assign({}, sinId)]).length, 1);
  });
});

/* ======================================================================== */
describe('2 · un dato de la versión de antes no tumba la publicación', () => {

  test('la primera fila del día apuntaba a alguien sin celular y viajó la segunda: se publica con el id que la nube ya tiene', async () => {
    const P = abrir({
      db: {
        socios: [{ id: 'C1', numero: 1, nombre: 'Joan Ruiz', telefono: '3103606348', whatsappIgual: true },
                 { id: 'C2', numero: 2, nombre: 'Rosa Vieja', telefono: '3105550002', whatsappIgual: true }],
        equipo: EQUIPO.concat([{ id: 'x1', nombre: 'SIN CEL', rol: 'asesor', estado: 'activo', celular: '' }]),
        asignaciones: [{ id: 'A100-0', socio_id: 'C2', asesor_id: 'x1', desde: HOY },
                       { id: 'A200-0', socio_id: 'C2', asesor_id: 'g1', desde: HOY }]
      },
      /* Lo que dejó f05f485: solo viajó la de Willian, con SU id. */
      traer: { equipo: [], contactos: [], asignaciones: [{ id: 'A200-0', persona_id: 'C2', asesor: WILLIAN, desde: HOY }] }
    });
    const r = await asignar(P, 'cliente', 'C1', 'g1', 'ficha');
    assert.equal(r, 'publicado', 'la publicación chocó: ' + ultimo(P));
    const pub = enviados(P)[0];
    assert.deepEqual(filasDe(pub, 'C2').map(a => [a.id, a.asesor, a.desde]), [['A200-0', WILLIAN, HOY]],
      'C2 no viajó con el id que la nube ya tiene para ese día');
    assert.deepEqual(filasDe(pub, 'C1').map(a => a.asesor), [WILLIAN], 'la asignación de Joan a Willian no viajó');
    assert.match(ultimo(P), /Ya se lo publiqué/);
    /* Y la que corre sola (o el reintento) tampoco choca. */
    assert.ok(['publicado', 'sin_cambios'].includes(await P.ev('publicarEquipoSolo({ ya: true })')));
  });

  test('si equipo_traer falla, no se traduce con lo que trajo una vuelta anterior', async () => {
    const P = abrir({ traer: { equipo: [], contactos: [], asignaciones: [{ id: 'VIEJO', persona_id: 'C1', asesor: WILLIAN, desde: HOY }] } });
    await P.ev('traerEquipo(true)');
    assert.equal(P.ev("_asigDeLaNube['C1|" + HOY + "']"), 'VIEJO');
    P.ev("rpc = function (fn) { return Promise.reject({ motivo: 'sin señal' }); }");
    await P.ev("traerEquipo('auto').catch(function () {})");
    assert.equal(P.ev('_asigDeLaNube'), null, 'quedó lo de la vuelta anterior');
  });
});

/* ======================================================================== */
describe('3 · lo que ve quien lo recibe, dicho sin «nunca la cédula»', () => {

  const VERDAD = /en «🪪 Ver su ficha» ve también lo que dejó al registrarse: su cédula, su dirección, sus cuentas y sus fotos/;

  test('el cuadro de asignar (cliente y prospecto), el de editar y agregar cliente, «＋ Agregar prospecto» y Repartir', async () => {
    const P = abrir({ db: { prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo', base: 'septiembre.xlsx' }] } });
    const textos = {};
    P.ev("asignarUno('cliente','C1')"); textos.asignarCliente = cuerpo(P);
    P.ev("asignarUno('prospecto','p1')"); textos.asignarProspecto = cuerpo(P);
    P.ev("editarCliente('C1')"); textos.editar = cuerpo(P);
    P.ev('editarCliente()'); textos.agregarCliente = cuerpo(P);
    P.ev('agregarProspecto()'); textos.agregarProspecto = cuerpo(P);
    P.ev("pantallaAsignar('clientes')");
    P.ev("_todosMarcados = true; document.getElementById('asDestino').value = 'g1'");
    await P.ev('asignarMarcados()'); await ticks();
    textos.repartir = cuadros(P).find(c => /Voy a repartir/.test(c)) || '';
    Object.keys(textos).forEach(k => {
      assert.doesNotMatch(textos[k], /Nunca la cédula/, k + ' promete lo que «🪪 Ver su ficha» no cumple');
      assert.match(textos[k], VERDAD, k + ' no dice que ve su cédula, su dirección, sus cuentas y sus fotos');
    });
    /* 27-oct-2026 (el gerente agrega, revisión) — de un prospecto viaja también
       lo que Joan anotó de él; con el SQL sin correr (404) vuelve a decir lo de antes. */
    assert.match(textos.asignarProspecto, /su nombre, su celular, en qué va y lo que anotaste de él: la información adicional, de dónde salió, si autorizó y, de las columnas de su base, solo ciudad, monto que pide, ocupación o negocio, cómo llegó y observación/);
    assert.match(textos.asignarCliente, /cuánto debe y cuándo paga/);
  });
});

/* ======================================================================== */
describe('4 · el prospecto que ya estaba se encuentra, aunque la base tenga mil', () => {

  const MIL = Array.from({ length: 1000 }, (_, i) => ({ id: 'P-' + i, nombre: 'Persona ' + i,
    celular: '3001' + String(i).padStart(6, '0'), estado: 'nuevo', base: 'octubre.xlsx' }));

  test('Bases tiene buscador, filtra ANTES de cortar en 200, y el pie lo dice', () => {
    const bases = CRM.slice(CRM.indexOf('<section class="view" id="v-bases">'), CRM.indexOf('<section class="view" id="v-equipo">'))
      .replace(/<!--[\s\S]*?-->/g, '');
    assert.match(bases, /<input id="buscaBases"[^>]*oninput="renderBases\(\)"/, 'Bases no tiene buscador');
    const P = abrir({ db: { prospectos: MIL } });
    P.ev('renderBases()');
    let t = P.elems.tblProspectos.innerHTML;
    assert.doesNotMatch(t, /asignarUno\('prospecto','P-640'\)/, 'control: sin buscar, el 640 no se pinta');
    assert.match(t, /Se muestran 200 de 1000\. Para encontrar a los demás, escribe su nombre o unos dígitos de su celular/);
    P.ev("document.getElementById('buscaBases').value = '3001000640'"); P.ev('renderBases()');
    t = P.elems.tblProspectos.innerHTML;
    assert.match(t, /asignarUno\('prospecto','P-640'\)/, 'buscando su celular no sale su fila con «👤 Asignar a…»');
    P.ev("document.getElementById('buscaBases').value = 'persona 640'"); P.ev('renderBases()');
    assert.match(P.elems.tblProspectos.innerHTML, /asignarUno\('prospecto','P-640'\)/, 'por el nombre tampoco');
    P.ev("document.getElementById('buscaBases').value = 'Nadie Así'"); P.ev('renderBases()');
    assert.match(P.elems.tblProspectos.innerHTML, /Nadie coincide con «Nadie Así»/);
  });

  function llenar(P, f) {
    P.ctx._f = Object.assign({ apNombre: 'PERSONA REPETIDA', apCel: '3001000640', apOrigen: 'me lo recomendó Nancy',
      apAutoriza: 'si', apAsignarA: '' }, f);
    P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })");
  }

  test('repetido con «Se lo asigno a: WILLIAN»: se abre SU «👤 Asignar a…» con Willian marcado, y asignar llega', async () => {
    const P = abrir({ db: { prospectos: MIL } });
    P.ev('agregarProspecto()');
    llenar(P, { apAsignarA: 'g1' });
    P.ev('guardarProspectoSuelto()');
    assert.equal(P.ev('prospectos().length'), 1000, 'lo agregó dos veces');
    assert.match(ultimo(P), /ya está en tus prospectos: Persona 640 \(octubre\.xlsx\)[\s\S]*Te abro su «👤 Asignar a…» con WILLIAN ya marcado/);
    assert.doesNotMatch(cuadros(P).join(' '), /búscalo en la tabla de Bases/, 'sigue mandando a una tabla donde no sale');
    assert.match(P.elems.mTitle.textContent, /¿Quién atiende a Persona 640\?/, 'no abrió el cuadro de ese prospecto');
    assert.match(cuerpo(P), /<option value="g1" selected>WILLIAN/, 'lo que Joan eligió no viene marcado');
    assert.match(cuerpo(P), /ya estaba en tus prospectos: no lo agregué otra vez/);
    /* El banco no pinta los <select>: el navegador mandaría el marcado. */
    P.ev("document.getElementById('auDestino').value = 'g1'");
    const r = await P.ev("confirmarAsignarUno('prospecto','P-640','')"); await ticks();
    assert.equal(r, 'publicado');
    assert.equal(de(P, 'P-640'), 'g1');
    assert.ok((enviados(P)[0].p_gente || []).some(x => x.id === 'P-640'), 'no le llegó a Willian');
  });

  test('repetido sin asignar: queda a la vista en Bases, filtrado por su celular', () => {
    const P = abrir({ db: { prospectos: MIL } });
    P.ev('agregarProspecto()');
    llenar(P);
    P.ev('guardarProspectoSuelto()');
    assert.match(ultimo(P), /Te lo dejé a la vista en Bases/);
    assert.match(P.elems.tblProspectos.innerHTML, /asignarUno\('prospecto','P-640'\)/, 'su fila no quedó a la vista');
  });

  test('la línea de la pestaña Equipo dice que se busca en Bases', () => {
    const eq = CRM.slice(CRM.indexOf('<section class="view" id="v-equipo">'), CRM.indexOf('<section class="view" id="v-clientes">'))
      .replace(/<!--[\s\S]*?-->/g, '');
    assert.match(eq, /id="equipoAsignarUno"[^>]*>[^<]*cada prospecto en su fila de Bases \(si no sale entre los primeros, búscalo ahí por su nombre o su celular\)/);
  });
});

/* ======================================================================== */
describe('5 · sin la nube, los tres cuadros lo dicen ANTES', () => {

  test('editar cliente, agregar cliente, «＋ Agregar prospecto» y la pregunta de Repartir avisan, y no prometen «se le publica»', async () => {
    const P = abrir({ sinNube: true });
    for (const [abre, promesa] of [["editarCliente('C1')", /Al guardar se le publica/], ['editarCliente()', /Al guardar se le publica/],
                                   ['agregarProspecto()', /al agregarlo se le publica/]]) {
      P.ev(abre);
      const h = cuerpo(P);
      assert.match(h, /class="alerta warn"[^>]*>Tu equipo todavía no lo ve: falta conectar la nube/, abre + ' no avisa antes');
      assert.doesNotMatch(h, promesa, abre + ' promete una publicación que no va a pasar');
      assert.match(h, /Cuando se le publique a tu equipo, le sale en su «Mi base»/);
    }
    /* Y la pregunta de «🔀 Repartir», que es la misma promesa en un confirm. */
    P.ev("pantallaAsignar('clientes')");
    P.ev("_todosMarcados = true; document.getElementById('asDestino').value = 'g1'");
    await P.ev('asignarMarcados()'); await ticks();
    const pregunta = cuadros(P).find(c => /Voy a repartir/.test(c)) || '';
    assert.doesNotMatch(pregunta, /Al confirmar se publica/, 'Repartir promete publicar sin nube');
    assert.match(pregunta, /Cuando se le publique a tu equipo[\s\S]*Tu equipo todavía no lo ve: falta conectar la nube/);
  });

  test('control: con la nube, los mismos cuadros dicen que se publica y no avisan', () => {
    const P = abrir();
    P.ev("editarCliente('C1')");
    assert.match(cuerpo(P), /Al guardar se le publica a tu equipo en ese momento/);
    assert.doesNotMatch(cuerpo(P), /class="alerta warn"[^>]*>Tu equipo todavía no lo ve/);
    P.ev('agregarProspecto()');
    assert.match(cuerpo(P), /Si se lo asignas, al agregarlo se le publica a tu equipo en ese momento/);
  });
});

/* ======================================================================== */
describe('6 · lo que el asesor ganó HOY no se mueve al quitárselo o pasárselo a otro', () => {

  /* Pedro: lo atiende WILLIAN desde hace 13 días; su primer crédito se
     desembolsó hace 10 y lo pagó HOY → WILLIAN gana hoy 10.000 de «pago». */
  function conPagoDeHoy(o) {
    return Object.assign({
      socios: [{ id: 'C1', numero: 1, nombre: 'Pedro Pago', telefono: '3105550000', whatsappIgual: true }],
      prestamos: [{ id: 'K1', numero: 1, socioId: 'C1', socioNombre: 'Pedro Pago', telefono: '3105550000',
        capital: 300000, costoPct: 20, fechaDesembolso: dias(-10), cicloActual: HOY, cicloPago: HOY,
        comprobantes: [], pagado: true, fechaPagado: HOY, prorrogas: [], abonosCapital: [] }],
      asignaciones: [{ id: 'A0', socio_id: 'C1', asesor_id: 'g1', desde: dias(-13) }]
    }, o || {});
  }
  const libro = P => aca(P.ev("movimientosDeComision().filter(m => m.socio_id === 'C1').map(m => m.tipo + '@' + m.fecha + '→' + m.asesor_id + ' ' + m.monto)"));
  const saldo = (P, a) => aca(P.ev("COMIS.saldoDeAsesor(movimientosDeComision(),'" + a + "',hoyISO())"));
  const ANTES = () => ['desembolso@' + dias(-10) + '→g1 15000', 'pago@' + HOY + '→g1 10000'];

  test('«Quitarle la asignación»: el cuadro lo dice con la cifra, los 10.000 de hoy siguen siendo de WILLIAN y cuenta desde mañana', async () => {
    const P = abrir({ db: conPagoDeHoy() });
    assert.deepEqual(libro(P), ANTES(), 'precondición');
    P.ev("asignarUno('cliente','C1','ficha')");
    assert.match(cuerpo(P), /Hoy WILLIAN ya ganó \$10\.000 de comisión con él, y eso sigue siendo suyo: en tus cuentas el cambio cuenta desde mañana/,
      'el cuadro no dice que lo de hoy se queda');
    const r = await P.ev("confirmarAsignarUno('cliente','C1','ficha',true)"); await ticks();
    assert.equal(r, 'publicado');
    assert.deepEqual(libro(P), ANTES(), 'quitarle la asignación le movió (o le borró) lo que ganó hoy');
    const s = saldo(P, 'g1');
    assert.equal(s.libre, 10000);
    assert.equal(s.total_ganado, 25000);
    assert.equal(de(P, 'C1'), 'g1', 'hoy sigue siendo suyo en las cuentas');
    assert.equal(de(P, 'C1', MANANA), '', 'desde mañana no es de nadie');
    /* A la nube viaja con la fecha de mañana: allá la vigente es la de fecha
       más reciente, así que deja de salir YA en la «Mi base» de Willian
       (asignar-desde-la-ficha-cierres-postgres lo comprueba en PostgreSQL). */
    assert.deepEqual(filasDe(enviados(P)[0], 'C1').filter(a => a.desde === MANANA).map(a => a.asesor), ['']);
    assert.match(ultimo(P), /ya no está asignado a nadie[\s\S]*cuenta desde mañana[\s\S]*Ya se lo publiqué/);
    assert.match(cuerpo(P), /Desde mañana: nadie de tu equipo \(hoy ya ganó comisión con él, y eso sigue siendo suyo\)/,
      'la ficha no dice que el cambio ya está hecho');
    /* Con el cambio hecho, el cuadro ya no ofrece quitarle lo que ya se quitó. */
    P.ev("asignarUno('cliente','C1')");
    assert.doesNotMatch(cuerpo(P), /Quitarle la asignación/);
  });

  test('pasárselo a OTRO el mismo día: lo de hoy sigue siendo de WILLIAN, y desde mañana es de OTRO', async () => {
    const P = abrir({ db: conPagoDeHoy() });
    assert.equal(await asignar(P, 'cliente', 'C1', 'g2', 'ficha'), 'publicado');
    assert.deepEqual(libro(P), ANTES(), 'el pago de hoy se fue con el dueño nuevo');
    assert.equal(saldo(P, 'g2').total_ganado, 0);
    assert.equal(de(P, 'C1', MANANA), 'g2');
    /* Y arrepentirse en la misma tarde también cuenta desde mañana. */
    assert.equal(await asignar(P, 'cliente', 'C1', 'g1'), 'publicado');
    assert.equal(de(P, 'C1', MANANA), 'g1');
    assert.deepEqual(filasDe(enviados(P)[1], 'C1').filter(a => a.desde === MANANA).map(a => a.asesor), [WILLIAN],
      'a la nube no viajó UNA fila de mañana con la última decisión');
  });

  test('el cuadro de editar y «🔀 Repartir» siguen la misma regla', async () => {
    const P = abrir({ db: conPagoDeHoy() });
    P.ev("editarCliente('C1')");
    assert.match(cuerpo(P), /Hoy WILLIAN ya ganó \$10\.000/);
    P.ctx._f = { fNombre: 'Pedro Pago', fTel: '3105550000', fAsignarA: 'nadie' };
    P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })");
    await P.ev("guardarCliente('C1')"); await ticks();
    assert.deepEqual(libro(P), ANTES(), 'el cuadro de editar le quitó lo de hoy');
    assert.equal(de(P, 'C1', MANANA), '');

    const R = abrir({ db: conPagoDeHoy() });
    R.ev("pantallaAsignar('clientes')");
    R.ev("_todosMarcados = true; document.getElementById('asDestino').value = 'g2'");
    await R.ev('asignarMarcados()'); await ticks();
    assert.deepEqual(libro(R), ANTES(), 'Repartir le pasó lo de hoy al dueño nuevo');
    assert.equal(de(R, 'C1', MANANA), 'g2');
    assert.match(ultimo(R), /Listo: 1 repartidos\.[\s\S]*1 de ellos cuenta desde mañana/);
  });

  test('control: si lo que ganó es de AYER, el cambio cuenta desde hoy, como siempre', async () => {
    const d = conPagoDeHoy();
    d.prestamos[0].fechaPagado = dias(-1);
    const P = abrir({ db: d });
    await quitar(P, 'cliente', 'C1');
    assert.equal(de(P, 'C1'), '', 'sin nada ganado hoy, quitarle la asignación no rige de una');
    assert.deepEqual(libro(P), ['desembolso@' + dias(-10) + '→g1 15000', 'pago@' + dias(-1) + '→g1 10000']);
  });
});
