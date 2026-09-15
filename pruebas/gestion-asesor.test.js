/* ===========================================================================
 * LA GESTIÓN DEL ASESOR
 *
 * La prueba que importa: el botón del asesor NO tenía freno. Abría WhatsApp sin
 * mirar la hora, ni el domingo, ni el festivo, ni cuántas veces se había tocado
 * a esa persona. El modo de Joan sí lo tiene desde hace semanas; el del equipo
 * no lo heredó nunca.
 *
 * Y la Ley 2300 le aplica a Joan EN PERSONA: un asesor cobrando un domingo a las
 * nueve de la noche es una infracción de Joan, no del asesor.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/gestion-asesor.js');

/* Martes 15-sep-2026 a las 10 de la mañana: dentro de la ventana. */
const MARTES_10 = new Date(2026, 8, 15, 10, 0);
const cobrando = { celular: '3001112233', etapa: 'M1A' };
const vendiendo = { celular: '3001112233', etapa: 'PC' };

describe('vender no es cobrar (15-sep-2026)', () => {

  test('las etapas de cartera son cobro; las de venta, no', () => {
    for (const e of ['D-3', 'D-2', 'D-1', 'D0', 'M1A', 'M1B', 'M1-2', 'M2', 'CA']) {
      assert.equal(G.esCobranza(e), true, e + ' debería ser cobro');
    }
    for (const e of ['PC', 'CR', 'PAGADO']) {
      assert.equal(G.esCobranza(e), false, e + ' no es cobro');
    }
  });

  test('una etapa DESCONOCIDA cae del lado seguro', () => {
    /* Equivocarse hacia el freno cuesta una llamada. Hacia el otro lado, una
       sanción. Si mañana alguien agrega una etapa y se olvida de esta lista,
       el sistema tiene que frenar, no soltar. */
    for (const e of ['XYZ', '', null, undefined, 'nueva_etapa_2027']) {
      assert.equal(G.esCobranza(e), true,
        'la etapa ' + JSON.stringify(e) + ' se trató como venta: sin freno legal');
    }
  });

  test('VENDER no tiene ventana: se puede a cualquier hora', () => {
    /* Meterle los topes de cobranza a la venta sería frenarla con una ley que
       no habla de ella. */
    for (const h of [6, 9, 14, 20, 23]) {
      const r = G.puedeContactar(vendiendo, { ahora: new Date(2026, 8, 15, h, 0) });
      assert.equal(r.puede, true, 'no dejó vender a las ' + h);
      assert.equal(r.es_cobranza, false);
    }
    /* Ni siquiera el domingo. */
    const dom = G.puedeContactar(vendiendo, { ahora: new Date(2026, 8, 13, 11, 0) });
    assert.equal(dom.puede, true);
  });
});

describe('el freno de la Ley 2300, que no existía (15-sep-2026)', () => {

  test('DOMINGO no se cobra', () => {
    const r = G.puedeContactar(cobrando, { ahora: new Date(2026, 8, 13, 11, 0) });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'domingo');
    assert.match(r.texto, /domingo/i);
  });

  test('FESTIVO tampoco', () => {
    const r = G.puedeContactar(cobrando, { ahora: MARTES_10, esFestivo: () => true });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'festivo');
  });

  test('entre semana, solo de 7 a 7', () => {
    for (const h of [0, 5, 6, 19, 21, 23]) {
      const r = G.puedeContactar(cobrando, { ahora: new Date(2026, 8, 15, h, 0) });
      assert.equal(r.puede, false, 'dejó cobrar a las ' + h);
      assert.equal(r.motivo, 'hora');
    }
    for (const h of [7, 12, 18]) {
      assert.equal(G.puedeContactar(cobrando, { ahora: new Date(2026, 8, 15, h, 0) }).puede,
        true, 'no dejó cobrar a las ' + h);
    }
  });

  test('sábado, solo de 8 a 3', () => {
    const sab = h => new Date(2026, 8, 19, h, 0);
    for (const h of [7, 15, 16, 20]) {
      const r = G.puedeContactar(cobrando, { ahora: sab(h) });
      assert.equal(r.puede, false, 'dejó cobrar el sábado a las ' + h);
      assert.equal(r.motivo, 'hora_sabado');
    }
    for (const h of [8, 11, 14]) {
      assert.equal(G.puedeContactar(cobrando, { ahora: sab(h) }).puede, true,
        'no dejó cobrar el sábado a las ' + h);
    }
  });

  test('un festivo que revienta NO abre la puerta', () => {
    /* Si la función de festivos falla, lo seguro es seguir comprobando el resto,
       no dar por bueno el día. */
    const r = G.puedeContactar(cobrando, {
      ahora: new Date(2026, 8, 13, 11, 0),      // domingo
      esFestivo: () => { throw new Error('se cayó'); }
    });
    assert.equal(r.puede, false, 'con el calendario roto dejó cobrar un domingo');
  });
});

