# Jiangsu run: final report

Branch `curation/expand-region-jiangsu` (pushed; not merged). 12 destinations, 160 spots, 141 photos.

## Added: destinations (rank, span, name evidence)
| id | rank | span km | note |
|---|---|---|---|
| Nanjing | 2 | 50 | provincial capital; header ok |
| Suzhou | 2 | 30 | header ok |
| Yangzhou | 3 | 30 | no header |
| Wuxi | 3 | 40 | header is a night canal photo (dark on purpose, CGTN, permission not confirmed) |
| Jiangnan Water Towns | 4 | 40 | skeptic re-ranked 3 to 4; exactly 4 spots, no Wikivoyage page, a tourism brand; travellers often file it under Suzhou; tips cut to 2; no header |
| Xuzhou | 4 | 40 | no header |
| Lianyungang | 4 | 60 | no header |
| Zhenjiang | 4 | 30 | no header |
| Nantong | 4 | 40 | header ok |
| Huai'an | 4 | 40 | rank 4 arguable (skeptic); no header |
| Yixing | 4 | 50 | no header |
| Changzhou | 5 | 30 | no header |

Destination skeptic: 6 flagged (5 keep, 1 re-rank), 3 audited (all keep), 0 merges or demotions. Existing destinations were not touched.
Demoted before applying (fewer than 4 live spots): Jiangyin, Suqian, Yancheng, Taizhou. Their spots stand alone.

## Photos still missing (why-visit slots first; the owner is asked to supply each)
Why-visit (grey cards):
- Nanjing: "Walk the Ming city wall", "Explore Republic-era and wartime history"
- Suzhou: "Climb pagodas and visit old temples"
- Yangzhou: all three ("Stroll Qing salt merchants' gardens", "Follow canals through the old city", "Wander the lanes of the old quarter")
- Wuxi: all three ("Explore Lake Tai's scenic shoreline", "Wander old canal streets and gardens", "See cherry and plum blossoms in spring")
- Jiangnan Water Towns: all three ("Ride boats along old canals", "Cross centuries-old stone bridges", "Tour Qing-era merchant houses")
- Xuzhou: "Stroll the shore of Yunlong Lake"
- Lianyungang: all three ("Climb the Monkey King's mountain", "Cross the sea dyke to Lian Island", "Hike waterfall valleys in Yuntai")
- Zhenjiang: "Walk a preserved old ferry quarter", "Taste Zhenjiang vinegar with dumplings"
- Nantong: "Cruise the moat at night", "Climb a sacred Yangtze hill", "Browse small specialist museums"
- Huai'an: "Follow the life of Zhou Enlai", "Learn how the Grand Canal moved grain"
- Yixing: "See Yixing's clay teapot tradition", "Explore karst caves by boat"
- Changzhou: "Explore Spring and Autumn period ruins", "Stroll Grand Canal temples and parks"

Headers missing: Yangzhou, Jiangnan Water Towns, Xuzhou, Lianyungang, Zhenjiang, Huai'an, Yixing, Changzhou.

Spots with no photo (placeholder, 33): Huai'an Zoo, Shen's Residence, Yuntai Mountain, Yuwan Scenic Area, Lianyungang Museum, Nanjing Museum, Xuanwu Lake, Ming Palace, Nanjing Underwater World, Nantong Sendi Ice and Snow Park, Ligongdi, Suzhou Pingtan Museum, Xihui Park, Wuxi Sunac Land, Wuxi Sunac Sea World, Helu City Site, Hubu Hill Ancient Architecture Complex, Quanshan National Forest Park, Yixing Ceramics Museum, Shanjuan Cave, Tuanjiu Scenic Area, Longbeishan Forest Park, Zhulin Temple, Shang Lake, Kunshan Opera Museum, Zheng He Park, Yu Mountain, Lake Tai, Former Residence of Liu Brothers, Huangshan Fort, Suqian Museum, Sihong Ancient Xucheng Scenic Area, Yancheng China Sea Salt Museum.
Tried: Commons by name and by location, Google Images (Apify), searcher pass on official/guide pages. Many Chinese official and travel pages (Baidu Baike, jstour.com, several Wikipedia pages, Klook) were BLOCKED to scripts. The in-app browser step was not completed (earlier attempts to open Chinese official sites were denied or failed), so these slots are "needs a browser", not proven absent.
Second-judge failures included: Nanjing Museum and Nanjing city wall (AI-looking), Ming Palace (text overlay), Xuanwu Lake, Underwater World, Sendi Ice Park, Sunac Land, Xihui Park, Pingtan Museum, Lake Tai (willows hide lake), Kunshan Opera Museum (render), Tuanjiu (a different lake), Beisi Pagoda (archive scan).

