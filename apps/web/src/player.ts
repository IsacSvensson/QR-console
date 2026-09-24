import type { Cartridge } from '@qrc/cartridge';
import { BUTTONS, SCREEN, VM, toRgba } from '@qrc/vm';
import type { AudioBackend } from './audio';

// Runs a cartridge at a fixed 60 Hz on top of requestAnimationFrame. The canvas is only a backend:
// it shows vm.fb, the VM never touches the DOM.

const STEP_MS = 1000 / 60;
const KEYS: Record<string, number> = {
  ArrowLeft: BUTTONS.LEFT,
  ArrowRight: BUTTONS.RIGHT,
  ArrowUp: BUTTONS.UP,
  ArrowDown: BUTTONS.DOWN,
  KeyZ: BUTTONS.A,
  Space: BUTTONS.A,
  Enter: BUTTONS.A,
  KeyX: BUTTONS.B,
  ShiftLeft: BUTTONS.B,
};

export interface PlayOptions {
  seed: number;
  /** Stop after this many frames (test hook: freeze on a known frame). */
  maxFrames?: number;
}

export class Player {
  vm: VM | null = null;
  private keys = 0;
  private touch = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private maxFrames = Infinity;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audio: AudioBackend,
    touchRoot: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(SCREEN, SCREEN);
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => (this.keys = 0));
    for (const b of touchRoot.querySelectorAll<HTMLButtonElement>('[data-btn]')) {
      const bit = Number(b.dataset.btn);
      const down = (e: PointerEvent) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        this.touch |= bit;
        b.classList.add('down-active');
        this.audio.resume();
      };
      const up = () => {
        this.touch &= ~bit;
        b.classList.remove('down-active');
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  private key(e: KeyboardEvent, down: boolean) {
    const bit = KEYS[e.code];
    if (bit === undefined || !this.vm) return;
    e.preventDefault();
    this.keys = down ? this.keys | bit : this.keys & ~bit;
    if (down) this.audio.resume();
  }

  start(cart: Cartridge, opts: PlayOptions) {
    this.stop();
    this.vm = VM.fromCartridge(cart, { seed: opts.seed });
    this.maxFrames = opts.maxFrames ?? Infinity;
    this.keys = 0;
    this.touch = 0;
    this.acc = 0;
    this.last = performance.now();
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.vm = null;
  }

  get frame(): number {
    return this.vm?.frame ?? 0;
  }

  private tick = (now: number) => {
    const vm = this.vm;
    if (!vm) return;
    this.acc = Math.min(this.acc + (now - this.last), STEP_MS * 5); // never spiral after a stall
    this.last = now;
    let stepped = false;
    while (this.acc >= STEP_MS && vm.frame < this.maxFrames) {
      this.acc -= STEP_MS;
      this.audio.play(vm.step(this.keys | this.touch));
      stepped = true;
    }
    if (stepped) this.render();
    if (vm.frame < this.maxFrames) this.raf = requestAnimationFrame(this.tick);
  };

  private render() {
    if (!this.vm) return;
    toRgba(this.vm.fb, this.image.data as unknown as Uint8Array<ArrayBuffer>);
    this.ctx.putImageData(this.image, 0, 0);
  }
}
