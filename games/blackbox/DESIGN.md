# BLACKBOX — designdokument

Status: **design klar, ingen implementation.** Implementeras enligt PLAN.md Part 2 (M12–M18); detta dokument,
`LAYOUT.md`, `DIALOGUE.md` och `LOGS.md` är specifikationen och testernas facit.

Allt spelinnehåll är eget. Spelets text är **engelska versaler** (fonten: ASCII 32–95). Två textlägen:
dialogruta **5 rader × 31 tecken** för tal, helskärmsterminal **32 × 21 tecken** för menyer och loggar (§3.2).

---

## 1. Låsta designbeslut

1. **Eli är aldrig en actionhjälte.** Han observerar, hackar, manipulerar och undviker. A = interagera/hacka,
   B = EMP (bedövar maskiner några sekunder, 3 laddningar, laddstationer). EMP:n är ett verktyg, inte ett vapen.
   Vakter kan inte besegras; upptäckt = rummet börjar om. Bossar besegras via miljön (terminaler).
2. **Mira är en ren textfigur.** Hon finns bara i terminaler och "tar över" samma terminal-UI som resten av
   spelet använder (§3.2). Ingen sprite.
3. **Spelarens beteende är ORACLE:s data.** Spelet gör faktiska prediktioner om spelaren och mäter dem (§2).
   Samma motor bär story och mekanik.
4. **LEFT/RIGHT är ett narrativt test.** LEFT är inte "fel": det är det val ORACLE förväntar sig, och därför kan
   systemet avsluta experimentet (tidigt slut).
5. **Det riktiga slutet är att bryta interaktionen.** DELETE / RELEASE / LISTEN är val inom modellen.
   Att lämna terminalen och dra ur kabeln är input som modellen aldrig fått som alternativ.
6. **Träffsäkerheten räknas från det faktiska spelet.** Den börjar på 97.4 % och justeras av spelarens
   handlingar; två spelare kan få olika slutsiffror.
7. **Omfång:** 37 skärmar, ~20 dialoger, ~10 loggar. Ingen öppen värld, inget inventory utöver en handfull
   nyckelföremål, ingen crafting, ingen XP, inga dialogträd.
8. **Sparning = access codes** (lösenord på 8 tecken vid avsnittsslut). Koden bär även ORACLE:s data om spelaren
   (§2.4) — "din kod innehåller ditt beteende".
9. **Organisation:** AEGIS RESEARCH DIRECTORATE (helt fiktiv; ingen verklig myndighet nämns).

---

## 2. ORACLE-motorn

### 2.1 Tillstånd (RAM, ~12 byte)

```
pred_count     antal avgjorda prediktioner (0..8)
pred_misses    antal missar
pred_done      bitmask: prediktion i är avgjord
pred_hit       bitmask: prediktion i slog in
emp_uses       profil: aggressivitet   (mättas vid 7)
logs_read      profil: nyfikenhet      (mättas vid 7)
mira_followed  profil: följsamhet      (mättas vid 7)
final_guess    ORACLE:s förutsagda slutval (DELETE | RELEASE | LISTEN)
```

### 2.2 Träffsäkerhet

Designformel: ORACLE har ett fiktivt förflutet på 1000 prediktioner varav 974 rätt.

```
accuracy = (974 + correct) / (1000 + count)          visas med en decimal, avrundat nedåt
```

VM:en räknar med 16 bitar, så formeln implementeras i sin exakt ekvivalenta form (verifierat för alla
count ≤ 21, missar ≤ count; spelet har 8):

```
accuracy_tenths = 974 - pred_misses                  →  "97.4%", "97.3%", …
```

Varje miss kostar alltså precis 0.1 procentenhet. Alla rätt ger 97.4 % (oförändrat — modellen håller).
97.4 % är ORACLE:s **historiska** siffra över alla testpersoner (samma som i filen i D1); Elis missar syns som
små sänkningar av den.

Bredvid visas spelarens **egen** andel, rätt/avgjorda i detta spel, som två `NUM`-anrop:

```
ORACLE
PREDICTION ACCURACY   97.3%
THIS SUBJECT          7/8
```

Slutskärmen visar den historiska siffran **före och efter sista handlingen**, t.ex. `97.3% … 97.2%`, följt av
THIS SUBJECT. Från skärm 6.1 (efter twisten) visar HUD-raden och terminalernas rubrik den historiska siffran live.

### 2.3 De åtta prediktionerna

