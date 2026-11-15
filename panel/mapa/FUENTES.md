# De dónde sale el mapa del CRM

`colombia-2026-11b.json` es el mapa de la pestaña «🗺️ Mapa» del CRM
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

6. **(13-nov-2026) Dónde va el nombre de cada municipio** (`p`, en las mismas
   unidades del mapa): el polo de inaccesibilidad, el punto de adentro más
   lejos de todo borde. El centro de la caja no sirve: en un municipio en C
   cae afuera, sobre el vecino. Los 1.122 caen dentro de su municipio (la
   prueba lo comprueba uno por uno).
7. **(13-nov-2026) Los huecos de cada departamento** (`h`): los municipios de
   OTRO departamento que comparten con este dos tercios o más de su borde.
   Vistos desde este son una muesca en blanco, y la pestaña los pinta en su
   sitio. Son seis: Bogotá en Cundinamarca (83 %), Covarachía en Santander
   (83 %), González en Norte de Santander (80 %), Gámbita en Boyacá (78 %),
   Quinchía en Caldas (72 %) y Jamundí en el Cauca (67 %). Con la mitad salían
   43, casi todos municipios de frontera que no se ven como hueco.

Las formas no cambiaron: los 1.122 caminos y los 33 contornos son, carácter
por carácter, los del 9-nov.

Resultado: **601.577 bytes (587,5 KB)**. El del 9-nov, `colombia-2026-11.json`
(583.676 bytes), sigue en la carpeta solo porque un CRM v144 que esté abierto
lo pide por ese nombre; se puede borrar cuando v145 lleve un tiempo
publicado.

## Rehacerlo

```
node herramientas/mapa-colombia.js \
  --formas <ruta>/geoBoundaries-COL-ADM2_simplified.geojson \
  --tabla  <ruta>/COL_AdminBoundaries_TabularData.xlsx
```

Escribe `panel/mapa/colombia-2026-11b.json`. Si cambia el archivo (otra
división del DANE, municipios nuevos, o un dato nuevo como el `p` y el `h` del
13-nov), el nuevo va con **otro nombre** (la fecha, o una letra más) y se
cambia `URL_MAPA` en `panel/mapa-clientes.js`: el service worker guarda este
archivo la primera vez que se pide y lo sirve desde ahí (caché primero), así
que un archivo con el mismo nombre no se renovaría.

## Bogotá por dentro (14-nov-2026)

`bogota-2026-11.json` es lo que la pestaña necesita para abrir Bogotá: sus 20
localidades, los municipios vecinos de la Sabana con el borde fino, la lista de
barrios (de cada nombre, en qué localidad está) y la proyección en números. Lo
arma `herramientas/mapa-bogota.js`. Joan pidió el 14-nov «mejorar el mapa del
crm que se vea mucho más detallado» y, con los bocetos delante, escogió Bogotá
y la Sabana por localidades con las calles debajo.

Los créditos que se ven en la pestaña, al abrir Bogotá:

> Localidades y barrios de Bogotá: Secretaría Distrital de Planeación y
> Catastro Distrital (CC BY 4.0) · Calles: © colaboradores de OpenStreetMap (ODbL)

Descargado el **14-nov-2026**, cuando Joan escogió esta opción.

### Las fuentes

