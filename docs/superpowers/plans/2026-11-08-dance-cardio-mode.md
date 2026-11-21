# 燃脂跳操模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a continuous rhythm dance-cardio mode (燃脂跳操) next to 部位塑形: generated song blocks with a wave intensity curve, learn-then-combo choreography on 8-counts, a synthesized dance groove and on-beat instructor call-outs.

**Architecture:** A pure `Routine` model in `src/dance/` (warm-up, blocks of 4 move slots, cool-down, stretch) is compiled into an ordinary `Plan` whose items have `restBeforeSeconds = 0` and carry `dance` metadata. Timeline, session, stage and storage stay as they are; the beat layer gains a `dance` groove keyed by that metadata, and a dance cue builder reuses `placeCues`.

**Tech Stack:** TypeScript, React 18, zustand, zod 4, vitest + Testing Library, Playwright, gltf-transform (catalog build), Doubao TTS (voice generation script).

**Spec:** `docs/superpowers/specs/2026-11-08-dance-cardio-mode-design.md`

## Global Constraints

- 部位塑形 behaviour must not change: same plans for the same seed, same beat hits (snapshot), same cue sheets.
- Dance tempos: block 1 BPM 入门 110 / 进阶 118 / 挑战 124, +4 per block, cap 122 / 130 / 136; warm-up 100 BPM; cool-down moves 96 BPM; stretch 80 BPM.
- Item lengths: warm-up, learn, cool-down items 32 beats; combo items 16 beats; `beatsPerRep ∈ {1, 2, 4, 8}` for every dance item.
- Slot tiers per block: 2, 2, 3, 1. At most one funny move (`funny-` id prefix) per block, never in slot 3.
- 入门 forces `quiet = true`. Quiet: `impact === 'low'` only; 入门 additionally `level ≤ 1`. Quiet: no voice clip whose text contains “跳”.
- Total within target ±30 s, else `shortfallSeconds`.
- No new runtime dependencies. No emoji/Unicode icons in UI text. Chinese UI copy exactly as in the spec.
- `mannequin.glb` < 3 MB.
- The TTS key is read from `DOUBAO_TTS_API_KEY` only; never written to a file or printed.
- Two decisions this plan makes where the spec leaves room: dance stretches come from a fixed list of 5 standing, non-sided stretches (`DANCE_STRETCH_IDS`), so the class never goes to the floor or shows a 换边 pause; duration fitting searches all 32 combinations of last-block passes × warm-up count × stretch count instead of adjusting them one after another (same knobs, closest result).
- Count clips are trimmed by speech rate only (`speech_rate` 100); no audio post-processing.

## Review Focus

