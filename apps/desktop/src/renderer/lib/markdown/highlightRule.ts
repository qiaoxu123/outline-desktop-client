import type MarkdownIt from "markdown-it";

/**
 * Highlight (`==text==`) as a markdown-it inline rule — a faithful port of
 * Outline's own rule (`shared/editor/rules/mark.ts`), so the desktop client
 * parses highlights EXACTLY like Outline web.
 *
 * Why not `markdown-it-mark`: markdown-it-mark tags each delimiter with its
 * real length, so markdown-it's "rule of 3" kicks in and REFUSES to pair the
 * merged `====` run in two adjacent highlights (`==a====b==`), leaving literal
 * `==` on screen. Outline pushes every delimiter with `length: 0`, which
 * disables the rule of 3 entirely, so adjacent highlights pair correctly.
 *
 * Emits `<mark>` (tag override below) so both the read renderer's CSS and the
 * editor's Highlight mark (which parses `<mark>` HTML) pick it up.
 */
export default function highlightRule(md: MarkdownIt): void {
  const delim = "==";
  const markName = "highlight";
  const delimCharCode = delim.charCodeAt(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function tokenize(state: any, silent: boolean): boolean {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) return false;
    if (marker !== delimCharCode) return false;

    const scanned = state.scanDelims(state.pos, true);
    let len = scanned.length;
    const ch = String.fromCharCode(marker);
    if (len < 2) return false;

    let token;
    if (len % 2) {
      token = state.push("text", "", 0);
      token.content = ch;
      len--;
    }

    for (let i = 0; i < len; i += 2) {
      token = state.push("text", "", 0);
      token.content = ch + ch;
      if (!scanned.can_open && !scanned.can_close) continue;
      state.delimiters.push({
        marker,
        length: 0, // disables markdown-it's rule of 3 — the whole point
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close,
      });
    }

    state.pos += scanned.length;
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function postProcess(state: any, delimiters: any[]): void {
    const loneMarkers: number[] = [];
    const max = delimiters.length;

    for (let i = 0; i < max; i++) {
      const startDelim = delimiters[i];
      if (startDelim.marker !== delimCharCode) continue;
      if (startDelim.end === -1) continue;
      const endDelim = delimiters[startDelim.end];

      let token = state.tokens[startDelim.token];
      token.type = `${markName}_open`;
      token.tag = "mark";
      token.nesting = 1;
      token.markup = delim;
      token.content = "";

      token = state.tokens[endDelim.token];
      token.type = `${markName}_close`;
      token.tag = "mark";
      token.nesting = -1;
      token.markup = delim;
      token.content = "";

      if (
        state.tokens[endDelim.token - 1].type === "text" &&
        state.tokens[endDelim.token - 1].content === "="
      ) {
        loneMarkers.push(endDelim.token - 1);
      }
    }

    while (loneMarkers.length) {
      const i = loneMarkers.pop() as number;
      let j = i + 1;
      while (
        j < state.tokens.length &&
        state.tokens[j].type === `${markName}_close`
      ) {
        j++;
      }
      j--;
      if (i !== j) {
        const token = state.tokens[j];
        state.tokens[j] = state.tokens[i];
        state.tokens[i] = token;
      }
    }
  }

  md.inline.ruler.before("emphasis", markName, tokenize);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  md.inline.ruler2.before("emphasis", markName, function (state: any) {
    const tokensMeta = state.tokens_meta;
    const max = (state.tokens_meta || []).length;
    postProcess(state, state.delimiters);
    for (let curr = 0; curr < max; curr++) {
      const delimiters = tokensMeta[curr]?.delimiters;
      if (tokensMeta[curr] && delimiters) postProcess(state, delimiters);
    }
    return false;
  });
}
