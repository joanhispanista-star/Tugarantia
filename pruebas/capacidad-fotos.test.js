/* ===========================================================================
 * CIEN CLIENTES CON CÉDULA Y TODO — la prueba de que ya caben.
 *
 * Joan lo pidió el 15-sep-2026 así: «quiero que la nube tenga mas capacidad de
 * memoria para capacidad de mas de 100 clientes con cedula y todo».
 *
 * LA MEDIDA, sobre su respaldo real del 28-ago-2026: un cliente con su ficha y
 * sus 2,7 créditos pesa 1.904 caracteres. Sus tres fotos de cédula, 300.069. La
 * cartera no es lo que llena el navegador — son las fotos, por un factor de
 * ciento cincuenta. Con el cajón de 5 MB caben DIECISIETE clientes.
 *
 * Y esas fotos YA ESTABAN EN LA NUBE: el cliente las sube al registrarse. El
 * CRM se hacía una SEGUNDA copia dentro del navegador. Todo este trabajo es
 * dejar de hacer la segunda copia.
 *
 * Estas pruebas EJECUTAN el CRM contra una nube de mentira. Ninguna lee texto,
 * salvo la última, que lo dice.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const M = require('../app/motor.js');
const PUENTE = require('../app/puente.js');

/* Una foto de verdad pesa unos 100.000 caracteres. Acá se usa una corta con una
   marca reconocible: lo que se mide es si la copia OCURRE, no su tamaño. */
const FOTO_FRENTE  = 'data:image/jpeg;base64,ESTA-ES-LA-CEDULA-POR-DELANTE';
const FOTO_REVERSO = 'data:image/jpeg;base64,ESTA-ES-LA-CEDULA-POR-DETRAS';
const FOTO_SELFIE  = 'data:image/jpeg;base64,ESTE-ES-EL-ROSTRO';

/* Una nube de mentira que contesta lo que le digamos, y que anota qué le
   preguntaron: hace falta para probar que el token guarda EXACTAMENTE el
   identificador con el que se preguntó. */
function nubeCon(fotos, opciones) {
  const o = opciones || {};
  const pedidos = [];
  const red = (url, cfg) => {
    const cuerpo = JSON.parse((cfg && cfg.body) || '{}');
    if (String(url).includes('archivos_de_registro')) {
      pedidos.push(cuerpo.p_celular);
      if (o.falla) return Promise.reject(new Error('sin señal'));
      return Promise.resolve({ ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({ fotos: fotos || {} })) });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
  };
  return { red, pedidos };
}

function panelConectado(fotos, opciones) {
  const n = nubeCon(fotos, opciones);
  const P = abrirPanel({ red: n.red });
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"1234"}))');
  P.pedidos = n.pedidos;
  return P;
}

