/** Put authored add references on stable Git-style lanes without treating source order as playback time. */
export function layoutScriptBranches(graph) {
    const count = graph.nodes.length;
    const indexByKey = new Map(graph.nodes.map((node, index) => [node.key, index]));
    const forward = Array.from({ length: count }, () => []);
    for (const edge of graph.edges) {
        if (edge.action === 'stop') continue;
        const from = indexByKey.get(edge.from);
        const to = indexByKey.get(edge.to);
        if (from == null || to == null || to <= from || forward[from].includes(to)) continue;
        forward[from].push(to);
    }

    // A stable reference spine follows the longest forward chain. Other chains get their own lanes.
    const preferred = Array(count).fill(-1);
    const length = Array(count).fill(1);
    for (let from = count - 1; from >= 0; from--) {
        for (const to of forward[from]) {
            const nextLength = length[to] + 1;
            if (nextLength > length[from] || (nextLength === length[from] && to < preferred[from])) {
                length[from] = nextLength;
                preferred[from] = to;
            }
        }
    }

    const lanes = Array(count).fill(-1);
    const trackEdges = new Set();
    const pair = (from, to) => `${from}\0${to}`;
    let at = indexByKey.get(graph.start) ?? 0;
    while (at >= 0 && lanes[at] < 0) {
        lanes[at] = 0;
        const next = preferred[at];
        if (next >= 0) trackEdges.add(pair(at, next));
        at = next;
    }

    const laneEnds = [-1];
    while (lanes.includes(-1)) {
        let entry = null;
        for (let from = 0; from < count; from++) {
            if (lanes[from] < 0) continue;
            for (const to of forward[from]) {
                if (lanes[to] >= 0) continue;
                if (!entry || to < entry.to || (to === entry.to && from < entry.from)) entry = { from, to };
            }
        }
        const first = lanes.indexOf(-1);
        if (!entry) entry = { from: -1, to: first };
        const chain = [];
        at = entry.to;
        while (at >= 0 && lanes[at] < 0) {
            chain.push(at);
            at = preferred[at];
        }
        const start = entry.from >= 0 ? entry.from : entry.to;
        const end = at >= 0 ? at : chain.at(-1);
        let lane = 1;
        while (laneEnds[lane] != null && laneEnds[lane] >= start - 1) lane++;
        laneEnds[lane] = end;
        for (const node of chain) {
            lanes[node] = lane;
            if (preferred[node] >= 0) trackEdges.add(pair(node, preferred[node]));
        }
        if (entry.from >= 0) trackEdges.add(pair(entry.from, entry.to));
    }

    // A branch can rejoin an earlier reference after a retry. Give one such return a visible rail.
    for (let from = 0; from < count; from++) {
        if (lanes[from] === 0 || preferred[from] >= 0) continue;
        const returns = graph.edges.filter((edge) => edge.action !== 'stop' &&
            indexByKey.get(edge.from) === from)
            .map((edge) => indexByKey.get(edge.to))
            .filter((to) => to != null && to <= from && lanes[to] < lanes[from])
            .sort((a, b) => lanes[a] - lanes[b] || b - a);
        if (returns.length) trackEdges.add(pair(from, returns[0]));
    }

    return {
        lanes,
        maxLane: Math.max(0, ...lanes),
        indexByKey,
        isTrack: (from, to) => trackEdges.has(pair(from, to)),
    };
}
