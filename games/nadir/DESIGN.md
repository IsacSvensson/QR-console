# NADIR — designdokument

Status: **godkänd plan (2026-10-29), implementeras enligt PLAN.md Part 4 (M26–M32).** Detta dokument,
`LEVEL.md` (från M31) och banfilerna (`levels/*.map`) är specifikationen och testernas facit. Tabellerna med
konstanter (§3.3) och ljusregeln (§3.5) läses direkt av testerna i `test/nadir/`. Ändras ett värde här ska
motorn följa efter, aldrig tvärtom.

Alla cykel- och bytesiffror som inte är märkta *uppmätt* är **beräknade** ur VM:ens kostnadsmodell
(instruktionsräkning), inte mätta. Mätningarna förs in här och i `DECISIONS.md` när de görs.

---

## 0. Spelet på en minut

Djupforskningsstationen *Nadir* ligger 1 200 m ned i en nedlagd malmgruva. Borren slog igenom till ett hålrum,
och något självlysande växte ut i mörkret. Stationen tystnade. Du åker ensam ned i hisschaktet för att starta
kraften igen och få upp hissen, med en industriell bultbössa och en ficklampa.

Ett förstapersonsspel i retrostil: korridorer och rum i stål och råberg, varma natriumlampor som flimrar, kalla
cyanterminaler, röda larmljus, och en lila och grön infektion som lyser i mörkret. Spelet är en *vertical slice*:
**en bana på cirka tio minuter, ett vapen och två fiendetyper**, men så genomarbetat som maskinen tillåter.

Tre saker ska göra det till NADIR och inte en minimal raycaster:

1. **Ljuset berättar.** Mörkret är standard. Lampor, terminaler, ledningar och infektionen är det man ser, och
   ljuset (pölar, flimmer, ficklampan, mynningsblixten) är spelets stämning och vägvisare.
2. **Skarpa linjer i en låg upplösning.** Perspektivriktiga 1-px-linjer och silhuetter ovanpå 2-px-texturer gör
   att 128 × 128 ser skarpare ut än det borde.
3. **Varje effekt har en mätt kostnad.** Allt ligger inom 25 000 cykler per bildruta, i varje bildruta.

---

## 1. Låsta designbeslut (förslag)

1. **Runtime oförändrad.** VM, kassettformat, transport, QR och appen ändras inte (baslinje 932e534). Spelet
   använder ISA 2 som den är: xdata för grafiktillgångar som kopieras till RAM vid start.
2. **Renderare: hybrid kring en DDA-raycaster** (§3). 64 provkolumner à 2 px, RLE-texturer med LOD,
   1-px-silhuetter, ytvektordetaljer, `MAP`-bakgrund, ljus via tabeller, sprites som rektangellistor.
3. **Budget:** ≤ 25 000 cykler i varje bildruta av varje repris (hälften av VM:ens budget), ingen fault, inga
   överskridningar. 3D-vyn utan sprites ≤ 14 000 (M26-grinden).
4. **Omfång:** en bana (32 × 32 celler, ~10 min), ett vapen, två fiendetyper (Kryp, Spottare); bossen *Modern*
   bara om budgeten räcker efter M30.
5. **Kontroller "touch först"** (§5): en tumme håller bara en D-pad-riktning i appen, så varje vanlig kombination
   ska gå med en riktning plus A eller B.
6. **Ingen per-pixel-grafik.** Allt ritas med stora primitiver (`RECTFILL`, `LINE`, `MAP`, `SPR`).
7. **Text:** engelska versaler med den inbyggda 3 × 5-fonten (den saknar ÅÄÖ). Dokumentationen är på svenska.
8. **Stiliserat våld:** infektionens "blod" är grönt och lila. Inga människolik i detalj.

---

## 2. Maskinen (verifierat i källkoden)

