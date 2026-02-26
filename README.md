# esignbase-node-sdk
SDK for eSignBase – eIDAS-compliant digital signatures and GDPR-ready electronic signing via REST API.

Example Usage:
```javascript
const { ESignBaseClient, GrantType, Scope } = require('./index');

const client = new ESignBaseClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  grantType: GrantType.CLIENT_CREDENTIALS,
  scope: [Scope.READ, Scope.CREATE_DOCUMENT],
});

async function example() {
  await client.connect();
  const templates = await client.getTemplates();
  console.log(templates);
}

example().catch(console.error);
```
