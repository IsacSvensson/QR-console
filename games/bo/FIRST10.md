# BO'S SKATEÄVENTYR — de första tio minuterna

Status: **utkast för granskning.** Detta dokument spikar hur de första tio minuterna ska kännas: titeln, introt,
bana 1-1 kolumn för kolumn och början av 1-2. Här avgörs om spelet blir *Bo på skateboard* eller bara *ett
plattformsspel med en skateboard*. Det är specifikationen för 1-1 och 1-2 i M22, och reglerna i §8 kontrolleras av
testerna (PLAN.md Part 3). Mekaniken finns i `DESIGN.md`. Här bestäms bara hur den används i början.

---

## 1. Vad Bo ska känna

Varje halvminut ska något hända som är *skateboard*, inte plattformsspel. Bo ska rulla, susa nedför, poppa en ollie,
flyga från en ramp, bromsa så att det dammar och kickflippa. Det första han gör är att rulla nedför sin egen
uppfart. Han hoppar inte på något.

| När (ungefär) | Första gången Bo … | Det ska kännas som |
|---|---|---|
| 0:01 efter första → | rullar och sparkar med foten | "Jag åker!" |
| 0:03 | tar äpplen som plingar i stigande toner | "Mer!" |
| 0:08 | susar nedför gropen i gatan och lutar sig framåt | fart, gratis |
| 0:15 | poppar en ollie över en soptunna efter äppelbågen | "Jag kan hoppa!" |
| 0:35 | landar på en låda som går sönder och ger äppelhjälmen | "Wow, en hjälm!" |
| 0:50 | landar på en snigel: `POFF`, den blir ett äpple | humor, inte våld |
| 1:10 | flyger 12 tiles från en ramp, landar och **tittar bakåt** | "Såg du?" |
| 1:40 | hittar en hemlig gång genom en häck: `KOLLA!` | "Jag hittade något!" |
| 2:00 | bromsar in vid målet: `JAG GJORDE DET!` | stolthet |
| 3:00 | studsar på en studsmatta upp till en stjärna (1-2) | högt! |
| 3:30 | trycker B och gör en KICKFLIP (1-2) | "Ett riktigt trick!" |
| 4:30 | gör två tricks i samma hopp: `SÅG DU?!` (1-2) | vill visa någon |

Målet för första spelstunden: Bo vill spela **en gång till** och vill **visa någon**.

## 2. Tre löften

1. **Bo kan inte misslyckas i början.** Fram till flagga 1, ungefär den första minuten, finns inga gropar, inget
   vatten och inga fiender. Väggar och tunnor gör aldrig illa, de stoppar bara. Den första fienden kommer efter
   lådan med äppelhjälmen. Lådan ligger mitt i vägen, och äppelbågen leder ned på den. 1-1 och 1-2 har inga gropar
   alls. Gropar kommer först i 1-4.
2. **Ingen text behövs.** Allt lärs ut med banans form, äpplen (DESIGN §8.4) och tre skyltar med bilder:
   `→`, A-knappen med en uppåtpil och B-knappen med en snurrande bräda. Bubblorna är krydda.
3. **Ingen väntan.** Första gången går introt direkt in i 1-1, utan karta. Banans namn visas som en banderoll medan
   Bo redan kan åka.

## 3. Titelskärmen

- Bakgrunden är gatan ur 1-1 med Bos röda stuga och moln som driver.
- Bo rullar in från vänster med push-sparkar, poppar en ollie och bromsar in mitt på skärmen. Han lutar sig bakåt
  och det dammar. Sedan balanserar han på brädan (signatur, DESIGN §0.2).
- Titeln står i bubbelfonten på en ljus banderoll: `BO'S` / `SKATEÄVENTYR`.
- En A-knapp pulserar under Bo. **Alla knappar utom B startar spelet.** B öppnar bildkoden.
- Titelmusiken spelar.

## 4. Introt (cirka 15 s, A hoppar över)

