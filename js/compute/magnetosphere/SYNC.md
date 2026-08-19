# De fysicalaag is een KOPIE, geen fork

Deze zeven bestanden komen byte-identiek uit de magnetosfeer-PoC:

    ~/Documents/_werk/_ObsidianVault/apps/magnetosphere-poc-terra/

De PoC is en blijft de source of truth. Daar staan 1498 asserties tegenaan, en
die toetsen **het verscheepte bestand** — niet een herschrijving ervan. Zodra
Terra hier een eigen variant van maakt, toetst de PoC iets anders dan wat Terra
draait, en dan is er drift die niemand ziet.

**Wijzig hier dus niets.** Een verbetering hoort in de PoC, wordt daar getoetst,
en komt hier binnen door opnieuw te kopiëren.

## Toetsen

```
node tools/check-magnetosphere-sync.mjs
```

Vergelijkt de md5's met de PoC. Staat de PoC er niet (een andere machine, een
kloon zonder de vault), dan zegt het script dat — en dat is iets anders dan
"gelijk". Een toets die niets kan meten mag niet groen zijn.

## De stand bij het binnenhalen — sessie 29, 2026-08-19

| bestand | herkomst in de PoC | md5 |
|---|---|---|
| `core.js` | `terra/core.js` | `94536b27c4277048a1a1e188a19525eb` |
| `data.js` | `terra/data.js` | `629b3458a58f4e5587a94f26fb76182e` |
| `chart.js` | `lib/chart.js` | `b500a74a662e881d07ab827e5dcd9f80` |
| `sector.js` | `lib/sector.js` | `2b0859d5a9bd2e830286b68ad02d52c1` |
| `strip.js` | `terra/strip.js` | `cc6270a85feb6f35cf91a39217a15cb8` |
| `overlay.js` | `terra/overlay.js` | `2dbfd8837674ed199c50e05108ef87c2` |
| `registry.js` | `terra/registry.js` | `f7bf31f916138cb260b86d45661160fb` |

PoC-sessie 32. Wat er NIET meekomt en waarom: `particles.js` (plasma, gyratie,
sporen, golving — het deel waar de PoC zelf nog niet af is), `fieldgrid.js` en
`worker.js` (die bakken het raster dat alleen de deeltjes lezen), en `lib/kp.js`
(`strip.js` gebruikt hem niet).

## Wat deze bestanden op `globalThis` zetten

    core.js       TerraCore
    data.js       TerraData
    strip.js      TerraStrip
    overlay.js    TerraOverlay
    registry.js   TerraRegistry
    chart.js      Chart        <-- kale naam
    sector.js     Sector       <-- kale naam

De vijf `Terra*`-namen zijn veilig. `Chart` en `Sector` zijn dat niet: dat zijn
precies het soort naam waar een bibliotheek overheen schrijft, en de standalone
gooit alles in één scope. Ze zijn hier NIET hernoemd, want dat zou de kopie een
fork maken. In plaats daarvan toetst `tools/build-standalone.mjs` dat niemand
anders diezelfde namen claimt — een botsing valt daar om, in plaats van stil in
de browser.

`strip.js` en `overlay.js` krijgen `Chart`, `Sector` en `Core` overigens als
PARAMETER binnen (`input.Chart`), niet van `globalThis`. De globals bestaan
alleen zodat de aanroeper ze kan doorgeven.
