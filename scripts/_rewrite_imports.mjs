// Codemod: rewrite @/lib, @/components, @/actions imports -> @/modules/* after Phase R moves.
// - Same-module target  -> relative path
// - Cross-module target -> module public entry (index | server | actions/<f> | auth/middleware)
// - Split files (organizer.ts, admin.ts, kyc.ts) -> symbol-level routing, splitting the import
// Usage: node scripts/_rewrite_imports.mjs   (run from repo root)
import fs from "node:fs";
import path from "node:path";

const TESTS = path.resolve("tests");

// ---------- file move map: old "src/..." (no ext) -> new "src/..." (no ext) ----------
const MOVE = {};
const mv = (o, n) => { MOVE["src/" + o] = "src/" + n; };
// shared/lib
for (const f of ["constants","types","format","datetime","utils","pricing","phases","validation","logger","rate-limit","audit","upload","upi","razorpay","razorpay-verify","event-lifecycle","organizer-eligibility","backup","cron"])
  mv(`lib/${f}.ts`, `modules/shared/lib/${f}.ts`);
mv("lib/types/scanner-pins.ts", "modules/shared/lib/types/scanner-pins.ts");
mv("lib/types/box-office-pins.ts", "modules/shared/lib/types/box-office-pins.ts");
// shared/auth + db + hooks
mv("lib/auth.ts", "modules/shared/auth/auth.ts");
for (const f of ["server","client","service","middleware","config"]) mv(`lib/supabase/${f}.ts`, `modules/shared/auth/${f}.ts`);
mv("lib/supabase/database.types.ts", "modules/shared/db/database.types.ts");
mv("lib/hooks/use-realtime.ts", "modules/shared/hooks/use-realtime.ts");
// shared/data (whole files)
for (const f of ["events","orders","organizers","profile","platform-settings","notifications","waitlist","clubs","reviews","engagement","door-staff","scanner-pins","box-office-pins","boosts","hero-boosts"])
  mv(`lib/data/${f}.ts`, `modules/shared/data/${f}.ts`);
// domain data moves (non-split)
mv("lib/data/event-staff.ts", "modules/organizer/data/event-staff.ts");
mv("lib/data/legal-pages.ts", "modules/admin/data/legal-pages.ts");
// scanner offline
mv("lib/offline/scanner-db.ts", "modules/scanner/offline/scanner-db.ts");
mv("lib/offline/sync-manager.ts", "modules/scanner/offline/sync-manager.ts");
// shared/ui (components/{ui,layout,theme,pwa,auth} -> modules/shared/ui/<dir>)
for (const dir of ["ui","layout","theme","pwa","auth"])
  for (const f of fs.existsSync(`src/modules/shared/ui/${dir}`) ? fs.readdirSync(`src/modules/shared/ui/${dir}`) : [])
    mv(`components/${dir}/${f}`, `modules/shared/ui/${dir}/${f}`);
// scanner components (components/{scan,box-office} + organizer/{door-scanner,event-door-scanner,walkin-checkin-form})
for (const f of fs.existsSync("src/modules/scanner/components/scan") ? fs.readdirSync("src/modules/scanner/components/scan") : [])
  mv(`components/scan/${f}`, `modules/scanner/components/scan/${f}`);
for (const f of fs.existsSync("src/modules/scanner/components/box-office") ? fs.readdirSync("src/modules/scanner/components/box-office") : [])
  mv(`components/box-office/${f}`, `modules/scanner/components/box-office/${f}`);
for (const f of ["door-scanner","event-door-scanner","walkin-checkin-form"])
  mv(`components/organizer/${f}.tsx`, `modules/scanner/components/${f}.tsx`);
// admin components -> admin/components
for (const f of fs.existsSync("src/modules/admin/components") ? fs.readdirSync("src/modules/admin/components") : [])
  mv(`components/admin/${f}`, `modules/admin/components/${f}`);
// analytics components (were under components/admin) -> analytics/components
for (const f of ["analytics-charts","analytics-charts-lazy","user-analytics-export"])
  mv(`components/admin/${f}.tsx`, `modules/analytics/components/${f}.tsx`);
