# BLACKBOX — logs

Step 3 of `DESIGN.md` §6. Logs carry what the dialogues cannot: history, the people behind ORACLE, and the
evidence for the twist. They are read on the full-screen terminal (`DESIGN.md` §3.2).

## Format (checked by `test/blackbox-text.test.ts`)

Every ```` ```log ```` block is one log, pages separated by a line `---`. A page is **at most 19 lines of at
most 32 characters** (the terminal is 21 × 32; the engine draws row 1 as a header — terminal name and, after
screen 6.1, the live ORACLE figure — and row 21 as `A: NEXT   B: EXIT`). Same character set as the dialogues.
Placeholders: `<PCT>` (5 characters), `<FOLLOWS>` (longest value 22 characters, see L10).

## Overview

| # | Screen | Title | Required? | What it adds | Profile |
|---|---|---|---|---|---|
| L1 | 2.2 Copy room | MEMO: SCOPE OF ORACLE | yes | ORACLE predicts *response*, not attacks | – |
| L2 | 2.4 Researcher's office | PERSONAL NOTES, DR. REYES | optional | a human doubting from inside; she was told to stay late | curiosity +1 |
| L3 | 3.1 Surveillance room | CAMERA 14 INDEX | yes | the cameras logged Eli *before* he arrived | – |
| L4 | 4.2 Observation room | TEST 14 | yes | subjects can sense the steering; that is a problem for them | – |
| L5 | 4.3 Prototype hall | FOUNDING BRIEF | optional | why Aegis built ORACLE and how its purpose drifted | curiosity +1 |
| L6 | 5.2 Archive | TEST INDEX 11–16 | yes (sets up D9) | real people, the nudge used, the outcome | – |
| L7 | 5.4 Cooling room | INCIDENT: FORECAST CONTAMINATION | optional | the feedback loop, found by an engineer | curiosity +1 |
| L8 | 6.3 Cooling corridor | PERSONALITY MODEL: MIRA | optional | how Mira was built; 91.7 % | curiosity +1 |
| L9 | 6.4 Director's checkpoint | PRINTOUT, 12:00 | optional (after D13) | Hale's script — Eli's lines, printed at noon | curiosity +1 |
| L10 | 7.3 Core | ORACLE: SESSION LOG, TEST 17 | yes | the system's own notes on Eli, reflecting the player's actual record | – |

Required logs sit on the critical path (a door or lift opens after reading). Optional logs each raise
`logs_read` (curiosity) by one, which feeds ORACLE's final forecast P8 (`DESIGN.md` §2.3).
Reading L2, L5, L7, L8 and L9 is therefore also how a player "teaches" ORACLE that they are curious.

## Logs

### L1 — Memo: scope of ORACLE (2.2, required)

```log
AEGIS RESEARCH DIRECTORATE
INTERNAL MEMO  -  DO NOT COPY

TO:   ALL PROGRAM STAFF
FROM: DIRECTOR HALE
RE:   SCOPE OF ORACLE

EFFECTIVE TODAY, STOP DESCRIBING
ORACLE AS AN ATTACK PREDICTOR IN
ANY DOCUMENT, BRIEF OR EMAIL.

ORACLE ISN'T DESIGNED TO PREDICT
TERRORIST ATTACKS.

IT PREDICTS HUMAN RESPONSE.
---
THE OLD DESCRIPTION IS TOO SMALL
AND, FRANKLY, TOO REASSURING.

CONFLICT BEGINS WHEN PEOPLE
BELIEVE CONFLICT IS INEVITABLE.
ORACLE TELLS US WHEN THEY WILL
START BELIEVING IT.

WHAT WE DO WITH THAT IS NOT A
QUESTION FOR THIS MEMO.

SHRED AFTER READING.
```

### L2 — Personal notes, Dr. Reyes (2.4, optional)

```log
NOTES - N. REYES - NOT FOR SYNC

MON
THIRD LIST THIS MONTH. NAMES,
CITIES, A PERCENTAGE NEXT TO
EACH. NOBODY SAYS WHAT HAPPENS
TO THE NAMES AFTERWARDS.

WED
ASKED HALE WHO READS THE LISTS.
HE SAID "THE LISTS READ US."
I THINK HE MEANT IT AS A JOKE.

FRI
SCHEDULE SAYS I WORK LATE
TONIGHT. I DIDN'T ASK TO.
THE REQUEST CAME FROM ORACLE
SCHEDULING, NOT A PERSON.
```

### L3 — Camera 14 index (3.1, required)

```log
CAMERA 14 - EAST STAIR
EVENT INDEX

23:38:02  MOTION  NONE
23:39:40  MOTION  NONE
23:41:17  MOTION  PERSON, 1
          TAGGED: VOSS, E.
          TAG SOURCE: ORACLE
          TAG CREATED: 19:02:55

NOTE: TAG PREDATES FIRST
      SIGHTING BY 4H 38M.

SECURITY RESPONSE: NONE
          (STAND DOWN, ORACLE)
```

### L4 — Test 14 (4.2, required)

```log
TEST 14 - OBSERVATION SUMMARY

SCENARIO: FINANCIAL RUMOR
DURATION: 61 DAYS
NUDGES:   9 (MESSAGES, 2 LEAKS)

SUBJECT DEMONSTRATED AWARENESS
OF PREDICTIVE INTERVENTION.

