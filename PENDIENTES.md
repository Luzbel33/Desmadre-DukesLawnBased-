# PENDIENTES — DESMADRE

Fuente única de trabajo pendiente.  
**Este archivo debe contener solamente cosas que todavía falten.** Cuando algo quede resuelto y verificado, se elimina en vez de acumular historial.

## Reglas de trabajo

- Trabajar sobre el estado actual del repo; no rehacer funciones que ya existen.
- No pisar trabajo paralelo de otros agentes. Revisar `main` antes de integrar.
- Toda tanda terminada: pruebas/regresiones → `main` → deploy manual en Render → verificar `live`.
- Textos del juego en español rioplatense.
- **PROHIBIDO modificar modelos, cuerpos, rigs, materiales, texturas, generadores o apariencia de las bailarinas/chicas del club.** Están como deben quedar.
- Si se arreglan sistemas compartidos de personajes, comprobar explícitamente que no cambien visualmente a las bailarinas.

---

## 0. Tanda 13/10 — pedido de Luz (todo esto)

### Castillo
- [ ] Terminar la expansión del castillo: piso de arriba, torres, más habitaciones y mejor hechas (trabajo de Codex
      sin commitear integrado el 13/10: `world/castle-expansion.js`).
- [ ] Sustos del piso de arriba y las torres hechos (`game/haunt-upper.js`, 2-3 variantes por cuarto, ruidos al azar):
      probarlos jugando y ajustar tiempos. Sustos nuevos de la planta baja hechos 13/10 (`game/haunt-ground.js`: cocina, biblioteca, salón y comedor, 2-3 variantes): probarlos jugando y ajustar tiempos.
- [ ] Ajedrez (hecho 13/10: biblioteca y cuarto de los condes, contra otro o contra el Conde; `game/chess.js`). Falta:
      probarlo entre dos personas y sumar tableros en otros lugares (taberna, coffeeshop).

### Humor físico estilo POSTAL 2
- [ ] Hecho 13/10 (rueda Z: mear, vomitar, eructar, pedo, cagarse + encendedor; `game/gags.js`): se camina mientras
      tanto, el chorro va adonde apuntás y mancha a players y NPC (se seca solo), la caca reventada mancha, los NPC
      vomitan del asco. Probar en multiplayer real. Sonidos sintetizados: si Luz quiere, grabaciones CC0.

### Admin
- [ ] Hecho 13/10: espectar, congelar, muteo global (voz y chat), darle cosas/plata a otro, velocidad/salto/gravedad de
      uno o de todos. Falta: **tamaño** del jugador (escalar cuerpo + cápsula + ragdoll juntos; va con la mosca) y
      probarlo con gente real.

### Personajes / juego
- [ ] Playermodel mosca diminuta (para el dueño): vuela, zumba, se la puede aplastar, voz súper aguda por el mic; no
      puede tomar, pero sí jugar al póker y fumar mini cigarritos.
- [ ] Plata (hecho 13/10, `shared/economy.js`, `game/money.js`): billetera de $300 por nombre (la lleva el servidor mientras la sala
      siga abierta), precios en los puestos y la barra del Búnker, apuestas a las peleas del ring del bar y la jaula con
      pozo compartido y premio para el que gana, y el admin puede regalar. Falta: más usos (comprar skins/autos, premio
      del circuito, propinas a los bailarines), guardar la plata entre reinicios del servidor y probar con gente.
- [ ] Pool (hecho 13/10: mesa en el bar, bola 8 de a dos o práctica solo; `game/pool.js`, física en `shared/pool.js`).
      Falta: probar entre dos personas, efecto a la blanca (retroceso/corrido) y bola en mano después de una falta.
- [ ] Cyber con PCs/maquinitas: minijuegos de plataformas de a uno o cooperativos.
- [ ] Skates con ollies y trucos.
- [ ] Escobas voladoras / vehículos voladores y un minijuego con eso.

