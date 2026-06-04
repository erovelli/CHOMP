export function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
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
