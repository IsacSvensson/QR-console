# BLACKBOX — designdokument

Status: **storydesign pågår, ingen implementation.** Spelet ligger utanför PLAN.md:s nuvarande milstolpar;
innan kod skrivs behöver PLAN.md få nya milstolpar (verktyg → motor → innehåll → tester).

Allt spelinnehåll är eget. Spelets text är **engelska versaler** (fonten: ASCII 32–95), dialogrutor
**5 rader × 31 tecken**.

---

## 1. Låsta designbeslut

1. **Eli är aldrig en actionhjälte.** Han observerar, hackar, manipulerar och undviker. A = interagera/hacka,
   B = EMP (bedövar maskiner några sekunder, 3 laddningar, laddstationer). EMP:n är ett verktyg, inte ett vapen.
   Vakter kan inte besegras; upptäckt = rummet börjar om. Bossar besegras via miljön (terminaler).
2. **Mira är en ren textfigur.** Hon finns bara i terminaler. Ingen sprite.
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
Slutskärmen visar värdet **före och efter sista handlingen**, t.ex. `97.3% … 97.2%`.
Från skärm 6.1 (efter twisten) visar terminalernas rubrikrad den aktuella siffran live.

### 2.3 De åtta prediktionerna

Tonen skärps gradvis: först uppenbara instruktioner, sedan förutsägelser om timing, till sist om själva läsandet.
"Synlig" = spelaren ser formuleringen när den ställs; "dold" = avslöjas först i ORACLE:s genomgång (D16).

| # | Skärm | Röst | Formulering i spelet | Vad mäts | Rätt om | Profil |
|---|---|---|---|---|---|---|
| P1 | 3.3 Korsning | Mira | `TURN LEFT.` | vilken utgång spelaren tar först | vänster | följsamhet +1 om rätt |
| P2 | 3.2 → 4.1 | Mira | `YOU WILL NEED THE EMP.` | EMP används i 4.1 innan rummet lämnas | EMP använd | aggressivitet +1 per EMP (hela spelet) |
| P3 | 4.4 Kontrollrum | Mira | `SEND ME YOUR ACCESS KEY.` (A = ja, B = nej) | spelaren ger Mira åtkomst | ja (dold prediktion: SUBJECT WILL TRUST MIRA) | följsamhet +1 om ja |
| P4 | 4.5 Boss 1 | Mira | `IT WILL FIRE THREE TIMES.` / `THEN TURN.` | första hacket sker i bossens första vändfönster | första fönstret | – |
| P5 | 5.4 Kylrum | Mira | `THE GUARD WILL TURN` / `IN THREE SECONDS.` | spelaren passerar vaktposten först efter vändningen | efter | följsamhet +1 om rätt |
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

## 3. Struktur (37 skärmar)

`D` = dialog, `L` = logg, `P` = prediktion, 🔒 = lås, 💾 = access code.

| Avsnitt | Skärmar | Innehåll |
|---|---|---|
| 0 INTRO | 0.1 Elis rum | D1 intro: PROJECT ORACLE-fragmentet, sist `HELLO, ELI.` |
| 1 ENTRÉ | 1.1 grind · 1.2 lobby · 1.3 säkerhetskontroll · 1.4 korridor | Smygtutorial. D2 första terminalen → VISITOR BADGE. 🔒 badge-dörr. 💾 |
| 2 ADMINISTRATION | 2.1 kontor · 2.2 kopiering · 2.3 serverskrubb · 2.4 forskarens kontor · 2.5 städförråd · 2.6 chefskontor | L "ORACLE ISN'T DESIGNED…". D3 Mira: `YOU SHOULDN'T BE HERE.` D4 forskare. Ventilationsgenväg. SECURITY CARD. 💾 |
| 3 SECURITY | 3.1 övervakning · 3.2 vapenförråd · 3.3 korsning · 3.4 larmcentral · 3.5 hisshall | L kamerabild av Eli. EMP + **P2** ställs. **P1**. D5 ORACLE i ett larm. D6 säkerhetsnivå höjs, HEAVY GUARD. 💾 |
| 4 LABORATORIUM | 4.1 labbkorridor · 4.2 observation · 4.3 prototyphall · 4.4 kontrollrum · 4.5 testkammare · 4.6 godshiss | **P2** avgörs. L TEST 14. D7 Mira: mänsklig respons + **P3**. **Boss 1** SECURITY DIRECTOR, D8 + **P4**. LAB CARD. 💾 |
| 5 UNDERGROUND | 5.1 bunkertrappa · 5.2 arkiv · 5.3 arkivets innersta · 5.4 kylrum · 5.5 tyst terminal · 5.6 slussport | HUNTER. D9 experimentloggar. D10 Eli som SUBJECT. **P5**. D11 Mira tystnar. PROTOTYPE. 💾 |
| 6 SERVER COMPLEX | 6.1 serverhall A · 6.2 serverhall B · 6.3 kylkorridor · 6.4 direktörens kontrollpunkt · 6.5 kärnans sluss | D12 ORACLE talar + **P6**, live-siffran börjar synas. ORACLE AGENT. L PERSONALITY MODEL: MIRA (frivillig). D13 forskningschefen. 💾 |
| 7 ORACLE CORE | 7.1 kärnhall · 7.2 förgrening · 7.3 kärnan · 7.4 terminalen och kabeln | **Boss 2** (ORACLE-styrd enhet), D14. **P7** (D15). D16 förklaring + protokollista, D17 sanningen om Mira. **P8**: D18 valet, D19, D20 epilog. |

Fiender: GUARD (1), SECURITY DRONE (3), HEAVY GUARD (3), HUNTER (5), PROTOTYPE (5), ORACLE AGENT (6: går mot
spelarens förväntade position). Sprites: Eli, forskare, forskningschef, 6 fiender, 2 bossar.

---

## 4. Budget (uppskattning, ROM 32 KB)

| Del | KB |
|---|---:|
| 37 rum (2×2-block, ~56 B/rum) | ~2 |
| Text: ~20 dialoger + ~10 loggar (~1200 ord, ordbokskomprimerad) | 4–5 |
| Grafik: ~60 tiles + sprites | ~6 |
| Musik: 5 slingor | 2–3 |
| Kod: motor, smygande, skripttolk, ORACLE-motor, musik, access codes | 12–15 |
| **Summa** | **~26–31** |

---

## 5. Nästa steg (i denna ordning)

1. ~~ORACLE:s prediktioner~~ (§2, detta dokument)
2. De ~20 dialogerna: vad spelaren behöver veta vid varje punkt, sedan text i 31×5-format
3. De ~10 loggarna: information som dialogerna inte kan bära
4. Layout skärm för skärm: terminaler, dörrar, laddstationer, fiender, P-triggers
5. Implementation (nya milstolpar i PLAN.md först)
