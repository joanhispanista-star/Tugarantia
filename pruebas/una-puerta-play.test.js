/* ===========================================================================
 * LA PUERTA ÚNICA, EN play/ — 7-oct-2026 (RECETA-UNA-PUERTA-PLAY.md)
 *
 * Joan: «¿Por qué cada cliente necesita un código? Eso ya no debería existir.»
 * Desde base/20261007_una_puerta.sql la sesión ya no puede llamar a
 * vincular_cuenta (401/403), y la caja de Perfil que la llamaba lo habría
 * traducido con causaDe() a «Tu sesión se venció»: la pantalla mintiendo sobre
 * la causa. Por eso se quitó la caja y su función, no solo el texto.
 *
 * Estas pruebas abren play/ DE VERDAD (pruebas/banco-play.js) y miran lo que
 * pinta, no dónde parte una línea de JavaScript: una frase reacomodada no las
 * rompe; una promesa de código que vuelva, sí.
 * ========================================================================= */
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPlay } = require('./banco-play.js');

const PROMESA = 'Si ya eras cliente, no tienes que hacer nada: revisamos que seas tú y juntamos tu ' +
  'historial con esta cuenta. Te avisamos por el chat cuando esté.';

describe('la puerta única en play/ (7-oct-2026)', () => {

  test('la página carga entera y ya no declara la caja del código', () => {
    const P = abrirPlay({});
    assert.deepEqual(P.fallos, [], 'play/ no cargó: ' + P.fallos.map(String).join(' | '));
    /* Si una de las dos volviera, volvería con ella la llamada a la función
       que la nube cerró. */
    assert.equal(P.ev('typeof tarjetaVincular'), 'undefined');
    assert.equal(P.ev('typeof vincularHistorial'), 'undefined');
    assert.equal(P.ev('typeof tarjetaTuHistorial'), 'function');
  });

  test('la fachada le dice al antiguo que abra su cuenta igual, sin ningún código', () => {
    const P = abrirPlay({});
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /<b>¿Ya eras cliente nuestro\?<\/b> Ábrela igual: lo revisamos y juntamos tu historial con tu cuenta\. No necesitas ningún código\./);
    assert.ok(!/pegas el código|el código que te dimos/.test(h), 'la fachada volvió a mandar a pegar un código');
  });

  test('Perfil, con la cuenta SIN juntar: no hay caja, y se dice que no tiene que hacer nada', () => {
    const P = abrirPlay({});
    P.ev('FICHA = null; FICHA_ESTADO = "nueva";');
    const h = P.ev('laminaPerfil()');
    assert.ok(h.indexOf(PROMESA) >= 0, 'Perfil no le dice al antiguo qué pasa con su historial');
    assert.ok(!/id="vIdent"|id="vCodigo"|vincularHistorial\(\)/.test(h), 'volvió la caja de pegar el código');
    assert.ok(!/c(o|ó)digo/i.test(h), 'Perfil le habla de un código');
    /* Y el aviso de las otras láminas dice lo mismo. */
    const a = P.ev('avisoFicha()');
    assert.ok(a.indexOf('Si ya eras cliente, no tienes que hacer nada: revisamos que seas tú y juntamos tu historial') >= 0);
    assert.ok(!/Perfil|c(o|ó)digo/.test(a), 'el aviso de la ficha nueva volvió a mandar a Perfil a pegar un código');
  });

  test('Perfil NO promete nada cuando no se sabe si la cuenta está junta', () => {
    /* «No tienes que hacer nada» solo es cierto si la nube contestó que esta
       cuenta no está junta. Con la ficha cargando, la nube apagada o una falla,
       decirlo podría ser falso para quien ya está junto. */
    const P = abrirPlay({});
    ['sin', 'cargando', 'apagada', 'falla'].forEach(e => {
      P.ev('FICHA = null; FICHA_ESTADO = "' + e + '";');
      assert.equal(P.ev('tarjetaTuHistorial()'), '', 'en «' + e + '» la tarjeta promete algo que no se sabe');
    });
    P.ev('FICHA = { nombre: "Ana Pérez" }; FICHA_ESTADO = "vinculada";');
    assert.match(P.ev('tarjetaTuHistorial()'), /Ya está junto con esta cuenta, Ana Pérez\./);
  });

  test('la solicitud aceptada dice por dónde se entera, y no promete un código', () => {
    const P = abrirPlay({});
    const sol = { estado: 'aceptada', contrapropuesta: { capital: 100000, costo: 35000, total: 135000,
                  fecha_pago: '2026-10-15', dias: 8 } };
    const h = P.ev('tarjetaContrapropuesta(' + JSON.stringify(sol) + ')');
    assert.match(h, /<b>Listo: aceptaste \$100\.000\.<\/b> Te avisamos <b>en el chat de la app<\/b> cuándo y por dónde recibes la plata\. No tienes que hacer nada más por ahora\./);
    assert.ok(!/c(o|ó)digo/i.test(h), 'la solicitud aceptada volvió a prometer «tu código de acceso»');
  });

  test('«Olvidé mi contraseña» ya no promete un código: lo que llega es una contraseña nueva', () => {
    /* Lo que hace Joan con el recado es «🔑 Darle una clave nueva» desde el CRM. */
    const P = abrirPlay({});
    const h = P.ev('pasoEntrada()');
    assert.match(h, /Tiene que tener WhatsApp: si olvidas la contraseña, por ahí te mandamos una nueva\./);
    assert.ok(!/c(o|ó)digo/i.test(h), 'el paso del celular volvió a prometer un código');
  });
});

