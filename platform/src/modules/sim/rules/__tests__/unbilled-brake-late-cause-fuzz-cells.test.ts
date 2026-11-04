/**
 * ROUND 7 OF LANE flooredinvite (2026-11-03 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's Q10g). THE FACT is Q10b's: a cause later than the sustain
 * after the open application's last credit CHANGES NOTHING about the brake
 * check — records and praise exactly as its no-cause control's; bills never
 * move against base (Q10e).
 *
 * The seventeen timelines below are the cells the seeded differential fuzz
 * (≥ 5,000 random 60 Hz timelines — pumps, floors, single and modulated
 * applications, gentle tails, releases 0.03–0.6 s, gentle and firm re-presses,
 * 30–60 км/ч, a lane excursion / junction / stop line / wrong-way pulse placed
 * more than the sustain after the open application's last credit, random close
 * follower reports, drive ends) found DIFFERENT from their control on the
 * round-6 + Fix S tree, kept here as regression pins, each with the control's
 * outcome written out:
 *  · a late cause on an open application that had only CREDITED (not pumped or
 *    floored) voided it and ended the chain, so a short release and a re-press
 *    began a new chain — the control's pump (seed 63, 112) went missing, or the
 *    re-press's own floor was named with ITS start and «при … км/ч» instead of
 *    the brake check's (137, 174);
 *  · a late cause on a BILLED chain ended it, so the re-press's floor was named
 *    beside the bill of the same brake check (47, 109, 178);
 *  · the control's window kept marking floored frames after the late cause
 *    (its mean still emergency-grade over a floored credit): the record's «at»
 *    and the floor-lift's window, and F2's praise reset, differed (436, 2361,
 *    3090, 3102, 3565, 3644, 3794, 4088, 4515, 4734).
 * The fuzz itself is a probe (never committed); its source is in the lane's
 * scratch for the verifier.
 */
import { describe, expect, it } from "vitest";
import type { SimTick, SimTickEvent } from "../types";
import { createRuleEngine, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain } from "../engine";
import { segmentTape, splitTape } from "./round3Tapes";

const H = 1 / 60;

interface Cell {
  seed: number;
  cruise: number;
  t0: number;
  segs: Array<{ d: number; a: number }>;
  endSec: number;
  kind: "lane" | "junction" | "stopline" | "wrongway";
  c0: number;
  dur: number;
  reps: Array<[number, number]>;
  forms: string[];
  bills: number;
}

