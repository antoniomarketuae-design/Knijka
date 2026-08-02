# 89 — What I missed: the fourth revision, read by me, not by agents

> The founder asked a fourth time whether anything is missing, and told me to use my own eyes rather
> than send agents. I did. **He was right again, and the biggest miss is not in the text at all.**

---

## 0. The headline: there is a folder of his instructions I never opened

`C:\Users\Ljh\Desktop\For fix\` — **sixteen images, dated 29 July**, the day of the review. It
contains:

| file | what it is |
|---|---|
| `Look where I put the lines and i guess there should be eveyrthing.jpg` | **He drew on a screenshot.** Two thick arcs sweeping from the bottom corners up the left and right edges. His layout instruction, in his own hand. |
| `How it should look like.jpg` | The Gran Turismo chase view he named explicitly in the mobile brief. |
| `Cockpit should look like.jpg` | The Gran Turismo cockpit view. **I did not know this one existed.** |
| 13 × `photo_2026-07-29_*.jpg` | The review screenshots he referred to as "12 screenshots". |

**Three waves ran off his text while his pictures sat unopened.** Doc 87 has 107 rows and not one of
them came from an image. That is the miss that produced the others below.

*(Checked and clear: `150 verdict.txt` is byte-identical to `150 verdict hand written most
important.txt` — same md5. No missing text.)*

---

## 1. The design target is NO PANELS — not "more road"

Both reference images share one property and it is not the coverage number.

**In Gran Turismo the HUD is naked text and thin outlines directly on the image.** Tyre temps, ABS,
ECU, TC, fuel, lap times, the leaderboard — none of it sits on a card. "Brake" and "Throttle" are
*barely-visible grey words* at the right edge. The minimap is a faint line drawing. Nothing is
filled, nothing is blurred, nothing has a border radius.

**Ours is rounded filled cards** — task banner, teach card, violation card, tier pills, the transport
deck, the control pads. Every one is an opaque or semi-opaque box.

**Why this matters and why the metric hid it:** the mobile harness charges "any pixel a control
paints on" as chrome, so we drove that number 68.3% → 6.1%. That is real work and it is not wrong.
But **a 6% chrome screen made of solid cards still reads as a web page over a road, and a 15% chrome
screen made of floating text reads as a game.** The reference would probably score *worse* on our
metric than our current build, and still look like the thing he wants.

We optimised area. He was asking about **fill**.

## 2. The controls belong on his two arcs, and they should be ghosts

The annotated screenshot puts everything along a curve hugging the left and right edges — the
thumb's natural sweep. The current build put two pads in the bottom corners, which is closer than
the old layout but is not the arc, and the pads are solid.

In the reference, the throttle and brake zones are **labelled areas of near-nothing**. You can see
the road through them.

## 3. Cards overflow the phone and clip their own text — a correctness bug, not a size complaint

`photo_2026-07-29_08-22-13 (2).jpg`: the violation card is **wider than the viewport**. Both edges
are cut off mid-word — «...АСНА ГРЕШКА», «ътнотранспортно произшествие», «астъпи сблъсък». The teach
card behind it is clipped the same way: «...аркираната», «Воята лента», «ругите и оставяй...езопа».

**A student cannot read the rule they just broke.** This is worse than the popup being big; the
content is destroyed. No row in doc 87 covers horizontal overflow — every row is about *coverage*.

## 4. No rear-view mirror in the CHASE view — verified in code

His sentence: *"I drive from the back of the car POV and I dont see Rear Mirror at all … we must put
Rear Mirror some small window in the POV **after pressing C** that the user look from outisde behind
of the car."* C is the camera toggle.

`MirrorRig.tsx:41` — *"Passes only run at all while the cockpit camera is live (`active`)."*

The mirror, **including the Q/E windows just built**, exists only in the cockpit. Rows B74 and B76
were both closed on cockpit frames. **The view he was actually complaining about still has no
mirror.**

*(The other half of that sentence IS satisfied: `PlayAreaStyles.tsx:206` keeps the DOM speed readout
in chase and top-down precisely because the 3D cluster is not in frame there. His "small Dashboard
window" exists.)*

## 5. Four platform-level rework demands were never tracked as rows

Doc 87 atomised his *symptoms*. These are his *instructions*, and each is broader than any row:

- *"Most of the things I state below must be reworked for the whole platform engine"* — his thesis.
- *"We should Re-work the whole Engine with the Buttons"* — the control scheme as a whole.
- *"we need major reworks on all 150 L5-L4-L3-L2s"* — **all 150**, not the ones he played. B2 and
  B19 are scoped to what he saw.
- *"The whole engineering must be reworked for the traffic lights questions aswell"* — every signal
  lesson, not the five he hit.

## 6. Content specifics from `rephrased.txt` that never became work items

The restatement carries detail the handwritten note compresses:

- **School zone:** school buses, parents waiting outside, increased pedestrian activity — we built
  the school and the children only.
- **Crossings:** "two pedestrians crossing together, a family, a group of children, pedestrians
  entering from opposite sides" — we added one companion.
- **The queue lesson:** changing traffic flow, vehicles braking unexpectedly, lane changes, merging
  traffic, temporary hazards.
- **The truck lesson:** partially obstructed visibility, pedestrians emerging from behind the truck,
  other vehicles overtaking.

---

## 6b. Second full read of the handwritten file — three more, and the first is large

He asked me to open it again and read every word. I did. Almost every sentence already maps to a
doc-87 row. These three do not, and I had under-weighted all of them.

### N1 — HIS ENTIRE REVIEW IS OF L1. Every rung above it is unreviewed.

Line 214, in passing, at the end of a sentence about something else:

> *"we need major reworks on all 150 L5-L4-L3-L2s **currently i`m reviewing L1s**"*

