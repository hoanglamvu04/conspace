import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedDemoFieldQa, fieldQaDemoPreview } from '../src/database/seed-demo-field-qa.js';
import { FIELD_QA_DEMO_AREAS, FIELD_QA_DEMO_PLAN, FIELD_QA_DEMO_SOURCE } from '../src/database/fixtures/field-qa-demo-content.js';

const local = {
  nodeEnv:'development',
  databaseUrl:'postgresql://conspace_app:x@127.0.0.1:5432/conspace',
  confirm:'LOCAL_DEMO_ONLY',
  password:'local-fictional-demo-password-1234',
};

test('Field and Q&A fixture covers the eight approved architecture areas with distinct content', () => {
  assert.deepEqual(FIELD_QA_DEMO_PLAN,{niches:8,fieldNotes:16,questions:24});
  assert.deepEqual(FIELD_QA_DEMO_AREAS.map(area=>area.slug),
    ['house','luxury','f-b','stay','office','factory','project','sacred']);
  assert.deepEqual(fieldQaDemoPreview(),{...FIELD_QA_DEMO_PLAN,source:FIELD_QA_DEMO_SOURCE});
  const ids = new Set();
  const questions = new Set();
  for(const area of FIELD_QA_DEMO_AREAS){
    assert.equal(area.notes.length,2);
    assert.equal(area.questions.length,3);
    for(const note of area.notes){
      assert.equal(note.length,5);
      const [key,...details] = note;
      assert.match(key,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(details.every(item=>item.length>25));
      const slug='demo-fieldqa-'+area.slug+'-'+key;
      assert.ok(!ids.has(slug),'No duplicate field slug');
      ids.add(slug);
    }
    for(const question of area.questions){
      assert.equal(question.length,3);
      assert.ok(['homeowner','architect','contractor'].includes(question[0]));
      assert.ok(question[1].length>28 && question[2].length>40);
      const prompt=area.name+': '+question[1];
      assert.ok(!questions.has(prompt),'No duplicate question');
      questions.add(prompt);
    }
  }
  assert.equal(ids.size,16);
  assert.equal(questions.size,24);
  assert.match(FIELD_QA_DEMO_SOURCE,/DEMO ONLY.*no verified field evidence.*NEVER deploy/);
});

test('Field/Q&A seed refuses production, remote databases and missing local-only secrets', async () => {
  await assert.rejects(seedDemoFieldQa(null,{...local,nodeEnv:'production'}),/NODE_ENV=development/);
  await assert.rejects(seedDemoFieldQa(null,{...local,confirm:''}),/DEMO_SEED_CONFIRM/);
  await assert.rejects(seedDemoFieldQa(null,{...local,databaseUrl:'postgresql://conspace_app:x@host.example/conspace'}),/non-local database hosts/);
  await assert.rejects(seedDemoFieldQa(null,{...local,password:'short'}),/between 14 and 256/);
  await assert.rejects(seedDemoFieldQa(null,local),/DATABASE_URL is required/);
});

test('acceptance seed must preserve other [DEMO] reader questions', () => {
  const code=readFileSync(new URL('../src/database/seed-demo.js',import.meta.url),'utf8');
  assert.ok(code.includes("WHERE q.description=$1"),'Only the acceptance question may be removed');
  assert.ok(code.includes('ACCEPTANCE_QUESTION'));
  assert.ok(!code.includes("WHERE q.description LIKE '[DEMO]%'"),'Broad demo question wipe is unsafe');
});
