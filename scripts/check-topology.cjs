const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(tmpdir(), 'lab-topology-'));
try {
  execFileSync(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    'lib/lab/topology.ts', '--module', 'commonjs', '--target', 'es2020',
    '--skipLibCheck', '--outDir', output,
  ], { cwd: root, stdio: 'inherit' });
  const { generateLabTopology, discNormalOf } = require(path.join(output, 'topology.js'));
  for (const seed of [42, 1, 7, 1337]) {
    const graph = generateLabTopology(seed);
    assert.deepEqual(graph, generateLabTopology(seed), 'layout must be deterministic');
    assert.equal(graph.nodes.length, 601);
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    assert.equal(nodes.size, graph.nodes.length, 'node IDs must be unique');
    const adjacency = new Map(graph.nodes.map(node => [node.id, new Set()]));
    const edges = new Set();
    for (const link of graph.links) {
      assert(nodes.has(link.source) && nodes.has(link.target), 'endpoints must exist');
      assert.notEqual(link.source, link.target, 'no self-links');
      const key = [link.source, link.target].sort().join('|');
      assert(!edges.has(key), 'no duplicate undirected links');
      edges.add(key);
      adjacency.get(link.source).add(link.target);
      adjacency.get(link.target).add(link.source);
    }
    for (const node of graph.nodes) {
      assert([node.x, node.y, node.z, node.radius].every(Number.isFinite));
      assert.equal(node.degree, adjacency.get(node.id).size);
      assert(Math.abs(Math.hypot(...discNormalOf(node)) - 1) < 1e-10);
    }
    const queue = [graph.nodes[0].id];
    const visited = new Set(queue);
    for (const id of queue) {
      for (const neighbor of adjacency.get(id)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    assert.equal(visited.size, nodes.size, 'every node must connect to the fabric');
  }
  console.log('Topology checks passed for four seeds: determinism, connectivity, IDs, links, degrees and coordinates.');
} finally {
  rmSync(output, { recursive: true, force: true });
}