const CELLS: Cell[] = [
  {"seed":47,"cruise":48.88,"t0":12.383333333333333,"segs":[{"d":0.25,"a":-8.851857563015074},{"d":0.23333333333333334,"a":0},{"d":0.3,"a":-9.171514314925298},{"d":0.03333333333333333,"a":0},{"d":0.26666666666666666,"a":-7.603707085736096},{"d":0.9166666666666666,"a":-2.6104166279197667},{"d":0.3333333333333333,"a":0},{"d":0.5333333333333333,"a":-9.327148496476003}],"endSec":36.29082241654396,"kind":"stopline","c0":860,"dur":4,"reps":[],"forms":[],"bills":1},
  {"seed":63,"cruise":37.2,"t0":12.333333333333334,"segs":[{"d":0.1,"a":-8.510308722546323},{"d":0.3,"a":0},{"d":0.16666666666666666,"a":-9.384829644137062},{"d":0.6,"a":-2.1816274603595955},{"d":0.05,"a":0},{"d":0.31666666666666665,"a":-9.106803883239627}],"endSec":35.159437164633225,"kind":"lane","c0":802,"dur":7,"reps":[],"forms":["pumped"],"bills":0},
  {"seed":109,"cruise":57.92,"t0":15.266666666666666,"segs":[{"d":0.15,"a":-8.270204440900125},{"d":0.11666666666666667,"a":0},{"d":0.6,"a":-7.549140005442314},{"d":1.75,"a":-3.102430427120998},{"d":0.08333333333333333,"a":0},{"d":0.4166666666666667,"a":-10.336245824256912}],"endSec":40.64062366684278,"kind":"stopline","c0":1004,"dur":50,"reps":[],"forms":[],"bills":1},
  {"seed":112,"cruise":48.45,"t0":14.666666666666666,"segs":[{"d":0.18333333333333332,"a":-7.688839628035203},{"d":0.25,"a":0},{"d":0.2,"a":-10.293422423908487},{"d":0.25,"a":0},{"d":0.3833333333333333,"a":-7.555619885609485},{"d":1.2,"a":-2.6708108478458596},{"d":0.16666666666666666,"a":0},{"d":0.3833333333333333,"a":-3.0999957683263344},{"d":0.15,"a":0},{"d":0.55,"a":-8.043544536922127}],"endSec":39.50036147333061,"kind":"junction","c0":1014,"dur":41,"reps":[],"forms":["pumped"],"bills":0},
  {"seed":137,"cruise":52.04,"t0":13.35,"segs":[{"d":0.26666666666666666,"a":-9.156392288231292},{"d":1.2,"a":-3.2765941664692946},{"d":0.26666666666666666,"a":0},{"d":0.65,"a":-8.14326128710527}],"endSec":42.89540138182541,"kind":"junction","c0":871,"dur":13,"reps":[],"forms":["floored"],"bills":0},
  {"seed":174,"cruise":48.76,"t0":14.783333333333333,"segs":[{"d":0.11666666666666667,"a":-10.325211852556095},{"d":0.18333333333333332,"a":-3.677272690460086},{"d":0.13333333333333333,"a":-8.604509433475323},{"d":1.7666666666666666,"a":-2.1027824226533993},{"d":0.25,"a":0},{"d":0.6666666666666666,"a":-9.219063484948128}],"endSec":44.64883473664522,"kind":"junction","c0":962,"dur":37,"reps":[[1129,4.87837134487927]],"forms":["floored"],"bills":0},
  {"seed":178,"cruise":57.9,"t0":13.4,"segs":[{"d":0.2833333333333333,"a":-8.974006995046512},{"d":0.11666666666666667,"a":-3.3322342531755567},{"d":0.16666666666666666,"a":-8.974209266225808},{"d":0.35,"a":0},{"d":1.1666666666666667,"a":-2.090306075941771},{"d":0.08333333333333333,"a":0},{"d":0.6833333333333333,"a":-9.023669124674052}],"endSec":40.363580705598,"kind":"wrongway","c0":863,"dur":18,"reps":[[817,5.674039554782212]],"forms":[],"bills":1},
  {"seed":436,"cruise":35.14,"t0":12.683333333333334,"segs":[{"d":0.65,"a":-9.246102579287253},{"d":0.9666666666666667,"a":-4.331699758104514},{"d":0.3333333333333333,"a":0},{"d":0.48333333333333334,"a":-9.593805690016598},{"d":0.16666666666666666,"a":0},{"d":0.15,"a":-8.232951013511046}],"endSec":44.023340159313136,"kind":"wrongway","c0":827,"dur":38,"reps":[],"forms":["floored"],"bills":0},
  {"seed":2361,"cruise":39.72,"t0":13.733333333333333,"segs":[{"d":0.15,"a":-9.897648894391022},{"d":0.15,"a":0},{"d":0.7666666666666666,"a":-8.71711266960483},{"d":1.7,"a":-4.524419132608454},{"d":0.11666666666666667,"a":0},{"d":0.65,"a":-9.532794404402376}],"endSec":38.820313707521805,"kind":"stopline","c0":916,"dur":80,"reps":[],"forms":["floored"],"bills":0},
  {"seed":3090,"cruise":40.89,"t0":13.416666666666666,"segs":[{"d":0.21666666666666667,"a":-9.025916553195566},{"d":0.05,"a":0},{"d":0.65,"a":-10.108569424180313},{"d":0.55,"a":-3.829116178292315},{"d":0.5333333333333333,"a":0}],"endSec":17.469154672619574,"kind":"stopline","c0":889,"dur":67,"reps":[],"forms":["floored"],"bills":0},
  {"seed":3102,"cruise":35.12,"t0":12.883333333333333,"segs":[{"d":0.6833333333333333,"a":-9.866831517918035},{"d":1.3,"a":-3.7194002534495665},{"d":0.6,"a":0},{"d":0.55,"a":-8.126400215551257}],"endSec":36.86358730640883,"kind":"junction","c0":840,"dur":39,"reps":[],"forms":["floored"],"bills":0},
  {"seed":3565,"cruise":40.42,"t0":15.466666666666667,"segs":[{"d":0.16666666666666666,"a":-9.49451563116163},{"d":0.1,"a":0},{"d":0.5666666666666667,"a":-10.042675100988708},{"d":1.9833333333333334,"a":-4.295826586638577},{"d":0.4,"a":0}],"endSec":43.918800320693606,"kind":"junction","c0":1004,"dur":23,"reps":[],"forms":["floored"],"bills":0},
  {"seed":3644,"cruise":37.5,"t0":12.466666666666667,"segs":[{"d":0.25,"a":-8.190834567672573},{"d":0.15,"a":0},{"d":0.6166666666666667,"a":-9.455715142772533},{"d":1.1166666666666667,"a":-4.507145206083077},{"d":0.21666666666666667,"a":0},{"d":0.4,"a":-10.38853546846658}],"endSec":36.62665818060438,"kind":"junction","c0":835,"dur":50,"reps":[[1006,5.204002063721418]],"forms":["floored"],"bills":0},
  {"seed":3794,"cruise":36.92,"t0":15.616666666666667,"segs":[{"d":0.21666666666666667,"a":-7.255877471482381},{"d":0.11666666666666667,"a":0},{"d":0.5833333333333334,"a":-9.925187316723168},{"d":0.8833333333333333,"a":-4.486118590238038},{"d":0.13333333333333333,"a":0},{"d":0.2833333333333333,"a":-3.043013476755004},{"d":0.5666666666666667,"a":0},{"d":0.15,"a":-8.714244148693979}],"endSec":20.185526899481193,"kind":"wrongway","c0":1024,"dur":9,"reps":[[1158,9.657222108915448]],"forms":["floored"],"bills":0},
  {"seed":4088,"cruise":34.82,"t0":13.066666666666666,"segs":[{"d":0.6833333333333333,"a":-10.3871401125798},{"d":1.2,"a":-4.3365906436927615},{"d":0.2,"a":0},{"d":1.1,"a":-4.528043501032516}],"endSec":39.15303856600076,"kind":"junction","c0":851,"dur":60,"reps":[[959,8.696863879449666]],"forms":["floored"],"bills":0},
  {"seed":4515,"cruise":40.44,"t0":12.183333333333334,"segs":[{"d":0.18333333333333332,"a":-9.73729615251068},{"d":0.15,"a":0},{"d":0.6333333333333333,"a":-9.207355794101023},{"d":1.9833333333333334,"a":-4.4619910272886045},{"d":0.13333333333333333,"a":0},{"d":1.0166666666666666,"a":-2.3192988597787916}],"endSec":38.191851604854065,"kind":"stopline","c0":817,"dur":14,"reps":[],"forms":["floored"],"bills":0},
  {"seed":4734,"cruise":34.12,"t0":14.85,"segs":[{"d":0.6833333333333333,"a":-10.384746336587705},{"d":1.5,"a":-3.4280228559277015},{"d":0.2833333333333333,"a":0}],"endSec":40.999119654080516,"kind":"wrongway","c0":959,"dur":84,"reps":[],"forms":["floored"],"bills":0},
];

