const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve('Vulnerability Test Results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Color Palette
const NAVY_DARK = '1E1B4B';
const INDIGO_PRIMARY = '4338CA';
const INDIGO_LIGHT = 'E0E7FF';
const EMERALD_DARK = '065F46';
const EMERALD_LIGHT = 'D1FAE5';
const ROSE_DARK = '9F1239';
const ROSE_LIGHT = 'FFE4E6';
const AMBER_DARK = 'B45309';
const AMBER_LIGHT = 'FEF3C7';
const GRAY_BORDER = 'E2E8F0';
const ZEBRA_LIGHT = 'F8FAFC';

// 55 Discovered Endpoints
const ENDPOINTS = [
  { method: 'GET', path: '/api/health', auth: 'No', role: 'Public', file: 'server.js:683', desc: 'Health check and database ping' },
  { method: 'POST', path: '/api/auth/send-otp', auth: 'Rate-Limited', role: 'Public', file: 'server.js:688', desc: 'Dispatch 6-digit OTP to mobile or email' },
  { method: 'POST', path: '/api/auth/verify-otp', auth: 'Rate-Limited', role: 'Public', file: 'server.js:735', desc: 'Verify OTP code and authenticate session' },
  { method: 'PUT', path: '/api/user/profile', auth: 'Weak (Param)', role: 'User', file: 'server.js:793', desc: 'Update user profile data' },
  { method: 'GET', path: '/api/venues', auth: 'No', role: 'Public', file: 'server.js:822', desc: 'Query all sports turfs and venues' },
  { method: 'POST', path: '/api/venues', auth: 'Weak (Body ID)', role: 'Owner', file: 'server.js:854', desc: 'Create new sports facility' },
  { method: 'DELETE', path: '/api/venues/:id', auth: 'None (VULN)', role: 'Anyone (IDOR)', file: 'server.js:895', desc: 'Delete venue without owner verification' },
  { method: 'GET', path: '/api/bookings', auth: 'Scoped (Query)', role: 'User / Owner', file: 'server.js:904', desc: 'Retrieve bookings for user or venue' },
  { method: 'POST', path: '/api/bookings', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:922', desc: 'Create new slot reservation' },
  { method: 'GET', path: '/api/messages', auth: 'Scoped (ChatId)', role: 'Participant', file: 'server.js:950', desc: 'Fetch conversation messages' },
  { method: 'POST', path: '/api/messages', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:961', desc: 'Send new chat message' },
  { method: 'GET', path: '/api/posts', auth: 'No', role: 'Public', file: 'server.js:1017', desc: 'Get community feed posts' },
  { method: 'POST', path: '/api/posts', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1022', desc: 'Create community feed post' },
  { method: 'POST', path: '/api/posts/:id/like', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1047', desc: 'Toggle like on post' },
  { method: 'GET', path: '/api/users', auth: 'No', role: 'Public', file: 'server.js:1084', desc: 'Search and query registered players' },
  { method: 'GET', path: '/api/friends', auth: 'Weak (Query)', role: 'User', file: 'server.js:1157', desc: 'Fetch user friends and pending requests' },
  { method: 'POST', path: '/api/friends/request', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1183', desc: 'Send friend connection request' },
  { method: 'POST', path: '/api/friends/respond', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1224', desc: 'Accept or decline friend request' },
  { method: 'GET', path: '/api/chats', auth: 'Scoped (Query)', role: 'Participant', file: 'server.js:1287', desc: 'List active chats for specified user' },
  { method: 'POST', path: '/api/chats/direct', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1309', desc: 'Create or return 1-on-1 direct message' },
  { method: 'POST', path: '/api/chats/group', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1341', desc: 'Create new group chat' },
  { method: 'POST', path: '/api/chats/entity', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1373', desc: 'Create match-specific discussion channel' },
  { method: 'GET', path: '/api/community-groups', auth: 'No', role: 'Public', file: 'server.js:1499', desc: 'Browse discoverable clubs and groups' },
  { method: 'POST', path: '/api/community-groups', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1514', desc: 'Create new sports club or community' },
  { method: 'POST', path: '/api/community-groups/:id/join', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1606', desc: 'Join community group' },
  { method: 'POST', path: '/api/community-groups/:id/leave', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1639', desc: 'Leave community group' },
  { method: 'GET', path: '/api/messages (v2)', auth: 'Scoped (ChatId)', role: 'Participant', file: 'server.js:1668', desc: 'Paginated message history' },
  { method: 'POST', path: '/api/messages (v2)', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1684', desc: 'Send message with rich attachments' },
  { method: 'POST', path: '/api/messages/react', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1771', desc: 'Add emoji reaction to message' },
  { method: 'POST', path: '/api/messages/edit', auth: 'Weak (Body ID)', role: 'Author', file: 'server.js:1797', desc: 'Edit existing chat message' },
  { method: 'POST', path: '/api/messages/delete', auth: 'Weak (Body ID)', role: 'Author', file: 'server.js:1814', desc: 'Delete chat message' },
  { method: 'POST', path: '/api/blocks', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1830', desc: 'Block or unblock user' },
  { method: 'POST', path: '/api/reports', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1847', desc: 'Submit safety / moderation report' },
  { method: 'GET', path: '/api/payments/config', auth: 'No', role: 'Public', file: 'server.js:1874', desc: 'Exposes public Razorpay client key' },
  { method: 'POST', path: '/api/payments/create-order', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:1883', desc: 'Initiate Razorpay checkout order' },
  { method: 'POST', path: '/api/payments/verify', auth: 'Insecure Fallback', role: 'User', file: 'server.js:1962', desc: 'Verify payment signature (Bypassable)' },
  { method: 'POST', path: '/api/payments/webhook', auth: 'Optional Signature', role: 'Razorpay / Any', file: 'server.js:2040', desc: 'Process payment events (Bypassable if no header)' },
  { method: 'GET', path: '/api/posts (alt)', auth: 'No', role: 'Public', file: 'server.js:2094', desc: 'Secondary posts listing' },
  { method: 'POST', path: '/api/posts (alt)', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2104', desc: 'Secondary post creation' },
  { method: 'POST', path: '/api/posts/:id/like (alt)', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2130', desc: 'Secondary post like' },
  { method: 'GET', path: '/api/profiles', auth: 'Forbidden (403)', role: 'Blocked', file: 'server.js:2158', desc: 'Bulk harvesting blocked' },
  { method: 'GET', path: '/api/profiles/:idOrEmail', auth: 'No', role: 'Public', file: 'server.js:2162', desc: 'Get sanitized user profile' },
  { method: 'POST', path: '/api/profiles', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2185', desc: 'Create or sync user profile' },
  { method: 'PUT', path: '/api/profiles/:id', auth: 'None (VULN)', role: 'Anyone (IDOR)', file: 'server.js:2242', desc: 'Overwrite any user profile data & role' },
  { method: 'DELETE', path: '/api/profiles/:idOrEmail', auth: 'None (VULN)', role: 'Anyone (IDOR)', file: 'server.js:2413', desc: 'Permanently delete profile without auth' },
  { method: 'POST', path: '/api/users/purge-account', auth: 'None (VULN)', role: 'Anyone (IDOR)', file: 'server.js:2425', desc: 'Purge accounts in bulk without auth' },
  { method: 'GET', path: '/api/chats (alt)', auth: 'Scoped (Query)', role: 'Participant', file: 'server.js:2438', desc: 'Secondary chats fetch' },
  { method: 'POST', path: '/api/chats (alt)', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2452', desc: 'Secondary chat creation' },
  { method: 'GET', path: '/api/players/:playerId/reviews', auth: 'No', role: 'Public', file: 'server.js:2471', desc: 'Fetch peer reviews for athlete' },
  { method: 'POST', path: '/api/players/:playerId/reviews', auth: 'Weak (Body ID)', role: 'Player', file: 'server.js:2537', desc: 'Submit rating and feedback' },
  { method: 'POST', path: '/api/reviews/:reviewId/helpful', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2584', desc: 'Vote helpful on review' },
  { method: 'GET', path: '/api/hosted-matches', auth: 'No', role: 'Public', file: 'server.js:2614', desc: 'Browse open community sports matches' },
  { method: 'POST', path: '/api/hosted-matches', auth: 'Weak (Body ID)', role: 'Host', file: 'server.js:2624', desc: 'Create new open community match' },
  { method: 'POST', path: '/api/hosted-matches/:matchId/join', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2695', desc: 'Join open match roster' },
  { method: 'POST', path: '/api/hosted-matches/:matchId/leave', auth: 'Weak (Body ID)', role: 'User', file: 'server.js:2739', desc: 'Leave open match roster' }
];

// Security Findings
const FINDINGS = [
  {
    id: 'SEC-CRIT-001',
    severity: 'Critical',
    category: 'Broken Access Control & IDOR',
    title: 'Unauthenticated Account Purge & Arbitrary Profile Deletion',
    file: 'server.js:2413, 2425',
    endpoint: 'DELETE /api/profiles/:idOrEmail, POST /api/users/purge-account',
    cwe: 'CWE-284: Improper Access Control',
    owasp: 'API1:2023 - Broken Object Level Authorization',
    description: 'Endpoints allow any unauthenticated external caller to permanently delete any user profile or bulk purge platform accounts simply by supplying email or ID.',
    impact: 'Irreversible data destruction, catastrophic denial of service for users, total account takeover / lockout.',
    remediation: 'Require cryptographic Bearer token authentication (Firebase ID Token) and verify request.auth.uid matches the target account being purged.'
  },
  {
    id: 'SEC-CRIT-002',
    severity: 'Critical',
    category: 'Payment & Business Logic Bypass',
    title: 'Webhook Signature Check Bypass & Fake Payment Verification Fallback',
    file: 'server.js:1962, 2040',
    endpoint: 'POST /api/payments/verify, POST /api/payments/webhook',
    cwe: 'CWE-347: Improper Verification of Cryptographic Signature',
    owasp: 'API8:2023 - Security Misconfiguration',
    description: 'The webhook endpoint only checks HMAC signature if the header is present (skips verification when header omitted). Furthermore, /api/payments/verify contains an unverified test fallback returning verified: true.',
    impact: 'Attackers can spoof successful bookings and merchandise orders without paying a single rupee.',
    remediation: 'Strictly enforce HMAC SHA-256 signature presence on all webhook payloads using crypto.timingSafeEqual. Eliminate test-mode fallback on production payments.'
  },
  {
    id: 'SEC-CRIT-003',
    severity: 'Critical',
    category: 'Broken Authorization & IDOR',
    title: 'Unauthenticated Facility / Venue Deletion via IDOR',
    file: 'server.js:895',
    endpoint: 'DELETE /api/venues/:id',
    cwe: 'CWE-639: Authorization Bypass Through User-Controlled Key',
    owasp: 'API1:2023 - Broken Object Level Authorization',
    description: 'The venue deletion endpoint accepts any venue ID in the URL path and removes it from the database with zero authentication, role verification, or ownership check.',
    impact: 'Malicious actors can wipe out all registered sports facilities across the platform.',
    remediation: 'Implement authentication middleware and verify that req.user.id matches venue.owner_id before allowing deletion.'
  },
  {
    id: 'SEC-HIGH-001',
    severity: 'High',
    category: 'Hardcoded Cryptographic Secrets',
    title: 'Hardcoded Razorpay Payment Secret Key in Source Code',
    file: 'server.js:1871',
    endpoint: 'server.js (Global Scope)',
    cwe: 'CWE-798: Use of Hard-coded Credentials',
    owasp: 'API8:2023 - Security Misconfiguration',
    description: 'The Razorpay API secret key has a hardcoded test secret fallback in source code ("REMOVED_SECRET") instead of strictly reading from secure environment variables.',
    impact: 'Exposure of payment gateway credentials leading to unauthorized transaction refunds, customer charge manipulation, and data leaks.',
    remediation: 'Remove default plaintext credential string; require process.env.RAZORPAY_KEY_SECRET to be supplied via secure secret management.'
  },
  {
    id: 'SEC-HIGH-002',
    severity: 'High',
    category: 'Mass Assignment & Privilege Escalation',
    title: 'Arbitrary Profile Mutation & Role Escalation via PUT /api/profiles/:id',
    file: 'server.js:2242',
    endpoint: 'PUT /api/profiles/:id',
    cwe: 'CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes',
    owasp: 'API3:2023 - Broken Object Property Level Authorization',
    description: 'Any user can update any target profile by sending unauthenticated PUT requests with arbitrary JSON keys, including modifying user role to "owner" or tampering with player IDs.',
    impact: 'Vertical privilege escalation (player to facility owner) and unauthorized identity tampering.',
    remediation: 'Authenticate requests with verified session tokens and whitelist modifiable attributes (full_name, bio, avatar) while disallowing role changes.'
  },
  {
    id: 'SEC-HIGH-003',
    severity: 'High',
    category: 'Broken Authentication',
    title: 'Lack of Bearer Token Validation on REST Endpoints (Identity Spoofing)',
    file: 'server.js:All Routes',
    endpoint: '/api/venues, /api/bookings, /api/chats, /api/community-groups',
    cwe: 'CWE-306: Missing Authentication for Critical Function',
    owasp: 'API2:2023 - Broken Authentication',
    description: 'Most endpoints determine user identity based on untrusted user_id or userId passed in req.body or req.query without verifying Firebase ID Token JWT signatures.',
    impact: 'Any user can impersonate other players, book courts under other identities, or read private direct messages.',
    remediation: 'Introduce Firebase Admin SDK auth middleware (firebaseAuthMiddleware) to verify Authorization: Bearer <idToken> on all protected routes.'
  },
  {
    id: 'SEC-MED-001',
    severity: 'Medium',
    category: 'Security Misconfiguration',
    title: 'Wildcard Permissive CORS Configuration',
    file: 'server.js:14',
    endpoint: 'Global Middleware',
    cwe: 'CWE-942: Permissive Cross-Domain Policy with Untrusted Domains',
    owasp: 'API8:2023 - Security Misconfiguration',
    description: 'app.use(cors()) permits all external web origins (*) to communicate with the backend without origin restriction.',
    impact: 'Enables cross-origin data extraction and unauthorized API requests from third-party websites in authenticated browser contexts.',
    remediation: 'Configure CORS with an explicit origin whitelist (e.g. [http://localhost:5173, https://turfington.com]).'
  },
  {
    id: 'SEC-MED-002',
    severity: 'Medium',
    category: 'Input Validation & DoS',
    title: 'Large Payload Limit (20MB) Without Upload File Signature Validation',
    file: 'server.js:15',
    endpoint: 'Global Middleware',
    cwe: 'CWE-400: Uncontrolled Resource Consumption',
    owasp: 'API4:2023 - Unrestricted Resource Consumption',
    description: 'The Express JSON body parser accepts up to 20MB of JSON per request. Base64 images are stored directly in JSON without magic-byte verification.',
    impact: 'Server memory exhaustion, disk bloat in JSON document store, potential storage of malformed binary payloads.',
    remediation: 'Reduce JSON body limit to 1MB; handle file uploads via multipart/form-data with magic number validation or offload directly to Cloud Storage.'
  },
  {
    id: 'SEC-MED-003',
    severity: 'Medium',
    category: 'Rate Limiting',
    title: 'Missing Rate Limiting on General API Endpoints',
    file: 'server.js:Global',
    endpoint: '/api/venues, /api/bookings, /api/messages, /api/payments/create-order',
    cwe: 'CWE-799: Improper Control of Interaction Frequency',
    owasp: 'API4:2023 - Unrestricted Resource Consumption',
    description: 'While OTP routes have rate limiting, other high-traffic endpoints (order creation, booking requests, messages) lack rate limiting, allowing API scraping and DoS.',
    impact: 'Automated venue scraping, spamming booking slots, and resource starvation.',
    remediation: 'Apply global rate limiting middleware (e.g. 100 requests per minute per IP) across all API routes.'
  },
  {
    id: 'SEC-LOW-001',
    severity: 'Low',
    category: 'Information Disclosure',
    title: 'Detailed Server Logging of Customer Contact & Order Receipts',
    file: 'server.js:627, 1897',
    endpoint: '/api/auth/send-otp, /api/payments/create-order',
    cwe: 'CWE-532: Insertion of Sensitive Information into Log File',
    owasp: 'API9:2023 - Improper Inventory Management',
    description: 'Phone numbers and emails are logged to console.log in plaintext during OTP dispatch and order creation.',
    impact: 'Potential log exposure in shared monitoring or CI environments.',
    remediation: 'Mask phone numbers (+91 XXXXX X4321) and emails (z***@gmail.com) before outputting to stdout.'
  }
];

// Dependency Vulnerabilities
const DEPENDENCIES = [
  { name: '@capacitor/android', version: '8.4.2', severity: 'High', cve: 'GHSA-rvm3-566m-v7fv', description: 'Capacitor Android and iOS: remote content can be loaded at the app origin via internal HTTP proxy path', fix: 'npm audit fix' },
  { name: '@capacitor/ios', version: '8.4.2', severity: 'High', cve: 'GHSA-rvm3-566m-v7fv', description: 'Capacitor Android and iOS: remote content can be loaded at the app origin via internal HTTP proxy path', fix: 'npm audit fix' },
  { name: '@grpc/grpc-js', version: '1.13.5', severity: 'High', cve: 'GHSA-m9gg-hp2v-232j', description: 'In certain configurations, getAuthContext can return unauthorized certificates', fix: 'npm update @grpc/grpc-js' },
  { name: 'basic-ftp', version: '<=6.2.0', severity: 'High', cve: 'GHSA-c475-qrg2-pj4r', description: 'Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser', fix: 'npm audit fix --force' },
  { name: 'diff', version: '6.0.0', severity: 'Moderate', cve: 'GHSA-73rr-hh4g-fpgx', description: 'jsdiff Denial of Service vulnerability in parsePatch and applyPatch', fix: 'npm update diff' },
  { name: 'extract-zip', version: '2.0.1', severity: 'High', cve: 'GHSA-jmr9-qjv8-65gv', description: 'Unvalidated symlink path traversal and arbitrary file write through archive entries', fix: 'npm audit fix --force' },
  { name: 'serialize-javascript', version: '6.0.2', severity: 'High', cve: 'GHSA-5c6j-r48x-rmvq', description: 'Vulnerable to RCE via RegExp.flags and Date.prototype.toISOString()', fix: 'npm update serialize-javascript' },
  { name: 'uuid', version: '9.0.1', severity: 'Moderate', cve: 'GHSA-w5hq-g745-h8pq', description: 'Missing buffer bounds check in v3/v5/v6 when buf is provided', fix: 'npm update uuid' }
];

async function generateWorkbooks() {
  console.log('Generating Security Review Excel Workbooks...');

  // ==========================================
  // WORKBOOK 1: findings.xlsx (4 Sheets)
  // ==========================================
  const findingsWb = new ExcelJS.Workbook();
  findingsWb.creator = 'Antigravity Enterprise Security Team';
  findingsWb.created = new Date();

  // SHEET 1: Security Findings
  const s1 = findingsWb.addWorksheet('Security Findings', { views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }] });
  s1.columns = [
    { header: 'Finding ID', key: 'id', width: 16 },
    { header: 'Severity', key: 'severity', width: 14 },
    { header: 'Vulnerability Category', key: 'category', width: 28 },
    { header: 'Vulnerability Title', key: 'title', width: 38 },
    { header: 'File Location', key: 'file', width: 24 },
    { header: 'Endpoint', key: 'endpoint', width: 32 },
    { header: 'CWE Identifier', key: 'cwe', width: 30 },
    { header: 'OWASP API Top 10', key: 'owasp', width: 30 },
    { header: 'Technical Description', key: 'description', width: 45 },
    { header: 'Exploitation Scenario & Impact', key: 'impact', width: 45 },
    { header: 'Remediation Recommendation', key: 'remediation', width: 45 }
  ];
  styleHeaders(s1);

  FINDINGS.forEach((f, idx) => {
    const row = s1.addRow(f);
    row.height = 32;
    applyZebraAndBorders(row, idx);

    // Severity Pill
    const sevCell = row.getCell(2);
    if (f.severity === 'Critical') {
      sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_LIGHT } };
      sevCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROSE_DARK } };
    } else if (f.severity === 'High') {
      sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
      sevCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC2410C' } };
    } else if (f.severity === 'Medium') {
      sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_LIGHT } };
      sevCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: AMBER_DARK } };
    } else {
      sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      sevCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
    }
    sevCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  s1.autoFilter = { from: 'A1', to: `K${FINDINGS.length + 1}` };

  // SHEET 2: Endpoint Inventory
  const s2 = findingsWb.addWorksheet('Endpoint Inventory', { views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }] });
  s2.columns = [
    { header: 'HTTP Method', key: 'method', width: 14 },
    { header: 'Endpoint Path', key: 'path', width: 38 },
    { header: 'Authentication Required', key: 'auth', width: 22 },
    { header: 'Expected Role / Scope', key: 'role', width: 20 },
    { header: 'Source File & Line', key: 'file', width: 22 },
    { header: 'Route Purpose & Functionality', key: 'desc', width: 45 }
  ];
  styleHeaders(s2);

  ENDPOINTS.forEach((ep, idx) => {
    const row = s2.addRow(ep);
    row.height = 24;
    applyZebraAndBorders(row, idx);

    // Method coloring
    const mCell = row.getCell(1);
    mCell.font = { name: 'Calibri', size: 10, bold: true };
    mCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (ep.method === 'GET') mCell.font.color = { argb: 'FF0284C7' };
    else if (ep.method === 'POST') mCell.font.color = { argb: 'FF16A34A' };
    else if (ep.method === 'PUT') mCell.font.color = { argb: 'FFEAB308' };
    else if (ep.method === 'DELETE') mCell.font.color = { argb: 'FFE11D48' };

    // Auth highlight
    const aCell = row.getCell(3);
    if (ep.auth.includes('VULN') || ep.auth.includes('None')) {
      aCell.font = { bold: true, color: { argb: ROSE_DARK } };
      aCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_LIGHT } };
    }
  });
  s2.autoFilter = { from: 'A1', to: `F${ENDPOINTS.length + 1}` };

  // SHEET 3: Dependency Vulnerabilities
  const s3 = findingsWb.addWorksheet('Dependency Vulnerabilities', { views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }] });
  s3.columns = [
    { header: 'Package Name', key: 'name', width: 24 },
    { header: 'Installed Version', key: 'version', width: 18 },
    { header: 'Severity', key: 'severity', width: 14 },
    { header: 'CVE / Advisory ID', key: 'cve', width: 26 },
    { header: 'Vulnerability Summary', key: 'description', width: 55 },
    { header: 'Recommended Upgrade / Fix', key: 'fix', width: 28 }
  ];
  styleHeaders(s3);

  DEPENDENCIES.forEach((dep, idx) => {
    const row = s3.addRow(dep);
    row.height = 26;
    applyZebraAndBorders(row, idx);

    const sevCell = row.getCell(3);
    sevCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sevCell.font = { name: 'Calibri', size: 10, bold: true };
    if (dep.severity === 'High') {
      sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_LIGHT } };
      sevCell.font.color = { argb: ROSE_DARK };
    } else {
      sevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_LIGHT } };
      sevCell.font.color = { argb: AMBER_DARK };
    }
  });
  s3.autoFilter = { from: 'A1', to: `F${DEPENDENCIES.length + 1}` };

  // SHEET 4: Risk Summary
  const s4 = findingsWb.addWorksheet('Risk Summary', { views: [{ showGridLines: true }] });
  buildRiskSummarySheet(s4);

  // Write findings.xlsx
  const findingsPath = path.join(OUTPUT_DIR, 'findings.xlsx');
  await findingsWb.xlsx.writeFile(findingsPath);
  console.log('✓ Created:', findingsPath);

  // ==========================================
  // WORKBOOK 2: endpoint-inventory.xlsx
  // ==========================================
  const endpointWb = new ExcelJS.Workbook();
  endpointWb.creator = 'Antigravity Enterprise Security Team';
  const epSheet = endpointWb.addWorksheet('Endpoint Inventory', { views: [{ showGridLines: true, state: 'frozen', ySplit: 1 }] });
  epSheet.columns = s2.columns;
  styleHeaders(epSheet);
  ENDPOINTS.forEach((ep, idx) => {
    const row = epSheet.addRow(ep);
    row.height = 24;
    applyZebraAndBorders(row, idx);
    const mCell = row.getCell(1);
    mCell.font = { name: 'Calibri', size: 10, bold: true };
    mCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (ep.method === 'GET') mCell.font.color = { argb: 'FF0284C7' };
    else if (ep.method === 'POST') mCell.font.color = { argb: 'FF16A34A' };
    else if (ep.method === 'PUT') mCell.font.color = { argb: 'FFEAB308' };
    else if (ep.method === 'DELETE') mCell.font.color = { argb: 'FFE11D48' };
  });
  epSheet.autoFilter = { from: 'A1', to: `F${ENDPOINTS.length + 1}` };

  const endpointPath = path.join(OUTPUT_DIR, 'endpoint-inventory.xlsx');
  await endpointWb.xlsx.writeFile(endpointPath);
  console.log('✓ Created:', endpointPath);
}

function styleHeaders(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: INDIGO_PRIMARY } },
      right: { style: 'thin', color: { argb: 'FF312E81' } }
    };
  });
}

function applyZebraAndBorders(row, idx) {
  const isEven = idx % 2 === 0;
  const rowBg = isEven ? 'FFFFFFFF' : ZEBRA_LIGHT;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Calibri', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: GRAY_BORDER } },
      right: { style: 'thin', color: { argb: GRAY_BORDER } }
    };
  });
}

