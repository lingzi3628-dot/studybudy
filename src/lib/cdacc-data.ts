/**
 * CDACC Competency Data — Phase 59 (TVETBuddy)
 *
 * Skill checklists and practical-assessment sheets per trade, mapped to
 * Kenya's TVET CDACC curriculum structure (Level 4-6). The competency
 * statements follow the CDACC pattern: a performance task, the critical
 * skills involved, and the safety/attitude requirements an assessor
 * looks for.
 *
 * Scope note: this is a study aid distilled for revision and lab
 * practice — always confirm against the current official CDACC
 * curriculum documents for your level.
 */

export type TradeId =
  | "electrical" | "mechanical" | "ict" | "hospitality"
  | "business" | "automotive" | "building";

export type Competency = {
  code: string;
  statement: string;
  /** observable steps the assessor ticks off */
  checklist: string[];
  /** safety-critical points that must be followed to pass */
  safety: string[];
};

export type Trade = {
  id: TradeId;
  name: string;
  level: string;
  competencies: Competency[];
};

export const TRADES: Trade[] = [
  {
    id: "electrical",
    name: "Electrical Installation",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "EL-01",
        statement: "Install a single-way lighting circuit with one lamp controlled from one position",
        checklist: [
          "Draw the circuit diagram (live switched, neutral direct to lamp)",
          "Select cable size appropriate to the load and run length",
          "Mount and wire the switch, lamp holder and distribution board",
          "Test continuity and insulation resistance before energizing",
          "Energize and verify operation of the control point",
        ],
        safety: [
          "Isolate supply and lock off before working",
          "Prove the circuit dead with a two-pole tester",
        ],
      },
      {
        code: "EL-02",
        statement: "Wire a two-way lighting circuit (staircase switching)",
        checklist: [
          "Identify the two-way (SPDT) switches and their terminals",
          "Connect strappers between the two switch positions",
          "Join commons to supply live and switched live to the lamp",
          "Test both switch positions operate the lamp",
        ],
        safety: [
          "Isolate before making changes between tests",
          "Use an approved ladder for ceiling work",
        ],
      },
      {
        code: "EL-03",
        statement: "Connect a socket outlet circuit in a ring final arrangement",
        checklist: [
          "Lay out the ring: L, N and CPC looped through each outlet",
          "Terminate conductors correctly (no stray strands, correct torque)",
          "Carry out ring continuity test and polarity test",
          "Measure earth loop impedance and record results",
        ],
        safety: [
          "Verify conductor insulation is undamaged at entry points",
          "Fit the correct rating MCB/fuse for the ring",
        ],
      },
    ],
  },
  {
    id: "mechanical",
    name: "Mechanical Engineering",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "ME-01",
        statement: "Mark out and cut a workpiece to specification using hand tools",
        checklist: [
          "Read the working drawing and identify dimensions/tolerances",
          "Select marking-out tools (scriber, punch, rule, squares)",
          "Scribe layout lines and witness-mark punch points",
          "Cut to the waste side of the line and file to size",
          "Check squareness and dimensions against the drawing",
        ],
        safety: [
          "Secure the work in a vice — never hold by hand",
          "Wear eye protection when chipping or cutting",
        ],
      },
      {
        code: "ME-02",
        statement: "Produce an internal thread by tapping",
        checklist: [
          "Drill the correct tapping-size hole for the thread (e.g. M8 × 1.25 → 6.8 mm)",
          "Start the tap square using a guide or the tap square",
          "Turn two half-turns forward, one back to break the chip",
          "Check the thread with a gauge or matching bolt",
        ],
        safety: [
          "Use cutting fluid and keep hands clear of sharp swarf",
          "Never force a tap — a broken tap ruins the workpiece",
        ],
      },
      {
        code: "ME-03",
        statement: "Assemble a simple gear train and check for free rotation",
        checklist: [
          "Calculate the centre distance from module and teeth counts",
          "Mount gears with correct mesh (backlash) — not too tight",
          "Secure shafts and check alignment",
          "Rotate by hand and verify smooth, free motion",
        ],
        safety: [
          "Isolate any motor drive before touching the train",
          "Guards must be refitted before power-up",
        ],
      },
    ],
  },
  {
    id: "ict",
    name: "Information Communication Technology",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "IT-01",
        statement: "Design and configure a small office LAN",
        checklist: [
          "Produce a topology diagram with device count and IP plan",
          "Configure router, switch and client IP settings",
          "Crimp and test ethernet patch cables",
          "Verify connectivity with ping between clients and router",
        ],
        safety: [
          "Label and route cables to avoid trip hazards",
          "Power devices through a surge protector",
        ],
      },
      {
        code: "IT-02",
        statement: "Install and configure an operating system on a workstation",
        checklist: [
          "Back up existing data and confirm license/media",
          "Partition the disk and install the OS",
          "Create user accounts with least-privilege roles",
          "Install updates and verify device drivers",
        ],
        safety: [
          "Electrostatic discharge: use an anti-static strap when handling parts",
        ],
      },
      {
        code: "IT-03",
        statement: "Demonstrate basic database operations (create, query, report)",
        checklist: [
          "Create tables with appropriate keys and data types",
          "Insert sample records and enforce a relationship",
          "Write queries with selection and sorting criteria",
          "Produce a formatted report output",
        ],
        safety: [],
      },
    ],
  },
  {
    id: "hospitality",
    name: "Food & Beverage / Hospitality",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "FB-01",
        statement: "Plan, cost and serve a three-course meal for a set cover",
        checklist: [
          "Write the menu with portion sizes",
          "Cost ingredients and calculate cost per cover + margin",
          "Apply mise en place and prepare courses to order",
          "Serve with correct cover and sequence",
        ],
        safety: [
          "Observe food hygiene: handwashing, separate boards, temperature control",
          "Handle knives with a claw grip; store safely",
        ],
      },
      {
        code: "FB-02",
        statement: "Set up a restaurant table for à la carte service",
        checklist: [
          "Lay cover with correct cutlery/glassware positions",
          "Iron and position linen; centre pieces",
          "Check alignment and spacing between covers",
        ],
        safety: [],
      },
      {
        code: "FB-03",
        statement: "Demonstrate beverage service (tea/coffee) with tray technique",
        checklist: [
          "Prepare beverages to standard recipe",
          "Carry a service tray safely and serve from the correct side",
          "Clear and reset the table promptly",
        ],
        safety: [
          "Warn guests about hot liquids; never overfill cups",
        ],
      },
    ],
  },
  {
    id: "business",
    name: "Business Studies",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "BS-01",
        statement: "Prepare a simple trading profit and loss account",
        checklist: [
          "Record sales, returns and cost of goods sold",
          "Compute gross profit and apply expenses",
          "State net profit/loss with correct headings",
        ],
        safety: [],
      },
      {
        code: "BS-02",
        statement: "Maintain a petty cash book with imprest system",
        checklist: [
          "Record vouchers with analysis columns",
          "Balance the book and restore the imprest",
          "Reconcile cash in hand against the balance",
        ],
        safety: [],
      },
      {
        code: "BS-03",
        statement: "Draft a basic business plan for a micro-enterprise",
        checklist: [
          "Describe the business, market and competition",
          "Prepare a start-up cost estimate and pricing",
          "Project simple monthly cash flow for one year",
        ],
        safety: [],
      },
    ],
  },
  {
    id: "automotive",
    name: "Automotive Engineering",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "AU-01",
        statement: "Carry out an engine oil and filter change to specification",
        checklist: [
          "Identify correct oil grade and capacity from the manual",
          "Warm engine slightly, drain oil, replace filter",
          "Refill to dipstick mark, run and check for leaks",
          "Dispose of used oil at an approved point",
        ],
        safety: [
          "Use axle stands — never work under a car on a jack alone",
          "Hot oil burns: wear gloves",
        ],
      },
      {
        code: "AU-02",
        statement: "Test and replace a vehicle brake pad set (disc system)",
        checklist: [
          "Inspect disc thickness and pad wear against limits",
          "Retract caliper piston correctly",
          "Refit pads, torque fasteners to spec",
          "Pump the pedal to restore pressure; road-test carefully",
        ],
        safety: [
          "Chock wheels and work on level ground",
          "Brake work is safety-critical: double-check fastener torque",
        ],
      },
      {
        code: "AU-03",
        statement: "Diagnose a simple starting-system fault",
        checklist: [
          "Check battery terminal voltage and connections",
          "Test solenoid click and starter current draw",
          "Inspect ignition switch circuit continuity",
        ],
        safety: [
          "Remove metal jewellery; battery acid and explosive gas hazard",
        ],
      },
    ],
  },
  {
    id: "building",
    name: "Building Technology / Construction",
    level: "CDACC Level 4-6",
    competencies: [
      {
        code: "BT-01",
        statement: "Set out a rectangular foundation using the 3-4-5 method",
        checklist: [
          "Establish the base line and corner peg from the drawing",
          "Use 3-4-5 triangle to square the corners",
          "Check diagonals for equality",
          "Fix profile boards and string lines",
        ],
        safety: [
          "Wear safety boots on site; keep the area clear of debris",
        ],
      },
      {
        code: "BT-02",
        statement: "Build a corner (quoin) in stretcher bond to plumb and level",
        checklist: [
          "Mix mortar to the specified ratio and workability",
          "Lay the first course to line and level; check with spirit level",
          "Rack back corners true to plumb; gauge joints consistently",
        ],
        safety: [
          "Handle cement with gloves; avoid dust inhalation",
        ],
      },
      {
        code: "BT-03",
        statement: "Estimate materials for a concrete slab from a bill of quantities",
        checklist: [
          "Compute slab volume from dimensions",
          "Apply the mix ratio to find cement/sand/ballast quantities",
          "Add waste allowance and round up cement bags",
        ],
        safety: [],
      },
    ],
  },
];

