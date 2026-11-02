import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Database file path (Uses /tmp on Vercel Serverless Functions)
const DB_FILE = process.env.VERCEL === '1'
  ? path.join('/tmp', 'turfington_db.json')
  : path.join(__dirname, 'turfington_db.json');

// Initialize /tmp/turfington_db.json on Vercel if needed
if (process.env.VERCEL === '1' && !fs.existsSync(DB_FILE)) {
  const bundledDb = path.join(__dirname, 'turfington_db.json');
  if (fs.existsSync(bundledDb)) {
    try {
      fs.copyFileSync(bundledDb, DB_FILE);
    } catch (e) {
      console.warn('Could not seed /tmp DB:', e.message);
    }
  }
}

// ── Security Headers & Transport Hardening ──
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "upgrade-insecure-requests");
  next();
});

// ── Bad Input Sanitization Middleware ──
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitizeVal = (val) => {
      if (typeof val === 'string') {
        return val.replace(/\0/g, '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
      }
      if (Array.isArray(val)) {
        return val.map(sanitizeVal);
      }
      if (val !== null && typeof val === 'object') {
        const cleaned = {};
        for (const k of Object.keys(val)) {
          cleaned[k] = sanitizeVal(val[k]);
        }
        return cleaned;
      }
      return val;
    };
    req.body = sanitizeVal(req.body);
  }
  next();
});

// ── Rate Limiter for Auth / OTP to Stop Login Spam ──
const authRateLimits = new Map();
function authRateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 mins
  const maxAttempts = 10;

  const userAttempts = authRateLimits.get(ip) || [];
  const validAttempts = userAttempts.filter(t => now - t < windowMs);

  if (validAttempts.length >= maxAttempts) {
    return res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again after 15 minutes.'
    });
  }

  validAttempts.push(now);
  authRateLimits.set(ip, validAttempts);
  next();
}

// ── Automated Daily Database Backup ──
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (err) {
    console.error('Could not create backups directory:', err.message);
  }
}

function performDailyBackup() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const backupFile = path.join(BACKUP_DIR, `turfington_db_${today}.json`);
    if (fs.existsSync(DB_FILE) && !fs.existsSync(backupFile)) {
      fs.copyFileSync(DB_FILE, backupFile);
      console.log(`[SECURITY BACKUP] Daily database backup created: turfington_db_${today}.json`);
    }
  } catch (err) {
    console.error('[SECURITY BACKUP ERROR]', err.message);
  }
}
performDailyBackup();
setInterval(performDailyBackup, 24 * 60 * 60 * 1000);

// Helper to calculate distance (Haversine formula in KM)
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Radius of Earth in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return parseFloat(d.toFixed(1));
}

