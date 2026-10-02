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

## 0. Tanda 02/10 — PRIORITARIO (pedido de Luz)

- [ ] Música en todo el Búnker (hoy solo suena en el club): más cabinas/pantallas de DJ con música en las salas.
- [ ] Baile de caño con sentido, sensual y prolijo (hoy se ve random y mal): transiciones suaves, al ritmo, sin poses raras.
- [ ] La bruja de las pociones: poder elegir el tipo de poción (hoy solo una).
- [ ] Más objetos en el Búnker y más NPC en las pistas de baile.
- [ ] Laberinto: pasar a un laberinto normal más elaborado, con sustos (jumpscares) y un tesoro con premio al azar
      (objetos únicos).
- [ ] Sala psicodélica más grande y con más variedad: visuales, ilusiones, cuadros de arte psicodélico libre.
- [ ] Sonidos de fumar (inhalar, exhalar, tos) y de tomar (trago, "ahh" refrescante, a veces eructo).
- [ ] Billetes: una opción tira DE A UNO, la otra tira todos o varios seguidos (hoy siempre la misma cantidad).
- [ ] Reemplazar las rampas por un circuito de carreras con autos de carrera, partes tipo Guts and Glory con
      obstáculos mortales, y MOTOS.
- [ ] Menú de admin (mejor forma de activarlo que el nombre SmokePyro): spawnear cualquier objeto, limpiar/borrar
      cosas, sacar o agregar NPC, cambiar la hora del día, teletransportarse o teletransportar jugadores, dar
      inmortalidad a todos, etc. Poder hacer admin a otro jugador, un escalón abajo (no puede echarnos).

---

## 1. Personajes y NPC — prioridad alta

### Apariencia de personajes no protegidos
- [ ] **Portero:** la “cara de chancho” no se ve correctamente; parece invisible o con geometría/material roto. Revisar orientación de normales, culling, materiales, jerarquía y anclaje del accesorio/capucha.
- [ ] **Sombreros y accesorios de NPC:** varios se ven invisibles, huecos, atravesados o directamente mal colocados. Revisarlos personaje por personaje.
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
- [ ] Narguile del coffeeshop usable (hoy decorativo) y bongs/pipas de la decoración agarrables.
- [ ] Más sustancias con efectos distintos (hoy: línea, pastilla, hongos, y en el coffeeshop blunt, habano, pipa, bong,
      brownie; en la barra fernet, whisky, Sangre del Diablo y absenta). Bongs/pipas de la decoración agarrables.
- Todo optimizado (culling por sala, luces del pool, instancias) y con buenas prácticas.

## 4. Fogata / sector chill

- [ ] **Cocinar malvaviscos:** conseguir palito, acercarlo al fuego, tostado progresivo, quemado, comerlo, soltarlo/revolearlo y sincronizar su estado en red.
- [ ] Revisar que el fuego/fogata siga sin tapar pantallas ni interfaces desde posiciones normales de uso.

---

## 5. Castillo y mundo — bugs visuales concretos

- [ ] Banderas de la fachada que atraviesan el castillo.
- [ ] Mejorar el cartel de la fachada.
- [ ] Palanca afuera y adentro para subir/bajar el rastrillo metálico del portón.
- [ ] Carro de calabazas: evitar que las calabazas atraviesen el carro.
- [ ] Tierra del calabazar y del espantapájaros más orgánica/redondeada; eliminar aspecto de caja.
- [ ] Ampliar el piso superior con más espacios utilizables.
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
- [ ] (Después) Motos y un circuito con trampas tipo Guts and Glory / Happy Wheels.

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
- [ ] Caca agarrable/revoleable que manche.
- [ ] Pedos y variantes de fuego si encajan con el sandbox.

### Otras ideas
- [ ] Variantes de muerte/suicidio caricaturescas planteadas para el sandbox.
