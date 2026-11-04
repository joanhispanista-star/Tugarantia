/* ===========================================================================
 * UNA CARTERA GRANDE, ENTERA INVENTADA, CON LA FORMA QUE TIENE LA DE VERDAD — 4-nov-2026
 *
 * No es un archivo de pruebas (por eso no se llama .test.js). Sale de una semilla, así
 * que una falla se puede repetir, y lleva a propósito lo que escribió la app HASTA v142:
 *
 *   · abonos sueltos SIN id, y entre ellos dos iguales el mismo día en un crédito;
 *   · comprobantes con foto y sin id, también gemelos;
 *   · fichas con punteros de foto, con fotos de verdad, con un solo lado y sin ninguna;
 *   · créditos con prórrogas, pagados, a cuotas, en plan del §8, con pago acordado y
 *     cerrados con pérdida (capitalPerdido y la condonación del cierre);
 *   · respaldados con el recibo de cada cuota.
 *
 * No sale de ningún respaldo de Joan: los nombres, cédulas y celulares son de mentira
 * (celulares 300 000 xxxx, cédulas 9 000 xxxx). El repositorio es público.
 * ========================================================================= */
'use strict';
const P = require('../app/puente.js');
const M = require('../app/motor.js');

const FOTO = n => 'data:image/jpeg;base64,/9j/' + 'QUJD'.repeat(40) + String(n);
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dia = n => { const d = new Date(Date.UTC(2026, 8, 1 + n)); return d.toISOString().slice(0, 10); };

function ficha(i, r) {
  const tel = '300' + String(i).padStart(7, '0');
  const s = { id: 'C' + i, numero: i + 1, nombre: 'Cliente ' + String(i).padStart(4, '0') + ' Inventado', cedula: '9' + String(i).padStart(7, '0'),
    telefono: tel, whatsappIgual: true, gestiones: [], referencia: { nombre: '', telefono: '' }, notaRiesgo: '', ajusteGarantia: 0, ingresoQuincenal: 0 };
  const x = r();
  if (x < 0.30) { s.cedulaFrenteFoto = 'foto:reg:' + tel + '/cedula_frente'; s.cedulaReversoFoto = 'foto:reg:' + tel + '/cedula_reverso'; s.selfieFoto = 'foto:reg:' + tel + '/selfie'; }
  else if (x < 0.40) { s.cedulaFrenteFoto = FOTO(i + 'f'); s.cedulaReversoFoto = FOTO(i + 'r'); s.selfieFoto = FOTO(i + 's'); }
  else if (x < 0.45) { s.cedulaFrenteFoto = 'foto:reg:' + tel + '/cedula_frente'; s.cedulaReversoFoto = null; s.selfieFoto = FOTO(i + 's'); }
  else if (x < 0.50) { s.cedulaFoto = FOTO(i + 'v'); }
  else { s.cedulaFrenteFoto = null; s.cedulaReversoFoto = null; s.selfieFoto = null; }
  const g = Math.floor(r() * 4);
  for (let k = 0; k < g; k++) s.gestiones.push({ fecha: dia(Math.floor(r() * 60)), canal: 'whatsapp', plantilla: 'recordatorio' + k });
  return s;
}

