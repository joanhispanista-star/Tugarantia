'use strict';
/* ==========================================================================
 * EL SQL DE «EL GERENTE AGREGA», LEÍDO — 27-oct-2026
 *
 *   node --test pruebas/el-gerente-agrega-sql.test.js
 *
 * base/20261027_el_gerente_agrega.sql se pega en producción a mano (paso
 * 2.4-bis de la receta). Lo que se le pide de verdad se prueba corriéndolo en
 * pruebas/el-gerente-agrega-postgres.test.js; aquí se mira su TEXTO, que es lo
 * que no puede esperar a que haya un PostgreSQL a mano:
 *   · se para si falta 22d, con to_regprocedure (un ::regprocedure de algo
 *     que no existe para con el error crudo);
 *   · ninguna función decide quién eres con celular_de_sesion();
 *   · cada tabla nueva con RLS y sin permisos; el rastro de solo agregar; el
 *     nombre de registros limpio al entrar;
 *   · cada función security definer con search_path fijo, y los permisos
 *     exactos: tres para el equipo, nueve para Joan, ninguno para lo demás;
 *   · no reescribe ninguna función que ya existe, no escribe en auth.users, y
 *     su tabla final trae 12 filas;
 *   · (ronda 2) el cupo se cuenta fila por fila, la asignación lleva la fecha
 *     de Bogotá, y asignar_a y asesor_retirar cambian SOLO current_date sobre
 *     su cuerpo vivo, con huella.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261027_el_gerente_agrega.sql';
const CRUDO = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8').replace(/\r\n/g, '\n');
/* Solo lo que se ejecuta: los comentarios citan nombres a propósito. */
const CODIGO = CRUDO.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

const funciones = () => CODIGO.split(/create\s+or\s+replace\s+function\s+/i).slice(1).map(c => ({
  nombre: (c.match(/^([\w.]+)/) || [])[1],
  firma: (c.match(/^[\w.]+\(([^)]*)\)/) || [])[1] || '',
  cuerpo: c.slice(0, c.search(/\n\$\$;|\n\$\$\s*;/) + 4)
}));

const DEL_EQUIPO = ['gerente_carga_cupo', 'gerente_agregar_prospectos', 'mi_cartera_info'];
const DE_JOAN = ['equipo_agregados', 'equipo_agregados_de', 'equipo_ya_existian', 'equipo_soltar', 'equipo_tiene',
  'equipo_reasignar', 'equipo_publicar_info', 'equipo_publicar_celulares', 'equipo_suprimir'];
const DE_NADIE = ['celular_de_base', 'nombre_limpio', 'texto_del_equipo', 'extra_limpio', 'cel_hash', 'celulares_conocidos',
  'agregar_prospectos_de', 'equipo_acuerdo_firmado', 'equipo_cargas_no_se_cambian', 'registros_nombre_limpio',
  'prospectos_sin_suprimidos', 'panel_ajustes_sin_suprimidos', 'panel_choques_sin_suprimidos'];
const QUE_NO_SE_TOCAN = ['equipo_publicar', 'equipo_traer', 'mi_cartera', 'asignar_a', 'mi_alcance', 'ficha_de_mi_base',
  'registro_en_mi_alcance', 'responsable_de', 'gerente_registros', 'gerente_archivos', 'asesor_enviar', 'registrar_abierto',
  'gerente_de_sesion', 'celular_del_equipo_de_sesion', 'clave_ok'];

