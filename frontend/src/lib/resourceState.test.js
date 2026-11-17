import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleResourceState, visibleArticleState } from './resourceState.js';

test('detail navigation never flashes the last article, field note or term', () => {
  const previous = { key: 'detail:/api/v1/articles/old', status: 'success', data: { title: 'Old article' }, error: null, meta: {} };
  const next = visibleResourceState(previous, 'detail:/api/v1/articles/new', false);
  assert.equal(next.status, 'loading');
  assert.equal(next.data, null);
  assert.equal(next.meta, null);
  assert.strictEqual(visibleResourceState(previous, previous.key, false), previous);
});

test('new reader lens hides stale cards, cursors and errors before effect begins', () => {
  const old = {
    requestKey: JSON.stringify(['homeowner', null, 12, null]),
    status: 'success', data: [{ id: 'old' }], nextCursor: 'cursor', loadingMore: false, error: null,
  };
  const next = visibleArticleState(old, JSON.stringify(['architect', null, 12, null]));
  assert.equal(next.status, 'loading');
  assert.deepEqual(next.data, []);
  assert.equal(next.nextCursor, null);
  assert.strictEqual(visibleArticleState(old, old.requestKey), old);
});

test('disabling a resource leaves a neutral idle state rather than an old success', () => {
  const old = { key: 'list:/api/v1/niches', status: 'success', data: [{ id: 'x' }] };
  const idle = visibleResourceState(old, null, true);
  assert.deepEqual(idle.data, []);
  assert.equal(idle.status, 'idle');
  assert.equal(idle.error, null);
});