### Pulido general "triple A" (pedido 13/10)
- [x] Hecho 13/10: patio del castillo (huerta con tierra natural, cementerio, fachada, torres con cubiertas; `world/castle-yard.js`),
      paredes del torreón (tapices, trofeos, armas, candeleros, mugre; `world/castle-walls.js`), pala del sepulturero, baile
      de caño (espalda), caminata/idle con resortes, calavera-palanca con máscara de toro, sangre del ahorcado, props
      decimados. Nuevo `world/ambient-props.js`: afiches, grafitis, charcos, manchas de aceite, hojas, basura, cajones,
      barriles, cubiertas, rocas, arbustos y flores repartidos por callejón, estacionamiento, bar, cine, galpón, entrada,
      pasto y cancha (todo validado con rayos de física); lámparas en el galpón.
- [ ] Falta: banderas con colisiones mal (no ubicadas), puerta secreta del cementerio (qué hay del otro lado), interiores
      aún oscuros (bar, cine, castillo), arsenal del Búnker (variedad y arreglos), armas (animaciones, apuntar, variedad),
      NPC de las peleas del Búnker que solo peleen si el jugador las activa, LOD de personajes (30-45k tris cada NPC).

### Mapa
- [ ] Expandir el mapa: más lugares, edificios, ascensores, abismos con pinchos, una prisión, más atmósfera,
      easter eggs, pasadizos secretos.
- [ ] Museo para colgar pinturas nuestras.
- [ ] Cavar en el suelo y construir (tipo minecraft pero orgánico, sin cubos).

### Búnker
- [ ] Cámaras de vigilancia (hecho 13/10): imagen en color y más nítida, arrastrar/rueda para girar y hacer zoom,
      F = hablar por el altavoz de la cámara, P = música de YouTube por todos los altavoces (`cctv_pa`). Probar la voz
      por altavoz con gente real (que se oiga bien y no se acople).

---

## 0b. Tanda 02/10

- [ ] Sala psicodélica (opcional): cuadros de arte libre (Haeckel, Hilma af Klint, Kandinsky, Louis Wain). Arte de
      terceros solo con permiso del artista. (Ya tiene DJ de psytrance, ilusiones ópticas y gente en trance.)
- [ ] Circuito del Desmadre (hecho 12/10, `world/circuit.js`, `game/race.js`, `shared/circuit-traps.js`): probarlo
      con gente real (carrera de 3 vueltas desde el poste del semáforo) y ajustar velocidades/trampas si hace falta.
- [ ] Panel de admin (F9, `ui/admin.js`): completar prueba de interfaz con personas reales. Permisos, expulsión,
      traslado, promociones y revocaciones ya pasan una prueba con ocho conexiones WebSocket al servidor real.

---

## 1. Personajes y NPC — prioridad alta

### Apariencia de personajes no protegidos
- [ ] **Sombreros y accesorios de NPC:** continuar la revisión de los restantes personajes; guardia y granjero ya tienen corregido el pelo que atravesaba sus sombreros.
- [ ] **Caras de NPC/playermodels que NO sean las bailarinas:** corregir ojos ausentes, bigotes/manchas/colores extraños, UV/materiales incorrectos y geometrías faciales rotas.
- [ ] Hacer una pasada visual de cerca y de lejos a cada personaje no protegido después de los arreglos para evitar accesorios flotantes, invertidos o que desaparezcan por culling.

### Comportamiento / física

- [ ] Revisar que no quede ningún NPC con animaciones rotas o mal hechas (el sepulturero ya cava con las dos manos).
- [ ] Colisiones de cuerpo completo: brazos activos, cabeza y piernas contra jugadores, NPC, vehículos y objetos.
- [ ] Ragdolls y miembros cortados como **props de red autoritativos**, agarrables/revoleables y sincronizados para todos los clientes.
- [ ] Movimiento secundario del cuerpo más natural/pesado, estilo GTA V / Half Sword, sin romper el controlador actual.
- [ ] Validar en multiplayer real que objetos revoleados contra jugadores den daño/reacción/feedback correctamente.

