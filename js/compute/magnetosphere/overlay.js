/* terra/overlay.js — het schaalraster en de toestellen, op een tweede canvas.

   WAAROM DIT GEEN SCENE-OBJECT IS. Allebei de dingen die hier getekend worden
   dragen TEKST — Re-getallen langs de assen, en bij elk toestel zijn naam met
   de gemeten waarde erachter. Tekst in WebGL kost een texture per label en
   wordt wazig zodra hij niet op een hele pixel valt; op een 2D-canvas is het
   één `fillText`. De POC tekent beide dan ook met canvas-2D
   (igrf-globe-poc.html:6596 en 7320), en die code past hier vrijwel
   ongewijzigd in.

   WAT DE REGISTRATIE HIERVAN VINDT. Een tweede canvas is een tweede projectie,
   en twee projecties die uit elkaar lopen is precies de fout die dit project
   overal uitsluit. Daarom rekent dit bestand NIETS zelf uit over waar iets
   staat: elke schermpositie komt uit `Core.Registration`, hetzelfde object
   waaruit de Three.js-frustum wordt gezet. De gemeten registratiefout is
   2,3e-13 px, en die geldt dus ook voor deze laag.

   WAAROM HET RASTER ALLEEN IN MERIDIAN STAAT. Een raster is een SCHAAL, en een
   perspectiefbeeld heeft er geen — daar is één pixel vooraan iets anders waard
   dan achteraan. Een raster over de 3D-view zou een maat beloven die er niet
   is. De POC laat hem om dezelfde reden vallen (`Camera.mode !== "meridian"`).
   De toestellen staan er wél in beide: die zijn een positie, geen maat. */

