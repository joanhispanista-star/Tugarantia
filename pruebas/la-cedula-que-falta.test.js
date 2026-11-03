'use strict';
/* ===========================================================================
 * LA CÉDULA QUE FALTA SE DICE, Y NADIE SE QUEDA AFUERA — 3 de noviembre de 2026
 *
 *   node --test pruebas/la-cedula-que-falta.test.js
 *
 * Joan, el 31-oct: «no veo las fotos de la cédula» de un registro del 27-oct, con
 * solo el rostro. Medido en producción: 2 de 3 registros desde el 26-oct
 * llegaron sin la cédula. Dos defectos, los dos callados:
 *
 *   · En el teléfono, con el permiso dado y sin NINGUNA foto, «Continuar» y
 *     «Prefiero escribir mis datos» pasaban sin avisar. Solo se avisaba de UN
 *     lado (ladoQueFalta). Y quien daba el permiso recién en «Tu rostro» nunca
 *     pasaba por el aviso.
 *   · En el CRM, con el rostro y sin la cédula, la galería pintaba el rostro y no
 *     decía nada; y «no las tomó» y «las tomó y no han subido» se veían igual.
 *
 * LA DECISIÓN QUE ESTAS PRUEBAS CUIDAN (Joan, 3-nov): se avisa y NO se bloquea. El
 * Decreto 1377 de 2013, art. 6, dice «Ninguna actividad podrá condicionarse a que
 * el Titular suministre datos personales sensibles», la SIC multó a Mercado Libre
 * por condicionar sus cuentas a datos biométricos, y legal/privacidad.html promete
 * «Es opcional de verdad». Si una de estas se cae porque alguien volvió
 * obligatoria la cédula, no es un arreglo pendiente de la prueba: es esa
 * conversación otra vez, con un abogado.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('./banco-registro.js');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const textoAviso = P => B.texto(P.elems.errReg.innerHTML);

/* ---------------------------------------------------------- en el teléfono */
function hastaElRostro(P) {
  B.casillas(P, 'identidad', B.DATOS_MARIA);
  P.ev('siguientePaso()');
  B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
  assert.equal(B.pasoActual(P), 'rostro', 'María no llegó a «Tu rostro»: ' + B.texto(B.caja(P)));
}

describe('1 · En el teléfono: con el permiso y sin la cédula, se avisa una vez y se puede seguir', () => {

  test('«Continuar» sin ninguna foto avisa y no pasa; el segundo toque pasa', () => {
    const P = B.abrir();
    P.ev('autorizarYEscanear()');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'documento', 'pasó callado: así quedó el registro del 27-oct, sin cédula');
    const t = textoAviso(P);
    assert.match(t, /Te faltan las fotos de tu cédula/);
    assert.match(t, /tu cuenta se abre igual/, 'el aviso no puede sonar a condición');
    assert.ok(B.boton(P.elems.errReg.innerHTML, 'Tomar las fotos'), 'no ofrece tomarlas');
    assert.ok(B.boton(P.elems.errReg.innerHTML, 'Seguir sin ellas'), 'no deja seguir');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'identidad', 'el segundo toque no pasó: eso sería bloquear');
  });

  test('«Prefiero escribir mis datos» DENTRO del escáner pasa, y el aviso llega al dejar «Tu rostro»', () => {
    const P = B.abrir();
    P.ev('autorizarYEscanear()');
    P.ev('prefieroEscribirMisDatos()');
    assert.equal(B.pasoActual(P), 'identidad');
    hastaElRostro(P);
    B.selfie(P, 'MARIA');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'rostro', 'se fue con el rostro y sin la cédula, sin que nadie se lo dijera');
    assert.match(textoAviso(P), /Te faltan las fotos de tu cédula/);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto', 'el segundo toque no pasó');
  });

  test('quien da el permiso recién en «Tu rostro» también se entera, y «Tomar las fotos» lo lleva a la cédula', () => {
    const P = B.abrir();
    B.tocar(P, 'Prefiero escribir mis datos');
    hastaElRostro(P);
    P.ev('autorizarDesdeElRostro()');
    B.selfie(P, 'MARIA');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'rostro');
    assert.match(textoAviso(P), /Te faltan las fotos de tu cédula/);
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Tomar las fotos'));
    assert.equal(B.pasoActual(P), 'documento', '«Tomar las fotos» no llevó al paso de la cédula');
  });

  test('si ya se avisó en el primer paso, no se repite en «Tu rostro»', () => {
    const P = B.abrir();
    P.ev('autorizarYEscanear()');
    P.ev('siguientePaso()');
    P.ev('siguientePaso()');
    hastaElRostro(P);
    B.selfie(P, 'MARIA');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto', 'avisó dos veces de lo mismo');
  });

  test('con un solo lado sigue el aviso de ese lado, también al dejar «Tu rostro»', () => {
    const P = B.abrir();
    B.escanear(P, B.MARIA, 'MARIA');
    P.ev('delete FOTOS.cedula_frente; guardarFotos();');
    hastaElRostro(P);
    B.selfie(P, 'MARIA');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'rostro');
    assert.match(textoAviso(P), /Te falta la foto del frente de tu cédula/);
  });
});