/* ===========================================================================
 * LA REVISIÓN DE play/ — 7-oct-2026 (tercera vuelta)
 *
 * Una revisión de solo lectura recorrió play/ con la receta ya aplicada y
 * encontró pantallas que nombraban cosas que no estaban, o prometían lo que la
 * nube ya había contestado que no. Cada prueba de aquí falló ANTES del arreglo.
 * ========================================================================= */
const { asentar } = require('./esperar.js');
const fs = require('node:fs');
const path = require('node:path');

describe('la revisión de play/ (7-oct-2026, tercera vuelta)', () => {

  /* El paso 9 del registro con todo lleno, igual que «la prueba con Sofía»
     (escaner-cedula.test.js): la bandeja contesta bien, el signup dice «ya
     existe» y el login hace lo que diga `login` ('mal' | 'sin_red'). */
  function enElPaso9(P) {
    P.ev('pintarRegistro(0)');
    P.ev("$('rTel').value='3001112233'; $('rClave').value='Perro.2026x'; $('rClave2').value='Perro.2026x';");
    P.ev('siguientePaso()');
    P.ev("REGISTRO = Object.assign(REGISTRO, { nombres:'Ana', apellidos:'Ruiz', tipo_doc:'Cédula de ciudadanía', documento:'123456', expedicion:'2010-01-01', celular:'3001112233', ciudad:'Bogotá', barrio:'Centro', direccion:'Calle 1', tipo_vivienda:'Arriendo', anos_direccion:'Más de 5 años', ocupacion:'Empleado', ingreso_mes:'2000000', gastos_mes:'800000', dia_pago:'Quincenal (15 y 30)', ref1_nombre:'Luz', ref1_parentesco:'Hermana', ref1_celular:'3002223344', ref2_nombre:'Juan', ref2_parentesco:'Amigo', ref2_celular:'3004445566' }); guardarBorrador(REGISTRO);");
    P.ev('pintarRegistro(8)');
    P.ev("$('autGeneral').checked = true; $('autSensible').checked = true;");
  }
  function yaTeniaCuenta(P, login) {
    P.ev("fetch = function (u) { u = String(u);" +
         " if (u.indexOf('registrar_abierto') >= 0) return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true }); } });" +
         " if (u.indexOf('/auth/v1/signup') >= 0) return Promise.resolve({ ok: false, json: function () { return Promise.resolve({ msg: 'User already registered' }); } });" +
         " if (u.indexOf('grant_type=password') >= 0) return " + (login === 'sin_red'
           ? "Promise.reject(new Error('sin red'));"
           : "Promise.resolve({ ok: false, json: function () { return Promise.resolve({ error: 'invalid_grant' }); } });") +
         " return Promise.reject(new Error('no esperada: ' + u)); };");
  }
  /* Lo que de verdad se puede tocar en la caja: cada onclick tiene que ser una
     función que exista en la página. */
  const clics = h => [...h.matchAll(/onclick="([^"]+)"/g)].map(m => m[1]);

  test('YA TENÍA CUENTA Y LA CONTRASEÑA NO ES: la caja trae las salidas que nombra', () => {
    /* Decía «Entra con la tuya aquí abajo, o toca «Olvidé mi contraseña»» en el
       paso 9 del registro, donde no hay ni caja de entrar ni ese botón: las
       únicas salidas eran «Abrir mi cuenta» (que falla igual) o «Volver» paso
       por paso. Y desde el 7-oct al antiguo se le dice «Ábrela igual», así que
       llega aquí más seguido. */
    const P = abrirPlay({ hash: '' });
    enElPaso9(P); yaTeniaCuenta(P, 'mal');
    P.ev('siguientePaso()');
    return asentar().then(() => {
      const caja = P.ev("$('errReg').innerHTML");
      assert.match(P.ev("$('errReg').textContent"), /Ya tienes una cuenta con este celular, pero esa contraseña no es la suya/);
      const c = clics(caja);
      assert.ok(c.indexOf('entrarConElCelularDelRegistro()') >= 0, 'la caja no trae el botón de entrar: ' + caja);
      assert.ok(c.some(x => /^olvide\(/.test(x)), 'la caja nombra «Olvidé mi contraseña» y no trae el botón');
      c.forEach(x => assert.equal(P.ev('typeof ' + x.slice(0, x.indexOf('('))), 'function', x + ' no existe'));

      /* «Entrar con mi contraseña»: la portada con su celular ya puesto, y ahí
         sí están la caja de la contraseña y «Olvidé mi contraseña». */
      P.ev('entrarConElCelularDelRegistro()');
      assert.equal(P.ev('VISTA'), 'entrar');
      assert.equal(P.elems.inTel.value, '300 111 2233', 'no le dejó el celular puesto');
      const portada = P.elems.cuerpo.innerHTML;
      assert.match(portada, /id="inClave"/);
      assert.match(portada, /onclick="olvide\(\)">Olvidé mi contraseña</);
      assert.match(P.elems.errEntrar.textContent, /Ya tienes una cuenta con este celular/);

      /* «Olvidé mi contraseña» desde la caja: el recado con su celular puesto. */
      P.ev(c.find(x => /^olvide\(/.test(x)));
      assert.equal(P.ev('VISTA'), 'ayuda');
      assert.match(P.elems.cuerpo.innerHTML, /id="ayTel"[^>]*value="300 111 2233"/, 'el recado no trae su celular');
    });
  });

  test('…y si no hubo red para entrar, tampoco manda a una caja que no está', () => {
    const P = abrirPlay({ hash: '' });
    enElPaso9(P); yaTeniaCuenta(P, 'sin_red');
    P.ev('siguientePaso()');
    return asentar().then(() => {
      const caja = P.ev("$('errReg').innerHTML");
      assert.match(P.ev("$('errReg').textContent"), /Revisa tu internet/);
      assert.ok(clics(caja).indexOf('entrarConElCelularDelRegistro()') >= 0, 'nombra una entrada que no está en la pantalla');
    });
  });

  test('…y en PlataChat la salida es la entrada de PlataChat, no la portada de Tu Garantía', () => {
    const P = abrirPlay({ search: '?marca=platachat', hash: '' });
    assert.equal(P.ev('MARCA'), 'platachat');
    enElPaso9(P); yaTeniaCuenta(P, 'mal');
    P.ev('siguientePaso()');
    return asentar().then(() => {
      const c = clics(P.ev("$('errReg').innerHTML"));
      assert.deepEqual(c, ['volverAPlataChat()'], 'la caja de PlataChat lleva a otro lado: ' + c.join(', '));
      assert.match(P.ev("$('errReg').textContent"), /Entra en PlataChat con la tuya/);
    });
  });

  test('«HOY TIENES $0» no se le dice a una cuenta sin juntar: puede ser un cliente de años', () => {
    /* Desde el 7-oct todo cliente antiguo queda en 'nueva' hasta que Joan junta
       su cuenta, y tiene garantía de verdad. El aviso de arriba le dice «no
       tienes que hacer nada»; esta línea le decía «hoy tienes $0». */
    const P = abrirPlay({});
    P.ev('FICHA = null; FICHA_ESTADO = "nueva";');
    const h = P.ev('techoDeGarantia()');
    assert.ok(h.indexOf('$0') < 0, 'a la cuenta sin juntar le afirma un saldo de cero: ' + h);
    assert.match(h, /Empieza por un crédito normal/);
    /* La que sí está junta y de verdad tiene cero, sigue oyendo su cero. */
    P.ev('FICHA = { maxRespaldado: 0 }; FICHA_ESTADO = "vinculada";');
    assert.match(P.ev('techoDeGarantia()'), /Hoy tienes <b>\$0<\/b>/);
  });

  test('«Tu cuenta quedó abierta» no le ofrece al antiguo la propuesta de nuevo sin avisarle', () => {
    const P = abrirPlay({});
    P.ev('pintarRegistrado()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /pedirPrimerCredito\(\)/, 'el nuevo tiene que poder pedir de una');
    assert.match(h, /<b>¿Ya eras cliente nuestro\?<\/b> Esta propuesta es la de cliente nuevo: mejor espera a que juntemos tu historial con esta cuenta\. Te avisamos por el chat cuando esté\./);
  });

  test('con sesión, el crédito con garantía no le dice «Abre tu cuenta» a quien ya la abrió', () => {
    const P = abrirPlay({});
    P.ev('garantiaSePuedeCotizar = function () { return false; };');
    /* El visitante sí: no tiene cuenta. */
    assert.match(P.ev('tarjetaCalcGarantia()'), /Abre tu cuenta y lo resolvemos/);
    P.ev('SESION = { access_token: "tok" };');
    const t = P.ev('tarjetaCalcGarantia()') + P.ev('cifrasDeGarantia()');
    assert.ok(!/abre tu cuenta/i.test(t), 'a quien ya tiene cuenta le dice que la abra: ' + t);
    assert.match(t, /Escríbenos por el chat de <b>Créditos nuevos<\/b>/);
  });

  /* mi_registro (base/20261007_una_puerta.sql, §8-bis) existe para que la
     pantalla de la cuenta sin juntar no diga lo mismo pase lo que pase. */
  function cuentaSinJuntar(miRegistro) {
    const P = abrirPlay({});
    P.ev('window.__llamadas = []; window.__resp = ' + JSON.stringify({
      mi_cuenta: { ok: true, vinculada: false }, mi_registro: miRegistro }) + ';');
    P.ev("fetch = function (u) { var fn = (/rpc\\/([a-z_0-9]+)/.exec(String(u)) || [])[1]; window.__llamadas.push(fn);" +
         " var r = window.__resp[fn];" +
         " if (r === undefined || r.__estado) return Promise.resolve({ ok: false, status: (r && r.__estado) || 404, json: function () { return Promise.resolve({}); } });" +
         " return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };");
    P.ev('SESION = { access_token: "tok", user: { email: "573001112233@tugarantia.net", user_metadata: { perfil: "nuevo" } } };');
    P.ev('pintarCuenta()');
    return asentar().then(() => P);
  }
  const PROMETE = /revisamos que seas tú y juntamos tu historial/;

  test('REGISTRO DESCARTADO: no le promete juntar lo que ya se revisó y no se abrió', () => cuentaSinJuntar(
    { ok: true, registro: { estado: 'descartado', creado_en: '2026-10-07T12:00:00Z' } }).then(P => {
    assert.equal(P.ev('FICHA_ESTADO'), 'nueva');
    assert.equal(P.ev('window.__llamadas.filter(function (f) { return f === "mi_registro"; }).length'), 1,
      'mi_registro se pregunta una vez por apertura');
    const aviso = P.ev('avisoFicha()'), perfil = P.ev('tarjetaTuHistorial()');
    [aviso, perfil].forEach(h => {
      assert.ok(!PROMETE.test(h), 'promete juntar un registro descartado: ' + h);
      assert.match(h, /Revisamos tu registro y por ahora no pudimos abrirte la cuenta con nosotros\. Si quieres saber por qué, escríbenos por el chat de servicio al cliente\./);
    });
    assert.match(P.elems.lamina.innerHTML, /no pudimos abrirte la cuenta/, 'la lámina abierta no se repintó con lo que contestó la nube');
  }));

  test('SIN REGISTRO junto con la cuenta: no promete revisar algo que Joan no tiene en su bandeja', () => cuentaSinJuntar(
    { ok: true, registro: null }).then(P => {
    const aviso = P.ev('avisoFicha()'), perfil = P.ev('tarjetaTuHistorial()');
    [aviso, perfil].forEach(h => {
      assert.ok(!PROMETE.test(h), 'promete revisar un registro que no hay: ' + h);
      assert.match(h, /No encontramos un registro hecho junto con esta cuenta\. Si te registraste antes, en otro intento, escríbenos por el chat de servicio al cliente y lo buscamos contigo\./);
    });
  }));

  test('registro nuevo o atendido, o sin poder preguntar: se queda la promesa de siempre', () => Promise.all([
    { ok: true, registro: { estado: 'nuevo' } },
    { ok: true, registro: { estado: 'atendido' } },
    { __estado: 404 },                       // la migración sin correr
    { ok: true }                             // una respuesta que no dice nada del registro
  ].map(r => cuentaSinJuntar(r).then(P => {
    assert.match(P.ev('avisoFicha()'), PROMETE, 'con ' + JSON.stringify(r) + ' dejó de decir lo de siempre');
    assert.match(P.ev('tarjetaTuHistorial()'), PROMETE);
  }))));

  test('la cabecera de base/20261007_una_puerta.sql ya no dice que play/ muestra «pega el código»', () => {
    const SQL = fs.readFileSync(path.join(__dirname, '..', 'base', '20261007_una_puerta.sql'), 'utf8');
    assert.ok(!/todavía muestran «pega el código»/.test(SQL), 'la cabecera describe una pantalla que ya no existe');
    assert.match(SQL, /RECETA-UNA-PUERTA-PLAY\.md ya se aplicó/);
  });
});
