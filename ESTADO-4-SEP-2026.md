# Dónde quedó Tu Garantía — 4 de septiembre de 2026

Resumen para arrancar la próxima sesión sin leer nada más. Lo verificado se
marca como verificado; lo que solo está escrito, se dice. Los partes anteriores
(`ESTADO-2-SEP-2026.md` y `ESTADO-25-AGO-2026.md`) siguen valiendo enteros.

---

## En una frase

Día de dos mitades. Por la mañana se descubrió que **la red de seguridad
mentía**: una prueba centinela se vencía sola por el calendario y —lo caro— el
**1 de octubre la app pública iba a publicar una afirmación falsa sobre la tasa
legal**. Por la tarde llegó **la línea de descuentos por quincena** que Joan
pidió, y una **auditoría adversaria** que encontró que la sincronización
**hacía desaparecer un crédito entero**. Cuatro defectos de plata arreglados,
890 pruebas en verde, y el repositorio tiene **integración continua por primera
vez**.

---

## Cómo empezó: el parte de ayer decía la verdad y aun así estaba roto

El parte del 2-sep decía «871 pruebas en verde», y era cierto. Al correrlas el
3-sep eran **870 y una roja**, sin que nadie hubiera tocado una línea de código.

La roja era de las importantes: «pagar no puede rendir menos que no pagar».

**No era un defecto de plata.** El socio del fixture curaba una mora de 127 días
con una prórroga el 4-ago. `meses_sin_mora` es
`floor(díasEntre(último día de mora, HOY) / 30)`: el 2-sep iban 29 días y daba
0; el 3-sep iban 30 y daba 1. La cuenta era **correcta los dos días**. Lo que
estaba mal era la prueba, que afirmaba un número sin decir de qué día hablaba.

Y lo peor no fue el rojo sino su forma: **se habría curado sola el 16-sep**,
cuando la primera cuota del plan vence, el socio vuelve a estar en mora y el
contador se pone en cero solo. Una prueba que se enciende y se apaga con el
almanaque no distingue una regresión de un martes.

Verificado con el reloj congelado: **fijado en el 2-sep pasan las 871; fijado en
el 3-sep falla 1.** La ventana exacta del rojo era del 3 al 15 de septiembre.

---

## Los dos hallazgos

### 1. La prueba que medía el calendario

**Causa raíz.** `migrarSocio` era la **única** función de `app/puente.js` que
leía el reloj de pared sin dejar preguntar por otro día. Todo el archivo está
construido sobre la regla contraria —*si tu pregunta lleva una fecha adentro,
pásala en vez de deducirla*— y justo ahí faltaba.

**Arreglo.** `migrarSocio(db, s, hasta)`, con `hasta` **opcional** y por defecto
hoy: ni la app, ni el CRM, ni el espejo lo pasan, así que en producción no
cambia nada. Las pruebas de esa suite ahora toman la foto un **día escrito**.

**Centinela nuevo.** «a migrarSocio se le puede fijar el día, y lo respeta»:
pregunta por el 5-ene y por el 5-ago y exige respuestas distintas. Si alguien
vuelve a ignorar el parámetro, las dos llamadas darían lo mismo y se cae ahí
—con el porqué escrito al lado— en vez de dentro de seis meses con otra cara.

### 2. «Tasa máxima legal vigente en Colombia: 0,00%»

Este es el que importa, y **no se habría encontrado leyendo el código**: hoy
está en verde y en tres semanas no lo estaría.

La tabla `TOPES` de `app/creditos.js` se vence **el 30 de septiembre**, por
diseño: la Superfinanciera certifica el interés bancario corriente mes a mes y
nadie puede adivinar el que viene. Desde el 1-sep la **cotización** sobrevive a
eso a propósito (la tasa fija del producto no sale del techo, así que la app no
se queda muda el día 1 de cada mes). Buena decisión, y sigue en pie.

**Pero los textos se quedaron escribiendo el número igual.** `techo_del_mes`
llega `null` y `pct(null)` da «0,00%». Medido con el reloj puesto en el 1 de
octubre, las tres salidas públicas iban a publicar, cada una por su lado:

