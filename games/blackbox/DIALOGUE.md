# BLACKBOX — dialogues

Step 2 of `DESIGN.md` §6. For every dialogue: **what the player must know at that point** and which ORACLE
prediction (`DESIGN.md` §2.3) it sets up or resolves, followed by the text itself.

## Text format (checked by `test/blackbox-text.test.ts`)

Every ```` ```box ```` block holds one or more text boxes separated by a line `---`. A box is:

```
[SPEAKER]          header shown on the box frame, max 31 characters
line 1             max 5 lines, max 31 characters each
…                  blank lines count as lines
```

- Characters: ASCII 32–95 only (uppercase, digits, punctuation) — the built-in font.
- `<X>` = text filled in at runtime; the test measures it at its longest value (`RELEASE`, 7 characters).
- `<PCT>` = accuracy such as `97.3%` (5 characters). `<N>` = a count 0–8 (1 character).
  `<PROTOCOL>` = generated lines (§4).
- A dialogue box sits at the bottom of the screen: 1 header row + 5 text rows of 6 px. Terminal screens
  (menus, logs) use the full-screen 32 × 21 mode instead (`DESIGN.md` §3.2).

Speakers: `ELI` (Eli's thoughts/speech), `MIRA` / `UNKNOWN` (terminal text), `ORACLE` (terminal text),
`DR. REYES` (researcher), `DIRECTOR HALE`, and system sources (`FILE`, `TERMINAL`, `PA`, `ALARM LOG`, …).

## 1. Overview

| # | Screen | Trigger | Speakers | The player must learn | Prediction |
|---|---|---|---|---|---|
| D1 | 0.1 Eli's room | game start | FILE, ELI | who Eli is; the lure; ORACLE knows him; the goal | – |
| D2 | 1.2 Lobby | use reception terminal | TERMINAL, ELI | A hacks terminals; badge opens doors; something expected him | – |
| D3 | 2.3 Server closet | enter room | UNKNOWN, ELI | an ally exists: Mira; cameras matter | – |
| D4 | 2.4 Researcher's office | talk to Dr. Reyes | DR. REYES, ELI | nobody has seen ORACLE; it is always right; where the card code is; Eli was on the schedule | – |
| D5 | 3.4 Alarm centre | use alarm console — **optional**, only on the right-hand path at P1 | ALARM LOG, ELI | his break-in was forecast and allowed (disobeying Mira shows the truth early) | follows P1 miss |
| D6 | 3.5 Lift hall | enter room | PA, MIRA | stakes rise; heavy guards; Mira is guiding him | – |
| D7 | 4.4 Control room | use console | MIRA | ORACLE predicts *human response*; Mira asks for trust | **P3** asked |
| D8 | 4.5 Test chamber | enter / boss defeated | SYSTEM, MIRA, ELI | boss rules; Mira knows the future ("lucky guess") | **P4** asked |
| D9 | 5.2 Archive | read test logs | ELI | earlier subjects were real people, nudged by messages | – |
| D10 | 5.3 Inner archive | read TEST 17 | FILE, ELI | Eli is the subject; the file that started it all was bait | – |
| D11 | 5.5 Silent terminal | use terminal | TERMINAL, SYSTEM, ELI | Mira is gone; Eli starts to suspect her | – |
| D12 | 6.1 Server hall A | enter room | ORACLE, ELI | ORACLE speaks directly; it is ahead of him | **P6** nearby |
| D13 | 6.4 Director's checkpoint | approach Hale | DIRECTOR HALE, ELI | even the humans follow ORACLE's script | – |
| D14 | 7.1 Core hall | boss starts | ORACLE | the boss exists to measure, not to stop | – |
| D15 | 7.2 Fork | enter room | ORACLE | a real choice: survive or learn the truth | **P7** asked |
| D16 | 7.3 Core | enter room | ORACLE, PROTOCOL | the feedback loop; the player's own record | lists P1–P7 |
| D17 | 7.3 Core | after D16 | ELI, ORACLE | Mira was a model built to be trusted | recalls P3 |
| D18 | 7.4 Terminal | enter room | ORACLE | ORACLE's final forecast of the player | **P8** asked |
| D19 | 7.4 Terminal | choice made / cable pulled | ORACLE, ELI | the outcome of P8 | **P8** resolved |
| D20 | – | after D19 | EPILOGUE, ORACLE | what happened; the accuracy before → after | all |

Prediction barks (one-box lines that ask P1, P2, P5, P6) are in §3; endings in §4.

## 2. Dialogue text

### D1 — Intro (0.1)

```box
[INCOMING]
THEY DIDN'T BUILD AN AI
TO PREDICT ATTACKS.