Tonen skärps gradvis: först uppenbara instruktioner, sedan förutsägelser om timing, till sist om själva läsandet.
"Synlig" = spelaren ser formuleringen när den ställs; "dold" = avslöjas först i ORACLE:s genomgång (D16).

| # | Skärm | Röst | Formulering i spelet | Vad mäts | Rätt om | Profil |
|---|---|---|---|---|---|---|
| P1 | 3.3 Korsning | Mira | `TURN LEFT.` | vilken utgång spelaren tar först | vänster | följsamhet +1 om rätt |
| P2 | 3.2 → 4.1 | Mira | `YOU WILL NEED THE EMP.` | EMP används i 4.1 innan rummet lämnas | EMP använd | aggressivitet +1 per EMP (hela spelet) |
| P3 | 4.4 Kontrollrum | Mira | `SEND ME YOUR ACCESS KEY.` (A = ja, B = nej) | spelaren ger Mira åtkomst | ja (dold prediktion: SUBJECT WILL TRUST MIRA) | följsamhet +1 om ja |
| P4 | 4.5 Boss 1 | Mira | `IT WILL FIRE THREE TIMES.` / `THEN TURN.` | första hacket sker i bossens första vändfönster | första fönstret | – |
| P5 | 5.4 Kylrum | Mira | `THE GUARD WILL TURN` / `IN THREE SECONDS.` (och vakten vänder exakt 3 s senare — ORACLE styr den) | spelaren tar sig förbi utan att bli upptäckt efter varningen | ingen upptäckt | följsamhet +1 om rätt |
| P6 | 6.1 Serverhall A | ORACLE | `YOU WILL READ THIS MESSAGE.` (syns bara nära terminalen) | spelaren aktiverar terminalen | aktiverar | nyfikenhet +1 |
| P7 | 7.2 Förgrening | ORACLE | `LEFT: YOU SURVIVE.` / `RIGHT: YOU LEARN THE TRUTH.` | vald väg | LEFT (→ tidigt slut) | – |
| P8 | 7.4 Terminalen | ORACLE | `YOU WILL SELECT <X>.` | slutvalet | menyvalet = X | – |

Nyfikenhet ökar också med +1 per frivillig logg som läses. Profilräknarna mättas vid 7.

**P8 härleds från spelarens egen profil** (det är det som gör ORACLE trovärdigt):

```
final_guess = störst av { emp_uses → DELETE, logs_read → RELEASE, mira_followed → LISTEN }
              lika: LISTEN före RELEASE före DELETE
```

Utfall vid terminalen:

| Spelaren | Resultat |
|---|---|
| väljer `final_guess` | rätt — `PREDICTION CONFIRMED.` |
| väljer ett annat menyval | miss — `UNEXPECTED. RECALIBRATING.` (fortfarande inom modellen) |
| går ifrån terminalen och drar ur kabeln | miss — `PREDICTION ERROR` (det sanna slutet) |

ORACLE:s sista meddelande innan valet (skärm 7.4):

```
YOU WILL NOW WALK
TO THE TERMINAL.

YOU WILL READ THIS.

YOU WILL SELECT <X>.
```

### 2.4 Access codes

8 tecken ur ett alfabet på 32 tecken = 40 bitar:
avsnitt (3) + pred_done (8) + pred_hit (8) + emp_uses (3) + logs_read (3) + mira_followed (3) + EMP-laddningar (2)
+ kontrollsumma (10). Föremål följer av avsnittet. ORACLE glömmer alltså inte spelaren mellan sessionerna.

### 2.5 Sluten

| Slut | Villkor | Innehåll |
|---|---|---|
| E1 SURVIVE | P7 = LEFT | Eli går ut. `EXPERIMENT COMPLETE.` `PREDICTION CONFIRMED.` Siffran visas. |
| E2 CONFIRMED | menyval = final_guess | Kort epilog för valet (DELETE / RELEASE / LISTEN) + `PREDICTION CONFIRMED.` |
| E3 RECALIBRATING | annat menyval | Samma epilog för valet + `UNEXPECTED. RECALIBRATING.` |
| E4 PREDICTION ERROR | kabeln | Eli: `NO. YOU KNOW WHAT YOU` / `EXPECT ME TO CHOOSE.` → svart → `PREDICTION ERROR 1` → `ORACLE / PREDICTION ACCURACY` före → efter |

