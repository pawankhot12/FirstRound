async function testIDOR() {
  const victimUserId = 'user_superadmin_pawankhot';
  const attackerUserId = 'user_student_12345';

  console.log('Testing IDOR attack (student trying to delete superadmin avatar)...');
  const delRes = await fetch(`http://localhost:3000/api/users/${victimUserId}/avatar`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${attackerUserId}`,
      'x-user-id': attackerUserId,
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  console.log('IDOR test status:', delRes.status);
  const data = await delRes.json();
  console.log('IDOR test response:', data);
}

testIDOR().catch(err => console.error(err));