| Sekund | Bild | Ljud och bubbla |
|---|---|---|
| 0–3 | Bo sitter på trappan framför stugan med en pommespåse | `MUMS!` |
| 3–5 | en skugga växer på gräset | `SKRIII!` |
| 5–7 | Stora Måsen dyker ned, tar påsen och flyger åt höger | vingslag |
| 7–10 | Bo står upp | `NEJ! MINA POMMES!` |
| 10–13 | Bo hoppar upp på brädan | `VÄNTA, MÅSEN!` |
| 13– | 1-1 börjar med Bo på gräsmattan. Måsen syns långt bort till höger | banderoll `1-1 UPPFARTEN` |

Introt säger allt barnet behöver veta: **åk åt höger, efter måsen.**

## 5. Bana 1-1 Uppfarten, kolumn för kolumn

En skärm hög (16 rader). En kolumn = 8 px. Bo pushar i 1,5 px per bildruta ≈ 11 kolumner per sekund. Höjder anges
i tiles över gatan (h0 = gatan). Längd: 208 kolumner. Ett barn som spelar för första gången behöver cirka 2 minuter.

```
0         20        40        60        80        100       120       140       160       180       200
|         |         |         |         |         |         |         |         |         |         |
      oooooo         o     *1                                   o o *2 o o  o o *3
 HUS                  T  T   TT     ?   ? F     S    S                 F T[G] {H}                   M
‾‾‾‾\_________\__/_____________________________________/‾‾\___/|____\_/______________________/|_________
```

Ett tecken = 2 kolumner. `o` äpplen, `*1`–`*3` stjärnorna, `T` soptunna, `?` låda, `F` flagga, `S` snigel,
`/|` kicker, `[G]` garaget, `{H}` den glesa häcken i förgrunden, `M` mål, `‾` gräsmattan vid stugan.

### 5.1 Avsnitten