I D16 läser ORACLE upp spelarens egen protokollista, genererad från `pred_done`/`pred_hit`:
`PREDICTION 01 ... CONFIRMED`, `PREDICTION 03 ... FAILED`, osv.

---

## 3. Rum, skärm och terminaler

### 3.1 Rumsformat

- **Ett rum = en skärm**, som i klassiska äventyrsspel uppifrån: **16 × 15 tiles** (128 × 120 px). Översta
  pixelraderna (8 px) är **HUD**: ORACLE-siffran (från 6.1), EMP-laddningar, avsnitt.
- **I ROM** lagras rum kompakt: 8 × 8 byggblock (metatiles) om 2 × 2 tiles = **64 byte per rum**, plus en
  gemensam blocktabell (4 byte per block). Nedre halvraden av sista blockraden används inte (15 tile-rader).
- **I RAM** packas det aktuella rummet upp vid rumsbyte till en buffert `room[16 × 15]` (240 byte, 1 byte per
  tile). Allt läser den bufferten:
  - `SYS MAP` ritar hela rummet i ett anrop direkt från RAM,
  - kollision: `room[(y >> 3) * 16 + (x >> 3)]`,
  - siktlinje för vakter och kameror: stega cell för cell tills en vägg-tile,
  - öppnade dörrar, avstängda kameror m.m. skrivs in i bufferten (och i rumsflaggor i RAM så att de består).
- **Tile-klasser** via tile-nummer: `0` tom, `1–31` golv/dekor (gångbart), `32–63` vägg (blockerar rörelse och
  sikt), `64–95` interaktivt (terminal, dörr, laddstation, kabel), `96+` animerade. En jämförelse avgör klassen.
- **Objekt** i rummet (vakter, drönare, kameror, terminaler med skript) listas per rum i ROM: typ, cell,
  riktning, parameter — några byte styck.

### 3.2 Två textlägen

| Läge | Storlek | Används för |
|---|---|---|
| Dialogruta | nederst, 1 rubrikrad + 5 × 31 tecken | tal: ELI, MIRA, ORACLE, NPC:er, barks |
| Helskärmsterminal | 32 × 21 tecken | terminalmenyer, loggar, filer, ORACLE:s protokoll, Miras övertaganden |

Terminalmenyer byggs av samma få kommandon överallt (`> SECURITY`, `> ACCESS`, `> CAMERA`, `> ORACLE`, …).
Mira dyker upp genom att ta över en terminal mitt i en meny: texten avbryts och hennes rader skrivs ut
tecken för tecken. Samma mekanism används senare av ORACLE — spelaren ser att rösterna delar kanal.

### 3.3 Återanvändning

Rummen byggs av **ett tileset per zon** (kontor, säkerhet, labb, bunker, server, kärna) plus gemensamma
tiles (dörrar, terminaler, kameror). Inom en zon återanvänds rumstyper, så att anläggningen känns som en
verklig byggnad snarare än 37 handgjorda banor.

## 4. Struktur (37 skärmar)

`D` = dialog, `L` = logg, `P` = prediktion, 🔒 = lås, 💾 = access code.

