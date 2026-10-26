'use strict';
/* ==========================================================================
 * QUIÉN ESCRIBE, CON LO QUE ESTE COMPUTADOR YA SABE — 26 de octubre de 2026
 *
 * Joan: «como cliente envié un mensaje por el chat a servicio al cliente, el
 * mensaje llegó exitosamente al CRM pero solo muestra el número de teléfono,
 * quiero que también muestre el nombre del cliente y que tenga un botón para
 * yo ver el perfil de este cliente».
 *
 * Lo que había: CHAT.quienEs (app/chat.js) pinta lo que trae la nube, y la
 * nube no trae nombre en dos casos: el hilo '0' + celular (cuenta sin juntar
 * con el número de una ficha: sin nombre A PROPÓSITO, Ley 1581 y 2300) y el
 * registrado sin ficha cuando base/20261019_chat_quien_escribe.sql no está
 * corrido. El CRM completa con la cartera y los registros que ya tiene.
 *
 * Lo que este archivo sujeta:
 *   1. el nombre en los cuatro casos, en la bandeja y en el hilo abierto;
 *   2. la advertencia del hilo '0' SE QUEDA, y en ese hilo NUNCA entra el
 *      nombre de un registro;
 *   3. nunca se escribe c.nombre en la conversación (eso le quitaría la
 *      advertencia a quienEs);
 *   4. los botones solo cuando la ficha o el registro existen, y la vuelta;
 *   5. los registros se piden UNA vez, solo si hacen falta, y van aparte.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const CLAVE = 'clave-de-prueba-bien-larga';
const AVISO = 'sin juntar: no sabemos si es él, no le hables de su deuda aquí';
/* 26-oct-2026 (ronda 2) — con el número: Joan pidió que TAMBIÉN saliera el
   nombre, no que el nombre reemplazara al número (sección 7). */
const DE_LA_FICHA = (nombre, cel) => 'Número de la ficha de ' + nombre + ' · ' + cel + ' · ' + AVISO;

const CARTERA = {
  socios: [
    /* El caso de Joan: una ficha con su celular y sin cédula. */
    { id: 'C1', numero: 7, nombre: 'Joan Ruiz', cedula: '', telefono: '3103606348', whatsappIgual: true },
    /* Una ficha con cédula: su llave en la nube es la cédula. */
    { id: 'C2', numero: 8, nombre: 'Bruno Ficha', cedula: '52111222', telefono: '+57 300 333 4444', whatsappIgual: true },
    /* Una ficha cuyo celular está en el SEGUNDO número. */
    { id: 'C3', numero: 9, nombre: 'Carla Segundo', cedula: '', telefono: '3011111111', telefono2: '302 222 2222', whatsappIgual: true }
  ],
  prestamos: [],
  config: { negocio: 'Tu Garantía' }
};
/* Un registrado desde play/ que todavía no tiene ficha. */
const REG = { id: 41, nombre: 'William   Registrado', cedula: '', telefono: '+57 300 123 4567', origen: 'abierto',
  estado: 'nuevo', creado_en: '2026-10-19T14:55:00Z', datos: { ciudad: 'Bogotá' } };
/* Y uno por invitación: cuatro campos y nada más. */
const REG_INVITACION = { id: 42, nombre: 'Inés Invitada', cedula: '', telefono: '3009999999', origen: 'invitacion',
  estado: 'nuevo', creado_en: '2026-10-20T10:00:00Z', codigo: 'TG-ABCD', datos: null };

const conv = o => Object.assign({ cedula: '3001234567', nombre: '', celular: '', ultimo: 'Hola, pedí 300.000',
  ultimo_de: 'socio', ultimo_en: '2026-10-19T14:00:00Z', sin_leer: 1 }, o);

/* Una respuesta de la nube con la forma que rpc() lee (text()). */
const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)),
  json: () => Promise.resolve(cuerpo) });
/* La nube de mentira del banco: por función, una respuesta; lo demás, 404. */
function nube(o) {
  const vistas = [];
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    if (o[fn] !== undefined) return Promise.resolve(resp(200, typeof o[fn] === 'function' ? o[fn](cuerpo) : o[fn]));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas, de: fn => vistas.filter(v => v.fn === fn) };
}

function crm(o) {
  o = o || {};
  const P = abrirPanel({ red: o.red });
  if (o.conectado !== false) {
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  }
  P.cargarCartera(JSON.parse(JSON.stringify(CARTERA)));
  P.ev('_registros = ' + JSON.stringify(o.registros || [REG, REG_INVITACION]));
  return P;
}
function pintar(P, convs) {
  P.ev('_convs = ' + JSON.stringify(convs) + '; _convsEstado = "ok"; renderMensajes();');
  return plano(P.elems.chBandeja.innerHTML);
}
/* El hilo se queda «Abriendo…»: chat.js habla por el fetch del reino de Node y
   aquí solo se miran el título y los botones. */