describe('2 · Y nadie se queda afuera: esto no es una condición', () => {

  test('sin el permiso no se avisa nada, en ningún paso, y la cuenta se puede abrir', () => {
    const P = B.abrir();
    B.tocar(P, 'Prefiero escribir mis datos');
    assert.equal(B.pasoActual(P), 'identidad');
    hastaElRostro(P);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto', 'a quien no dio el permiso se le está insistiendo');
    assert.doesNotMatch(textoAviso(P), /Te faltan las fotos/);
  });

  test('«Prefiero escribir mis datos» sigue al lado, y dice lo que pasa sin fotos', () => {
    const P = B.abrir();
    const h = B.cuerpo(P);
    assert.match(h, /id="btnEscribirDatos"/, 'quitar este botón es condicionar la cuenta a un dato sensible');
    assert.match(B.texto(h), /confirmar que eres tú toma más tiempo: te escribimos por el chat/);
  });

  test('la política sigue prometiendo lo que el código hace', () => {
    const pol = fs.readFileSync(path.join(B.RAIZ, 'legal', 'privacidad.html'), 'utf8');
    assert.match(pol, /Es opcional\s+de verdad/);
    assert.match(pol, /tu cuenta se abre igual/);
  });

  test('ningún texto del registro dice que sin la foto no se puede revisar', () => {
    const play = fs.readFileSync(path.join(B.RAIZ, 'play', 'index.html'), 'utf8');
    const sinComentarios = play.replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.doesNotMatch(sinComentarios, /no podemos revisar tu registro/);
    assert.match(sinComentarios, /o dinos por ahí si prefieres otra forma/);
  });

  test('en PlataChat no cambia nada: sin ninguna foto pasa como antes', () => {
    const P = B.abrir();
    P.ev("MARCA = 'platachat'");
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('ladoQueFalta()'), '', 'PlataChat no decide ningún crédito: Joan no pidió tocarla');
  });
});

