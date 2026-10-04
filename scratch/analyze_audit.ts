import fs from 'fs';
const data = JSON.parse(fs.readFileSync('scratch/audit_output.json', 'utf8'));
const out: string[] = [];

const realUserIds = ['user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779', 'user_1790181923870_xfbfk'];

out.push('=== NON-FREE CREDIT LEDGER ENTRIES (REAL USERS) ===');
const realNonFree = data.creditLedger.filter((c: any) => realUserIds.includes(c.userId) && c.source !== 'FREE');
out.push('Real users non-FREE entries: ' + realNonFree.length);
for (const c of realNonFree) out.push(JSON.stringify(c));

out.push('');
out.push('=== PLUS TEST SELECTIONS (REAL USERS) ===');
const realPlusSel = data.plusTestSelections.filter((s: any) => realUserIds.includes(s.userId));
out.push('Count: ' + realPlusSel.length);
for (const s of realPlusSel) out.push(JSON.stringify(s));

out.push('');
out.push('=== CREDIT LEDGER SUMMARY ===');
out.push('Total entries: ' + data.creditLedger.length);
out.push('FREE source: ' + data.creditLedger.filter((c: any) => c.source === 'FREE').length);
out.push('PURCHASED source: ' + data.creditLedger.filter((c: any) => c.source === 'PURCHASED').length);
out.push('PREMIUM source: ' + data.creditLedger.filter((c: any) => c.source === 'PREMIUM').length);

out.push('');
out.push('=== PLUS SELECTIONS SUMMARY ===');
out.push('Total: ' + data.plusTestSelections.length);
out.push('Real users: ' + realPlusSel.length);
out.push('Test users: ' + data.plusTestSelections.filter((s: any) => !realUserIds.includes(s.userId)).length);

out.push('');
out.push('=== PAYMENT ORDER SUMMARY ===');
out.push('Total: ' + data.paymentOrders.length);
const realOrders = data.paymentOrders.filter((o: any) => realUserIds.includes(o.userId));
out.push('Real user orders: ' + realOrders.length);
for (const o of realOrders) out.push(JSON.stringify({id: o.id, userId: o.userId, type: o.productType, amount: o.amount, status: o.status, razorpayOrderId: o.razorpayOrderId}));

out.push('');
out.push('=== SUBSCRIPTION SUMMARY ===');
out.push('Total: ' + data.premiumSubscriptions.length);
for (const s of data.premiumSubscriptions) out.push(JSON.stringify({id: s.id, userId: s.userId, plan: s.plan, status: s.status, razorpayPlanId: s.razorpayPlanId}));

fs.writeFileSync('scratch/audit_analysis.txt', out.join('\n'));
console.log('DONE');