function base(id, numero, s, capital, r) {
  const desde = dia(Math.floor(r() * 30));
  return { id, numero, socioId: s.id, socioNombre: s.nombre, capital, costoPct: 20, fechaDesembolso: desde, fechaPago: dia(45), cicloActual: dia(45),
    pagado: false, prorrogas: [], abonosCapital: [], comprobantes: [] };
}
function credito(id, numero, s, r, db) {
  const capital = 50000 * (2 + Math.floor(r() * 12));
  const p = base(id, numero, s, capital, r);
  const x = r();
  if (x < 0.45) {
    /* activo, con abonos de los de antes */
    const n = Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const m = 10000 * (1 + Math.floor(r() * 5)), f = dia(40 + Math.floor(r() * 6));
      p.abonosCapital.push({ fecha: f, monto: m, ciclo: p.cicloActual, costoCausado: Math.round(capital * 0.2), moraCausada: 0, diasMoraCausada: 0 });
      p.comprobantes.push(r() < 0.6 ? { fecha: f, tipo: 'abono', monto: m, foto: FOTO(id + k) } : { fecha: f, tipo: 'abono', monto: m });
    }
    /* uno de cada ocho: dos abonos iguales el mismo día, cada uno con su foto */
    if (r() < 0.125) {
      const a = { fecha: dia(46), monto: 50000, ciclo: p.cicloActual, costoCausado: Math.round(capital * 0.2), moraCausada: 0, diasMoraCausada: 0 };
      p.abonosCapital.push(Object.assign({}, a), Object.assign({}, a));
      p.comprobantes.push({ fecha: a.fecha, tipo: 'abono', monto: 50000, foto: FOTO(id + 'x') }, { fecha: a.fecha, tipo: 'abono', monto: 50000, foto: FOTO(id + 'y') });
    }
  } else if (x < 0.60) {
    /* con prórroga y un perdón de mora */
    p.prorrogas.push({ fecha: dia(30), ciclo: dia(30), monto: Math.round(capital * 0.2), mora: 0, aTiempo: true, nuevoCiclo: dia(45) });
    if (r() < 0.5) p.condonaciones = [{ fecha: dia(30), costo: 0, mora: 4000, motivo: 'un motivo inventado', quien: 'computador', sobre: 'prorroga' }];
  } else if (x < 0.75) {
    /* pagado */
    p.pagado = true; p.fechaPagado = dia(42); p.cicloPago = p.cicloActual; p.montoRecibido = Math.round(capital * 1.2); p.gananciaPago = Math.round(capital * 0.2); p.capitalPerdido = 0;
  } else if (x < 0.85) {
    /* cerrado con pérdida, con el puente de verdad */
    const dbx = { socios: [s], prestamos: [p] };
    const cierre = P.cierreConPerdon(dbx, p, dia(44), Math.round(capital * 0.7), { motivo: 'un motivo inventado', entiende: true });
    if (cierre && cierre.ok) { p.condonaciones = [cierre.registros.condonacion]; Object.assign(p, cierre.registros.credito); }
  } else if (x < 0.93) {
    /* a cuotas */
    const plan = M.construirPlanACuotas(capital, [{ fecha: dia(50), pct: 20 }, { fecha: dia(65), pct: 20 }], { fechaDesembolso: p.fechaDesembolso });
    p.planPagos = P.planPagosDeAlta(plan);
    p.cicloActual = dia(50);
  } else if (x < 0.97) {
    /* pago acordado */
    const pa = P.pactarProximoPago({ socios: [s], prestamos: [p] }, p, { fecha: dia(60), monto: Math.round(capital * 1.25) }, dia(44));
    if (pa && pa.ok) { p.planPagos = pa.registros.planPagos; p.cicloActual = pa.registros.cicloActual; }
  } else {
    /* plan de pagos del §8 */
    const plan = M.construirPlanDePagos({ capital, fecha_corte: dia(30), estado: 'en_corte' }, { desde: dia(35) });
    p.cicloActual = plan.cuotas[0].fecha_corte;
    p.planPagos = { creado: dia(35), tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: dia(35), ciclo: dia(30), monto: Math.round(capital * 0.2), mora: 0, aTiempo: true, diasMora: 0 },
      total_capital: plan.total_capital, total_costo: plan.total_costo, total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(c => ({ n: c.numero, fecha: c.fecha_corte, capital: c.capital, costo: c.costo, total: c.total, pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 })) };
  }
  return p;
}
function respaldado(i, s, r) {
  const capital = 100000 * (2 + Math.floor(r() * 5));
  const cuotas = [1, 2, 3].map(n => ({ n, fecha: dia(30 * n), capital: Math.round(capital / 3), costo: 9000, total: Math.round(capital / 3) + 9000,
    pagado: n === 1, fechaPagado: n === 1 ? dia(30) : null, recargo: 0, garantiaGenerada: 0, comprobante: n === 1 ? FOTO('R' + i) : null }));
  return { id: 'R' + i, numero: i + 1, socioId: s.id, socioNombre: s.nombre, capital, tasaMensualPct: 3, plazoMeses: 3, fechaDesembolso: dia(0), cuotas, pagado: false,
    comprobantes: [{ fecha: dia(30), tipo: 'cuota', monto: cuotas[0].total, foto: FOTO('RC' + i) }] };
}

/** @returns el objeto cartera, como lo deja guardar() de hasta v142. */
function carteraGrande(o) {
  o = o || {};
  const nSocios = o.socios || 600, semilla = o.semilla || 20261104;
  const r = azar(semilla);
  const db = { socios: [], prestamos: [], respaldados: [], papelera: [], papeleraSocios: [], invitaciones: [], plantillas: {},
    config: { negocio: 'Tu Garantía', pin: '482915', tasaUsuraEA: 26.9, whatsapp: '3000000000', ultimoRespaldo: '2026-11-01' },
    contadores: { cliente: nSocios, credito: 0, respaldado: 0 }, gestiones: [], asignaciones: [], actosComision: [] };
  let nC = 0, nR = 0;
  for (let i = 0; i < nSocios; i++) {
    const s = ficha(i, r);
    db.socios.push(s);
    const c = Math.floor(r() * 5);
    for (let k = 0; k < c; k++) db.prestamos.push(credito('P' + (nC++), nC, s, r, db));
    if (r() < 0.06) db.respaldados.push(respaldado(nR++, s, r));
    if (r() < 0.2) db.asignaciones.push({ id: 'A' + i, socio_id: s.id, asesor_id: 'E1', desde: dia(1) });
  }
  db.contadores.credito = nC; db.contadores.respaldado = nR;
  return db;
}

/* La cuenta de cada crédito y de cada ficha, con el puente: lo que no puede moverse. */
function cuentaDeCredito(p, fecha) {
  const c = { capital: P.capitalActual(p), ganancia: P.gananciaCobrada(p), abonos: JSON.stringify(p.abonosCapital || []), prorrogas: (p.prorrogas || []).length };
  try { const l = P.liquidarCiclo(p, fecha); c.total = l.total_a_pagar; c.costo = l.costo; c.mora = l.recargo_mora; } catch (e) { c.total = 'error'; }
  return c;
}
const CUENTA_EN_LA_PAGINA = `function (PX, db, fecha) {
  return { creditos: db.prestamos.map(function (p) {
      var c = { id: p.id, capital: PX.capitalActual(p), ganancia: PX.gananciaCobrada(p), abonos: JSON.stringify(p.abonosCapital || []), prorrogas: (p.prorrogas || []).length };
      try { var l = PX.liquidarCiclo(p, fecha); c.total = l.total_a_pagar; c.costo = l.costo; c.mora = l.recargo_mora; } catch (e) { c.total = 'error'; }
      return c; }),
    socios: db.socios.map(function (s) {
      var m = PX.migrarSocio(db, s).garantia;
      return { id: s.id, garantia: m.total, cupo: PX.cupoDelSocio(db, s, m.nivel).cupo,
        fotos: [s.cedulaFrenteFoto, s.cedulaReversoFoto, s.selfieFoto, s.cedulaFoto].map(function (x) { return x ? String(x).slice(0, 40) + '#' + String(x).length : x; }) }; }) };
}`;

module.exports = { carteraGrande, cuentaDeCredito, CUENTA_EN_LA_PAGINA, FOTO };
