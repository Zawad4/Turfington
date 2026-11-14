/**
 * Universal Location & English Geocoding Helper
 * Ensures all location, city, and address strings are strictly in English throughout the app.
 */

// Dictionary of known Tamil script location names mapped to their official English names
const TAMIL_TO_ENGLISH_MAP = {
  // Cities & Districts
  'சென்னை': 'Chennai',
  'தமிழ்நாடு': 'Tamil Nadu',
  'இந்தியா': 'India',
  'கோயம்புத்தூர்': 'Coimbatore',
  'மதுரை': 'Madurai',
  'திருச்சிராப்பள்ளி': 'Tiruchirappalli',
  'திருச்சி': 'Trichy',
  'சேலம்': 'Salem',
  'திருநெல்வேலி': 'Tirunelveli',
  'திருப்பூர்': 'Tiruppur',
  'ஈரோடு': 'Erode',
  'வேலூர்': 'Vellore',
  'தூத்துக்குடி': 'Thoothukudi',
  'திண்டுக்கல்': 'Dindigul',
  'தஞ்சாவூர்': 'Thanjavur',
  'காஞ்சிபுரம்': 'Kanchipuram',
  'நாகர்கோவில்': 'Nagercoil',
  'கடலூர்': 'Cuddalore',
  'கும்பகோணம்': 'Kumbakonam',
  'திருவள்ளூர்': 'Tiruvallur',
  'செங்கல்பட்டு': 'Chengalpattu',
  'விழுப்புரம்': 'Viluppuram',
  'கிருஷ்ணகிரி': 'Krishnagiri',
  'தருமபுரி': 'Dharmapuri',
  'நாமக்கல்': 'Namakkal',
  'கரூர்': 'Karur',
  'சிவகங்கை': 'Sivaganga',
  'ராமநாதபுரம்': 'Ramanathapuram',
  'விருதுநகர்': 'Virudhunagar',
  'தேனி': 'Theni',
  'புதுக்கோட்டை': 'Pudukkottai',
  'அரியலூர்': 'Ariyalur',
  'பெரம்பலூர்': 'Perambalur',
  'நாகப்பட்டினம்': 'Nagapattinam',
  'மயிலாடுதுறை': 'Mayiladuthurai',
  'தென்காசி': 'Tenkasi',
  'திருப்பத்தூர்': 'Tirupathur',
  'ராணிப்பேட்டை': 'Ranipet',
  'கள்ளக்குறிச்சி': 'Kallakurichi',

  // Chennai Areas, Suburbs & Landmarks
  'அண்ணா நகர்': 'Anna Nagar',
  'அண்ணாநகர்': 'Anna Nagar',
  'தியாகராய நகர்': 'T. Nagar',
  'தி. நகர்': 'T. Nagar',
  'அடையாறு': 'Adyar',
  'அடையார்': 'Adyar',
  'வேளச்சேரி': 'Velachery',
  'மயிலாப்பூர்': 'Mylapore',
  'நுங்கம்பாக்கம்': 'Nungambakkam',
  'ஆலந்தூர்': 'Alandur',
  'கிண்டி': 'Guindy',
  'தாம்பரம்': 'Tambaram',
  'போரூர்': 'Porur',
  'பெரம்பூர்': 'Perambur',
  'வடபழனி': 'Vadapalani',
  'கோடம்பாக்கம்': 'Kodambakkam',
  'அண்ணா சாலை': 'Anna Salai',
  'பூந்தமல்லி': 'Poonamallee',
  'சோழிங்கநல்லூர்': 'Sholinganallur',
  'மேடவாக்கம்': 'Medavakkam',
  'ஈக்காட்டுத்தாங்கல்': 'Ekkattuthangal',
  'திருவான்மியூர்': 'Thiruvanmiyur',
  'ராயப்பேட்டை': 'Royapettah',
  'எழும்பூர்': 'Egmore',
  'பாரிமுனை': 'Parrys',
  'புரசைவாக்கம்': 'Purasawalkam',
  'திருவல்லிக்கேணி': 'Triplicane',
  'வில்லிவாக்கம்': 'Villivakkam',
  'அம்பத்தூர்': 'Ambattur',
  'ஆவடி': 'Avadi',
  'குரோம்பேட்டை': 'Chromepet',
  'பல்லாவரம்': 'Pallavaram',
  'கொளத்தூர்': 'Kolathur',
  'மாதவரம்': 'Madhavaram',
  'திருவொற்றியூர்': 'Tiruvottiyur',
  'துரைப்பாக்கம்': 'Thoraipakkam',
  'நீலாங்கரை': 'Neelankarai',
  'ஈஞ்சம்பாக்கம்': 'Injambakkam',
  'பல்லிக்கரணை': 'Pallikaranai',
  'பெருங்குடி': 'Perungudi',
  'நந்தனம்': 'Nandanam',
  'தேனாம்பேட்டை': 'Teynampet',
  'சைதாப்பேட்டை': 'Saidapet',
  'மந்தவெளி': 'Mandaveli',
  'கோட்டூர்புரம்': 'Kotturpuram',
  'சேத்துப்பட்டு': 'Chetpet',
  'சூளைமேடு': 'Choolaimedu',
  'அமைந்தகரை': 'Aminjikarai',
  'அயனாவரம்': 'Ayanavaram',
  'செம்பியம்': 'Sembium',
  'வியாசர்பாடி': 'Vyasarpadi',
  'தண்டையார்பேட்டை': 'Tondiarpet',
  'வண்ணாரப்பேட்டை': 'Washermanpet',
  'ராயபுரம்': 'Royapuram'
};

