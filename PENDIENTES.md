# Pendientes — DESMADRE (etapa de pulido, 27/09/2026)

Documento de traspaso: si la conversación se compacta o se abre otro chat, leer esto primero.
GitHub: https://github.com/Luzbel33/Desmadre-DukesLawnBased- · Render: srv-das85jg473hc7384nqn0.
Desde el 30/09 Luz pidió: **cada tarea terminada se sube a `main`** (así prueba hasta donde se llegó).

## Actualización 01/10/2026 — entregas verificadas, sin tocar personajes del club

**Restricción vigente de Luz:** no modificar modelos, texturas, materiales, rigs ni generadores de las chicas
 del club. Para estas entregas quedaron intactos `assets/`, `public/assets/`, `public/js/char/` y `game/club.js`.
 No reabrir el pase de caras del club por las notas antiguas de este documento.

### Entregado en `a8bf6d4` (Render manual `live` el 01/10)
- [x] YouTube: Fogón/Cine y las otras pantallas se ven en el panel; conserva el mismo iframe al abrir/cerrar.
      Volumen personal y silenciar, guardados localmente. No cambia la cola ni el volumen de otros jugadores.
- [x] Soltar/revolear conserva el objeto equipado: birra, pucho, aerosol, fajo, pistola, granada sin activar,
      poción, choripán y manzana. Q/E sueltan; G revolea. Se pueden recuperar y usar; comida conserva mordidas.
- [x] Los objetos revoleados alcanzan la ruta de daño/reacción/voz de NPC; un impacto por víctima y lanzamiento.
      Se mantiene la validación y las zonas PvP de jugadores; no se habilitó daño global fuera de esas reglas.
- [x] NPC comunes se defienden del agresor, respetan paredes y vuelven a su zona. No se reemplazaron los roles
      específicos ni las coreografías del club. La simulación de NPC sigue siendo local, como antes.
- [x] Cine: cartel de pochoclos legible de ambos lados, vendedor con el menú existente y cuatro espectadores
      en butacas reales. Bar: cuatro parroquianos en asientos reales, sin sentarlos sobre sillas-prop.
- [x] Cámara frontal (Y): bloquea golpes, tiros, lanzamientos y fuego del Diablo; al salir vuelve el control.
- [x] Fuego visible en cuerpos con un pool independiente que sigue huesos, sin modificar sus materiales.
      Contacto con fuego real prende NPC y jugadores. Fogata y llamarada de leño más bajas para despejar el video.

### Bloque acotado posterior de este tablero
- [x] Tercera persona: selector de hombro izquierdo / centro / derecho en **Esc → Imagen**, con preferencia
      persistente. Aplica a ambas distancias; primera persona, cámara frontal y CCTV no se desplazan.
      Mantiene el control de obstrucción con paredes. El lado inicial conserva el encuadre previo.

### Pendiente real / traspaso para Opus, Codex o Dot
- [ ] Corregir caras de personajes no protegidos: diagnóstico de materiales/UV/ojos y comparación visual por
      personaje. **No tocar las chicas del club ni el código compartido que les altere el aspecto.**
- [ ] Cocinar malvaviscos: obtener palito, tostado/quemado progresivo, comer, soltar/revolear y estado de red.
- [ ] Ragdolls y miembros cortados como props de red autoritativos: el agarre local ya mejoró en `4d33fd0`,
      pero eso NO equivale a sincronizar completamente los pedazos para todos los clientes.
- [ ] Validar la comodidad de cámara/agarre y la vista del trono con Luz. No considerar todo el punto 4 terminado
      solo porque haya selector de hombro y bloqueo de ataques en frontal.
- [ ] QA con dos PCs y micrófonos reales/redes diferentes; reproducción real de YouTube con bloqueadores,
      restricciones de videos y autoplay. Chromium comprobó la superficie/iframe, UI y voz con captura de prueba;
      esas pruebas no certifican cada video ni todos los dispositivos/NAT.

La base de `a8bf6d4` pasó 134 tests, red (3/4 clientes), Chromium de media/chat/voz y escenas reales de cine/bar.
El selector agrega cuatro tests (138 en total) sobre la función de cámara real, obstrucción y persistencia.
Las secciones fechadas anteriores se conservan como historial: no rehacer chat/susurros ni interpretar los
antiguos bloqueos de acceso a `props.js` como una limitación vigente. GitHub y Render se usaron realmente.

