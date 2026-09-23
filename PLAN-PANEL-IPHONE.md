# El CRM en tu iPhone — qué hay, qué falta, y en qué orden

22 de septiembre de 2026. Escrito después de inventariar **458 capacidades** del
CRM, del espejo, de la nube y de iOS con catorce lentes, y de comprobar a mano
todo lo que decide algo.

---

## La respuesta corta

**Ya existe y se llama `panel/espejo.html` — «Panel en el bolsillo».** 3.572
líneas, pensada para teléfono desde el primer día: `env(safe-area-inset-*)` para
el notch, cero `100vh`, botones de 44px, cola para trabajar sin señal y
detección de choques entre el computador y el celular.

No hay que construir un CRM móvil. Hay que **quitar tres cosas de en medio** y
**subir cuatro capacidades** que se quedaron en agosto.

---

## Lo que comprobé, y que contradice al propio repo

**La nube del Panel SÍ está aplicada.** Tres documentos del repo dicen lo
contrario, con estas palabras:

| Dónde | Qué dice |
|---|---|
| `base/20260811_panel_nube.sql:705` | «NADA DE ESTE ARCHIVO SE CORRIÓ TODAVÍA CONTRA UNA BASE DE VERDAD» |
| `RECETA-PANEL-NUBE.md:429` | «El SQL no se ha ejecutado jamás» |
| `panel/subir.html:210` | «Esto nunca se ha corrido contra datos de verdad» — **y esto se lo dice a Joan en la pantalla** |

Las cinco funciones existen hoy en producción. Probadas por HTTP **con sus
firmas de verdad**, que es la única forma que vale: PostgREST resuelve por
nombre **y** parámetros, así que llamarlas con `{}` da 404 sobre algo que
existe. Con la firma buena las cinco contestan 401 —«existes, pero no traes
sesión»—, y las tres tablas contestan `42501`, que es permiso denegado sobre una
tabla que está ahí.

```
panel_es_dueno()                          401  existe
panel_traer(p_desde)                      401  existe
panel_empujar(p_dispositivo, p_lote)      401  existe
panel_siguiente_numero(p_nombre)          401  existe
panel_sembrar_contador(p_nombre, p_valor) 401  existe
```

**Documentación desactualizada es un bug**, y este casi me hace decirte que
había que empezar de cero.

---

## Lo que bloquea, por orden de lo que cuesta

### 1. La sincronización puede borrar plata. Está documentado y reproducido.

`RECETA-NUBE-CRM.md` enumera **22 escenarios**, varios marcados `[pierde_plata]`
y uno `[pierde_datos]`, todos reproducidos con node contra el `nube.js` de
verdad. **El diseño de la reparación está escrito. No está construido.**
Comprobado: `filtrarPaquete` 0 apariciones, `nubeBorrados` 0, `escribirEspejo`
0.

Los dos que más pesan:

- **El cobro del martes.** La bajada de la misma vuelta revierte lo que
  escribiste durante el viaje. Mecanismo comprobado en la fuente:
  `panel_empujar` devuelve `aplicados`, `revisiones` y `choques` — **no devuelve
  `servidor_ahora`** (`base/20260811_panel_nube.sql:551`), así que la marca de
  agua nunca avanza. Un cobro desaparece *sin choque, sin aviso y sin que nadie
  pueda notarlo*.
- **El libro que se vacía.** `armarLote` fabrica borrados a partir de una resta
  entre dos estructuras, y `marcarBorrados` **viene en `true` por defecto**
  (`panel/nube.js:650`); `subir.html` lo llama sin pasarlo. El servidor los
  acepta con la revisión buena y sin choque. Se dispara con cosas normales:
  importar un respaldo viejo, dos pestañas del CRM abiertas, o `modoEquipo()`,
  que vacía la cartera en memoria **a propósito**.

**Hasta que esto se arregle, el espejo sirve para MIRAR, no para trabajar.**

### 2. iOS puede borrarte los cobros a los siete días, y la pantalla promete que no.

La Prevención de Rastreo Inteligente de iOS borra todo el almacenamiento de un
sitio tras **siete días** sin visitarlo. Ahí viven las tres llaves del espejo:
la cartera espejada, **la cola de cobros sin subir** y los choques sin decidir.

La cartera se vuelve a bajar. **La cola no**, porque nunca llegó al servidor.

Y está al revés: `navigator.storage.persist()` se pide en `panel/crm.html:1120`
—el Windows de Joan, donde nadie borra nada— y **no se pide ni una vez en
`espejo.html`**, que es el único aparato donde iOS sí borra.

Encima, `abrirCola` te dice por escrito: *«está guardado en este teléfono y
sigue ahí hasta que suba: no se pierde por cerrar la app»*. Con ITP eso es
falso a los siete días. **La interfaz no promete lo que el código no cumple** —
esta frase lo incumple hoy.

