import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Inline highlights for anchored comments, aligned with Outline web.
 *
 * Web anchors comments with a `comment` ProseMirror mark, but that mark is
 * never serialized to markdown — a markdown-based client can't see it. What
 * we do get is each comment's `anchorText` (comments.list with
 * includeAnchorText), so we decorate the first exact text match per comment.
 * Anchors that no longer match (edited text, formatting spans) are silently
 * skipped — decoration is best-effort display, never an error.
 */

export interface CommentAnchor {
  id: string;
  anchorText: string;
}

interface PluginState {
  anchors: CommentAnchor[];
  decorations: DecorationSet;
}

export const commentHighlightsKey = new PluginKey<PluginState>(
  "commentHighlights",
);

function buildDecorations(
  doc: PMNode,
  anchors: CommentAnchor[],
): DecorationSet {
  if (anchors.length === 0) return DecorationSet.empty;

  // Flatten the doc to one string with a char-index → doc-position map.
  // Block boundaries become '\n' sentinels (pos -1) so anchors never match
  // across paragraphs.
  let text = "";
  const posMap: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) posMap.push(pos + i);
      text += node.text;
    } else if (node.isBlock && text.length > 0 && !text.endsWith("\n")) {
      posMap.push(-1);
      text += "\n";
    }
    return true;
  });

  const decorations: Decoration[] = [];
  // Duplicate anchor texts consume matches left-to-right.
  const nextSearchStart = new Map<string, number>();

  for (const anchor of anchors) {
    const needle = anchor.anchorText.trim();
    if (!needle) continue;
    let from = nextSearchStart.get(needle) ?? 0;
    let matched = false;
    while (!matched) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      const slice = posMap.slice(idx, idx + needle.length);
      if (slice.every((p) => p >= 0)) {
        decorations.push(
          Decoration.inline(slice[0], slice[slice.length - 1] + 1, {
            class: "comment-anchor",
            "data-comment-id": anchor.id,
          }),
        );
        nextSearchStart.set(needle, idx + 1);
        matched = true;
      } else {
        from = idx + 1; // crossed a block boundary — try the next occurrence
      }
    }
  }

  return DecorationSet.create(doc, decorations);
}

export interface CommentHighlightsOptions {
  onCommentClick?: (commentId: string) => void;
}

export const CommentHighlights = Extension.create<CommentHighlightsOptions>({
  name: "commentHighlights",

  addOptions() {
    return { onCommentClick: undefined };
  },

  addProseMirrorPlugins() {
    const getHandler = () => this.options.onCommentClick;

    return [
      new Plugin<PluginState>({
        key: commentHighlightsKey,
        state: {
          init: () => ({ anchors: [], decorations: DecorationSet.empty }),
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(commentHighlightsKey) as
              | CommentAnchor[]
              | undefined;
            if (meta) {
              return {
                anchors: meta,
                decorations: buildDecorations(newState.doc, meta),
              };
            }
            if (tr.docChanged) {
              return {
                anchors: value.anchors,
                decorations: buildDecorations(newState.doc, value.anchors),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return commentHighlightsKey.getState(state)?.decorations;
          },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement).closest?.(
              "[data-comment-id]",
            );
            const id = el?.getAttribute("data-comment-id");
            if (id) {
              getHandler()?.(id);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
