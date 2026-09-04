import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const firebaseRequire = createRequire(require.resolve('firebase-tools/package.json'));

function runPipeline(input, maxDepth) {
  return new Promise((resolve, reject) => {
    const streamJson = firebaseRequire('stream-json');
    const Pick = firebaseRequire('stream-json/filters/Pick');
    const { chain } = firebaseRequire('stream-chain');
    const pipeline = chain([
      streamJson.parser(),
      Pick.pick({ filter: 'never.matches', ...(maxDepth === undefined ? {} : { maxDepth }) })
    ]);
    pipeline.on('data', () => {});
    pipeline.on('error', reject);
    pipeline.on('end', resolve);
    pipeline.end(input);
  });
}

test('Firebase CLI keeps the legacy stream-json CommonJS import surface', () => {
  assert.equal(typeof firebaseRequire('stream-json').parser, 'function');
  assert.equal(typeof firebaseRequire('stream-json/filters/Pick').pick, 'function');
  assert.equal(typeof firebaseRequire('stream-json/filters/Filter').filter, 'function');
  assert.equal(typeof firebaseRequire('stream-json/streamers/StreamArray').streamArray, 'function');
  assert.equal(typeof firebaseRequire('stream-json/streamers/StreamObject').streamObject, 'function');
});

test('default maxDepth rejects pathological JSON nesting', async () => {
  const depth = 1100;
  const input = '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
  await assert.rejects(runPipeline(input), error => {
    assert.equal(error instanceof RangeError, true);
    assert.match(error.message, /maxDepth \(1024\)/);
    return true;
  });
});

test('explicit maxDepth remains configurable', async () => {
  await assert.rejects(runPipeline('{"a":{"b":1}}', 0), RangeError);
});
