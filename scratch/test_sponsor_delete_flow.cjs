async function testDeleteFlow() {
  console.log('Testing Sponsor Advertisement Delete Flow...');
  try {
    // 1. Create a test ad first with superadmin x-user-id
    const createRes = await fetch('http://localhost:3000/api/admin/advertisements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'x-user-id': 'user_superadmin_pawankhot',
      },
      body: JSON.stringify({
        sponsorName: 'Test Delete Sponsor',
        title: 'Test Delete Title',
        destinationUrl: 'https://example.com/delete-test',
        placement: 'DASHBOARD_SIDEBAR,LANDING_TOP',
        status: 'ACTIVE',
        is_test: 1,
      }),
    });

    const createData = await createRes.json();
    console.log('Create Ad Response:', createData);
    if (!createData.success || !createData.advertisement?.id) {
      throw new Error(`Failed to create test ad: ${JSON.stringify(createData)}`);
    }

    const adId = createData.advertisement.id;

    // 2. Delete the ad
    const deleteRes = await fetch(`http://localhost:3000/api/admin/advertisements/${adId}`, {
      method: 'DELETE',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'x-user-id': 'user_superadmin_pawankhot',
      },
    });

    const deleteData = await deleteRes.json();
    console.log('Delete Ad Response:', deleteData);

    if (!deleteData.success) {
      throw new Error('Delete API did not return success: true');
    }

    // 3. Verify ad is gone from active placements
    const activeRes = await fetch('http://localhost:3000/api/advertisements/active?placement=LANDING_TOP&includeTest=true');
    const activeData = await activeRes.json();
    const remaining = (activeData.advertisements || []).filter((a) => a.id === adId);
    console.log('Remaining active instances of deleted ad:', remaining.length);

    if (remaining.length !== 0) {
      throw new Error('Deleted ad still exists in active placements!');
    }

    console.log('SUCCESS! Sponsor ad delete flow verified server-side and client-side.');
  } catch (err) {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  }
}

testDeleteFlow();
