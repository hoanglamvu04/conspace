import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createAuthService } from '../src/services/auth.js';
import { hashPassword } from '../src/security/password.js';
import { createAdminAuthRouter } from '../src/routes/admin/auth.js';
import { errorMiddleware } from '../src/http/validation.js';

async function start(t,app){
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

test('CMS login creates an opaque session and stores only the token hash',async()=>{
  const password='A-different-strong-password-2026';
  const passwordHash=await hashPassword(password);
  const calls=[];
  const db={query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('auth_login_rate_limits') && sql.startsWith('INSERT')) return {rows:[{attempts:0,blocked_until:null}]};
    if(sql.includes('FROM conspace.cms_users u WHERE email')) return {rows:[{id:'11111111-1111-4111-8111-111111111111',email:'editor@conspace.vn',display_name:'Editor',role:'EDITOR',password_hash:passwordHash,is_active:true,must_change_password:false}]};
    return {rows:[],rowCount:1};
  }};
  const service=createAuthService(db,{sessionTtlHours:8});
  const result=await service.login({email:'EDITOR@CONSPACE.VN',password,ip:'127.0.0.1',userAgent:'test-agent'});
  assert.ok(result.token);
  assert.ok(result.csrfToken);
  assert.notEqual(result.token,result.csrfToken);
  const insert=calls.find((call)=>call.sql.includes('INSERT INTO conspace.cms_sessions'));
  assert.ok(insert);
  assert.notEqual(insert.params[0],result.token);
  assert.equal(insert.params[1],'11111111-1111-4111-8111-111111111111');
  assert.equal(result.user.role,'EDITOR');
  assert.ok(!calls.some((call)=>JSON.stringify(call.params).includes(password)));
});

test('CMS login returns a generic 401 and persistent rate limit can block further attempts',async()=>{
  const passwordHash=await hashPassword('Another-long-password-2026!');
  let attempts=0;
  const db={query:async(sql)=>{
    if(sql.includes('auth_login_rate_limits') && sql.startsWith('INSERT')){
      return {rows:[{attempts,blocked_until:null}]};
    }
    if(sql.includes('FROM conspace.cms_users u WHERE email')) return {rows:[]};
    if(sql.includes('UPDATE conspace.auth_login_rate_limits SET attempts')) {attempts+=1;return {rows:[]};}
    return {rows:[]};
  }};
  const service=createAuthService(db,{sessionTtlHours:8});
  await assert.rejects(service.login({email:'missing@conspace.vn',password:'wrong-password',ip:'127.0.0.1'}),{status:401,code:'INVALID_CREDENTIALS'});
  assert.equal(attempts,1);

  const blockedDb={query:async()=>({rows:[{attempts:5,blocked_until:new Date(Date.now()+60000)}]})};
  await assert.rejects(createAuthService(blockedDb,{sessionTtlHours:8}).login({
    email:'missing@conspace.vn',password:'wrong-password',ip:'127.0.0.1',
  }),{status:429,code:'RATE_LIMITED'});
});

test('admin auth endpoints set HttpOnly SameSite cookie, expose CSRF token and revoke logout',async(t)=>{
  let authenticated=false;
  const authService={
    login:async()=>({token:'opaque-session-token',csrfToken:'opaque-csrf-token',expiresAt:new Date(Date.now()+3600000).toISOString(),user:{id:'11111111-1111-4111-8111-111111111111',email:'editor@conspace.vn',role:'EDITOR'}}),
    authenticate:async(token)=>token==='opaque-session-token'&&authenticated?{user:{id:'11111111-1111-4111-8111-111111111111',email:'editor@conspace.vn',role:'EDITOR'},csrfToken:'opaque-csrf-token',expiresAt:new Date(Date.now()+3600000).toISOString()}:null,
    logout:async()=>{authenticated=false;},
  };
  const config={publicOrigin:'http://127.0.0.1:5176',corsOrigins:['http://127.0.0.1:5176'],nodeEnv:'test',sessionCookieName:'conspace_admin_session'};
  const app=express();
  app.use(express.json());
  app.use('/api/admin/auth',createAdminAuthRouter({authService,db:{},config}));
  app.use(errorMiddleware);
  const base=await start(t,app);
  const login=await fetch(base+'/api/admin/auth/login',{
    method:'POST',headers:{'content-type':'application/json',origin:config.publicOrigin},
    body:JSON.stringify({email:'editor@conspace.vn',password:'strong-password'}),
  });
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);
  assert.ok(cookie.includes('Path=/api/admin'));
  const body=await login.json();
  assert.equal(body.data.csrfToken,'opaque-csrf-token');
  authenticated=true;
  const session=await fetch(base+'/api/admin/auth/session',{headers:{cookie:cookie.split(';')[0]}});
  assert.equal(session.status,200);
  const logout=await fetch(base+'/api/admin/auth/logout',{
    method:'POST',headers:{cookie:cookie.split(';')[0],origin:config.publicOrigin,'x-csrf-token':'opaque-csrf-token'},
  });
  assert.equal(logout.status,200);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  const after=await fetch(base+'/api/admin/auth/session',{headers:{cookie:cookie.split(';')[0]}});
  assert.equal(after.status,401);
});
