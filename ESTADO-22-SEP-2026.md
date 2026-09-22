# Estado — 22 de septiembre de 2026

Lo que pidió Joan el 21-sep: *«el chat como unico canal continua y tambien el
credito a medida y que las fotos queden guardadas, escribe el codigo y migra»*.

---

## 1. El chat quedó encendido

Llevaba semanas **contestando 404**. La app de `play/` tenía las cuatro pestañas
y los tres canales pintados desde el 14-sep, y llamaba a `chat_leer_sesion` y
`chat_escribir_sesion`, pero esas funciones **no existían en la base**: la
migración estaba escrita en el repo y nunca se había corrido.

Se aplicó `base/20260914b_tres_canales.sql`, que trae:

| Función | Para qué |
|---|---|
| `chat_escribir_sesion` | el socio escribe, en uno de los tres canales |
| `chat_leer_sesion` | trae su hilo y marca lo suyo como visto |
| `llave_de_sesion` | resuelve si el hilo va por cédula o por celular |
| `mi_cuenta` | la ficha del socio, solo si su cuenta está vinculada |
| `vincular_cuenta` | pega el historial viejo a la cuenta nueva, con su código |

**Probado llamándolas de verdad**, no solo creándolas: 16 comprobaciones dentro
de una transacción que se deshace al final. Entre ellas, las tres que importan
de seguridad — otro teléfono no se roba una cuenta ya vinculada, no lee el
historial ajeno y no lee el chat ajeno.

> Por qué se prueba así y no mirando que la función exista: el cuerpo de una
> función PL/pgSQL **compila en la primera llamada, no al crearla**. Es
> exactamente como se perdieron 13 días de fotos de clientes este mes.

---

## 2. El crédito a la medida

`base/20260922_a_la_medida_y_ayuda.sql`.

- `solicitudes` tiene tres columnas nuevas: `pedido_monto`, `pedido_plazo`,
  `pedido_nota`. **Lo que pide el cliente se guarda aparte de la propuesta**,
  así que cuando Joan contrapropone otra cifra la original no se pierde.
- `play_solicitar` acepta de **50.000 a 50.000.000** (antes: 100.000 a
  8.000.000) y **dice por qué** cuando rechaza. Antes los cinco casos salían con
  la misma frase.
- En la app: el deslizador se queda, y al lado hay una casilla para escribir
  cualquier cifra y una línea para decir para qué la quiere.
- En el CRM: la bandeja muestra esa nota, entre comillas, y —si Joan ya
  contrapropuso— cuánto había pedido el cliente.

### El fallo que encontró la prueba

`mi_solicitud` y `solicitar_primer_credito` ordenaban por `creada_en desc limit 1`
**sin desempate**. `creada_en` sale de `now()`, que es la hora de inicio de la
transacción: dos solicitudes en el mismo segundo quedaban con la misma marca y
la base devolvía **una al azar**. Joan podía contraproponer sobre una fila
mientras el cliente miraba la otra.

Arreglado en `base/20260922b_desempate.sql`, que no copia los cuerpos de las
funciones: le pide a PostgreSQL su propia definición con `pg_get_functiondef`,
cambia esa línea y la vuelve a ejecutar.

---

## 3. El número de Joan salió de la app del cliente

Se fue `WA_NEGOCIO`, se fue `abrirWhatsApp()`, y **once frases** que prometían
WhatsApp ahora dicen «en el chat de la app». Dos de ellas ya eran falsas:
decían *«el chat todavía no está encendido»* horas después de encenderlo.

También salió de `legal/privacidad.html`. El correo se queda, que es lo que la
Ley 1581 necesita para poder ejercer el habeas data, y se nombra el chat como
segundo canal.

### «Olvidé mi contraseña»

No podía pasar al chat: **el chat exige sesión y quien olvidó la contraseña es
justamente el que no puede abrirla**. Así que deja un recado en `ayudas_clave`,
la única función del sistema llamable sin sesión — con su freno, con RLS y sin
políticas, y guardando solo un celular y una nota corta.

El CRM tiene su lista, y el mismo botón «Buscar en la nube» la trae junto con
las solicitudes. Un botón aparte para algo que se mira una vez al día es un
botón que nadie toca.

---

## 4. Lo que **no** se hizo, y por qué

**«El algoritmo está verificando tu información».** Joan la pidió. Se volvió a
barrer `motor.js`, `creditos.js`, `cumplimiento.js` y las funciones de `base/`:
lo único automático que existe es el **cálculo** de la propuesta y unos frenos
contra el abuso. **No se verifica ni un solo dato del cliente** — ni
Registraduría, ni central, ni nada. Hay un centinela en las pruebas que impide
escribir esa frase, y se borra el día que se encienda una verificación de
verdad, en el mismo commit que la enciende.

Lo que sí dicen las pantallas ahora: que se revisa y que se contesta por el
chat. Es cierto, y es lo que el cliente necesita saber.

---

## 5. Lo que queda pendiente

### Las fotos: el arreglo está puesto pero **sin probar en producción**

`registro_archivos` sigue en **cero filas**. El arreglo del 21-sep —el `huella`
ambiguo que tumbaba el guardado— está aplicado, y el de la sesión perdida
también, pero **nadie se ha registrado desde entonces**, así que no hay ninguna
prueba real de que las fotos lleguen. Las de Sofía no se pueden recuperar: vivían
en el navegador de su teléfono.

**El siguiente registro de verdad es la prueba.** Después de él hay que mirar:

```sql
select tipo, count(*) from public.registro_archivos group by tipo;
```

Si sale vacío, el problema no era el que creíamos.

### Migraciones escritas que siguen sin aplicarse

| Archivo | Qué deja sin funcionar |
|---|---|
| `20260911_gerente_y_whatsapp.sql` | `equipo_traer` — el CRM lo llama |
| `20260916_contrapropuesta_a_cuotas.sql` | contrapropuesta a cuotas en el CRM |
| `20260917_ruleta.sql` | la ruleta de cupo, en la app y en el CRM |
| `20260919_asesor.sql` | **NO aplicar todavía**: tiene tres defectos documentados y publicaría una pantalla de envío que no envía |

### Decisiones que solo puede tomar Joan

1. **`app/socio.html` todavía reparte su número.** Es la otra app, la de los
   socios del quincenal, y esa decisión no la ha tomado. Si la toma, el sitio
   donde se anota es la prueba «play/ ya no reparte el número de Joan».
2. **`play/borrar-cuenta.html` necesita un WhatsApp con destinatario** — Google
   lo comprueba de oficio antes de aprobar. Quitarlo de ahí es arriesgar la
   ficha; hay una prueba que lo vigila.
3. Las fotos en Supabase Storage. El plan gratis tiene 500 MB de base y, al
   pasarlos, la base se vuelve **de solo lectura** — no llega una factura. Con
   Storage caben ~6.000 clientes; guardando las imágenes en la base, ~1.400.

---

## Cómo quedó

- **2.025 pruebas en verde**, 21 nuevas en `pruebas/canal-unico.test.js`.
- Tres migraciones aplicadas y comprobadas llamándolas.
- Comprobado **por HTTP contra la base real**: ninguna de las funciones nuevas
  contesta 404, y las que piden sesión contestan 401 con la llave pública, que
  es lo correcto.
- Service worker en `tugarantia-v82`.
