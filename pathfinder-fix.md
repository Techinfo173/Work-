okkk urrrrm enemies are just pacing back and forth instead of pathfinding because the engine is calling three-pathfinding methods statically on the class but findPath and getGroup are INSTANCE methods. the static calls fail silently, path comes back empty, AI falls back to "walk to random point 3m away" logic so they look like theyre pacing. fix in 2 files. only edit src/App.tsx and src/engine-systems.ts.

==============================================
PART 1 — src/App.tsx
==============================================

1) find this line in the GameCtx ctx initialization (near the top of bootstrap, in the big ctx object):

```ts
noiseEvents: [], pathfindingModule,
```

REPLACE with:

```ts
noiseEvents: [], pathfindingModule, pathfinder: null,
```

2) find the buildNavmesh function. find this line at the start of it:

```ts
const Pathfinding = pathfindingModule.Pathfinding ?? pathfindingModule.default?.Pathfinding ?? pathfindingModule;
```

right AFTER it ADD:

```ts
const pathfinder = new Pathfinding();
ctx.pathfinder = pathfinder;
```

3) further down in buildNavmesh find this line in the explicit-navmesh branch:

```ts
ctx.navZone = Pathfinding.createZone(explicitNav.geometry);
```

right AFTER it ADD:

```ts
ctx.pathfinder.setZoneData('level', ctx.navZone);
```

4) further down in the auto-generated navmesh branch find this line:

```ts
ctx.navZone = Pathfinding.createZone(navGeom); navGeom.dispose();
```

CHANGE to:

```ts
ctx.navZone = Pathfinding.createZone(navGeom); navGeom.dispose();
ctx.pathfinder.setZoneData('level', ctx.navZone);
```

==============================================
PART 2 — src/engine-systems.ts
==============================================

5) find the GameCtx interface definition. find this line:

```ts
pathfindingModule: any;
```

right AFTER it ADD:

```ts
pathfinder?: any;
```

6) find the pathfindTo function. REPLACE the whole function body with:

```ts
function pathfindTo(e: Enemy, target: any, ctx: GameCtx) {
  if (!ctx.pathfinder || !ctx.navZone) return;
  const groupId = ctx.pathfinder.getGroup('level', e.model.position) ?? 0;
  e.path = ctx.pathfinder.findPath(e.model.position, target, 'level', groupId) || [];
  e.pathIndex = 0;
}
```

7) find the tickPatrol function. inside it find this block:

```ts
if (target && ctx.navZone) {
  const Pathfinding = ctx.pathfindingModule?.Pathfinding ?? ctx.pathfindingModule?.default?.Pathfinding ?? ctx.pathfindingModule;
  const groupId = Pathfinding.getGroup(ctx.navZone, e.spawnPos);
  e.path = Pathfinding.findPath(e.spawnPos, target, ctx.navZone, groupId) || [];
  e.pathIndex = 0;
}
```

REPLACE with:

```ts
if (target && ctx.pathfinder) {
  const groupId = ctx.pathfinder.getGroup('level', e.spawnPos) ?? 0;
  e.path = ctx.pathfinder.findPath(e.spawnPos, target, 'level', groupId) || [];
  e.pathIndex = 0;
}
```

8) find the tickInvestigate function. inside it find this block:

```ts
if (!e.path || e.pathIndex >= e.path.length) {
  const groupId = ctx.pathfindingModule?.Pathfinding?.getGroup?.(ctx.navZone, e.spawnPos) ?? 0;
  e.path = ctx.pathfindingModule?.Pathfinding?.findPath?.(e.model.position, e.investigateTarget, ctx.navZone, groupId) || [];
  e.pathIndex = 0;
}
```

REPLACE with:

```ts
if (!e.path || e.pathIndex >= e.path.length) {
  if (ctx.pathfinder) {
    const groupId = ctx.pathfinder.getGroup('level', e.model.position) ?? 0;
    e.path = ctx.pathfinder.findPath(e.model.position, e.investigateTarget, 'level', groupId) || [];
  } else {
    e.path = [];
  }
  e.pathIndex = 0;
}
```

==============================================
thats it. only edit those 2 files, leave everything else alone.

after this:
- enemies will actually pathfind across the map navmesh
- they navigate around obstacles
- patrol goes to legit waypoints not random offsets
- investigate actually walks to where they heard noise
- chase paths through the map instead of trying to walk through walls