## Tablero (30/09, pedido grande de QA de Luz) — [x] listo · [ ] pendiente

Reglas de este pedido: respetar lo que subió GPT (arreglos y NPCs del club); **no tocar el cuerpo de las
bailarinas** (ni mirarlo); usar Blender/addons/descargas para resultados de calidad, nada plano; optimizar sin
bajar la calidad. Orden: primero bugs y lo importante, lo "random" al final.

### 1. Bugs que rompen el juego
- [x] Menú de Esc: sin barra de scroll visible (se sigue scrolleando con la rueda).
- [x] Ascensor: las puertas tapan todo el vano (antes quedaban dos huecos de 0.6 m y se veía la antesala), cabina
      de chapa (Poly Haven metal_plate/metal_plate_02) con marco y plafón, visor afuera y adentro con flecha; el
      viaje se siente: freno que se suelta, la cabina que "cae", luz de cada piso que pasa por las rendijas,
      sacudones en las juntas, zumbido de motor, campanita y puertas neumáticas (sonidos nuevos en synthesis.js).
- [x] Ritual: pentagrama nuevo en el piso del Búnker (frente al trono) para llegar y para volver al castillo con los
      que elija el Diablo (el servidor valida los dos); toda llegada por teletransporte busca piso firme y lugar
      libre (`Player.safeSpot`): nadie queda metido en la tarima ni en el piso.
- [x] Choques con NPCs: el auto los atropella (salen revoleados dando vuelta, con daño y sangre; el auto pierde un
      poco de envión y vos seguís arriba; despacio los corrés a un costado). A pie chocan siempre: después de
      caerse el contador de "tirado" quedaba en -0.005 y el NPC era "tirado" para siempre (sin cápsula y, al
      morir, sin ragdoll: por eso se congelaban). Los NPC que caminan (guardias, el que pasea, los prendidos fuego)
      ahora chocan con paredes, autos y jugadores; el que se quema salta de la silla y corre en pánico.
- [x] "Guardia invisible que te pega": con el guardia tirado (ragdoll), su rol seguía andando: la posición lógica
      te perseguía y te pegaba sin cuerpo. Tirado ya no persigue ni pega. Además los guardias llevan un farol
      encendido en la mano (de noche, con el uniforme oscuro, no se los veía).
- [ ] El portero "cara de chancho": capucha pintada con orejas/hocico de cilindros (se ve hueco). Va con el
      rediseño de personajes (punto 2).
- [~] Rendimiento: se activó el Búnker solo cerca, se duerme la pose de NPC fuera de vista/radio, se pausan los aldeanos lejanos y las partículas fuera de 120 m no se suben a GPU; CCTV y cámara del trono renderizan solo cuando el jugador está cerca y mirando. Falta que Luz confirme fluidez/audio en su PC.

### 2. Club / personajes
- [x] Campana del ring al lado de la puerta de la jaula (que ahora sí tiene puerta): corta la pelea (cada uno a su
      rincón) y la vuelve a largar; la oyen y la ven todos.
- [x] Máscaras de Blender con cabezas esculpidas CC0 de Poly Haven
      (`assets/blender/artpass/masks.py` → `public/assets/props/art/mask_{bull,horse,lion,cat,rabbit}.glb`: toro de
      bronce, caballo de porcelana, león de oro con capucha, gato de laca negra, conejo de porcelana). Se cargan al
      acercarse al Búnker y se ajustan a `headAnchor`; el shader oculta la cara/pelo/cuerno/oreja por pesos de huesos,
      sin alterar cuerpos ni GLB corporales. Asignación: Lilith toro, Coneja conejo, Venus león, Raven caballo, La
      Emo gato; "Una emo" y "Una morocha" usan las variantes correspondientes.
- [ ] Mujeres: **el cuerpo NO se toca** (ni se mira: es la base del futuro parque anatómico). Solo la cara:
      lindas, sin bigote, con pelo largo de verdad (el de GPT está pésimo) o, si no sale bien, una máscara de
      animal distinta para cada una (fiesta de élite). Accesorios bien puestos; nada de ropa pintada.

