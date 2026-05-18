import { Readable } from 'node:stream';

const TOKEN_EXPIRY_SECONDS = 300;
const TOKEN_EXPIRY_BUFFER_SECONDS = 30;

/* ============================================================
 * Enums
 * ============================================================ */

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
  #scope;
  #accessToken = null;
  #refreshToken = null;
  #tokenExpiresAt = null;

  /**
   * @typedef {'all' | 'read' | 'create_document' | 'delete' | 'sandbox'} ScopeValue
   */

  /**
   * @param {Object} options
   * @param {string} options.clientId
   * @param {string} options.clientSecret
   * @param {ScopeValue[]} options.scope
   * @param {string} [options.baseURL]
   */
  constructor({ clientId, clientSecret, scope, baseURL = 'https://app.esignbase.com/' }) {
    if (!clientId) throw new ESignBaseSDKError('Client ID is required');
    if (!clientSecret) throw new ESignBaseSDKError('Client secret is required');
    if (!scope || scope.length === 0) {
      throw new ESignBaseSDKError('At least one scope must be provided');
    }

    const validScopes = Object.values(Scope);
    if (!scope.every(s => validScopes.includes(s))) {
      throw new ESignBaseSDKError('Invalid scope value provided');
    }

    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#scope = scope;
    this.#baseURL = baseURL.endsWith('/') ? baseURL : baseURL + '/';
  }

  get isConnected() {
    return !!this.#accessToken;
  }

  get #isTokenExpired() {
    if (!this.#tokenExpiresAt) return true;
    return Date.now() >= this.#tokenExpiresAt - TOKEN_EXPIRY_BUFFER_SECONDS * 1000;
  }

  get #basicAuthHeader() {
    return 'Basic ' + Buffer.from(`${this.#clientId}:${this.#clientSecret}`).toString('base64');
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

  #applyTokenResponse(data) {
    this.#accessToken = data.access_token;
    this.#refreshToken = data.refresh_token ?? null;
    const expiresIn = data.expires_in ?? TOKEN_EXPIRY_SECONDS;
    this.#tokenExpiresAt = Date.now() + expiresIn * 1000;
  }

  async #fetchToken(body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${this.#baseURL}oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: this.#basicAuthHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });
      await this.#handleResponse(response);
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #refresh() {
    if (!this.#refreshToken) {
      await this.connect();
      return;
    }
    try {
      const data = await this.#fetchToken(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.#refreshToken,
      }));
      this.#applyTokenResponse(data);
    } catch {
      // Refresh token may have been revoked — fall back to full connect
      await this.connect();
    }
  }

  async #ensureFresh() {
    if (!this.isConnected || this.#isTokenExpired) {
      await this.#refresh();
    }
  }

  async #request(method, path, options = {}) {
    await this.#ensureFresh();

    const url = `${this.#baseURL}${path.replace(/^\//, '')}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.#accessToken}`,
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });
      return this.#handleResponse(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ============================================================
   * Public API
   * ============================================================ */

  async connect() {
    this.#accessToken = null;
    this.#refreshToken = null;
    this.#tokenExpiresAt = null;

    const data = await this.#fetchToken(new URLSearchParams({
      grant_type: 'client_credentials',
      scope: this.#scope.join(' '),
    }));
    this.#applyTokenResponse(data);
  }

  async getTemplates() {
    const response = await this.#request('GET', 'api/templates');
    return response.json();
  }

  async getTemplate(templateId) {
    const response = await this.#request('GET', `api/template/${encodeURIComponent(templateId)}`);
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
    const response = await this.#request('GET', `api/document/${encodeURIComponent(documentId)}`);
    return response.json();
  }

  async createDocument({ templateId, documentName, recipients, userDefinedMetadata, expirationDate }) {
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

    if (userDefinedMetadata) requestData.user_defined_metadata = userDefinedMetadata;
    if (expirationDate instanceof Date) requestData.expiration_date = expirationDate.toISOString();

    const response = await this.#request('POST', 'api/document', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });
    return response.json();
  }

  async downloadDocument(documentId) {
    const response = await this.#request(
      'GET',
      `api/document/${encodeURIComponent(documentId)}/download`
    );
    return Readable.fromWeb(response.body);
  }

  async deleteDocument(documentId) {
    await this.#request('DELETE', `api/document/${encodeURIComponent(documentId)}`);
    return true;
  }

  async getCredits() {
    const response = await this.#request('GET', 'api/credits');
    return response.json();
  }
}