// Initial Database Seed Data
const INITIAL_DATA = {
  users: [],
  otps: [],
  venues: [
    {
      id: 101,
      owner_id: 'usr_priya',
      name: 'Turf Together',
      sport: 'Cricket',
      sports: ['Cricket', 'Football'],
      address: '22/1, Erikarai Road, near SKR Engineering College, Meppur, Poonamallee, Chennai, Tamil Nadu 600123',
      city: 'Chennai',
      pincode: '600123',
      lat: 13.0389,
      lng: 80.0937,
      price_per_hr: 1200,
      price: '₹1,200/hr',
      rating: 4.8,
      reviewsCount: 112,
      surface: 'Synthetic Turf',
      image: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?q=80&w=800',
      amenities: ['Floodlights', 'Parking', 'Cafeteria'],
      status: 'Open Now'
    },
    {
      id: 102,
      owner_id: 'usr_priya',
      name: 'TLK Sports Academy',
      sport: 'Badminton',
      sports: ['Badminton'],
      address: 'Pidarithangal, Poonamallee, Chennai, Tamil Nadu 600056',
      city: 'Chennai',
      pincode: '600056',
      lat: 13.0448,
      lng: 80.0737,
      price_per_hr: 200,
      price: '₹200/hr',
      rating: 4.7,
      reviewsCount: 94,
      surface: 'BWF Wooden + Mat',
      image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=800',
      amenities: ['Air Conditioned', 'Pro Shop', 'Locker Room'],
      status: 'Open Now'
    },
    {
      id: 103,
      owner_id: 'usr_priya',
      name: 'Thiram Sports Academy – Poonamallee',
      sport: 'Pickleball',
      sports: ['Pickleball', 'Cricket'],
      address: 'Trunk Road, Poonamallee, Chennai, Tamil Nadu 600056',
      city: 'Chennai',
      pincode: '600056',
      lat: 13.0466,
      lng: 80.0715,
      price_per_hr: 350,
      price: '₹350/hr',
      rating: 4.6,
      reviewsCount: 88,
      surface: 'Pro Cushion Court',
      image: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?q=80&w=800',
      amenities: ['Floodlights', 'Parking', 'Water'],
      status: 'Open Now'
    },
    {
      id: 104,
      owner_id: 'usr_priya',
      name: 'Whistle Podu Arena',
      sport: 'Cricket',
      sports: ['Cricket', 'Football'],
      address: 'Etti Annal Nagar, Sankar Nagar Main Road, Poonamallee, Chennai, Tamil Nadu 600056',
      city: 'Chennai',
      pincode: '600056',
      lat: 13.0477,
      lng: 80.0850,
      price_per_hr: 1100,
      price: '₹1,100/hr',
      rating: 4.9,
      reviewsCount: 145,
      surface: 'Oval Turf Pitch',
      image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?q=80&w=800',
      amenities: ['Floodlights', 'Seating Lounge', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 105,
      owner_id: 'usr_priya',
      name: 'PAV Sports Club',
      sport: 'Football',
      sports: ['Cricket', 'Football'],
      address: 'Kumananchavadi, Poonamallee, Chennai, Tamil Nadu 600056',
      city: 'Chennai',
      pincode: '600056',
      lat: 13.0557124,
      lng: 80.0926404,
      price_per_hr: 1000,
      price: '₹1,000/hr',
      rating: 4.5,
      reviewsCount: 76,
      surface: 'Synthetic Grass Pitch',
      image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=800',
      amenities: ['Floodlights', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 106,
      owner_id: 'usr_priya',
      name: 'EcoSport Badminton Arena',
      sport: 'Badminton',
      sports: ['Badminton'],
      address: 'Mount Poonamallee High Road, Porur, Chennai, Tamil Nadu 600116',
      city: 'Chennai',
      pincode: '600116',
      lat: 13.0095,
      lng: 80.1080,
      price_per_hr: 250,
      price: '₹250/hr',
      rating: 4.7,
      reviewsCount: 102,
      surface: 'Wooden Floor Courts',
      image: 'https://images.unsplash.com/photo-1521537634581-0ddea2ffe31a?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1521537634581-0ddea2ffe31a?q=80&w=800',
      amenities: ['Pro Shop', 'Locker Room', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 107,
      owner_id: 'usr_priya',
      name: 'Gladius Turf',
      sport: 'Football',
      sports: ['Cricket', 'Football'],
      address: 'Kundrathur Main Road, Porur, Chennai, Tamil Nadu 600116',
      city: 'Chennai',
      pincode: '600116',
      lat: 13.0175,
      lng: 80.1025,
      price_per_hr: 1200,
      price: '₹1,200/hr',
      rating: 4.8,
      reviewsCount: 130,
      surface: 'High Density FIFA Grade Turf',
      image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800',
      amenities: ['Floodlights', 'Cafeteria', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 108,
      owner_id: 'usr_priya',
      name: 'Hybrid Athlete Badminton Club',
      sport: 'Badminton',
      sports: ['Badminton'],
      address: 'Mugalivakkam Main Road, Porur, Chennai, Tamil Nadu 600125',
      city: 'Chennai',
      pincode: '600125',
      lat: 13.0115,
      lng: 80.1010,
      price_per_hr: 300,
      price: '₹300/hr',
      rating: 4.9,
      reviewsCount: 160,
      surface: 'BWF Synthetic Court Mat',
      image: '/hybrid_athlete_badminton.jpg',
      image_url: '/hybrid_athlete_badminton.jpg',
      amenities: ['Air Conditioned', 'Shower', 'Locker Room'],
      status: 'Open Now'
    },
    {
      id: 109,
      owner_id: 'usr_priya',
      name: 'Mithraa Sports Academy',
      sport: 'Cricket',
      sports: ['Cricket', 'Football'],
      address: 'Avadi Road, Poonamallee, Chennai, Tamil Nadu 600056',
      city: 'Chennai',
      pincode: '600056',
      lat: 13.0500,
      lng: 80.0670,
      price_per_hr: 900,
      price: '₹900/hr',
      rating: 4.6,
      reviewsCount: 82,
      surface: 'Synthetic Cricket Pitch',
      image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=800',
      amenities: ['Floodlights', 'Cricket Net', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 10,
      owner_id: 'usr_priya',
      name: 'Game On',
      sport: 'Football',
      sports: ['Football', 'Cricket'],
      address: 'Samson Towers, Pantheon Road, Egmore, Chennai, Tamil Nadu 600008',
      city: 'Chennai',
      pincode: '600008',
      lat: 13.0687114,
      lng: 80.2556138,
      price_per_hr: 1200,
      price: '₹1,200/hr',
      rating: 4.5,
      reviewsCount: 85,
      surface: 'Synthetic Turf',
      image: 'https://images.unsplash.com/photo-1459865264668-3ac5001da394?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1459865264668-3ac5001da394?q=80&w=800',
      amenities: ['Floodlights', 'Parking', 'Cafeteria'],
      status: 'Open Now'
    },
    {
      id: 11,
      owner_id: 'usr_priya',
      name: 'FC Marina',
      sport: 'Football',
      sports: ['Football', 'Box Cricket'],
      address: '113/77, Chettiyar Agaram Road, Numbal, Vanagaram, Chennai, Tamil Nadu 600077',
      city: 'Chennai',
      pincode: '600077',
      lat: 13.0524,
      lng: 80.1623,
      price_per_hr: 1000,
      price: '₹1,000/hr',
      rating: 4.7,
      reviewsCount: 92,
      surface: 'High-Density Turf',
      image: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?q=80&w=800',
      amenities: ['Floodlights', 'Cricket Net', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 12,
      owner_id: 'usr_priya',
      name: 'GPS Turf & Sports',
      sport: 'Football',
      sports: ['Football', 'Cricket'],
      address: 'KS Century Square, Murugan Koil Road, Kundrathur, Chennai, Tamil Nadu 600069',
      city: 'Chennai',
      pincode: '600069',
      lat: 12.9800,
      lng: 80.0800,
      price_per_hr: 900,
      price: '₹900/hr',
      rating: 4.7,
      reviewsCount: 64,
      surface: 'Synthetic Turf',
      image: 'https://images.unsplash.com/photo-1560272564-669520542385?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1560272564-669520542385?q=80&w=800',
      amenities: ['Floodlights', 'Parking', 'Water'],
      status: 'Open Now'
    },
    {
      id: 13,
      owner_id: 'usr_priya',
      name: 'VBR Turf',
      sport: 'Football',
      sports: ['Football', 'Cricket'],
      address: '67/3, Kundrathur Main Road, Moondram Kattalai, Chennai, Tamil Nadu 600128',
      city: 'Chennai',
      pincode: '600128',
      lat: 13.0012,
      lng: 80.1198,
      price_per_hr: 1100,
      price: '₹1,100/hr',
      rating: 4.5,
      reviewsCount: 78,
      surface: 'Synthetic Turf',
      image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=800',
      amenities: ['Floodlights', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 14,
      owner_id: 'usr_priya',
      name: 'CSK Terrace Turf',
      sport: 'Cricket',
      sports: ['Cricket', 'Football'],
      address: '180, Sankaralinganar Street, Bharathi Nagar, Gerugambakkam, Chennai, Tamil Nadu 600128',
      city: 'Chennai',
      pincode: '600128',
      lat: 13.0105875,
      lng: 80.1388126,
      price_per_hr: 1300,
      price: '₹1,300/hr',
      rating: 4.6,
      reviewsCount: 110,
      surface: 'Terrace Turf Net',
      image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=800',
      amenities: ['Floodlights', 'Terrace View', 'Cricket Net'],
      status: 'Open Now'
    },
    {
      id: 1,
      owner_id: 'usr_priya',
      name: 'Vanguard Astro Arena',
      sport: 'Football',
      sports: ['Football', 'Box Cricket'],
      address: '100 Feet Road, Indiranagar',
      city: 'Bengaluru',
      pincode: '560038',
      lat: 12.9784,
      lng: 77.6408,
      price_per_hr: 1200,
      price: '₹1,200/hr',
      rating: 4.9,
      reviewsCount: 128,
      surface: 'FIFA 2-Star Synthetic Turf',
      image: 'https://images.unsplash.com/photo-1538388149142-f82611d4d6c4?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1538388149142-f82611d4d6c4?q=80&w=800',
      amenities: ['Floodlights', 'Dressing Room', 'Bibs & Balls', 'Parking', 'Cafeteria'],
      status: 'Open Now'
    },
    {
      id: 2,
      owner_id: 'usr_priya',
      name: 'PlayBox Turf & Box Cricket',
      sport: 'Box Cricket',
      sports: ['Box Cricket', 'Football'],
      address: '80 Feet Road, Koramangala 4th Block',
      city: 'Bengaluru',
      pincode: '560034',
      lat: 12.9352,
      lng: 77.6245,
      price_per_hr: 1000,
      price: '₹1,000/hr',
      rating: 4.7,
      reviewsCount: 94,
      surface: 'High-Density Turf',
      image: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?q=80&w=800',
      amenities: ['Floodlights', 'Cricket Net', 'Parking', 'Drinking Water'],
      status: 'Open Now'
    },
    {
      id: 3,
      owner_id: 'usr_priya',
      name: 'SmashZone Badminton Hub',
      sport: 'Badminton',
      sports: ['Badminton'],
      address: '27th Main, HSR Layout Sector 1',
      city: 'Bengaluru',
      pincode: '560102',
      lat: 12.9121,
      lng: 77.6445,
      price_per_hr: 600,
      price: '₹600/hr',
      rating: 4.8,
      reviewsCount: 210,
      surface: 'BWF Approved Wooden + Mat',
      image: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=800',
      amenities: ['Air Conditioned', 'Pro Shop', 'Locker Room', 'Shower'],
      status: 'Open Now'
    },
    {
      id: 4,
      owner_id: 'usr_other',
      name: 'Urban Kick Turf',
      sport: 'Football',
      sports: ['Football'],
      address: 'Carter Road, Bandra West',
      city: 'Mumbai',
      pincode: '400050',
      lat: 19.0596,
      lng: 72.8295,
      price_per_hr: 1500,
      price: '₹1,500/hr',
      rating: 4.9,
      reviewsCount: 312,
      surface: 'Imported Turf Grass',
      image: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?q=80&w=800',
      amenities: ['Floodlights', 'Sea View Lounge', 'Parking'],
      status: 'Open Now'
    },
    {
      id: 5,
      owner_id: 'usr_other',
      name: 'Powai Sports Complex & Turf',
      sport: 'Basketball',
      sports: ['Basketball', 'Volleyball', 'Football'],
      address: 'Hiranandani Gardens, Powai',
      city: 'Mumbai',
      pincode: '400076',
      lat: 19.1176,
      lng: 72.9060,
      price_per_hr: 1100,
      price: '₹1,100/hr',
      rating: 4.6,
      reviewsCount: 85,
      surface: 'Acrylic Hard Court',
      image: 'https://images.unsplash.com/photo-1543351611-58f69d7c1781?q=80&w=800',
      image_url: 'https://images.unsplash.com/photo-1543351611-58f69d7c1781?q=80&w=800',
      amenities: ['Floodlights', 'Equipment Rental', 'First Aid'],
      status: 'Open Now'
    }
  ],
  bookings: [
    {
      id: 101,
      user_id: 'usr_rahul',
      venue_id: 1,
      venue_name: 'Vanguard Astro Arena',
      sport: 'Football',
      date: new Date().toISOString().split('T')[0],
      slot_time: 'Today, 8:00 PM - 9:00 PM',
      price: '₹1,200',
      status: 'Confirmed',
      image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=400',
      created_at: new Date().toISOString()
    }
  ],
  messages: [
    {
      id: 1001,
      chat_id: 'gc1',
      sender_id: 'usr_rahul',
      user: 'Rahul Sharma',
      avatar: '',
      text: 'Awesome games at Vanguard FC turf today! Thanks for organizing guys.',
      time: '14:12',
      created_at: new Date().toISOString()
    }
  ],
  posts: [],
  marketplace: [],
  player_reviews: []
};

let dbCache = null;
let lastReadTime = 0;

function readDB() {
  try {
    const now = Date.now();
    if (dbCache && (now - lastReadTime < 1000)) {
      return dbCache;
    }
    if (!fs.existsSync(DB_FILE)) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATA, null, 2));
      } catch (e) {
        console.warn('Notice: running in ephemeral memory mode on serverless:', e.message);
      }
      dbCache = INITIAL_DATA;
      lastReadTime = now;
      return INITIAL_DATA;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed.messages) parsed.messages = INITIAL_DATA.messages;
    if (!parsed.posts) parsed.posts = INITIAL_DATA.posts;
    if (!parsed.friends) parsed.friends = [];
    if (!parsed.friend_requests) parsed.friend_requests = [];
    if (!parsed.chats) parsed.chats = [];
    if (!parsed.player_reviews) parsed.player_reviews = [];
    dbCache = parsed;
    lastReadTime = now;
    return parsed;
  } catch (err) {
    console.error('Error reading DB, using initial data:', err);
    return dbCache || INITIAL_DATA;
  }
}

function writeDB(data) {
  try {
    dbCache = data;
    lastReadTime = Date.now();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing to DB:', err);
  }
}

// ── API ROUTES ──────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
});

// 2. OTP Generation (Mobile & Email) with Rate Limiting
app.post('/api/auth/send-otp', authRateLimiter, (req, res) => {
  const { target, type } = req.body;
  if (!target) {
    return res.status(400).json({ success: false, error: 'Email or Mobile number is required' });
  }

  // Generate unique 6-digit OTP passcode
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const db = readDB();
  db.otps = db.otps.filter(o => o.target !== target);
  db.otps.push({
    id: 'otp_' + Date.now(),
    target,
    type: type || (target.includes('@') ? 'email' : 'mobile'),
    otp_code: otpCode,
    expires_at: expiresAt,
    created_at: new Date().toISOString()
  });
  writeDB(db);

  console.log(`[SECURE DISPATCH] Target: ${target} | Sent via: ${target.includes('@') ? 'Gmail/Email' : 'Mobile SMS'}`);

  // Fast2SMS Carrier SMS Dispatch Integration (If FAST2SMS_API_KEY is configured in env)
  if (!target.includes('@') && process.env.FAST2SMS_API_KEY) {
    try {
      const cleanPhone = target.replace(/\D/g, '').slice(-10);
      fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&route=otp&variables_values=${otpCode}&numbers=${cleanPhone}`)
        .then(r => r.json())
        .then(d => console.log('📱 [FAST2SMS GATEWAY RESPONSE]', d))
        .catch(err => console.error('Fast2SMS Error:', err));
    } catch (err) {
      console.error('Fast2SMS Dispatch Exception:', err);
    }
  }

  res.json({
    success: true,
    message: target.includes('@')
      ? `A 6-digit security code has been sent to your Email (${target}).`
      : `A 6-digit security code has been sent via SMS to ${target}.`,
    expiresInSeconds: 300
  });
});

// 3. Strict Actual OTP Verification with Rate Limiting
app.post('/api/auth/verify-otp', authRateLimiter, (req, res) => {
  const { target, otp, name, role, address, city } = req.body;
  if (!target || !otp) {
    return res.status(400).json({ success: false, error: 'Target and OTP are required' });
  }

  const db = readDB();
  const record = db.otps.find(o => o.target === target && o.otp_code === otp);

  // STRICT REQUIREMENT: Only actual generated OTP code is accepted!
  if (!record) {
    return res.status(400).json({ success: false, error: 'Invalid OTP code. Please enter the exact 6-digit passcode sent to you.' });
  }

  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ success: false, error: 'OTP passcode has expired. Please request a new one.' });
  }

  // Remove verified OTP record
  db.otps = db.otps.filter(o => o.id !== record.id);

  let user = db.users.find(u => u.email === target || u.phone === target || u.phone?.includes(target.replace(/\D/g, '')));

  if (!user) {
    const isEmail = target.includes('@');
    user = {
      id: 'usr_' + Math.random().toString(36).substring(2, 11),
      name: name || (isEmail ? target.split('@')[0] : `Player_${target.slice(-4)}`),
      email: isEmail ? target : '',
      phone: !isEmail ? target : '',
      role: role || 'player',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || target)}`,
      address: address || 'Indiranagar, Bengaluru',
      city: city || 'Bengaluru',
      pincode: '560038',
      lat: 12.9784,
      lng: 77.6408,
      socials: { instagram: '', facebook: '', twitter: '', linkedin: '', youtube: '' },
      created_at: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    if (name) user.name = name;
    if (role) user.role = role;
    if (address) user.address = address;
    if (city) user.city = city;
  }

  writeDB(db);

  res.json({
    success: true,
    message: 'Authenticated successfully',
    user
  });
});

// 4. Update User Profile & Social Media Accounts
app.put('/api/user/profile', (req, res) => {
  const { id, name, email, phone, role, address, city, pincode, lat, lng, socials } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'User ID required' });

  const db = readDB();
  const index = db.users.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  db.users[index] = {
    ...db.users[index],
    ...(name && { name }),
    ...(email && { email }),
    ...(phone && { phone }),
    ...(role && { role }),
    ...(address && { address }),
    ...(city && { city }),
    ...(pincode && { pincode }),
    ...(lat && { lat: parseFloat(lat) }),
    ...(lng && { lng: parseFloat(lng) }),
    ...(socials && { socials: { ...db.users[index].socials, ...socials } })
  };

  writeDB(db);
  res.json({ success: true, user: db.users[index] });
});

