/* Quorum — seed data for a Divine Nine style alumni (graduate) chapter. */
window.QUORUM_SEED = function () {

  /* ------------------------------------------------------------------
     The seed is authored against one fixed day so every number hangs
     together: 33 days past due, 9 days waiting, this meeting before that
     one. Shift the whole record onto today, keeping all those intervals,
     so the chapter is never showing a meeting that already happened as
     something coming up.
     ------------------------------------------------------------------ */
  var ANCHOR = "2026-10-18";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
  var RE_MD = /^\d{2}-\d{2}$/;
  var RE_LBL = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]|[12]\d|3[01])$/;
  var FULLMON = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  var RE_INLINE = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+([1-9]|[12]\d|3[01])\b(?!\s*,?\s*(?:19|20)\d\d)([^\d]|$)/g;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function reanchor(root) {
    var now = new Date(); now.setHours(12, 0, 0, 0);
    var anchor = new Date(ANCHOR + "T12:00:00");
    var days = Math.round((now - anchor) / 86400000);
    if (!days) return root;

    function bump(d) { var x = new Date(d.getTime()); x.setDate(x.getDate() + days); return x; }

    function shift(v) {
      if (RE_ISO.test(v)) return isoOf(bump(new Date(v + "T12:00:00")));
      var md = RE_MD.exec(v);
      if (md) { var b = bump(new Date(anchor.getFullYear() + "-" + v + "T12:00:00")); return pad(b.getMonth() + 1) + "-" + pad(b.getDate()); }
      var lb = RE_LBL.exec(v);
      if (lb) {
        var m = MON.indexOf(lb[1]);
        var l = bump(new Date(anchor.getFullYear(), m, Number(lb[2]), 12));
        return MON[l.getMonth()] + " " + l.getDate();
      }
      /* dates written into a sentence, e.g. "$285 due November 1" or
         "Nov 14, 6:00 PM". A month name followed by a year is left alone. */
      return v.replace(RE_INLINE, function (whole, name, day, after) {
        if (/^\s*(19|20)\d\d/.test(after)) return whole;
        var full = FULLMON.indexOf(name), abbr = MON.indexOf(name);
        var mi = full > -1 ? full : abbr;
        if (mi < 0) return whole;
        var d = bump(new Date(anchor.getFullYear(), mi, Number(day), 12));
        return (full > -1 ? FULLMON[d.getMonth()] : MON[d.getMonth()]) + " " + d.getDate() + after;
      });
    }

    (function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Object.prototype.toString.call(node) === "[object Array]") {
        for (var i = 0; i < node.length; i++) {
          if (typeof node[i] === "string") node[i] = shift(node[i]);
          else walk(node[i]);
        }
        return;
      }
      for (var k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        if (typeof node[k] === "string") node[k] = shift(node[k]);
        else walk(node[k]);
      }
    })(root);

    return root;
  }

  var CATS = {
    business:    { label: "Chapter Business", color: "#3C4654" },
    scholarship: { label: "Scholarship",      color: "#2F4B8F" },
    social:      { label: "Social Action",    color: "#14656B" },
    mentoring:   { label: "Guide Right",      color: "#8A5A12" },
    health:      { label: "Health Initiative",color: "#2B6B45" },
    business_dev:{ label: "Business Development", color: "#5A3A86" },
    reclamation: { label: "Reclamation",      color: "#9A4A1E" },
    brotherhood: { label: "Brotherhood",      color: "#8C3250" },
    founders:    { label: "Founders Day",     color: "#7A5C12" },
    ritual:      { label: "Ritual",           color: "#1F2937" }
  };

  // last, first, titles, status, initYear, initChapter, line#, lineName, employer, jobTitle, industry, bday, phone, city
  var ROSTER = [
    ["Session","Marguerite_X","President","active",1998,"Beta Kappa",3,"Cornerstone","Tulsa Public Schools","Deputy Superintendent","Education","03-14","918-555-0131","Tulsa"],
    ["Session","Marcus","Polemarch","active",1998,"Beta Kappa",3,"Cornerstone","Tulsa Public Schools","Deputy Superintendent","Education","03-14","918-555-0131","Tulsa"],
    ["Bankston","Rochelle_X","First Vice President","active",2001,"Delta Theta",7,"Ironclad","Williams Companies","Senior Project Manager","Energy","07-22","918-555-0142","Broken Arrow"],
    ["Bankston","Reginald","Vice Polemarch","active",2001,"Delta Theta",7,"Ironclad","Williams Companies","Senior Project Manager","Energy","07-22","918-555-0142","Broken Arrow"],
    ["Hobbs","Darius","Keeper of Exchequer","active",2006,"Alpha Pi",2,"Ledger","Bank of Oklahoma","Vice President, Commercial Lending","Banking","11-08","918-555-0118","Tulsa"],
    ["Whitfield","Carlton","Assistant Keeper of Exchequer","active",2009,"Beta Kappa",5,"Abacus","Whitfield & Associates CPA","Managing Partner","Accounting","05-30","918-555-0177","Jenks"],
    ["Oyelaran","Immanuel","Keeper of Records","active",2014,"Gamma Xi",1,"Scribe","Saint Francis Health System","Clinical Data Analyst","Healthcare","09-02","918-555-0160","Tulsa"],
    ["Greenlee","Terrance","Reporter","active",2004,"Beta Kappa",9,"Herald","City of Tulsa","Communications Director","Government","01-19","918-555-0109","Tulsa"],
    ["Brackett","Simeon","Chaplain","active",2011,"Delta Theta",4,"Anchor","Mount Zion Baptist Church","Associate Pastor","Faith","04-27","918-555-0193","Tulsa"],
    ["Caldwell","Nathaniel","Parliamentarian","active",2016,"Alpha Pi",6,"Gavel","Caldwell Law Group","Attorney","Legal","12-11","918-555-0124","Tulsa"],
    ["Armstrong","Yves","Strategus","active",1994,"Beta Kappa",1,"Sentinel","Tulsa Fire Department","Battalion Chief","Public Safety","08-05","918-555-0150","Sand Springs"],
    ["Lofton","Bernard","Historian","active",1987,"Beta Kappa",2,"Chronicle","Retired — Tulsa Public Schools","Retired Principal","Education","02-16","918-555-0188","Tulsa"],
    ["Dupree","Andre","Member","active",2003,"Gamma Xi",8,"Keystone","Dupree Construction","Owner","Construction","06-21","918-555-0102","Tulsa"],
    ["Hollaway","Patrick","Member","active",2012,"Delta Theta",3,"Compass","AAON","Mechanical Engineer","Manufacturing","10-03","918-555-0137","Tulsa"],
    ["Mosley","Kendrick","Member","active",2019,"Alpha Pi",11,"Vanguard","Google","Site Reliability Engineer","Technology","03-29","918-555-0171","Owasso"],
    ["Falls","Dominic","Member","active",2008,"Beta Kappa",4,"Summit","Oklahoma State Univ. Tulsa","Assistant Dean","Education","07-14","918-555-0145","Tulsa"],
    ["Nwosu","Adaeze_X","Member","active",2021,"Gamma Xi",2,"Horizon","Cherokee Nation Businesses","Financial Analyst","Finance","05-08","918-555-0199","Catoosa"],
    ["Nwosu","Chidi","Member","active",2021,"Gamma Xi",2,"Horizon","Cherokee Nation Businesses","Financial Analyst","Finance","05-08","918-555-0199","Catoosa"],
    ["Sturdivant","Gregory","Member","active",1999,"Delta Theta",6,"Legacy","Sturdivant Funeral Home","Funeral Director","Services","11-25","918-555-0113","Tulsa"],
    ["Pryce","Lamar","Member","active",2015,"Alpha Pi",5,"Beacon","Tulsa Community College","Professor of Mathematics","Education","09-17","918-555-0166","Tulsa"],
    ["Ellison","Trevon","Member","active",2020,"Gamma Xi",7,"Current","Public Service Co. of Oklahoma","Grid Operations Supervisor","Energy","01-04","918-555-0121","Bixby"],
    ["Marbury","Desmond","Member","active",2010,"Beta Kappa",10,"Anvil","Marbury Logistics","Operations Director","Logistics","04-12","918-555-0154","Tulsa"],
    ["Teague","Russell","Lieutenant Strategus","active",1996,"Delta Theta",8,"Pillar","Retired — US Army","Retired Lieutenant Colonel","Military","08-23","918-555-0180","Tulsa"],
    ["Okafor","Michael","Member","active",2013,"Alpha Pi",3,"Meridian","Saint Francis Health System","Nurse Anesthetist","Healthcare","06-06","918-555-0191","Tulsa"],
    ["Vance","Jerome","Member","active",2017,"Gamma Xi",4,"Quill","Tulsa World","Senior Reporter","Media","02-28","918-555-0128","Tulsa"],
    ["Rutledge","Avery","Member","active",2022,"Alpha Pi",1,"Kindling","Rutledge Design Co.","Creative Director","Design","10-19","918-555-0147","Tulsa"],
    ["Pennington","Clarence","Member","active",1991,"Beta Kappa",5,"Granite","Retired — Phillips 66","Retired Engineer","Energy","12-02","918-555-0163","Tulsa"],
    ["Beauchamp","Isaiah","Member","active",2018,"Delta Theta",2,"Forge","Tulsa Remote","Program Manager","Nonprofit","07-31","918-555-0136","Tulsa"],
    ["Hargrove","Solomon","Member","active",2007,"Beta Kappa",7,"Atlas","Hargrove Wealth Partners","Financial Advisor","Finance","05-15","918-555-0174","Jenks"],
    ["Barlowe","Trinice_X","Member","pending",2017,"Delta Theta",6,"Transfer","Barlowe Media","Owner","Media","03-09","918-555-0105","Tulsa"],
    ["Barlowe","Tobias","Member","pending",2017,"Delta Theta",6,"Transfer","Barlowe Media","Owner","Media","03-09","918-555-0105","Tulsa"],
    ["Whitaker","Elijah","Member","pending",2011,"Alpha Pi",9,"Transfer","Whitaker Dental","Dentist","Healthcare","08-18","918-555-0159","Broken Arrow"],
    ["Calloway","Maurice","Member","pending",2024,"Gamma Xi",1,"Neophyte","Tulsa County","Assistant District Attorney","Legal","04-02","918-555-0182","Tulsa"]
  ].filter(function (r) { return r[1].indexOf("_X") < 0; });

  var members = ROSTER.map(function (r, i) {
    return {
      id: "m" + (i + 1), last: r[0], first: r[1], roles: [r[2]], status: r[3],
      initYear: r[4], initChapter: r[5], lineNum: r[6], lineName: r[7],
      employer: r[8], jobTitle: r[9], industry: r[10], bday: r[11],
      phone: r[12], city: r[13],
      email: (r[1][0] + r[0]).toLowerCase() + "@email.com",
      address: (100 + i * 7) + " " + ["E 41st St", "S Lewis Ave", "N Peoria Ave", "E 61st St", "S Harvard Ave", "W 71st St"][i % 6] + ", " + r[13] + ", OK",
      emergency: ROSTER[(i + 3) % ROSTER.length][1] + " " + ROSTER[(i + 3) % ROSTER.length][0] + " · spouse",
      shirt: ["M", "L", "XL", "2XL", "L", "XL"][i % 6],
      committees: [], photo: (i % 9 !== 3), // most brothers have uploaded one; a few never did
      joined: r[3] === "pending" ? null : (2000 + (i % 24)),
      requested: null, vouchedBy: null, lifeMember: r[4] < 1995,
      notes: ""
    };
  });
  members.forEach(function (m, i) {
    if (m.status === "pending") {
      m.requested = ["6 days ago", "2 days ago", "9 days ago"][i % 3];
      m.vouchedBy = members[(i + 5) % members.length].first + " " + members[(i + 5) % members.length].last;
    }
  });

  function byName(f, l) { for (var i = 0; i < members.length; i++) if (members[i].first === f && members[i].last === l) return members[i].id; return "m1"; }

  var committees = [
    { id: "k1", name: "Scholarship", cat: "scholarship", chair: byName("Lamar", "Pryce"),
      charge: "Award four $2,500 scholarships to graduating seniors and run the essay contest.",
      budget: 10000, spent: 2500, meets: "2nd Tuesday, 6:30 PM", next: "2026-11-10",
      members: ["Dominic Falls", "Bernard Lofton", "Jerome Vance", "Isaiah Beauchamp"] },
    { id: "k2", name: "Social Action", cat: "social", chair: byName("Terrance", "Greenlee"),
      charge: "Voter registration, civic engagement, and the legislative breakfast.",
      budget: 4500, spent: 1820, meets: "1st Thursday, 7:00 PM", next: "2026-11-05",
      members: ["Nathaniel Caldwell", "Trevon Ellison", "Avery Rutledge"] },
    { id: "k3", name: "Guide Right", cat: "mentoring", chair: byName("Dominic", "Falls"),
      charge: "Guide Right and Kappa League: Saturday academy for 40 young men, grades 6 through 12.",
      budget: 7200, spent: 3940, meets: "Saturdays, 9:00 AM", next: "2026-10-25",
      members: ["Andre Dupree", "Kendrick Mosley", "Russell Teague", "Jerome Vance", "Desmond Marbury"] },
    { id: "k4", name: "Health Initiatives", cat: "health", chair: byName("Michael", "Okafor"),
      charge: "Prostate screening drive, blood drive, and the mental health panel.",
      budget: 3000, spent: 1150, meets: "3rd Monday, 6:00 PM", next: "2026-11-16",
      members: ["Simeon Brackett", "Clarence Pennington"] },
    { id: "k5", name: "Fundraising", cat: "business_dev", chair: byName("Solomon", "Hargrove"),
      charge: "Scholarship gala, sponsorship letters, and the annual golf tournament.",
      budget: 6000, spent: 2310, meets: "2nd Wednesday, 7:00 PM", next: "2026-11-11",
      members: ["Darius Hobbs", "Desmond Marbury", "Gregory Sturdivant", "Avery Rutledge"] },
    { id: "k6", name: "Reclamation & Retention", cat: "reclamation", chair: byName("Yves", "Armstrong"),
      charge: "Reach every inactive brother in the district and bring him back to financial standing.",
      budget: 1200, spent: 410, meets: "Monthly, by phone", next: "2026-11-03",
      members: ["Reginald Bankston", "Patrick Hollaway", "Russell Teague"] },
    { id: "k7", name: "Membership Intake", cat: "ritual", chair: byName("Reginald", "Bankston"),
      charge: "Candidate review, orientation, and the spring intake process.",
      budget: 2000, spent: 0, meets: "Called meetings", next: "2026-11-08",
      members: ["Marcus Session", "Immanuel Oyelaran", "Simeon Brackett", "Nathaniel Caldwell"] },
    { id: "k8", name: "Budget & Audit", cat: "business", chair: byName("Carlton", "Whitfield"),
      charge: "Draft the annual budget and audit the books each quarter.",
      budget: 0, spent: 0, meets: "Quarterly", next: "2026-12-01",
      members: ["Darius Hobbs", "Marcus Session", "Clarence Pennington"] }
  ];
  var DETAIL = {
    k1: { goals: [["Award four $2,500 scholarships", 1, 4], ["Collect 60 applications", 41, 60], ["Raise $10,000 for the fund", 6400, 10000]],
          tasks: [["Finalize the rubric", "Lamar Pryce", "2026-10-24", true], ["Mail letters to 14 high schools", "Jerome Vance", "2026-10-31", true],
                  ["Schedule the reading panel", "Dominic Falls", "2026-11-07", false], ["Order engraved plaques", "Isaiah Beauchamp", "2026-11-21", false]],
          meetings: [["2026-10-13", 4, "Reviewed 22 applications. Agreed on a blind first read."], ["2026-09-08", 5, "Set the rubric and the $2,500 award amount."]],
          outcomes: [["Applications received", "41"], ["Schools reached", "14"], ["Awarded to date", "$2,500"]],
          lines: [["Scholarship awards", 10000, 2500], ["Printing and postage", 400, 180], ["Awards banquet", 600, 0]] },
    k2: { goals: [["Register 250 voters", 94, 250], ["Host the legislative breakfast", 0, 1], ["Train 12 poll workers", 7, 12]],
          tasks: [["Reserve Greenwood for the breakfast", "Terrance Greenlee", "2026-11-14", false], ["Order 500 registration forms", "Trevon Ellison", "2026-10-28", true],
                  ["Draft the legislative agenda", "Nathaniel Caldwell", "2026-11-20", false]],
          meetings: [["2026-10-01", 4, "Finalized the drive plan for the Greenwood site."], ["2026-09-04", 3, "Set the 250-voter target for the year."]],
          outcomes: [["Voters registered", "94"], ["Events held", "1"], ["Volunteer hours", "26"]],
          lines: [["Printing and materials", 1500, 820], ["Legislative breakfast", 2500, 0], ["Transportation", 500, 1000]] },
    k3: { goals: [["Serve 40 young men", 38, 40], ["Hold 24 Saturday sessions", 9, 24], ["Place 10 in summer internships", 3, 10]],
          tasks: [["Recruit two more mentors", "Dominic Falls", "2026-10-24", false], ["Order curriculum workbooks", "Kendrick Mosley", "2026-10-20", true],
                  ["Background checks on new mentors", "Russell Teague", "2026-11-01", false], ["Book the November field trip", "Desmond Marbury", "2026-11-08", false]],
          meetings: [["2026-10-11", 5, "Session nine ran long. Need a second room."], ["2026-09-27", 4, "Enrollment hit 38 of 40."]],
          outcomes: [["Young men enrolled", "38"], ["Sessions held", "9"], ["Mentor hours", "112"]],
          lines: [["Curriculum and supplies", 2200, 1240], ["Transportation", 2000, 900], ["Meals", 1500, 800], ["Field trips", 1500, 1000]] },
    k4: { goals: [["Screen 120 men", 0, 120], ["Collect 60 pints of blood", 0, 60], ["Host the mental health panel", 0, 1]],
          tasks: [["Confirm Morton Health partnership", "Michael Okafor", "2026-10-25", true], ["Recruit a panel moderator", "Simeon Brackett", "2026-11-15", false],
                  ["Print screening flyers", "Clarence Pennington", "2026-10-30", false]],
          meetings: [["2026-10-06", 3, "Morton confirmed November 8 for screening."]],
          outcomes: [["Screenings scheduled", "120"], ["Partners secured", "2"], ["Events upcoming", "2"]],
          lines: [["Screening supplies", 1800, 1150], ["Panel and venue", 800, 0], ["Marketing", 400, 0]] },
    k5: { goals: [["Raise $18,000 for the Gala", 4150, 18000], ["Secure 6 corporate sponsors", 3, 6], ["Sell 180 Gala seats", 42, 180]],
          tasks: [["Mail sponsorship letters", "Solomon Hargrove", "2026-10-23", false], ["Build the ad book template", "Avery Rutledge", "2026-10-27", true],
                  ["Confirm the Greenwood contract", "Darius Hobbs", "2026-11-01", true], ["Line up a silent auction lead", "Gregory Sturdivant", "2026-11-10", false]],
          meetings: [["2026-10-14", 5, "Three sponsors in hand. Need employer matches from every brother."], ["2026-09-23", 4, "Set the $18,000 target."]],
          outcomes: [["Raised to date", "$4,150"], ["Sponsors secured", "3"], ["Seats sold", "42"]],
          lines: [["Venue deposit", 3000, 1500], ["Printing and ad book", 1200, 460], ["Decor and AV", 1800, 350]] },
    k6: { goals: [["Reclaim 12 brothers", 5, 12], ["Contact every inactive in District 4", 31, 44], ["Hold 2 reclamation socials", 1, 2]],
          tasks: [["Pull the district inactive list", "Yves Armstrong", "2026-10-10", true], ["Assign 5 calls to each committee member", "Reginald Bankston", "2026-10-26", true],
                  ["Plan the December social", "Patrick Hollaway", "2026-11-18", false]],
          meetings: [["2026-10-03", 3, "31 of 44 contacted. Five returned to financial standing."]],
          outcomes: [["Brothers reclaimed", "5"], ["Contacts made", "31"], ["Returned to financial", "5"]],
          lines: [["Phone and mailing", 400, 160], ["Reclamation social", 800, 250]] },
    k7: { goals: [["Process 3 transfer candidates", 0, 3], ["Complete orientation", 0, 1], ["File with the province", 0, 1]],
          tasks: [["Verify all three transfer letters", "Reginald Bankston", "2026-10-26", false], ["Schedule orientation", "Marcus Session", "2026-11-08", false],
                  ["Collect intake packets", "Immanuel Oyelaran", "2026-11-01", false]],
          meetings: [["2026-10-16", 4, "Three candidates ready pending vouches."]],
          outcomes: [["Candidates in process", "3"], ["Vouches received", "3"], ["Approved", "0"]],
          lines: [["Province filing fees", 1200, 0], ["Orientation materials", 800, 0]] },
    k8: { goals: [["Audit all four quarters", 1, 4], ["Keep expenses within 100% of budget", 61, 100], ["File the 990-N on time", 1, 1]],
          tasks: [["Reconcile September", "Darius Hobbs", "2026-10-15", true], ["Pull Q1 audit samples", "Clarence Pennington", "2026-11-05", false],
                  ["Draft the mid-year forecast", "Carlton Whitfield", "2026-12-01", false]],
          meetings: [["2026-10-05", 3, "September reconciled. Transportation line is over by $500."]],
          outcomes: [["Quarters audited", "1 of 4"], ["Lines over budget", "1"], ["Filings current", "Yes"]],
          lines: [] }
  };
  committees.forEach(function (k) {
    var d = DETAIL[k.id] || { goals: [], tasks: [], meetings: [], outcomes: [], lines: [] };
    k.goals = d.goals.map(function (g) { return { t: g[0], now: g[1], target: g[2] }; });
    k.tasks = d.tasks.map(function (t, i) { return { id: k.id + "t" + i, t: t[0], who: t[1], due: t[2], done: t[3] }; });
    k.meetings = d.meetings.map(function (m) { return { date: m[0], present: m[1], note: m[2] }; });
    k.outcomes = d.outcomes.map(function (o) { return { l: o[0], v: o[1] }; });
    k.lines = d.lines.map(function (l) { return { l: l[0], planned: l[1], spent: l[2] }; });
  });
  committees.forEach(function (k) {
    var ch = null;
    for (var i = 0; i < members.length; i++) if (members[i].id === k.chair) ch = members[i];
    if (ch) ch.committees.push({ id: k.id, role: "Chair" });
    k.members.forEach(function (nm) {
      for (var j = 0; j < members.length; j++) {
        if (members[j].first + " " + members[j].last === nm) members[j].committees.push({ id: k.id, role: "Member" });
      }
    });
  });

  var bills = [
    { id: "b1", code: "sa7k2q", title: "Summer Programming Assessment", amount: 75, cadence: "one-time", due: "2026-09-15", created: "2026-08-04", plan: false, cat: "business" },
    { id: "b2", code: "d4m9xp", title: "2026–27 Chapter Dues & Grand Chapter Tax", amount: 285, cadence: "annual", due: "2026-11-01", created: "2026-09-02", plan: false, cat: "business" },
    { id: "b3", code: "gl8w3r", title: "Scholarship Gala Commitment", amount: 150, cadence: "one-time", due: "2026-11-20", created: "2026-10-01", plan: false, cat: "business_dev" }
  ];

  var PAY = [
    [1,"b1",75,"ach","2026-08-07"],[1,"b2",285,"ach","2026-09-04"],[1,"b3",150,"ach","2026-10-05"],
    [2,"b1",75,"card","2026-08-19"],[2,"b2",285,"card","2026-09-20"],
    [3,"b1",75,"ach","2026-08-05"],[3,"b2",285,"ach","2026-09-03"],[3,"b3",150,"ach","2026-10-03"],
    [4,"b1",75,"ach","2026-08-06"],[4,"b2",285,"ach","2026-09-06"],[4,"b3",150,"ach","2026-10-02"],
    [5,"b1",75,"ach","2026-08-12"],[5,"b2",285,"ach","2026-09-14"],
    [6,"b1",75,"card","2026-08-22"],[6,"b2",285,"card","2026-10-02"],
    [7,"b1",75,"ach","2026-08-09"],[7,"b2",285,"ach","2026-09-11"],[7,"b3",150,"card","2026-10-11"],
    [8,"b1",75,"check","2026-08-30"],[8,"b2",285,"check","2026-09-28"],
    [9,"b1",75,"ach","2026-08-15"],[9,"b2",285,"ach","2026-10-05"],
    [10,"b1",75,"ach","2026-08-02"],[10,"b2",285,"ach","2026-09-02"],[10,"b3",150,"ach","2026-10-01"],
    [11,"b1",75,"card","2026-09-01"],[11,"b2",285,"card","2026-10-09"],
    [13,"b1",75,"ach","2026-09-26"],
    [14,"b1",75,"card","2026-09-08"],[14,"b2",95,"card","2026-10-01"],
    [15,"b2",285,"ach","2026-10-12"],
    [16,"b1",75,"ach","2026-08-28"],[16,"b2",285,"ach","2026-09-30"],
    [17,"b1",75,"ach","2026-09-19"],[17,"b2",285,"ach","2026-10-14"],
    [18,"b1",75,"check","2026-09-05"],
    [19,"b1",75,"ach","2026-08-21"],[19,"b2",285,"ach","2026-09-24"],[19,"b3",150,"ach","2026-10-08"],
    [20,"b1",75,"card","2026-09-12"],
    [21,"b1",75,"ach","2026-08-17"],[21,"b2",285,"ach","2026-09-17"],
    [22,"b1",75,"ach","2026-08-11"],[22,"b2",285,"ach","2026-09-09"],[22,"b3",150,"ach","2026-10-06"],
    [23,"b1",75,"ach","2026-09-29"],
    [24,"b1",75,"ach","2026-08-26"],[24,"b2",285,"ach","2026-10-07"],
    [25,"b1",75,"card","2026-09-22"]
  ];
  var payments = PAY.map(function (p, i) {
    return { id: "p" + (i + 1), memberId: "m" + p[0], billId: p[1], amount: p[2], method: p[3], date: p[4] };
  });

  var events = [
    { id: "e0", code: "sep921", title: "September Chapter Meeting", date: "2026-09-13", time: "4:00 PM",
      place: "Rudisill Regional Library", cat: "business", mandatory: true, price: 0, visibility: "chapter",
      rsvps: [], tickets: [], checkedIn: [], past: true, hours: 2 },
    { id: "e0b", code: "oct104", title: "Voter Registration Drive", date: "2026-10-04", time: "10:00 AM",
      place: "Greenwood Cultural Center", cat: "social", mandatory: false, price: 0, visibility: "public",
      rsvps: [], tickets: [], checkedIn: [], past: true, hours: 4 },
    { id: "e0c", code: "oct111", title: "October Chapter Meeting", date: "2026-10-11", time: "4:00 PM",
      place: "Rudisill Regional Library", cat: "business", mandatory: true, price: 0, visibility: "chapter",
      rsvps: [], tickets: [], checkedIn: [], past: true, hours: 2 },
    { id: "e1", code: "mtg113", title: "November Chapter Meeting", date: "2026-11-01", time: "4:00 PM",
      place: "Rudisill Regional Library", cat: "business", mandatory: true, price: 0, visibility: "chapter",
      rsvps: ["m1","m2","m3","m4","m5","m7","m10","m13","m16","m19","m21"], tickets: [], checkedIn: [], hours: 2 },
    { id: "e1b", code: "men1025", title: "Guide Right Saturday Session", date: "2026-10-25", time: "9:00 AM",
      place: "Booker T. Washington High School", cat: "mentoring", mandatory: false, price: 0, visibility: "chapter",
      rsvps: ["m13","m2","m15","m22","m18"], tickets: [], checkedIn: [], hours: 4 },
    { id: "e2", code: "fdb914", title: "Founders Day Banquet", date: "2026-11-14", time: "6:00 PM",
      place: "The Mayo Hotel, Crystal Ballroom", cat: "founders", mandatory: true, price: 75, visibility: "public",
      rsvps: ["m1","m3","m5","m6","m9","m12","m17","m20"], hours: 3,
      tickets: [{ memberId: "m1", qty: 2, paid: 150 }, { memberId: "m3", qty: 2, paid: 150 }, { memberId: "m5", qty: 1, paid: 75 }, { guest: "Delores Pryce", qty: 2, paid: 150 }], checkedIn: [] },
    { id: "e2b", code: "hlth118", title: "Prostate Health Screening", date: "2026-11-08", time: "8:00 AM",
      place: "Morton Comprehensive Health", cat: "health", mandatory: false, price: 0, visibility: "public",
      rsvps: ["m14","m8","m23"], tickets: [], checkedIn: [], hours: 5 },
    { id: "e3", code: "gal126", title: "Scholarship Gala", date: "2026-12-06", time: "7:00 PM",
      place: "Greenwood Cultural Center", cat: "scholarship", mandatory: false, price: 125, visibility: "public",
      rsvps: ["m1","m7","m19"], tickets: [{ memberId: "m1", qty: 2, paid: 250 }], checkedIn: [], hours: 4 }
  ];

  // deterministic attendance for past events
  var past = events.filter(function (e) { return e.past; });
  past.forEach(function (e, ei) {
    members.forEach(function (m, mi) {
      if (m.status !== "active") return;
      var h = (mi * 13 + ei * 29 + e.title.length) % 10;
      if (h < 7) e.checkedIn.push(m.id);
      if (h < 8) e.rsvps.push(m.id);
    });
  });
  var excuses = [
    { id: "x1", memberId: "m15", eventId: "e0c", reason: "Work travel — deposition in Oklahoma City", status: "approved", at: "Oct 10" },
    { id: "x2", memberId: "m23", eventId: "e0c", reason: "Daughter's graduation", status: "approved", at: "Oct 9" },
    { id: "x3", memberId: "m12", eventId: "e1", reason: "On shift at the firehouse", status: "pending", at: "Oct 16" }
  ];

  var service = [
    { id: "s1", memberId: "m13", eventId: "e0b", hours: 4, what: "Voter Registration Drive", date: "2026-10-04", status: "approved" },
    { id: "s2", memberId: "m7", eventId: "e0b", hours: 6, what: "Voter Registration Drive + canvassing", date: "2026-10-04", status: "approved" },
    { id: "s3", memberId: "m15", eventId: null, hours: 3, what: "Tutoring at Carver Middle School", date: "2026-10-07", status: "approved" },
    { id: "s4", memberId: "m22", eventId: null, hours: 5, what: "Food bank distribution", date: "2026-09-27", status: "approved" },
    { id: "s5", memberId: "m20", eventId: null, hours: 2, what: "Mentor check-in calls", date: "2026-10-13", status: "pending" }
  ];

  // every check-in at a past event automatically credits that event's service hours
  past.forEach(function (e) {
    if (!e.hours) return;
    e.checkedIn.forEach(function (mid) {
      service.push({ id: "sa_" + e.id + "_" + mid, memberId: mid, eventId: e.id, hours: e.hours,
        what: e.title, date: e.date, status: "approved", auto: true });
    });
  });

  var minutes = [
    { id: "mn1", title: "October Chapter Meeting", date: "2026-10-11", present: 19, excused: 2, absent: 5,
      status: "Awaiting approval", by: "Immanuel Oyelaran",
      motions: [
        { t: "Approve the September minutes as written", by: "Bernard Lofton", second: "Gregory Sturdivant", yes: 18, no: 0, abstain: 1, result: "Carried" },
        { t: "Allocate $2,500 from the Scholarship line for a fourth award", by: "Lamar Pryce", second: "Dominic Falls", yes: 15, no: 3, abstain: 1, result: "Carried" },
        { t: "Move the Founders Day Banquet to the Mayo Hotel at $75 per plate", by: "Solomon Hargrove", second: "Terrance Greenlee", yes: 17, no: 1, abstain: 1, result: "Carried" }
      ] },
    { id: "mn2", title: "September Chapter Meeting", date: "2026-09-13", present: 21, excused: 1, absent: 4,
      status: "Approved", by: "Immanuel Oyelaran",
      motions: [
        { t: "Adopt the 2026–27 budget as presented by the Budget & Audit Committee", by: "Carlton Whitfield", second: "Darius Hobbs", yes: 20, no: 1, abstain: 0, result: "Carried" },
        { t: "Set chapter dues and Grand Chapter tax at $285 due November 1", by: "Darius Hobbs", second: "Marcus Session", yes: 21, no: 0, abstain: 0, result: "Carried" }
      ] }
  ];

  var budget = [
    { line: "Chapter & Grand Tax", cat: "Income", planned: 7410, actual: 5890 },
    { line: "Scholarship Gala", cat: "Income", planned: 18000, actual: 4150 },
    { line: "Founders Day Banquet", cat: "Income", planned: 6000, actual: 525 },
    { line: "Corporate Sponsorship", cat: "Income", planned: 12000, actual: 7500 },
    { line: "Scholarship Awards", cat: "Expense", planned: 10000, actual: 2500 },
    { line: "Guide Right & Kappa League", cat: "Expense", planned: 7200, actual: 3940 },
    { line: "Social Action", cat: "Expense", planned: 4500, actual: 1820 },
    { line: "Health Initiatives", cat: "Expense", planned: 3000, actual: 1150 },
    { line: "Grand Chapter Assessments", cat: "Expense", planned: 5400, actual: 5400 },
    { line: "Meeting & Administrative", cat: "Expense", planned: 2400, actual: 1115 }
  ];

  var requests = [
    { id: "r1", kind: "chapter", title: "2026–27 Chapter Dues & Grand Chapter Tax", billId: "b2", amount: 285, due: "2026-11-01",
      audience: "All 26 active brothers", pushed: true, created: "2026-09-02", code: "d4m9xp" },
    { id: "r2", kind: "chapter", title: "Scholarship Gala Commitment", billId: "b3", amount: 150, due: "2026-11-20",
      audience: "All 26 active brothers", pushed: true, created: "2026-10-01", code: "gl8w3r" },
    { id: "r3", kind: "open", title: "Founders Day Ad Book", billId: null, amount: 0, due: "2026-11-07",
      audience: "Public link — any amount", pushed: false, created: "2026-10-09", code: "adbk26", collected: 1850, payers: 14 },
    { id: "r4", kind: "some", title: "Line Jacket Order — 2024 Line", billId: null, amount: 165, due: "2026-11-15",
      audience: "6 selected brothers", pushed: true, created: "2026-10-12", code: "jkt165", collected: 495, payers: 3 }
  ];

  /* A chapter does not abandon Google the day it adopts a platform. The
     budget lives in Sheets, the sign-up is a Form, the province folder is on
     Drive. Those links normally live in one officer's head and die at
     handoff, so the Vault holds them next to the files, under the same
     visibility rule. */
  var docs = [
    { id: "l1", kind: "link", name: "Chapter Budget Worksheet 2026\u201327", folder: "Finance", vis: "officers",
      url: "https://docs.google.com/spreadsheets/d/1kQ7x9ChapterBudget/edit", host: "Google Sheets",
      updated: "Oct 2026", by: "Carlton Whitfield", opens: 34 },
    { id: "l2", kind: "link", name: "Guide Right Mentor Sign-up", folder: "Programs", vis: "all",
      url: "https://docs.google.com/forms/d/e/1FAIpQLGuideRight/viewform", host: "Google Forms",
      updated: "Oct 2026", by: "Dominic Falls", opens: 61 },
    { id: "l3", kind: "link", name: "Tulsa Alumni \u2014 Shared Drive", folder: "Governance", vis: "all",
      url: "https://drive.google.com/drive/folders/0ATulsaAlumniChapter", host: "Google Drive",
      updated: "Sep 2026", by: "Marcus Session", opens: 88 },
    { id: "l4", kind: "link", name: "Founders Day Banquet Seating Chart", folder: "Programs", vis: "all",
      url: "https://docs.google.com/spreadsheets/d/1FoundersDaySeating/edit", host: "Google Sheets",
      updated: "Oct 2026", by: "Reginald Bankston", opens: 17 },
    { id: "l5", kind: "link", name: "Province Reporting Calendar", folder: "Governance", vis: "all",
      url: "https://calendar.google.com/calendar/u/0?cid=southwesternprovince", host: "Google Calendar",
      updated: "Aug 2026", by: "Immanuel Oyelaran", opens: 12 },
    { id: "d1", name: "Chapter Bylaws (amended 2025).pdf", folder: "Governance", vis: "all", size: "412 KB", updated: "Mar 2026", by: "Immanuel Oyelaran", opens: 41 },
    { id: "d2", name: "Standing Rules 2026–27.pdf", folder: "Governance", vis: "all", size: "188 KB", updated: "Aug 2026", by: "Immanuel Oyelaran", opens: 33 },
    { id: "d3", name: "Robert's Rules — Quick Card.pdf", folder: "Governance", vis: "all", size: "64 KB", updated: "Aug 2026", by: "Nathaniel Caldwell", opens: 52 },
    { id: "d4", name: "Approved Budget 2026–27.xlsx", folder: "Finance", vis: "all", size: "96 KB", updated: "Sep 2026", by: "Carlton Whitfield", opens: 28 },
    { id: "d5", name: "Treasurer's Report — September.pdf", folder: "Finance", vis: "all", size: "141 KB", updated: "Oct 2026", by: "Darius Hobbs", opens: 22 },
    { id: "d6", name: "Bank Reconciliation — September.pdf", folder: "Finance", vis: "officers", size: "88 KB", updated: "Oct 2026", by: "Darius Hobbs", opens: 7 },
    { id: "d7", name: "990-N Postcard Filing 2025.pdf", folder: "Finance", vis: "officers", size: "52 KB", updated: "Jan 2026", by: "Carlton Whitfield", opens: 5 },
    { id: "d8", name: "Minutes — October Chapter Meeting.pdf", folder: "Minutes", vis: "all", size: "122 KB", updated: "Oct 2026", by: "Immanuel Oyelaran", opens: 19 },
    { id: "d9", name: "Minutes — September Chapter Meeting.pdf", folder: "Minutes", vis: "all", size: "119 KB", updated: "Sep 2026", by: "Immanuel Oyelaran", opens: 24 },
    { id: "d10", name: "Program Calendar 2026–27.pdf", folder: "Programs", vis: "all", size: "304 KB", updated: "Aug 2026", by: "Terrance Greenlee", opens: 47 },
    { id: "d11", name: "Kappa League Curriculum.pdf", folder: "Programs", vis: "all", size: "1.4 MB", updated: "Sep 2026", by: "Dominic Falls", opens: 16 },
    { id: "d12", name: "Founders Day Run of Show.docx", folder: "Programs", vis: "all", size: "64 KB", updated: "Oct 2026", by: "Terrance Greenlee", opens: 11 },
    { id: "d13", name: "Scholarship Rubric & Applications.pdf", folder: "Programs", vis: "officers", size: "820 KB", updated: "Oct 2026", by: "Lamar Pryce", opens: 9 },
    { id: "d14", name: "Membership Intake Packet.pdf", folder: "Executive Board", vis: "officers", size: "2.1 MB", updated: "Sep 2026", by: "Marcus Session", opens: 6 },
    { id: "d15", name: "Executive Board Retreat Notes.pdf", folder: "Executive Board", vis: "officers", size: "73 KB", updated: "Jul 2026", by: "Marcus Session", opens: 8 },
    { id: "d16", name: "Risk Management & Anti-Hazing Policy.pdf", folder: "Governance", vis: "all", size: "210 KB", updated: "Jun 2026", by: "Nathaniel Caldwell", opens: 38 }
  ];

  var channels = [
    { id: "c1", name: "Chapter Announcements", vis: "all", desc: "Everyone · officers post", msgs: [
      { who: "m1", text: "Brothers, the November meeting packet is in the Vault. Read the budget amendment before Sunday.", at: "Mon 8:14 AM", views: 24, reacts: { "👍": 11, "🙏": 3 } },
      { who: "m5", text: "October minutes are posted for approval at the next meeting.", at: "Tue 6:02 PM", views: 19, reacts: { "👍": 6 } }
    ] },
    { id: "c2", name: "Executive Board", vis: "officers", desc: "Officers only · 11 members", msgs: [
      { who: "m5", text: "Three intake candidates are still waiting on vouches. Can we clear them before Sunday?", at: "Yesterday 9:31 AM", views: 9, reacts: {} },
      { who: "m4", text: "Confirmed the Mayo deposit cleared. We are 24 covers short on the banquet.", at: "Yesterday 2:48 PM", views: 9, reacts: {} },
      { who: "m1", text: "Let's take the shortfall to the floor Sunday, not the group chat.", at: "Today 7:20 AM", views: 8, reacts: { "👍": 4 } }
    ] },
    { id: "c3", name: "Guide Right", vis: "all", desc: "Committee · 6 members", msgs: [
      { who: "m14", text: "Need two more mentors for Saturday. Forty young men signed up, we have six of us.", at: "Today 11:05 AM", views: 14, reacts: { "🙋": 2 } }
    ] },
    { id: "c4", name: "Fundraising", vis: "all", desc: "Committee · 5 members", msgs: [
      { who: "m26", text: "Gala sponsorship letters go out Friday. Send me your employer matches.", at: "Mon 4:40 PM", views: 12, reacts: { "👍": 5 } }
    ] },
    { id: "c5", name: "Social Action", vis: "all", desc: "Committee · 4 members", msgs: [
      { who: "m6", text: "We registered 94 voters Saturday. Numbers are in the Vault.", at: "Oct 5", views: 21, reacts: { "🔥": 8, "👍": 9 } }
    ] }
  ];

  var notes = [
    { id: "n1", icon: "money", title: "2026–27 Chapter & Grand Tax is open", body: "$285 due November 1. Pay in full or set up monthly installments.", when: "Sep 2", read: true },
    { id: "n2", icon: "doc", title: "October minutes posted", body: "Immanuel Oyelaran added a document to Minutes.", when: "Oct 9", read: true },
    { id: "n3", icon: "cal", title: "Founders Day Banquet — tickets open", body: "Nov 14, 6:00 PM at The Mayo Hotel. $75 per plate, guests welcome. Mandatory for members.", when: "Oct 11", read: false },
    { id: "n4", icon: "bell", title: "Marcus Session posted an announcement", body: "The November meeting packet is in the Vault. Read the budget amendment before Sunday.", when: "Mon", read: false },
    { id: "n5", icon: "cake", title: "2 brothers have birthdays this month", body: "Patrick Hollaway (Oct 3) and Avery Rutledge (Oct 19). Tap to send a note from the chapter.", when: "Oct 1", read: true }
  ];

  return reanchor({
    chapter: {
      name: "Tulsa Alumni Chapter", org: "Kappa Alpha Psi Fraternity, Inc. · Tulsa, Oklahoma",
      founded: 1974, district: "Southwestern Province",
      accent: "#8A1538", plan: 49,
      titles: "kap"
    },
    cats: CATS,
    members: members, committees: committees, bills: bills, payments: payments,
    events: events, excuses: excuses, service: service, minutes: minutes, requests: requests,
    budget: budget, docs: docs, channels: channels, notes: notes,
    activity: [
      { t: "Chidi Nwosu paid $285.00 toward 2026–27 Chapter & Grand Tax", at: "Oct 12" },
      { t: "Darius Hobbs posted Treasurer's Report — September", at: "Oct 10" },
      { t: "Yves Armstrong reclaimed 2 brothers to financial standing", at: "Oct 10" },
      { t: "Gregory Sturdivant paid $285.00 toward 2026–27 Chapter & Grand Tax", at: "Oct 9" },
      { t: "Lamar Pryce opened the Scholarship essay contest", at: "Oct 8" },
      { t: "Social Action registered 94 voters at the Greenwood drive", at: "Oct 5" }
    ]
  });
};
