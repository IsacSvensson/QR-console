# Sixtens expedition: guide för föräldrar (och för Sixten)

Sixten är nio år och springer orientering. Han har en karta, en kompass och en ryggsäck, men inget vapen och inga
fiender. Det som är farligt är vädret: vind, en tromb, fallande träd, ras, högt vatten och åska. Spelet har fem
världar med fyra banor var och en naturbok med 40 uppslag. Det finns ingen tidsgräns. Den som får `AJ!` förlorar ett
hjärta och börjar om vid senaste stämplade kontroll.

## Så får du in spelet

1. Öppna QR Console på telefonen eller surfplattan och tryck **SKANNA**.
2. Rikta kameran mot den animerade QR-koden `demo/sixten.gif` på en dator. Håll still tills mätaren når 100 %.
   Spelet är cirka 19 KB, så det tar ungefär en halv minut.
3. Tryck **SPELA**. Spelet ligger sedan kvar i biblioteket och fungerar utan nät.

Spelet kräver en QR Console med stöd för ISA 2. En äldre app visar att spelet behöver en nyare version.

## Knappar

| Knapp | Uppifrån | I en sidovy (grotta, brant, ravin) | Kartan och menyerna |
|---|---|---|---|
| Styrkorset | gå | ←/→ gå, ↑/↓ klättra | välja |
| A | undersöka, bygga, ta trä, gå in. Raden längst ned visar vad A gör just nu | hoppa (håll för högre) | OK |
| B | kartan (spelet står still så länge den är öppen) | kartan | tillbaka |
| stå still | i ett dike, en sänka eller stugan hukar Sixten: då är han i skydd | i lä bakom något hukar han | – |

På telefonen styr vänster tumme korset och höger tumme A och B. På datorn gäller pilarna, Z (A) och X (B). Man
behöver aldrig trycka på två saker samtidigt.

## Att tänka på

- **Kontrollerna** stämplas av sig själva när Sixten går in på dem (`BIP!`). De obligatoriska är numrerade på
  kartan och tas i ordning. Några är frivilliga och en är hemlig.
- **Kartan** visar hela banan, men inte var Sixten är. På en korsning eller vid en kontroll står det
  `DU ÄR HÄR!`. Då kan man trycka A och ställa en kurs mot nästa kontroll: kompassen visar hållet och stegen räknas.
  Norr är alltid uppåt.
- **Vinden varnar alltid först.** Himlen mörknar, gräset böjer sig, löv flyger och skogen knakar, minst ett par
  sekunder innan något händer. Tromben kommer på samma sätt varje gång och följer aldrig efter Sixten.
- **Skydd:** vid storm och tromb är skogen farlig. Ett dike, en sänka eller en stuga skyddar: gå dit och stå
  still. Vid åska är ensamma träd, kalfjället och vatten farliga. Huka i en sänka tills åskan har gått över.
- **Rinnande vatten** är aldrig den säkra vägen, inte heller när det ser grunt ut.
- **Gurka** visar på kartan var Sixten är, **chips** gör honom snabb och **choklad** gör att vinden inte knuffar
  honom. Choklad skyddar inte mot tromben.
- **Trä** från fallna träd kan bli en bro eller en stege på en byggplats. Det är alltid frivilligt: det finns en
  annan väg.
- **Naturboken:** A vid ett djur, en växt eller en sten ger ett uppslag (`PLING!`). B på världskartan öppnar boken.

## Spara med koden

Spelet minns ingenting när det stängs. Världskartan visar därför en **kod på tio bokstäver** längst ned. Skriv upp
den eller ta en skärmbild när en ny värld börjar.

Så fortsätter man en annan gång: tryck **B** på titelskärmen, välj bokstäverna med ↑/↓ (←/→ flyttar mellan dem)
och tryck **A**. Sixten hamnar på världskartan i rätt värld, med alla uppslag i naturboken. Om en bokstav är fel
står det `FEL KOD. FÖRSÖK IGEN`. Koden har inga I, O, 0 eller 1, så de kan inte förväxlas.

Kontroller och trä på banorna sparas inte. Banorna går alltid att spela om.

## Fakta och säkerhetsråd

Säkerhetsråden i spelet (skydd vid storm, tromb och åska, fallande träd, vatten) kommer från MSB och SMHI. Varje råd
och vart och ett av naturbokens 40 uppslag har en källa i `DESIGN.md` (§1.3) och `NATURBOK.md`. Claude har kontrollerat
dem mot källorna. **Bocken för din granskning är din att sätta.** Ett råd (diket som skydd mot en tromb) har bara en
amerikansk källa (NWS).

Spelet är ett spel. Det ersätter inte riktiga råd: vid varning för storm eller åska gäller SMHI:s varningar och
MSB:s råd på krisinformation.se.

## För den nyfikna föräldern

- ↓ + B på titelskärmen öppnar ett bankort med alla banor och fyra testbanor, som användes när spelet byggdes.
- Spelet körs i QR Consoles lilla virtuella maskin. Varje bana är testad automatiskt med inspelade körningar,
  bildruta för bildruta: en säker väg genom alla 20 banor utan ett enda `AJ!`, och en väg där allt samlas in. Vad
  som är testat och vad som inte är det står i `REPORT.md`.
- **Inte testat av datorn:** om spelet är roligt för en nioåring, om kartan och tromben går att läsa på en riktig
  telefon och om Sixten lär sig rätt sak. Det får Sixten avgöra.
