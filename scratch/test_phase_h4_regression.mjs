import { db } from '../server/db.ts';

console.log('====================================================');
console.log('PHASE H.4 — REGRESSION TEST SUITE');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
}

// 1. Audit DB state after sanitization
const users = db.getAllUsers();
console.log(`Total production users returned by getAllUsers(): ${users.length}`);

// Test 1: New / unattempted user initialization
const superAdmin = users.find(u => u.email === 'pawankhot9@gmail.com');
assert(superAdmin !== undefined, 'Super admin user pawankhot9@gmail.com exists in DB');
if (superAdmin) {
  assert(superAdmin.totalPoints === 0, `Super admin totalPoints is 0 (actual: ${superAdmin.totalPoints})`);
  assert(superAdmin.currentStreakDays === 0, `Super admin currentStreakDays is 0 (actual: ${superAdmin.currentStreakDays})`);
  assert(superAdmin.targetCompany === '', `Super admin targetCompany is empty (actual: '${superAdmin.targetCompany}')`);
}

// Test 2: Student users zero defaults
const student1 = users.find(u => u.email === 'akhot5779@gmail.com');
if (student1) {
  assert(student1.totalPoints === 0, `Student1 totalPoints is 0 (actual: ${student1.totalPoints})`);
  assert(student1.targetCompany === '', `Student1 targetCompany is empty string (actual: '${student1.targetCompany}')`);
  assert(student1.targetRole === '', `Student1 targetRole is empty string (actual: '${student1.targetRole}')`);
}

// Test 3: Level calculation logic derived strictly from XP
function getLevelInfo(xp) {
  const thresholds = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000];
  let level = 1;
  let nextLevelXp = thresholds[1];

  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) {
      level = i + 1;
      nextLevelXp = thresholds[i + 1] || thresholds[thresholds.length - 1] + 5000;
    } else {
      break;
    }
  }

  if (xp >= thresholds[thresholds.length - 1]) {
    const excess = xp - thresholds[thresholds.length - 1];
    const extraLevels = Math.floor(excess / 5000);
    level = thresholds.length + extraLevels;
    nextLevelXp = thresholds[thresholds.length - 1] + (extraLevels + 1) * 5000;
  }

  return { level, currentXp: xp, nextLevelXp };
}

assert(getLevelInfo(0).level === 1, '0 XP resolves to Level 1');
assert(getLevelInfo(0).nextLevelXp === 100, '0 XP next level threshold is 100');
assert(getLevelInfo(150).level === 2, '150 XP resolves to Level 2');
assert(getLevelInfo(1500).level === 5, '1500 XP resolves to Level 5');

// Test 4: Dynamic candidate registration produces 0 XP and empty targets
const testUserEmail = `h4_test_${Date.now()}@example.com`;
const regUser = db.loginOrRegister(testUserEmail);
assert(regUser.totalPoints === 0, `Newly registered user has 0 XP (actual: ${regUser.totalPoints})`);
assert(regUser.targetCompany === '', `Newly registered user has empty targetCompany (actual: '${regUser.targetCompany}')`);
assert(regUser.name === testUserEmail.split('@')[0], `Newly registered user name defaults to username prefix without fake fallbacks (actual: '${regUser.name}')`);

// Test 5: Leaderboard filtering is_test = 1 and unranked logic
const nationalLeaderboard = db.getNationalLeagueLeaderboard(regUser.id);
assert(nationalLeaderboard.isUnranked === true, 'User with 0 XP / 0 attempts is marked isUnranked = true');

// Clean up test candidate
db.cleanupTemporaryUsers('h4_test_');

console.log('\n====================================================');
console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
