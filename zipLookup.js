// Curated Maine ZIP -> town / county lookup, for zip-only signup.
// ONLY pairings the author was confident about are listed here.
// Any ZIP not in this table is NOT guessed: the app falls back to a
// manual county/town confirmation step, so no one gets stuck and no
// wrong town is silently assigned. Add a pairing here only when you
// are confident it is the USPS town for that ZIP.
const MAINE_ZIP_LOOKUP = {
  // York
  '03901': ['Berwick', 'York'], '03904': ['Kittery', 'York'],
  '03907': ['Ogunquit', 'York'], '03909': ['York', 'York'],
  '04005': ['Biddeford', 'York'], '04043': ['Kennebunk', 'York'],
  '04046': ['Kennebunkport', 'York'], '04072': ['Saco', 'York'],
  '04073': ['Sanford', 'York'], '04090': ['Wells', 'York'],
  // Cumberland
  '04011': ['Brunswick', 'Cumberland'], '04032': ['Freeport', 'Cumberland'],
  '04038': ['Gorham', 'Cumberland'], '04062': ['Windham', 'Cumberland'],
  '04074': ['Scarborough', 'Cumberland'], '04092': ['Westbrook', 'Cumberland'],
  '04096': ['Yarmouth', 'Cumberland'], '04101': ['Portland', 'Cumberland'],
  '04102': ['Portland', 'Cumberland'], '04103': ['Portland', 'Cumberland'],
  '04104': ['Portland', 'Cumberland'], '04105': ['Falmouth', 'Cumberland'],
  '04106': ['South Portland', 'Cumberland'], '04107': ['Cape Elizabeth', 'Cumberland'],
  '04108': ['Portland', 'Cumberland'], '04109': ['Portland', 'Cumberland'],
  '04110': ['Portland', 'Cumberland'], '04112': ['Portland', 'Cumberland'],
  '04116': ['South Portland', 'Cumberland'], '04122': ['Portland', 'Cumberland'],
  '04123': ['Portland', 'Cumberland'], '04124': ['Portland', 'Cumberland'],
  // Androscoggin
  '04210': ['Auburn', 'Androscoggin'], '04211': ['Auburn', 'Androscoggin'],
  '04222': ['Durham', 'Androscoggin'], '04236': ['Greene', 'Androscoggin'],
  '04240': ['Lewiston', 'Androscoggin'], '04241': ['Lewiston', 'Androscoggin'],
  '04250': ['Lisbon', 'Androscoggin'], '04252': ['Lisbon Falls', 'Androscoggin'],
  '04256': ['Mechanic Falls', 'Androscoggin'], '04274': ['Poland', 'Androscoggin'],
  '04280': ['Sabattus', 'Androscoggin'], '04282': ['Turner', 'Androscoggin'],
  // Kennebec
  '04330': ['Augusta', 'Kennebec'], '04345': ['Gardiner', 'Kennebec'],
  '04347': ['Hallowell', 'Kennebec'], '04901': ['Waterville', 'Kennebec'],
  '04963': ['Oakland', 'Kennebec'],
  // Penobscot
  '04401': ['Bangor', 'Penobscot'], '04402': ['Bangor', 'Penobscot'],
  '04412': ['Brewer', 'Penobscot'], '04429': ['Dexter', 'Penobscot'],
  '04444': ['Hampden', 'Penobscot'], '04455': ['Millinocket', 'Penobscot'],
  '04468': ['Old Town', 'Penobscot'], '04473': ['Orono', 'Penobscot'],
  // Aroostook
  '04730': ['Houlton', 'Aroostook'], '04736': ['Caribou', 'Aroostook'],
  '04743': ['Fort Kent', 'Aroostook'], '04756': ['Madawaska', 'Aroostook'],
  '04769': ['Presque Isle', 'Aroostook'],
  // Hancock
  '04605': ['Bar Harbor', 'Hancock'], '04609': ['Blue Hill', 'Hancock'],
  '04614': ['Ellsworth', 'Hancock'], '04679': ['Southwest Harbor', 'Hancock'],
  // Knox
  '04841': ['Rockland', 'Knox'], '04843': ['Rockport', 'Knox'],
  '04856': ['Camden', 'Knox'],
  // Lincoln
  '04543': ['Damariscotta', 'Lincoln'], '04553': ['Newcastle', 'Lincoln'],
  '04572': ['Waldoboro', 'Lincoln'], '04578': ['Wiscasset', 'Lincoln'],
  // Sagadahoc
  '04086': ['Topsham', 'Sagadahoc'], '04530': ['Bath', 'Sagadahoc'],
  '04562': ['Phippsburg', 'Sagadahoc'],
  // Franklin
  '04938': ['Farmington', 'Franklin'], '04970': ['Rangeley', 'Franklin'],
  '04982': ['Wilton', 'Franklin'],
  // Oxford
  '04071': ['Norway', 'Oxford'], '04260': ['Rumford', 'Oxford'],
  '04268': ['Bethel', 'Oxford'], '04276': ['South Paris', 'Oxford'],
  // Piscataquis
  '04426': ['Dover-Foxcroft', 'Piscataquis'], '04443': ['Guilford', 'Piscataquis'],
  '04462': ['Greenville', 'Piscataquis'],
  // Somerset
  '04920': ['Bingham', 'Somerset'], '04945': ['Madison', 'Somerset'],
  '04976': ['Skowhegan', 'Somerset'],
  // Waldo
  '04915': ['Belfast', 'Waldo'], '04849': ['Lincolnville', 'Waldo'],
  // Washington
  '04619': ['Calais', 'Washington'], '04640': ['Eastport', 'Washington'],
  '04654': ['Machias', 'Washington'],
};

function lookupZip(zip) {
  const z = String(zip || '').trim();
  const hit = MAINE_ZIP_LOOKUP[z];
  if (!hit) return null;
  return { zip: z, town: hit[0], county: hit[1] };
}

module.exports = { MAINE_ZIP_LOOKUP, lookupZip };
