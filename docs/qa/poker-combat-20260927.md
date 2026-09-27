# Póker y combate — revisión del 27/09/2026

Este informe complementa el diagnóstico histórico de PENDIENTES.md. Rama: feature/poker-combat-20260927; PR #2.

## Póker

Mesa dedicada de Texas Hold’em sin límite, con dos cartas privadas, cinco lugares comunitarios, estado de los jugadores, fichas, apuestas, turno, resultados y ayuda visual. El servidor valida las acciones, las subidas mínimas, las apuestas de todas las fichas, los pozos laterales, los empates y la devolución de apuestas no igualadas. Las cartas privadas se envían únicamente a su dueño.

Controles: Espacio para pasar o igualar; A para apostar/subir; flechas o cantidad escrita para ajustar; Enter para confirmar; F para retirarse; T para todas las fichas; H para ayuda; I para historial; X para salir. Se pide confirmación en las acciones importantes. Se conservan controles táctiles como alternativa al teclado.

## Cuerpo e interacciones

- Ser agarrado no provoca KO automáticamente. El jugador conserva sus acciones mientras está de pie; el arrastre aplica un desplazamiento limitado, escalado por masa, a través del controlador de colisiones.
- Antes de desactivar un miembro se eliminan las articulaciones que lo conectan. Al reaparecer se restauran. Se evita conservar una articulación contra un cuerpo desactivado/sin masa que puede lanzar al resto del personaje.
- Se conserva la pose física en la transición a ragdoll, se limitan velocidades cinemáticas residuales y se añaden impulsos acotados de reacción.
- Las lesiones de brazos pueden sobrevivirse; se acumula trauma de cortes por miembro. El desangrado y los golpes adicionales siguen pudiendo matar.
- Se disparan reacciones de dolor en impactos del torso/extremidades y en daños remotos. Se usa la síntesis de audio existente, no un paquete de voces grabadas.

## Fallo adicional encontrado al retomar

La traza de arrastre mostraba daño de caída estando apoyado contra otro jugador. Se ejecutaban dos consultas de desplazamiento: una decidía el apoyo y la velocidad de caída, y otra cambiaba el movimiento real incluyendo cuerpos remotos. Ese desacuerdo acumulaba una velocidad vertical ficticia.

Ahora el controlador usa una sola consulta para desplazamiento, apoyo y caída. El adaptador está limitado a la instancia de LocalPlayer y conserva el núcleo compartido. Prueba de regresión: permanecer apoyado en una superficie remota a medio metro y luego bajar al piso no debe acumular velocidad de caída ni provocar daño.

## Validación

80/80 pruebas en tres ejecuciones consecutivas; 73 módulos sin errores de sintaxis; prueba HTTP/WebSocket con tres clientes aprobada. Las trazas de arrastre posteriores a la corrección terminaron con 100 HP, control activo y sin eventos de impacto ficticios.

El workflow Desmadre QA también ejecuta pruebas de teclado, vista de escritorio/móvil, cartas privadas, prevención de doble envío, confirmaciones y reparto real por WebSocket. El escenario de cuerpo usa los tres GLB reales (Eric, Carla y Claudia), captura impacto, lesión y cadáver, y comprueba valores finitos y estabilidad. Consultar el resultado del workflow del commit que se vaya a desplegar.

## Límites pendientes

La locomoción de pie sigue siendo cinemática con IK. Esto NO es un active ragdoll integral ni una equivalencia con GTA V o Half Sword. La prueba visual cubre los escenarios capturados, no todas las combinaciones de agarres, articulaciones, armas y latencia. No dar por eliminadas todas las T-poses o interpenetraciones sin ampliar esa validación. Quedan pendientes mayor equilibrio físico, respuesta corporal continua y audio vocal más natural.
