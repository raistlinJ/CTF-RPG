import test from "node:test";
import assert from "node:assert/strict";
import { dependencyBounds, fitDependencyCamera, dependencyWorldPoint, zoomDependencyCamera, DEPENDENCY_NODE_WIDTH, DEPENDENCY_NODE_HEIGHT } from "../lib/dependency-viewport.mjs";
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test("fit centers the actual cards after dragging beyond any side of the viewport", () => {
  for (const size of [{width:1200,height:560},{width:286,height:360}]) {
    for (const positions of [
      {a:{x:-1500,y:-700},b:{x:2400,y:2000}},
      {a:{x:10000,y:10000},b:{x:10336,y:10148}},
      {a:{x:-10000,y:-10000}},
    ]) {
      const bounds=dependencyBounds(positions),camera=fitDependencyCamera(bounds,size.width,size.height);
      assert.deepEqual(fitDependencyCamera(bounds,size.width,size.height),camera);
      for(const p of Object.values(positions)) {
        assert.ok(camera.x+(p.x-16)*camera.zoom>=24-1e-7);
        assert.ok(camera.x+(p.x+DEPENDENCY_NODE_WIDTH+16)*camera.zoom<=size.width-24+1e-7);
        assert.ok(camera.y+p.y*camera.zoom>=24-1e-7);
        assert.ok(camera.y+(p.y+DEPENDENCY_NODE_HEIGHT)*camera.zoom<=size.height-24+1e-7);
      }
    }
  }
  // Moving a compact group far from the origin does not shrink it unnecessarily.
  assert.equal(fitDependencyCamera(dependencyBounds({a:{x:10000,y:10000}}),1200,560).zoom,1);
});
test("zooming preserves its anchor, and dragging uses the same world coordinates at every scale", () => {
  const point={x:181,y:93};
  for (const zoom of [.005,.2,1,3]) {
    const camera={x:-530,y:310,zoom},world=dependencyWorldPoint(camera,point);
    const changed=zoomDependencyCamera(camera,zoom*1.25,point),after=dependencyWorldPoint(changed,point);
    close(after.x,world.x);close(after.y,world.y);
    const moved=dependencyWorldPoint(camera,{x:point.x+40,y:point.y-25});
    close(moved.x-world.x,40/zoom);close(moved.y-world.y,-25/zoom);
  }
});
test("fitting includes reverse-facing connection curves after cards are rearranged", () => {
  const positions={a:{x:9000,y:200},b:{x:-5000,y:-100}},bounds=dependencyBounds(positions,[{from:"a",to:"b"}]);
  assert.ok(bounds.left<positions.b.x-16);assert.ok(bounds.right>positions.a.x+DEPENDENCY_NODE_WIDTH+16);
  const camera=fitDependencyCamera(bounds,1200,560);
  close(camera.x+bounds.left*camera.zoom,24);close(camera.x+bounds.right*camera.zoom,1176);
});