/* -------------------------------------------- lo que viaja a la bandeja */
describe('3 · La bandeja dice qué fotos tomó, sin ninguna imagen', () => {
  async function abrirCuenta(P) {
    const ll = B.nube(P);
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(20);
    const b = ll().filter(x => /registrar_abierto/.test(x.url));
    assert.equal(b.length, 1, 'no salió el registro a la bandeja: ' + B.texto(B.caja(P)));
    return b[0].cuerpo.p_datos;
  }
  /* registrar_abierto solo guarda texto plano (base/20260909_una_sola_puerta.sql:
     llave hasta 40, valor hasta 200): un arreglo o un objeto no llegaría entero. */
  function esTextoQueLaBaseGuarda(d) {
    assert.equal(typeof d.fotos_tomadas, 'string');
    assert.ok(d.fotos_tomadas.length <= 200);
    assert.doesNotMatch(JSON.stringify(d), /data:image/, 'una imagen se fue a la bandeja');
  }

  test('con la cédula y la selfie: las tres, y que se leyó por el código', async () => {
    const P = B.abrir();
    B.mariaHastaElPermiso(P, true);
    const d = await abrirCuenta(P);
    assert.equal(d.fotos_tomadas, 'cedula_reverso,cedula_frente,selfie');
    assert.equal(d.cedula_leida_con, 'codigo');
    esTextoQueLaBaseGuarda(d);
  });

  test('sin el permiso: lo dice, y no dice que se leyó nada', async () => {
    const P = B.abrir();
    B.mariaHastaElPermiso(P, false);
    const d = await abrirCuenta(P);
    assert.equal(d.fotos_tomadas, 'sin_permiso');
    assert.equal(d.cedula_leida_con, '');
    esTextoQueLaBaseGuarda(d);
  });

  test('con el permiso y sin ninguna foto: «ninguna», que es el caso que no se distinguía', async () => {
    const P = B.abrir();
    P.ev('autorizarYEscanear()');
    P.ev('siguientePaso()');
    P.ev('siguientePaso()');
    hastaElRostro(P);
    P.ev('siguientePaso()');   // el aviso de la selfie
    P.ev('siguientePaso()');   // sigue sin ella; de la cédula ya se le avisó
    assert.equal(B.pasoActual(P), 'contacto');
    B.casillas(P, 'contacto', B.CONTACTO_MARIA);
    ['correo', 'celular2'].forEach(k => P.ev("anotarCampo($('f_" + k + "'))"));
    P.ev('Object.assign(REGISTRO, ' + JSON.stringify(B.RESTO) + '); guardarBorrador(REGISTRO);');
    P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = true;");
    const d = await abrirCuenta(P);
    assert.equal(d.fotos_tomadas, 'ninguna');
    esTextoQueLaBaseGuarda(d);
  });
});

/* ------------------------------------------------------------ en el CRM */
const FRENTE = 'data:image/jpeg;base64,RlJFTlRF';
const RESPALDO = 'data:image/jpeg;base64,UkVTUEFMRE8=';
const CARA = 'data:image/jpeg;base64,Q0FSQQ==';
const CEL = '3001234567';
const HOY = '2026-11-03T12:00:00';
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function crm(fotos) {
  const red = url => {
    if (String(url).includes('archivos_de_registro')) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ fotos, huella: null })) });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('null') });
  };
  const P = abrirPanel({ red, ahora: HOY });
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.cargarCartera({ socios: [], prestamos: [] });
  return P;
}
const registro = (datos, creado) => ({ id: 17, nombre: 'Luis Ejemplo', cedula: '80000000', telefono: CEL, estado: 'nuevo',
  origen: 'abierto', datos: Object.assign({ nombres: 'Luis' }, datos), huella: { ip: '190.1.1.1' }, creado_en: creado || '2026-11-03T15:00:00Z' });
async function tarjeta(fotos, datos, creado) {
  const P = crm(fotos);
  P.ctx.__r = [registro(datos, creado)]; P.ev('_registros=__r');
  P.ev('verDatosRegistro(17)');
  await asentar();
  return { P, fotos: P.elems.regFotos.innerHTML, todo: P.elems.mBody.innerHTML };
}