describe('el tope por persona (15-sep-2026)', () => {

  test('ya contactado HOY, no se vuelve a tocar', () => {
    const r = G.puedeContactar(
      { ...cobrando, gestion: { cuando: new Date(2026, 8, 15, 8, 0).toISOString(), canal: 'whatsapp' } },
      { ahora: MARTES_10, canal: 'whatsapp' });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'hoy');
  });

  test('contactado hace tres días, tampoco: la ley deja UNO por semana', () => {
    const r = G.puedeContactar(
      { ...cobrando, gestion: { cuando: new Date(2026, 8, 12, 10, 0).toISOString(), canal: 'whatsapp' } },
      { ahora: MARTES_10, canal: 'whatsapp' });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'esta_semana');
    assert.match(r.texto, /3 días/);
  });

  test('y cambiar de canal dentro de la semana es PEOR, no mejor', () => {
    /* Es lo que prohíbe el artículo 3: varios canales en la misma semana. La
       forma intuitiva de equivocarse sería creer que el SMS «no cuenta» porque
       el anterior fue WhatsApp. */
    const r = G.puedeContactar(
      { ...cobrando, gestion: { cuando: new Date(2026, 8, 12, 10, 0).toISOString(), canal: 'whatsapp' } },
      { ahora: MARTES_10, canal: 'sms' });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'otro_canal');
    assert.match(r.texto, /whatsapp/i);
  });

  test('pasada la semana, sí', () => {
    const r = G.puedeContactar(
      { ...cobrando, gestion: { cuando: new Date(2026, 8, 5, 10, 0).toISOString(), canal: 'whatsapp' } },
      { ahora: MARTES_10, canal: 'whatsapp' });
    assert.equal(r.puede, true);
  });

  test('una fecha ilegible NO bloquea ni abre por accidente', () => {
    for (const mala of ['ayer', '', null, 'no-es-fecha']) {
      const r = G.puedeContactar({ ...cobrando, gestion: { cuando: mala } },
                                 { ahora: MARTES_10 });
      assert.equal(r.puede, true, 'con ' + JSON.stringify(mala) + ' se bloqueó sin razón');
    }
  });

  test('sin celular no se contacta a nadie', () => {
    const r = G.puedeContactar({ etapa: 'PC' }, { ahora: MARTES_10 });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_celular');
  });

  test('cada negativa trae su frase, no solo un no', () => {
    const casos = [
      [cobrando, new Date(2026, 8, 13, 11, 0)],
      [cobrando, new Date(2026, 8, 15, 22, 0)],
      [cobrando, new Date(2026, 8, 19, 17, 0)],
      [{ etapa: 'PC' }, MARTES_10]
    ];
    for (const [p, ahora] of casos) {
      const r = G.puedeContactar(p, { ahora });
      assert.equal(r.puede, false);
      assert.ok(r.texto && r.texto.length > 20,
        'la negativa «' + r.motivo + '» no explica nada: ' + r.texto);
    }
  });
});

describe('las plantillas, que antes eran una sola (15-sep-2026)', () => {

  test('hay plantillas de venta, de cobranza y de servicio', () => {
    const grupos = new Set(Object.values(G.PLANTILLAS).map(p => p.grupo));
    for (const g of ['Venta', 'Cobranza', 'Servicio']) {
      assert.ok(grupos.has(g), 'no hay plantillas del grupo ' + g);
    }
  });

  test('a cada etapa se le propone una que tiene sentido', () => {
    const esperado = { PC: 'presentacion', CR: 'invitar_app', PAGADO: 'confirmar_pago',
                       D0: 'vence_hoy', 'D-1': 'recordar', CA: 'seguimiento',
                       M1A: 'acuerdo', M2: 'acuerdo' };
    for (const [etapa, clave] of Object.entries(esperado)) {
      assert.equal(G.plantillaSugerida(etapa), clave, 'para la etapa ' + etapa);
      assert.equal(G.plantillasPara(etapa)[0], clave,
        'la sugerida no sale de primera en ' + etapa);
    }
  });

  test('siempre se ofrecen TODAS: la sugerida se propone, no se impone', () => {
    for (const etapa of ['PC', 'D0', 'M2', 'desconocida']) {
      assert.equal(G.plantillasPara(etapa).length, G.ORDEN.length,
        'en ' + etapa + ' se ocultaron plantillas');
    }
  });

  test('ninguna plantilla deja un hueco sin rellenar', () => {
    const datos = { nombre: 'María', asesor: 'Pedro', enlace: 'https://tugarantia.net/play/' };
    for (const clave of G.ORDEN) {
      const t = G.armar(clave, datos);
      assert.equal(/\{\w+\}/.test(t), false,
        'la plantilla ' + clave + ' quedó con un hueco: ' + t);
      assert.ok(t.indexOf('María') > -1, clave + ' no saluda por el nombre');
    }
  });

  test('ninguna de COBRANZA amenaza ni pregunta por qué no pagó', () => {
    /* Artículo 7: prohibido exigirle al deudor que explique. */
    for (const [clave, p] of Object.entries(G.PLANTILLAS)) {
      if (p.grupo !== 'Cobranza') continue;
      assert.equal(/por qu[eé] no (pag|ha pag)/i.test(p.texto), false, clave + ' pide explicaciones');
      assert.equal(/reporta|datacredito|centrales|abogado|embarg|demand/i.test(p.texto), false,
        clave + ' amenaza');
    }
  });

  test('todas dicen QUIÉN escribe', () => {
    for (const [clave, p] of Object.entries(G.PLANTILLAS)) {
      assert.ok(/\{asesor\}|Tu Garantía/.test(p.texto),
        clave + ' no dice quién escribe');
    }
  });
});
