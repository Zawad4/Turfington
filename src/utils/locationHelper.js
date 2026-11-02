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
 * Strict English reverse-geocoding via OpenStreetMap Nominatim
 */
export async function fetchEnglishReverseGeocode(lat, lon, zoom = 14) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=${zoom}&accept-language=en`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=1.0'
      }
    });

    if (!res.ok) throw new Error('Geocoding response not ok');
    const data = await res.json();
    const addr = data.address || {};

    const rawCity = addr.city || addr.town || addr.suburb || addr.county || addr.state_district || 'Chennai';
    const rawRoad = addr.road || addr.neighbourhood || addr.suburb || '';

    const city = sanitizeLocationToEnglish(rawCity);
    const road = rawRoad ? sanitizeLocationToEnglish(rawRoad) : '';
    const state = sanitizeLocationToEnglish(addr.state || 'Tamil Nadu');

    let fullAddress;
    if (road && road !== city) {
      fullAddress = `${road}, ${city}`;
    } else {
      fullAddress = `${city}, ${state}`;
    }

    return {
      city,
      road,
      state,
      fullAddress: sanitizeLocationToEnglish(fullAddress),
      raw: data
    };
  } catch (err) {
    console.warn('English reverse-geocode notice:', err);
    return {
      city: 'Chennai',
      road: '',
      state: 'Tamil Nadu',
      fullAddress: 'Chennai, Tamil Nadu',
      raw: null
    };
  }
}

/**
 * Strict English address search via OpenStreetMap Nominatim
 */
export async function fetchEnglishSearchGeocode(query) {
  try {
    const cleanQuery = sanitizeLocationToEnglish(query);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1&accept-language=en`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=1.0'
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(item => ({
      ...item,
      display_name: sanitizeLocationToEnglish(item.display_name)
    }));
  } catch (err) {
    console.warn('English search-geocode notice:', err);
    return [];
  }
}
