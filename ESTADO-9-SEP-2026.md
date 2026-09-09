# Parte del 9 de septiembre de 2026 — una sola puerta

> El anterior es `ESTADO-8-SEP-2026.md`. Este cuenta lo de hoy y lo que quedó
> pendiente. Lo primero que tienes que hacer está en «Lo que te toca a ti».

## En una frase

El botón «No tengo mi código» ya no manda a WhatsApp: manda al registro, para
nuevos y para antiguos. En el CRM aparece una **mesa de cruce** que junta al que
se registró con la ficha vieja que ya tenías, sin crear una segunda. Y el
escáner del rostro, que hasta ayer disparaba con un reloj, ahora dispara cuando
de verdad hay una cara centrada y quieta.

**995 pruebas en verde** (54 nuevas). Commit `14b6c3a`.

---

## Lo que te toca a ti, en orden

1. **HOY — las CUATRO migraciones, en este orden**, en el SQL Editor de Supabase
   (New query → pegar todo → Run):
   1. `base/20260908_primer_credito.sql` — **va corregida** (ver abajo: traía un
      dominio muerto que la habría dejado sin funcionar en silencio).
   2. `base/20260908b_registro_archivos.sql`
   3. `base/20260909_una_sola_puerta.sql`
   4. `base/20260909b_topes_arriba.sql` — sube el tope del servidor a 8.000.000.
      Sin ella, el cliente que mueva la calculadora por encima de dos millones
      recibe un error de conexión que es mentira.
   Las cuatro son idempotentes y traen su comprobación al final: si algo no queda
   como debe, la última línea revienta a propósito y te dice qué.
2. **Prueba el registro desde tu celular.** La cámara no se puede probar sin
   teléfono: el escáner y el código de barras de la cédula los tienes que ver
   tú. Registra una cuenta de prueba con TU número (que ya es cliente) y mira
   que en Registrados salga «🔗 Ya es tu cliente».
3. **Descarta los registros de PRUEBA** que queden en la bandeja.
4. **Tu abogado**, dos cosas nuevas: la fila de ubicación y la de datos técnicos
   del aparato en `legal/privacidad.html`, y que la política de privacidad
   todavía dice «la selfie sosteniendo tu cédula» cuando el escáner pide una
   selfie a secas (ver «Lo que queda pendiente»).
5. **Antes del 1 de octubre:** la certificación de usura de octubre en `TOPES`
   de `app/creditos.js`. El vigilante de GitHub te avisa los días 16, 22 y 27.

---

## El defecto de fondo no era el botón: era la base

`registrar_abierto` tenía esto antes de guardar:

```sql
if exists (select 1 from registros ...)
   or exists (select 1 from socios_historial where celular = cel or ...)
then return jsonb_build_object('ok', true); end if;
```

El segundo `exists` significa: **si ya eras cliente de Joan, tu registro no se
guardaba**. La app contestaba «listo» y la fila no existía. Mandarle el enlace a
los 16 clientes habría hecho que los 16 llenaran nueve pasos, con foto de cédula
y de rostro, para que a la bandeja no llegara ninguno.

Se quitó ese `exists`. Lo que no se quitó es el motivo por el que se escribió:
que la respuesta al teléfono no delate quién es cliente. Sigue siendo idéntica en
todos los casos.

### Y la lección que costó la auditoría: una respuesta igual no basta

Los dos caminos de éxito devolvían el mismo `{"ok": true}` pero **no hacían lo
mismo**: el que insertaba llamaba `limpiar_fallos` y el que se rendía no. Ese
contador es observable desde afuera — se queman unos intentos con datos malos,
se registra bien, y si el freno se soltó eras desconocido. La respuesta era
idéntica y el oráculo funcionaba igual. Ahora `limpiar_fallos` va **antes** de la
bifurcación.

