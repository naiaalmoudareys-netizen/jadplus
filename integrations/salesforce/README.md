# Salesforce link for JAD+ owner sign-in

Owners sign in to JAD+ with the **email or mobile number on their Salesforce buyer record** (C-AUTH-3,
ADR 0005). JAD+ never holds Salesforce credentials. The path is:

```
JAD+ API ──(service binding FIN, header x-portal-key)──▶ finance worker ──(integration user)──▶ Apex JADPlusIdentity
```

**Nothing here is deployed.** Every step below needs Naya's go-ahead, and each one is reversible.

## What is in this folder

| File                                         | What                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `classes/JADPlusIdentity.cls`                | New read-only REST class `GET /services/apexrest/jadplus/identity?email=…` or `?phone=+971…`. No DML. |
| `classes/JADPlusIdentityTest.cls`            | Apex tests (fictional people). Not yet run against the org: run them in the sandbox first.            |
| `objects/Account/fields/Mobile_Match_Key__c` | Formula field: last 9 digits of the mobile (or phone), the same rule as `Lead.Phone_Match_Key__c`.    |

The existing `JADPortalApi` (owner portal) is **not changed**. The new class uses the same owner rule:
Sold or Booked deals where the person is the buyer or a contact role (joint buyer). An email or number
shared by two different people returns nobody.

## Answer (validated by JAD+ with `ownerLookupResponse` in `packages/shared/src/owners.ts`)

```json
{
  "found": true,
  "shared": false,
  "person": {
    "contactId": "003…",
    "name": "Layla Haddad",
    "email": "layla@example.com",
    "mobile": "+971 50 000 0000"
  },
  "units": [
    {
      "unitId": "a0X…",
      "dealId": "006…",
      "unitName": "JAD288-1102",
      "project": "JAD 288",
      "building": "Building B",
      "address": "Jumeirah Village Circle, Dubai",
      "role": "Buyer"
    }
  ]
}
```

JAD+ needs only these fields. Building and project address tell the technician where to go (ADR 0009). It does not receive prices, payments, documents or passport details.

## Steps to switch it on (in order)

1. **Salesforce sandbox.** Deploy this folder (`sf project deploy start -d force-app -o <sandbox>`) and run
   `JADPlusIdentityTest`. Fix any org-specific validation rule the test data trips. Then deploy to production
   with `--test-level RunSpecifiedTests --tests JADPlusIdentityTest`.
2. **Permission.** In Setup, open permission set **JAD Portal API** (assigned to the finance integration user)
   and add Apex Class Access for `JADPlusIdentity`. Field access to `Mobile_Match_Key__c` is not needed: the
   class reads in system mode.
3. **Finance worker** (`finance-dashboard-live/src/worker.js`, `portalProxy`). Add a JAD+ door with its own
   secret, so JAD+ and the owner portal can be revoked separately:

   ```js
   // JAD+ API (jadplus-api) owner identity. Own secret JADPLUS_KEY. One email or one +number per call.
   if (action === 'jadplus-identity' && request.method === 'GET') {
     const key = request.headers.get('x-portal-key') || '';
     if (!env.JADPLUS_KEY || key.length !== env.JADPLUS_KEY.length || key !== env.JADPLUS_KEY) {
       return new Response('forbidden', { status: 403 });
     }
     const email = (url.searchParams.get('email') || '').trim().toLowerCase();
     const phone = (url.searchParams.get('phone') || '').trim();
     const okEmail = /^[^@\s]{1,64}@[^@\s]{1,100}\.[^@\s]{2,20}$/.test(email);
     const okPhone = /^\+[1-9]\d{7,14}$/.test(phone);
     if (okEmail === okPhone) return new Response('bad request', { status: 400 });
     const params = new URLSearchParams(okEmail ? { email } : { phone });
     const target = `${env.SF_INSTANCE_URL}/services/apexrest/jadplus/identity?${params}`;
     let res = await fetch(target, { headers: { authorization: `Bearer ${await sfToken(env)}` } });
     if (res.status === 401) {
       await setMeta(env, { sf_token_at: new Date(0).toISOString() });
       res = await fetch(target, { headers: { authorization: `Bearer ${await sfToken(env)}` } });
     }
     return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
   }
   ```

   Place it before the existing `x-portal-key` check (that check compares against `PORTAL_KEY`). Then run
   `npx wrangler secret put JADPLUS_KEY` on the finance worker (generate it with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) and deploy it.

4. **JAD+ API (production only).** When the production environment is created, add to it:

   ```toml
   [[env.production.services]]
   binding = "FIN"
   service = "jad-finance-live"
   ```

   and `npx wrangler secret put PORTAL_KEY --env production` with the **same value as `JADPLUS_KEY`**. The
   private preview never calls Salesforce (it refuses in code; demo data only).

5. **Check with a JAD test owner** before opening sign-in to everyone: sign in by email, then by mobile, and
   compare the units with Salesforce. Fix shared emails or numbers in Salesforce (they are refused by design;
   the prototype's report of shared emails is a starting list).

## Not covered yet

- **Sending the code.** Email codes need the Microsoft Graph sender and SMS codes need an SMS/WhatsApp
  provider. Until then, codes are delivered only on a developer machine (ADR 0005).
- Owners whose Salesforce email and mobile are both wrong cannot sign in. They use "Talk to a person" (U2).
