const fetch = require('node-fetch'); // If available, or use native fetch in newer node

async function test() {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      to: 'ExponentPushToken[dummy]',
      sound: 'notification.wav',
      priority: 'high',
      badge: 1,
      channelId: 'default',
      body: 'test'
    }])
  });
  console.log(await res.json());
}
test();