Queda escrito lo que **no** se cerró: el signup de Supabase que corre justo
después contesta distinto si el celular ya tiene cuenta, y la app se lo dice a la
persona («Ya hay una cuenta con ese celular»). Es información que el dueño del
número necesita para no registrarse dos veces; cerrarlo de verdad pide verificar
el celular por SMS, que hoy no existe. **Se asume a conciencia.**

---

## La mesa de cruce

**La ley de quién es quién vive en `app/puente.js`** (`candidatosDeCruce`) y **no
cruza a nadie**: devuelve candidatos con el motivo del parecido.

> **La cédula manda sobre el celular.** Misma cédula es la misma persona aunque
> el número haya cambiado. Mismo celular es la misma persona solo si ninguna
> cédula lo contradice — el celular se hereda, se presta y el operador lo recicla
> a los tres meses. Si las dos cédulas existen y difieren, son **dos personas**, y
> el celular igual es una duda que se muestra, nunca un cruce.

Hay un tercer motivo, el más flojo: el **nombre**. Existe por tu caso — una ficha
vieja sin cédula y con el número cambiado no aparea con nada, y tú eres el único
que reconoce a esa persona. Sale marcado como duda y de último.

**En el CRM** (`mesaDeCruce` en `panel/crm.html`): el historial de esa persona
(para que sepas a quién estás juntando con quién), campo por campo lo que tenías
contra lo que declaró, sus fotos y desde dónde se registró. Tú marcas qué tomar.

El cruce **no se guarda como campos rellenados**: se guarda como un **hecho
fechado** en `s.cruces[]`, que es una lista que suma (`panel/nube.js`). Si se
guardara como campos sueltos, la fusión entre el computador y el celular no
tendría cómo saber cuál versión es la nueva.

### El hallazgo: completarle la ficha a un cliente le sube el cupo

Medido contra el motor, con una ficha real:

| lo que se completa | cupo |
|---|---|
| nada (la ficha como está) | $10.000 |
| + ciudad | $15.000 |
| + barrio | $15.000 |
| + tipo de vivienda | $15.000 |
| + referencia | $20.000 |
| + ingreso por quincena | $10.000 — **no lo mueve** |

O sea que los campos que yo había marcado a mano como «livianos» son justo los
que valen plata, y el que marqué como pesado *por ser plata* no la mueve.
**Adivinar cuáles son fue el error.** Ahora no hay lista: el CRM le pregunta al
motor con la ficha simulada, campo por campo, y

- no premarca nada que mueva el cupo,
- escribe al lado de cada casilla cuánto cupo da,
- y pide la confirmación de identidad antes de aceptarlo.

El día que cambien las reglas de la garantía, el freno cambia solo.

---

## El escáner del rostro ya mira

Hasta ayer la pantalla decía «la foto se toma sola cuando tu rostro está quieto y
centrado» y disparaba con `if (t >= 3.2)`: puro reloj. Apuntando al techo, la
foto salía igual. La regla de la casa es que la interfaz no promete lo que el
código no hace, así que o se quitaba la frase o se hacía la comprobación.

`U.medirEncuadre(gris, previa)` en **`app/cuenta.js`** —función pura, probada con
fotogramas de mentira— mira cuatro cosas del recorte del óvalo: hay luz, hay
detalle en el centro, el detalle está **dentro** del óvalo y no afuera, y no se
mueve. Diez cuadros seguidos en verde y dispara. El óvalo está punteado y ámbar
mientras busca, entero y verde cuando engancha, y el aro de progreso sale de la
**racha** — si te mueves, se cae y vuelve a empezar.

**No es biometría, y es una decisión, no un atajo.** No saca vector facial, no
compara con la cédula, no distingue una cara de un cartón con una foto impresa.
Un detector de rostros de verdad en el teléfono convertiría la selfie en dato
**biométrico** —sensible bajo la Ley 1581— y obligaría a rehacer la ficha de Data
Safety. El parecido con la cédula lo sigue calculando tu CRM, en tu computador,
donde ese tratamiento sí está declarado.

