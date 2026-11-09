# De dónde sale el mapa del CRM

`colombia-2026-11.json` es el mapa de la pestaña «🗺️ Mapa» del CRM
(`panel/mapa-clientes.js`). Lo arma `herramientas/mapa-colombia.js` y se puede
rehacer con el mismo comando (abajo). Los créditos que pide cada licencia se
ven en la pestaña, debajo del mapa:

> Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)

Descargado el **9-nov-2026**, con permiso de Joan.

## Las dos fuentes

| Qué | Archivo | De dónde | Licencia |
| --- | --- | --- | --- |
| Las **formas** de los 1.122 municipios | `geoBoundaries-COL-ADM2_simplified.geojson` (10,6 MB, 247.933 puntos) | geoBoundaries, colección gbOpen, Colombia, nivel ADM2: <https://www.geoboundaries.org/api/current/gbOpen/COL/ADM2/> (la API da el enlace de descarga; todo Colombia en <https://www.geoboundaries.org/api/current/gbOpen/COL/ALL/>) | CC BY 4.0 |
| Los **nombres oficiales, códigos DIVIPOLA y departamentos** | `COL_AdminBoundaries_TabularData.xlsx` (hojas ADM1, 33 filas, y ADM2, 1.122 filas) | OCHA, en HDX: «Colombia – Subnational Administrative Boundaries» (COD-AB), <https://data.humdata.org/dataset/cod-ab-col>. La tabla dice que es la división del DANE del 1-ene-2018, válida al 16-abr-2020 | CC BY-IGO |

La cita que pide geoBoundaries: Runfola, D. et al. (2020) *geoBoundaries: A
global database of political administrative boundaries.* PLoS ONE 15(4):
e0231866.

Las descargas **no** están en el repo (pesan, y no son nuestras).

## Lo que se les hizo

1. **Se casaron.** geoBoundaries trae cada forma con un solo dato, el nombre
   (`shapeName`), sin departamento ni código; HDX trae nombre, código y
   departamento sin coordenadas. De las 1.122 formas:
   - **942 por nombre**: sin tildes, mayúsculas, «D.C.», guiones ni paréntesis
     (lo de dentro y lo de fuera: «Ricaurte (Colosó)» es Colosó, de Sucre), y
     sin espacios («Villa Gómez» es Villagómez).
   - **159 por vecindad**: los nombres repetidos («Mosquera», en Cundinamarca y
     en Nariño; «Armenia», en Antioquia y en Quindío) van con el departamento de
     los vecinos ya casados que tocan la forma. Dos formas son vecinas si
     comparten un vértice.
   - **21 por nombre parecido, confirmado por vecindad**: la fila cuyo nombre
     empieza o termina igual, o difiere en una letra, y SOLO si es del
     departamento de sus vecinos. Son: Güicán («Güicán» → Güicán de la Sierra),
     San Vicente → San Vicente Ferrer, Santuario → El Santuario (Antioquia),
     San Andrès → San Andrés de Cuerquía, San Pedro → San Pedro de los Milagros,
     Tiquiso → Tiquisio, Ubate → Villa de San Diego de Ubaté, Piendamó →
     Piendamó - Tunía, Purísima → Purísima de la Concepción, Jordán Sube →
     Jordán, Cuaspud → Cuaspud Carlosama, Buga → Guadalajara de Buga, Tolú
     Viejo → San José de Toluviejo, El Carmen → El Carmen de Atrato, Cúcuta →
     San José de Cúcuta, Santander (Araracuara) → Puerto Santander (Amazonas),
     Tumaco → San Andrés de Tumaco, Papunaua → Papunahua, López → López de
     Micay, Barranco Mina → Barrancominas, Becerrill → Becerril.
   - **Uno a mano**: el de Barranquilla viene cortado en geoBoundaries
     («Distrito Especial, Industrial Y Portuario De Barr…»); pasa además por la
     misma comprobación de vecindad (Atlántico).
   - **0 sin casar.** Si algo no casa, el guion lo imprime y termina con error:
     no escribe un mapa con un municipio puesto a ojo.
   - Comprobaciones: cada departamento suma su cuenta de la tabla (33 de 33; en
     total 1.122) y ningún municipio de tierra firme queda sin un vecino de su
     propio departamento.
2. **Se proyectó**: plate carrée ajustada a 4° N (a esta escala, en Colombia,
   no se distingue de Mercator), 480 unidades por grado de latitud (1 unidad ≈
   231 m). San Andrés y Providencia van en un recuadro arriba a la izquierda, a
   escala ×3,5, sobre el mar: a su tamaño real serían dos puntos.
3. **Se simplificó sin abrir rendijas**: se armó la topología (cada borde
   compartido, una sola vez), cada borde se simplificó con Douglas-Peucker a
   1,2 unidades (~280 m) sin mover sus extremos, y se redondeó a enteros. De
   247.933 puntos quedaron 57.368.
4. **Los departamentos son la unión de sus municipios**: los bordes que tocan
   un solo municipio del departamento, encadenados.
5. **Los nombres** son los de la tabla de HDX, con una corrección: «Quindio»
   → «Quindío».

Resultado: **583.676 bytes (570 KB)**, unos 200 KB comprimido.

## Rehacerlo

```
node herramientas/mapa-colombia.js \
  --formas <ruta>/geoBoundaries-COL-ADM2_simplified.geojson \
  --tabla  <ruta>/COL_AdminBoundaries_TabularData.xlsx
```

Escribe `panel/mapa/colombia-2026-11.json`. Si cambian las fuentes (otra
división del DANE, municipios nuevos), el archivo nuevo va con **otro nombre**
(la fecha) y se cambia `URL_MAPA` en `panel/mapa-clientes.js`: el service
worker guarda este archivo la primera vez que se pide y lo sirve desde ahí
(caché primero), así que un archivo con el mismo nombre no se renovaría.

## Lo que el mapa NO usa

Ninguna coordenada de un cliente. El municipio de cada cliente sale de la
ciudad que escribió en el registro o que Joan corrigió en la ficha
(`panel/mapa-lugares.js`); ni el GPS del registro ni la ciudad que adivina la
IP entran a la pestaña.
