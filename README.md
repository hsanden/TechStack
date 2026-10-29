# TechStack

Kartlägger den tekniska uppsättningen hos stora svenska e-handelssajter, med fokus på **e-handelsplattform och CMS**. Verktyget hittar också betalning, frakt, sök, e-post/CRM, analys, annonsering, omdömen, samtyckesverktyg, kundtjänst, A/B-test och CDN/hosting.

Webbplatsen är statisk och listar alla sajter med filtren *har teknik*, *har inte teknik*, bransch och plattform. Den har också statistik per plattform och CMS, en sida per sajt med bevis för varje träff, en sida per teknik, en ändringslogg och CSV-export.

## Kom igång

```bash
npm install
npx playwright install chromium   # krävs för webbläsarläget

npm run scan        # skannar alla sajter i data/sites.json (~10 min)
npm run build       # bygger public/
npm run serve       # http://localhost:8080
npm test
```

Flaggor till `scan`:

| Flagga | Betydelse |
|---|---|
| `--only=ellos.se,cdon.se` | skanna bara vissa sajter (resten behålls) |
| `--mode=http` | ingen webbläsare: snabbt, men missar JS-laddade taggar |
| `--concurrency=6` | antal parallella sajter (standard 4) |
| `--limit=20` | bara de första N sajterna |
| `--dump` | spara rådata (HTML, URL:er, cookies, headers) i `.cache/dump/` för felsökning |
| `--from-dump` | kör om detekteringen på sparad rådata utan nätverk, praktiskt när du justerar signaturer |

## Så fungerar det

1. **`src/fetch.js`** öppnar startsidan i Chromium (Playwright), klickar "Acceptera alla" i cookiebannern så att marknadsföringstaggar laddas och samlar sedan rå och renderad HTML, svarshuvuden, cookies, alla nätverksanrop och globala JS-variabler. Utan Playwright, eller om sajten blockerar, används en vanlig HTTP-hämtning.
2. **`src/technologies.js`** är signaturdatabasen. Varje teknik har mönster för URL:er, HTML, headers, cookies, meta-taggar och JS-globaler, plus `implies` (t.ex. WooCommerce → WordPress).
3. **`src/detect.js`** matchar sidan mot signaturerna och sparar upp till tre bevis per träff.
4. **`src/scan.js`** skriver `data/results.json` och lägger till skillnader mot förra lyckade skanningen i `data/changes.json`. Om en sajt blockerar behålls förra lyckade resultatet.
5. **`src/build.js`** bygger `public/` (HTML, CSS, JS och `data.json`). Klienten i `src/web/` sköter filtrering och routing.

## Lägga till sajter

Lägg till en rad i `data/sites.json`:

```json
{ "domain": "exempel.se", "name": "Exempel", "category": "Mode & kläder" }
```

`url` behövs bara om startsidan inte ligger på `https://www.<domän>/`.

## Lägga till eller förbättra signaturer

Skanna sajten med `--dump` och titta i `.cache/dump/<domän>.json` efter unika värdhostar, cookies eller headers. Lägg sedan till ett mönster i `src/technologies.js` och ett test i `test/detect.test.js`. Mönster mot `html` ska vara snäva. En för bred regex ger falska träffar, t.ex. ikonklassen `fa-shopware` eller produktbilder från handlares butiker på en marknadsplats.

## Manuella uppgifter

Sajter med botskydd (Cloudflare, Akamai m.fl.) eller headless-plattformar som inte syns utifrån kan kompletteras i `data/overrides.json`:

```json
{
  "exempel.se": { "add": ["Centra"], "remove": ["Shopware"], "source": "pressmeddelande 2025" }
}
```

Manuella uppgifter visas med `*` på webbplatsen.

## Automatisk skanning

`.github/workflows/scan.yml` skannar varje måndag (och vid manuell körning), committar nya resultat och publicerar `public/` på GitHub Pages. Aktivera Pages med källan **GitHub Actions** under *Settings → Pages*.

## Begränsningar

- Plattformar som körs helt headless syns bara om frontend gör anrop eller laddar bilder direkt från plattformen. Annars visas sajten som *Headless/egen*.
- Betal- och fraktlösningar hittas delvis via logotyper och text på startsidan.
- Botskydd blockerar en del sajter, särskilt från molnets IP-adresser. Resultatet varierar mellan körningar.
