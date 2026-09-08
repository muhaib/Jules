export const ORG = {
  name: 'ABC Bank',
  legalName: 'ABC Bank Limited',
  slug: 'abc-bank',
  timezone: 'Asia/Karachi',
};

export const REGIONS = [
  { code: 'SPJ', name: 'South Punjab' },
  { code: 'CPJ', name: 'Central Punjab' },
  { code: 'FED', name: 'Federal Capital' },
  { code: 'SND', name: 'Sindh' },
];

export const CLUSTERS = [
  { code: 'CL-MUL', name: 'Multan Cluster', region: 'SPJ' },
  { code: 'CL-BWP', name: 'Bahawalpur Cluster', region: 'SPJ' },
  { code: 'CL-LHR', name: 'Lahore Cluster', region: 'CPJ' },
  { code: 'CL-FSD', name: 'Faisalabad Cluster', region: 'CPJ' },
  { code: 'CL-ISB', name: 'Islamabad Cluster', region: 'FED' },
  { code: 'CL-KHI', name: 'Karachi Cluster', region: 'SND' },
];

export type SeedBranch = {
  code: string;
  name: string;
  city: string;
  address: string;
  region: string;
  cluster: string;
  type: string;
  featured?: boolean;
};

/**
 * The five branches named in the brief are "featured": they carry a full
 * quarterly inspection history so trends and repeat findings are visible.
 * The rest give the dashboard realistic breadth.
 */
