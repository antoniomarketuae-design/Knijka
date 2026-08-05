import { SCENARIO_TEMPLATES } from "../src/modules/sim/lessons/scenario/templates";
SCENARIO_TEMPLATES.forEach((t: any, i: number) => {
  const n = i + 1;
  if ([10, 17, 42, 45, 50, 51].includes(n)) console.log(n, t.id, "|", t.titleBg, "| district:", t.districtId ?? t.district ?? "?");
});
