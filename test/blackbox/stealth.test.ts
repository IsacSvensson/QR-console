import { beforeAll, describe, expect, it } from 'vitest';
import { buildBlackbox, runReplay, sees, type FrameView } from './oracle';

// M14 acceptance: stealth. PLAN.md Part 2.
let bb: Awaited<ReturnType<typeof buildBlackbox>>;
beforeAll(async () => {
  bb = await buildBlackbox();
});

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from './oracle';

const REPLAYS = readdirSync(join(GAME_DIR, 'replays')).filter((f) => /^m\d+-[\w-]+\.json$/.test(f) && !f.endsWith('.frames.json')).map((f) => f.replace('.json', ''));

/**
 * Reference judgement of a frame in which the actors ran: does any watcher see the player's centre cell, or
 * does any dangerous actor touch the player's collision box? Uses only RAM positions and the LAYOUT grid.
 */
function referenceDetects(v: FrameView): string | null {
  const T = (n: string) => v.S(`O_${n}`);
  const range: Record<number, number> = { [T('GUARD')]: v.S('GUARD_RANGE'), [T('DRONE')]: v.S('DRONE_RANGE'), [T('HEAVY')]: v.S('HEAVY_RANGE'), [T('CAMERA')]: v.S('CAM_RANGE') };
  const pcell: [number, number] = [(v.px + 4) >> 3, (v.py + 4) >> 3];
  const box = { x: v.px + v.S('PBOX_X'), y: v.py + v.S('PBOX_Y'), w: v.S('PBOX_W'), h: v.S('PBOX_H') };
  const touches = (a: { x: number; y: number }) => box.x < a.x + 7 && a.x + 1 < box.x + box.w && box.y < a.y + 7 && a.y + 1 < box.y + box.h;
  for (const [i, a] of v.actors.entries()) {
    if (a.stun > 0 || a.type === 0) continue;
    if (range[a.type] && sees(v.room, a, range[a.type]!, pcell, v.flag)) return `actor ${i} (type ${a.type}) sees the player`;
    const dangerous = [T('GUARD'), T('DRONE'), T('HEAVY'), T('AGENT')].includes(a.type) || (a.type === T('HUNTER') && a.state === 1);
    if (dangerous && touches(a)) return `actor ${i} touches the player`;
    if (a.type === T('PROTO') && a.mode === 1 && Math.abs(v.px - a.x) < 16 && Math.abs(v.py - a.y) < 16) return `prototype ${i} grabs the player`;
  }
  return null;
}

