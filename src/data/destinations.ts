import type { Destination } from '../types';

export const DESTINATIONS: Destination[] = [
  // ── NORTH AMERICA ──────────────────────────────────────────────────────────
  {
    id: 'nyc', name: 'New York City', country: 'United States', countryCode: 'US',
    continent: 'North America', coordinates: { latitude: 40.7128, longitude: -74.0060 },
    category: 'city', icon: '🗽', rank: 1,
    tagline: 'The city that never sleeps, where eight million stories unfold at once.',
    description: 'New York City is the cultural, financial, and media capital of the world. From the neon glow of Times Square to the serenity of Central Park, every neighborhood pulses with its own distinct energy. The skyline alone is worth the trip.',
    whyVisit: ['Iconic skyline & culture', 'World-class arts & dining', 'Stories in every neighborhood'],
  },
  {
    id: 'la', name: 'Los Angeles', country: 'United States', countryCode: 'US',
    continent: 'North America', coordinates: { latitude: 34.0522, longitude: -118.2437 },
    category: 'city', icon: '🎬', rank: 1,
    tagline: 'Where dreams are manufactured and year-round sunshine is guaranteed.',
    description: 'Los Angeles is a sprawling metropolis of creativity, surf culture, and reinvention. Hollywood\'s golden legacy meets world-class beaches and a food scene shaped by every culture on Earth. The city thrives on the belief that anything is possible.',
    whyVisit: ['Year-round sunshine & beaches', 'Hollywood & creative energy', 'Incredible food from everywhere'],
  },
  {
    id: 'grand-canyon', name: 'Grand Canyon', country: 'United States', countryCode: 'US',
    continent: 'North America', coordinates: { latitude: 36.1069, longitude: -112.1129 },
    category: 'park', icon: '🏜️', rank: 1,
    tagline: 'A mile-deep masterpiece carved by five million years of river and time.',
    description: 'The Grand Canyon is one of Earth\'s most spectacular natural wonders — a vast chasm 277 miles long, up to 18 miles wide, and a mile deep. Carved by the Colorado River over millions of years, its layered red rock walls read like pages from a geological encyclopedia.',
    whyVisit: ["One of Earth's seven wonders", 'Epic rim trails & vistas', 'A billion years of geology'],
  },

  // ── EUROPE ─────────────────────────────────────────────────────────────────
  {
    id: 'paris', name: 'Paris', country: 'France', countryCode: 'FR',
    continent: 'Europe', coordinates: { latitude: 48.8566, longitude: 2.3522 },
    category: 'city', icon: '🗼', rank: 1,
    tagline: 'The city of light, love, and the finest pastries on the planet.',
    description: 'Paris is arguably the world\'s most beautiful city — a harmonious blend of grand Haussmann boulevards, iconic monuments, and intimate neighborhood cafés. The Eiffel Tower glitters at night, the Louvre holds a lifetime of art, and every arrondissement offers its own distinct personality.',
    whyVisit: ['Eiffel Tower at night', "World's greatest art museums", 'Unmatched café culture'],
  },
  {
    id: 'london', name: 'London', country: 'United Kingdom', countryCode: 'GB',
    continent: 'Europe', coordinates: { latitude: 51.5074, longitude: -0.1278 },
    category: 'city', icon: '🎡', rank: 1,
    tagline: "An empire's capital that reinvented itself as the world's cultural crossroads.",
    description: 'London is a city where medieval castles stand beside glass towers and black cabs navigate streets laid out centuries before the car existed. Its world-class museums are free, its theatre scene rivals Broadway, and its food now reflects every culture on the globe.',
    whyVisit: ['Millennia of living history', 'Free world-class museums', 'Iconic theatre & arts'],
  },
  {
    id: 'rome', name: 'Rome', country: 'Italy', countryCode: 'IT',
    continent: 'Europe', coordinates: { latitude: 41.9028, longitude: 12.4964 },
    category: 'city', icon: '🏟️', rank: 1,
    tagline: 'The Eternal City, where 2,000 years of history waits around every corner.',
    description: 'Rome is a city where you stumble upon ancient ruins while grabbing coffee. The Colosseum, Roman Forum, and Pantheon stand remarkably intact alongside Baroque fountains and Renaissance basilicas. Add gelato, pasta, and evening aperitivo hour, and Rome becomes nearly impossible to leave.',
    whyVisit: ['Ancient ruins still standing', 'Gelato & pasta perfection', 'Grand piazzas & fountains'],
  },
  {
    id: 'barcelona', name: 'Barcelona', country: 'Spain', countryCode: 'ES',
    continent: 'Europe', coordinates: { latitude: 41.3851, longitude: 2.1734 },
    category: 'city', icon: '🦎', rank: 1,
    tagline: "Gaudí's living canvas where architecture, beaches, and Mediterranean life meet.",
    description: 'Barcelona is a city of architectural wonder, golden beaches, and a culinary culture stretching from market stalls to Michelin stars. Antoni Gaudí\'s organic masterpieces — Sagrada Família, Park Güell, and Casa Batlló — make Barcelona visually unlike any other city on Earth.',
    whyVisit: ["Gaudí's surreal masterworks", 'Beautiful Mediterranean coast', 'Vibrant tapas & nightlife'],
  },
  {
    id: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', countryCode: 'NL',
    continent: 'Europe', coordinates: { latitude: 52.3676, longitude: 4.9041 },
    category: 'city', icon: '🌷', rank: 1,
    tagline: 'A city of canals, bicycles, and a quiet genius for beauty and tolerance.',
    description: "Amsterdam's 17th-century canal ring is a UNESCO World Heritage Site, lined with narrow merchant houses that lean gently toward the water. Its extraordinary museums — Rijksmuseum, Van Gogh, Anne Frank's house — sit alongside a laid-back café culture that makes visitors want to stay forever.",
    whyVisit: ['Fairy-tale canal views', 'Exceptional art museums', 'Charming cycling culture'],
  },
  {
    id: 'prague', name: 'Prague', country: 'Czech Republic', countryCode: 'CZ',
    continent: 'Europe', coordinates: { latitude: 50.0755, longitude: 14.4378 },
    category: 'city', icon: '🕰️', rank: 1,
    tagline: 'A fairy-tale skyline that survived two world wars nearly untouched.',
    description: 'Prague is perhaps Europe\'s most perfectly preserved medieval city, its Gothic spires and Baroque palaces reflected in the Vltava River below. The astronomical clock still marks the hours in the Old Town Square, and the hilltop castle complex offers sweeping views over a thousand years of Czech history.',
    whyVisit: ["Europe's finest medieval city", 'Old town streets unchanged', 'Legendary Czech beer culture'],
  },
  {
    id: 'santorini', name: 'Santorini', country: 'Greece', countryCode: 'GR',
    continent: 'Europe', coordinates: { latitude: 36.3932, longitude: 25.4615 },
    category: 'beach', icon: '🌅', rank: 1,
    tagline: 'A crescent of volcanic cliffs, blue domes, and legendary Aegean sunsets.',
    description: 'Santorini is the remnant of a catastrophic volcanic eruption that created one of the world\'s most dramatic landscapes. Whitewashed villages cling to caldera cliffs above the deep Aegean, and the sunsets over Oia are so famous they draw travelers from every corner of the globe.',
    whyVisit: ['World-famous Aegean sunsets', 'Iconic blue-domed villages', 'Volcanic cliffs & beaches'],
  },

  // ── ASIA ───────────────────────────────────────────────────────────────────
  {
    id: 'tokyo', name: 'Tokyo', country: 'Japan', countryCode: 'JP',
    continent: 'Asia', coordinates: { latitude: 35.6762, longitude: 139.6503 },
    category: 'city', icon: '⛩️', rank: 1,
    tagline: 'The future and the ancient past, coexisting perfectly in the world\'s largest city.',
    description: 'Tokyo is a city of extraordinary contradictions — ancient temples nestled between gleaming skyscrapers, vending machines selling everything imaginable, and a food culture so refined it has more Michelin stars than any other city on Earth. Its punctual trains and deep attention to detail make it unlike any other metropolis.',
    whyVisit: ['Future meets ancient tradition', "World's greatest food city", 'Safe, vibrant & electric'],
  },
  {
    id: 'kyoto', name: 'Kyoto', country: 'Japan', countryCode: 'JP',
    continent: 'Asia', coordinates: { latitude: 35.0116, longitude: 135.7681 },
    category: 'city', icon: '🍵', rank: 1,
    tagline: 'A thousand temples and the quiet, unhurried heart of traditional Japan.',
    description: "Kyoto was Japan's imperial capital for over a millennium, and its cultural legacy is staggering — 17 UNESCO World Heritage Sites, over 1,600 Buddhist temples, and 400 Shinto shrines. The Fushimi Inari shrine's tunnel of torii gates and Arashiyama's bamboo groves are among Asia's most beautiful sights.",
    whyVisit: ['Over 1,600 temples to explore', 'Iconic torii gate tunnels', 'Cherry blossoms in spring'],
  },
  {
    id: 'osaka', name: 'Osaka', country: 'Japan', countryCode: 'JP',
    continent: 'Asia', coordinates: { latitude: 34.6937, longitude: 135.5023 },
    category: 'city', icon: '🏯', rank: 2,
    tagline: "Japan's kitchen and its most deliciously chaotic city.",
    description: "Osaka is Japan's culinary capital and its most boisterous city — a place where locals say you'll eat yourself broke. Dotonbori's neon-lit canal, Osaka Castle's towering keep, and the labyrinthine Kuromon Market give the city an energy all its own. It's louder, friendlier, and hungrier than Tokyo.",
    whyVisit: ['World-class street food scene', 'Dazzling Dotonbori nightlife', 'Osaka Castle & historic sites'],
  },

  // ── OCEANIA ────────────────────────────────────────────────────────────────
  {
    id: 'sydney', name: 'Sydney', country: 'Australia', countryCode: 'AU',
    continent: 'Oceania', coordinates: { latitude: -33.8688, longitude: 151.2093 },
    category: 'city', icon: '🎭', rank: 1,
    tagline: 'Opera sails, a harbour bridge, and the world\'s most beautiful city beaches.',
    description: "Sydney is one of the world's most livable and beautiful cities. Its harbour — bridged by one of engineering's great achievements and anchored by the iconic Opera House — is simply stunning. Bondi Beach's surf culture, the Blue Mountains nearby, and a restaurant scene drawing on the world's most diverse immigrant population make Sydney endlessly rewarding.",
    whyVisit: ['Iconic Opera House harbour', 'World-famous Bondi Beach', 'The perfect outdoor lifestyle'],
  },
  {
    id: 'great-barrier-reef', name: 'Great Barrier Reef', country: 'Australia', countryCode: 'AU',
    continent: 'Oceania', coordinates: { latitude: -18.2871, longitude: 147.6992 },
    category: 'nature', icon: '🐠', rank: 1,
    tagline: 'The world\'s largest living structure, visible from outer space.',
    description: 'The Great Barrier Reef stretches 1,400 miles along Australia\'s northeast coast — the world\'s largest coral reef system and one of the seven natural wonders of the world. Over 1,500 fish species, 4,000 mollusc species, and 600 coral types create an underwater ecosystem of breathtaking complexity.',
    whyVisit: ["World's largest reef system", 'Over 1,500 fish species', 'Ultimate diving paradise'],
  },
];
