# Bo's Skateäventyr: guide för föräldrar (och för Bo)

Bo åker skateboard genom fem världar för att få tillbaka sin bräda från den hungriga måsen. Spelet har 25 banor,
60 stjärnor och sju brädor att samla. Det finns ingen tidsgräns och ingen poängjakt. Den som ramlar börjar om vid
senaste flaggan.

## Så får du in spelet

1. Öppna QR Console på telefonen eller surfplattan och tryck **SKANNA**.
2. Rikta kameran mot den animerade QR-koden `demo/bo.gif` på en dator. Håll still tills mätaren når 100 %.
   Det tar ungefär en halv minut för spelets cirka 23 KB.
3. Tryck **SPELA**. Spelet ligger sedan kvar i biblioteket och fungerar utan nät.

Spelet kräver en QR Console med stöd för ISA 2. En äldre app visar att spelet behöver en nyare version.

## Knappar

| Knapp | På marken | I luften |
|---|---|---|
| ← / → | rulla åt det hållet; åt andra hållet bromsar Bo | styra lite |
| A | hoppa (håll för högre hopp); hoppa av ett räcke | – |
| B | – | trick: B = kickflip, ↑+B = shove-it, ↓+B = grab, ←/→+B = 360 |
| ↓ | huka (under grenar och bommar), håll för att stanna | – |

På telefonen styr vänster tumme pilarna och höger tumme A och B. På datorn gäller pilarna, Z (A) och X (B).
Bo rullar vidare av sig själv, så man behöver sällan trycka på två saker samtidigt.

## Att tänka på

- **Äpplen** ligger i bågar som visar hur hoppet ska gå. Med 100 äpplen får Bo ett extra liv.
- **Stora äpplet** (i lådor) blir en hjälm som tål en smäll. **Pommes** gör att det går fort (musiken går också
  fortare). **Godis** ger ett extra hopp mitt i luften med B.
- **Stjärnor**: tre på varje vanlig bana. Den tredje ligger ofta på en hemlig väg. Bo säger `KOLLA!` när han
  är nära.
- **Skate-delar**: en på varje vanlig bana. Med alla fyra delar i en värld får Bo den världens bräda. Han byter
  bräda med B på kartan.
- **Bossar**: hoppa på måsen när den är yr, led kaninen till bäcken och tryck tre gånger på bulldozerns STOP-knapp.
  I finalen behöver man göra ett trick för att nå boet.
- **Försök igen**: vid game over börjar banan om med 5 liv. Äpplen, stjärnor och delar finns kvar.

## Spara med bildkoden

Spelet minns ingenting när det stängs. Kartan visar därför **fyra små bilder** uppe till höger, och de är spelets
sparkod. **Ta en skärmbild av kartan** när en ny värld börjar.

Så fortsätter man en annan gång: tryck **B** på titelskärmen, välj samma fyra bilder med ↑/↓ (←/→ flyttar mellan
bilderna) och tryck **A**. Bo hamnar på kartan i rätt värld, med brädorna han har låst upp och stjärnorna från de
världar där han tog alla. Om en bild är fel står det `FEL KOD`.

Stjärnorna från en värld där inte alla tolv är tagna sparas inte i koden. Banorna går alltid att spela om.

## Hemligheter (läs inte högt om Bo vill upptäcka själv)

- Banorna har hemliga vägar bakom häckar och ovanför molnen. Godispåsar brukar ligga nära dem.
- Med alla 60 stjärnor får Bo **guldbrädan**.
- Efter finalen låses supertricket **SUPERBOSSE** upp: åk snabbt upp för en ramp, tryck ↑ och sedan ↓, och
  tryck ←/→ tillsammans med B i luften. Koden efter slutet (värld "6") har med det.

## För den nyfikna föräldern

- Fyra Bo-bilder som kod öppnar testbanorna (fysik, fiender), som användes när spelet byggdes.
- Spelet körs i QR Consoles lilla virtuella maskin. Varje bana är testad automatiskt med inspelade körningar,
  bildruta för bildruta. Vad som är testat och vad som inte är det står i `REPORT.md`.
- **Inte testat av datorn:** om spelet är roligt för en sexåring, om bubblorna går att läsa och om
  pekkontrollerna känns bra. Det får Bo avgöra.
