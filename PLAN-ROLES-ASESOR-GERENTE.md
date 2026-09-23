# Plan — los roles de asesor y gerente

**22 de septiembre de 2026.** Escrito antes de tocar código, con las tres
decisiones de Joan ya tomadas.

---

## Lo que pidió Joan, en sus palabras

> «trabajemos en los permisos del role de asesor, ya que el asesor va a tener
> una lista de prospectos y quiero que el asesor tenga la informacion organizada
> de las ventas del credito y tener organizado cuando tienen que pagar para
> preparar la cobranza y aparte organizarle las herramientas, y que pueda ver
> con claridad sus propios indicadores… y optimicemos junto el role de gerente
> que sera mi mano derecha en la gestion de personal y seguimiento de
> indicadores»

Cinco cosas para el asesor, dos para el gerente.

---

## El hallazgo: no hay que construirlo, hay que encenderlo

**Casi todo está escrito y nada está vivo.** Seis lentes independientes leyeron
el repo y coinciden:

| Lo que Joan pide | ¿Existe? | ¿Vive? |
|---|---|---|
| 1. Lista de prospectos | Sí — `tipo='prospecto'` en `cartera`, embudo de 12 etapas en `app/etapas.js` | ❌ |
| 2. Ventas del crédito organizadas | Sí — las cuatro columnas en `20260919_asesor.sql` | ❌ |
| 3. Cuándo tienen que pagar | A medias — la **etapa** viaja (D-3, D0, M1A), la **fecha** no | ❌ |
| 4. Herramientas | Sí — siete por persona, agenda, freno de Ley 2300 | ❌ |
| 5. Indicadores propios | Sí — `indicadoresDe()` calcula quince cifras… **pero solo las usa la vista del jefe** | ❌ |
| Gerente: personal | A medias — crear y retirar sí; cambiar de jefe o reactivar, no | ❌ |
| Gerente: indicadores | Sí — 18 por asesor, clicables | ❌ |

Comprobado **contra la base real** por HTTP: de las trece funciones que
necesitan los dos roles, **existe una** (`mi_cartera`). Las otras doce contestan
404 hoy mismo.

### Los tres tapones, en fila

Y aquí está lo que no estaba escrito en ningún documento: **destapar el primero
no enciende nada**, porque hay otros dos detrás.

1. **Las dos migraciones no están aplicadas** (`20260911_gerente_y_whatsapp`,
   `20260919_asesor`). Es el tapón visible.
2. **El CRM nunca publica la plata.** `publicarEquipoAhora` arma cada persona
   con `{id, tipo, celular, nombre, estado, etapa}` y nada más. Aunque se
   aplique la migración, `saldo` y `fecha_pago` se quedan en `null` **para
   siempre**, y el asesor sigue leyendo «tu celular todavía no recibe los
   montos» con la migración ya pegada.
3. **El botón de enviar se bloquea a sí mismo.** La pantalla exige
   `DB.socios.length` para comprobar quién respondió SALIR, y `modoEquipo()`
   arranca con `DB.socios = []` **a propósito** — para que nadie que entre en
   el computador de Joan se lleve la cartera colgando de una variable. Esa
   decisión es correcta y no se toca; lo que hay que hacer es que el dato de
   SALIR viaje.

Síntoma que Joan ya ve hoy: cada vez que publica el equipo le sale *«No pude
traer lo que hizo tu gerente… ¿Publico de todas formas?»*. Es `equipo_traer`,
que no existe.

---

## Las tres decisiones de Joan, tomadas

1. **El asesor ve fecha Y monto.** Decisión reafirmada. Consecuencia
   inmediata: el aviso del publicar dice hoy *«Ni cédula, ni dirección, ni
   fotos, ni cuánto debe»* y **dejaría de ser verdad**. Se reescribe en el
   mismo cambio o no se hace. Riesgo que queda dicho y asumido: un asesor que
   pierde el celular, o que se va a la competencia, se lleva la cartera
   valorizada de los suyos.
2. **El gerente sigue con sus cuatro límites.** Crea asesores, no gerentes. Los
   gerentes los nombra Joan. **Cero líneas**: la migración ya lo hace.
3. **El asesor ve su plata completa**: ganado, bloqueado y descontado.

---

## Lo que hay que arreglar ANTES de aplicar nada

`20260919_asesor.sql` **no está aplicada**, así que se corrige en su sitio (la
regla de «nunca editar una migración aplicada» no le toca).

