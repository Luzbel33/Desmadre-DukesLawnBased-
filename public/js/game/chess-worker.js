// El Conde piensa acá (fuera del hilo del juego: una jugada a 3 de profundidad tarda ~250 ms y trababa la imagen)
import { bestMove } from '../shared/chess.js';

self.onmessage = (e) => {
  const { id, st, depth } = e.data || {};
  let m = null;
  try { m = bestMove(st, depth || 3); } catch { m = null; }
  self.postMessage({ id, m });
};
