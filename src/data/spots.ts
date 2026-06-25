export interface Spot {
  id: string;
  destinationId: string;
  name: string;
  icon: string;
  coordinates: { latitude: number; longitude: number };
}

export const SPOTS: Spot[] = [
  // NYC
  { id: 'nyc-1', destinationId: 'nyc', name: 'Times Square', icon: '🎭', coordinates: { latitude: 40.7580, longitude: -73.9855 } },
  { id: 'nyc-2', destinationId: 'nyc', name: 'Central Park', icon: '🌳', coordinates: { latitude: 40.7851, longitude: -73.9683 } },
  { id: 'nyc-3', destinationId: 'nyc', name: 'Empire State Building', icon: '🏙️', coordinates: { latitude: 40.7484, longitude: -73.9967 } },
  // Los Angeles
  { id: 'la-1', destinationId: 'la', name: 'Hollywood Sign', icon: '🎬', coordinates: { latitude: 34.1341, longitude: -118.3215 } },
  { id: 'la-2', destinationId: 'la', name: 'Santa Monica Pier', icon: '🎡', coordinates: { latitude: 34.0081, longitude: -118.4960 } },
  { id: 'la-3', destinationId: 'la', name: 'Griffith Observatory', icon: '🔭', coordinates: { latitude: 34.1184, longitude: -118.3004 } },
  // Grand Canyon
  { id: 'grand-canyon-1', destinationId: 'grand-canyon', name: 'Mather Point', icon: '👁️', coordinates: { latitude: 36.0572, longitude: -112.1069 } },
  { id: 'grand-canyon-2', destinationId: 'grand-canyon', name: 'Bright Angel Trail', icon: '🥾', coordinates: { latitude: 36.0561, longitude: -112.1428 } },
  { id: 'grand-canyon-3', destinationId: 'grand-canyon', name: 'Yavapai Point', icon: '🌅', coordinates: { latitude: 36.0660, longitude: -112.1019 } },
  // Paris
  { id: 'paris-1', destinationId: 'paris', name: 'Eiffel Tower', icon: '🗼', coordinates: { latitude: 48.8584, longitude: 2.2945 } },
  { id: 'paris-2', destinationId: 'paris', name: 'The Louvre', icon: '🎨', coordinates: { latitude: 48.8606, longitude: 2.3376 } },
  { id: 'paris-3', destinationId: 'paris', name: 'Notre-Dame', icon: '⛪', coordinates: { latitude: 48.8530, longitude: 2.3499 } },
  // London
  { id: 'london-1', destinationId: 'london', name: 'Big Ben', icon: '🕰️', coordinates: { latitude: 51.5007, longitude: -0.1246 } },
  { id: 'london-2', destinationId: 'london', name: 'Tower of London', icon: '🏰', coordinates: { latitude: 51.5081, longitude: -0.0759 } },
  { id: 'london-3', destinationId: 'london', name: 'Buckingham Palace', icon: '👑', coordinates: { latitude: 51.5014, longitude: -0.1419 } },
  // Rome
  { id: 'rome-1', destinationId: 'rome', name: 'Colosseum', icon: '🏟️', coordinates: { latitude: 41.8902, longitude: 12.4922 } },
  { id: 'rome-2', destinationId: 'rome', name: 'Trevi Fountain', icon: '⛲', coordinates: { latitude: 41.9009, longitude: 12.4833 } },
  { id: 'rome-3', destinationId: 'rome', name: 'Vatican', icon: '✝️', coordinates: { latitude: 41.9022, longitude: 12.4539 } },
  // Barcelona
  { id: 'barcelona-1', destinationId: 'barcelona', name: 'Sagrada Família', icon: '⛪', coordinates: { latitude: 41.4036, longitude: 2.1744 } },
  { id: 'barcelona-2', destinationId: 'barcelona', name: 'Park Güell', icon: '🦎', coordinates: { latitude: 41.4145, longitude: 2.1527 } },
  { id: 'barcelona-3', destinationId: 'barcelona', name: 'La Boqueria', icon: '🍅', coordinates: { latitude: 41.3817, longitude: 2.1718 } },
  // Amsterdam
  { id: 'amsterdam-1', destinationId: 'amsterdam', name: 'Rijksmuseum', icon: '🎨', coordinates: { latitude: 52.3600, longitude: 4.8852 } },
  { id: 'amsterdam-2', destinationId: 'amsterdam', name: "Anne Frank's House", icon: '📖', coordinates: { latitude: 52.3752, longitude: 4.8840 } },
  { id: 'amsterdam-3', destinationId: 'amsterdam', name: 'Van Gogh Museum', icon: '🌻', coordinates: { latitude: 52.3584, longitude: 4.8811 } },
  // Prague
  { id: 'prague-1', destinationId: 'prague', name: 'Prague Castle', icon: '🏰', coordinates: { latitude: 50.0904, longitude: 14.4013 } },
  { id: 'prague-2', destinationId: 'prague', name: 'Charles Bridge', icon: '🌉', coordinates: { latitude: 50.0866, longitude: 14.4114 } },
  { id: 'prague-3', destinationId: 'prague', name: 'Old Town Square', icon: '⏰', coordinates: { latitude: 50.0870, longitude: 14.4201 } },
  // Santorini
  { id: 'santorini-1', destinationId: 'santorini', name: 'Oia Village', icon: '🌅', coordinates: { latitude: 36.4618, longitude: 25.3753 } },
  { id: 'santorini-2', destinationId: 'santorini', name: 'Akrotiri', icon: '🏛️', coordinates: { latitude: 36.3519, longitude: 25.4044 } },
  { id: 'santorini-3', destinationId: 'santorini', name: 'Red Beach', icon: '🏖️', coordinates: { latitude: 36.3478, longitude: 25.3939 } },
  // Tokyo
  { id: 'tokyo-1', destinationId: 'tokyo', name: 'Senso-ji Temple', icon: '⛩️', coordinates: { latitude: 35.7148, longitude: 139.7967 } },
  { id: 'tokyo-2', destinationId: 'tokyo', name: 'Shibuya Crossing', icon: '🚦', coordinates: { latitude: 35.6595, longitude: 139.7004 } },
  { id: 'tokyo-3', destinationId: 'tokyo', name: 'Tokyo Tower', icon: '📡', coordinates: { latitude: 35.6586, longitude: 139.7454 } },
  // Kyoto
  { id: 'kyoto-1', destinationId: 'kyoto', name: 'Fushimi Inari Shrine', icon: '⛩️', coordinates: { latitude: 34.9671, longitude: 135.7727 } },
  { id: 'kyoto-2', destinationId: 'kyoto', name: 'Arashiyama Bamboo', icon: '🎋', coordinates: { latitude: 35.0094, longitude: 135.6706 } },
  { id: 'kyoto-3', destinationId: 'kyoto', name: 'Kinkaku-ji', icon: '🥇', coordinates: { latitude: 35.0394, longitude: 135.7292 } },
  // Sydney
  { id: 'sydney-1', destinationId: 'sydney', name: 'Opera House', icon: '🎭', coordinates: { latitude: -33.8568, longitude: 151.2153 } },
  { id: 'sydney-2', destinationId: 'sydney', name: 'Harbour Bridge', icon: '🌉', coordinates: { latitude: -33.8523, longitude: 151.2108 } },
  { id: 'sydney-3', destinationId: 'sydney', name: 'Bondi Beach', icon: '🏄', coordinates: { latitude: -33.8908, longitude: 151.2743 } },
  // Great Barrier Reef
  { id: 'great-barrier-reef-1', destinationId: 'great-barrier-reef', name: 'Heart Reef', icon: '❤️', coordinates: { latitude: -20.0000, longitude: 149.0000 } },
  { id: 'great-barrier-reef-2', destinationId: 'great-barrier-reef', name: 'Whitehaven Beach', icon: '🏖️', coordinates: { latitude: -20.2739, longitude: 149.0366 } },
  { id: 'great-barrier-reef-3', destinationId: 'great-barrier-reef', name: 'Coral Gardens', icon: '🐠', coordinates: { latitude: -18.2871, longitude: 147.6992 } },
];
