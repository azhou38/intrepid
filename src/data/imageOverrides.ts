// Hand-picked Wikimedia Commons photos for places where the default lookup (the lead image of the
// place's Wikipedia article, see fetchWikiThumbnail) returns something unsuitable: a map, flag,
// logo, collage, satellite view, an unrelated article's image, or nothing at all. Keyed by the
// exact title the app looks the place up by (a destination's or spot's name), value is the
// Commons file name without the "File:" prefix. Each was chosen as a single, clearly identifiable
// photograph of the place.
export const WIKI_IMAGE_OVERRIDES: Record<string, string> = {
  "Rovaniemi": "Santa Claus Village (5306867729).jpg",
  "Golden Circle": "Gullfoss, Suðurland, Islandia, 2014-08-16, DD 123.JPG",
  "Mykonos": "Windmills of the Mykonos Island, Chora. Cyclades, Agean Sea, Greece.jpg",
  "Santorini": "SantoriniPartialPano.jpg",
  "Great Barrier Reef": "Amazing Great Barrier Reef 1.jpg",
  "Stockholm": "Stockholm-Gamla-Stan-panorama.jpg",
  "Norwegian Fjords": "Geirangerfjord from Ørnesvingen, 2013 June.jpg",
  "Madrid": "Plaza Mayor de Madrid - 01.jpg",
  "Yavapai Point": "Grand Canyon Powell Point Evening Light 2013.jpg",
  "Vatican": "Vatican Aerial View.jpg",
  "Van Gogh Museum": "Van Gogh Museum, Kurokawa wing.jpg",
  "Akrotiri": "Akrotiri Archaeological Site in Santorini by Joy of Museums.jpg",
  "Red Beach": "Red Beach in Santorini.jpg",
  "St. Mark's Square": "Panorama Piazza San Marco and Venice on Easter 2013.jpg",
  "Grand Canal": "Rialto Gondoliers.jpg",
  "Les Halles Paul Bocuse": "Les Halles de Lyon Paul Bocuse 20250927.jpg",
  "Mykonos Town (Chora)": "Mykonos Harbor, Mykonos, Greece (53500970836).jpg",
  "Little Venice": "Little Venice with a view of the ferry terminal in Mykonos, Greece - 50661522178.jpg",
  "Ribeira Quarter": "Ribeira Waterfront and Porto Cathedral from Across the Douro River, Porto, Portugal (54839755986).jpg",
  "Old Town (Altstadt)": "Zürich view Quaibrücke 20200702.jpg",
  "Kunsthistorisches Museum": "Naturhistorisches MuseumWien.jpg",
  "Trinity College": "Front Square of Trinity College Dublin.jpg",
  "Heart Reef": "The heart reef, part of the Great Barrier Reef near Airlie Beach, Whitsunday Islands, Queensland.jpg",
  "Coral Gardens": "Great Barrier Reef Corals.jpg",
  "Notre-Dame": "Notre-Dame de Paris 2013-07-24.jpg",
  "Bruges Belfry": "Bruges Belgium Belfry-02.jpg",
  "Markt Square": "Brugge Markt Noordzijde R01.jpg",
  "Geysir Hot Spring": "Strokkur Geyser (3353874718).jpg",
  "Retiro Park": "Monumento a Alfonso XII de España en los Jardines del Retiro - 04.jpg",
  "Berlin Wall Memorial": "East side gallery, Berlin Wall (Ank Kumar, Infosys Limited) 14.jpg",
  // The plain "Blue Lagoon" title is a disambiguation page with no image, and the search fallback finds none.
  // CC0 (Frank Denney), so it needs no attribution.
  "Blue Lagoon": "Blue-lagoon-spa-spring (Unsplash).jpg",
};