export const BRANCHES: SeedBranch[] = [
  { code: 'MUL-001', name: 'Multan Cantt', city: 'Multan', address: 'Kutchery Road, Multan Cantt', region: 'SPJ', cluster: 'CL-MUL', type: 'Full Service Branch', featured: true },
  { code: 'MUL-002', name: 'Multan Gulgasht', city: 'Multan', address: 'Gulgasht Colony, Block B, Multan', region: 'SPJ', cluster: 'CL-MUL', type: 'Full Service Branch', featured: true },
  { code: 'MUL-003', name: 'Multan Nishtar', city: 'Multan', address: 'Nishtar Road, near Nishtar Hospital, Multan', region: 'SPJ', cluster: 'CL-MUL', type: 'Sub Branch', featured: true },
  { code: 'LHR-001', name: 'Lahore Main', city: 'Lahore', address: 'Shahrah-e-Quaid-e-Azam, Lahore', region: 'CPJ', cluster: 'CL-LHR', type: 'Corporate Branch', featured: true },
  { code: 'ISB-001', name: 'Islamabad Blue Area', city: 'Islamabad', address: 'Jinnah Avenue, Blue Area, Islamabad', region: 'FED', cluster: 'CL-ISB', type: 'Corporate Branch', featured: true },

  { code: 'MUL-004', name: 'Multan Bosan Road', city: 'Multan', address: 'Bosan Road, Multan', region: 'SPJ', cluster: 'CL-MUL', type: 'Full Service Branch' },
  { code: 'BWP-001', name: 'Bahawalpur Model Town', city: 'Bahawalpur', address: 'Model Town A, Bahawalpur', region: 'SPJ', cluster: 'CL-BWP', type: 'Full Service Branch' },
  { code: 'BWP-002', name: 'Bahawalpur Satellite Town', city: 'Bahawalpur', address: 'Satellite Town, Bahawalpur', region: 'SPJ', cluster: 'CL-BWP', type: 'Sub Branch' },
  { code: 'DGK-001', name: 'Dera Ghazi Khan Main', city: 'Dera Ghazi Khan', address: 'Jampur Road, DG Khan', region: 'SPJ', cluster: 'CL-BWP', type: 'Sub Branch' },

  { code: 'LHR-002', name: 'Lahore Gulberg', city: 'Lahore', address: 'Main Boulevard Gulberg III, Lahore', region: 'CPJ', cluster: 'CL-LHR', type: 'Full Service Branch' },
  { code: 'LHR-003', name: 'Lahore DHA Phase 5', city: 'Lahore', address: 'Sector C, DHA Phase 5, Lahore', region: 'CPJ', cluster: 'CL-LHR', type: 'Full Service Branch' },
  { code: 'LHR-004', name: 'Lahore Johar Town', city: 'Lahore', address: 'Khayaban-e-Firdousi, Johar Town, Lahore', region: 'CPJ', cluster: 'CL-LHR', type: 'Sub Branch' },
  { code: 'LHR-005', name: 'Lahore XYZ Plaza', city: 'Lahore', address: 'XYZ Plaza, Ferozepur Road, Lahore', region: 'CPJ', cluster: 'CL-LHR', type: 'Sub Branch' },
  { code: 'FSD-001', name: 'Faisalabad Clock Tower', city: 'Faisalabad', address: 'Kutchery Bazaar, Faisalabad', region: 'CPJ', cluster: 'CL-FSD', type: 'Full Service Branch' },
  { code: 'FSD-002', name: 'Faisalabad Peoples Colony', city: 'Faisalabad', address: 'Peoples Colony No. 1, Faisalabad', region: 'CPJ', cluster: 'CL-FSD', type: 'Sub Branch' },
  { code: 'SGD-001', name: 'Sargodha Main', city: 'Sargodha', address: 'University Road, Sargodha', region: 'CPJ', cluster: 'CL-FSD', type: 'Sub Branch' },

  { code: 'ISB-002', name: 'Islamabad F-10 Markaz', city: 'Islamabad', address: 'F-10 Markaz, Islamabad', region: 'FED', cluster: 'CL-ISB', type: 'Full Service Branch' },
  { code: 'ISB-003', name: 'Islamabad G-11 Markaz', city: 'Islamabad', address: 'G-11 Markaz, Islamabad', region: 'FED', cluster: 'CL-ISB', type: 'Sub Branch' },
  { code: 'RWP-001', name: 'Rawalpindi Saddar', city: 'Rawalpindi', address: 'Bank Road, Saddar, Rawalpindi', region: 'FED', cluster: 'CL-ISB', type: 'Full Service Branch' },
  { code: 'RWP-002', name: 'Rawalpindi Bahria Town', city: 'Rawalpindi', address: 'Phase 4 Civic Centre, Bahria Town', region: 'FED', cluster: 'CL-ISB', type: 'Sub Branch' },

  { code: 'KHI-001', name: 'Karachi I.I. Chundrigar', city: 'Karachi', address: 'I.I. Chundrigar Road, Karachi', region: 'SND', cluster: 'CL-KHI', type: 'Corporate Branch' },
  { code: 'KHI-002', name: 'Karachi Clifton', city: 'Karachi', address: 'Block 4, Clifton, Karachi', region: 'SND', cluster: 'CL-KHI', type: 'Full Service Branch' },
  { code: 'KHI-003', name: 'Karachi Gulshan-e-Iqbal', city: 'Karachi', address: 'Block 13-D, Gulshan-e-Iqbal, Karachi', region: 'SND', cluster: 'CL-KHI', type: 'Sub Branch' },
  { code: 'HYD-001', name: 'Hyderabad Latifabad', city: 'Hyderabad', address: 'Unit 7, Latifabad, Hyderabad', region: 'SND', cluster: 'CL-KHI', type: 'Sub Branch' },
];

export const DEMO_PASSWORD = 'BranchCheck#2026';

export type SeedUser = {
  key: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'REGIONAL_MANAGER' | 'INSPECTOR' | 'BRANCH_MANAGER' | 'VERIFIER';
  jobTitle: string;
  phone: string;
  regions?: string[];
  branches?: string[];
};