| Kolumner | Avsnitt | Mark | Innehåll | Bo lär sig (utan text) | Om Bo inte gör det |
|---|---|---|---|---|---|
| 0–9 | **Hemma** | gräsmatta h1 (0–7), uppfarten ned 22,5° (8–9) | stugan (1–5, bakgrund), Bo startar vid kolumn 6 vänd åt höger. 2 äpplen framför stugan (2–3), 3 äpplen längs uppfarten (8–10) | → = åka. Ett tryck räcker: uppfarten tar honom vidare | **ingen knapp:** efter 3 s gör Bo ett litet trick på stället, och → blinkar ovanför honom. Efter 8 s balanserar han. **håller ←:** vänder och tar de 2 äpplena vid stugan (liten belöning för att utforska) |
| 10–27 | **Första rullningen** | plan h0 | skylt `→` (11), äppelrad på åkhöjd (13–24, 12 äpplen, varje äpple en ton högre) | att rulla och att han fortsätter rulla när man släpper | – |
| 28–36 | **Gropen i gatan** | ned 22,5° (28–29) till h−1, plan (30–33), upp 22,5° (34–35) | äpplen som följer gropen | backe = gratis fart. Han lutar sig framåt i botten | – |
| 37–52 | **Första hoppet** | plan h0 | A-skylt (40). Soptunna 2 tiles hög (45) med äppelbåge från kolumn 42. Soptunna (51) med båge från 48 | A = hopp. Följ bågen | **kör in i tunnan:** stannar mjukt och vinglar, `OJ!`, ingen skada. Efter 2 s stilla blinkar A ovanför honom |
| 53–66 | **Längre hopp** | plan h0 | två tunnor i rad (58–59) med en längre båge från 54. **★1** ovanför bågens topp | håll A = högre. Fart = längre | **för kort hopp:** landar på första tunnan (den är en plattform) och hoppar vidare |
| 67–84 | **Landa på lådor** | plan h0 | låda (72) med en båge som slutar *på* lådan. Den ger **STORA ÄPPLET**: `ÄPPELHJÄLM!`. Låda (80) som sprutar ut 5 äpplen | att landa på saker ger något bra | **kör in i lådan:** stannar, och A blinkar |
| 85 | **Flagga 1** | | | | |
| 86–110 | **Första snigeln** | plan h0 | snigel (96) som kryper åt vänster, 0,25 px per bildruta, med båge över. Snigel (106) | hoppa över fiender eller landa på dem: `POFF`, äpple, Bo studsar | **nuddar snigeln:** `AJ!`, äpplet trillar av hjälmen och Bo åker vidare. Hjälmen skyddade, och det syns |
| 111–125 | **Backen och rampen** | upp 22,5° (111–114) till h2, krön (115–118), ned 45° (119–120), plan (121–124), kicker 45° (125) | A-skylt (121). Äppelbåge från kickerns kant som är räknad för ollie vid kanten | **ramp + A vid kanten = flyga** | **utan A:** ett litet skutt (8 px, 4 tiles). Han ser äpplena högt ovanför och kan rulla tillbaka och försöka igen |
| 126–141 | **Landningen** | plan, ned 22,5° (137–138) till h−1, upp (140–141) | **★2** högst upp i rampbågen (8 tiles över gatan, kräver A vid kanten) | att landa i en nedförsbacke ger fart. **Bo tittar bakåt** efter landningen | – |
| 142 | **Flagga 2** | | | | |
| 143–170 | **Garaget och häcken** (frivilligt) | plan h0 | soptunna (146) som trappsteg. Garaget (148–154) ligger i bakgrunden, men taket på h3 är en envägsplattform. Äpplen på taket leder åt höger. En **gles häck i förgrunden** (155–160, h4–h6) med ett äpple som sticker ut. Bakom den finns golv på h3 med **★3** och skate-delen **HJUL** | **KOLLA!** Nyfikenhet lönar sig. Ett äpple som sticker ut ur något betyder att något finns där | de flesta åker förbi på gatan, och det är meningen. Häcken är så gles att man ser Bo inne i den |
| 171–199 | **Upploppet** | plan h0 | äppelrad, liten kicker (186) med båge: ett sista glädjehopp | – | – |
| 200 | **Mål** | | målflagga | Bo bromsar in, lutar sig bakåt och det dammar: `JAG GJORDE DET!`. Måsen flyger förbi med pommespåsen (`SKRII!`) | |
| 208 | slut | | | | |

### 5.2 Hoppen i 1-1 (räknade med fysiken i DESIGN §3)

| Hopp | Fart | Resultat |
|---|---|---|
| ollie över en soptunna (2 tiles) | 1,5 px per bildruta | fötterna är över tunnan från 11 till 41 px efter avstampet. Avstampet får ske var som helst inom ungefär en tile, och det är förlåtande |
| kickern utan A | 1,8 px per bildruta vid kanten (efter backen) | 8 px högt, 4 tiles långt |
| **kickern med A vid kanten** | 1,8 px per bildruta | **64 px högt (8 tiles), 0,9 s i luften, 12 tiles långt** |

Äppelbågarna räknas fram av generatorn från samma fysik (DESIGN §14.1). Följer man äpplena gör man precis det
hopp som fungerar.

### 5.3 Det Bo hör

- **Hjulen:** ett mjukt rullande brus som följer farten, och ett klick vid varje skarv i trottoaren (var 16:e px).
  Farten hörs: klick, klick, klick-klick-klick.
- **Ollie:** `pop`. **Landning:** `klonk`. **Broms:** `skrrr`. **Äpplen:** stigande toner i en rad.
- **Musiken** i värld 1 är glad och enkel och börjar när Bo börjar åka.

## 6. Kartan första gången (cirka 10 s)

Värld 1:s karta är en väg med fem stopp. Bos huvud vandrar själv från 1-1 till 1-2. Måsen flyger över kartan med
pommespåsen och landar vid skateparken (1-5): `SKRII!`. Barnet ser målet. A startar 1-2, och ←/→ väljer bland
banor som redan är öppna. Stjärnor (☆☆☆) och delar visas under varje stopp.

