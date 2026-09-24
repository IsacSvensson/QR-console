# BLACKBOX — spelguide

Du är **Eli Voss**, en hackare som tar sig in i AEGIS RESEARCH DIRECTORATE en natt för att ta reda på vad
PROJECT ORACLE är. Eli är ingen actionhjälte: han smyger, hackar och undviker. Det finns inget vapen och
ingen hälsa. Blir du sedd börjar rummet om.

Värdena nedan är hämtade från spelets kod (`defs.asm`, `actors.asm`) och `LAYOUT.md`.

## Ladda spelet

1. Öppna QR Console, till exempel GitHub Pages-sidan eller `npm run preview`.
2. Visa `demo/blackbox.gif` i helskärm på en annan skärm och skanna den med **Scan**. Allt är inläst när
   ungefär 58 av de 87 rutorna har skannats. Det tar cirka 13 sekunder per varv.
3. Spelet sparas i **Library** och fungerar sedan offline.

## Kontroller

| Knapp | I spelet |
|---|---|
| Styrkorset | gå, och vänd dig åt det håll du går |
| **A** | använd det du står vänd mot (terminal, dörr, laddstation, hiss, kabel), bläddra i text, svara *ja* |
| **B** | EMP-puls (när du har hittat EMP:n), svara *nej*, lämna en terminal |
| **A** på titelskärmen | nytt spel |
| **B** på titelskärmen | skriv in en access code (upp/ner byter tecken, vänster/höger flyttar, A bekräftar) |

## Skärmen

- **Rummet:** ett rum är en skärm. Gå ut genom en öppning i kanten för att komma till nästa rum. En
  **V**-ventil i kanten är en krypväg.
- **HUD:n** överst visar avsnitt och EMP-laddningar. Efter serverhall A (6.1) visar den också ORACLE:s
  träffsäkerhet live.
- **Gula prickar** visar en fiendes synlinje. Står du på en prick blir du upptäckt.
- **Röd ram plus `DETECTED. RESTARTING ROOM.`** betyder att du blev sedd. Efter knappt en sekund börjar
  rummet om: fienderna är tillbaka på sina startplatser och du står vid dörren du kom in genom.
- **Andrum:** den första sekunden efter att du kommit in i ett rum, eller efter en omstart, kan ingen
  upptäcka dig. Använd den för att kliva ur synlinjen om någon tittar mot dörren.

## Syn: vad som skyddar dig

| Blockerar synen | Blockerar *inte* synen |
|---|---|
| väggar, hyllor, serverrack, växter, kameror, låsta dörrar, ventiler, hissar | skrivbord, disk, glas (vakter ser över dem), terminaler, laddstationer, öppna dörrar |

Synlinjen går rakt fram från fienden i den riktning den tittar. Den går cell för cell tills något
blockerar. Att stå precis *bredvid* linjen är säkert, men att nudda en fiende räknas som upptäckt.

## Fiender

| Fiend | Syn | Stoppas av EMP? | Beteende | Var |
|---|---|---|---|---|
| **GUARD** (vakt) | 7 rutor rakt fram | nej | patrullerar fram och tillbaka, vänder sig efter en stund eller går i fyrkant | 1.1, 1.3, 2.1, 3.1, 4.4, 5.4 |
| **CAMERA** (kamera) | 8 rutor | ja | sitter på en vägg eller pelare och tittar åt ett håll | 1.4, 2.6, 3.4 |
| **SECURITY DRONE** (drönare) | 5 rutor | ja | flyger en patrullrutt | 3.4, 4.1 (två), 4.3 |
| **HEAVY GUARD** (tung vakt) | 9 rutor | nej | som en vakt, men ser längre | 3.5 |
| **HUNTER** (jägare) | – | ja | sover tills den ser dig åt *valfritt* håll, sedan jagar den dig | 5.1, 5.2 |
| **PROTOTYPE** | – | ja | de fyra i prototyphallen (4.3) är avstängda och ofarliga. Den i slussporten (5.6) vaktar dörren: den följer din rad längs sin kolumn och fångar dig om du kommer för nära | 4.3, 5.6 |
| **ORACLE AGENT** | – | ja | går mot den plats där du *kommer att vara* om en halv sekund. Byt riktning för att lura den | 6.2 |

Vakter kan aldrig besegras, bara undvikas. **Maskiner** (allt i tabellen utom vakterna) kan bedövas med EMP.

## EMP