Añadirla a la pantalla de inicio reduce el riesgo, pero no se puede dar por
hecho: el almacenamiento del icono instalado puede ser **distinto** del de
Safari, y eso se ve exactamente igual que «se perdieron mis datos».

### 3. El único sitio donde le escribes a un cliente hace zoom.

Medido en navegador: el recuadro del chat computa **15px**. `app/chat.css:95`
declara `.ch-escribir textarea{font-size:15px}` y ese selector le gana por
especificidad a la regla de 16px del espejo. Por debajo de 16, Safari hace zoom
solo al enfocar — y ya no vuelve.

---

## Lo que el espejo no sabe hacer todavía

De las 458 capacidades inventariadas, esto es lo que te faltaría en la calle:

| Falta | Dónde está hoy | ¿Duele? |
|---|---|---|
| **Crear un crédito nuevo** y simularlo antes (cupo, ganancia, E.A.) | `crm.html:4903` | **Sí.** Es la venta entera: «te presto X, me devuelves Y el día Z» |
| **Leer el WhatsApp pegado** y prellenar el crédito | `crm.html:4922` | Sí — y en el móvil el mensaje ya está en el teléfono |
| **Cámara**: comprobante de pago, foto de la cédula | `crm.html:5556` | Sí |
| **El chat con el equipo y con los clientes** (con fotos) | `crm.html`, modo equipo | Sí |
| Prórroga con perdón de mora o costo | el espejo prorroga, pero sin perdonar | A medias |
| Editar la ficha de un cliente | `crm.html:4787` | No |

Lo que **sí** puedes hacer ya desde el celular, y conviene saberlo: cobrar con
el monto real y su desglose, perdonar mora **y** costo en un cobro, abonar a
capital, cobrar una cuota del plan de pagos, crear un cliente (con señal),
buscar, ver ficha y crédito, y mandar el WhatsApp con el freno de la Ley 2300.

---

## El orden que propongo, con fechas

**Fase A — que no se pierda nada. ✅ HECHA el 23-sep-2026.**
Las cinco cosas, con 19 pruebas nuevas y comprobado en navegador. La de
`persist()` contestó **que no**, así que la frase que prometía «no se pierde»
era falsa el mismo día en que se corrigió.

Lo que entró: `navigator.storage.persist()` en el espejo; `encolarYGuardar` deja
de tragarse el «no cupo» y la pantalla lo enciende; la cola con fecha y no solo
la hora; el recuadro del chat a 16px; y corregidas las frases que prometían de
más — la del espejo y las de los tres documentos que decían que la nube no
existe.
*Esto no arregla la sincronización: hace que cuando falle, se vea.*

**Fase B — que se pueda trabajar sin perder plata. ✅ HECHA el 23-sep-2026.**
El defecto que perdía plata resultó estar en `quitarDeCola`, no donde decía la
receta: lo que se escribe mientras la petición viaja se borraba de la cola sin
haber subido. Reproducido primero, arreglado después. Y el freno de borrados,
con sus dos topes. 23 pruebas nuevas.

~~**Fase B (3–4 días, 24 al 27-sep).**~~
Las dos capas que el propio repo ya diseñó: los borrados salen de un registro
explícito y no de una resta (`marcarBorrados:false` siempre), y el paquete que
baja se filtra contra lo que acabas de subir. Con sus centinelas.
*Hasta aquí no llegamos, el espejo es de solo mirar y hay que decirlo en pantalla.*

**Fase C — vender desde la calle. ✅ HECHA el 23-sep-2026.**
Simulador en vivo y crédito registrado desde el teléfono, con el número emitido
por la nube. De paso salió que `crm.html` lleva una copia propia de la E.A. que
ya vivía en `app/creditos.js`: el espejo usa el módulo, y una prueba exige que
las dos que ya existen sigan de acuerdo.

~~**Fase C (2–3 días, 29-sep al 1-oct).**~~
Crear el crédito en el teléfono: simulador, pegar el WhatsApp, y el número de
cliente pedido a la nube para que dos aparatos no choquen.

**Fase D — la cámara y los chats (2 días).**
Comprobante y cédula desde el iPhone, y traer al espejo el chat con clientes y
con el equipo, que ya existen en el CRM.

---

## Lo que NO hay que hacer

**Abrir `panel/crm.html` en el iPhone.** Tiene un `@media` a 880px que apila la
barra lateral, así que «se ve» — pero las tablas conservan `min-width:560px` y
se navegan de lado, las seis pestañas se pintan **todas** en cada render, y
sobre todo: `crm.html` lee y escribe **solo** el `localStorage` del navegador
que la abre, y no tiene ningún botón que traiga la cartera de la nube. En tu
iPhone saldría un CRM impecable y en ceros.

La única excepción, y funciona hoy: la puerta de **equipo** del mismo archivo
(`crm.html:485`), donde se entra con celular y contraseña y los datos vienen de
la nube. Es el modo que usan tus asesores.
