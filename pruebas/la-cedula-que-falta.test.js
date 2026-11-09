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

  /* 4-nov-2026 — antes hacían falta cuatro «Volver» para llegar a la portada, que
     suelta lo sensible a propósito. El botón nuevo dejaba a dos toques de perderlo:
     «Tomar las fotos» saltaba al Paso 1, y ahí «Volver» es la portada. */
  function conSelfieYAviso() {
    const P = B.abrir();
    B.tocar(P, 'Prefiero escribir mis datos');
    hastaElRostro(P);
    P.ev('autorizarDesdeElRostro()');
    B.selfie(P, 'MARIA');
    P.ev('siguientePaso()');
    assert.match(textoAviso(P), /Te faltan las fotos de tu cédula/);
    P.ev(B.boton(P.elems.errReg.innerHTML, 'Tomar las fotos'));
    assert.equal(B.pasoActual(P), 'documento');
    return P;
  }

  test('«Volver» después de «Tomar las fotos» regresa a «Tu rostro», y no se lleva nada', () => {
    const P = conSelfieYAviso();
    B.tocar(P, 'Volver');
    assert.equal(B.pasoActual(P), 'rostro', 'lo sacó del registro sin decirle nada');
    assert.equal(P.ev('autorizoEsteIntento()'), true, 'se llevó el permiso');
    assert.equal(P.ev("hayFotoLista('selfie')"), true, 'se llevó la selfie');
    /* Y el aviso sigue funcionando: si vuelve a seguir sin ellas, se le dice una vez. */
    P.ev('siguientePaso()');
    assert.match(textoAviso(P), /Te faltan las fotos de tu cédula/);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto');
  });

  test('«Cancelar» el escáner no le cambia a «Volver» a dónde va', () => {
    const P = conSelfieYAviso();
    P.ev("pintarRegistro(indiceDe('documento'))");   // lo que hace «Cancelar»
    B.tocar(P, 'Volver');
    assert.equal(B.pasoActual(P), 'rostro');
    assert.equal(P.ev("hayFotoLista('selfie')"), true);
  });

  test('con «Continuar» se va por los pasos, y después «Volver» ya es el de siempre', () => {
    const P = conSelfieYAviso();
    P.ev('siguientePaso()');   // de la cédula sin fotos: avisa
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'identidad');
    P.ev("pintarRegistro(indiceDe('documento'))");
    assert.equal(B.boton(B.cuerpo(P), 'Volver'), 'pintarEntrar()', 'recordó un salto que ya terminó');
  });

  test('quien llegó al primer paso por el camino normal sale a la portada, como siempre', () => {
    const P = B.abrir();
    assert.equal(B.pasoActual(P), 'documento');
    assert.equal(B.boton(B.cuerpo(P), 'Volver'), 'pintarEntrar()');
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

describe('1-bis · 4-nov-2026: a quien escribió Pasaporte no se le habla de una cédula', () => {
  function hastaElRostroCon(P, doc) {
    B.tocar(P, 'Prefiero escribir mis datos');
    B.casillas(P, 'identidad', Object.assign({}, B.DATOS_MARIA, doc));
    P.ev('siguientePaso()');
    B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.equal(B.pasoActual(P), 'rostro', 'no llegó a «Tu rostro»: ' + B.texto(B.caja(P)));
    P.ev('autorizarDesdeElRostro()');
    B.selfie(P, 'MARIA');
  }
  const PASAPORTE = { tipo_doc: 'Pasaporte', documento: 'AB123456' };

  test('el aviso nombra su pasaporte, sin «los dos lados» y sin mandarlo al escáner de la cédula', () => {
    const P = B.abrir();
    hastaElRostroCon(P, PASAPORTE);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'rostro');
    const t = textoAviso(P);
    assert.match(t, /Te falta la foto de tu pasaporte/);
    assert.match(t, /tu cuenta se abre igual/);
    assert.doesNotMatch(t, /cédula/, 'le dijo que le falta una cédula que no tiene');
    assert.doesNotMatch(t, /dos lados/);
    assert.equal(B.boton(P.elems.errReg.innerHTML, 'Tomar las fotos'), null, 'lo manda a un escáner que dice «Pon la cédula DE PIE»');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'contacto', 'el segundo toque siempre pasa');
  });

  test('con la cédula de extranjería sigue el aviso de la cédula: tiene dos lados', () => {
    const P = B.abrir();
    hastaElRostroCon(P, { tipo_doc: 'Cédula de extranjería', documento: '123456' });
    P.ev('siguientePaso()');
    assert.match(textoAviso(P), /Te faltan las fotos de tu cédula/);
  });

  test('en PlataChat tampoco cambia nada con un pasaporte', () => {
    const P = B.abrir();
    P.ev("MARCA = 'platachat'");
    P.ev("REGISTRO.tipo_doc = 'Pasaporte'");
    P.ev('autorizarYEscanear()');
    assert.equal(P.ev('ladoQueFalta()'), '');
  });

  test('su cuenta tampoco le dice «no tomaste la foto de tu cédula»', () => {
    const P = B.abrir();
    const t = P.ev("textoDeLoQueFalto(['cedula_frente','cedula_reverso'], [], false, true)");
    assert.match(t, /no tomaste la foto de tu pasaporte/);
    assert.doesNotMatch(t, /cédula/);
    assert.match(P.ev("textoDeLoQueFalto(['cedula_frente','cedula_reverso'], [], false)"), /no tomaste la foto de tu cédula/);
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
    assert.equal(P.ev('ladoQueFalta()'), '', 'Joan decidió que PlataChat no cambia');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'identidad', 'en PlataChat «Continuar» pasa callado, como antes');
    assert.doesNotMatch(textoAviso(P), /Te faltan/);
  });

  test('en PlataChat el primer paso dice lo mismo de antes: «te escribimos por el chat» es de Tu Garantía', () => {
    const P = B.abrir();
    P.ev("MARCA = 'platachat'");
    P.ev("pintarRegistro(indiceDe('documento'))");
    const t = B.texto(B.cuerpo(P));
    assert.match(t, /Sin fotos: ni de la cédula ni de tu cara\. Si cambias de opinión/);
    assert.doesNotMatch(t, /confirmar que eres tú toma más tiempo/);
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

  test('quien dio el permiso y escaneó una cédula de otro documento no sale como «no dio el permiso»', async () => {
    const P = B.abrir();
    B.escanear(P, B.MARIA, 'MARIA');
    B.casillas(P, 'identidad', { expedicion: B.DATOS_MARIA.expedicion, documento: '79111222' });
    P.ev('siguientePaso()');
    assert.match(textoAviso(P), /no es la del documento que escribiste/);
    assert.equal(P.ev('PERMISO_SOLTADO'), true);
    P.ev('siguientePaso()');   // «Seguir sin fotos»
    B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.equal(B.pasoActual(P), 'rostro');
    P.ev('siguientePaso()');
    B.casillas(P, 'contacto', B.CONTACTO_MARIA);
    ['correo', 'celular2'].forEach(k => P.ev("anotarCampo($('f_" + k + "'))"));
    P.ev('Object.assign(REGISTRO, ' + JSON.stringify(B.RESTO) + '); guardarBorrador(REGISTRO);');
    P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true; $('autSensible').checked = false;");
    const d = await abrirCuenta(P);
    assert.equal(d.fotos_tomadas, 'cedula_soltada');
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

function crm(fotos, huella) {
  const red = url => {
    if (String(url).includes('archivos_de_registro')) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ fotos, huella: huella || null })) });
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
async function tarjeta(fotos, datos, creado, huella) {
  const P = crm(fotos, huella);
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
    assert.match(noTomo, /Al registrarse, su teléfono no tenía las fotos de la cédula/);
    const enCamino = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' })).fotos);
    assert.match(enCamino, /Su teléfono dijo que las tomó, y todavía no llegan\. Si siguen allá, suben cuando entre a su cuenta/);
  });

  /* 4-nov-2026 — fotos_tomadas no dice si hubo aviso: sale igual de quien vio «Te
     faltan las fotos» y de quien marcó la casilla al final o se registró por
     PlataChat, a quienes nadie les avisó nada. Lo que no se sabe no se afirma. */
  test('no afirma un aviso: el dato no dice si lo hubo', async () => {
    for (const datos of [{ fotos_tomadas: 'selfie' }, { fotos_tomadas: 'ninguna' }, { fotos_tomadas: 'cedula_reverso,selfie' }]) {
      const { todo } = await tarjeta({ selfie: CARA }, datos);
      assert.doesNotMatch(plano(todo), /le avisó/, 'afirma un aviso que pudo no haber: ' + JSON.stringify(datos));
    }
  });

  test('«siguen en su teléfono» no se afirma: el teléfono pudo haberlas soltado', async () => {
    const t = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' })).fotos);
    assert.doesNotMatch(t, /siguen en su teléfono/);
    assert.match(t, /Si hoy no llegan, pídeselas/);
  });

  test('lo que dijo la base manda: una cédula rechazada no «sube cuando entre»', async () => {
    const TODAS = { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' };
    const otro = plano((await tarjeta({ selfie: CARA }, TODAS, null, { cedula_rechazada: { motivo: 'otro_documento', momento: '2026-11-03T15:00:00Z' } })).fotos);
    assert.match(otro, /La nube no guardó la cédula de sus fotos: no es la del documento de su registro/);
    assert.match(otro, /el teléfono las borró/);
    assert.doesNotMatch(otro, /suben cuando entre/);
    const duda = plano((await tarjeta({}, TODAS, null, { cedula_rechazada: { motivo: 'en_duda', momento: '2026-11-03T15:00:00Z' } })).fotos);
    assert.match(duda, /no se pudo confirmar de quién es/);
    assert.doesNotMatch(duda, /suben cuando entre/);
    const grandes = plano((await tarjeta({ selfie: CARA }, TODAS, null, { fotos_rechazadas: { fotos: [{ tipo: 'cedula_frente', motivo: 'muy_grande' }, { tipo: 'cedula_reverso', motivo: 'muy_grande' }], momento: '2026-11-03T15:00:00Z' } })).fotos);
    assert.match(grandes, /La nube no aceptó las fotos de la cédula \(demasiado grandes\)/);
    assert.doesNotMatch(grandes, /suben cuando entre/);
    /* Rechazada otra cosa, no es esto. */
    const selfie = plano((await tarjeta({ selfie: CARA }, TODAS, null, { fotos_rechazadas: { fotos: [{ tipo: 'selfie', motivo: 'muy_grande' }], momento: '2026-11-03T15:00:00Z' } })).fotos);
    assert.match(selfie, /Su teléfono dijo que las tomó/);
  });

  test('«sin_permiso» del primer intento no gana contra lo que llegó: su rostro no sube sin permiso', async () => {
    const t = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'sin_permiso' })).fotos);
    assert.doesNotMatch(t, /es su derecho/, 'dice que no dio el permiso al lado de su rostro');
    assert.match(t, /el permiso lo dio después/);
    const lectura = plano((await tarjeta({ cedula_frente: FRENTE, cedula_reverso: RESPALDO, selfie: CARA }, { fotos_tomadas: 'sin_permiso' })).todo);
    assert.doesNotMatch(lectura, /no dio el permiso/, 'encima de sus tres fotos');
  });

  test('quien dio el permiso y su cédula no coincidió no sale como «es su derecho»', async () => {
    const r = await tarjeta({}, { fotos_tomadas: 'cedula_soltada' });
    const t = plano(r.fotos);
    assert.match(t, /Dio el permiso y la cédula que tomó no coincidió con el documento escrito/);
    assert.match(t, /confirma quién es/);
    assert.doesNotMatch(t, /es su derecho/);
    assert.match(plano(r.todo), /la cédula que tomó no coincidió/);
    assert.doesNotMatch(plano(r.todo), /no dio el permiso/);
  });

  test('«suben cuando entre» solo se dice el primer día: después el teléfono las borra', async () => {
    const t = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' }, '2026-11-01T15:00:00Z')).fotos);
    assert.match(t, /ya pasó más de un día/);
    assert.doesNotMatch(t, /suben cuando entre/);
  });

  test('sin el permiso: es su derecho, y a Joan se le dice que confirme por otra vía', async () => {
    const t = plano((await tarjeta({}, { fotos_tomadas: 'sin_permiso' })).fotos);
    assert.match(t, /Se registró sin el permiso de las fotos: es su derecho \(Ley 1581\)/);
    assert.match(t, /prefiere otra forma/);
    assert.doesNotMatch(t, /No subió fotos/);
  });

  test('un solo lado: dice cuál, y el botón pide ese', async () => {
    const { fotos } = await tarjeta({ cedula_reverso: RESPALDO, selfie: CARA }, { fotos_tomadas: 'cedula_reverso,selfie' });
    assert.match(plano(fotos), /Falta la foto del frente de la cédula/);
    assert.match(plano(fotos), /Al registrarse, su teléfono no tenía esa foto/);
    assert.match(fotos, /pedirFotosPorElChat\('17','frente'\)/);
  });

  test('tomó un lado y el otro no: los dos hechos, sin mezclarlos', async () => {
    const { fotos } = await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,selfie' });
    assert.match(plano(fotos), /Su teléfono dijo que tomó el respaldo, y no ha llegado; el frente no lo tenía/);
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
    assert.match(letras, /Su teléfono dijo que la leyó por sus letras, no por el código de barras/);
    assert.doesNotMatch(letras, /No llegó la lectura/);
    const sinFotos = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'selfie' })).todo);
    assert.match(sinFotos, /No llegó lectura: cuando se anotó su registro, su teléfono no tenía las fotos de su cédula/);
    /* La del código viaja con las fotos: no se dice «no se leyó» de quien sí se leyó. */
    const porCodigo = plano((await tarjeta({ selfie: CARA }, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie', cedula_leida_con: 'codigo' })).todo);
    assert.match(porCodigo, /Su teléfono dijo que la leyó por el código de barras, y esa lectura todavía no llega/);
    const deAntes = plano((await tarjeta({ selfie: CARA }, {})).todo);
    assert.match(deAntes, /No llegó la lectura del código de barras/, 'el registro de antes sigue diciendo que no se sabe');
  });

  /* 9-nov-2026 — la segunda ronda: la fila esperaba una lectura que la misma tarjeta
     decía que ya no existía, y pintaba como hecho lo que solo dijo el teléfono. */
  async function filaLeida(fotos, datos, creado, huellaDeLaFila) {
    const P = crm(fotos, huellaDeLaFila);
    P.ctx.__r = [Object.assign(registro(datos, creado), { huella: huellaDeLaFila })]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(17)');
    await asentar();
    const todo = plano(P.elems.mBody.innerHTML);
    const m = todo.match(/Cédula leída (.*?)(?: Lo que subió| Fotos| Registrado|$)/);
    return { todo, fila: m ? m[1] : todo, fotos: plano(P.elems.regFotos.innerHTML) };
  }
  const TRES = { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie', cedula_leida_con: 'codigo' };

  test('con la cédula rechazada por la base, la fila no dice que la lectura viene en camino', async () => {
    for (const motivo of ['otro_documento', 'en_duda']) {
      const { todo, fotos } = await filaLeida({ selfie: CARA }, TRES, null, { ip: '190.1.1.1', momento: '2026-11-03T15:00:00Z', cedula_rechazada: { motivo, momento: '2026-11-03T15:00:00Z' } });
      assert.doesNotMatch(todo, /todavía no llega|viaja con sus fotos/, motivo + ': «espera» lo que la tarjeta dice que el teléfono borró');
      assert.match(todo, /No llegó lectura: la nube no guardó la cédula de sus fotos/);
      assert.match(fotos, /el teléfono las borró/, 'la tarjeta de abajo sigue diciendo lo suyo');
    }
    const grandes = await filaLeida({ selfie: CARA }, TRES, null, { ip: '190.1.1.1', momento: '2026-11-03T15:00:00Z', fotos_rechazadas: { fotos: [{ tipo: 'cedula_reverso', motivo: 'muy_grande' }], momento: '2026-11-03T15:00:00Z' } });
    assert.doesNotMatch(grandes.todo, /todavía no llega/);
    assert.match(grandes.todo, /la nube no aceptó las fotos de su cédula/);
  });

  test('pasado el día, la lectura que no llegó ya no se espera', async () => {
    const { todo } = await filaLeida({}, TRES, '2026-10-29T15:00:00Z', { aparato_telefono: { modelo: 'X' } });
    assert.doesNotMatch(todo, /todavía no llega/, 'cinco días después sigue «en camino»');
    assert.match(todo, /esa lectura no llegó: viajaba con sus fotos, que no subieron/);
    const sinLectura = await filaLeida({}, { fotos_tomadas: 'cedula_reverso,cedula_frente,selfie' }, '2026-10-29T15:00:00Z', { aparato_telefono: { modelo: 'X' } });
    assert.doesNotMatch(sinLectura.todo, /todavía no suben/);
    assert.match(sinLectura.todo, /pasado un día el teléfono las borra/);
  });

  test('si sus fotos subieron sin la lectura, no se dice que viaja con ellas: es la alarma', async () => {
    const { todo } = await filaLeida({ cedula_frente: FRENTE, cedula_reverso: RESPALDO, selfie: CARA }, TRES, null, { ip: '190.1.1.1', momento: '2026-11-03T15:30:00Z' });
    assert.doesNotMatch(todo, /todavía no llega/);
    assert.match(todo, /pero sus fotos llegaron sin esa lectura/);
    assert.match(todo, /«🔢 Leer el código de barras de la foto»/, 'manda al botón con su nombre de verdad');
  });

  test('lo que solo dijo el teléfono se dice como dicho, no como hecho', async () => {
    const { todo } = await filaLeida({}, TRES, null, { ip: '190.1.1.1' });
    assert.match(todo, /Su teléfono dijo que la leyó por el código de barras, y esa lectura todavía no llega/, 'el primer día sí se espera');
    assert.doesNotMatch(todo, /Su teléfono la leyó/);
    const letras = await filaLeida({}, { fotos_tomadas: 'cedula_reverso,cedula_frente', cedula_leida_con: 'letras' }, null, { ip: '190.1.1.1' });
    assert.doesNotMatch(letras.todo, /Se leyó por sus letras/);
  });
});

