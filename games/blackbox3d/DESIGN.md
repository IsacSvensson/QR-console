# BLACKBOX 3D: designdokument

Status: **M27, design och uppmätt mockup.** Implementeras enligt PLAN.md Part 5 (M27–M32).

BLACKBOX 3D är **samma spel som BLACKBOX** (`games/blackbox/`), men i förstaperson. Det har samma berättelse, 37 rum,
dialoger, loggar, ORACLE-motor, slut, access codes och musik. BLACKBOX:s dokument gäller oförändrade och är
testernas facit:

- `DESIGN.md`: låsta beslut §1, ORACLE §2, struktur §4
- `LAYOUT.md`: alla rum
- `DIALOGUE.md` och `LOGS.md`: all text

Det här dokumentet beskriver bara det som 3D ändrar. Renderingen bygger på FPS-spiken (`games/fps/SPIKE.md`, M26).

---

## 1. Vad som är oförändrat

- **Spellogiken** är BLACKBOX:s egen kod:
  - **Oförändrade moduler:** `script.asm`, `scripts.asm`, `text.asm`, `oracle.asm`, `code.asm`, `sounds.asm`. De är
    kopierade, och ett test kräver att de är byte-identiska med originalen.
  - **Genererade filer:** `rooms.gen.asm` och `text.gen.asm` genereras av BLACKBOX:s egna generatorer och är
    byte-identiska.
  - **Anpassade moduler:** `room.asm`, `player.asm`, `actors.asm`, `boss.asm` och `defs.asm` är BLACKBOX:s egna, med
    3D-ändringarna nedan. Varje fil säger det på sin första rad.
- **Världen i pixlar.** Spelaren och alla aktörer har kvar BLACKBOX:s koordinater: rumspixlar, 8 per ruta.
  Vakternas patruller, kollisionsrutan, siktlinjer cell för cell, EMP-räckvidd, triggers och skript räknar exakt
  som förut.
- **Låsta designbeslut** (BLACKBOX DESIGN §1) gäller, särskilt nr 1: Eli är ingen actionhjälte. Det finns inget
  vapen, bara EMP:n.
- **Access codes** har samma format. En kod från BLACKBOX fungerar i BLACKBOX 3D och tvärtom.

## 2. Vad som ändras

| Del | BLACKBOX | BLACKBOX 3D |
|---|---|---|
| Vy | rummet ovanifrån, 128×120 | förstaperson 128×88 (§3.2) |
| Rörelse | styrkorset går i 4 riktningar | vrid och gå (§3.6) |
| Upptäckt | står du i en synlinje är du upptäckt | en mätare fylls på 16 bilder (§3.7) |
| Synlinjer | gula prickar i rummet | prickar på radarn i statusraden (§3.5) |
| HUD | 8 px överst | statusrad 40 px nederst: radar, avsnitt, ORACLE, EMP, mätare |
| Rumsbyte | när sprite-rutan lämnar skärmen | när mittpunkten når en kantcell (dörr/ventil) |
| Grafik | 8×8-tiles och sprites | texturer 16×16 per tileset, aktörer 16×16 i 5 storlekar (§4) |

---

## 3. Motorn

### 3.1 Rummet som karta

Rummet (`room_buf`, 16×15 tiles) blir en **renderkarta** `rmap` på 16×16 celler. Kartan byggs om varje gång
rummets tiles ändras, alltså vid laddning och när en dörr låses upp (`apply_locks`). Rad 15 och raden ovanför rad 0
(`rmap_pre`) är solida, så strålar lämnar aldrig kartan.

| Tile (BLACKBOX) | Renderkod | Ritas som |
|---|---|---|
| golv, öppning inne i rummet | 0 | inget |
| vägg, väggfront | 1 | full vägg (WALL) |
| hylla | 2 | full vägg (SHELF) |
| kamera | 3 | full vägg med lins (CAMERA) |
| låst dörr | 4 | full vägg (LOCKED) |
| ventil | 5 | full vägg (VENT) |
| hiss | 6 | full vägg (LIFT) |
| öppning eller ventil **på kanten** | 7 | portal: en dörrkarm mot mörker (PORTAL) |
| skrivbord, disk, glas | 0x80 + 8 | låg cell (DESK) |
| terminal | 0x80 + 9 | låg cell (TERMINAL) |
| laddstation | 0x80 + 10 | låg cell (CHARGER) |
| kabel | 0x80 + 11 | låg cell (CABLE) |