| Dónde | Qué iba a decir el 1 de octubre |
|---|---|
| La divulgación obligatoria (`app/cumplimiento.js`) | «Tasa máxima legal vigente en Colombia: **0,00%**.» |
| La página pública (`play/index.html`) | «El techo legal de este mes es **0,00%** ().» |
| La ficha de la tienda (`herramientas/ficha-play.js`) | `| Techo legal del mes | **0,00% (null)** |` |

Ninguna es un error de cálculo: son una **afirmación falsa**, y encima en los
textos que existen precisamente para no afirmar nada falso. La divulgación es
además el texto de cumplimiento que va en la ficha de Play, en la pantalla de
pedir y en el contrato.

**Arreglo: sin certificación no se escribe un número. Se calla la frase, no el
precio.** El resto de la divulgación sigue entero —plazo, tasa efectiva anual,
ejemplo, «sin cargos aparte»— porque sigue siendo cierto y es lo que la norma
pide del producto. Cuando **sí** hay certificación, el texto quedó **idéntico
palabra por palabra** al de antes.

**Comprobado que el centinela sirve:** con el arreglo deshecho a propósito, la
suite se pone en rojo (2 pruebas); restaurado, vuelve a verde. Una prueba que
pasa en los dos casos no vale nada.

---

## Lo que hay de nuevo en el repositorio

### `herramientas/reloj-falso.js` — la escoba que encontró las dos cosas

Corre la suite entera con el reloj de pared **congelado** en las fechas que se
le pidan, para descubrir qué pruebas se van a vencer solas.

```
node herramientas/reloj-falso.js                      # hoy, +7d, +1m, +3m, +1a, +2a
node herramientas/reloj-falso.js 2026-10-01
```

Muestrear no encuentra esta clase de defecto: hay que **barrer el futuro**. El
primer día que se corrió encontró los dos hallazgos de arriba.

### `herramientas/vigilar-usura.js` — cuántos días le quedan a la tabla

```
node herramientas/vigilar-usura.js              # informa; falla solo si YA venció
node herramientas/vigilar-usura.js --avisar     # falla también en los 15 días previos
```

Dice el techo vigente, hasta cuándo llega la tabla, cuántos días faltan y —si
hace falta— los seis pasos para renovarla. La distinción entre los dos modos es
deliberada: la suite local no puede estar roja dos semanas de cada mes (una
suite crónicamente roja se ignora), pero el vigilante automático sí tiene que
gritar antes, porque su rojo **es** el aviso.

### `.github/workflows/vigilar.yml` — la primera CI del proyecto

Hasta hoy no había ninguna red: si un cambio rompía algo y nadie corría
`node --test` a mano, se publicaba roto.

- **En cada push y pull request a `main`:** corre las 877 pruebas.
- **Los días 16, 22 y 27 de cada mes:** corre además el vigilante con
  `--avisar`, que falla cuando a la tabla de usura le quedan 15 días o menos.
  Un job en rojo en un repositorio propio **le llega a Joan por correo** — ese
  correo es el aviso que hoy no existía.

**Trampa de GitHub anotada en el propio archivo:** los workflows programados se
**desactivan solos** si el repositorio pasa 60 días sin commits. Si Tu Garantía
se queda quieta dos meses, hay que volver a habilitarlo a mano desde la pestaña
Actions. No hay forma de evitarlo desde el archivo.

---

## Pruebas

**877 en verde** (eran 871). Las seis nuevas:

- 1 en `pruebas/motor.test.js` — el centinela del parámetro `hasta`.
- 5 en `pruebas/cumplimiento.test.js` — describe «con la tabla de usura vencida
  no se publica un techo inventado»: cubre las tres salidas públicas, comprueba
  que el supuesto de la prueba sigue siendo cierto, y exige que el texto de
  siempre **no cambie** cuando sí hay certificación.

Barrido con el reloj congelado después del arreglo: **0 fallos** el 4-sep, el
11-sep, el 16-sep y el 30-sep. Del 1 de octubre en adelante fallan las dos
pruebas de la tabla de usura, **y eso es correcto**: no es una prueba vencida,
es la tarea de abajo sin hacer.

---

## La segunda mitad: la plata perdonada, y lo que destapó auditarla

### La línea de la quincena (commit `58636f3`)

Desde el 2-sep Joan puede perdonar el 100% de la mora, y esa plata no aparecía
en **ningún** informe: `p.condonaciones` se leía solo por socio, de a un cliente
por vez.

