/* ============================================================================
 * EL ESTIMADO, DEL LADO DE JOAN — 19 de octubre de 2026
 *
 * Desde hoy el cliente ve un costo estimado antes de pedir (el 2% al mes,
 * debajo del techo de usura; ver el-estimado-del-costo.test.js). Si Joan le
 * propone diez veces eso, el cliente no lee una propuesta: lee un engaño. Por
 * eso el estimado viaja con la solicitud (pedido.estimado, que anota
 * anotar_estimado en base/20261019_el_estimado_viaja.sql) y el CRM:
 *
 *   · en la fila de la bandeja dice «El cliente vio un estimado de $6.000» y,
 *     si ya hay una propuesta que lo supera, el aviso en ámbar;
 *   · en «✏️ Proponer» dice lo mismo arriba, y cada vista previa avisa —en
 *     ámbar, sin bloquear— «Tu propuesta ($60.000) es 10 veces lo que la app
 *     le estimó: dile por qué, o se va a sentir engañado»; y el aviso va
 *     también en la pregunta final antes de mandarla.
 *
 * Todo ejecutando crm.html de verdad (banco-panel.js). Y la base, leída: la
 * migración nueva no reescribe nada vivo y no le abre nada a la llave pública.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const PLAY = leer('play/index.html');
const SQL = leer('base/20261019_el_estimado_viaja.sql');
const sinComentariosSQL = t => t.replace(/--[^\n]*/g, '');

/* El día fijo: la vista previa a cuotas se niega a cotizar sin techo de usura
   certificado, y la tabla se vence cada mes. */
const AHORA = '2026-10-19T10:00:00';

const ESTIMADO = { costo: 6000, total: 306000, tasa: 0.02, cuando: '2026-10-19T15:00:00Z', version: '2026-10-19' };
const PIDE = { id: 31, cedula: '3001234567', nombre: 'William', estado: 'nueva', app: 'tugarantia',
  capital: 300000, tasa: 0, costo: 0, total: 0, fecha_corte: '2026-11-18', producto: 'quincenal',
  contrapropuesta: null,
  pedido: { origen: 'play', capital: 300000, fecha_pago: '2026-11-18', dias: 30, estimado: ESTIMADO },
  pedido_monto: 300000, pedido_nota: null, creada_en: '2026-10-19T15:00:00Z', origen: 'nube' };
const PROPUESTA_10X = Object.assign({}, PIDE, { estado: 'contrapropuesta',
  contrapropuesta: { capital: 300000, costo: 60000, total: 360000, costo_pct: 20, dias: 30,
                     fecha_pago: '2026-11-18', por: 'joan', creada_en: '2026-10-19T16:00:00Z' } });

function bandeja(sols, opciones) {
  const P = abrirPanel(Object.assign({ ahora: AHORA }, opciones || {}));
  P.ev('_solicitudes = ' + JSON.stringify(sols) + '; renderBandeja();');
  return { P, h: P.elems.bandeja.innerHTML };
}
function proponer(sol, modo, opciones) {
  const P = abrirPanel(Object.assign({ ahora: AHORA }, opciones || {}));
  P.ev('_solicitudes = [' + JSON.stringify(sol) + '];');
  P.ev('window.__modal = ""; openModal = function (t, h) { window.__modal = t + "|" + h; };');
  P.ev("editarContrapropuesta('" + sol.id + "'" + (modo ? ", '" + modo + "'" : '') + ')');
  return P;
}
const AVISO_10X = 'Tu propuesta ($60.000) es 10 veces lo que la app le estimó: dile por qué, o se va a sentir engañado.';

/* ==========================================================================
 * 1. LA FILA DE LA BANDEJA
 * ======================================================================== */