## 7. Bana 1-2 Trädgården, de första tre minuterna

| Tid | Avsnitt | Innehåll | Bo lär sig |
|---|---|---|---|
| 0:00 | Slänten | gräsmattan sluttar ned 22,5° | backe = fart (repetition) |
| 0:10 | **Studsmattan** | studsmatta med en **äppelpelare** rakt upp till **★1** | studs = högt. Pelare = upp |
| 0:25 | **B-skylten** | B-skylt före en kicker. Lång äppelbåge | **första tricket:** B i luften blir KICKFLIP. Texten `OLLIE + KICKFLIP 100` visas och Bo får fart |
| 0:45 | Äppelträdet | getingar flyger i cirklar runt trädet, äpplen i gräset under | att undvika fiender som flyger |
| 1:10 | **Igelkotten** | en igelkott i en svacka, med en båge högt över den | den här kan man inte landa på (`AJ!`) |
| 1:30 | Flagga 1 | | |
| 1:40 | **Två kickers** | två kickers efter varandra och en båge med tid för två tricks | kombo: `SÅG DU?!` |
| 2:10 | Hemligheten | (som i 1-1, nu bakom en buske) | `KOLLA!` igen. Nu vet han att han ska leta |
| 2:40 | Mål | | `JAG GJORDE DET!` |

Efter tio minuter har Bo klarat två banor och sett måsen tre gånger. Han kan rulla, hoppa, landa på saker, flyga
från en ramp och kickflippa, och han vet att äpplen visar vägen.

## 8. Regler som testerna kontrollerar (M22)

Kontrolleras mot `levels/1-1.lvl`, `levels/1-2.lvl` och inspelade repriser:

1. Det finns inga gropar, inget vatten och inga fiender före flagga 1 i 1-1, och inga gropar eller inget vatten alls
   i 1-1 och 1-2.
2. Det första äpplet ligger högst 4 kolumner från Bos startplats.
3. Stora äpplet kommer före den första fienden i 1-1.
4. **Äpplen ljuger aldrig:** för varje äppelmönster i värld 1 finns en reprisrutt som följer mönstret, tar alla dess
   äpplen och inte förlorar något liv.
5. Varje skylt (`→`, A, B) står minst 3 kolumner före första stället där den behövs.
6. En reprisrutt utan knapptryck i 10 s visar det lilla tricket vid 3 s, en blinkande → vid 3 s och balansen vid
   8 s. Bos position och träffbox ändras inte under tiden.
7. En reprisrutt som kör in i första tunnan utan att hoppa förlorar inget liv, och A blinkar efter 2 s.
8. Bo rör sig i samma bildruta som → trycks första gången.
9. En referensrutt klarar 1-1 på högst 2 minuter med alla tre stjärnor och hjulet.

## 9. Bo-testet: så observerar du

Låt Bo spela utan hjälp och utan att förklara. Sitt bredvid och anteckna. Svaren går in i `PROGRESS.md`, och
konstanterna i DESIGN §3.2 justeras efter dem.

| # | Titta efter | Bra tecken |
|---|---|---|
| 1 | Hittar han → på egen hand? | inom 10 s |
| 2 | Hoppar han över första tunnan? | inom 3 försök |
| 3 | Följer han äppelbågarna? | han försöker ta alla |
| 4 | Hittar han A vid rampen och ★2? | inom 2 försök, eller så kommer han tillbaka för den |
| 5 | Trycker han B när B-skylten kommer (1-2)? | ja, och han gör om det |
| 6 | När skrattar han? | `POFF`, att Bo tittar bakåt, `SÅG DU?!` |
| 7 | Läser han bubblorna, eller frågar han vad det står? | båda är bra |
| 8 | Var tappar han tålamodet? | ingenstans de första 5 minuterna |
| 9 | Vill han spela en gång till efter 1-1? | ja |
| 10 | Visar han någon något ("titta!")? | ja |
