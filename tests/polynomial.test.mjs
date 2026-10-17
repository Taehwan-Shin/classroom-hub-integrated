import test from 'node:test';
import assert from 'node:assert/strict';
import { stages, cleanRecord, completeRecord } from '../dist/polynomial-data.mjs';
import { createRun, advance, jump, answer, continueRun, logs, GROUND } from '../dist/polynomial-engine.mjs';

test('18 original questions have distinct answers and independently checked answer keys', () => {
  const expected = [
    ['3x² + 2x − 3','2x² + 6x − 4','x² + x − 6','4x² − 4x + 1','x³ + 8','몫 x+2, 나머지 0'],
    ['3','9','−2','−5','7','x−1'],
    ['(x−3)(x+3)','(x+2)(x+3)','(2x+1)(x+3)','(x−2)(x²+2x+4)','(x+1)³','x(x−1)(x+1)']
  ];
  stages.forEach((s,i) => {
    assert.equal(s.questions.length,6);
    s.questions.forEach((q,j) => { assert.equal(q.choices.length,4); assert.equal(new Set(q.choices).size,4); assert.equal(q.choices[q.answer],expected[i][j]); assert.ok(q.explanation.length>20); });
  });
  // Check the selected expressions against independently calculated algebraic identities.
  const algebraEqual = (a,b) => assert.ok(a === b);
  for(const x of [-5,-2,-1,0,1,2,3,7]) {
    algebraEqual((2*x*x-3*x+1)+(x*x+5*x-4),3*x*x+2*x-3);
    algebraEqual((3*x*x+2*x-1)-(x*x-4*x+3),2*x*x+6*x-4);
    algebraEqual((x+3)*(x-2),x*x+x-6);
    algebraEqual((2*x-1)**2,4*x*x-4*x+1);
    algebraEqual((x+2)*(x*x-2*x+4),x**3+8);
    algebraEqual((x+1)*(x+2),x*x+3*x+2);
    algebraEqual((x-3)*(x+3),x*x-9);
    algebraEqual((x+2)*(x+3),x*x+5*x+6);
    algebraEqual((2*x+1)*(x+3),2*x*x+7*x+3);
    algebraEqual((x-2)*(x*x+2*x+4),x**3-8);
    algebraEqual((x+1)**3,x**3+3*x*x+3*x+1);
    algebraEqual(x*(x-1)*(x+1),x**3-x);
  }
  assert.equal(2-3+4,3); assert.equal(2**3-2*2+5,9); assert.equal(2*(-1)**2+3*(-1)-1,-2);
  assert.equal(2**2+(-5)*2+6,0); assert.equal(1**3-4*1,-3);
});

function simulate(character, mode, choices = null) {
  const run=createRun(character,'operations',mode);
  for(let i=0;i<5000&&run.state!=='finished';i++) {
    if(run.state==='question') { const correct=stages[0].questions[run.next].answer; answer(run,choices?.[run.next]??correct,correct); continueRun(run); }
    if(mode==='adventure'&&run.grounded&&logs.some(x=>x-run.x>20&&x-run.x<105)) jump(run);
    advance(run,1/120,1);
  }
  assert.equal(run.state,'finished'); return run;
}
test('both characters complete all six gates with controllable jumping',()=> {
  for(const c of ['squirrel','turtle']) { const r=simulate(c,'adventure'); assert.equal(r.correct,6); assert.equal(r.hits,0); assert.equal(r.next,6); assert.ok(r.score>=600); }
});
test('questions freeze physics, answer is single-use, continuation requires answer',()=> {
  const r=createRun('turtle','factor'); r.x=510; advance(r,.01,1);
  assert.equal(r.state,'question'); const x=r.x; advance(r,10,1); assert.equal(r.x,x);
  assert.equal(continueRun(r),false); assert.equal(answer(r,8,0),null); assert.equal(answer(r,1,0),false); assert.equal(answer(r,0,0),null);
  assert.equal(r.score,0); assert.equal(continueRun(r),true); assert.equal(r.next,1);
});
test('collision safely respawns and score never goes negative; paused and malformed ticks do not move',()=> {
  const r=createRun('squirrel','operations'); r.next=1; r.x=810; r.score=10;
  assert.equal(advance(r,.01,1),'hit'); assert.equal(r.x,600); assert.equal(r.score,0); assert.equal(r.hits,1);
  r.state='paused'; const x=r.x; advance(r,1,1); jump(r); assert.equal(r.x,x); assert.equal(r.vy,0);
  r.state='running'; advance(r,NaN,1); advance(r,-1,1); assert.equal(r.x,x);
  jump(r); const vy=r.vy; jump(r); assert.equal(r.vy,vy);
  for(let i=0;i<120;i++) advance(r,1/120,0); assert.equal(r.y,GROUND-48); assert.equal(r.grounded,true);
});
test('quiz mode completes without collisions but cannot earn jump badge',()=> {
  const r=simulate('squirrel','quiz'); assert.equal(r.hits,0); assert.equal(r.score,600);
  const rec=completeRecord(cleanRecord(null),r); assert.ok(rec.badges.includes('operations')); assert.ok(rec.badges.includes('scholar')); assert.ok(!rec.badges.includes('explorer'));
});
test('record sanitization, best-score preservation and two-character badge',()=> {
  const dirty=cleanRecord({ best:{operations:-1,factor:Infinity,remainder:100000},badges:['scholar','injected'],characters:['turtle','unknown'],name:'synthetic-only' });
  assert.deepEqual(dirty.best,{operations:0,remainder:0,factor:0}); assert.deepEqual(dirty.badges,['scholar']); assert.deepEqual(dirty.characters,['turtle']); assert.equal(dirty.name,undefined);
  const first=completeRecord(dirty,simulate('squirrel','adventure')); assert.ok(first.badges.includes('friends')); assert.ok(first.badges.includes('explorer'));
  const lower=simulate('turtle','quiz',[3,0,0,0,1,0]); const second=completeRecord(first,lower); assert.equal(second.best.operations,first.best.operations);
  assert.throws(()=>completeRecord(first,{stage:'unknown',character:'turtle',score:0,correct:0,hits:0}));
});

