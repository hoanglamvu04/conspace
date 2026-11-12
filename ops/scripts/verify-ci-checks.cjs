#!/usr/bin/env node
// Fail-closed GitHub Actions check-runs verification for EXACT approved main SHA.
'use strict';
const fs=require('node:fs');
const sha=process.argv[2];
if(!/^[0-9a-f]{40}$/.test(sha||'')){console.error('FAIL: 40-hex SHA required');process.exit(2);}
let data;
try{data=JSON.parse(fs.readFileSync(0,'utf8'))}catch{console.error('FAIL: check-runs JSON invalid');process.exit(2);}
if(!Array.isArray(data.check_runs)){console.error('FAIL: missing check_runs');process.exit(1);}
const required=['ops-static','backend-and-frontend'];
let failed=false;
for(const name of required){
  const matching=data.check_runs.filter(run=>run.name===name&&run.head_sha===sha&&run.app?.slug==='github-actions');
  if(!matching.length){console.error('FAIL: required trusted job absent: '+name);failed=true;continue;}
  if(matching.some(run=>run.status!=='completed'||run.conclusion!=='success')){
    console.error('FAIL: required job not green: '+name);failed=true;
  } else console.log('PASS: GitHub Actions job '+name+' successful on exact SHA');
}
const trusted=data.check_runs.filter(run=>run.head_sha===sha&&run.app?.slug==='github-actions');
const otherFailures=trusted.filter(run=>run.status!=='completed'||run.conclusion!=='success');
if(otherFailures.length){
  console.error('FAIL: some GitHub Actions jobs for the approved SHA are not successful');
  failed=true;
}
if(failed)process.exitCode=1;