---

## 2. Combate y armas

- [ ] Probar con dos jugadores: patadas y agarre entre jugadores (contra NPC ya andan) y que el nombre del Diablo
      invisible no se vea (el código ya lo oculta).
- [ ] Apuntado real: mano y arma siguiendo la mira, poses coherentes, animaciones y retroceso.
- [ ] Cuchillos y armas blancas que puedan quedar clavados en jugadores, piso o madera y luego sacarse/agarrarse.
- [ ] Revisar interacción entre armas clavadas, ragdoll, gore y props de red para que no se dupliquen ni desaparezcan.

---

## 3. Cámara e interacción

- [ ] Probar con mouse real la rueda de vistas (Y sostenida) y los brazos de frente (el mouse va espejado para que la
      mano siga a la pantalla); probar el aliento del Diablo de frente.
- [ ] Probar comodidad real del selector de hombro izquierdo/centro/derecho con agarre, combate e interacción.
- [ ] Verificar y ajustar la cámara al sentarse en el trono.
- [ ] Revisar casos donde cámara, manos o interacción atraviesen paredes/props en tercera persona.

---

## 3b. Búnker grande — PRIORITARIO (no postergar)

Hecho (club-wings.js): coffeeshop "Ámsterdam" + sala de cultivo, El Infierno (dos pisos: pista de lava, isla con
caños, balcón en U, boca del DJ), sala VIP con caños, Arsenal militar (pistolas y granadas se agarran ahí), máquinas de
humo en el club, ~20 NPC más (6 bailarinas duplicadas en caños, DJ, público, gente fumando, jardinero, sargento,
patovica). Ala oeste: sala psicodélica (shader caleidoscópico, hongos, ojos, lámparas de lava, espejo infinito; pega
un poco en la pantalla) y laberinto de espejos con tres espejos deformantes reales. Cada sala se dibuja solo si se ve;
modelos cargados al acercarse.

- [ ] Probar en el juego la coreografía de caño (giro, ondas, apoyada, trepada, de cabeza) y ajustar distancias al caño.
- [ ] Bongs/pipas de la decoración del coffeeshop agarrables (el narguile ya tiene interacción).
- [ ] Más sustancias con efectos distintos (hoy: línea, pastilla, hongos, y en el coffeeshop blunt, habano, pipa, bong,
      brownie; en la barra fernet, whisky, Sangre del Diablo y absenta). Bongs/pipas de la decoración agarrables.
- Todo optimizado (culling por sala, luces del pool, instancias) y con buenas prácticas.

## 4. Fogata / sector chill

- [ ] **Cocinar malvaviscos:** conseguir palito, acercarlo al fuego, tostado progresivo, quemado, comerlo, soltarlo/revolearlo y sincronizar su estado en red.
- [ ] Revisar que el fuego/fogata siga sin tapar pantallas ni interfaces desde posiciones normales de uso.

---

## 5. Castillo y mundo — bugs visuales concretos

- [ ] Mejorar el cartel de la fachada.
- [ ] Palanca afuera y adentro para subir/bajar el rastrillo metálico del portón.
- [ ] Tierra del calabazar y del espantapájaros más orgánica/redondeada; eliminar aspecto de caja.
- [ ] Corregir calaveras/props flotantes de la sala secreta y otros objetos flotantes que sigan apareciendo.

### Pase visual general
- [ ] Mejorar cielo/tormenta, pasto, fuego y lectura nocturna donde todavía haga falta.
- [ ] Tumbas más orgánicas.
- [ ] Enredaderas.
- [ ] Pestillo/interacción del cementerio.
- [ ] Caldero.
- [ ] Más esqueletos/cadáveres ambientales donde tenga sentido.
- [ ] Luz visible a través de ventanas/interiores.
- [ ] Densificar decoración del castillo sin destruir rendimiento: telarañas, insectos, cadáveres/colgados, sustos y props.
- [ ] Expandir zona de terror: calabozo/sótano, puente/foso y pasadizos.

