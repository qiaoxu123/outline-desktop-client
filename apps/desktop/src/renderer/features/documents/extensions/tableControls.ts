import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import {
  CellSelection,
  addColumn,
  addRow,
  isInTable,
  selectedRect,
} from "@tiptap/pm/tables";

/**
 * Web-style table editing affordances — the gray row/column grip bars and the
 * hover ⊕ insert buttons you see in Outline's editor. Ported from Outline's
 * `TableHeader` / `TableRow` node extensions (which build the same widget
 * decorations on plain ProseMirror) onto TipTap, using `@tiptap/pm/tables`
 * primitives instead of Outline's custom Row/Col selection classes.
 *
 * Grips and buttons render only for the table the cursor is currently in
 * (via `selectedRect`), matching the web behaviour. All the CSS lives in
 * Editor.css under `.doc-editor` (class names mirror Outline's).
 */

type Dispatch = ((tr: Transaction) => void) | undefined;

/* ---------------- queries (selectedRect-based, current table only) --------- */

/** First cell pos of every column in the current table (row 0). */
function cellsInRow0(state: EditorState): number[] {
  const rect = selectedRect(state);
  const cells: number[] = [];
  for (let col = 0; col < rect.map.width; col++) {
    cells.push(rect.tableStart + rect.map.map[col]);
  }
  return cells;
}

/** First (leftmost, unmerged) cell pos of every visual row. */
function rowsInTable(state: EditorState): number[] {
  const rect = selectedRect(state);
  const rows: number[] = [];
  const seen = new Set<number>();
  for (let row = 0; row < rect.map.height; row++) {
    for (let col = 0; col < rect.map.width; col++) {
      const pos = rect.tableStart + rect.map.map[row * rect.map.width + col];
      if (!seen.has(pos)) {
        rows.push(pos);
        seen.add(pos);
        break;
      }
    }
  }
  return rows;
}

function isColumnSelected(index: number, state: EditorState): boolean {
  const sel = state.selection;
  if (sel instanceof CellSelection && sel.isColSelection()) {
    const rect = selectedRect(state);
    return rect.left <= index && rect.right > index;
  }
  return false;
}

function isRowSelected(index: number, state: EditorState): boolean {
  const sel = state.selection;
  if (sel instanceof CellSelection && sel.isRowSelection()) {
    const rect = selectedRect(state);
    return rect.top <= index && rect.bottom > index;
  }
  return false;
}

function isTableSelected(state: EditorState): boolean {
  const sel = state.selection;
  if (sel instanceof CellSelection && !sel.empty) {
    const rect = selectedRect(state);
    return (
      rect.top === 0 &&
      rect.left === 0 &&
      rect.bottom === rect.map.height &&
      rect.right === rect.map.width
    );
  }
  return false;
}

/* ------------------------------ commands ----------------------------------- */

function selectColumn(index: number) {
  return (state: EditorState, dispatch: Dispatch): boolean => {
    const rect = selectedRect(state);
    const $cell = state.doc.resolve(rect.tableStart + rect.map.map[index]);
    dispatch?.(state.tr.setSelection(CellSelection.colSelection($cell)));
    return true;
  };
}

function selectRow(index: number) {
  return (state: EditorState, dispatch: Dispatch): boolean => {
    const rect = selectedRect(state);
    const $cell = state.doc.resolve(
      rect.tableStart + rect.map.map[index * rect.map.width],
    );
    dispatch?.(state.tr.setSelection(CellSelection.rowSelection($cell)));
    return true;
  };
}

function selectWholeTable(state: EditorState, dispatch: Dispatch): boolean {
  const rect = selectedRect(state);
  const first = state.doc.resolve(rect.tableStart + rect.map.map[0]);
  const last = state.doc.resolve(
    rect.tableStart + rect.map.map[rect.map.map.length - 1],
  );
  dispatch?.(state.tr.setSelection(new CellSelection(first, last)));
  return true;
}

function addColumnAt(index: number) {
  return (state: EditorState, dispatch: Dispatch): boolean => {
    const rect = selectedRect(state);
    dispatch?.(addColumn(state.tr, rect, index));
    return true;
  };
}

