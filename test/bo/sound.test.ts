import { beforeAll, describe, expect, it } from 'vitest';
import type { AudioCommand } from '@qrc/vm';
import { type Bo, LEVEL_IDS, buildBo, readRefLevel, runReplay, symbol } from './oracle';

// M25 acceptance: all music tracks and sound effects (DESIGN §15): every world has its own track, every track is
// heard in the replays, sound effects interrupt the music and it resumes.
let bo: Bo;
const S = (n: string) => symbol(bo.sym, n);

beforeAll(async () => {
  bo = await buildBo();
});

function tracksHeard(name: string) {
  const seen = new Set<number>();
  runReplay(bo, name, (v) => seen.add(v.vm.read16(S('music_track'))));
  return seen;
}

describe('music and sound effects (M25, DESIGN §15)', () => {
  it('every world has its own track (its regular levels), the bosses one of their own', () => {
    const byWorld = new Map<number, Set<number>>();
    for (const id of LEVEL_IDS.filter((x) => /^\d-\d$/.test(x))) {
      const L = readRefLevel(id);
      const boss = ['1-5', '2-5', '3-5', '5-5'].includes(id);
      if (boss) {
        expect(L.music, `${id}: the boss track`).toBe(S('MUS_BOSS'));
        continue;
      }
      byWorld.set(L.world, new Set([...(byWorld.get(L.world) ?? []), L.music]));
    }
    const tracks = [1, 2, 3, 4, 5].map((w) => [...byWorld.get(w)!]);
    for (const t of tracks) expect(t.length).toBe(1);
    expect(new Set(tracks.flat()).size, 'five different world tracks').toBe(5);
  });

  it('every track is heard in the replays', () => {
    const heard = new Set<number>();
    for (const name of ['m24-game', 'm20-gameover']) for (const t of tracksHeard(name)) heard.add(t);
    const all = ['MUS_HEMMA', 'MUS_SKOGEN', 'MUS_STADEN', 'MUS_SNO', 'MUS_GODIS', 'MUS_TITLE', 'MUS_BOSS', 'MUS_FANFARE', 'MUS_OVER', 'MUS_END'];
    for (const t of all) expect(heard.has(S(t)), `${t} heard`).toBe(true);
  });

  it('a sound effect takes a music channel for its length, and the music goes on afterwards', () => {
    const audio: AudioCommand[][] = [];
    runReplay(bo, 'm22-world1', (v) => audio.push(v.audio));
    const vol = S('MUSIC_VOL');
    const music = (k: number) => (audio[k] ?? []).some((a) => a.channel === 1 && a.volume === vol && a.freq > 0);
    const effect = (k: number) => (audio[k] ?? []).find((a) => a.channel === 1 && a.volume !== vol);
    let checked = 0;
    for (let f = 120; f < audio.length - 300; f++) {
      const fx = effect(f);
      if (!fx) continue;
      const span = (n: number, from: number) => Array.from({ length: n }, (_, i) => from + i);
      if (span(fx.duration, f + 1).some((k) => effect(k))) continue; // another effect follows at once
      if (!span(120, f - 120).some(music)) continue; // no music on that channel just before
      expect(span(fx.duration - 2, f + 1).some(music), `frame ${f + 1}: no music on the effect's channel during it`).toBe(false);
      expect(span(240, f + fx.duration).some(music), `frame ${f + 1}: the music resumes`).toBe(true);
      checked++;
    }
    console.log(`[measured] ${checked} effects interrupted the bass and it resumed`);
    expect(checked).toBeGreaterThan(5);
  });
});
