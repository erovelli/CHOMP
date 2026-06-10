import { CHOROPLETH_COLORS, N_STOPS } from "../mapStyles";

// Plain-JS counterpart of the MapLibre `interpolate(linear, value, ...stops)`
// paint expression used by the live choropleth. The synthesized PNG/JPEG
// exporter renders state fills with this so the exported image's color ramp
// matches the on-screen map exactly (same palette, same quantile breaks). The
// MapLibre side keeps the expression form because the GPU evaluates it; this
// side is for the off-screen Canvas where there's no GL expression engine.

interface Rgb {
    r: number;
    g: number;
    b: number;
}

function hexToRgb(hex: string): Rgb {
    const h = hex.replace("#", "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }: Rgb): string {
    const c = (n: number) =>
        Math.max(0, Math.min(255, Math.round(n)))
            .toString(16)
            .padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
    };
}

const PALETTE_RGB: Rgb[] = CHOROPLETH_COLORS.map(hexToRgb);

// Color shown for missing/NaN values — matches the InfoModal's "no data" mood.
// Kept exported so callers (legend, modal preview) can render a swatch for it.
export const NO_DATA_COLOR = "#eaeae6";

/**
 * Color a single value into a hex string, using the same linear interpolation
 * MapLibre would. `stops` must be the 7-entry quantile breaks produced by
 * `quantileStops()` (see mapStyles.ts). Values below the first stop saturate at
 * the lightest swatch; values above the last saturate at the darkest. NaN /
 * non-finite values resolve to NO_DATA_COLOR — the rate metric uses NaN as a
 * "missing denominator" sentinel and we don't want those painted at the floor.
 */
export function colorForValue(value: number, stops: number[]): string {
    if (!Number.isFinite(value)) return NO_DATA_COLOR;
    if (stops.length !== N_STOPS) return CHOROPLETH_COLORS[0];
    if (value <= stops[0]) return CHOROPLETH_COLORS[0];
    if (value >= stops[N_STOPS - 1]) return CHOROPLETH_COLORS[N_STOPS - 1];
    for (let i = 0; i < N_STOPS - 1; i++) {
        const lo = stops[i];
        const hi = stops[i + 1];
        if (value >= lo && value <= hi) {
            const span = hi - lo;
            const t = span > 0 ? (value - lo) / span : 0;
            return rgbToHex(lerpRgb(PALETTE_RGB[i], PALETTE_RGB[i + 1], t));
        }
    }
    return CHOROPLETH_COLORS[N_STOPS - 1];
}