const causeField = (kind: Cell["kind"]): Partial<SimTick> =>
  kind === "lane" ? { laneOffsetM: 3.6 } : kind === "junction" ? { nextJunctionM: 20 } : kind === "stopline" ? { nextStopLineM: 3 } : { wrongWay: true };
const report = (speedMps: number): SimTickEvent => ({ kind: "followerBraked", vehicleId: 7, decelMps2: 9, heldSec: 0.45, qualifiedSec: 0.45, shedMps: 4, speedMps, gapM: 4 });

function tape(c: Cell, withCause: boolean): SimTick[] {
  let ticks = segmentTape(c.cruise, c.t0, c.segs, c.endSec);
  for (const [ri, sp] of c.reps) ticks = ticks.map((t, i) => (i === ri ? { ...t, events: [...(t.events ?? []), report(sp)] } : t));
  return withCause ? ticks.map((t, i) => (i >= c.c0 && i < c.c0 + c.dur ? { ...t, ...causeField(c.kind) } : t)) : ticks;
}

function run(ticks: SimTick[]) {
  let s = createRuleEngine({});
  const out = { clean: [] as number[], violations: [] as string[], records: [] as string[], credited: [] as number[] };
  for (const f of ticks) {
    const seq = s.harshBrake.recordSeq;
    const r = reduceTick(s, f);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(e.t);
      if (e.kind === "violation") out.violations.push(`${e.code}@${e.t.toFixed(4)}`);
    }
    if (s.harshBrake.activeSince !== null && s.harshBrake.lastQualAt === f.t) out.credited.push(f.t);
    if (s.harshBrake.recordSeq !== seq) {
      const x = lastUnbilledHardBrake(s.harshBrake)!;
      out.records.push(`${x.form}|${x.onsetKmh}|${x.shownKmh}|${x.sinceSec}|${x.atSec}`);
    }
  }
  if (s.harshBrake.chainOpen) {
    const x = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (x) out.records.push(`${x.form}|${x.onsetKmh}|${x.shownKmh}|${x.sinceSec}|${x.atSec}`);
  }
  return out;
}

describe("Q10g — the fuzz-found late-cause cells: records and praise exactly the no-cause control's", () => {
  for (const c of CELLS) {
    it(`seed ${c.seed} (${c.kind} from grid point ${c.c0} for ${c.dur}): ${c.forms.length ? c.forms.join(", ") : "no record"}${c.bills ? " beside the bill" : ""}, as the control`, () => {
      const r = run(tape(c, true));
      const k = run(tape(c, false));
      // a LATE cause: more than the sustain after the last credited frame, and no credit while it reaches
      const last = r.credited.filter((x) => x < c.c0 * H - 1e-9).pop()!;
      expect(Math.round((c.c0 * H - last) / H)).toBeGreaterThan(24);
      expect(k.credited.filter((x) => x >= c.c0 * H - 1e-9 && x < (c.c0 + c.dur) * H)).toEqual([]);
      expect(k.records.map((x) => x.split("|")[0]), "the control's outcome").toEqual(c.forms);
      expect(r.records, "the control's record: form, onset, shown, since, at").toEqual(k.records);
      expect(r.violations.filter((v) => v.startsWith("HARSH")).length).toBe(c.bills);
      expect(r.violations.filter((v) => v.startsWith("HARSH"))).toEqual(k.violations.filter((v) => v.startsWith("HARSH")));
      expect(r.clean, "the praise").toEqual(k.clean);
    });
  }
});

/**
 * Q10e's STATED LIMIT, as the fuzz meets it (43 cells of seeds 1–10,000): a
 * close follower's report the floor-lift would attribute to the late-folded
 * floor, before any re-press spends it. The control is billed by the floor-lift
 * and names nothing; this drive cannot be billed (base bills nothing), so it
 * names nothing either, and its praise is BASE's — the base 230c7b8 reducer's
 * CLEAN_DRIVING times on the same ticks, measured on this lane with an exact
 * copy of the base engine and written out here (`baseClean`).
 */
