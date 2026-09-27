# Pendientes y diagnóstico — sesión del 2026-09-26 (después de la 1.5.0)

Documento de traspaso para seguir en un chat nuevo. Los cambios de la 1.5.0 están en el árbol de trabajo **sin commitear** (no se pidió commit). `npm test` da 44/44.

## Prioridad de Luz

Lo primordial es que **la jugabilidad tenga sentido, se sienta bien, sea divertida y tenga un loop**. Hay que pulir, fabricar e incorporar lo que haga falta en todos los aspectos. UI: nada fea, confusa ni cargada.

## Pedidos nuevos y diagnóstico

### 1. Pitido / "señal de radio" afuera — causa encontrada
- `public/js/audio/synthesis.js`, caso `'birds'`: es un silbido de **tono puro** (seno de 850 a 3050 Hz) que suena cada 2 s. `audio.js:113` lo pone en loop constante afuera a volumen 0.65.
- Caso `'water'` (fuente de la plaza en (0, 1, −65), al lado del spawn; `audio.js:114`): tiene un seno de 460 Hz que ondula ±120 Hz, suena a radio.
- Arreglo: pájaros como trinos cortos, armónicos, espaciados al azar y a volumen ~0.2 (o sacarlos). El agua solo con ruido filtrado más burbujas, sin senos. Revisar también el zumbido de `'blades'` (160 Hz) y de `'engine'`.

### 2. Revolear con G rompe las cosas — causa encontrada
- `PropManager.physicsStep` (`props.js:461`) rompe el objeto si |v − lastV| > breakDv.
- `doThrowRelease` (`main.js`) y `spawnThrow` (`props.js`) ponen la velocidad de golpe: ese salto se interpreta como impacto y el objeto se rompe al soltarlo.
- Soltarlo moviendo el brazo no lo rompe porque la velocidad crece de a poco.
- Arreglo: al fijar la velocidad desde el código, actualizar `p.lastV` y dar ~0.25 s de gracia. Que solo rompa un impacto real (mejor si se mide con el impulso de contacto).

### 3. Agarrar con las manos y armas: inutilizables
- `player.js:800`: el agarre es un **resorte** (`JointData.spring(0, 900+120m, 40+6m)`) del antebrazo al mango. No controla la orientación, así que el arma cuelga y bambolea.
- `props.js:311`: agarrar con dos manos solo se permite si la masa > 3.
- Plan: modo "sostenido cinemático".
  - Mientras está en la mano, el cuerpo del objeto es cinemático. Su pose = marco de la mano × agarre por tipo (offset del mango y orientación).
  - Eje del arma: sale de la dirección del antebrazo más "arriba", y se inclina con la velocidad del swing.
  - Con dos manos, el eje va de la mano derecha a la izquierda, y la izquierda hace IK sobre el mango.
  - Mandar su estado por red mientras está en la mano. Al soltar pasa a dinámico con la velocidad cinemática, para que el revoleo con el brazo siga funcionando.
  - Barrido de la hoja (rayos del mango a la punta, contra el paso anterior) contra GR.REMOTE, para avisar golpes con tipo de arma y velocidad de la punta.
  - Apuntado: priorizar el rayo de la cámara, radio más generoso y un "snap" suave a la mano.

### 4. Vehículos: colisiones con el mundo
- `entities.js`: son cinemáticos, con un solo rayo hacia adelante a y=0.62 desde el centro. La altura queda fija en el piso, así que **no suben las rampas** de la pista de saltos y atraviesan cosas en ángulo.
- El Rapier incluido trae `world.createVehicleController` (`DynamicRayCastVehicleController`: `addWheel`, `setWheelSteering`, `setWheelEngineForce`, `updateVehicle`).
- Plan:
  - Chasis dinámico con el controlador de ruedas para el que maneja.
  - Los demás lo ven interpolado cinemático, como ahora.
  - Rampas, saltos, vuelcos y choques con daño o expulsión por impulso.
- Mantener el volante que gira, las manos en el volante, las ruedas delanteras que doblan y el balanceo (`_animate`).

### 5. Mansión y mapa sin texturas
- `world/buildings.js:103 buildMansion` y los materiales de `world/builder.js`: mayormente colores planos.
- En `public/assets/tex` ya hay PBR 1k: plastered_stone_wall, stacked_stone_wall, grey_roof_tiles, painted_plaster_wall, brick, cobblestone, gravel, madera, etc.
- Luz pidió explícitamente usar texturas y modelos buenos de la red. Pipeline existente (CC0 de Poly Haven):
  - `python assets/tools/fetch_textures.py <salida> id1 id2 ...`: color, normal y rugosidad a 1k JPG.
  - `python assets/tools/fetch_polyhaven.py id...` más `build_props.py` para modelos.
- Anotar en el informe final qué se bajó (nombre, fuente, tamaño).
- Objetivo: mansión con piedra o revoque, techo de tejas o pizarra, marcos de ventana, cornisas y columnas con material. Llevar lo mismo al resto de los edificios.

