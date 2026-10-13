// La plata del Desmadre (dólares): cada jugador tiene una billetera que lleva el servidor (server/room.js), por nombre,
// mientras la sala siga abierta. Se gasta en los puestos del mapa y en la barra del Búnker, y se gana apostando a las
// peleas del ring del bar y de la jaula del Búnker (o peleando: el que gana se lleva un premio). Un admin puede
// regalar. Lo que no tiene precio acá sigue siendo gratis.
export const START_MONEY = 300;
export const MAX_MONEY = 1000000;

// precio de cada cosa que se vende (por id de ítem / del menú)
export const PRICES = {
  // taberna, cine, pociones, manzanas, tarot
  beer: 6, smoke: 4, round: 45, lighter: 12, popcorn: 8, apple: 5, fortune: 10,
  pocion_vida: 30, pocion_liebre: 25, pocion_salto: 25, pocion_colores: 20, potion: 15,
  // la barra del Búnker
  fernet: 12, whisky: 15, sangre: 25, absenta: 20,
};
export const priceOf = (id) => (Object.hasOwn(PRICES, id) ? PRICES[id] : 0);

// los lugares donde se pelea y se apuesta. inside: ¿está (x, z) adentro?
export const RINGS = [
  { id: 'bar', name: 'el ring del bar', c: [117.5, -31], inside: (x, z) => Math.abs(x - 117.5) < 4.5 && Math.abs(z + 31) < 4.5 },
  { id: 'jaula', name: 'la jaula del Búnker', c: [15, -466], inside: (x, z) => Math.hypot(x - 15, z + 466) < 3.8 },
];
export const BET_AMOUNTS = [10, 50, 100, 250];
export const BET_OPEN_S = 25; // cuánto quedan abiertas las apuestas desde que hay dos peleadores
export const PURSE = 60; // premio del que gana (más el 10 % de lo apostado)
