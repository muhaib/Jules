# PowerCalc Pakistan

**Electrical Load & Solar Sizing Calculator** — a mobile-first engineering tool for
electrical engineers, technicians, solar installers and facility teams working in
Pakistan.

It builds a load schedule, sizes cables and protection, sizes a rooftop PV array,
counts modules, estimates roof area and inverter capacity, and generates an
editable Bill of Quantities — showing the formula and every assumption behind
each number.

---

## Running it

No build step, no dependencies to install.

```bash
npm start           # http://localhost:5173
```

`npm start` runs a ~50-line static file server (`server.js`) using only Node's
standard library. Any static host works just as well — GitHub Pages, Netlify, an
S3 bucket, or a folder served by nginx. The app is plain ES modules, so it needs
to be served over HTTP; opening `index.html` from the file system directly will
be blocked by the browser's module CORS rules.

```bash
npm test            # 120+ tests via node --test, no install required
```

Everything runs in the browser. There is no account, no server component and no
network call — projects are stored in `localStorage` and nothing leaves the
device. It works offline once loaded.

---

## What it calculates

### Load
- Connected load, maximum demand, 24-hour running load and daily/monthly energy,
  kept strictly separate
- Aggregate power factor as **total kW ÷ total kVA** — not the arithmetic mean of
  the individual factors, which is the common mistake
- Line current:
  - Three phase: `I = P / (√3 × V_LL × PF)`
  - Single phase: `I = P / (V_LN × PF)`
- Per-item and whole-installation diversity, plus a spare-capacity allowance

### Cable
Follows the conventional LV selection sequence, and shows each step:

1. Design current `Ib`
2. Protective device rating `In ≥ Ib` from the standard range
3. Required tabulated rating `It ≥ In / (Ca × Cg × Ci)`
4. Smallest size whose base rating meets `It` — the **thermal** size
5. Smallest size meeting the voltage-drop limit — the **voltage-drop** size
6. The **larger of the two** is what is recommended

The cable is sized to carry the *device rating*, not merely the design current,
so that the protection actually protects the cable.

### Voltage drop
Computed from conductor physics rather than a mV/A/m lookup, so every term is
visible and adjustable:

```
R′ = ρ₂₀ × [1 + α(θ − 20)] / A          X′ = user-set reactance

Single phase:  ΔV = 2  × I × L × (R′·cosφ + X′·sinφ)
Three phase:   ΔV = √3 × I × L × (R′·cosφ + X′·sinφ)
```

### Solar
Two sizing modes, because "how big a system do I need?" has two different
engineering answers:

- **Mode A — instantaneous daytime load.** Sizes the array to supply a share of
  the daytime load at *peak irradiance*. Answers "will solar run my site during
  the day?" It does **not** mean the load is covered all day.
- **Mode B — daily energy.** Sizes the array so its energy over an average day
  covers a share of daily consumption. Answers "how much of my monthly units will
  solar replace?" It says nothing about instantaneous matching.

```
System efficiency = (1 − DC losses) × inverter efficiency
Mode A:  kWp = target AC power / system efficiency
Mode B:  kWp = required energy / (peak sun hours × system efficiency)
```

### Modules and array area
- Module count **always rounds up** — a fractional panel does not exist
- Module dimensions entered in mm, converted to m, ft, m² and sq ft
- Gross area = module glass area ÷ ground coverage ratio × (1 + access margin)
- Row pitch `= L·cos β + L·sin β / tan α`, with α defaulting to winter solar noon
  at the site latitude

### Inverter
Reports a **range** bounded by the acceptable DC/AC ratio, with a hard floor from
the site load for hybrid and off-grid systems. It never presents a single rating
as universally correct.

### BOQ
17 line items — modules, inverter, mounting, DC/AC cable, isolators, SPDs,
earthing, MC4 connectors, combiners, DB, tray, labels, installation — with every
quantity derived from the sizing results. Each line records the rule that
produced its quantity, so a reviewer can change the driver rather than the
number. Fully editable; exports to Excel, CSV and PDF.

---

## Architecture

The calculation engine is completely separate from the interface. It has no DOM
dependency, so it can be exercised and verified without a browser.