| Egenskap | Verklighet | Konsekvens |
|---|---|---|
| Kostnad | 1 cykel per instruktion (även `MUL`, `DIV`, `MOD`, `LD`, `ST`), `SYS` = 8 cykler oavsett pixlar; `COPY`/`FILL` +⌈n/8⌉, `UNPACK` +⌈n/4⌉ | anropen är valutan, pixlarna är gratis; perspektivmatte är billig |
| Budget | 50 000 per anrop, `init` har egen; överskridning avbryter mitt i bilden | halvritade bilder syns, får aldrig hända |
| Aritmetik | 16 bitar; `MUL` = låga 16 bitar; `DIV`/`MOD` signerade; `LD/LDB/MOV/ST` sätter inga flaggor | fixpunkt; "high multiply" via byte-uppdelning |
| Grafik | 128 × 128, DB16, ingen framebuffer i minnet; `MAP` läser karta och tiles var som helst (även RAM), tile 0 ritas inte, färg 0 transparent; ingen skalning, ingen palettomväxling | skalning med geometri; `MAP` = gratis helskärmslager |
| Minne | ROM ≤ 32 KB, RAM 32 KB nollställt, stack nedåt från 0xFFFF | kod och heta tabeller i ROM, tillgångar i RAM |
| ISA | VM:en kör ISA 1 och 2; assemblern väljer ISA 2 när `.xdata` finns | tillgångar i xdata, ingen VM-ändring |
| Input | 6 knappar; appens touchknappar har pointer capture per knapp | en riktning per tumme |
| Ljud | 2 fyrkant + brus; ett nytt kommando ersätter kanalen; appen tonar varje ljud linjärt till 0 | drönare triggas om, prioritet per kanal |

---

## 3. Rendering

### 3.1 Teknikval

Jämförda: (A) klassisk raycaster med 128 strålar och en färg per kolumn (~18 000 cykler utan texturer, för dyr
för vad den ger), (B) få strålar med gradienter (~5 000, blockig), (D1) vägg-/segmentrenderare med
täckningslista (exakt men komplex i asm), (D2) dungeon crawler med förritade djupplatser (vacker men inte ett
FPS), (D3) trådram (billig men tunn). **Vald: (C) hybrid**, beräknat 11 100–16 800 cykler för 3D-vyn; grinden
14 000 kräver nedre halvan (interpolering och LOD).

Lagren (varje lager A/B-mäts i M26 och behålls bara om bilden vinner mer än det kostar):

1. **64 provkolumner** à 2 px, DDA på rutnätet med vinkeltabeller, fisheye-korrigerat. Mellankolumner kan
   interpoleras när båda grannarna träffar samma yta (1/z är linjärt i skärm-x för en plan yta).
2. **RLE-texturer:** varje texturkolumn är en grundfärg plus detaljspann (v0, v1, färg); ett spann = en
   `RECTFILL` skalad med väggens höjd. Tre LOD-nivåer efter vägghöjd.
3. **1-px-silhuetter:** grundfärgen ritas i 128 pixelkolumner med egen höjd (interpolerad inom samma yta), så
   väggens över- och underkant blir skarp trots 2-px-texturer.
4. **Ytvektordetaljer:** kolumner med samma yta bildar ett *ytspann*; horisontella och vertikala detaljer ritas
   som en `LINE` per detalj och spann, perspektivriktigt och utan aliasing.
5. **Golv och tak:** ett `MAP` med ditherade gradienttiles per zon, perspektivfogar (`LINE`), ljuspölar och
   takglöd (staplar av `RECTFILL`).
6. **Ljus via tabeller** (§3.5) och **färggradering** genom byte av skuggtabell.
7. **Sprites som rektangellistor** (M28) och **vapen, overlay och HUD med `MAP`/`SPR`** (M29–M30).

**Avgränsningar:** varierande vägghöjd fås som maskade väggar (låga väggar, räcken, fönster, hängande rör: strålen
noterar träffen och fortsätter till solid vägg, M27). Högre väggar eller tak per cell görs inte: taket är en
bakgrund som inte kan ockludera. Väggar ditheras inte (med 2-px-kolumner blir dither ränder); övergångar fås av
8 ljusnivåer. Dither används där `MAP` ger det gratis: golv, tak och overlay.

### 3.2 Koordinater och konventioner

- **Karta:** `MAP_W × MAP_H` celler, x österut (kolumn i `.map`-filen), y söderut (rad). Cellindex = y · 32 + x.
  Position i fixpunkt u8.8: 256 enheter per cell; cellen (x, y) täcker [x, x+1) × [y, y+1).