function abriendo(fn) {
  const real = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => {});
  try { return fn(); } finally { globalThis.fetch = real; }
}
const botones = h => (String(h).match(/<button[^>]*onclick="(verFichaDesdeChat|verRegistroDesdeChat)\('[^']*'\)"[^>]*>[^<]*<\/button>/g) || [])
  .map(b => plano(b).trim());

/* ========================================================================== */
describe('1. la bandeja dice quién escribe, en los cuatro casos', () => {

  test('«0» + celular de una ficha de aquí: el nombre de LA FICHA DUEÑA DEL NÚMERO, con la advertencia entera', () => {
    /* El caso de Joan el 26-oct: salía «Sin juntar · 3103606348 (número de una
       ficha) · no sabemos si es él…» y nada más. */
    const h = pintar(crm(), [conv({ cedula: '03103606348' })]);
    assert.ok(h.indexOf(DE_LA_FICHA('Joan Ruiz', '3103606348')) >= 0, h);
    assert.doesNotMatch(h, /Sin juntar · 3103606348/, 'quedó la frase vieja además de la nueva');
  });

  test('celular sin nombre_registro: el nombre con que se registró, rotulado igual que lo rotula la nube', () => {
    const h = pintar(crm(), [conv({ cedula: '3001234567' })]);
    assert.match(h, /William Registrado \(registrado, sin verificar\) · 3001234567/,
      'el registrado sin ficha sigue saliendo «Socio nuevo» aunque su registro está en este computador');
    assert.doesNotMatch(h, /Socio nuevo/);
    /* Los espacios de más del registro se juntan, como hace quienEs con nombre_registro. */
    assert.doesNotMatch(h, /William {2,}Registrado/);
  });

  test('cédula sin nombre de la nube: el nombre de la ficha de aquí', () => {
    const h = pintar(crm(), [conv({ cedula: '52111222' })]);
    assert.match(h, /Bruno Ficha/);
    assert.doesNotMatch(h, /Socio nuevo · 52111222/);
  });

  test('sin ficha ni registro, lo de siempre: «Socio nuevo» y la llave', () => {
    const h = pintar(crm(), [conv({ cedula: '3007777777' })]);
    assert.match(h, /Socio nuevo · 3007777777/);
  });

  test('lo que la nube ya sabe manda: el nombre de la ficha y el nombre_registro rotulado no se tocan', () => {
    const h = pintar(crm(), [conv({ cedula: '3001234567', nombre: 'De La Nube' }),
      conv({ cedula: '3006666666', nombre_registro: 'Rotulado Por La Nube' })]);
    assert.match(h, /De La Nube/);
    assert.doesNotMatch(h, /William Registrado/, 'el registro local pisó el nombre que mandó la nube');
    assert.match(h, /Rotulado Por La Nube \(registrado, sin verificar\) · 3006666666/);
  });

  test('un celular en el SEGUNDO número de la ficha también la encuentra', () => {
    const h = pintar(crm(), [conv({ cedula: '03022222222' })]);
    assert.ok(h.indexOf(DE_LA_FICHA('Carla Segundo', '3022222222')) >= 0, h);
  });

  test('celular suelto que una ficha de aquí tiene (la cartera no ha subido): la misma advertencia, no «es él»', () => {
    const h = pintar(crm(), [conv({ cedula: '3103606348' })]);
    assert.ok(h.indexOf(DE_LA_FICHA('Joan Ruiz', '3103606348')) >= 0, h);
    assert.doesNotMatch(h, /^ Joan Ruiz /, 'salió el nombre pelado: se lee como verificado');
  });
});

