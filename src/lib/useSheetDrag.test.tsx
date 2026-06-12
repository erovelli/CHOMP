import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useSheetDrag } from "./useSheetDrag";
import { SHEET_MIN_HEIGHT, SHEET_MAX_VIEWPORT_FRACTION } from "../constants/layout";

const START_HEIGHT = 400;

function Harness() {
    const sheetRef = useRef<HTMLDivElement>(null);
    const dragHandlers = useSheetDrag(sheetRef);
    return (
        <div data-testid="sheet" ref={sheetRef}>
            <div data-testid="handle" {...dragHandlers} />
        </div>
    );
}

// jsdom layout always reports 0×0; pin the sheet's measured height.
function renderSheet() {
    const utils = render(<Harness />);
    const sheet = utils.getByTestId("sheet");
    const handle = utils.getByTestId("handle");
    sheet.getBoundingClientRect = () => ({ height: START_HEIGHT }) as DOMRect;
    return { sheet, handle };
}

// jsdom has no PointerEvent constructor; a MouseEvent with the pointer event
// type carries clientY through, and pointerId is pinned on afterwards.
function firePointer(
    el: Element,
    type: "pointerdown" | "pointermove" | "pointerup",
    init: { pointerId: number; clientY?: number },
) {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY: init.clientY ?? 0,
    });
    Object.defineProperty(event, "pointerId", { value: init.pointerId });
    fireEvent(el, event);
}

describe("useSheetDrag", () => {
    it("grows the sheet when dragging up", () => {
        const { sheet, handle } = renderSheet();
        firePointer(handle, "pointerdown", { pointerId: 1, clientY: 500 });
        firePointer(handle, "pointermove", { pointerId: 1, clientY: 420 });
        expect(sheet.style.height).toBe(`${START_HEIGHT + 80}px`);
        expect(sheet.style.maxHeight).toBe("none");
    });

    it("shrinks the sheet when dragging down, clamped to the minimum", () => {
        const { sheet, handle } = renderSheet();
        firePointer(handle, "pointerdown", { pointerId: 1, clientY: 500 });
        firePointer(handle, "pointermove", { pointerId: 1, clientY: 560 });
        expect(sheet.style.height).toBe(`${START_HEIGHT - 60}px`);

        firePointer(handle, "pointermove", { pointerId: 1, clientY: 5000 });
        expect(sheet.style.height).toBe(`${SHEET_MIN_HEIGHT}px`);
    });

    it("clamps to the viewport-fraction maximum when dragging up", () => {
        const { sheet, handle } = renderSheet();
        firePointer(handle, "pointerdown", { pointerId: 1, clientY: 500 });
        firePointer(handle, "pointermove", { pointerId: 1, clientY: -5000 });
        expect(parseFloat(sheet.style.height)).toBeCloseTo(
            window.innerHeight * SHEET_MAX_VIEWPORT_FRACTION,
        );
    });

    it("ignores moves from a different pointer", () => {
        const { sheet, handle } = renderSheet();
        firePointer(handle, "pointerdown", { pointerId: 1, clientY: 500 });
        firePointer(handle, "pointermove", { pointerId: 2, clientY: 300 });
        expect(sheet.style.height).toBe("");
    });

    it("stops resizing after the pointer is released", () => {
        const { sheet, handle } = renderSheet();
        firePointer(handle, "pointerdown", { pointerId: 1, clientY: 500 });
        firePointer(handle, "pointermove", { pointerId: 1, clientY: 450 });
        const heightAtRelease = sheet.style.height;
        firePointer(handle, "pointerup", { pointerId: 1 });
        firePointer(handle, "pointermove", { pointerId: 1, clientY: 200 });
        expect(sheet.style.height).toBe(heightAtRelease);
    });
});