| Avsnitt | Skärmar | Innehåll |
|---|---|---|
| 0 INTRO | 0.1 Elis rum | D1 intro: PROJECT ORACLE-fragmentet, sist `HELLO, ELI.` |
| 1 ENTRÉ | 1.1 grind · 1.2 lobby · 1.3 säkerhetskontroll · 1.4 korridor | Smygtutorial. D2 första terminalen → VISITOR BADGE. 🔒 badge-dörr. 💾 |
| 2 ADMINISTRATION | 2.1 kontor · 2.2 kopiering · 2.3 serverskrubb · 2.4 forskarens kontor · 2.5 städförråd · 2.6 chefskontor | L "ORACLE ISN'T DESIGNED…". D3 Mira: `YOU SHOULDN'T BE HERE.` D4 forskare. Ventilationsgenväg. SECURITY CARD. 💾 |
| 3 SECURITY | 3.1 övervakning · 3.3 korsning (nav) · 3.2 vapenförråd (vänster) · 3.4 larmcentral (höger) · 3.5 hisshall | L3 kameraindex. **P1** i korsningen: vänster = vapenförrådet med EMP (**P2** ställs) och terminalen som öppnar spärren mot hissen; höger = larmcentralen med kamera och drönare och den frivilliga D5 (sanningen tidigt för den som inte lyder), men vägen vidare går ändå via vapenförrådet. D6 säkerhetsnivå höjs, HEAVY GUARD. 💾 |
| 4 LABORATORIUM | 4.1 labbkorridor · 4.2 observation · 4.3 prototyphall · 4.4 kontrollrum · 4.5 testkammare · 4.6 godshiss | **P2** avgörs. L TEST 14. D7 Mira: mänsklig respons + **P3**. **Boss 1** SECURITY DIRECTOR, D8 + **P4**. LAB CARD. 💾 |
| 5 UNDERGROUND | 5.1 bunkertrappa · 5.2 arkiv · 5.3 arkivets innersta · 5.4 kylrum · 5.5 tyst terminal · 5.6 slussport | HUNTER. D9 experimentloggar. D10 Eli som SUBJECT. **P5**. D11 Mira tystnar. PROTOTYPE. 💾 |
| 6 SERVER COMPLEX | 6.1 serverhall A · 6.2 serverhall B · 6.3 kylkorridor · 6.4 direktörens kontrollpunkt · 6.5 kärnans sluss | D12 ORACLE talar + **P6**, live-siffran börjar synas. ORACLE AGENT. L PERSONALITY MODEL: MIRA (frivillig). D13 forskningschefen. 💾 |
| 7 ORACLE CORE | 7.1 kärnhall · 7.2 förgrening · 7.3 kärnan · 7.4 terminalen och kabeln | **Boss 2** (ORACLE-styrd enhet), D14. **P7** (D15). D16 förklaring + protokollista, D17 sanningen om Mira. **P8**: D18 valet, D19, D20 epilog. |

Fiender: GUARD (1), SECURITY DRONE (3), HEAVY GUARD (3), HUNTER (5), PROTOTYPE (5), ORACLE AGENT (6: går mot
spelarens förväntade position). Sprites: Eli, forskare, forskningschef, 6 fiender, 2 bossar.

---

## 5. Budget (uppskattning, ROM 32 KB)

| Del | KB |
|---|---:|
| 37 rum (8×8 byggblock à 2×2 tiles, 64 B/rum) + blocktabell + objektlistor | ~3 |
| Text: 20 dialoger + 10 loggar, **uppmätt** 1 382 ord / 8,4 KB rått → ~7 KB med enkel ordbok (se nedan) | ~6–7 |
| Grafik: ~60 tiles + sprites | ~6 |
| Musik: 8 slingor (en per avsnitt 1–6, larm/boss, ORACLE; se D-023) + ljudeffekter | ~1.5 |
| Kod: motor, smygande, skripttolk, ORACLE-motor, musik, access codes | 12–15 |
| **Summa** | **~29–33** ⚠ |


⚠ **Texten är den största budgetrisken.** Uppmätt (`test/blackbox-text.test.ts` + ordboksmätning):
en ordbok på 128 ord sparar bara ~18 % (8,6 → 7,0 KB). Alternativ, att avgöra när kodstorleken är känd:
(a) 6-bitarstecken — fontens 64 tecken ryms exakt i 6 bitar — plus ordbok: ~6 KB, kostar ~300 B kod;
(b) korta de frivilliga loggarna (L2, L5, L7) ~30 %; (c) snålare grafik; (d) ROM-bankning (ISA-ändring).
Rekommendation: (a) + vid behov (b); ingen ISA-ändring.

RAM (separat 32 KB): rumsbuffert 240 B, rumsflaggor ~40 B, objekt ~100 B, ORACLE-tillstånd ~12 B —
långt under 1 KB.

---

## 6. Nästa steg (i denna ordning)

1. ~~ORACLE:s prediktioner~~ (§2, detta dokument)
2. ~~De ~20 dialogerna~~ (`DIALOGUE.md`: 20 dialoger + barks + slut, 80 textrutor, 769 ord, ~4.3 KB okomprimerat; formatet kontrolleras av `test/blackbox-text.test.ts`)
3. ~~De ~10 loggarna~~ (`LOGS.md`: 10 loggar, 15 sidor, 610 ord; 5 frivilliga ger nyfikenhet till P8)
4. ~~Layout skärm för skärm~~ (`LAYOUT.md`: 37 rum i motorns rumsformat; `test/blackbox-layout.test.ts` kontrollerar rutnät, dörrar åt båda håll, nåbarhet i varje rum, att alla D/L/P är placerade och att spelet går att klara även om spelaren nekar Mira)
5. Implementation: PLAN.md M12–M18 (Part 2)
