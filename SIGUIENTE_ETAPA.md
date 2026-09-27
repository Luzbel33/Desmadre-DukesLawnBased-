> Actualización 1.3.0: este documento describe el rediseño posterior a la revisión 1. El audio básico y el reproductor YouTube ya se incorporaron en la revisión 2; su estado de verificación está en README.md y QA/RESULTADOS.md. Voz por proximidad continúa pendiente.

# Próxima etapa — propuesta pendiente de integración

## Objetivo solicitado

Convertir el prototipo en un hub social 3D de navegador con personajes creíbles, objetos en ambas manos y combate basado en contacto físico. Referencias del usuario: Half Sword para interacción corporal, BODYCAM para sensación de primera persona y el video https://www.youtube.com/watch?v=Q3In7lh6O3Q (11:46 y 16:45–17:00) para ambiente/calidad general. Los fragmentos visuales del video no pudieron verificarse en esta sesión; no se afirma haber igualado esa referencia.

## Primera pieza a cerrar: un personaje completo

Antes de extender sistemas a todos los modelos, preparar un personaje humano con geometría de cuerpo, ropa separada, manos/dedos, esqueleto utilizable y materiales verificables. Seleccionar assets con licencia adecuada. La carga del modelo, escala, animaciones y límites de rendimiento se deben probar en el navegador de destino. No sustituir un personaje por otro que solo sea una figura estática.

Propuesta de dirección: mantener Three.js y Rapier; separar el rig visual, controlador de desplazamiento y cuerpos físicos de interacción. No cambiar todo el motor ni rehacer el mapa para poder probar un personaje.

## Controles pedidos por el usuario

| Entrada | Comportamiento objetivo, NO implementado en revisión 1 |
|---|---|
| Mantener clic izquierdo + mover mouse | Controlar brazo derecho |
| Mantener clic derecho + mover mouse | Controlar brazo izquierdo |
| Q | Agarrar/soltar con mano izquierda |
| E | Agarrar/soltar con mano derecha |
| F | Patada |
| Espacio | Salto |
| R | Cabezazo |

Debe resolverse con el usuario el reparto del movimiento del mouse entre cámara y brazos cuando se mantienen uno o ambos botones. Propuesta inicial: objetivo de mano desplazable dentro de un alcance anatómico y giro de cámara al llegar al borde; una tecla separada para mirar libremente. No está decidido ni implementado.

Al cambiar Q/E/R, mover interacción con puertas/vehículos, lanzar objetos y paleta de pintura a controles que no entren en conflicto. Mostrar siempre los controles vigentes en la UI.

## Física, no solamente animaciones

Empezar con un banco de pruebas: un personaje, un objeto por mano, una pared y un oponente. Evaluar articulaciones con límites, masa e impulsos; agarres mediante restricciones; y golpes por contacto y velocidad relativa. Evitar que las manos atraviesen paredes o sostengan objetos a distancia arbitraria.

El cuerpo activo completo, equilibrio, caídas y recuperación son un trabajo separado del simple cambio de teclas. Una primera implementación híbrida puede validar brazos y agarres, pero debe identificarse como tal, sin llamarla equivalente a Half Sword.

El servidor necesita conocer la mano propietaria del agarre, arbitrar ocupación y validar golpes. Hoy permite un solo objeto por jugador y retransmite eventos: no alcanza para afirmar que el nuevo combate está validado o protegido.

## Después del personaje

1. Integrar animaciones y expresiones faciales acordes al nuevo rig, con previsualización de prendas y apariencia.
2. Sustituir cortadoras, carritos y props por modelos con dirección artística coherente. No importar assets pesados sin controlar escala, colisiones y rendimiento.
3. Convertir las áreas de césped cortable en regiones o tiles sincronizados/persistentes; no solo ampliar el rectángulo existente sin gestionar su costo.
4. Revisar graffiti, audio, video y voz como sistemas completos, con estados de carga y errores visibles.
5. Preparar salas públicas/privadas reales, reconexión, límites de abuso, persistencia y despliegue. No desplegar automáticamente ni contratar servicios.

## Recurso solicitado ahora

Subir `makehuman_system_assets_cc0.zip` desde la página oficial enlazada en README. Es material fuente para evaluar personajes modulares, no garantía de que todos sus assets sean aptos sin conversión. Primero se inspeccionará su contenido y las piezas adicionales necesarias antes de prometer una integración definitiva.

## Validación por iteración

Cada entrega debe decir qué cambió, qué pruebas reales pasaron, qué se simuló y qué queda pendiente. Para gráficos y sensación de control, completar los tests automáticos con captura o grabación real en la máquina del usuario. No declarar terminado el juego por pasar únicamente un chequeo de sintaxis.