**Everything in doc 87 — all 107 rows, all fifty lessons — is L1.** He has never seen L2, L3, L4 or
L5 on any scenario except the two he spot-checked (question 6 and question 7). That means:

**Measured rather than estimated** — rung declarations across all 37 template files:

| rung | authored |
|---|---|
| L1 | 166 |
| L2 | 166 |
| L3 | 166 |
| L4 | 161 |
| L5 | 74 |
| **total** | **733** |

**He has reviewed 166 of 733 — 22.6%. Five hundred and sixty-seven rung-instances, 77.4% of the
product, have never been looked at by anyone outside the build.**

- That is **no human review at all** on more than three quarters of what a student can open.
- Doc 87 treats the level ladder as three rows (A8, B2, B19). It is not three rows. It is four
  fifths of the catalog.
- The gate already knows the shape of the problem and nobody connected it to this sentence: **105 of
  154 scenarios have no rung delta of any kind**, and **106 have no L5 authored**. So for most of the
  catalog, "reviewing L2" would mean reviewing a byte-identical copy of L1.

This reframes B2 from "the ladder feels thin" to **"the product is four fifths unreviewed, and most
of that four fifths is a duplicate of the fifth he did review."** It belongs in the plan as its own
programme, not as a row.

### N2 — He states outright that his list is INCOMPLETE

Line 2:

> *"there are tons of Map issues, Question Issues, Map Engineering Issues and **I can`t name them all
> at the moment** 50+ issues"*

Doc 87 has been treated as the acceptance set. **He says it is a sample.** Doc 86's 58 causes were
the right instinct — finding what he could not name — and that instinct should not stop because the
register exists.

### N3 — The reason he wants the buttons reworked, which I never decoded

Line 165:

> *"We should Re-work the whole Engine with the Buttons, **because we read on left**"*

"We read on left" is the „Клавиши" key legend down the left edge. His objection is not that the
keys are wrong — it is that **the interface makes you read a list of keys instead of showing you the
control.** That is the same complaint as the 13-step pre-drive and the clickable dashboard, and it is
why all three of those rows are really one requirement: *stop teaching the keyboard, show the car.*

Two smaller notes from the same read, both already respected but worth recording:

- Line 336 — on adding a cause to the sudden-braking drill, he warns **check it does not duplicate an
  existing lesson first**. B64's brief carries this.
- Lines 309, 329, 333 — he repeatedly writes *"you must find solutions"* / *"find some solutions"*.
  He is asking for proposals where the fix is not obvious, not just a defect report.

---

## 7. What this changes about how we finish

The coverage metric stays — it caught real defects and it is honest about what it measures. But it
is **not the acceptance test for how the screen looks**, and treating it as one is how we reported a
93.9% success against a reference we had never opened.

The acceptance test is his two images. The work is:

1. **Un-panel the HUD.** Text and hairlines over the image; no fills, no blur, no radius, on the
   driving screen. Contrast comes from a text shadow, the way the reference does it.
2. **Ghost the controls** and move them onto his arcs.
3. **Fix horizontal overflow** so no card can ever clip its own text on a 393 px viewport.
4. **Mirror in the chase view.**
5. Then re-shoot against `How it should look like.jpg` and `Cockpit should look like.jpg`
   side by side — and the person who does it must open both images first.