describe('4 · En el CRM: la cédula que no está se dice, con lo que se sabe', () => {

  test('lo que vio Joan el 31-oct: con el rostro y sin la cédula ya no se calla, y trae el botón', async () => {
    const { fotos } = await tarjeta({ selfie: CARA }, {});
    assert.match(plano(fotos), /Falta la cédula: no está ni el frente ni el respaldo, solo el rostro/);
    assert.match(fotos, /pedirFotosPorElChat\('17','los_dos'\)[^>]*>💬 Pedirle las fotos por el chat/);
  });

  test('un registro de antes de hoy dice que no se sabe, sin inventarse la causa', async () => {
    const { fotos } = await tarjeta({ selfie: CARA }, {});
    assert.match(plano(fotos), /antes de que se anotara cuál de las dos/);
  });

  test('«no las tomó» y «las tomó y no han llegado» ya no se ven igual', async () => {
    const noTomo = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'selfie' })).fotos);
    assert.match(noTomo, /No las tomó: el teléfono le avisó que faltaban y siguió sin ellas/);
    const enCamino = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' })).fotos);
    assert.match(enCamino, /Las tomó y todavía no llegan: siguen en su teléfono y suben cuando entre a su cuenta/);
  });

  test('«suben cuando entre» solo se dice el primer día: después el teléfono las borra', async () => {
    const t = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' }, '2026-11-01T15:00:00Z')).fotos);
    assert.match(t, /ya pasó más de un día/);
    assert.doesNotMatch(t, /suben cuando entre/);
  });

  test('sin el permiso: es su derecho, y a Joan se le dice que confirme por otra vía', async () => {
    const t = plano((await tarjeta({}, { fotos_tomadas: 'sin_permiso' })).fotos);
    assert.match(t, /No dio el permiso de las fotos: es su derecho \(Ley 1581\)/);
    assert.match(t, /prefiere otra forma/);
    assert.doesNotMatch(t, /No subió fotos/);
  });

  test('un solo lado: dice cuál, y el botón pide ese', async () => {
    const { fotos } = await tarjeta({ cedula_reverso: RESPALDO, selfie: CARA }, { fotos_tomadas: 'cedula_reverso,selfie' });
    assert.match(plano(fotos), /Falta la foto del frente de la cédula/);
    assert.match(plano(fotos), /No la tomó: el teléfono le avisó que faltaba/);
    assert.match(fotos, /pedirFotosPorElChat\('17','frente'\)/);
  });

  test('tomó un lado y el otro no: los dos hechos, sin mezclarlos', async () => {
    const { fotos } = await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,selfie' });
    assert.match(plano(fotos), /Tomó el respaldo y no ha llegado; el frente no lo tomó/);
  });

  test('con los dos lados: ni aviso ni botón, aunque el teléfono haya dicho otra cosa', async () => {
    const { fotos } = await tarjeta({ cedula_frente: FRENTE, cedula_reverso: RESPALDO, selfie: CARA }, { fotos_tomadas: 'ninguna' });
    assert.doesNotMatch(plano(fotos), /Falta/);
    assert.doesNotMatch(fotos, /pedirFotosPorElChat/, 'lo que llegó a la base manda sobre lo que dijo el teléfono');
  });

  test('un valor raro en fotos_tomadas no se pinta nunca (lo escribe el teléfono de quien se registra)', async () => {
    const { todo } = await tarjeta({ selfie: CARA }, { fotos_tomadas: '<img src=x onerror=alert(1)>' });
    assert.doesNotMatch(todo, /onerror=alert/);
  });

  test('«Lo que declaró» no lista las llaves del teléfono como si las hubiera declarado', async () => {
    const { todo } = await tarjeta({ selfie: CARA }, { fotos_tomadas: 'selfie', cedula_leida_con: 'letras' });
    assert.doesNotMatch(plano(todo), /fotos tomadas|cedula leida con/);
  });

  test('«Cédula leída» dice lo que pasó: por las letras no es un error', async () => {
    const letras = plano((await tarjeta({ cedula_frente: FRENTE, cedula_reverso: RESPALDO }, { fotos_tomadas: 'cedula_reverso,cedula_frente', cedula_leida_con: 'letras' })).todo);
    assert.match(letras, /Se leyó por sus letras, no por el código de barras/);
    assert.doesNotMatch(letras, /No llegó la lectura/);
    const sinFotos = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'selfie' })).todo);
    assert.match(sinFotos, /No se leyó: no tomó las fotos de su cédula/);
    const deAntes = plano((await tarjeta({ selfie: CARA }, {})).todo);
    assert.match(deAntes, /No llegó la lectura del código de barras/, 'el registro de antes sigue diciendo que no se sabe');
  });
});