describe('4-bis · 4-nov-2026: de un pasaporte no se dice que falta la cédula', () => {
  const PASAPORTE = { tipo_doc: 'Pasaporte', documento: 'AB123456' };

  test('la tarjeta dice el pasaporte, sin frente ni respaldo', async () => {
    const r = await tarjeta({ selfie: CARA }, Object.assign({ fotos_tomadas: 'selfie' }, PASAPORTE));
    const t = plano(r.fotos);
    assert.match(t, /Falta la foto del pasaporte: solo está el rostro/);
    assert.doesNotMatch(t, /la cédula|Falta la cédula/);
    assert.match(r.fotos, /pedirFotosPorElChat\('17','pasaporte'\)/);
    assert.match(plano(r.todo), /Su documento es un pasaporte: no trae el código de barras de la cédula/);
    assert.doesNotMatch(plano(r.todo), /No llegó lectura/);
  });

  test('con una foto de su documento ya no falta nada: un pasaporte no tiene respaldo', async () => {
    const r = await tarjeta({ cedula_frente: FRENTE, selfie: CARA }, Object.assign({ fotos_tomadas: 'cedula_frente,selfie' }, PASAPORTE));
    assert.doesNotMatch(plano(r.fotos), /Falta/);
    assert.doesNotMatch(r.fotos, /pedirFotosPorElChat/);
  });

  test('el mensaje listo pide la foto del pasaporte', () => {
    const P = crm({});
    assert.match(P.ev('PEDIR_FOTOS.pasaporte'), /nos falta la foto de tu pasaporte/);
    assert.doesNotMatch(P.ev('PEDIR_FOTOS.pasaporte'), /cédula|dos lados/);
    assert.match(P.ev('PEDIR_FOTOS.pasaporte'), /Si prefieres no mandarla, dinos y vemos otra forma/);
  });

  test('la fila de Registrados lo dice por su nombre', () => {
    const P = crm({});
    P.ctx.__r = [registro(Object.assign({ fotos_tomadas: 'selfie' }, PASAPORTE))]; P.ev('_registros=__r');
    P.ev('renderRegistros()');
    const t = plano(P.elems.tblRegistros.innerHTML);
    assert.match(t, /🪪 Se registró sin la foto de su pasaporte/);
    assert.doesNotMatch(t, /sin la cédula/);
  });

  test('el mismo aviso de la cédula de extranjería, que sí tiene dos lados', async () => {
    const r = await tarjeta({ selfie: CARA }, { fotos_tomadas: 'selfie', tipo_doc: 'Cédula de extranjería' });
    assert.match(plano(r.fotos), /Falta la cédula/);
  });
});