interface LimitCell extends Omit<Cell, "forms" | "bills"> {
  baseClean: number[];
  ctlBills: number;
}
const LIMIT_CELLS: LimitCell[] = [
  {"seed":684,"cruise":35.2,"t0":12.383333333333333,"segs":[{"d":0.21666666666666667,"a":-9.491059336974285},{"d":0.08333333333333333,"a":0},{"d":0.5666666666666667,"a":-8.762418067641557},{"d":2.05,"a":-2.713888361479621},{"d":0.5166666666666666,"a":0},{"d":0.26666666666666666,"a":-3.9861808517947788}],"endSec":38.302738072195396,"kind":"lane","c0":827,"dur":9,"reps":[[885,9.15735785709694]],"baseClean":[],"ctlBills":1},
  {"seed":991,"cruise":32.57,"t0":15.966666666666667,"segs":[{"d":0.21666666666666667,"a":-8.754297164501622},{"d":0.05,"a":0},{"d":0.5333333333333333,"a":-7.27264845657628},{"d":1.3666666666666667,"a":-2.898621319781523},{"d":0.18333333333333332,"a":0}],"endSec":39.26873025835181,"kind":"wrongway","c0":1033,"dur":88,"reps":[[1196,5.838048892561346],[1053,9.066181679721922]],"baseClean":[],"ctlBills":1},
  {"seed":2063,"cruise":31.92,"t0":15.866666666666667,"segs":[{"d":0.2833333333333333,"a":-9.429211228759959},{"d":0.25,"a":-5.217946100514382},{"d":0.2833333333333333,"a":-8.078293241397478},{"d":2.183333333333333,"a":-3.047729512944352},{"d":0.5,"a":0},{"d":0.3333333333333333,"a":-4.53648903472349}],"endSec":48.719858604297045,"kind":"stopline","c0":1034,"dur":68,"reps":[[1045,7.486940900795162]],"baseClean":[],"ctlBills":1},
  {"seed":2228,"cruise":31.41,"t0":13.783333333333333,"segs":[{"d":0.3333333333333333,"a":-8.51356661876198},{"d":0.03333333333333333,"a":0},{"d":0.18333333333333332,"a":-10.23779456494376},{"d":2.2,"a":-3.921498939569574},{"d":0.25,"a":0},{"d":0.48333333333333334,"a":-9.982260701945052}],"endSec":42.52485212503622,"kind":"junction","c0":897,"dur":31,"reps":[[927,9.290332694072276],[1152,6.720026987139136]],"baseClean":[],"ctlBills":1},
  {"seed":2490,"cruise":35.33,"t0":13.983333333333333,"segs":[{"d":0.25,"a":-9.820727227977477},{"d":0.11666666666666667,"a":0},{"d":0.4666666666666667,"a":-10.482960903039203},{"d":0.8,"a":-4.217075040540657},{"d":0.26666666666666666,"a":0}],"endSec":44.744576212981094,"kind":"junction","c0":915,"dur":50,"reps":[[992,9.59032394643873]],"baseClean":[43.516667],"ctlBills":1},
  {"seed":2591,"cruise":33.31,"t0":15.316666666666666,"segs":[{"d":0.5666666666666667,"a":-9.770019627339206},{"d":2.1333333333333333,"a":-3.2671485953149384},{"d":0.36666666666666664,"a":0}],"endSec":47.25782214853292,"kind":"junction","c0":980,"dur":41,"reps":[[1207,5.682473618537188],[1014,5.159343866165727]],"baseClean":[],"ctlBills":1},
  {"seed":3376,"cruise":36.31,"t0":13.433333333333334,"segs":[{"d":0.15,"a":-8.099677480291575},{"d":0.08333333333333333,"a":0},{"d":0.6666666666666666,"a":-9.809525273856707},{"d":2.05,"a":-3.3710628946893846},{"d":0.5333333333333333,"a":0},{"d":1.05,"a":-2.6399360967916436}],"endSec":45.18769563675548,"kind":"lane","c0":890,"dur":5,"reps":[[917,9.478705097921193],[1159,7.148106625303626]],"baseClean":[45.016667],"ctlBills":1},
  {"seed":4234,"cruise":31.68,"t0":12.116666666666667,"segs":[{"d":0.2833333333333333,"a":-8.669153347564862},{"d":0.05,"a":0},{"d":0.5166666666666666,"a":-8.180710962647572},{"d":1.3666666666666667,"a":-3.3781097311526533},{"d":0.21666666666666667,"a":0},{"d":0.6333333333333333,"a":-2.8355413796263744}],"endSec":40.18399093554666,"kind":"wrongway","c0":805,"dur":82,"reps":[[835,9.43451783619821]],"baseClean":[],"ctlBills":1},
  {"seed":4629,"cruise":33.49,"t0":13.983333333333333,"segs":[{"d":0.25,"a":-7.938656828692183},{"d":0.1,"a":-3.8090690402314067},{"d":0.15,"a":-8.654422121448443},{"d":0.8833333333333333,"a":-4.508918620203621},{"d":0.4166666666666667,"a":0},{"d":0.36666666666666664,"a":-4.516376273403875}],"endSec":41.07794612655416,"kind":"lane","c0":909,"dur":11,"reps":[[910,9.170412709005177]],"baseClean":[],"ctlBills":1},
  {"seed":4665,"cruise":34.7,"t0":13.383333333333333,"segs":[{"d":0.8166666666666667,"a":-9.82328544280026},{"d":1.45,"a":-2.284065120969899},{"d":0.2833333333333333,"a":0},{"d":0.4666666666666667,"a":-4.3265202572220005}],"endSec":42.74218869265169,"kind":"wrongway","c0":878,"dur":63,"reps":[[892,5.502987283747643]],"baseClean":[],"ctlBills":1},
  {"seed":4837,"cruise":31.09,"t0":13.616666666666667,"segs":[{"d":0.2,"a":-9.691367887984962},{"d":0.21666666666666667,"a":-4.792241799412295},{"d":0.21666666666666667,"a":-10.22065701582469},{"d":0.9333333333333333,"a":-3.0017806186689993},{"d":0.13333333333333333,"a":0}],"endSec":17.75857762574839,"kind":"stopline","c0":901,"dur":55,"reps":[[919,7.030609066132456],[925,8.786750059574842]],"baseClean":[],"ctlBills":1},
  {"seed":4995,"cruise":34.8,"t0":14,"segs":[{"d":0.6833333333333333,"a":-9.577592130261474},{"d":0.43333333333333335,"a":-3.495483595854602},{"d":0.16666666666666666,"a":0}],"endSec":42.48347010941555,"kind":"wrongway","c0":908,"dur":59,"reps":[[1019,4.6294766631908715],[912,8.175740894395858]],"baseClean":[],"ctlBills":1},
  {"seed":5078,"cruise":39.53,"t0":15.233333333333333,"segs":[{"d":0.13333333333333333,"a":-9.099801723193377},{"d":0.06666666666666667,"a":0},{"d":0.5333333333333333,"a":-9.654625580320134},{"d":1.6333333333333333,"a":-2.7616890086093915},{"d":0.23333333333333334,"a":0},{"d":0.55,"a":-8.026215238287113}],"endSec":40.641278307450314,"kind":"lane","c0":1009,"dur":42,"reps":[[1009,7.852790574077517]],"baseClean":[],"ctlBills":1},
  {"seed":5138,"cruise":42.68,"t0":12.683333333333334,"segs":[{"d":0.2,"a":-10.293761369143613},{"d":0.16666666666666666,"a":0},{"d":0.75,"a":-9.06237305640243},{"d":1.1333333333333333,"a":-3.6568759099813173},{"d":0.11666666666666667,"a":0},{"d":0.5666666666666667,"a":-9.033727823314257}],"endSec":44.967653345285605,"kind":"lane","c0":869,"dur":27,"reps":[[903,8.552741566672921],[971,7.435618940740824]],"baseClean":[39.416667],"ctlBills":1},
  {"seed":5441,"cruise":37.68,"t0":12,"segs":[{"d":0.2833333333333333,"a":-8.121587338275276},{"d":0.11666666666666667,"a":0},{"d":0.4,"a":-8.431019100244157},{"d":1.8499999999999999,"a":-3.082131409295834},{"d":0.3,"a":0},{"d":1.1666666666666667,"a":-2.4019000101834536},{"d":0.23333333333333334,"a":0},{"d":0.4166666666666667,"a":-8.749303458910436}],"endSec":39.71188860392819,"kind":"junction","c0":804,"dur":60,"reps":[[845,9.063739772886038]],"baseClean":[],"ctlBills":1},
  {"seed":5711,"cruise":34.84,"t0":15.85,"segs":[{"d":0.16666666666666666,"a":-9.20148732138332},{"d":0.11666666666666667,"a":0},{"d":0.6333333333333333,"a":-9.509776779846288},{"d":2.0166666666666666,"a":-2.9358630549046207},{"d":0.11666666666666667,"a":0},{"d":0.2833333333333333,"a":-2.965147999767214}],"endSec":44.35446180052435,"kind":"junction","c0":1034,"dur":75,"reps":[[1144,4.833117458038032],[1104,9.831219759769738]],"baseClean":[],"ctlBills":1},
  {"seed":5863,"cruise":42.8,"t0":12.066666666666666,"segs":[{"d":0.21666666666666667,"a":-9.41440209900029},{"d":0.16666666666666666,"a":0},{"d":0.7833333333333333,"a":-8.088326826039701},{"d":2.0166666666666666,"a":-3.7055566908209583},{"d":0.16666666666666666,"a":0},{"d":0.15,"a":-9.377709812647662}],"endSec":39.35707955646018,"kind":"stopline","c0":819,"dur":76,"reps":[[874,9.774140731431544]],"baseClean":[39.233333],"ctlBills":1},
  {"seed":5904,"cruise":32.5,"t0":13.45,"segs":[{"d":0.5333333333333333,"a":-8.794543231395073},{"d":0.8833333333333333,"a":-4.49286700199591},{"d":0.2833333333333333,"a":0}],"endSec":38.288846836518495,"kind":"stopline","c0":865,"dur":75,"reps":[[890,9.880802053026855],[938,5.548205513972789]],"baseClean":[],"ctlBills":1},
  {"seed":6102,"cruise":41.35,"t0":13.383333333333333,"segs":[{"d":0.21666666666666667,"a":-7.626096069719643},{"d":0.05,"a":0},{"d":0.5,"a":-9.932122781686484},{"d":1.35,"a":-3.364911875000689},{"d":0.06666666666666667,"a":0},{"d":0.5833333333333334,"a":-8.324757595779374}],"endSec":39.61053795190528,"kind":"stopline","c0":887,"dur":35,"reps":[[896,7.90104723861441]],"baseClean":[],"ctlBills":1},
  {"seed":6113,"cruise":42.9,"t0":14.916666666666666,"segs":[{"d":0.25,"a":-8.42464953926392},{"d":0.1,"a":0},{"d":0.5,"a":-9.646577902394347},{"d":1.7333333333333334,"a":-2.0686102922540157},{"d":0.18333333333333332,"a":0}],"endSec":43.80889041371023,"kind":"junction","c0":989,"dur":43,"reps":[[992,5.310672115068883],[1054,9.80660540284589]],"baseClean":[40.566667],"ctlBills":1},
  {"seed":6119,"cruise":38.46,"t0":14.65,"segs":[{"d":0.2,"a":-8.288556646672077},{"d":0.08333333333333333,"a":0},{"d":0.7166666666666667,"a":-8.052341796155087},{"d":0.7333333333333333,"a":-4.586026268824934},{"d":0.11666666666666667,"a":0},{"d":0.5,"a":-8.794296891242265}],"endSec":19.07132873055525,"kind":"stopline","c0":973,"dur":16,"reps":[[982,6.572357800789177]],"baseClean":[],"ctlBills":1},
  {"seed":6263,"cruise":34.78,"t0":14,"segs":[{"d":0.6,"a":-9.792947156983427},{"d":1.6,"a":-3.71794999417616},{"d":0.5,"a":0}],"endSec":41.406286946311596,"kind":"wrongway","c0":914,"dur":74,"reps":[[941,8.979959832970053]],"baseClean":[],"ctlBills":1},
  {"seed":6682,"cruise":31.55,"t0":14.666666666666666,"segs":[{"d":0.13333333333333333,"a":-7.282903545512818},{"d":0.08333333333333333,"a":0},{"d":0.6166666666666667,"a":-7.691109034954571},{"d":0.9833333333333333,"a":-2.938626080797985},{"d":0.3833333333333333,"a":0},{"d":1.1666666666666667,"a":-4.255187652714085}],"endSec":43.06173055305456,"kind":"junction","c0":955,"dur":45,"reps":[[961,5.243718401528895]],"baseClean":[],"ctlBills":1},
  {"seed":6723,"cruise":37.67,"t0":12.283333333333333,"segs":[{"d":0.15,"a":-9.835644765291363},{"d":0.1,"a":0},{"d":0.6833333333333333,"a":-9.314465771522373},{"d":1.9,"a":-4.126715369673911},{"d":0.1,"a":0},{"d":0.21666666666666667,"a":-2.975202064332552},{"d":0.5,"a":0},{"d":0.3833333333333333,"a":-4.062330844334792}],"endSec":44.08818592621634,"kind":"stopline","c0":822,"dur":90,"reps":[[822,6.569967276416719],[1030,4.446026481688023]],"baseClean":[42.533333],"ctlBills":1},
  {"seed":6746,"cruise":30.05,"t0":14.283333333333333,"segs":[{"d":0.2,"a":-9.370219898899085},{"d":0.3333333333333333,"a":0},{"d":0.3833333333333333,"a":-9.522365420660936},{"d":1.6166666666666667,"a":-4.179112255515065},{"d":0.2,"a":0}],"endSec":42.49352048855896,"kind":"stopline","c0":945,"dur":64,"reps":[[967,8.915975152980536],[878,6.2128890985623]],"baseClean":[],"ctlBills":1},
  {"seed":7082,"cruise":33.94,"t0":13.75,"segs":[{"d":0.21666666666666667,"a":-7.794941092422232},{"d":0.13333333333333333,"a":0},{"d":0.5333333333333333,"a":-7.780746532604098},{"d":1.8499999999999999,"a":-3.980423754593357},{"d":0.4166666666666667,"a":0},{"d":0.4166666666666667,"a":-10.453613313962705}],"endSec":41.246520264322555,"kind":"wrongway","c0":905,"dur":77,"reps":[[939,6.617687247693539],[1131,7.922402068972588]],"baseClean":[],"ctlBills":1},
  {"seed":7125,"cruise":45.13,"t0":13.95,"segs":[{"d":0.2833333333333333,"a":-9.629215761786327},{"d":0.2,"a":0},{"d":0.4666666666666667,"a":-9.725868582702242},{"d":2.1333333333333333,"a":-3.8182953760260716},{"d":0.5833333333333334,"a":0}],"endSec":42.32649274353559,"kind":"lane","c0":927,"dur":52,"reps":[[980,9.832957099191844]],"baseClean":[40.283333],"ctlBills":1},
  {"seed":7173,"cruise":39.82,"t0":13.65,"segs":[{"d":0.26666666666666666,"a":-9.821996897854842},{"d":0.13333333333333333,"a":0},{"d":0.35,"a":-9.462678963365033},{"d":0.03333333333333333,"a":0},{"d":0.3833333333333333,"a":-7.950329034472816},{"d":1.6,"a":-3.6812340368400323},{"d":0.15,"a":0},{"d":0.31666666666666665,"a":-7.50970718075987}],"endSec":45.72562706985821,"kind":"stopline","c0":914,"dur":65,"reps":[[1052,9.7644242211245],[936,4.073492736555636]],"baseClean":[41.983333],"ctlBills":1},
  {"seed":7247,"cruise":38.82,"t0":13.15,"segs":[{"d":0.13333333333333333,"a":-10.408954117703251},{"d":0.18333333333333332,"a":0},{"d":0.65,"a":-10.438575228536502},{"d":1.4666666666666666,"a":-2.2799689467065036},{"d":0.23333333333333334,"a":0}],"endSec":40.34544889700288,"kind":"lane","c0":900,"dur":33,"reps":[[913,7.15188796306029]],"baseClean":[],"ctlBills":1},
  {"seed":7276,"cruise":41.7,"t0":15.433333333333334,"segs":[{"d":0.2,"a":-10.27402447743807},{"d":0.15,"a":0},{"d":0.6666666666666666,"a":-10.25585981758777},{"d":1.25,"a":-2.379899963759817},{"d":0.1,"a":0},{"d":0.6,"a":-9.440043315757066}],"endSec":18.6667901951354,"kind":"lane","c0":1032,"dur":61,"reps":[[1039,7.124172877520323]],"baseClean":[],"ctlBills":1},
  {"seed":7294,"cruise":34.31,"t0":13.25,"segs":[{"d":0.6333333333333333,"a":-10.303698962624185},{"d":1.9833333333333334,"a":-4.3121902464772575},{"d":0.06666666666666667,"a":0}],"endSec":42.7516747668696,"kind":"lane","c0":865,"dur":59,"reps":[[885,8.523716569878161]],"baseClean":[],"ctlBills":1},
  {"seed":7436,"cruise":32.58,"t0":14.85,"segs":[{"d":0.23333333333333334,"a":-7.444111511763185},{"d":0.16666666666666666,"a":0},{"d":0.45,"a":-8.539204698381946},{"d":1.8166666666666667,"a":-3.282118577812798},{"d":0.43333333333333335,"a":0},{"d":0.15,"a":-8.564991035568529}],"endSec":20.61189739117399,"kind":"junction","c0":973,"dur":77,"reps":[[993,6.616843903902918]],"baseClean":[],"ctlBills":1},
  {"seed":7538,"cruise":54.12,"t0":13.966666666666667,"segs":[{"d":0.36666666666666664,"a":-9.705193922203033},{"d":0.05,"a":0},{"d":0.36666666666666664,"a":-8.369205602724104},{"d":0.25,"a":0},{"d":0.3833333333333333,"a":-8.76488923940342},{"d":1.5333333333333332,"a":-3.9672517904895352},{"d":0.5166666666666666,"a":0},{"d":0.8833333333333333,"a":-3.436168595799245}],"endSec":38.552906637794024,"kind":"lane","c0":974,"dur":77,"reps":[[975,9.009989733342081]],"baseClean":[38.316667],"ctlBills":1},
  {"seed":7726,"cruise":34.58,"t0":12.2,"segs":[{"d":0.7166666666666667,"a":-9.625427519646474},{"d":2.0833333333333335,"a":-2.399837262369692},{"d":0.06666666666666667,"a":0},{"d":0.48333333333333334,"a":-4.158960950607433},{"d":0.13333333333333333,"a":0},{"d":0.2,"a":-8.931609358638525}],"endSec":18.000849351783593,"kind":"junction","c0":818,"dur":73,"reps":[[818,6.012107791379094]],"baseClean":[],"ctlBills":1},
  {"seed":7750,"cruise":38.57,"t0":15.299999999999999,"segs":[{"d":0.25,"a":-9.319827233604155},{"d":0.05,"a":0},{"d":0.48333333333333334,"a":-8.445743265305646},{"d":1.4666666666666666,"a":-4.161894931108691},{"d":0.2,"a":0}],"endSec":47.58399942982942,"kind":"wrongway","c0":1000,"dur":41,"reps":[[1027,6.752554918173701]],"baseClean":[43.416667],"ctlBills":1},
  {"seed":9067,"cruise":38.89,"t0":13.2,"segs":[{"d":0.3,"a":-9.529797615855932},{"d":0.15,"a":0},{"d":0.6,"a":-8.824813994625583},{"d":1.45,"a":-3.8212763706920665},{"d":0.36666666666666664,"a":0}],"endSec":39.295978278170026,"kind":"lane","c0":889,"dur":41,"reps":[[929,7.960482549853623]],"baseClean":[],"ctlBills":1},
  {"seed":9310,"cruise":34.91,"t0":14.799999999999999,"segs":[{"d":0.43333333333333335,"a":-9.480572879011742},{"d":0.7666666666666666,"a":-3.059933648793958},{"d":0.08333333333333333,"a":0},{"d":0.3333333333333333,"a":-2.9253175579593513}],"endSec":37.37228153568382,"kind":"wrongway","c0":949,"dur":73,"reps":[[949,6.208540803287178]],"baseClean":[],"ctlBills":1},
  {"seed":9489,"cruise":40.45,"t0":15.183333333333334,"segs":[{"d":0.23333333333333334,"a":-10.071827052743174},{"d":0.1,"a":0},{"d":0.5666666666666667,"a":-10.05884876770433},{"d":1.3,"a":-4.130333218479063},{"d":0.18333333333333332,"a":0},{"d":0.8333333333333334,"a":-3.4192693790420887}],"endSec":42.932129638828336,"kind":"wrongway","c0":1002,"dur":27,"reps":[[1130,7.9475217750296],[1021,7.519350290764123]],"baseClean":[],"ctlBills":1},
  {"seed":9567,"cruise":42.9,"t0":12.75,"segs":[{"d":0.21666666666666667,"a":-9.776952755777165},{"d":0.06666666666666667,"a":0},{"d":0.5166666666666666,"a":-8.129070440679788},{"d":1.55,"a":-4.188075861125252},{"d":0.5333333333333333,"a":0},{"d":0.48333333333333334,"a":-2.2425745399319563}],"endSec":17.63980230220283,"kind":"lane","c0":856,"dur":1,"reps":[[936,7.15431299014017],[884,7.452275310643017]],"baseClean":[],"ctlBills":1},
  {"seed":9682,"cruise":35.03,"t0":13.016666666666666,"segs":[{"d":0.2,"a":-10.314500176138244},{"d":0.16666666666666666,"a":-5.452279087621719},{"d":0.2833333333333333,"a":-9.189573035901413},{"d":1.35,"a":-4.478089876961894},{"d":0.03333333333333333,"a":0},{"d":0.5666666666666667,"a":-8.24606394341681}],"endSec":38.37153839782501,"kind":"stopline","c0":858,"dur":7,"reps":[[905,7.386738962959498]],"baseClean":[],"ctlBills":1},
  {"seed":9711,"cruise":30.7,"t0":12.45,"segs":[{"d":0.6333333333333333,"a":-8.500236259843224},{"d":0.9166666666666666,"a":-3.6339486076263707},{"d":0.35,"a":0},{"d":0.55,"a":-2.5971391986939123}],"endSec":40.796474267356096,"kind":"lane","c0":821,"dur":57,"reps":[[877,8.891864939592779],[956,9.12757671205327]],"baseClean":[],"ctlBills":1},
  {"seed":9845,"cruise":36.26,"t0":15.883333333333333,"segs":[{"d":0.26666666666666666,"a":-8.436564987245948},{"d":0.15,"a":0},{"d":0.65,"a":-8.78824581534136},{"d":1.9666666666666666,"a":-3.264335617539473},{"d":0.43333333333333335,"a":0}],"endSec":46.17551749516279,"kind":"stopline","c0":1042,"dur":15,"reps":[[1095,7.071962685789913],[1188,6.896210798993707]],"baseClean":[],"ctlBills":1},
  {"seed":9968,"cruise":34.42,"t0":12.15,"segs":[{"d":0.4,"a":-10.30753047389444},{"d":1.7333333333333334,"a":-3.056970150407869},{"d":0.1,"a":0},{"d":0.5666666666666667,"a":-9.391447134967894}],"endSec":38.804791305493566,"kind":"stopline","c0":790,"dur":36,"reps":[[809,5.978459075558931],[985,4.902786176186055]],"baseClean":[],"ctlBills":1},
];