/* ========================================================================== */
describe('2. lo que NO cambia, a propósito', () => {

  test('en un hilo «0» NUNCA entra el nombre de un registro, aunque esté aquí', () => {
    /* Sin ficha con ese número en esta cartera, pero con un registro: la
       advertencia se queda sola (la razón, en base/20261019: con un nombre al
       lado Joan lee «es él» y le habla de la deuda a quien tenga el número). */
    const h = pintar(crm(), [conv({ cedula: '03001234567' })]);
    assert.match(h, /Sin juntar · 3001234567 \(número de una ficha\) · no sabemos si es él: no le hables de su deuda aquí/);
    assert.doesNotMatch(h, /William/);
  });

  test('la advertencia del «0» se conserva cuando sí hay ficha: no se cambia por el nombre a secas', () => {
    const h = pintar(crm(), [conv({ cedula: '03103606348' })]);
    assert.match(h, /no le hables de su deuda aquí/);
    assert.match(h, /sin juntar/);
  });

  test('nunca se escribe c.nombre en la conversación', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '03103606348' }), conv({ cedula: '3001234567' }), conv({ cedula: '52111222' })]);
    /* JSON y no deepEqual: el arreglo nace en el reino de la página (vm) y su
       prototipo no es el de Node. */
    assert.equal(P.ev('JSON.stringify(_convs.map(c => c.nombre))'), '["","",""]',
      'se le escribió el nombre a la conversación: quienEs dejaría de advertir');
    assert.equal(P.ev('JSON.stringify(_convs.map(c => c.nombre_registro || ""))'), '["","",""]');
  });

  test('el nombre de la ficha lo escribió una persona: sale escapado', () => {
    const P = crm();
    P.ev('DB.socios[0].nombre = "<img src=x onerror=alert(1)>"');
    const h = P.ev('bandejaConNombres(CHAT.listaHTML([' + JSON.stringify(conv({ cedula: '03103606348' })) + '], {}), _convs = [' + JSON.stringify(conv({ cedula: '03103606348' })) + '])');
    assert.ok(h.indexOf('<img') < 0, 'el nombre de la ficha se pintó crudo');
    assert.match(h, /&lt;img/);
  });

  test('se cambia SOLO el renglón de quién: el último mensaje que diga lo mismo no se toca', () => {
    const P = crm();
    const h = P.ev('bandejaConNombres(CHAT.listaHTML([' + JSON.stringify(conv({ cedula: '3001234567', ultimo: 'Socio nuevo · 3001234567' })) + '], {}), [' + JSON.stringify(conv({ cedula: '3001234567', ultimo: 'Socio nuevo · 3001234567' })) + '])');
    assert.match(h, /ch-conv-ultimo">Socio nuevo · 3001234567</, 'se reescribió el texto del mensaje');
    assert.match(h, /ch-conv-quien">William Registrado \(registrado, sin verificar\) · 3001234567/);
  });

  test('la bandeja vacía y el «no pude mirar» siguen como estaban', () => {
    const P = crm();
    P.ev('_convs = []; _convsEstado = "ok"; renderMensajes();');
    assert.match(plano(P.elems.chBandeja.innerHTML), /Todavía no te ha escrito nadie por la app/);
    P.ev('_convs = []; _convsEstado = "error"; _convsError = "sin conexión"; renderMensajes();');
    assert.match(plano(P.elems.chBandeja.innerHTML), /No pude preguntarle a la nube/);
  });
});

/* ========================================================================== */
describe('3. el hilo abierto dice lo mismo que la bandeja, y tiene el botón del perfil', () => {

  test('el título es el mismo en los cuatro casos', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '03103606348' }), conv({ cedula: '3001234567' }), conv({ cedula: '52111222' }), conv({ cedula: '3007777777' })]);
    abriendo(() => {
      P.ev('abrirConversacion("03103606348")');
      assert.equal(P.elems.mTitle.textContent, DE_LA_FICHA('Joan Ruiz', '3103606348'));
      P.ev('abrirConversacion("3001234567")');
      assert.equal(P.elems.mTitle.textContent, 'William Registrado (registrado, sin verificar) · 3001234567');
      P.ev('abrirConversacion("52111222")');
      assert.equal(P.elems.mTitle.textContent, 'Bruno Ficha');
      P.ev('abrirConversacion("3007777777")');
      assert.equal(P.elems.mTitle.textContent, 'Socio nuevo · 3007777777');
    });
  });

  test('«👤 Ver ficha» solo con ficha; «📋 Ver registro» solo con registro; los dos con los dos; sin nada, se dice', () => {
    const P = crm({ registros: [REG, REG_INVITACION,
      /* un registro con el celular de la ficha de Joan: los dos botones */
      { id: 43, nombre: 'Joan Registrado', cedula: '', telefono: '3103606348', origen: 'abierto', estado: 'nuevo', creado_en: '2026-10-26T09:00:00Z', datos: {} }] });
    pintar(P, [conv({ cedula: '03103606348' }), conv({ cedula: '3001234567' }), conv({ cedula: '52111222' }), conv({ cedula: '3007777777' }), conv({ cedula: '03022222222' })]);
    abriendo(() => {
      P.ev('abrirConversacion("03103606348")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['👤 Ver ficha', '📋 Ver registro']);
      assert.match(P.elems.mBody.innerHTML, /verFichaDesdeChat\('C1'\)/);
      assert.match(P.elems.mBody.innerHTML, /verRegistroDesdeChat\('43'\)/);
      /* y en el «0» el nombre del registro sigue sin pintarse, aunque el botón esté */
      assert.doesNotMatch(P.elems.mTitle.textContent, /Joan Registrado/);

      P.ev('abrirConversacion("3001234567")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['📋 Ver registro']);
      assert.match(P.elems.mBody.innerHTML, /verRegistroDesdeChat\('41'\)/);

      P.ev('abrirConversacion("52111222")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['👤 Ver ficha']);
      assert.match(P.elems.mBody.innerHTML, /verFichaDesdeChat\('C2'\)/);

      P.ev('abrirConversacion("03022222222")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['👤 Ver ficha']);

      P.ev('abrirConversacion("3007777777")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), []);
      assert.match(plano(P.elems.mBody.innerHTML), /Ni ficha ni registro con este número en este computador/,
        'sin ficha ni registro no dice nada: Joan busca un botón que no está');
      P.ev('abrirConversacion("11222333")');
      assert.match(plano(P.elems.mBody.innerHTML), /Ni ficha ni registro con esta cédula en este computador/);
    });
  });

  test('lo demás del hilo sigue: pestañas, respuesta, WhatsApp y borrar', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '52111222', celular: '3003334444' })]);
    abriendo(() => {
      P.ev('abrirConversacion("52111222")');
      const b = P.elems.mBody.innerHTML;
      assert.match(b, /id="chPest"/); assert.match(b, /id="chResp"/);
      assert.match(b, /wa\.me\/573003334444/); assert.match(b, /olvidarConversacion\(\)/);
    });
  });

  test('«escribirle primero» desde la ficha o el registro sigue poniendo el nombre que ya decidió quien abrió', () => {
    const P = crm();
    pintar(P, []);
    abriendo(() => {
      P.ev('abrirConversacion("52111222", { nombre: "Bruno Ficha", nota: "x" })');
      assert.equal(P.elems.mTitle.textContent, 'Bruno Ficha');
      P.ev('abrirConversacion("3001234567", { nombre: "William Registrado (registrado, sin verificar)", nota: "x" })');
      assert.equal(P.elems.mTitle.textContent, 'William Registrado (registrado, sin verificar)');
      /* y en el «0», lo que le pasen NO entra, como desde el 19-oct */
      P.ev('abrirConversacion("03001234567", { nombre: "Alguien", nota: "x" })');
      assert.match(P.elems.mTitle.textContent, /no le hables de su deuda aquí/);
      assert.doesNotMatch(P.elems.mTitle.textContent, /Alguien/);
    });
  });
});