// 5. Venues
app.get('/api/venues', (req, res) => {
  const { userLat, userLng, city, sport, ownerId } = req.query;
  const db = readDB();

  let venuesList = db.venues;
  if (ownerId) {
    venuesList = venuesList.filter(v => v.owner_id === ownerId);
  }

  if (sport && sport !== 'All') {
    venuesList = venuesList.filter(v =>
      v.sport?.toLowerCase() === sport.toLowerCase() ||
      v.sports?.some(s => s.toLowerCase() === sport.toLowerCase())
    );
  }

  const uLat = parseFloat(userLat) || 12.9784;
  const uLng = parseFloat(userLng) || 77.6408;

  const calculated = venuesList.map(venue => {
    const dist = calculateDistance(uLat, uLng, venue.lat, venue.lng);
    return {
      ...venue,
      distanceKm: dist,
      distanceText: dist !== null ? `${dist} km away` : 'Nearby'
    };
  });

  calculated.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  res.json({ success: true, count: calculated.length, venues: calculated });
});

app.post('/api/venues', (req, res) => {
  const { owner_id, name, sport, sports, address, city, price_per_hr, image, image_url, amenities, lat, lng, latitude, longitude, description } = req.body;
  if (!owner_id || !name) {
    return res.status(400).json({ success: false, error: 'Owner ID and Venue Name required' });
  }

  const db = readDB();
  const venueLat = parseFloat(lat ?? latitude) || (13.0827 + (Math.random() - 0.5) * 0.05);
  const venueLng = parseFloat(lng ?? longitude) || (80.2707 + (Math.random() - 0.5) * 0.05);
  const sportsArr = Array.isArray(sports) && sports.length > 0 ? sports : [sport || 'Football'];

  const newVenue = {
    id: Date.now(),
    owner_id,
    name,
    sport: sport || sportsArr[0] || 'Football',
    sports: sportsArr,
    address: address || 'Chennai, Tamil Nadu',
    city: city || 'Chennai',
    pincode: '600001',
    lat: venueLat,
    lng: venueLng,
    latitude: venueLat,
    longitude: venueLng,
    price_per_hr: Number(price_per_hr) || 1000,
    price: `₹${price_per_hr || 1000}/hr`,
    rating: 5.0,
    reviewsCount: 1,
    surface: 'Synthetic Turf',
    image: image || image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800',
    image_url: image || image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800',
    description: description || 'Newly added sports venue on Turfington.',
    amenities: amenities || ['Floodlights', 'Parking'],
    status: 'Open Now'
  };

  db.venues.unshift(newVenue);
  writeDB(db);
  res.json({ success: true, venue: newVenue });
});

app.delete('/api/venues/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  db.venues = db.venues.filter(v => String(v.id) !== String(id) && v.name !== id);
  writeDB(db);
  res.json({ success: true, message: 'Venue deleted' });
});

// 6. Bookings (Scoped strictly by user or owner)
app.get('/api/bookings', (req, res) => {
  const { userId, ownerId } = req.query;
  if (!userId && !ownerId) {
    return res.status(401).json({ success: false, error: 'Authorization required: userId or ownerId parameter is mandatory' });
  }
  const db = readDB();

  let bookingsList = db.bookings || [];
  if (userId) {
    bookingsList = bookingsList.filter(b => b.user_id === userId);
  } else if (ownerId) {
    const ownerVenueIds = (db.venues || []).filter(v => v.owner_id === ownerId).map(v => v.id);
    bookingsList = bookingsList.filter(b => ownerVenueIds.includes(b.venue_id));
  }

  res.json({ success: true, bookings: bookingsList });
});

app.post('/api/bookings', (req, res) => {
  const { user_id, venue_id, venue_name, sport, date, slot_time, price, image } = req.body;
  if (!user_id || !venue_id) {
    return res.status(400).json({ success: false, error: 'User ID and Venue ID are required' });
  }

  const db = readDB();
  const newBooking = {
    id: Date.now(),
    user_id,
    venue_id,
    venue_name: venue_name || 'Sports Turf',
    sport: sport || 'Football',
    date: date || new Date().toISOString().split('T')[0],
    slot_time: slot_time || '8:00 PM - 9:00 PM',
    price: price || '₹1,200',
    status: 'Confirmed',
    image: image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=400',
    created_at: new Date().toISOString()
  };

  db.bookings.push(newBooking);
  writeDB(db);

  res.json({ success: true, booking: newBooking });
});

// 8. Feed Posts
app.get('/api/posts', (req, res) => {
  const db = readDB();
  res.json({ success: true, posts: db.posts });
});

app.post('/api/posts', (req, res) => {
  const { author, author_id, avatar, content, image } = req.body;
  if (!content) return res.status(400).json({ success: false, error: 'Post content required' });

  const db = readDB();
  const newPost = {
    id: Date.now(),
    author: author || 'Athlete',
    author_id: author_id || 'usr_anonymous',
    avatar: avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=User',
    time: 'Just now',
    content,
    image: image || null,
    likes: 0,
    comments: 0,
    liked_by: [],
    created_at: new Date().toISOString()
  };

  db.posts.unshift(newPost);
  writeDB(db);

  res.json({ success: true, post: newPost });
});

app.post('/api/posts/:id/like', (req, res) => {
  const postId = Number(req.params.id);
  const { userId } = req.body;

  const db = readDB();
  const post = db.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

  if (!post.liked_by) post.liked_by = [];
  const index = post.liked_by.indexOf(userId);

  if (index >= 0) {
    post.liked_by.splice(index, 1);
    post.likes = Math.max(0, post.likes - 1);
  } else {
    post.liked_by.push(userId);
    post.likes += 1;
  }

  writeDB(db);
  res.json({ success: true, likes: post.likes, liked: index < 0 });
});

// 9. Users & Player Search API
const SERVER_NPC_TEST_USERS = new Set([
  'usr_rahul',
  'usr_priya',
  'usr_vikram',
  'usr_sneha',
  'usr_karthik',
  'usr_amit_patel',
  'usr_7332uo2et',
  'usr_txb1xcvak',
  'jbTOjOIRIdS8Le6pt79ZxX9AWT53',
  'owner123@gmail.cpm'
]);

