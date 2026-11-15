// js/modules/index.js — ordered list of world modules. The loader builds them in this order, each isolated
// (try/catch, timed, counted). A listed module whose file does not exist yet is reported as "missing" and
// skipped. A module is js/modules/<name>.js or js/modules/<name>/index.js with
//   export default { name, claims?, prepare?(ctx), build(ctx) }          (ENGINE.md, section 4)
//
// Names starting with "_" are debug modules:
//   _massing      draws world.json as massing for everything no built module has claimed (flag massing=0|1|2)
//   _layoutdebug  opt-in with ?with=_layoutdebug (or --with _layoutdebug)
// A scratch module of your own does NOT need an entry here: `--with myname` builds js/modules/myname.js (or
// js/modules/myname/index.js) just before _massing, even together with --only.
// Scratch modules that exist: _template (the module template of MODULE_GUIDE.md), _guide (its seven recipes),
// _postload / _postlamps / _posttest / _postopt (post engineer). Which real module replaces which part of
// _massing and _layoutdebug: MODULE_GUIDE.md section 7.
// OWNER of this file: the engine architect / integrator. Do not reorder without telling everyone.
export default [
  'terrain',      // ground surface, banks, fields          (ground engineer)
  'waterbodies',  // river, moats, canals as water surfaces  (water engineer)
  'walls',        // inner double wall, outer wall, ordinary gates, causeways
  'ishtar',       // Ishtar Gate, lion street, bastions, North Gate
  'streets',      // Processional Way paving, streets, lanes
  'riverworks',   // quays, bridge, landings
  'etemenanki',   // ziggurat and precinct
  'southpalace',  // South Palace (five courts, throne room, vaulted building)
  'palaces',      // North / Summer Palace, West and East Fortification
  'esagila',      // Esagila and its annex
  'temples',      // all other temples
  'houses',       // urban fabric from ctx.layout (architecture only)
  'dressing',     // static props of daily life, city-wide (no claims)
  'environs',     // outer city, villages, fields, kilns, roads
  'vegetation',   // palms, trees, reeds, gardens
  'rivercraft',   // boats, quffas, wakes
  'people',       // people, animals, props
  'nightfx',      // lamps, fires, braziers, smoke
  '_layoutdebug',
  '_massing',     // LAST: it draws only what the modules above did not claim
];

/** Debug modules that are built only when named in ?with= (or ?only=). */
export const OPT_IN = ['_layoutdebug'];