/* ========================================================================== */
describe('4. chat → ficha o registro → chat', () => {

  test('«👤 Ver ficha» abre LA ficha, con «← Volver al chat» arriba, y volver abre la misma conversación', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '03103606348' })]);
    abriendo(() => {
      P.ev('abrirConversacion("03103606348")');
      P.ev("verFichaDesdeChat('C1')");
      assert.equal(P.elems.mTitle.textContent, 'CL-0007 · Joan Ruiz');
      const m = /onclick="([^"]*)"[^>]*>← Volver al chat/.exec(P.elems.mBody.innerHTML);
      assert.ok(m, 'la ficha abierta desde el chat no tiene cómo volver');
      assert.ok(P.elems.mBody.innerHTML.indexOf('Volver al chat') < P.elems.mBody.innerHTML.indexOf('Su cuenta en la app'),
        'el botón de volver no está arriba: Joan tendría que bajar toda la ficha para encontrarlo');
      /* La vuelta es volverAlChat: cierra ANTES de abrir (suelta _fichaVista, o
         traerFotosTardias repintaría la ficha encima del chat cuando lleguen las
         fotos) y abre con el mismo `extra` con que estaba abierta (sección 6). */
      assert.match(m[1], /^volverAlChat\('03103606348'\)$/);
      P.ev(m[1]);
      assert.equal(P.elems.mTitle.textContent, DE_LA_FICHA('Joan Ruiz', '3103606348'));
      assert.equal(P.ev('_fichaVista'), null);
    });
  });

  test('«📋 Ver registro» abre lo que declaró (verDatosRegistro) con la vuelta; sin datos, los cuatro campos', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '3001234567' }), conv({ cedula: '3009999999' })]);
    abriendo(() => {
      P.ev('abrirConversacion("3001234567")');
      P.ev("verRegistroDesdeChat('41')");
      assert.equal(P.elems.mTitle.textContent, 'Lo que declaró William   Registrado');
      assert.match(P.elems.mBody.innerHTML, /← Volver al chat/);
      assert.match(plano(P.elems.mBody.innerHTML), /Bogotá/);
      P.ev("cerrarModal();abrirConversacion('3001234567')");
      assert.equal(P.elems.mTitle.textContent, 'William Registrado (registrado, sin verificar) · 3001234567');

      /* El de invitación: `datos` vacío, verDatosRegistro no lo abriría. */
      P.ev('abrirConversacion("3009999999")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['📋 Ver registro']);
      P.ev("verRegistroDesdeChat('42')");
      assert.equal(P.elems.mTitle.textContent, 'Registro de Inés Invitada');
      const t = plano(P.elems.mBody.innerHTML);
      assert.match(t, /Volver al chat/); assert.match(t, /Inés Invitada/); assert.match(t, /3009999999/);
      assert.match(t, /Nadie ha comprobado su identidad/);
    });
  });

  test('con una ficha o un registro que no existen no se abre nada ni se cuela el botón de volver', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '3007777777' })]);
    abriendo(() => {
      P.ev('abrirConversacion("3007777777")');
      P.ev("verFichaDesdeChat('NO-EXISTE')");
      P.ev("verRegistroDesdeChat('999')");
      assert.equal(P.elems.mTitle.textContent, 'Socio nuevo · 3007777777');
      assert.doesNotMatch(P.elems.mBody.innerHTML, /Volver al chat/);
    });
  });
});

