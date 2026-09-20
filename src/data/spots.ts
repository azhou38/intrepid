import type { SpotCategory } from '../types';

export interface Spot {
  id: string;
  destinationId: string;
  name: string;
  icon: string;
  coordinates: { latitude: number; longitude: number };
  category: SpotCategory;
  bio: string;
  hours: string;       // e.g. "9:00 AM – 6:00 PM" or "Open 24 hours" — the regular daily hours,
                        // unless overridden by `closedDays` below.
  visitHours: number;  // approximate time to visit, in hours
  // Which weekdays this spot is fully closed on (0 = Sunday … 6 = Saturday). Every other day
  // uses `hours` above. Omitted entirely for spots open every day.
  closedDays?: number[];
  // Entry cost in the spot's own local currency (approximate — sourced from general
  // knowledge, not a live pricing feed, so treat as a starting point rather than gospel;
  // venues change prices often). `free: true` takes priority and always renders as "Free".
  // Otherwise costMin/costMax render as a single value when equal, or a range when they
  // differ, formatted per `currency` (ISO 4217 code; omitted = USD).
  free?: boolean;
  costMin?: number;
  costMax?: number;
  currency?: string;
  // Official ticketing/booking site, when one genuinely exists (a single canonical operator).
  // Omitted for free/public spots and for attractions booked through many different operators
  // with no one official site (e.g. scenic flights).
  ticketUrl?: string;
}

// Sunday-first, matching Date#getDay() (0 = Sunday … 6 = Saturday).
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function hoursForDay(spot: Spot, dayIndex: number): string {
  if (spot.closedDays?.includes(dayIndex)) return 'Closed';
  return spot.hours;
}

// Prefix (symbol before the number) or suffix (code after it, for currencies whose symbol
// is ambiguous on its own — "kr" alone doesn't say which Nordic krona/krone).
const CURRENCY_FORMAT: Record<string, { prefix?: string; suffix?: string }> = {
  USD: { prefix: '$' },
  EUR: { prefix: '€' },
  GBP: { prefix: '£' },
  JPY: { prefix: '¥' },
  AUD: { prefix: 'A$' },
  CHF: { prefix: 'CHF ' },
  CZK: { suffix: ' Kč' },
  SEK: { suffix: ' SEK' },
  NOK: { suffix: ' NOK' },
  DKK: { suffix: ' DKK' },
  ISK: { suffix: ' ISK' },
};

export function formatSpotCost(spot: Spot): string {
  if (spot.free || spot.costMin == null) return 'Free';
  const fmt = CURRENCY_FORMAT[spot.currency ?? 'USD'] ?? CURRENCY_FORMAT.USD;
  const one = (n: number) => `${fmt.prefix ?? ''}${n}${fmt.suffix ?? ''}`;
  if (spot.costMax == null || spot.costMax === spot.costMin) return one(spot.costMin);
  return `${one(spot.costMin)} – ${one(spot.costMax)}`;
}

