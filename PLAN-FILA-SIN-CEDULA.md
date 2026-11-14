# La fila de la ficha sin cédula — lo que falta en la nube

*14-nov-2026. Lo encontró la segunda revisión de v147, antes de publicarla.*

## El problema

La nube (`sincronizar_socios`) guarda a cada cliente en una fila cuya llave es su
cédula o, si no tiene, su celular. La cuenta de la app de un cliente queda
**junta con esa fila** (`auth_celular`, `auth_vinculada_en`), y `mi_cuenta` le
muestra la fila con la que está junta.

**Cara (a), datos de otro.**
- La ficha A vivía en la nube con la llave de su celular viejo, sin cédula, y su
  cuenta está junta con esa fila.
- Joan le carga la cédula y un celular nuevo.
- La ficha B, sin cédula, tiene hoy el celular viejo de A. Es el caso de la
  pareja que comparte línea, o del número que pasó de uno a otro.
- Cuando B sube, su `upsert` cae en la fila de A. La nube le pone encima el
  nombre y los datos de B y **conserva la unión** (el `coalesce` del `on
  conflict`).
- Resultado: la cuenta de A ve el nombre, la deuda y el historial de B. Es Ley
  1581.

**Cara (b), unión cortada.**
- Si B tiene cédula y su celular de hoy es la llave vieja de A, su mudanza lee
  y borra esa fila.
- La nube le corta la unión a A (20261007c).

## Lo que ya hace v147 (en el cliente, `panel/historiales-auto.js`)

- `planDeSubida` y `subirUna` miran la fila donde cae cada ficha, también para
  las fichas sin cédula.
- Si esa fila es la llave con que otra ficha vive hoy en la nube, **espera**, y
  la línea lo dice.
- La mudanza solo se exime si la otra viaja en la misma subida con ese celular
  hoy, y va primero.
- Pruebas: `pruebas/la-fila-de-la-ficha-sin-cedula.test.js`. Hay 8 pruebas y
  3 `todo`, que son lo que sigue.

## Lo que el cliente solo NO cierra (los 3 `todo`)

1. Cuando A sube con su llave nueva y otro celular, su mudanza no lee la fila
   vieja: lee la de su celular de hoy. La fila vieja se queda en la nube **con
   la unión de A**, y este computador ya no la recuerda (`rec.k` cambió). En la
   vuelta siguiente B cae en ella.
2. Un respaldo importado vacía las huellas, así que la reja no sabe de quién es
   cada fila.
3. Una ficha borrada no protege su fila.

## La migración (receta: NO está escrita ni aplicada)

Va en una migración nueva e idempotente, con el método de 20261007c:
`pg_get_functiondef` más `regexp_replace`, y que diga FALTA si no encuentra el
patrón. Se ancla justo antes de
`insert into public.socios_historial (cedula, celular, tel4, nombre`.

Cuando la fila de ESTA llave está junta y
`not mismo_nombre(o.nombre, coalesce(item->>'nombre','Socio'))`:

1. Se mudan los mensajes `where cedula = ident` al hilo de esa cuenta, como
   hace `desvincular_interna`:
   `case when celular_es_de_una_ficha(auth_celular) then '0'||auth_celular else auth_celular end`.
2. `perform union_que_no_viaja(ident, auth_celular, auth_vinculada_en)`.
3. `auth_*` en null antes del `upsert`.

Si se equivoca, se equivoca hacia el «no», igual que 20261007c. La cuenta de A
queda sin juntar y anotada en «🔗 Cuentas juntas», y Joan la vuelve a juntar con
su fila nueva.

Para la cara (b) hacen falta dos cosas: que el lote mande también la llave
anterior (`rec.k`), y que `sincronizar_socios` mude esa fila con
`fila_vieja_es_de`. Es otra migración, más un cambio en el cliente.

## Cómo y cuándo

- Escribirla con sus pruebas `*-postgres`. Se corren de noche, con Joan fuera
  del computador, porque Postgres abre ventanas.
- Aplicarla en producción **solo con el visto bueno de Joan**, que es quien toca
  Run en el SQL Editor. Después se comprueba que quedó aplicada de verdad.
- Fecha propuesta: escribir y probar el domingo 15-nov en la noche; aplicar el
  lunes 16-nov con Joan.
- Mientras tanto, el riesgo vive en un caso raro: una ficha que vivía en la nube
  por su celular, con la cuenta junta, a la que se le cambió el celular,
  mientras otra ficha sin cédula tiene ese número. Si ves que dos fichas
  comparten celular, ponle la cédula a la que no la tiene antes de corregir el
  número.