### 3. Castillo (QA de Luz)
- [ ] Banderas de la fachada que atraviesan el castillo; cartel más lindo.
- [ ] Palanca afuera y adentro para subir/bajar el rastrillo de metal del portón.
- [ ] Carro de calabazas: las calabazas lo atraviesan.
- [x] Ahorcado: horca rehecha en Blender con la trampilla ABIERTA (hueco en el piso y las dos hojas colgando);
      esqueleto nuevo colgado del cuello (cabeza quebrada, puntas de los pies abajo) que pasa por el hueco; soga de
      tres cabos, nudo de verdugo detrás de la oreja y lazo bajo la mandíbula, todo hamacándose junto. La tarima
      tiene el hueco también en la colisión (te podés caer y salir gateando por abajo).
- [ ] Tierra del calabazar y del espantapájaros redondeada y natural como las tumbas (nada de cajas).
- [x] Sandías flotando: estaban cargadas a 0,4 m del piso al lado de la parrilla (se ve al reiniciar el servidor).
- [ ] Piso de arriba ampliado con más lugares.

### 4. Sensación de juego
- [~] Tercera persona: hombro derecho/izquierdo/centro entregado el 01/10. Queda QA de comodidad de agarre/interacción y vista del trono.
- [ ] Armas: apuntar de verdad, la mano y el arma siguen la mira, animaciones y retroceso.
- [ ] Colisiones de todo el cuerpo (brazos activos, cabeza, piernas) contra jugadores, NPCs, vehículos y objetos.
- [~] Revolear objetos: tipos y feedback de NPC entregados el 01/10; ruta de impactos a jugadores conservada. Queda QA multijugador real con Luz.
- [~] Gore: agarre local de miembros/ragdolls mejorado en `4d33fd0`; sincronización completa como props de red pendiente.
- [ ] Cuchillos/armas blancas que quedan clavados (jugador, piso, madera) y se sacan.

### 5. Pase visual (sigue del plan de 12 puntos)
- [ ] Resto del castillo y el mapa: cielo/tormenta, pasto, fuego, objetos flotantes, tumbas orgánicas,
      enredaderas, pestillo del cementerio, caldero, más esqueletos, luz por ventanas.

### 6. Para después (Luz: "no hacer ninguno hasta que lo anterior esté")
- [ ] Empujones.
- [ ] Gestos: mear, vomitar, escupir, caca (agarrable y revoleable, mancha), pedos.
- [ ] Frisbees, aviones de papel, sorbete con bolitas, láser (feedback en la cara), gomitas.
- [ ] Soga para trepar/atar, gancho tipo Batman, lanzallamas encendedor+alcohol (alternativo: pedos de fuego),
      bombuchas, tomates que manchan, matafuegos, insecticida, consolador vibrador, látigo, correa (en 4 patas).
      Rueda de ítems (¿X?) como la de gestos.
- [ ] Suicidio con 3 variantes (pistola en la boca, puñalada en el culo, granada con 5 s de corrida).
- [ ] Más playermodels graciosos (enanos, aliens, Kermit, Elmo, Scream, robots, memes, Hello Kitty...) de
      paquetes gratis ya hechos, vibra Garry's Mod.

## Ojo: dos líneas de trabajo en paralelo

Sobre la foto publicada `331902a` trabajaron dos agentes a la vez:
- Esta línea (Claude, carpeta local): rama `claude/desmadre-20260927`.
- Otra línea (otro agente, "gpt-web") en GitHub: ramas `fix/gpt-web-pendientes-20260927`,
  `feature/poker-combat-20260927` y `main` hasta `ca6e6ea` (partió player/ragdoll/poker/room en `*-core.js` +
  envoltorios, CI en `.github/workflows/qa.yml`, póker con teclado en una UI propia). Las dos resuelven lo mismo
  de formas distintas: antes de mezclar, decidir con Luz cuál sigue.

## Estado 29/09 (después del castillo AAA)

