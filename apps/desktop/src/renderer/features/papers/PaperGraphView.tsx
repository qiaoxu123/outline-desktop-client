import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type ForceCenter,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { usePapersRoot } from "./usePapers";
import { usePaperGraph, type GraphNode } from "./usePaperGraph";
import "./PaperGraphView.css";

/**
 * 论文关系图 — an Obsidian-style backlink graph for the paper library only.
 * d3-force runs the layout; rendering is a single canvas redrawn per tick
 * (a few hundred nodes — no need for WebGL or DOM nodes).
 */

interface SimNode extends GraphNode, SimulationNodeDatum {}
type SimLink = SimulationLinkDatum<SimNode>;

const nodeRadius = (n: SimNode): number => Math.sqrt(n.degree) * 2.2 + 4;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 8;
/** Zoom level from which every node shows its label. */
const LABEL_ZOOM = 1.5;
const MATCH_COLOR = "#f59f00";

interface ThemeColors {
  border: string;
  primary: string;
  muted: string;
  text: string;
  bg: string;
}

function themeColors(): ThemeColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    border: v("--color-border", "#dae1e9"),
    primary: v("--color-primary", "#0366d6"),
    muted: v("--color-text-muted", "#66778f"),
    text: v("--color-text", "#111319"),
    bg: v("--color-bg", "#ffffff"),
  };
}