describe('stealth (M14)', () => {
  for (const name of REPLAYS) {
    it(`${name}: hashes match; every detection is confirmed by the reference line of sight, and no frame has sight without one`, () => {
      const problems: string[] = [];
      let prevDet = 0;
      let detections = 0;
      const r = runReplay(bb, name, (v) => {
        const det = v.vm.read16(v.S('det_count'));
        const newDet = det !== prevDet;
        prevDet = det;
        if (newDet) detections++;
        if (v.vm.read16(v.S('act_ran')) !== 1) {
          if (newDet) problems.push(`frame ${v.f + 1}: detection without the actors running`);
          return;
        }
        const ref = referenceDetects(v);
        if (newDet && !ref) problems.push(`frame ${v.f + 1} (${v.room.id}): engine detected the player, reference sees nothing`);
        if (!newDet && ref && v.vm.read16(v.S('caught_t')) === 0) problems.push(`frame ${v.f + 1} (${v.room.id}): ${ref}, but no detection`);
      });
      expect(r.hashMismatch, 'first frame whose hash differs').toBe(-1);
      expect(r.rf.frames).toBe(r.expectedFrames);
      expect(problems.slice(0, 8)).toEqual([]);
      expect(r.vm.fault).toBeNull();
      expect(r.vm.overruns).toBe(0);
      console.log(`[budget] ${name}: ${r.rf.frames} frames, ${detections} detection(s), max ${r.maxCycles} cycles per frame`);
      expect(r.maxCycles).toBeLessThanOrEqual(25_000);
    });
  }

  it('m13-walk sneaks through the gate (1.1), the checkpoint (1.3) and the corridor (1.4) undetected', () => {
    const seen = new Set<string>();
    const r = runReplay(bb, 'm13-walk', (v) => seen.add(v.room.id));
    for (const id of ['1.1', '1.3', '1.4']) expect(seen.has(id), id).toBe(true);
    expect(r.vm.read16(bb.sym.get('det_count')!)).toBe(0);
  });

  it('m14-caught: one detection in 1.3; the room restarts with the player at the entrance and the guards reset', () => {
    let firstEntry: { actors: string; px: number; py: number } | null = null;
    let restartChecked = false;
    let prevCaught = 0;
    const problems: string[] = [];
    runReplay(bb, 'm14-caught', (v) => {
      if (v.room.id !== '1.3') return;
      const snapshot = JSON.stringify(v.actors.map((a) => [a.type, a.x, a.y, a.dir, a.stun, a.state]));
      if (!firstEntry) firstEntry = { actors: snapshot, px: v.px, py: v.py };
      const caught = v.vm.read16(v.S('caught_t'));
      if (prevCaught === 1 && caught === 0) {
        // the frame of the restart
        restartChecked = true;
        if (v.px !== firstEntry.px || v.py !== firstEntry.py) problems.push(`player at ${v.px},${v.py}, entered at ${firstEntry.px},${firstEntry.py}`);
        if (snapshot !== firstEntry.actors) problems.push('actors not reset to their spawn state');
      }
      prevCaught = caught;
    });
    expect(firstEntry).not.toBeNull();
    expect(restartChecked).toBe(true);
    expect(problems).toEqual([]);
  });

  it('m14-labs: EMP stuns the machines in reach for exactly EMP_STUN frames (frozen meanwhile); charges and recharge', () => {
    const charges: number[] = [];
    const problems: string[] = [];
    let prevCharges = -1;
    let stunTracked = 0;
    let prevActors: FrameView['actors'] = [];
    let prevRoom = '';
    const S = (n: string) => bb.sym.get(n)!;
    runReplay(bb, 'm14-labs', (v) => {
      const c = v.vm.read16(S('charges'));
      if (c !== prevCharges) charges.push(c);
      const emp = prevCharges >= 0 && c === prevCharges - 1;
      prevCharges = c;
      if (emp) {
        const inReach = v.actors.filter((a) => [S('O_DRONE'), S('O_HUNTER'), S('O_PROTO'), S('O_AGENT'), S('O_CAMERA')].includes(a.type) && Math.abs(a.x - v.px) <= S('EMP_R') && Math.abs(a.y - v.py) <= S('EMP_R'));
        if (inReach.length === 0) problems.push(`frame ${v.f + 1}: EMP with no machine in reach`);
        for (const a of inReach) if (a.stun !== S('EMP_STUN') - 1) problems.push(`frame ${v.f + 1}: machine in reach has stun ${a.stun}`);
      }
      if (v.room.id === prevRoom && !emp) {  // (a new pulse restarts the count: checked above)
        v.actors.forEach((a, i) => {
          const p = prevActors[i];
          if (!p || p.stun === 0 || v.vm.read16(S('act_ran')) !== 1) return;
          stunTracked++;
          if (a.stun !== p.stun - 1) problems.push(`frame ${v.f + 1}: actor ${i} stun ${p.stun} -> ${a.stun}`);
          if (a.x !== p.x || a.y !== p.y) problems.push(`frame ${v.f + 1}: stunned actor ${i} moved`);
        });
      }
      prevActors = v.actors;
      prevRoom = v.room.id;
    });
    expect(problems.slice(0, 8)).toEqual([]);
    expect(stunTracked).toBeGreaterThan(200);
    // none -> spare charge (1) -> EMP found (+3 = 4) -> two pulses (3, 2) -> recharge (3)
    expect(charges).toEqual([0, 1, 4, 3, 2, 3]);
  });
});