- **Castillo (commits 78500d7 y anteriores)**: luna en el cielo con sombra, bruma y fuego volumétricos (`fx/volume.js`, `fx/fire.js`), haces de luna y polvo, manchas y decals, pool de luces por cuarto, culling. Falta la expansión: decorado denso y variado (los modelos de Poly Haven ya bajados están en el scratchpad de la sesión, hay que convertirlos con `assets/blender/ph_to_glb.py`), telarañas, insectos, cadáveres/colgados, sustos, calabozo/sótano, puente levadizo con foso, pasadizos. Calavas de la sala secreta flotando: mover `[18.2, F0 + 0.95, -125.2, 3]` de `_skulls()` a `[13.9, F0 + 1.14, -125.05, 3]`.
- **El Diablo (solo el dueño)**: nombre reservado SmokePyro + clave (hash scrypt en `server/owner.js`, `OWNER_KEY` la reemplaza; ruta `POST /api/owner`, el servidor viejo no la tiene: hay que reiniciar JUGAR.bat). Poderes en `game/owner.js`: K o botón del medio = aliento de fuego (`fx/breath.js`), N = bola de fuego, I = invisible, O = inmortal, L = risa; el servidor valida todo (`server/room.js`, `shared/demon-fire.js`). Modelo: "Demon" de VidovicArts (CC-BY): `assets/blender/rig_demon.py` + `repair_demon.py` (rig reparado por la otra línea) + `add_demon_jaw.py` (hueso `jaw`: abre la boca al hablar, reírse y escupir fuego) + `smooth_demon_shoulders.py` (pesos de hombro/axila repartidos en anillos: al levantar los brazos ya no se abren "alas"; se mide con `pose_test.py` y `weight_report.py`; el .blend resultante es `assets/blender/diablo_v2.blend`). NO reemplazar `diablo.glb` sin respaldo y prueba A/B.
- **Galleta v2** (`assets/blender/build_cookie2.py`, hoja de personaje de Luz): miembros continuos, mitones con pulgar, botas, masa dorada con AO y bordes tostados por color de vértice, chocolate brillante por mapa de rugosidad. La v1 sigue en `build_cookie.py`.
- **Bug grave arreglado**: la luz del relámpago/luna (`storm.flashLight`) tenía `castShadow` pero su mapa solo se creaba con tormenta o noche; con día despejado three usaba un muestreador vacío (bug del setter de arrays de r186) y **no se dibujaba nada iluminado** (sin suelo ni castillo). Arreglos: `msh.needsUpdate = true` al crearla y `emptyShadowTexture.compareFunction` en el setter de arrays de `public/vendor/three/three.module.js` (marcado "DESMADRE"; si se vuelve a vendorizar three hay que repetir este parche y el de capas de la cámara de sombra).
- Pruebas: `npm test` (81), `npm run test:fire` (4 clientes por WebSocket), `node scripts/check.mjs`. `public/qa/characters.html` (ignorada por git) muestra a la Galleta y al Diablo en poses.

## Sigue (personajes y castillo)

- Más playermodels profesionales de la web: Sketchfab pide login para bajar los GLB (Luz los baja a Descargas; yo los riggeo con `retarget_human.py` y armo un script por modelo en `assets/blender/`).
- Póker estilo RDR2 (cartas mejores, turnos claros, cuánto apostás/perdés, apuestas ilegales, tecla para acercar las cartas y otra para las comunitarias, animaciones de mirar cartas/festejar/putear, poder chatear y hablar sentado), susurros (texto y voz solo para elegidos), linterna/lámpara/vela.

## Qué quiere Luz (prioridad)

Lobby interactivo "tipo Discord divertido" que crece con el tiempo. NADA de historia, misiones, NPC que dan encargos,
plata ni tienda. Prioridades: pulir lo existente (jugabilidad, físicas, combate, colisiones, ragdoll, feedback),
póker estilo RDR2 (hecho en esta etapa), gráficos (menos brillo, mejor luz/sombras/AO, texturas sin colores
planos, la mansión), zona de terror/Halloween + sector chill con fogata y tormenta, y después controles
rebindeables, micrófono con autoescucha, YouTube con búsqueda y fútbol (llevar la pelota está bugueado).
Nombre: solo **DESMADRE** (hecho: título, carteles, zonas, marcas; quedan claves técnicas internas `dukes.*`).

## Hecho en esta etapa

- Combate: perfiles por golpe (`BODY_HITS`), patada que mide el pie, golpes remotos solo por aviso del atacante,
  balance (piña < patada; una piña a la cabeza no noquea). KO sin salir volando.
- Reacciones a los golpes (`game/react.js`): resortes por articulación sobre la pose DIBUJADA (no viajan por la red);
  el que pega las ve al instante (`predictHit` + `RemotePlayer.hitReact`), los demás por el evento `imp`.
  Hit-stop del brazo que pega, sacudón direccional de cámara, sangre prevista en zona PvP.
- Voces de dolor (`audio/vocals.js`, `assets/sfx/vo/`, CC0): cada jugador tiene su voz (modelo + id) y tono; el
  golpeado elige la toma y la manda (`vo`), un grito corta al anterior (canal por jugador).
