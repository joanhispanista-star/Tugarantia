/* ============================================================================
 * PLATACHAT — LA BASE, FASE 1a. 14 de septiembre de 2026.
 *
 *   node --test            (desde la raíz; descubre pruebas/*.test.js)
 *
 * Pruebas ESTÁTICAS sobre los dos archivos SQL de PlataChat:
 *
 *   base/20260921_platachat_app.sql   — la etiqueta `app`, politica_app,
 *                                        registrar_abierto_app, accesos_app
 *   base/20260923_platachat_chat.sql  — chat_responder_equipo
 *                                        con el horario de la Ley 2300, y los
 *                                        festivos sembrados desde el motor
 *
 * Una migración no se compila acá: la corre Joan pegándola en el SQL Editor,
 * y el error le sale a él. Lo único que la mira antes es esto. Cada prueba
 * vigila un fallo que este proyecto ya pagó una vez:
 *
 *   · `revoke ... from public` no cierra nada (28-ago: 28 funciones abiertas).
 *   · Una función stable que escribe no funciona NUNCA (8-sep: dos muertas
 *     dos días, error 25006).
 *   · Dos funciones con el mismo nombre y distinta firma dejan a PostgREST sin
 *     saber cuál llamar: el registro público se cae.
 *   · Repegar supabase.sql resucita puertas ya cerradas.
 *   · Un $$ suelto revienta el pegado doscientas líneas más abajo.
 *   · Y la que es de esta fase: el horario de la Ley 2300 tiene que decidirse
 *     en la BASE, con los festivos que dice el MOTOR y no una lista a mano.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const M = require('../app/motor.js');

const APP  = 'base/20260921_platachat_app.sql';
const CHAT = 'base/20260923_platachat_chat.sql';
const ARCHIVOS = [APP, CHAT];
const SQL = Object.fromEntries(ARCHIVOS.map(f => [f, leer(f)]));
/* Escrito partido para que ESTE archivo no cuente como un $$ suelto si algún
   día un barrido lee también las pruebas. */
const DD = '$' + '$';

/* Sin comentarios: la prosa nombra cosas que el código no hace («acá NO se
   consulta socios_historial»), y un centinela que lee prosa se caza solo. */
const sinComentarios = t => t
  .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, ' ')
  .replace(/^\s*--.*$/gm, ' ')
  .replace(/--[^\n]*$/gm, ' ');

/* «p_celular text, p_nombre text, p_cedula text default ''» → 'text, text, text'.
   Es la firma con la que hay que escribir el revoke y el grant. */
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

