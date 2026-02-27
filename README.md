# eSignBase Node SDK

Official Node SDK for integrating **eIDAS-compliant digital signatures** into your application using the eSignBase REST API.

eSignBase provides GDPR-ready electronic signatures with EU-based infrastructure and flexible pay-as-you-go pricing  — no subscriptions, no per-seat licenses.

This SDK offers a simple, synchronous client for creating signing requests, managing templates, and retrieving       signed documents programmatically.

## Why eSignBase?

- ✅ eIDAS-compliant electronic signatures
- ✅ GDPR-aligned EU data hosting
- ✅ Simple REST API
- ✅ No subscriptions — pay-as-you-go credits
- ✅ Lightweight and easy to integrate

## Documentation

Full REST API documentation:
https://esignbase.com/api_documentation

A step-by-step integration guide:
https://esignbase.com/blog/rest-api-guide


# Classes

## GrantType

Defines the available OAuth2 grant types:

-   CLIENT_CREDENTIALS -- For server-to-server authentication
-   AUTHORIZATION_CODE -- For user-specific authentication

------------------------------------------------------------------------

## Scope

Defines the available API permission scopes:

-   ALL -- Full access to all API endpoints
-   READ -- Read-only access
-   CREATE_DOCUMENT -- Permission to create documents
-   DELETE -- Permission to delete documents
-   SANDBOX -- Access to the sandbox environment (recommended for
    testing)

------------------------------------------------------------------------

## ESignBaseClient

Main client class that stores authentication credentials and state.

### Constructor

new ESignBaseClient({ clientId: string, clientSecret: string, grantType:
GrantType, scope: Scope\[\], username?: string, password?: string,
baseURL?: string })

### Options

-   clientId -- Client ID from ESignBase\
-   clientSecret -- Client secret from ESignBase\
-   grantType -- OAuth2 grant type to use\
-   scope -- Array of requested API scopes\
-   username -- Required when using AUTHORIZATION_CODE\
-   password -- Required when using AUTHORIZATION_CODE\
-   baseURL -- Optional override (e.g. sandbox or staging)

Retrieve your Client ID and Client Secret at:\
https://app.esignbase.com/oauth2/client

------------------------------------------------------------------------

## ESignBaseSDKError

Custom error class for API-related errors.

All API failures, validation errors, and network issues throw
ESignBaseSDKError.

------------------------------------------------------------------------

# Methods

All methods are asynchronous and return Promises.

------------------------------------------------------------------------

## connect()

Authenticates with the ESignBase API and stores the access token
internally.

Example:

``` js
import ESignBaseClient, { GrantType, Scope } from 'esignbase-sdk';

const client = new ESignBaseClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  grantType: GrantType.CLIENT_CREDENTIALS,
  scope: [Scope.ALL],
});

await client.connect();
```

------------------------------------------------------------------------

## getTemplates()

Retrieves available document templates.

Returns: Promise\<Array`<Object>`{=html}\>

------------------------------------------------------------------------

## getTemplate(templateId)

Retrieves details of a specific template.

Returns: Promise`<Object>`{=html}

------------------------------------------------------------------------

## getDocuments(limit, offset)

Retrieves a paginated list of documents.

Returns: Promise`<Object>`{=html}\
Example structure: { documents: \[...\] }

------------------------------------------------------------------------

## getDocument(documentId)

Retrieves details of a specific document.

Returns: Promise`<Object>`{=html}

------------------------------------------------------------------------

## createDocument(options)

Creates a new document from a template.

Example:

``` js
const document = await client.createDocument({
  templateId: 'template_123',
  documentName: 'Contract Agreement',
  recipients: [
    {
      email: 'signer@example.com',
      first_name: 'John',
      last_name: 'Doe',
      role_name: 'Signer',
      locale: 'de'
    }
  ],
  userDefinedMetadata: { contract_id: 'CTR-2024-001' },
  expirationDate: new Date('2024-12-31')
});
```

Returns: Promise`<Object>`{=html}

------------------------------------------------------------------------

## deleteDocument(documentId)

Deletes a specific document.

Returns: Promise`<boolean>`{=html}

------------------------------------------------------------------------

## downloadDocument(documentId)

Downloads a completed document.

Returns a Node.js Readable stream.

Example:

``` js
import { createWriteStream } from 'node:fs';

const stream = await client.downloadDocument('document_id');
const file = createWriteStream('document.pdf');
stream.pipe(file);
```

------------------------------------------------------------------------

## getCredits()

Retrieves credit balance information.

Returns: Promise`<Object>`{=html}

------------------------------------------------------------------------

# Error Handling

All methods throw ESignBaseSDKError on failure.

Example:

``` js
try {
  const templates = await client.getTemplates();
} catch (error) {
  console.error('API Error:', error.message);
}
```

------------------------------------------------------------------------

# Complete Example

``` js
import ESignBaseClient, { GrantType, Scope } from 'esignbase-sdk';

const client = new ESignBaseClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  grantType: GrantType.CLIENT_CREDENTIALS,
  scope: [Scope.CREATE_DOCUMENT, Scope.READ],
});

await client.connect();

const templates = await client.getTemplates();
const templateId = templates[0].id;

const document = await client.createDocument({
  templateId,
  documentName: 'NDA Agreement',
  recipients: [
    {
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      role_name: 'Signer',
      locale: 'en'
    }
  ]
});

const documentDetails = await client.getDocument(document.id);
await client.deleteDocument(document.id);
```

------------------------------------------------------------------------

# Installation

npm install esignbase-sdk

Requires Node.js \>= 18

------------------------------------------------------------------------

# Developer Notes

Install dependencies:

npm install

Run tests:

npm test