// admin actions
for (const f of ["admin","kyc","legal-pages"])
  mv(`actions/${f}.ts`, `modules/admin/actions/${f}.ts`);
// organizer components (components/organizer/* -> modules/organizer/components)
for (const f of fs.existsSync("src/modules/organizer/components") ? fs.readdirSync("src/modules/organizer/components") : [])
  mv(`components/organizer/${f}`, `modules/organizer/components/${f}`);
// analytics comps moved from components/organizer
for (const f of ["aggregated-analytics","analytics-panel"])
  mv(`components/organizer/${f}.tsx`, `modules/analytics/components/${f}.tsx`);
// organizer actions
for (const f of ["organizer","event-staff","door-staff","boosts","events"])
  mv(`actions/${f}.ts`, `modules/organizer/actions/${f}.ts`);
// web components (components/<dir> -> modules/web/components/<dir>)
for (const dir of ["events","checkout","profile","reviews","tickets"])
  for (const f of fs.existsSync(`src/modules/web/components/${dir}`) ? fs.readdirSync(`src/modules/web/components/${dir}`) : [])
    mv(`components/${dir}/${f}`, `modules/web/components/${dir}/${f}`);
mv(`components/clubs/join-club-form.tsx`, `modules/web/components/join-club-form.tsx`);
// community UI used by organizer+web -> shared/ui/community
for (const f of ["club-form","club-members-panel"])
  mv(`components/organizer/${f}.tsx`, `modules/shared/ui/community/${f}.tsx`);
mv(`components/organizer/follow-button.tsx`, `modules/web/components/follow-button.tsx`);
// shared actions (cross-domain)
for (const f of ["clubs","engagement","hero-boosts","reviews"])
  mv(`actions/${f}.ts`, `modules/shared/actions/${f}.ts`);
// web actions
for (const f of ["orders","waitlist"])
  mv(`actions/${f}.ts`, `modules/web/actions/${f}.ts`);

// ---------- symbol routing for split files ----------
const SYMBOL_ROUTES = {
  "lib/data/organizer": {
    getOrganizerProfile:"shared/server", createOrganizerProfile:"shared/server", updateOrganizerProfile:"shared/server",
    listOrganizerEvents:"organizer/server", listCollaboratedEvents:"organizer/server", createEvent:"organizer/server",
    updateEventStatus:"organizer/server", cancelEvent:"organizer/server", postponeEvent:"organizer/server",
    updateEvent:"organizer/server", deleteEvent:"organizer/server", TicketTierInput:"organizer/server", CreateEventInput:"organizer/server",
    getOrganizerEventAnalytics:"analytics/server", getOrganizerDailyRevenue:"analytics/server",
  },
  "lib/data/admin": {
    getAdminStats:"admin/server", listAllAdminEvents:"admin/server", listAllAdminUsers:"admin/server",
    listAllAdminOrders:"admin/server", adminDeleteEvent:"admin/server", adminUpdateEventStatus:"admin/server",
    adminToggleEventFeatured:"admin/server", adminUpdateEvent:"admin/server", adminToggleUserAdmin:"admin/server",
    getUserAnalytics:"analytics/server", getPaymentAnalytics:"analytics/server", getOrganizerAnalytics:"analytics/server",
    getEventAnalytics:"analytics/server", getRevenueAnalytics:"analytics/server",
    UserAnalytics:"analytics/server", PaymentAnalytics:"analytics/server", OrganizerAnalytics:"analytics/server", RevenueAnalytics:"analytics/server",
    listEventOrders:"shared/server", listEventTickets:"shared/server",
  },
  "lib/data/kyc": {
    listKycSubmissions:"admin/server", getKycSubmission:"admin/server", isKycApproved:"admin/server", KycSubmission:"admin/server",
  },
  "lib/auth": {
    getCurrentUser:"shared/server",
    CurrentUser:"shared", CurrentProfile:"shared",
  },
  // ---- action file splits (Phase R2+) ----
  "actions/scanner-pins": {
    verifyScannerPinAction:"scanner/actions/scan",
    generateScannerPinsAction:"organizer/actions/scanner-pins", revokeScannerPinAction:"organizer/actions/scanner-pins",
    GeneratePinsResult:"organizer/actions/scanner-pins",
  },
  "actions/box-office": {
    verifyBoxOfficePinAction:"scanner/actions/box-office", createBoxOfficeOrderAction:"scanner/actions/box-office",
    generateBoxOfficePinsAction:"organizer/actions/box-office-pins", revokeBoxOfficePinAction:"organizer/actions/box-office-pins",
    GenerateBoxOfficePinsResult:"organizer/actions/box-office-pins",
  },
  "actions/orders": {
    checkInTicketAction:"scanner/actions/check-in", createWalkinOrderAction:"scanner/actions/check-in",
    updateWalkinOrderAction:"scanner/actions/check-in", WalkinResult:"scanner/actions/check-in",
    approveOrderAction:"organizer/actions/order-verify", rejectOrderAction:"organizer/actions/order-verify",
  },
};

