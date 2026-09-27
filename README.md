# Duke’s Lawn: DESMADRE — 1.5.0

Lobby online 3D para boludear con amigos: cuerpos físicos estilo Half Sword, piñas, objetos para revolear, gore, cortadoras de pasto, graffiti en cualquier pared, póker, fútbol, YouTube en pantallas compartidas, chat de texto y voz por proximidad.

## Jugar

1. Doble clic en **JUGAR.bat** (necesita Node.js 18 o superior). Levanta el servidor y abre `http://localhost:3000`.
2. Para jugar con amigos por internet, dejá el servidor andando y en otra ventana:

   ```bash
   ngrok http 3000
   ```

   Pasales la URL `https://...` que muestra ngrok. En la misma red alcanza con la IP que muestra el servidor (`http://192.168.x.x:3000`).
3. Salas privadas: agregá `?sala=nombre` a la URL.

No hace falta `npm install`: las librerías y los modelos vienen incluidos. Si cambiaste de versión, recargá con **Ctrl+F5**.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / Shift | Caminar / correr |
| Espacio | Saltar |
| Mouse | Mirar (la cabeza sigue a donde mirás) |
| J | ¿Qué hacemos? Lista de actividades (póker, fútbol, cortadoras, cine...) y marcar destino |
| Click izq. / der. corto | Piña con la mano derecha / izquierda; con algo en la mano: tomar, fumar, comer pochoclos o swing con el arma |
| Click izq. / der. mantenido + mouse | Mover ese brazo (pegar, empujar, revolear). Al llegar al tope del brazo, lo que sobra gira el cuerpo. Rueda: estirar o acercar la mano |
| Los dos clicks | Guardia: manos arriba, los golpes de frente casi no pasan (la cámara sigue libre) |
| E / Q | Agarrar o soltar con la mano derecha / izquierda (solo eso) |
| X | Usar: sentarse/levantarse, subir/bajar del vehículo, heladerita, parrilla, botiquín, pantallas, fútbol |
| G | Revolear lo que tenés en la mano (el brazo toma envión y suelta) |
| F / R | Patada (en la cancha: patear la pelota) / cabezazo |
| 1–4 | Birra, faso, aerosol, mano libre |
| B / rueda | Paleta del aerosol (color, chorreado) / tamaño del trazo |
| C | Cambiar cámara: primera persona / tercera persona (lejos o cerca) |
| T o Enter | Chat (aparece como globo arriba de tu cabeza) |
| V (mantener) / M | Hablar por micrófono / prender o apagar el micrófono |
| P | Pantallas de YouTube (cine, rockola, autocine) |
| Z | Gestos |
| Manejando | W/S acelerar y frenar/reversa · A/D doblar · Shift turbo · Espacio cuchillas · H bocina · X bajarse · click tomar/fumar |
| Tab | Lista de jugadores |
| Esc | Pausa, volumen, silenciar jugadores, opciones |

Se puede agarrar una cosa con las dos manos, agarrar a otro jugador con una mano y pegarle con la otra, y revolear lo que tengas moviendo el brazo y soltando. Sentado (cine, bar, sillones) los brazos y las manos siguen andando: podés tomar, fumar, comer y revolear pochoclos o pegar.

## Qué hay

