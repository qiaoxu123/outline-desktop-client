import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import hljs from "highlight.js";

/**
 * Syntax highlighting for the editable code blocks.
 *
 * The read view already uses highlight.js, but TipTap's default CodeBlock only
 * renders plain text. Decorations let us highlight the text without replacing
 * the contentDOM, so typing, selection and undo continue to behave normally.
 */
const codeHighlightKey = new PluginKey<DecorationSet>("codeBlockHighlight");

function highlightCode(text: string, language: string): string {
  if (!text) return "";
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value;
  }
  return hljs.highlightAuto(text).value;
}

function decorationsForCodeBlock(
  node: PMNode,
  nodePos: number,
  text: string,
  language: string,
): Decoration[] {
  const html = highlightCode(text, language);
  if (!html) return [];

  const template = document.createElement("template");
  template.innerHTML = html;
  const decorations: Decoration[] = [];

  const visit = (current: Node, offset: number, inherited: string[]): number => {
    const own =
      current instanceof HTMLElement
        ? Array.from(current.classList).filter((name) => name.startsWith("hljs-"))
        : [];
    const classes = [...inherited, ...own].filter(
      (name, index, all) => all.indexOf(name) === index,
    );

    if (current.nodeType === Node.TEXT_NODE) {
      const length = current.nodeValue?.length ?? 0;
      if (length && classes.length) {
        decorations.push(
          Decoration.inline(nodePos + 1 + offset, nodePos + 1 + offset + length, {
            class: classes.join(" "),
          }),
        );
      }
      return offset + length;
    }

    let next = offset;
    current.childNodes.forEach((child) => {
      next = visit(child, next, classes);
    });
    return next;
  };

  // Keep the node argument in the signature: it documents that positions are
  // relative to a codeBlock node and makes accidental top-level offsets harder.
  void node;
  visit(template.content, 0, []);
  return decorations;
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return;
    decorations.push(
      ...decorationsForCodeBlock(
        state.doc,
        pos,
        node.textContent,
        typeof node.attrs.language === "string" ? node.attrs.language : "",
      ),
    );
  });
  return DecorationSet.create(state.doc, decorations);
}

export const CodeBlockHighlight = Extension.create({
  name: "codeBlockHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: codeHighlightKey,
        state: {
          init: (_config, state) => buildDecorations(state),
          apply: (_transaction, _old, _oldState, newState) =>
            buildDecorations(newState),
        },
        props: {
          decorations: (state) => codeHighlightKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export default CodeBlockHighlight;
