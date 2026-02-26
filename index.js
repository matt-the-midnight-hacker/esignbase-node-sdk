import { Readable } from 'node:stream';

/* ============================================================
 * Enums
 * ============================================================ */

export const GrantType = Object.freeze({
  CLIENT_CREDENTIALS: 'client_credentials',
  AUTHORIZATION_CODE: 'authorization_code',
});

export const Scope = Object.freeze({
  ALL: 'all',
  READ: 'read',
  CREATE_DOCUMENT: 'create_document',
  DELETE: 'delete',
  SANDBOX: 'sandbox',
});

/* ============================================================
 * Error
 * ============================================================ */

export class ESignBaseSDKError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'ESignBaseSDKError';
    this.statusCode = statusCode;
  }
}

/* ============================================================
 * Client
 * ============================================================ */

export default class ESignBaseClient {
  #baseURL;
  #clientId;
  #clientSecret;
  #grantType;
  #username;
  #password;
  #scope;
  #accessToken = null;

  /**
   * @typedef {'all' | 'read' | 'create_document' | 'delete' | 'sandbox'} ScopeValue
   */

  /**
   * @param {Object} options
   * @param {string} options.clientId
   * @param {string} options.clientSecret
   * @param {string} options.grantType
   * @param {ScopeValue[]} options.scope
   * @param {string} [options.username]
   * @param {string} [options.password]
   * @param {string} [options.baseURL]
   */
  constructor({
    clientId,
    clientSecret,
    grantType,
    scope,
    username,
    password,
    baseURL = 'https://app.esignbase.com/',
  }) {
    if (!clientId) throw new ESignBaseSDKError('Client ID is required');
    if (!clientSecret) throw new ESignBaseSDKError('Client secret is required');
    if (!grantType) throw new ESignBaseSDKError('Grant type is required');
    if (!scope || scope.length === 0) {
      throw new ESignBaseSDKError('At least one scope must be provided');
    }

    // Validate grant type
    if (!Object.values(GrantType).includes(grantType)) {
      throw new ESignBaseSDKError('Invalid grant type');
    }

    // Validate scopes
    const validScopes = Object.values(Scope);
    if (!scope.every(s => validScopes.includes(s))) {
      throw new ESignBaseSDKError('Invalid scope value provided');
    }

    if (
      grantType === GrantType.AUTHORIZATION_CODE &&
      (!username || !password)
    ) {
      throw new ESignBaseSDKError(
        'Username and password are required for authorization_code grant type'
      );
    }

    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#grantType = grantType;
    this.#scope = scope;
    this.#username = username;
    this.#password = password;
    this.#baseURL = baseURL.endsWith('/')
      ? baseURL
      : baseURL + '/';
  }

  get isConnected() {
    return !!this.#accessToken;
  }

  /* ============================================================
   * Private Helpers
   * ============================================================ */

  async #handleResponse(response) {
    if (!response.ok) {
      let message;
      try {
        message = await response.text();
      } catch {
        message = 'Unknown error';
      }
      throw new ESignBaseSDKError(message, response.status);
    }

    return response;
  }

  async #request(method, path, options = {}, retry = true) {
    if (!this.isConnected) {
      throw new ESignBaseSDKError('Client is not connected. Call connect() first.');
    }

    const url = `${this.#baseURL}${path.replace(/^\//, '')}`;

    const executeFetch = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        options.timeout || 15000
      );

      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.#accessToken}`,
            ...(options.headers),
          },
          body: options.body,
          signal: controller.signal,
        });

        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let response = await executeFetch();

    // Retry once on 401
    if (response.status === 401 && retry) {
      await this.connect();
      response = await executeFetch();
    }

    return this.#handleResponse(response);
  }

  /* ============================================================
   * Public API
   * ============================================================ */

  async connect() {
    const authString = Buffer
      .from(`${this.#clientId}:${this.#clientSecret}`)
      .toString('base64');

    const body = new URLSearchParams({
      grant_type: this.#grantType,
      scope: this.#scope.join(' '),
    });

    if (this.#grantType === GrantType.AUTHORIZATION_CODE) {
      body.append('username', this.#username);
      body.append('password', this.#password);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(
        `${this.#baseURL}oauth2/token`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
          signal: controller.signal,
        }
      );

      await this.#handleResponse(response);

      const data = await response.json();
      this.#accessToken = data.access_token;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getTemplates() {
    const response = await this.#request('GET', 'api/templates');
    return response.json();
  }

  async getTemplate(templateId) {
    const response = await this.#request(
      'GET',
      `api/template/${encodeURIComponent(templateId)}`
    );
    return response.json();
  }

  async getDocuments(limit = 20, offset = 0) {
    const response = await this.#request(
      'GET',
      `api/documents?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
    );
    return response.json();
  }

  async getDocument(documentId) {
    const response = await this.#request(
      'GET',
      `api/document/${encodeURIComponent(documentId)}`
    );
    return response.json();
  }

  async createDocument({
    templateId,
    documentName,
    recipients,
    userDefinedMetadata,
    expirationDate,
  }) {
    const requestData = {
      name: documentName,
      template_id: templateId,
      recipients: recipients.map(r => ({
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        role_name: r.role_name,
        locale: r.locale,
      })),
    };

    if (userDefinedMetadata) {
      requestData.user_defined_metadata = userDefinedMetadata;
    }

    if (expirationDate instanceof Date) {
      requestData.expiration_date = expirationDate.toISOString();
    }

    const response = await this.#request('POST', 'api/document', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    return response.json();
  }

  async downloadDocument(documentId) {
    const response = await this.#request(
      'GET',
      `api/document/${encodeURIComponent(documentId)}/download`,
      {},
      false
    );

    return Readable.fromWeb(response.body);
  }

  async deleteDocument(documentId) {
    await this.#request(
      'DELETE',
      `api/document/${encodeURIComponent(documentId)}`
    );
    return true;
  }

  async getCredits() {
    const response = await this.#request('GET', 'api/credits');
    return response.json();
  }
}
