import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSectionEnvelope,
  mapSectionCells,
  buildSectionSavePayload,
  buildSectionSubmitPayload,
  isSectionEditable,
  isSectionSubmittable,
} from './nicheWorkflow.js';

test('Template A section envelope remains object-backed and maps audience layers',()=>{
  const mapped=mapSectionCells({
    templateType:'TEMPLATE_A',expectedSectionCount:12,
    sections:[{sectionNo:6,audienceRole:'contractor',id:'s1',content:'Risk',sourceRef:'Source',status:'DRAFT',sensitivityAssessed:true,sensitivityFlags:['INDUSTRY_DARK_SIDE'],requiresChiefReview:true}],
  });
  assert.equal(mapped.expectedSectionCount,12);
  assert.equal(mapped.cells['6:contractor'].requiresChiefReview,true);
});

test('Template B uses seven shared blocks and omits audienceRole from writes',()=>{
  const normalized=normalizeSectionEnvelope({templateType:'TEMPLATE_B',expectedSectionCount:7,sections:[]});
  assert.equal(normalized.expectedSectionCount,7);
  const payload=buildSectionSavePayload({templateType:'TEMPLATE_B',audienceRole:'architect',content:' Nội dung ',sourceRef:' nguồn ',sensitivityAssessed:true,sensitivityFlags:[]});
  assert.equal(Object.hasOwn(payload,'audienceRole'),false);
  assert.equal(payload.sourceRef,'nguồn');
});

test('Template A save and submit payloads follow API contract without status field',()=>{
  const payload=buildSectionSavePayload({templateType:'TEMPLATE_A',audienceRole:'homeowner',content:'Nội dung',sourceRef:'Nguồn',sensitivityAssessed:true,sensitivityFlags:[]});
  assert.deepEqual(payload,{audienceRole:'homeowner',content:'Nội dung',sourceRef:'Nguồn',sensitivityAssessed:true,sensitivityFlags:[]});
  assert.equal(Object.hasOwn(payload,'status'),false);
  assert.deepEqual(buildSectionSubmitPayload('TEMPLATE_A','homeowner',' Gửi duyệt '),{audienceRole:'homeowner',reason:'Gửi duyệt'});
});

test('published/reviewing sections are not editable and submit requires source plus sensitivity assessment',()=>{
  assert.equal(isSectionEditable('PUBLISHED'),false);
  assert.equal(isSectionEditable('TECHNICAL_REVIEW'),false);
  assert.equal(isSectionEditable('NEEDS_CHANGES'),true);
  assert.equal(isSectionSubmittable({status:'DRAFT',content:'x',sourceRef:'s',sensitivityAssessed:true}),true);
  assert.equal(isSectionSubmittable({status:'DRAFT',content:'x',sourceRef:'',sensitivityAssessed:true}),false);
  assert.equal(isSectionSubmittable({status:'DRAFT',content:'x',sourceRef:'s',sensitivityAssessed:false}),false);
});