export const USERS: SeedUser[] = [
  { key: 'admin', name: 'Sana Iqbal', email: 'admin@abcbank.example', role: 'SUPER_ADMIN', jobTitle: 'Head of Administration', phone: '+92 300 1000001' },

  { key: 'rm-south', name: 'Kamran Rashid', email: 'kamran.rashid@abcbank.example', role: 'REGIONAL_MANAGER', jobTitle: 'Regional Manager — South Punjab', phone: '+92 300 1000002', regions: ['SPJ'] },
  { key: 'rm-central', name: 'Ayesha Noor', email: 'ayesha.noor@abcbank.example', role: 'REGIONAL_MANAGER', jobTitle: 'Regional Manager — Central Punjab', phone: '+92 300 1000003', regions: ['CPJ'] },
  { key: 'rm-fed', name: 'Bilal Ahmed', email: 'bilal.ahmed@abcbank.example', role: 'REGIONAL_MANAGER', jobTitle: 'Regional Manager — Federal & Sindh', phone: '+92 300 1000004', regions: ['FED', 'SND'] },

  { key: 'insp-1', name: 'Usman Tariq', email: 'usman.tariq@abcbank.example', role: 'INSPECTOR', jobTitle: 'Facility Inspector', phone: '+92 301 2000001', regions: ['SPJ'] },
  { key: 'insp-2', name: 'Hina Shah', email: 'hina.shah@abcbank.example', role: 'INSPECTOR', jobTitle: 'Facility Inspector', phone: '+92 301 2000002', regions: ['CPJ'] },
  { key: 'insp-3', name: 'Fahad Malik', email: 'fahad.malik@abcbank.example', role: 'INSPECTOR', jobTitle: 'Senior Facility Inspector', phone: '+92 301 2000003', regions: ['FED', 'SND'] },
  { key: 'insp-4', name: 'Rabia Aslam', email: 'rabia.aslam@abcbank.example', role: 'INSPECTOR', jobTitle: 'Facility & Safety Inspector', phone: '+92 301 2000004', regions: ['SPJ', 'CPJ'] },

  { key: 'ver-1', name: 'Imran Qureshi', email: 'imran.qureshi@abcbank.example', role: 'VERIFIER', jobTitle: 'Compliance Verification Officer', phone: '+92 302 3000001' },
  { key: 'ver-2', name: 'Nadia Farooq', email: 'nadia.farooq@abcbank.example', role: 'VERIFIER', jobTitle: 'Compliance Verification Officer', phone: '+92 302 3000002' },
];

/** Branch managers — the featured branches get named managers. */
export const BRANCH_MANAGERS: { name: string; email: string; branch: string }[] = [
  { name: 'Tahir Mehmood', email: 'tahir.mehmood@abcbank.example', branch: 'MUL-001' },
  { name: 'Saima Baig', email: 'saima.baig@abcbank.example', branch: 'MUL-002' },
  { name: 'Adnan Sheikh', email: 'adnan.sheikh@abcbank.example', branch: 'MUL-003' },
  { name: 'Faisal Nadeem', email: 'faisal.nadeem@abcbank.example', branch: 'LHR-001' },
  { name: 'Zainab Karim', email: 'zainab.karim@abcbank.example', branch: 'ISB-001' },
  { name: 'Hamza Yousaf', email: 'hamza.yousaf@abcbank.example', branch: 'MUL-004' },
  { name: 'Iqra Sultan', email: 'iqra.sultan@abcbank.example', branch: 'BWP-001' },
  { name: 'Waqas Anwar', email: 'waqas.anwar@abcbank.example', branch: 'LHR-002' },
  { name: 'Mehreen Aziz', email: 'mehreen.aziz@abcbank.example', branch: 'LHR-005' },
  { name: 'Shahid Butt', email: 'shahid.butt@abcbank.example', branch: 'FSD-001' },
  { name: 'Areeba Hassan', email: 'areeba.hassan@abcbank.example', branch: 'ISB-002' },
  { name: 'Junaid Akhtar', email: 'junaid.akhtar@abcbank.example', branch: 'RWP-001' },
  { name: 'Sadia Rehman', email: 'sadia.rehman@abcbank.example', branch: 'KHI-001' },
  { name: 'Danish Ali', email: 'danish.ali@abcbank.example', branch: 'KHI-002' },
];

