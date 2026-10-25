# ACT run: brief for each spot photo group (Lens, first pass)

Repo root: /Users/alexzhou/Developer/mobile-wellington. Read .claude/routines/jobs/job-first.md and the roles it names
(.claude/agents/image-searcher.md and image-judge.md), and IMAGES.md in full (the four checks, spot photos, "No two spots share
a photo or subject", brightness, crop, "When Commons has no suitable photo"). Your group is the task.json in your folder under
curation/act/lens-spots/act-canberra/<group>/ . Only `confirm` and `search` slots need you (`proven` and `skip` are done).
Write candidates.json and judge-1.json in your folder as the job says (per slot {candidates, choice: '<file>'|'keep-current'|'none: why',
hero_crop: 'ok'|{x,y,zoom?}|'fail: why'}).

Run-specific points:
- The `confirm` slots' current photo is the spot's default Wikipedia lead image: judge the image itself on the four checks, not
  its file name; keep it (`keep-current`) only if it shows THE SPOT'S OWN subject, crops well in a square, is a current colour
  photograph and bright enough. A lead image that is a map, plan, logo, historic photo, an interior when visitors come for the
  exterior, a different place with a similar name (Hall, Tharwa, Black Mountain, Red Hill, Mount Taylor, Mount Majura, Oakey
  Hill, Weston Park are shared names), or the larger place's photo, is rejected and searched.
- Many ACT spots sit close together (Canberra's institutions, the lake's shores, Anzac Parade, the hills): no two spots may share
  a photo or a subject. A park or reserve's photo is not its summit lookout's when both are spots (Mount Ainslie and its
  reserve are one spot here; Black Mountain and Red Hill likewise). Check the neighbours listed in the same task.
- Never put a personal email or contact detail in a request header or file. Fetch with `npx tsx scripts/curation/fetch.ts`.
- Commons first, then openly licensed (Openverse), then official/tourism photos (record the owner and the copyright risk). A
  blocked official page goes under `needs_browser` with its URL: the run reads those in a browser. A spot with no passing photo
  in any tier is `none: <why>` (NO_PHOTO placeholder), never a nearby or stand-in image.
- Photos must be >= 960 px wide (>= 1280 where possible), current, colour, not dominated by people or animals, bright enough.
Final message: the slots where you chose a NEW file (these, and only these, go to the second judge), the slots you rejected
with the failed check, one line per other slot, and every needs_browser item.