(function (root) {
"use strict";

var Overlay = {

  /* De afstand tussen twee rasterlijnen, in Re.

     Vastgeklikt op de ladder 1 · 2 · 5 × 10ⁿ, met ongeveer 90 px tussen twee
     labels. Die ladder is niet cosmetisch: een raster van 3 of 7 Re is bij
     elke zoomstand opnieuw hoofdrekenen, en een schaal die je moet uitrekenen
     is er geen. Geport uit igrf-globe-poc.html:6604-6608.

     Nagerekend tegen de POC-schermafdruk: 30,44 px/Re geeft raw = 2,96 en dus
     stap 5, en dat is precies wat daar staat. */
  step: function (pxPerRe, aimPx) {
    var aim = aimPx === undefined ? 90 : aimPx;
    var raw = aim / pxPerRe;
    var mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
    var ladder = [1, 2, 5, 10];
    for (var i = 0; i < ladder.length; i++) {
      if (ladder[i] * mag >= raw) return ladder[i] * mag;
    }
    return 10 * mag;
  },

  /* De rasterwaarden die in een bereik vallen, buitenwaarts afgerond zodat de
     lijnen tot voorbij de rand doorlopen en er geen halve cel aan de kant
     overblijft. Los toetsbaar, want een off-by-one hier is een raster dat één
     lijn mist en dat valt op geen enkele schermafdruk op. */
  ticks: function (lo, hi, step) {
    var out = [];
    if (!(step > 0) || !isFinite(lo) || !isFinite(hi) || hi < lo) return out;
    var a = Math.floor(lo / step) * step;
    var b = Math.ceil(hi / step) * step;
    /* Op de stap tellen en niet optellen: 0,1 + 0,1 + 0,1 is niet 0,3, en een
       raster dat na twintig lijnen 1e-14 verschoven is, labelt "5" als
       "4.999999999999998". */
    var n = Math.round((b - a) / step);
    for (var i = 0; i <= n; i++) out.push(a + i * step);
    return out;
  },

  /* Nul is nul en niet "-0" of "0.00". Verder hoogstens twee decimalen: onder
     0,01 Re per lijn zou het raster fijner zijn dan de aardstraal. */
  label: function (v) {
    return Math.abs(v) < 1e-9 ? "0" : String(+v.toFixed(2));
  },

  /* ---------- tekenen ----------------------------------------------------- */

  /* Alles wat hier binnenkomt is al uitgerekend: `o.craft` draagt
     schermposities, geen lengtegraden. Dit bestand kent de datalaag niet en de
     frames evenmin — het tekent wat het krijgt. */
  /* De kleuren moeten STRINGS zijn. Een canvas negeert een fillStyle die dat
     niet is en houdt de vorige waarde vast — bij het eerste gebruik zwart, op
     een zwarte achtergrond. Dat is precies hoe deze laag zijn eerste versie
     stil verloor: het raster stond er, de labels en de toestellen werden
     getekend in zwart-op-zwart, en geen enkele meting op "is er inkt" liet het
     zien. Een THREE.Color is geen string, en dat is een makkelijke vergissing:
     het palet draagt beide vormen, als `goes` en als `goes_hex`. */
  KLEUREN: ["faint", "goesInk", "arcjetInk", "gridInk", "axisInk", "dipInk"],

  check: function (o) {
    var mis = [];
    for (var i = 0; i < this.KLEUREN.length; i++) {
      var k = this.KLEUREN[i];
      if (typeof o[k] !== "string" || !o[k]) mis.push(k + "=" + typeof o[k]);
    }
    return mis;
  },

  draw: function (c, o) {
    var mis = this.check(o);
    if (mis.length) throw new Error("overlay: kleur is geen string — " + mis.join(", "));
    c.clearRect(0, 0, o.view.w, o.view.h);
    if (o.grid && o.view.mode === "meridian") this.grid(c, o);
    /* De as vóór de toestellen: waar ze elkaar raken hoort de stip met zijn
       meting bovenop te liggen, niet een streepjeslijn eroverheen. */
    if (o.axis) this.axis(c, o);
    if (o.craftOn) this.craft(c, o);
    return true;
  },

  grid: function (c, o) {
    var view = o.view, R = o.R, ins = o.insets;
    var px = R.pxPerRe(view);
    if (!(px > 0)) return;
    var step = this.step(px);
    var halfX = (view.w / 2) / px, halfZ = (view.h / 2) / px;
    var tx = view.targetX || 0, tz = view.targetZ || 0;

    var top = ins.top, bot = view.h - ins.bottom;
    var left = ins.left, right = view.w - ins.right;
    if (bot <= top || right <= left) return;

    c.save();
    c.lineWidth = 1;
    c.font = "9px " + o.mono;
    c.textBaseline = "alphabetic";

    /* De verticalen: constante x in Re. De nul-as krijgt meer inkt — dat is de
       enige lijn die iets bewéért, namelijk waar de aarde staat. */
    c.textAlign = "center";
    var xs = this.ticks(tx - halfX, tx + halfX, step);
    for (var i = 0; i < xs.length; i++) {
      var sx = R.reToPx(view, xs[i], 0).x;
      if (sx < -2 || sx > view.w + 2) continue;
      c.strokeStyle = Math.abs(xs[i]) < 1e-9 ? o.axisInk : o.gridInk;
      c.beginPath(); c.moveTo(sx, top); c.lineTo(sx, bot); c.stroke();
      c.fillStyle = o.faint;
      c.fillText(this.label(xs[i]), sx, bot + 12);
    }

    /* De horizontalen: constante z. z = 0 krijgt GEEN label — dat zou pal op de
       x-as-getallen vallen, en twee schalen die elkaar overschrijven leest als
       één schaal die niet klopt. */
    c.textAlign = "left";
    var zs = this.ticks(tz - halfZ, tz + halfZ, step);
    for (var j = 0; j < zs.length; j++) {
      var sy = R.reToPx(view, 0, zs[j]).y;
      if (sy < top || sy > bot) continue;
      c.strokeStyle = Math.abs(zs[j]) < 1e-9 ? o.axisInk : o.gridInk;
      c.beginPath(); c.moveTo(left, sy); c.lineTo(right, sy); c.stroke();
      if (Math.abs(zs[j]) > 1e-9) {
        c.fillStyle = o.faint;
        c.fillText(this.label(zs[j]), left, sy - 3);
      }
    }

    /* De maat zelf. Een raster zonder eenheid is een decoratie, en px/Re is
       precies het getal waarmee iemand deze tekening kan natrekken. */
    c.fillStyle = o.faint;
    c.textAlign = "left";
    c.fillText("Re, GSM X-Z  ·  " + px.toFixed(2) + " px/Re", left, top + 10);
    c.restore();
  },

  /* DE DIPOOLAS, gestreept en dwars door de planeet heen.

     WAAROM HIER EN NIET IN DE SCENE. Tot sessie 28 was dit een THREE.Line onder
     `earth`, en daarmee reikte hij tot ±1,45 aardstralen — nauwelijks buiten de
     bol, dus de kanteling die het hele punt is viel weg tegen de graticule. De
     POC trekt hem tot ±2,6 en streept hem (igrf-globe-poc.html:6345 en 7477).

     Streepjes zijn de reden dat hij verhuisd is. Een `LineDashedMaterial` meet
     zijn streeplengte in WERELDeenheden, dus het patroon schaalt met de zoom:
     op de dichtstbijzijnde stand zouden het lange strepen zijn en op de verste
     een doorgetrokken lijn. `setLineDash` op canvas meet in PIXELS en staat dus
     stil terwijl je zoomt — wat een streepjeslijn hoort te doen, want de
     streepjes zeggen "dit is een hulplijn" en niet "dit is zo lang".

     STREEPJES EN NIET DOORGETROKKEN, want de as is geen veldlijn en geen baan:
     hij is een RICHTING. Een doorgetrokken lijn in dit beeld betekent overal
     iets dat je kunt volgen.

     DE AS TEKENT OVER DE AARDE HEEN, en dat is opzet. Je wilt juist zien waar
     hij de bol in en uit gaat — dat is wat magnetisch noord van geografisch
     noord onderscheidt. Het LABEL heeft daarentegen wél een occlusietoets
     nodig: een "N" die aan de verkeerde kant van de planeet zweeft wijst een
     pool aan waar er geen is. */
  axis: function (c, o) {
    var a = o.axis;
    if (!a || !a.visible) return;
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = o.dipInk;
    c.lineWidth = 1.2;
    c.globalAlpha = 0.85;
    c.beginPath(); c.moveTo(a.x1, a.y1); c.lineTo(a.x2, a.y2); c.stroke();
    c.setLineDash([]);
    if (a.tipVisible) {
      c.globalAlpha = 1;
      c.fillStyle = o.dipInk;
      c.font = "10px " + o.mono;
      /* IN HET VERLENGDE VAN DE AS EN NIET ERNAAST. De POC zet de N op een vast
         offset naar rechts (igrf-globe-poc.html:7488), en dat leest als een
         label dat toevallig in de buurt hangt: bij een as die naar links helt
         staat hij aan de verkeerde kant. Terry, sessie 28: "het zou mooier zijn
         als de N ook recht op de lijn staat."

         Dus langs de asrichting doorgetrokken, gecentreerd op dat punt. Dan
         wijst het label mee met de kanteling in plaats van hem tegen te
         spreken — en dat is precies wat deze lijn hoort te tonen. */
      c.textAlign = "center";
      c.textBaseline = "middle";
      var dx = a.x1 - a.x2, dy = a.y1 - a.y2;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      c.fillText("N", a.x1 + dx / len * 9, a.y1 + dy / len * 9);
    }
    c.restore();
  },

  /* De toestellen. Drie dingen die de POC hier zegt en die geen van drieën
     versiering zijn:

     HOL TEGEN VOL. In de meridiaan-doorsnede is y uit het vlak, en GOES staat
     daar bijna nooit in: de baan ligt op de evenaar en het vlak op de zonlijn.
     Een volle stip zou beweren dat het toestel staat waar je het ziet. Hol
     betekent: dit is zijn projectie, hij zit `y` Re voor of achter dit vlak,
     en het label zegt hoeveel.

     ARCJET. De stuurmotoren van het toestel verstoren zijn eigen magnetometer.
     Die minuten worden GEVLAGD en niet weggegooid — een weggelaten sample is
     ook een bewering — dus krijgt het toestel een andere kleur en een ring.

     DE GEMETEN WAARDE ERBIJ. Dit is het enige punt in de hele scene waar dit
     project het veld werkelijk meet. Dat getal hoort bij de stip te staan en
     niet alleen in een rij aan de kant. */
  craft: function (c, o) {
    var list = o.craft || [];
    if (!list.length) return;
    c.save();
    c.font = "9px " + o.mono;
    c.textBaseline = "middle";
    c.textAlign = "left";
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g.visible) continue;
      var r = g.primary ? 3.5 : 2.8;
      c.globalAlpha = g.primary ? 1 : 0.65;
      c.strokeStyle = c.fillStyle = g.arcjet ? o.arcjetInk : o.goesInk;
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(g.x, g.y, r, 0, Math.PI * 2);
      if (g.offPlane) c.stroke(); else c.fill();
      if (g.arcjet) {
        c.globalAlpha = 0.5;
        c.beginPath(); c.arc(g.x, g.y, r + 3, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = g.primary ? 1 : 0.65;
      }
      c.fillText(this.craftLabel(g), g.x + 7, g.y + 3);
    }
    c.restore();
  },

  /* Puur, en getoetst: dit label is de enige plek waar een meting en een
     modelaanname naast elkaar op het scherm komen. Een ontbrekende meting hoort
     dan ook WEG te vallen en niet als nul te verschijnen. */
  craftLabel: function (g) {
    var s = "GOES-" + g.satellite;
    if (typeof g.ext === "number" && isFinite(g.ext)) {
      s += "  " + g.ext.toFixed(0) + " nT";
    }
    if (g.arcjet) s += "  arcjet";
    if (g.offPlane) s += "  (uit het vlak, y " + g.y3d.toFixed(1) + " Re)";
    return s;
  }
};

if (typeof module === "object" && module.exports) module.exports = Overlay;
else root.TerraOverlay = Overlay;

})(typeof globalThis !== "undefined" ? globalThis : this);
