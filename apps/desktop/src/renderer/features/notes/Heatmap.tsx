import { useMemo } from "react";

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function level(c: number): number {
  if (c <= 0) return 0;
  if (c <= 1) return 1;
  if (c <= 3) return 2;
  if (c <= 5) return 3;
  return 4;
}

export default function Heatmap({
  counts,
  weeks = 13,
  selected,
  onSelectDay,
}: {
  counts: Map<string, number>;
  weeks?: number;
  selected: string | null;
  onSelectDay: (key: string | null) => void;
}): React.ReactElement {
  // 每列一周（周日→周六），末列包含今天所在周
  const cols = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay())); // 本周周六
    const grid: { key: string; date: Date }[][] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const col: { key: string; date: Date }[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(end);
        d.setDate(end.getDate() - w * 7 - (6 - dow));
        col.push({ key: key(d), date: d });
      }
      grid.push(col);
    }
    return grid;
  }, [weeks]);

  // 月份标注：某列第一天在当月上旬时，在该列下方标一次月份
  const monthLabels = cols.map((col) => {
    const first = col[0].date;
    return first.getDate() <= 7 ? `${first.getMonth() + 1}月` : "";
  });

  const todayKey = key(new Date());
  return (
    <div className="nt-heatmap">
      <div className="nt-heatmap-grid">
        {cols.map((col, ci) => (
          <div className="nt-heatmap-col" key={ci}>
            {col.map((cell) => {
              const c = counts.get(cell.key) ?? 0;
              const future = cell.key > todayKey;
              return (
                <button
                  key={cell.key}
                  className={`nt-cell lvl${level(c)}${
                    selected === cell.key ? " sel" : ""
                  }${future ? " future" : ""}`}
                  disabled={future}
                  title={`${cell.date.getMonth() + 1}月${cell.date.getDate()}日 · ${c} 条`}
                  onClick={() =>
                    onSelectDay(selected === cell.key ? null : cell.key)
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="nt-heatmap-months">
        {monthLabels.map((m, i) => (
          <span key={i} className="nt-month">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
