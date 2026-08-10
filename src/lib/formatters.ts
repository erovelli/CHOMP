export function formatCurrency(value: number): string {
    if (value >= 1_000_000) {
        // Up to 3 decimals so $2,299,000 reads as "$2.299M" instead of the
        // coarse "$2.3M" that hid meaningful precision. Trailing zeros stripped
        // so round numbers like $2M don't render as "$2.000M".
        const m = (value / 1_000_000).toFixed(3).replace(/\.?0+$/, "");
        return `$${m}M`;
    }
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
}

export function formatStop(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return String(value);
}

export function formatNumber(value: number): string {
    return value.toLocaleString();
}

/** Per-enrollee rate, e.g. 1.32 claims per Medicaid enrollee. */
export function formatRatio(value: number): string {
    return value.toFixed(2);
}
