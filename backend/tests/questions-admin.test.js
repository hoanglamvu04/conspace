import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createQuestionsRouter } from '../src/routes/admin/questions.js';
import { encryptPrivateContact } from '../src/security/private-contact.js';
import { errorMiddleware } from '../src/http/validation.js';

const KEY='22'.repeat(32);
const QUESTION_ID='11111111-1111-4111-8111-111111111111';
const ACTOR_ID='22222222-2222-4222-8222-222222222222';

async function listen(t,db){
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{
    req.auth={
      id:ACTOR_ID,
      role:'TECHNICAL_REVIEWER',
      roles:['TECHNICAL_REVIEWER','EDITOR'],
      permissions:[],
    };
    next();
  });
  app.use('/api/admin/questions',createQuestionsRouter(db,{contactEncryptionKey:KEY}));
  app.use(errorMiddleware);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

test('secondary EDITOR role can access encrypted private reply contact and access is audited',async(t)=>{
  const encrypted=encryptPrivateContact('0900000000',KEY);
  const calls=[];
  const db={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.includes('FROM conspace.reader_questions q LEFT JOIN conspace.niches')){
        return {rows:[{
          id:QUESTION_ID,
          description:'Câu hỏi thử nghiệm',
          status:'IN_REVIEW',
          request_private_reply:true,
          contact_ciphertext:encrypted.ciphertext,
          contact_iv:encrypted.iv,
          contact_auth_tag:encrypted.authTag,
          media:[],
          answerId:null,
        }]};
      }
      return {rows:[],rowCount:1};
    },
  };
  const base=await listen(t,db);
  const response=await fetch(base+'/api/admin/questions/'+QUESTION_ID);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.data.privateContact,'0900000000');
  assert.ok(!Object.hasOwn(body.data,'contact_ciphertext'));
  assert.ok(calls.some(call=>call.sql.includes("'PRIVATE_CONTACT_ACCESSED'")));
});
