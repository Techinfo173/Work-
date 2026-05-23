okkk urrrrm new users have to tap RESET in the calibrator before the weapon shows in the right place. thats because loadWeaponFile is overwriting my precalibrated weaponCal values with auto-fit values from the model bounds. fix in src/App.tsx, dont touch any other files:

==============================================
1) find the loadWeaponFile function. inside it find these 2 lines:

   const autoFit = computeAutoFitTransform(ctx.weaponModel);
   if (!hasSavedWeaponCal) Object.assign(ctx.weaponCal, autoFit);

REPLACE both lines with this single block that ONLY auto-fits if the user is loading a non-default weapon AND has no saved cal:

```ts
const autoFit = computeAutoFitTransform(ctx.weaponModel);
// only auto-fit when it's a brand new user-uploaded weapon (rare since we removed upload UI)
// for the default precalibrated weapon, keep the hardcoded ctx.weaponCal values
const isDefaultPrecal = (ctx.weaponCal.scale === 0.541 && ctx.weaponCal.px === -0.18 && ctx.weaponCal.py === -0.545);
if (!hasSavedWeaponCal && !isDefaultPrecal) Object.assign(ctx.weaponCal, autoFit);
```

==============================================
2) ALSO inside loadWeaponFile find this line:

   applyWeaponCal();

right BEFORE that line ADD:

```ts
syncCalSliders();
```

(this makes the calibrator panel sliders show the correct precal values when the user opens it, instead of stale defaults)

==============================================
3) ALSO at the very END of the bootstrap function right before `startGame();` make sure applyWeaponCal is called once more so the precal values are guaranteed to be applied. find the line:

   report(100, 'Starting game...');

right BEFORE that ADD:

```ts
applyWeaponCal();
syncCalSliders();
```

==============================================
thats it. only edit src/App.tsx, leave everything else alone.

after this:
- new users see the weapon at the correct precalibrated position immediately
- RESET button still works as before (loads defaultWeaponTransform which is the same hardcoded values)
- saved weapon cal from localStorage still loads for returning users
- no auto-fit override ruining the precal