### 6. Póker feo y bugueado: las manos se meten en la mesa
- En `player.js:1387` el animador usa la pose de manejar para el asiento de póker (`drive: ... || !!this.seat?.poker`): los brazos van adelante y se hunden en la mesa.
- Arreglo: con el sistema de brazos (`arms.js`), objetivos de IK apoyados sobre la mesa (cerca de las cartas propias).
- Revisar las cartas, las fichas, la cámara del póker (`poker.js cameraPose`) y el panel HTML `#poker`.

### 7. Carga lenta
- Medido en esta PC, con caché y servidor local: **~9.9 s** desde que abre la página hasta el menú (42 MB decodificados; las texturas terminan de llegar hacia los 2.1 s).
- Lo pesado parece estar en "Construyendo el mundo":
  - `World.build`
  - ez-tree genera 4 árboles en el navegador y los impostores
  - PMREM del cielo
  - compilación de shaders
  - pasto
- Plan:
  - Medir por etapa con `performance.mark`.
  - Precargas en paralelo.
  - Hornear los árboles a GLB, o generarlos en un worker.
  - `renderer.compileAsync` durante la carga.
  - Diferir lo que no hace falta al entrar (YouTube, póker, graffiti, bolsa).
  - Texturas más livianas (KTX2 o 512 donde alcance).

### 8. UI fea, rudimentaria y cargada
- El cartel de controles (`#prompt`, `style.css:65`) está en el **medio de la pantalla** todo el tiempo y molesta.
- Plan:
  - Rediseño limpio del HUD con tipografía y estilo consistentes y menos cosas en pantalla.
  - Ayudas contextuales chicas en un costado, que se desvanecen.
  - Opción en pausa para las ayudas de controles: siempre / solo las primeras veces / nunca.
  - Unificar el estilo del menú, la pausa, el póker, las pantallas y la lista de actividades.

### 9. Loop de juego (lo primordial) — propuesta
La identidad es la del video de referencia: sos el jardinero del Duque y el Gran Pasto se restaura cortándolo.

- **Jornal por cortar**:
  - `$` por celda alta cortada (`Grass.cut` devuelve cuántas).
  - Multiplicador de "prolijidad" por pasadas largas y rectas (franjas).
  - Popups `+$` y combo.
  - Inspección del Duque con bonus al llegar al 60, 80 y 95 % del Gran Pasto.
  - Penalidad por picar enanos o chocar.
- **Encargos del Duque** (un NPC fijo en la terraza, o el panel J), rotativos:
  - llevarle una birra
  - encontrar los enanos escondidos en el pasto alto y traerlos
  - salto de X m en la pista
  - pegarle a la bolsa a más de 40 km/h
  - ganar una mano de póker
  - hacer un gol
  - graffiti de X m²
- **Qué se compra con la plata**:
  - mejoras de la cortadora en el galpón (velocidad, ancho de corte, turbo, pintura)
  - cosméticos: `HumanCharacter` ya tiene sombreros y anteojos (`buildHat` y `buildGlasses` en `char/human.js`)
  - tragos
- Persistencia en localStorage por nombre, y ranking de la sala en el servidor.
- **Vida en el mundo**: el Duque como NPC (da encargos y reacciona si le pegan). Más adelante, parroquianos del bar que pelean, simulados por un cliente host con el mismo combate, para poder pelear solo.
- "Juice" en todo: sonidos, partículas, cámara y feedback de UI claro.

## Reglas y convenciones que hay que respetar

- **Teclas** (acordadas con Luz; ninguna hace dos cosas):
  - E / Q: agarrar o soltar con la mano derecha / izquierda
  - **X: usar** (sentarse, subir, heladerita, parrilla, botiquín, pantallas, fútbol)
  - F: patada · R: cabezazo · G: revolear
  - click corto: piña o usar · click sostenido: brazo · los dos clicks: guardia
  - En vehículo: X baja y S frena.
- Textos del juego en español rioplatense.
- Tests: `npm test` (core, audio-media, gameplay). Sintaxis: `node scripts/check.mjs`.
- Probar en el navegador de Claude:
  - `.claude/launch.json` en la carpeta padre ("dukes-dev", puerto 3100, DATA_DIR en %TEMP%, así no toca las salas).
  - Con el panel oculto no corre requestAnimationFrame: usar `window.__dukesPause = true` y `window.__dukesStep(ms)`.
  - Las capturas necesitan dibujar dentro de un `requestAnimationFrame`.
- Finales de línea: el repo mezcla CRLF y LF por archivo. Python en Windows escribe CRLF, así que hay que respetar el final original de cada archivo antes de terminar.
- Referencia visual: video de Max Blade "vibe coded with Opus 5.5 for 7 hours", 11:44–13:13 y 16:45–17:00. Cortadora antigua en primera persona con volante de madera y manos, pasto alto claro con franjas, cielo con cúmulos, luz cálida.
