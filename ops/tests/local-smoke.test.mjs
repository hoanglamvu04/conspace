import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoopbackUrl, localUrl, runLocalSmoke } from '../scripts/local-smoke.mjs';

test('local smoke only permits loopback HTTP targets', () => {
  assert.equal(assertLoopbackUrl('http://127.0.0.1:5176', 'frontend').port, '5176');
  assert.equal(assertLoopbackUrl('http://localhost:5088', 'backend').hostname, 'localhost');
  for (const value of [
    'https://conspace.vn',
    'http://103.149.170.146:5088',
    'http://example.test',
    'http://user:pass@127.0.0.1:5088',
    'http://127.0.0.1:5088/?token=secret',
  ]) assert.throws(() => assertLoopbackUrl(value, 'target'));
});

test('local URL builder preserves only the loopback origin and requested path', () => {
  assert.equal(
    localUrl('http://127.0.0.1:5088', '/api/v1/feed?role=architect'),
    'http://127.0.0.1:5088/api/v1/feed?role=architect'
  );
});

function fakeServices({sections=[{sectionNo:1,sharedContent:'Public section',sharedSourceRef:'Verified source',layers:[{audienceRole:'architect',content:'Architect layer',sourceRef:'Verified source'}]}]}={}) {
  const requests=[];
  const fetcher=async(value)=>{
    const url=new URL(value);requests.push(url.toString());
    const json=(body,status=200)=>({status,json:async()=>body});
    if(url.pathname==='/'||url.pathname==='/admin/login')return {status:200};
    if(url.pathname==='/api/health')return json({ok:true,service:'conspace-api'});
    if(url.pathname==='/api/ready')return json({ok:true,service:'conspace-api',checks:{database:'up'}});
    if(url.pathname==='/api/admin/auth/session'||url.pathname==='/api/admin/users')return {status:401};
    if(url.pathname==='/api/v1/niches')return json({ok:true,data:[{slug:'house'}]});
    if(url.pathname==='/api/v1/feed'){
      const role=url.searchParams.get('role');
      return json({ok:true,data:{books:[],articles:[],fieldNotes:[],questions:[]},meta:{preferredAudienceRole:role}});
    }
    if(url.pathname==='/api/v1/books')return json({ok:true,data:[],meta:{preferredAudienceRole:url.searchParams.get('role')}});
    if(url.pathname==='/api/v1/field-notes')return json({ok:true,data:[],meta:{preferredAudienceRole:url.searchParams.get('role')}});
    if(url.pathname==='/api/v1/search')return json({ok:true,data:[],meta:{preferredAudienceRole:url.searchParams.get('role')}});
    if(url.pathname==='/api/v1/niches/house')return json({ok:true,data:{sections}});
    return {status:404,json:async()=>({ok:false})};
  };
  return {fetcher,requests};
}

test('local smoke exercises all reader lenses and keeps admin endpoints anonymous', async () => {
  const {fetcher,requests}=fakeServices();
  const output=[];
  await runLocalSmoke({
    fetcher,
    env:{CONSPACE_FRONTEND_URL:'http://127.0.0.1:5176',CONSPACE_API_URL:'http://127.0.0.1:5088'},
    log:(line)=>output.push(line),
  });
  for(const role of ['homeowner','architect','contractor']) {
    assert.ok(requests.some(value=>value.includes('/api/v1/feed?role='+role)));
  }
  assert.ok(requests.some(value=>value.includes('/api/v1/books?role=architect')));
  assert.ok(requests.some(value=>value.includes('/api/v1/field-notes?role=architect')));
  assert.ok(requests.some(value=>value.includes('/api/admin/auth/session')));
  assert.ok(output.some(value=>value.includes('local smoke completed')));
});

test('local smoke refuses non-loopback services before making any request', async () => {
  let called=false;
  await assert.rejects(
    runLocalSmoke({fetcher:async()=>{called=true;return {status:200};},env:{CONSPACE_FRONTEND_URL:'https://conspace.vn'}}),
    /loopback only/
  );
  assert.equal(called,false);
});

test('local smoke blocks a public niche layer without a source reference', async () => {
  const {fetcher}=fakeServices({sections:[{sectionNo:1,sharedContent:'Unsupported content',sharedSourceRef:null,layers:[]}]});
  await assert.rejects(
    runLocalSmoke({fetcher,env:{CONSPACE_FRONTEND_URL:'http://127.0.0.1:5176',CONSPACE_API_URL:'http://127.0.0.1:5088'},log:()=>{}}),
    /shared public content without a source/
  );
});