// lib basenames that are server-only (route to /server when imported cross-module)
const LIB_SERVER = new Set(["logger","audit","backup","cron","razorpay","razorpay-verify"]);

const pos = p => p.split(path.sep).join("/");
const noExt = p => p.replace(/\.(ts|tsx)$/,"");
const moduleOf = a => { const m=a.match(/src\/modules\/([^/]+)\//); return m?m[1]:null; };
const relPath = (f,t)=>{ let r=pos(path.relative(path.dirname(f),t)); return r.startsWith(".")?r:"./"+r; };

function publicEntry(newAbsNoExt){
  const mod = moduleOf(newAbsNoExt);
  const base = path.basename(newAbsNoExt);
  if (/\/data\//.test(newAbsNoExt)) return `@/modules/${mod}/server`;
  if (/\/actions\//.test(newAbsNoExt)) return `@/modules/${mod}/actions/${base}`;
  if (/\/lib\//.test(newAbsNoExt)) return LIB_SERVER.has(base)?`@/modules/${mod}/server`:`@/modules/${mod}`;
  if (/\/ui\//.test(newAbsNoExt)) return base==="navbar"?`@/modules/${mod}/server`:`@/modules/${mod}`;
  if (/\/auth\//.test(newAbsNoExt)){
    if (base==="server"||base==="service") return `@/modules/${mod}/server`;
    if (base==="middleware") return `@/modules/${mod}/auth/middleware`;
    return `@/modules/${mod}`;
  }
  return `@/modules/${mod}`; // hooks, db, lib/types, components, offline, lib types
}

// resolve a moved alias to its new abs path (no ext), or null if not moved
function movedTarget(spec){
  const oldAbs = "src/"+spec;
  let newAbs = MOVE[oldAbs]||MOVE[oldAbs+".ts"]||MOVE[oldAbs+".tsx"];
  if (!newAbs){
    let best=null;
    for (const k of Object.keys(MOVE)) if (oldAbs===k||oldAbs.startsWith(k+"/")) if(!best||k.length>best.length) best=k;
    if (best) newAbs = MOVE[best]+oldAbs.slice(best.length);
  }
  return newAbs?noExt(newAbs):null;
}
function aliasTarget(spec, srcPath, srcMod){
  const newAbs = movedTarget(spec);
  if (!newAbs) return "@/"+spec;
  const dstMod = moduleOf(newAbs);
  if (srcMod && dstMod && srcMod===dstMod) return relPath(srcPath, newAbs);
  return publicEntry(newAbs);
}

// ---------- collect files ----------
const files=[];
(function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()){ if(!/node_modules|\.next/.test(p)) walk(p);} else if(/\.(ts|tsx)$/.test(e.name)) files.push(pos(p)); }})("src");
if (fs.existsSync(TESTS)) (function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(/\.(ts|tsx)$/.test(e.name)) files.push(pos(p)); }})(TESTS);

let changed=0;
const splitNotes=[];
for (const file of files){
  const srcMod = moduleOf(file);
  let code = fs.readFileSync(file,"utf8");
  const orig = code;

  // (A) static import/export-from with a clause:  (import|export)( type)? <clause> from "@/x"
  code = code.replace(/\b(import|export)(\s+type)?\s+([^'";]*?)\s+from\s+["']@\/([^"']+)["']/g,
    (m,kw,typeKw,clause,spec)=>{
      const route = SYMBOL_ROUTES[spec];
      if (route){
        const brace = clause.match(/\{([^}]*)\}/);
        const named = brace?brace[1].split(",").map(s=>s.trim()).filter(Boolean):[];
        const nonBraced = clause.replace(/\{[^}]*\}/,"").replace(/,$|^,/,"").trim(); // default/namespace
        const groups={};
        for(const n0 of named){
          const isT=/^type\s+/.test(n0); const n=n0.replace(/^type\s+/,"");
          const dest=route[n];
          // unrouted symbol: if the source file still exists (partial split), keep "@/spec"; else treat as a type -> shared index
          let key;
          if (dest) key=dest;
          else {
            const mt=movedTarget(spec); // unrouted: follow the file's move if it moved, else keep "@/spec", else shared index (types)
            key = mt ? publicEntry(mt) : (fs.existsSync(`src/${spec}.ts`)||fs.existsSync(`src/${spec}.tsx`) ? `@/${spec}` : "@/modules/shared");
          }
          (groups[key]||=[]).push((isT?"type ":"")+n);
        }
        const tK = typeKw?" type":"";
        const parts=[];
        if (nonBraced) parts.push(`${kw}${tK} ${nonBraced} from "${aliasTarget(spec,file,srcMod)}"`);
        for(const [dest,ns] of Object.entries(groups))
          parts.push(`${kw}${tK} { ${ns.join(", ")} } from "${dest.startsWith("@/")?dest:"@/modules/"+dest}"`);
        splitNotes.push(`${file}: split @/${spec}`);
        return parts.join(";\n");
      }
      return `${kw}${typeKw||""} ${clause} from "${aliasTarget(spec,file,srcMod)}"`;
    });

  // (B) bare side-effect import: import "@/x";
  code = code.replace(/\bimport\s+["']@\/([^"']+)["']/g,(m,spec)=>`import "${aliasTarget(spec,file,srcMod)}"`);

  // (C1) destructured dynamic import: const { a, b } = await import("@/x")  (split-file aware)
  code = code.replace(/const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']@\/([^"']+)["']\s*\)/g,
    (m,names,spec)=>{
      const route = SYMBOL_ROUTES[spec];
      if (!route) return `const {${names}} = await import("${aliasTarget(spec,file,srcMod)}")`;
      const syms = names.split(",").map(s=>s.trim()).filter(Boolean);
      const mods = [...new Set(syms.map(s=>{ const n=s.split(/\s+as\s+/)[0].trim(); return route[n]; }).filter(Boolean))];
      if (mods.length===1 && mods.length===syms.length) return `const {${names}} = await import("@/modules/${mods[0]}")`;
      // mixed/unrouted -> keep unrouted at the file's new location (or original if unmoved)
      const byMod={};
      const unmoved=`@/${spec}`; const mt=movedTarget(spec);
      const unroutedSpec = mt ? publicEntry(mt) : unmoved;
      for(const s of syms){ const n=s.split(/\s+as\s+/)[0].trim(); const mod=route[n]? `@/modules/${route[n]}` : unroutedSpec; (byMod[mod]||=[]).push(s); }
      const parts = Object.entries(byMod).map(([mod,ns])=>`const { ${ns.join(", ")} } = await import("${mod}")`);
      splitNotes.push(`${file}: split-dynamic @/${spec}`);
      return parts.join(";\n  ");
    });

  // (C) dynamic import("@/x") / dynamic(() => import("@/x"))
  code = code.replace(/import\(\s*["']@\/([^"']+)["']\s*\)/g,(m,spec)=>`import("${aliasTarget(spec,file,srcMod)}")`);

  if (code!==orig){ fs.writeFileSync(file,code); changed++; }
}
console.log("rewrote",changed,"files");
console.log("split imports:",splitNotes.length);
splitNotes.forEach(n=>console.log("  ",n));