describe("Q10e's limit in the fuzz: the late-folded floor dropped by the control's floor-lift report — no record, nothing billed, BASE's praise", () => {
  it(`${LIMIT_CELLS.length} cells`, () => {
    for (const c of LIMIT_CELLS) {
      const label = `seed ${c.seed}`;
      const r = run(tape({ ...c, forms: [], bills: 0 }, true));
      const k = run(tape({ ...c, forms: [], bills: 0 }, false));
      expect(k.violations.filter((v) => v.startsWith("HARSH")).length, `${label}: the control is billed`).toBe(c.ctlBills);
      expect(c.ctlBills, label).toBeGreaterThan(0);
      expect(r.violations.filter((v) => v.startsWith("HARSH")), `${label}: nothing billed (as base)`).toEqual([]);
      expect(r.records, `${label}: the control's record (none)`).toEqual(k.records);
      expect(r.records, label).toEqual([]);
      expect(r.clean.map((x) => +x.toFixed(6)), `${label}: base's praise`).toEqual(c.baseClean);
    }
  });
});

/**
 * The OPEN drop's praise (round 7, Q10e on a held fold): a single floored
 * application from 34 км/ч, a gentle tail long enough that its no-cause
 * control keeps marking floored frames after a late junction, and a close
 * follower's report 2–30 grid points after the fold — the control bills it, so
 * this drive drops the folded floor while the chain is still OPEN. Nothing is
 * billed and nothing named, and the praise is BASE's (the base 230c7b8
 * reducer's CLEAN_DRIVING on the same ticks, measured on this lane and written
 * out): Q7's restore runs once at the drop, and a floored mark the folded
 * window made on the drop frame itself goes with the floor.
 */