Los umbrales están juntos y con nombre en `U.ENCUADRE`, porque son lo único que
hay que calibrar con teléfonos de verdad. **El botón «Tomar la foto ahora» nunca
desaparece**, y a los 18 segundos la pantalla lo recuerda: quedarse atascado en
el paso 3 de 9 con el teléfono en la cara es peor que una foto mal encuadrada.

---

## Cuatro defectos vivos que aparecieron de paso

1. **El dominio muerto.** `celular_de_sesion()` validaba el correo interno contra
   `socios.tugarantia.co`, un dominio que se cambió el 28-ago a `tugarantia.net`
   porque no existía. Devolvía `null` **siempre**. Las dos migraciones del 8-sep
   que no habías pegado no habrían funcionado: ni el primer crédito, ni las
   fotos, ni el GPS — y sin un solo error en pantalla.
2. **El tipo de sangre.** El código de barras de la cédula lo trae y se estaba
   subiendo dentro de la huella. Es dato de **salud** (sensible, Ley 1581, con
   finalidad propia) y no decide un peso. Se tira en el teléfono antes de tocar
   disco o red.
3. **La ficha de Data Safety decía dos mentiras**, y se publican en
   `PLAY-FICHA.md`: que la app no recoge ubicación (la pide desde el 8-sep) y que
   no recoge datos de salud (subía el RH). Ahora el GPS y los datos técnicos del
   aparato están declarados, y el RH ya no se recoge.
4. **«Arriendo» se guardaba como «casa».** Un `|| 'casa'` en los dos caminos que
   crean ficha desde un registro: sin error, y con garantía de más. Ahora hay
   **un solo mapeo** (`PUENTE.fichaDeclarada`) y no inventa nada.

---

## Lo que queda pendiente, y por qué no se hizo hoy

- **El antiguo puede pedir su «primer crédito» de novato.**
  `solicitar_primer_credito` no consulta `socios_historial`: un cliente con cupo
  de dos millones que se registre recibe la contrapropuesta de 100.000 al 35% a 8
  días. Si acepta, eso es lo que dice la bandeja. Hoy lo tapa que **tú desembolsas
  a mano** y ves su historial en la mesa antes de hacerlo — pero es una ventana
  abierta y hay que cerrarla en la base.
- **Nadie funde dos fichas viejas entre sí.** El cruce junta registro↔ficha. Si
  una persona ya tiene DOS fichas tuyas (pasa: se crean por tres caminos que
  nunca comprobaron duplicados), eso sigue sin resolverse.
- **El duplicado entre el computador y el celular.** `panel/nube.js` empareja
  socios por `id`: dos fichas de la misma persona creadas en dos aparatos son dos
  personas para la nube. Cruzar en el computador no deshace el duplicado del
  celular.
- **La bandeja no avisa.** El registro solo aparece si entras al CRM y aprietas
  «↻ Traer de la nube». El cliente que llenó nueve pasos y se fotografió la cédula
  puede esperar días sin que nadie se entere.
- **Las fotos no suben en el caso más probable.** `subirArchivosRegistro()` está
  dentro de la rama de éxito del signup; el antiguo que ya tiene cuenta cae en la
  rama de «ya existe» y nunca las sube.
- **La mesa de cruce no cabe en un celular.** Son cinco bloques con confrontación
  campo por campo: es una pantalla para leer sentado.
- **La política de privacidad describe un proceso que no existe:** dice «la selfie
  sosteniendo tu cédula» y el escáner pide una selfie a secas. Y la llama dato
  biométrico mientras `app/cumplimiento.js` la declara como una foto. Las dos
  cosas no pueden ser ciertas a la vez.
- **Lo del 4-sep que sigue:** el bloque del acuerdo de prórroga en
  `AUDITORIA-4-SEP-2026.md`, el chat (fases 2–5), el Enforce HTTPS.

---

# La tarde del 9: la vitrina, los topes, y la pregunta de la plata

## El bug de la cámara (commit `6f79f6d`)