### Los tres defectos de Infobip — son los MISMOS del 16 de septiembre

El archivo repite literalmente tres fallos que ya se arreglaron en
`20260918_infobip.sql`:

- **`sender` vacío.** Manda `'sender', coalesce(remite,'')`. Una cadena vacía no
  es «no mandar el campo»: es un remitente inválido, e Infobip lo rechaza. La
  cuenta de Joan **no tiene número propio**, así que `remite` es null
  **siempre**. El asesor toca el botón, la pantalla dice que salió, y no sale
  nada.
- **`deliveryTimeWindow` en el objeto equivocado.** Va en el `options` de la
  raíz, donde la API v3 no lo reconoce. El proveedor ignora en silencio lo que
  no entiende: 200, entregado, **sin ninguna restricción horaria**.
- **La rama de VOZ no lleva ventana horaria.** Ni bien puesta ni mal puesta.
  Una llamada de cobro automatizada fuera del horario del artículo 3 de la Ley
  2300 — que le aplica **a Joan en persona**, no a una sociedad.

### Y el agujero de capacidad más grande del proyecto

`registro_vivo_publicar` está concedida a **`anon`** (la llave pública, que está
en la página por diseño), **sin tope de tamaño**, **sin comprobar que lo que
llega sean imágenes**, y con clave primaria por celular — así que quien llame
con el celular de otro **le pisa el registro**, mientras esa persona se está
registrando acompañada por teléfono. El comentario del propio archivo afirma lo
contrario.

Con 500 MB de plan gratis, llenarlo deja **toda la fintech en solo lectura**: no
se desembolsa, no se registra un pago, no se contesta el chat. El arreglo son
dos líneas copiadas de su hermana `registro_archivos_guardar`.

### Tres más, pequeños

- `equipo_publicar` de `20260919` **deja de sanear `tipo`**: cambia
  `case when 'cliente' then 'cliente' else 'prospecto' end` por un `coalesce`
  que deja pasar cualquier palabra. Un tipo raro revienta el CHECK y **el
  Publicar entero falla** con un error crudo de Postgres.
- Ese mismo upsert **pisa con null**: un publicar sin los campos de plata
  borraría el saldo y la fecha de todos.
- `asignaciones` no impide dos asignaciones vigentes **el mismo día**, y el
  filtro de toda la seguridad es `desde = max(desde)`. Dos filas empatadas →
  dos asesores ven al mismo cliente.

---

## El plan, por fases y con fechas

### Fase 0 — Arreglar y encender · **hoy, 22-sep** ✅ HECHA
- Los tres defectos de Infobip en `asesor_enviar`, copiados del arreglo bueno.
- El cerrojo de `registro_vivo_publicar`: tamaño, tipo de archivo y dueño.
- Restaurar el saneo de `tipo` en `equipo_publicar`.
- Que el upsert **no borre con null** lo que ya estaba.
- Aplicar `20260911` y `20260919` corregida, y verificar por HTTP.

**Hecho y verificado el 22-sep por la noche.** Las tres migraciones aplicadas
(`20260911`, `20260919` corregida y `20260922k`). Comprobado por HTTP: las trece
funciones contestan, ninguna da 404, y todas las de sesión dan 401 con la llave
pública. El agujero de capacidad se comprobó **atacándolo**: se mandaron ocho
fotos —una que no era imagen, una de 700 KB y seis buenas— y se guardaron
cuatro; se mandaron siete campos del avance incluidos `clave`, `password`,
`gps`, `ubicacion` y `ref1_celular`, y se guardaron dos. Y un tercero sin el
testigo no pudo ni pisar ni borrar el registro ajeno.

Dos cosas se rompieron por el camino y las cazaron sus propios centinelas: una
variable `jefe` que chocaba con la columna `equipo.jefe` (SQLSTATE 42702, la
misma familia que costó un intento esta tarde con `clave`) y un centinela que se
cazó a sí mismo por buscar dos palabras que quedaron en líneas distintas. Las
dos veces la migración entera revirtió, que es exactamente lo que tiene que
pasar.

### Fase 1 — Que la plata llegue al celular · **22-sep** ✅ HECHA
- Publicar `saldo`, `saldo_total`, `fecha_pago` y `creditos`. El CRM **ya los
  calcula** (`panel/crm.html:2131-2137`); hoy solo se usan para armar el SMS.
