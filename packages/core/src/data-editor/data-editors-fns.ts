import { assertNever } from "../common/support";
import { DataGridSearchProps } from "../data-grid-search/data-grid-search";
import { GridCell, GridCellKind, GridSelection, Rectangle } from "../data-grid/data-grid-types";

export function expandSelection(
    newVal: GridSelection,
    getCellsForSelection: DataGridSearchProps["getCellsForSelection"],
    rowMarkerOffset: number,
    spanRangeBehavior: "allowPartial" | "default",
    abortController: AbortController
): GridSelection {
    const origVal = newVal;
    if (spanRangeBehavior === "allowPartial" || newVal.current === undefined) return newVal;
    if (getCellsForSelection !== undefined) {
        let isFilled = false;
        do {
            if (newVal?.current === undefined) break;
            const r: Rectangle = newVal.current?.range;
            const cells: (readonly GridCell[])[] = [];
            if (r.width > 2) {
                const leftCells = getCellsForSelection(
                    {
                        x: r.x,
                        y: r.y,
                        width: 1,
                        height: r.height,
                    },
                    abortController.signal
                );

                if (typeof leftCells === "function") {
                    return origVal;
                }

                cells.push(...leftCells);

                const rightCells = getCellsForSelection(
                    {
                        x: r.x + r.width - 1,
                        y: r.y,
                        width: 1,
                        height: r.height,
                    },
                    abortController.signal
                );

                if (typeof rightCells === "function") {
                    return origVal;
                }

                cells.push(...rightCells);
            } else {
                const rCells = getCellsForSelection(
                    {
                        x: r.x,
                        y: r.y,
                        width: r.width,
                        height: r.height,
                    },
                    abortController.signal
                );
                if (typeof rCells === "function") {
                    return origVal;
                }
                cells.push(...rCells);
            }

            let left = r.x - rowMarkerOffset;
            let right = r.x + r.width - 1 - rowMarkerOffset;
            cells.forEach(row =>
                row.forEach(cell => {
                    if (cell.span === undefined) return;
                    left = Math.min(cell.span[0], left);
                    right = Math.max(cell.span[1], right);
                })
            );
            if (left === r.x - rowMarkerOffset && right === r.x + r.width - 1 - rowMarkerOffset) {
                isFilled = true;
            } else {
                newVal = {
                    current: {
                        cell: newVal.current.cell ?? [0, 0],
                        range: {
                            x: left + rowMarkerOffset,
                            y: r.y,
                            width: right - left + 1,
                            height: r.height,
                        },
                        rangeStack: newVal.current.rangeStack,
                    },
                    columns: newVal.columns,
                    rows: newVal.rows,
                };
            }
        } while (!isFilled);
    }
    return newVal;
}

export function unquote(str: string): string[][] {
    function descape(s: string): string {
        if (s.startsWith('"') && s.endsWith('"')) {
            s = s.slice(1, -1).replace(/""/g, '"');
        }
        return s;
    }

    const enum State {
        None,
        inString,
        inStringPostQuote,
    }

    const result: string[][] = [];
    let current: string[] = [];

    let start = 0;
    let state = State.None;
    str = str.trim().replace(/\r\n/g, "\n");
    let index = 0;
    for (const char of str) {
        switch (state) {
            case State.None:
                if (char === "\t" || char === "\n") {
                    current.push(str.slice(start, index));
                    start = index + 1;

                    if (char === "\n") {
                        result.push(current);
                        current = [];
                    }
                } else if (char === `"`) {
                    state = State.inString;
                }
                break;
            case State.inString:
                if (char === `"`) {
                    state = State.inStringPostQuote;
                }
                break;
            case State.inStringPostQuote:
                if (char === '"') {
                    state = State.inString;
                } else if (char === "\t" || char === "\n") {
                    current.push(descape(str.slice(start, index)));
                    start = index + 1;

                    if (char === "\n") {
                        result.push(current);
                        current = [];
                    }
                    state = State.None;
                } else {
                    state = State.None;
                }
                break;
        }

        index++;
    }
    if (start < str.length) {
        current.push(descape(str.slice(start, str.length)));
    }
    result.push(current);
    return result;
}

export function copyToClipboard(cells: readonly (readonly GridCell[])[], columnIndexes: readonly number[]) {
    function escape(str: string): string {
        if (/\n|"|\t/.test(str)) {
            str = `"${str.replace(/"/g, `""`)}"`;
        }
        return str;
    }

    const formatCell = (cell: GridCell, index: number): string => {
        const colIndex = columnIndexes[index];
        if (cell.span !== undefined && cell.span[0] !== colIndex) return "";
        switch (cell.kind) {
            case GridCellKind.Text:
            case GridCellKind.Number:
                return escape(cell.displayData);
            case GridCellKind.Markdown:
            case GridCellKind.RowID:
            case GridCellKind.Uri:
                return escape(cell.data);
            case GridCellKind.Image:
            case GridCellKind.Bubble:
                return cell.data.reduce((pv, cv) => `${escape(pv)},${escape(cv)}`);
            case GridCellKind.Boolean:
                return cell.data ? "TRUE" : "FALSE";
            case GridCellKind.Loading:
                return "#LOADING";
            case GridCellKind.Protected:
                return "************";
            case GridCellKind.Drilldown:
                return cell.data.map(i => i.text).reduce((pv, cv) => `${escape(pv)},${escape(cv)}`);
            case GridCellKind.Custom:
                return escape(cell.copyData);
            default:
                assertNever(cell);
        }
    };

    const str = cells.map(row => row.map(formatCell).join("\t")).join("\n");
    void window.navigator.clipboard.writeText(str);
}
