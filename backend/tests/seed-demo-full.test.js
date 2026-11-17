import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_DEMO_SOURCE, FULL_DEMO_GROUPS, FULL_DEMO_ROLES, fullDemoPlan, seedFullDemo } from '../src/database/seed-demo-full.js';

test('full demo plan fills the 38-slot taxonomy without claiming the 30 construction niches are approved', () => {
  const plan=fullDemoPlan();
  assert.deepEqual(plan,{designNiches:8,constructionNiches:30,groups:5,roles:3,books:3});
  const slugs=FULL_DEMO_GROUPS.flatMap(g=>g.topics.map(([slug])=>slug));
  assert.equal(new Set(slugs).size,30);
  assert.ok(slugs.every(slug=>slug.startsWith('demo-')));
  assert.ok(FULL_DEMO_GROUPS.every(g=>g.slug.startsWith('demo-') && g.name.startsWith('[DEMO]')));
  assert.deepEqual(FULL_DEMO_ROLES.map(r=>r.id),['homeowner','architect','contractor']);
  assert.match(FULL_DEMO_SOURCE,/DEMO ONLY.*NOT verified.*NEVER deploy/);
});

test('full seed refuses remote, production, missing confirmation and short demo passwords before accessing the DB', async () => {
  const opts={nodeEnv:'development',databaseUrl:'postgresql://user:pass@127.0.0.1:55432/conspace',confirm:'LOCAL_DEMO_ONLY',password:'local-demo-password-1234'};
  await assert.rejects(seedFullDemo(null,{...opts,nodeEnv:'production'}),/NODE_ENV=development/);
  await assert.rejects(seedFullDemo(null,{...opts,databaseUrl:'postgresql://user:pass@public.example/conspace'}),/non-local database hosts/);
  await assert.rejects(seedFullDemo(null,{...opts,confirm:''}),/DEMO_SEED_CONFIRM/);
  await assert.rejects(seedFullDemo(null,{...opts,password:'short'}),/between 14 and 256/);
});