describe('la bandeja: lo que el cliente vio', () => {

  test('una solicitud que espera propuesta dice el estimado que vio', () => {
    const { h } = bandeja([PIDE]);
    assert.match(h, /El cliente vio un estimado de \$6\.000 \(total \$306\.000\)/);
    assert.ok(h.indexOf('veces lo que la app le estimó') < 0, 'avisa de una propuesta que todavía no existe');
  });

  test('con una propuesta diez veces el estimado: el aviso, en ámbar', () => {
    const { h } = bandeja([PROPUESTA_10X]);
    assert.match(h, /El cliente vio un estimado de \$6\.000/);
    const i = h.indexOf(AVISO_10X);
    assert.ok(i >= 0, 'no le avisa a Joan que propuso diez veces lo estimado');
    assert.match(h.slice(Math.max(0, i - 120), i), /color:var\(--ambar\)/, 'el aviso no va en ámbar');
  });

  test('una propuesta igual o por debajo del estimado no avisa', () => {
    const igual = Object.assign({}, PROPUESTA_10X, { contrapropuesta: Object.assign({}, PROPUESTA_10X.contrapropuesta, { costo: 6000, total: 306000 }) });
    const { h } = bandeja([igual]);
    assert.match(h, /El cliente vio un estimado de \$6\.000/);
    assert.ok(h.indexOf('lo que la app le estimó') < 0);
  });

  test('sin estimado guardado (app vieja, base sin la migración) no se dice nada', () => {
    const sinEst = Object.assign({}, PIDE, { pedido: { origen: 'play', capital: 300000, fecha_pago: '2026-11-18', dias: 30 } });
    const { h } = bandeja([sinEst]);
    assert.ok(!/vio un estimado/.test(h), 'afirma que el cliente vio un estimado sin constancia');
  });

  test('lo que llega del teléfono se escapa: un estimado con basura no pinta nada', () => {
    const malo = Object.assign({}, PIDE, { pedido: Object.assign({}, PIDE.pedido, { estimado: { costo: '<img src=x onerror=1>', total: 1 } }) });
    const { h } = bandeja([malo]);
    assert.ok(h.indexOf('<img') < 0);
    assert.ok(!/vio un estimado/.test(h));
  });

  test('si calculadora-solicitud.js no llega, la bandeja se pinta igual y calla el estimado', () => {
    const { h } = bandeja([PROPUESTA_10X], { sinCalculadora: true });
    assert.match(h, /William/);
    assert.ok(!/vio un estimado|lo que la app le estimó/.test(h));
  });
});

/* ==========================================================================
 * 2. «✏️ PROPONER»
 * ======================================================================== */
describe('«✏️ Proponer»: el estimado arriba y el aviso en cada vista previa', () => {

  test('arriba dice el estimado que vio', () => {
    const P = proponer(PIDE);
    assert.match(P.ev('window.__modal'), /<b>El cliente vio un estimado de \$6\.000 \(total \$306\.000\)\.<\/b>/);
  });

  test('un solo pago al 20% (60.000): el aviso en ámbar, palabra por palabra', () => {
    const P = proponer(PIDE);
    P.ev("document.getElementById('cpCap').value = '300000'; document.getElementById('cpPct').value = '20';" +
         " document.getElementById('cpDias').value = '30'; previsualizarContrapropuesta();");
    const c = P.elems.cpCalc.innerHTML;
    assert.ok(c.indexOf(AVISO_10X) >= 0, 'no avisa: ' + c.replace(/\s+/g, ' ').slice(0, 300));
    assert.match(c, /class="alerta warn"[^>]*>⚠️ Tu propuesta/, 'el aviso no va en ámbar');
  });

  test('al 2% (lo mismo que se le estimó) no avisa', () => {
    const P = proponer(PIDE);
    P.ev("document.getElementById('cpCap').value = '300000'; document.getElementById('cpPct').value = '2';" +
         " document.getElementById('cpDias').value = '30'; previsualizarContrapropuesta();");
    assert.ok(P.elems.cpCalc.innerHTML.indexOf('lo que la app le estimó') < 0);
  });

  test('NO BLOQUEA: el aviso va en la pregunta final y Joan decide', () => {
    const P = proponer(PIDE);
    P.ev("document.getElementById('cpCap').value = '300000'; document.getElementById('cpPct').value = '20';" +
         " document.getElementById('cpDias').value = '30';");
    P.ev('window.__preguntas = []; confirm = function (m) { window.__preguntas.push(m); return false; };');
    P.ev("guardarContrapropuesta('31')");
    const preguntas = JSON.parse(P.ev('JSON.stringify(window.__preguntas)'));
    assert.equal(preguntas.length, 1, 'no llegó a preguntar: algo la frenó antes');
    assert.ok(preguntas[0].indexOf('⚠️ ' + AVISO_10X) >= 0, 'la pregunta final no lleva el aviso: ' + preguntas[0]);
    assert.ok(!(P.ctx._avisos || []).length, 'salió una alerta que frena: ' + (P.ctx._avisos || []).join(' | '));
  });

  test('a cuotas: la vista previa también compara su costo con el estimado', () => {
    const P = proponer(PIDE, 'cuotas');
    P.ev("document.getElementById('cqCap').value = '1000000'; document.getElementById('cqMeses').value = '3'; previsualizarCuotas();");
    const c = P.elems.cqCalc.innerHTML;
    assert.match(c, /Tu propuesta \(\$[\d.]+\) es [\d,]+ veces lo que la app le estimó: dile por qué/,
      'la propuesta a cuotas no se compara con el estimado: ' + c.replace(/\s+/g, ' ').slice(0, 300));
  });

  test('sin estimado, «Proponer» no dice nada de estimados', () => {
    const sinEst = Object.assign({}, PIDE, { pedido: { origen: 'play', capital: 300000, fecha_pago: '2026-11-18', dias: 30 } });
    const P = proponer(sinEst);
    assert.ok(!/estimado/.test(P.ev('window.__modal')));
    P.ev("document.getElementById('cpCap').value = '300000'; document.getElementById('cpPct').value = '20';" +
         " document.getElementById('cpDias').value = '30'; previsualizarContrapropuesta();");
    assert.ok(P.elems.cpCalc.innerHTML.indexOf('lo que la app le estimó') < 0);
  });
});

