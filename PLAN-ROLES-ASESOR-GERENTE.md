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

### Fase 0 — Arreglar y encender · **hoy, 22-sep**
- Los tres defectos de Infobip en `asesor_enviar`, copiados del arreglo bueno.
- El cerrojo de `registro_vivo_publicar`: tamaño, tipo de archivo y dueño.
- Restaurar el saneo de `tipo` en `equipo_publicar`.
- Que el upsert **no borre con null** lo que ya estaba.
- Aplicar `20260911` y `20260919` corregida, y verificar por HTTP.

**Al terminar**: el gerente puede crear asesores y repartir; desaparece el
«¿Publico de todas formas?»; el asesor entra y ve su base.

### Fase 1 — Que la plata llegue al celular · **23-sep**
- Publicar `saldo`, `saldo_total`, `fecha_pago` y `creditos`. El CRM **ya los
  calcula** (`panel/crm.html:2131-2137`); hoy solo se usan para armar el SMS.
- Reescribir el aviso del publicar para que deje de prometer lo que ya no
  cumple.
- Publicar el dato de **SALIR**, que es lo que destapa el tercer tapón.

**Al terminar**: puntos 2 y 3 de Joan, y el botón de enviar deja de estar muerto.

### Fase 2 — Los indicadores del asesor · **23-sep**
- Su tarjeta propia en «Hoy», reusando `indicadoresDe()` — que ya existe y ya
  tiene pruebas.
- Su saldo de comisiones: ganado, bloqueado y descontado.
- Llamar a `envios_asesor_hoy()`, que está escrita, concedida, y **no la llama
  nadie**: hoy el asesor descubre el tope cuando ya se lo negaron.

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