export const SPOTS: Spot[] = [
  // NYC
  { id: 'nyc-1', destinationId: 'nyc', name: 'Times Square', icon: '🎭', coordinates: { latitude: 40.7580, longitude: -73.9855 }, category: 'landmark', bio: 'The dazzling neon heart of Manhattan, where Broadway meets a million lights and the crowds never thin.', hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'nyc-2', destinationId: 'nyc', name: 'Central Park', icon: '🌳', coordinates: { latitude: 40.7851, longitude: -73.9683 }, category: 'nature', bio: '843 acres of meadows, lakes, and wooded paths carved into the middle of the city grid.', hours: '6:00 AM – 1:00 AM', visitHours: 2.5, free: true },
  { id: 'nyc-3', destinationId: 'nyc', name: 'Empire State Building', icon: '🏙️', coordinates: { latitude: 40.7484, longitude: -73.9967 }, category: 'viewpoint', bio: 'The Art Deco icon whose 86th-floor deck offers the definitive Manhattan panorama.', hours: '10:00 AM – 10:00 PM', visitHours: 1.5, costMin: 44, costMax: 79, ticketUrl: 'https://www.esbnyc.com' },
  // Los Angeles
  { id: 'la-1', destinationId: 'la', name: 'Hollywood Sign', icon: '🎬', coordinates: { latitude: 34.1341, longitude: -118.3215 }, category: 'landmark', bio: 'The 45-foot white letters on Mount Lee that have symbolized movie-making dreams since 1923.', hours: 'Open 24 hours', visitHours: 2, free: true },
  { id: 'la-2', destinationId: 'la', name: 'Santa Monica Pier', icon: '🎡', coordinates: { latitude: 34.0081, longitude: -118.4960 }, category: 'entertainment', bio: 'A century-old pier with a solar-powered Ferris wheel, arcade, and the end of Route 66.', hours: 'Open 24 hours', visitHours: 2, free: true },
  { id: 'la-3', destinationId: 'la', name: 'Griffith Observatory', icon: '🔭', coordinates: { latitude: 34.1184, longitude: -118.3004 }, category: 'viewpoint', bio: 'A gleaming Art Deco observatory with telescopes, science halls, and sweeping views of the LA basin.', hours: '12:00 PM – 10:00 PM', visitHours: 2, closedDays: [1], free: true, ticketUrl: 'https://griffithobservatory.org' },
  // Grand Canyon
  { id: 'grand-canyon-1', destinationId: 'grand-canyon', name: 'Mather Point', icon: '👁️', coordinates: { latitude: 36.0572, longitude: -112.1069 }, category: 'viewpoint', bio: 'The classic first look at the canyon, with a railed overlook reaching out over a mile of layered rock.', hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'grand-canyon-2', destinationId: 'grand-canyon', name: 'Bright Angel Trail', icon: '🥾', coordinates: { latitude: 36.0561, longitude: -112.1428 }, category: 'hike', bio: 'The most famous trail into the canyon, switchbacking down past rest houses toward the Colorado River.', hours: 'Open 24 hours', visitHours: 4, free: true },
  { id: 'grand-canyon-3', destinationId: 'grand-canyon', name: 'Yavapai Point', icon: '🌅', coordinates: { latitude: 36.0660, longitude: -112.1019 }, category: 'viewpoint', bio: 'A panoramic overlook and geology museum with some of the finest sunset views on the South Rim.', hours: 'Open 24 hours', visitHours: 1, free: true },
  // Paris
  { id: 'paris-1', destinationId: 'paris', name: 'Eiffel Tower', icon: '🗼', coordinates: { latitude: 48.8584, longitude: 2.2945 }, category: 'monument', bio: "Gustave Eiffel's 330-metre iron lattice tower, the enduring symbol of Paris and its most visited monument.", hours: '9:30 AM – 11:45 PM', visitHours: 2.5, costMin: 13, costMax: 35, currency: 'EUR', ticketUrl: 'https://www.toureiffel.paris' },
  { id: 'paris-2', destinationId: 'paris', name: 'The Louvre', icon: '🎨', coordinates: { latitude: 48.8606, longitude: 2.3376 }, category: 'museum', bio: "The world's largest art museum, home to the Mona Lisa, Venus de Milo, and 35,000 works across former royal palaces.", hours: '9:00 AM – 6:00 PM', visitHours: 3, closedDays: [2], costMin: 22, costMax: 22, currency: 'EUR', ticketUrl: 'https://www.louvre.fr' },
  { id: 'paris-3', destinationId: 'paris', name: 'Notre-Dame', icon: '⛪', coordinates: { latitude: 48.8530, longitude: 2.3499 }, category: 'religious', bio: 'The masterpiece of French Gothic architecture on the Île de la Cité, famed for its rose windows and flying buttresses.', hours: '8:00 AM – 6:45 PM', visitHours: 1.5, free: true },
  // London
  { id: 'london-1', destinationId: 'london', name: 'Big Ben', icon: '🕰️', coordinates: { latitude: 51.5007, longitude: -0.1246 }, category: 'landmark', bio: 'The great clock tower of the Palace of Westminster, whose chimes have marked London time since 1859.', hours: 'Exterior viewing anytime', visitHours: 0.5, free: true },
  { id: 'london-2', destinationId: 'london', name: 'Tower of London', icon: '🏰', coordinates: { latitude: 51.5081, longitude: -0.0759 }, category: 'historic', bio: 'A 1,000-year-old fortress, palace, and prison on the Thames, guarding the Crown Jewels and its famous ravens.', hours: '9:00 AM – 5:30 PM', visitHours: 3, costMin: 34, costMax: 40, currency: 'GBP', ticketUrl: 'https://www.hrp.org.uk/tower-of-london' },
  { id: 'london-3', destinationId: 'london', name: 'Buckingham Palace', icon: '👑', coordinates: { latitude: 51.5014, longitude: -0.1419 }, category: 'landmark', bio: 'The London residence of the British monarch, famed for its balcony and the Changing of the Guard ceremony.', hours: '9:30 AM – 7:30 PM (summer)', visitHours: 2, costMin: 32, costMax: 37, currency: 'GBP', ticketUrl: 'https://www.rct.uk' },
  // Rome
  { id: 'rome-1', destinationId: 'rome', name: 'Colosseum', icon: '🏟️', coordinates: { latitude: 41.8902, longitude: 12.4922 }, category: 'historic', bio: 'The largest amphitheatre ever built, where 50,000 Romans once watched gladiatorial games nearly 2,000 years ago.', hours: '9:00 AM – 7:00 PM', visitHours: 2, costMin: 18, costMax: 24, currency: 'EUR', ticketUrl: 'https://parcocolosseo.it' },
  { id: 'rome-2', destinationId: 'rome', name: 'Trevi Fountain', icon: '⛲', coordinates: { latitude: 41.9009, longitude: 12.4833 }, category: 'monument', bio: 'The grandest Baroque fountain in Rome, where tradition says a coin tossed over the shoulder ensures your return.', hours: 'Open 24 hours', visitHours: 0.5, free: true },
  { id: 'rome-3', destinationId: 'rome', name: 'Vatican', icon: '✝️', coordinates: { latitude: 41.9022, longitude: 12.4539 }, category: 'religious', bio: "The seat of the Catholic Church, home to St. Peter's Basilica, the Sistine Chapel, and the Vatican Museums.", hours: '9:00 AM – 6:00 PM', visitHours: 3.5, closedDays: [0], costMin: 20, costMax: 28, currency: 'EUR', ticketUrl: 'https://www.museivaticani.va' },
  // Barcelona
  { id: 'barcelona-1', destinationId: 'barcelona', name: 'Sagrada Família', icon: '⛪', coordinates: { latitude: 41.4036, longitude: 2.1744 }, category: 'religious', bio: "Gaudí's unfinished basilica, a soaring forest of stone columns under construction since 1882.", hours: '9:00 AM – 8:00 PM', visitHours: 2, costMin: 26, costMax: 40, currency: 'EUR', ticketUrl: 'https://sagradafamilia.org' },
  { id: 'barcelona-2', destinationId: 'barcelona', name: 'Park Güell', icon: '🦎', coordinates: { latitude: 41.4145, longitude: 2.1527 }, category: 'landmark', bio: "Gaudí's whimsical hillside park of mosaic serpents, gingerbread pavilions, and city views.", hours: '9:30 AM – 7:30 PM', visitHours: 2, costMin: 10, costMax: 13, currency: 'EUR', ticketUrl: 'https://parkguell.barcelona' },
  { id: 'barcelona-3', destinationId: 'barcelona', name: 'La Boqueria', icon: '🍅', coordinates: { latitude: 41.3817, longitude: 2.1718 }, category: 'market', bio: "Barcelona's legendary public market off La Rambla, bursting with jamón, seafood, and fruit stalls.", hours: '8:00 AM – 8:30 PM', visitHours: 1, closedDays: [0], free: true },
  // Amsterdam
  { id: 'amsterdam-1', destinationId: 'amsterdam', name: 'Rijksmuseum', icon: '🎨', coordinates: { latitude: 52.3600, longitude: 4.8852 }, category: 'museum', bio: 'The Dutch national museum, home to Rembrandt\'s Night Watch and centuries of Golden Age masterpieces.', hours: '9:00 AM – 5:00 PM', visitHours: 3, costMin: 24, costMax: 24, currency: 'EUR', ticketUrl: 'https://www.rijksmuseum.nl' },
  { id: 'amsterdam-2', destinationId: 'amsterdam', name: "Anne Frank's House", icon: '📖', coordinates: { latitude: 52.3752, longitude: 4.8840 }, category: 'historic', bio: 'The canal-house annex where Anne Frank hid and wrote her diary, now a deeply moving museum.', hours: '9:00 AM – 10:00 PM', visitHours: 1.5, costMin: 18, costMax: 18, currency: 'EUR', ticketUrl: 'https://www.annefrank.org' },
  { id: 'amsterdam-3', destinationId: 'amsterdam', name: 'Van Gogh Museum', icon: '🌻', coordinates: { latitude: 52.3584, longitude: 4.8811 }, category: 'museum', bio: "The world's largest collection of Van Gogh's paintings and letters, tracing his turbulent life and work.", hours: '9:00 AM – 6:00 PM', visitHours: 2, costMin: 22, costMax: 22, currency: 'EUR', ticketUrl: 'https://www.vangoghmuseum.nl' },
  // Prague
  { id: 'prague-1', destinationId: 'prague', name: 'Prague Castle', icon: '🏰', coordinates: { latitude: 50.0904, longitude: 14.4013 }, category: 'historic', bio: 'The largest ancient castle complex in the world, crowning the city with St. Vitus Cathedral at its heart.', hours: '9:00 AM – 5:00 PM', visitHours: 3, costMin: 250, costMax: 350, currency: 'CZK', ticketUrl: 'https://www.hrad.cz' },
  { id: 'prague-2', destinationId: 'prague', name: 'Charles Bridge', icon: '🌉', coordinates: { latitude: 50.0866, longitude: 14.4114 }, category: 'monument', bio: 'A 14th-century stone bridge lined with Baroque statues, linking the Old Town to the castle across the Vltava.', hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'prague-3', destinationId: 'prague', name: 'Old Town Square', icon: '⏰', coordinates: { latitude: 50.0870, longitude: 14.4201 }, category: 'landmark', bio: 'The medieval heart of Prague, home to the Astronomical Clock and its hourly parade of apostles.', hours: 'Open 24 hours', visitHours: 1, free: true },
  // Santorini
  { id: 'santorini-1', destinationId: 'santorini', name: 'Oia Village', icon: '🌅', coordinates: { latitude: 36.4618, longitude: 25.3753 }, category: 'viewpoint', bio: 'The cliffside village of white-and-blue houses famed for the most celebrated sunset in the Aegean.', hours: 'Open 24 hours', visitHours: 2.5, free: true },
  { id: 'santorini-2', destinationId: 'santorini', name: 'Akrotiri', icon: '🏛️', coordinates: { latitude: 36.3519, longitude: 25.4044 }, category: 'historic', bio: 'A Bronze Age Minoan town preserved under volcanic ash, often called the "Pompeii of the Aegean".', hours: '8:00 AM – 8:00 PM', visitHours: 1.5, closedDays: [1], costMin: 12, costMax: 12, currency: 'EUR', ticketUrl: 'https://odysseus.culture.gr' },
  { id: 'santorini-3', destinationId: 'santorini', name: 'Red Beach', icon: '🏖️', coordinates: { latitude: 36.3478, longitude: 25.3939 }, category: 'beach', bio: 'A dramatic cove of red-black volcanic sand framed by towering rust-coloured cliffs.', hours: 'Open 24 hours', visitHours: 1.5, free: true },
  // Nice
  { id: 'nice-1', destinationId: 'nice', name: 'Promenade des Anglais', icon: '🌊', coordinates: { latitude: 43.6955, longitude: 7.2648 }, category: 'landmark', bio: 'The grand seaside boulevard curving along the Baie des Anges, lined with palms and Belle Époque hotels.', hours: 'Open 24 hours', visitHours: 1.5, free: true },
  { id: 'nice-2', destinationId: 'nice', name: 'Vieux-Nice Old Town', icon: '🏠', coordinates: { latitude: 43.6961, longitude: 7.2757 }, category: 'historic', bio: 'A maze of ochre lanes, Baroque churches, and market squares that form the soul of old Nice.', hours: 'Open 24 hours', visitHours: 2, free: true },
  // Lyon
  { id: 'lyon-1', destinationId: 'lyon', name: 'Basilica of Fourvière', icon: '⛪', coordinates: { latitude: 45.7624, longitude: 4.8222 }, category: 'religious', bio: 'An ornate 19th-century basilica crowning Fourvière hill, with mosaics inside and city panoramas outside.', hours: '8:00 AM – 7:00 PM', visitHours: 1.5, free: true },
  { id: 'lyon-2', destinationId: 'lyon', name: 'Les Halles Paul Bocuse', icon: '🥩', coordinates: { latitude: 45.7651, longitude: 4.8586 }, category: 'market', bio: "Lyon's temple of gastronomy, an indoor market of celebrated cheesemongers, charcutiers, and traiteurs.", hours: '7:00 AM – 7:00 PM', visitHours: 1, closedDays: [1], free: true },
  // Edinburgh
  { id: 'edinburgh-1', destinationId: 'edinburgh', name: 'Edinburgh Castle', icon: '🏰', coordinates: { latitude: 55.9486, longitude: -3.1999 }, category: 'historic', bio: 'An ancient fortress atop volcanic Castle Rock, guarding the Scottish Crown Jewels and the Stone of Destiny.', hours: '9:30 AM – 6:00 PM', visitHours: 2.5, costMin: 19, costMax: 26, currency: 'GBP', ticketUrl: 'https://www.edinburghcastle.scot' },
  { id: 'edinburgh-2', destinationId: 'edinburgh', name: "Arthur's Seat", icon: '⛰️', coordinates: { latitude: 55.9444, longitude: -3.1617 }, category: 'hike', bio: 'An extinct volcano rising 251 metres above the city, offering the finest walk-up view in Edinburgh.', hours: 'Open 24 hours', visitHours: 2.5, free: true },
  // Florence
  { id: 'florence-1', destinationId: 'florence', name: 'Uffizi Gallery', icon: '🎨', coordinates: { latitude: 43.7678, longitude: 11.2553 }, category: 'museum', bio: "One of the world's greatest art museums, holding Botticelli's Birth of Venus and Renaissance masterpieces.", hours: '8:15 AM – 6:30 PM', visitHours: 3, closedDays: [1], costMin: 20, costMax: 27, currency: 'EUR', ticketUrl: 'https://www.uffizi.it' },
  { id: 'florence-2', destinationId: 'florence', name: 'Florence Cathedral', icon: '⛪', coordinates: { latitude: 43.7731, longitude: 11.2560 }, category: 'religious', bio: "The Duomo crowned by Brunelleschi's revolutionary red-tiled dome, a marvel of Renaissance engineering.", hours: '10:15 AM – 4:45 PM', visitHours: 2, free: true, ticketUrl: 'https://duomo.firenze.it' },
  // Venice
  { id: 'venice-1', destinationId: 'venice', name: "St. Mark's Square", icon: '🕊️', coordinates: { latitude: 45.4341, longitude: 12.3388 }, category: 'landmark', bio: "Venice's grand social heart, ringed by the Basilica, Campanile, and centuries-old cafés.", hours: 'Open 24 hours', visitHours: 1.5, free: true },
  { id: 'venice-2', destinationId: 'venice', name: 'Grand Canal', icon: '🚤', coordinates: { latitude: 45.4380, longitude: 12.3186 }, category: 'landmark', bio: "The city's watery main street, best seen by vaporetto or gondola past palazzos and the Rialto Bridge.", hours: 'Open 24 hours', visitHours: 1, free: true },
  // Madrid
  { id: 'madrid-1', destinationId: 'madrid', name: 'Prado Museum', icon: '🖼️', coordinates: { latitude: 40.4138, longitude: -3.6921 }, category: 'museum', bio: "Spain's greatest art museum, rich with Velázquez, Goya, and the European old masters.", hours: '10:00 AM – 8:00 PM', visitHours: 3, costMin: 15, costMax: 15, currency: 'EUR', ticketUrl: 'https://www.museodelprado.es' },
  { id: 'madrid-2', destinationId: 'madrid', name: 'Retiro Park', icon: '🌳', coordinates: { latitude: 40.4153, longitude: -3.6844 }, category: 'nature', bio: 'A former royal garden of 350 acres, with a boating lake, rose gardens, and the glass Crystal Palace.', hours: '6:00 AM – 12:00 AM', visitHours: 2, free: true },
  // Athens
  { id: 'athens-1', destinationId: 'athens', name: 'Acropolis & Parthenon', icon: '🏛️', coordinates: { latitude: 37.9715, longitude: 23.7267 }, category: 'historic', bio: 'The citadel of ancient Athens crowned by the Parthenon, the enduring symbol of classical civilization.', hours: '8:00 AM – 8:00 PM', visitHours: 2.5, costMin: 20, costMax: 20, currency: 'EUR', ticketUrl: 'https://odysseus.culture.gr' },
  { id: 'athens-2', destinationId: 'athens', name: 'Ancient Agora', icon: '🏺', coordinates: { latitude: 37.9754, longitude: 23.7218 }, category: 'historic', bio: 'The marketplace and civic heart of ancient Athens, where Socrates once taught among the ruins and temples.', hours: '8:00 AM – 7:00 PM', visitHours: 1.5, costMin: 10, costMax: 10, currency: 'EUR', ticketUrl: 'https://odysseus.culture.gr' },
  // Mykonos
  { id: 'mykonos-1', destinationId: 'mykonos', name: 'Mykonos Town (Chora)', icon: '🏘️', coordinates: { latitude: 37.4453, longitude: 25.3285 }, category: 'historic', bio: 'A dazzling maze of whitewashed Cycladic lanes, bougainvillea, boutiques, and hidden chapels.', hours: 'Open 24 hours', visitHours: 2.5, free: true },
  { id: 'mykonos-2', destinationId: 'mykonos', name: 'Little Venice', icon: '🌊', coordinates: { latitude: 37.4456, longitude: 25.3261 }, category: 'viewpoint', bio: 'A row of colourful merchant houses perched at the water\'s edge, famous for cocktails at sunset.', hours: 'Open 24 hours', visitHours: 1.5, free: true },
  // Berlin
  { id: 'berlin-1', destinationId: 'berlin', name: 'Brandenburg Gate', icon: '🏛️', coordinates: { latitude: 52.5163, longitude: 13.3777 }, category: 'monument', bio: 'The neoclassical 18th-century gate that became the symbol of a divided — then reunited — Germany.', hours: 'Open 24 hours', visitHours: 0.5, free: true },
  { id: 'berlin-2', destinationId: 'berlin', name: 'Berlin Wall Memorial', icon: '🧱', coordinates: { latitude: 52.5352, longitude: 13.3902 }, category: 'historic', bio: 'A preserved stretch of the Wall with a documentation centre, memorializing the city\'s Cold War division.', hours: '8:00 AM – 10:00 PM', visitHours: 1.5, free: true },
  // Munich
  { id: 'munich-1', destinationId: 'munich', name: 'Marienplatz', icon: '🏙️', coordinates: { latitude: 48.1374, longitude: 11.5755 }, category: 'landmark', bio: "Munich's central square since 1158, dominated by the New Town Hall and its famous Glockenspiel.", hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'munich-2', destinationId: 'munich', name: 'English Garden', icon: '🌳', coordinates: { latitude: 48.1642, longitude: 11.6050 }, category: 'nature', bio: 'One of the world\'s largest urban parks, with beer gardens, a Chinese tower, and a river-surfing wave.', hours: 'Open 24 hours', visitHours: 2, free: true },
  // Lisbon
  { id: 'lisbon-1', destinationId: 'lisbon', name: 'Belém Tower', icon: '🗼', coordinates: { latitude: 38.6916, longitude: -9.2160 }, category: 'monument', bio: 'A 16th-century Manueline fortress on the Tagus, launch point of Portugal\'s Age of Discovery.', hours: '10:00 AM – 5:30 PM', visitHours: 1.5, closedDays: [1], costMin: 7, costMax: 7, currency: 'EUR', ticketUrl: 'https://www.torrebelem.gov.pt' },
  { id: 'lisbon-2', destinationId: 'lisbon', name: 'Alfama District', icon: '🎵', coordinates: { latitude: 38.7139, longitude: -9.1301 }, category: 'historic', bio: 'Lisbon\'s oldest quarter, a tangle of Moorish-era lanes echoing with fado music and tram bells.', hours: 'Open 24 hours', visitHours: 2, free: true },
  // Porto
  { id: 'porto-1', destinationId: 'porto', name: 'Ribeira Quarter', icon: '🏘️', coordinates: { latitude: 41.1408, longitude: -8.6145 }, category: 'historic', bio: 'A UNESCO-listed riverside warren of medieval houses tumbling down to the Douro waterfront.', hours: 'Open 24 hours', visitHours: 2, free: true },
  { id: 'porto-2', destinationId: 'porto', name: 'Dom Luís I Bridge', icon: '🌉', coordinates: { latitude: 41.1401, longitude: -8.6093 }, category: 'viewpoint', bio: 'A double-deck iron arch bridge by a Eiffel disciple, with sweeping views over Porto and the port cellars.', hours: 'Open 24 hours', visitHours: 1, free: true },
  // Zurich
  { id: 'zurich-1', destinationId: 'zurich', name: 'Old Town (Altstadt)', icon: '🏘️', coordinates: { latitude: 47.3726, longitude: 8.5432 }, category: 'historic', bio: 'Medieval lanes climbing both banks of the Limmat, dotted with guildhalls and Romanesque churches.', hours: 'Open 24 hours', visitHours: 2, free: true },
  { id: 'zurich-2', destinationId: 'zurich', name: 'Lake Zurich', icon: '💧', coordinates: { latitude: 47.3558, longitude: 8.5475 }, category: 'nature', bio: 'A crescent lake fringed by promenades and, on clear days, a shimmering backdrop of the Alps.', hours: 'Open 24 hours', visitHours: 2, free: true },
  // Interlaken
  { id: 'interlaken-1', destinationId: 'interlaken', name: 'Harder Kulm', icon: '⛰️', coordinates: { latitude: 46.7007, longitude: 7.8544 }, category: 'viewpoint', bio: 'Interlaken\'s "top of the town" at 1,322m, reached by funicular for views of Eiger, Mönch, and Jungfrau.', hours: '9:00 AM – 9:00 PM', visitHours: 2, costMin: 36, costMax: 36, currency: 'CHF', ticketUrl: 'https://www.jungfrau.ch' },
  { id: 'interlaken-2', destinationId: 'interlaken', name: 'Jungfraujoch', icon: '🏔️', coordinates: { latitude: 46.5474, longitude: 7.9854 }, category: 'viewpoint', bio: 'The "Top of Europe" at 3,454m, home to the continent\'s highest railway station and an eternal ice palace.', hours: '8:00 AM – 6:00 PM', visitHours: 4, costMin: 210, costMax: 230, currency: 'CHF', ticketUrl: 'https://www.jungfrau.ch' },
  // Vienna
  { id: 'vienna-1', destinationId: 'vienna', name: 'Schönbrunn Palace', icon: '🏰', coordinates: { latitude: 48.1845, longitude: 16.3122 }, category: 'historic', bio: 'The 1,441-room Habsburg summer palace, with Baroque state rooms and vast formal gardens.', hours: '8:30 AM – 5:30 PM', visitHours: 3, costMin: 26, costMax: 32, currency: 'EUR', ticketUrl: 'https://www.schoenbrunn.at' },
  { id: 'vienna-2', destinationId: 'vienna', name: 'Kunsthistorisches Museum', icon: '🎨', coordinates: { latitude: 48.2037, longitude: 16.3614 }, category: 'museum', bio: 'The imperial art collection under a grand domed palace, rich with Bruegel, Vermeer, and Rubens.', hours: '10:00 AM – 6:00 PM', visitHours: 2.5, closedDays: [1], costMin: 18, costMax: 18, currency: 'EUR', ticketUrl: 'https://www.khm.at' },
  // Salzburg
  { id: 'salzburg-1', destinationId: 'salzburg', name: 'Hohensalzburg Fortress', icon: '🏰', coordinates: { latitude: 47.7948, longitude: 13.0472 }, category: 'historic', bio: 'One of Europe\'s largest fully preserved medieval castles, crowning the city with alpine views.', hours: '9:30 AM – 5:00 PM', visitHours: 2.5, costMin: 13, costMax: 17, currency: 'EUR', ticketUrl: 'https://www.salzburg-burgen.at' },
  { id: 'salzburg-2', destinationId: 'salzburg', name: 'Mirabell Palace', icon: '🌷', coordinates: { latitude: 47.8046, longitude: 13.0433 }, category: 'landmark', bio: 'A Baroque palace whose manicured gardens starred in The Sound of Music and frame the fortress beyond.', hours: '8:00 AM – 6:00 PM (gardens)', visitHours: 1, free: true },
  // Bruges
  { id: 'bruges-1', destinationId: 'bruges', name: 'Bruges Belfry', icon: '🔔', coordinates: { latitude: 51.2088, longitude: 3.2246 }, category: 'monument', bio: 'A 13th-century medieval bell tower rising 83m over the market, rewarding 366 steps with rooftop views.', hours: '9:30 AM – 6:00 PM', visitHours: 1, costMin: 14, costMax: 14, currency: 'EUR', ticketUrl: 'https://www.visitbruges.be' },
  { id: 'bruges-2', destinationId: 'bruges', name: 'Markt Square', icon: '🏛️', coordinates: { latitude: 51.2091, longitude: 3.2239 }, category: 'landmark', bio: 'The colourful gabled heart of Bruges, ringed by guildhalls, cafés, and horse-drawn carriages.', hours: 'Open 24 hours', visitHours: 1, free: true },
  // Brussels
  { id: 'brussels-1', destinationId: 'brussels', name: 'Grand-Place', icon: '🏛️', coordinates: { latitude: 50.8467, longitude: 4.3525 }, category: 'landmark', bio: 'A UNESCO World Heritage square ringed by opulent gilded guildhalls and the Gothic Town Hall.', hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'brussels-2', destinationId: 'brussels', name: 'Atomium', icon: '⚛️', coordinates: { latitude: 50.8948, longitude: 4.3412 }, category: 'landmark', bio: 'A 102m model of an iron crystal built for Expo 58, with exhibition spheres and a panoramic top.', hours: '10:00 AM – 6:00 PM', visitHours: 1.5, costMin: 17, costMax: 17, currency: 'EUR', ticketUrl: 'https://atomium.be' },
  // Dublin
  { id: 'dublin-1', destinationId: 'dublin', name: 'Trinity College', icon: '📚', coordinates: { latitude: 53.3439, longitude: -6.2546 }, category: 'historic', bio: "Ireland's oldest university, home to the illuminated Book of Kells and the breathtaking Long Room library.", hours: '8:30 AM – 5:00 PM', visitHours: 1.5, costMin: 22, costMax: 28, currency: 'EUR', ticketUrl: 'https://www.tcd.ie/visit' },
  { id: 'dublin-2', destinationId: 'dublin', name: 'Guinness Storehouse', icon: '🍺', coordinates: { latitude: 53.3419, longitude: -6.2868 }, category: 'entertainment', bio: 'A seven-storey pint-shaped museum of Ireland\'s most famous stout, topped by the panoramic Gravity Bar.', hours: '9:30 AM – 7:00 PM', visitHours: 2, costMin: 28, costMax: 35, currency: 'EUR', ticketUrl: 'https://www.guinness-storehouse.com' },
  // Cliffs of Moher
  { id: 'cliffs-of-moher-1', destinationId: 'cliffs-of-moher', name: "O'Brien's Tower", icon: '🗼', coordinates: { latitude: 52.9722, longitude: -9.4272 }, category: 'viewpoint', bio: 'A 19th-century stone tower at the cliffs\' highest point, with views to the Aran Islands and Galway Bay.', hours: '9:00 AM – 5:00 PM', visitHours: 1, costMin: 10, costMax: 10, currency: 'EUR', ticketUrl: 'https://www.cliffsofmoher.ie' },
  { id: 'cliffs-of-moher-2', destinationId: 'cliffs-of-moher', name: "Hag's Head", icon: '🌊', coordinates: { latitude: 52.9421, longitude: -9.4608 }, category: 'hike', bio: 'The dramatic southern promontory of the cliffs, reached by a wild coastal trail away from the crowds.', hours: 'Open 24 hours', visitHours: 2, free: true },
  // Stockholm
  { id: 'stockholm-1', destinationId: 'stockholm', name: 'Gamla Stan', icon: '🏘️', coordinates: { latitude: 59.3230, longitude: 18.0710 }, category: 'historic', bio: 'One of Europe\'s best-preserved medieval old towns, an island of cobbled lanes and ochre merchant houses.', hours: 'Open 24 hours', visitHours: 2, free: true },
  { id: 'stockholm-2', destinationId: 'stockholm', name: 'Vasa Museum', icon: '⛵', coordinates: { latitude: 59.3280, longitude: 18.0914 }, category: 'museum', bio: 'Home to a fully intact 17th-century warship salvaged after 333 years on the harbour floor.', hours: '10:00 AM – 5:00 PM', visitHours: 1.5, costMin: 190, costMax: 190, currency: 'SEK', ticketUrl: 'https://www.vasamuseet.se' },
  // Gothenburg
  { id: 'gothenburg-1', destinationId: 'gothenburg', name: 'Feskekörka', icon: '🐟', coordinates: { latitude: 57.7021, longitude: 11.9585 }, category: 'market', bio: 'The "Fish Church", a striking neo-Gothic hall serving Gothenburg\'s freshest seafood since 1874.', hours: '10:00 AM – 6:00 PM', visitHours: 1, closedDays: [0, 1], free: true },
  { id: 'gothenburg-2', destinationId: 'gothenburg', name: 'Liseberg', icon: '🎡', coordinates: { latitude: 57.6960, longitude: 12.0014 }, category: 'entertainment', bio: 'Scandinavia\'s most beloved amusement park, with wooden coasters, gardens, and seasonal festivities.', hours: '11:00 AM – 10:00 PM (seasonal)', visitHours: 4, costMin: 150, costMax: 170, currency: 'SEK', ticketUrl: 'https://www.liseberg.com' },
  // Bergen
  { id: 'bergen-1', destinationId: 'bergen', name: 'Bryggen Wharf', icon: '🏘️', coordinates: { latitude: 60.3976, longitude: 5.3237 }, category: 'historic', bio: 'A UNESCO row of crooked wooden Hanseatic trading houses, painted in reds and ochres along the harbour.', hours: 'Open 24 hours', visitHours: 1.5, free: true },
  { id: 'bergen-2', destinationId: 'bergen', name: 'Fløibanen Funicular', icon: '🚡', coordinates: { latitude: 60.3961, longitude: 5.3269 }, category: 'viewpoint', bio: 'A funicular climbing Mount Fløyen for sweeping views over Bergen, its fjords, and surrounding peaks.', hours: '7:30 AM – 11:00 PM', visitHours: 1.5, costMin: 160, costMax: 190, currency: 'NOK', ticketUrl: 'https://www.floyen.no' },
  // Norwegian Fjords
  { id: 'norwegian-fjords-1', destinationId: 'norwegian-fjords', name: 'Geirangerfjord', icon: '⛰️', coordinates: { latitude: 62.1046, longitude: 7.2058 }, category: 'nature', bio: 'A UNESCO fjord of sheer cliffs and cascading waterfalls, among the most beautiful in the world.', hours: 'Open 24 hours', visitHours: 3, free: true },
  { id: 'norwegian-fjords-2', destinationId: 'norwegian-fjords', name: 'Preikestolen', icon: '🪨', coordinates: { latitude: 58.9868, longitude: 6.1894 }, category: 'hike', bio: 'The Pulpit Rock, a flat cliff plateau towering 604m above Lysefjord — Norway\'s most iconic hike.', hours: 'Open 24 hours', visitHours: 4, free: true },
  // Copenhagen
  { id: 'copenhagen-1', destinationId: 'copenhagen', name: 'Nyhavn', icon: '⛵', coordinates: { latitude: 55.6796, longitude: 12.5910 }, category: 'landmark', bio: 'The postcard-perfect 17th-century canal lined with candy-coloured townhouses and wooden ships.', hours: 'Open 24 hours', visitHours: 1.5, free: true },
  { id: 'copenhagen-2', destinationId: 'copenhagen', name: 'Tivoli Gardens', icon: '🎡', coordinates: { latitude: 55.6736, longitude: 12.5681 }, category: 'entertainment', bio: 'The world\'s second-oldest amusement park, an 1843 wonderland of gardens, rides, and evening lights.', hours: '11:00 AM – 11:00 PM (seasonal)', visitHours: 3, costMin: 195, costMax: 235, currency: 'DKK', ticketUrl: 'https://www.tivoli.dk' },
  // Aarhus
  { id: 'aarhus-1', destinationId: 'aarhus', name: 'ARoS Art Museum', icon: '🌈', coordinates: { latitude: 56.1543, longitude: 10.2005 }, category: 'museum', bio: 'A landmark museum crowned by Your Rainbow Panorama, a circular walkway of coloured glass over the city.', hours: '10:00 AM – 5:00 PM', visitHours: 2, closedDays: [1], costMin: 140, costMax: 140, currency: 'DKK', ticketUrl: 'https://www.aros.dk' },
  { id: 'aarhus-2', destinationId: 'aarhus', name: 'Aarhus Cathedral', icon: '⛪', coordinates: { latitude: 56.1575, longitude: 10.2113 }, category: 'religious', bio: 'Denmark\'s longest and tallest cathedral, a Gothic landmark with medieval frescoes and a soaring nave.', hours: '10:00 AM – 4:00 PM', visitHours: 1, free: true },
  // Helsinki
  { id: 'helsinki-1', destinationId: 'helsinki', name: 'Helsinki Cathedral', icon: '⛪', coordinates: { latitude: 60.1699, longitude: 24.9523 }, category: 'religious', bio: 'A dazzling white neoclassical cathedral presiding over Senate Square, the symbol of Helsinki.', hours: '9:00 AM – 6:00 PM', visitHours: 1, free: true },
  { id: 'helsinki-2', destinationId: 'helsinki', name: 'Suomenlinna Fortress', icon: '🏰', coordinates: { latitude: 60.1454, longitude: 24.9881 }, category: 'historic', bio: 'A UNESCO sea fortress spread across islands, reached by ferry and dotted with tunnels and ramparts.', hours: 'Open 24 hours', visitHours: 3, free: true },
  // Rovaniemi
  { id: 'rovaniemi-1', destinationId: 'rovaniemi', name: 'Santa Claus Village', icon: '🎅', coordinates: { latitude: 66.5436, longitude: 25.8468 }, category: 'entertainment', bio: 'A festive village straddling the Arctic Circle, home to Santa\'s office and the main post office year-round.', hours: '10:00 AM – 5:00 PM', visitHours: 2.5, free: true, ticketUrl: 'https://santaclausvillage.info' },
  { id: 'rovaniemi-2', destinationId: 'rovaniemi', name: 'Arktikum Museum', icon: '🌌', coordinates: { latitude: 66.5089, longitude: 25.7246 }, category: 'museum', bio: 'A striking glass-tunnel museum exploring Arctic nature, Lapland culture, and the science of the aurora.', hours: '10:00 AM – 6:00 PM', visitHours: 2, costMin: 16, costMax: 16, currency: 'EUR', ticketUrl: 'https://www.arktikum.fi' },
  // Reykjavik
  { id: 'reykjavik-1', destinationId: 'reykjavik', name: 'Hallgrímskirkja Church', icon: '⛪', coordinates: { latitude: 64.1418, longitude: -21.9268 }, category: 'religious', bio: 'A 74m expressionist church evoking basalt columns, with a tower lift for the best views over Reykjavik.', hours: '9:00 AM – 5:00 PM', visitHours: 1, costMin: 1500, costMax: 1500, currency: 'ISK', ticketUrl: 'https://hallgrimskirkja.is' },
  { id: 'reykjavik-2', destinationId: 'reykjavik', name: 'Blue Lagoon', icon: '♨️', coordinates: { latitude: 63.8804, longitude: -22.4495 }, category: 'nature', bio: 'A milky-blue geothermal spa set in a black lava field, Iceland\'s most famous soaking experience.', hours: '8:00 AM – 10:00 PM', visitHours: 3, costMin: 12990, costMax: 16990, currency: 'ISK', ticketUrl: 'https://www.bluelagoon.com' },
  // Golden Circle
  { id: 'golden-circle-1', destinationId: 'golden-circle', name: 'Geysir Hot Spring', icon: '💨', coordinates: { latitude: 64.3121, longitude: -20.3020 }, category: 'nature', bio: 'The geothermal field that gave geysers their name, where Strokkur erupts skyward every few minutes.', hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'golden-circle-2', destinationId: 'golden-circle', name: 'Gullfoss Waterfall', icon: '💧', coordinates: { latitude: 64.3270, longitude: -20.1200 }, category: 'nature', bio: 'The "Golden Falls", a thunderous two-tier cascade plunging into a rugged glacial canyon.', hours: 'Open 24 hours', visitHours: 1, free: true },
  // Tokyo
  { id: 'tokyo-1', destinationId: 'tokyo', name: 'Senso-ji Temple', icon: '⛩️', coordinates: { latitude: 35.7148, longitude: 139.7967 }, category: 'religious', bio: "Tokyo's oldest temple, approached through the lantern-hung Thunder Gate and a lively market street.", hours: '6:00 AM – 5:00 PM', visitHours: 1.5, free: true },
  { id: 'tokyo-2', destinationId: 'tokyo', name: 'Shibuya Crossing', icon: '🚦', coordinates: { latitude: 35.6595, longitude: 139.7004 }, category: 'landmark', bio: 'The world\'s busiest pedestrian scramble, a mesmerizing surge of thousands beneath giant screens.', hours: 'Open 24 hours', visitHours: 0.5, free: true },
  { id: 'tokyo-3', destinationId: 'tokyo', name: 'Tokyo Tower', icon: '📡', coordinates: { latitude: 35.6586, longitude: 139.7454 }, category: 'viewpoint', bio: 'A 333m red-and-white broadcasting tower inspired by the Eiffel, with observation decks over the city.', hours: '9:00 AM – 11:00 PM', visitHours: 1.5, costMin: 1200, costMax: 3000, currency: 'JPY', ticketUrl: 'https://www.tokyotower.co.jp' },
  // Kyoto
  { id: 'kyoto-1', destinationId: 'kyoto', name: 'Fushimi Inari Shrine', icon: '⛩️', coordinates: { latitude: 34.9671, longitude: 135.7727 }, category: 'religious', bio: 'A mountainside shrine famed for thousands of vermilion torii gates forming tunnels up the hillside.', hours: 'Open 24 hours', visitHours: 2.5, free: true },
  { id: 'kyoto-2', destinationId: 'kyoto', name: 'Arashiyama Bamboo', icon: '🎋', coordinates: { latitude: 35.0094, longitude: 135.6706 }, category: 'nature', bio: 'A dreamlike grove where towering bamboo stalks sway and creak, filtering the light to a green glow.', hours: 'Open 24 hours', visitHours: 1, free: true },
  { id: 'kyoto-3', destinationId: 'kyoto', name: 'Kinkaku-ji', icon: '🥇', coordinates: { latitude: 35.0394, longitude: 135.7292 }, category: 'religious', bio: 'The Golden Pavilion, a Zen temple sheathed in gold leaf and mirrored in its tranquil reflecting pond.', hours: '9:00 AM – 5:00 PM', visitHours: 1, costMin: 500, costMax: 500, currency: 'JPY', ticketUrl: 'https://www.shokoku-ji.jp' },
  // Osaka
  { id: 'osaka-1', destinationId: 'osaka', name: 'Osaka Castle', icon: '🏯', coordinates: { latitude: 34.6873, longitude: 135.5259 }, category: 'historic', bio: 'A grand five-storey castle amid moats and cherry trees, a symbol of Japan\'s 16th-century unification.', hours: '9:00 AM – 5:00 PM', visitHours: 2, costMin: 600, costMax: 600, currency: 'JPY', ticketUrl: 'https://www.osakacastle.net' },
  { id: 'osaka-2', destinationId: 'osaka', name: 'Dotonbori', icon: '🎡', coordinates: { latitude: 34.6687, longitude: 135.5013 }, category: 'entertainment', bio: 'A neon-drenched canal district of giant signboards, street food, and the famous Glico running man.', hours: 'Open 24 hours', visitHours: 2, free: true },
  // Sydney
  { id: 'sydney-1', destinationId: 'sydney', name: 'Opera House', icon: '🎭', coordinates: { latitude: -33.8568, longitude: 151.2153 }, category: 'landmark', bio: 'The sail-shelled performing arts centre on the harbour, one of the 20th century\'s great buildings.', hours: '9:00 AM – 5:00 PM (tours)', visitHours: 1.5, costMin: 45, costMax: 45, currency: 'AUD', ticketUrl: 'https://www.sydneyoperahouse.com' },
  { id: 'sydney-2', destinationId: 'sydney', name: 'Harbour Bridge', icon: '🌉', coordinates: { latitude: -33.8523, longitude: 151.2108 }, category: 'landmark', bio: 'The "Coathanger", a colossal steel arch you can climb for unrivalled views across Sydney Harbour.', hours: 'Open 24 hours', visitHours: 2, free: true },
  { id: 'sydney-3', destinationId: 'sydney', name: 'Bondi Beach', icon: '🏄', coordinates: { latitude: -33.8908, longitude: 151.2743 }, category: 'beach', bio: 'Australia\'s most famous beach, a golden crescent of surf, sand, and a scenic clifftop coastal walk.', hours: 'Open 24 hours', visitHours: 2.5, free: true },
  // Great Barrier Reef
  { id: 'great-barrier-reef-1', destinationId: 'great-barrier-reef', name: 'Heart Reef', icon: '❤️', coordinates: { latitude: -20.0000, longitude: 149.0000 }, category: 'nature', bio: 'A naturally heart-shaped coral formation in the Whitsundays, best admired on a scenic flight.', hours: 'Scenic flights daytime', visitHours: 1, costMin: 300, costMax: 600, currency: 'AUD' },
  { id: 'great-barrier-reef-2', destinationId: 'great-barrier-reef', name: 'Whitehaven Beach', icon: '🏖️', coordinates: { latitude: -20.2739, longitude: 149.0366 }, category: 'beach', bio: '7km of pure silica sand so white it barely warms, swirling with turquoise tides at Hill Inlet.', hours: 'Open 24 hours', visitHours: 3, free: true },
  { id: 'great-barrier-reef-3', destinationId: 'great-barrier-reef', name: 'Coral Gardens', icon: '🐠', coordinates: { latitude: -18.2871, longitude: 147.6992 }, category: 'nature', bio: 'Vibrant snorkelling and dive sites teeming with tropical fish across the world\'s largest reef system.', hours: 'Daytime tours', visitHours: 3, free: true },
];