- **Vinkel:** u12, 4096 enheter per varv. Vinkel 0 = österut (+x), 1024 = söderut (+y). Eftersom y går söderut
  är *höger* i bilden ökande vinkel: höger-vektorn är (−sin θ, cos θ).
- **Provkolumn c** (0–63) täcker pixel x = 2c och 2c + 1. Strålen går genom kolumnens mitt x = 2c + 1:
  `camX = (2c + 1 − 64) / 64`, vinkelskillnad `off(c) = atan(camX · tan(FOV/2))`, tabellerad i vinkelenheter
  (avrundad). Strålens vinkel = (spelarens vinkel + off(c)) mod 4096.
- **Avstånd:** t = euklidiskt avstånd längs strålen till träffen; vinkelrätt avstånd `perp = t · cos(off(c))`
  (ingen fisheye). Vägghöjd `h = ⌊F256 / perp⌋` px (perp i u8.8), överkant `top = HORIZON − ⌊h/2⌋`,
  underkant `top + h`. Golvet och taket ligger på samma avstånd från ögat (ögonhöjd = halva väggen).
- **Ytor:** `sida` 0 = västra ytan (strålen går mot +x), 1 = östra (−x), 2 = norra (+y), 3 = södra (−y).
  Yt-id = cellindex · 4 + sida.
- **Texturkoordinat u** (0–31, från vänster till höger sett framifrån): västra ytan `⌊frac(y_träff) · 32⌋`,
  södra ytan `⌊frac(x_träff) · 32⌋`, östra och norra ytan spegelvänt: `31 − ⌊frac(·) · 32⌋`.
- **Cellen framför** en yta = den tomma cell strålen var i före träffen (cellindex − steg). Dess ljus och zon
  gäller ytan.

### 3.3 Konstanter

| Konstant | Värde | Betydelse |
|---|---|---|
| `SCREEN_W` | 128 | bildens bredd och höjd i px |
| `COLS` | 64 | provkolumner per bildruta |
| `COL_W` | 2 | px per provkolumn |
| `HORIZON` | 64 | horisontens y i px (utan bob) |
| `FOV_DEG` | 66 | horisontellt synfält i grader |
| `ANGLES` | 4096 | vinkelenheter per varv |
| `CELL` | 256 | fixpunktsenheter per cell |
| `MAP_W` | 32 | kartans bredd i celler |
| `MAP_H` | 32 | kartans höjd i celler |
| `TEX` | 32 | texlar per cell i u och v |
| `F256` | 25229 | ⌊64 / tan(FOV/2) · 256 + ½⌋: vägghöjd i px = F256 / perp |
| `PERP_MIN` | 13 | minsta vinkelräta avstånd (u8.8, 0,05 cell) |
| `MAX_STEPS` | 48 | högsta antal DDA-steg per stråle; därefter ritas kolumnen som dimma |
| `FOG_NEAR_Q` | 6 | dimman börjar efter 6 kvartsceller (1,5 cell) |
| `FOG_STEP_Q` | 6 | därefter en ljusnivå mörkare per 6 kvartsceller |
| `FL_RANGE_Q` | 24 | ficklampan når 24 kvartsceller (6 celler) |
| `LOD1_H` | 48 | väggar lägre än 48 px använder LOD 1 (16 × 16 texlar) |
| `LOD2_H` | 20 | väggar lägre än 20 px använder LOD 2 (8 × 8 texlar) |
| `FEAT_H` | 24 | ytvektordetaljer ritas bara på ytspann där någon kolumn är minst 24 px hög |
| `FLICK_SHIFT` | 2 | flimmermönstret går ett steg var 4:e bildruta |
| `LEVELS` | 8 | ljusnivåer, 0 = fullt ljus, 7 = svart |

### 3.4 Numeriska format

| Storhet | Format | Not |
|---|---|---|
| Position | u8.8 | jämförs med `JB/JAE` |
| Vinkel | u12 | |
| sin/cos | tabell s1.14, kvartsvåg 1 025 ord | 2 KB ROM |
| 1/\|cos θ\| (DDA-delta) | u8.8, klämd vid 64 celler, kvartsvåg 1 025 ord | 2 KB ROM |
| t, sideDist, perp | u8.8 | `frac · delta` och `t · cos(off)` med byte-uppdelad multiplikation |
| cos(off(c)) | u0.8 per kolumn | ≤ 0,4 % fel i perp |
| Vägghöjd h | heltal px | `DIV` (F256 < 32 767) |
| Texturkoordinat | bråkdelen ur låga 16 bitar av t (u8.8) · sin (s.8), plus positionens bråkdel | `MUL` ger exakt bråkdelen |
| Ljusnivå | 0–7 | |