export function getTrade(id: TradeId): Trade | undefined {
  return TRADES.find((t) => t.id === id);
}

/**
 * Generate a practical-assessment sheet (markdown) for a trade: the
 * competency list with tick-boxes, safety gate and an assessor sign-off
 * block — the format CDACC practicals roughly follow.
 */
export function generateAssessmentSheet(trade: Trade, candidate: string, dateISO: string): string {
  const lines: string[] = [];
  lines.push(`# Practical Assessment Sheet — ${trade.name}`);
  lines.push("");
  lines.push(`**Qualification:** ${trade.level}  `);
  lines.push(`**Candidate:** ${candidate || "________________"}  `);
  lines.push(`**Date:** ${dateISO}  `);
  lines.push(`**Assessor:** ______________________`);
  lines.push("");
  lines.push(`> Study aid generated by StudyBuddy TVETBuddy. Confirm requirements against the current official CDACC curriculum for your level.`);
  lines.push("");
  for (const c of trade.competencies) {
    lines.push(`## ${c.code} — ${c.statement}`);
    lines.push("");
    lines.push(`| # | Performance step | Done |`);
    lines.push(`|---|------------------|------|`);
    c.checklist.forEach((item, i) => {
      lines.push(`| ${i + 1} | ${item} | ☐ |`);
    });
    lines.push("");
    if (c.safety.length > 0) {
      lines.push(`**Safety (must all be observed to pass):**`);
      for (const s of c.safety) lines.push(`- ☐ ${s}`);
      lines.push("");
    }
  }
  lines.push(`## Result`);
  lines.push("");
  lines.push(`| Competency | Competent / Not yet | Assessor comments |`);
  lines.push(`|------------|---------------------|-------------------|`);
  for (const c of trade.competencies) {
    lines.push(`| ${c.code} | ☐ C ☐ NY | |`);
  }
  lines.push("");
  lines.push(`Candidate signature: ______________  Assessor signature: ______________`);
  lines.push("");
  return lines.join("\n");
}
