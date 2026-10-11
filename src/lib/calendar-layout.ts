export interface Laid<T> {
  item: T;
  lane: number; // номер колонки внутри группы пересекающихся уроков
  lanes: number; // сколько колонок в этой группе
}

/**
 * Раскладка пересекающихся интервалов по колонкам (как в Google Календаре):
 * пересекающиеся уроки встают рядом, каждый занимает первую свободную колонку.
 */
export function layoutLanes<T>(items: readonly T[], start: (t: T) => number, end: (t: T) => number): Laid<T>[] {
  const sorted = [...items].sort((a, b) => start(a) - start(b) || end(b) - end(a));
  const result: Laid<T>[] = [];
  let cluster: Laid<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const l of cluster) l.lanes = laneEnds.length;
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    const s = start(item);
    if (s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((e) => e <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end(item));
    } else {
      laneEnds[lane] = end(item);
    }
    cluster.push({ item, lane, lanes: 0 });
    clusterEnd = Math.max(cluster.length === 1 ? -Infinity : clusterEnd, end(item));
  }
  if (cluster.length) flush();
  return result;
}