### 3.5 Ljusregeln

För varje provkolumn med en träff:

```
q     = perp >> 6                                    (kvartsceller)
fog   = 0 om q < FOG_NEAR_Q, annars min(7, 1 + (q − FOG_NEAR_Q) div FOG_STEP_Q)
ljus  = max(statisk, flimmer om gruppen är tänd, annars 0)       (cellen framför, ljuskartan)
kägla = KÄGLA[c] om ficklampan är på och q < FL_RANGE_Q, annars 0
nivå  = klämd(fog + amb(zon) − ljus − kägla − blixt, 0, 7)
```

- **Ljuskartan** har en byte per cell: bit 0–2 statiskt ljus (0–7), bit 3–5 flimrande ljus (0–7), bit 6–7
  flimmergrupp (0–3). Den räknas offline ur banans lampor: en lampa med styrka I lyser upp en tom cell med
  `max(0, I − ⌊d⌋)`, där d är avståndet mellan cellernas mittpunkter i celler, om sträckan mellan mittpunkterna
  är fri. *Fri* betyder att ingen av de 63 punkterna `A + (B − A) · k/64` (k = 1…63) ligger i en solid cell.
  Statiskt ljus = största bidraget från lampor i grupp 0; flimrande ljus och grupp = största bidraget från
  lampor i grupp 1–3 (vid lika vinner lägsta grupp).
- **Flimmer:** grupp g är tänd i bildruta n om tecken nummer `(tick >> FLICK_SHIFT) & 31` i mönstret nedan är
  `1` (`tick` = spelets bildräknare i RAM efter uppdateringen).

| Grupp | Mönster (32 steg) | Karaktär |
|---|---|---|
| 0 | `11111111111111111111111111111111` | fast |
| 1 | `11111111111110111111111111100111` | nästan stadig, korta avbrott |
| 2 | `10110011111100001111101101110001` | trasig lampa |
| 3 | `11111111111111110000000000000000` | långsam puls (larm) |

- **Kägla** (ficklampan) per provkolumn: 2 för c = 28–35, 1 för c = 24–27 och 36–39, annars 0.
- **amb** är zonens mörker (0–7) och **zonen** bestämmer också skuggtabellsatsen och golv/tak-tiles (§3.7).
- **blixt** är mynningsblixten (M29), annars 0.
- **Skuggtabeller:** en tabell per zon och ljusnivå, 32 byte: index 0–15 är vanliga färger, 16–31 är
  *emissiva* versioner av samma färger. En texel med färg k och nivå L ritas med färgen `tabell[zon][L][k]`.
  Vanliga färger mörknar mot zonens dimfärg och är svarta (0) på nivå 7. Emissiva färger behåller sin färg till
  nivå 5 och mörknar först därefter. Tabellerna skrivs av `tools/tables.ts` (perceptuellt närmaste DB16-färg till
  färgen skalad med nivåns ljusstyrka och blandad mot zonens dimfärg) och kontrolleras: ljusstyrkan avtar aldrig
  uppåt med nivån, och vanliga färger är 0 på nivå 7.

### 3.6 Texturer

- Ett material är 32 × 32 texlar med en egen teckenförklaring (`art/textures.txt`, eller procedurellt med fast
  seed i `tools/textures.ts`). Färg 16–31 betyder emissiv.
- Lagras per LOD k (0, 1, 2) med `32 >> k` kolumner. En kolumn är **en grundfärg och en lista med detaljspann**
  `(v0, v1, färg)` i 1/32-delar av väggens höjd (även på LOD 1 och 2, då i steg om 2 och 4). Generatorn väljer
  den grundfärg som ger färst spann och slår ihop lika grannspann. LOD 1 och 2 skapas genom att ta den vanligaste
  färgen i varje 2 × 2- respektive 4 × 4-block (emissiva färger vinner, så att lampor inte försvinner på avstånd).