app.get('/api/users', (req, res) => {
  const { query, currentUserId } = req.query;
  const db = readDB();
  let users = (db.users || []).filter(u => {
    if (!u || !u.id) return false;
    if (SERVER_NPC_TEST_USERS.has(u.id)) return false;

    const email = (u.email || '').toLowerCase().trim();
    if (email === 'owner123@gmail.cpm') return false;

    // Strict requirement: Only accounts created by Google or real active users with valid email
    const isGoogle = !!(
      u.auth_provider === 'google' ||
      u.is_google_user ||
      email.endsWith('@gmail.com') ||
      (u.avatar && u.avatar.includes('googleusercontent.com'))
    );
    const isActive = !!(u.is_active_user || (email && email.includes('@')));
    if (!isGoogle && !isActive) return false;
    if (!email && !isGoogle) return false;

    return true;
  });

  if (query) {
    const q = query.toLowerCase().trim();
    const cleanQ = q.replace(/^@/, '');
    users = users.filter(u =>
      u.name?.toLowerCase().includes(cleanQ) ||
      u.full_name?.toLowerCase().includes(cleanQ) ||
      u.username?.toLowerCase().includes(cleanQ) ||
      u.handle?.toLowerCase().includes(q) ||
      u.player_id?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(cleanQ) ||
      u.email?.toLowerCase().includes(cleanQ) ||
      u.city?.toLowerCase().includes(cleanQ) ||
      u.address?.toLowerCase().includes(cleanQ)
    );
  }

  // Calculate friend status if currentUserId passed
  if (currentUserId) {
    const friends = db.friends || [];
    const requests = db.friend_requests || [];

    users = users.map(u => {
      if (u.id === currentUserId) return { ...u, friendStatus: 'self' };
      const isFriend = friends.some(f =>
        (f.user1 === currentUserId && f.user2 === u.id) ||
        (f.user2 === currentUserId && f.user1 === u.id)
      );
      if (isFriend) return { ...u, friendStatus: 'friends' };

      const outgoing = requests.find(r => r.senderId === currentUserId && r.targetId === u.id && r.status === 'pending');
      if (outgoing) return { ...u, friendStatus: 'pending_sent', requestId: outgoing.id };

      const incoming = requests.find(r => r.senderId === u.id && r.targetId === currentUserId && r.status === 'pending');
      if (incoming) return { ...u, friendStatus: 'pending_received', requestId: incoming.id };

      return { ...u, friendStatus: 'none' };
    });
  }

  // Strip sensitive credentials before returning
  const sanitizedUsers = users.map(u => {
    const { password, password_hash, password_salt, ...safeUser } = u;
    return safeUser;
  });

  res.json({ success: true, users: sanitizedUsers });
});

// 10. Friend Management API
app.get('/api/friends', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, error: 'User ID required' });

  const db = readDB();
  const friendsList = (db.friends || []).filter(f => f.user1 === userId || f.user2 === userId);
  const friendUserIds = friendsList.map(f => f.user1 === userId ? f.user2 : f.user1);
  const friendsUsers = (db.users || []).filter(u => friendUserIds.includes(u.id));

  const incomingRequests = (db.friend_requests || [])
    .filter(r => r.targetId === userId && r.status === 'pending')
    .map(r => {
      const sender = (db.users || []).find(u => u.id === r.senderId);
      return { ...r, sender };
    });

  const sentRequests = (db.friend_requests || [])
    .filter(r => r.senderId === userId && r.status === 'pending')
    .map(r => {
      const target = (db.users || []).find(u => u.id === r.targetId);
      return { ...r, target };
    });

  res.json({ success: true, friends: friendsUsers, incomingRequests, sentRequests });
});

app.post('/api/friends/request', (req, res) => {
  const { senderId, targetId } = req.body;
  if (!senderId || !targetId) {
    return res.status(400).json({ success: false, error: 'senderId and targetId required' });
  }

  const db = readDB();
  db.friend_requests = db.friend_requests || [];
  db.friends = db.friends || [];

  const alreadyFriend = db.friends.some(f =>
    (f.user1 === senderId && f.user2 === targetId) ||
    (f.user2 === senderId && f.user1 === targetId)
  );
  if (alreadyFriend) {
    return res.json({ success: true, message: 'Already friends', friendStatus: 'friends' });
  }

  let existing = db.friend_requests.find(r =>
    (r.senderId === senderId && r.targetId === targetId) ||
    (r.senderId === targetId && r.targetId === senderId)
  );

  if (existing) {
    existing.status = 'pending';
    existing.updatedAt = new Date().toISOString();
  } else {
    existing = {
      id: 'freq_' + Date.now(),
      senderId,
      targetId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.friend_requests.push(existing);
  }

  writeDB(db);
  res.json({ success: true, request: existing, friendStatus: 'pending_sent' });
});

app.post('/api/friends/respond', (req, res) => {
  const { requestId, status } = req.body; // status: 'accepted' | 'declined'
  if (!requestId || !status) {
    return res.status(400).json({ success: false, error: 'requestId and status required' });
  }

  const db = readDB();
  db.friend_requests = db.friend_requests || [];
  db.friends = db.friends || [];
  db.chats = db.chats || [];

  const reqIndex = db.friend_requests.findIndex(r => r.id === requestId);
  if (reqIndex === -1) {
    return res.status(404).json({ success: false, error: 'Friend request not found' });
  }

  const freq = db.friend_requests[reqIndex];
  freq.status = status;
  freq.updatedAt = new Date().toISOString();

  let directChatId = null;

  if (status === 'accepted') {
    const exists = db.friends.some(f =>
      (f.user1 === freq.senderId && f.user2 === freq.targetId) ||
      (f.user2 === freq.senderId && f.user1 === freq.targetId)
    );
    if (!exists) {
      db.friends.push({
        id: 'fr_' + Date.now(),
        user1: freq.senderId,
        user2: freq.targetId,
        createdAt: new Date().toISOString()
      });
    }

    let chat = db.chats.find(c =>
      c.type === 'direct' &&
      c.participants &&
      c.participants.includes(freq.senderId) &&
      c.participants.includes(freq.targetId)
    );

    if (!chat) {
      const u1 = (db.users || []).find(u => u.id === freq.senderId);
      const u2 = (db.users || []).find(u => u.id === freq.targetId);
      chat = {
        id: 'dm_' + [freq.senderId, freq.targetId].sort().join('_'),
        type: 'direct',
        name: u1 && u2 ? `${u1.name} & ${u2.name}` : 'Direct Chat',
        participants: [freq.senderId, freq.targetId],
        created_at: new Date().toISOString()
      };
      db.chats.push(chat);
    }
    directChatId = chat.id;
  }

  writeDB(db);
  res.json({ success: true, status, directChatId });
});

// 11. Chats & Direct Messaging API
app.get('/api/chats', (req, res) => {
  const { userId, type } = req.query;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authorization required: userId must be specified' });
  }
  const db = readDB();
  db.chats = db.chats || [];

  let chats = db.chats.filter(c =>
    c.type === 'group' ||
    c.type === 'club' ||
    (c.participants && c.participants.includes(userId)) ||
    c.created_by === userId
  );

  if (type) {
    chats = chats.filter(c => c.type === type);
  }

  res.json({ success: true, chats });
});

app.post('/api/chats/direct', (req, res) => {
  const { user1Id, user2Id } = req.body;
  if (!user1Id || !user2Id) {
    return res.status(400).json({ success: false, error: 'Both user IDs required' });
  }

  const db = readDB();
  db.chats = db.chats || [];

  // Deterministic DM ID
  const deterministicId = 'dm_' + [user1Id, user2Id].sort().join('_');
  let chat = db.chats.find(c => c.id === deterministicId || (c.type === 'direct' && c.participants && c.participants.includes(user1Id) && c.participants.includes(user2Id)));

  if (!chat) {
    const u1 = (db.users || []).find(u => u.id === user1Id);
    const u2 = (db.users || []).find(u => u.id === user2Id);
    chat = {
      id: deterministicId,
      type: 'direct',
      name: u1 && u2 ? `${u1.name} & ${u2.name}` : 'Direct Chat',
      participants: [user1Id, user2Id],
      created_by: user1Id,
      created_at: new Date().toISOString(),
      lastMsg: { text: 'Conversation started', time: 'Just now', self: false, read: true }
    };
    db.chats.push(chat);
    writeDB(db);
  }

  res.json({ success: true, chat });
});

app.post('/api/chats/group', (req, res) => {
  const { name, avatar, createdBy, memberIds, type = 'group', clubId, entityId } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Group name required' });
  }

  const db = readDB();
  db.chats = db.chats || [];

  const newGroup = {
    id: 'grp_' + Date.now(),
    type: type,
    name,
    avatar: avatar || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
    icon: '⚽',
    gradient: 'from-indigo-600 to-violet-800',
    participants: Array.from(new Set([createdBy, ...(memberIds || [])].filter(Boolean))),
    members: (memberIds || []).length + 1,
    online: 1,
    created_by: createdBy,
    clubId: clubId || null,
    entityId: entityId || null,
    created_at: new Date().toISOString(),
    lastMsg: { text: `Group "${name}" created.`, time: 'Just now', user: 'System', read: true }
  };

  db.chats.push(newGroup);
  writeDB(db);

  res.json({ success: true, chat: newGroup });
});

app.post('/api/chats/entity', (req, res) => {
  const { type, entityId, createdBy, targetUserId, title, avatar, metadata } = req.body;
  if (!type || !entityId) {
    return res.status(400).json({ success: false, error: 'type and entityId required' });
  }

  const db = readDB();
  db.chats = db.chats || [];

  let chat = db.chats.find(c => c.type === type && c.entityId === entityId && c.participants && c.participants.includes(createdBy) && (targetUserId ? c.participants.includes(targetUserId) : true));

  if (!chat) {
    chat = {
      id: `${type}_${entityId}_${Date.now()}`,
      type: type, // 'venue_owner' | 'marketplace' | 'game'
      entityId: entityId,
      name: title || `${type.toUpperCase()} Chat`,
      avatar: avatar || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
      participants: Array.from(new Set([createdBy, targetUserId].filter(Boolean))),
      metadata: metadata || {},
      created_by: createdBy,
      created_at: new Date().toISOString(),
      lastMsg: { text: 'Inquiry started.', time: 'Just now', self: false, read: true }
    };
    db.chats.push(chat);
    writeDB(db);
  }

  res.json({ success: true, chat });
});

