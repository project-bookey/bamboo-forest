import { LINES, route, stationName } from './transit.mjs';

let network;
function transferKey(line, station) {
  const name = stationName(station);
  if (name === '신촌' || name === '양평') return `${line}:${name}`;
  return name === '총신대입구' ? '이수' : name;
}
function buildNetwork() {
  const nodes = [], stations = new Map();
  for (const line of LINES) line.paths.forEach((path, section) => {
    for (const direction of [0, 1]) {
      const sequence = line.directedPaths ? line.directedPaths[direction] : line.loop && !section ? direction === 0 ? path : [...path].reverse() : direction === 1 ? path : [...path].reverse();
      const ids = [];
      sequence.forEach((station, index) => {
        const boardable = line.id !== '1006' || station !== '응암' || index === (direction === 1 ? sequence.lastIndexOf(station) : sequence.indexOf(station));
        const node = { id: nodes.length, line: line.id, section, direction, station, boardable, ride: null };
        nodes.push(node); ids.push(node.id);
        const key = transferKey(line.id, station), group = stations.get(key) || [];
        group.push(node.id); stations.set(key, group);
      });
      for (let i = 1; i < ids.length; i++) nodes[ids[i - 1]].ride = ids[i];
      if (line.loop && !section) nodes[ids.at(-1)].ride = ids[0];
    }
  });
  return { nodes, stations };
}

// Minimize train changes, then station count. No timetable or journey-time claim.
export function planJourney(fromLine, from, toLine, to) {
  if (!LINES.find(l => l.id === fromLine)?.stations.includes(from) || !LINES.find(l => l.id === toLine)?.stations.includes(to)) return null;
  if (transferKey(fromLine, from) === transferKey(toLine, to)) return { transfers: 0, stationCount: 0, legs: [], sameStation: true };
  network ||= buildNetwork();
  const { nodes, stations } = network, distance = new Map(), previous = new Map(), heap = [];
  function push(id, cost) {
    let index = heap.length; heap.push({ id, cost });
    while (index) { const parent = (index - 1) >> 1; if (heap[parent].cost <= cost) break; heap[index] = heap[parent]; index = parent; }
    heap[index] = { id, cost };
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) { let index = 0; while (index * 2 + 1 < heap.length) { let child = index * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++; if (heap[child].cost >= last.cost) break; heap[index] = heap[child]; index = child; } heap[index] = last; }
    return first;
  }
  for (const node of nodes) if (node.line === fromLine && node.station === from && node.boardable) { distance.set(node.id, 0); push(node.id, 0); }
  let end;
  while (heap.length) {
    const current = pop(); if (current.cost !== distance.get(current.id)) continue;
    const node = nodes[current.id];
    if (node.line === toLine && node.station === to) { end = node.id; break; }
    const edges = node.ride === null ? [] : [[node.ride, 1]];
    for (const id of stations.get(transferKey(node.line, node.station))) if (id !== node.id && nodes[id].boardable) edges.push([id, 10000]);
    for (const [id, weight] of edges) {
      const cost = current.cost + weight;
      if (cost < (distance.get(id) ?? Infinity)) { distance.set(id, cost); previous.set(id, { id: node.id, transfer: weight === 10000 }); push(id, cost); }
    }
  }
  if (end === undefined) return null;
  const chain = [];
  for (let id = end; id !== undefined; id = previous.get(id)?.id) chain.push({ ...nodes[id], transfer: previous.get(id)?.transfer });
  chain.reverse();
  const legs = []; let part = [];
  function finish() {
    if (part.length < 2) return;
    const first = part[0], last = part.at(-1);
    if (!route(first.line, first.station, last.station, first.direction)) return;
    legs.push({ line: first.line, section: first.section, direction: first.direction, from: first.station, to: last.station, stops: part.map(node => node.station) });
  }
  for (const node of chain) { if (node.transfer) { finish(); part = []; } part.push(node); } finish();
  if (!legs.length) return null;
  return { transfers: Math.max(0, legs.length - 1), stationCount: legs.reduce((count, leg) => count + leg.stops.length - 1, 0), legs };
}