describe('5 · 📥 Registrados y «💬 Pedirle las fotos por el chat»', () => {

  function bandeja(datos, fotos) {
    const P = crm(fotos || {});
    P.ctx.__r = [registro(datos)]; P.ev('_registros=__r');
    P.ev('renderRegistros()');
    return P;
  }

  test('la fila lo dice de un vistazo; la de un registro completo o de antes, no', () => {
    assert.match(plano(bandeja({ fotos_tomadas: 'selfie' }).elems.tblRegistros.innerHTML), /🪪 Se registró sin la cédula/);
    assert.match(plano(bandeja({ fotos_tomadas: 'sin_permiso' }).elems.tblRegistros.innerHTML), /🪪 Se registró sin la cédula/);
    assert.match(plano(bandeja({ fotos_tomadas: 'cedula_reverso,selfie' }).elems.tblRegistros.innerHTML), /🪪 Se registró con un solo lado/);
    assert.doesNotMatch(plano(bandeja({ fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' }).elems.tblRegistros.innerHTML), /🪪/);
    assert.doesNotMatch(plano(bandeja({}).elems.tblRegistros.innerHTML), /🪪/);
  });

  /* chat.js corre en el reino de Node dentro del banco: su fetch es el global. */
  async function conChat(fn) {
    const real = globalThis.fetch, urls = [];
    globalThis.fetch = u => { urls.push(String(u)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') }); };
    try { await fn(urls); } finally { globalThis.fetch = real; }
  }
  function preparado(fotos, cuenta) {
    const P = bandeja({ fotos_tomadas: 'selfie' }, fotos);
    P.ev('var __rpc = rpc; rpc = function (fn, a) { if (fn === "cuentas_de_registros") return Promise.resolve([{ cuenta: ' + (cuenta !== false) + ' }]); return __rpc(fn, a); };');
    P.ev('CHAT.hiloDeCelular = function () { return Promise.resolve({ ok: true, hilo: "' + CEL + '" }); };');
    return P;
  }

  test('abre SU chat con el mensaje escrito, y no lo manda', async () => {
    await conChat(async urls => {
      const P = preparado({ selfie: CARA });
      P.ev("pedirFotosPorElChat('17','los_dos')");
      await asentar();
      assert.equal(P.ev('_chatAbierta'), CEL, 'no abrió el chat de esa persona');
      const m = P.ev("document.getElementById('chResp').value");
      assert.match(m, /nos faltan las fotos de tu cédula por los dos lados/);
      assert.match(m, /Si prefieres no mandarlas, dinos y vemos otra forma de confirmar que eres tú/, 'el mensaje suena a condición');
      assert.equal(urls.filter(u => /chat_responder/.test(u)).length, 0, 'se mandó solo');
      assert.equal(P.ev('_chatExtra.extra.borrador'), undefined, '«← Volver al chat» volvería a escribirlo');
    });
  });

  test('desde la fila pregunta primero qué falta: no le pide lo que ya mandó', async () => {
    await conChat(async () => {
      const P = preparado({ cedula_frente: FRENTE, cedula_reverso: RESPALDO, selfie: CARA });
      P.ev("pedirFotosPorElChat('17','')");
      await asentar();
      assert.match((P.ctx._avisos || []).join(' '), /Ya llegaron las dos fotos de su cédula/);
      assert.equal(P.ev('_chatAbierta'), null, 'abrió el chat para pedir lo que ya tiene');
    });
    await conChat(async () => {
      const P = preparado({ cedula_reverso: RESPALDO });
      P.ev("pedirFotosPorElChat('17','')");
      await asentar();
      assert.match(P.ev("document.getElementById('chResp').value"), /nos falta la foto del frente de tu cédula/);
    });
  });

  test('sin cuenta no hay quién lea: no abre el chat y dice por qué', async () => {
    await conChat(async () => {
      const P = preparado({ selfie: CARA }, false);
      P.ev("pedirFotosPorElChat('17','los_dos')");
      await asentar();
      assert.match((P.ctx._avisos || []).join(' '), /todavía no tiene cuenta en la app/);
      assert.equal(P.ev('_chatAbierta'), null);
    });
  });

  test('la ficha y la vista del equipo también dicen que solo está el rostro', () => {
    const P = crm({});
    const h = P.ev("avisoLadoQueFalta(false,false,'',true)");
    assert.match(plano(h), /Falta la cédula/);
    assert.equal(P.ev("avisoLadoQueFalta(false,false,'',false)"), '', 'sin ninguna foto cada vista tiene su propio «no subió fotos»');
    const crmHtml = fs.readFileSync(path.join(B.RAIZ, 'panel', 'crm.html'), 'utf8');
    assert.match(crmHtml, /avisoLadoQueFalta\(!!s\.cedulaFrenteFoto,!!s\.cedulaReversoFoto,'',!!s\.selfieFoto\)/);
    assert.match(crmHtml, /avisoLadoQueFalta\(!!f\.cedula_frente, !!f\.cedula_reverso, 'Pídesela antes de desembolsar\.', !!f\.selfie\)/);
  });
});