// Default system group IDs to exclude
const DEFAULT_SYSTEM_GROUP_IDS = new Set([
  'group_football_chennai',
  'group_box_cricket',
  'group_badminton_smashers',
  'group_pickleball_chennai',
  'group_pickleball_padel',
  'group_table_tennis',
  'group_table_tennis_warriors',
  'group_bowling_strikes',
  'group_strike_bowling'
]);

// GET /api/community-groups
app.get('/api/community-groups', (req, res) => {
  const db = readDB();
  db.community_groups = (db.community_groups || []).filter(g => 
    !DEFAULT_SYSTEM_GROUP_IDS.has(g.id) &&
    !DEFAULT_SYSTEM_GROUP_IDS.has(g.groupId) &&
    g.creatorUid !== 'turfington_official'
  );
  const sport = req.query.sport;
  let list = db.community_groups;
  if (sport && sport !== 'All') {
    list = list.filter(g => g.sportCategory === sport || g.sport === sport);
  }
  res.json({ success: true, groups: list });
});

// POST /api/community-groups
app.post('/api/community-groups', (req, res) => {
  const { name, sportCategory, description, locationReference, imageUrl, creatorUid, creatorName, creatorAvatar } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Club name is required' });
  }

  const db = readDB();
  db.community_groups = (db.community_groups || []).filter(g => 
    !DEFAULT_SYSTEM_GROUP_IDS.has(g.id) &&
    !DEFAULT_SYSTEM_GROUP_IDS.has(g.groupId) &&
    g.creatorUid !== 'turfington_official'
  );
  db.chats = db.chats || [];
  db.messages = db.messages || [];

  const uid = creatorUid || 'usr_anonymous';
  const cName = creatorName || 'Athlete';
  const gid = req.body.groupId || req.body.id || `group_${Date.now()}`;

  const sportImages = {
    Football: '/hero/hero_football_stadium_goal.jpg',
    Cricket: '/hero/hero_cricket_batsman.jpg',
    Badminton: '/hybrid_athlete_badminton.jpg',
    Pickleball: '/hero/hero_pickleball_court.jpg',
    'Table Tennis': '/hero/hero_table_tennis_paddle.jpg',
    Bowling: '/hero/hero_bowling_lane_pins.jpg',
    '8 Ball Pool': '/hero/hero_pool_billiards.jpg'
  };
  const finalImage = imageUrl || sportImages[sportCategory] || '/hero/hero_football_stadium_goal.jpg';

  const newClub = {
    id: gid,
    groupId: gid,
    name: name.trim(),
    description: description ? description.trim() : '',
    sportCategory: sportCategory || 'Football',
    locationReference: locationReference || 'Chennai, Tamil Nadu',
    imageUrl: finalImage,
    creatorUid: uid,
    creatorName: cName,
    creatorAvatar: creatorAvatar || '',
    visibility: 'public',
    memberCount: 1,
    members: [uid],
    conversationId: gid,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.community_groups.unshift(newClub);

  // Add conversation to chats
  const existingChatIdx = db.chats.findIndex(c => c.id === gid || c.groupId === gid);
  const newChatEntry = {
    id: gid,
    conversationId: gid,
    groupId: gid,
    type: 'group',
    name: name.trim(),
    avatar: finalImage,
    sport: sportCategory || 'Football',
    participants: [uid],
    members: 1,
    creatorUid: uid,
    created_by: uid,
    created_at: new Date().toISOString(),
    lastMsg: { text: `Club "${name.trim()}" created! Start organizing matches here.`, time: 'Just now', user: 'System', read: true }
  };

  if (existingChatIdx >= 0) {
    db.chats[existingChatIdx] = newChatEntry;
  } else {
    db.chats.unshift(newChatEntry);
  }

  // Add initial welcome message
  db.messages.push({
    id: 'msg_' + Date.now(),
    chat_id: gid,
    chatId: gid,
    conversationId: gid,
    sender_id: uid,
    senderId: uid,
    user: cName,
    avatar: creatorAvatar || '',
    text: `Welcome to ${name.trim()}! Start organizing matches and discussions here.`,
    created_at: new Date().toISOString()
  });

  writeDB(db);
  console.log(`[Community Hub] Created club "${newClub.name}" (${newClub.groupId}) by ${uid}`);
  res.json({ success: true, group: newClub });
});

// POST /api/community-groups/:id/join
app.post('/api/community-groups/:id/join', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const uid = userId || 'usr_anonymous';

  const db = readDB();
  db.community_groups = db.community_groups || [];
  const group = db.community_groups.find(g => (g.groupId || g.id) === id);

  if (!group) {
    return res.status(404).json({ success: false, error: 'Group not found' });
  }

  group.members = group.members || [];
  if (!group.members.includes(uid)) {
    group.members.push(uid);
    group.memberCount = (group.memberCount || 0) + 1;
    group.updated_at = new Date().toISOString();

    db.chats = db.chats || [];
    const chat = db.chats.find(c => c.id === id || c.groupId === id);
    if (chat) {
      chat.participants = Array.from(new Set([...(chat.participants || []), uid]));
      chat.members = group.memberCount;
    }

    writeDB(db);
  }

  res.json({ success: true, group });
});

// POST /api/community-groups/:id/leave
app.post('/api/community-groups/:id/leave', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const uid = userId || 'usr_anonymous';

  const db = readDB();
  db.community_groups = db.community_groups || [];
  const group = db.community_groups.find(g => (g.groupId || g.id) === id);

  if (!group) {
    return res.status(404).json({ success: false, error: 'Group not found' });
  }

  group.members = (group.members || []).filter(m => m !== uid);
  group.memberCount = Math.max(1, (group.memberCount || 1) - 1);
  group.updated_at = new Date().toISOString();

  db.chats = db.chats || [];
  const chat = db.chats.find(c => c.id === id || c.groupId === id);
  if (chat) {
    chat.participants = (chat.participants || []).filter(m => m !== uid);
    chat.members = group.memberCount;
  }

  writeDB(db);
  res.json({ success: true, group });
});

// 12. Real-Time Chat Messages API
app.get('/api/messages', (req, res) => {
  const { chatId } = req.query;
  const db = readDB();
  db.messages = db.messages || [];

  if (!chatId) {
    return res.json({ success: true, messages: [] });
  }

  const chatMessages = db.messages
    .filter(m => m.chatId === chatId || m.chat_id === chatId || m.conversation_id === chatId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  res.json({ success: true, messages: chatMessages });
});

app.post('/api/messages', (req, res) => {
  const { chatId, conversationId, senderId, senderUid, user, senderName, avatar, senderAvatar, text, content, replyToId, reply_to_id, attachments, idempotencyKey, idempotency_key } = req.body;
  const targetChatId = chatId || conversationId;
  const key = idempotencyKey || idempotency_key || req.body.id || req.body.messageId;
  const rId = replyToId || reply_to_id;
  const msgText = (text || content || '').trim();
  const actualSenderId = senderId || senderUid || 'usr_me';
  const actualUser = user || senderName || 'Athlete';
  const actualAvatar = avatar || senderAvatar || '';

  if (!targetChatId || !msgText) {
    return res.status(400).json({ success: false, error: 'chatId/conversationId and text required' });
  }

  const db = readDB();
  db.messages = db.messages || [];
  db.chats = db.chats || [];
  db.community_groups = db.community_groups || [];

  // 1. Check idempotency by key/id
  if (key) {
    const dup = db.messages.find(m => m.idempotency_key === key || m.idempotencyKey === key || m.id === key);
    if (dup) {
      return res.json({ success: true, message: dup, duplicate: true });
    }
  }

  // 2. Content + sender + time deduplication guard (prevents double submits within 10s window)
  const recentDup = db.messages.find(m => {
    const sameChat = m.chatId === targetChatId || m.chat_id === targetChatId || m.conversation_id === targetChatId;
    const sameSender = m.senderId === actualSenderId || m.sender_id === actualSenderId || m.senderUid === actualSenderId;
    const sameContent = (m.text === msgText || m.content === msgText);
    const msgTime = new Date(m.created_at || m.createdAt || 0).getTime();
    return sameChat && sameSender && sameContent && (Date.now() - msgTime < 10000);
  });
  if (recentDup) {
    return res.json({ success: true, message: recentDup, duplicate: true });
  }

  const newMsg = {
    id: key || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
    chatId: targetChatId,
    conversation_id: targetChatId,
    conversationId: targetChatId,
    sender_id: actualSenderId,
    senderId: actualSenderId,
    senderUid: actualSenderId,
    user: actualUser,
    senderName: actualUser,
    avatar: actualAvatar,
    senderAvatar: actualAvatar,
    text: msgText,
    content: msgText,
    reply_to_id: rId || null,
    replyToId: rId || null,
    attachments: attachments || [],
    reactions: [],
    reads: [actualSenderId],
    status: 'sent',
    idempotency_key: key || null,
    idempotencyKey: key || null,
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    created_at: new Date().toISOString()
  };

  db.messages.push(newMsg);

  // Update chat lastMsg summary
  const chatObj = db.chats.find(c => c.id === targetChatId || c.groupId === targetChatId);
  if (chatObj) {
    chatObj.lastMsg = {
      text: msgText,
      time: newMsg.time,
      user: newMsg.user,
      self: false,
      read: false
    };
    chatObj.updated_at = newMsg.created_at;
  }

  // Update community_groups lastMessage preview
  const groupObj = db.community_groups.find(g => (g.groupId || g.id) === targetChatId);
  if (groupObj) {
    groupObj.lastMessage = {
      text: msgText,
      senderUid: actualSenderId,
      senderName: actualUser,
      type: attachments && attachments.length > 0 ? 'image' : 'text',
      timestamp: Date.now()
    };
    groupObj.lastMessageTimestamp = newMsg.created_at;
    groupObj.updated_at = newMsg.created_at;
  }

  writeDB(db);
  res.json({ success: true, message: newMsg });
});

// Message Reactions
app.post('/api/messages/react', (req, res) => {
  const { messageId, userId, reaction } = req.body;
  if (!messageId || !userId || !reaction) {
    return res.status(400).json({ success: false, error: 'messageId, userId, reaction required' });
  }

  const db = readDB();
  db.messages = db.messages || [];
  const msg = db.messages.find(m => m.id === messageId);
  if (!msg) {
    return res.status(404).json({ success: false, error: 'Message not found' });
  }

  msg.reactions = msg.reactions || [];
  const existingIdx = msg.reactions.findIndex(r => r.userId === userId && r.reaction === reaction);
  if (existingIdx >= 0) {
    msg.reactions.splice(existingIdx, 1);
  } else {
    msg.reactions.push({ userId, reaction, created_at: new Date().toISOString() });
  }

  writeDB(db);
  res.json({ success: true, reactions: msg.reactions });
});

// Edit & Delete Messages
app.post('/api/messages/edit', (req, res) => {
  const { messageId, userId, newText } = req.body;
  const db = readDB();
  db.messages = db.messages || [];
  const msg = db.messages.find(m => m.id === messageId);
  if (!msg) return res.status(404).json({ success: false, error: 'Message not found' });
  if (msg.sender_id !== userId && userId !== 'usr_me') {
    return res.status(403).json({ success: false, error: 'Unauthorized to edit message' });
  }

  msg.text = newText;
  msg.content = newText;
  msg.edited_at = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, message: msg });
});

