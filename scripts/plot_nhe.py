#!/usr/bin/env python3
"""Figure: annual Medicaid+CHIP dental dollars — NHE vs. HHS release vs. CHOMP.

Reads docs/validation/nhe_benchmark.csv (written by scripts/validate_nhe.py) and
writes docs/validation/fig_nhe_benchmark.{png,pdf}. 2024 is drawn hollow because
HHS marks 2024 T-MSIS data as preliminary.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
VAL = REPO_ROOT / "docs" / "validation"

# Reference categorical slots 1-3 (validated all-pairs, light mode) + text tokens.
SERIES = [
    ("medicaid_chip", "NHE Medicaid + CHIP dental services", "#2a78d6", "o"),
    ("release_dental", "HHS release, all D-codes", "#eb6834", "s"),
    ("chomp_50dc", "CHOMP mapped (50 states + DC)", "#1baf7a", "^"),
]
TEXT_PRIMARY, TEXT_SECONDARY, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def main() -> None:
    df = pd.read_csv(VAL / "nhe_benchmark.csv")
    df[[c for c, *_ in SERIES]] = df[[c for c, *_ in SERIES]] / 1000  # $M -> $B

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9})
    fig, ax = plt.subplots(figsize=(6.5, 3.6), dpi=300)
    final = df[~df["preliminary"]]
    prelim = df[df["year"] >= final["year"].max()]  # last final year -> 2024, dashed

    for col, label, color, marker in SERIES:
        ax.plot(final["year"], final[col], color=color, lw=2, marker=marker, ms=6,
                markeredgecolor="white", markeredgewidth=1, label=label, zorder=3)
        ax.plot(prelim["year"], prelim[col], color=color, lw=2, ls=(0, (3, 2)), zorder=2)
        last = df.iloc[-1]
        ax.plot(last["year"], last[col], marker=marker, ms=6, markerfacecolor="white",
                markeredgecolor=color, markeredgewidth=1.5, ls="none", zorder=4)

    # Coverage of NHE for CHOMP, as text under the x labels' data points.
    for _, r in df.iterrows():
        ax.annotate(f"{r['chomp_pct_of_nhe']:.0f}%", (r["year"], r["chomp_50dc"]),
                    textcoords="offset points", xytext=(0, -14), ha="center",
                    fontsize=7.5, color=TEXT_SECONDARY)

    ax.set_ylim(0, 20)
    ax.set_xlim(df["year"].min() - 0.4, df["year"].max() + 0.4)
    ax.set_xticks(df["year"], [f"{y}" + ("*" if p else "") for y, p in zip(df["year"], df["preliminary"])])
    ax.set_ylabel("Dental spending ($ billions)", color=TEXT_PRIMARY)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(TEXT_SECONDARY)
    ax.tick_params(colors=TEXT_SECONDARY)
    ax.legend(loc="upper left", frameon=False, fontsize=8, labelcolor=TEXT_PRIMARY)
    fig.text(0.01, 0.005,
             "Percentages: CHOMP mapped total as a share of NHE Medicaid + CHIP dental. "
             "*2024 T-MSIS data preliminary (HHS).",
             fontsize=7, color=TEXT_SECONDARY)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    for ext in ("png", "pdf"):
        fig.savefig(VAL / f"fig_nhe_benchmark.{ext}", facecolor="white")
    print("wrote", VAL / "fig_nhe_benchmark.png")


if __name__ == "__main__":
    main()
