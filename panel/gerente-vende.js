/* ============================================================================
 * EL GERENTE VENDE — lo que el CRM le dice al gerente sobre sus registros y
 * sus propuestas. 15 de octubre de 2026.
 *
 * Joan: «quiero que [Willian] inicie vendiendo créditos y que pueda ver los
 * nuevos registros pero únicamente de los clientes que tenemos como
 * prospectos y no todos, solo los que yo le asigne, y que él pueda hacer la
 * venta y la cobranza».
 *
 * LA REJA DE VERDAD ESTÁ EN LA NUBE (base/20261015_el_gerente_vende.sql): qué
 * registros ve, de quién son las fotos que puede abrir y hasta dónde llega su
 * propuesta lo decide la base. Esto son las REGLAS PARA DECIRLO ANTES: el
 * estado de cada solicitud con palabras, la cuenta del total, los topes del
 * formulario y el porqué de cada «no» de la base. Si la pantalla y la base
 * dijeran cosas distintas, el gerente le prometería al cliente una cifra que
 * la base después rechaza.
 *
 * PURO: sin DOM, sin red, sin reloj. Los textos que devuelve son TEXTO PLANO:
 * quien los pinta los escapa. Pruebas: pruebas/el-gerente-vende.test.js.
 * ==========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.GerenteVende = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Las rejas fijas de la base, las mismas de contrapropuesta_solicitud (la
     de Joan): ningún tope de Joan puede abrir más que esto. */
  const PISO_CAPITAL = 10000;

  /* Lo que contesta la base cuando dice que no, con palabras para el gerente.
     Una por cada `motivo` de gerente_registros, gerente_archivos y
     gerente_proponer: si la base estrena un motivo y no está aquí, la pantalla
     dice el genérico y la prueba lo caza. */
  const MOTIVOS = {
    solo_gerente: 'Esto es solo para el gerente. Si eres gerente, sal y vuelve a entrar.',
    no_es_tuyo: 'Esta persona no es de tu base ni te la asignó Joan.',
    no_esta_abierta: 'Esta solicitud ya no está abierta: o el cliente ya aceptó (ahora le toca a Joan desembolsar) o se cerró.',
    sin_topes: 'Joan todavía no te puso topes de venta. Puedes ver la solicitud, pero no proponer hasta que los ponga en Ajustes.',
    fuera_de_topes: 'Esa propuesta se pasa de los topes que puso Joan.'
  };
  function textoMotivo(m) {
    return MOTIVOS[m] || 'La nube dijo que no' + (m ? ' («' + m + '»)' : '') + '.';
  }

  /* La solicitud más reciente de un registro. */
  function ultimaSolicitud(r) {
    const ss = (r && Array.isArray(r.solicitudes)) ? r.solicitudes.slice() : [];
    ss.sort((a, b) => String(b.creada_en || '').localeCompare(String(a.creada_en || '')));
    return ss[0] || null;
  }

  /* De quién es la propuesta, con palabras. */
  function quienPropuso(cp) {
    const por = String((cp && cp.por) || '');
    if (por === 'joan') return 'Joan';
    if (por.indexOf('gerente:') === 0) return (cp && cp.por_nombre) ? String(cp.por_nombre) : 'el gerente';
    if (por.indexOf('automatica') === 0) return 'el automático';
    return por ? 'alguien del equipo' : '';
  }

  /* Lo que pidió el cliente: el monto y los días, si los dijo. */
  function loQuePidio(s) {
    const p = (s && s.pedido) || {};
    const monto = Number(s && s.pedido_monto) || Number(p.monto) || 0;
    const dias = Number(p.dias) || 0;
    return { monto, dias, fecha: p.fecha_pago || null };
  }

  /* El estado de una solicitud, para pintarlo. `puedeProponer` es la misma
     regla que gerente_proponer: solo 'nueva' o 'contrapropuesta'. Una
     aceptada es de Joan, que desembolsa. */
  function estadoSolicitud(s) {
    if (!s) return { etiqueta: 'Todavía no ha pedido', tono: 'gris', puedeProponer: false };
    const cp = s.contrapropuesta || null;
    switch (s.estado) {
      case 'nueva':
        return { etiqueta: 'Pidió un crédito', tono: 'ambar', puedeProponer: true };
      case 'contrapropuesta':
        return { etiqueta: 'Tiene una propuesta' + (quienPropuso(cp) ? ' de ' + quienPropuso(cp) : '') + ', sin aceptar',
                 tono: 'azul', puedeProponer: true };
      case 'aceptada':
        return { etiqueta: 'Aceptó: le toca a Joan desembolsar', tono: 'verde', puedeProponer: false };
      case 'atendida':
        return { etiqueta: 'Joan ya la atendió', tono: 'gris', puedeProponer: false };
      case 'descartada':
        return { etiqueta: 'Se descartó', tono: 'gris', puedeProponer: false };
      default:
        return { etiqueta: String(s.estado || 'Sin estado'), tono: 'gris', puedeProponer: false };
    }
  }

  /* La cuenta de la propuesta, IGUAL que contrapropuesta_de en la base:
     costo = round(capital × pct / 100). Si fuera distinta, el gerente le
     diría al cliente un total y la base guardaría otro. */
  function calcular(capital, pct) {
    const c = Math.round(Number(capital) || 0), p = Math.round(Number(pct) || 0);
    const costo = Math.round(c * p / 100);
    return { capital: c, costo_pct: p, costo, total: c + costo };
  }

  /* ¿Cabe en los topes? La misma regla que gerente_proponer, para decirlo
     antes de mandar. Devuelve el PRIMER problema, con palabras. */
  function validar(v, topes) {
    if (!topes) return { ok: false, motivo: 'sin_topes', texto: MOTIVOS.sin_topes };
    const cap = Number(v && v.capital), pct = Number(v && v.costo_pct), dias = Number(v && v.dias);
    const t = {
      capital_max: Number(topes.capital_max), costo_min: Number(topes.costo_min),
      costo_max: Number(topes.costo_max), dias_max: Number(topes.dias_max)
    };
    const entero = x => Number.isFinite(x) && Math.round(x) === x;
    if (!entero(cap) || cap < PISO_CAPITAL) {
      return { ok: false, motivo: 'capital', texto: 'Escribe cuánto le prestas (desde $10.000).' };
    }
    if (cap > t.capital_max) {
      return { ok: false, motivo: 'capital', texto: 'Lo máximo que puedes proponer es ' + pesos(t.capital_max) + '.' };
    }
    if (!entero(pct) || pct < t.costo_min || pct > t.costo_max) {
      return { ok: false, motivo: 'costo',
               texto: t.costo_min === t.costo_max
                 ? 'El costo tiene que ser ' + t.costo_min + '%.'
                 : 'El costo va de ' + t.costo_min + '% a ' + t.costo_max + '%.' };
    }
    if (!entero(dias) || dias < 1 || dias > t.dias_max) {
      return { ok: false, motivo: 'dias', texto: 'Los días van de 1 a ' + t.dias_max + '.' };
    }
    return { ok: true, motivo: null, texto: '' };
  }

  /* Por qué este registro le toca: de su base o se lo asignó Joan. */
  function porQue(r) {
    if (r && r.por === 'asignado') return 'Te lo asignó Joan';
    if (r && r.por === 'base') return 'Es de tu base';
    return '';
  }

  /* Pesos con punto de mil, sin depender del Intl del navegador. */
  function pesos(n) {
    const v = Math.round(Number(n) || 0);
    return '$' + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  return { MOTIVOS, PISO_CAPITAL, textoMotivo, ultimaSolicitud, quienPropuso, loQuePidio,
           estadoSolicitud, calcular, validar, porQue, pesos };
});