/* ========================================================================== */
describe('5. los registros se piden una vez, solo si hacen falta, y van aparte', () => {

  test('un celular que ni la nube ni la cartera reconocen: se piden los nuevos UNA vez y la bandeja se repinta con el nombre', async () => {
    const N = nube({ listar_registros: c => c.p_estado === 'nuevo' ? [REG] : [] });
    const P = crm({ red: N.red, registros: [] });
    pintar(P, [conv({ cedula: '3001234567' })]);
    assert.equal(N.de('listar_registros').length, 1);
    assert.equal(N.de('listar_registros')[0].cuerpo.p_estado, 'nuevo');
    await asentar();
    assert.match(plano(P.elems.chBandeja.innerHTML), /William Registrado \(registrado, sin verificar\) · 3001234567/);
    /* Van aparte: 📥 Registrados sigue vacío hasta que Joan entre. */
    assert.equal(P.ev('_registros.length'), 0);
    assert.equal(P.ev('_registrosDelChat.length'), 1);
    /* Y no se vuelve a pedir. */
    pintar(P, [conv({ cedula: '3001234567' }), conv({ cedula: '3008888888' })]);
    assert.equal(N.de('listar_registros').length, 1, 'insistió: una petición por cada pintada de la bandeja');
  });

  test('si todos se reconocen, no se pide nada; y sin nube tampoco', () => {
    const N = nube({ listar_registros: [REG] });
    const P = crm({ red: N.red, registros: [] });
    pintar(P, [conv({ cedula: '03103606348' }), conv({ cedula: '52111222' }), conv({ cedula: '3005555555', nombre: 'De La Nube' }),
      conv({ cedula: '3006666666', nombre_registro: 'Rotulado' })]);
    assert.equal(N.de('listar_registros').length, 0);
    /* Sin nube la bandeja ni se pinta (ya lo decía: «Esto llega por la nube»),
       y menos se le pregunta nada. */
    const M = nube({ listar_registros: [REG] });
    const Q = crm({ red: M.red, registros: [], conectado: false });
    pintar(Q, [conv({ cedula: '3001234567' })]);
    assert.equal(M.de('listar_registros').length, 0);
    assert.match(plano(Q.elems.chBandeja.innerHTML), /Esto llega por la nube/);
  });

  test('si la nube no tiene la función (404) la bandeja sigue como estaba y no revienta', async () => {
    const N = nube({});
    const P = crm({ red: N.red, registros: [] });
    pintar(P, [conv({ cedula: '3001234567' })]);
    await asentar();
    assert.match(plano(P.elems.chBandeja.innerHTML), /Socio nuevo · 3001234567/);
    assert.equal(P.ev('_registrosDelChat.length'), 0);
  });

  test('«📋 Ver registro» abre también un registro que trajo la bandeja', () => {
    const P = crm({ registros: [] });
    P.ev('_registrosDelChat = ' + JSON.stringify([REG]));
    pintar(P, [conv({ cedula: '3001234567' })]);
    abriendo(() => {
      P.ev('abrirConversacion("3001234567")');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['📋 Ver registro']);
      P.ev("verRegistroDesdeChat('41')");
      assert.equal(P.elems.mTitle.textContent, 'Lo que declaró William   Registrado');
    });
  });
});

