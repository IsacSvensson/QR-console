# NADIR — banan (M31)

Banan är `levels/nadir.map` (översikt `levels/nadir.png`). Den här filen beskriver vad spelaren ska göra där. Dess
tabeller är oraklet för flödestesterna (`test/nadir/game.test.ts`); generatorn (`tools/maps.ts`) kontrollerar att
kartans sektioner `objectives`, `checkpoint` och `secrets` stämmer med dem.

## Historien i en mening

Gruvan NADIR, 1 200 m ned: infektionen har tagit nedre nivån; du kommer ned med hissen, hämtar säkerhetskortet,
tar dig in i kärnan, stänger av pumpen som sprider sporerna, och åker upp igen.

## Områden

| Område | Celler (ungefär) | Innehåll |
|---|---|---|
| Hissen | x 2–4, y 2–4 | start och mål; dörren (3, 5) |
| Schaktgången | x 3–4, y 6–15 | natriumljus, gallret in mot verkstaden, hemlighet 1 |
| Verkstaden | x 6–14, y 7–15 | lådor, tunnor, låga väggen, två Kryp |
| Mörka gången | x 16–22, y 10–12 | ledningar, hemlighet 2 |
| Kontrollrummet | x 19–28, y 2–8 | det röda kortet, två Kryp, två Spottare, tunnparet |
| Kärnan | x 24–30, y 10–20 | säkerhetsdörren (23, 12), räcket, pumpens terminal, två Kryp |
| Sydgången | x 10–22, y 17–20 | tillbaka till verkstaden, hemlighet 3 |

## Målen (i ordning)

Ett mål klaras när spelaren går in i dess cell och alla tidigare mål är klara. HUD:en visar det **nästa** målets
text i 3 s vid start och efter varje klarat mål; efter det fjärde kommer hissfärden (segern).

| # | Mål | Cell | HUD-text |
|---|---|---|---|
| 1 | Det röda nyckelkortet | 27 3 | FIND THE RED KEYCARD |
| 2 | In genom säkerhetsdörren | 24 12 | OPEN THE SECURITY DOOR |
| 3 | Pumpens terminal i kärnan | 30 19 | SHUT DOWN THE CORE PUMP |
| 4 | Tillbaka i hissen | 3 3 | RETURN TO THE LIFT |

## Kontrollpunkten

| Efter mål | Pose (x y grader) |
|---|---|
| 2 | 24.5 12.5 0 |

När mål 2 klaras sparas en ögonblicksbild (fienderna, föremålen, tunnorna, dörrarna, hälsa, vapen, nycklar, mål och
räknare). Dör spelaren efter det startar spelet om från ögonblicksbilden med spelaren vid kontrollpunktens pose;
dör spelaren före startar allt om från början (DESIGN §6.5). `deaths` ökar i båda fallen.

## Hemligheterna

En hemlighet är en **dold dörr**: den ser ut som väggen runt den (dess material) och öppnas när spelaren går in i
den. Bakom ligger en nisch med ett föremål. Den räknas som hittad första gången spelaren står i nischen.

| # | Dold dörr | Material | Nisch | Föremål |
|---|---|---|---|---|
| 1 | 2 10 | R | 1 10 | ammunition |
| 2 | 17 10 | R | 17 9 | medkit |
| 3 | 14 19 | R | 14 20 | ammunition |

## Föremål och fiender

Alla föremål och fiender står i kartans `props` och `enemies`. I varje repris av hela spelet
(`m31-game`) plockas varje föremål och dödas varje fiende. Statistikskärmen visar TIME (m:ss),
KILLS (av alla fiender), SECRETS (av alla hemligheter), ACCURACY (träffande skott av avlossade, %) och DEATHS.