/**
 * Strips or transliterates any Tamil text into clean English.
 */
export function sanitizeLocationToEnglish(rawText) {
  if (!rawText || typeof rawText !== 'string') return 'Chennai, Tamil Nadu';
  let str = rawText.trim();
  if (!str) return 'Chennai, Tamil Nadu';

  // Replace known Tamil words with their English translations
  for (const [tamil, english] of Object.entries(TAMIL_TO_ENGLISH_MAP)) {
    if (str.includes(tamil)) {
      str = str.split(tamil).join(english);
    }
  }

  // If any residual Tamil Unicode characters (U+0B80 - U+0BFF) remain, strip them
  if (/[\u0B80-\u0BFF]/.test(str)) {
    str = str.replace(/[\u0B80-\u0BFF]+/g, '').replace(/\s*,\s*,\s*/g, ', ').replace(/^,\s*|,\s*$/g, '').trim();
  }

  // If stripping left nothing or only punctuation, fallback to default English location
  if (!str || /^[\s,\-./#]+$/.test(str) || str.length < 2) {
    return 'Chennai, Tamil Nadu';
  }

  return str;
}

/**
 * Strict English reverse-geocoding.
 * Tries BigDataCloud client API first (CORS-friendly, no keys required, fast, high accuracy).
 * Falls back to Photon (Komoot/OSM) and then direct coordinates if needed.
 */
export async function fetchEnglishReverseGeocode(lat, lon, zoom = 14) {
  const numLat = parseFloat(lat);
  const numLon = parseFloat(lon);
  if (isNaN(numLat) || isNaN(numLon)) {
    return {
      city: 'Chennai',
      road: '',
      state: 'Tamil Nadu',
      country: 'India',
      fullAddress: 'Chennai, Tamil Nadu',
      raw: null
    };
  }

  // Provider 1: BigDataCloud Client Reverse Geocode API
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${numLat}&longitude=${numLon}&localityLanguage=en`;
    const res = await fetch(bdcUrl, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      const admin = data.localityInfo?.administrative || [];
      const sorted = [...admin].sort((a, b) => (b.order || 0) - (a.order || 0));
      const country = data.countryName || 'India';
      const state = data.principalSubdivision || '';
      const rawCity = data.city || data.locality || '';
      
      const excludePatterns = ['district', 'area', 'taluk', 'corporation', 'circle', 'division', 'region', 'zone', 'subdivision', 'planning'];
      const subAreaObj = sorted.find(a => {
        if (!a.name) return false;
        const lower = a.name.toLowerCase();
        if (a.name === country || a.name === state || a.name === rawCity) return false;
        if (rawCity && lower.startsWith(rawCity.toLowerCase())) return false;
        return !excludePatterns.some(p => lower.includes(p));
      });

      const subArea = subAreaObj ? subAreaObj.name : '';
      const city = sanitizeLocationToEnglish(rawCity || subArea || state || 'Current Location');
      const cleanSubArea = subArea ? sanitizeLocationToEnglish(subArea) : '';
      const cleanState = state ? sanitizeLocationToEnglish(state) : '';

      let fullAddress = '';
      if (cleanSubArea && city && cleanSubArea !== city) {
        fullAddress = cleanState ? `${cleanSubArea}, ${city}, ${cleanState}` : `${cleanSubArea}, ${city}`;
      } else if (city && cleanState && city !== cleanState) {
        fullAddress = `${city}, ${cleanState}`;
      } else if (city) {
        fullAddress = city;
      } else if (cleanState) {
        fullAddress = cleanState;
      } else {
        fullAddress = country;
      }

      return {
        city,
        road: cleanSubArea,
        state: cleanState,
        country,
        fullAddress: sanitizeLocationToEnglish(fullAddress),
        raw: data
      };
    }
  } catch (err) {
    console.warn('BigDataCloud reverse-geocode failed, trying Photon:', err);
  }

  // Provider 2: Photon Reverse Geocode (Komoot/OSM)
  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${numLat}&lon=${numLon}`;
    const pRes = await fetch(photonUrl);
    if (pRes.ok) {
      const pData = await pRes.json();
      const p = pData.features?.[0]?.properties;
      if (p) {
        const city = sanitizeLocationToEnglish(p.city || p.town || p.district || p.name || '');
        const state = sanitizeLocationToEnglish(p.state || '');
        const road = sanitizeLocationToEnglish(p.street || p.name || '');
        const country = p.country || 'India';
        const parts = [road, city, state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
        const fullAddress = parts.join(', ') || city || country;
        return {
          city: city || state || 'Current Location',
          road,
          state,
          country,
          fullAddress: sanitizeLocationToEnglish(fullAddress),
          raw: pData
        };
      }
    }
  } catch (err) {
    console.warn('Photon reverse-geocode failed:', err);
  }

  // Provider 3: Fallback coordinates format (never fake Chennai when elsewhere)
  const coordAddress = `${numLat.toFixed(4)}° N, ${numLon.toFixed(4)}° E`;
  return {
    city: 'Current Location',
    road: '',
    state: '',
    country: 'India',
    fullAddress: coordAddress,
    raw: null
  };
}

/**
 * Strict English address search via Photon (Komoot) and Nominatim
 */
export async function fetchEnglishSearchGeocode(query) {
  if (!query || typeof query !== 'string') return [];
  const cleanQuery = sanitizeLocationToEnglish(query).trim();
  if (cleanQuery.length < 2) return [];

  // Provider 1: Photon Search Geocode (Komoot/OSM)
  try {
    const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=5`;
    const res = await fetch(pUrl);
    if (res.ok) {
      const data = await res.json();
      const features = data.features || [];
      if (features.length > 0) {
        return features.map(f => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [0, 0];
          const parts = [p.name, p.district, p.city, p.state, p.country].filter(Boolean);
          const uniqueParts = [...new Set(parts)];
          const displayName = uniqueParts.join(', ');
          return {
            lat: coords[1]?.toString() || '0',
            lon: coords[0]?.toString() || '0',
            display_name: sanitizeLocationToEnglish(displayName),
            address: {
              city: sanitizeLocationToEnglish(p.city || p.town || p.name || ''),
              state: sanitizeLocationToEnglish(p.state || ''),
              country: p.country || 'India',
              postcode: p.postcode || ''
            }
          };
        });
      }
    }
  } catch (err) {
    console.warn('Photon search geocode failed:', err);
  }

  // Provider 2: Nominatim Search Geocode
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=3&accept-language=en`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=1.0'
      }
    });
    if (res.ok) {
      const data = await res.json();
      return (data || []).map(item => ({
        ...item,
        display_name: sanitizeLocationToEnglish(item.display_name)
      }));
    }
  } catch (err) {
    console.warn('Nominatim search geocode failed:', err);
  }

  return [];
}