Klassen följer BLACKBOX:s regel. Det som inte blockerar sikt (LAYOUT.md: `=`, `T`, `E`, `K`) är **lågt**. Vakter ser
över det, och spelaren gör det också.

### 3.2 Vyn och väggarna

- **Vyn** är 128×88 pixlar i en RAM-buffert av 16×11 tiles i kolumnordning (5 632 byte), som visas med ett `MAP`.
  Det är samma teknik som FPS-spiken, SPIKE.md §3.2.
- **Strålarna** är 64, var och en 2 px bred.
- **Väggarna är två celler höga.** En BLACKBOX-ruta är ungefär en person bred. Med en cell hög vägg såg rummen ut som
  låga hallar, och vakterna blev små (mätt i mockupen, D-041). Ögat är mitt på väggen.
- **Höjden** är `q = 97·256 / avstånd` och väggen `h = 2q` pixlar. Väggen ligger centrerad på rad 44. Avståndet
  klämms till minst 64/256 cell, så q är högst 388.
- **Taket** (rad 0–43) och **golvet** (rad 44–87) fylls per tile-kolumn med tilesetets färger.

### 3.3 Strålar

Strålarna fungerar som i SPIKE.md §3.1 och §3.3: samma kvantiserade kamera (8.8, kameraplanet 169/256, strålens
position i 1.7) och samma DDA, inklusive regeln för komponenter ≤ 1/256. De har inga dörrplan, eftersom en låst dörr
är en vägg tills den öppnas.

Per stråle sparas:

- `zb`: väggens avstånd
- `rh`: höjden h
- `rcell`: cellen
- `rtx`: u | sida << 4
- `zlow` och `ylow`: närmaste låga blocks avstånd och översta rad
- `nlowr`: antal låga block

### 3.4 Låga celler

En stråle som går in i en låg cell **fortsätter** till nästa fulla vägg, men cellen sparas som ett **lågt block**:

- **Avstånd:** framkantens avstånd (där strålen gick in) och bakkantens (där den går ut ur cellen, det närmaste av
  nästa x- och y-sida).
- **Sida och kod:** vilken sida strålen gick in genom, och cellens renderkod.
- **Sammanslagning:** nästa låga cell slås ihop med blocket om den börjar exakt där blocket slutade, till exempel
  en rad skrivbord.
- **Antal:** högst två block per stråle. Ett tredje ritas inte.

När väggkolumnen är ritad ritas blocken **från det bortersta till det närmaste**:

- **Ovansidan** täcker rader från `yb` till `yf − 1` i ovansidans färg (`LOW_TOP`). Raden för bakkantens överkant är
  `yb = (8·88 − 8 + 2·h_bak + 15) >> 4`, och för framkantens `yf` på samma sätt med `h_fram`.
- **Framsidan** är texturraderna 10–15 av en vägg med höjden h_fram, alltså de nedre 6/16. Det blir väggens
  run-lista från den första körningen med texel ≥ 10, med texturen för den låga cellens kod och sida.

### 3.5 Statusraden och radarn

Statusraden ligger på rad 88–127, och dialogrutan täcker den (BOX_Y = 88).

- **Radarn** ligger på (3, 93), 32×30 px, med 2×2 px per cell i en färg per tile (`radar_col`).
  - **Väggarna** ritas i en RAM-buffert på 4×4 tiles vid varje rumsändring och visas med ett `MAP`.
  - **Varje bild** ritas aktörernas prickar (2×2), deras synlinjer (en pixel per cell i BLACKBOX:s strålfärg) och
    spelaren (vit) med en gul pixel i blickriktningen.
- **Text:** avsnittets namn och, från 6.1, ORACLE:s träffsäkerhet.
- **EMP:** laddningarna som cyan rutor.
- **SEEN-mätaren** är en röd stapel (§3.7).

Barks visas överst i vyn (ROOM_Y = 0). Upptäckt syns som en röd ram runt vyn, och EMP som en cyan ring som växer
från vyns mitt.

### 3.6 Rörelse, koordinater och knappar