- **KPI «🎁 Descuentos dados»** al lado de «Ganancia ciclo actual», con N clientes.
- **Columna «Descuentos dados»** en Ciclos, pegada a la de ganancia porque es su
  contra-cuenta, con desglose mora/costo y el subtítulo «ya restados de la
  ganancia» (la ganancia que muestra la columna anterior ya es NETA; sin ese
  subtítulo la pantalla invitaría a restar dos veces).

**La cuenta vive en `app/puente.js`, no en `crm.html`**, y es la decisión de
diseño de la entrega: `espejo.html` ya reescribe por su cuenta las tres cuentas
de quincena del Panel, y una cuarta escrita dentro del CRM nacería duplicada el
día que el celular muestre la línea.

**La fecha dice cuál movimiento, no cuál columna.** Tres trampas, las tres con
su prueba: `p.fechaPagado` falla en silencio para los créditos vivos;
`corteVigenteEn` manda el perdón de una prórroga a la quincena siguiente (la
comparación es `desde <= h` y el mismo día ya rige el corte nuevo); y hay que
mirar `sobre` antes que la fecha, porque prorrogar por la mañana y cerrar por
la tarde del mismo día es un caso real. Verificado que las pruebas sirven: con
la regla reducida a la versión ingenua, 6 de 8 se caen.

### La auditoría adversaria

Cuatro lentes (sincronización, invariantes de plata, honestidad de la interfaz,
datos que se pisan), cada hallazgo pasado por un refutador independiente.
**21 hallazgos crudos, 20 sobrevivieron.**

**Cuatro se arreglaron y se publicaron el mismo día** (commit `06f434b`), los
cuatro en la sincronización y los cuatro de plata:

1. **«Dejar lo de la nube» guardaba el envoltorio de la fusión como si fuera el
   crédito.** En la cartera quedaba `{"fila":{…},"pisables":[…],"hayChoque":true}`
   — sin capital, sin socioId, sin pagado. El crédito se volvía un fantasma, y
   en la subida siguiente esa basura viajaba a la nube contra la revisión buena:
   **el crédito moría en los dos aparatos.**
2. **Los argumentos de `fusionarFila` iban al revés**: «Dejar lo de la nube» se
   quedaba con los valores del computador.
3. **El mapa de identidades de `subir.html` no tenía `condonaciones`** desde el
   14-ago: los perdones caían del lado pisable y un lado perdía el descuento
   entero. Ahora la fusión usa `NUBE.LISTAS_QUE_SUMAN`, donde vive la regla.
4. **El `monto` estaba en la identidad de la prórroga**, y lo abrió la ronda del
   2-sep: el computador lo escribe rebajado por el descuento y el espejo entero,
   así que la misma prórroga entraba **dos veces** — ingreso fantasma, una
   prórroga quemada del cupo del socio, y garantía acreditada que nadie pagó.

**Quedan 16 hallazgos**, ordenados por plata y con tiempos, en
`AUDITORIA-4-SEP-2026.md` (en esta carpeta, **fuera del repositorio**: es una
lista de defectos vivos y el repo es público — `.gitignore` lo excluye igual que
las recetas).

Lo que hay que saber sin abrir ese archivo: **6 de los 16 son del acuerdo de
prórroga** (la función del 29-ago) y se refuerzan entre sí. El precio pactado
**no se congela**, el mensaje del pacto se sigue mandando cuando el socio ya
incumplió, el calendario le escribe «hoy es tu pago» al mismo socio el mismo
día, cobrar la prórroga por el botón normal **no borra el acuerdo** (y el botón
«Cumplió» registra una segunda prórroga que nadie pagó), y `grep acuerdo
panel/espejo.html` devuelve **cero**: el aparato que existe para cobrar en la
calle no sabe que los acuerdos existen.

> **Consejo operativo mientras tanto:** no pactes acuerdos desde el computador
> si vas a cobrar en la calle. Es la combinación que hoy cobra de más y deja el
> pacto vivo.

---

## Lo que espera a Joan, con fechas