- Reescribir el aviso del publicar para que deje de prometer lo que ya no
  cumple.
- Publicar el dato de **SALIR**, que es lo que destapa el tercer tapón.

**Hecho y verificado el 22-sep.** `20260922m` aplicada; el CRM publicado en
v96. Comprobado contra la base y contra el sitio en vivo.

Cubre los puntos **2** (ventas del crédito) y **3** (cuándo pagan), y destapa
el tercer tapón: el botón de enviar ya no está muerto.

**Un fallo propio que cazó una prueba**, y vale anotarlo porque va a volver: se
copió el filtro de `casosDeCobroHoy` (`mora / hoy / proximo`) para decidir qué
créditos cuentan. Allí tiene sentido —contesta *«¿a quién le escribo HOY?»*—
pero aquí no: `proximo` son **dos** días, así que un crédito que vence en
**tres** viajaba sin monto y sin fecha. Justo el caso que Joan pidió, porque
*preparar* la cobranza pasa en D-3, no el día del vencimiento. Y excluir los
que tienen acuerdo vigente los borraba de la vista del asesor: un acuerdo mueve
la fecha, no la deuda.

**Y los dos centinelas de privacidad de `cartera.test.js` se cayeron**, que es
exactamente para lo que están. No se borraron: se les movió la frontera y se
escribió quién la movió y por qué. Lo que NO se movió sigue prohibido: cédula,
dirección, correo, fotos, notas de riesgo, código de acceso, ingresos y
referencias.

### Fase 2 — Los indicadores del asesor · **22-sep** ✅ HECHA
- Su tarjeta propia en «Hoy», reusando `indicadoresDe()` — que ya existe y ya
  tiene pruebas.
- Su saldo de comisiones: ganado, bloqueado y descontado.
- Llamar a `envios_asesor_hoy()`, que está escrita, concedida, y **no la llama
  nadie**: hoy el asesor descubre el tope cuando ya se lo negaron.

**Hecho y verificado el 22-sep.** `20260922n` aplicada; CRM en v97.

**Y un arreglo que no era de esta fase.** Esa misma tarde se le había cambiado
la firma a `registro_vivo_borrar` para que pidiera el testigo… **y el cuerpo
nunca lo miró**. Siguió borrando por celular, concedida a `anon`.

Lo peor no fue el agujero: fue que **la prueba dio «bien» por la razón
equivocada**. Comprobaba que después del borrado ajeno se pudiera seguir
publicando con el testigo bueno — y eso pasa igual si la fila se borró, porque
entonces `publicar` crea una nueva y contesta `ok`. La prueba medía otra cosa.

*Probar que algo corre no es probar que haga lo que dice.* La prueba nueva mira
**la fila**, y la de HTTP no puede mentir: un tercero con otro testigo recibe
`ocupado`, que solo puede pasar si la fila sobrevivió.

Y `cuantosQuedanHoyEq` leía `j.quedan` cuando la función devuelve `{hoy, tope}`.
No daba error: daba `NaN`, y la cifra **no se habría pintado nunca** — o sea que
el aviso habría seguido sin existir después de escribirlo.

### Fase 3 — La cobranza organizada · **24-sep**
- Pantalla «Cuándo cobrar»: hoy / esta semana / vencidos, con la fecha de
  verdad y no solo la etiqueta de etapa.

### Fase 4 — Gestión de personal de verdad · **25-sep**
- Cambiar de jefe, ver y reactivar a un retirado, y **reasignar la base de quien
  se va antes de retirarlo** — hoy al retirar a alguien su cartera se queda
  colgando de un celular inactivo y **deja de verla nadie**.
- El tope semanal de la Ley 2300 **en el servidor**, no solo en la pantalla: es
  el que trae la multa, y hoy un asesor con la consola abierta manda sesenta al
  mismo cliente.
- Índice único en `asignaciones` para que el empate del mismo día no exista.

---

## Lo que NO entra en este plan, y por qué

- **Metas por asesor.** Joan eligió indicadores sin meta. Añadirlas pide una
  tabla nueva y decidir quién las fija.
- **Que los actos de comisión viajen enteros.** Para la Fase 2 basta con
  publicar el saldo; mover el libro entero de comisiones a la nube es otra
  decisión y otro tamaño.
- **Asistencia y último ingreso.** No existe nada y Joan no lo pidió con esas
  palabras.