```
src/
  engine/          Pure functions — plain data in, plain data out
    units.js         Unit conversion and formatting
    validation.js    Input checks, returning issues rather than throwing
    constants.js     Reference tables, each labelled with its own basis
    load.js          Load schedule, demand, power factor, current
    voltagedrop.js   Drop from conductor physics
    cable.js         Full LV selection sequence
    solar.js         PV sizing (both modes), yield, savings, seasonal shape
    panels.js        Module count, footprint, gross area, row spacing
    inverter.js      Capacity range and standard-rating selection
    boq.js           Bill of quantities from the sizing results
    index.js         calculateProject() — runs the whole chain in order

  export/          Serialisation, all pure except download.js and print.js
    zip.js           Minimal STORE-method ZIP writer
    xlsx.js          Genuine OOXML workbook, no third-party library
    csv.js           RFC 4180 quoting
    report.js        Spreadsheet rows and a printable A4 HTML report
    download.js      Browser download helpers
    print.js         Hands the report to the browser's print pipeline

  ui/              Views. Each renders from state; none holds its own copy
  store.js         Projects and settings in localStorage
  main.js          Hash router and render loop

test/              node --test, no dependencies
```

**Results are never stored.** The store holds inputs only; every figure on screen
is re-derived by the engine on each render. There is no code path by which a
stale result can survive an input change.

### Using the engine on its own

```js
import { calculateProject, createLoadItem } from './src/engine/index.js';

const r = calculateProject({
  load: {
    systemVoltage: 400,
    systemPhases: 3,
    loads: [createLoadItem({
      name: 'Branch load', quantity: 1, ratedPower: 43, unit: 'kW',
      phase: 3, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 10,
    })],
  },
  solar: { mode: 'instantaneous', cityKey: 'multan', targetPercent: 100 },
  panels: { panelWattage: 600, panelWidthMm: 2278, panelHeightMm: 1134 },
  cable: { lengthM: 50 }, inverter: {}, boq: {},
});

r.load.demandCurrentA;        // 68.97 A
r.solar.requiredPvKWp;        // 51.55 kWp
r.panels.panelCount;          // 86
r.inverter.rangeLabel;        // '40–52 kW'
r.cable.recommendedSizeMm2;   // 25
```

---

## About the reference data — please read

`src/engine/constants.js` holds the ampacity table, correction factors and peak
sun hours. These are **indicative values compiled for preliminary estimating**.
They are shaped after the IEC 60364-5-52 / BS 7671 family of tables and published
solar resource data, but this project is **not** a standards document and has no
standards-body status.

Every value a design depends on must be checked against:

- the current edition of the applicable standard;
- the cable manufacturer's published ratings; and
- site-measured or site-specific irradiation data (Global Solar Atlas, NASA
  POWER, Meteonorm) rather than the planning-grade city averages here.

The tables are printed in full under **Settings → Reference data** so you can
judge whether they fit your project, rather than trusting a black box. Each one
carries a `_basis` string stating the conditions it applies to.

An ampacity number on its own never means a cable is safe. Every cable result in
this app ships the list of what it does **not** cover: installation method,
derating, short-circuit withstand (`k²S² ≥ I²t`), earth-fault loop impedance,
harmonics, CPC sizing and the manufacturer's own ratings.

Tariff and cost figures are placeholders. Pakistani electricity tariffs are
slab-based and revised periodically — enter your own rate from your bill.

---

## Disclaimer

> Calculations are preliminary engineering estimates. Final equipment and cable
> selection must be verified against manufacturer datasheets, site conditions,
> applicable electrical codes, protection coordination requirements, and
> qualified engineering review.

This notice appears on every calculation page in the app and on every export.

---

## Notes on a few implementation choices

**PDF export goes through the browser's print dialog** ("Save as PDF") rather
than a bundled PDF writer. That keeps the app dependency-free and offline-capable,
and the browser's renderer gives better typography and pagination than a
hand-rolled writer would. The trade-off is one extra step for the user.

**Excel export writes a real `.xlsx`.** An OOXML workbook is a ZIP container, so
`src/export/zip.js` implements a minimal STORE-method (uncompressed) ZIP writer —
its CRC-32 is verified in the test suite against the standard `0xCBF43926` check
value, and the generated workbook is validated with `unzip -t`.

**The seasonal generation chart is astronomy, not weather.** It comes from
extraterrestrial daily irradiation at the site latitude (Duffie & Beckman), which
captures day length and sun height through the year and captures *nothing* about
monsoon cloud, dust or haze. It is labelled as such in the app.

**Aluminium conductors start at 16 mm²**, since smaller aluminium sizes are not
commonly manufactured for these applications.

---

## Browser support

Any current browser with ES module support: Chrome/Edge 91+, Firefox 90+,
Safari 15+. `structuredClone` is used for project duplication.

## Licence

MIT.
