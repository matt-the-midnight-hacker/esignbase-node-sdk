# eSignBase Node.js SDK

Official Node.js SDK for integrating **eIDAS-compliant electronic signatures** into your application using the [eSignBase](https://esignbase.com) REST API.

eSignBase provides GDPR-ready electronic signatures with EU-based infrastructure and flexible pay-as-you-go pricing — no subscriptions, no per-seat licenses.

## Why eSignBase?

- ✅ eIDAS-compliant electronic signatures
- ✅ GDPR-aligned EU data hosting
- ✅ No subscriptions — pay-as-you-go credits
- ✅ Automatic token refresh — no manual token management needed
- ✅ Lightweight, no heavy dependencies (uses native `fetch`)

## Installation

```bash
npm install esignbase-sdk
```

Requires Node.js 22 or higher.

## Quickstart

```js
import ESignBaseClient, { Scope } from 'esignbase-sdk';

// 1. Create and authenticate a client
const client = new ESignBaseClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  scope: [Scope.ALL],
});
await client.connect();

// 2. List available templates
const templates = await client.getTemplates();

// 3. Send a document for signature
const document = await client.createDocument({
  templateId: templates[0].id,
  documentName: 'NDA Agreement',
  recipients: [
    {
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      role_name: 'signee_1', // must match a role defined in the template
      locale: 'en',
    },
  ],
});

console.log(document); // { document_id: '...', status: 'DRAFT' }
```

Retrieve your Client ID and Client Secret at [app.esignbase.com/oauth2/client](https://app.esignbase.com/oauth2/client).

## Authentication

The SDK uses the OAuth2 **Client Credentials** grant. Call `connect()` once to authenticate — the SDK then manages token expiry and refresh automatically for all subsequent API calls.

```js
const client = new ESignBaseClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  scope: [Scope.ALL],
});
await client.connect();
```

### Sandbox Mode

Use the `SANDBOX` scope to test without consuming credits. Sandbox mode uses templates created in your sandbox environment.

```js
const client = new ESignBaseClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  scope: [Scope.ALL, Scope.SANDBOX],
});
await client.connect();
```

## API Reference

### Scopes

| Scope | Description |
|---|---|
| `Scope.ALL` | Full access (read, create, delete). Does not include sandbox. |
| `Scope.READ` | Read documents and templates. |
| `Scope.CREATE_DOCUMENT` | Create and send documents for signature. |
| `Scope.DELETE` | Delete documents. |
| `Scope.SANDBOX` | Sandbox mode — no credits consumed. |

### `connect()`

Authenticates with the eSignBase API and stores the access token internally. Throws `ESignBaseSDKError` if authentication fails.

### `getTemplates()`

Returns a list of all available templates.

```js
const templates = await client.getTemplates();
// [{ id: '...', filename: 'contract.pdf', form_role_names: ['signee_1'], ... }]
```

### `getTemplate(templateId)`

Returns details for a single template.

### `getDocuments(limit, offset)`

Returns a paginated list of documents.

```js
const result = await client.getDocuments(50, 0);
// { documents: [...], count: 120 }
```

### `getDocument(documentId)`

Returns details for a single document, including its current status.

### `createDocument(options)`

Creates a new document from a template and sends it to recipients.

`recipients` must include one entry per role defined in the template's `form_role_names`. `userDefinedMetadata` is an optional `Object` with string values for attaching your own data (e.g. internal IDs) to the document.

```js
const document = await client.createDocument({
  templateId: 'your_template_id',
  documentName: 'Employment Contract',
  recipients: [
    {
      email: 'bob@example.com',
      first_name: 'Bob',
      last_name: 'Jones',
      role_name: 'signee_1',
      locale: 'de',
    },
  ],
  userDefinedMetadata: { internal_id: 'EMP-2024-042' },
  expirationDate: new Date('2025-12-31'),
});
```

### `downloadDocument(documentId)`

Returns a Node.js `Readable` stream of the completed, signed PDF. Only available once the document status is `DIGITAL_SIGNATURE_CREATED` or `COMPLETED`.

```js
import { createWriteStream } from 'node:fs';

const stream = await client.downloadDocument(document.document_id);
stream.pipe(createWriteStream('signed_contract.pdf'));
```

### `deleteDocument(documentId)`

Deletes a document. Returns `true` on success.

### `getCredits()`

Returns the current credit balance.

```js
const balance = await client.getCredits();
// { credits: 42 }
```

## Error Handling

All methods throw `ESignBaseSDKError` on failure. The error includes a `statusCode` property with the HTTP status code where applicable.

```js
try {
  const document = await client.createDocument({ ... });
} catch (error) {
  console.error(`Error ${error.statusCode}: ${error.message}`);
}
```

## Document Statuses

| Status | Description |
|---|---|
| `DRAFT` | Created but not yet sent. |
| `SENT` | Sent to all recipients. |
| `PARTIALLY_SIGNED` | Signed by some recipients. |
| `COMPLETED` | Signing process complete. |
| `VOIDED` | Document expired or voided. |

Full status list available in the [API documentation](https://esignbase.com/en/api_documentation/).

## Further Reading

- [Full API Documentation](https://esignbase.com/en/api_documentation/)
- [Step-by-step REST API guide](https://esignbase.com/blog/rest-api-guide)
- [PyPI package (Python SDK)](https://pypi.org/project/esignbase-sdk/)