---

## 6. Vehículos y movimiento

- [ ] Dive: a veces te quedás trabado en cosas (colisiones del mapa que faltan, están mal o a medias: normalizarlas).
- [ ] Probar el manejo en rampas y saltos (sube, cabecea, vuela y cae); ajustar si algún vehículo se traba.

- [ ] Física de vehículos más convincente: peso, choques jugador/NPC/vehículo y respuesta sin comportamientos explosivos.
- [ ] Revisar cortadoras y otros vehículos/props móviles que todavía floten, atraviesen geometría o reaccionen raro.

---

## 7. Audio, voz, YouTube y controles

### QA real
- [ ] Probar voz entre **dos PCs reales**, con micrófonos reales y, si es posible, redes/NAT diferentes.
- [ ] Probar YouTube con videos reales variados: autoplay bloqueado, videos restringidos, bloqueadores y reconexión.
- [ ] Confirmar rendimiento y audio general en la PC de Luz.

### Mejoras todavía pendientes
- [ ] Autoescucha/monitor opcional del micrófono.
- [ ] Controles completamente rebindeables sin acciones duplicadas.
- [ ] Búsqueda de YouTube dentro del juego, además de pegar URL.

---

## 8. Fútbol

- [ ] Arreglar el traslado/control de la pelota para que llevarla corriendo sea consistente.
- [ ] Revisar colisiones, arcos y reglas en multiplayer real.

---

## 9. Póker — pulido pendiente

- [ ] Llevarlo más hacia una experiencia RDR2: cartas más legibles, turnos más claros y mejor lectura de cuánto se apuesta/gana/pierde.
- [ ] Mejorar control de apuesta con teclado.
- [ ] Acciones/animaciones de mirar cartas, festejar y putear.
- [ ] Comodidad para chatear y hablar por voz mientras se está sentado.
- [ ] Revisar acercamiento/inspección de cartas propias y comunitarias.

---

## 10. Rendimiento

- [ ] Probar con los amigos que andaban a 2 FPS: el preset arranca en Automático (core/graphics.js elige por placa y baja/sube solo);
      si alguno sigue lento, pedirle el nombre de la placa (aviso del lobby si el navegador va sin aceleración).
- [ ] Si hace falta más en integradas: bajar el costo de CPU de three.js al recorrer la escena (~4 ms) y la distancia de dibujo en Mínimo.
- [ ] QA de rendimiento real en la PC de Luz después de los cambios recientes.
- [ ] Perfilar caídas puntuales antes de seguir agregando densidad visual.
- [ ] Mantener culling/LOD/sleep de NPC y partículas sin bajar la calidad visual cercana.

---

## 11. Más adelante

### Multiplayer / salas
- [ ] Menú previo al juego para ver salas, crear salas y opcionalmente poner contraseña.

### Playermodels
- [ ] Agregar más playermodels graciosos/profesionales: Kermit, Elmo, Scream, aliens, robots, enanos, memes, Hello Kitty, etc., usando assets con licencia válida y pipeline de rig consistente.

### Objetos e interacciones sandbox
- [ ] Empujones.
- [ ] Frisbees.
- [ ] Aviones de papel.
- [ ] Sorbete con bolitas.
- [ ] Láser con feedback al apuntar a la cara.
- [ ] Gomitas.
- [ ] Soga para trepar/atar.
- [ ] Gancho tipo Batman.
- [ ] Bombuchas.
- [ ] Tomates que manchen.
- [ ] Matafuegos.
- [ ] Insecticida.
- [ ] Látigo/correa.
- [ ] Rueda de ítems.

### Gestos / humor físico
- [ ] Mear.
- [ ] Vomitar.
- [ ] Escupir.
- [ ] Pedos y variantes de fuego si encajan con el sandbox.

### Otras ideas
- [ ] Variantes de muerte/suicidio caricaturescas planteadas para el sandbox.
