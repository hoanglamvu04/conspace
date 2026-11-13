import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalDemoSeedEnvironment } from '../src/database/seed-demo.js';

const local={
  nodeEnv:'development',
  databaseUrl:'postgresql://conspace_app:local-only@127.0.0.1:5432/conspace',
  confirm:'LOCAL_DEMO_ONLY',
};

test('demo seed accepts only an explicit local development database',()=>{
  assert.equal(assertLocalDemoSeedEnvironment(local),true);
});

test('demo seed refuses production, remote hosts and missing confirmation',()=>{
  assert.throws(()=>assertLocalDemoSeedEnvironment({...local,nodeEnv:'production'}),/development/);
  assert.throws(()=>assertLocalDemoSeedEnvironment({...local,databaseUrl:'postgresql://conspace_app:x@103.149.170.146:5432/conspace'}),/non-local/);
  assert.throws(()=>assertLocalDemoSeedEnvironment({...local,confirm:''}),/DEMO_SEED_CONFIRM/);
  assert.throws(()=>assertLocalDemoSeedEnvironment({...local,databaseUrl:'postgresql://conspace_app:x@127.0.0.1:5432/x_hub'}),/conspace database/);
});