- **Ytvektordetaljer** per material: horisontell linje `h v färg u0 u1` eller vertikal linje `v u färg v0 v1`
  (koordinater i 1/32), ritade i ytspann där någon kolumn är minst `FEAT_H` px hög.
- **Animation:** ett material kan ha u-scroll (texeln flyttas en kolumn var 2^s:te bildruta) eller två
  bildrutor.
- Texturerna ligger i xdata och kopieras till RAM i `init`.

### 3.7 Golv och tak

- **Bakgrund:** ett `MAP` med 16 × 17 tiles från zonens tileset, ritat på y = bob − 8: rad 0–8 tak, rad 9–16
  golv. Varje tilerad är en ditherad (Bayer 4 × 4) gradient mellan två steg i zonens tak- respektive golvramp,
  mörkast vid horisonten (långt bort) och ljusast vid bildens kant (nära). Alla tiles är helt täckande.
- **Perspektivfogar:** golvets rutnätslinjer (x = k och y = k) inom 6 celler, klippta vid 0,5 cell framför
  kameran, ritade med `LINE` i två färgsegment (nära ljusare, långt bort mörkare). De ritas före väggarna, så
  väggarna döljer det som ligger bakom.
- **Ljuspölar och takglöd:** varje lampa inom 8 celler framför kameran ger en ellips på golvet och en mindre på
  taket, ritade som staplar av `RECTFILL` (ytterring och kärna i zonens ljusfärger).

### 3.8 Pipeline och ocklusion

```
logik → kamera (sin/cos, bob, skak, ljusläge, flimmer)
→ 1 bakgrund (MAP) → 2 golv/tak-detaljer (fogar, pölar, glöd)
→ 3 strålar (64 provkolumner, interpolering) → kolumnbuffertar: perp, h, yta, u, material, nivå, cellen framför
→ 4 väggar: silhuett (1 px) → detaljspann (2 px) → ytvektordetaljer
→ 5 sprites och maskade ytspann bak→fram, klippta mot z-bufferten (M27–M28)
→ 6 partiklar → 7 vapen → 8 overlay → 9 HUD → 10 ljud
```

Golvet bakom en vägg skrivs över av väggkolumnen. Sprites klipps per kolumnintervall mot perp. Maskade väggar
sorteras med sprites på sitt djup. Vapen, overlay och HUD sist.

### 3.9 Vad som räknas var

| När | Vad |
|---|---|
| Offline | trigtabeller, kolumnvinklar och cos, skuggtabeller, texturer → spann + LOD + detaljer, sprites → rektanglar, ljuskarta, zoner, rum och "nästa rum"-tabell, siktlinjekontroll, kamerapositioner |
| `init` | kopiera tillgångar xdata → RAM, packa upp banan |
| Per bildruta | kamera, flimmer, strålar och kolumner, sprites, AI, partiklar, ljud |
| Vid händelser | dörrlägen, checkpoint (`COPY` av tillståndsblocket), zonbyte, färggradering |

---

## 4. Grafiskt koncept

**Palettroller (DB16):** skugga/dimma 0 1 2 3 · stål 3 7 10 15 · berg 1 4 3 7 · natrium 14 9 4 · teknik 13 8 2 ·
larm 6 1 · infektion 12 6 1 + glöd 11 5.

**Zoner:** *schaktet* (varmt, dimma mot brunt), *labbet* (kallt, dimma mot marinblått), *kärnan* (lila), och
*mörkret* (högt amb, bara ficklampan och emissiva detaljer).

**Material:** stålpanel med nitar · sprutbetong · råberg med malmådror · industripanel med rör ·
varningsränder · lysande energiledning (emissiv, u-scroll) · terminalvägg (emissiv skärm, 2 bildrutor) ·
skjutdörr med status-LED · dörrkarm · galler (maskat) · organisk vägg (pulserande sporer) · hisschakt. Regel:
bara detaljer som syns vid 128 × 128; tunna detaljer blir ytvektorlinjer i stället för texlar.

