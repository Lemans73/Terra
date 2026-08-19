/* ==========================================================================
   lib/sector.js — which side of the heliospheric current sheet we are on,
   and what that costs the magnetosphere
   ==========================================================================

   WHAT THIS IS FOR. The roadmap carried "Polarity has nothing drawn for it"
   from 2026-08-05 to 2026-08-10 with one question attached: which field would
   make polarity visible without becoming an MHD claim this app cannot support?

   The answer is NOT the tail. T96's Birkeland terms never see By — session 13
   measured +By and -By identical to 1e-15 — so a By-driven tail twist would
   have to come from a model we do not run. The answer is Bz_GSM, and it comes
   out of a ROTATION rather than out of physics.

   THE ONE FACT THE WHOLE MODULE RESTS ON. GSE and GSM share their X axis and
   differ by a single rotation about it, by an angle psi that is pure
   ephemeris. So:

       bx_gsm = bx_gse                                       <- frame-free
       by_gsm =  by_gse * cos(psi) + bz_gse * sin(psi)
       bz_gsm = -by_gse * sin(psi) + bz_gse * cos(psi)

   The first line is why the SECTOR can be read at all: the sign of Bx says
   which side of the current sheet we are on, and it says the same thing in
   both frames. Measured 2026-08-10: `bx_gse` equals `bx_gsm` on all 1428
   active RTSW rows to 0.0, and the propagated feed's `bx` equals both on all
   1424 shared minutes to 0.0000.

   The third line is why it MATTERS: the rotation moves Bz, and Bz is what this
   app's coupling function, its open/closed topology and its T96 input all run
   on. How much it moves is NOT one number, and the first version of this
   header said it was.

   Measured over 24 h it multiplied the southward budget by 0.38 — it removed
   62 % of it — and that was written down as what the rotation does. Over the
   full seven days the same arithmetic gives 0.94, and per day it runs

       0.309  ..  1.489        (8 days, 2026-08-03 .. 08-10)

   so on some days the rotation ADDS half again as much southward field as the
   ecliptic-plane measurement carried, and on others it removes two thirds. The
   quiet day had a small budget, so a modest absolute shift was most of it. A
   single figure here would have been a property of whichever day it was
   measured on. → `getal-in-proza-drijft-weg`

   Conditioned per minute on the sector rather than per calendar day, the split
   is real and much smaller than the daily spread suggests:

       away     5140 min    -10351 -> -10887 nT.min    factor 1.052
       toward   4165 min     -5533 ->  -4330           factor 0.783

   ---- psi is not new ephemeris, and that is deliberate --------------------

   The app already builds the ecliptic pole in GSM components, in
   `Frames.computeFlow`, where it is the invariant the aberration self-check
   leans on. The GSE Z axis IS the ecliptic pole. So psi = atan2(pole.y,
   pole.z) and there is nothing else to compute. No second ephemeris, no
   second obliquity, no second GMST — those are exactly the copies that drift
   apart.

   The perpendicularity of the pole to the Sun line is carried out of the same
   call as a number rather than assumed: both the Sun direction and the pole
   definition make pole.x zero, so a non-zero pole.x means the basis handed in
   is not the basis this module thinks it is. Measured over 1428 rows the
   worst |pole.x| is 1.4e-16.

   ---- the calibration, and what it actually bounds -----------------------

   The RTSW feed publishes BOTH frames for the same instant. That makes it a
   known point to reproduce rather than a claim to check against a principle
   (`instrument-ijken-op-bekend-punt`). Bar written before the run: median
   |delta| <= 0.05 nT and p95 <= 0.20, in the idiom `imf-phi` already uses.

   Measured 2026-08-10 over 1428 active rows:

       median 0.0069 nT    p95 0.019    max 0.052        <- MET, with room

   And the residual is at THEIR floor, not ours: the feed publishes two
   decimals, so a component carries up to 0.005 of rounding, and the median
   sits at 1.4 times that. The comparison therefore does not measure our psi;
   it BOUNDS the disagreement below their own publication precision.

   THE 117 ROWS THAT ARE NOT OURS. 8.19 % of the reference rows are not a
   rotation of themselves: their |B_yz| in GSE and in GSM differ by more than
   the rounding floor, and no angle whatever can map one onto the other. On
   2026-08-10T03:38 they publish GSE (-2.57, 1.26) with |B_yz| 2.862 and GSM
   (-1.95, 1.74) with 2.614. Ours preserves 2.862 exactly, because a rotation
   must. Those rows are excluded from the bar and COUNTED, never quietly
   dropped — the same texture `imf-phi` already records as 35 of 1432 minutes
   where SWPC's own phi disagrees with SWPC's own components.

   ---- the sign convention is a RESULT here, not an input -----------------

   The agent writing this had the sign of psi backwards once, in a derived
   formula, and the formula looked entirely reasonable. What caught it was not
   inspection but a matched budget: with the sign flipped, the rotation had to
   ADD southward field where the feed's own numbers said it removed it. So the
   sign lives on the calibration, and `calibrate` reports what a flipped psi
   would score so the discrimination is visible rather than promised. Measured
   per psi bin, flipped against unflipped:

       psi  5-10 deg   0.0044 -> 0.481 nT    110x
       psi 10-15       0.0040 -> 0.558       138x
       psi 15-20       0.0055 -> 0.758       138x
       psi 20-25       0.0042 -> 1.166       278x
       psi 25-30       0.0037 -> 1.305       351x

   The weakest bin is the smallest psi and it still separates by two orders of
   magnitude, which is the thing a single pinned test could never have shown.
   (`ijkpunt-niet-op-de-referentiewaarde`: do not pin where the effect is
   smallest — sweep, and report where the sweep is weakest.)

   ---- what the sector does NOT determine ---------------------------------

   It is tempting to say the sector fixes the sign of by_gse and therefore the
   sign of the leakage. Measured over 9305 decidable minutes of the 7-day
   record, the Parker rule (toward -> by < 0, away -> by > 0) holds on

       67.2 %

   Two minutes in three. Far above chance and far below a rule. So the sector
   BIASES the leakage and does not set it, and anything drawn from this has to
   say so in those words. That number is a property of this week and is
   re-measured rather than typed.

   AND THE BIAS IS SHAPED LIKE THE ROTATION, up to a point. The carried term is
   -by_gse*sin(psi), so if the sector split IS the rotation then the separation
   between the two sectors must grow with sin(psi) and reverse in sign. Both
   were required before the bins were computed. Measured:

       psi bin    sin psi     away    toward   separation
        5-10       0.131    -0.061   +0.459     -0.519 nT
       10-15       0.216    -0.186   +0.551     -0.736
       15-20       0.301    -0.272   +1.017     -1.288
       20-25       0.383    -0.170   +1.730     -1.899
       25-30       0.462    -0.560   +0.123     -0.682   <- breaks

   The sign reverses in 5 of 5 bins and the separation grows in 3 of 4 steps
   before the last bin collapses. THE LIMIT IS THE RECORD, not the method: over
   seven days psi and UT hour are the SAME AXIS — each psi bin is a fixed set
   of hours — so a psi dependence and a diurnal one are the same measurement
   here. Separating them needs a span long enough for the seasonal term to move
   the psi-to-hour mapping. Consistent with the rotation; not yet isolated to
   it, and the panel says exactly that.

   ---- undecidable is a cone angle, not a number of nT ---------------------

   Near the current sheet |Bx| collapses and its sign is noise. The first
   instinct is a threshold in nT, and that is wrong for the same reason the
   typed 4.5 deg aberration was wrong: it fixes an absolute where the quantity
   is a ratio. A 1 nT Bx is decisive in a 1.5 nT field and meaningless in a
   19 nT one. The criterion is the CONE ANGLE between B and the Sun line,

       cone = acos(|bx| / bt)

   which is 0 when the field lies along the Sun line and 90 when it is
   perpendicular and the sector is undefined. Measured over the 7-day record:
   median 63.6 deg, p10 24.8, p90 84.4.

   The bar on that angle is SWEPT and not typed — see `sweepCone`. What the
   sweep answers is not "which value is true" but "is there a knee", and if
   there is none the bar is CHOSEN and the caller has to say so.

   ---- why a change needs hysteresis, and what actually supplies it -------

   A naive per-hour majority over the 7-day record reports 25 sector changes.
   Earth meets the sheet a handful of times per solar rotation, so 25 in a week
   is the undecidable band flickering, not the heliosphere. Nearly every false
   flip falls in an hour with many undecidable minutes: 08-05T03 has 49 of 60.

   THE REFUSAL BAND ALONE FIXES NOTHING, and that was a surprise. Measured with
   no hold requirement at all, sign changes per day against the cone bar:

       60 deg  4.1/day (43.7 % decided)      84 deg  27.0/day (89.1 %)
       70      8.1     (61.4)                86      35.9     (93.0)
       80     18.4     (80.5)                89      55.0     (98.3)

   Tightening the band from 89 to 60 deg costs more than half the record and
   still leaves 29 changes a week. It falls smoothly, with no knee. The band's
   job is therefore NOT noise suppression — it is labelling the single minute
   honestly ("right now the sector is undefined") — and the hysteresis is what
   makes a change a change.

   THE TWO BARS COME OFF A SURFACE. Swept together over cone 60-89 deg and hold
   5-480 min, the count is flat at 7 over cone 84-89 and hold 90-180 — twelve
   grid points, a factor 2 in hold and 6 deg in cone. Taken at its centre:
   cone 86 deg, hold 120 min. That is a MEASURED pair, not a chosen one, and
   `plateau` returns the extent so a reader can see how wide the flat region
   is. Two traps on the way there are recorded at `sweep` and `plateau`,
   because both produced confident wrong answers first.

   WHAT IS DELIBERATELY NOT IN HERE. No fetch, no ephemeris, no frame
   construction, no clock. psi comes in as an angle or as a pole, samples come
   in as arrays. That is what lets the awkward cases be tested at all — a
   reference that contradicts itself, a record with no crossing, a field that
   is perpendicular for an hour — none of which can be conjured on demand out
   of a real heliosphere.

   COST AND CADENCE, declared at birth so the test register does not have to
   reconstruct it later:

       id        sector-rotation
       cadence   per code change (pure, deterministic, no clock)
       cost      see test-sector/run.js, printed by the suite itself
       fails as  psi calibration over the bar, or a swept bar with no knee
                 reported as measured instead of CHOSEN
   ========================================================================== */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sector = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEG = 180 / Math.PI;

  return {

    /* ---- 0. the two bars, and where they come from ---------------------- */

    /* MEASURED, not chosen, and the distinction is the whole of section 5.
       Swept together over cone 60-89 deg and hold 5-480 min on the frozen
       7-day record, the number of sector changes is flat at 7 across cone
       84-89 and hold 90-180 — twelve grid points, a factor 2 in hold and 6 deg
       in cone. These are the centre of that rectangle.

       They are declared here as VALUES rather than left in the caller, so that
       the app, the suite and the calibration cannot drift into three different
       answers — the same reason lib/electrojet.js carries its station list as
       a value. Re-derive them with
       `node events/2026-08-10-sector-crossing/measure.js`, which prints the
       whole surface and the plateau it took them from. */
    CONE_BAR_DEG: 86,
    HOLD_MIN: 120,

    /* ---- 1. the rotation ------------------------------------------------ */

    /* The ecliptic pole is the GSE Z axis. Handed in expressed in GSM, which
       is what `Frames.toGsm(Frames.eciToFixed(poleEci, date), basis)` returns
       and what `computeFlow` already computes for its own self-check.

       `perpendicularity` is |pole.x| and it is returned rather than asserted:
       it is zero by construction for a correct basis, so a caller that starts
       seeing 1e-3 has handed in something that is not a GSM basis. */
    psiFromPole: function (pole) {
      if (!pole || !isFinite(pole.x) || !isFinite(pole.y) || !isFinite(pole.z)) return null;
      var len = Math.sqrt(pole.x * pole.x + pole.y * pole.y + pole.z * pole.z);
      if (!(len > 0)) return null;
      return {
        rad: Math.atan2(pole.y, pole.z),
        deg: Math.atan2(pole.y, pole.z) * DEG,
        perpendicularity: Math.abs(pole.x) / len
      };
    },

    /* GSE -> GSM. x is copied and not computed, because the two frames share
       that axis exactly; computing it would invent a rounding difference in a
       component that has none. */
    gseToGsm: function (b, psiRad) {
      if (!b || !isFinite(psiRad)) return null;
      var c = Math.cos(psiRad), s = Math.sin(psiRad);
      return {
        x: b.x,
        y: b.y * c + b.z * s,
        z: -b.y * s + b.z * c
      };
    },

    gsmToGse: function (b, psiRad) {
      return this.gseToGsm(b, -psiRad);
    },

    /* The split this module exists for.

         carried    -by_gse * sin(psi)   the share of Bz_GSM the rotation
                                         produces out of the ecliptic-plane
                                         field. This is the term the sector
                                         biases.
         intrinsic   bz_gse * cos(psi)   the share that was already out of the
                                         ecliptic plane before any rotation.

       carried + intrinsic == bz_gsm exactly. It is an identity, not a model,
       and `residual` is returned so a caller can see that it is one. */
    decompose: function (byGse, bzGse, psiRad) {
      if (!isFinite(byGse) || !isFinite(bzGse) || !isFinite(psiRad)) return null;
      var s = Math.sin(psiRad), c = Math.cos(psiRad);
      var carried = -byGse * s;
      var intrinsic = bzGse * c;
      return {
        carried: carried,
        intrinsic: intrinsic,
        bzGsm: carried + intrinsic,
        /* The fraction of the southward field this rotation is responsible
           for, and null rather than zero when the total is not southward:
           a share of a northward field is not a smaller share, it is a
           different question. */
        southwardShare: (carried + intrinsic) < 0
          ? carried / (carried + intrinsic) : null
      };
    },

    /* ---- 2. calibration against a source that publishes both frames ----- */

    /* `rows` carry gse {x,y,z} and gsm {y,z} for the same instant, plus psi.
       Anything shaped like that will do; in the app it is the RTSW feed and in
       the tests it is constructed.

       ROUNDING_FLOOR is the feed's own publication precision, and it is the
       reason the reference can be checked for self-consistency at all: a
       rotation preserves |B_yz|, so a reference whose two frames disagree in
       LENGTH by more than rounding cannot be reproduced by any angle. Those
       rows are excluded and counted. */
    ROUNDING_FLOOR: 0.02,

    calibrate: function (rows, opts) {
      opts = opts || {};
      var floor = opts.floor === undefined ? this.ROUNDING_FLOOR : opts.floor;
      var barMedian = opts.barMedian === undefined ? 0.05 : opts.barMedian;
      var barP95 = opts.barP95 === undefined ? 0.20 : opts.barP95;
      var flip = !!opts.flipPsi;

      var kept = [], notARotation = [], self = this;
      (rows || []).forEach(function (r) {
        if (!r || !r.gse || !r.gsm || !isFinite(r.psi)) return;
        var me = Math.sqrt(r.gse.y * r.gse.y + r.gse.z * r.gse.z);
        var mg = Math.sqrt(r.gsm.y * r.gsm.y + r.gsm.z * r.gsm.z);
        if (Math.abs(me - mg) > floor) { notARotation.push(r); return; }
        var got = self.gseToGsm(r.gse, flip ? -r.psi : r.psi);
        kept.push(Math.max(Math.abs(got.y - r.gsm.y), Math.abs(got.z - r.gsm.z)));
      });

      if (!kept.length) {
        return { n: 0, notARotation: notARotation.length, median: null,
                 p95: null, max: null, met: false,
                 why: "no row survived the self-consistency test, so there is "
                    + "nothing to calibrate against" };
      }

      var q = function (a, p) {
        var b = a.slice().sort(function (x, y) { return x - y; });
        return b[Math.min(b.length - 1, Math.floor(p * b.length))];
      };
      var median = q(kept, 0.5), p95 = q(kept, 0.95);
      return {
        n: kept.length,
        notARotation: notARotation.length,
        notARotationPct: 100 * notARotation.length / (kept.length + notARotation.length),
        median: median, p95: p95, max: Math.max.apply(null, kept),
        barMedian: barMedian, barP95: barP95,
        met: median <= barMedian && p95 <= barP95,
        why: null
      };
    },

    /* ---- 3. the sector state -------------------------------------------- */

    /* The cone angle between B and the Sun line. Undefined, not 90, when
       there is no field to take an angle of. */
    coneDeg: function (bx, bt) {
      if (!isFinite(bx) || !isFinite(bt) || !(bt > 0)) return null;
      var r = Math.abs(bx) / bt;
      return Math.acos(Math.max(-1, Math.min(1, r))) * DEG;
    },

    /* "toward" means the field points at the Sun. GSE and GSM both put +X at
       the Sun, so bx > 0 is toward in either — which is the whole reason this
       state can be read off a feed that never says which frame it means.

       "undecided" is a REFUSAL and it is spelled so that no reader can take it
       for a third sector: the word is UNDECIDED, and the reason travels with
       it. At the measured 86 deg bar, 6.95 % of the 7-day record lands here —
       695 minutes that carry no sector at all. */
    state: function (bx, bt, coneBarDeg) {
      var cone = this.coneDeg(bx, bt);
      if (cone === null) {
        return { state: "undecided", cone: null,
                 why: "no field: bt is absent or zero, so B has no direction "
                    + "to take an angle of" };
      }
      if (cone > coneBarDeg) {
        return { state: "undecided", cone: cone,
                 why: "the field lies " + cone.toFixed(1) + " deg off the Sun "
                    + "line, past the " + coneBarDeg.toFixed(1) + " deg bar: "
                    + "Bx is too small a part of B for its sign to mean "
                    + "anything" };
      }
      return { state: bx > 0 ? "toward" : "away", cone: cone, why: null };
    },

    /* ---- 4. sector changes ---------------------------------------------- */

    /* CALLED A CHANGE AND NOT A CROSSING, deliberately. From one point in
       space a real current-sheet crossing and a local excursion look the same:
       the sign of Bx changes and stays changed. Deciding between them needs
       the sheet's own orientation, which is a minimum-variance reading over
       the vectors either side and is NOT in this module yet. Until it is,
       "crossing" would be a word no test can check — the same failure as
       `imf-phi`, whose arithmetic was validated to 0.07 deg for two months
       while the entry carried the wrong name.

       A change is a decided state that DIFFERS from the last decided state and
       then holds for `holdMin` decided samples. Undecided samples are neither
       evidence for nor against: they are skipped, and the count of them inside
       the transition is reported, because a change that spent forty minutes
       undecided is a different observation from one that flipped between two
       clean minutes.

       Samples must be time-ordered and carry {time, bx, bt}. */
    changes: function (samples, opts) {
      opts = opts || {};
      var bar = opts.coneBarDeg;
      var hold = opts.holdMin === undefined ? 30 : opts.holdMin;
      if (!isFinite(bar)) return null;

      var out = [], settled = null, pending = null, undecidedInGap = 0;
      var self = this;

      (samples || []).forEach(function (s) {
        var st = self.state(s.bx, s.bt, bar);
        if (st.state === "undecided") { undecidedInGap++; return; }

        if (settled === null) { settled = { state: st.state, time: s.time }; undecidedInGap = 0; return; }
        if (st.state === settled.state) {
          /* Back to where we were: whatever was building is not a crossing. */
          pending = null;
          undecidedInGap = 0;
          return;
        }
        if (!pending || pending.state !== st.state) {
          pending = { state: st.state, from: settled.state, time: s.time,
                      count: 1, undecided: undecidedInGap };
        } else {
          pending.count++;
        }
        if (pending.count >= hold) {
          out.push({ time: pending.time, from: pending.from, to: pending.state,
                     heldFor: pending.count, undecidedBefore: pending.undecided });
          settled = { state: pending.state, time: pending.time };
          pending = null;
          undecidedInGap = 0;
        }
      });

      return {
        changes: out,
        settledAtEnd: settled ? settled.state : null,
        pending: pending ? { to: pending.state, held: pending.count, needs: hold } : null
      };
    },

    /* ---- 5. the sweeps, because neither bar may be typed ---------------- */

    /* What a cone bar costs and buys, over a record.

       `flipsPerDay` is the thing being suppressed: how often the decided state
       changes from one sample to the next WITHOUT any hold requirement. A good
       bar is where that collapses while `decidedPct` is still high. If it
       falls smoothly with no knee then there is no measured answer and the
       caller must declare the bar CHOSEN — which is a legitimate outcome and
       not a failure, as long as it is said out loud. */
    sweepCone: function (samples, bars) {
      var self = this;
      var spanDays = null;
      if (samples && samples.length > 1) {
        spanDays = (samples[samples.length - 1].time - samples[0].time) / 86400e3;
      }
      return (bars || []).map(function (bar) {
        var decided = 0, flips = 0, last = null;
        (samples || []).forEach(function (s) {
          var st = self.state(s.bx, s.bt, bar);
          if (st.state === "undecided") return;
          decided++;
          if (last !== null && st.state !== last) flips++;
          last = st.state;
        });
        return {
          coneBarDeg: bar,
          decided: decided,
          decidedPct: samples && samples.length ? 100 * decided / samples.length : null,
          flips: flips,
          flipsPerDay: spanDays > 0 ? flips / spanDays : null
        };
      });
    },

    /* The two bars TOGETHER, as a surface, because they are not independent
       and picking them one at a time is how the first version of this file got
       an absurd answer.

       That attempt is worth recording. The rule was "silent on the negative
       reference, speaking on the positive one, then take the smallest hold".
       Both conditions were satisfied at cone 89 deg and hold 5 min, which
       reports 77 sector changes in a week — worse than the naive rule it was
       meant to replace. The negative reference chosen was sixteen unbroken
       hours of one sector, and a window that clean is silent at EVERY setting,
       so it could not discriminate and the rule collapsed onto the other
       constraint alone. A reference that cannot fail is not a reference. */
    sweep: function (samples, coneBars, holds) {
      var self = this;
      return (coneBars || []).map(function (cone) {
        return {
          coneBarDeg: cone,
          row: (holds || []).map(function (hold) {
            return { holdMin: hold,
                     changes: self.changes(samples, { coneBarDeg: cone, holdMin: hold }).changes.length };
          })
        };
      });
    },

    /* Where on that surface is the answer a property of the DATA rather than
       of the two knobs? The largest rectangle of constant count, and its
       extent reported so a reader can see how wide the flat region is and
       where it breaks.

       Same shape as `OpenEdge.convergence` (report the spread, do not hide it)
       and as `validate/events.js` (define the thing out of the record instead
       of out of a window). A single grid point that happens to give a pleasing
       number is the grid answering, not the heliosphere.

       `admissible(coneDeg, holdMin)` GATES THE SEARCH, and it has to, because
       the largest flat region on this surface is not the stable one. Run
       without it, the search returns twelve grid points all reading 1 at holds
       of 360-480 minutes — flat because a long enough hold merges everything
       into one, not because the answer settled. That is
       `raster-tegen-eigen-plafond` again: a grid handing back its own boundary
       value reads exactly like convergence. The necessary conditions (silent
       on a record with no change in it, still speaking on one that has some)
       have to be inside the search rather than checked afterwards, or the
       collapsed corner wins on area every time. */
    plateau: function (surface, admissible) {
      if (!surface || !surface.length || !surface[0].row.length) return null;
      var nC = surface.length, nH = surface[0].row.length;
      var val = function (i, j) { return surface[i].row[j].changes; };
      var ok = function (i, j) {
        return !admissible || admissible(surface[i].coneBarDeg, surface[i].row[j].holdMin);
      };
      var best = null;
      for (var i0 = 0; i0 < nC; i0++) {
        for (var i1 = i0; i1 < nC; i1++) {
          for (var j0 = 0; j0 < nH; j0++) {
            for (var j1 = j0; j1 < nH; j1++) {
              var v = val(i0, j0), flat = true;
              for (var i = i0; i <= i1 && flat; i++) {
                for (var j = j0; j <= j1; j++) {
                  if (val(i, j) !== v || !ok(i, j)) { flat = false; break; }
                }
              }
              if (!flat) continue;
              var area = (i1 - i0 + 1) * (j1 - j0 + 1);
              /* Area first. Ties go to the LARGER hold, because a longer hold
                 is the conservative direction: it can only merge changes, never
                 invent one. Same reasoning validate/events.js used for its
                 merge gap. */
              if (!best || area > best.area
                  || (area === best.area && surface[i1].row[j1].holdMin > best.holdMaxMin)) {
                best = {
                  changes: v, area: area,
                  coneMinDeg: surface[i0].coneBarDeg, coneMaxDeg: surface[i1].coneBarDeg,
                  holdMinMin: surface[i0].row[j0].holdMin, holdMaxMin: surface[i0].row[j1].holdMin,
                  /* The centre of the flat region, which is the point furthest
                     from where the answer starts moving. */
                  coneDeg: surface[Math.floor((i0 + i1) / 2)].coneBarDeg,
                  holdMin: surface[i0].row[Math.floor((j0 + j1) / 2)].holdMin
                };
              }
            }
          }
        }
      }
      /* A plateau of one point is no plateau: the answer moves with every
         step, and the caller has to say the bars are CHOSEN. */
      if (best) best.measured = best.area > 1;
      return best;
    },

    /* ---- 6. how much the sector actually biases the leakage ------------- */

    /* The Parker rule as a MEASUREMENT rather than an assumption: in an away
       sector the ecliptic-plane field should point one way and in a toward
       sector the other. Returns the agreement fraction so the caller can put
       it on screen instead of the word "because". */
    parkerAgreement: function (samples, coneBarDeg) {
      var agree = 0, n = 0, self = this;
      (samples || []).forEach(function (s) {
        var st = self.state(s.bx, s.bt, coneBarDeg);
        if (st.state === "undecided" || !isFinite(s.by)) return;
        n++;
        if ((st.state === "away" && s.by > 0) || (st.state === "toward" && s.by < 0)) agree++;
      });
      return n ? { n: n, agree: agree, fraction: agree / n } : { n: 0, agree: 0, fraction: null };
    },

    /* The budget the rotation moves, on a MATCHED basis: the same minutes in
       both frames, never one set of minutes against another. That mistake was
       made three times in session 19 alone (`vergelijkingsbasis-moet-matchen`),
       so the shape is enforced here rather than left to the caller. */
    southwardBudget: function (samples) {
      var gse = 0, gsm = 0, nGse = 0, nGsm = 0, n = 0;
      (samples || []).forEach(function (s) {
        if (!isFinite(s.bzGse) || !isFinite(s.bzGsm)) return;
        n++;
        if (s.bzGse < 0) { gse += s.bzGse; nGse++; }
        if (s.bzGsm < 0) { gsm += s.bzGsm; nGsm++; }
      });
      return {
        minutes: n,
        gseNtMin: gse, gsmNtMin: gsm,
        gseSouthwardMinutes: nGse, gsmSouthwardMinutes: nGsm,
        factor: gse !== 0 ? gsm / gse : null
      };
    },

    /* ---- 6b. the nominal Parker spiral, as a LABEL ----------------------- */

    /* Omega_sun * r at 1 AU, in km/s: sidereal equatorial rotation of 25.38 d
       times 1.496e8 km. It is 428.7, so tan(psi_P) = 428.7 / v and the angle is
       47.0 deg at 400 km/s — not the 45 that gets typed, and it moves several
       degrees across the speeds this app sees. */
    OMEGA_R_KMS: 2 * Math.PI / (25.38 * 86400) * 1.496e8,

    /* ONE DEFINITION, THREE READERS: the arrow that draws it, the self-check
       that holds its sign against the measured Parker rule, and the suite. The
       first version of that self-check computed the direction itself and then
       tested it against the same sector it had just used to build it — which
       is always true, so it could never fail. A check has to point at the code
       that can be wrong, not restate it. → [[zelfcheck-faalbaarheid]]

       Built in the ECLIPTIC plane and returned in both frames, because the
       spiral lives in the ecliptic and the scene is GSM. Returns null when the
       sector gives it no sign — a spiral has two directions and only the sector
       picks one. */
    parkerNominal: function (vSwKmS, state, psiRad) {
      if (!(vSwKmS > 0) || !isFinite(psiRad)) return null;
      if (state !== "away" && state !== "toward") return null;
      var pk = Math.atan(this.OMEGA_R_KMS / vSwKmS);
      /* Away lags the outward radial and toward is its opposite: phi ~ 135 deg
         and ~ 315 deg in GSE. That is the convention the app's own field was
         measured against — 67.2 % agreement on 9305 decidable minutes — and it
         is a TENDENCY, so a measured field several tens of degrees off this is
         ordinary and not an error. */
      var s = state === "away" ? 1 : -1;
      var gse = { x: -s * Math.cos(pk), y: s * Math.sin(pk), z: 0 };
      return { gse: gse, gsm: this.gseToGsm(gse, psiRad), spiralDeg: pk * DEG };
    },

    /* ---- 7. the sheet's own orientation --------------------------------- */

    /* Minimum-variance analysis. The eigenvector at the SMALLEST eigenvalue of
       the covariance matrix of B is the direction along which the field varies
       least, and for a plane current sheet that is the sheet normal.

       Pure linear algebra: no frame knowledge, no clock, no ephemeris. Whatever
       frame the vectors come in, the normal comes out in. The caller stamps it.

       Jacobi rather than a closed form. A 3x3 symmetric eigenproblem has an
       analytic solution, but it loses precision exactly where this matrix is
       nearly degenerate — which is the case this function exists to REFUSE, so
       the numerically fragile branch is the one that decides. */
    mva: function (vectors) {
      var v = (vectors || []).filter(function (b) {
        return b && isFinite(b.x) && isFinite(b.y) && isFinite(b.z);
      });
      if (v.length < 8) return null;

      var n = v.length, i, j, k;
      var m = [0, 0, 0];
      for (i = 0; i < n; i++) { m[0] += v[i].x; m[1] += v[i].y; m[2] += v[i].z; }
      m[0] /= n; m[1] /= n; m[2] /= n;

      var c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (i = 0; i < n; i++) {
        var d = [v[i].x - m[0], v[i].y - m[1], v[i].z - m[2]];
        for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) c[j][k] += d[j] * d[k];
      }
      for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) c[j][k] /= n;

      var a = [c[0].slice(), c[1].slice(), c[2].slice()];
      var q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      for (var sweep = 0; sweep < 100; sweep++) {
        var off = 0;
        for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) if (j !== k) off += a[j][k] * a[j][k];
        if (off < 1e-24) break;
        for (var p = 0; p < 2; p++) {
          for (var qq = p + 1; qq < 3; qq++) {
            if (Math.abs(a[p][qq]) < 1e-22) continue;
            var th = (a[qq][qq] - a[p][p]) / (2 * a[p][qq]);
            var t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
            var cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
            for (k = 0; k < 3; k++) {
              var akp = a[k][p], akq = a[k][qq];
              a[k][p] = cs * akp - sn * akq; a[k][qq] = sn * akp + cs * akq;
            }
            for (k = 0; k < 3; k++) {
              var apk = a[p][k], aqk = a[qq][k];
              a[p][k] = cs * apk - sn * aqk; a[qq][k] = sn * apk + cs * aqk;
            }
            for (k = 0; k < 3; k++) {
              var qkp = q[k][p], qkq = q[k][qq];
              q[k][p] = cs * qkp - sn * qkq; q[k][qq] = sn * qkp + cs * qkq;
            }
          }
        }
      }

      var ev = [0, 1, 2].map(function (idx) {
        return { lambda: a[idx][idx], vec: [q[0][idx], q[1][idx], q[2][idx]] };
      }).sort(function (p1, p2) { return p2.lambda - p1.lambda; });

      /* Clamp at zero rather than passing a small negative through. A
         covariance matrix cannot have a negative eigenvalue; when one comes out
         at -1e-17 that is the arithmetic, and letting it reach a ratio would
         produce a sign nobody can interpret. */
      var l1 = Math.max(0, ev[0].lambda),
          l2 = Math.max(0, ev[1].lambda),
          l3 = Math.max(0, ev[2].lambda);
      var nv = ev[2].vec;

      /* Sign is not determined by MVA — n and -n describe the same plane. Fixed
         on the first non-zero component so that two runs over the same window
         report the same numbers; the caller must not read a direction into it. */
      var sgn = nv[0] !== 0 ? (nv[0] < 0 ? -1 : 1)
              : nv[1] !== 0 ? (nv[1] < 0 ? -1 : 1)
              : (nv[2] < 0 ? -1 : 1);

      return {
        n: n,
        lambdas: [l1, l2, l3],
        ratio: l3 > 0 ? l2 / l3 : Infinity,
        normal: { x: sgn * nv[0], y: sgn * nv[1], z: sgn * nv[2] },
        mean: { x: m[0], y: m[1], z: m[2] }
      };
    },

    /* The four measures that together decide whether a window shows a sheet.
       THE RATIO ALONE DOES NOT, and that is measured rather than argued: on the
       frozen record the sixteen quiet hours of 08-05 return lambda2/lambda3 =
       5.33 while the real reversal of 08-07/08 returns 2.05. A ratio is
       scale-free, so an interval in which nothing happens keeps it — everything
       is small together (lambda3 = 0.073 against 0.980) and the quotient
       survives. A plate gated on the ratio alone would have drawn a confident
       normal across sixteen hours of nothing.

       So three more, each of which the quiet case must fail:

         rotationDeg   the angle between the mean field of the first and last
                       third. A sheet is crossed; a quiet sector is not.
         normalShare   |<B> . n| / |<B>|. The field of a real current sheet lies
                       almost in the sheet, so its component along the normal is
                       small. In a nearly constant field the lambda3 direction
                       is noise-driven and has no reason to be perpendicular to
                       anything.
         lambda2       in absolute terms, against the source's rounding floor.
                       AND IT IS lambda2 AND NOT lambda3, which is the opposite
                       of what the first version of this bar said. A perfect
                       current sheet has lambda3 -> 0: minimal variance along
                       the normal is the whole definition, so a floor under
                       lambda3 rejects exactly the case it exists to accept. It
                       was caught by a constructed sheet with a known normal —
                       recovered to 0.00 deg and then refused for having no
                       variance along it. The plane the field lies IN has to be
                       defined by real variation; the direction it does not
                       vary along does not.
                       → [[zelfcheck-faalbaarheid]]

       Returns the measures ALWAYS and the verdict only when bars are handed in,
       so that a caller can sweep without committing to a threshold. */
    sheetQuality: function (vectors, bars) {
      var m = this.mva(vectors);
      if (!m) return null;

      var v = (vectors || []).filter(function (b) {
        return b && isFinite(b.x) && isFinite(b.y) && isFinite(b.z);
      });
      var third = Math.floor(v.length / 3);
      function meanOf(arr) {
        var s = { x: 0, y: 0, z: 0 };
        arr.forEach(function (b) { s.x += b.x; s.y += b.y; s.z += b.z; });
        return { x: s.x / arr.length, y: s.y / arr.length, z: s.z / arr.length };
      }
      function norm(b) { return Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z); }

      var a = meanOf(v.slice(0, third)), b = meanOf(v.slice(v.length - third));
      var na = norm(a), nb = norm(b);
      var cosr = (na > 0 && nb > 0) ? (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb) : null;
      var rotationDeg = cosr === null ? null
                      : Math.acos(Math.max(-1, Math.min(1, cosr))) * DEG;

      var mm = norm(m.mean);
      var along = Math.abs(m.mean.x * m.normal.x + m.mean.y * m.normal.y
                         + m.mean.z * m.normal.z);
      var normalShare = mm > 0 ? along / mm : null;

      var out = {
        n: m.n,
        lambdas: m.lambdas,
        ratio: m.ratio,
        lambda3: m.lambdas[2],
        normal: m.normal,
        rotationDeg: rotationDeg,
        normalShare: normalShare,
        verdict: null,
        why: null
      };
      if (!bars) return out;

      /* Cheapest and most decisive first, and the FIRST failure is the reason
         reported — the same ordering rule `inertReasons` follows in the app, so
         a reader gets one sentence rather than a list. */
      var fail = null;
      if (rotationDeg === null || rotationDeg < bars.rotationDeg) {
        fail = "the field turns " + (rotationDeg === null ? "an undefined angle"
             : rotationDeg.toFixed(1) + " deg") + " across this window, under the "
             + bars.rotationDeg + " deg bar: nothing was crossed";
      } else if (!(m.lambdas[1] >= bars.lambda2)) {
        fail = "the intermediate eigenvalue is " + m.lambdas[1].toExponential(2)
             + " nT^2, under the " + bars.lambda2.toExponential(2) + " floor: "
             + "the plane this normal is perpendicular to comes out of the "
             + "feed's rounding and not out of the field";
      } else if (normalShare === null || normalShare > bars.normalShare) {
        fail = "the mean field has " + (normalShare === null ? "no"
             : (100 * normalShare).toFixed(0) + " %") + " of itself along the "
             + "normal, over the " + (100 * bars.normalShare).toFixed(0)
             + " % bar: this plane is not one the field lies in";
      } else if (!(m.ratio >= bars.ratio)) {
        fail = "lambda2/lambda3 is " + m.ratio.toFixed(2) + ", under the "
             + bars.ratio + " bar: the minimum-variance direction is not "
             + "separated from the intermediate one";
      }
      out.verdict = fail ? "refused" : "sheet";
      out.why = fail;
      return out;
    },

    /* The window length is a free parameter, and a free parameter that decides
       the answer is a choice wearing a measurement's clothes. Measured on the
       frozen record before this function existed: hand-picked windows around a
       presumed crossing put the normal 27.4 deg apart between +-4 h and +-6 h,
       and 44.4 deg apart between +-4 h and +-12 h.

       So the sweep is not used to PICK a length. It is used as the test: a
       normal counts only if it survives at TWO OR MORE of the swept lengths,
       and the spread between them travels with it to the panel. That turns the
       free parameter into a measurement without inventing a threshold for it —
       there is no "spread <= X deg" bar here, because any such number would
       have been chosen with the answer already on screen.
       → [[as-die-je-niet-sweept]], [[ijkpunt-niet-op-de-referentiewaarde]]

       `at` is a time; `samples` carry {time, x, y, z}. Returns null when there
       is nothing to say, and an object with `verdict: "refused"` when there is
       a reason to say nothing — those are different and the caller must be
       able to tell them apart. → [[weigering-machinaal-onderscheidbaar]] */
    SHEET_HALF_WIDTHS_H: [1, 2, 3, 4, 6, 9, 12],

    /* The four bars as ONE value, for the same reason CONE_BAR_DEG is one: the
       app, the suite and test-sector/sheet-gate.js must not be able to drift
       into three different answers. Two are derived and two are CHOSEN, and
       which is which is carried here rather than in a comment somewhere else.

         rotationDeg  DERIVED. Below 90 deg the mean fields of the first and
                      last third still lie on the same side, so by definition
                      nothing reversed.
         lambda2      DERIVED from the SOURCE, not from us: the feed publishes
                      two decimals, so a component carries rounding uniform on
                      [-0.005, 0.005] nT, whose variance is 0.01^2/12 =
                      8.33e-6 nT^2. The bar is 100x that floor.
         normalShare  CHOSEN. Ordinary MVA practice puts |<B>.n|/|B| somewhere
                      between 0.2 and 0.4 and no measurement in this project
                      picks one. The measured value is published beside it.
         ratio        CHOSEN, convention. And proven NOT sufficient: on the
                      frozen record the sixteen quiet hours score 5.32 and the
                      real reversal 2.05, so this bar alone points the wrong
                      way. It is a necessary condition and not the verdict. */
    SHEET_BARS: {
      rotationDeg: 90,
      lambda2: 100 * ((0.01 * 0.01) / 12),
      normalShare: 0.30,
      ratio: 2.0
    },

    sheetNormal: function (samples, at, bars) {
      if (!samples || !samples.length || !isFinite(at)) return null;
      var self = this, passes = [], tried = 0, lastWhy = null;

      this.SHEET_HALF_WIDTHS_H.forEach(function (h) {
        var halfMs = h * 3600e3;
        var win = samples.filter(function (s) {
          return s.time >= at - halfMs && s.time <= at + halfMs;
        });
        var q = self.sheetQuality(win, bars);
        if (!q) return;
        tried++;
        if (q.verdict === "sheet") passes.push({ halfWidthH: h, q: q });
        else lastWhy = q.why;
      });

      if (!tried) return null;
      if (passes.length === 0) {
        return { verdict: "refused", widths: 0, tried: tried, normal: null,
                 spreadDeg: null,
                 why: lastWhy || "no window length gives a determined normal" };
      }
      if (passes.length === 1) {
        return { verdict: "refused", widths: 1, tried: tried, normal: null,
                 spreadDeg: null,
                 why: "a normal appears at one window length (+-"
                    + passes[0].halfWidthH + " h) and at none of the other "
                    + (tried - 1) + ": an answer that depends on how wide you "
                    + "look is a choice, not a measurement" };
      }

      /* The widest pairwise angle between the surviving normals. Sign is
         meaningless for a plane normal, so the angle is taken on |n1 . n2|. */
      var worst = 0;
      for (var i = 0; i < passes.length; i++) {
        for (var j = i + 1; j < passes.length; j++) {
          var a = passes[i].q.normal, b = passes[j].q.normal;
          var d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z);
          var ang = Math.acos(Math.min(1, d)) * DEG;
          if (ang > worst) worst = ang;
        }
      }

      /* Reported from the MIDDLE surviving width rather than the best-scoring
         one. Taking the best would be picking the window that flatters the
         answer, which is the same error as reading a plateau off its collapsed
         end. */
      var mid = passes[Math.floor(passes.length / 2)];
      /* EVERY SURVIVING NORMAL TRAVELS, not just the middle one and a scalar.
         `spreadDeg` is the widest pairwise angle, and a single number cannot
         say what SHAPE the disagreement has — two windows apart and a third
         with them reads identically to three evenly scattered. The drawing that
         consumed only the scalar turned it into a circle around the reported
         normal, which is not the image of an angular cone in a polar dial and,
         at 67.6 deg on a 90 deg scale, reached 139 deg — a value the quantity
         cannot take. Handing over the normals themselves lets the plate draw
         measurements instead of inventing a region between them.
         Sign is canonicalised in `mva`, so these are directly comparable. */
      return {
        verdict: "sheet",
        widths: passes.length,
        tried: tried,
        halfWidthH: mid.halfWidthH,
        widthsPassedH: passes.map(function (p) { return p.halfWidthH; }),
        normals: passes.map(function (p) {
          return { halfWidthH: p.halfWidthH, normal: p.q.normal,
                   reported: p.halfWidthH === mid.halfWidthH };
        }),
        normal: mid.q.normal,
        spreadDeg: worst,
        quality: mid.q,
        why: null
      };
    }
  };
}));