1. **ANTES DEL 1 DE OCTUBRE — la certificación de octubre.** Es lo único de esta
   lista con fecha dura. La Superfinanciera publica la resolución sobre el final
   de septiembre. Son 10 minutos:
   - una fila nueva al final de `TOPES` en `app/creditos.js`
     (`desde`, `hasta`, `ibc`, `consumo_ordinario = ibc × 1,5`, `fuente`);
   - las filas viejas **no se tocan**: son historia y hay pruebas que las miran;
   - `node herramientas/ficha-play.js` para regenerar la ficha;
   - `cd pruebas && node --test`.

   Si se pasa la fecha no se cae nada, pero la página pública deja de decir cuál
   es el techo legal. **Y esto se repite todos los meses**: por eso está el
   vigilante.

2. **El chat, fases 2–5** (bot que contesta, avisos, recordatorios): esperan sus
   dos decisiones — **(A)** comprar la SIM nueva para la línea del negocio y
   **(B)** elegir el canal del aviso (Telegram gratis vs WhatsApp Cloud API). El
   plan completo está en `PLAN-CHAT.md`.

3. **La plantilla con el carácter dañado (`�`)** — salió el 2-sep en un mensaje
   de entrega a un cliente real: «gracias por la confianza `�`». **Verificado
   hoy que NO está en el código**: no hay ni un solo carácter de reemplazo en
   todo el repositorio, así que salió de una plantilla que Joan escribió. Se
   arregla en el CRM → Plantillas, borrando ese símbolo y poniendo el emoji otra
   vez.

4. **Enforce HTTPS** en los ajustes de GitHub Pages (un clic, sigue pendiente).

5. En `joan-te-presta` (github.io) quedó restaurada una copia vieja del CRM que
   no hacía falta restaurar; se puede borrar cuando se quiera.

---

## Deuda conocida que sigue igual (dicha, no escondida)

Nada de esto se tocó hoy y todo sigue como lo dejó el parte del 2-sep:

- El **espejo** (celular) da descuentos en el cierre pero **su prórroga no tiene
  descuento**; el computador sí. Si Joan cobra prórrogas con perdón desde la
  calle, hay que llevárselo al espejo.
- El computador solo perdona **mora**; el perdón del costo y el monto real
  («¿Cuánto pagó?», saldo a favor, queda debiendo) siguen siendo del espejo. La
  receta local para portarlos es `RECETA-COBRO.md`.
- ~~Falta la línea de descuentos por quincena~~ **HECHO hoy** (KPI + columna en
  Ciclos). Lo que sigue faltando es que el **espejo** la muestre: la cuenta ya
  vive en el puente justo para que no nazca duplicada.
- Los cuatro puntos del §8 de `RECETA-COBRO.md` (abono en cascada, descuento
  sobre cuota del plan, saldo a favor que no se aplica solo).

---

## Trampas para la próxima sesión

- **`meses_sin_mora` hoy no lo lee nadie para decidir plata.** Desde el 2-sep el
  nivel es el tramo de la garantía; ese contador solo viaja en el paquete. Los
  que sí se pintan son `racha` y `pagados_a_tiempo` (insignias de la app, «N
  puntuales» del CRM) y `pagados_a_tiempo` decide el perfil sugerido en
  `app/creditos.js`.
- **Antes de dar por buena una suite verde, barre el futuro:**
  `node herramientas/reloj-falso.js`. Verde hoy no es verde.
- **Los fines de línea del árbol de trabajo están mezclados**: `puente.js` y
  `motor.test.js` son CRLF; `cumplimiento.js`, `ficha-play.js`, `play/index.html`
  y `cumplimiento.test.js` son LF. En git todos están guardados como LF. Al
  parchear con un script hay que **respetar la convención de cada archivo** o el
  diff sale con el archivo entero reescrito.
- **No hizo falta subir `CACHE` en `sw.js`** (sigue en `v27`) y fue una decisión,
  no un olvido: el service worker sirve `.html` y `.js` **fresco primero**, así
  que el arreglo llega solo; y `play/index.html` y `app/cumplimiento.js` ni
  siquiera están en la lista precacheada. Subir la caché habría borrado el modo
  sin conexión de todos los teléfonos a cambio de nada. Tampoco se tocaron
  `VERSION_APP` ni `REGLAS_VIGENTES_DESDE`: **ninguna regla de plata cambió**.
- `RECETA-*.md` y `NOTAS-INTERNAS.md` **no están en el repo a propósito**
  (`.gitignore` lo explica: el repo es público). Viven solo en esta carpeta.
- Las pruebas corren con `cd pruebas && node --test` (no hay `package.json`).