export default function PaperGraphView(): React.ReactElement {
  const navigate = useNavigate();
  const { root, status } = usePapersRoot();
  const { nodes, links, isLoading } = usePaperGraph(root);

  const [q, setQ] = useState("");
  // Default to hiding isolated papers: only recent interpretations cross-link
  // others in-body, so most nodes are unconnected — showing them all reads as
  // "a field of empty dots". Users can untick to see the full set.
  const [onlyConnected, setOnlyConnected] = useState(true);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const hoverRef = useRef<SimNode | null>(null);
  /** Positions persisted across simulation rebuilds (filter toggles). */
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const dragRef = useRef<{
    node: SimNode | null;
    startClientX: number;
    startClientY: number;
    startTX: number;
    startTY: number;
    moved: boolean;
  } | null>(null);
  const rafRef = useRef(0);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const visibleNodes = useMemo(
    () => (onlyConnected ? nodes.filter((n) => n.degree > 0) : nodes),
    [nodes, onlyConnected],
  );
  // Links always join degree≥1 nodes, so the filter never orphans an edge.
  const visibleLinks = links;

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of visibleLinks) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [visibleLinks]);

  const matched = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return new Set<string>();
    return new Set(
      visibleNodes
        .filter((n) => n.title.toLowerCase().includes(query))
        .map((n) => n.id),
    );
  }, [q, visibleNodes]);

  /* ---------- drawing ---------- */

  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = sizeRef.current;
    const t = transformRef.current;
    const c = themeColors();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const hover = hoverRef.current;
    const neighbors = hover ? (adjacency.get(hover.id) ?? new Set<string>()) : null;
    const dimmed = (id: string): boolean =>
      hover !== null && id !== hover.id && !neighbors!.has(id);

    // edges first, under the nodes
    ctx.lineWidth = 1 / t.k;
    for (const l of linksRef.current) {
      const s = l.source as SimNode;
      const e = l.target as SimNode;
      if (typeof s !== "object" || typeof e !== "object") continue;
      if (s.x == null || e.x == null) continue;
      const touchesHover =
        hover !== null && (s.id === hover.id || e.id === hover.id);
      ctx.globalAlpha = hover !== null && !touchesHover ? 0.1 : 0.85;
      ctx.strokeStyle = touchesHover ? c.primary : c.border;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y ?? 0);
      ctx.lineTo(e.x, e.y ?? 0);
      ctx.stroke();
    }

    // nodes
    for (const n of nodesRef.current) {
      const r = nodeRadius(n);
      ctx.globalAlpha = dimmed(n.id) ? 0.15 : 1;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle = n.degree === 0 ? c.muted : c.primary;
      ctx.fill();
      if (matched.has(n.id)) {
        ctx.lineWidth = 2 / t.k;
        ctx.strokeStyle = MATCH_COLOR;
        ctx.stroke();
      }
    }

    // labels: everything when zoomed in, else hover + its neighbours + matches
    const showAll = t.k >= LABEL_ZOOM;
    ctx.font = `${12 / t.k}px sans-serif`;
    ctx.textBaseline = "middle";
    for (const n of nodesRef.current) {
      const isHover = hover !== null && n.id === hover.id;
      const isNeighbor = neighbors?.has(n.id) ?? false;
      if (!showAll && !isHover && !isNeighbor && !matched.has(n.id)) continue;
      if (dimmed(n.id)) continue;
      const label = n.title.length > 28 ? `${n.title.slice(0, 28)}…` : n.title;
      const x = (n.x ?? 0) + nodeRadius(n) + 4 / t.k;
      const y = n.y ?? 0;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3 / t.k;
      ctx.strokeStyle = c.bg;
      ctx.strokeText(label, x, y);
      ctx.fillStyle = isHover ? c.primary : c.text;
      ctx.fillText(label, x, y);
    }
    ctx.globalAlpha = 1;
  };

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawRef.current();
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  /* ---------- canvas size follows the container ---------- */

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = (): void => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      sizeRef.current = { w, h };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const center = simRef.current?.force("center") as
        | ForceCenter<SimNode>
        | undefined;
      if (center) {
        center.x(w / 2);
        center.y(h / 2);
      }
      scheduleDraw();
    };
    apply(); // synchronous first measure — the simulation effect needs a size
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  /* ---------- (re)build the simulation when the data changes ---------- */

  useEffect(() => {
    const prevPos = posRef.current;
    const simNodes: SimNode[] = visibleNodes.map((n) => ({
      ...n,
      ...prevPos.get(n.id),
    }));
    const simLinks: SimLink[] = visibleLinks.map((l) => ({
      source: l.source,
      target: l.target,
    }));
    const { w, h } = sizeRef.current;
    const sim = forceSimulation<SimNode>(simNodes)
      .force("charge", forceManyBody().strength(-40))
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(50),
      )
      .force("center", forceCenter<SimNode>(w / 2, h / 2))
      .force("collide", forceCollide<SimNode>((d) => nodeRadius(d) + 2));
    sim.on("tick", scheduleDraw);
    simRef.current = sim;
    nodesRef.current = simNodes;
    linksRef.current = simLinks;
    hoverRef.current = null;
    scheduleDraw();
    return () => {
      sim.stop();
      simRef.current = null;
      for (const n of simNodes) prevPos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    };
  }, [visibleNodes, visibleLinks, scheduleDraw]);

  /* ---------- redraw when the theme flips (static graph won't tick) ---------- */

  useEffect(() => {
    const mo = new MutationObserver(scheduleDraw);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => mo.disconnect();
  }, [scheduleDraw]);

  /* ---------- search: highlight + center the first match ---------- */

  useEffect(() => {
    if (matched.size > 0) {
      const first = nodesRef.current.find(
        (n) => matched.has(n.id) && n.x != null,
      );
      if (first) {
        const { w, h } = sizeRef.current;
        const t = transformRef.current;
        transformRef.current = {
          ...t,
          x: w / 2 - (first.x ?? 0) * t.k,
          y: h / 2 - (first.y ?? 0) * t.k,
        };
      }
    }
    scheduleDraw();
  }, [matched, scheduleDraw]);

  /* ---------- pointer interactions ---------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toLocal = (
      e: MouseEvent,
    ): { sx: number; sy: number; wx: number; wy: number } => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const t = transformRef.current;
      return { sx, sy, wx: (sx - t.x) / t.k, wy: (sy - t.y) / t.k };
    };

    const pick = (wx: number, wy: number): SimNode | null => {
      const t = transformRef.current;
      const list = nodesRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        const dx = (n.x ?? 0) - wx;
        const dy = (n.y ?? 0) - wy;
        const r = nodeRadius(n) + 2 / t.k;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    };

    // native listener: React attaches wheel passively, preventDefault would warn
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const { sx, sy } = toLocal(e);
      const t = transformRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
      const f = k / t.k;
      transformRef.current = {
        k,
        x: sx - (sx - t.x) * f,
        y: sy - (sy - t.y) * f,
      };
      scheduleDraw();
    };

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      const { wx, wy } = toLocal(e);
      const node = pick(wx, wy);
      const t = transformRef.current;
      dragRef.current = {
        node,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTX: t.x,
        startTY: t.y,
        moved: false,
      };
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.3).restart();
      }
      const onMove = (ev: MouseEvent): void => {
        const d = dragRef.current;
        if (!d) return;
        const dx = ev.clientX - d.startClientX;
        const dy = ev.clientY - d.startClientY;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        if (d.node) {
          const p = toLocal(ev);
          d.node.fx = p.wx;
          d.node.fy = p.wy;
        } else {
          transformRef.current = {
            ...transformRef.current,
            x: d.startTX + dx,
            y: d.startTY + dy,
          };
        }
        scheduleDraw();
      };
      const onUp = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        if (d.node) {
          d.node.fx = null;
          d.node.fy = null;
          simRef.current?.alphaTarget(0);
          // a stationary press-release on a node opens the paper
          if (!d.moved) navigateRef.current(`/document/${d.node.id}`);
        }
        scheduleDraw();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    const onHoverMove = (e: MouseEvent): void => {
      if (dragRef.current) return;
      const { wx, wy } = toLocal(e);
      const node = pick(wx, wy);
      if (node?.id !== hoverRef.current?.id) {
        hoverRef.current = node;
        canvas.style.cursor = node ? "pointer" : "default";
        scheduleDraw();
      }
    };

    const onLeave = (): void => {
      if (hoverRef.current) {
        hoverRef.current = null;
        canvas.style.cursor = "default";
        scheduleDraw();
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onHoverMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onHoverMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [scheduleDraw]);

  /* ---------- render ---------- */

  const empty =
    status === "resolving"
      ? "正在定位论文库…"
      : status === "error"
        ? "未能定位论文库，请先打开一次论文库页面。"
        : isLoading && nodes.length === 0
          ? "正在加载论文数据…"
          : null;

  return (
    <div className="paper-graph-view">
      <div className="pg-toolbar">
        <h2 className="pg-title">关系图</h2>
        <input
          className="pg-search"
          type="search"
          placeholder="搜索论文标题…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="pg-check">
          <input
            type="checkbox"
            checked={onlyConnected}
            onChange={(e) => setOnlyConnected(e.target.checked)}
          />
          只看有连接的
        </label>
        <span className="pg-stats">
          共 {visibleNodes.length} 篇 · {visibleLinks.length} 条引用
        </span>
      </div>
      <div className="pg-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
        {empty && <div className="pg-empty">{empty}</div>}
      </div>
    </div>
  );
}
