/**
 * Region and State for the Location filter group.
 *
 * The database has no region or state column — `Creator.city` is the only place
 * field there is (backend/app/models/creator.py), and the creator facets return
 * cities alone. The redesign nonetheless asks for a Region → State → City chain,
 * so the two upper levels are derived here from the city facet and resolved back
 * down to cities at the API boundary: picking "South" submits the southern
 * cities that actually exist in the data, which the existing `cities` filter
 * already understands. Nothing new is asked of the backend, and the moment a
 * real `state` column lands, only `citiesWithin` has to change.
 *
 * A city this table doesn't know still appears under City. It is simply absent
 * from every Region and State, which is the honest answer — inventing a region
 * for it would silently exclude it from the region filter that "should" match.
 */

export interface Place {
  city: string;
  state: string;
  region: Region;
}

export type Region = 'North' | 'South' | 'East' | 'West' | 'Central' | 'North East';

export const REGIONS: Region[] = ['North', 'South', 'East', 'West', 'Central', 'North East'];

/**
 * Keyed on a normalised city name so the sheet's spelling variants land on one
 * row: "Bangalore"/"Bengaluru", "Gurgaon"/"Gurugram", "Bombay"/"Mumbai".
 */
const PLACES: Place[] = [
  { city: 'Mumbai', state: 'Maharashtra', region: 'West' },
  { city: 'Bombay', state: 'Maharashtra', region: 'West' },
  { city: 'Navi Mumbai', state: 'Maharashtra', region: 'West' },
  { city: 'Thane', state: 'Maharashtra', region: 'West' },
  { city: 'Pune', state: 'Maharashtra', region: 'West' },
  { city: 'Nagpur', state: 'Maharashtra', region: 'West' },
  { city: 'Nashik', state: 'Maharashtra', region: 'West' },
  { city: 'Ahmedabad', state: 'Gujarat', region: 'West' },
  { city: 'Surat', state: 'Gujarat', region: 'West' },
  { city: 'Vadodara', state: 'Gujarat', region: 'West' },
  { city: 'Rajkot', state: 'Gujarat', region: 'West' },
  { city: 'Panaji', state: 'Goa', region: 'West' },
  { city: 'Goa', state: 'Goa', region: 'West' },

  { city: 'Bengaluru', state: 'Karnataka', region: 'South' },
  { city: 'Bangalore', state: 'Karnataka', region: 'South' },
  { city: 'Mysuru', state: 'Karnataka', region: 'South' },
  { city: 'Mysore', state: 'Karnataka', region: 'South' },
  { city: 'Mangaluru', state: 'Karnataka', region: 'South' },
  { city: 'Chennai', state: 'Tamil Nadu', region: 'South' },
  { city: 'Coimbatore', state: 'Tamil Nadu', region: 'South' },
  { city: 'Madurai', state: 'Tamil Nadu', region: 'South' },
  { city: 'Hyderabad', state: 'Telangana', region: 'South' },
  { city: 'Warangal', state: 'Telangana', region: 'South' },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', region: 'South' },
  { city: 'Vijayawada', state: 'Andhra Pradesh', region: 'South' },
  { city: 'Kochi', state: 'Kerala', region: 'South' },
  { city: 'Cochin', state: 'Kerala', region: 'South' },
  { city: 'Thiruvananthapuram', state: 'Kerala', region: 'South' },
  { city: 'Kozhikode', state: 'Kerala', region: 'South' },
  { city: 'Thrissur', state: 'Kerala', region: 'South' },

  { city: 'Delhi', state: 'Delhi NCR', region: 'North' },
  { city: 'New Delhi', state: 'Delhi NCR', region: 'North' },
  { city: 'Gurugram', state: 'Delhi NCR', region: 'North' },
  { city: 'Gurgaon', state: 'Delhi NCR', region: 'North' },
  { city: 'Noida', state: 'Delhi NCR', region: 'North' },
  { city: 'Faridabad', state: 'Delhi NCR', region: 'North' },
  { city: 'Ghaziabad', state: 'Delhi NCR', region: 'North' },
  { city: 'Jaipur', state: 'Rajasthan', region: 'North' },
  { city: 'Udaipur', state: 'Rajasthan', region: 'North' },
  { city: 'Jodhpur', state: 'Rajasthan', region: 'North' },
  { city: 'Chandigarh', state: 'Chandigarh', region: 'North' },
  { city: 'Ludhiana', state: 'Punjab', region: 'North' },
  { city: 'Amritsar', state: 'Punjab', region: 'North' },
  { city: 'Jalandhar', state: 'Punjab', region: 'North' },
  { city: 'Lucknow', state: 'Uttar Pradesh', region: 'North' },
  { city: 'Kanpur', state: 'Uttar Pradesh', region: 'North' },
  { city: 'Varanasi', state: 'Uttar Pradesh', region: 'North' },
  { city: 'Agra', state: 'Uttar Pradesh', region: 'North' },
  { city: 'Prayagraj', state: 'Uttar Pradesh', region: 'North' },
  { city: 'Dehradun', state: 'Uttarakhand', region: 'North' },
  { city: 'Shimla', state: 'Himachal Pradesh', region: 'North' },
  { city: 'Srinagar', state: 'Jammu and Kashmir', region: 'North' },
  { city: 'Jammu', state: 'Jammu and Kashmir', region: 'North' },

  { city: 'Kolkata', state: 'West Bengal', region: 'East' },
  { city: 'Calcutta', state: 'West Bengal', region: 'East' },
  { city: 'Siliguri', state: 'West Bengal', region: 'East' },
  { city: 'Howrah', state: 'West Bengal', region: 'East' },
  { city: 'Patna', state: 'Bihar', region: 'East' },
  { city: 'Ranchi', state: 'Jharkhand', region: 'East' },
  { city: 'Jamshedpur', state: 'Jharkhand', region: 'East' },
  { city: 'Bhubaneswar', state: 'Odisha', region: 'East' },
  { city: 'Cuttack', state: 'Odisha', region: 'East' },

  { city: 'Indore', state: 'Madhya Pradesh', region: 'Central' },
  { city: 'Bhopal', state: 'Madhya Pradesh', region: 'Central' },
  { city: 'Gwalior', state: 'Madhya Pradesh', region: 'Central' },
  { city: 'Jabalpur', state: 'Madhya Pradesh', region: 'Central' },
  { city: 'Raipur', state: 'Chhattisgarh', region: 'Central' },

  { city: 'Guwahati', state: 'Assam', region: 'North East' },
  { city: 'Shillong', state: 'Meghalaya', region: 'North East' },
  { city: 'Imphal', state: 'Manipur', region: 'North East' },
  { city: 'Agartala', state: 'Tripura', region: 'North East' },
  { city: 'Aizawl', state: 'Mizoram', region: 'North East' },
  { city: 'Itanagar', state: 'Arunachal Pradesh', region: 'North East' },
  { city: 'Gangtok', state: 'Sikkim', region: 'North East' },
];