- **Personajes con peso (estilo GTA V / Half Sword)**: de pie se mueven con animación firme y controlable, se inclinan al acelerar, dan respingos y trastabillan con los golpes; con un golpe fuerte, un choque o una caída pasan a ragdoll real y se levantan solos. Afuera de las zonas PvP los golpes de otros empujan pero no lastiman (el bar es zona PvP; en pausa se puede activar el modo desmadre).
- **Brazos con peso y piñas**: cada mano es una masa que persigue al mouse con inercia (lo que sostenés la hace más lenta y la tira para abajo); la piña sale del hombro con medio paso adelante y giro de torso; después de pegar las manos quedan en guardia un rato. Las manos se frenan contra paredes, vehículos y cuerpos. Solo lastima lo que está atacando (una piña, una patada, un arma blandida, algo revoleado o un vehículo que viene hacia vos): chocarse caminando no saca vida y lo que revoleás vos no te pega en la mano. El que pega avisa el golpe y el que lo recibe lo valida (distancia, zona PvP, guardia).
- **Bolsa de boxeo** al lado del ring para practicar: se hamaca con los golpes y muestra la velocidad de cada piña o patada.
- **Vida**: se recupera sola si hace 5 s que nadie te pega (sentado, más rápido); botiquines en el bar, la terraza, el galpón, la cancha y la plaza (vida, venda y sangre); choripán de la parrilla y pochoclos también curan.
- **Gore**: moretones y sangre por nariz, boca, orejas y ojos; cortes con armas filosas; brazos, piernas y cabezas que se cortan con física (muñón con carne y hueso, ropa empapada alrededor del corte, gotas que se estiran al volar, niebla de sangre en el impacto); cabeza que revienta con golpes brutales (cerebro, ojos, cráneo); tripas colgando; te desangrás. Todo vuelve a la normalidad al reaparecer.
- **Objetos físicos**: sillas plásticas, banquetas, botellas que se rompen, bate, katana, machete, daga, hacha, maza, sartén, ukelele, tacho, cajón de birra, barreta, cartel de piso mojado, tambor, cajas, enanos de jardín, sandías.
- **Cortadoras antiguas y tractor clásico**: volante de madera que gira con las manos del conductor encima, tablero con relojes, ruedas delanteras que doblan, carrocería que se inclina en las curvas y vibra con el motor, humo del escape. En primera persona se ve el volante, el tablero y el capó; se puede tomar una birra manejando. Se puede cortar cualquier pasto del mapa (deja franjas) y vuelve a crecer de a poco; las cuchillas pican lo que agarran.
- **Imagen**: cielo con cúmulos que se mueven, bruma de distancia, pasto alto claro que brilla a contraluz y llega hasta el horizonte, y sombras en dos capas: la dinámica de alta resolución alrededor tuyo y una sombra de todo el mapa calculada una sola vez (edificios, árboles, faroles), así las sombras no se cortan de golpe a los 40 m. La resolución interna se ajusta sola si el juego no llega a ~48 fps.
- **Graffiti libre**: con el aerosol se puede pintar cualquier pared, piso, calle o rampa. Queda guardado y lo ven todos.
- **Póker Texas Hold'em** en el bar (mesa con cámara propia, el servidor reparte y controla las fichas).
- **Fútbol** en la cancha del pasto: llevás la pelota corriendo contra ella, F patea, laterales y saques de arco, partido de 5 min con marcador.
- **YouTube compartido** en el cine, la rockola del bar y el autocine.
- **Voz por proximidad** (WebRTC, se escucha según la distancia y la dirección) y **chat** con globos.
- Birra y faso con efectos de borrachera y de estar fumado; coma alcohólico si te pasás.

## Verificaciones

```bash
npm test
```

44 pruebas: movimiento del jugador físico (caminar, saltar, paredes, cámara), brazos con peso y piñas, golpes justos (sin daño por chocarse ni por lo propio revoleado, guardia, zona PvP), sentado con las manos libres, regeneración de vida, controles sin teclas pisadas, carteles tapados por paredes, vehículos, aerosol, audio, YouTube y red.

Para probar a mano desde la consola del navegador: `__dukesPause = true` congela el juego y `__dukesStep()` avanza un cuadro.

## Límites conocidos

- Los pedazos de gore y los objetos rotos son locales de cada cliente: pueden no caer exactamente igual para todos.
- El servidor está pensado para jugar con amigos: no tiene cuentas, moderación ni protección contra tramposos (cada uno decide el daño que recibe; el aviso de golpe del atacante se valida en el cliente del golpeado).
- La bolsa de boxeo es física local: cada jugador ve la suya.
- Los videos de YouTube dependen de que el video permita inserción y de las políticas de autoplay de cada navegador.
- Los modelos de personajes (Renderpeople) son de uso libre para proyectos propios; no redistribuyas los archivos de `public/assets/chars` por separado.

## Alojamiento gratuito

El servidor puede desplegarse como un único Web Service de Node en Render: sirve el juego y acepta WebSocket en `/ws` bajo HTTPS/WSS. En el plan Free puede tardar cerca de un minuto en despertar después de 15 minutos sin tráfico. Las salas viven en memoria y los cambios de graffiti/pasto se guardan en el disco local; Render Free puede reiniciar el servicio y descarta ese disco, así que esos datos no son permanentes.

## Créditos

- Modelos y texturas: [Poly Haven](https://polyhaven.com) (CC0).
- Sonidos: [Kenney](https://kenney.nl) (CC0).
- Personajes: Renderpeople (modelos gratuitos).
- Árboles: [ez-tree](https://github.com/dgreenheck/ez-tree) (MIT).
- Motor: three.js (MIT) y Rapier (Apache 2.0).
