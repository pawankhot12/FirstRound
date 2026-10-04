import { db } from '../server/db';

const allQ = db.getAllCanonicalQuestions();
console.log('Total canonical questions count:', allQ.length);

const stats = db.getAdminStats();
console.log('Admin stats:', stats);
