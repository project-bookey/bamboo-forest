import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SPEED } from '../world.mjs';

function fixture() {
  let now = 100000;
  const world = new World({ now: () => now });
  return { world, advance: ms => now += ms };
}
test('server normalizes diagonal input, caps speed and map bounds, and stops stale input', () => {
  const { world, advance } = fixture(), p = world.join(); p.x = p.z = 0;
  world.input(p.id, { x: 1e9, z: 1e9 });world.tick(.1);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - SPEED * .1) < 1e-9);
  const previous = p.x; advance(601);world.tick(.1);assert.equal(p.x, previous);
  world.input(p.id, { target: { x: 1e9, z: -1e9 } });
  for(let i=0;i<1000;i++)world.tick(.1);
  assert.ok(p.x <= 28 && p.z >= -44);
  const x=p.x;world.input(p.id,{x:NaN,z:Infinity});world.tick(.1);assert.ok(Number.isFinite(p.x));
});
test('two players compete for one axe/tree and panda follows its actual feeder', () => {
  const { world, advance }=fixture(), a=world.join(), b=world.join();
  a.x=b.x=a.z=b.z=0;
  world.axes=[{id:0,x:0,z:0,readyAt:0}];world.trees=[{id:0,x:0,z:0,height:8,readyAt:0}];
  world.pandas=[{id:0,x:0,z:0,owner:null,target:{x:10,z:10},angle:0}];
  assert.equal(world.action(a.id,{type:'pickup'}).ok,true);
  assert.equal(world.action(b.id,{type:'pickup'}).ok,false);
  assert.equal(world.action(a.id,{type:'chop'}).ok,false);
  advance(700);assert.equal(world.action(a.id,{type:'chop'}).ok,true);
  b.axe=true;advance(700);assert.equal(world.action(b.id,{type:'chop'}).ok,false);
  assert.equal(a.bamboo,1);assert.equal(world.action(a.id,{type:'feed'}).ok,true);
  assert.equal(world.pandas[0].owner,a.id);assert.equal(a.bamboo,0);
  a.x=10;const before=Math.abs(world.pandas[0].x-a.x);world.tick(.1);
  assert.ok(Math.abs(world.pandas[0].x-a.x)<before);
  assert.equal(world.action(b.id,{type:'feed'}).ok,false);
  world.leave(a.id);assert.equal(world.pandas[0].owner,null);
  advance(45000);world.tick(.1);assert.equal(world.axes[0].readyAt,0);
  b.x=world.trees[0].x;b.z=world.trees[0].z;
  assert.equal(world.action(b.id,{type:'chop'}).ok,true);
});
test('reach, bamboo inventory and chat lifetime are enforced by the server', () => {
  const {world,advance}=fixture(),p=world.join();p.x=p.z=0;
  world.axes=[{id:0,x:10,z:0,readyAt:0}];
  assert.equal(world.action(p.id,{type:'pickup'}).ok,false);
  assert.equal(world.say(p.id,'hello'),true);assert.equal(world.say(p.id,'spam'),false);
  advance(2100);assert.equal(world.say(p.id,'x'.repeat(61)),false);
  assert.equal(world.say(p.id,'<script>alert(1)</script>'),true);
  const publicPlayer=world.snapshot().players[0];assert.equal(publicPlayer.input,undefined);
  advance(20001);world.tick(.1);assert.equal(world.clouds.length,0);
});
