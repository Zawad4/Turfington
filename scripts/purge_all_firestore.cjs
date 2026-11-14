const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  setDoc,
  writeBatch 
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJse-qZuxrbKM51ze5HQaw31CitPsdV5o',
  authDomain: 'turfington-b759a.firebaseapp.com',
  projectId: 'turfington-b759a'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TARGET_COLLECTIONS = [
  'users',
  'profiles',
  'venues',
  'turfs',
  'tournaments',
  'reviews',
  'player_reviews',
  'bookings',
  'marketplace_items',
  'communityGroups',
  'posts',
  'stories',
  'clubs',
  'follows',
  'friendships',
  'hosted_matches',
  'reports',
  'notifications'
];

async function purgeCollection(colName) {
  process.stdout.write(`Purging ${colName}... `);
  try {
    const snap = await getDocs(collection(db, colName));
    if (snap.empty) {
      console.log('0 docs (clean)');
      return;
    }
    
    // Batch delete in chunks of 400
    const docs = snap.docs;
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`deleted ${docs.length} docs`);
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
}

async function purgeConversations() {
  process.stdout.write(`Purging conversations and messages... `);
  try {
    const snap = await getDocs(collection(db, 'conversations'));
    if (snap.empty) {
      console.log('0 docs (clean)');
      return;
    }
    
    let totalMessages = 0;
    for (const convDoc of snap.docs) {
      try {
        const msgSnap = await getDocs(collection(db, `conversations/${convDoc.id}/messages`));
        if (!msgSnap.empty) {
          const batch = writeBatch(db);
          msgSnap.docs.forEach(m => batch.delete(m.ref));
          await batch.commit();
          totalMessages += msgSnap.size;
        }
      } catch {}
      await deleteDoc(convDoc.ref);
    }
    console.log(`deleted ${snap.size} conversations and ${totalMessages} messages`);
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
}

async function main() {
  console.log('--- STARTING TOTAL FIRESTORE PURGE ---');
  
  for (const col of TARGET_COLLECTIONS) {
    await purgeCollection(col);
  }
  
  await purgeConversations();

  console.log('--- RE-INITIALIZING SOLE OFFICIAL ADMIN ACCOUNT ---');
  const adminAccount = {
    id: 'turfington_admin_official',
    uid: 'turfington_admin_official',
    firebase_uid: 'turfington_admin_official',
    name: 'Turfington Support & Security',
    full_name: 'Turfington Support & Security',
    displayName: 'Turfington Support & Security',
    email: 'admin@turfington.com',
    role: 'admin',
    is_admin: true,
    is_verified: true,
    badge: 'Support & Security Desk',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
    avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
    avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
    sport: 'Platform Security & Verification',
    bio: 'Official Turfington Customer Support & Verification Desk. We monitor activities and verify player & venue owner profiles.',
    is_profile_complete: true,
    phone: '+91 800-TURF-SEC',
    created_at: new Date().toISOString()
  };

  await setDoc(doc(db, 'users', 'turfington_admin_official'), adminAccount, { merge: true });
  await setDoc(doc(db, 'profiles', 'turfington_admin_official'), adminAccount, { merge: true });
  console.log('✓ Sole official Admin & Security account provisioned.');
  console.log('--- PURGE COMPLETE: FIRESTORE IS 100% FRESH ---');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal purge error:', err);
  process.exit(1);
});