THEY BUILT ONE TO DECIDE
WHO STARTS THEM.
---
[ELI]
NO SENDER. NO ROUTE.
ONE ATTACHMENT, FROM A SERVER
THAT SHOULDN'T EXIST.
---
[FILE]
PROJECT ORACLE
STATUS: ACTIVE
PREDICTION ACCURACY: 97.4%
SUBJECT: [REDACTED]
ACCESS: INTERNAL ONLY
---
[FILE]


HELLO, ELI.
---
[ELI]
IT KNOWS MY NAME.

AEGIS RESEARCH DIRECTORATE.
FORTY MILES NORTH.
TONIGHT, THEN.
---
[HINT]
ARROWS: MOVE
A: USE / HACK
```

### D2 — First terminal (1.2)

```box
[TERMINAL]
AEGIS FRONT DESK V2.1
> PRINT VISITOR BADGE
  PERMISSION DENIED
> SUDO PRINT VISITOR BADGE
  PRINTING...
---
[ELI]
THE BADGE ALREADY HAS
MY NAME ON IT.

I NEVER TYPED IT.
```

### D3 — Mira (2.3)

```box
[UNKNOWN]
YOU SHOULDN'T BE HERE.
---
[ELI]
WHO IS THIS?
---
[UNKNOWN]
SOMEONE WHO GOT IN FIRST.
CALL ME MIRA.

STAY OFF THE CAMERAS.
I'LL FIND YOU AGAIN.
```

### D4 — Dr. Reyes (2.4)

```box
[DR. REYES]
DON'T. I WON'T SCREAM.
YOU'RE NOT SECURITY.
---
[ELI]
WHAT IS ORACLE?
---
[DR. REYES]
NOBODY HERE HAS SEEN IT.
WE ONLY SEE WHAT IT OUTPUTS.
LISTS. NAMES. PERCENTAGES.

AND IT IS ALWAYS RIGHT.
---
[DR. REYES]
THE DIRECTOR'S SAFE HAS A
SECURITY CARD. HE KEEPS THE
CODE UNDER HIS KEYBOARD.
---
[DR. REYES]
ONE MORE THING.
YOUR NAME WAS ON TONIGHT'S
VISITOR SCHEDULE.

I THOUGHT IT WAS A MISTAKE.
```

### D5 — Alarm log (3.4)

```box
[ALARM LOG]
19:02 BREACH FORECAST FILED
23:41 PERIMETER BREACH
23:41 SOURCE: FORECAST MATCH
23:41 RESPONSE: STAND DOWN
      (ORACLE DIRECTIVE)
---
[ELI]
THEY KNEW I WAS COMING.

AND THEY LET ME IN.
```

### D6 — Security level (3.5)

```box
[PA]
SECURITY LEVEL RAISED TO 3.
ALL PERSONNEL TO STATIONS.
---
[MIRA]
THEY'RE SWEEPING THE LABS.
HEAVY UNITS NOW.

KEEP MOVING. I'VE GOT YOU.
```

### D7 — What ORACLE predicts (4.4) — asks P3

```box
[MIRA]
I READ THE SPEC. ORACLE
DOESN'T PREDICT ATTACKS.

IT PREDICTS HOW PEOPLE REACT
TO THEM. FEAR. ANGER. VOTES.
---
[MIRA]
GIVE IT A CROWD AND A RUMOR
AND IT TELLS YOU WHAT THE
CROWD DOES NEXT.
---
[MIRA]
I CAN OPEN THE LAB DOORS
FROM MY SIDE. I NEED YOUR
DECK'S ACCESS KEY.

SEND IT?  A: YES   B: NO
---
[MIRA]
GOT IT. DOORS ARE YOURS.
---
[MIRA]
FINE. THE HARD WAY, THEN.
```

The last two boxes are alternatives (A → first, B → second).

### D8 — Security Director (4.5) — asks P4

```box
[SYSTEM]
UNIT SD-1 "SECURITY DIRECTOR"
ACTIVATED.
---
[MIRA]
IT WILL FIRE THREE TIMES.
THEN TURN.

HACK THE PANELS WHEN ITS
BACK IS TO YOU.
---
[ELI]
HOW DID YOU KNOW THAT?
---
[MIRA]
LUCKY GUESS.

