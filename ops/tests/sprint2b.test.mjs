import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const verify=path.join(root,'ops/scripts/verify-ci-checks.cjs');
const auth=path.join(root,'ops/scripts/cms-authz-acceptance.mjs');
const sha='a'.repeat(40);
const run=(name,conclusion='success')=>({
  name, head_sha:sha, status:'completed', conclusion, app:{slug:'github-actions'}
});
function invoke(file,args,input){
  return spawnSync(process.execPath,[file,...args],{encoding:'utf8',input});
}
test('CI verifier accepts exact SHA when both jobs pass',()=>{
  const r=invoke(verify,[sha],JSON.stringify({check_runs:[run('ops-static'),run('backend-and-frontend')]}));
  assert.equal(r.status,0,r.stderr);
});
test('CI verifier rejects failed frontend audit',()=>{
  const r=invoke(verify,[sha],JSON.stringify({check_runs:[run('ops-static'),run('backend-and-frontend','failure')]}));
  assert.notEqual(r.status,0);
});
test('CI verifier rejects unrelated SHA or spoofed app',()=>{
  const unrelated={...run('ops-static'),head_sha:'b'.repeat(40)};
  const spoof={...run('backend-and-frontend'),app:{slug:'fake'}};
  const r=invoke(verify,[sha],JSON.stringify({check_runs:[unrelated,spoof]}));
  assert.notEqual(r.status,0);
});
function fixture(){
  const cases=[
    ['anonymous_admin','GET',[401]],
    ['editor_forbidden','GET',[403]],
    ['reviewer_escalation_forbidden','PATCH',[403]],
    ['sensitive_publish_forbidden','POST',[403]],
    ['publisher_unreviewed_forbidden','POST',[409]],
    ['csrf_invalid','POST',[403]],
    ['admin_allowed','POST',[200]],
    ['admin_cookie_flags','POST',[200]]
  ].map(([id,method,expect])=>({id,method,path:'/api/admin/test-'+id,expect,
    headers:method==='GET'?{}:{Origin:'https://cms-staging.conspace.vn'}}));
  return {baseUrl:'https://cms-staging.conspace.vn/',cases};
}
function validate(cfg){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'conspace-s2b-'));
  const p=path.join(dir,'fixture.json');
  fs.writeFileSync(p,JSON.stringify(cfg),{mode:0o600});
  try{return invoke(auth,[p,'--validate-only'])}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('CMS staging fixture requires explicit cases and accepted status ranges',()=>{
  const r=validate(fixture());
  assert.equal(r.status,0,r.stderr);
});
test('CMS acceptance blocks production origin and missing authz test',()=>{
  const prod=fixture();prod.baseUrl='https://conspace.vn/';
  assert.notEqual(validate(prod).status,0);
  const missing=fixture();missing.cases.pop();
  assert.notEqual(validate(missing).status,0);
});
test('CMS Nginx snippets keep intended rate limit and backend proxy',()=>{
  const l=fs.readFileSync(path.join(root,'ops/nginx/conspace-cms-https-locations.conf.example'),'utf8');
  const z=fs.readFileSync(path.join(root,'ops/nginx/conspace-rate-limit-http.conf.example'),'utf8');
  for(const key of ['conspace_admin_login','conspace_admin_api','conspace_media_upload']){
    assert.ok(z.includes('zone='+key));
    assert.ok(l.includes('zone='+key));
  }
  assert.ok(l.includes('proxy_pass http://127.0.0.1:5088;'));
  assert.ok(l.includes('location = /api/admin/media {'), 'upload POST without trailing slash must be rate limited');
  assert.ok(!l.includes('alias /var/lib/conspace/media/private'));
});
