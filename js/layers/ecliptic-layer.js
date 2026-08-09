/* ============================================================
   TERRA — ecliptica-laag (three.js-adapter)
   ------------------------------------------------------------
   Hangt uitsluitend af van de THREE-instance die je meegeeft — zelfde
   afspraak als de andere lagen.

   WAT DIT TEKENT EN WAAROM HET ERTOE DOET
   De ecliptica is het vlak van de aardbaan, en daarmee ongeveer het vlak
   waarin het hele zonnestelsel ligt. Op de bol is hij een grootcirkel
   die tussen 23,44 graden noord en zuid slingert — precies de band
   tussen de keerkringen, want daar staat de zon loodrecht.

   HIJ IS DE UITLEG BIJ DE PLANETEN. Zonder deze cirkel is een ring van
   planeten om de aarde een willekeurige verzameling stippen; met de
   cirkel zie je dat ze allemaal in EEN vlak liggen, en dat is precies
   het feit waaruit volgt dat ze om de zon draaien en niet om ons.

   HOOGTE: straal 101,5. De ondergrens is 101, want de schematische
   weergave legt de land-polygonen op `polygonAltitude(0.01)` en alles
   daaronder verdwijnt eronder — gemeten met een A/B in sessie 14. De
   schemeringslijnen zitten op 101,4 en de ground tracks op 101,8, dus
   dit past er netjes tussen.
   ============================================================ */

import { eclipticaPool, grootcirkel } from '../compute/frames.js';

export function createEclipticLayer(THREE, opts = {}) {
  const cfg = Object.assign({
    earthRadius: 100,
    altitude:  1.015,
    punten:      240,
    kleur:  0xffc14d,      // dezelfde warme tint als de andere zonzaken
    dekking:    0.55
  }, opts);

  const group = new THREE.Group();
  group.name = 'ecliptic';
  group.visible = false;

  const straal = cfg.earthRadius * cfg.altitude;

  /* De buffer wordt EEN KEER aangemaakt en daarna alleen bijgeschreven.
     Een verse BufferGeometry per update is precies wat in sessie 9 de
     landnamen op een p90 van 357 ms bracht; hier zou het bovendien
     globe.gl aan het herbouwen zetten, want die vergelijkt op
     objectidentiteit. */
  const posities = new Float32Array((cfg.punten + 1) * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posities, 3));
  const mat = new THREE.LineBasicMaterial({
    color: cfg.kleur, transparent: true, opacity: cfg.dekking
  });
  const lijn = new THREE.Line(geo, mat);
  group.add(lijn);

  // Waar de cirkel het laatst voor gebouwd is. De pool draait met de
  // sterrentijd mee, dus hij verandert continu — maar 0,02 graden
  // verzet is onder een pixel, en herbouwen kost meer dan het oplevert.
  // Zelfde smoring als bij de schemeringslijnen in sessie 14; daar ging
  // het mis door een onmogelijke sentinel-vector als "nog nooit
  // gebouwd", dus hier is dat een aparte boolean.
  let gebouwd = false;
  const vorige = { x: 0, y: 0, z: 0 };
  const DREMPEL = Math.cos(0.02 * Math.PI / 180);

  function update(date) {
    if (!group.visible) return false;
    const pool = eclipticaPool(date);
    if (gebouwd) {
      const dot = pool.x * vorige.x + pool.y * vorige.y + pool.z * vorige.z;
      if (dot > DREMPEL) return false;
    }
    const punten = grootcirkel(pool, cfg.punten);
    for (let i = 0; i < cfg.punten; i++) {
      posities[i * 3]     = punten[i].x * straal;
      posities[i * 3 + 1] = punten[i].y * straal;
      posities[i * 3 + 2] = punten[i].z * straal;
    }
    // De cirkel sluiten: het laatste punt is het eerste.
    posities[cfg.punten * 3]     = posities[0];
    posities[cfg.punten * 3 + 1] = posities[1];
    posities[cfg.punten * 3 + 2] = posities[2];
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();

    vorige.x = pool.x; vorige.y = pool.y; vorige.z = pool.z;
    gebouwd = true;
    return true;
  }

  function setVisible(aan, date) {
    group.visible = !!aan;
    // De geometrie wordt pas in update() gebouwd, dus een toggle moet die
    // zelf aanroepen — anders gebeurt er niets zichtbaars tot de volgende
    // tik van dertig seconden. Dezelfde val als bij setVisible() van de
    // zon/maan-laag in sessie 14.
    if (aan && date) update(date);
  }

  return { group, update, setVisible, config: cfg, isZichtbaar: () => group.visible };
}
