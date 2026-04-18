import { describe, it, expect } from "vitest";
import { formatCurrency, formatNumber, formatStop } from "./formatters";

describe("formatCurrency", () => {
    it("renders millions with one decimal and an M suffix", () => {
        expect(formatCurrency(2_500_000)).toBe("$2.5M");
        expect(formatCurrency(1_000_000)).toBe("$1.0M");
    });

    it("renders thousands as whole-number k", () => {
        expect(formatCurrency(45_000)).toBe("$45k");
        expect(formatCurrency(1_000)).toBe("$1k");
    });

    it("renders sub-thousand values as whole dollars", () => {
        expect(formatCurrency(0)).toBe("$0");
        expect(formatCurrency(999)).toBe("$999");
    });

    it("rounds down to the boundary: 999_999 is still thousands, 1_000_000 is millions", () => {
        expect(formatCurrency(999_999)).toBe("$1000k");
        expect(formatCurrency(1_000_000)).toBe("$1.0M");
    });
});

describe("formatStop", () => {
    it("drops the currency symbol but keeps the magnitude suffix", () => {
        expect(formatStop(1_500_000)).toBe("1.5M");
        expect(formatStop(50_000)).toBe("50k");
        expect(formatStop(0)).toBe("0");
    });
});

describe("formatNumber", () => {
    it("adds locale-aware thousands separators", () => {
        expect(formatNumber(1234567)).toBe("1,234,567");
        expect(formatNumber(0)).toBe("0");
    });
});