**Fiender:** *Kryp* (blek, lemmalång, röda emissiva ögon, snabb närstrid med tydlig upptakt) och *Spottare*
(uppsvälld, lila med lysande gröna säckar, spottar syra). Kantljus i spriten ger silhuett mot mörkret.

**Vapen:** bultbössa (pumphagel), ~64 × 48 px med ett `MAP`; bob, sväng, rekyl, pump, omladdning,
mynningsblixt, bärnstensfärgad emissiv ammunitionsdisplay.

**HUD:** helskärms-3D, hälsa nere till vänster, ammunition på vapnet, nyckelkort uppe till vänster, litet sikte,
skaderiktning i kanten, vinjett som ram.

**Effekter och kostnad (beräknad):**

| Effekt | Funktion | Kostnad |
|---|---|---|
| Avståndsdimma | djup, döljer låg upplösning, kortar siktlinjer | ~3 instr per kolumn |
| Ljuskarta + flimmer | ljuspölar, mörka partier, liv | ~5 instr per kolumn |
| Emissiva texlar | lampor, skärmar och ögon syns i mörker | 0 (del av skuggtabellen) |
| Zonvis färggradering, tint | identitet per område, feedback | 0 (byte av tabellpekare) |
| Ditherat golv/tak | djup på stora ytor | 1 `MAP` ≈ 20 cykler |
| Perspektivfogar | rörelsekänsla, perspektiv | ~50 cykler per linje |
| Ljuspölar och takglöd | lampornas ljus landar | ~10 `RECTFILL` per lampa |
| Ficklampskägla | stämning, fokus | ~2 instr per kolumn |
| Mynningsblixt | skott lyser upp scenen | 0 + 1 `MAP` |
| Vinjett, skadeblink | ram, feedback | 1 `MAP` vardera |
| Skärmskak | tyngd | 0 (offset) |
| Partiklar | träffar, explosioner | ~30 cykler styck, tak 24 |

---

## 5. Kontroller och spelaren (M27)

| Knapp | Funktion (förslag S2) |
|---|---|
| UPP / NED | gå framåt / bakåt |
| VÄNSTER / HÖGER | vrid; ett tryck = fin vridning, håll = accelererar på ~12 bildrutor |
| A | skjut (håll = repetera) |
| B (håll) | gå framåt, så att en touchspelare kan gå med högertummen och styra med vänstertummen |
| dubbeltryck VÄNSTER/HÖGER | snabbt sidosteg |
| dörrar, brytare | öppnas när man går in i dem |

Alternativ S1 (B = strafe-modifierare) som val på titelskärmen om det ryms. Spelaren: 100 HP, kollisionscirkel
r = 0,25 cell med väggglidning, huvudbob som kan stängas av. Exakta kurvor och hastigheter fastställs i M27.

---

## 6. Vapen, fiender och AI (M29–M30)

- **Bultbössa:** 5 hagel med fallande skada över avstånd, magasin 6, pump efter varje skott, omladdning när
  tomt. Varje hagel är en stråle från mitten med fast vinkel som träffar närmaste fiende framför väggen.
- **Kryp:** 30 HP, snabb, upptakt 20 bildrutor före språng, 15 skada.
- **Spottare:** 50 HP, håller avstånd 2–8 celler, syraboll var 90:e bildruta, 12 skada + stänk.
- **AI:** VILA → LARM (siktlinje eller skott i samma/angränsande rum) → JAKT (spelaren vid siktlinje, annars
  senast kända position, genom dörrar via "nästa rum"-tabellen) → ANFALL → SMÄRTA → DÖD.

---

## 7. Banan (M27, M31)

Hissen (start) → Schaktgången (berg och stål, natriumljus, första skräcken bakom ett galler) → Verkstaden
(pelare, lådor, explosiva tunnor) → Kontrollrummet (cyanterminaler, rött nyckelkort) → Säkerhetsdörren → Kärnan
(organiska väggar, Spottare, reningsbrytaren) → tillbaka till hissen medan larmet går → seger: hissfärd och
statistik. Två hemligheter, tre checkpoints, ~15 fiender. Detaljer i `LEVEL.md`.

**Banregler (kontrolleras av generatorn):** solid kant runt hela kartan; ingen fri siktlinje längre än 14 celler
från någon gåbar cell.

---

## 8. Ljud (M29–M32)

