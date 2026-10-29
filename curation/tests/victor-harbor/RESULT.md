# Victor Harbor photo test: standard Lens vs Google Images (Apify), 10 spots with no photo

Eligible after a final check by eye (same standard both arms):
- Lens (gather script → judge → Haiku searcher → judge): 7 spots — Hindmarsh Falls, Nakurami Kondoli Whale Lookout, National Trust Museum, Glacier Rock, Hindmarsh River Walking Trail, Inman River Trail, Softfoot Alpaca Farm. The gather-script stage alone found 0; all 7 came from the searcher (fleurieupeninsula.com.au listings).
- Google Images (one Apify run → script filter → judge): the same 7 spots.
- Neither: Port Elliot (only Horseshoe Bay photos), Middleton, Urimbirra (both picks rejected: a kangaroo mob / a family fill the frame).

Photos: 1 of 7 picks is the same photo in both arms (Hindmarsh River Walking Trail). Of the 6 others, Lens's pick was also in Google's results for 2 (museum, Glacier Rock) and Google's pick was in Lens's candidates for 1 (whale lookout).

Cost: Lens 286,753 sub-agent tokens (judge 59k, searcher 163k, judge 64k), about 18 minutes; Openverse timed out on every query. Google Images 88,563 sub-agent tokens (one judge) plus about $0.05 of Apify, about 2 minutes.