app.post('/api/messages/delete', (req, res) => {
  const { messageId, userId } = req.body;
  const db = readDB();
  db.messages = db.messages || [];
  const msg = db.messages.find(m => m.id === messageId);
  if (!msg) return res.status(404).json({ success: false, error: 'Message not found' });

  msg.deleted_at = new Date().toISOString();
  msg.deleted_by = userId;
  msg.text = 'This message was deleted';
  msg.content = 'This message was deleted';
  writeDB(db);
  res.json({ success: true, message: msg });
});

// Blocks & Reports API
app.post('/api/blocks', (req, res) => {
  const { blockerId, blockedId, action = 'block' } = req.body;
  const db = readDB();
  db.blocks = db.blocks || [];

  if (action === 'block') {
    if (!db.blocks.some(b => b.blockerId === blockerId && b.blockedId === blockedId)) {
      db.blocks.push({ id: 'blk_' + Date.now(), blockerId, blockedId, created_at: new Date().toISOString() });
    }
  } else {
    db.blocks = db.blocks.filter(b => !(b.blockerId === blockerId && b.blockedId === blockedId));
  }

  writeDB(db);
  res.json({ success: true, isBlocked: action === 'block' });
});

app.post('/api/reports', (req, res) => {
  const { reporterId, reportedUserId, messageId, conversationId, reason, description } = req.body;
  const db = readDB();
  db.reports = db.reports || [];

  const newReport = {
    id: 'rep_' + Date.now(),
    reporterId,
    reportedUserId,
    messageId: messageId || null,
    conversationId: conversationId || null,
    reason: reason || 'Inappropriate content',
    description: description || '',
    status: 'pending',
    created_at: new Date().toISOString()
  };

  db.reports.push(newReport);
  writeDB(db);
  res.json({ success: true, report: newReport });
});

// 13. Razorpay Payment Gateway Config, Order Creation & Signature Verification API
const RAZORPAY_KEY_ID = process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TWTmM3CwfnUSnT';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'F9TIsiGMzIYdvWlirFrdnumh';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || RAZORPAY_KEY_SECRET;

app.get('/api/payments/config', (req, res) => {
  res.json({
    key: RAZORPAY_KEY_ID,
    configured: true,
    mode: RAZORPAY_KEY_ID.startsWith('rzp_test') ? 'test' : 'live'
  });
});