Fyrkant 0: musikmotiv och omgivningsdrönare. Fyrkant 1: vapnets kropp, fiendeläten, hotsignal. Brus: skottets
knall, explosioner, dörrar, fotsteg. Prioritet: eget vapen > fiendeanfall > smärta/död > dörr > omgivning;
effekterna bokför kanal och längd så att musiken återupptas.

---

## 9. Budget

| Delsystem | Beräknat (cykler per bildruta) |
|---|---:|
| Strålar (35–64 kast à ~130, interpolering à ~28) | 5 500–8 300 |
| Väggar (silhuett 128 + detaljspann 64 × ~3) | 4 200–6 000 |
| Ytvektordetaljer | 600–1 000 |
| Golv/tak | 800–1 500 |
| **3D-vy** | **11 100–16 800 (grind 14 000)** |
| Sprites (rect-budget 140 per bildruta) | 2 000–5 000 |
| Partiklar och projektiler | 300–900 |
| Vapen, overlay, HUD | 200–500 |
| Logik | 1 500–3 000 |
| Ljud | 100–300 |
| **Totalt** | **15 200–26 500 (hårt tak 25 000)** |

ROM: kod 12–17 KB + tabeller 4–5 KB + bana och ljud ~3 KB = 19–27 KB av 32. xdata → RAM: 13–23 KB. RAM:
tillstånd 6–8 KB + tillgångar, stackreserv 512 B (inga variabler över 0xFE00). Kassett ~18–30 KB (mål ≤ 32 KB).

---

## 10. Filer och verktyg

```
games/nadir/  nadir.asm defs.asm math.asm ray.asm walls.asm floor.asm light.asm camera.asm (M26)
              player.asm world.asm sprites.asm weapon.asm enemies.asm fx.asm hud.asm screens.asm sound.asm (M27–M32)
              *.gen.asm (genererat), art/, levels/, tools/, replays/
test/nadir/   ref.ts (oberoende kartläsare, flyttalsraycaster, reglerna i detta dokument) och testerna
```

`npm run nadir:gen` skriver all genererad data, `npm run nadir:record` spelar in bot-repriser, `npm run
test:nadir` kör testerna. Utvecklingsverktyg: `tools/shot.ts` (bild från en kameraposition), `tools/sheet.ts`
(kontaktark), `tools/profile.ts` (cykler per fil och rutin), `tools/cycles.ts` (dyraste bildrutorna).

---

## 11. Prototypen (M26)

Banan `levels/proto.map`: en lång korridor, ett rum med pelare, natriumlampor och en flimrande lampa, en mörk zon
med emissiva paneler, en materialvägg. Kameran styrs med UPP/NED (gå), VÄNSTER/HÖGER (vrid) och B (strafe, bara i
prototypen). Testkroken `dbg_pose` sätter kameran till en namngiven position ur banfilen; `dbg_flags` slår av och
på renderarens lager för A/B-mätningar.

---

## 12. Risker

| Risk | Åtgärd |
|---|---|
| För hög cykelförbrukning | profil per rutin, A/B per lager, nedskärning: LOD-trösklar → interpolering → dimgräns → silhuetter → fogar |
| Fixpunktsartefakter | vinkeltabeller u12, byte-uppdelade produkter, flyttalsorakel varje bildruta |
| ROM/RAM | xdata, kompakta format, budgetgrind M30, högvatten och stackdjup mäts |
| Dålig bild trots rätt geometri | kontaktark från M26, granskning, iteration |
| Touch: en riktning per tumme | S2, sidosteg, sikteshjälp, automatiska dörrar |
| asm-fällor | små rutiner, statisk ROM-kontroll, orakeltester |

---

## 13. Öppna frågor (förslaget gäller om inget annat bestäms)

| # | Fråga | Förslag |
|---|---|---|
| 1 | Namn och tema | NADIR, industriell skräck med bioluminescens (alternativ: DJUPET) |
| 2 | Spelets text | engelska versaler med inbyggd font |
| 3 | Kontroller | S2; S1 som val om det ryms |
| 4 | Omfång | en bana, ett vapen, två fiendetyper; boss om budgeten räcker |
| 5 | 8-vägs D-pad i webbappen | görs inte (appändring); idé för senare |
