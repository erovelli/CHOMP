import { CATEGORY_COLORS } from "../../../constants/map";

interface CategoryRecord {
    category: string;
    total_claims: number;
    total_amount_paid: number;
}

export default function CategoryBreakdown({
    records,
    periodLabel,
}: {
    records: CategoryRecord[];
    periodLabel: string;
}) {
    const maxClaims = Math.max(...records.map((r) => r.total_claims), 1);

    return (
        <>
            <p
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ink-dim)",
                    marginBottom: 12,
                }}
            >
                Breakdown by Category — {periodLabel}
            </p>
            <div style={{ marginBottom: 24 }}>
                {records
                    .sort((a, b) => b.total_claims - a.total_claims)
                    .map((record) => {
                        const pct = (record.total_claims / maxClaims) * 100;
                        const color = CATEGORY_COLORS[record.category] ?? "#999";
                        return (
                            <div key={record.category} style={{ marginBottom: 10 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "baseline",
                                        marginBottom: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 500,
                                            color: "var(--ink)",
                                        }}
                                    >
                                        {record.category}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontFamily: "var(--ff-serif)",
                                            color: "var(--ink-mid)",
                                        }}
                                    >
                                        {record.total_claims.toLocaleString()}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        height: 4,
                                        background: "var(--border)",
                                        borderRadius: 2,
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            width: `${pct}%`,
                                            background: color,
                                            borderRadius: 2,
                                            transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)",
                                        }}
                                    />
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        marginTop: 2,
                                    }}
                                >
                                    <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>
                                        ${(record.total_amount_paid / 1000).toFixed(0)}k paid
                                    </span>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {records.length === 0 && (
                <p
                    style={{
                        fontSize: 12,
                        color: "var(--ink-dim)",
                        textAlign: "center",
                        padding: 20,
                    }}
                >
                    No data available for {periodLabel}
                </p>
            )}
        </>
    );
}
