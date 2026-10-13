#!/usr/bin/env python3
"""Figure 2: annual Medicaid+CHIP dental dollars — NHE vs. HHS release vs. CHOMP.

Reads docs/validation/nhe_benchmark.csv (written by scripts/validate_nhe.py) and
writes docs/validation/Fig2.{eps,pdf,png} (Springer naming). Sized and typeset for
Springer journal artwork: 174 mm (full-page) width, Arial, >= 8 pt, vector
PDF/EPS for submission plus a 300 dpi PNG preview. Notes (preliminary 2024, what
the percentages mean) belong in the caption, not the artwork. 2024 is drawn
hollow with a dashed connector because HHS marks 2024 T-MSIS data as preliminary.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
VAL = REPO_ROOT / "docs" / "validation"
MM = 1 / 25.4

# Reference categorical slots 1-3 (validated all-pairs, light mode) + text tokens.
# Marker shape is the secondary encoding for grayscale print.
SERIES = [
    ("medicaid_chip", "NHE Medicaid + CHIP dental services", "#2a78d6", "o"),
    ("release_dental", "HHS release, all D-codes", "#eb6834", "s"),
    ("chomp_50dc", "CHOMP mapped (50 states + DC)", "#1baf7a", "^"),
]
TEXT_PRIMARY, TEXT_SECONDARY, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def main() -> None:
    df = pd.read_csv(VAL / "nhe_benchmark.csv")
    df[[c for c, *_ in SERIES]] = df[[c for c, *_ in SERIES]] / 1000  # $M -> $B

    plt.rcParams.update({
        "font.family": "Arial", "font.size": 8, "pdf.fonttype": 42, "ps.fonttype": 42,
    })
    fig, ax = plt.subplots(figsize=(174 * MM, 92 * MM))
    final = df[~df["preliminary"]]
    tail = df[df["year"] >= final["year"].max()]  # last final year -> preliminary year

    for col, label, color, marker in SERIES:
        ax.plot(final["year"], final[col], color=color, lw=1.5, marker=marker, ms=5,
                markeredgecolor="white", markeredgewidth=0.8, label=label, zorder=3)
        ax.plot(tail["year"], tail[col], color=color, lw=1.5, ls=(0, (3, 2)), zorder=2)
        last = df.iloc[-1]
        ax.plot(last["year"], last[col], marker=marker, ms=5, markerfacecolor="white",
                markeredgecolor=color, markeredgewidth=1.2, ls="none", zorder=4)

    for _, r in df.iterrows():
        ax.annotate(f"{r['chomp_pct_of_nhe']:.0f}%", (r["year"], r["chomp_50dc"]),
                    textcoords="offset points", xytext=(0, -12), ha="center",
                    fontsize=8, color=TEXT_SECONDARY)

    ax.set_ylim(0, 20)
    ax.set_xlim(df["year"].min() - 0.4, df["year"].max() + 0.4)
    ax.set_xticks(df["year"], [f"{y}" + ("*" if p else "") for y, p in zip(df["year"], df["preliminary"])])
    ax.set_ylabel("Dental spending ($ billions)", color=TEXT_PRIMARY)
    ax.grid(axis="y", color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(TEXT_SECONDARY)
        ax.spines[s].set_linewidth(0.6)
    ax.tick_params(colors=TEXT_SECONDARY, width=0.6)
    ax.legend(loc="upper left", frameon=False, labelcolor=TEXT_PRIMARY, handlelength=2.5)
    fig.tight_layout()

    for ext in ("pdf", "eps"):
        fig.savefig(VAL / f"Fig2.{ext}", facecolor="white")
    fig.savefig(VAL / "Fig2.png", dpi=300, facecolor="white")
    print("wrote", ", ".join(str(VAL / f"Fig2.{e}") for e in ("pdf", "eps", "png")))


if __name__ == "__main__":
    main()
