import type { Severity } from '@prisma/client';

export type SeedItem = {
  text: string;
  guidance?: string;
  severity: Severity;
  weight?: number;
  mandatory?: boolean;
};

export type SeedCategory = {
  name: string;
  weight?: number;
  items: SeedItem[];
};

/**
 * "Bank Branch Facility Inspection" — the reference template.
 * Weights reflect real risk: life-safety items carry more than housekeeping.
 */
export const BANK_BRANCH_TEMPLATE: SeedCategory[] = [
  {
    name: 'Electrical',
    weight: 3,
    items: [
      { text: 'Main DB condition', guidance: 'Enclosure intact, no burn marks, door closes and locks.', severity: 'HIGH', weight: 3 },
      { text: 'MCB / MCCB labeling', guidance: 'Every breaker labelled with the circuit it controls.', severity: 'MEDIUM', weight: 2 },
      { text: 'Cable management', guidance: 'Cables dressed, ferruled and routed in trunking.', severity: 'MEDIUM', weight: 2 },
      { text: 'Earthing', guidance: 'Earth pit resistance within limit; certificate available.', severity: 'CRITICAL', weight: 3 },
      { text: 'Electrical sockets', guidance: 'No loose, cracked or overloaded sockets.', severity: 'MEDIUM', weight: 2 },
      { text: 'Emergency lighting', guidance: 'Backup lights operate on mains failure.', severity: 'HIGH', weight: 3 },
      { text: 'Generator', guidance: 'Starts on load, fuel level adequate, log maintained.', severity: 'HIGH', weight: 3 },
      { text: 'UPS', guidance: 'Battery health, backup time and alarms verified.', severity: 'HIGH', weight: 2 },
      { text: 'Solar system', guidance: 'Panels clean, inverter healthy, output logged.', severity: 'LOW', weight: 1 },
    ],
  },
  {
    name: 'Fire & Life Safety',
    weight: 4,
    items: [
      { text: 'Fire extinguishers', guidance: 'Correct type and quantity, pressure in the green.', severity: 'CRITICAL', weight: 3 },
      { text: 'Fire extinguisher expiry', guidance: 'Refill and hydro-test dates valid.', severity: 'CRITICAL', weight: 3 },
      { text: 'Fire alarm', guidance: 'Panel healthy, no faults, tested this quarter.', severity: 'CRITICAL', weight: 3 },
      { text: 'Emergency exit', guidance: 'Exit door opens outward and is not locked during business hours.', severity: 'CRITICAL', weight: 3 },
      { text: 'Exit signage', guidance: 'Illuminated, visible from all occupied areas.', severity: 'HIGH', weight: 2 },
      { text: 'Emergency lighting (egress route)', guidance: 'Escape route lit on power failure.', severity: 'HIGH', weight: 2 },
      { text: 'Fire exit access', guidance: 'Escape path completely clear of storage and obstruction.', severity: 'CRITICAL', weight: 3 },
      { text: 'Smoke detectors', guidance: 'Installed per coverage plan and responding to test.', severity: 'HIGH', weight: 3 },
    ],
  },
  {
    name: 'CCTV & Security',
    weight: 3,
    items: [
      { text: 'Cameras operational', guidance: 'All cameras live with a clear, focused image.', severity: 'HIGH', weight: 3 },
      { text: 'DVR / NVR operational', guidance: 'Recorder online, disks healthy, time synchronised.', severity: 'HIGH', weight: 3 },
      { text: 'Recording available', guidance: 'Retention meets policy; footage retrievable on request.', severity: 'CRITICAL', weight: 3 },
      { text: 'Camera coverage', guidance: 'Cash counters, entrances, ATM and strong room covered.', severity: 'HIGH', weight: 3 },
      { text: 'Display operational', guidance: 'Monitor working and visible to the responsible officer.', severity: 'MEDIUM', weight: 1 },
      { text: 'UPS backup (security)', guidance: 'Surveillance stays up during a power outage.', severity: 'HIGH', weight: 2 },
      { text: 'Network connectivity', guidance: 'Remote viewing from head office confirmed.', severity: 'MEDIUM', weight: 2 },
    ],
  },
  {
    name: 'HVAC',
    weight: 2,
    items: [
      { text: 'AC operational', guidance: 'All units cooling; no unit out of service.', severity: 'MEDIUM', weight: 2 },
      { text: 'Temperature', guidance: 'Banking hall within 22-25 °C during business hours.', severity: 'LOW', weight: 1 },
      { text: 'Indoor unit condition', guidance: 'Clean, no water marks, no abnormal noise.', severity: 'LOW', weight: 1 },
      { text: 'Outdoor unit condition', guidance: 'Coils clean, mounting secure, guarded.', severity: 'MEDIUM', weight: 1 },
      { text: 'Drainage', guidance: 'Condensate drains freely; no pooling or seepage.', severity: 'MEDIUM', weight: 2 },
      { text: 'Filters', guidance: 'Cleaned per schedule, service log signed.', severity: 'LOW', weight: 1 },
    ],
  },
  {
    name: 'Civil / Building',
    weight: 2,
    items: [
      { text: 'Walls', guidance: 'Paint intact, no cracks or exposed masonry.', severity: 'LOW', weight: 1 },
      { text: 'Ceiling', guidance: 'Tiles complete, no sagging or stained panels.', severity: 'LOW', weight: 1 },
      { text: 'Flooring', guidance: 'No broken or lifted tiles that could trip a customer.', severity: 'MEDIUM', weight: 2 },
      { text: 'Doors', guidance: 'Close, lock and seal correctly; closers working.', severity: 'MEDIUM', weight: 2 },
      { text: 'Windows', guidance: 'Glazing intact, locks functional, sealed against water.', severity: 'MEDIUM', weight: 1 },
      { text: 'Water leakage', guidance: 'No active leakage from roof, plumbing or AC.', severity: 'HIGH', weight: 3 },
      { text: 'Dampness', guidance: 'No rising damp or moisture staining on walls.', severity: 'MEDIUM', weight: 2 },
    ],
  },
  {
    name: 'Housekeeping',
    weight: 1,
    items: [
      { text: 'Cleanliness', guidance: 'Banking hall, counters and customer seating clean.', severity: 'LOW', weight: 1 },
      { text: 'Washrooms', guidance: 'Clean, stocked, working fixtures, no odour.', severity: 'MEDIUM', weight: 2 },
      { text: 'Waste disposal', guidance: 'Bins covered and cleared daily.', severity: 'LOW', weight: 1 },
      { text: 'Storage', guidance: 'No storage in corridors, plant rooms or under stairs.', severity: 'MEDIUM', weight: 2 },
      { text: 'Pest control', guidance: 'Service current; no evidence of infestation.', severity: 'MEDIUM', weight: 2 },
    ],
  },
  {
    name: 'IT',
    weight: 3,
    items: [
      { text: 'Server / IT room', guidance: 'Access restricted, tidy, no combustible storage.', severity: 'HIGH', weight: 3 },
      { text: 'Network rack', guidance: 'Rack closed, earthed and labelled.', severity: 'MEDIUM', weight: 2 },
      { text: 'Switches', guidance: 'No fault LEDs; spare ports available.', severity: 'MEDIUM', weight: 2 },
      { text: 'UPS (IT)', guidance: 'Backup verified against the branch load.', severity: 'HIGH', weight: 3 },
      { text: 'Cable management (IT)', guidance: 'Patch cords dressed and labelled at both ends.', severity: 'LOW', weight: 1 },
      { text: 'Temperature (IT room)', guidance: 'Maintained below 24 °C with monitoring in place.', severity: 'HIGH', weight: 2 },
      { text: 'Access control', guidance: 'Entry logged; access list reviewed and current.', severity: 'HIGH', weight: 3 },
    ],
  },
];

export const TOTAL_ITEMS = BANK_BRANCH_TEMPLATE.reduce((n, c) => n + c.items.length, 0);

/** A second template so the template list is not a single row. */
export const ATM_TEMPLATE: SeedCategory[] = [
  {
    name: 'ATM Site Safety',
    weight: 3,
    items: [
      { text: 'ATM room lighting', severity: 'MEDIUM', weight: 2 },
      { text: 'Anti-skimming device fitted', severity: 'CRITICAL', weight: 3 },
      { text: 'CCTV covering ATM fascia', severity: 'HIGH', weight: 3 },
      { text: 'Fire extinguisher present and valid', severity: 'HIGH', weight: 2 },
      { text: 'Earthing and electrical safety', severity: 'HIGH', weight: 3 },
      { text: 'Enclosure cleanliness', severity: 'LOW', weight: 1 },
      { text: 'Shutter and door locking', severity: 'HIGH', weight: 2 },
      { text: 'UPS backup for ATM', severity: 'MEDIUM', weight: 2 },
    ],
  },
];