function addRowAt(index: number) {
  return (state: EditorState, dispatch: Dispatch): boolean => {
    const rect = selectedRect(state);
    dispatch?.(addRow(state.tr, rect, index));
    return true;
  };
}

/* ---------------------------- decorations ---------------------------------- */

function widget(pos: number, className: string, index: number | null): Decoration {
  return Decoration.widget(
    pos + 1,
    () => {
      const el = document.createElement("a");
      el.setAttribute("role", "button");
      el.className = className;
      if (index !== null) el.dataset.index = String(index);
      return el;
    },
    { key: `${className}-${index ?? "x"}` },
  );
}

function buildDecorations(state: EditorState): DecorationSet {
  if (!isInTable(state)) return DecorationSet.empty;

  const decos: Decoration[] = [];
  const cols = cellsInRow0(state);
  const rows = rowsInTable(state);
  const tableSelected = isTableSelected(state);

  // Column grips + add-column buttons (top edge).
  cols.forEach((pos, index) => {
    const selected = tableSelected || isColumnSelected(index, state);
    decos.push(
      widget(
        pos,
        `table-grip-column${index === 0 ? " first" : ""}${
          index === cols.length - 1 ? " last" : ""
        }${selected ? " selected" : ""}`,
        index,
      ),
    );
    if (index === 0) decos.push(widget(pos, "table-add-column first", 0));
    decos.push(widget(pos, "table-add-column", index + 1));
  });

  // Row grips + add-row buttons (left edge) + the top-left whole-table grip.
  rows.forEach((pos, index) => {
    if (index === 0) {
      decos.push(
        widget(pos, `table-grip${tableSelected ? " selected" : ""}`, null),
      );
    }
    const selected = tableSelected || isRowSelected(index, state);
    decos.push(
      widget(
        pos,
        `table-grip-row${index === 0 ? " first" : ""}${
          index === rows.length - 1 ? " last" : ""
        }${selected ? " selected" : ""}`,
        index,
      ),
    );
    if (index === 0) decos.push(widget(pos, "table-add-row first", 0));
    decos.push(widget(pos, "table-add-row", index + 1));
  });

  return DecorationSet.create(state.doc, decos);
}

/* ----------------------------- extension ----------------------------------- */

const tableControlsKey = new PluginKey("tableControls");

export const TableControls = Extension.create({
  name: "tableControls",

  addProseMirrorPlugins() {
    const editor = this.editor;

    const handleGrip = (view: EditorView, event: MouseEvent): boolean => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return false;
      const idx = (el: Element): number =>
        Number(el.getAttribute("data-index"));

      const addCol = target.closest(".table-add-column");
      if (addCol) {
        event.preventDefault();
        event.stopImmediatePropagation();
        addColumnAt(idx(addCol))(view.state, view.dispatch);
        return true;
      }
      const addRowEl = target.closest(".table-add-row");
      if (addRowEl) {
        event.preventDefault();
        event.stopImmediatePropagation();
        addRowAt(idx(addRowEl))(view.state, view.dispatch);
        return true;
      }
      const gripCol = target.closest(".table-grip-column");
      if (gripCol) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectColumn(idx(gripCol))(view.state, view.dispatch);
        return true;
      }
      const gripRow = target.closest(".table-grip-row");
      if (gripRow) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectRow(idx(gripRow))(view.state, view.dispatch);
        return true;
      }
      const grip = target.closest(".table-grip");
      if (grip) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectWholeTable(view.state, view.dispatch);
        return true;
      }
      return false;
    };

    return [
      new Plugin({
        key: tableControlsKey,
        props: {
          decorations: (state) =>
            editor.view?.editable ? buildDecorations(state) : null,
          handleDOMEvents: { mousedown: handleGrip },
        },
        // NB: do NOT mutate the table DOM (e.g. set CSS vars on .tableWrapper)
        // from a plugin view — that element lives inside the contenteditable, so
        // ProseMirror's MutationObserver would see the attribute change, re-run
        // the update, and loop forever. The hover insert-line length is handled
        // purely in CSS instead.
      }),
    ];
  },
});

export default TableControls;