- **Position.** Spelarens mittpunkt är `pfx, pfy` i 8.8-celler, och `px, py` (BLACKBOX:s sprite-hörn) följer med:
  `px = pfx >> 5 − 4`. Ett steg i x tas bara om `box_blocked` (BLACKBOX:s egen kollisionsruta) godtar den pixel det
  leder till, och samma sak gäller y. Flyttar spelet själv `px`/`py` (rumsbyte, warp, omstart) sätts `pfx, pfy`
  till den pixelns mitt (`sync_pos`).
- **Hastighet.** Spelaren går 32/256 cell per bild, alltså en BLACKBOX-pixel som i 2D, och vrider sig 8/1024 varv
  per bild.
- **Riktning.** `pdir` är den närmaste av fyra riktningar, och `mdx`/`mdy` är rörelsens tecken (−1, 0, 1).
  ORACLE-agenten siktar med dem som i BLACKBOX.
- **Rumsbyte.** När mittpunkten når en kantcell, som bara kan vara en öppning eller en ventil, lämnar spelaren rummet
  åt det hållet. I nästa rum står spelaren **en cell innanför** dörren med blicken in i rummet. Vid ankomst via hiss
  eller start vänder spelaren sig mot rummets mitt.
- **A:** använd cellen en cell framför mittpunkten längs blicken. Det fungerar som BLACKBOX:s `use_ahead`.
- **B:**
  - **kort tryck** (högst 20 bilder utan riktning): EMP-puls
  - **hållen + vänster/höger:** gå i sidled
  - **hållen kvar från ett svar i en dialog:** ignoreras

### 3.7 Upptäckt

- **Mätaren.** En synlinje som når spelarens cell fångar inte direkt. Den fyller **SEEN-mätaren** med 4 per bild
  upp till 64, alltså 16 bilder eller ungefär en kvarts sekund. Mätaren töms med 1 per bild när ingen ser spelaren.
  Full mätare ger samma sak som en upptäckt i BLACKBOX: röd ram, `DETECTED. RESTARTING ROOM.` och omstart.
- **Varför.** I förstaperson ser man inte vaktens linje på golvet, och reaktionstiden är det rättvisa priset.
- **Oförändrat:** att röra en fiende fångar direkt som förut, och andrummet efter rumsbyte gäller som förut (ingen
  fyllning).
- **Omstart:** spelaren återställs till samma position och blickriktning som när hen kom in.

### 3.8 Bildtakt

- **Budget per bild.** En bild har 64 strålar. Strålarna kastas i grupper om fyra (en tile-kolumn), så länge den
  uppskattade kostnaden plus den förra gruppens kostnad ryms i `RAY_BUDGET` (18 000).
- **Uppskattning per stråle:**
  - 140 fast
  - 7 per DDA-steg (cellavståndet till träffen)
  - 13 per texel-körning (upp till 16)
  - 1 per rad (upp till 88)
  - 260 per lågt block
- **Presentation.** Bilden visas efter den sista strålen. Under tiden visar skärmen förra bilden, och statusraden
  ritas varje bild.
- **Rumsladdning.** En bild där ett rum laddas kastar inga strålar, eftersom laddningen är en bilds arbete för sig.
- **Uppmätt:** varje bild ligger under 25 000 cykler, med 2–4 bilder per bild beroende på vy (§5).

---

## 4. Grafik

### 4.1 Texturer

- **Teckning.** Elva texturer på 16×16 ritas en gång med symboliska färger p, q, r, s och t. De färgas om per
  tileset med BLACKBOX:s egna färger (OFFICE, SECURITY, BUNKER, SERVER), som i originalets `tiles.ts`.
- **Väggar och portal:** WALL, SHELF, CAMERA, LOCKED, VENT, LIFT och PORTAL.
- **Låga celler:** DESK, TERMINAL, CHARGER och CABLE, där bara rad 10–15 syns.
- **Y-sida.** En vägg som träffas på en y-sida får ett steg mörkare färger (`DARK`).
- **Lagring.** Texturerna ligger opackade i xdata (22,5 KB). Renderaren kopierar en kolumn i taget direkt därifrån
  med `COPY`.
- **Tak och golv** per tileset: OFFICE marinblått/mörklila, SECURITY och BUNKER mörklila/mörkgrått, SERVER
  mörklila/marinblått.

### 4.2 Aktörer

