# SIXTENS EXPEDITION — naturboken

De 40 uppslagen (DESIGN.md §8.2–8.3). Tabellen är källan till spelets texter: generatorn (`tools/naturbok.ts`)
skriver dem som glyfindex, och testerna jämför ROM/xdata med den. Ordningen är bitordningen i sparkoden (§10.2):
uppslag 1 är bit 1.

**Format:** versaler i spelets font. Texten bryts vid ord till rader på högst 20 tecken, två rader per sida, högst
tre sidor. **Kontroll:** ✓ Claude = Claude har läst källan och texten stämmer med den (2026-10-07). ☐ du = din egen
granskning (manuell, D-044).

| # | Uppslag | Kategori | Värld | Text | Källa | Kontroll |
|---:|---|---|---:|---|---|---|
| 1 | TROMB | väder | 1 | EN VIRVELVIND SOM NÅR NER TILL MARKEN FRÅN ETT ÅSKMOLN. I SVERIGE SES NÅGRA VARJE SOMMAR. GÅ ALDRIG NÄRA. | SMHI, kunskapsbanken: tromber | ✓ Claude · ☐ du |
| 2 | VIND | väder | 1 | VIND ÄR LUFT SOM RÖR SIG. VINDEN FÅR NAMN EFTER HÅLLET DEN BLÅSER IFRÅN. | SMHI, kunskapsbanken: vind | ✓ Claude · ☐ du |
| 3 | RÄV | djur | 1 | RÄVEN ÄR ETT HUNDDJUR. DEN JAGAR SORK OCH MÖSS OCH HÖR DEM UNDER SNÖN. | Naturhistoriska riksmuseet: räv | ✓ Claude · ☐ du |
| 4 | IGELKOTT | djur | 1 | IGELKOTTEN HAR TUSENTALS TAGGAR. DEN SOVER HELA VINTERN. | Naturhistoriska riksmuseet: igelkott | ✓ Claude · ☐ du |
| 5 | GRAN | växter | 1 | GRANEN ÄR ETT AV SVERIGES VANLIGASTE TRÄD. KOTTARNA HÄNGER NEDÅT. | SLU, Riksskogstaxeringen; Skogsstyrelsen | ✓ Claude · ☐ du |
| 6 | BLÅBÄR | växter | 1 | BLÅBÄRSRIS VÄXER I SKOGEN. BÄREN MOGNAR I JULI OCH AUGUSTI. | SLU, Artdatabanken: blåbär | ✓ Claude · ☐ du |
| 7 | FLYTTBLOCK | sten och mark | 1 | EN STOR STEN SOM INLANDSISEN FLYTTADE. DEN KAN LIGGA LÅNGT FRÅN BERGET DEN KOM IFRÅN. | SGU: flyttblock | ✓ Claude · ☐ du |
| 8 | ROTVÄLTA | landskap | 1 | NÄR ETT TRÄD BLÅSER OMKULL FÖLJER RÖTTERNA MED. GÅ INTE NÄRA: DEN KAN RESA SIG IGEN. | Skogsstyrelsen och Länsstyrelsen: stormfälld skog | ✓ Claude · ☐ du |
| 9 | STORM | väder | 2 | STORM ÄR VIND PÅ MINST 25 METER PER SEKUND. STANNA INNE OCH GÅ INTE I SKOGEN. | SMHI: vindskala; Krisinformation: storm | ✓ Claude · ☐ du |
| 10 | KORP | djur | 2 | KORPEN ÄR SVERIGES STÖRSTA KRÅKFÅGEL. DEN KAN HÄRMA LJUD. | Naturhistoriska riksmuseet: korp | ✓ Claude · ☐ du |
| 11 | HACKSPETT | djur | 2 | HACKSPETTEN HACKAR I TRÄD EFTER INSEKTER OCH FÖR ATT GÖRA BO. | Naturhistoriska riksmuseet: hackspettar | ✓ Claude · ☐ du |
| 12 | EKORRE | djur | 2 | EKORREN GÖMMER KOTTAR OCH NÖTTER TILL VINTERN. DEN SOVER INTE HELA VINTERN. | Naturhistoriska riksmuseet: ekorre | ✓ Claude · ☐ du |
| 13 | TALL | växter | 2 | TALLEN KAN BLI ÖVER 500 ÅR GAMMAL. DEN VÄXER GÄRNA PÅ TORR SANDMARK. | SLU; Skogsstyrelsen | ✓ Claude · ☐ du |
| 14 | LINGON | växter | 2 | LINGONEN MOGNAR I AUGUSTI OCH SEPTEMBER. RISET ÄR GRÖNT ÄVEN PÅ VINTERN. | SLU, Artdatabanken: lingon | ✓ Claude · ☐ du |
| 15 | GRANIT | sten och mark | 2 | GRANIT ÄR EN VANLIG BERGART I SVERIGE. DEN BILDADES DJUPT NERE AV SMÄLT BERG. | SGU: granit | ✓ Claude · ☐ du |
| 16 | RULLSTENSÅS | sten och mark | 2 | EN LÅNG KAM AV GRUS OCH SAND. DEN BILDADES AV ÄLVAR UNDER INLANDSISEN. | SGU: rullstensåsar | ✓ Claude · ☐ du |
| 17 | REGN | väder | 3 | REGN BILDAS NÄR SMÅ DROPPAR I MOLNEN SLÅR IHOP OCH BLIR FÖR TUNGA. | SMHI, kunskapsbanken: nederbörd | ✓ Claude · ☐ du |
| 18 | GRODA | djur | 3 | GRODAN LÄGGER ROM I VATTEN. UR ROMMEN KOMMER GRODYNGEL. | Naturhistoriska riksmuseet: groddjur | ✓ Claude · ☐ du |
| 19 | BÄVER | djur | 3 | BÄVERN FÄLLER TRÄD MED TÄNDERNA OCH BYGGER DAMMAR. | Naturhistoriska riksmuseet: bäver | ✓ Claude · ☐ du |
| 20 | VITMOSSA | växter | 3 | VÄXER I MYREN OCH KAN SUGA UPP MYCKET MER VATTEN ÄN DEN VÄGER. | SGU: torv och myrar; SLU | ✓ Claude · ☐ du |
| 21 | MYR | landskap | 3 | EN MYR ÄR BLÖT MARK DÄR TORV BILDAS AV DÖDA VÄXTER. GÅ RUNT OM DU KAN. | SGU: torv och myrar | ✓ Claude · ☐ du |
| 22 | BÄCK | landskap | 3 | EN BÄCK ÄR ETT LITET VATTENDRAG. EFTER MYCKET REGN KAN DEN BLI STRID: GÅ INTE I STRÖMMANDE VATTEN. | MCF: översvämning | ✓ Claude · ☐ du |
| 23 | KÄLLA | landskap | 3 | I EN KÄLLA KOMMER GRUNDVATTEN UPP UR MARKEN. | SGU: grundvatten | ✓ Claude · ☐ du |
| 24 | LERA | sten och mark | 3 | LERA ÄR MYCKET FINA KORN SOM HÅLLER KVAR VATTEN. SLÄNTER AV LERA KAN RASA EFTER REGN. | SGU: lera; MCF: ras och skred | ✓ Claude · ☐ du |
| 25 | ÅSKA | väder | 4 | STÅ ALDRIG UNDER ETT ENSAMT TRÄD. GÅ NER PÅ KNÄ I EN SVACKA, FÖTTERNA IHOP. | SMHI: skydd mot blixten | ✓ Claude · ☐ du |
| 26 | BLIXT | väder | 4 | EN BLIXT ÄR EN STOR GNISTA. RÄKNA SEKUNDERNA TILL MULLRET: 3 SEKUNDER ÄR UNGEFÄR 1 KILOMETER. | SMHI, kunskapsbanken: åska | ✓ Claude · ☐ du |
| 27 | BYMOLN | väder | 4 | ETT HÖGT, TORNANDE MOLN. DET KAN GE ÅSKA, HAGEL, SKYFALL OCH IBLAND EN TROMB. | SMHI, kunskapsbanken: moln och tromber | ✓ Claude · ☐ du |
| 28 | DIMMA | väder | 4 | DIMMA ÄR ETT MOLN SOM LIGGER PÅ MARKEN. I DIMMA HJÄLPER KARTA OCH KOMPASS. | SMHI, kunskapsbanken: dimma | ✓ Claude · ☐ du |
| 29 | BJÖRK | växter | 4 | BJÖRKEN HAR VIT NÄVER. DEN ÄR ETT AV DE FÖRSTA TRÄDEN SOM VÄXER UPP EFTER EN STORM. | Skogsstyrelsen: lövträd | ✓ Claude · ☐ du |
| 30 | ÖRNBRÄKEN | växter | 4 | EN STOR ORMBUNKE. DEN HAR INGA BLOMMOR UTAN SPRIDER SIG MED SPOROR. | SLU, Artdatabanken: örnbräken | ✓ Claude · ☐ du |
| 31 | KANTARELL | växter | 4 | KANTARELLEN ÄR GUL. PLOCKA BARA SVAMP DU SÄKERT KÄNNER IGEN, TILLSAMMANS MED EN VUXEN. | Livsmedelsverket: svamp | ✓ Claude · ☐ du |
| 32 | JÄTTEGRYTA | sten och mark | 4 | ETT RUNT HÅL I BERGET. VATTEN UNDER INLANDSISEN SNURRADE STENAR SOM SLIPADE UT DET. | SGU: jättegrytor | ✓ Claude · ☐ du |
| 33 | ÄLG | djur | 5 | ÄLGEN ÄR SVERIGES STÖRSTA DÄGGDJUR PÅ LAND. GÅ INTE NÄRA EN ÄLGKO MED KALV. | Naturhistoriska riksmuseet: älg | ✓ Claude · ☐ du |
| 34 | HUGGORM | djur | 5 | SVERIGES ENDA GIFTORM. DEN ÄR SKYGG. GÅ RUNT OCH LÅT DEN VARA. SÄG TILL EN VUXEN OM NÅGON BLIR BITEN. | Naturhistoriska riksmuseet: huggorm; 1177: ormbett | ✓ Claude · ☐ du |
| 35 | MYRA | djur | 5 | MYROR BYGGER STACKAR AV BARR. EN STACK KAN HA ÖVER 100 000 MYROR. | Naturhistoriska riksmuseet: myror | ✓ Claude · ☐ du |
| 36 | FLUGSVAMP | växter | 5 | RÖD FLUGSVAMP ÄR GIFTIG. ÄT ALDRIG SVAMP DU INTE KÄNNER IGEN. | Livsmedelsverket: svamp; Giftinformationscentralen | ✓ Claude · ☐ du |
| 37 | SAND | sten och mark | 5 | SAND ÄR SMÅ KORN AV STEN, OFTA KVARTS. DEN HAR SLIPATS AV VATTEN OCH IS. | SGU: sand och grus | ✓ Claude · ☐ du |
| 38 | KALKSTEN | sten och mark | 5 | KALKSTEN BILDADES AV SKAL PÅ HAVSBOTTEN. I DEN KAN MAN HITTA FOSSIL. | SGU: kalksten | ✓ Claude · ☐ du |
| 39 | DIKE | landskap | 5 | ETT DIKE LEDER BORT VATTEN. VID EN TROMB ÄR ETT DIKE ETT SKYDD OM DU INTE HINNER IN: HUKA DIG. | DESIGN §1.3 S3 (NWS; ingen svensk källa hittad) | ✓ Claude · ☐ du |
| 40 | SÄNKA | landskap | 5 | EN GROP I MARKEN. VID ÅSKA I ÖPPEN TERRÄNG: GÅ NER PÅ KNÄ I EN SÄNKA MED FÖTTERNA IHOP. | SMHI: skydd mot blixten | ✓ Claude · ☐ du |
