// The FPS spike's recorded runs (M26). Each drives the bot from the start; record.ts writes replays/<name>.json.
import { BTN, type Bot } from './bot';

export interface Route {
  seed: number;
  run: (bot: Bot) => void;
}

export const ROUTES: Record<string, Route> = {
  // turn round twice in the first room, then once with strafing: every wall angle, the pillars, the door
  spin: {
    seed: 1,
    run(bot) {
      bot.step(0, 30);
      bot.step(BTN.RIGHT, 256);
      bot.walkTo(4.5, 5.6);
      bot.step(BTN.LEFT, 128);
      bot.step(BTN.B | BTN.RIGHT, 40);
      bot.step(BTN.B | BTN.LEFT, 40);
      bot.step(0, 30);
    },
  },
  // to the east door, open it, watch it slide, go through, shoot the enemy, back out; the door closes behind
  door_fight: {
    seed: 1,
    run(bot) {
      bot.step(0, 10);
      bot.walkTo(5.5, 4.5);
      bot.walkTo(6.4, 4.5, 0.08);
      bot.face(7.5, 4.5);
      bot.openDoor(7, 4);
      bot.walkTo(8.5, 4.5);
      bot.face(11.5, 2.5);
      bot.fireUntilDead();
      bot.step(0, 40);
      bot.walkTo(10.5, 3.0);
      bot.walkTo(8.6, 4.5, 0.08);
      bot.face(7.5, 4.5);
      bot.openDoor(7, 4);
      bot.walkTo(5.5, 4.5);
      bot.face(7.5, 4.5);
      bot.step(0, 240);
    },
  },
  // through the south door into the hall and around the tech pillars; the enemy is woken and follows
  hall: {
    seed: 1,
    run(bot) {
      bot.walkTo(4.5, 6.5);
      bot.walkTo(4.5, 7.4, 0.08);
      bot.face(4.5, 8.5);
      bot.openDoor(4, 8);
      bot.walkTo(4.5, 9.5);
      bot.walkTo(7.5, 11.5);
      bot.walkTo(13.5, 11.5);
      bot.walkTo(13.5, 14.5);
      bot.walkTo(1.6, 14.5);
      bot.walkTo(1.6, 9.5);
      bot.face(14.5, 9.5);
      bot.step(BTN.UP, 60);
    },
  },
  // into the enemy's room without shooting: it walks up and hits; the player takes damage
  hurt: {
    seed: 1,
    run(bot) {
      bot.walkTo(6.4, 4.5, 0.08);
      bot.face(7.5, 4.5);
      bot.openDoor(7, 4);
      bot.walkTo(9.0, 4.5);
      bot.face(11.5, 2.5);
      for (let guard = 0; guard < 600 && bot.r('health') > 80; guard++) bot.step(0);
      if (bot.r('health') > 80) throw new Error('the enemy never hit');
      bot.step(0, 30);
    },
  },
};