/* ==========================================================================
 * 3. EL CRM CARGA LO QUE USA
 * ======================================================================== */
describe('crm.html carga la calculadora, y las cuentas no son suyas', () => {

  test('<script src> de la calculadora, una vez, después de la tabla de usura', () => {
    /* 23-oct-2026 — sin la versión de la dirección (…?v=139, ver sw.js). */
    const srcs = [...CRM.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].split('?')[0]);
    assert.equal(srcs.filter(s => s === '../app/calculadora-solicitud.js').length, 1);
    assert.ok(srcs.indexOf('../app/calculadora-solicitud.js') > srcs.indexOf('../app/creditos.js'));
  });

  test('la proporción y la resta las hace el módulo, no la pantalla', () => {
    const cuerpo = CRM.slice(CRM.indexOf('function avisoContraEstimado('), CRM.indexOf('function avisoEstimadoHTML('));
    assert.match(cuerpo, /CSOL\.avisoDelEstimado\(/);
    assert.ok(!/\/\s*est\.costo|veces\s*=/.test(cuerpo), 'el CRM hace su propia cuenta del estimado');
  });
});

/* ==========================================================================
 * 4. LA BASE (el texto; la de verdad, en el-estimado-viaja-postgres.test.js)
 * ======================================================================== */
describe('base/20261019_el_estimado_viaja.sql', () => {
  const sql = sinComentariosSQL(SQL);

  test('UNA función nueva, y ninguna viva reescrita', () => {
    const creadas = [...sql.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map(m => m[1]);
    assert.deepEqual(creadas, ['anotar_estimado'], 'reescribe funciones vivas: ' + creadas.join(', '));
    assert.ok(!/alter table|create table|drop function/i.test(sql), 'toca más de lo que dice');
  });

  test('con sesión y como dueño; nada para la llave pública', () => {
    assert.match(sql, /returns jsonb\s+language plpgsql\s+volatile\s+security definer\s+set search_path = public, auth/);
    assert.match(sql, /revoke all on function public\.anotar_estimado\(bigint, jsonb\) from public, anon, authenticated;/);
    assert.match(sql, /grant\s+execute on function public\.anotar_estimado\(bigint, jsonb\) to authenticated;/);
    assert.ok(!/to anon/.test(sql));
    assert.match(sql, /cel := public\.celular_de_sesion\(\);/);
  });

  test('comprueba lo que manda el teléfono: de quién, de qué pedido, cuánto y una sola vez', () => {
    assert.match(sql, /cedula = cel and app = 'tugarantia'\s+and public\.solicitud_de_la_cuenta\(cel, creada_en\)\s+for update;/);
    assert.match(sql, /s\.estado <> 'nueva' or s\.contrapropuesta is not null/);
    assert.match(sql, /coalesce\(s\.pedido ->> 'origen', ''\) <> 'play'/);
    assert.match(sql, /'motivo', 'otro_pedido'/);
    assert.match(sql, /s\.pedido \? 'estimado'/);
    assert.match(sql, /v_total <> v_cap \+ v_costo/);
    /* El momento lo pone la base, no el teléfono. */
    assert.match(sql, /'cuando', now\(\)/);
    assert.ok(!/p_estimado ->> 'cuando'/.test(sql));
  });

  test('ningún raise exception después de lo que tiene que existir, y se prueba LLAMANDO', () => {
    const despues = SQL.slice(SQL.indexOf('-- 1. ANOTAR EL ESTIMADO'));
    assert.ok(!/raise exception/.test(sinComentariosSQL(despues)), 'un raise exception deshace el archivo entero en el editor');
    assert.match(despues, /j := public\.anotar_estimado\(v_id, est\);/);
    assert.match(despues, /raise notice 'Estimado: %', pasos;/);
    assert.match(despues, /delete from public\.solicitudes where cedula = v_cel or celular = v_cel;/, 'no limpia lo suyo');
  });

  test('la comprobación existe y solo mira', () => {
    const c = sinComentariosSQL(leer('base/20261019b_el_estimado_comprobar.sql'));
    assert.match(c, /to_regprocedure\('public\.anotar_estimado\(bigint, jsonb\)'\)/);
    assert.ok(!/\b(create|insert|update|delete|drop|alter|grant|revoke)\b/i.test(c), 'la comprobación cambia algo');
  });

  test('play/ llama a la función con los nombres que la base espera', () => {
    /* 21-oct-2026 — con la sesión que pidió (H2), si viene. */
    assert.match(PLAY, /rpcSesion\('anotar_estimado', \{ p_id: Number\(sol\.id\), p_estimado: estimado \}(, ses)?\)/);
    assert.match(SQL, /function public\.anotar_estimado\(p_id bigint, p_estimado jsonb\)/);
  });
});
