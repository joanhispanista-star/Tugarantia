/* ===========================================================================
 * LA MIGRACIÓN DEL ASESOR — lo que promete, comprobado sobre el SQL
 *
 * No hay una base de datos acá, así que esto lee el archivo. No sustituye a
 * correrlo: la migración trae sus PROPIAS comprobaciones (sección 11), que se
 * ejecutan al pegarla y revientan ahí si algo no cuadra. Esto de acá caza lo
 * que se rompería ANTES de llegar a pegarla.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SQL = fs.readFileSync(
  path.join(__dirname, '..', 'base', '20260919_asesor.sql'), 'utf8');

const cuerpoDe = nombre => {
  const i = SQL.indexOf('function public.' + nombre);
  assert.ok(i > -1, 'no existe la función ' + nombre);
  return SQL.slice(i, SQL.indexOf('$$;', i));
};

describe('la puerta del asesor no abre la cartera (15-sep-2026)', () => {

  test('asesor_enviar NO pide la clave de sincronización', () => {
    /* Esa clave abre equipo_publicar, gestiones_listar y sincronizar_socios.
       Meterla en el celular de un asesor para que pueda mandar un SMS sería
       regalarle el negocio entero. */
    assert.equal(/clave_ok/.test(cuerpoDe('asesor_enviar')), false,
      'asesor_enviar pide la clave de Joan');
    assert.equal(/p_clave/.test(cuerpoDe('asesor_enviar')), false,
      'asesor_enviar recibe una clave por parámetro');
  });

  test('se autoriza por SESIÓN y comprueba que la persona sea SUYA', () => {
    const c = cuerpoDe('asesor_enviar');
    assert.match(c, /celular_de_sesion\(\)/, 'no mira quién es por la sesión');
    assert.match(c, /mi_alcance\(/, 'no usa el alcance del asesor');
    assert.match(c, /no_es_tuyo/, 'no se niega cuando la persona no es suya');
    /* Y el FILTRO de verdad, no solo el mensaje de error. La primera versión de
       esta prueba solo exigía la cadena «no_es_tuyo»: se le quitó la cláusula
       `where a.asesor = any(mios)` a la consulta —dejando el mensaje intacto— y
       la prueba dio verde. Un asesor habría podido escribirle a CUALQUIERA de la
       cartera. Un centinela que mira el mensaje y no la reja no es un centinela. */
    const consulta = c.slice(c.indexOf('select c.* into per'),
                             c.indexOf('limit 1;', c.indexOf('select c.* into per')));
    assert.match(consulta, /a\.asesor = any\(mios\)/,
      'la consulta NO filtra por asesor: se le puede escribir a cualquiera de la cartera');
    assert.match(consulta, /a\.desde = \(select max\(a2\.desde\)/,
      'no toma la asignación vigente: un cliente reasignado seguiría siendo del anterior');
  });

  test('comprueba la ventana legal ANTES de mandar', () => {
    const c = cuerpoDe('asesor_enviar');
    const iVentana = c.indexOf('ventana_de_cobro()');
    const iPost = c.indexOf('net.http_post');
    assert.ok(iVentana > -1 && iPost > -1);
    assert.ok(iVentana < iPost, 'manda antes de mirar si se puede cobrar a esta hora');
  });

  test('tiene tope diario, y vive en la BASE no en la pantalla', () => {
    /* Una pantalla se salta abriendo la consola del navegador. */
    const c = cuerpoDe('asesor_enviar');
    assert.match(c, /n >= 60/, 'no hay tope de envíos por día');
    assert.match(c, /motivo', 'tope'/, 'el tope no se explica');
    assert.match(SQL, /create table if not exists public\.envios_asesor/);
  });

  test('cada envío queda como GESTIÓN — si no, el tope semanal se rompe solo', () => {
    const c = cuerpoDe('asesor_enviar');
    assert.match(c, /insert into public\.gestiones/,
      'el envío no se anota como gestión: mañana la pantalla vuelve a ofrecer a la misma persona');
  });

  test('es VOLATILE', () => {
    const i = SQL.indexOf('function public.asesor_enviar');
    assert.match(SQL.slice(i, i + 300), /\bvolatile\b/);
  });

  test('solo la abren sesiones autenticadas, nunca la llave pública', () => {
    assert.match(SQL, /grant\s+execute on function public\.asesor_enviar\(text, text, text\)\s+to authenticated;/);
    assert.equal(/grant\s+execute on function public\.asesor_enviar[^;]*anon/.test(SQL), false,
      'asesor_enviar quedó abierta a la llave pública');
  });
});

describe('la plata del asesor: lo mínimo, no todo (15-sep-2026)', () => {

  test('la cartera gana saldo, fecha y cuántos créditos — y nada más', () => {
    for (const col of ['saldo', 'saldo_total', 'fecha_pago', 'creditos']) {
      assert.match(SQL, new RegExp('add column if not exists\\s+' + col + '\\b'),
        'falta la columna ' + col);
    }
    /* Lo que NO se agrega, a propósito: capital, ganancia, historial. */
    for (const prohibida of ['capital', 'ganancia', 'costo', 'historial']) {
      assert.equal(new RegExp('add column if not exists\\s+' + prohibida + '\\b').test(SQL), false,
        'se le está mandando «' + prohibida + '» al celular del asesor');
    }
  });

  test('mi_cartera sigue filtrando por el alcance: no se abre ni una persona más', () => {
    const c = cuerpoDe('mi_cartera');
    assert.match(c, /mi_alcance\(yo\.celular\)/);
    assert.match(c, /a\.asesor = any\(mios\)/,
      'se quitó el filtro por asesor: cada uno vería la cartera entera');
  });

  test('la fuente de la plata sigue siendo el CRM de Joan', () => {
    /* Si la nube calculara el saldo por su cuenta habría dos respuestas a la
       misma pregunta, y un día no coincidirían. */
    const c = cuerpoDe('equipo_publicar');
    assert.match(c, /nullif\(it->>'saldo', ''\)::bigint/,
      'equipo_publicar no recibe el saldo que calcula el CRM');
    assert.equal(/sum\(|calcul/i.test(cuerpoDe('mi_cartera')), false,
      'mi_cartera calcula plata en vez de repartir la que publicó Joan');
  });

  test('equipo_publicar conserva su firma: no rompe al CRM viejo', () => {
    assert.match(SQL, /function public\.equipo_publicar\(\s*\n?\s*p_clave text, p_equipo jsonb, p_asignaciones jsonb, p_gente jsonb\)/,
      'cambió la firma de equipo_publicar y el CRM que ya la llama se rompe');
  });
});

describe('el registro acompañado: el permiso va primero (15-sep-2026)', () => {

  test('NUNCA guarda referencias, clave ni ubicación — aunque se las manden', () => {
    /* Son datos de DOS TERCEROS que no autorizaron nada, más la contraseña, más
       un GPS que se pide en el paso 2 y se autoriza en el 9. La reja está en el
       servidor porque una pantalla se puede saltar. */
    const c = cuerpoDe('registro_vivo_publicar');
    for (const campo of ['referencia1', 'referencia2', 'ref1_celular', 'ref2_celular',
                         'clave', 'contrasena', 'password', 'gps', 'lat', 'lng', 'ubicacion']) {
      assert.ok(c.indexOf("- '" + campo + "'") > -1,
        'el registro en vivo no filtra «' + campo + '»');
    }
  });

  test('y la migración lo COMPRUEBA al pegarse, no solo lo comenta', () => {
    /* Un comentario que dice «no entra» y un código que lo deja entrar es el
       peor de los dos mundos. */
    assert.match(SQL, /perform public\.registro_vivo_publicar\(/,
      'la migración no prueba su propia reja');
    assert.match(SQL, /dejo pasar referencias, clave o ubicacion/,
      'no hay excepción si la reja falla');
  });

  test('lo publicado se borra solo', () => {
    assert.match(SQL, /vence_en\s+timestamptz not null default now\(\) \+ interval '2 hours'/,
      'lo que se publica en vivo no vence');
    assert.match(cuerpoDe('registro_vivo_publicar'), /delete from public\.registro_en_vivo where vence_en < now\(\)/,
      'nadie borra lo vencido');
  });

  test('el cliente puede arrepentirse', () => {
    assert.ok(SQL.indexOf('function public.registro_vivo_borrar') > -1,
      'no hay forma de que el cliente retire su avance');
  });

  test('el asesor solo ve a los de SU base', () => {
    const c = cuerpoDe('registro_vivo_mirar');
    assert.match(c, /mi_alcance\(yo\.celular\)/);
    assert.match(c, /a\.asesor = any\(mios\)/,
      'un asesor vería registrándose a gente que no es suya');
    assert.match(c, /v\.vence_en > now\(\)/, 'se muestra lo ya vencido');
  });

  test('mirar NO es una función abierta a la llave pública', () => {
    assert.match(SQL, /grant\s+execute on function public\.registro_vivo_mirar\(\)\s+to authenticated;/);
    assert.equal(/grant\s+execute on function public\.registro_vivo_mirar\(\)[^;]*anon/.test(SQL), false,
      'cualquiera con la llave pública vería a la gente registrándose');
  });

  test('las tablas nuevas quedan con RLS y sin políticas', () => {
    for (const t of ['envios_asesor', 'registro_en_vivo']) {
      assert.match(SQL, new RegExp('alter table public\\.' + t + ' enable row level security'),
        t + ' sin RLS');
      assert.equal(new RegExp('create policy[\\s\\S]*' + t).test(SQL), false,
        t + ' tiene políticas: se esperaba cero');
    }
  });
});
