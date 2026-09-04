# Render app deployment

This is the hosted embedded Admin app.

Changed file:

- `app/routes/app._index.tsx`

Render build command:

```sh
npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
```

After Render deploys, open the app in Shopify Admin, select the eligible single bottles plus the Adult and Kids toothbrushes, then click **Save and activate**.
