import './style.css';
import { CartridgeError, parseCartridge, toHex } from '@qrc/cartridge';
import { VMError } from '@qrc/vm';
import { AudioBackend } from './audio';
import { deleteCartridge, getCartridge, listCartridges, saveCartridge } from './db';
import { Player } from './player';
import { Scanner, type ScanProgress } from './scanner/scanner';

// URL parameters (all optional): ?seed=N fixes the RNG seed; ?maxFrames=N freezes the player after N
// frames; ?test exposes window.__qrc hooks for the Playwright tests.
const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : null;
const maxFrames = params.has('maxFrames') ? Number(params.get('maxFrames')) : undefined;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = { library: $('screen-library'), scan: $('screen-scan'), play: $('screen-play') };
type Screen = keyof typeof screens;

const audio = new AudioBackend();
const player = new Player($<HTMLCanvasElement>('play-canvas'), audio, $('screen-play'));
const scanner = new Scanner($<HTMLVideoElement>('scan-video'), showProgress, onScanComplete);
let scannedId: string | null = null;

function show(name: Screen) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  if (name !== 'scan') scanner.stop();
  if (name !== 'play') player.stop();
  document.body.dataset.screen = name;
}

// ---- library --------------------------------------------------------------------------------
async function renderLibrary() {
  const list = $('library-list');
  const items = await listCartridges();
  list.replaceChildren(
    ...items.map((c) => {
      const li = document.createElement('li');
      li.dataset.id = c.id;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = c.title;
      const info = document.createElement('span');
      info.className = 'hint';
      info.textContent = `${c.size} bytes · ${c.id.slice(0, 12)}`;
      meta.append(title, info);
      const play = document.createElement('button');
      play.className = 'primary';
      play.textContent = 'Play';
      play.onclick = () => playStored(c.id);
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.onclick = async () => {
        if (!confirm(`Delete ${c.title}?`)) return;
        await deleteCartridge(c.id);
        await renderLibrary();
      };
      li.append(meta, play, del);
      return li;
    }),
  );
  $('library-empty').hidden = items.length > 0;
}

/** Verify (magic, versions, sizes, body hash, ISA) and store. Returns the cartridge id. */
async function importCartridge(bytes: Uint8Array): Promise<string> {
  const cart = await parseCartridge(bytes);
  const id = toHex(cart.id);
  await saveCartridge({ id, title: cart.header.title || 'UNTITLED', bytes, size: bytes.length, addedAt: Date.now() });
  return id;
}

async function playBytes(bytes: Uint8Array, title: string) {
  const cart = await parseCartridge(bytes);
  show('play');
  $('play-title').textContent = title;
  audio.resume();
  player.start(cart, { seed: fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!, maxFrames });
}

async function playStored(id: string) {
  const c = await getCartridge(id);
  if (!c) return;
  try {
    await playBytes(c.bytes, c.title);
  } catch (e) {
    alert(describe(e));
    show('library');
  }
}

function describe(e: unknown): string {
  if (e instanceof CartridgeError) return `Invalid cartridge: ${e.message}`;
  if (e instanceof VMError) return `Cannot run cartridge: ${e.message}`;
  return String(e);
}

// ---- scanning -------------------------------------------------------------------------------
async function startScan() {
  show('scan');
  scannedId = null;
  $('scan-play').hidden = true;
  $<HTMLProgressElement>('scan-progress').value = 0;
  $('scan-status').textContent = 'Starting camera…';
  $('scan-detail').textContent = '';
  try {
    await scanner.start();
    $('scan-status').textContent = 'Point the camera at the animated QR code.';
  } catch (e) {
    $('scan-status').textContent = `Camera unavailable: ${(e as Error).message}`;
  }
}

function showProgress(p: ScanProgress) {
  const bar = $<HTMLProgressElement>('scan-progress');
  if (!p.id) {
    bar.value = 0;
    $('scan-detail').textContent = `${p.frames} frames looked at, ${p.decoded} QR codes read`;
    return;
  }
  // received packets vs. blocks needed; never shows 100 % before the verified result
  bar.value = Math.min(0.99, Math.max(p.received, p.recovered) / p.needed);
  $('scan-status').textContent = `Receiving cartridge ${p.id} — ${p.received} / ${p.needed} packets`;
  $('scan-detail').textContent =
    `${p.recovered}/${p.needed} blocks solved · ${p.frames} frames · ${p.decoded} codes read · ${p.rejected} rejected` +
    (p.otherCartridge ? ` · ${p.otherCartridge} from another cartridge ignored` : '') +
    ` · ${p.decodeMs.toFixed(0)} ms/decode`;
}

async function onScanComplete(bytes: Uint8Array) {
  const bar = $<HTMLProgressElement>('scan-progress');
  try {
    const id = await importCartridge(bytes);
    const cart = await getCartridge(id);
    bar.value = 1;
    scannedId = id;
    $('scan-status').textContent = `Received and verified: ${cart!.title} (${bytes.length} bytes)`;
    $('scan-play').hidden = false;
    await renderLibrary();
  } catch (e) {
    $('scan-status').textContent = `${describe(e)} — scan again.`;
  }
}

// ---- wiring -----------------------------------------------------------------------------------
$('nav-library').onclick = async () => {
  show('library');
  await renderLibrary();
};
$('nav-scan').onclick = () => void startScan();
$('scan-cancel').onclick = () => {
  scanner.stop();
  $('scan-status').textContent = 'Stopped.';
};
$('scan-play').onclick = () => scannedId && void playStored(scannedId);
$<HTMLInputElement>('file-input').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    await importCartridge(new Uint8Array(await f.arrayBuffer()));
    await renderLibrary();
  } catch (err) {
    alert(describe(err));
  }
};

show('library');
const ready = renderLibrary();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js');
}

// ---- test hooks (only with ?test) ----------------------------------------------------------
if (params.has('test')) {
  Object.assign(window, {
    __qrc: {
      ready,
      /** Load cartridge bytes straight into the player (bypasses scanning). */
      play: (bytes: number[]) => playBytes(new Uint8Array(bytes), 'test'),
      frame: () => player.frame,
      buttons: () => player.buttons,
      /** Canvas pixels as RGBA, read back from the rendered canvas (not from the VM). */
      canvasRgba: () => Array.from($<HTMLCanvasElement>('play-canvas').getContext('2d')!.getImageData(0, 0, 128, 128).data),
      screen: () => document.body.dataset.screen,
      swReady: async () => {
        const reg = await navigator.serviceWorker.ready;
        return !!reg.active && !!navigator.serviceWorker.controller;
      },
    },
  });
}