function buildRiskSummarySheet(s) {
  s.mergeCells('B2:G3');
  const title = s.getCell('B2');
  title.value = 'TURFINGTON BACKEND SECURITY ASSESSMENT - RISK SUMMARY';
  title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_DARK } };

  // KPI Metrics
  const cards = [
    { col: 'B', lbl: 'OVERALL SCORE', val: '64 / 100', bg: 'EEF2FF', fg: INDIGO_PRIMARY },
    { col: 'C', lbl: 'CRITICAL RISKS', val: '3', bg: ROSE_LIGHT, fg: ROSE_DARK },
    { col: 'D', lbl: 'HIGH RISKS', val: '3', bg: 'FFFFEDD5', fg: 'FFC2410C' },
    { col: 'E', lbl: 'MEDIUM RISKS', val: '3', bg: AMBER_LIGHT, fg: AMBER_DARK },
    { col: 'F', lbl: 'LOW RISKS', val: '1', bg: 'FFF1F5F9', fg: 'FF475569' },
    { col: 'G', lbl: 'TOTAL ENDPOINTS', val: '55', bg: 'F1F5F9', fg: '0F172A' }
  ];

  cards.forEach(c => {
    const valCell = s.getCell(`${c.col}5`);
    valCell.value = c.val;
    valCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: c.fg } };
    valCell.alignment = { vertical: 'middle', horizontal: 'center' };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } };
    valCell.border = { top: { style: 'thin', color: { argb: GRAY_BORDER } }, left: { style: 'thin', color: { argb: GRAY_BORDER } }, right: { style: 'thin', color: { argb: GRAY_BORDER } } };

    const lblCell = s.getCell(`${c.col}6`);
    lblCell.value = c.lbl;
    lblCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
    lblCell.alignment = { vertical: 'middle', horizontal: 'center' };
    lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.bg } };
    lblCell.border = { bottom: { style: 'thin', color: { argb: GRAY_BORDER } }, left: { style: 'thin', color: { argb: GRAY_BORDER } }, right: { style: 'thin', color: { argb: GRAY_BORDER } } };
  });

  // Top 3 Critical Risks
  s.mergeCells('B8:G8');
  const riskHdr = s.getCell('B8');
  riskHdr.value = 'TOP 3 CRITICAL SECURITY VULNERABILITIES REQUIRING IMMEDIATE ACTION';
  riskHdr.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  riskHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_DARK } };
  riskHdr.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const topRisks = [
    ['1. Arbitrary Account Deletion', 'DELETE /api/profiles/:idOrEmail & POST /api/users/purge-account have no authentication. Any attacker can delete all platform user accounts.'],
    ['2. Payment Webhook Signature Bypass', 'POST /api/payments/webhook processes payments as confirmed even when x-razorpay-signature header is absent, allowing free turf bookings.'],
    ['3. Unauthenticated Facility Deletion', 'DELETE /api/venues/:id allows any anonymous user to delete any sports facility without owner verification.']
  ];

  topRisks.forEach((tr, i) => {
    const row = 9 + i;
    const r1 = s.getCell(`B${row}`);
    r1.value = tr[0];
    r1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: ROSE_DARK } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : ZEBRA_LIGHT } };
    r1.border = { left: { style: 'thin', color: { argb: GRAY_BORDER } }, bottom: { style: 'thin', color: { argb: GRAY_BORDER } } };

    s.mergeCells(`C${row}:G${row}`);
    const r2 = s.getCell(`C${row}`);
    r2.value = tr[1];
    r2.font = { name: 'Calibri', size: 10 };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : ZEBRA_LIGHT } };
    r2.border = { right: { style: 'thin', color: { argb: GRAY_BORDER } }, bottom: { style: 'thin', color: { argb: GRAY_BORDER } } };
  });

  s.getColumn('A').width = 4;
  s.getColumn('B').width = 28;
  s.getColumn('C').width = 18;
  s.getColumn('D').width = 18;
  s.getColumn('E').width = 18;
  s.getColumn('F').width = 18;
  s.getColumn('G').width = 20;
}

generateWorkbooks().catch(err => {
  console.error('Error generating workbooks:', err);
  process.exit(1);
});