- **Bilder.** Aktörerna är bilder på 16×16 som skalas med närmaste granne till 8, 16, 24, 32 och 48 px.
- **Storlek.** Storleken är den som ligger närmast 0.75 · h på aktörens avstånd. Bilden står på golvlinjen.
- **Lagring.** Bilderna packas upp ur xdata till RAM vid start (`spr_ram`, 8 448 B för fyra bilder).
- **Vakter** har tre poser:
  - Spelet tar fram den riktning kameran står i, sett från vakten (största axeln).
  - (vaktens riktning − den riktningen) & 3 ger poserna: 0 framifrån, 2 bakifrån, 3 från sidan, 1 från sidan
    spegelvänd.
- **Övriga aktörer** har en tillfällig bild (`unknown`) tills deras avsnitt byggs (M29–M31).
- **Ritning.** Aktörerna ritas efter vyn, från den bortersta till den närmaste, tile-kolumn för tile-kolumn med
  `SPR` (spegling via flaggan).
  - **Bakom en vägg.** En tile-kolumn ritas bara där aktören är närmare än väggen vid kolumnens mittstråle, alltså
    med 8 px noggrannhet.
  - **Bakom ett lågt block.** Står aktören bakom ett lågt block i den kolumnen, ritas bara rader ovanför blockets
    översta rad. Hela tiles ritas med `SPR`, och den tile som korsar gränsen ritas pixel för pixel.
- **Stoppad.** En aktör som stoppats av EMP blinkar, som i BLACKBOX.

---

## 5. Budget (uppmätt vid M27)

| | Värde |
|---|---|
| ROM | 31,1 KB av 32 KB (kod 15,0 KB, data 16,0 KB). Sinus som kvartsvåg och run-listornas index i RAM sparade 2,6 KB |
| xdata | run-listor (5 810 B) och bilder (8 448 B) packade, texturer 22,5 KB opackade |
| RAM | 23,7 KB av 32 KB (vy 5,6 KB, run-listor 5,8 KB, bilder 8,4 KB) |
| Cartridge | 23,5 KB, en QR-loop på 135 rutor (20 s) |
| Cykler per bild | 55 000–84 000 i mockupens vyer, alltså 2–4 bilder per bild eller 15–30 bilder/s. Högst 23 200 cykler i en bild (`mockup/MOCKUP.md`) |

**Risk:** ROM. Hela BLACKBOX:s logik och text för alla 37 rum finns redan med, men det ryms bara drygt 1,6 KB mer
kod. Fler bilder och texturer går till xdata. Mer kod (bossarnas 3D-bitar, M30–M31) kan behöva text i xdata, och
det beslutet tas när siffran är känd.

## 6. Testernas facit (M28)

- **Rum:** `rmap` ska stämma med LAYOUT.md enligt §3.1. Oraklet läser LAYOUT.md själv, som BLACKBOX:s
  `test/blackbox/oracle.ts`.
- **Strålar:** varje stråle ska stämma med flyttalsoraklet (`test/fps/oracle.ts`, SPIKE.md §3.7), utökat med låga
  celler enligt §3.4.
- **Pixlar:** väggkolumner och låga block ska stämma pixel för pixel med texturerna och reglerna i §3.2–3.4.
- **Skärm:** varje presenterad skärm ska vara vyn plus aktörerna enligt §4.2.
- **Radar:** den ska visa exakt BLACKBOX:s siktceller för varje vakande aktör och aktörernas celler.
- **Mätare:** den ska följa §3.7 bild för bild. Upptäckt ska ge omstart med spelaren tillbaka vid ingången.

## 7. Öppna frågor (standardsvar gäller om inget annat bestäms)

1. **Väggarnas höjd:** 2 celler (§3.2). Alternativet 1,5 ger bredare rum men mindre vakter.
2. **Bildtakten:** 15–30 bilder/s. 4 px breda strålar skulle ge ungefär dubbelt så snabbt men grövre bild (FPS-spiken
   §5). Standard: 2 px. Ditt test avgör.
3. **SEEN-mätarens fart:** 16 bilder från tom till fångad.
4. **Gånghastighet:** en BLACKBOX-pixel per bild (7,5 celler/s), så att pussel med timing (P5) fungerar som i 2D.
5. **Kartan på knapp** (helskärm, paus): nej, radarn räcker. Kan läggas till senare.
