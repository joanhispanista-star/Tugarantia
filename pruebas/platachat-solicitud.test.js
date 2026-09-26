/* ============================================================================
 * PLATACHAT — LA BASE, FASE 1b: LA NEGOCIACIÓN CON RELOJ. 15 de septiembre de 2026.
 *
 *   node --test            (desde la raíz; descubre pruebas/*.test.js)
 *
 * Pruebas ESTÁTICAS sobre base/20261005_platachat_solicitud.sql: la solicitud
 * con hora límite, la propuesta automática (resolver_vencidas), el gerente que
 * contesta desde su celular, los avisos por Telegram (pg_net) y las tres
 * funciones de Joan que se redefinen para que el reloj corra al leer.
 *
 * Una migración no se compila acá (no hay psql local): la corre Joan pegándola
 * en el SQL Editor, y el error le sale a él. Lo único que la mira antes es
 * esto. Cada prueba vigila un fallo que este proyecto ya pagó una vez, o uno
 * que esta fase estrena:
 *
 *   · `revoke ... from public` no cierra nada (28-ago: 28 funciones abiertas).
 *   · Una función stable que escribe no funciona NUNCA (8-sep, error 25006):
 *     y acá mi_solicitud —que era stable— pasa a correr el reloj, que escribe.
 *   · Dos firmas con el mismo nombre dejan a PostgREST sin saber cuál llamar:
 *     las tres redefinidas tienen que conservar la firma de 20260908 letra
 *     por letra, y ninguna función nueva puede llamarse como una vieja.
 *   · Un $$ suelto revienta el pegado doscientas líneas más abajo.
 *   · Supabase corre en UTC: a las 19:30 de Bogotá `current_date` ya es
 *     mañana. Ninguna función nueva puede usarlo.
 *   · El aviso va a un tercero (Telegram): nombre, monto, fecha y los últimos
 *     cuatro del celular. Nunca la cédula ni el celular completo (Ley 1581).
 *   · Un token de bot pegado en el archivo es un token en git para siempre.
 *   · pg_net es asíncrono: lo que se guarda es 'encolado', nunca «enviado».
 *   · Y la de las DOS VERDADES: el cupo que calcula el SQL tiene que ser la
 *     misma cuenta que hace app/ficha.js leer(); se clava del lado JS.
 *
 * Los ayudantes (firmaDe, funcionesDe, sinComentarios) son COPIA de
 * pruebas/platachat-base.test.js: se copian y no se importan, para que un
 * cambio allá no mueva lo que se mide acá sin que nadie lo vea.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const M = require('../app/motor.js');
const FICHA = require('../app/ficha.js');

const ARCHIVO = 'base/20261005_platachat_solicitud.sql';
const ORIGEN_JOAN = 'base/20260908_primer_credito.sql';
const T = leer(ARCHIVO);
/* Escrito partido para que ESTE archivo no cuente como un $$ suelto si algún
   día un barrido lee también las pruebas. */
const DD = '$' + '$';

/* Sin comentarios: la prosa nombra cosas que el código no hace («nunca la
   cédula»), y un centinela que lee prosa se caza solo. */
const sinComentarios = t => t
  .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, ' ')
  .replace(/^\s*--.*$/gm, ' ')
  .replace(/--[^\n]*$/gm, ' ');

/* «p_id bigint, p_texto text default ''» → 'bigint, text'. Es la firma con
   la que hay que escribir el revoke y el grant. */
function firmaDe(params) {
  return params.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const sin = p.replace(/\s+default\s+[\s\S]*$/i, '').trim();
    return sin.split(/\s+/).slice(1).join(' ');
  }).join(', ');
}

/* Las funciones de un archivo: nombre, firma, cabeza (entre el paréntesis de
   cierre y el primer $$) y cuerpo (entre los dos $$). */
function funcionesDe(txt) {
  const out = [];
  const re = /create or replace function public\.(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(txt))) {
    let i = re.lastIndex, nivel = 1;
    while (i < txt.length && nivel > 0) {
      if (txt[i] === '(') nivel++; else if (txt[i] === ')') nivel--;
      i++;
    }
    const params = txt.slice(re.lastIndex, i - 1);
    const abre = txt.indexOf(DD, i);
    const cierra = txt.indexOf(DD, abre + 2);
    assert.ok(abre > 0 && cierra > abre, 'la función ' + m[1] + ' no tiene sus dos $$');
    out.push({
      nombre: m[1], firma: firmaDe(params),
      cabeza: txt.slice(i, abre),
      cuerpo: txt.slice(abre + 2, cierra),
      cuerpoLimpio: sinComentarios(txt.slice(abre + 2, cierra))
    });
  }
  return out;
}

