// Fractal value-noise — the heightmap behind natural coastlines, seas and islands (replaces the old
// square-moat island hack). A few octaves of a smoothly-interpolated random lattice (fractal Brownian
// motion): low frequencies make big landmasses, higher ones crinkle the coast so peninsulas pinch off
// into isles. Seeded → deterministic (same RNG state in ⇒ identical terrain).
import type { RNG } from '../sim/rng.ts';

const smooth = (t: number): number => t * t * (3 - 2 * t);          // smoothstep ease
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// An elevation field in [0,1], length width*height. `baseCells` is the coarsest lattice resolution
// across the map (bigger ⇒ more, smaller landmasses); each octave doubles it and scales its weight by
// `persistence` (higher ⇒ rougher coastlines).
export function fractalHeight(
  rng: RNG, width: number, height: number, octaves = 4, baseCells = 3, persistence = 0.5,
): Float32Array {
  const out = new Float32Array(width * height);
  let amp = 1, totalAmp = 0, cells = baseCells;

  for (let o = 0; o < octaves; o++) {
    const gw = cells + 1;
    const lat = new Float32Array(gw * gw);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();   // a fresh random lattice per octave

    for (let y = 0; y < height; y++) {
      const fy = (y / height) * cells; const gy = Math.min(cells - 1, Math.floor(fy)); const ty = smooth(fy - gy);
      for (let x = 0; x < width; x++) {
        const fx = (x / width) * cells; const gx = Math.min(cells - 1, Math.floor(fx)); const tx = smooth(fx - gx);
        const v00 = lat[gy * gw + gx], v10 = lat[gy * gw + gx + 1];
        const v01 = lat[(gy + 1) * gw + gx], v11 = lat[(gy + 1) * gw + gx + 1];
        out[y * width + x] += lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty) * amp;
      }
    }
    totalAmp += amp; amp *= persistence; cells *= 2;
  }

  for (let i = 0; i < out.length; i++) out[i] /= totalAmp;   // normalise back to [0,1]
  return out;
}
