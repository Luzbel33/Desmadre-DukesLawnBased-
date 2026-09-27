# Pendientes — DESMADRE (etapa de pulido, 27/09/2026)

Documento de traspaso: si la conversación se compacta o se abre otro chat, leer esto primero.
GitHub: https://github.com/Luzbel33/Desmadre-DukesLawnBased- · Render: srv-das85jg473hc7384nqn0.
No hacer push ni deploy sin que Luz lo pida.

## Ojo: dos líneas de trabajo en paralelo

Sobre la foto publicada `331902a` trabajaron dos agentes a la vez:
- Esta línea (Claude, carpeta local): rama `claude/desmadre-20260927`.
- Otra línea (otro agente, "gpt-web") en GitHub: ramas `fix/gpt-web-pendientes-20260927`,
  `feature/poker-combat-20260927` y `main` hasta `ca6e6ea` (partió player/ragdoll/poker/room en `*-core.js` +
  envoltorios, CI en `.github/workflows/qa.yml`, póker con teclado en una UI propia). Las dos resuelven lo mismo
  de formas distintas: antes de mezclar, decidir con Luz cuál sigue.

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

## Sigue (pedidos de Luz sin hacer todavía)

- Armas con colisión activa contra cuerpos (que frenen en la carne) y que puedan quedar clavadas en un jugador.
- Miembros cortados como objetos agarrables/revoleables por todos (props de red) con limpieza (tope y vencimiento).
- Manos con dedos que se acomoden de verdad al objeto (curvar cada dedo hasta tocar la forma).
- Movimiento secundario más suelto (tipo GTA V), vehículos con física real, iluminación/AO/materiales, mansión,
  Halloween + fogata, controles, micrófono, YouTube con búsqueda, fútbol.

## Para más adelante (pedidos de Luz, NO ahora)

- Menú previo al juego: ver salas, crearlas, ponerles clave, etc.
- Chat con historial.
- Susurros (que solo un jugador te lea o te escuche, como Habbo Hotel).

## Reglas y convenciones

- Teclas: E/Q agarrar/soltar (der./izq.), X usar, F patada, R cabezazo, G revolear, click corto piña/usar, click
  sostenido brazo, los dos clicks guardia; en vehículo X baja y S frena. Sentado al póker: Espacio/R/F/Tab (ver
  README). Ninguna tecla hace dos cosas a la vez.
- Textos del juego en español rioplatense. `npm test` y `node scripts/check.mjs`.
- Navegador de Claude: `.claude/launch.json` en la carpeta padre ("dukes-dev", puerto 3100, DATA_DIR en %TEMP%).
  Con el panel oculto: `window.__dukesPause = true` y `window.__dukesStep(ms)`; si el canvas queda en 0x0, fijar
  el tamaño del renderer antes de capturar.
- Finales de línea mezclados por archivo (CRLF/LF): respetar el original de cada archivo.