function normalise(city: string): string {
  return city.trim().toLowerCase();
}

const BY_CITY = new Map(PLACES.map((place) => [normalise(place.city), place]));

/** The state and region a city sits in, or null when the table doesn't know it. */
export function placeFor(city: string | null | undefined): Place | null {
  if (!city) return null;
  return BY_CITY.get(normalise(city)) ?? null;
}

/** "Mumbai, Maharashtra · West India" — the drawer's Location row. */
export function describePlace(city: string | null | undefined): string {
  if (!city) return '—';
  const place = placeFor(city);
  if (!place) return city;
  return `${city}, ${place.state} · ${place.region} India`;
}

/** The state line under the city in the results table, blank when unknown. */
export function stateOf(city: string | null | undefined): string {
  return placeFor(city)?.state ?? '';
}

const sortUnique = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

/**
 * The Region options that the facet's cities actually justify. Offering a region
 * with nothing behind it produces a filter that can only ever return zero rows.
 */
export function regionsIn(cities: string[]): Region[] {
  const present = new Set(cities.map((city) => placeFor(city)?.region).filter(Boolean) as Region[]);
  return REGIONS.filter((region) => present.has(region));
}

/** States inside the chosen regions (all states when no region is chosen). */
export function statesIn(cities: string[], regions: string[]): string[] {
  return sortUnique(
    cities
      .map(placeFor)
      .filter((place): place is Place => place !== null)
      .filter((place) => !regions.length || regions.includes(place.region))
      .map((place) => place.state),
  );
}

/**
 * Cities inside the chosen regions and states. Cities the table doesn't know
 * survive only while neither upper level is set — once someone picks a region,
 * an unplaceable city can't honestly be claimed to be in it.
 */
export function citiesIn(cities: string[], regions: string[], states: string[]): string[] {
  if (!regions.length && !states.length) return sortUnique(cities);
  return sortUnique(
    cities.filter((city) => {
      const place = placeFor(city);
      if (!place) return false;
      if (regions.length && !regions.includes(place.region)) return false;
      if (states.length && !states.includes(place.state)) return false;
      return true;
    }),
  );
}

/**
 * The `cities` value to put on the wire.
 *
 * An explicit city pick always wins. Otherwise a region or state selection is
 * expanded into the cities it covers, which is what makes the upper two levels
 * work against a backend that only filters on city.
 */
export function resolveCityFilter(
  facetCities: string[],
  regions: string[],
  states: string[],
  cities: string[],
): string[] {
  if (cities.length) return cities;
  if (!regions.length && !states.length) return [];
  return citiesIn(facetCities, regions, states);
}
