export default function StatCard({ value, label }: { value: string; label: string }) {
    return (
        <div
            style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 12,
            }}
        >
            <div
                style={{
                    fontFamily: "var(--ff-serif)",
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: "var(--ink)",
                    lineHeight: 1,
                    marginBottom: 3,
                }}
            >
                {value}
            </div>
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--ink-dim)",
                }}
            >
                {label}
            </div>
        </div>
    );
}