const FUNCS = funcionesDe(T);
const F = Object.fromEntries(FUNCS.map(f => [f.nombre, f]));
const tablasDe = txt => [...txt.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = s => sinComentarios(s).replace(/\s+/g, ' ').trim();
/* 15-sep-2026: la palabra puede ir en la MISMA línea que «language» (así lo
   escribe ya el repo: `language sql immutable` en supabase.sql y en
   20260810_codigo_acceso.sql), y la regex anterior exigía que ocupara una
   línea entera: una función que escribe podía quedar stable sin que ninguna
   prueba fallara (se comprobó por mutación en aceptar_propuesta_platachat y
   en mi_solicitud: 61/61 en verde). La cabeza va del paréntesis de cierre al
   primer $$: ahí esas palabras solo pueden ser la volatilidad. sinComentarios
   por si un día alguien escribe «-- no stable» entre `returns` y `as $$`. */
const esStable = fn => /\b(stable|immutable)\b/i.test(sinComentarios(fn.cabeza));

/* Quién es quién, según el contrato. Las internas que el contrato nombra
   más las que el archivo añadió (textos y fechas en un solo sitio): todas
   sin permiso para nadie desde afuera. */
const INTERNAS_DEL_CONTRATO = ['pesos_texto', 'hoy_bogota', 'hora_bogota_texto', 'propuesta_platachat_de',
  'responsable_de', 'cupo_platachat_de', 'avisar_platachat', 'resolver_vencidas', 'solicitudes_platachat_avisar'];
const INTERNAS = INTERNAS_DEL_CONTRATO.concat(['fecha_texto', 'hora_texto', 'dia_bogota_texto', 'quincenas_texto',
  'numero_json', 'llave_de_solicitud', 'texto_aviso']);
const CLIENTE = ['solicitar_platachat', 'mi_solicitud_platachat', 'aceptar_propuesta_platachat', 'reproponer_platachat'];
/* 15-sep-2026: politica_platachat() la llama el cliente con su sesión, pero
   NO escribe: la calculadora de la página cotiza con la MISMA politica_app
   que firma resolver_vencidas en vez de con literales que hasta hoy
   coincidían por casualidad (el día que Joan cambiara el 35 % o los 8 días
   desde el CRM, el cliente veía dos cifras para lo mismo). Va en su propio
   grupo y no en CLIENTE porque CLIENTE entra en ESCRIBEN, y esta es la única
   abierta que puede —y debe— ser stable: metida ahí, la prueba del 25006 la
   daría por rota justo al revés. */
const LECTURA = ['politica_platachat'];
const EQUIPO = ['contrapropuesta_gerente'];
const REDEFINIDAS = ['mi_solicitud', 'listar_solicitudes_abiertas', 'contrapropuesta_solicitud'];
const JOAN = ['politica_app_leer', 'politica_app_guardar', 'avisos_destino_guardar', 'avisos_destinos_listar',
  'aviso_probar', 'avisos_recientes'];
/* Las que escriben o pasan por clave_ok: ninguna puede ser stable (25006). */
const ESCRIBEN = ['resolver_vencidas', 'avisar_platachat', 'solicitudes_platachat_avisar'].concat(CLIENTE, EQUIPO, REDEFINIDAS, JOAN);


/* ==========================================================================
 * 1. LO QUE TODA FUNCIÓN TIENE QUE CUMPLIR
 * ======================================================================== */
describe('20261005: lo que TODA función tiene que cumplir', () => {

  test('hay 31 funciones, cada una con su grupo, y las del contrato están todas', () => {
    const nombres = FUNCS.map(f => f.nombre);
    assert.equal(nombres.length, 31, 'esperaba 31 funciones y hay ' + nombres.length + ': ' + nombres.join(', '));
    assert.equal(new Set(nombres).size, nombres.length, 'un nombre se define dos veces en el archivo');
    const conocidas = new Set([].concat(INTERNAS, CLIENTE, LECTURA, EQUIPO, REDEFINIDAS, JOAN));
    const sinGrupo = nombres.filter(n => !conocidas.has(n));
    assert.deepEqual(sinGrupo, [], 'funciones que esta prueba no clasifica (¿internas o abiertas?): ' + sinGrupo.join(', '));
    [...conocidas].forEach(n => assert.ok(F[n], 'falta la función ' + n + ' que pide el contrato'));
  });

  test('cada función lleva security definer y set search_path; solo las que hablan con pg_net suman «extensions, net»', () => {
    FUNCS.forEach(fn => {
      assert.match(fn.cabeza, /security definer/, fn.nombre + ' no es security definer');
      assert.match(fn.cabeza, /set search_path\s*=\s*public/, fn.nombre + ' no fija search_path');
    });
    /* Las que llaman a net.* necesitan el esquema en el search_path; las
       demás no lo cargan, para no abrirles un esquema que no usan. */
    const conNet = FUNCS.filter(fn => /\bnet\._http_response|\bnet\.http_post/.test(fn.cuerpoLimpio)).map(fn => fn.nombre).sort();
    assert.deepEqual(conNet, ['avisar_platachat', 'avisos_recientes'], 'otras funciones tocan net.*');
    ['avisar_platachat', 'avisos_recientes', 'resolver_vencidas'].forEach(n =>
      assert.match(F[n].cabeza, /set search_path\s*=\s*public,\s*extensions,\s*net/, n + ' no lleva «public, extensions, net»'));
  });

  test('revoke por firma EXACTA de public, anon y authenticated para TODAS; grant solo para las que se llaman desde afuera', () => {
    /* La lección del 28-ago: Supabase concede EXECUTE explícito a anon y a
       authenticated en cada función nueva del esquema public, y un
       `revoke ... from public` no lo quita. Se revoca de los tres, con la firma
       exacta y UN solo espacio (se compara la línea entera), y se concede lo
       justo. Las internas no se conceden a nadie: ni un grant con su nombre. */
    FUNCS.forEach(fn => {
      const firma = fn.nombre + '(' + fn.firma + ')';
      assert.ok(T.indexOf('revoke all on function public.' + firma + ' from public, anon, authenticated;') >= 0,
        'falta «revoke all on function public.' + firma + ' from public, anon, authenticated;»');
    });
    INTERNAS.forEach(n => assert.ok(!new RegExp('grant\\s+execute on function public\\.' + n + '\\(').test(sinComentarios(T)),
      'la interna ' + n + ' tiene un grant: quedaría abierta desde afuera'));
    [].concat(CLIENTE, LECTURA, EQUIPO, REDEFINIDAS, JOAN).forEach(n => {
      const firma = n + '(' + F[n].firma + ')';
      assert.match(T, new RegExp('grant\\s+execute on function public\\.' + escapar(firma) + ' to (anon|authenticated);'),
        'falta el grant explícito de ' + firma);
    });
    /* Y el revoke va ANTES del grant (un grant seguido de un revoke deja cerrado). */
    [].concat(CLIENTE, LECTURA, EQUIPO, REDEFINIDAS, JOAN).forEach(n => {
      const firma = n + '(' + F[n].firma + ')';
      const r = T.indexOf('revoke all on function public.' + firma), g = T.search(new RegExp('grant\\s+execute on function public\\.' + escapar(firma)));
      assert.ok(r > 0 && g > r, n + ': el grant va antes del revoke y el revoke lo borra');
    });
  });

  test('ningún grant en bloque: cada grant del archivo es «execute on function public.<nombre>(firma) to anon|authenticated», uno por función abierta', () => {
    /* 15-sep-2026: la lección del 28-ago vuelta regla. Las comprobaciones de
       arriba miran grants POR NOMBRE, y un solo «grant execute on all
       functions in schema public», «grant all on function …» o «alter default
       privileges» reabre las 17 internas recién revocadas sin que ninguna de
       ellas lo vea (se comprobó por mutación: 61/61 en verde con las dos
       formas; resolver_vencidas y cupo_platachat_de quedaban llamables con la
       llave pública). Se barre sobre sinComentarios(T) porque la cabecera
       habla de grants en prosa; \bgrant\b no engancha «grantee» del bloque
       final. La migración escribe «grant  execute» con dos espacios: por eso
       se normaliza el blanco antes de comparar. El conteo se cruza con las
       listas de abiertas para cazar también un grant repetido. */
    const limpio = sinComentarios(T);
    const grants = [...limpio.matchAll(/\bgrant\b[^;]*;/gi)].map(g => g[0].replace(/\s+/g, ' '));
    const abiertas = CLIENTE.length + LECTURA.length + EQUIPO.length + REDEFINIDAS.length + JOAN.length;
    assert.equal(grants.length, abiertas, 'esperaba ' + abiertas + ' grants (uno por función abierta) y hay ' + grants.length + ': falta uno o hay uno de más');
    grants.forEach(g => assert.match(g, /^grant execute on function public\.\w+\([^)]*\) to (anon|authenticated);$/,
      'grant que no es por firma exacta y a un solo rol: «' + g + '»'));
    assert.ok(!/alter default privileges|on all functions|grant all/i.test(limpio),
      'hay un grant en bloque (all functions / grant all / default privileges): reabre las internas');
  });

  test('a quién se concede: el cliente y el equipo con sesión; Joan con la llave pública; las redefinidas como en 20260908', () => {
    const grantA = n => [...sinComentarios(T).matchAll(new RegExp('grant\\s+execute on function public\\.' + n + '\\([^)]*\\) to (anon|authenticated)', 'g'))].map(m => m[1]);
    CLIENTE.concat(LECTURA, EQUIPO).forEach(n => assert.deepEqual(grantA(n), ['authenticated'], n + ' no se concede solo a authenticated'));
    JOAN.forEach(n => assert.deepEqual(grantA(n), ['anon'], n + ' no se concede solo a anon (la clave va por argumento)'));
    /* Las tres redefinidas conservan EXACTAMENTE el destinatario que tenían:
       un cambio acá abriría o cerraría una puerta que nadie pidió tocar. */
    const origen = sinComentarios(leer(ORIGEN_JOAN));
    REDEFINIDAS.forEach(n => {
      const antes = [...origen.matchAll(new RegExp('grant\\s+execute on function public\\.' + n + '\\([^)]*\\)\\s+to (anon|authenticated)', 'g'))].map(m => m[1]);
      assert.ok(antes.length === 1, 'no encontré el grant original de ' + n + ' en ' + ORIGEN_JOAN);
      assert.deepEqual(grantA(n), antes, n + ' cambió de destinatario respecto a 20260908');
    });
  });

  test('ninguna función stable escribe, y ninguna de las que escriben o pasan por clave_ok es stable (25006)', () => {
    const ESCRIBE = /\b(insert\s+into|update\s+\w|delete\s+from|nextval\s*\(|clave_ok|pg_sleep|net\.http_post|perform\s+public\.resolver_vencidas)/i;
    FUNCS.forEach(fn => {
      if (esStable(fn)) assert.ok(!ESCRIBE.test(fn.cuerpoLimpio), fn.nombre + ' es stable y escribe: no funcionaría nunca');
    });
    ESCRIBEN.forEach(n => assert.ok(!esStable(F[n]), n + ' escribe (o pasa por clave_ok) y es stable'));
    /* 15-sep-2026: el formato de UNA línea (`language plpgsql stable`) es el
       que la regex vieja de esStable no veía; se fija acá para que no vuelva. */
    assert.ok(esStable({ cabeza: 'returns jsonb language plpgsql stable security definer set search_path = public as ' }),
      'esStable no ve «stable» en la misma línea que «language»');
    assert.ok(!esStable({ cabeza: 'returns jsonb language plpgsql security definer set search_path = public as ' }),
      'esStable ve «stable» donde no lo hay');
    /* Las que devuelven texto o fecha sí pueden ser stable/immutable, pero
       ninguna de ellas puede tocar una tabla de escritura. */
    INTERNAS.filter(n => !ESCRIBEN.includes(n)).forEach(n =>
      assert.ok(!ESCRIBE.test(F[n].cuerpoLimpio), 'la interna de lectura ' + n + ' escribe'));
  });

  test('no hay «create policy» ni «drop function»; el único drop es el del disparador propio', () => {
    const limpio = sinComentarios(T);
    assert.ok(!/create\s+policy/i.test(limpio), 'crea una política: la reja de esta casa son las funciones, no las políticas');
    assert.ok(!/drop\s+function/i.test(limpio), 'tira una función');
    const drops = [...limpio.matchAll(/drop\s+\w+[^;]*;/gi)].map(m => m[0].replace(/\s+/g, ' '));
    assert.deepEqual(drops, ['drop trigger if exists solicitudes_platachat_avisar on public.solicitudes;'], 'hay drops que no son el del disparador: ' + drops.join(' | '));
  });

  test('las dos tablas nuevas encienden RLS, se revocan de la llave pública y tienen las columnas del contrato', () => {
    assert.deepEqual(tablasDe(T), ['avisos', 'avisos_destinos']);
    tablasDe(T).forEach(t => {
      assert.ok(T.indexOf('alter table public.' + t + ' enable row level security;') >= 0, 'la tabla ' + t + ' no enciende RLS');
      assert.ok(T.indexOf('revoke all on table public.' + t + ' from public, anon, authenticated;') >= 0, 'la tabla ' + t + ' no se revoca de anon y authenticated');
    });
    const avisos = T.slice(T.indexOf('create table if not exists public.avisos ('), T.indexOf('create table if not exists public.avisos_destinos'));
    ['id           bigserial   primary key', 'evento       text        not null', 'solicitud_id bigint', 'destino      text        not null',
     'chat_id      text', 'texto        text        not null', "estado       text        not null default 'encolado'",
     "check (estado in ('encolado', 'sin_token', 'sin_destino', 'sin_pg_net', 'error'))", 'peticion_id  bigint', 'detalle      text',
     'creado_en    timestamptz not null default now()']
      .forEach(col => assert.ok(avisos.indexOf(col) >= 0, 'avisos perdió «' + col + '»'));
    const destinos = T.slice(T.indexOf('create table if not exists public.avisos_destinos ('), T.indexOf('alter table public.avisos_destinos'));
    ['quien       text        primary key', 'chat_id     text        not null', "nombre      text        not null default ''",
     'activo      boolean     not null default true', 'actualizado timestamptz not null default now()']
      .forEach(col => assert.ok(destinos.indexOf(col) >= 0, 'avisos_destinos perdió «' + col + '»'));
  });

  test('no se repega supabase.sql: ni sus tablas ni sus funciones vuelven a aparecer', () => {
    const base = leer('base/supabase.sql');
    const tablasBase = new Set(tablasDe(base));
    const funcsBase = new Set([...base.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]));
    tablasDe(T).forEach(t => assert.ok(!tablasBase.has(t), 'vuelve a crear la tabla ' + t + ' de supabase.sql'));
    FUNCS.forEach(fn => assert.ok(!funcsBase.has(fn.nombre), 'vuelve a definir ' + fn.nombre + ' de supabase.sql'));
    /* Pesa ~90 KB porque trae 30 funciones y la cabecera que pide el
       contrato; el tope (el doble) caza un supabase.sql pegado encima. */
    assert.ok(T.length < 180000, 'pesa demasiado para ser una migración: ¿se pegó supabase.sql?');
    assert.ok(T.length > 60000, 'pesa muy poco: ¿se perdió parte del archivo?');
  });

  test('sobrecargas: mismo nombre en otra migración → MISMA firma, y solo en las tres redefinidas', () => {
    /* Dos firmas con el mismo nombre dejan a PostgREST sin saber cuál llamar
       (300) y NINGUNA se puede llamar. Se mira contra TODOS los .sql de base/
       menos el TODO-PENDIENTE (borrador que no se pega) y este mismo. */
    const otros = fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /\.sql$/.test(f) && 'base/' + f !== ARCHIVO && !/TODO-PENDIENTE/.test(f));
    assert.ok(otros.length >= 10, 'el barrido encontró muy pocas migraciones: no está midiendo nada');
    const ajenas = new Map();
    otros.forEach(f => funcionesDe(leer('base/' + f)).forEach(fn => {
      if (!ajenas.has(fn.nombre)) ajenas.set(fn.nombre, []);
      ajenas.get(fn.nombre).push({ archivo: f, firma: fn.firma });
    }));
    const repetidas = FUNCS.filter(fn => ajenas.has(fn.nombre)).map(fn => fn.nombre).sort();
    assert.deepEqual(repetidas, REDEFINIDAS.slice().sort(),
      'redefine funciones que no son las tres del contrato (o le falta alguna): ' + repetidas.join(', '));
    repetidas.forEach(n => ajenas.get(n).forEach(a =>
      assert.equal(F[n].firma, a.firma, n + ' cambia de firma respecto a ' + a.archivo + ': PostgREST vería dos')));
  });

  test('los $$ van en pareja y cuadran con las funciones y los bloques do', () => {
    const n = (T.match(/\$\$/g) || []).length;
    const funcs = (T.match(/create or replace function/g) || []).length;
    const dos = (T.match(/do [$][$]/g) || []).length;
    /* 15-sep-2026: el esperado se DERIVA del archivo. Antes decía «funcs ===
       30» y se ponía roja cada vez que la migración ganaba una función
       legítima (politica_platachat la dejó en 31): ruido que enseña a bajar
       el número a mano. Lo que aquí duele es un $$ SUELTO, y ese lo caza la
       ecuación, que sigue clavada. La cuenta se cruza además con el
       analizador funcionesDe: si el analizador perdiera una función, las
       demás pruebas dejarían de mirarla sin que nadie se entere. */
    assert.equal(n, 2 * (funcs + dos), 'tiene ' + n + ' $$ para ' + funcs + ' funciones y ' + dos + ' bloques do: hay un $$ suelto');
    assert.equal(funcs, FUNCS.length, 'funcionesDe no ve las mismas funciones que declara el archivo: alguna se quedaría sin vigilar');
    assert.ok(dos >= 4, 'esperaba al menos cuatro bloques do (la guarda inicial, los checks de politica_app, pg_cron y la comprobación final) y hay ' + dos);
  });

  test('el bloque inicial ABORTA si falta lo anterior, antes de crear nada', () => {
    const primerDo = T.indexOf('do ' + DD);
    const primerCambio = Math.min(...['alter table', 'create table', 'create or replace function', 'create index', 'create extension']
      .map(s => T.indexOf(s)).filter(i => i > 0));
    assert.ok(primerDo > 0 && primerDo < primerCambio, 'la guarda de lo anterior no va antes de tocar la base');
    const guarda = T.slice(primerDo, primerCambio);
    ["to_regprocedure('public.llave_de_sesion(text)') is null",
     "to_regprocedure('public.contrapropuesta_de(bigint, integer, integer, text, text)') is null",
     "to_regprocedure('public.mi_alcance(text)') is null",
     "to_regprocedure('public.celular_de_sesion()') is null",
     "to_regclass('public.politica_app') is null",
     "table_name = 'solicitudes' and column_name = 'app'"]
      .forEach(s => assert.ok(guarda.indexOf(s) >= 0, 'la guarda inicial no comprueba «' + s + '»'));
    assert.ok((guarda.match(/raise exception/g) || []).length >= 4, 'la guarda inicial no aborta con raise exception');
    ['20260914b_tres_canales.sql', '20260908_primer_credito.sql', '20260910_equipo_en_la_nube.sql', '20260921_platachat_app.sql', '20260923_platachat_chat.sql']
      .forEach(f => assert.ok(guarda.indexOf(f) >= 0, 'la guarda no dice que falta ' + f));
  });

  test('el bloque final comprueba permisos, volatilidad, disparador y RLS, y avisa a PostgREST ANTES', () => {
    const ultimo = T.lastIndexOf('do ' + DD);
    assert.ok(ultimo > 0, 'no tiene bloque do final');
    const bloque = T.slice(ultimo);
    assert.match(bloque, /has_function_privilege\('anon'/, 'el bloque final no comprueba qué puede llamar anon');
    assert.match(bloque, /has_function_privilege\('authenticated'/, 'el bloque final no comprueba qué puede llamar authenticated');
    assert.match(bloque, /raise exception/, 'el bloque final no aborta si algo quedó mal');
    /* 15-sep-2026: se clava el PREDICADO seguido del raise, no la frase. Antes
       bastaba con que el texto apareciera en el bloque —y aparece también en
       el mensaje del raise exception—, así que `and false` en el predicado
       dejaba la guarda vacía con la prueba en verde: el «centinela que se
       caza solo» que la cabecera dice evitar. Y la lista de proname se extrae
       y se cruza con ESCRIBEN, menos la función de trigger: corre dentro de
       la sentencia que escribe, nunca vía PostgREST, y el SQL la deja fuera a
       propósito. */
    assert.match(bloque, /and p\.provolatile <> 'v'\) then\s*raise exception/, 'la guarda de volatilidad no aborta');
    const lista = (bloque.match(/p\.proname in \(([\s\S]*?)\)\s*and p\.provolatile/) || [])[1] || '';
    ESCRIBEN.filter(n => n !== 'solicitudes_platachat_avisar').forEach(n =>
      assert.ok(lista.indexOf("'" + n + "'") >= 0, 'la guarda de volatilidad del bloque final no incluye ' + n));
    /* 15-sep-2026: y las de solo lectura NO van en esa lista: la guarda exige
       provolatile = 'v' y abortaría el pegado de una función que es stable a
       propósito (politica_platachat). */
    LECTURA.forEach(n => assert.ok(lista.indexOf("'" + n + "'") < 0,
      n + ' está en la guarda de volatilidad y es stable: el pegado abortaría'));
    LECTURA.forEach(n => assert.ok(bloque.indexOf("'public." + n + "(") >= 0,
      'el bloque final no comprueba que ' + n + ' quedó llamable con sesión'));
    assert.match(bloque, /pg_trigger[\s\S]*tgname = 'solicitudes_platachat_avisar'/, 'no vigila que el disparador exista');
    assert.match(bloque, /relrowsecurity/, 'no vigila el RLS de las tablas de avisos');
    assert.match(bloque, /proname = nombre and pronamespace = 'public'::regnamespace[\s\S]*?if n <> 1/, 'no vigila UNA sola firma por nombre');
    /* Las listas van en arrays y se recorren con foreach: se mira que el
       nombre esté en la lista y que la lista se compruebe con el rol debido. */
    assert.ok(bloque.indexOf("'public.listar_solicitudes_abiertas(text)'") >= 0, 'no vigila que la bandeja de hoy siga abierta a anon');
    assert.match(bloque, /if not has_function_privilege\('anon', nombre, 'execute'\) then/, 'las de Joan no se comprueban con anon');
    assert.ok(bloque.indexOf("'public.solicitar_platachat(bigint, date, integer)'") >= 0, 'no vigila que solicitar_platachat sea llamable con sesión');
    assert.match(bloque, /if not has_function_privilege\('authenticated', nombre, 'execute'\) then/, 'las del cliente no se comprueban con authenticated');
    assert.match(bloque, /if has_function_privilege\('anon', nombre, 'execute'\)\s+or has_function_privilege\('authenticated', nombre, 'execute'\) then/,
      'las internas no se comprueban cerradas a los dos roles');
    /* 15-sep-2026: mismas razones que arriba: el predicado con su raise, no la
       frase. La del reloj sí se cazaba (el literal solo está en el like),
       pero se escribe igual que las otras para que nadie la afloje al copiar. */
    assert.match(bloque, /if cuerpo not like '%perform public\.resolver_vencidas\(\)%' then\s*raise exception/, 'la guarda del reloj en las redefinidas no aborta');
    assert.match(bloque, /if cuerpo like '%\.cedula%' or cuerpo like '%\.celular \|\|%' then\s*raise exception/,
      'la guarda de la Ley 1581 no aborta si texto_aviso lee la cédula o el celular');
    assert.match(bloque, /if cuerpo not like '%for update skip locked%' then\s*raise exception/, 'la guarda del skip locked no aborta');
    /* Y las dos guardas que hasta hoy ni se miraban. */
    assert.match(bloque, /if cuerpo not like '%exception when others%' then\s*raise exception/, 'la guarda del exception when others de avisar_platachat no aborta');
    assert.match(bloque, /if cuerpo not like '%right\(coalesce\(p_sol\.celular, ''''\), 4\)%' then\s*raise exception/, 'la guarda de los últimos cuatro del celular no aborta');
    /* Cada interna del contrato figura en la lista de «cerradas» del bloque. */
    INTERNAS.forEach(n => assert.ok(bloque.indexOf("'public." + n + "(") >= 0, 'el bloque final no comprueba que ' + n + ' esté cerrada'));
    const notify = T.indexOf("notify pgrst, 'reload schema'");
    assert.ok(notify > 0 && notify < ultimo, 'el notify falta o va después de la comprobación');
  });

  test('pg_net: la MISMA línea de 20260918_infobip.sql, y la extensión se pregunta por pg_extension antes de usarla', () => {
    const linea = 'create extension if not exists pg_net with schema extensions;';
    assert.ok(leer('base/20260918_infobip.sql').indexOf(linea) >= 0, '20260918_infobip.sql ya no trae la línea de pg_net que se copia');
    const ext = [...sinComentarios(T).matchAll(/create extension[^;]*;/g)].map(m => m[0]);
    assert.deepEqual(ext, [linea], 'crea extensiones que no son pg_net en `extensions`: ' + ext.join(' | '));
    ['avisar_platachat', 'avisos_recientes'].forEach(n =>
      assert.match(F[n].cuerpoLimpio, /exists \(select 1 from pg_extension where extname = 'pg_net'\)/, n + ' no pregunta si pg_net existe antes de usarlo'));
    /* Y la respuesta de pg_net se lee con SQL dinámico: la función existe aunque no haya pg_net. */
    assert.match(F.avisos_recientes.cuerpoLimpio, /execute 'select r\.status_code, r\.error_msg from net\._http_response r where r\.id = \$1'/);
    assert.match(F.avisos_recientes.cuerpoLimpio, /to_regclass\('net\._http_response'\) is not null/);
  });

  test('pg_cron es opcional: se programa solo si la extensión existe, cada minuto, con nombre fijo', () => {
    assert.match(sinComentarios(T), /if exists \(select 1 from pg_extension where extname = 'pg_cron'\) then\s*perform cron\.schedule\('platachat_resolver_vencidas', '\* \* \* \* \*', 'select public\.resolver_vencidas\(\)'\);\s*end if;/,
      'el bloque de pg_cron no está guardado por pg_extension o no programa resolver_vencidas cada minuto');
  });

  test('sin token de bot en el archivo: el token vive en config_privada y su INSERT queda comentado', () => {
    assert.ok(!/bot\d{6,}:/.test(T), 'hay un token de Telegram pegado en la migración');
    assert.match(F.avisar_platachat.cuerpoLimpio, /select valor into token from public\.config_privada where clave = 'telegram_token'/);
    assert.ok(!/insert into public\.config_privada/.test(sinComentarios(T)), 'inserta en config_privada: eso lo hace Joan a mano, con su token');
    assert.match(T, /insert into public\.config_privada/, 'la cabecera o el final ya no traen la receta (comentada) del token');
  });

  test('Ley 1581: el aviso a Telegram lleva nombre, monto, fecha y «cel ···1234», nunca la cédula ni el celular', () => {
    const c = F.texto_aviso.cuerpoLimpio;
    assert.ok(c.indexOf('.cedula') < 0, 'texto_aviso lee la cédula');
    assert.ok(c.indexOf('.celular ||') < 0, 'texto_aviso concatena el celular completo');
    assert.match(c, /cel ···' \|\| right\(coalesce\(p_sol\.celular, ''\), 4\)/, 'texto_aviso no recorta el celular a los últimos cuatro');
    assert.equal((c.match(/p_sol\.celular/g) || []).length, 1, 'texto_aviso lee el celular en más de un sitio: revisar que ninguno vaya entero');
    /* Todo aviso de solicitud se arma en texto_aviso: cada avisar_platachat
       (menos la prueba del destino, que manda un saludo) recibe texto_aviso. */
    FUNCS.filter(fn => fn.nombre !== 'avisar_platachat' && fn.nombre !== 'aviso_probar').forEach(fn => {
      const llamadas = [...fn.cuerpoLimpio.matchAll(/avisar_platachat\(([^;]*)\);/g)];
      llamadas.forEach(l => {
        assert.match(l[1], /public\.texto_aviso\(/, fn.nombre + ' avisa con un texto armado por fuera de texto_aviso');
        /* 15-sep-2026: mencionar texto_aviso no basta. texto_aviso pega su
           tercer argumento (extra) tal cual al texto, y la guarda SQL del
           bloque final solo mira el prosrc de texto_aviso, no el de quien la
           llama: la cédula o el celular podían viajar a Telegram por el extra
           (`'cc ' || s2.cedula || …`) o pegados después del paréntesis
           (`texto_aviso(…) || ' ' || s2.celular`) con todo en verde (se
           comprobó por mutación en resolver_vencidas). La reja va en quien
           llama: ni la palabra cedula ni «.celular» en la llamada, y el tercer
           argumento es SOLO la llamada a texto_aviso, nada concatenado. */
        assert.ok(!/\bcedula\b/.test(l[1]) && !/\.celular\b/.test(l[1]), fn.nombre + ' pasa la cédula o el celular al aviso');
        assert.match(l[1].replace(/\s+/g, ' ').trim(), /^'[a-z_]+', \w+, public\.texto_aviso\([^;]*\)$/,
          fn.nombre + ' concatena algo al texto del aviso fuera de texto_aviso');
      });
    });
    const probar = F.aviso_probar.cuerpoLimpio;
    assert.match(probar, /'Hola: soy el aviso de PlataChat\. Si lees esto, quedó bien\.'/);
    assert.ok(!/cedula/.test(probar), 'la prueba del destino toca la cédula');
    assert.match(probar, /right\(q, 4\)/, 'la prueba del destino muestra el celular entero del gerente');
    /* Los cinco eventos del contrato tienen texto. */
    ['nueva', 'aceptada', 'automatica', 'sin_automatica', 'contestada'].forEach(e =>
      assert.match(c, new RegExp("when '" + e + "' then"), 'texto_aviso no tiene el evento ' + e));
    assert.match(c, /entrégale la plata y crea el crédito/);
    assert.match(c, /contesta desde el CRM → Solicitudes/);
  });

  test('hora de Colombia: America/Bogota en UN solo sitio de conversión, y current_date en ninguna parte', () => {
    assert.ok(!/current_date/i.test(T), 'usa current_date: en Supabase (UTC) a las 19:30 de Bogotá ya es mañana');
    assert.ok(!/now\(\)::date/.test(sinComentarios(T)), 'usa now()::date, que es la fecha del servidor (UTC)');
    const conZona = FUNCS.filter(fn => /America\/Bogota/.test(fn.cuerpoLimpio)).map(fn => fn.nombre).sort();
    assert.deepEqual(conZona, ['hora_texto', 'hoy_bogota'], 'la zona horaria se escribe en más sitios que hoy_bogota y hora_texto');
    assert.match(F.hoy_bogota.cuerpoLimpio, /\(p at time zone 'America\/Bogota'\)::date/);
    assert.equal(F.hoy_bogota.firma, 'timestamptz');
    /* El parámetro va en la línea del create (la cabeza empieza después del paréntesis). */
    assert.match(T, /create or replace function public\.hoy_bogota\(p timestamptz default now\(\)\)/, 'hoy_bogota() sin argumento tiene que ser «hoy»');
    /* Las fechas que decide el negocio salen de hoy_bogota(), nunca de now() a secas. */
    ['solicitar_platachat', 'reproponer_platachat'].forEach(n => assert.match(F[n].cuerpoLimpio, /hoy\s*:= public\.hoy_bogota\(\)/, n + ' no toma hoy de hoy_bogota'));
    assert.match(F.contrapropuesta_gerente.cuerpoLimpio, /fecha := public\.hoy_bogota\(\) \+ p_dias/);
    assert.match(F.resolver_vencidas.cuerpoLimpio, /base\s*:= public\.hoy_bogota\(s\.responder_antes_de\)/, 'la automática no cuenta desde la hora en que VENCIÓ');
  });

  test('la cabecera trae LO QUE PIDIÓ JOAN, con sus palabras', () => {
    const cabecera = T.slice(0, T.indexOf('do ' + DD)).replace(/^--\s?/gm, '').replace(/\s+/g, ' ');
    assert.ok(cabecera.indexOf('LO QUE PIDIÓ JOAN') >= 0);
    assert.ok(cabecera.indexOf('que llegue una contrapropuesta al CRM y si yo mismo o el gerente asignado no da una contrapropuesta a ese cliente que el CRM en una hora la de automaticamente calculando simpre el 35%, y mostrarle con claridad cuando ganaria de garantia para su siguiente prestamo') >= 0,
      'la cita de Joan no está textual en la cabecera');
  });
});


/* ==========================================================================
 * 2. LAS COLUMNAS Y LOS ÍNDICES
 * ======================================================================== */
describe('20261005: las columnas nuevas y el índice que hace barato el reloj', () => {

  test('solicitudes gana celular, responder_antes_de, responsable, resuelta_en y pedido, con add column if not exists', () => {
    [['celular', 'text'], ['responder_antes_de', 'timestamptz'], ['responsable', 'text'], ['resuelta_en', 'timestamptz'], ['pedido', 'jsonb']]
      .forEach(([c, tipo]) => assert.match(T, new RegExp('alter table public\\.solicitudes add column if not exists ' + c + '\\s+' + tipo + ';'),
        'falta la columna solicitudes.' + c + ' ' + tipo));
  });

  test('los tres índices: vencidas, celular y app/fecha', () => {
    assert.match(T, /create index if not exists solicitudes_platachat_vencen\s+on public\.solicitudes \(responder_antes_de\)\s+where estado = 'nueva' and app = 'platachat';/,
      'sin el índice parcial, resolver_vencidas leería la tabla entera en cada lectura');
    assert.match(T, /create index if not exists solicitudes_por_celular\s+on public\.solicitudes \(celular\);/);
    /* 15-sep-2026: el freno global (≥60 de platachat en 15 min, que la prueba
       de frenos sí exige) es `count(*) where app = … and creada_en > …`, y el
       único otro índice de solicitudes (solicitudes_pendientes, en
       supabase.sql) es parcial por estado = 'nueva': no le sirve. Quitar este
       índice dejaba todo en verde y el freno pasaba a barrer la tabla más
       caliente del sistema en cada pedido y en cada repropuesta. */
    assert.match(T, /create index if not exists solicitudes_por_app_fecha\s+on public\.solicitudes \(app, creada_en desc\);/,
      'sin este índice el freno global de 60/15 min (solicitar y reproponer) leería la tabla entera en cada pedido');
  });

  test('politica_app: costo_pct_cupo 20, capital 50.000–2.000.000, con_garantia estandar|misma, con checks por nombre', () => {
    assert.match(T, /alter table public\.politica_app add column if not exists costo_pct_cupo integer not null default 20;/);
    assert.match(T, /alter table public\.politica_app add column if not exists capital_minimo bigint\s+not null default 50000;/);
    assert.match(T, /alter table public\.politica_app add column if not exists capital_maximo bigint\s+not null default 2000000;/);
    assert.match(T, /alter table public\.politica_app add column if not exists con_garantia\s+text\s+not null default 'estandar';/);
    assert.match(T, /conname = 'politica_app_costo_cupo_en_rango'[\s\S]*?check \(costo_pct_cupo between 1 and 50\)/);
    assert.match(T, /conname = 'politica_app_minimo_positivo'[\s\S]*?check \(capital_minimo > 0\)/);
    assert.match(T, /conname = 'politica_app_maximo_positivo'[\s\S]*?check \(capital_maximo > 0\)/);
    assert.match(T, /conname = 'politica_app_con_garantia_valida'[\s\S]*?check \(con_garantia in \('estandar', 'misma'\)\)/);
    assert.ok(!/politica_nuevos/.test(sinComentarios(T)), 'toca politica_nuevos, que es la fila única de Tu Garantía');
  });
});


/* ==========================================================================
 * 3. EL RELOJ: resolver_vencidas y las tres de Joan que lo corren al leer
 * ======================================================================== */
describe('20261005: el reloj', () => {
  const RV = F.resolver_vencidas;

  test('resolver_vencidas es volátil, cerrada, y toma las vencidas con for update skip locked', () => {
    assert.match(RV.cabeza, /^\s*volatile\s*$/m);
    assert.equal(RV.firma, '');
    assert.match(RV.cabeza, /returns integer/);
    assert.match(RV.cuerpoLimpio, /where app = 'platachat' and estado = 'nueva'\s+and responder_antes_de is not null and responder_antes_de <= now\(\)[\s\S]*?for update skip locked/,
      'no filtra por app, estado y hora, o no usa for update skip locked');
    assert.match(RV.cuerpoLimpio, /return n;/);
  });

  test('sin garantía (o con_garantia = misma): la del nuevo con tope, un corte, firmada automatica_1h', () => {
    const c = RV.cuerpoLimpio;
    assert.match(c, /if \(not tiene\) or pol\.con_garantia = 'misma' then/);
    assert.match(c, /capital := least\(pedido_capital, pol\.capital_tope\);/);
    assert.match(c, /public\.propuesta_platachat_de\(capital, pct, fecha - desde, fecha, 1, pol\.texto, 'automatica_1h'\)/);
    assert.match(c, /pct := pol\.costo_pct;/);
    assert.match(c, /tiene\s*:= coalesce\(\(info ->> 'garantia_total'\)::bigint, 0\) > 0;/);
  });

  test('con garantía: la estándar dentro del cupo, para la fecha que pidió, y SIN precio si el cupo no llega al mínimo', () => {
    const c = RV.cuerpoLimpio;
    assert.match(c, /capital := least\(pedido_capital, v_cupo\);/);
    assert.match(c, /if capital < pol\.capital_minimo then/);
    assert.match(c, /jsonb_build_object\('automatica', 'sin_cupo'\)/);
    assert.match(c, /responder_antes_de = null,\s*resuelta_en = now\(\)\s*where id = s\.id/, 'la sin_cupo no sale del reloj');
    assert.match(c, /'No pude contestarte solo: tu cupo hoy es ' \|\| public\.pesos_texto\(v_cupo\)[\s\S]*?'\. Te contesta una persona por aquí\.'/);
    assert.match(c, /avisar_platachat\('sin_automatica', s2/);
    assert.match(c, /cortes := least\(4, greatest\(1, coalesce\(nullif\(s\.pedido ->> 'cortes', ''\)::integer, 1\)\)\);/);
    assert.match(c, /if fecha is null or fecha < base \+ 1 or fecha > base \+ 120 then fecha := base \+ 15; end if;/);
    assert.match(c, /pct := pol\.costo_pct_cupo;/);
    assert.match(c, /public\.propuesta_platachat_de\(capital, pct, dias, fecha, cortes, txt, 'automatica_1h'\)/);
    assert.match(c, /'Tu cupo de hoy es ' \|\| public\.pesos_texto\(v_cupo\) \|\| ': te proponemos eso\. Pagando en fecha, el siguiente sube\.'/);
    assert.match(c, /'Dentro de tu cupo, al precio de siempre\.'/);
    /* Una propuesta que nace vencida no se puede aceptar: si la fecha ya
       quedó atrás, se corre desde hoy (las dos ramas). */
    assert.equal((c.match(/if fecha <= hoy_real then desde := hoy_real; fecha := hoy_real \+ (pol\.dias|15); end if;/g) || []).length, 2);
  });

  test('promueve a contrapropuesta, escribe en el hilo como el automático y avisa', () => {
    const c = RV.cuerpoLimpio;
    assert.match(c, /set estado\s*= 'contrapropuesta',\s*contrapropuesta = cp,[\s\S]*?producto\s*= 'quincenal',\s*resuelta_en\s*= now\(\),\s*aceptada_en\s*= null\s*where id = s\.id/);
    assert.match(c, /tasa\s*= pct \/ 100\.0/);
    assert.match(c, /values \(v_llave, 'auto', 'solicitud',\s*'Nadie alcanzó a contestarte antes de la hora, así que te contesto yo, el automático: te proponemos '/);
    assert.match(c, /\. Mira la tarjeta y decide\.'/);
    assert.match(c, /avisar_platachat\('automatica', s2, public\.texto_aviso\('automatica', s2, ''\)\)/);
    /* El hilo se escribe bajo la llave de HOY (llave_de_solicitud), no bajo la
       cédula con la que nació la fila: vincular_cuenta muda el hilo. */
    assert.match(c, /v_llave := public\.llave_de_solicitud\(s\);/);
    assert.match(F.llave_de_solicitud.cuerpoLimpio, /public\.llave_de_sesion\(p_sol\.celular\)/);
  });

  test('mi_solicitud: la VIVA (20260908 más el desempate de 20260922b), más el reloj y MENOS el responsable (Ley 1581), sin stable', () => {
    /* 26-sep-2026: la referencia no es 20260908 a secas sino lo que está VIVO
       en la base, que es 20260908 más la línea que le cambió 20260922b. La
       copia de este archivo salió de 20260908 y habría borrado el desempate
       al pegarse. La línea se lee de 20260922b, no se escribe aquí. */
    const DESEMPATE = leer('base/20260922b_desempate.sql');
    const viejo = /viejo\s+constant text := '([^']+)';/.exec(DESEMPATE)[1];
    const bueno = /bueno\s+constant text := '([^']+)';/.exec(DESEMPATE)[1];
    const ORIG0 = funcionesDe(leer(ORIGEN_JOAN)).find(f => f.nombre === 'mi_solicitud');
    assert.ok(ORIG0.cuerpo.indexOf(viejo) >= 0, 'la línea que 20260922b cambia ya no está en 20260908');
    const ORIG = Object.assign({}, ORIG0, { cuerpo: ORIG0.cuerpo.replace(viejo, bueno) });
    assert.ok(F.mi_solicitud.cuerpo.indexOf(bueno) >= 0, 'la copia de mi_solicitud perdió el desempate que está vivo en la base');
    const NUEVA = F.mi_solicitud;
    assert.equal(NUEVA.firma, ORIG.firma);
    assert.ok(esStable(ORIG), 'el original ya no es stable: revisar qué cambió en 20260908');
    assert.ok(!esStable(NUEVA), 'mi_solicitud sigue stable y ahora escribe (resolver_vencidas): 25006');
    /* 15-sep-2026 — CONTRATO NUEVO. Esta función busca `where cedula = cel`, y
       para un cliente de PlataChat sin vincular la llave del hilo ES su
       celular (20260914b): su solicitud de PlataChat la encuentra, y la misma
       cuenta abre play/index.html, que llama a mi_solicitud. Devolviendo la
       fila entera le llegaba `responsable`: el celular PERSONAL del gerente.
       Las cuatro funciones nuevas hacen `- 'responsable'` justo para eso; la
       vieja, que este archivo redefine, lo entregaba. En Tu Garantía la
       columna es null, así que restarla no le cambia nada al socio de
       siempre. */
    assert.match(NUEVA.cuerpoLimpio, /return jsonb_build_object\('ok', true, 'solicitud', to_jsonb\(s\) - 'responsable'\);/,
      'mi_solicitud devuelve la fila entera: por play/ le llega al cliente el celular del gerente (Ley 1581)');
    /* Quitadas las dos cosas nuevas, el cuerpo es el de 20260908 letra por
       letra: si alguien «mejora» una reja al copiar, esto lo caza. */
    const copia = norm(NUEVA.cuerpo)
      .replace('perform public.resolver_vencidas(); ', '')
      .replace("to_jsonb(s) - 'responsable'", 'to_jsonb(s)');
    assert.equal(copia, norm(ORIG.cuerpo), 'mi_solicitud se aparta de la viva en algo más que el reloj y el responsable');
    assert.ok(NUEVA.cuerpoLimpio.indexOf('perform public.resolver_vencidas()') < NUEVA.cuerpoLimpio.indexOf('celular_de_sesion()'),
      'el reloj no corre antes de mirar');
  });

  test('listar_solicitudes_abiertas: la MISMA firma y cuerpo de 20260908, con el reloj DESPUÉS de la clave', () => {
    const ORIG = funcionesDe(leer(ORIGEN_JOAN)).find(f => f.nombre === 'listar_solicitudes_abiertas');
    const NUEVA = F.listar_solicitudes_abiertas;
    assert.equal(NUEVA.firma, ORIG.firma);
    assert.match(NUEVA.cabeza, /returns setof public\.solicitudes/);
    const copia = norm(NUEVA.cuerpo).replace('perform public.resolver_vencidas(); ', '');
    assert.equal(copia, norm(ORIG.cuerpo), 'listar_solicitudes_abiertas se aparta de la de 20260908 en algo más que el reloj');
    const c = NUEVA.cuerpoLimpio;
    assert.ok(c.indexOf('clave_ok(p_clave)') < c.indexOf('perform public.resolver_vencidas()'),
      'el reloj corre antes de la clave: cualquiera sin clave haría escribir a la base');
  });

  test('contrapropuesta_solicitud: la de 20260908 más el reloj tras la clave, resuelta_en y el mensaje en el hilo de PlataChat', () => {
    const ORIG = funcionesDe(leer(ORIGEN_JOAN)).find(f => f.nombre === 'contrapropuesta_solicitud');
    const NUEVA = F.contrapropuesta_solicitud;
    assert.equal(NUEVA.firma, ORIG.firma);
    const c = NUEVA.cuerpoLimpio;
    assert.ok(c.indexOf('clave_ok(p_clave)') < c.indexOf('perform public.resolver_vencidas()'), 'el reloj corre antes de la clave');
    assert.match(c, /resuelta_en = case when app = 'platachat' then now\(\) else resuelta_en end/, 'no marca resuelta_en solo para PlataChat');
    assert.match(c, /if s\.app = 'platachat' then\s*insert into public\.mensajes \(cedula, de, texto, canal\)\s*values \(public\.llave_de_solicitud\(s\), 'panel',\s*'Te propongo '/,
      'no escribe la propuesta de Joan en el hilo de Créditos como panel');
    assert.match(c, /'creditos'\);\s*end if;/);
    /* Quitadas las tres cosas nuevas, el cuerpo es el de 20260908 letra por
       letra: si alguien «mejora» una reja al copiar, esto lo caza. */
    let copia = norm(NUEVA.cuerpo)
      .replace('perform public.resolver_vencidas(); ', '')
      .replace('declare s public.solicitudes; cp jsonb; txt text;', 'declare s public.solicitudes; cp jsonb;')
      .replace("txt := left(coalesce(p_texto, ''), 400); cp := public.contrapropuesta_de(p_capital, p_costo_pct, p_dias, txt, 'joan');",
               "cp := public.contrapropuesta_de(p_capital, p_costo_pct, p_dias, left(coalesce(p_texto, ''), 400), 'joan');")
      .replace(", resuelta_en = case when app = 'platachat' then now() else resuelta_en end where id", ' where id')
      .replace(/ if s\.app = 'platachat' then insert into public\.mensajes .*? end if; return jsonb_build_object\('ok', true/, " return jsonb_build_object('ok', true");
    assert.equal(copia, norm(ORIG.cuerpo), 'contrapropuesta_solicitud se aparta de la de 20260908 en algo más que lo dicho');
  });
});


/* ==========================================================================
 * 4. DEL CLIENTE
 * ======================================================================== */
describe('20261005: lo que el cliente llama con su sesión', () => {
  const S = F.solicitar_platachat, RP = F.reproponer_platachat, MI = F.mi_solicitud_platachat, AC = F.aceptar_propuesta_platachat;

  test('las firmas del contrato, tal cual', () => {
    assert.equal(S.firma, 'bigint, date, integer');
    assert.equal(MI.firma, '');
    assert.equal(AC.firma, 'bigint');
    assert.equal(RP.firma, 'bigint, bigint, date, integer, text');
    assert.equal(F.contrapropuesta_gerente.firma, 'bigint, bigint, integer, integer, text');
  });

  test('solicitar_platachat: sesión, frenos que CUENTAN filas (5/celular/hora, 60/app/15 min) y el freno del chat', () => {
    /* 15-sep-2026: el count por app/creada_en solo es barato porque existe el
       índice solicitudes_por_app_fecha (lo vigila la prueba de los índices). */
    const c = S.cuerpoLimpio;
    assert.match(c, /cel := public\.celular_de_sesion\(\);\s*if cel is null then\s*perform pg_sleep\(0\.3\);\s*return jsonb_build_object\('ok', false\);/);
    assert.match(c, /select count\(\*\) into n from public\.solicitudes\s+where celular = cel and creada_en > now\(\) - interval '1 hour';\s*if n >= 5 then/,
      'el freno por celular no cuenta filas');
    assert.match(c, /select count\(\*\) into n from public\.solicitudes\s+where app = 'platachat' and creada_en > now\(\) - interval '15 minutes';\s*if n >= 60 then/,
      'el freno global no cuenta filas');
    assert.match(c, /'motivo', 'demasiadas seguidas'/);
    assert.match(c, /if not public\.chat_puede_escribir\(llave\) then/, 'escribe en el hilo sin pasar por el freno del chat');
    /* puede_intentar_tope lee un contador que nadie incrementa para estas
       llaves: no frena nunca (la lección del 14-sep). */
    assert.ok(!/puede_intentar/.test(c), 'usa puede_intentar(_tope), que no frena');
  });

  test('solicitar_platachat: las rejas del contrato y «ya había una abierta»', () => {
    const c = S.cuerpoLimpio;
    assert.match(c, /if p_capital is null or p_capital < pol\.capital_minimo or p_capital > pol\.capital_maximo\s+or cortes < 1 or cortes > 4\s+or fecha < hoy \+ 1 or fecha > hoy \+ 120 then\s*return jsonb_build_object\('ok', false, 'motivo', 'fuera de rango'\);/);
    assert.match(c, /fecha\s*:= coalesce\(p_fecha_pago, case when tiene then hoy \+ 15 else hoy \+ pol\.dias end\);/,
      'sin fecha: la del nuevo (pol.dias) o la quincena de siempre');
    assert.match(c, /where app = 'platachat' and estado in \('nueva', 'contrapropuesta', 'aceptada'\)\s+and \(celular = cel or cedula = llave\)/);
    assert.match(c, /'ya_habia', true, 'solicitud', to_jsonb\(s\) - 'responsable'/);
    assert.match(c, /'ya_habia', false, 'solicitud', to_jsonb\(s\) - 'responsable'/);
  });

  test('solicitar_platachat: la fila nace nueva, de platachat, con reloj, responsable, pedido y el precio esperado', () => {
    const c = S.cuerpoLimpio;
    assert.match(c, /pct\s*:= case when tiene then pol\.costo_pct_cupo else pol\.costo_pct end;/);
    assert.match(c, /v_costo := round\(p_capital \* pct \/ 100\.0\)::bigint \* cortes;/);
    assert.match(c, /insert into public\.solicitudes\s*\(cedula, celular, nombre, capital, tasa, costo, total, fecha_corte, garantia, cupo, sobre_cupo,\s*producto, estado, app, pedido, datos, registro_id, responder_antes_de, responsable\)/);
    assert.match(c, /'quincenal', 'nueva', 'platachat',/);
    assert.match(c, /jsonb_build_object\('capital', p_capital, 'fecha_pago', to_char\(fecha, 'YYYY-MM-DD'\),\s*'cortes', cortes, 'cupo', \(info ->> 'cupo'\)::bigint,\s*'garantia', \(info ->> 'garantia_total'\)::bigint, 'tiene_garantia', tiene/);
    assert.match(c, /now\(\) \+ pol\.espera_minutos \* interval '1 minute'/);
    assert.match(c, /public\.responsable_de\(cel\)\)/);
    assert.match(c, /p_capital > coalesce\(\(info ->> 'cupo'\)::bigint, 0\)/, 'sobre_cupo no se calcula');
    /* El nombre, en el orden del contrato: ficha, registro por teléfono, lo declarado, 'Registrado'. */
    assert.match(c, /nombre := coalesce\(\s*nullif\(btrim\(coalesce\(sh\.nombre, ''\)\), ''\),\s*nullif\(btrim\(coalesce\(r\.nombre, ''\)\), ''\),\s*nullif\(left\(btrim\(coalesce\(auth\.jwt\(\) -> 'user_metadata' -> 'vinculacion' ->> 'nombres', ''\)\), 80\), ''\),\s*'Registrado'\);/);
    assert.match(c, /where right\(public\.solo_digitos\(telefono\), 10\) = right\(cel, 10\)/);
  });

  /* El trozo de código que sigue a una clave dentro de un jsonb_build_object.
     Se mide sobre cuerpoLimpio (sin comentarios): un centinela que leyera la
     prosa de al lado daría verde con el campo sin escribir. */
  const trasClave = (c, clave, cuanto) => {
    const i = c.indexOf("'" + clave + "',");
    assert.ok(i >= 0, 'no encuentro la clave «' + clave + '» en el cuerpo');
    return c.slice(i, i + (cuanto || 420)).replace(/\s+/g, ' ');
  };

  test('solicitar_platachat y reproponer_platachat estampan `automatica` y `espera_minutos` en el pedido, con el MISMO predicado del automático', () => {
    /* 15-sep-2026 — CONTRATO NUEVO. La página no tiene politica_app: para
       saber si el automático va a proponer a la hora tenía que ESPEJAR la
       regla con M.MONTO_MINIMO, y el espejo no puede ver con_garantia (con
       'misma' la base sí propone y el espejo decía «te contesta una
       persona»). Por eso la fila nace marcada: `pedido.automatica` es
       'nuevo', 'estandar' o 'sin_cupo' desde el nacimiento, y
       `pedido.espera_minutos` viaja para que nadie tenga que escribir un
       plazo fijo en la interfaz. La reja de verdad es que el predicado sea EL
       MISMO que usa resolver_vencidas —con_garantia y capital_minimo de
       `pol`, no un número escrito—: si se aparta, la tarjeta vuelve a
       prometer lo que la base no va a cumplir, que es el defecto que esto
       cierra. */
    [['solicitar_platachat', S], ['reproponer_platachat', RP]].forEach(([nombre, fn]) => {
      const c = fn.cuerpoLimpio;
      const auto = trasClave(c, 'automatica');
      ["'nuevo'", "'estandar'", "'sin_cupo'"].forEach(v =>
        assert.ok(auto.indexOf(v) >= 0, nombre + ': pedido.automatica no puede valer ' + v));
      assert.ok(auto.indexOf('pol.con_garantia') >= 0,
        nombre + ': decide `automatica` sin mirar politica_app.con_garantia; con «misma» el automático SÍ propone y la fila diría que no');
      assert.ok(auto.indexOf('pol.capital_minimo') >= 0,
        nombre + ': decide `automatica` con un mínimo que no es el de politica_app');
      assert.ok(!/\b\d{4,}\b/.test(auto.slice(0, auto.indexOf('end') + 1 || 420)),
        nombre + ': hay un monto escrito a mano en el predicado de `automatica`: es una segunda verdad frente a politica_app');
      assert.match(trasClave(c, 'espera_minutos', 60), /'espera_minutos', pol\.espera_minutos/,
        nombre + ': no estampa espera_minutos desde politica_app');
    });
    /* Y el predicado del «sin_cupo» es el mismo que el del mensaje del hilo
       («te contesta una persona»): si se separan, vuelven las dos verdades en
       una sola pantalla. */
    [S, RP].forEach(fn => assert.match(fn.cuerpoLimpio,
      /when\s+(?:not\s+)?tiene[^;]*?pol\.con_garantia[^;]*?pol\.capital_minimo/,
      fn.nombre + ': el mensaje del recibido no usa con_garantia junto al mínimo, como sí hace resolver_vencidas'));
  });

  test('politica_platachat: sin argumentos, stable, y devuelve la política pública ENTERA (la calculadora cotiza con ella)', () => {
    /* 15-sep-2026 — CONTRATO NUEVO. Hasta hoy la calculadora de la página
       cotizaba el primer crédito con literales (35 %, 100.000, 8 días) y la
       base firmaba con politica_app: coincidían por casualidad, y el día que
       Joan cambiara el precio desde Ajustes el cliente vería una cifra en la
       calculadora y otra en la tarjeta. Esta función es la que cierra esa
       grieta, así que se vigila lo que de verdad la hace servir: que NO
       escriba (es la única abierta que puede ser stable), que lea la fila de
       'platachat' y que devuelva las OCHO cifras más el texto. Si falta una,
       la página se queda con su literal para esa y vuelve la segunda verdad,
       sin que nada reviente. */
    const P = F.politica_platachat;
    assert.ok(P, 'falta politica_platachat(): la calculadora seguiría cotizando con literales');
    assert.equal(P.firma, '', 'politica_platachat no puede pedir argumentos: la llama el cliente con su sesión');
    assert.ok(esStable(P), 'politica_platachat no es stable: solo lee');
    const c = P.cuerpoLimpio;
    assert.ok(!/\b(insert\s+into|update\s+\w|delete\s+from|clave_ok|net\.http_post|perform\s+public\.resolver_vencidas)/i.test(c),
      'politica_platachat escribe o corre el reloj: siendo stable no funcionaría nunca (25006)');
    assert.match(c, /from public\.politica_app\s+where app = 'platachat'/, 'no lee la política de PlataChat');
    ['capital_tope', 'costo_pct', 'dias', 'costo_pct_cupo', 'capital_minimo', 'capital_maximo', 'espera_minutos', 'con_garantia', 'texto']
      .forEach(k => assert.match(c, new RegExp("'" + k + "',\\s*pol\\." + k + "\\b"),
        'politica_platachat no devuelve ' + k + ': la página se quedaría con su literal para esa cifra'));
    assert.match(c, /'ok', true, 'politica'/, 'no contesta con la forma {ok:true, politica:{…}} que la página espera');
    /* to_jsonb(pol) devolvería la fila entera de politica_app (hoy y lo que le
       añadan mañana) a cualquiera con sesión: se enumeran las claves. */
    assert.ok(!/to_jsonb\(pol\)/.test(c), 'politica_platachat devuelve la fila entera de politica_app en vez de las claves públicas');
    /* Sin la fila no se inventa nada: la página cae a sus constantes. */
    assert.match(c, /if not found then\s*return jsonb_build_object\('ok', false/, 'sin la fila politica_app no dice que no pudo');
    assert.ok(!/cedula|celular/.test(c), 'politica_platachat toca datos de una persona: es la política de la app, igual para todos');
  });

  test('solicitar_platachat: los dos mensajes del hilo, en Créditos, con la hora de Colombia y sin prometer lo que no va a pasar', () => {
    const c = S.cuerpoLimpio;
    assert.match(c, /values \(llave, 'socio',\s*'Quiero pedir ' \|\| public\.pesos_texto\(p_capital\) \|\| ' para el ' \|\| public\.fecha_texto\(fecha\)\s*\|\| ' \(en ' \|\| dias::text \|\| ' días, ' \|\| public\.quincenas_texto\(cortes\) \|\| '\)\.',\s*'creditos'\)/);
    assert.match(c, /values \(llave, 'auto', 'solicitud',\s*'Recibido\. Te contestamos por aquí ' \|\| public\.dia_bogota_texto\(s\.responder_antes_de\)\s*\|\| 'antes de las ' \|\| public\.hora_texto\(s\.responder_antes_de\) \|\| ' \(hora de Colombia\)\. '/);
    assert.match(c, /'Si nadie alcanza, a esa hora te contesta el automático con una propuesta\.'/);
    /* Si ya se sabe que el cupo no llega al mínimo, el automático no va a
       proponer nada: se dice «te contesta una persona» (interfaz honesta). */
    assert.match(c, /when tiene and coalesce\(\(info ->> 'cupo'\)::bigint, 0\) < pol\.capital_minimo\s*then 'Como tu cupo de hoy es '[\s\S]*?', te contesta una persona\.'/);
  });

  test('los frenos son ASIMÉTRICOS a propósito: pedir cuenta filas de solicitudes; reproponer cuenta sus propias repropuestas', () => {
    /* 15-sep-2026 — ESTA PRUEBA DECÍA LO CONTRARIO. Exigía que reproponer
       tuviera «los mismos frenos» que solicitar, comparando los dos trozos
       letra por letra. Y los tenía: copiados. Pero los dos frenos de
       solicitar CUENTAN FILAS de `solicitudes` —`where celular = cel and
       creada_en > now() - interval '1 hour'` y el global por app— y
       reproponer no INSERTA ninguna fila: hace UPDATE, `creada_en` no se
       mueve, el contador se queda en 1 para siempre y los dos `if` no se
       cumplían nunca. Un freno copiado que no frena es peor que no tener
       freno: la prueba daba verde y el techo real eran las 20 repropuestas
       cada 15 minutos de chat_puede_escribir, con dos Telegram a Joan y al
       gerente por toque y el reloj reiniciado en cada una, borrando la
       propuesta que el gerente acababa de hacer.
       Así que la reja nueva es la ASIMETRÍA: cada función cuenta lo que ella
       misma produce. Solicitar, filas. Reproponer, `solicitudes.repropuestas`,
       que sube en el MISMO update del cambio y bajo el mismo `for update`, de
       modo que no hay forma de repreguntar sin que el contador lo note. */
    const cS = S.cuerpoLimpio, c = RP.cuerpoLimpio;
    /* Solicitar: los dos frenos que cuentan filas, porque solicitar sí inserta una. */
    assert.match(cS, /select count\(\*\) into n from public\.solicitudes\s+where celular = cel and creada_en > now\(\) - interval '1 hour';\s*if n >= 5 then/,
      'solicitar_platachat ya no cuenta filas por celular: es la función que sí las crea');
    assert.match(cS, /select count\(\*\) into n from public\.solicitudes\s+where app = 'platachat' and creada_en > now\(\) - interval '15 minutes';\s*if n >= 60 then/,
      'solicitar_platachat ya no tiene el freno global por filas');
    /* Reproponer: NI UNO de esos dos, que ahí serían código muerto. */
    assert.ok(!/count\(\*\)[\s\S]*?from public\.solicitudes/.test(c),
      'reproponer_platachat cuenta filas de solicitudes: no inserta ninguna, así que ese freno no frena nunca');
    /* Su freno es la columna, leída bajo el bloqueo de la fila y subida en el update. */
    assert.match(T, /alter table public\.solicitudes add column if not exists repropuestas\s+integer not null default 0;/,
      'falta la columna solicitudes.repropuestas, que es el freno de reproponer');
    const bloqueo = c.indexOf('for update;'), lectura = c.indexOf('coalesce(s.repropuestas, 0) >= 10');
    assert.ok(bloqueo > 0 && lectura > bloqueo,
      'reproponer_platachat lee el contador antes de bloquear la fila: dos toques a la vez pasarían los dos');
    assert.match(c, /if coalesce\(s\.repropuestas, 0\) >= 10 then\s*perform pg_sleep\(0\.3\);\s*return jsonb_build_object\('ok', false, 'motivo', 'demasiados cambios en esta solicitud'\);/,
      'reproponer_platachat no rechaza por encima de diez cambios con el motivo del contrato');
    assert.match(c, /repropuestas\s*= coalesce\(repropuestas, 0\) \+ 1,/,
      'reproponer_platachat no sube el contador en el mismo update del cambio: se podría repreguntar sin que nadie cuente');
    assert.ok(c.indexOf('repropuestas       = coalesce(repropuestas, 0) + 1,') > c.indexOf('update public.solicitudes'),
      'el contador sube fuera del update del cambio');
    /* Y el freno del chat sigue de segundo cinturón en las dos. */
    [['solicitar_platachat', cS], ['reproponer_platachat', c]].forEach(([n, cuerpo]) =>
      assert.match(cuerpo, /if not public\.chat_puede_escribir\(llave\) then/, n + ' escribe en el hilo sin pasar por el freno del chat'));
    /* NINGÚN freno se apoya en `avisos`. Contar avisos ata el freno al canal
       de Telegram: si el token se cae, si pg_net no está, si alguien limpia la
       tabla, el freno desaparece sin ruido — y esta casa ya pagó dos veces un
       freno que leía un contador que nadie subía (puede_intentar_tope, 14-sep). */
    FUNCS.forEach(fn => {
      const frenos = [...fn.cuerpoLimpio.matchAll(/select count\(\*\) into n from public\.(\w+)/g)].map(m => m[1]);
      frenos.forEach(t => assert.ok(t !== 'avisos',
        fn.nombre + ' cuenta filas de `avisos` para frenar: el freno se apagaría solo el día que Telegram falle'));
    });
    assert.ok(!/puede_intentar/.test(cS) && !/puede_intentar/.test(c), 'usa puede_intentar(_tope), que no frena');
  });

  test('reproponer_platachat: las mismas REJAS de pedir, solo la suya abierta, y vuelve a nueva con el reloj puesto', () => {
    const c = RP.cuerpoLimpio;
    /* Las rejas (no los frenos) sí son las mismas: sesión, política, rango. */
    assert.match(c, /cel := public\.celular_de_sesion\(\);\s*if cel is null then\s*perform pg_sleep\(0\.3\);\s*return jsonb_build_object\('ok', false\);/);
    assert.match(c, /if p_capital is null or p_capital < pol\.capital_minimo or p_capital > pol\.capital_maximo\s+or cortes < 1 or cortes > 4\s+or fecha < hoy \+ 1 or fecha > hoy \+ 120 then\s*return jsonb_build_object\('ok', false, 'motivo', 'fuera de rango'\);/,
      'reproponer_platachat no tiene la misma reja de rango que solicitar_platachat');
    assert.match(c, /fecha\s*:= coalesce\(p_fecha_pago, case when tiene then hoy \+ 15 else hoy \+ pol\.dias end\);/);
    assert.match(c, /where id = p_id and app = 'platachat'\s+and \(celular = cel or cedula = llave\)\s+and estado in \('nueva', 'contrapropuesta'\)\s+for update;/);
    assert.match(c, /'motivo', 'esa solicitud ya no está abierta'/);
    assert.match(c, /contrapropuesta\s*= null,\s*estado\s*= 'nueva',\s*resuelta_en\s*= null,\s*aceptada_en\s*= null,\s*responder_antes_de = now\(\) \+ pol\.espera_minutos \* interval '1 minute',\s*responsable\s*= public\.responsable_de\(cel\)/);
    assert.match(c, /txt\s*:= left\(btrim\(coalesce\(p_texto, ''\)\), 400\);/);
    assert.match(c, /'Prefiero ' \|\| public\.pesos_texto\(p_capital\) \|\| ' para el ' \|\| public\.fecha_texto\(fecha\)/);
    assert.match(c, /'Recibido\. Te contestamos por aquí '/);
    /* Si seguía 'nueva' el disparador no dispara (el estado no cambia): avisa desde acá. */
    assert.match(c, /if estado_antes = 'nueva' then\s*perform public\.avisar_platachat\('nueva', s, public\.texto_aviso\('nueva', s, 'cambió lo que pedía'\)\);/);
    assert.match(c, /'solicitud', to_jsonb\(s\) - 'responsable'/);
  });

  test('mi_solicitud_platachat: volátil, corre el reloj PRIMERO y devuelve la última con `ahora`', () => {
    assert.match(MI.cabeza, /^\s*volatile\s*$/m, 'mi_solicitud_platachat no es volátil y corre resolver_vencidas');
    const c = MI.cuerpoLimpio;
    assert.ok(c.indexOf('perform public.resolver_vencidas()') < c.indexOf('celular_de_sesion()'));
    /* El desempate de 20260922b: dos filas del mismo segundo empatan en
       creada_en (now() es la hora de INICIO de la transacción). */
    assert.match(c, /where app = 'platachat' and \(celular = cel or cedula = llave\)\s+order by creada_en desc, id desc limit 1;/);
    assert.match(c, /'solicitud', null, 'ahora', now\(\)/);
    assert.match(c, /'solicitud', to_jsonb\(s\) - 'responsable', 'ahora', now\(\)/);
  });

  test('aceptar_propuesta_platachat: solo la suya y solo en contrapropuesta; deja el «Acepto» en el hilo; aceptar NO desembolsa', () => {
    const c = AC.cuerpoLimpio;
    assert.match(c, /set estado = 'aceptada',\s*aceptada_en = now\(\),\s*contrapropuesta = coalesce\(contrapropuesta, '\{\}'::jsonb\)\s*\|\| jsonb_build_object\('aceptada_en', now\(\)\)\s*where id = p_id and app = 'platachat'\s+and \(celular = cel or cedula = llave\)\s+and estado = 'contrapropuesta'/);
    assert.match(c, /if not found then\s*return jsonb_build_object\('ok', false\);/);
    assert.match(c, /values \(public\.llave_de_solicitud\(s\), 'socio',\s*'Acepto: recibo ' \|\| public\.pesos_texto\(/);
    assert.match(c, /' y devuelvo ' \|\| public\.pesos_texto\(/);
    assert.ok(!/creditos_/.test(c) && !/insert into public\.socios_historial/.test(c), 'aceptar crea el crédito o toca la ficha: aceptar no desembolsa');
    assert.match(c, /'solicitud', to_jsonb\(s\) - 'responsable'/);
  });

  test('todo mensaje al cliente va en Créditos, con un autor que app/chat.js conoce, regla solicitud si es del automático, y sin porcentajes', () => {
    const inserts = [...sinComentarios(T).matchAll(/insert into public\.mensajes \(([^)]*)\)\s*values \(([\s\S]*?)\);/g)];
    assert.ok(inserts.length >= 8, 'esperaba al menos ocho mensajes al hilo y encontré ' + inserts.length);
    inserts.forEach(m => {
      const columnas = m[1].split(',').map(s => s.trim());
      const valores = m[2];
      assert.ok(columnas.includes('canal') && /'creditos'\s*$/.test(valores), 'un mensaje no va al canal creditos: ' + valores.slice(0, 80));
      const autor = /^\s*[^,]+,\s*'(\w+)'/.exec(valores);
      assert.ok(autor && ['socio', 'panel', 'auto', 'equipo'].includes(autor[1]), 'autor que chat.js no conoce: ' + (autor && autor[1]));
      if (autor[1] === 'auto') assert.ok(columnas.includes('regla') && /'auto', 'solicitud'/.test(valores), 'el automático escribe sin la regla solicitud');
      assert.ok(valores.indexOf('%') < 0, 'un mensaje al cliente lleva un porcentaje: ' + valores.slice(0, 80));
    });
    /* La cédula de cada mensaje es la llave del hilo de hoy, nunca s.cedula. */
    inserts.forEach(m => assert.ok(!/^\s*s2?\.cedula/.test(m[2]), 'un mensaje se escribe bajo la cédula con la que nació la fila, no bajo la llave del hilo'));
  });

  test('lo que viaja al cliente no lleva el responsable (el celular del gerente): Ley 1581', () => {
    /* 15-sep-2026: la lista suma mi_solicitud, que este archivo redefine. Es
       la puerta por la que play/ le entregaba al cliente de PlataChat sin
       vincular el celular personal del gerente; la reja es la misma para
       todas: si una salida devuelve la fila, la devuelve sin `responsable`.
       Barrer TODAS las salidas de cada función (y no una) es lo que caza a la
       que resta el campo en un return y se lo olvida en el otro. */
    CLIENTE.concat(EQUIPO, ['mi_solicitud']).forEach(n => {
      const c = F[n].cuerpoLimpio;
      const todas = c.match(/'solicitud', to_jsonb\([^)]*\)/g) || [];
      const sinResponsable = c.match(/'solicitud', to_jsonb\(s\) - 'responsable'/g) || [];
      assert.ok(todas.length > 0, n + ' no devuelve la solicitud');
      assert.equal(sinResponsable.length, todas.length, n + ' devuelve la fila con el responsable en alguna salida');
    });
    /* Y ninguna de ellas nombra la columna por otro camino (un
       jsonb_build_object a mano, un `s.responsable` metido en el texto). */
    CLIENTE.concat(['mi_solicitud']).forEach(n =>
      assert.ok(!/\bs\.responsable\b/.test(F[n].cuerpoLimpio), n + ' lee s.responsable: el celular del gerente no es del cliente'));
  });
});


/* ==========================================================================
 * 5. DEL EQUIPO Y DE JOAN
 * ======================================================================== */
describe('20261005: el gerente desde su celular y Joan desde Ajustes', () => {

  test('contrapropuesta_gerente: rol gerente activo, reloj tras validar, alcance de gestion_anotar, misma respuesta para «no existe» y «no es mía»', () => {
    const c = F.contrapropuesta_gerente.cuerpoLimpio;
    assert.match(c, /select \* into yo from public\.equipo where celular = cel;\s*if not found or yo\.estado <> 'activo' or yo\.rol <> 'gerente' then\s*return jsonb_build_object\('ok', false\);/);
    assert.ok(c.indexOf("yo.rol <> 'gerente'") < c.indexOf('perform public.resolver_vencidas()'), 'corre el reloj antes de saber quién llama');
    assert.match(c, /es_mia := found and s\.responsable = yo\.celular;/);
    assert.match(c, /mios := public\.mi_alcance\(yo\.celular\);/);
    assert.match(c, /where p\.celular = right\(coalesce\(s\.celular, ''\), 10\)\s+order by a\.desde desc, a\.id desc limit 1;/);
    assert.match(c, /es_mia := duenio is not null and duenio = any\(mios\);/);
    assert.equal((c.match(/'esa solicitud no es de tu base'/g) || []).length, 1, 'la respuesta para no existe / no es mía tiene que ser una sola');
    assert.match(c, /estado in \('nueva', 'contrapropuesta', 'aceptada'\)/);
  });

  test('contrapropuesta_gerente: las rejas de Joan, firmada gerente:celular, un corte, mensaje como equipo y aviso solo a Joan', () => {
    const c = F.contrapropuesta_gerente.cuerpoLimpio;
    assert.match(c, /p_capital < 10000 or p_capital > 20000000\s+or p_costo_pct is null or p_costo_pct < 1 or p_costo_pct > 50\s+or p_dias is null or p_dias < 1 or p_dias > 60/);
    assert.match(c, /public\.propuesta_platachat_de\(p_capital, p_costo_pct, p_dias, fecha, 1, txt, 'gerente:' \|\| yo\.celular\)/);
    assert.match(c, /estado\s*= 'contrapropuesta',\s*aceptada_en = null,\s*resuelta_en = now\(\)/);
    assert.ok(!/responder_antes_de\s*=/.test(c), 'toca responder_antes_de: el contrato dice que se conserva');
    assert.match(c, /values \(public\.llave_de_solicitud\(s\), 'equipo',\s*'Te propongo '/);
    assert.match(c, /s_joan := s;\s*s_joan\.responsable := null;\s*perform public\.avisar_platachat\('contestada', s_joan, public\.texto_aviso\('contestada', s, yo\.nombre\)\);/,
      'el aviso de «contestada» no va solo a Joan');
  });

  test('politica_app_leer y politica_app_guardar: clave, rejas (espera 1..1440, interruptor estandar|misma) y solo actualizan', () => {
    [F.politica_app_leer, F.politica_app_guardar].forEach(fn => {
      assert.match(fn.cuerpoLimpio, /if not public\.clave_ok\(p_clave\) then\s*perform pg_sleep\(1\);\s*raise exception 'clave de sincronización incorrecta';/, fn.nombre + ' no pide la clave');
    });
    assert.equal(F.politica_app_guardar.firma, 'text, text, bigint, integer, integer, integer, integer, text, text');
    const g = F.politica_app_guardar.cuerpoLimpio;
    assert.match(g, /p_capital_tope < 10000 or p_capital_tope > 20000000/);
    assert.match(g, /p_costo_pct < 1 or p_costo_pct > 50/);
    assert.match(g, /p_dias < 1 or p_dias > 60/);
    assert.match(g, /p_espera_minutos < 1 or p_espera_minutos > 1440/);
    assert.match(g, /p_costo_pct_cupo < 1 or p_costo_pct_cupo > 50/);
    assert.match(g, /p_con_garantia not in \('estandar', 'misma'\)/);
    assert.match(g, /texto\s*= left\(coalesce\(p_texto, ''\), 400\)/);
    assert.ok(!/insert into public\.politica_app/.test(g), 'guardar crea filas: la política de Tu Garantía vive en politica_nuevos y dos copias derivarían');
  });

  test('avisos_destino_guardar: joan o un celular de 10 dígitos del equipo; chat_id numérico; upsert por quien; vacío apaga', () => {
    const c = F.avisos_destino_guardar.cuerpoLimpio;
    assert.match(c, /clave_ok\(p_clave\)/);
    assert.match(c, /if q <> 'joan' and \(length\(q\) <> 10 or not exists \(select 1 from public\.equipo where celular = q\)\) then/);
    assert.match(c, /if v_chat !~ '\^-\?\[0-9\]\{1,20\}\$' then/, 'no valida que el chat_id sea un entero (negativo si es grupo)');
    assert.match(c, /on conflict \(quien\) do update/);
    assert.match(c, /update public\.avisos_destinos set activo = false, actualizado = now\(\)\s+where quien = q/);
  });

  test('aviso_probar manda el saludo por el MISMO camino que un aviso real y devuelve las filas que dejó', () => {
    const c = F.aviso_probar.cuerpoLimpio;
    assert.match(c, /s := jsonb_populate_record\(null::public\.solicitudes,/);
    assert.match(c, /perform public\.avisar_platachat\('prueba', s, txt\);/);
    assert.match(c, /from public\.avisos a where a\.id > desde_id/);
    assert.match(F.avisos_destinos_listar.cuerpoLimpio, /left join public\.equipo e on e\.celular = d\.quien/);
  });

  test('avisos_recientes cruza con net._http_response y dice entregado / rechazado (código) / lo guardado; nunca finge', () => {
    const c = F.avisos_recientes.cuerpoLimpio;
    assert.match(c, /if hay_net and a\.estado = 'encolado' and a\.peticion_id is not null then/);
    assert.match(c, /case when v_status between 200 and 299 then 'entregado'\s*else 'rechazado \(' \|\| v_status::text \|\| '\)' end/);
    assert.match(c, /'estado_guardado', a\.estado/);
    assert.ok(!/'enviado'/.test(sinComentarios(T)), "alguien escribe 'enviado': pg_net no lo sabe al encolar");
    assert.match(T, /create or replace function public\.avisos_recientes\(p_clave text, p_dias integer default 8\)/);
  });
});


/* ==========================================================================
 * 6. LOS AVISOS Y EL DISPARADOR
 * ======================================================================== */
describe('20261005: avisar_platachat y el disparador', () => {
  const AV = F.avisar_platachat;

  test('avisar_platachat: Joan siempre y el responsable si no es Joan; una fila en avisos por destino, diga lo que diga', () => {
    const c = AV.cuerpoLimpio;
    assert.match(c, /destinos := array\['joan'\];\s*if p_sol\.responsable is not null and p_sol\.responsable <> 'joan' then\s*destinos := destinos \|\| p_sol\.responsable;/);
    assert.match(c, /foreach d in array destinos loop/);
    ["v_estado  := 'sin_pg_net'", "v_estado  := 'sin_token'", "v_estado  := 'sin_destino'", "v_estado := 'encolado'"]
      .forEach(s => assert.ok(c.indexOf(s) >= 0, 'avisar_platachat perdió el estado «' + s + '»'));
    /* La fila se escribe DENTRO del bucle: una por destino, diga lo que diga.
       Se mide sobre el trozo del bucle y no con un `end loop;` pegado
       detrás, porque el bucle ahora cierra con su propio manejador (ver la
       prueba de los dos exception). */
    const iLoop = c.indexOf('foreach d in array destinos loop'), iFin = c.lastIndexOf('end loop;');
    assert.ok(iLoop > 0 && iFin > iLoop, 'no encuentro el bucle de destinos');
    const cuerpoLoop = c.slice(iLoop, iFin);
    assert.match(cuerpoLoop, /insert into public\.avisos \(evento, solicitud_id, destino, chat_id, texto, estado, peticion_id, detalle\)\s*values \(p_evento, p_sol\.id, d, dest\.chat_id, coalesce\(p_texto, ''\), v_estado, pid, v_detalle\);/,
      'la fila de avisos no se escribe dentro del bucle, una por destino');
    assert.ok(cuerpoLoop.indexOf('select * into dest from public.avisos_destinos where quien = d and activo;') >= 0,
      'el destino no se busca dentro del bucle');
    /* Y las variables de cada vuelta se limpian al entrar: sin eso, el destino
       roto hereda el peticion_id del anterior y la tabla dice que se encoló
       algo que no se encoló. */
    assert.match(cuerpoLoop, /dest := null; pid := null; v_estado := null; v_detalle := null;/,
      'el bucle no limpia dest/pid/v_estado/v_detalle en cada vuelta');
  });

  test('avisar_platachat: net.http_post a Telegram con el token de config_privada, 10 s de tope, y el id queda como peticion_id', () => {
    const c = AV.cuerpoLimpio;
    assert.match(c, /select net\.http_post\(\s*url\s*:= 'https:\/\/api\.telegram\.org\/bot' \|\| token \|\| '\/sendMessage',\s*body\s*:= jsonb_build_object\('chat_id', dest\.chat_id, 'text', p_texto\),\s*headers := '\{"Content-Type":"application\/json"\}'::jsonb,\s*timeout_milliseconds := 10000\s*\) into pid;/);
    assert.ok(!/http_get|http_post\('http/.test(c), 'hay otra llamada HTTP');
    /* Solo avisar_platachat manda; nadie más llama a net.http_post. */
    FUNCS.filter(fn => fn.nombre !== 'avisar_platachat').forEach(fn => assert.ok(!/net\.http_post/.test(fn.cuerpoLimpio), fn.nombre + ' llama a Telegram por su cuenta'));
  });

  test('avisar_platachat: un exception POR DESTINO dentro del bucle, y otro para lo previo: un destino roto no borra el aviso del otro', () => {
    /* 15-sep-2026 — ESTA PRUEBA EXIGÍA EL DEFECTO. Pedía UN solo
       `begin … exception when others` envolviendo la función entera, y eso es
       exactamente lo que rompía la promesa de la cabecera («SIEMPRE se
       escribe una fila por destino») y la regla de la casa («Joan recibe
       TODOS los avisos»): un bloque con exception es una SUBTRANSACCIÓN, así
       que si net.http_post o el insert fallan en el destino 2 (el gerente),
       se deshace todo lo que hizo el destino 1 — la fila 'encolado' de Joan y
       la petición que pg_net ya había encolado dentro de la transacción. Joan
       no recibía el aviso y la tabla decía que a Joan ni se le intentó.
       Ahora son dos manejadores: uno para lo previo al bucle (si eso falla no
       hay a quién escribirle: una fila de error a nombre de Joan y se sale) y
       uno POR DESTINO dentro del bucle. Un tercero que volviera a envolver el
       bucle entero devolvería el defecto, así que se cuentan. */
    const c = AV.cuerpoLimpio;
    const iLoop = c.indexOf('foreach d in array destinos loop'), iFin = c.lastIndexOf('end loop;');
    assert.ok(iLoop > 0 && iFin > iLoop, 'no encuentro el bucle de destinos');
    /* El manejador de lo previo cierra ANTES del foreach. */
    assert.match(c.slice(0, iLoop), /exception when others then\s*insert into public\.avisos \(evento, solicitud_id, destino, texto, estado, detalle\)\s*values \(p_evento, p_sol\.id, 'joan', coalesce\(p_texto, ''\), 'error', left\(sqlerrm, 500\)\);\s*return;\s*end;\s*$/,
      'lo previo al bucle (destinos, token, pg_net) no está protegido aparte, o su bloque no cierra antes del foreach');
    /* Y el del bucle abre en la primera línea de cada vuelta y cierra con ella. */
    const cuerpoLoop = c.slice(iLoop, iFin);
    assert.match(cuerpoLoop, /^foreach d in array destinos loop\s+begin\b/,
      'el bucle no abre su propio begin: lo que falle en un destino arrastra al anterior');
    assert.match(cuerpoLoop, /exception when others then\s*insert into public\.avisos \(evento, solicitud_id, destino, texto, estado, detalle\)\s*values \(p_evento, p_sol\.id, coalesce\(d, 'joan'\), coalesce\(p_texto, ''\), 'error', left\(sqlerrm, 500\)\);\s*end;\s*$/,
      'el destino roto no deja su fila de error, o su bloque no cierra dentro del bucle');
    /* Exactamente dos manejadores y tres begin (función, previo, por destino):
       uno de más sería otra vez el bloque que envuelve el bucle entero. */
    assert.equal((c.match(/exception when others/g) || []).length, 2,
      'hay más (o menos) de dos manejadores: uno para lo previo y uno por destino');
    assert.equal((c.match(/\bbegin\b/g) || []).length, 3,
      'hay más bloques begin de los tres esperados (la función, lo previo al bucle y el de cada destino)');
    assert.match(AV.cabeza, /returns void/);
    assert.equal(AV.firma, 'text, public.solicitudes, text');
  });

  test('el disparador: after insert or update of estado, solo platachat, avisa nueva y aceptada, y nunca falla', () => {
    const TR = F.solicitudes_platachat_avisar;
    assert.match(TR.cabeza, /returns trigger/);
    assert.match(T, /drop trigger if exists solicitudes_platachat_avisar on public\.solicitudes;\s*create trigger solicitudes_platachat_avisar\s+after insert or update of estado on public\.solicitudes\s+for each row\s+when \(new\.app = 'platachat'\)\s+execute function public\.solicitudes_platachat_avisar\(\);/,
      'el disparador no es el del contrato (o no es idempotente)');
    const c = TR.cuerpoLimpio;
    assert.match(c, /if tg_op = 'INSERT' then\s*if new\.estado = 'nueva' then\s*perform public\.avisar_platachat\('nueva', new, public\.texto_aviso\('nueva', new, ''\)\);/);
    assert.match(c, /elsif old\.estado is distinct from new\.estado then/);
    assert.match(c, /if new\.estado = 'aceptada' then\s*perform public\.avisar_platachat\('aceptada', new, public\.texto_aviso\('aceptada', new, ''\)\);/);
    /* 15-sep-2026: el extra del aviso no puede mentir sobre quién movió la
       fila. reproponer_platachat siempre deja responder_antes_de en el
       futuro; el único camino que devuelve una solicitud a 'nueva' con el
       reloj vencido (o sin reloj) es solicitud_estado, el botón del Panel.
       Decirle «volvió a pedir» a Joan cuando fue él quien la reabrió lo manda
       a buscar en el hilo un mensaje del cliente que no existe. */
    assert.match(c, /elsif new\.estado = 'nueva' then\s*perform public\.avisar_platachat\('nueva', new,\s*public\.texto_aviso\('nueva', new,\s*case when new\.responder_antes_de is null or new\.responder_antes_de <= now\(\)\s*then 'reabierta desde el Panel' else 'volvió a pedir' end\)\);/,
      'el aviso de vuelta a «nueva» no distingue al Panel reabriendo del cliente cambiando lo que pidió');
    assert.match(c, /return new;/);
    assert.ok(!/raise exception/.test(c), 'el disparador puede reventar y tumbar la solicitud');
  });
});


/* ==========================================================================
 * 7. DOS VERDADES, NINGUNA
 * El cupo en SQL es la misma cuenta que app/ficha.js leer(); la fórmula se
 * clava del lado JS con fixtures, y del lado SQL por su texto. Y los rangos
 * de la política son los de la calculadora, no otros.
 * ======================================================================== */
describe('20261005: dos verdades, ninguna', () => {

  const FIXTURES = [
    { nombre: 'comprometida explícita en cero (la cuenta de prueba)',
      datos: { garantia: { total: 145000, acumulada: 45000, comprometida: 0, cupon: 100000 } }, esperado: 145000 },
    { nombre: 'comprometida explícita menor que la ganada',
      datos: { garantia: { total: 145000, acumulada: 45000, comprometida: 30000, cupon: 100000 } }, esperado: 115000 },
    { nombre: 'comprometida explícita MAYOR que la ganada: se recorta a la ganada',
      datos: { garantia: { total: 145000, acumulada: 45000, comprometida: 60000, cupon: 100000 } }, esperado: 100000 },
    { nombre: 'sin comprometida: la suma de saldo_capital de los respaldados NO pagados',
      datos: { garantia: { total: 145000, acumulada: 45000, cupon: 100000 },
               respaldados: [{ saldo_capital: 20000, pagado: false }, { saldo_capital: 50000, pagado: true }, { saldo_capital: 5000 }] }, esperado: 120000 },
    { nombre: 'números como texto (el Panel a veces los manda así)',
      datos: { garantia: { total: '145000', acumulada: '45000' }, respaldados: [{ saldo_capital: '20000', pagado: false }] }, esperado: 125000 },
    { nombre: 'sin nada ganado: la comprometida no puede pasar de cero',
      datos: { garantia: { total: 30000, acumulada: 0, comprometida: 10000, cupon: 30000 } }, esperado: 30000 },
    { nombre: 'sin garantía', datos: { garantia: { total: 0, acumulada: 0 } }, esperado: 0 }
  ];

  /* La cuenta del contrato, en JS: greatest(0, total − least(comprometida, acumulada)). */
  function cupoContrato(d) {
    const g = d.garantia || {};
    const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
    const comprometida = g.comprometida != null ? num(g.comprometida)
      : (d.respaldados || []).filter(r => !r.pagado).reduce((t, r) => t + num(r.saldo_capital), 0);
    return Math.max(0, num(g.total) - Math.min(comprometida, Math.max(0, num(g.acumulada))));
  }

  FIXTURES.forEach(fx => {
    test('FichaSocio.leer: ' + fx.nombre + ' → ' + fx.esperado, () => {
      assert.equal(FICHA.leer(fx.datos).cupo, fx.esperado);
      assert.equal(FICHA.leer(fx.datos).cupo, cupoContrato(fx.datos), 'ficha.js ya no calcula el cupo como el contrato (y como el SQL)');
    });
  });

  test('cupo_platachat_de escribe esa MISMA cuenta, con el predicado de llave_de_sesion', () => {
    const c = F.cupo_platachat_de.cuerpoLimpio;
    assert.match(c, /'cupo',\s*greatest\(0, floor\(v_total - least\(v_comprometida, v_acumulada\)\)\)::bigint/);
    assert.match(c, /v_acumulada := greatest\(0, public\.numero_json\(g -> 'acumulada'\)\);/);
    assert.match(c, /if g -> 'comprometida' is null or jsonb_typeof\(g -> 'comprometida'\) = 'null' then/);
    assert.match(c, /sum\(public\.numero_json\(x -> 'saldo_capital'\)\)/);
    assert.match(c, /jsonb_array_elements\(case when jsonb_typeof\(r\.datos -> 'respaldados'\) = 'array'/);
    assert.match(c, /where not \(case jsonb_typeof\(x -> 'pagado'\)/, 'no filtra los respaldados pagados como `!r.pagado`');
    assert.match(c, /where auth_vinculada_en is not null and auth_celular = p_cel\s+order by actualizado_en desc limit 1;/);
    assert.match(leer('base/20260914b_tres_canales.sql'), /where auth_vinculada_en is not null and auth_celular = cel/,
      'llave_de_sesion ya no usa ese predicado: cupo_platachat_de leería otra ficha');
    assert.match(c, /return jsonb_build_object\('vinculada', false, 'garantia_total', 0, 'cupo', 0\);/);
    /* numero_json lee como Number() de JS: número, texto numérico, booleano; lo demás 0. */
    const nj = F.numero_json.cuerpoLimpio;
    assert.match(nj, /when p is null then 0/);
    assert.match(nj, /jsonb_typeof\(p\) = 'string'/);
    assert.match(nj, /else 0/);
  });

  test('el tope del motor queda por encima del rango de PlataChat: no hay que copiarlo a SQL', () => {
    assert.ok(M.CUPO_MAXIMO >= 2000000, 'CUPO_MAXIMO bajó de 2.000.000: el tope del motor entra al rango de PlataChat y el SQL no lo aplica');
    assert.equal(M.CUPO_MAXIMO, 20000000);
  });

  test('los rangos y el precio de la política son los de la calculadora de la página y del motor', () => {
    const pagina = leer('platachat/index.html');
    assert.match(pagina, /var TOPE_CALCULADORA_PLATACHAT = 2000000;/);
    assert.match(T, /capital_maximo bigint\s+not null default 2000000;/);
    assert.equal(M.MONTO_MINIMO, 50000, 'el piso de la barra (M.MONTO_MINIMO) ya no es el capital_minimo de la política');
    assert.match(T, /capital_minimo bigint\s+not null default 50000;/);
    /* El precio de siempre dentro del cupo: el 20 % del motor, en la política como entero. */
    assert.equal(Math.round(M.TASA_CREDITO * 100), 20);
    assert.match(T, /costo_pct_cupo integer not null default 20;/);
  });

  test('propuesta_platachat_de: el molde de contrapropuesta_de (capital × pct, redondeado) por cortes, con la fecha decidida afuera', () => {
    const c = F.propuesta_platachat_de.cuerpoLimpio;
    const ORIG = funcionesDe(leer(ORIGEN_JOAN)).find(f => f.nombre === 'contrapropuesta_de');
    assert.match(ORIG.cuerpoLimpio, /round\(p_capital \* p_pct \/ 100\.0\)::bigint/, 'contrapropuesta_de cambió de fórmula: revisar las dos');
    assert.match(c, /'costo',\s*round\(p_capital \* p_pct \/ 100\.0\)::bigint \* greatest\(1, coalesce\(p_cortes, 1\)\)/);
    assert.match(c, /'total',\s*p_capital \+ round\(p_capital \* p_pct \/ 100\.0\)::bigint \* greatest\(1, coalesce\(p_cortes, 1\)\)/);
    assert.match(c, /'fecha_pago', to_char\(p_fecha_pago, 'YYYY-MM-DD'\)/);
    assert.ok(!/contrapropuesta_de/.test(c), 'llama a contrapropuesta_de, que pone la fecha con la del servidor (UTC)');
    assert.equal(F.propuesta_platachat_de.firma, 'bigint, integer, integer, date, integer, text, text');
    /* Y los números en JS: 100.000 al 20 % por dos cortes son 40.000 de costo, como la calculadora. */
    const costo = (cap, pct, cortes) => Math.round(cap * pct / 100) * cortes;
    assert.equal(costo(100000, 20, 2), 40000);
    assert.equal(costo(100000, 35, 1), 35000);
  });

  test('pesos_texto y los textos de fecha: pesos con punto de miles, meses en español sin depender del idioma del servidor', () => {
    assert.match(F.pesos_texto.cuerpoLimpio, /'\$' \|\| replace\(to_char\(coalesce\(n, 0\), 'FM999,999,999,999,999'\), ',', '\.'\)/);
    assert.match(F.fecha_texto.cuerpoLimpio, /array\['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'\]/);
    assert.ok(!/TMMonth|TMMon|'Mon'|'Month'/.test(F.fecha_texto.cuerpoLimpio), 'usa nombres de mes de to_char, que salen en el idioma del servidor');
    assert.match(F.hora_texto.cuerpoLimpio, /' a\. m\.' else ' p\. m\.'/);
    assert.match(F.hora_texto.cuerpoLimpio, /'FMHH12'/);
    assert.match(F.hora_texto.cuerpoLimpio, /'MI'\)/, 'los minutos sin cero a la izquierda dirían 3:5');
    assert.match(F.dia_bogota_texto.cuerpoLimpio, /then 'mañana '/);
    assert.match(F.hora_bogota_texto.cuerpoLimpio, /public\.dia_bogota_texto\(p\) \|\| public\.hora_texto\(p\)/);
    assert.match(F.quincenas_texto.cuerpoLimpio, /when 2 then 'dos quincenas'/);
  });

  test('responsable_de: cartera → última asignación → equipo; asesor → su jefe gerente activo; si no, joan', () => {
    const c = F.responsable_de.cuerpoLimpio;
    assert.match(c, /join public\.asignaciones a on a\.persona_id = p\.id\s+where p\.celular = right\(coalesce\(p_celular, ''\), 10\)\s+order by a\.desde desc, a\.id desc\s+limit 1;/);
    assert.match(c, /if e\.rol = 'gerente' and e\.estado = 'activo' then return e\.celular; end if;/);
    assert.match(c, /if e\.rol = 'asesor' and e\.jefe is not null then/);
    assert.match(c, /where celular = e\.jefe and rol = 'gerente' and estado = 'activo';/);
    assert.equal((c.match(/return 'joan';/g) || []).length, 3, "'joan' es la respuesta de las tres salidas sin nadie");
  });
});

/* ==========================================================================
 * EL CANDADO CONTRA COPIAR CUERPOS (26-sep-2026)
 *
 * La sección 7 de 20261005 reescribe tres funciones VIVAS copiando su cuerpo.
 * Así es como esta casa ha perdido cambios en silencio: el 22-sep otra sesión
 * reescribió una función así y se le fueron un pg_sleep, un tope y un nullif.
 * El candado compara la huella (md5 sin \r) de lo vivo contra la que se leyó
 * de la base el 26-sep con pg_get_functiondef, y aborta antes de crear nada.
 *
 * Lo que esta prueba asegura es que las huellas escritas en la migración NO
 * son números mágicos: tienen que ser las de los cuerpos del repositorio
 * (20260908, más el desempate de 20260922b para mi_solicitud). El 26-sep se
 * comprobó que esos cuerpos son, byte a byte, los vivos. Si alguien toca una
 * huella a mano, o cambia una de esas funciones en una migración nueva sin
 * actualizar la huella, esto se cae.
 * ======================================================================== */
describe('20261005: el candado contra copiar cuerpos vivos', () => {
  const crypto = require('node:crypto');
  const md5 = x => crypto.createHash('md5').update(x, 'utf8').digest('hex');
  /* El cuerpo EXACTO entre los dos $$, como lo guarda la base en prosrc. */
  function cuerpoCrudo(txt, nombre) {
    const t = txt.replace(/\r/g, '');
    const i = t.indexOf('create or replace function public.' + nombre + '(');
    assert.ok(i >= 0, 'no encontré ' + nombre);
    const a = t.indexOf('as ' + DD, i) + ('as ' + DD).length;
    return t.slice(a, t.indexOf(DD + ';', a));
  }
  const DESEMPATE = leer('base/20260922b_desempate.sql');
  const viejo = /viejo\s+constant text := '([^']+)';/.exec(DESEMPATE)[1];
  const bueno = /bueno\s+constant text := '([^']+)';/.exec(DESEMPATE)[1];
  const ORIG = leer(ORIGEN_JOAN);
  const VIVOS = {
    'public.mi_solicitud()': cuerpoCrudo(ORIG, 'mi_solicitud').replace(viejo, bueno),
    'public.listar_solicitudes_abiertas(text)': cuerpoCrudo(ORIG, 'listar_solicitudes_abiertas'),
    'public.contrapropuesta_solicitud(text, bigint, bigint, integer, integer, text)': cuerpoCrudo(ORIG, 'contrapropuesta_solicitud'),
  };

  const codigo = sinComentarios(T);
  const i = codigo.indexOf("('public.mi_solicitud()',");
  const bloque = codigo.slice(codigo.lastIndexOf('do ' + DD, i), codigo.indexOf('end ' + DD, i));

  test('las tres huellas son las de los cuerpos del repositorio, que son los vivos', () => {
    Object.keys(VIVOS).forEach(firma => {
      const m = new RegExp("\\('" + firma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "',\\s*'([0-9a-f]{32})'\\)").exec(bloque);
      assert.ok(m, 'el candado no trae la huella de ' + firma);
      assert.equal(m[1], md5(VIVOS[firma]),
        'la huella de ' + firma + ' no es la del cuerpo vivo: se tocó a mano, o la función cambió y el candado no');
    });
  });

  test('va ANTES de crear cualquier cosa, y después de la guarda de lo anterior', () => {
    const pos = codigo.indexOf(bloque);
    const ddl = codigo.search(/\n(create extension|alter table|create table|create index|create or replace function)/);
    assert.ok(pos > 0 && pos < ddl, 'el candado corre después de haber creado algo: un pegado frenado dejaría la base a medias');
    assert.ok(codigo.indexOf("raise exception 'falta correr base/20260910_equipo_en_la_nube.sql") < pos,
      'el candado va antes de comprobar que lo anterior existe');
  });

  test('compara sin los \\r, se salta lo que ya es suyo, y se para diciendo cuál', () => {
    assert.match(bloque, /select p\.prosrc into src from pg_proc p where p\.oid = to_regprocedure\(r\.firma\);/);
    assert.match(bloque, /h := md5\(replace\(src, chr\(13\), ''\)\);/, 'la huella no quita los \\r: todo saldría distinto');
    /* Correrlo dos veces no hace daño: la versión de PlataChat trae el reloj. */
    assert.match(bloque, /if position\('resolver_vencidas' in src\) > 0 then\s+continue;/);
    assert.match(bloque, /if h <> r\.huella then\s+raise exception 'La definición viva de % cambió desde el 26-sep-2026/);
    assert.match(bloque, /if src is null then\s+raise exception 'no existe % en esta base/);
  });

  test('las tres que reescribe la sección 7 son exactamente las tres del candado', () => {
    const reescritas = ['mi_solicitud', 'listar_solicitudes_abiertas', 'contrapropuesta_solicitud'];
    reescritas.forEach(n => assert.ok(new RegExp('create or replace function public\\.' + n + '\\(').test(codigo), n + ' ya no se reescribe'));
    assert.equal((bloque.match(/'[0-9a-f]{32}'/g) || []).length, reescritas.length,
      'el candado vigila más o menos funciones de las que la sección 7 reescribe');
  });
});