1. A stored record or in-progress workout from before this change (no `mode`) must still load and resume as 部位塑形 — Task 3 test.
2. 30-minute 挑战 with quiet on (smallest tier-3 pool, most blocks) must still fill every slot without adjacent-block repeats or throwing — Task 4 sweep includes it.
3. Count clips at 136 BPM: if a 五/六/七/八 clip is longer than a beat it must be dropped, not delay the next count or overlap — Task 8 test with a 0.5 s count clip.
4. Skipping (跳过) during a combo item lands on the next item’s first beat with no rest screen and the cue sheet still plays the next counts — Task 10 test on `stateAt` after `session.skip()`.
5. User music on: the synth groove is silent but the last 4 beats of every dance item still tick — Task 6 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/catalog/types.ts` | `pools`, `danceTier`, refine rules |
| `tools/catalog/selection.ts` | `DANCE_SELECTION` rows; dual-pool tags on existing rows |
| `tools/catalog/exercise.ts`, `build.ts` | dance tempos in `pickBeats`; emit dance rows |
| `scripts/validate-catalog.ts` | dance fit + pool-size checks; count limit 40–120 |
| `src/planner/types.ts` | `ShapeInput`, `PlanInput` union, `DanceItemInfo`, `Plan.routine` |
| `src/dance/types.ts` | `DanceInput`, `Block`, `Routine`, `MoveRef` |
| `src/dance/tempo.ts` | BPM table, beat constants |
| `src/dance/pool.ts` | eligibility, tier queues, `DANCE_STRETCH_IDS` |
| `src/dance/generateRoutine.ts` | routine generation + duration fitting |
| `src/dance/compileRoutine.ts` | `Routine → Plan` |
| `src/dance/editRoutine.ts` | candidates + `replaceMove` |
| `src/dance/cues.ts` | dance cue candidates |
| `src/beat/events.ts`, `patterns.ts`, `schedule.ts` | `BeatEvent.dance`, `'dance'` groove, `offsetBeats` |
| `src/audio/synth.ts` | `clap` |
| `src/coach/phrases.ts`, `cues.ts`, `scripts/gen-voice.ts` | new phrases, `stepCandidates` export, count gap, speech rate |
| `src/storage/storage.ts` | normalizer, `homeMode` setting |
| `src/ui/store.ts`, `pages/*.tsx`, `format.ts`, `components/DanceStatus.tsx`, `useTrainingRun.ts` | mode switch, dance preview/training |

---

### Task 1: Catalog schema — `pools` and `danceTier`

**Files:**
- Modify: `src/catalog/types.ts`, `src/planner/generatePlan.ts` (`eligible`)
- Test: `tests/catalog/types.test.ts`, `tests/planner/generatePlan.test.ts`

**Interfaces:**
- Produces: `type Pool = 'shape' | 'dance'`; `type DanceTier = 1 | 2 | 3`; `Exercise.pools: Pool[]` (zod default `['shape']`, so the committed `exercises.json` still parses); `Exercise.danceTier?: DanceTier`.

- [ ] **Step 1: Write failing tests** in `tests/catalog/types.test.ts`:
  - `parses a row without pools as ['shape']` → `parseCatalog([row])[0].pools` equals `['shape']`.
  - `requires danceTier for dance pool` → `pools: ['dance']` without `danceTier` throws `CatalogError` whose message contains `danceTier`.
  - `rejects danceTier outside dance pool` → `pools: ['shape'], danceTier: 2` throws.
  - `rejects sided dance move` → `pools: ['dance'], danceTier: 1, sided: true` throws with message containing `sided`.
  - In `tests/planner/generatePlan.test.ts`: `eligible excludes dance-only moves` → `eligible(makeExercise({ pools: ['dance'], danceTier: 2 }), shapeInput)` is `false`. (Update `makeExercise` in `tests/fixtures/catalog.ts` to default `pools: ['shape']`.)
- [ ] **Step 2:** `npx vitest run tests/catalog tests/planner` → the new tests FAIL.
- [ ] **Step 3: Implement.** Add the two fields to `ExerciseSchema` with `superRefine` producing the three issues above. In `eligible`, return `false` first when `!exercise.pools.includes('shape')`.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` → all PASS.
- [ ] **Step 5: Commit** `feat: add move pools and dance tiers to the catalog schema`

### Task 2: Import the dance pool and rebuild assets

**Files:**
- Modify: `tools/catalog/selection.ts`, `tools/catalog/exercise.ts`, `tools/catalog/build.ts`, `scripts/validate-catalog.ts`
- Generated: `public/assets/catalog/exercises.json`, `public/assets/models/mannequin.glb`, `public/assets/thumbs/*.png`
- Test: `tests/tools/selection.test.ts` (create or extend the existing one in `tests/tools/`), `tests/scripts/validate-catalog.test.ts`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: `DANCE_SELECTION: readonly DanceRow[]` where `type DanceRow = readonly [id, name, Level, DanceTier, cues: readonly string[], caution: string]` (all `parts: ['全身']`, `type: 'main'`, `impact: 'low'`, `sided: false`, `pools: ['dance']`); `DUAL_POOL: Readonly<Record<string, DanceTier>>` for existing rows; `DANCE_BPMS = [96, 100, 110, 114, 118, 122, 124, 126, 128, 130, 132, 134, 136]`; `pickBeats(clipSeconds, bpms, allowed = [1, 2, 4, 8, 16])`.

Tiers and levels (spec §3.2–3.3; names/cues written in the same style as existing rows, cautions where a move loads knees or back):

| tier | ids (level) |
|---|---|
| 3 | fast-feet-small (1), power-walk-arms-up (1), boxer-shuffle (1), half-jack-arms (1), jab-cross-step (2), skater-step-no-hop (2), dance-running-man-step (2), dance-pump-it (2) |
| 2 | grapevine (1), heel-dig-punch (1), standing-uppercuts (1), lateral-shuffle-low (1), low-front-kick (2), cross-knee-tap (1), butt-kick-walk (1), dance-two-step (1), dance-cabbage-patch (1), dance-raise-the-roof (1), dance-sprinkler (1), dance-disco-point (1), dance-carlton (2), dance-ymca (1), dance-hitchhike (1), funny-chicken-dance (1), funny-air-guitar (1), funny-sumo-stomp (2) |
| 1 | twist-march (1), march-arm-circles (1), dance-bounce-groove (1), dance-side-sway (1), dance-heel-tap (1), dance-the-swim (1), dance-overhead-clap (1), funny-penguin-waddle (1), funny-t-rex-arms (1), funny-hot-floor (1) |

`DUAL_POOL`: jumping-jacks 3, high-knees 3, burpee 3, standing-climber 3, skier-swing 3, overhead-punches 3, step-jack 2, punches 2, march-in-place 1, step-touch-clap 1.

- [ ] **Step 1: Write failing tests.**
  - `tests/tools/selection.test.ts`: `dance rows are unique and do not clash with SELECTION or MIXAMO_SELECTION ids`; `every DUAL_POOL id exists in SELECTION or MIXAMO_SELECTION and is not sided`.
  - `tests/scripts/validate-catalog.test.ts` (with `makeExercise` catalogs and a fake clip map):
    - `flags a dance move whose fitted beatsPerRep is 3 or 16 at some dance BPM` → error contains the id and `八拍`.
    - `flags fewer than 6 low-impact tier-3 moves` → error `低冲击高潮动作少于 6 条`.
    - `flags fewer than 4 level-1 low-impact moves in a tier` → error `入门可用的强度 N 动作少于 4 条`.
    - `accepts 40 to 120 moves` → a 100-move catalog gives no count error.
    - Dance BPMs checked: tier 1 → `[96, 100, ...110..136]`; tier 2/3 → 110..136 (use `DANCE_BPMS` filtered); shape coverage counts only `pools.includes('shape')` moves.
- [ ] **Step 2:** `npx vitest run tests/tools tests/scripts` → FAIL.
- [ ] **Step 3: Implement.** Rows in `selection.ts`; `build.ts` maps `DANCE_SELECTION` into `Exercise`s with `beatsPerRep = pickBeats(clipSeconds, tierBpms, [1, 2, 4, 8])` and `defaultReps` from `amount_en`, keeps their animations in the GLB (`keep` set), and sets `pools`/`danceTier` on `DUAL_POOL` rows; validator gets the checks above and a 40–120 count range.
- [ ] **Step 4:** `npx vitest run tests/tools tests/scripts` → PASS.
- [ ] **Step 5: Rebuild assets.**
  Run: `npx tsx tools/catalog/build.ts ../_vendor/desk-break --mixamo ../_vendor/mixamo-retargeted`, then `npx tsx tools/thumbs/render.ts`, then `npm run validate:catalog`.
  Expected: exit 0, GLB < 3 MB. If a dual-pool or dance move fails the 八拍 check, remove it from `DUAL_POOL`/`DANCE_SELECTION` (record the removal in the commit message) and keep the pool-size checks green.
- [ ] **Step 6: Thumbnail check.** Look at `public/assets/thumbs/<id>.png` for every new move; drop any whose pose is broken or reads as floor work. Full motion is checked in Task 10 Step 5.
- [ ] **Step 7: Commit** `feat: import desk-break cardio, dance and funny moves into a dance pool`

### Task 3: Plan input union, storage normalizer and settings

**Files:**
- Modify: `src/planner/types.ts`, `src/planner/generatePlan.ts`, `src/planner/editPlan.ts`, `src/storage/storage.ts`, `src/ui/store.ts` (type fixes only), callers found by `tsc`
- Create: `src/dance/types.ts`
- Test: `tests/storage/storage.test.ts`, `tests/planner/generatePlan.test.ts`

**Interfaces:**
- Produces (`src/dance/types.ts`):
  ```ts
  type DanceMinutes = 10 | 15 | 20 | 30
  interface DanceInput { readonly mode: 'dance'; readonly minutes: DanceMinutes; readonly level: Level; readonly quiet: boolean }
  interface Block { readonly index: number; readonly bpm: number; readonly moves: readonly string[]; readonly comboPasses: 1 | 2 }
  interface Routine { readonly input: DanceInput; readonly seed: number; readonly warmup: readonly string[]; readonly blocks: readonly Block[]; readonly cooldown: readonly string[]; readonly stretch: readonly string[] }
  type MoveRef = { readonly part: 'warmup' | 'cooldown'; readonly index: number } | { readonly part: 'block'; readonly block: number; readonly slot: number }
  ```
- Produces (`src/planner/types.ts`): `ShapeInput { mode: 'shape'; parts; minutes: Minutes; level }`; `PlanInput = ShapeInput | DanceInput`; `DanceItemInfo { block: number; phase: 'warmup' | 'learn' | 'combo' | 'cooldown'; tier: DanceTier; pass: number }`; `PlanItem.dance?: DanceItemInfo`; `Plan.routine?: Routine`.
- `generatePlan(input: ShapeInput, ...)`; `toItem(e, segment, input: { readonly level: Level }, restBefore, round?)`.
- Storage: `normalizePlan(plan: unknown): Plan` (adds `mode: 'shape'` to an input without `mode`); applied in `listRecords` and `loadProgress`. `Settings.homeMode: 'dance' | 'shape'`, default `'dance'`.

- [ ] **Step 1: Write failing tests.**
  - `loadProgress returns a legacy plan with input.mode 'shape'` (store a progress object whose `plan.input` has no `mode`, using the existing idb fake).
  - `listRecords normalizes legacy records` likewise.
  - `loadSettings defaults homeMode to 'dance'`.
  - `generatePlan output for seed 7 is unchanged` → snapshot of `generatePlan({ mode: 'shape', parts: ['腰腹'], minutes: 10, level: 2 }, realCatalog, 7)` taken before the change, items compared field by field.
- [ ] **Step 2:** Run them → FAIL (type errors count as failing).
- [ ] **Step 3: Implement** the types and normalizer; fix all `tsc` errors by narrowing on `input.mode === 'shape'` (store’s `input` becomes `ShapeInput` for now; Task 9 adds the dance input).
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `refactor: make plan input a shape or dance union and normalize stored plans`

### Task 4: Routine generation

**Files:**
- Create: `src/dance/tempo.ts`, `src/dance/pool.ts`, `src/dance/generateRoutine.ts`
- Test: `tests/dance/generateRoutine.test.ts`

**Interfaces:**
- Consumes: Task 3 types; `fitBeats`, `repSeconds`, `repsForSeconds`, `mulberry32`, `shuffle`.
- Produces:
  - `tempo.ts`: `WARMUP_BPM = 100`, `COOLDOWN_BPM = 96`, `ITEM_BEATS = 32`, `COMBO_BEATS = 16`, `blockBpm(level: Level, blockIndex: number): number` (0-based index), `blockBeats(passes: 1 | 2): number` (256 or 192).
  - `pool.ts`: `danceEligible(e: Exercise, input: DanceInput): boolean`; `isFunny(id: string): boolean`; `DANCE_STRETCH_IDS = ['chest-opener-clasp', 'arms-back-chest-stretch', 'standing-side-bend-reach', 'tall-reach-tiptoes', 'standing-forward-fold-soft']` (standing, non-sided stretches; the class never goes to the floor).
  - `generateRoutine(input: DanceInput, catalog: readonly Exercise[], seed: number): Routine`
  - `routineSeconds(routine: Routine, catalog): number` (sum of item seconds as compiled: 32-beat items at their BPM, block beats at block BPM, stretch 30 s each rounded via `repsForSeconds`).

Generation algorithm (decided here; spec §2):
1. `quiet = input.quiet || input.level === 1`. Tier queues: per tier, eligible ids shuffled with `mulberry32(seed)`; refilled (reshuffled) when empty.
2. Initial counts: `warm0 = clamp(round(0.10 × T / 19.2), 3, 6)`, `stretch0 = clamp(round((0.12 × T − 40) / 30), 1, 4)`, cool-down 2 moves. Blocks: add blocks while `used + nextBlockSeconds / 2 ≤ available` (minimum 1), each at its own BPM.
3. Fill each block slot by slot (tiers 2, 2, 3, 1): take the first queue id not in the previous block, not already in this block, not funny when the slot is 3 or the block already has a funny move. If the tier has no eligible ids, use tier−1, then tier+1.
4. Fitting: try every `lastPasses ∈ {2, 1}` × `warm ∈ 3..6` × `stretch ∈ 1..4`; keep the one with the smallest `|total − T|`, ties broken by passes 2, then `|warm − warm0|`, then `|stretch − stretch0|`.

- [ ] **Step 1: Write failing tests** (`realCatalog` loaded from `public/assets/catalog/exercises.json`):
  - Sweep `minutes × level × quiet × seed 1..50`: total within ±30 s of target or the compiled plan reports shortfall (assert via `routineSeconds`); every block has 4 moves with tiers `[2, 2, 3, 1]`; no id appears in two consecutive blocks; ≤ 1 funny per block and none in slot 3; `blocks[i].bpm === min(cap, start + 4i)`.
  - `quiet or 入门 picks only low impact` and `入门 picks only level 1`.
  - `same seed gives the same routine`.
  - `10 minutes 进阶 gives 3 blocks` (spec example) and `30 minutes gives 10 to 12 blocks`.
  - `falls back to a neighbouring tier when a tier is empty` with a tiny fixture catalog lacking tier 3.
- [ ] **Step 2:** `npx vitest run tests/dance` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4:** `npx vitest run tests/dance` → PASS.
- [ ] **Step 5: Commit** `feat: generate dance routines with wave intensity blocks`

### Task 5: Compile routines into plans, and replace moves

**Files:**
- Create: `src/dance/compileRoutine.ts`, `src/dance/editRoutine.ts`
- Test: `tests/dance/compileRoutine.test.ts`, `tests/dance/editRoutine.test.ts`

**Interfaces:**
- Consumes: Tasks 3–4; `toItem`, `computeTotal`, `TOLERANCE_SECONDS`.
- Produces: `compileRoutine(routine: Routine, catalog: readonly Exercise[]): Plan`; `danceCandidates(routine: Routine, ref: MoveRef, catalog): readonly Exercise[]`; `replaceMove(routine: Routine, ref: MoveRef, exerciseId: string): Routine`; `refOfItem(plan: Plan, index: number): MoveRef | null` (null for stretch items).

Compile order: warm-up items (`phase 'warmup'`, tier 1, block 0, segment `warmup`, 100 BPM) → per block: learn items in slot order (`phase 'learn'`, block `index + 1`), then `comboPasses` passes of combo items (`phase 'combo'`, `pass` 1-based) → cool-down items (`phase 'cooldown'`, segment `stretch`, 96 BPM) → stretch items via `toItem(e, 'stretch', input)` with no `dance`. Every item: `restBeforeSeconds 0`, `sided false`, `round 1`, `reps = beats / beatsPerRep`, `workSeconds = reps × repSeconds`. `Plan.rounds = blocks.length`, `Plan.routine = routine`, `totalSeconds = computeTotal(items)`, shortfall as in `generatePlan`.

- [ ] **Step 1: Write failing tests.**
  - `every dance item spans a whole number of 8-counts` (`reps × beatsPerRep % 8 === 0`) and `beatsPerRep ∈ {1,2,4,8}`.
  - `learn and warm-up items are 32 beats, combo items 16`.
  - `all restBeforeSeconds are 0`; `stretch items equal toItem output and have no dance field`.
  - `items order: warmup, then per block 4 learn + passes × 4 combo, then cooldown, then stretch` (check `phase` sequence for a 1-block routine).
  - `buildTimeline gives back-to-back work steps after prepare` (no `rest`/`switch` kinds).
  - `replaceMove swaps the move in learn and both combo passes and keeps the tier`; `danceCandidates offers only same-tier eligible moves not already in that block`; `refOfItem maps a combo item to its block slot`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run tests/dance tests/player` → PASS.
- [ ] **Step 5: Commit** `feat: compile dance routines into timed plans and support move replacement`

### Task 6: Dance groove

**Files:**
- Modify: `src/beat/events.ts`, `src/beat/patterns.ts`, `src/beat/schedule.ts`, `src/audio/synth.ts`
- Test: `tests/beat/beat.test.ts`, `tests/beat/dance.test.ts` (create)

**Interfaces:**
- Produces: `BeatEvent.dance?: { tier: DanceTier; phase: DanceItemInfo['phase']; nextTier: DanceTier | null; blockStart: boolean }` (`nextTier` from the next plan item’s `dance`, `blockStart` on beat 0 of a learn item whose previous item has a different `block`); `SoundId` adds `'clap'`; `Hit.offsetBeats?: 0 | 0.5`; `type GrooveId = StyleId | 'dance'`; `hitsForEvent(e: BeatEvent, groove: GrooveId): Hit[]`. `StyleId` and `STYLE_LABELS` unchanged.
- `scheduleWindow`: groove is `'dance'` when `e.dance` is set, else `styleForSegment(...)`; hit time `e.time + (offsetBeats ?? 0) × beatSeconds(steps[e.stepIndex].bpm)`; with user music, a dance event with `beatsLeftInStep ≤ 4` adds `{ sound: 'tick', gain: 0.6, rate: 1 }` even when `clickWithUserMusic` is off.

Pattern table (beat `b = beatInStep % 8 + 1`): spec §5.3 exactly. Fill: `beatsLeftInStep ≤ 4` adds snare at offset 0 and 0.5 with gain `0.3 + 0.2 × (4 − beatsLeftInStep)` (0.3 → 0.9). Build-up: `nextTier === 3 && beatsLeftInStep ≤ 8` multiplies every hit’s `rate` by `2 ** ((8 − beatsLeftInStep) / 2 / 12)` (up to +4 semitones) and adds hats at offset 0.5. `blockStart` adds `gong` gain 0.6.

- [ ] **Step 1: Write failing tests.**
  - Snapshot test **first, before editing**: `existing styles are unchanged` — record `hitsForEvent` output for all three styles over every event of a fixed shape plan into an inline snapshot, commit nothing yet.
  - `tier 1 plays kick on 1,3,5,7 and clap at 0.5 on 2,4,6,8, no hats`.
  - `tier 2 has kick every beat, off-beat hats (offsetBeats 0.5), bass on odd beats`.
  - `tier 3 adds duang on beat 1 of each 8-count and bass every beat`.
  - `last 4 beats add a rising snare fill`; `build-up raises rate to 2^(4/12) on the final beat before a tier-3 item`; `block start adds a gong`.
  - `scheduleWindow places offset hits half a beat later`; `user music: dance items tick in the last 4 beats only`.
  - `beatEventsInWindow fills nextTier and blockStart`.
- [ ] **Step 2:** Run → new tests FAIL, snapshot PASS.
- [ ] **Step 3: Implement**, plus `clap` in `SOUND_RECIPES`: three band-passed noise bursts (1.5 kHz, Q 1) starting at 0, 0.01, 0.02 s, total 0.2 s.
- [ ] **Step 4:** `npx vitest run tests/beat tests/audio` → PASS (snapshot still matches).
- [ ] **Step 5: Commit** `feat: add a tiered dance groove with fills and build-ups`

### Task 7: Dance phrases and voice generation

**Files:**
- Modify: `src/coach/phrases.ts`, `scripts/gen-voice.ts`
- Generated: `public/assets/voice/*.mp3`, `public/assets/voice/manifest.json`
- Test: `tests/coach/phrases.test.ts`, `tests/coach/manifest.test.ts`

**Interfaces:**
- Produces: `FIXED_PHRASES` adds `c5 五`, `c6 六`, `c7 七`, `c8 八`, `dance-start`, `combo`, `combo-again`, `cooldown` (texts from spec §6.4); `PoolName` adds `block-up`, `peak-jump`, `peak-quiet`, `easy`, `hype` with the spec texts; `nameClipId(id) = 'name-' + id`; `exercisePhrases` adds `name-<id>` (the bare name) for every `pools.includes('dance')` move; `quietSafe(clip: string): boolean` = phrase text does not contain “跳”; `COUNT_CLIPS = ['c5', 'c6', 'c7', 'c8'] as const`.
- `gen-voice.ts`: `SPEECH_RATE: Readonly<Record<string, number>>` = `{ c5: 100, c6: 100, c7: 100, c8: 100 }`, passed as `audio_params.speech_rate` (Doubao range −50..100) when present.

- [ ] **Step 1: Write failing tests.**
  - `phrases.test.ts`: `every dance-pool move has a name clip`; `peak-quiet and hype-1,2,5..8 are quiet safe; peak-jump and hype-3,4 are not`; `clip ids match /^[a-z0-9-]+$/`.
  - `manifest.test.ts` (reads the committed manifest): `count clips are at most 0.40 s`; `manifest covers allPhrases(catalog)` (existing test now also covers the new ids).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** phrases and the speech-rate parameter.
- [ ] **Step 4: Generate voice.** With `DOUBAO_TTS_API_KEY` set in the shell (ask the user if it is not set; never write it to a file), run `npx tsx scripts/gen-voice.ts` (incremental, no `--force`). Expected: only new ids are generated. If any count clip is > 0.40 s, stop and report the measured durations to the user; do not loosen the test.
- [ ] **Step 5:** `npx vitest run tests/coach` → PASS.
- [ ] **Step 6: Commit** `feat: add dance call-out phrases and fast count clips`

### Task 8: Dance cue sheet

**Files:**
- Modify: `src/coach/cues.ts`, `src/ui/useTrainingRun.ts`
- Create: `src/dance/cues.ts`
- Test: `tests/dance/cues.test.ts`, `tests/coach/cues.test.ts`

**Interfaces:**
- `src/coach/cues.ts` exports `stepCandidates(steps, plan, manifest, index): Candidate[]` (the body of today’s per-step `flatMap`, same rand seeding) — `buildCueSheet` output must not change. `Candidate` and `Cue` gain optional `group?: 'count'`; `placeCues` uses gap 0 between two cues that both have `group: 'count'`.
- Produces: `buildDanceCueSheet(steps, plan, catalog, manifest): readonly Cue[]` — steps whose item has `dance` get the spec §6.3 table; every other step (prepare, stretch) uses `stepCandidates`. Cool-down items behave like warm-up items without `hype`. `next-<id>` is used whenever the next item exists and is not a combo item, except after a block’s last combo item. Pools are filtered by `quietSafe` when `plan.input.mode === 'dance' && plan.input.quiet` (or level 1).
- `useTrainingRun`: `plan.input.mode === 'dance' ? buildDanceCueSheet(...) : buildCueSheet(...)`.

- [ ] **Step 1: Write failing tests** (real catalog, fake manifest with 0.3 s counts and 1.2 s phrases, compiled 10-minute 进阶 routine):
  - `buildCueSheet is unchanged for shape plans` (snapshot recorded before the refactor).
  - `no two cues overlap except adjacent count clips`.
  - `every learn and warm-up item ends with c5..c8 on its last four beats` (time equality within 1e-6).
  - `combo items other than a block's last call name-<next id> at E-4B and have no counts`.
  - `the last learn item of a block plays combo, not next-`; `pass 1's last combo item plays combo-again`.
  - `tier-3 learn items open with peak-jump when not quiet and peak-quiet when quiet`.
  - `quiet routines never schedule a clip whose text contains 跳`.
  - `a 0.5 s count clip at 136 BPM is dropped rather than shifted`.
  - `missing clips are skipped`; `same seed gives the same sheet`; `the plan ends with finish`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** (refactor `stepCandidates` first, run the shape snapshot, then add `src/dance/cues.ts`).
- [ ] **Step 4:** `npx vitest run tests/coach tests/dance` → PASS.
- [ ] **Step 5: Commit** `feat: schedule on-beat instructor call-outs for dance routines`

### Task 9: Store and home mode switch

**Files:**
- Modify: `src/ui/store.ts`, `src/ui/pages/Home.tsx`, `src/ui/styles.css`
- Test: `tests/ui/store.test.ts`, `tests/ui/ui.test.tsx`

**Interfaces:**
- Store: `shapeInput: ShapeInput` (was `input`), `danceInput: DanceInput` (default `{ mode: 'dance', minutes: 15, level: 1, quiet: true }`), `setShapeInput(patch)`, `setDanceInput(patch)` (setting `level: 1` forces `quiet: true`), `generate()` uses `settings.homeMode`; dance → `compileRoutine(generateRoutine(danceInput, catalog, seed), catalog)`. `regenerate()` for dance regenerates the routine with `seed + 1`. `replaceDance(ref: MoveRef, exercise: Exercise)` → `compileRoutine(replaceMove(...))`. `remove` is a no-op for dance plans.
- Home: a two-button tab bar `燃脂跳操` / `部位塑形` (`role="tab"`, `aria-selected`) bound to `updateSettings({ homeMode })`; dance panel: `练多久` (10/15/20/30 分钟), `难度`, a checkbox `安静模式（不跳）` with hint `适合办公室和楼下有邻居`, disabled and checked at 入门; the existing 生成方案 button.

- [ ] **Step 1: Write failing tests.**
  - store: `generate in dance mode yields a plan with routine and dance items`; `setDanceInput({ level: 1 }) forces quiet`; `replaceDance updates every item of that move`; `regenerate keeps dance mode`.
  - ui: `home shows the dance panel by default and switches to 部位塑形`; `quiet switch is checked and disabled at 入门`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run tests/ui && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat: add the 燃脂跳操 tab and dance inputs to the home page`

### Task 10: Dance preview, training and done screens

**Files:**
- Modify: `src/ui/pages/Preview.tsx`, `src/ui/pages/Training.tsx`, `src/ui/pages/Done.tsx`, `src/ui/format.ts`, `src/ui/styles.css`
- Create: `src/ui/components/DancePreview.tsx`, `src/ui/components/DanceStatus.tsx`
- Test: `tests/ui/ui.test.tsx`, `tests/player/session.test.ts`

**Interfaces:**
- `format.ts`: `TIER_LABELS = { warmup: '热身', 1: '缓一缓', 2: '加强', 3: '高潮' }`, `modeTitle(plan: Plan): string` → `燃脂跳操 · 15 分钟` / `部位塑形 · 10 分钟`.
- `DancePreview({ plan, catalog })`: sections `热身`, `第 N 段 · {bpm} BPM` (moves with tier badge, block duration from items with `dance.block === N`), `放松` (cool-down + stretch). Tapping 替换 on a warm-up, block or cool-down move lists `danceCandidates`; no 删除 button. Preview renders `DancePreview` when `plan.routine` exists, else today’s list.
- `DanceStatus({ state, plan, byId })`: move name; phase label `学动作` or `连起来！第 {pass} 遍` (warm-up `热身`, cool-down `放松`); 8 dots, the lit one is `floor(stepElapsed / beatSeconds(bpm)) % 8` (`data-testid="beat-dots"`); a `下一个` card with thumbnail and name when `stepRemaining ≤ 8 × beatSeconds(bpm)` and a next item exists; `第 {block} / {rounds} 段` during blocks. Training uses it when `item.dance` is set, else `StatusPanel`; the style selector is hidden for dance plans.
- Done: heading shows `modeTitle(record.plan)`.

- [ ] **Step 1: Write failing tests.**
  - ui: `dance preview groups 热身, 第 1 段 · 118 BPM and 放松 and has no 删除`; `replace in a block updates the list`; `dance status lights the beat dot for the current beat`; `next card appears in the last 8 beats only`; `done page shows 燃脂跳操 · 10 分钟`.
  - session: `skip during a combo item starts the next item at its first beat` — compiled routine, `session.startAt(t inside item 10, [])`, `skip()`, `stateAt(steps, session.time()).step.itemIndex === 11` and `stepElapsed < 1e-6`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Browser check.** `preview_start` the dev server, run a 10-minute 进阶 dance class at `?speed=60`; confirm dots advance on the beat, the next card shows, the voice/beat play without console errors; screenshot.
- [ ] **Step 6: Commit** `feat: show dance blocks in preview and 8-count dots during training`

### Task 11: End-to-end test and device checklist

**Files:**
- Modify: `e2e/workout.spec.ts`, `docs/device-test-checklist.md`

- [ ] **Step 1: Add the e2e test** `dance class: select, preview, train`: go to `/?speed=60`, accept the disclaimer, click tab `燃脂跳操`, `10 分钟`, `进阶`, `生成方案`; expect `热身`, `第 1 段` and `放松` visible; `开始训练`; expect `getByTestId('beat-dots')` and, within 30 s, text `下一个`. Update `runWorkout` to click `部位塑形` first so the existing tests still exercise the shape flow.
- [ ] **Step 2:** `npm run build:e2e && npm run e2e` → all PASS.
- [ ] **Step 3: Device checklist** — add a 燃脂跳操 section with the four checks from spec §9 (counts on the beat at 136 BPM, audible fill and build-up, change exactly on the next 8-count’s first beat, no clipping on phone speakers).
- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run validate:catalog` → PASS.
- [ ] **Step 5: Commit** `test: cover the dance class end to end and add device checks`