- Du hittar EMP:n i **vapenförrådet (3.2)**. Den har tre laddningar från början och rymmer som mest fyra.
- **B** bedövar alla maskiner inom 5 rutor i **4 sekunder**. Under den tiden står de still och ser ingenting.
- Ladda om vid en **laddstation** (**E**, använd den med A). Det finns laddstationer i 3.2, 4.1, 4.3 och 6.5.
- Varje EMP-puls lär ORACLE något om dig (se nedan).

## Bossar

- **SECURITY DIRECTOR (4.5, testkammaren):** vaknar en sekund efter att du kommit in. Den vänder sig mot
  dig och skjuter tre pulser längs sin synlinje, och *sedan vänder den ryggen till en stund*. Hacka en av dess
  tre paneler med A medan den står vänd bort. Alla tre paneler behövs.
- **Mätenheten (7.1, kärnhallen):** en stor enhet som följer efter dig. Dess fyra paneler går bara att hacka
  medan den är **EMP-bedövad**. Pulsa, gå fram, hacka, backa, och ladda om vid behov.

## ORACLE och dina val

ORACLE gör åtta förutsägelser om vad *du* kommer att göra, till exempel vilken väg du tar, om du använder
EMP:n och om du litar på Mira. Varje gång den har fel sjunker dess träffsäkerhet med 0,1 procentenhet från
97.4 %. Hur du spelar formar också ORACLE:s bild av dig:

- **Aggressiv:** hur många EMP-pulser du använder.
- **Nyfiken:** hur många frivilliga loggar du läser. Loggar är terminaltexter, bläddra med A.
- **Följsam:** hur ofta du gör som Mira säger.

Spelet har fyra slut. Vilket du får beror på dina val mot slutet, och det finns ett val som ORACLE inte har
räknat med.

## Spara: access codes

När du kommer in i ett nytt avsnitt visas en kod på åtta tecken. Skriv upp den. Med **B** på titelskärmen kan
du fortsätta därifrån. Koden innehåller också ORACLE:s bild av dig.

## Karta och väg genom spelet (lätta spoilers)

| Avsnitt | Rum | Tips |
|---|---|---|
| 0 INTRO | 0.1 | Läs, och gå sedan ut. |
| 1 ENTRÉ | 1.1 grind, 1.2 lobby, 1.3 säkerhetskontroll, 1.4 korridor | Smygskolan. Terminalen i lobbyn ger VISITOR BADGE, som öppnar badge-dörren. Vänta ut vakternas vändningar. |
| 2 ADMINISTRATION | 2.1 kontor, 2.2 kopieringsrum, 2.3 serverskrubb, 2.4 forskarens kontor, 2.5 städförråd, 2.6 chefskontor | Kontorsvakten går i mittgången, så håll dig vid sidorna. Ventilen i städförrådet är en genväg. Chefskontoret ger SECURITY CARD. |
| 3 SECURITY | 3.1 övervakning, 3.3 korsning, 3.2 vapenförråd, 3.4 larmcentral, 3.5 hisshall | I korsningen säger Mira åt dig att gå åt vänster. Vapenförrådet (vänster) har EMP:n och terminalen som öppnar vägen till hissen. Larmcentralen (höger) har en kamera, en drönare och en sanning för den som inte lyder. Den tunga vakten i hisshallen ser långt. |
| 4 LABORATORIUM | 4.1 labbkorridor, 4.2 observation, 4.3 prototyphall, 4.4 kontrollrum, 4.5 testkammare, 4.6 godshiss | Drönarna i labbkorridoren passerar i en takt, så vänta på luckan eller använd EMP:n. Boss 1 väntar i testkammaren. |
| 5 UNDERGROUND | 5.1 bunkertrappa, 5.2 arkiv, 5.3 inre arkiv, 5.4 kylrum, 5.5 tyst terminal, 5.6 slussport | Väck inte jägarna. I kylrummet varnar Mira: *vakten vänder om tre sekunder.* Det stämmer exakt. |
| 6 SERVER COMPLEX | 6.1 serverhall A, 6.2 serverhall B, 6.3 kylkorridor, 6.4 direktörens kontrollpunkt, 6.5 kärnans sluss | ORACLE börjar tala. Lura agenten genom att ändra riktning. Ladda EMP:n fullt i slussen före kärnan. |
| 7 ORACLE CORE | 7.1 kärnhall, 7.2 förgrening, 7.3 kärnan, 7.4 terminalen och kabeln | Boss 2, och sedan valet. |

## Musik

Varje avsnitt har en egen slinga: entrén, administrationen, säkerhetsavdelningen, labbet, underjorden,
serverkomplexet och kärnan. Bossrummen spelar ett larm. ORACLE:s tema börjar i kärnans sluss (6.5).