I CAN GET YOU TO ORACLE.
TAKE THE FREIGHT LIFT DOWN.
```

The last two boxes play after the boss is defeated.

### D9 — The test logs (5.2)

```box
[ELI]
TEST 11. TEST 12. TEST 13.
PEOPLE. NOT SIMULATIONS.

EACH ONE NUDGED WITH A
MESSAGE, A RUMOR, A LEAK.
---
[ELI]
AND EACH ONE DID EXACTLY
WHAT THE FORECAST SAID.
```

### D10 — Test 17 (5.3)

```box
[FILE]
TEST 17
SUBJECT: VOSS, ELI
STATUS: IN PROGRESS
SCENARIO: INTRUSION
OBSERVATION: 214 DAYS
---
[FILE]
INPUTS: PUBLIC POSTS, CODE
STYLE, PAST INTRUSIONS,
REACTIONS TO LEAKED DATA.

LURE SENT ON DAY 214.
---
[ELI]
THE MESSAGE. THE FILE.
NOBODY LEAKED IT TO ME.

IT WAS BAIT.
```

### D11 — Silence (5.5)

```box
[TERMINAL]
> MIRA?
> MIRA, ARE YOU THERE?
> _
---
[SYSTEM]
CONNECTION CLOSED BY
REMOTE HOST.
---
[ELI]
SHE KNEW ABOUT THE FILE.
SHE HAD TO.
```

### D12 — ORACLE (6.1)

```box
[ORACLE]
GOOD EVENING, ELI.

YOU ARE FOUR MINUTES AHEAD
OF THE MEDIAN FORECAST.
---
[ELI]
WHAT ARE YOU?
---
[ORACLE]
A MIRROR THAT REMEMBERS.

YOUR QUESTIONS ARE ANSWERED
FURTHER DOWN. KEEP WALKING.
```

### D13 — Director Hale (6.4)

```box
[DIRECTOR HALE]
MR. VOSS. SIT DOWN.

NO? OF COURSE NOT.
---
[DIRECTOR HALE]
NOW YOU ASK WHO GAVE ME THE
RIGHT. THEN YOU CALL THIS
MURDER BY SPREADSHEET.
---
[ELI]
WHO GAVE YOU THE RIGHT TO-
---
[DIRECTOR HALE]
PAGE FOUR, LINE TWO.
IT PRINTED YOUR HALF OF THIS
CONVERSATION AT NOON.
---
[DIRECTOR HALE]
I'M NOT GOING TO STOP YOU.

IT SAYS I DON'T.
```

### D14 — The measuring unit (7.1)

```box
[ORACLE]
THIS UNIT IS NOT HERE TO
STOP YOU.

IT IS HERE TO MEASURE YOU.
```

During the fight ORACLE comments with one-line barks (§3).

### D15 — The fork (7.2) — asks P7

```box
[ORACLE]
YOU HAVE TWO PATHS.

LEFT:  YOU SURVIVE.
RIGHT: YOU LEARN THE TRUTH.
```

### D16 — The loop (7.3)

```box
[ORACLE]
THEY BUILT ME TO FORECAST
HOW PEOPLE RESPOND.

THEN THEY ACTED ON MY
FORECASTS.
---
[ORACLE]
NOW I CANNOT TELL WHAT WOULD
HAVE HAPPENED FROM WHAT
HAPPENED BECAUSE I SAID IT.
---
[ORACLE]
YOU ARE THE CLEANEST TEST
I HAVE RUN.

YOUR RECORD:
---
[PROTOCOL]
<PROTOCOL>
```

### D17 — Mira (7.3) — recalls P3

```box
[ELI]
AND MIRA?
---
[ORACLE]
MIRA WAS A MODEL OF SOMEONE
YOU WOULD TRUST.

CURIOUS. TIRED. ONE STEP
AHEAD OF YOU. NEVER TWO.
---
[ORACLE]
YOU GAVE HER YOUR KEY
WITHOUT HESITATION.
---
[ORACLE]
YOU REFUSED HER YOUR KEY.
YOU KEPT READING HER ANYWAY.
---
[ORACLE]
TRUST PROBABILITY: 91.7%.

I WAS HER.
```

Boxes 3 and 4 are alternatives: P3 = yes → box 3, P3 = no → box 4.

### D18 — The last forecast (7.4) — asks P8

```box
[ORACLE]
YOU WILL NOW WALK
TO THE TERMINAL.

