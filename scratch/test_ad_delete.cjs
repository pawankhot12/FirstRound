async function testAdDelete() {
  console.log('Testing Sponsor/Ad Delete flow...');
  
  const headers = {
    'Authorization': 'Bearer test_admin_token',
    'x-requested-with': 'XMLHttpRequest',
    'Content-Type': 'application/json'
  };

  // 1. Fetch active advertisements
  const getRes = await fetch('http://localhost:3000/api/admin/advertisements', { headers });
  const getData = await getRes.json();
  console.log('GET ads response:', getData.success, 'count:', getData.advertisements?.length);

  let targetAd;
  if (!getData.advertisements || getData.advertisements.length === 0) {
    console.log('Creating a test ad for deletion...');
    const createRes = await fetch('http://localhost:3000/api/admin/advertisements', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sponsorName: 'Test Sponsor Delete',
        title: 'Test Ad Delete Title',
        destinationUrl: 'https://example.com/delete-test',
        placement: 'DASHBOARD_SIDEBAR',
        status: 'ACTIVE'
      })
    });
    const createData = await createRes.json();
    console.log('Created ad:', createData);
    targetAd = createData.advertisement;
  } else {
    targetAd = getData.advertisements[0];
  }

  console.log('Target Ad to delete:', targetAd.id, targetAd.sponsorName);

  // 2. Delete the ad via API
  const delRes = await fetch(`http://localhost:3000/api/admin/advertisements/${targetAd.id}`, {
    method: 'DELETE',
    headers
  });
  const delData = await delRes.json();
  console.log('DELETE response status:', delRes.status, delData);

  // 3. Verify ad is gone
  const getRes2 = await fetch('http://localhost:3000/api/admin/advertisements', { headers });
  const getData2 = await getRes2.json();
  const exists = getData2.advertisements?.some(a => a.id === targetAd.id);
  console.log('Ad exists after deletion?', exists);
}

testAdDelete().catch(console.error);