«Toma la foto de la cédula y el sistema los devuelve.» No fallaba la foto:
`<input capture>` abre la cámara del sistema, Android descarta la pestaña por
falta de memoria, la página recarga y `pintarRegistro(0)` mandaba al paso 1 —
con la contraseña perdida (vivía solo en memoria) y sin la foto, porque el
`onchange` nunca llegó a dispararse. Un lazo.

Arreglado por tres lados: se recuerda el paso (sessionStorage), la contraseña
sobrevive la recarga (sessionStorage, **nunca** localStorage) y la foto se lee
con `createObjectURL` en vez de convertirla en base64 — una foto de 4 MB se
volvía una cadena de 5,3 MB justo cuando el teléfono estaba peor de memoria.
Reproducido antes y verificado después.

## La vitrina (commit `c1cfc72`)

La portada de `play/` es una calculadora: monto y plazo movibles, cifras del
motor, letra legal pegada al lado. Debajo, la escalera del producto, la historia
y cómo se sube, plegadas. Botones con cuerpo, brillo que barre, y el rayo que
sale de donde se toca (tope de tres, se apaga solo, se autodegrada, respeta
`prefers-reduced-motion`).

**Lo que NO se hizo, y el motivo está medido:** no hay una pantalla que parezca
«tu cuenta». Un nombre inventado y una cinta no arreglan una cifra que la
plataforma no puede desembolsar: le ponen dueño y la vuelven más creíble. Se
enseña el producto con su escalera real. Tampoco se usa «garantía» como
mecánica —es del quincenal, otro producto— ni se pide el permiso de
notificaciones, porque no existe el emisor (`sw.js` no escucha `push`).

De paso salió un defecto que habría nacido con la calculadora: la letra legal
decía «plazo mínimo y máximo: 6 meses» mientras se iban a ofrecer 3. Y la tasa
efectiva **no es la misma en todos los plazos**: con 500.000 la más alta cae en
CINCO meses (23,9947%), por encima de la de seis (23,9788%). Ahora la
divulgación declara el rango y **busca** la más alta en vez de suponerla.

## Los topes a 8 millones (commit `40badf7`)

Decisión de Joan. Preferente 2.000.000 → **8.000.000**; recurrente 1.000.000 →
**3.000.000**. La calculadora y la escalera se mueven solas porque leen
`PERFILES`; los dos sitios que tenían el número a mano ahora lo piden.
El servidor sube con ellos: `base/20260909b_topes_arriba.sql`.

**Lo que falta decidir, y está medido:** el plazo sigue en 3–6 meses.

| monto | 6 meses | 12 meses | 18 meses |
|---|---|---|---|
| $6.000.000 | $1.064.200 | $560.700 | $393.500 |
| $8.000.000 | $1.418.933 | $747.600 | $524.666 |

La tasa está muy por debajo del techo de usura (24% contra 29,24%), así que el
freno no es legal: es que esa cuota tiene que caberle a alguien.

## Y por fin, las pruebas EJECUTAN `play/`

Era el único archivo con JavaScript pesado que ninguna prueba corría, y es el
que abre el desconocido. Hoy costó: al borrar la tarjeta vieja se fue con ella
la función `fila`, y la página quedó **en blanco** («fila is not defined»).
Compilaba perfecto. Lo vio el navegador, a mano.

Ahora hay un arnés que ejecuta la página (mismo patrón que `panel.test.js` con
el CRM) y comprueba que la portada pinta, que los nueve pasos del registro
pintan, y que las cifras en pantalla son las del motor. **1.020 pruebas.**

## LA PREGUNTA DE LA PLATA — lo más importante de esta tarde

Joan pidió comisiones para asesores: 5.000 por registro, 15.000 por
desembolso, 10.000 al pago (= **30.000 por cliente colocado**), 5.000 por cada
cobranza siguiente, −10.000 si el cliente llega a 20 días de mora.

Ninguno de los tres diseños calculó si el negocio aguanta. El costo del
quincenal es **siempre el 20% del capital** (`motor.js`):

