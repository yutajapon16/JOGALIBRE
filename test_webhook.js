const payload = {
  "id": "evt_d26e303b238e509335ac9ba210e51b0f&1437499855",
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_mybt295vzvbri4pf",
    "value": 2040,
    "status": "RECEIVED_IN_CASH",
    "billingType": "PIX",
    "customer": "cus_000189991705",
    "externalReference": "17851982815198240"
  }
};

fetch('http://localhost:3000/api/asaas-webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN
  },
  body: JSON.stringify(payload)
}).then(r => r.json()).then(console.log);
