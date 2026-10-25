# Sources read in the in-app browser (blocked to scripts)

- australiassouthwest-listings.tsv: Australia's South West (the regional tourism board for the South West and Great
  Southern), every listing of an attraction, culture, gallery, trail, brewery, winery, agritourism or self-drive type
  (accommodation-only listings dropped), read 2026-10-22 from the site's own listings API
  (/wp-json/wp/v2/listings) because every page answers scripts with 403. Columns: name, (destination, empty), URL.
  A listing here is a counted source (regional tourism board), but many are operators, tours, shops or
  restaurants: the usual "What qualifies" tests still apply.