| capital | Joan gana | comisión | le queda |
|---|---|---|---|
| $100.000 al 35% (primer crédito) | $35.000 | $30.000 | **$5.000** |
| $100.000 al 20% (estándar) | $20.000 | $30.000 | **−$10.000** |
| $200.000 | $40.000 | $30.000 | $10.000 |
| $400.000 | $80.000 | $30.000 | $50.000 |

**Punto de equilibrio del primer ciclo: $150.000 al 20%.** Por debajo de ahí,
cada cliente nuevo que trae un asesor le cuesta plata a Joan — y ese es
justamente el tamaño de crédito de su segmento. Desde el segundo ciclo la
recurrencia de 5.000 sí deja margen ($15.000 sobre un crédito de 100.000).

Esto no es una objeción al plan: es el número que decide si el esquema se
aplica a todos los créditos o solo por encima de cierto monto. **Es decisión de
Joan y está sin tomar.**

## El CRM en la nube: media pieza ya existe

Joan dijo «subamos el CRM a la nube también». La buena noticia, verificada:
`base/20260811_panel_nube.sql` **ya tiene la cartera completa en Supabase**
(`panel_socios`, `panel_creditos`, `panel_respaldados`, con el objeto entero en
jsonb). Lo que falta no es el dato: es la columna que diga de quién es cada
fila.

Los tres obstáculos reales, medidos:

1. **`panel_es_dueno()` es todo o nada** — un uid está en `panel_duenos` o no
   está. Meter ahí a un asesor le entrega los 16 clientes y le deja
   reescribirlos (`panel_empujar` no filtra).
2. **`panel/crm.html` ni siquiera carga `nube.js`** y no tiene sesión de
   Supabase Auth: hoy el CRM no puede llamar a `panel_traer`. La cartera en la
   nube la usan `espejo.html`, `subir.html` y `traer.html`, no el CRM.
3. **El PIN no es una puerta, es un cartel**: se compara en JavaScript contra
   `DB.config.pin` y se muestra en texto plano en Ajustes.

Y cero líneas de rol, asesor, gerente o comisión en todo el repositorio: se
parte de cero en esa parte.


---

## Trampas para la próxima sesión

- **`registrar_abierto` ya no mira `socios_historial`, y su migración lo
  comprueba.** Si alguien vuelve a meter esa consulta «para no llenar la
  bandeja», el cliente antiguo desaparece otra vez en silencio.
- **En una puerta abierta, cada rama tiene que dejar la base en el mismo
  estado**, no solo devolver la misma respuesta. `limpiar_fallos`, `pg_sleep` y
  el número de escrituras contestan lo que la respuesta se niega a contestar.
- **La cédula no es un campo: es la llave del cliente en la nube.** Cargarla
  sobre una ficha que subía por celular muda la fila entera. Desde hoy
  `sincronizar_socios` rescata `codigo_hash` y `codigo_propio` antes del
  `delete`; sin eso, completarle la ficha a un cliente lo dejaba sin poder entrar
  a su app, y justo el día que le completabas la ficha.
- **Qué campos valen plata NO se escribe a mano.** Se le pregunta al motor con la
  ficha simulada (`mueveElCupo` en `crm.html`). La lista escrita a dedo ya estuvo
  al revés una vez.
- **El campo `cedula` de una SOLICITUD no es la cédula: es el identificador** —
  el socio entra con cédula o con celular y la nube guarda el que usó, en el
  mismo campo. Pasárselo tal cual a `fichaDeclarada` le mete el celular en la
  casilla de la cédula (pasó hoy; lo cazó una prueba).
- **Nada de `faceapi`, `landmark` ni dominios nuevos en `play/`**:
  `cumplimiento.test.js` los tumba a propósito, y ahora también vigila que el
  escáner no vuelva a disparar por tiempo.
- **`renderRegistros` no pinta sin nube conectada** (y hace bien: esa bandeja
  llega por la nube). En las pruebas hay que darle una configuración de mentira.