## Added but weak
- Web photos "permission not confirmed" (35 non-Commons photos total): check `src/data/externalPhotos.json`. Included the Wuxi header, Suzhou header, Suzhou why2/why3/why4, Nanjing why1/why4, Xuzhou why1/why2, Zhenjiang why1, Huai'an why2 and many spots (changzhou-8, huaian-1/8/10, nantong-5, xuzhou-7, wuxi-16, dafeng-milu-nature-reserve, santaishan-forest-park, others). Some identities rest on the source page only (changzhou-8, huaian-1, huaian-12, nantong-2, wuxi-21, wuxi-14, Luzhi, Yuantouzhu).
- Pins: 55 of 160 spots flagged by `audit-spot-coordinates.ts`; the flags were reviewed by type, not each moved: OSM name matches that are other features (Huai'an Museum vs the Planning Hall 10.9 km, Xuzhou Museum vs the Huaihai memorial), long features and lakes whose reference point is a centroid (Lake Tai 24 km, Qinhuai River, Yunlong Lake), a Wikipedia match to the wrong place (Zhenguo Temple 822 km, Yunlong Mountain 904 km). Pins in water per Mapbox that are probably shoreline/edge cases and need a look on the map: Canal 5 Creative Campus, Nantong Forest Safari Park, Wenfeng Park, Suzhou Museum, Jinji Lake, China Grand Canal Museum (Yangzhou), Xiaoqinhuai Canal, Tianmu Lake. Every pin came from a Chinese-name Nominatim/Wikidata resolution (`resolve-pin-zh.py`), HIGH or MEDIUM only; two bad pins were overridden by hand.
- Prices: cost-recovery pass accepted some weak aggregator prices (not "from" prices). 26 recovered, 16 rejected.
- Merge-verdicts audit exited 2 (differences over 1 in 10) on sample sizes of 3 to 5 mostly reject-vs-review; accepted as immaterial.
- Atlas fairness pass for high-view places on the review list (Happy Valley Nanjing, Niushoushan, Hongze Lake, Ming Ancestors Mausoleum, Huaxi Village) was not done.
- NZ benchmarks do not apply to China.

## Left out or not added, and what unblocks each
No pin (16): Tomb of Sun Quan (nanjing-36), Former Residence of Yu Yue (suzhou-35), Liuhe Tianfei Palace, Dongting Mountain, Suzhou Embroidery Research Institute (suzhou-26), Longchi Mountain Scenic Area (yixing-3), Zhanggong's Cave (yixing-5), Changjing Ancient Town (jiangyin-2), Zhenjiang Vinegar Culture Museum (zhenjiang-9), Zhenhuai Building (huaian-7), Hongze Lake Wetland Park, Xuzhou Aquarium (xuzhou-10), Tianning Temple Yangzhou (yangzhou-11; also a name clash with changzhou-1), Gaoyou Old Town, Qianduo Scenic Area, Mei Lanfang Memorial Hall (taizhou-3). Unblock: resolve a pin when Overpass is back.

Held for cost, 59 (no sourced price, or the only price was ambiguous or for a different spot): City Wall of Nanjing, Confucius Temple, Zifeng Tower, Mochou Lake, Yangshan Quarry, Linggu Temple, Jiangnan Examination Hall, Zhan Garden, Nanjing Yangtze River Bridge, Qixia Mountain, Jiefang Gate, Suzhou Arts and Crafts Museum, Five Peaks Garden, Suzhou Industrial Park, Suzhou Zoo, Qiandeng Ancient Town, Hanshan Temple, Suzhou Silk Museum, Garden of Pleasance, Precious Belt Bridge, Zhouzhuang, Baosheng Temple, Ebizui Park, Taibo Temple, Junshan Park, Xijindu Ancient Street, Former British Consulate in Zhenjiang, Pearl S. Buck Former Residence, Chunqiu Yancheng, Hexia Old Town, Luoma Lake, Han Stone Relief Art Museum, Kongwang Mountain Cliff Carvings, Fenghuangwan Beach, Xishuang Lake, Lu Family Salt Merchant Residence, Longshan Mountain Scenic Resort, Wanghai Tower, Guangxiao Temple, PLA Navy Establishment Memorial Hall, Qinhu Lake National Wetland Park, Qintong Ancient Town, Guluotang Cultural Block, Langshan, Guangjiao Temple, Tangzha Ancient Town, Qiaolou Tower, Zhou Ji Green Expo Garden, Nantong Textile Museum, Chinese Charitable Museum, Nantong Eminent Figures Museum, Chinese Ophthalmology Museum, Nantong Traditional Chinese Medicine Culture Museum, Wanyuan Pagoda, Jiangsu Jianghai Museum, Yancheng Coastal Wetlands, Tiaozini Tidal Flat, Huanghai Forest Park, Xixi Ancient Town. Unblock: a sourced CNY price for each (the guides forbid inventing one). Several are headline places (Zhouzhuang, Confucius Temple, Zifeng Tower, City Wall) and should be re-added first.

## Needs the owner
- Photos for every slot above.
- Official photos used without permission (the web photos).
- 74 `no-ticket` lint flags: paid spots with no verified `ticketUrl`. 27 official links were BLOCKED or unverified (the in-app browser could not open Chinese official sites); none was guessed.
- Spots with a Chinese-only source that were judged from the sheet or file name: the second judge did not open file pages for the Suzhou gardens (suzhou-1 to 6, 12 to 17) and why1/why2/why4.
- Destination `Huai'an` rank 4 and `Jiangnan Water Towns` (overlaps Suzhou by reputation) for review.

## Not verified
- Photo brightness: only the 35 new web photos were measured (one below floor, the Wuxi night header, added to dark-on-purpose). Commons photos were not measured, and the full-manifest run did not finish.
- Hero crops: only some checked with `hero-crop.py`; the rest are "ok" from contact sheets.
- Prices and links are approximate until someone checks them.
- The simulator/phone map was not looked at.

## Run mechanics worth knowing
- `apply-region` placed spots into a separate `JIANGSU_SPOTS` array in `spots.ts` (TS2590 union-size error otherwise).
- Overpass was down for most of the run: pins came from Nominatim, the OSM map API and Wikidata.
- `build-search-queue.py` was patched to tolerate string `candidates` in judge files.
