const payload = {
  "id": "evt_d26e303b238e509335ac9ba210e51b0f&1437461900",
  "event": "PAYMENT_RECEIVED",
  "account": {
    "id": "d5e2ca04-a187-4ed9-82e4-b81497af59b3",
    "ownerId": null
  },
  "payment": {
    "id": "pay_7kg6dkpl2lpsybr5",
    "value": 3310,
    "status": "RECEIVED_IN_CASH",
    "deleted": false,
    "dueDate": "2026-07-30",
    "customer": "cus_000189991705",
    "netValue": 3310,
    "billingType": "PIX",
    "dateCreated": "2026-07-27",
    "externalReference": "17851950334835599"
  }
};

fetch("https://jogalibre.vercel.app/api/asaas-webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "asaas-access-token": "29524743c47b397003a1e9d87306bf6170ea0a8f43e831d039a94eb7739a66a5"
  },
  body: JSON.stringify(payload)
}).then(res => res.text()).then(console.log).catch(console.error);
