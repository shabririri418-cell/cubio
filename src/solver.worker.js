import Cube from 'cubejs';

Cube.initSolver();
self.postMessage({ type: 'ready' });

self.addEventListener('message', (event) => {
  const { type, id, state } = event.data;
  if (type !== 'solve') return;

  try {
    const cube = new Cube(state);
    const solution = cube.solve(22);
    cube.move(solution);
    const upright = cube.upright();
    self.postMessage({ type: 'solution', id, solution, upright });
  } catch (error) {
    self.postMessage({
      type: 'solution',
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