- Agarrar (Half Sword): el agarrado sigue de pie y en control; lo arrastra el tirón (`_gripPull`, controlador),
  su parte va hacia la mano (`rig.pullToward`); en la pantalla del que agarra la parte va pegada a su mano ya
  (`RemotePlayer._gripView`). Derribo: pierna levantada, cabeza para abajo o tirones secos del brazo (respecto del
  cuerpo del que agarra); arrastrar no tira. Soltar con envión revolea. Se zafa estirando (corriendo) o si le pegan.
  Tirado: resorte a la mano (arrastra el cuerpo).
- Colisiones entre jugadores: la cápsula del remoto va donde se DIBUJA su cuerpo; si quedan encimados se separan
  en ~0.2 s sin poder volver a meterse (el controlador de Rapier se trababa adentro de una cápsula).
- La mano no atraviesa cuerpos (tope en la piel + proyección de punto `phys.nearest`).
- Brazos: la clavícula real sube/se adelanta con el brazo (IK con hombro que se mueve), el codo apunta abajo con la
  mano baja y afuera con la mano arriba; la muñeca se acomoda al mango de lo que tenés (`gripAxis`) y la mano se
  cierra según el objeto (`curlOf`).
- Gore: cortar un miembro no mata (sangrado que se corta solo), sin pierna rengueás; umbrales de corte más bajos.
  El tramo cortado se desengancha del ragdoll (`detachBranch`): antes quedaba sin masa colgando de la articulación
  y el cadáver quedaba parado o salía volando. Los pedazos no chocan con cuerpos los primeros 0.6 s.
- Aturdido sin "pose T" (brazos que se sacuden buscando equilibrio).
- Póker nuevo: 3D en primera persona, reparto animado, fichas que vuelan, carteles chicos, teclado (ver README),
  reglas compartidas en `shared/poker-rules.js` (servidor y cliente), parroquianos que se sientan separados.
- Manos: cada falange se cierra hasta tocar el mango (`GRIP_R` por arma) o, en lo que se carga, en gancho; lo
  empuñado queda en el centro del puño (`snapHeldToFists` en main.js, solo lo que se ve).
- Armas con cuerpo: el filo frena en la carne a cualquier velocidad y despacio la mano retrocede hasta la piel.
- Cuerpo más suelto: inclinación con resortes (rebote al frenar, hacia adentro al doblar), cabeza que compensa,
  rodillas que ceden al caer. Menos bloom (solo luces, no objetos blancos iluminados).

## Sigue (pedidos de Luz sin hacer todavía)

- Armas que queden clavadas en un jugador (y se saquen agarrándolas) — necesita tocar `props.js` (sincronización
  de objetos); el clasificador de permisos bloqueó su lectura en esta sesión.
- Miembros cortados como objetos agarrables/revoleables por todos (props de red) con limpieza (tope y
  vencimiento) — mismo motivo.
- Movimiento secundario más suelto (tipo GTA V), vehículos con física real, iluminación/AO/materiales, mansión,
  Halloween + fogata, controles, micrófono, YouTube con búsqueda, fútbol.

## Para más adelante (pedidos de Luz, NO ahora)

- Menú previo al juego: ver salas, crearlas, ponerles clave, etc.
- [x] Chat con historial (entregado en `4d33fd0`; no rehacer).
- [x] Susurros de texto y voz a uno o varios elegidos (entregado en `4d33fd0`; no rehacer).

## Reglas y convenciones

- Teclas: E/Q agarrar/soltar (der./izq.), X usar, F patada, R cabezazo, G revolear, click corto piña/usar, click
  sostenido brazo, los dos clicks guardia; en vehículo X baja y S frena. Sentado al póker: Espacio/R/F/Tab (ver
  README). Ninguna tecla hace dos cosas a la vez.
- Textos del juego en español rioplatense. `npm test` y `node scripts/check.mjs`.
- Navegador de Claude: `.claude/launch.json` en la carpeta padre ("dukes-dev", puerto 3100, DATA_DIR en %TEMP%).
  Con el panel oculto: `window.__dukesPause = true` y `window.__dukesStep(ms)`; si el canvas queda en 0x0, fijar
  el tamaño del renderer antes de capturar.
- Finales de línea mezclados por archivo (CRLF/LF): respetar el original de cada archivo.
