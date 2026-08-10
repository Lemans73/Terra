/* ============================================================
   TERRA — Sky orientation · twee quaternions uit twee getallen
   ------------------------------------------------------------
   De enige three.js-afhankelijke helft van `compute/frames.js`. Die
   module rekent richtingen uit; deze zet ze om in een orientatie voor
   een `THREE.Group`, zodat een hele hemel-inhoud EEN keer gebouwd kan
   worden en daarna alleen nog gedraaid.

   HET FRAME, in twee stappen:

     equatoriaal = rotY(-gast)          +Y = hemelpool, +Z = lentepunt
     ecliptisch  = rotY(-gast)·rotZ(+eps)   +Y = ecliptica-pool

   `gast` draait het aardvaste frame naar de sterren; `eps` kantelt
   daarna naar het baanvlak. Meer is het niet, en dat is precies het
   punt: alles wat aan de hemel hangt — de ecliptica, de hemelequator,
   de RA-verdeling, het heliocentrische stelsel — is een functie van
   deze twee getallen en kan dus nooit onderling uit de pas lopen.

   DIT IS DE CONJUGAAT VAN MAGNETO. Daar staat `rotZ(-eps)·rotY(gast)`,
   want die weergave brengt de wereld naar een vaste zon; hier brengen
   we een vast frame naar de wereld. Dezelfde meetkunde, andere kant op,
   en dat is meteen de goedkoopste toets dat het klopt.

   WAAROM GEEN MATRIX. `setFromRotationMatrix()` op een zelfgebouwde
   basis vraagt een Matrix4 plus een polar decomposition; twee
   `setFromAxisAngle` en een `multiplyQuaternions` doen hetzelfde in
   ongeveer dertig bewerkingen. Bij een laag die per tik draait telt dat.
   ============================================================ */

export function createSkyOrientation(THREE) {
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const RAD = Math.PI / 180;

  // Werkquaternions, hergebruikt: deze functies draaien per tik en horen
  // niets te alloceren.
  const _qY = new THREE.Quaternion();
  const _qZ = new THREE.Quaternion();

  /* Het equatoriale frame. Schrijft in `q` en geeft hem terug. */
  function equatorial(q, gast) {
    return q.setFromAxisAngle(AXIS_Y, -gast * RAD);
  }

  /* Het ecliptische frame. `multiplyQuaternions(a, b)` past b als EERSTE
     toe, dus de kanteling gaat voorop en de sterrentijd erna — niet
     andersom, want dan kantelt hij om een as die zelf al meegedraaid is. */
  function ecliptic(q, gast, eps) {
    _qY.setFromAxisAngle(AXIS_Y, -gast * RAD);
    _qZ.setFromAxisAngle(AXIS_Z, eps * RAD);
    return q.multiplyQuaternions(_qY, _qZ);
  }

  return { equatorial, ecliptic };
}