describe('cien clientes con cédula (15-sep-2026)', () => {

  test('LA CUENTA: un cliente con tokens pesa menos de la centésima parte', () => {
    /* Es el número por el que existe todo lo demás, y se mide, no se estima. */
    const conFoto = { id: 'C1', nombre: 'Ana', cedula: '52000000', telefono: '3001234567',
      cedulaFrenteFoto: 'data:image/jpeg;base64,' + 'A'.repeat(100000),
      cedulaReversoFoto: 'data:image/jpeg;base64,' + 'B'.repeat(100000),
      selfieFoto: 'data:image/jpeg;base64,' + 'C'.repeat(100000) };
    const conToken = Object.assign({}, conFoto, {
      cedulaFrenteFoto: 'foto:reg:3001234567/cedula_frente',
      cedulaReversoFoto: 'foto:reg:3001234567/cedula_reverso',
      selfieFoto: 'foto:reg:3001234567/selfie' });

    const antes = JSON.stringify(conFoto).length;
    const despues = JSON.stringify(conToken).length;
    const CAJON = 5 * 1024 * 1024;

    assert.ok(antes / despues > 100,
      'el token tenía que pesar menos de la centésima parte y pesa ' + (antes / despues).toFixed(0) + ' veces menos');
    assert.ok(Math.floor(CAJON / antes) < 20,
      'con fotos copiadas cabían menos de 20 clientes; esta prueba ya no mide el problema');
    assert.ok(Math.floor(CAJON / despues) > 1000,
      'con tokens tienen que caber más de mil clientes y caben ' + Math.floor(CAJON / despues));
  });

  test('EL CUPO NO SE MUEVE: un token vale lo mismo que la foto entera', () => {
    /* La razón por la que el campo conserva su nombre. motor.js da 10.000 +
       10.000 + 18.000 por las tres fotos y lo único que mira es `hayDato`.
       Moverlas a un campo nuevo —que es lo natural— le habría borrado 38.000
       pesos de cupo a CADA cliente, sin un solo error en pantalla.
       MUTANTE QUE CAZA: cambiar tokenReg para que escriba en s.fotos[] o en
       cualquier campo que no sea el que lee puente.js. */
    const base = v => ({ id: 'C1', nombre: 'Ana', cedula: '1', telefono: '3001234567',
      cedulaFrenteFoto: v, cedulaReversoFoto: v, selfieFoto: v });
    const conFoto  = M.garantiaPorDatos(PUENTE.datosKycDe(base('data:image/jpeg;base64,' + 'A'.repeat(100000))));
    const conToken = M.garantiaPorDatos(PUENTE.datosKycDe(base('foto:reg:3001234567/cedula_frente')));
    const sinNada  = M.garantiaPorDatos(PUENTE.datosKycDe(base(null)));

    assert.equal(conToken.total, conFoto.total,
      'el token da un cupo distinto al de la foto: se le mueve la plata a Joan sin avisar');
    assert.equal(conFoto.total - sinNada.total, 38000,
      'las tres fotos ya no valen 38.000 de garantía; hay que revisar esta prueba contra motor.js');
  });

  /* ------------------------------------------------- el CRM, ejecutado */

  test('cruzar un registro anota el TOKEN, nunca la foto', () => {
    const P = panelConectado({ cedula_frente: FOTO_FRENTE, cedula_reverso: FOTO_REVERSO, selfie: FOTO_SELFIE });
    P.cargarCartera({ socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567', gestiones: [] }], prestamos: [] });
    P.ev('_registros=[{id:9,nombre:"Ana",cedula:"52000000",telefono:"3001234567",datos:{},huella:null}]');
    P.ev('aplicarCruce(9,"C1")');

    return esperar().then(() => {
      const cartera = JSON.parse(P.almacen['joan_socios_v1']);
      const s = cartera.socios[0];
      assert.equal(s.cedulaFrenteFoto, 'foto:reg:3001234567/cedula_frente',
        'no se anotó el token de la cédula');
      assert.equal(s.selfieFoto, 'foto:reg:3001234567/selfie');
      assert.ok(!JSON.stringify(cartera).includes('ESTA-ES-LA-CEDULA'),
        'la foto se copió a la cartera: el cajón se vuelve a llenar y volvemos a los 17 clientes');
      assert.equal(P.pedidos[0], '3001234567',
        'se le preguntó a la nube por un identificador distinto del que guarda el token');
    });
  });

  test('si la nube falla, el registro NO se marca atendido', () => {
    /* archivosDe nunca lanza: devuelve {fotos:{}} con un `fallo` adentro. Por eso
       un corte de señal entraba por el mismo camino del éxito, el registro se
       marcaba atendido, desaparecía de la bandeja, y las fotos no quedaban en
       ninguna parte. Joan no tenía cómo enterarse.
       MUTANTE QUE CAZA: devolver marcarRegistro fuera del `if(a.fallo)`. */
    const P = panelConectado({}, { falla: true });
    P.cargarCartera({ socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '52000000', telefono: '3001234567', gestiones: [] }], prestamos: [] });
    P.ev('window.__marcados=[]; marcarRegistro=function(id,e){ window.__marcados.push(id+":"+e); };');
    P.ev('_registros=[{id:9,nombre:"Ana",cedula:"52000000",telefono:"3001234567",datos:{},huella:null}]');
    P.ev('aplicarCruce(9,"C1")');

    return esperar().then(() => {
      /* Se pide ya unido en un texto: lo que vuelve del contexto de la página es
         un Array de OTRO realm y deepStrictEqual lo rechaza por el prototipo
         aunque el contenido sea idéntico. El repo ya pagó esa media hora. */
      assert.equal(P.ev('window.__marcados.join("|")'), '',
        'la nube falló y el registro se marcó atendido igual: desapareció de la bandeja sin sus fotos');
      const avisos = P.ev('(window._avisos||[]).join(" | ")');
      assert.match(avisos, /NO pude traer las fotos/,
        'no se le dijo a Joan que las fotos no llegaron');
      assert.match(avisos, /sigue en la bandeja/,
        'no se le dijo que puede volver a intentarlo');
    });
  });

  test('abrir una ficha y luego otra NO le pega la cédula de la primera a la segunda', () => {
    /* La carrera estaba abierta desde siempre: el `.then` escribía en la variable
       GLOBAL _fotosTmp sin preguntar si seguía abierta la misma ficha.
       MUTANTE QUE CAZA: quitar la guardia `if(pedido!==_pedidoFotos) return`. */
    let soltar;
    const enEspera = new Promise(res => { soltar = res; });
    const P = abrirPanel({ red: (url) => {
      if (String(url).includes('archivos_de_registro')) {
        return enEspera.then(() => ({ ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify({ fotos: { selfie: FOTO_SELFIE } })) }));
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    } });
    P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"l",clave:"1"}))');
    P.cargarCartera({ socios: [], prestamos: [] });
    P.ev('_registros=[{id:1,nombre:"Ana",cedula:"1",telefono:"3001111111",datos:{},huella:null}]');

    P.ev('fichaDesdeRegistro(1)');      // Joan abre la de Ana…
    P.ev('editarCliente(null,{})');     // …se arrepiente y abre otra ficha
    soltar();                            // y AHORA contesta la nube de Ana

    return esperar().then(() => {
      assert.equal(P.ev('_fotosTmp.selfie'), null,
        'la respuesta de la ficha anterior escribió en la ficha nueva: la cédula de ' +
        'una persona termina en el expediente de otra');
    });
  });

  test('la ficha pinta data-foto, no src: un token nunca llega a una etiqueta de imagen', () => {
    /* Si un token se escapara a un `src`, el navegador pediría «foto:reg:…» y
       saldría una imagen rota. Se eligió ese prefijo justamente para que el
       fallo se VEA. Pero lo correcto es que no se escape. */
    const P = panelConectado({ cedula_frente: FOTO_FRENTE, selfie: FOTO_SELFIE });
    P.cargarCartera({ socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001234567',
      gestiones: [], cedulaFrenteFoto: 'foto:reg:3001234567/cedula_frente',
      selfieFoto: 'foto:reg:3001234567/selfie' }], prestamos: [] });
    P.ev('verCliente("C1")');
    const pintado = P.ev('document.getElementById("mBody").innerHTML');
    assert.ok(pintado.includes('data-foto="foto:reg:3001234567/cedula_frente"'),
      'la galería no marcó la foto para que la resuelva quien sabe traerla');
    assert.ok(!/src="foto:/.test(pintado), 'un token se escapó a un src');
    assert.ok(!/href="foto:/.test(pintado),
      'un token se escapó a un href: la miniatura se vería y tocarla para leer la cédula abriría la nada');
  });

  test('guardarCliente SIGUE escribiendo la foto de la cámara de Joan', () => {
    /* La corrección más importante del plan. Esta línea es el ÚNICO sitio del
       archivo donde una foto tomada con la cámara llega al disco. Quitarla en
       esta etapa —que es lo que pedían dos de los tres diseños— haría que cada
       cédula que Joan fotografíe se tire a la basura mientras la caja dice
       «Listo · cambiar».
       MUTANTE QUE CAZA: borrar cedulaFrenteFoto:_fotosTmp.frente de guardarCliente. */
    const P = abrirPanel();
    P.cargarCartera({ socios: [], prestamos: [] });
    P.ev('editarCliente(null,{})');
    P.ev('document.getElementById("fNombre").value="Pedro"');
    P.ev('_fotosTmp={frente:"data:image/jpeg;base64,LA-QUE-TOMO-JOAN",reverso:null,selfie:null}');
    P.ev('guardarCliente("")');
    const s = JSON.parse(P.almacen['joan_socios_v1']).socios[0];
    assert.equal(s.cedulaFrenteFoto, 'data:image/jpeg;base64,LA-QUE-TOMO-JOAN',
      'la foto que Joan tomó con su cámara no llegó al disco');
  });

  test('una foto que el cliente NO subió no se anota como si existiera', () => {
    /* Quien ejerció su derecho a no dar la cédula (play/index.html) no puede
       aparecer con cupo por una foto que no existe: son 38.000 pesos de
       garantía por cliente, regalados contra un dato que nadie tiene.
       MUTANTE QUE CAZA: escribir los tres tokens a ciegas sin mirar `f`. */
    const P = panelConectado({ selfie: FOTO_SELFIE });   // solo la selfie
    P.cargarCartera({ socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001234567', gestiones: [] }], prestamos: [] });
    P.ev('_registros=[{id:9,nombre:"Ana",cedula:"1",telefono:"3001234567",datos:{},huella:null}]');
    P.ev('aplicarCruce(9,"C1")');
    return esperar().then(() => {
      const s = JSON.parse(P.almacen['joan_socios_v1']).socios[0];
      assert.equal(s.selfieFoto, 'foto:reg:3001234567/selfie');
      assert.ok(!s.cedulaFrenteFoto,
        'se anotó un token de una cédula que la persona nunca subió, y eso le suma cupo');
    });
  });

  /* --------------------------------------------------------------------------
   * EL RESOLVEDOR, PROBADO POR SU DECISION Y NO POR SU PINTURA.
   *
   * El banco no tiene un DOM que parsee innerHTML: su `querySelectorAll`
   * devuelve vacío, así que el resolvedor NO se ejecuta por el camino de
   * verCliente. Se le entrega entonces un nodo de mentira con las imágenes ya
   * hechas — que es lo que el navegador le daría — y se mira QUÉ decide.
   * La pintura de verdad se comprobó abriendo el CRM en un navegador; así fue
   * como salió el fallo que esta prueba vigila.
   * ------------------------------------------------------------------------ */
  function nodoCon(tokens) {
    const nodos = tokens.map(t => ({
      tagName: 'IMG', alt: '', src: null, parentElement: null,
      atributos: { 'data-foto': t },
      classList: { add() {} },
      getAttribute(k) { return this.atributos[k] === undefined ? null : this.atributos[k]; },
      setAttribute(k, v) { this.atributos[k] = v; },
      removeAttribute(k) { delete this.atributos[k]; }
    }));
    return { nodos, querySelectorAll: () => nodos };
  }

  test('SIN NUBE CONECTADA no se afirma que la foto no existe', () => {
    /* Encontrado abriendo el CRM en un navegador de verdad, no leyendo el
       código: sin conexión configurada, archivosDe devuelve {fotos:{}} igual que
       cuando la persona no subió nada, y la ficha decía «esta foto no está en la
       nube» sobre tres fotos que sí están. Es el tercer caso del mismo patrón
       que este proyecto ya documentó dos veces: un fallo tragado no es
       silencioso, es un fallo que MIENTE.
       MUTANTE QUE CAZA: quitar la reja de sbListo() del resolvedor. */
    const P = abrirPanel();                       // <- a propósito SIN conectar
    const caja = nodoCon(['foto:reg:3001234567/selfie']);
    P.ctx.__caja = caja;
    return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => {
      const alt = String(caja.nodos[0].alt || '');
      assert.match(alt, /Conectala en Ajustes/i,
        'sin nube conectada la ficha afirmó algo que no puede saber: «' + alt + '»');
      assert.doesNotMatch(alt, /no esta en la nube/i,
        'se le dice a Joan que la foto no existe cuando lo que pasa es que no hay conexión');
    });
  });

  test('CON nube y sin esa foto, ahí sí se dice que no está', () => {
    /* La otra mitad: si se arregla lo de arriba diciendo siempre «conéctala»,
       esta se pone roja. Las dos juntas obligan a distinguir. */
    const P = panelConectado({ cedula_frente: FOTO_FRENTE });   // no hay selfie
    const caja = nodoCon(['foto:reg:3001234567/selfie']);
    P.ctx.__caja = caja;
    return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => esperar()).then(() => {
      assert.match(String(caja.nodos[0].alt || ''), /no esta en la nube/i,
        'con la nube conectada y sin esa foto, no se dijo que no está');
    });
  });

  test('con nube CAIDA se dice que no se pudo preguntar, no que no existe', () => {
    const P = panelConectado({}, { falla: true });
    const caja = nodoCon(['foto:reg:3001234567/selfie']);
    P.ctx.__caja = caja;
    return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => esperar()).then(() => {
      const alt = String(caja.nodos[0].alt || '');
      assert.match(alt, /No pude traer/i, 'no se dijo que el fallo fue al preguntar');
      assert.match(alt, /NO quiere decir que no la haya subido/i,
        'falta la mitad que evita la conclusión falsa: que la persona no subió nada');
    });
  });

  test('una foto que SÍ llegó se pone, y también en el enlace que la amplía', () => {
    /* Este archivo mete el mismo valor en el `src` y en el `href` en dos
       galerías. Quien arregle solo el `src` deja la miniatura viéndose y el
       enlace —que es el que se toca para leer el número de cédula— en la nada. */
    const P = panelConectado({ selfie: FOTO_SELFIE });
    const caja = nodoCon(['foto:reg:3001234567/selfie']);
    const enlace = { tagName: 'A', href: null, setAttribute() {} };
    caja.nodos[0].parentElement = enlace;
    P.ctx.__caja = caja;
    return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => esperar()).then(() => {
      assert.equal(caja.nodos[0].src, FOTO_SELFIE, 'la foto no se puso en la imagen');
      assert.equal(enlace.href, FOTO_SELFIE,
        'la foto se puso en la miniatura pero el enlace para ampliarla quedó vacío');
      assert.equal(caja.nodos[0].getAttribute('data-foto'), null,
        'la marca se quedó puesta: la foto se volvería a pedir en cada repintado');
    });
  });

  test('tres fotos de la misma persona son UNA sola llamada a la nube', () => {
    /* Abrir una ficha no puede costar tres viajes. */
    const P = panelConectado({ cedula_frente: FOTO_FRENTE, cedula_reverso: FOTO_REVERSO, selfie: FOTO_SELFIE });
    const caja = nodoCon(['foto:reg:3001234567/cedula_frente',
                          'foto:reg:3001234567/cedula_reverso',
                          'foto:reg:3001234567/selfie']);
    P.ctx.__caja = caja;
    return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => esperar()).then(() => {
      assert.equal(P.pedidos.length, 1,
        'se le preguntó ' + P.pedidos.length + ' veces a la nube por la misma persona');
      assert.equal(caja.nodos[2].src, FOTO_SELFIE);
    });
  });

  test('y repintar la misma ficha NO vuelve a preguntar', () => {
    /* Lo anterior lo garantiza el agrupar por celular; ESTO lo garantiza el
       caché, que es otra pieza. Sin esta prueba, quitar el caché no rompía nada
       —lo comprobé con un mutante que escapó— y el CRM se pondría a pedir las
       mismas tres fotos cada vez que algo repinta la ficha.
       MUTANTE QUE CAZA: quitar el `_fotosReg[cel]?Promise.resolve(...)` y
       llamar siempre a archivosDe. */
    const P = panelConectado({ selfie: FOTO_SELFIE });
    const una = () => {
      const caja = nodoCon(['foto:reg:3001234567/selfie']);
      P.ctx.__caja = caja;
      return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => esperar()).then(() => caja);
    };
    return una().then(() => una()).then(caja => {
      assert.equal(P.pedidos.length, 1,
        'repintar la ficha volvió a preguntarle a la nube: ' + P.pedidos.length + ' viajes para la misma foto');
      assert.equal(caja.nodos[0].src, FOTO_SELFIE,
        'la segunda vez la foto no se puso: el caché guarda pero no sirve');
    });
  });

  test('cerrar la ficha SÍ hace que se vuelva a preguntar', () => {
    /* La otra mitad del caché: si no se vaciara, una foto que Joan cambió en el
       celular se quedaría vieja en pantalla hasta recargar el Panel. */
    const P = panelConectado({ selfie: FOTO_SELFIE });
    const una = () => {
      const caja = nodoCon(['foto:reg:3001234567/selfie']);
      P.ctx.__caja = caja;
      return Promise.resolve(P.ev('resolverFotos(__caja)')).then(() => esperar());
    };
    return una().then(() => { P.ev('cerrarModal()'); return una(); }).then(() => {
      assert.equal(P.pedidos.length, 2,
        'después de cerrar la ficha se siguió usando el caché viejo');
    });
  });

  test('el caché de fotos nunca toca el disco', () => {
    /* Si se guardara, habríamos vuelto a tener la segunda copia que todo este
       trabajo existe para quitar — con el agravante de ser invisible. */
    const P = panelConectado({ cedula_frente: FOTO_FRENTE, selfie: FOTO_SELFIE });
    P.cargarCartera({ socios: [{ id: 'C1', numero: 1, nombre: 'Ana', cedula: '1', telefono: '3001234567',
      gestiones: [], selfieFoto: 'foto:reg:3001234567/selfie' }], prestamos: [] });
    P.ev('verCliente("C1")');
    return esperar().then(() => {
      const todo = JSON.stringify(P.almacen);
      assert.ok(!todo.includes('ESTE-ES-EL-ROSTRO'),
        'una foto traída de la nube quedó guardada en el navegador');
      P.ev('cerrarModal()');
      assert.deepEqual(P.ev('JSON.stringify(_fotosReg)'), '{}',
        'cerrar la ficha no vació el caché de fotos');
    });
  });
});

/* Dos vueltas del bucle de eventos: una promesa encadenada dos veces —que es lo
   que hace archivosDe— no está resuelta después de una sola. */
function esperar() {
  return new Promise(res => setImmediate(() => setImmediate(res)));
}