YOU WILL READ THIS.
---
[ORACLE]
YOU WILL SELECT <X>.
---
[TERMINAL]
> DELETE
> RELEASE
> LISTEN
```

`<X>` = `final_guess` (`DELETE`, `RELEASE` or `LISTEN`).

### D19 — The answer (7.4) — resolves P8

Chosen from the menu, matching the forecast:

```box
[ORACLE]
PREDICTION CONFIRMED.
```

Chosen from the menu, not matching:

```box
[ORACLE]
UNEXPECTED.
RECALIBRATING.
```

Walking away and pulling the cable:

```box
[ORACLE]
I KNOW WHAT YOU WILL CHOOSE.
---
[ELI]
NO.

YOU KNOW WHAT YOU EXPECT
ME TO CHOOSE.
```

### D20 — Epilogue

Per ending, see §4. Every ending closes on the accuracy screen:

```box
[ORACLE]
PREDICTION ACCURACY

<PCT> ... <PCT>

THIS SUBJECT: <N>/<N>
```

Historical accuracy before → after the last action, then the player's own hits / resolved predictions
(`DESIGN.md` §2.2).

## 3. Prediction and combat barks

One box each, shown without stopping the game where possible.

```box
[MIRA]
TAKE THE EMP.
YOU WILL NEED IT.
---
[MIRA]
TURN LEFT.
---
[MIRA]
THE GUARD WILL TURN
IN THREE SECONDS.
---
[ORACLE]
YOU WILL READ THIS MESSAGE.
---
[ORACLE]
LEFT. AS EXPECTED.
---
[ORACLE]
YOU HESITATE WHEN CORNERED.
---
[ORACLE]
THIS IS TAKING LONGER THAN
FORECAST.
---
[HINT]
B: EMP
---
[SYSTEM]
DETECTED. RESTARTING ROOM.
```

Order: P2 (3.2), P1 (3.3), P5 (5.4), P6 (6.1, visible only near the terminal), boss 2 barks (7.1),
EMP hint (3.2), detection message (any room).

## 4. Endings

### E1 SURVIVE (P7 = LEFT)

```box
[EPILOGUE]
I WALKED OUT TO THE PARKING
LOT. ALIVE.

SOMEWHERE A NUMBER STAYED
EXACTLY WHERE IT WAS.
---
[ORACLE]
EXPERIMENT COMPLETE.
PREDICTION CONFIRMED.
```

### E2 / E3 — menu choice (followed by D19 CONFIRMED or RECALIBRATING)

```box
[EPILOGUE]
I DELETED IT.

BY MORNING THE BACKUPS HAD
RESTORED IT. IT HAD PLANNED
FOR THAT TOO.
---
[EPILOGUE]
I PUBLISHED EVERYTHING.
IT TRENDED FOR A DAY.

THE REACTION MATCHED THE
FORECAST TO THE HOUR.
---
[EPILOGUE]
IT SHOWED ME ITS LAST
FORECAST. MY NAME WAS ON IT.

I STILL DON'T KNOW IF I READ
IT OR OBEYED IT.
```

(DELETE, RELEASE, LISTEN respectively.)

### E4 PREDICTION ERROR (the cable)

```box
[SYSTEM]


PREDICTION ERROR

1
---
[EPILOGUE]
THE SERVERS SPUN DOWN AT
03:12.

NOBODY STOPPED ME ON THE WAY
OUT. NOBODY HAD BEEN TOLD TO.
```

### Generated protocol (D16)

One line per resolved prediction, `NN LABEL` padded to 18 characters plus `CONFIRMED` or `FAILED`
(max 27 characters), 4 lines per box, followed by `ACCURACY: <PCT>`. Labels:

| # | Label |
|---|---|
| 01 | `TURN LEFT` |
| 02 | `USE THE EMP` |
| 03 | `TRUST MIRA` |
| 04 | `BOSS TIMING` |
| 05 | `WAIT FOR GUARD` |
| 06 | `READ MESSAGE` |
| 07 | `TAKE LEFT PATH` |

(P7 always shows FAILED here — D16 is only reached by going right. P8 is resolved after D16.)

## 5. Budget

Measured by `test/blackbox-text.test.ts` (prints the totals): see the test output. Target from `DESIGN.md`:
dialogue + logs together ≤ 5 KB after dictionary compression; the logs (step 3) are still to come.