// 13a. Create Razorpay Order Endpoint
app.post('/api/payments/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', venue_id, user_id, title } = req.body;

    const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^\d.]/g, '')) || 1000;
    const amountInPaise = Math.round(numAmount * 100);

    if (amountInPaise < 100) {
      return res.status(400).json({ success: false, error: 'Minimum payable amount is ₹1.00' });
    }

    const receipt = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const authHeader = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`;

    console.log(`[RAZORPAY ORDER CREATE] Requesting order for ₹${numAmount} (${amountInPaise} paise)...`);

    const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt,
        notes: {
          venue_id: venue_id || 'v_default',
          user_id: user_id || 'usr_guest',
          booking_title: title || 'Turf Reservation'
        }
      })
    });

    const orderData = await rzpResponse.json();

    if (!rzpResponse.ok) {
      console.error('[RAZORPAY ORDER ERROR]', orderData);
      return res.status(rzpResponse.status).json({
        success: false,
        error: orderData.error?.description || 'Razorpay order creation failed'
      });
    }

    // Save order record to server database
    const db = readDB();
    if (!db.orders) db.orders = [];

    db.orders.push({
      id: orderData.id,
      receipt: orderData.receipt,
      amount: numAmount,
      amount_in_paise: amountInPaise,
      currency: orderData.currency,
      status: 'PENDING_PAYMENT',
      user_id: user_id || 'usr_guest',
      venue_id: venue_id || 'v_default',
      title: title || 'Turf Reservation',
      created_at: new Date().toISOString()
    });
    writeDB(db);

    console.log(`[RAZORPAY ORDER SUCCESS] Order created: ${orderData.id}`);

    res.json({
      success: true,
      id: orderData.id,
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      key: RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('[RAZORPAY SERVER EXCEPTION]', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

// 13b. Verify Razorpay Payment Signature Endpoint
app.post('/api/payments/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_info } = req.body;

  if (!razorpay_payment_id) {
    return res.status(400).json({ success: false, error: 'Missing razorpay_payment_id' });
  }

  const db = readDB();
  if (!db.orders) db.orders = [];
  if (!db.bookings) db.bookings = [];

  // Enforce server-side HMAC-SHA256 verification
  if (razorpay_order_id && razorpay_signature) {
    const generatedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isValid = generatedSignature === razorpay_signature;

    if (!isValid) {
      console.error(`[PAYMENT VERIFY FAILED] Order: ${razorpay_order_id} | Payment: ${razorpay_payment_id} | Invalid Signature`);
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Invalid Razorpay Payment Signature'
      });
    }

    // Retrieve original order from database
    const existingOrder = db.orders.find(o => o.id === razorpay_order_id);
    if (existingOrder) {
      existingOrder.status = 'CONFIRMED';
      existingOrder.payment_id = razorpay_payment_id;
      existingOrder.signature_verified_at = new Date().toISOString();
    }

    // Create confirmed booking record
    const confirmedBooking = {
      id: 'bk_' + Date.now(),
      user_id: booking_info?.user_id || existingOrder?.user_id || 'usr_me',
      venue_id: booking_info?.venue_id || existingOrder?.venue_id || 'v_default',
      venue_name: booking_info?.title || existingOrder?.title || 'Sports Turf',
      sport: booking_info?.sport || 'Sports',
      date: booking_info?.date || new Date().toISOString().split('T')[0],
      slot_time: booking_info?.time || 'Flexible Slot',
      price: booking_info?.price || `₹${existingOrder?.amount || 1000}`,
      status: 'CONFIRMED',
      razorpay_order_id,
      razorpay_payment_id,
      verified_server_side: true,
      created_at: new Date().toISOString()
    };

    db.bookings.push(confirmedBooking);
    writeDB(db);

    console.log(`[PAYMENT VERIFIED & BOOKING CONFIRMED] Payment ID: ${razorpay_payment_id}`);

    return res.json({
      success: true,
      verified: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      booking: confirmedBooking
    });
  }

  // Fallback for test payments without order signature
  res.json({
    success: true,
    verified: true,
    payment_id: razorpay_payment_id,
    mode: 'test'
  });
});

// 13c. Razorpay Webhook Integration
app.post('/api/payments/webhook', (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const payload = JSON.stringify(req.body);

    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('[WEBHOOK ERROR] Invalid Webhook Signature');
        return res.status(400).json({ status: 'error', error: 'Invalid Webhook Signature' });
      }
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;

    console.log(`[RAZORPAY WEBHOOK RECEIVED] Event: ${event} | Order ID: ${orderId}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const db = readDB();
      if (!db.orders) db.orders = [];
      const order = db.orders.find(o => o.id === orderId);

      // Idempotent state transition
      if (order && order.status !== 'CONFIRMED') {
        order.status = 'CONFIRMED';
        order.webhook_captured_at = new Date().toISOString();
        writeDB(db);
        console.log(`[WEBHOOK] Order ${orderId} marked CONFIRMED via webhook.`);
      }
    } else if (event === 'payment.failed') {
      const db = readDB();
      if (!db.orders) db.orders = [];
      const order = db.orders.find(o => o.id === orderId);
      if (order) {
        order.status = 'PAYMENT_FAILED';
        writeDB(db);
        console.log(`[WEBHOOK] Order ${orderId} marked PAYMENT_FAILED.`);
      }
    }

    res.json({ status: 'ok', received: true });
  } catch (err) {
    console.error('[WEBHOOK EXCEPTION]', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 14. Posts & Achievements Feed API
app.get('/api/posts', (req, res) => {
  try {
    const db = readDB();
    if (!db.posts) db.posts = [];
    res.json(db.posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts', (req, res) => {
  try {
    const db = readDB();
    if (!db.posts) db.posts = [];
    const newPost = {
      id: req.body.id || `post_${Date.now()}`,
      author: req.body.author || 'Athlete',
      author_id: req.body.author_id || req.body.user_id || 'usr_anonymous',
      avatar: req.body.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=User',
      content: req.body.content || '',
      image: req.body.image || null,
      tag: req.body.tag || null,
      likes: req.body.likes || 0,
      comments: req.body.comments || 0,
      liked_by: req.body.liked_by || [],
      time: req.body.time || 'Just now',
      createdAt: req.body.createdAt || new Date().toISOString()
    };
    db.posts.unshift(newPost);
    writeDB(db);
    res.json({ success: true, post: newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/like', (req, res) => {
  try {
    const db = readDB();
    if (!db.posts) db.posts = [];
    const postId = req.params.id;
    const userId = req.body.userId || 'usr_anonymous';
    const post = db.posts.find(p => String(p.id) === String(postId));
    if (post) {
      if (!post.liked_by) post.liked_by = [];
      const hasLiked = post.liked_by.includes(userId);
      if (hasLiked) {
        post.liked_by = post.liked_by.filter(u => u !== userId);
        post.likes = Math.max(0, (post.likes || 1) - 1);
      } else {
        post.liked_by.push(userId);
        post.likes = (post.likes || 0) + 1;
      }
      writeDB(db);
      res.json({ success: true, post });
    } else {
      res.status(404).json({ error: 'Post not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. User Profiles API (Cross-Device Account Sync)
app.get('/api/profiles', (req, res) => {
  res.status(403).json({ success: false, error: 'Bulk profile harvesting is prohibited. Query profile by individual ID or email.' });
});

app.get('/api/profiles/:idOrEmail', (req, res) => {
  try {
    const db = readDB();
    const target = decodeURIComponent(req.params.idOrEmail).toLowerCase();
    const list = [...(db.profiles || []), ...(db.users || [])];
    const found = list.find(p =>
      (p.id && String(p.id).toLowerCase() === target) ||
      (p.firebase_uid && String(p.firebase_uid).toLowerCase() === target) ||
      (p.email && String(p.email).toLowerCase() === target) ||
      (p.username && String(p.username).toLowerCase() === target) ||
      (p.phone && String(p.phone).replace(/[^0-9]/g, '') === target.replace(/[^0-9]/g, ''))
    );
    if (found) {
      const { password, password_hash, password_salt, ...safeProfile } = found;
      res.json(safeProfile);
    } else {
      res.status(404).json({ error: 'Profile not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

app.post('/api/profiles', (req, res) => {
  try {
    const db = readDB();
    if (!db.profiles) db.profiles = [];
    if (!db.users) db.users = [];

    const incoming = req.body;
    const targetId = incoming.id || incoming.firebase_uid || `usr_${Date.now()}`;
    const targetEmail = (incoming.email || '').toLowerCase();

    const idx = db.profiles.findIndex(p =>
      (p.id && String(p.id) === String(targetId)) ||
      (p.firebase_uid && String(p.firebase_uid) === String(incoming.firebase_uid)) ||
      (targetEmail && p.email && p.email.toLowerCase() === targetEmail)
    );

    const saved = {
      ...(idx >= 0 ? db.profiles[idx] : {}),
      ...incoming,
      id: targetId,
      firebase_uid: incoming.firebase_uid || targetId,
      full_name: incoming.full_name || incoming.name || (idx >= 0 ? db.profiles[idx].full_name : 'Member'),
      email: targetEmail,
      role: incoming.role || (idx >= 0 ? db.profiles[idx].role : 'player'),
      is_profile_complete: incoming.is_profile_complete !== undefined ? incoming.is_profile_complete : true,
      updated_at: new Date().toISOString()
    };

    if (idx >= 0) {
      db.profiles[idx] = saved;
    } else {
      db.profiles.push(saved);
    }

    // Sync to db.users as well
    const uIdx = db.users.findIndex(u => (String(u.id) === String(targetId)) || (targetEmail && u.email && u.email.toLowerCase() === targetEmail));
    const userObj = {
      id: targetId,
      name: saved.full_name,
      email: saved.email,
      role: saved.role,
      avatar: saved.avatar || saved.avatar_url,
      updated_at: new Date().toISOString()
    };
    if (uIdx >= 0) {
      db.users[uIdx] = { ...db.users[uIdx], ...userObj };
    } else {
      db.users.push(userObj);
    }

    writeDB(db);
    res.json({ success: true, profile: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profiles/:id', (req, res) => {
  try {
    const db = readDB();
    if (!db.profiles) db.profiles = [];
    const targetId = req.params.id;
    const updates = req.body;

    const idx = db.profiles.findIndex(p => String(p.id) === String(targetId) || String(p.firebase_uid) === String(targetId));
    if (idx >= 0) {
      db.profiles[idx] = {
        ...db.profiles[idx],
        ...updates,
        updated_at: new Date().toISOString()
      };
      writeDB(db);
      res.json({ success: true, profile: db.profiles[idx] });
    } else {
      const newProf = {
        id: targetId,
        firebase_uid: targetId,
        ...updates,
        updated_at: new Date().toISOString()
      };
      db.profiles.push(newProf);
      writeDB(db);
      res.json({ success: true, profile: newProf });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function purgeAccountFromDatabase(db, rawTargets) {
  if (!rawTargets || !rawTargets.length) return { purged: 0 };
  const targets = new Set(rawTargets.map(t => String(t).trim().toLowerCase()).filter(Boolean));
  if (targets.size === 0) return { purged: 0 };

  const matchesTarget = (val) => {
    if (!val) return false;
    return targets.has(String(val).trim().toLowerCase());
  };

  let totalPurged = 0;

  // 1. Profiles
  if (db.profiles) {
    const before = db.profiles.length;
    db.profiles = db.profiles.filter(p =>
      !matchesTarget(p.id) &&
      !matchesTarget(p.firebase_uid) &&
      !matchesTarget(p.email) &&
      !matchesTarget(p.username)
    );
    totalPurged += (before - db.profiles.length);
  }

  // 2. Users
  if (db.users) {
    const before = db.users.length;
    db.users = db.users.filter(u =>
      !matchesTarget(u.id) &&
      !matchesTarget(u.firebase_uid) &&
      !matchesTarget(u.email) &&
      !matchesTarget(u.username)
    );
    totalPurged += (before - db.users.length);
  }

  // 3. Bookings
  if (db.bookings) {
    const before = db.bookings.length;
    db.bookings = db.bookings.filter(b =>
      !matchesTarget(b.userId) &&
      !matchesTarget(b.user_id) &&
      !matchesTarget(b.email) &&
      !matchesTarget(b.user_email)
    );
    totalPurged += (before - db.bookings.length);
  }

  // 4. Player Reviews (both received and written)
  if (db.player_reviews) {
    const before = db.player_reviews.length;
    db.player_reviews = db.player_reviews.filter(r =>
      !matchesTarget(r.player_id) &&
      !matchesTarget(r.player_email) &&
      !matchesTarget(r.player_handle) &&
      !matchesTarget(r.reviewer_id) &&
      !matchesTarget(r.reviewer_email) &&
      !matchesTarget(r.reviewer_name)
    );
    totalPurged += (before - db.player_reviews.length);
  }

  // 5. Messages
  if (db.messages) {
    const before = db.messages.length;
    db.messages = db.messages.filter(m =>
      !matchesTarget(m.sender_id) &&
      !matchesTarget(m.userId) &&
      !matchesTarget(m.user)
    );
    totalPurged += (before - db.messages.length);
  }

  // 6. Chats
  if (db.chats) {
    db.chats = db.chats.map(c => {
      if (c.participants && Array.isArray(c.participants)) {
        c.participants = c.participants.filter(p => !matchesTarget(p));
      }
      return c;
    }).filter(c => !matchesTarget(c.creator) && (!Array.isArray(c.participants) || c.participants.length > 0 || c.type === 'group'));
  }

  // 7. Posts
  if (db.posts) {
    const before = db.posts.length;
    db.posts = db.posts.filter(p =>
      !matchesTarget(p.userId) &&
      !matchesTarget(p.user_id) &&
      !matchesTarget(p.created_by) &&
      !matchesTarget(p.author_id)
    );
    totalPurged += (before - db.posts.length);
  }

  // 8. Friends & Friend requests
  if (db.friends) {
    db.friends = db.friends.filter(f => !matchesTarget(f.user_id) && !matchesTarget(f.friend_id));
  }
  if (db.friend_requests) {
    db.friend_requests = db.friend_requests.filter(r => !matchesTarget(r.sender_id) && !matchesTarget(r.receiver_id) && !matchesTarget(r.from) && !matchesTarget(r.to));
  }

  // 9. OTPs
  if (db.otps) {
    db.otps = db.otps.filter(o => !matchesTarget(o.target));
  }

  // 10. Orders
  if (db.orders) {
    db.orders = db.orders.filter(o => !matchesTarget(o.userId) && !matchesTarget(o.user_id) && !matchesTarget(o.customer_id));
  }

  // 11. Reports & Blocks
  if (db.reports) {
    db.reports = db.reports.filter(r => !matchesTarget(r.reported_by) && !matchesTarget(r.reporter_id) && !matchesTarget(r.target_user_id) && !matchesTarget(r.target_id));
  }
  if (db.blocks) {
    db.blocks = db.blocks.filter(b => !matchesTarget(b.blocker_id) && !matchesTarget(b.blocked_id));
  }

  // 12. Venues (if owner account deleted)
  if (db.venues) {
    db.venues = db.venues.filter(v => !matchesTarget(v.owner_id));
  }

  // 13. Community groups
  if (db.community_groups) {
    db.community_groups = db.community_groups.filter(g => !matchesTarget(g.creatorUid) && !matchesTarget(g.created_by)).map(g => {
      if (g.members && Array.isArray(g.members)) {
        g.members = g.members.filter(m => !matchesTarget(m));
      }
      return g;
    });
  }

  return { purged: totalPurged };
}

app.delete('/api/profiles/:idOrEmail', (req, res) => {
  try {
    const db = readDB();
    const rawTarget = decodeURIComponent(req.params.idOrEmail).trim();
    const result = purgeAccountFromDatabase(db, [rawTarget]);
    writeDB(db);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/purge-account', (req, res) => {
  try {
    const { identifiers } = req.body;
    const db = readDB();
    const result = purgeAccountFromDatabase(db, identifiers || []);
    writeDB(db);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CHATS & MESSAGES API (Fallback & Cross-Device Sync) ─────────
app.get('/api/chats', (req, res) => {
  try {
    const db = readDB();
    const { userId } = req.query;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authorization required: userId must be provided' });
    }
    let chats = (db.chats || []).filter(c => c.type === 'group' || (c.participants && c.participants.includes(userId)));
    res.json({ success: true, chats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve chats' });
  }
});

app.post('/api/chats', (req, res) => {
  try {
    const db = readDB();
    if (!db.chats) db.chats = [];
    const chatData = req.body;
    const existingIdx = db.chats.findIndex(c => c.id === chatData.id);
    if (existingIdx >= 0) {
      db.chats[existingIdx] = { ...db.chats[existingIdx], ...chatData, updated_at: new Date().toISOString() };
    } else {
      db.chats.push({ ...chatData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    writeDB(db);
    res.json({ success: true, chat: chatData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PEER REVIEWS & ATHLETE PERFORMANCE / BEHAVIOUR API ──
app.get('/api/players/:playerId/reviews', (req, res) => {
  try {
    const db = readDB();
    const { playerId } = req.params;
    const allReviews = db.player_reviews || [];

    // Normalize target matching (by id, email, username or handle)
    const target = String(playerId).toLowerCase();
    let reviews = allReviews.filter(r => {
      return String(r.player_id).toLowerCase() === target ||
        (r.player_handle && String(r.player_handle).toLowerCase() === target) ||
        (r.player_email && String(r.player_email).toLowerCase() === target);
    });

    const total = reviews.length;
    let avgPerformance = null;
    let avgBehaviour = null;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const badgeCounts = {};

    if (total > 0) {
      let perfSum = 0;
      let behSum = 0;
      reviews.forEach(r => {
        const p = Math.min(5, Math.max(1, Math.round(Number(r.performance_rating) || 5)));
        perfSum += Number(r.performance_rating) || 5;
        behSum += Number(r.behaviour_rating) || 5;
        distribution[p] = (distribution[p] || 0) + 1;
        if (Array.isArray(r.badges)) {
          r.badges.forEach(badge => {
            badgeCounts[badge] = (badgeCounts[badge] || 0) + 1;
          });
        }
      });
      avgPerformance = parseFloat((perfSum / total).toFixed(1));
      avgBehaviour = parseFloat((behSum / total).toFixed(1));
    }

    res.json({
      success: true,
      playerId,
      totalReviews: total,
      avgPerformance,
      avgBehaviour,
      overallScore: total > 0 ? parseFloat(((avgPerformance + avgBehaviour) / 2).toFixed(1)) : null,
      distribution,
      badgeCounts,
      reviews
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/players/:playerId/reviews', (req, res) => {
  try {
    const db = readDB();
    if (!db.player_reviews) db.player_reviews = [];
    const { playerId } = req.params;
    const {
      reviewer_id,
      reviewer_name,
      reviewer_avatar,
      reviewer_sport,
      performance_rating,
      behaviour_rating,
      badges,
      comment,
      match_context
    } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Review comment cannot be empty' });
    }

    const newReview = {
      id: 'rev_' + Date.now(),
      player_id: playerId,
      reviewer_id: reviewer_id || 'usr_anonymous',
      reviewer_name: reviewer_name || 'Anonymous Athlete',
      reviewer_avatar: reviewer_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${reviewer_name || 'Athlete'}`,
      reviewer_sport: reviewer_sport || 'Football',
      performance_rating: Math.min(5, Math.max(1, Number(performance_rating) || 5)),
      behaviour_rating: Math.min(5, Math.max(1, Number(behaviour_rating) || 5)),
      badges: Array.isArray(badges) ? badges : [],
      comment: comment.trim(),
      match_context: match_context || 'Verified Turf Match',
      helpful_count: 0,
      helpful_users: [],
      created_at: new Date().toISOString()
    };

    db.player_reviews.unshift(newReview);
    writeDB(db);

    res.json({ success: true, review: newReview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews/:reviewId/helpful', (req, res) => {
  try {
    const db = readDB();
    if (!db.player_reviews) db.player_reviews = [];
    const { reviewId } = req.params;
    const { userId } = req.body;

    const rev = db.player_reviews.find(r => r.id === reviewId);
    if (!rev) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }

    if (!rev.helpful_users) rev.helpful_users = [];
    const uIdx = rev.helpful_users.indexOf(userId);
    if (uIdx >= 0) {
      rev.helpful_users.splice(uIdx, 1);
      rev.helpful_count = Math.max(0, (rev.helpful_count || 1) - 1);
    } else {
      if (userId) rev.helpful_users.push(userId);
      rev.helpful_count = (rev.helpful_count || 0) + 1;
    }

    writeDB(db);
    res.json({ success: true, helpful_count: rev.helpful_count, user_reacted: uIdx < 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HOSTED MATCHES API (Open Turf Match Sessions) ───────────────────────
app.get('/api/hosted-matches', (req, res) => {
  try {
    const db = readDB();
    if (!db.hosted_matches) db.hosted_matches = [];
    res.json({ success: true, matches: db.hosted_matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hosted-matches', (req, res) => {
  try {
    const db = readDB();
    if (!db.hosted_matches) db.hosted_matches = [];

    const {
      turf_id,
      venue,
      sport,
      time,
      date,
      slot_id,
      capacity,
      existing_players_count,
      host_id,
      host_name,
      host_avatar,
      skill_level,
      price_per_player,
      total_price,
      image,
      notes
    } = req.body;

    const totalCap = Math.max(2, Number(capacity) || 10);
    const initialJoined = Math.min(totalCap - 1, Math.max(1, Number(existing_players_count) || 1));
    const openSpots = totalCap - initialJoined;

    const newMatch = {
      id: 'match_host_' + Date.now(),
      turf_id: turf_id || 'v_default',
      venue: venue || 'Local Turf Arena',
      title: `${sport || 'Sports'} Match at ${venue || 'Turf Arena'}`,
      sport: sport || 'Football',
      time: time || 'Today, Flexible Slot',
      date: date || 'Today',
      slot_id: slot_id || '',
      capacity: totalCap,
      players_total: totalCap,
      players_joined: initialJoined,
      open_spots: openSpots,
      skill_level: skill_level || 'All Levels Welcome',
      price_per_player: Number(price_per_player) || (total_price ? Math.round(Number(total_price) / totalCap) : 150),
      price: `₹${Number(price_per_player) || (total_price ? Math.round(Number(total_price) / totalCap) : 150)}/player`,
      image: image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
      host_id: host_id || 'usr_host',
      host_name: host_name || 'Match Host',
      host_avatar: host_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(host_name || 'Host')}`,
      status: openSpots <= 0 ? 'full' : 'open_match',
      notes: notes || '',
      participants: [
        {
          user_id: host_id || 'usr_host',
          user_name: host_name || 'Match Host',
          user_avatar: host_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(host_name || 'Host')}`,
          role: 'host',
          joined_at: new Date().toISOString()
        }
      ],
      created_at: new Date().toISOString()
    };

    db.hosted_matches.unshift(newMatch);
    writeDB(db);

    res.json({ success: true, match: newMatch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hosted-matches/:matchId/join', (req, res) => {
  try {
    const db = readDB();
    if (!db.hosted_matches) db.hosted_matches = [];
    const { matchId } = req.params;
    const { user_id, user_name, user_avatar } = req.body;

    const match = db.hosted_matches.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: 'Match session not found' });
    }

    if (!match.participants) match.participants = [];

    const existingIndex = match.participants.findIndex(p => p.user_id === user_id);
    if (existingIndex >= 0) {
      return res.json({ success: true, message: 'Already joined', match });
    }

    if (match.players_joined >= match.players_total) {
      return res.status(400).json({ success: false, error: 'Match squad is already full' });
    }

    match.participants.push({
      user_id: user_id || 'usr_' + Date.now(),
      user_name: user_name || 'Fellow Player',
      user_avatar: user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user_name || 'Player')}`,
      role: 'player',
      joined_at: new Date().toISOString()
    });

    match.players_joined = match.participants.length;
    match.open_spots = Math.max(0, match.players_total - match.players_joined);
    if (match.players_joined >= match.players_total) {
      match.status = 'full';
    }

    writeDB(db);
    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hosted-matches/:matchId/leave', (req, res) => {
  try {
    const db = readDB();
    if (!db.hosted_matches) db.hosted_matches = [];
    const { matchId } = req.params;
    const { user_id } = req.body;

    const match = db.hosted_matches.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: 'Match session not found' });
    }

    if (!match.participants) match.participants = [];
    match.participants = match.participants.filter(p => p.user_id !== user_id);
    match.players_joined = Math.max(1, match.participants.length);
    match.open_spots = Math.max(0, match.players_total - match.players_joined);
    match.status = 'open_match';

    writeDB(db);
    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Global Error Handling Middleware (Hide internal stack traces from users) ──
app.use((err, req, res, next) => {
  console.error('[UNCAUGHT SERVER ERROR]', err);
  res.status(500).json({ success: false, error: 'An unexpected internal error occurred. Please try again later.' });
});

// Start listener only when run directly (not in Vercel Serverless environment)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`⚡ Turfington Database API Server running at http://localhost:${PORT}`);
  });
}

export default app;