describe('4-ter · 4-nov-2026: PlataChat no cambia, tampoco en la fila de Registrados', () => {

  test('la fila de un registro de PlataChat no trae la marca ni el botón', () => {
    const P = crm({});
    P.ctx.__r = [Object.assign(registro({ fotos_tomadas: 'selfie' }), { app: 'platachat' })]; P.ev('_registros=__r');
    P.ev('renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.doesNotMatch(plano(h), /🪪/, 'Joan decidió que PlataChat no cambia');
    assert.doesNotMatch(h, /pedirFotosPorElChat/);
  });

  /* 9-nov-2026 — la segunda ronda de la revisión (tres revisores por separado): la
     fila ya salía como antes, pero «Ver datos» y la ficha le daban a Joan una
     instrucción nueva y un botón que le escribe al cliente. De un registro de
     PlataChat se pinta lo de main (04e6ac2). */
  async function verPlataChat(fotos, datos) {
    const P = crm(fotos);
    P.ctx.__r = [Object.assign(registro(datos), { app: 'platachat' })]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(17)');
    await asentar();
    return P.elems.regFotos.innerHTML;
  }

  test('«Ver datos» de PlataChat, solo con el rostro: la galería, sin instrucción ni botón (como en main)', async () => {
    const h = await verPlataChat({ selfie: CARA }, { fotos_tomadas: 'selfie' });
    assert.doesNotMatch(plano(h), /Pídeselas|antes de desembolsar|Falta la cédula/, 'PlataChat no cambia');
    assert.doesNotMatch(h, /pedirFotosPorElChat/, 'el botón le escribe al cliente: en PlataChat no estaba');
    assert.match(h, /id="regFoto_selfie"/, 'la foto que sí llegó se tiene que ver');
  });

  test('«Ver datos» de PlataChat sin ninguna foto dice lo de siempre, también sin el permiso', async () => {
    for (const datos of [{ fotos_tomadas: 'sin_permiso' }, { fotos_tomadas: 'ninguna' }, {}]) {
      const h = await verPlataChat({}, datos);
      assert.equal(plano(h).trim(), 'No subió fotos (o no autorizó).', JSON.stringify(datos));
    }
  });

  test('«Ver datos» de PlataChat con un solo lado: el aviso de main, sin el botón', async () => {
    const h = await verPlataChat({ cedula_reverso: RESPALDO, selfie: CARA }, { fotos_tomadas: 'cedula_reverso,selfie' });
    assert.match(plano(h), /Falta la foto del frente de la cédula: solo está la del respaldo\. No llegó a la nube: el teléfono no la subió o nunca la tomó\./);
    assert.doesNotMatch(h, /pedirFotosPorElChat/);
    assert.match(h, /cotejarConLaFoto\('regFoto_reverso'/, 'el botón de leer el código sigue');
  });

  test('un registro de Tu Garantía sigue con su tarjeta y su botón', async () => {
    const P = crm({ selfie: CARA });
    P.ctx.__r = [registro({ fotos_tomadas: 'selfie' })]; P.ev('_registros=__r');
    P.ev('verDatosRegistro(17)');
    await asentar();
    assert.match(plano(P.elems.regFotos.innerHTML), /Al registrarse, su teléfono no tenía las fotos de la cédula/);
    assert.match(P.elems.regFotos.innerHTML, /pedirFotosPorElChat/);
  });

  test('la ficha que nace de un registro de PlataChat no trae las dos llaves: nace como en main', () => {
    const P = crm({});
    const d = { nombres: 'Luis', fotos_tomadas: 'selfie', cedula_leida_con: 'codigo' };
    P.ctx.__d = d;
    const pc = P.ev("datosDelRegistroParaLaFicha(__d,'platachat')");
    assert.equal(pc.fotos_tomadas, undefined);
    assert.equal(pc.cedula_leida_con, undefined);
    assert.equal(pc.nombres, 'Luis', 'lo que declaró no se pierde');
    assert.equal(d.fotos_tomadas, 'selfie', 'no toca el registro, solo la copia');
    assert.equal(P.ev("datosDelRegistroParaLaFicha(__d,'tugarantia')").fotos_tomadas, 'selfie');
    P.ctx.__r = [Object.assign(registro({ fotos_tomadas: 'selfie', cedula_leida_con: 'codigo' }), { app: 'platachat' })]; P.ev('_registros=__r');
    P.ev('fichaDesdeRegistro(17)');
    const v = P.ev('_vinculacionPendiente');
    assert.ok(v && v.nombres === 'Luis');
    assert.equal(v.fotos_tomadas, undefined, 'la ficha le pediría las fotos «antes de desembolsar»');
    const crmHtml = fs.readFileSync(path.join(B.RAIZ, 'panel', 'crm.html'), 'utf8');
    assert.match(crmHtml, /s\.vinculacion=datosDelRegistroParaLaFicha\(r\.datos,r\.app\)/, 'la mesa de cruce');
    assert.match(crmHtml, /const d=datosDelRegistroParaLaFicha\(s\.datos,s\.app\);/, 'el desembolso directo desde una solicitud');
  });
});

describe('4-quater · 4-nov-2026: la ficha sabe lo que el registro sabe', () => {
  const LECTURA_VIEJA = /desde aquí no se distinguen/;
  const HUELLA = { ip: '190.1.1.1', aparato: 'Android', momento: '2026-11-03T15:00:00Z' };
  function ficha(vinc, extra) {
    const s = Object.assign({ id: 's1', numero: 1, nombre: 'Luis Ejemplo', cedula: '80000000', telefono: CEL, gestiones: [],
      huellaRegistro: HUELLA }, vinc ? { vinculacion: vinc } : {}, extra || {});
    const P = abrirPanel({ ahora: HOY });
    P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
    P.cargarCartera({ socios: [s], prestamos: [] });
    P.ev("verCliente('s1')");
    return P;
  }
  const verFicha = P => plano(P.elems.mBody.innerHTML);

  test('la fila «Cédula leída» dice lo mismo que el registro', () => {
    assert.match(verFicha(ficha({ fotos_tomadas: 'cedula_reverso,cedula_frente,selfie', cedula_leida_con: 'letras' })), /Su teléfono dijo que la leyó por sus letras/);
    assert.match(verFicha(ficha({ fotos_tomadas: 'selfie' })), /No llegó lectura: cuando se anotó su registro/);
    assert.match(verFicha(ficha({ fotos_tomadas: 'sin_permiso' })), /No llegó lectura: cuando se anotó su registro no tenía el permiso/);
    for (const v of [{ fotos_tomadas: 'selfie' }, { fotos_tomadas: 'sin_permiso' }, { fotos_tomadas: 'cedula_reverso,cedula_frente', cedula_leida_con: 'letras' }]) {
      assert.doesNotMatch(verFicha(ficha(v)), LECTURA_VIEJA, 'la ficha no leyó lo que el teléfono dijo: ' + JSON.stringify(v));
    }
  });

  test('a quien se le leyó el código no se le dice «no llegó» en la ficha, que no guarda la lectura', () => {
    const t = verFicha(ficha({ fotos_tomadas: 'cedula_reverso,cedula_frente,selfie', cedula_leida_con: 'codigo' }));
    assert.match(t, /Su teléfono dijo que la leyó por el código de barras al registrarse; esa lectura no está en esta ficha/);
    assert.doesNotMatch(t, /No llegó la lectura/);
    assert.doesNotMatch(t, /todavía no llega/);
  });

  /* 9-nov-2026 — la segunda ronda: la ficha soltaba lo que la base dijo de la cédula. */
  test('la ficha guarda si llegó la lectura y si la base rechazó la cédula, y nada de lo leído', () => {
    const P = crm({});
    P.ctx.__h = { ip: '190.1.1.1', aparato: 'Android', momento: '2026-11-03T15:00:00Z',
      cedula_leida: { nombres: 'LUIS', apellidos: 'EJEMPLO', documento: '80000000', nacimiento: '1990-01-01' },
      cedula_rechazada: { motivo: 'otro_documento', momento: '2026-11-03T15:00:00Z', cedula: '79999999' },
      fotos_rechazadas: { fotos: [{ tipo: 'cedula_frente', motivo: 'muy_grande' }, { tipo: 'selfie', motivo: 'muy_grande' }], momento: '2026-11-03T15:00:00Z' } };
    const r = P.ev('huellaParaFicha(__h)');
    assert.equal(r.lectura_llego, true);
    assert.deepEqual(JSON.parse(JSON.stringify(r.cedula_rechazada)), { motivo: 'otro_documento' });
    assert.deepEqual(JSON.parse(JSON.stringify(r.fotos_rechazadas)), { fotos: [{ tipo: 'cedula_frente', motivo: 'muy_grande' }] });
    assert.doesNotMatch(JSON.stringify(r), /LUIS|80000000|1990|79999999/, 'lo leído no se copia a la ficha');
    assert.deepEqual(Object.keys(P.ev('huellaParaFicha({ip:"1",aparato:"a",momento:"m"})')).sort(), ['aparato', 'ip', 'momento'], 'sin nada de eso, la de siempre');
  });

  test('de quien le llegó la lectura (después de un primer toque sin permiso) la ficha no dice «No llegó lectura»', () => {
    const t = verFicha(ficha({ fotos_tomadas: 'sin_permiso' }, { huellaRegistro: Object.assign({}, HUELLA, { lectura_llego: true }),
      cedulaFrenteFoto: 'foto:reg:' + CEL + '/cedula_frente', cedulaReversoFoto: 'foto:reg:' + CEL + '/cedula_reverso', selfieFoto: 'foto:reg:' + CEL + '/selfie' }));
    assert.doesNotMatch(t, /No llegó lectura/, 'le llegó, y la ficha decía lo contrario');
    assert.match(t, /Llegó a la nube la lectura del código de barras de su cédula/);
  });

  test('la cédula que la base rechazó sigue diciéndose en la ficha', () => {
    const P = ficha({ fotos_tomadas: 'cedula_reverso,cedula_frente,selfie', cedula_leida_con: 'codigo' },
      { huellaRegistro: Object.assign({}, HUELLA, { cedula_rechazada: { motivo: 'otro_documento' } }), selfieFoto: 'foto:reg:' + CEL + '/selfie' });
    const t = verFicha(P);
    assert.doesNotMatch(t, /Su teléfono (dijo que )?la leyó por el código de barras/, 'la frase más tranquila, justo de la cédula de otro');
    assert.match(t, /No llegó lectura: la nube no guardó la cédula de sus fotos \(no es la del documento de su registro\)/);
    assert.match(t, /La nube no guardó la cédula de sus fotos: no es la del documento de su registro/);
    assert.doesNotMatch(t, /dijo que las tomó, y aquí no están/);
  });

  test('una ficha de antes sigue diciendo que no se sabe', () => {
    assert.match(verFicha(ficha(null)), LECTURA_VIEJA);
  });

  test('sin ninguna foto, la ficha lo dice y trae el botón', () => {
    const P = ficha({ fotos_tomadas: 'ninguna' });
    const t = verFicha(P);
    assert.match(t, /Fotos de verificación/);
    assert.match(t, /Al registrarse, su teléfono no tenía las fotos de la cédula/);
    assert.match(P.elems.mBody.innerHTML, /pedirFotosDeLaFicha\('s1','los_dos'\)[^>]*>💬 Pedirle las fotos por el chat/);
    /* Sin permiso, también, con su propia frase. */
    assert.match(verFicha(ficha({ fotos_tomadas: 'sin_permiso' })), /Se registró sin el permiso de las fotos/);
    /* «Las tomó» sin fecha no puede decir «todavía no llegan» para siempre. */
    const tomo = verFicha(ficha({ fotos_tomadas: 'cedula_reverso,cedula_frente' }));
    assert.match(tomo, /Su teléfono dijo que las tomó, y aquí no están/);
    assert.doesNotMatch(tomo, /todavía no llegan/);
  });

  test('con el rostro y sin la cédula, además de faltar dice por qué', () => {
    const P = ficha({ fotos_tomadas: 'selfie' }, { selfieFoto: CARA });
    const t = verFicha(P);
    assert.match(t, /Falta la cédula/);
    assert.match(t, /Al registrarse, su teléfono no tenía las fotos de la cédula/);
    assert.match(P.elems.mBody.innerHTML, /pedirFotosDeLaFicha\('s1','los_dos'\)/);
  });

  test('una ficha hecha a mano, sin registro, no le pide nada a nadie', () => {
    const P = ficha(null, { huellaRegistro: null });
    assert.doesNotMatch(P.elems.mBody.innerHTML, /Fotos de verificación|pedirFotosDeLaFicha/);
  });

  test('el botón abre el chat de la ficha con el mensaje escrito, y no lo manda', async () => {
    const real = globalThis.fetch, urls = [];
    globalThis.fetch = u => { urls.push(String(u)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') }); };
    try {
      const P = ficha({ fotos_tomadas: 'ninguna' });
      P.ev("pedirFotosDeLaFicha('s1','los_dos')");
      await asentar();
      assert.match(P.ev("document.getElementById('chResp').value"), /nos faltan las fotos de tu cédula por los dos lados/);
      assert.equal(urls.filter(u => /chat_responder/.test(u)).length, 0, 'se mandó solo');
    } finally { globalThis.fetch = real; }
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
    assert.match(crmHtml, /avisoLadoQueFalta\(!!s\.cedulaFrenteFoto,!!s\.cedulaReversoFoto,colaFicha,!!s\.selfieFoto,esPasaporte\(s\.vinculacion\)\)/);
    assert.match(crmHtml, /avisoLadoQueFalta\(!!f\.cedula_frente, !!f\.cedula_reverso, 'Pídesela antes de desembolsar\.', !!f\.selfie, esPasaporte\(d\)\)/);
  });
});