const FUNCS = Object.fromEntries(ARCHIVOS.map(f => [f, funcionesDe(SQL[f])]));
const tablasDe = txt => [...txt.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


describe('PlataChat: las dos migraciones, lo que TODA función tiene que cumplir', () => {

  test('hay funciones que mirar, y son exactamente las del contrato', () => {
    assert.deepEqual(FUNCS[APP].map(f => f.nombre), ['registrar_abierto_app', 'marcar_acceso']);
    assert.deepEqual(FUNCS[CHAT].map(f => f.nombre),
      ['chat_responder_equipo']);
    /* 26-sep-2026: los comprobantes se fueron (PlataChat usa chat_foto_sesion). */
  });

  test('cada función lleva security definer y set search_path', () => {
    ARCHIVOS.forEach(f => FUNCS[f].forEach(fn => {
      assert.match(fn.cabeza, /security definer/, f + ': ' + fn.nombre + ' no es security definer');
      assert.match(fn.cabeza, /set search_path\s*=\s*public/, f + ': ' + fn.nombre + ' no fija search_path');
    }));
  });

  test('después de cada función hay revoke de public, anon Y authenticated, y un grant explícito', () => {
    /* La lección del 28-ago: Supabase concede EXECUTE explícito a anon y a
       authenticated en cada función nueva del esquema public, y un
       `revoke ... from public` no lo quita. Se revoca de los tres, con la firma
       exacta, y se concede lo justo. */
    ARCHIVOS.forEach(f => FUNCS[f].forEach(fn => {
      const firma = fn.nombre + '(' + fn.firma + ')';
      assert.ok(SQL[f].indexOf('revoke all on function public.' + firma + ' from public, anon, authenticated') >= 0,
        f + ': falta «revoke all on function public.' + firma + ' from public, anon, authenticated»');
      assert.match(SQL[f], new RegExp('grant\\s+execute on function public\\.' + escapar(firma) + ' to (anon|authenticated)'),
        f + ': falta el grant explícito de ' + firma);
    }));
  });

  test('ninguna función stable escribe (PostgREST las corre en solo lectura: 25006)', () => {
    const ESCRIBE = /\b(insert\s+into|update\s+\w|delete\s+from|nextval\s*\(|clave_ok)/i;
    ARCHIVOS.forEach(f => FUNCS[f].forEach(fn => {
      const stable = /^\s*(stable|immutable)\s*$/mi.test(fn.cabeza);
      if (stable) assert.ok(!ESCRIBE.test(fn.cuerpoLimpio),
        f + ': ' + fn.nombre + ' es stable y escribe: no funcionaría nunca');
      /* Y las que pasan por clave_ok, además, NO pueden ser stable aunque no
         escriban una fila: clave_ok incrementa la secuencia del freno. */
      if (/clave_ok/.test(fn.cuerpoLimpio)) assert.ok(!stable,
        f + ': ' + fn.nombre + ' pasa por clave_ok y es stable');
    }));
  });

  test('no hay ninguna «create policy»: RLS encendido y cero políticas', () => {
    ARCHIVOS.forEach(f => assert.ok(!/create\s+policy/i.test(sinComentarios(SQL[f])),
      f + ' crea una política: la reja de esta casa son las funciones, no las políticas'));
  });

  test('toda tabla nueva enciende RLS y se revoca de la llave pública', () => {
    ARCHIVOS.forEach(f => {
      const tablas = tablasDe(SQL[f]);
      assert.ok(tablas.length > 0, f + ' no crea tablas: el barrido no mide nada');
      tablas.forEach(t => {
        assert.ok(SQL[f].indexOf('alter table public.' + t + ' enable row level security') >= 0,
          f + ': la tabla ' + t + ' no enciende RLS');
        assert.ok(SQL[f].indexOf('revoke all on table public.' + t + ' from public, anon, authenticated') >= 0,
          f + ': la tabla ' + t + ' no se revoca de anon y authenticated');
      });
    });
    assert.deepEqual(tablasDe(SQL[APP]), ['politica_app', 'accesos_app']);
    assert.deepEqual(tablasDe(SQL[CHAT]), ['festivos_colombia']);
  });

  test('no se repega supabase.sql: ni sus tablas ni sus funciones vuelven a aparecer', () => {
    /* Repegar supabase.sql entero resucitaría la puerta por últimos 4 del
       celular y otras cosas que ya se cerraron. Ninguna tabla ni función de
       aquel archivo puede volver a definirse acá. */
    const base = leer('base/supabase.sql');
    const tablasBase = new Set(tablasDe(base));
    const funcsBase = new Set([...base.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]));
    ARCHIVOS.forEach(f => {
      tablasDe(SQL[f]).forEach(t => assert.ok(!tablasBase.has(t), f + ' vuelve a crear la tabla ' + t + ' de supabase.sql'));
      FUNCS[f].forEach(fn => assert.ok(!funcsBase.has(fn.nombre), f + ' vuelve a definir ' + fn.nombre + ' de supabase.sql'));
    });
    ARCHIVOS.forEach(f => assert.ok(SQL[f].length < 40000, f + ' pesa demasiado para ser una migración: ¿se pegó supabase.sql?'));
  });

  test('ninguna firma nueva duplica ni sobrecarga una función que ya existe en base/', () => {
    /* Dos registrar_abierto con firmas distintas dejarían a PostgREST sin
       saber cuál llamar (300) y romperían el registro público el día del
       pegado. Por eso la regla es por NOMBRE: una función nueva se llama
       distinto, y punto. Se mira contra TODOS los .sql de base/, incluido el
       TODO-PENDIENTE, que Joan también podría pegar. */
    const otros = fs.readdirSync(path.join(RAIZ, 'base'))
      .filter(f => /\.sql$/.test(f) && !ARCHIVOS.includes('base/' + f));
    assert.ok(otros.length >= 10, 'el barrido encontró muy pocas migraciones: no está midiendo nada');
    const ajenas = new Set();
    otros.forEach(f => [...leer('base/' + f).matchAll(/create or replace function public\.(\w+)\s*\(/g)]
      .forEach(m => ajenas.add(m[1])));
    ARCHIVOS.forEach(f => FUNCS[f].forEach(fn => assert.ok(!ajenas.has(fn.nombre),
      f + ' define ' + fn.nombre + ', que ya existe en otra migración: sería una sobrecarga o un pisotón')));
    /* Y dentro de las dos nuestras cada nombre aparece UNA vez. */
    const nombres = ARCHIVOS.flatMap(f => FUNCS[f].map(fn => fn.nombre));
    assert.equal(new Set(nombres).size, nombres.length, 'un nombre se define dos veces entre las dos migraciones');
    /* Ni un drop: no se toca ninguna función existente. */
    ARCHIVOS.forEach(f => assert.ok(!/drop\s+function/i.test(sinComentarios(SQL[f])), f + ' tira una función'));
  });

  test('los $$ van en pareja y cuadran con las funciones y los bloques do', () => {
    /* Copia del centinela general de motor.test.js, acá para que falle con
       nombre y apellido si se parte uno de estos dos archivos. */
    ARCHIVOS.forEach(f => {
      const n = (SQL[f].match(/\$\$/g) || []).length;
      const funcs = (SQL[f].match(/create or replace function/g) || []).length;
      const dos = (SQL[f].match(/do [$][$]/g) || []).length;
      assert.equal(n, 2 * (funcs + dos), f + ' tiene ' + n + ' $$ para ' + funcs + ' funciones y ' + dos + ' bloques do');
    });
  });

  test('el bloque final comprueba con has_function_privilege y avisa a PostgREST', () => {
    ARCHIVOS.forEach(f => {
      const ultimo = SQL[f].lastIndexOf('do ' + DD);
      assert.ok(ultimo > 0, f + ' no tiene bloque do final');
      const bloque = SQL[f].slice(ultimo);
      assert.match(bloque, /has_function_privilege\('anon'/, f + ': el bloque final no comprueba qué puede llamar anon');
      assert.match(bloque, /raise exception/, f + ': el bloque final no aborta si algo quedó mal');
      assert.match(SQL[f], /notify pgrst, 'reload schema'/, f + ': PostgREST no se entera de las firmas nuevas');
      /* Y el notify va ANTES de la comprobación: si la comprobación aborta, el
         reload no hace daño; si el reload faltara, las firmas no existirían
         para la app aunque todo hubiera salido bien. */
      assert.ok(SQL[f].indexOf("notify pgrst, 'reload schema'") < ultimo, f + ': el notify va después de la comprobación');
    });
  });
});


describe('20260921: la etiqueta, la política y la puerta pública de PlataChat', () => {
  const T = SQL[APP];
  const REG = FUNCS[APP].find(f => f.nombre === 'registrar_abierto_app');
  const ACC = FUNCS[APP].find(f => f.nombre === 'marcar_acceso');

  test('la columna app entra en registros, solicitudes y socios_historial — y NO en mensajes', () => {
    ['registros', 'solicitudes', 'socios_historial'].forEach(t => {
      assert.match(T, new RegExp('alter table public\\.' + t + '\\s+add column if not exists app text not null default \'tugarantia\''),
        'falta la columna app en ' + t + ' (o no nace como tugarantia, que es la verdad de las filas viejas)');
      assert.match(T, new RegExp("add constraint " + t + "_app_valida check \\(app in \\('tugarantia', 'platachat'\\)\\)"),
        'falta el check por nombre sobre ' + t + '.app');
    });
    /* El chat se etiqueta en la fase 2: una columna que nadie escribe leería
       «todo es Tu Garantía». */
    assert.ok(!/alter table public\.mensajes\s+add column if not exists app/.test(T),
      'mensajes recibió la columna app antes de tiempo');
  });

  test('el check de solicitudes.estado trae los cinco estados y es NOT VALID', () => {
    const i = T.indexOf('add constraint solicitudes_estado_valido');
    assert.ok(i > 0, 'falta el check por nombre sobre solicitudes.estado');
    const trozo = T.slice(i, i + 300);
    assert.match(trozo, /check \(estado in \('nueva', 'contrapropuesta', 'aceptada', 'atendida', 'descartada'\)\)/);
    assert.match(trozo, /not valid/, 'sin NOT VALID una fila vieja con un estado raro revienta el pegado entero');
  });

  test('politica_app vive aparte de politica_nuevos, con la semilla de platachat y rejas de rango', () => {
    assert.ok(!/politica_nuevos/.test(sinComentarios(T)), 'toca politica_nuevos, que es la fila única de Tu Garantía');
    assert.match(T, /app\s+text\s+primary key/);
    assert.match(T, /check \(app in \('tugarantia', 'platachat'\)\)/);
    ['capital_tope   bigint      not null default 100000', 'costo_pct      integer     not null default 35',
     'dias           integer     not null default 8', 'espera_minutos integer     not null default 60']
      .forEach(col => assert.ok(T.indexOf(col) >= 0, 'politica_app perdió «' + col + '»'));
    assert.match(T, /check \(costo_pct between 1 and 50\)/, 'el costo no tiene la reja 1–50 del CRM');
    assert.match(T, /check \(dias between 1 and 60\)/, 'los días no tienen la reja 1–60 del CRM');
    assert.match(T, /insert into public\.politica_app \(app\) values \('platachat'\) on conflict \(app\) do nothing/,
      'la semilla no es idempotente');
  });

  test('registrar_abierto_app es COPIA FIEL de registrar_abierto más la etiqueta', () => {
    /* Se compara contra el archivo vivo (20260909), no contra una idea de
       memoria: normalizados los dos cuerpos, la copia menos sus tres líneas
       nuevas tiene que ser IGUAL al original. Así, si alguien «mejora» una
       reja al copiar, esta prueba lo caza. */
    const ORIG = funcionesDe(leer('base/20260909_una_sola_puerta.sql')).find(f => f.nombre === 'registrar_abierto');
    assert.ok(ORIG, 'no encontré registrar_abierto en 20260909_una_sola_puerta.sql');
    const norm = s => sinComentarios(s).replace(/\s+/g, ' ').trim();

    const copia = norm(REG.cuerpo
      .replace(/\n\s*v_app\s+text;/, '')
      .replace(/\n\s*v_app := case when p_app in \('tugarantia', 'platachat'\) then p_app else 'tugarantia' end;/, '')
      .replace(', origen, app)', ', origen)')
      .replace(", 'abierto', v_app)", ", 'abierto')"));
    assert.equal(copia, norm(ORIG.cuerpo),
      'registrar_abierto_app se aparta de registrar_abierto en algo más que la etiqueta');

    /* La firma: los cuatro parámetros de la vieja, en el mismo orden, más p_app al final con default. */
    assert.equal(REG.firma, 'text, text, text, jsonb, text');
    assert.equal(ORIG.firma, 'text, text, text, jsonb');
    assert.match(REG.cabeza, /set search_path = public, extensions/, 'la copia perdió «extensions» del search_path');
    /* La etiqueta se escribe validada, y un valor raro cae a tugarantia. */
    assert.match(REG.cuerpo, /v_app := case when p_app in \('tugarantia', 'platachat'\) then p_app else 'tugarantia' end/);
    assert.match(REG.cuerpo, /insert into public\.registros \(codigo, cedula, nombre, telefono, datos, origen, app\)/);
    /* Y p_app no decide nada más: solo aparece en su validación. */
    assert.equal((REG.cuerpoLimpio.match(/p_app/g) || []).length, 2, 'p_app se usa para algo más que etiquetar');
  });

  test('las rejas de la puerta, una por una (por si el original cambia y la copia no)', () => {
    const c = REG.cuerpoLimpio;
    assert.match(c, /puede_intentar_tope\('reg:\*', 30\)/, 'perdió el freno global de 30 cada 15 minutos');
    assert.match(c, /puede_intentar\('reg:' \|\| left\(cel, 20\)\)/, 'perdió el freno por celular');
    assert.match(c, /length\(cel\) <> 10 or left\(cel, 1\) <> '3'/, 'perdió los 10 dígitos que empiezan por 3');
    assert.match(c, /jsonb_each_text\(p_datos\)/, 'perdió la desinfección de p_datos');
    const limpiar = c.indexOf('limpiar_fallos');
    const bifurca = c.indexOf('if not exists (');
    assert.ok(limpiar > 0 && bifurca > limpiar, 'limpiar_fallos tiene que ir ANTES de la bifurcación (el oráculo del 9-sep)');
    assert.ok(!/from (public\.)?socios_historial/.test(c), 'consulta socios_historial: delataría quién es cliente');
    assert.equal((c.match(/jsonb_build_object\('ok', false, 'motivo', 'datos'\)/g) || []).length, 3,
      'las ramas de fallo no contestan todas lo mismo');
  });

  test('accesos_app cuenta por (celular, app) y marcar_acceso solo suma con sesión', () => {
    assert.match(T, /primary key \(llave, app\)/);
    assert.match(T, /accesos_app_app_valida/, 'app sin check en accesos_app');
    assert.match(ACC.cuerpo, /celular_de_sesion\(\)/, 'marcar_acceso no saca el celular de la sesión');
    assert.match(ACC.cuerpo, /on conflict \(llave, app\) do update/, 'no es un upsert: la segunda apertura reventaría');
    assert.match(ACC.cuerpo, /veces = accesos_app\.veces \+ 1/);
    assert.ok(!/socios_historial/.test(ACC.cuerpoLimpio), 'toca socios_historial: entonces tendría que ir detrás del candado');
    /* Un p_app raro se rechaza, no se etiqueta con lo que sea. */
    assert.match(ACC.cuerpo, /p_app not in \('tugarantia', 'platachat'\)[\s\S]*?'motivo', 'app desconocida'/);
  });

  test('permisos: la puerta abierta sin sesión, la medición solo con sesión, y la vieja intacta', () => {
    assert.match(T, /grant\s+execute on function public\.registrar_abierto_app\(text, text, text, jsonb, text\) to anon/);
    assert.match(T, /grant\s+execute on function public\.marcar_acceso\(text\) to authenticated/);
    assert.ok(!/grant\s+execute on function public\.marcar_acceso\(text\) to anon/.test(T));
    assert.ok(!/registrar_abierto\(text, text, text, jsonb\)\s+from/.test(T), 'toca los permisos de la puerta vieja');
    assert.match(T, /has_function_privilege\('anon', 'public\.registrar_abierto\(text, text, text, jsonb\)', 'execute'\)/,
      'la comprobación no vigila que la puerta vieja siga abierta');
    assert.match(T, /proname = 'registrar_abierto' and pronamespace[\s\S]*?if n <> 1/,
      'la comprobación no vigila que registrar_abierto siga siendo UNA sola firma');
  });
});


describe('20260923: la respuesta del equipo y la Ley 2300 en la base', () => {
  const T = SQL[CHAT];
  const EQUIPO = FUNCS[CHAT].find(f => f.nombre === 'chat_responder_equipo');

  test('aborta en la PRIMERA línea si falta 20260914b, antes de crear nada', () => {
    const primerDo = T.indexOf('do ' + DD);
    const primeraTabla = T.indexOf('create table');
    assert.ok(primerDo > 0 && primerDo < primeraTabla, 'la guarda de lo anterior no va antes de crear tablas');
    const guarda = T.slice(primerDo, primeraTabla);
    assert.match(guarda, /to_regprocedure\('public\.llave_de_sesion\(text\)'\) is null/);
    assert.match(guarda, /raise exception 'falta correr base\/20260914b_tres_canales\.sql/);
    /* Y el bloque final lo vuelve a decir, como pide el contrato. */
    const final = T.slice(T.lastIndexOf('do ' + DD));
    assert.match(final, /to_regprocedure\('public\.llave_de_sesion\(text\)'\) is null/);
  });

  test('festivos_colombia trae EXACTAMENTE las fechas que MotorReglas.esFestivo da para 2026 y 2027', () => {
    /* El motor es la única fuente de verdad de «qué día es festivo». Una lista
       a mano deriva; esta se regenera corriendo el motor, y esta prueba es la
       que obliga a hacerlo. */
    const esperadas = [];
    for (const anio of [2026, 2027]) {
      const d = new Date(anio, 0, 1);
      while (d.getFullYear() === anio) {
        const iso = M.iso(d);
        if (M.esFestivo(iso) === true) esperadas.push(iso);
        d.setDate(d.getDate() + 1);
      }
    }
    assert.equal(esperadas.length, 36, 'el motor ya no da 18 festivos por año: revisar antes que la migración');

    const i = T.indexOf('insert into public.festivos_colombia (dia) values');
    const j = T.indexOf('on conflict (dia) do nothing', i);
    assert.ok(i > 0 && j > i, 'la siembra de festivos no es idempotente (falta el on conflict)');
    const sembradas = [...T.slice(i, j).matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map(m => m[1]).sort();
    assert.deepEqual(sembradas, esperadas.sort(),
      'la lista sembrada no es la que da el motor: regenerarla con scratchpad/festivos.js');
    assert.match(T, /create table if not exists public\.festivos_colombia \(\s*dia date primary key\s*\)/);
  });

  test('LAS FOTOS NO ESTÁN ACÁ: PlataChat usa chat_fotos de 20260922f, y esta migración no define una segunda (26-sep-2026)', () => {
    /* Esta migración traía su propia tabla de comprobantes. El 22-sep la app
       del cliente estrenó fotos en el chat por otro camino, ya aplicado en la
       base: dos caminos para mandar una foto serían dos bandejas donde buscar
       un comprobante y dos promesas de borrado que cumplir. Esta prueba
       impide que vuelva el segundo camino, y exige que el primero siga
       teniendo lo que justificó el cambio. */
    const codigo = sinComentarios(T);
    assert.ok(!/create table if not exists public\.comprobantes/.test(codigo), 'volvió la tabla de comprobantes propia');
    assert.ok(!/function public\.comprobante/.test(codigo), 'volvió una función de comprobantes propia');
    assert.match(T, /LAS FOTOS NO ESTÁN ACÁ/, 'la cabecera no dice por qué se quitaron');
    assert.match(T, /150 MB/, 'la cabecera no avisa que las dos marcas comparten el techo de fotos');

    /* Lo que PlataChat llama existe, con la firma con la que lo llama. */
    const F = leer('base/20260922f_fotos_en_el_chat.sql');
    assert.match(F, /create or replace function public\.chat_foto_sesion\(\s*p_canal\s+text,\s*p_imagen\s+text,\s*p_miniatura\s+text default null,\s*p_texto\s+text default null\s*\)/);
    assert.match(F, /create or replace function public\.chat_foto_sesion_ver\(p_id bigint\)/);
    /* Y lo que hizo mejor al camino compartido sigue ahí: la foto cuelga del
       mensaje y se va con él (Ley 1581: borrar la conversación se lleva las
       fotos), y la miniatura viaja aparte de la grande. */
    assert.match(F, /references public\.mensajes\(id\) on delete cascade/);
    assert.match(F, /miniatura/);
  });



  test('chat_responder_equipo: identidad de la sesión, rol del equipo y alcance (la reja de gestion_anotar)', () => {
    const c = EQUIPO.cuerpoLimpio;
    assert.match(c, /celular_de_sesion\(\)/, 'quien firma no sale de la sesión');
    assert.match(c, /from public\.equipo where celular = cel/);
    assert.match(c, /yo\.estado <> 'activo' or yo\.rol not in \('gerente', 'asesor'\)/, 'un retirado o un rol raro podría contestar');
    assert.match(c, /mios := public\.mi_alcance\(yo\.celular\)/, 'no calcula el alcance');
    /* La reja, letra por letra la de gestion_anotar: el ÚLTIMO dueño de la
       persona (por su id) tiene que estar en mi alcance. */
    assert.match(c, /where a\.persona_id = p_persona_id\s+order by a\.desde desc, a\.id desc limit 1;/,
      'no busca al último dueño de la persona por su id');
    assert.match(c, /if duenio is null or not \(duenio = any\(mios\)\) then/, 'no comprueba que el dueño de hoy esté en mi alcance');
    assert.match(c, /'motivo', 'esa persona no es de tu base'/);
    /* El autor es 'equipo' (el gerente o el asesor): ni 'panel' (Joan) ni
       'agente' (para chat.js, una máquina). Y va con canal. */
    assert.match(c, /insert into public\.mensajes \(cedula, de, texto, canal\)\s*values \(v_llave, 'equipo', txt, v_canal\)/);
    assert.ok(!/'agente'/.test(c), 'escribe como agente: el cliente vería a su gerente punteado como una máquina');
    /* Y el rastro para el control de calidad, firmado por la sesión. */
    assert.match(c, /insert into public\.contactos \(persona_id, quien, canal, texto\)\s*values \(p_persona_id, yo\.celular, 'app', left\(txt, 600\)\)/,
      'no anota el contacto con canal app y quien = la sesión');
    assert.equal(EQUIPO.firma, 'text, text, text');
    assert.match(T, /create or replace function public\.chat_responder_equipo\(p_persona_id text, p_canal text, p_texto text\)/);
    assert.match(T, /grant\s+execute on function public\.chat_responder_equipo\(text, text, text\) to authenticated/);
    assert.ok(!/grant\s+execute on function public\.chat_responder_equipo\(text, text, text\) to anon/.test(T));
  });

  test('la persona entra por su ID y la llave del hilo la resuelve la base: ni oráculo de cédulas ni hilos huérfanos', () => {
    /* Hallazgo del 14-sep: recibiendo la llave del hilo, la función era un
       oráculo (un asesor tantea cédulas y «ok» / «no es de tu base» le
       confirma cuál es la de su persona — el dato que la cartera le oculta
       por la Ley 1581) y además escribía bajo llaves que llave_de_sesion
       nunca resuelve: hilos que el cliente no ve, con {ok:true}. */
    const c = EQUIPO.cuerpoLimpio;
    assert.ok(!/p_llave|p_cedula|p_celular/.test(c), 'recibe una llave o una cédula: eso es un oráculo');
    assert.ok(!/where s\.cedula = /.test(c), 'busca en socios_historial por una cédula de entrada');
    /* El celular sale de la cartera por el id, y de ahí la llave con la MISMA
       función que usa chat_leer_sesion: el mensaje cae donde el cliente lee. */
    assert.match(c, /select right\(public\.solo_digitos\(coalesce\(p\.celular, ''\)\), 10\) into v_cel_persona\s+from public\.cartera p\s+where p\.id = p_persona_id;/);
    assert.match(c, /v_llave := public\.llave_de_sesion\(v_cel_persona\);/, 'no resuelve la llave con llave_de_sesion');
    assert.match(c, /'motivo', 'esa persona no tiene celular en la cartera'/);
    /* La comprobación final lo vigila en el cuerpo vivo. */
    const final = T.slice(T.lastIndexOf('do ' + DD));
    assert.match(final, /cuerpo not like '%llave_de_sesion%'[\s\S]*?chat_responder_equipo no resuelve la llave/);
    assert.match(final, /cuerpo not like '%''equipo''%' or cuerpo like '%''agente''%'/);
    assert.match(final, /cuerpo like '%sale desde las%'/);
  });

  test("el autor 'equipo' nace en esta migración: el check de mensajes.de lo admite y chat.js, sin tocar, lo pinta como persona", () => {
    /* 26-sep-2026 — SE AÑADE, NO SE REHACE A CIEGAS. La primera versión borraba
       el check y lo creaba de nuevo con una lista escrita aquí: un autor que
       alguien hubiera sumado en la base después de 20260828b se habría perdido
       en silencio. Ahora el bloque mira lo vivo y se para si no es lo esperado. */
    const codigo = sinComentarios(T);
    assert.ok(!/drop constraint if exists mensajes_autor_ok/.test(codigo), 'volvió el borrado a ciegas del check de autores');
    const i = codigo.indexOf("where conname = 'mensajes_autor_ok' and conrelid = 'public.mensajes'::regclass;");
    assert.ok(i > 0, 'el bloque no lee el check vivo');
    const bloque = codigo.slice(codigo.lastIndexOf('do ' + DD, i), codigo.indexOf('end ' + DD, i));
    assert.match(bloque, /if def like '%''equipo''%' then\s+return;/, 'no deja en paz un check que ya trae equipo');
    assert.match(bloque, /n := \(length\(def\) - length\(replace\(def, '::text', ''\)\)\) \/ length\('::text'\);/, 'no cuenta cuántos autores tiene');
    assert.match(bloque, /if n <> 4 or def not like '%''socio''%' or def not like '%''panel''%'\s+or def not like '%''auto''%' or def not like '%''agente''%' then/,
      'no exige que el vivo sea exactamente el de 20260828b');
    assert.match(bloque, /raise exception 'el check mensajes_autor_ok de la base no es el de 20260828b/);
    /* Solo después de esas dos puertas se toca, y con los cinco. */
    const drop = bloque.indexOf('drop constraint mensajes_autor_ok');
    assert.ok(drop > bloque.indexOf("raise exception 'el check mensajes_autor_ok"), 'borra el check antes de comprobarlo');
    assert.match(bloque, /add constraint mensajes_autor_ok check \(de in \('socio', 'panel', 'auto', 'agente', 'equipo'\)\)/,
      'el check no admite equipo (o perdió alguno de los cuatro de 20260828b)');
    assert.match(T, /comment on column public\.mensajes\.de is\s+'[^']*equipo = lo escribió el gerente o un asesor[^']*'/);
    /* Y la comprobación final se niega a terminar si el check no lo trae. */
    const final = T.slice(T.lastIndexOf('do ' + DD));
    assert.match(final, /pg_get_constraintdef\(oid\)[\s\S]*?conname = 'mensajes_autor_ok'[\s\S]*?not like '%equipo%'/);
    /* chat.js (archivo ajeno, sin tocar) pinta un autor desconocido del lado
       del negocio y SIN marca de automático: el gerente sale como persona
       desde el día uno. La receta para que el CRM diga «Tu gerente» en vez de
       «Tú» está en RECETA-PLATACHAT.md. */
    const CHATJS = require('../app/chat.js');
    assert.equal(CHATJS.ladoDe('equipo'), 'negocio');
    assert.equal(CHATJS.esAutomatico({ de: 'equipo' }), false);
    const html = CHATJS.hiloHTML([{ id: 1, de: 'equipo', texto: 'hola', creado_en: '2026-09-14T10:00:00-05:00' }], { yo: 'socio' });
    assert.ok(html.indexOf('ch-esauto') < 0, 'chat.js pinta al gerente como máquina');
    assert.ok(html.indexOf('ch-suyo') >= 0);
  });


  test('EL HORARIO DE LA LEY 2300 SE DECIDE EN LA BASE, en hora de Colombia, y solo para cobranza', () => {
    const c = EQUIPO.cuerpoLimpio;
    assert.match(c, /now\(\) at time zone 'America\/Bogota'/, 'usa la hora del servidor (UTC), no la de Colombia');
    assert.match(c, /extract\(isodow from v_local\)/);
    assert.match(c, /if v_canal = 'cobranza' then/, 'el horario no se limita al canal de cobranza');
    /* Lunes a viernes 7:00–19:00, sábados 8:00–15:00, nunca domingo ni festivo. */
    assert.match(c, /v_dow = 7/, 'el domingo no está cerrado');
    assert.match(c, /exists \(select 1 from public\.festivos_colombia where dia = v_local::date\)/, 'no mira los festivos');
    assert.match(c, /v_dow between 1 and 5 and \(v_hora < time '07:00' or v_hora >= time '19:00'\)/);
    assert.match(c, /v_dow = 6 and \(v_hora < time '08:00' or v_hora >= time '15:00'\)/);
    /* El motivo dice lo que PASA: no se envió. «Sale desde las 7:00» (el texto
       del contrato) prometía una cola que no existe —la cabecera del propio
       archivo lo dice— y el gerente no lo volvería a mandar. */
    assert.match(c, /'motivo', 'fuera de horario: no se envió\. La cobranza por el chat va de lunes a viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00 \(nunca domingos ni festivos\)\. Vuelve a mandarlo en horario\.'/,
      'el motivo no dice que el mensaje NO se envió');
    assert.ok(!/sale desde las/.test(c), 'promete que el mensaje sale a las 7:00 y no hay cola');
    assert.match(c, /'horario', 'lunes a viernes de 7:00 a 19:00, sábados de 8:00 a 15:00; nunca domingos ni festivos'/);
    /* Fuera de horario NO se escribe: el rechazo va ANTES de los dos insert. */
    const rechazo = c.indexOf('fuera de horario');
    const insMsg = c.indexOf('insert into public.mensajes');
    const insCon = c.indexOf('insert into public.contactos');
    assert.ok(rechazo > 0 && rechazo < insMsg && rechazo < insCon, 'el mensaje fuera de horario se escribe de todos modos');
    /* Fallar cerrado: un año sin festivos sembrados cierra la cobranza. */
    assert.match(c, /extract\(year from dia\) = extract\(year from v_local\)/, 'no se niega a cobrar en un año sin festivos sembrados');
    /* Y la comprobación final vigila las dos palabras en el cuerpo vivo. */
    const final = T.slice(T.lastIndexOf('do ' + DD));
    assert.match(final, /cuerpo not like '%festivos_colombia%' or cuerpo not like '%America\/Bogota%'/);
  });

  test('la respuesta del equipo queda cerrada a anon y abierta con sesión, en la comprobación', () => {
    const final = T.slice(T.lastIndexOf('do ' + DD));
    assert.match(final, /if has_function_privilege\('anon', 'public\.chat_responder_equipo\(text, text, text\)', 'execute'\) then/);
    assert.match(final, /if not has_function_privilege\('authenticated', 'public\.chat_responder_equipo\(text, text, text\)', 'execute'\) then/);
    assert.ok(!/comprobante/.test(final), 'la comprobación todavía busca los comprobantes que se quitaron');
    assert.match(final, /p\.provolatile <> 'v'/, 'la comprobación no vigila que ninguna nueva sea stable');
  });
});
