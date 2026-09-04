# Dónde quedó Tu Garantía — 2 de septiembre de 2026

Resumen para arrancar la próxima sesión sin leer nada más. Lo verificado se
marca como verificado; lo que solo está escrito, se dice. (El estado anterior,
con el dominio y las direcciones de la casa, es `ESTADO-25-AGO-2026.md` y sigue
valiendo entero.)

---

## En una frase

Hoy fue el día en que **entraron en vigencia los niveles por garantía**
(REGLAS_VIGENTES_DESDE = 2026-09-02) y el CRM del computador ganó lo que Joan
pidió: **descuentos del recargo de mora — 100% u otro porcentaje — en el cobro
total, en la prórroga y en el acuerdo pactado**. Todo publicado y verificado en
producción.

---

## Verificado hoy, en vivo

- **La sincronización con los teléfonos**: el CRM dijo «Listo: 22 cliente(s)
  actualizados el 02 de sept de 2026». Los niveles nuevos (hierro → misterio,
  todos con 2 prórrogas) ya están en los aparatos de los clientes, justo el día
  en que la regla entró a regir.
- **El descuento de mora, punta a punta en la página publicada**
  (`tugarantia.net/panel/crm.html`, service worker **v27**): crédito de prueba
  de $400.000 al 20% con 10 días de mora ($40.000 de recargo), perdón del 100%
  → el botón cobra **$480.000 exactos**, la garantía sale de la plata que
  ENTRÓ ($30.000 = 37,5% de $80.000), y quedan guardados `montoRecibido`,
  `costoCausado`, `moraCausada`, `recargoMora=0` y la condonación con motivo.
  La invariante cuadra: montoRecibido + condonado == capital + causado.
  (La cartera de prueba se sembró y se borró en un navegador aparte; nada tocó
  los datos reales ni viajó a la nube.)
- **Pruebas: 871 en verde** (eran 864; +7 nuevas del descuento en
  `pruebas/panel.test.js`, describe «el descuento de la mora en el Panel»).

Commits del día: `c6aad23` (niveles por garantía), `6624ce2` (clave por el
hash), `eae5003` (descuentos de mora).

## Cómo quedó el descuento (lo esencial)

- La **ley** ya vivía en el espejo desde el 14-ago (`cuentasDelCobro`,
  `pruebas/cobro.test.js`, lista `condonaciones` que solo suma en `nube.js`).
  El CRM la sigue al pie con una interfaz más simple: **% de la mora + motivo
  obligatorio** en la hoja de cobro. Sin motivo no registra.
- El mismo % vale para los dos caminos: cobro total y prórroga. El **acuerdo**
  pactado con descuento lo congela; el perdón se vuelve hecho solo al CUMPLIR
  (plata en mano), y si el acuerdo se vence, el descuento se vence con él.
- **Al plan de pagos no le aplica** (su entrada la arma un flujo que no anota
  perdones — se re-liquida limpio antes de ofrecerlo).
- `puente.js` (`movimientosConMora`) ahora lee `moraCausada` de respaldo: un
  perdón del 100% dejaba `recargoMora` en $0 y borraba la única prueba de que
  hubo mora. Perdonar la plata no lava la historia (aTiempo/diasMora quedan).
- La ficha del cliente muestra «Descuentos que le has dado», derivado de las
  condonaciones, nunca de un contador guardado.

## Asimetrías conocidas (deuda dicha, no escondida)

- El **espejo** (celular) da descuentos en el cierre (por monto recibido) pero
  su **prórroga no tiene descuento** todavía. El computador sí. Si Joan cobra
  prórrogas con perdón desde la calle, hay que llevárselo al espejo.
- El computador solo perdona **mora**; el perdón del costo y el monto real
  («¿Cuánto pagó?», saldo a favor, queda debiendo) siguen siendo del espejo.
  La receta local para portarlos existe y quedó actualizada el 2-sep.

## Lo que sigue esperando a Joan (nada de esto es código)

1. **El chat, fases 2–5** (bot que contesta, avisos, recordatorios): esperan
   sus dos decisiones — **(A)** comprar la SIM nueva para la línea del negocio
   y **(B)** elegir el canal del aviso (Telegram gratis vs WhatsApp Cloud API).
   El plan completo está escrito en `PLAN-CHAT.md`.
2. **Una plantilla suya trae un carácter dañado (�)** — hoy salió en un mensaje
   de entrega a un cliente real: «gracias por la confianza �». Se arregla en
   el CRM → Plantillas, borrando ese símbolo y poniendo el emoji de nuevo.
3. **Enforce HTTPS** en los ajustes de GitHub Pages (un clic, sigue pendiente).
4. En `joan-te-presta` (github.io) quedó restaurada una copia vieja del CRM que
   no hacía falta restaurar; se puede borrar cuando se quiera.

## Trampas para la próxima sesión

- `RECETA-*.md` y `NOTAS-INTERNAS.md` **no están en el repo a propósito**
  (.gitignore lo explica: el repo es público). Viven solo en esta carpeta del
  computador. No intentes commitearlas ni creas que faltan.
- Las pruebas corren con `cd pruebas && node --test` (no hay package.json).
- El banco de `panel.test.js` (`abrirPanel`) ejecuta el crm.html real en vm con
  DOM de mentira; los centinelas de `motor.test.js` leen el código fuente y se
  actualizan a propósito cuando la letra cambia — cuatro cambiaron hoy, cada
  uno con su porqué escrito.
- El traspaso de la clave de sincronización entre pestañas es por
  `#clave-nube=` en la URL del CRM (la clave nunca pasa por el chat).