Las tres primeras son de Datos Abiertos Bogotá (<https://datosabiertos.bogota.gov.co>):

| Qué | Archivo | De dónde | Licencia |
| --- | --- | --- | --- |
| Las **formas** de las 20 localidades | `loca.json` (2,4 MB; JSON de Esri, en grados; 57.840 puntos) | «Localidad. Bogotá D.C», Secretaría Distrital de Planeación: <https://datosabiertos.bogota.gov.co/dataset/localidad-bogota-d-c> | CC BY 4.0 |
| Los **nombres de barrio**, toda la ciudad | `SECTOR.geojson` (18 MB; viene en `sector.geojson.10.26.zip`, 5,1 MB): 1.230 sectores, 1.000 urbanos, 139 rurales y 91 mixtos | «Sector Catastral. Bogotá D.C», Catastro Distrital (UAECD): <https://datosabiertos.bogota.gov.co/dataset/sector-catastral> (actualizado el 5-nov-2026) | CC BY 4.0 |
| Los **nombres de barrio** de origen informal | `barriolegalizado.json` (8,2 MB): 1.775 barrios, cada uno con el código de su localidad | «Barrio legalizado. Bogotá D.C.», Secretaría Distrital de Planeación: <https://datosabiertos.bogota.gov.co/dataset/barrio-legalizado-bogota-d-c> | CC BY 4.0 |
| Las **formas finas** de los vecinos | `geoBoundaries-COL-ADM2_simplified.geojson`: el mismo de arriba | geoBoundaries | CC BY 4.0 |

Ninguna descarga está en el repo (pesan 39 MB entre las cuatro, y no son
nuestras).

Y una que NO se descarga ni se guarda: **las calles**. Son las teselas de
OpenStreetMap (`https://tile.openstreetmap.org/z/x/y.png`), que el navegador de
quien mira pide una por una al abrir Bogotá y al acercarse. Los datos son de los
colaboradores de
OpenStreetMap, con licencia ODbL (<https://www.openstreetmap.org/copyright>).
Sus condiciones de uso (<https://operations.osmfoundation.org/policies/tiles/>)
y cómo se cumplen están en la cabecera de «LAS CALLES» de
`panel/mapa-clientes.js`: el crédito a la vista sobre el mapa, solo lo que se
está mirando, nada de guardarlas para usar sin señal. Es un servidor gratis y
**sin garantía**: a un servicio comercial le pueden quitar el acceso en
cualquier momento. Si eso pasa, el mapa sigue igual sin calles (y lo dice); el
arreglo sería pagar un proveedor de teselas y cambiar `URL_TESELAS`.

### Lo que se les hizo

1. **La misma proyección del mapa de Colombia**, y comprobada, no supuesta: la
   caja de Colombia se vuelve a calcular con las formas de geoBoundaries y
   tiene que dar la del mapa publicado (5905 × 8093); si no, el guion termina
   con error. Los cinco números van en el archivo (`proy`): con ellos la
   pestaña sabe qué teselas cubren la ventana que se mira.
2. **La ventana** (`caja`): la ciudad y su primer anillo, de Madrid a La Calera
   y de Chía a Sibaté (42 × 60 km). Es la del boceto que Joan escogió. Sumapaz,
   que es páramo y empieza 7 km al sur del borde, no tiene forma en ella: va
   con su nombre y su cifra en una línea aparte.
3. **Las localidades**: Planeación trae los bordes compartidos con los mismos
   vértices, así que se arma la topología (la de `mapa-colombia.js`), cada
   borde se simplifica una sola vez con Douglas-Peucker a 0,05 unidades (12 m)
   y se redondea a dos decimales: entre dos localidades no queda rendija ni se
   montan (la prueba suma sus áreas contra la del contorno). La Candelaria
   sola traía 13.201 puntos. `p` es dónde va el nombre: el polo de
   inaccesibilidad de lo que la ventana deja ver.
4. **El contorno** de la ciudad: la unión de las 19 que se ven, igual que un
   departamento es la unión de sus municipios. Donde dos localidades no
   comparten vértices en la descarga (una rendija de centímetros en la punta
   del límite), el contorno entraba y salía por un borde de adentro: dos
   «bigotes», de 10 m entre Chapinero y Santa Fe y de 85 m entre Fontibón y
   Engativá. El ida y vuelta se quita, y una prueba lo vigila.
5. **Los vecinos**: los 29 municipios de geoBoundaries que tocan la
   ventana, a 0,1 unidades (23 m) y un decimal. En el mapa de Colombia van
   redondeados a 231 m, que a escala de país no se nota y con las calles
   debajo sí. Cada uno se casa con su código sin mirar el nombre: el punto del
   nombre de UN municipio del mapa publicado tiene que caer dentro de su forma
   (con cero o con dos, error). Bogotá según el DANE va aparte (`fondo`): es lo
   que asoma donde su límite y el de Planeación no casan.
6. **La lista de barrios** (`barrios`): de cada nombre oficial salen los
   nombres que la gente escribe (sin «Barrio», «Urbanización» ni «II sector»;
   lo de dentro del paréntesis o las comillas; las fechas en cifras), con la
   MISMA función con la que `panel/mapa-lugares.js` limpia lo que escribió el
   cliente (`llavesBarrio`). Lo de dentro del paréntesis solo da un nombre si
   lo parece: ahí Planeación también escribe direcciones y notas («(CALLE
   131A)», «(MANZANA 0)», «(ZONA INVADIDA)», «(ASD)»), y de eso salían llaves
   que ubicaban a quien escribiera «Calle 80» o «asd». Lo que va delante del
   nombre se quita y el nombre se queda: «(SECTOR EL LUCERO)» es «el lucero»,
   y «(ANTES EL PEDREGAL)», el nombre de antes, que la gente sigue diciendo.
   «(PARTE BAJA)», «"PARTE ALTA"» y «parte media» califican al barrio: el
   nombre entero queda («rocio parte baja») y también sin eso («rocio»). La
   cola se quita en dos tiempos (revisión del 15-nov): primero lo que es de
   la dirección, y esa llave también vale; después lo que es cola del
   nombre. De un tirón, «Tunjuelito Rural Manzana 4» perdía también el
   «rural» y quedaba «tunjuelito», que es otra localidad. Al leer la ficha
   valen todos los pasos; la lista guarda solo las puntas, el nombre entero y
   el que queda al final (tercera vuelta del 15-nov): un paso de en medio,
   como «santa cecilia sector» de «SANTA CECILIA SECTOR I», es más vago que
   el nombre oficial y quedaba en una sola de las cuatro localidades que
   tienen una «Santa Cecilia».
   Los sectores de Catastro no dicen su localidad, y no la respetan: un
   sector es de TODAS las localidades que tienen la décima parte o más de su
   suelo (38 de 1.230 caen en dos: «Las Aguas», dos tercios en La Candelaria
   y uno en Santa Fe). Menos de eso es el trazo de dos límites que no casan
   del todo. Un sector con más de la mitad fuera de las 20 no entra: solo
   «Páramo II». De 3.045 nombres oficiales quedan 2.766 llaves; **225 están
   en más de una localidad** («Lisboa», en Suba y en Usaquén) y se guardan
   con todas: la pestaña no escoge. Una llave que es el nombre de una localidad y está en
   ella se va (hay un sector «Tunjuelito» que cae del lado de Usme); si está en
   OTRA se queda, porque eso sí es duda («Santa Fe» es también un barrio de Los
   Mártires).

Resultado: **128.887 bytes (125,9 KB; 36,8 KB comprimido)**. Se pide junto
al de Colombia al abrir la pestaña y tampoco va en la precarga del service
worker.

### Rehacerlo

```
node herramientas/mapa-bogota.js \
  --localidades <ruta>/loca.json \
  --sectores    <ruta>/SECTOR.geojson \
  --barrios     <ruta>/barriolegalizado.json \
  --formas      <ruta>/geoBoundaries-COL-ADM2_simplified.geojson
```

Escribe `panel/mapa/bogota-2026-11.json`, el mismo byte a byte. Si cambia
(otra división de localidades, una lista de barrios más nueva), va con **otro
nombre** y se cambia `URL_BOGOTA` en `panel/mapa-clientes.js`, por lo mismo
que el de Colombia.

## Lo que el mapa NO usa

Ninguna coordenada de un cliente. El municipio de cada cliente sale de la
ciudad que escribió en el registro o que Joan corrigió en la ficha
(`panel/mapa-lugares.js`); ni el GPS del registro ni la ciudad que adivina la
IP entran a la pestaña.

Desde el 14-nov, en Bogotá se lee además el **barrio** de la ficha, y solo
para saber la localidad: el barrio no se pinta ni se cuenta, y la dirección
sigue sin leerse (`pruebas/mapa-bogota.test.js` lo vigila con una ficha que
anota cada campo que se le pide).

Y a OpenStreetMap no le llega nada de un cliente: en la dirección de cada
tesela van solo el zoom y la casilla de la ventana que se está mirando.