/* ========================================================================== */
describe('6. la cuenta junta y la ida y vuelta (ronda 1, 26-oct: lo que cazaron los refutadores)', () => {
  /* La ficha de Joan con su cuenta YA JUNTA (lo que deja «¿Es la misma
     persona?» → juntar, crm.html ~2472). */
  const JUNTA = "DB.socios[0].cuentaJunta = { celular: '3103606348', fecha: '2026-10-20', registro_id: 5, por: 'crm' }";
  const volver = P => {
    const m = /onclick="([^"]*)"[^>]*>← Volver al chat/.exec(P.elems.mBody.innerHTML);
    assert.ok(m, 'no está «← Volver al chat»');
    P.ev(m[1]);
  };

  test('ficha sin cédula con la cuenta junta: el hilo del celular pelado dice el nombre de la ficha, sin advertencia; el «0» sigue advirtiendo', () => {
    /* Al juntar, la nube muda al hilo de la ficha lo del '0' + celular
       (base/20261007_una_puerta.sql): el hilo del celular ES el de la ficha y
       Joan ya dijo que es él. Decir «sin juntar» ahí era falso. */
    const P = crm(); P.ev(JUNTA);
    pintar(P, [conv({ cedula: '3103606348' }), conv({ cedula: '03103606348' })]);
    const quienes = (P.elems.chBandeja.innerHTML.match(/ch-conv-quien">[^<]*/g) || []).map(x => x.replace('ch-conv-quien">', ''));
    assert.equal(quienes[0], 'Joan Ruiz · 3103606348', 'con la cuenta junta el celular pelado sigue diciendo «sin juntar»');
    /* Si la nube dijo '0', la nube manda: pudo desjuntarse desde otro computador. */
    assert.equal(quienes[1], DE_LA_FICHA('Joan Ruiz', '3103606348'));
    abriendo(() => {
      P.ev('abrirConversacion("3103606348")');
      assert.equal(P.elems.mTitle.textContent, 'Joan Ruiz · 3103606348');
      assert.deepEqual(botones(P.elems.mBody.innerHTML), ['👤 Ver ficha']);
      P.ev('abrirConversacion("03103606348")');
      assert.equal(P.elems.mTitle.textContent, DE_LA_FICHA('Joan Ruiz', '3103606348'));
    });
  });

  test('la cuenta junta es la de ESE celular: con otro número junto, el celular pelado sigue con la advertencia', () => {
    const P = crm();
    P.ev("DB.socios[0].cuentaJunta = { celular: '3109999999', fecha: '2026-10-20', registro_id: 6, por: 'crm' }");
    pintar(P, [conv({ cedula: '3103606348' })]);
    assert.ok(P.elems.chBandeja.innerHTML.indexOf('ch-conv-quien">' + DE_LA_FICHA('Joan Ruiz', '3103606348')) >= 0);
  });

  test('«💬 Escribirle por la app» → 👤 Ver ficha → ← Volver al chat: el MISMO título y la MISMA nota (cuenta junta)', () => {
    /* El caso A de los refutadores, tal cual: tres toques desde la ficha de Joan. */
    const P = crm(); P.ev(JUNTA);
    pintar(P, []);
    abriendo(() => {
      P.ev("escribirlePorLaApp('ficha','C1')");
      assert.equal(P.elems.mTitle.textContent, 'Joan Ruiz');
      assert.match(plano(P.elems.mBody.innerHTML), /No le llega aviso al celular/);
      assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /lo lee cuando su cuenta de la app esté junta/, 'con la cuenta junta no se dice que falta juntarla');
      P.ev("verFichaDesdeChat('C1')");
      assert.equal(P.elems.mTitle.textContent, 'CL-0007 · Joan Ruiz');
      volver(P);
      assert.equal(P.elems.mTitle.textContent, 'Joan Ruiz', 'al volver el hilo cambió de título');
      assert.match(plano(P.elems.mBody.innerHTML), /No le llega aviso al celular/, 'al volver se perdió la nota');
      assert.doesNotMatch(P.elems.mTitle.textContent, /sin juntar/);
      assert.equal(P.ev('_fichaVista'), null);
      assert.equal(P.ev('JSON.stringify(DB.socios[0].cuentaJunta)'), JSON.stringify({ celular: '3103606348', fecha: '2026-10-20', registro_id: 5, por: 'crm' }));
    });
  });

  test('lo mismo SIN la cuenta junta: el nombre y la nota de «esto queda en el hilo de su ficha» sobreviven a la vuelta', () => {
    /* Aquí lo local diría la advertencia; lo que manda es con qué se abrió:
       Joan le está escribiendo al hilo de la ficha, que solo lee la cuenta
       que se junte con ella. */
    const P = crm();
    pintar(P, []);
    abriendo(() => {
      P.ev("escribirlePorLaApp('ficha','C1')");
      assert.equal(P.elems.mTitle.textContent, 'Joan Ruiz');
      assert.match(plano(P.elems.mBody.innerHTML), /lo lee cuando su cuenta de la app esté junta con ella/);
      P.ev("verFichaDesdeChat('C1')");
      volver(P);
      assert.equal(P.elems.mTitle.textContent, 'Joan Ruiz');
      assert.match(plano(P.elems.mBody.innerHTML), /lo lee cuando su cuenta de la app esté junta con ella/);
      assert.match(plano(P.elems.mBody.innerHTML), /No le llega aviso al celular/);
    });
  });

  test('📋 Ver registro → ← Volver al chat también conserva lo que decidió quien abrió (abrirHiloDeRegistro)', () => {
    const P = crm();
    pintar(P, []);
    abriendo(() => {
      P.ev('abrirConversacion("3001234567", { nombre: "William Registrado (registrado, sin verificar)", nota: AVISO_SIN_PUSH })');
      P.ev("verRegistroDesdeChat('41')");
      assert.equal(P.elems.mTitle.textContent, 'Lo que declaró William   Registrado');
      volver(P);
      assert.equal(P.elems.mTitle.textContent, 'William Registrado (registrado, sin verificar)');
      assert.match(plano(P.elems.mBody.innerHTML), /No le llega aviso al celular/);
    });
  });

  test('el extra es de ESA conversación: abierta a secas desde la bandeja, se vuelve a secas; y el de otro hilo no se cuela', () => {
    const P = crm();
    pintar(P, [conv({ cedula: '52111222' }), conv({ cedula: '3001234567' })]);
    abriendo(() => {
      P.ev('abrirConversacion("3001234567", { nombre: "Alguien Que Abrió", nota: "nota-de-prueba" })');
      /* Desde la bandeja (sin extra): lo que quedó del otro hilo no entra. */
      P.ev('abrirConversacion("52111222")');
      P.ev("verFichaDesdeChat('C2')");
      volver(P);
      assert.equal(P.elems.mTitle.textContent, 'Bruno Ficha');
      assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /nota-de-prueba/);
      /* Y volver a un hilo distinto del que está en pantalla abre a secas. */
      P.ev("volverAlChat('3001234567')");
      assert.equal(P.elems.mTitle.textContent, 'William Registrado (registrado, sin verificar) · 3001234567');
      assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /nota-de-prueba/);
      assert.doesNotMatch(P.elems.mTitle.textContent, /Alguien Que Abrió/);
    });
  });
});

