import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planJourney } from '../journey.mjs';
import { route, trainStops, travelDirection } from '../transit.mjs';

test('journeys minimize transfers and split line changes, reversals and branch shuttles', () => {
  const direct = planJourney('1001','서울역','1001','신창');
  assert.equal(direct.transfers,0); assert.equal(direct.legs[0].to,'신창');
  const reversal = planJourney('1001','인천','1001','신창');
  assert.equal(reversal.transfers,1); assert.equal(reversal.legs[0].to,'구로'); assert.equal(reversal.legs[1].from,'구로');
  const branch = planJourney('1002','신설동','1002','강남');
  assert.equal(branch.transfers,1); assert.equal(branch.legs[0].to,'성수'); assert.equal(branch.legs[1].section,0);
  const cross = planJourney('1002','강남','1009','여의도');
  assert.equal(cross.transfers,1);
  for (const result of [direct,reversal,branch,cross]) for (const leg of result.legs) assert.ok(route(leg.line,leg.from,leg.to,leg.direction));
});
test('same-name non-transfer stations stay distinct and station aliases transfer correctly', () => {
  assert.ok(planJourney('1005','양평','1063','양평').stationCount > 20);
  assert.ok(planJourney('1002','신촌','1063','신촌').legs.length > 0);
  assert.equal(planJourney('1004','총신대입구','1007','이수').sameStation,true);
  assert.equal(planJourney('1002','없는역','1009','여의도'),null);
  const gtx = planJourney('1032','서울역','1032','동탄');
  assert.ok(gtx.legs.some(leg=>leg.line!=='1032'));
  const loop = planJourney('1006','불광','1006','역촌');
  assert.equal(loop.transfers,1); assert.ok(loop.stationCount>=5);
});
test('verified 9호선 express stops allow boarding while passing stations and unknown service kinds are rejected', () => {
  const express = {express:true,kind:'급행',destination:'중앙보훈병원'};
  assert.deepEqual(trainStops('1009','여의도','고속터미널',1,express),['여의도','노량진','동작','고속터미널']);
  assert.equal(trainStops('1009','여의도','흑석',1,express),null);
  assert.equal(trainStops('1009','샛강','고속터미널',1,express),null);
  assert.equal(trainStops('1009','여의도','고속터미널',1,{...express,kind:'특급'}),null);
  assert.equal(trainStops('1001','서울역','인천',1,{...express,destination:'인천'}),null);
  assert.equal(travelDirection('1009','여의도','중앙보훈병원',0),1);
  assert.equal(travelDirection('1009','중앙보훈병원','중앙보훈병원',0),1);
});
