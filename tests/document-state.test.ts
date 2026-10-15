import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentState } from '../web/bridge/document-state.js';

test('late polling cannot reopen a previous document or roll back newer pending state', () => {
  const state = new DocumentState<{ id: string; revision: number; status: string }>();
  state.accept({ id: 'a', revision: 1, status: 'idle' });
  const poll = state.request('a');
  const save = state.request('a');
  const pending = { id: 'a', revision: 1, status: 'pending' };
  state.accept(pending, save);
  assert.deepEqual(state.accept({ id: 'a', revision: 1, status: 'idle' }, poll), pending);
  const oldRead = state.request('a');
  const opened = { id: 'b', revision: 1, status: 'idle' };
  state.accept(opened);
  assert.deepEqual(state.accept(pending, oldRead), opened);
  assert.throws(() => state.assertSelected('a'), /changed/);
  assert.deepEqual(state.read(), opened);
});

test('a host push supersedes in-flight reads and older revisions never replace current state', () => {
  const state = new DocumentState();
  state.accept({ id: 'a', revision: 1 });
  const poll = state.request('a');
  state.accept({ id: 'a', revision: 2 });
  assert.equal(state.accept({ id: 'a', revision: 1 }, poll).revision, 2);
  assert.equal(state.accept({ id: 'a', revision: 1 }).revision, 2);
  assert.throws(() => state.accept({ id: 'b', revision: 1 }, state.request('a')), /different/);
});