/* ========================================================================== */
describe('7. ronda 2 (26-oct): el número se queda, y la ficha que abre «👤 Ver ficha» se ve', () => {
  /* Joan pidió «que TAMBIÉN muestre el nombre». La ronda 1 dejaba el hilo '0'
     y el del celular pelado de una cuenta junta SIN el número en ninguna
     parte: c.celular llega vacío en esos hilos (socios_historial se cruza por
     cédula), así que tampoco hay «📲 Seguir por WhatsApp». La regla que lo
     habría cazado: si la llave es un celular, ese celular sale en el renglón
     y en el título, sea cual sea el caso. */
  const JUNTA = "DB.socios[0].cuentaJunta = { celular: '3103606348', fecha: '2026-10-20', registro_id: 5, por: 'crm' }";
  const renglones = P => (P.elems.chBandeja.innerHTML.match(/ch-conv-quien">[^<]*/g) || []).map(x => x.replace('ch-conv-quien">', ''));

  test('con la llave de un celular, el número sale en el renglón y en el título en TODOS los casos', () => {
    const casos = [
      ['03103606348', '3103606348', 'cuenta sin juntar con el número de una ficha de aquí'],
      ['03022222222', '3022222222', 'el número está en el SEGUNDO teléfono de la ficha'],
      ['03001234567', '3001234567', "'0' sin ficha aquí (lo pinta quienEs)"],
      ['3001234567', '3001234567', 'registrado sin ficha'],
      ['3007777777', '3007777777', 'ni ficha ni registro'],
      ['3103606348', '3103606348', 'celular suelto que una ficha de aquí tiene']
    ];
    const P = crm();
    pintar(P, casos.map(c => conv({ cedula: c[0] })));
    const r = renglones(P);
    casos.forEach((c, i) => assert.ok(r[i].indexOf(c[1]) >= 0, c[2] + ': el renglón «' + r[i] + '» no tiene el número'));
    abriendo(() => casos.forEach(c => {
      P.ev('abrirConversacion(' + JSON.stringify(c[0]) + ')');
      assert.ok(P.elems.mTitle.textContent.indexOf(c[1]) >= 0, c[2] + ': el título «' + P.elems.mTitle.textContent + '» no tiene el número');
    }));
  });

  test('cuenta junta: «<Nombre> · <celular>», sin advertencia; y la nube con nombre sigue mandando', () => {
    const P = crm(); P.ev(JUNTA);
    pintar(P, [conv({ cedula: '3103606348' }), conv({ cedula: '3103606348', nombre: 'Joan Ruiz De La Nube' })]);
    const r = renglones(P);
    assert.equal(r[0], 'Joan Ruiz · 3103606348');
    assert.equal(r[1], 'Joan Ruiz De La Nube', 'lo que la nube ya dijo no se toca');
  });

  test("el '0': nombre de la ficha, número y advertencia, en ese orden y en un solo renglón", () => {
    const P = crm();
    pintar(P, [conv({ cedula: '03103606348' })]);
    assert.equal(renglones(P)[0], 'Número de la ficha de Joan Ruiz · 3103606348 · sin juntar: no sabemos si es él, no le hables de su deuda aquí');
  });

  /* La ficha que abre «👤 Ver ficha» (la sin juntar, que es la del hilo '0')
     salía en blanco: la frase de «Su cuenta en la app» medía 800 px en un
     cuadro de 600, porque .info-row .k no encoge (flex:none), y los botones
     quedaban fuera del cuadro. El banco no mide, así que aquí se sujeta la
     regla y quién la lleva; la medida está en Chrome sin ventana
     (scratchpad/lote-26/crm-quien-escribe/ronda2/medir-r2.js). */
  const fs = require('node:fs');
  const path = require('node:path');
  const CSS = (fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const regla = sel => { const i = CSS.indexOf(sel + '{'); return i < 0 ? null : CSS.slice(i + sel.length + 1, CSS.indexOf('}', i)); };
  const renglonesConBotones = h => (String(h).match(/<div class="info-row[^"]*">[\s\S]*?<\/span><\/div>/g) || [])
    .filter(f => (f.match(/<button/g) || []).length >= 2 || /Su cuenta en la app/.test(f));

  test('los renglones de la ficha con una frase y botones llevan .con-botones, sin juntar y con la cuenta junta', () => {
    for (const junta of [false, true]) {
      const P = crm(); if (junta) P.ev(JUNTA);
      pintar(P, [conv({ cedula: '03103606348' })]);
      abriendo(() => {
        P.ev('abrirConversacion("03103606348")');
        P.ev("verFichaDesdeChat('C1')");
      });
      const h = P.elems.mBody.innerHTML;
      assert.match(h, /<div class="info-row con-botones"><span class="k">Su cuenta en la app/,
        (junta ? 'con' : 'sin') + ' la cuenta junta, «Su cuenta en la app» no puede partirse: sus botones se salen del cuadro');
      const filas = renglonesConBotones(h);
      assert.ok(filas.length >= 1);
      filas.forEach(f => assert.match(f, /^<div class="info-row con-botones">/, 'un renglón con frase y botones sin .con-botones: ' + f.slice(0, 120)));
    }
  });

  test('.con-botones parte la frase y baja los botones; la etiqueta de los demás renglones sigue sin encoger en el computador', () => {
    assert.ok(CSS.length > 1000, 'no encontré el <style> de crm.html');
    assert.match(regla('.info-row.con-botones') || '', /flex-wrap:\s*wrap/);
    const k = regla('.info-row.con-botones .k') || '';
    assert.match(k, /min-width:\s*0/, '.k sin min-width:0 no encoge por debajo de su frase');
    assert.doesNotMatch(k, /flex:\s*none/);
    assert.match(k, /flex:\s*1\s+1\s+\d+px/, '.k tiene que poder crecer y encoger');
    /* lo de siempre, que el 15-oct se decidió no tocar para los pares etiqueta-valor */
    assert.match(regla('.info-row .k') || '', /flex:\s*none/);
  });

  test('en el celular, la etiqueta de cualquier renglón del cuadro encoge y el valor guarda un piso', () => {
    const movil = CSS.split('@media (max-width:560px){').slice(1).join('\n');
    assert.match(movil, /#mBody \.info-row \.k\{[^}]*flex-shrink:\s*1[^}]*min-width:\s*0/,
      'a 390 px «Nivel (el tramo de su garantía…)» se salía del cuadro con barra horizontal');
    assert.match(movil, /#mBody \.info-row:not\(\.con-botones\) \.vv\{[^}]*min-width:\s*35%/,
      'sin piso, «Cupo quincenal» parte «$25.000» en dos renglones');
  });
});

/* ========================================================================== */
describe('8. el ancla de la bandeja es exacta (ronda 2, J5 del refutador «lente Joan»)', () => {
  /* «Socio nuevo · 30012345» es el comienzo de «Socio nuevo · 3001234567»:
     con el ancla abierta, el nombre de la ficha de la cédula 30012345 se
     colaba en el renglón del celular 3001234567 («Pepe Prefijo67»). */
  const PEPE = "DB.socios.push({ id: 'C9', numero: 9, nombre: 'Pepe Prefijo', cedula: '30012345', telefono: '3119999999', whatsappIgual: true })";
  const renglones = P => (P.elems.chBandeja.innerHTML.match(/ch-conv-quien">[^<]*/g) || []).map(x => x.replace('ch-conv-quien">', ''));

  test('una cédula que es el comienzo de un celular de la bandeja no le presta el nombre', () => {
    for (const orden of [['30012345', '3001234567'], ['3001234567', '30012345']]) {
      const P = crm({ registros: [] }); P.ev(PEPE);
      pintar(P, orden.map(c => conv({ cedula: c })));
      const r = renglones(P);
      const de = k => r[orden.indexOf(k)];
      assert.equal(de('30012345'), 'Pepe Prefijo');
      assert.equal(de('3001234567'), 'Socio nuevo · 3001234567', 'el nombre de otra ficha se coló en el renglón: «' + de('3001234567') + '»');
    }
  });

  test('con el contador de sin leer detrás, el renglón se sigue cambiando', () => {
    const P = crm({ registros: [] }); P.ev(PEPE);
    pintar(P, [conv({ cedula: '30012345', sin_leer: 3 }), conv({ cedula: '3001234567', sin_leer: 0 })]);
    assert.match(P.elems.chBandeja.innerHTML, /ch-conv-quien">Pepe Prefijo<span class="ch-sinleer">3<\/span>/);
    assert.match(P.elems.chBandeja.innerHTML, /ch-conv-quien">Socio nuevo · 3001234567<\/span>/);
  });
});
