# Raycrafting commerce setup

The project now includes a local Node server and SQLite database.

## Start it

```bash
cp .env.example .env
node server.js
```

Open `http://127.0.0.1:4173/index.html` for the shop and `admin.html` for Seller Studio.

The database is created automatically at `data/raycrafting.sqlite`. It stores customers, sessions, products, coupons, orders, order items, addresses, and payment records. Keep the `data` directory backed up.

## Razorpay test mode

Put the Razorpay Test Mode values from the Dashboard into `.env`:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Restart the server after changing `.env`. The secret must stay on the server and must never be placed in browser JavaScript.

## Development note

The local PIN is useful for development only. Before launch, replace it with real seller authentication, run the site over HTTPS, move the database to managed PostgreSQL, and add delivery-provider fields/webhooks to the order model.