const OPEN_DROP: Array<{ T2: number; aT: number; cs: number; d: number; t0: number; baseClean: number[] }> = [
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":2,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":2,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":6,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":6,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":12,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":12,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":20,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":20,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":30,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.42,"d":30,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":2,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":2,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":6,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":6,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":12,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":12,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":20,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":20,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":30,"t0":12.7,"baseClean":[43.65]},
  {"T2":0.6,"aT":-5.5,"cs":0.45,"d":30,"t0":12.75,"baseClean":[43.7]},
  {"T2":0.6,"aT":-5.5,"cs":0.5,"d":2,"t0":12.7,"baseClean":[43.666667]},
  {"T2":0.6,"aT":-5.5,"cs":0.5,"d":2,"t0":12.75,"baseClean":[43.716667]},
];
describe("Q10e on a held fold: the open drop leaves BASE's praise", () => {
  it(`${OPEN_DROP.length} cells`, () => {
    for (const c of OPEN_DROP) {
      const label = `T2 ${c.T2} aT ${c.aT} cs ${c.cs} d ${c.d} t0 ${c.t0}`;
      const o = { cruise: 34, b1: 0, g: 0, T2: c.T2, aT: c.aT, tail: 1.2, cs: c.cs, cd: 0.08, R: 0.6, a2: 0, P: 0, t0: c.t0, kind: "junction" as const };
      const ri = Math.round((o.t0 + c.T2 + c.cs) / H) + c.d;
      const withReport = (t: SimTick[]) => t.map((k, i) => (i === ri ? { ...k, events: [...(k.events ?? []), report(10)] } : k));
      const r = run(withReport(splitTape(o, true)));
      const k = run(withReport(splitTape(o, false)));
      expect(k.violations.filter((v) => v.startsWith("HARSH")).length, `${label}: the control is billed`).toBe(1);
      expect(r.violations, label).toEqual([]);
      expect(r.records, label).toEqual([]);
      expect(r.clean.map((x) => +x.toFixed(6)), `${label}: base's praise`).toEqual(c.baseClean);
    }
  });
});
