/**
 * 把容器内 markdown-it 渲染出的 ```mermaid 代码块（<code class="language-mermaid">）
 * 就地替换成 mermaid 渲染的 SVG。mermaid 体积较大，故仅在容器里确实存在 mermaid
 * 代码块时才动态 import，避免拖慢首屏。渲染失败保留原代码块并标注错误。
 */

let inited = false;
let seq = 0;

async function getMermaid() {
  const mod = await import("mermaid");
  const mermaid = mod.default;
  if (!inited) {
    inited = true;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
      fontFamily: "inherit",
    });
  }
  return mermaid;
}

export async function renderMermaidIn(container: HTMLElement): Promise<void> {
  const pres = Array.from(
    container.querySelectorAll<HTMLElement>("pre.mermaid-src"),
  );
  if (pres.length === 0) return;
  const mermaid = await getMermaid();
  for (const pre of pres) {
    if (!pre.isConnected) continue;
    const src = pre.textContent ?? "";
    if (!src.trim()) continue;
    const id = `mmd-${seq++}`;
    try {
      const { svg } = await mermaid.render(id, src);
      const wrap = document.createElement("div");
      wrap.className = "mermaid-diagram";
      wrap.innerHTML = svg;
      pre.replaceWith(wrap);
    } catch (err) {
      pre.setAttribute("data-mermaid-error", String(err).slice(0, 160));
    }
  }
}

/**
 * Render Mermaid diagrams in TipTap/ProseMirror output.
 * TipTap renders ```mermaid as <pre><code class="language-mermaid">.
 * We find these blocks, render SVG, and replace.
 */
export async function renderMermaidInEditor(container: HTMLElement): Promise<void> {
  const codes = Array.from(
    container.querySelectorAll<HTMLElement>("code.language-mermaid"),
  );
  if (codes.length === 0) return;
  const mermaid = await getMermaid();
  for (const code of codes) {
    if (!code.isConnected) continue;
    const src = code.textContent ?? "";
    if (!src.trim()) continue;
    const pre = code.closest("pre");
    if (!pre) continue;
    const id = `mmd-${seq++}`;
    try {
      const { svg } = await mermaid.render(id, src);
      const wrap = document.createElement("div");
      wrap.className = "mermaid-diagram";
      wrap.innerHTML = svg;
      pre.replaceWith(wrap);
    } catch (err) {
      pre.setAttribute("data-mermaid-error", String(err).slice(0, 160));
    }
  }
}