describe('base/' + NOMBRE, () => {

  test('se llama así, y va después de los cuatro del 22-oct', () => {
    const base = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort();
    assert.ok(base.indexOf(NOMBRE) > base.indexOf('20261022d_el_equipo_con_la_clave_de_joan.sql'));
    assert.match(CRUDO, /PARA JOAN/);
    assert.match(CRUDO, /2\.4-bis/);
    assert.match(CRUDO, /DE NOCHE/i);
  });

  test('el paso 0 se para si falta 22d, con to_regprocedure y sin ::regprocedure', () => {
    const paso0 = CODIGO.slice(CODIGO.indexOf('do $$'), CODIGO.indexOf('end $$;') + 7);
    assert.match(paso0, /to_regprocedure\('public\.celular_del_equipo_de_sesion\(\)'\) is null/);
    assert.match(paso0, /to_regprocedure\('public\.gerente_de_sesion\(\)'\)\) !~ 'celular_del_equipo_de_sesion'/,
      'no comprueba que gerente_de_sesion ya pida la clave de Joan');
    assert.ok(!/::regprocedure/.test(paso0), 'el paso 0 usa ::regprocedure: con la función ausente para con el error crudo');
    assert.match(paso0, /raise exception 'Primero corre base\/20261022d_el_equipo_con_la_clave_de_joan\.sql/);
    assert.ok(CODIGO.indexOf('do $$') < CODIGO.indexOf('create table'), 'algo se crea antes del paso 0');
  });

  test('ninguna función decide quién eres con celular_de_sesion()', () => {
    assert.ok(!/public\.celular_de_sesion\(\)/.test(CODIGO), 'aparece public.celular_de_sesion()');
    const f = funciones();
    ['gerente_carga_cupo', 'gerente_agregar_prospectos'].forEach(n =>
      assert.match(f.find(x => x.nombre === 'public.' + n).cuerpo, /public\.gerente_de_sesion\(\)/, n));
    assert.match(f.find(x => x.nombre === 'public.mi_cartera_info').cuerpo, /public\.celular_del_equipo_de_sesion\(\)/);
  });

  test('las seis tablas: RLS encendido y sin permisos para nadie de afuera; ninguna política', () => {
    const tablas = [...CODIGO.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
    assert.deepEqual(tablas.sort(), ['cartera_info', 'equipo_acuerdos', 'equipo_cargas', 'equipo_frenos', 'joan_celulares', 'no_contactar']);
    tablas.forEach(t => {
      assert.match(CODIGO, new RegExp('alter table public\\.' + t + '\\s+enable row level security;'), t + ' sin RLS');
      assert.match(CODIGO, new RegExp('revoke all on table public\\.' + t + '\\s+from public, anon, authenticated;'), t + ' sin revoke');
    });
    assert.ok(!/create policy/i.test(CODIGO), 'hay una política: nadie de afuera debe leer ni escribir');
  });

  test('el rastro y el freno de solo agregar; el nombre de registros limpio al entrar', () => {
    assert.match(CODIGO, /create trigger equipo_cargas_solo_agregar\s+before update or delete on public\.equipo_cargas/);
    assert.match(CODIGO, /create trigger equipo_frenos_solo_agregar\s+before update or delete on public\.equipo_frenos/);
    assert.match(CODIGO, /create trigger registros_nombre_limpio\s+before insert or update of nombre on public\.registros/);
    assert.ok(CODIGO.indexOf("new.nombre := left(regexp_replace(coalesce(new.nombre, ''), '[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .-]', ' ', 'g'), 80);") >= 0,
      'el disparador de registros no quita lo que no es letra (sin la comilla)');
    /* La lista de letras de nombreDe (app/bases.js) SIN la comilla. */
    const bases = fs.readFileSync(path.join(RAIZ, 'app', 'bases.js'), 'utf8');
    const deBases = (bases.match(/replace\(\/\[\^([^\]]+)\]\/g, ' '\)/) || [])[1];
    assert.equal(deBases, "A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-", 'cambió la lista de letras de nombreDe: revisa nombre_limpio');
    assert.ok(CODIGO.indexOf("'[^" + deBases.replace("'", '') + "]'") >= 0, 'nombre_limpio no usa la lista de nombreDe sin la comilla');
  });

  test('cada función: security definer con search_path fijo', () => {
    const f = funciones();
    assert.ok(f.length >= 22, 'esperaba las 22 funciones del lote y hay ' + f.length);
    f.forEach(x => {
      assert.match(x.cuerpo, /security definer/, x.nombre + ' no es security definer');
      assert.match(x.cuerpo, /set search_path = public/, x.nombre + ' sin search_path fijo');
    });
  });

  test('las de Joan empiezan con clave_ok y son volátiles; las del equipo no piden clave', () => {
    const f = funciones();
    DE_JOAN.forEach(n => {
      const x = f.find(y => y.nombre === 'public.' + n);
      assert.ok(x, 'falta ' + n);
      assert.match(x.cuerpo, /\bvolatile\b/, n + ' no es volátil: clave_ok escribe el freno y una «stable» revienta');
      assert.match(x.cuerpo.slice(x.cuerpo.indexOf('begin')), /^begin\s+if not public\.clave_ok\(p_clave\) then\s+perform pg_sleep\(1\);/,
        n + ' no empieza con la clave');
    });
  });

  test('los permisos son exactamente estos', () => {
    const grants = [...CODIGO.matchAll(/grant\s+execute on function public\.(\w+)\(([^)]*)\)\s+to (\w+);/g)].map(m => m[1] + '→' + m[3]);
    assert.deepEqual(grants.sort(), DEL_EQUIPO.map(n => n + '→authenticated').concat(DE_JOAN.map(n => n + '→anon')).sort());
    DEL_EQUIPO.concat(DE_JOAN).concat(DE_NADIE).forEach(n =>
      assert.match(CODIGO, new RegExp('revoke all on function public\\.' + n + '\\([^)]*\\)\\s+from public, anon, authenticated;'), n + ' sin revoke'));
    assert.ok(!/grant[^;]*equipo_acuerdo_firmado/.test(CODIGO), 'equipo_acuerdo_firmado tiene permiso para alguien');
  });

  test('el tope del día cuenta solo las tandas aceptadas, en la hora de Bogotá', () => {
    const cuerpo = funciones().find(x => x.nombre === 'public.agregar_prospectos_de').cuerpo;
    /* 27-oct-2026, revisión — con los «ya existe» NUEVOS: uno que ya había
       consultado no vuelve a gastar (el bucle de después del freno). */
    assert.match(cuerpo, /sum\(c\.entraron \+ c\.ya_existen_nuevos\), 0\) into usadas from public\.equipo_cargas c\s+where c\.quien = p_yo\.celular and c\.rechazo = '' and c\.cuando >= inicio_hoy/);
    /* 27-oct-2026, ronda 2 — FILA POR FILA: entra lo que cabe, y se corta antes
       de la primera que no cabe (en el cupo del día o en el techo de 3.000). */
    assert.match(cuerpo, /if usadas \+ gasto \+ costo > 300 then corte := 'tope'; exit; end if;/);
    assert.match(cuerpo, /if subidos \+ nuevos_t \+ nuevo_t > 3000 then corte := 'techo_base'; exit; end if;/);
    assert.match(cuerpo, /'corto', corte, 'procesadas', procesadas/);
    /* La asignación nace con la fecha de Bogotá, no la del servidor (UTC). */
    assert.match(cuerpo, /hoy_bog\s+date := \(now\(\) at time zone 'America\/Bogota'\)::date/);
    assert.ok(!/current_date/.test(cuerpo), 'agregar_prospectos_de escribe con current_date');
    /* Y el freno no se reinicia a medianoche: su ventana es el último «que siga». */
    assert.match(cuerpo, /coalesce\(max\(fr\.cuando\), '-infinity'::timestamptz\) into ventana/);
    assert.match(cuerpo, /en_ventana \+ n_nuevos > 50/);
    assert.match(cuerpo, /date_trunc\('day', now\(\) at time zone 'America\/Bogota'\)\) at time zone 'America\/Bogota'/);
    assert.match(cuerpo, /pg_advisory_xact_lock/);
    assert.ok(cuerpo.indexOf("'muchas_llamadas'") < cuerpo.indexOf('insert into public.equipo_cargas'),
      'pasadas 100 llamadas escribe rastro antes de decir que no');
    assert.ok(!/'ids'/.test(cuerpo), 'la respuesta trae ids');
  });

  test('no escribe en auth.users ni reescribe ninguna función que ya existe', () => {
    assert.equal(/(insert\s+into|update|delete\s+from)\s+auth\.users\b/i.test(CODIGO), false);
    const nombres = funciones().map(x => x.nombre.replace(/^public\./, ''));
    QUE_NO_SE_TOCAN.forEach(n => assert.ok(nombres.indexOf(n) < 0, 'reescribe ' + n + ': su cuerpo vivo lleva parches'));
  });

  /* 27-oct-2026, ronda 2 — asignar_a y asesor_retirar, con la fecha de Bogotá
     SIN reescribirlos: pg_get_functiondef, reemplazo y huella. */
  test('asignar_a y asesor_retirar: solo current_date, sobre su cuerpo vivo y con huella', () => {
    const i = CODIGO.indexOf("p.proname in ('asignar_a', 'asesor_retirar')");
    assert.ok(i > 0, 'no cambia la fecha de asignar_a ni de asesor_retirar');
    const bloque = CODIGO.slice(CODIGO.lastIndexOf('do $$', i), CODIGO.indexOf('end $$;', i));
    assert.match(bloque, /pg_get_functiondef\(r\.oid\)/);
    assert.match(bloque, /replace\(antes, 'current_date', bog\)/);
    assert.match(bloque, /md5\(replace\(despues, bog, 'current_date'\)\) <> md5\(antes\)/);
    assert.match(bloque, /bog\s+constant text := '\(now\(\) at time zone ''America\/Bogota''\)::date'/);
    const r = funciones().find(x => x.nombre === 'public.equipo_reasignar').cuerpo;
    assert.ok(!/current_date/.test(r), 'equipo_reasignar escribe con current_date');
  });

  test('la tabla final trae 12 filas, y debajo una por gerente', () => {
    const i = CRUDO.lastIndexOf('LO QUE JOAN VE');
    assert.ok(i > 0);
    const selects = CRUDO.slice(i).split('\n').filter(l => /^select\s/i.test(l));
    assert.equal(selects.filter(l => !/row_number/.test(l)).length, 12);
    assert.equal(selects.filter(l => /row_number/.test(l)).length, 1);
    assert.match(CRUDO.slice(i), /equipo_acuerdo_firmado\(''' \|\| e\.celular/);
    assert.match(CODIGO, /notify pgrst, 'reload schema';/);
  });
});
