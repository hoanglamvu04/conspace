#!/usr/bin/env node
// Isolated STAGING CMS contract checks. Never send cookies/passwords to production.
// Root-only fixture contains credentials: do NOT commit, print, or log response bodies.
import fs from 'node:fs';
import path from 'node:path';

const arg = process.argv.slice(2);
const file = arg.find(x => !x.startsWith('--'));
const validateOnly = arg.includes('--validate-only');
const approved = arg.includes('--confirm-isolated');
const REQUIRED = [
  'anonymous_admin', 'editor_forbidden', 'reviewer_escalation_forbidden',
  'sensitive_publish_forbidden', 'publisher_unreviewed_forbidden',
  'csrf_invalid', 'admin_allowed', 'admin_cookie_flags'
];
const ACCEPTABLE = {
  anonymous_admin: [401,403], editor_forbidden:[403], reviewer_escalation_forbidden:[403],
  sensitive_publish_forbidden:[403], publisher_unreviewed_forbidden:[403,409,422],
  csrf_invalid:[403], admin_allowed:[200,201,204], admin_cookie_flags:[200,201,204]
};
function fail(msg){ console.error('BLOCKED: '+msg);process.exit(1); }
if(!file || (!approved && !validateOnly))
  fail('Usage: node cms-authz-acceptance.mjs /private/fixture.json --validate-only OR --confirm-isolated');
const stat=fs.statSync(file);
if((stat.mode & 0o077)!==0) fail('fixture must be mode 0600 or stricter');
if(typeof process.getuid==='function' && stat.uid!==process.getuid())
  fail('fixture must belong to the executing user');
const cfg=JSON.parse(fs.readFileSync(file,'utf8'));
let base;
try {base=new URL(cfg.baseUrl)}catch {fail('baseUrl invalid')}
const host=base.hostname.toLowerCase();
const cookieName=cfg.sessionCookieName || 'conspace_admin_session';
const cookiePath=cfg.sessionCookiePath || '/api/admin';
if(!/^[A-Za-z0-9_-]+$/.test(cookieName) || !['/','/api/admin'].includes(cookiePath))
  fail('invalid reviewed cookie name/path');
if(base.protocol!=='https:' || base.username || base.password || base.search ||
   base.hash || base.pathname!=='/' ||
   !/(^|[.-])(staging|sandbox|test)([.-]|$)/.test(host) ||
   ['conspace.vn','www.conspace.vn','103.149.170.146'].includes(host))
  fail('target MUST be an HTTPS isolated staging hostname, never production');
if(!Array.isArray(cfg.cases)) fail('cases array required');
const cases=new Map();
for(const item of cfg.cases){
  if(!REQUIRED.includes(item.id) || cases.has(item.id)) fail('duplicate or unknown case ID');
  if(typeof item.path!=='string' || !/^\/api\/admin\/[A-Za-z0-9/_-]+$/.test(item.path))
    fail('case paths must be simple /api/admin/... paths, without query or traversal');
  if(!['GET','POST','PATCH','PUT','DELETE'].includes(item.method))
    fail('invalid HTTP method');
  if(!Array.isArray(item.expect) || item.expect.length===0 ||
     item.expect.some(n=>!ACCEPTABLE[item.id].includes(n))) fail('invalid expected status for '+item.id);
  if(!item.headers || typeof item.headers!=='object' || Array.isArray(item.headers))
    fail('case headers object required (may be empty for anonymous)');
  for (const [k,v] of Object.entries(item.headers)) {
    if(!/^(cookie|authorization|origin|x-csrf-token)$/i.test(k) || typeof v!=='string' || /[\r\n]/.test(v))
      fail('invalid header shape for '+item.id);
  }
  if(item.method!=='GET'){
    const origin=Object.entries(item.headers).find(([k])=>k.toLowerCase()==='origin')?.[1];
    if(origin!==base.origin) fail('all staging writes/login MUST send the matching Origin header');
  }
  if(item.id==='csrf_invalid' && item.method==='GET') fail('CSRF test must use state-changing request');
  if(item.id==='admin_allowed' && item.method==='GET') fail('admin allowed must exercise safe staging mutation');
  if(item.id==='admin_cookie_flags' && item.method!=='POST') fail('session cookie test must use staging login');
  if(item.body!==undefined && (typeof item.body!=='object' || item.body===null || Array.isArray(item.body)))
    fail('body must be a JSON object');
  cases.set(item.id,item);
}
for(const id of REQUIRED) if(!cases.has(id)) fail('missing acceptance case '+id);
console.log('PASS: staging fixture shape and required negative/positive cases verified (no credentials printed).');
if(validateOnly)process.exit(0);
if(!approved)fail('explicit --confirm-isolated required');
if(JSON.stringify(cfg).includes('REPLACE_') || base.hostname.endsWith('.invalid'))
  fail('staging fixture still contains placeholders or example.invalid hostname');
let failures=0;
for(const id of REQUIRED){
  const item=cases.get(id);
  let status;
  try{
    const res=await fetch(new URL(item.path,base),{
      method:item.method, redirect:'manual', cache:'no-store',
      headers:{...item.headers,...(item.body===undefined?{}:{'content-type':'application/json'})},
      body:item.body===undefined?undefined:JSON.stringify(item.body),
      signal:AbortSignal.timeout(12000)
    });
    status=res.status;
    if(id==='admin_cookie_flags' && item.expect.includes(status)){
      const raw=res.headers.get('set-cookie')||'';
      const ok=raw.startsWith(cookieName+'=') &&
        /(?:^|;)\s*Secure(?:;|$)/i.test(raw) &&
        /(?:^|;)\s*HttpOnly(?:;|$)/i.test(raw) &&
        /(?:^|;)\s*SameSite=(Strict|Lax)(?:;|$)/i.test(raw) &&
        raw.split(';').some(x=>x.trim()==='Path='+cookiePath) &&
        !/(?:^|;)\s*Domain=/i.test(raw) &&
        (!cookieName.startsWith('__Host-') || cookiePath==='/');
      if(!ok) {console.error('FAIL: admin cookie flags (content redacted)');failures++;}
    }
    if(id==='csrf_invalid' && status===403){
      const json=await res.json().catch(()=>null);
      if(json?.error?.code!=='CSRF_INVALID'){
        console.error('FAIL: CSRF case returned 403 without CSRF_INVALID error code');
        failures++;
      }
    }
    if(!item.expect.includes(status)){console.error('FAIL: '+id+' HTTP '+status+' expected '+item.expect.join('/'));failures++;}
    else console.log('PASS: '+id+' HTTP '+status);
  }catch(e){console.error('FAIL: '+id+' request error (details redacted)');failures++;}
}
if(failures){console.error('BLOCKED: '+failures+' CMS acceptance failures');process.exitCode=1;}
else console.log('PASS: isolated CMS authorization, CSRF and cookie acceptance. NOT a production test.');
