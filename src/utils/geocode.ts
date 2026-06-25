import type { Continent } from '../types';

export interface GeoResult {
  name: string;
  city?: string;
  region?: string;
  country: string;
  countryCode: string;
  continent: Continent;
  coordinates: { latitude: number; longitude: number };
}

const COUNTRY_TO_CONTINENT: Record<string, Continent> = {
  DZ:'Africa',EG:'Africa',LY:'Africa',MA:'Africa',SD:'Africa',TN:'Africa',ET:'Africa',
  KE:'Africa',NG:'Africa',ZA:'Africa',GH:'Africa',TZ:'Africa',UG:'Africa',MZ:'Africa',
  MG:'Africa',CM:'Africa',CI:'Africa',NE:'Africa',ML:'Africa',BF:'Africa',SN:'Africa',
  GN:'Africa',RW:'Africa',BI:'Africa',SS:'Africa',SO:'Africa',CD:'Africa',CG:'Africa',
  GA:'Africa',CF:'Africa',TD:'Africa',AO:'Africa',ZM:'Africa',ZW:'Africa',BW:'Africa',
  NA:'Africa',SZ:'Africa',LS:'Africa',MR:'Africa',GM:'Africa',SL:'Africa',LR:'Africa',
  TG:'Africa',BJ:'Africa',GW:'Africa',CV:'Africa',ST:'Africa',KM:'Africa',MU:'Africa',
  SC:'Africa',DJ:'Africa',ER:'Africa',MW:'Africa',GQ:'Africa',
  AF:'Asia',AM:'Asia',AZ:'Asia',BH:'Asia',BD:'Asia',BT:'Asia',BN:'Asia',KH:'Asia',
  CN:'Asia',CY:'Asia',GE:'Asia',IN:'Asia',ID:'Asia',IR:'Asia',IQ:'Asia',IL:'Asia',
  JP:'Asia',JO:'Asia',KZ:'Asia',KW:'Asia',KG:'Asia',LA:'Asia',LB:'Asia',MY:'Asia',
  MV:'Asia',MN:'Asia',MM:'Asia',NP:'Asia',KP:'Asia',OM:'Asia',PK:'Asia',PS:'Asia',
  PH:'Asia',QA:'Asia',SA:'Asia',SG:'Asia',KR:'Asia',LK:'Asia',SY:'Asia',TW:'Asia',
  TJ:'Asia',TH:'Asia',TL:'Asia',TR:'Asia',TM:'Asia',AE:'Asia',UZ:'Asia',VN:'Asia',
  YE:'Asia',HK:'Asia',MO:'Asia',
  AL:'Europe',AD:'Europe',AT:'Europe',BY:'Europe',BE:'Europe',BA:'Europe',BG:'Europe',
  HR:'Europe',CZ:'Europe',DK:'Europe',EE:'Europe',FI:'Europe',FR:'Europe',DE:'Europe',
  GR:'Europe',HU:'Europe',IS:'Europe',IE:'Europe',IT:'Europe',XK:'Europe',LV:'Europe',
  LI:'Europe',LT:'Europe',LU:'Europe',MT:'Europe',MD:'Europe',MC:'Europe',ME:'Europe',
  NL:'Europe',MK:'Europe',NO:'Europe',PL:'Europe',PT:'Europe',RO:'Europe',RU:'Europe',
  SM:'Europe',RS:'Europe',SK:'Europe',SI:'Europe',ES:'Europe',SE:'Europe',CH:'Europe',
  UA:'Europe',GB:'Europe',VA:'Europe',
  AG:'North America',BS:'North America',BB:'North America',BZ:'North America',
  CA:'North America',CR:'North America',CU:'North America',DM:'North America',
  DO:'North America',SV:'North America',GD:'North America',GT:'North America',
  HT:'North America',HN:'North America',JM:'North America',MX:'North America',
  NI:'North America',PA:'North America',KN:'North America',LC:'North America',
  VC:'North America',TT:'North America',US:'North America',
  AU:'Oceania',FJ:'Oceania',KI:'Oceania',MH:'Oceania',FM:'Oceania',NR:'Oceania',
  NZ:'Oceania',PW:'Oceania',PG:'Oceania',WS:'Oceania',SB:'Oceania',TO:'Oceania',
  TV:'Oceania',VU:'Oceania',
  AR:'South America',BO:'South America',BR:'South America',CL:'South America',
  CO:'South America',EC:'South America',GY:'South America',PY:'South America',
  PE:'South America',SR:'South America',UY:'South America',VE:'South America',
};

export function getContinent(countryCode: string): Continent {
  return COUNTRY_TO_CONTINENT[countryCode.toUpperCase()] ?? 'Asia';
}

export async function searchPlaces(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&accept-language=en`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'TripGlide/1.0' } });
  const data = await res.json();
  return data.map((item: any) => {
    const addr = item.address ?? {};
    const countryCode = (addr.country_code ?? 'US').toUpperCase();
    return {
      name: item.display_name.split(',')[0],
      city: addr.city ?? addr.town ?? addr.village ?? addr.hamlet,
      region: addr.state ?? addr.county,
      country: addr.country ?? 'Unknown',
      countryCode,
      continent: getContinent(countryCode),
      coordinates: { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) },
    } as GeoResult;
  });
}

export async function reverseGeocode(
  lat: number, lng: number
): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'TripGlide/1.0' } });
  const data = await res.json();
  if (data.error) return null;
  const addr = data.address ?? {};
  const countryCode = (addr.country_code ?? 'US').toUpperCase();
  const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet;
  return {
    name: city ?? addr.state ?? addr.country ?? 'Unknown',
    city,
    region: addr.state ?? addr.county,
    country: addr.country ?? 'Unknown',
    countryCode,
    continent: getContinent(countryCode),
    coordinates: { latitude: lat, longitude: lng },
  };
}