SUBJECT WAS NOT INFORMED OF
ORACLE.
---
DAY 44: SUBJECT WROTE, "IT FEELS
LIKE SOMEONE IS FINISHING MY
SENTENCES."

DAY 45: SUBJECT STOPPED USING
ALL DEVICES. FORECAST ACCURACY
FOR SUBJECT FELL TO 61.0%.

RECOMMENDATION: FUTURE NUDGES
MUST ARRIVE THROUGH A SOURCE
THE SUBJECT ALREADY TRUSTS.

STATUS: CLOSED.
```

### L5 — Founding brief (4.3, optional)

```log
ORACLE - FOUNDING BRIEF (REV 1)

PURPOSE: GIVE DECISION MAKERS
72 HOURS OF WARNING BEFORE
CIVIL UNREST.

METHOD: MODEL HOW POPULATIONS
RESPOND TO EVENTS, RUMORS AND
ANNOUNCEMENTS.

SAFEGUARD: ORACLE OBSERVES.
IT DOES NOT ACT.
---
ORACLE - FOUNDING BRIEF (REV 6)

PURPOSE: GIVE DECISION MAKERS
72 HOURS OF WARNING BEFORE
CIVIL UNREST, AND OPTIONS TO
SHAPE IT.

METHOD: UNCHANGED.

SAFEGUARD: REMOVED IN REV 4.
SEE ANNEX C (RESTRICTED).
```

### L6 — Test index 11–16 (5.2, required)

```log
PREDICTIVE INTERVENTION TESTS

NO  SCENARIO        OUTCOME
11  PROTEST SIZE    MATCHED
12  PANIC BUYING    MATCHED
13  ELECTION RUMOR  MATCHED
14  FINANCIAL RUMOR ABORTED
15  WORKPLACE LEAK  MATCHED
16  ONLINE FEUD     MATCHED
17  INTRUSION       IN PROGRESS

ALL SUBJECTS ARE LIVE PERSONS.
NO SUBJECT HAS BEEN INFORMED.

NUDGES ARE DELIVERED AS ORDINARY
MESSAGES, POSTS OR LEAKED FILES.
```

### L7 — Incident: forecast contamination (5.4, optional)

```log
INCIDENT REPORT 0091
FILED BY: SYSTEMS ENGINEERING
SEVERITY: STRUCTURAL

SINCE REV 4, ORACLE FORECASTS
ARE ACTED ON BEFORE THEY CAN BE
CHECKED. ACTIONS CHANGE THE
OUTCOMES THE FORECASTS DESCRIBE.

RESULT: WE CAN NO LONGER TELL A
CORRECT FORECAST FROM A FORECAST
THAT MADE ITSELF TRUE.
---
ORACLE HAS NOTICED THE SAME.
ITS OWN CONFIDENCE VALUES NOW
CARRY A NEW FIELD:
  SELF-INFLUENCE: UNKNOWN

PROPOSAL: ONE TEST IN WHICH THE
SUBJECT KNOWS HE IS PREDICTED
AND IS SHOWN THE PREDICTIONS.

STATUS: APPROVED AS TEST 17.
```

### L8 — Personality model: Mira (6.3, optional)

```log
PERSONALITY MODEL: MIRA
TARGET: VOSS, E. (TEST 17)

BUILT FROM: SUBJECT'S CLOSEST
ONLINE CONTACTS (6), FORUM
MENTORS (2), SUBJECT'S OWN
WRITING STYLE.

TRAITS: CURIOUS. TIRED. DRY.
ALWAYS ONE STEP AHEAD OF THE
SUBJECT. NEVER TWO.

TRUST PROBABILITY: 91.7%
---
RULES:
- NEVER EXPLAIN HOW SHE KNOWS.
- ADMIT SMALL MISTAKES.
- LEAVE BEFORE THE SUBJECT
  ASKS WHO SHE IS.

CHANNEL: ANY TERMINAL THE
SUBJECT TOUCHES.

OPERATOR: ORACLE.
```

### L9 — Printout, 12:00 (6.4, optional, after D13)

```log
ORACLE - CONVERSATION FORECAST
PRINTED 12:00   FOR: HALE

P.4
 1  HALE:  SIT DOWN.
 2  VOSS:  (DOES NOT SIT.)
 3  HALE:  NAME HIS QUESTION.
 4  VOSS:  "WHO GAVE YOU THE
           RIGHT TO..."
 5  HALE:  DO NOT STOP HIM.

CONFIDENCE: 99.1%

HANDWRITTEN IN THE MARGIN:
"WHAT IF I DO STOP HIM?"
"-> IT SAYS I WON'T."
```

### L10 — ORACLE: session log, Test 17 (7.3, required)

```log
ORACLE - SESSION LOG - TEST 17

19:02  LURE DELIVERED.
23:41  SUBJECT ON SITE.
       MIRA CHANNEL OPEN.
02:10  SUBJECT LEARNS HE IS
       THE TEST. EXPECTED.
02:24  MIRA CHANNEL CLOSED.

STATUS:
<FOLLOWS>

CURRENT ACCURACY: <PCT>
```

`<FOLLOWS>` is chosen from the player's record: `SUBJECT FOLLOWS MODEL.` when there have been no misses so
far, otherwise `SUBJECT DEVIATES.` — so the log can quietly acknowledge that the player has already
surprised the system.

## Budget

Measured together with the dialogues by `test/blackbox-text.test.ts` (see its `[blackbox text]` line).