/** Observation text keyed by checklist item, so findings read like a real report. */
export const OBSERVATIONS: Record<string, string> = {
  'Main DB condition': 'Main distribution board door does not latch and shows heat discolouration around the incoming terminals.',
  'MCB / MCCB labeling': 'Breakers in the main DB are unlabelled; circuits cannot be identified during an emergency isolation.',
  'Cable management': 'Cable dressing inside DB is improper. Conductors are twisted together without ferrules or trunking support.',
  'Earthing': 'Earth continuity could not be demonstrated; the last earth pit test report is not available at the branch.',
  'Electrical sockets': 'Two sockets near the cash counter are cracked, and one is being used with a multi-way extension under load.',
  'Emergency lighting': 'Emergency light in the banking hall did not illuminate when mains supply was interrupted during the test.',
  'Generator': 'Generator failed to take load on test. Battery terminals are corroded and the run log has not been filled since June.',
  'UPS': 'UPS battery backup lasted under four minutes against a required thirty minutes; batteries appear end-of-life.',
  'Solar system': 'Solar panels are heavily soiled and output is well below the expected generation for the installed capacity.',
  'Fire extinguishers': 'One DCP extinguisher near the strong room shows pressure in the red zone and is not serviceable.',
  'Fire extinguisher expiry': 'Two extinguishers carry refill dates that expired more than three months ago.',
  'Fire alarm': 'Fire alarm panel is showing a zone fault and the sounder did not activate on test.',
  'Emergency exit': 'Emergency exit door was found padlocked from the inside during business hours.',
  'Exit signage': 'Exit signage above the rear corridor is not illuminated and is obscured by a wall-mounted notice board.',
  'Emergency lighting (egress route)': 'The escape corridor has no functioning emergency light; the route would be unlit during an outage.',
  'Fire exit access': 'Fire extinguisher access blocked. Stationery cartons and a spare desk are stacked against the fire exit route.',
  'Smoke detectors': 'Smoke detectors in the records room did not respond to aerosol test and appear disconnected.',
  'Cameras operational': 'Two of eleven cameras are offline; the strong-room approach is currently not covered.',
  'DVR / NVR operational': 'NVR is reporting a failed disk and recording has stopped intermittently over the past two weeks.',
  'Recording available': 'Footage older than nine days could not be retrieved, against a policy retention of thirty days.',
  'Camera coverage': 'Cash counter 3 is outside the camera field of view following the counter re-layout.',
  'Display operational': 'Monitor in the manager cabin is faulty; live view is not available to the responsible officer.',
  'UPS backup (security)': 'Surveillance system is not on UPS; cameras go down with the mains supply.',
  'Network connectivity': 'Remote viewing from head office is not working; the site link drops repeatedly.',
  'AC operational': 'One of four indoor units is not cooling and has been out of service since the previous quarter.',
  'Temperature': 'Banking hall temperature recorded at 29 °C during business hours, well above the comfort standard.',
  'Indoor unit condition': 'Indoor unit above the customer seating area is water-stained and dripping onto the false ceiling.',
  'Outdoor unit condition': 'Outdoor unit coils are choked with dust and the mounting frame is corroded.',
  'Drainage': 'Condensate drain is blocked; water is pooling behind the indoor unit and seeping into the wall.',
  'Filters': 'AC filters have not been cleaned this quarter and the service log is unsigned.',
  'Walls': 'Paint is peeling along the customer waiting area and a hairline crack runs above the entrance.',
  'Ceiling': 'Three ceiling tiles are sagging and two are missing above the back office.',
  'Flooring': 'Two floor tiles near the entrance are broken and lifted, presenting a trip hazard to customers.',
  'Doors': 'Main entrance door closer is broken; the door slams and the seal no longer makes contact.',
  'Windows': 'Rear window latch is broken and the frame is not sealed against rainwater.',
  'Water leakage': 'Active water leakage from the roof slab above the records room, with visible pooling on the floor.',
  'Dampness': 'Rising damp and efflorescence visible along the rear wall of the strong room.',
  'Cleanliness': 'Customer seating area and counters were not cleaned before opening; visible dust and litter.',
  'Washrooms': 'Customer washroom has a leaking tap, no soap, and a persistent odour.',
  'Waste disposal': 'Uncovered waste bins are being stored in the corridor and were not cleared overnight.',
  'Storage': 'Cartons and obsolete furniture are being stored in the plant room and under the staircase.',
  'Pest control': 'Pest control service is three months overdue and rodent droppings were observed in the pantry.',
  'Server / IT room': 'IT room is being used to store stationery cartons and the door is left unlocked during the day.',
  'Network rack': 'Network rack door is missing and the rack earth conductor is not connected.',
  'Switches': 'Access switch is showing a persistent fault LED and no spare ports remain.',
  'UPS (IT)': 'IT UPS did not sustain the branch load on test; runtime is far below requirement.',
  'Cable management (IT)': 'Patch cords are unlabelled and hanging loose outside the rack.',
  'Temperature (IT room)': 'IT room recorded 31 °C with no dedicated cooling or temperature monitoring in place.',
  'Access control': 'IT room access register has not been maintained and the authorised access list is two years old.',
};

export function observationFor(item: string) {
  return OBSERVATIONS[item] ?? `${item} was found non-compliant during the inspection.`;
}
