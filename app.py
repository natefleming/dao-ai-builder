"""
DAO AI Builder - Databricks App Entry Point

This is the main entry point for deploying as a Databricks App.
It serves the React frontend and provides API endpoints for Databricks integration.

Authentication:
- Primary: OAuth2 Authorization Code flow with Databricks
- Fallback 1: X-Forwarded-Access-Token header (Databricks App OBO auth)
- Fallback 2: Databricks SDK Config for local development
- Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_obo

Deployment:
- Run: databricks apps deploy dao-ai-builder --source-code-path .
"""
import os
import sys
import secrets
import logging
import urllib.parse
from pathlib import Path
from functools import lru_cache

import requests as http_requests
from flask import Flask, send_from_directory, jsonify, request, Response, redirect, session, url_for

# Configure logging to write to stderr (captured by Databricks Apps)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr)
    ]
)
logger = logging.getLogger('dao-ai-builder')
logger.setLevel(logging.DEBUG)  # More verbose for debugging

app = Flask(__name__, static_folder='static')

# Also configure Flask's logger to use our handler
app.logger.handlers = []
app.logger.addHandler(logging.StreamHandler(sys.stderr))
app.logger.setLevel(logging.DEBUG)

def log(level: str, msg: str):
    """Write log to stderr and flush immediately for Databricks logs"""
    print(f"[{level.upper()}] {msg}", file=sys.stderr, flush=True)
    if level == 'debug':
        logger.debug(msg)
    elif level == 'info':
        logger.info(msg)
    elif level == 'warning':
        logger.warning(msg)
    elif level == 'error':
        logger.error(msg)

# Log startup
log('info', "DAO AI Builder starting up...")
log('info', f"Python version: {sys.version}")
log('info', f"Working directory: {os.getcwd()}")

# Secret key for session management
# Use a stable key from environment or generate a stable one based on hostname
# This ensures sessions persist across app restarts
default_secret = os.environ.get('DATABRICKS_HOST', 'dao-ai-builder') + '-session-key'
app.secret_key = os.environ.get('FLASK_SECRET_KEY', default_secret)

# Configure session cookies for proper handling in incognito mode and HTTPS
# SameSite=Lax allows cookies to be sent on top-level navigations (OAuth redirects)
# Secure=True when running over HTTPS (detected from environment)
is_https = os.environ.get('HTTPS', 'false').lower() == 'true' or \
           os.environ.get('DATABRICKS_HOST', '').startswith('https')
app.config.update(
    SESSION_COOKIE_SAMESITE='Lax',  # Allow cookies on OAuth redirects
    SESSION_COOKIE_SECURE=is_https,  # Secure in HTTPS environments
    SESSION_COOKIE_HTTPONLY=True,    # Prevent XSS access to session cookie
    SESSION_COOKIE_NAME='dao_session',  # Custom name to avoid conflicts
    PERMANENT_SESSION_LIFETIME=3600,  # 1 hour session lifetime
)
log('info', f"Session configured: SameSite=Lax, Secure={is_https}")

# Static folder path - defaults to 'static' in the same directory as this file
STATIC_FOLDER = os.environ.get('STATIC_FOLDER', 'static')
if not os.path.isabs(STATIC_FOLDER):
    STATIC_FOLDER = os.path.join(os.path.dirname(__file__), STATIC_FOLDER)

# OAuth2 configuration
# These are populated from environment or app configuration
OAUTH_CLIENT_ID = os.environ.get('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = os.environ.get('OAUTH_CLIENT_SECRET')

# API Scopes to request during OAuth
OAUTH_SCOPES = [
    'sql',
    'dashboards.genie',
    'files.files',
    'serving.serving-endpoints',
    'vectorsearch.vector-search-indexes',
    'vectorsearch.vector-search-endpoints',
    'offline_access',  # For refresh tokens
]


# Cache the SDK config to avoid repeated lookups
@lru_cache(maxsize=1)
def get_sdk_config():
    """
    Get Databricks SDK Config object.
    This handles authentication from various sources:
    - Environment variables (DATABRICKS_HOST, DATABRICKS_TOKEN)
    - ~/.databrickscfg profile
    - Azure CLI / Service Principal
    - etc.
    """
    try:
        from databricks.sdk.config import Config
        return Config()
    except Exception as e:
        log('warning', f"Could not initialize Databricks SDK Config: {e}")
        return None


def normalize_host(host: str) -> str:
    """Ensure host has https:// scheme."""
    if not host:
        return host
    host = host.strip().rstrip('/')
    if not host.startswith('http://') and not host.startswith('https://'):
        host = f'https://{host}'
    return host


def get_databricks_host_from_sdk() -> str | None:
    """Get host from Databricks SDK Config."""
    sdk_config = get_sdk_config()
    if sdk_config and sdk_config.host:
        return normalize_host(sdk_config.host)
    return None


def get_databricks_host() -> str | None:
    """Get the Databricks workspace host URL."""
    host, _ = get_databricks_host_with_source()
    return host


def get_databricks_token_from_sdk() -> str | None:
    """Get token from Databricks SDK Config."""
    sdk_config = get_sdk_config()
    if sdk_config:
        try:
            # The SDK Config can provide tokens from various auth methods
            # This will return None if no auth is configured
            if sdk_config.token:
                return sdk_config.token
        except Exception:
            pass
    return None


def get_databricks_token_with_source() -> tuple[str | None, str | None]:
    """
    Get the Databricks authentication token and its source.
    
    For Databricks Apps with User Authorization:
    - Use X-Forwarded-Access-Token header to access APIs on behalf of the user
    - Reference: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/auth#user-authorization
    
    Resolution order:
    1. Session token (from OAuth flow)
    2. Authorization header Bearer token (explicit from frontend - user's PAT)
    3. X-Forwarded-Access-Token header (Databricks App on-behalf-of-user auth)
    4. Databricks SDK Config (handles env vars, profiles, etc.)
    5. DATABRICKS_TOKEN environment variable (explicit fallback)
    
    Returns:
        tuple: (token, source) where source is one of:
            - 'oauth': OAuth access token from session
            - 'manual': Authorization header from frontend
            - 'obo': X-Forwarded-Access-Token header (Databricks App)
            - 'sdk': Databricks SDK Config
            - 'env': DATABRICKS_TOKEN environment variable
            - None: No token found
    """
    # Try session token first (OAuth flow)
    if 'access_token' in session:
        return session['access_token'], 'oauth'
    
    # Try Authorization header (user's explicit token)
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:], 'manual'
    
    # Try forwarded header (Databricks App on-behalf-of-user)
    # Per Microsoft docs: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/auth#user-authorization
    # The x-forwarded-access-token header contains the user's OAuth token
    token = request.headers.get('X-Forwarded-Access-Token')
    if not token:
        # Try lowercase version as some proxies normalize headers
        token = request.headers.get('x-forwarded-access-token')
    if token:
        return token, 'obo'
    
    # Try Databricks SDK Config
    token = get_databricks_token_from_sdk()
    if token:
        return token, 'sdk'
    
    # Explicit fallback to environment variable
    token = os.environ.get('DATABRICKS_TOKEN')
    if token:
        return token, 'env'
    
    return None, None


def get_databricks_token() -> str | None:
    """Get the Databricks authentication token."""
    token, _ = get_databricks_token_with_source()
    return token


def get_databricks_host_with_source() -> tuple[str | None, str | None]:
    """
    Get the Databricks workspace host URL and its source.
    
    Resolution order:
    1. Session host (from OAuth flow)
    2. X-Databricks-Host header (sent by frontend for manual config)
    3. Databricks SDK Config (handles env vars, profiles, etc.)
    4. DATABRICKS_HOST environment variable (explicit fallback)
    
    Returns:
        tuple: (host, source) where source is one of:
            - 'oauth': From OAuth session
            - 'header': X-Databricks-Host header from frontend
            - 'sdk': Databricks SDK Config
            - 'env': DATABRICKS_HOST environment variable
            - None: No host found
    """
    # Check session first (OAuth flow)
    if 'databricks_host' in session:
        return session['databricks_host'], 'oauth'
    
    # Check header (for manual configuration from frontend)
    host = request.headers.get('X-Databricks-Host')
    if host:
        return normalize_host(host), 'header'
    
    # Try Databricks SDK Config
    host = get_databricks_host_from_sdk()
    if host:
        return host, 'sdk'
    
    # Explicit fallback to environment variable
    host = os.environ.get('DATABRICKS_HOST')
    if host:
        return normalize_host(host), 'env'
    
    return None, None


# =============================================================================
# OAuth2 Endpoints
# =============================================================================

@app.route('/api/auth/login')
def oauth_login():
    """
    Initiate OAuth2 Authorization Code flow.
    Redirects user to Databricks to approve scopes.
    """
    # Get the host for OAuth
    host = request.args.get('host')
    if not host:
        host, _ = get_databricks_host_with_source()
    
    if not host:
        return jsonify({
            'error': 'No Databricks host configured',
            'message': 'Please provide a host parameter or configure DATABRICKS_HOST'
        }), 400
    
    host = normalize_host(host)
    
    # Get OAuth client credentials
    # In Databricks Apps, these are available from the app configuration
    client_id = OAUTH_CLIENT_ID or os.environ.get('DATABRICKS_OAUTH_CLIENT_ID')
    
    # For Databricks Apps, we can use the app's service principal
    # The client_id is available in the app environment
    if not client_id:
        # Try to get from Databricks App context
        # When running as a Databricks App, the app's OAuth client ID is available
        app_client_id = os.environ.get('DATABRICKS_APP_CLIENT_ID')
        if app_client_id:
            client_id = app_client_id
    
    if not client_id:
        return jsonify({
            'error': 'OAuth not configured',
            'message': 'No OAuth client ID available. Configure OAUTH_CLIENT_ID or use Databricks App deployment.',
            'oauth_required': True,
            'host': host,
        }), 400
    
    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)
    
    # Make session permanent for better cookie persistence
    session.permanent = True
    session['oauth_state'] = state
    session['oauth_host'] = host
    
    log('info', f"OAuth login initiated. State stored in session. Host: {host}")
    
    # Build authorization URL
    # Databricks uses standard OIDC endpoints
    auth_endpoint = f"{host}/oidc/v1/authorize"
    
    # Get the callback URL
    callback_url = url_for('oauth_callback', _external=True)
    
    # Build the authorization URL
    params = {
        'client_id': client_id,
        'response_type': 'code',
        'redirect_uri': callback_url,
        'scope': ' '.join(OAUTH_SCOPES),
        'state': state,
    }
    
    auth_url = f"{auth_endpoint}?{urllib.parse.urlencode(params)}"
    
    log('info', f"Redirecting to OAuth: {auth_endpoint}")
    
    return jsonify({
        'auth_url': auth_url,
        'redirect': True,
    })


@app.route('/api/auth/callback')
def oauth_callback():
    """
    Handle OAuth2 callback with authorization code.
    Exchange code for access token.
    """
    log('info', f"OAuth callback received. Session keys: {list(session.keys())}")
    
    # Verify state
    state = request.args.get('state')
    stored_state = session.get('oauth_state')
    
    if not stored_state:
        log('error', "OAuth state not found in session - session may have expired or cookies not set")
        # Return a user-friendly HTML page instead of JSON for better UX
        return '''
        <!DOCTYPE html>
        <html>
        <head><title>Session Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Session Expired</h1>
            <p>Your session has expired or cookies are not enabled.</p>
            <p>Please ensure cookies are enabled in your browser and try again.</p>
            <p><a href="/" style="color: #0066cc;">Return to Application</a></p>
            <p style="color: #666; font-size: 12px; margin-top: 40px;">
                If you're using incognito mode, make sure third-party cookies are allowed.
            </p>
        </body>
        </html>
        ''', 400
    
    if state != stored_state:
        log('error', f"OAuth state mismatch. Expected: {stored_state[:10]}..., Got: {state[:10] if state else 'None'}...")
        return '''
        <!DOCTYPE html>
        <html>
        <head><title>Security Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Security Verification Failed</h1>
            <p>The OAuth state parameter does not match. This could be a security issue.</p>
            <p><a href="/" style="color: #0066cc;">Please try logging in again</a></p>
        </body>
        </html>
        ''', 400
    
    # Check for errors from OAuth provider
    error = request.args.get('error')
    if error:
        error_description = request.args.get('error_description', 'Unknown error')
        log('error', f"OAuth error from provider: {error} - {error_description}")
        return f'''
        <!DOCTYPE html>
        <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Authentication Error</h1>
            <p><strong>{error}</strong></p>
            <p>{error_description}</p>
            <p><a href="/" style="color: #0066cc;">Return to Application</a></p>
        </body>
        </html>
        ''', 400
    
    # Get authorization code
    code = request.args.get('code')
    if not code:
        log('error', "No authorization code in callback")
        return jsonify({'error': 'No authorization code received'}), 400
    
    # Get host from session
    host = session.get('oauth_host')
    if not host:
        log('error', "OAuth host not found in session")
        return '''
        <!DOCTYPE html>
        <html>
        <head><title>Session Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Session Expired</h1>
            <p>The OAuth session has expired. Please try logging in again.</p>
            <p><a href="/" style="color: #0066cc;">Return to Application</a></p>
        </body>
        </html>
        ''', 400
    
    # Get OAuth credentials
    client_id = OAUTH_CLIENT_ID or os.environ.get('DATABRICKS_OAUTH_CLIENT_ID') or os.environ.get('DATABRICKS_APP_CLIENT_ID')
    client_secret = OAUTH_CLIENT_SECRET or os.environ.get('DATABRICKS_OAUTH_CLIENT_SECRET')
    
    # Exchange code for token
    token_endpoint = f"{host}/oidc/v1/token"
    callback_url = url_for('oauth_callback', _external=True)
    
    token_data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': callback_url,
        'client_id': client_id,
    }
    
    if client_secret:
        token_data['client_secret'] = client_secret
    
    try:
        response = http_requests.post(
            token_endpoint,
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=30,
        )
        
        if response.ok:
            token_response = response.json()
            
            # Store tokens in session
            session['access_token'] = token_response.get('access_token')
            session['refresh_token'] = token_response.get('refresh_token')
            session['token_expires_in'] = token_response.get('expires_in')
            session['databricks_host'] = host
            
            # Clear OAuth state
            session.pop('oauth_state', None)
            session.pop('oauth_host', None)
            
            log('info', "OAuth token exchange successful")
            
            # Redirect back to the app
            return redirect('/')
        else:
            error_data = response.json() if response.headers.get('Content-Type', '').startswith('application/json') else {}
            return jsonify({
                'error': 'Token exchange failed',
                'message': error_data.get('error_description', response.text),
            }), 400
            
    except Exception as e:
        log('error', f"OAuth token exchange error: {e}")
        return jsonify({
            'error': 'Token exchange failed',
            'message': str(e)
        }), 500


@app.route('/api/auth/logout')
def oauth_logout():
    """Clear OAuth session and log out."""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out'})


@app.route('/api/auth/status')
def oauth_status():
    """Get current OAuth authentication status."""
    has_oauth = 'access_token' in session
    
    return jsonify({
        'authenticated': has_oauth,
        'method': 'oauth' if has_oauth else None,
        'host': session.get('databricks_host'),
        'scopes': OAUTH_SCOPES if has_oauth else None,
    })


# =============================================================================
# Auth Context Endpoint
# =============================================================================

@app.route('/api/auth/context')
def get_auth_context():
    """
    Get authentication context for Databricks API calls.
    
    This endpoint detects the authentication method and returns workspace info,
    including the source of both the host and token.
    """
    # Check for Databricks App headers
    email = request.headers.get('X-Forwarded-Email')
    username = request.headers.get('X-Forwarded-Preferred-Username')
    user_id = request.headers.get('X-Forwarded-User')
    real_ip = request.headers.get('X-Real-Ip')
    
    # Determine if we're in a Databricks App context
    has_obo_token = bool(request.headers.get('X-Forwarded-Access-Token'))
    is_databricks_app = bool(email or username or user_id or has_obo_token)
    
    # Check OAuth status
    has_oauth = 'access_token' in session
    
    # Get host and token with their sources
    host, host_source = get_databricks_host_with_source()
    token, token_source = get_databricks_token_with_source()
    
    has_token = token is not None
    auth_method = token_source or 'manual'
    
    # OAuth configuration info
    oauth_configured = bool(OAUTH_CLIENT_ID or os.environ.get('DATABRICKS_OAUTH_CLIENT_ID') or os.environ.get('DATABRICKS_APP_CLIENT_ID'))
    
    log('info', f"Auth context: host={host} (from {host_source}), token_source={token_source}, has_token={has_token}, is_app={is_databricks_app}")
    
    return jsonify({
        'is_databricks_app': is_databricks_app,
        'has_token': has_token,
        'user': {
            'email': email,
            'username': username,
            'user_id': user_id,
            'ip': real_ip,
        } if is_databricks_app else None,
        'host': host,
        'host_source': host_source,
        'auth_method': auth_method,
        'token_source': token_source,
        'oauth': {
            'configured': oauth_configured,
            'authenticated': has_oauth,
            'scopes': OAUTH_SCOPES,
        },
    })


@app.route('/api/auth/token')
def get_auth_token():
    """
    Legacy endpoint - returns token info.
    Prefer using /api/auth/context for new code.
    """
    token = request.headers.get('X-Forwarded-Access-Token')
    source = 'obo' if token else None
    
    if not token:
        token = os.environ.get('DATABRICKS_TOKEN')
        source = 'env' if token else None
    
    host = os.environ.get('DATABRICKS_HOST')
    email = request.headers.get('X-Forwarded-Email')
    user = request.headers.get('X-Forwarded-User')
    
    return jsonify({
        'token': token,
        'host': host,
        'email': email,
        'user': user,
        'source': source,
    })


# =============================================================================
# Databricks API Proxy
# =============================================================================

@app.route('/api/databricks/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def proxy_databricks(path: str):
    """
    Proxy requests to Databricks API.
    
    This allows the frontend to make API calls without CORS issues.
    All requests are authenticated using the user's token.
    
    Token priority:
    1. Authorization header from frontend (manual PAT) - ALWAYS used if present
    2. X-Forwarded-Access-Token (OBO) - only if no Authorization header
    """
    # Log all relevant headers for debugging
    log('debug', f"=== PROXY REQUEST: {request.method} {path} ===")
    log('debug', f"Headers: Authorization={request.headers.get('Authorization', 'NONE')[:30] if request.headers.get('Authorization') else 'NONE'}..., X-Databricks-Host={request.headers.get('X-Databricks-Host', 'NONE')}, X-Forwarded-Access-Token={request.headers.get('X-Forwarded-Access-Token', 'NONE')[:20] if request.headers.get('X-Forwarded-Access-Token') else 'NONE'}...")
    
    # Check for explicit Authorization header FIRST (user's manual PAT)
    # This takes absolute priority over OBO token
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        token_source = 'manual'
        # Show first few chars to verify it's the user's token, not OBO
        token_preview = token[:10] if len(token) > 10 else token
        log('info', f"Using MANUAL token from Authorization header (starts with: {token_preview}..., length: {len(token)})")
    else:
        # Fall back to other methods
        log('debug', "No Authorization header, falling back to other auth methods")
        token, token_source = get_databricks_token_with_source()
        if token:
            token_preview = token[:10] if len(token) > 10 else token
            log('info', f"Using {token_source.upper()} token (starts with: {token_preview}..., length: {len(token)})")
    
    if not token:
        log('error', f"No token available. Headers: {dict(request.headers)}")
        return jsonify({
            'error': 'No authentication token available',
            'message': 'Please authenticate first',
            'oauth_required': True,
        }), 401
    
    host, host_source = get_databricks_host_with_source()
    if not host:
        log('error', f"No host available. Headers: {dict(request.headers)}")
        return jsonify({'error': 'No Databricks host configured', 'debug': 'No host found in headers or env'}), 400
    
    # Build target URL
    target_url = f"{host}/{path}"
    
    # Forward query parameters
    if request.query_string:
        target_url += f"?{request.query_string.decode('utf-8')}"
    
    # Prepare headers
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    
    log('info', f"Proxying {request.method} to {target_url} (host from {host_source}, token from {token_source})")
    
    try:
        resp = http_requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            json=request.get_json(silent=True) if request.is_json else None,
            timeout=30,
        )
        
        # Log response details for debugging
        resp_preview = resp.text[:200] if len(resp.text) > 200 else resp.text
        log('info', f"Databricks response: {resp.status_code} - {resp_preview}")
        
        # Check for scope errors and enhance the message
        if resp.status_code in (401, 403):
            try:
                error_data = resp.json()
                error_message = error_data.get('message', '') or error_data.get('error', '')
                
                # If it's a scope error, add helpful information
                if 'scope' in error_message.lower():
                    # Determine which scopes might be needed based on the API path
                    required_scopes = _get_required_scopes_for_path(path)
                    enhanced_error = {
                        'error': error_message,
                        'error_code': error_data.get('error_code'),
                        'required_scopes': required_scopes,
                        'configured_scopes': OAUTH_SCOPES,
                        'help': 'The OAuth token does not have the required scopes. '
                               f'This API requires one of: {", ".join(required_scopes)}. '
                               'Please update the app\'s user_api_scopes in databricks.yml and redeploy.',
                    }
                    return jsonify(enhanced_error), resp.status_code
            except Exception:
                pass  # Fall through to return original response
        
        # For successful responses, add token source header for debugging
        response = Response(
            resp.content,
            status=resp.status_code,
            content_type=resp.headers.get('Content-Type', 'application/json'),
        )
        response.headers['X-Token-Source'] = token_source
        return response
    except http_requests.exceptions.RequestException as e:
        log('error', f"Proxy error: {e}")
        return jsonify({'error': f'Failed to connect to Databricks: {str(e)}'}), 502


def _get_required_scopes_for_path(path: str) -> list[str]:
    """
    Determine which OAuth scopes are likely required for a given API path.
    """
    path_lower = path.lower()
    
    # Map API paths to required scopes
    scope_mappings = [
        # SQL and warehouses
        (('/sql/', '/warehouses'), ['sql']),
        # Serving endpoints
        (('/serving-endpoints', '/endpoints'), ['serving.serving-endpoints']),
        # Vector search
        (('/vector-search', '/indexes'), ['vectorsearch.vector-search-indexes', 'vectorsearch.vector-search-endpoints']),
        # Genie
        (('/genie', '/dashboards'), ['dashboards.genie']),
        # Files and volumes
        (('/files', '/volumes', '/dbfs'), ['files.files']),
        # Unity Catalog
        (('/catalog', '/schemas', '/tables', '/functions'), ['sql']),
        # SCIM / Users
        (('/scim', '/users', '/me'), ['iam.current-user:read']),
        # Clusters
        (('/clusters',), ['clusters.clusters']),
        # Jobs
        (('/jobs',), ['jobs.jobs']),
        # MLflow
        (('/mlflow', '/experiments', '/models', '/registered-models'), ['mlflow.experiments', 'mlflow.registered-models']),
        # Workspace
        (('/workspace',), ['workspace.workspace']),
    ]
    
    for patterns, scopes in scope_mappings:
        if any(pattern in path_lower for pattern in patterns):
            return scopes
    
    # Default - return common scopes
    return ['sql', 'serving.serving-endpoints', 'files.files']


# =============================================================================
# Health & Debug
# =============================================================================

@app.route('/api/health')
def health_check():
    """Health check endpoint for Databricks Apps."""
    return jsonify({'status': 'healthy'})


# =============================================================================
# Unity Catalog APIs (using WorkspaceClient with default auth)
# These APIs use the SDK's default authentication which doesn't require
# specific user_api_scopes - the app's service principal has access.
# =============================================================================

def get_workspace_client():
    """
    Get a WorkspaceClient using the default constructor.
    This uses environment variables, SDK config, or service principal auth.
    """
    try:
        from databricks.sdk import WorkspaceClient
        return WorkspaceClient()
    except Exception as e:
        log('error', f"Failed to create WorkspaceClient: {e}")
        raise


def get_current_user_email() -> str | None:
    """
    Get the current user's email from OBO headers or by calling the API.
    """
    # First try OBO headers
    forwarded_email = request.headers.get('X-Forwarded-Email')
    if forwarded_email:
        return forwarded_email
    
    forwarded_username = request.headers.get('X-Forwarded-Preferred-Username')
    if forwarded_username:
        return forwarded_username
    
    # Try to get from WorkspaceClient
    try:
        w = get_workspace_client()
        me = w.current_user.me()
        return me.user_name
    except Exception as e:
        log('warning', f"Could not get current user: {e}")
        return None


def sort_by_owner(items: list, current_user: str | None) -> list:
    """
    Sort items so that ones owned by the current user appear first.
    Within each group, sort alphabetically by name.
    """
    if not current_user:
        # Just sort alphabetically if we don't know the user
        return sorted(items, key=lambda x: x.get('name', '').lower())
    
    current_user_lower = current_user.lower()
    
    def sort_key(item):
        owner = (item.get('owner') or '').lower()
        name = (item.get('name') or '').lower()
        # Items owned by current user get priority (0), others get (1)
        is_owned = 0 if owner == current_user_lower else 1
        return (is_owned, name)
    
    return sorted(items, key=sort_key)


@app.route('/api/uc/catalogs')
def list_catalogs():
    """List all catalogs using WorkspaceClient, sorted by ownership."""
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        log('debug', f"Listing catalogs for user: {current_user}")
        
        catalogs = list(w.catalogs.list())
        result = [
            {
                'name': c.name,
                'comment': c.comment,
                'owner': c.owner,
            }
            for c in catalogs
        ]
        
        # Sort by owner (current user's catalogs first)
        result = sort_by_owner(result, current_user)
        
        log('info', f"Listed {len(result)} catalogs (user: {current_user})")
        return jsonify({'catalogs': result, 'current_user': current_user})
    except Exception as e:
        log('error', f"Error listing catalogs: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/schemas')
def list_schemas():
    """List schemas in a catalog using WorkspaceClient, sorted by ownership."""
    catalog = request.args.get('catalog')
    if not catalog:
        return jsonify({'error': 'catalog parameter required'}), 400
    
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        log('debug', f"Listing schemas in {catalog} for user: {current_user}")
        
        schemas = list(w.schemas.list(catalog_name=catalog))
        result = [
            {
                'name': s.name,
                'full_name': s.full_name,
                'comment': s.comment,
                'owner': s.owner,
            }
            for s in schemas
        ]
        
        # Sort by owner (current user's schemas first)
        result = sort_by_owner(result, current_user)
        
        log('info', f"Listed {len(result)} schemas in catalog {catalog} (user: {current_user})")
        return jsonify({'schemas': result, 'current_user': current_user})
    except Exception as e:
        log('error', f"Error listing schemas in {catalog}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/tables')
def list_tables():
    """List tables in a schema using WorkspaceClient, sorted by ownership."""
    catalog = request.args.get('catalog')
    schema = request.args.get('schema')
    if not catalog or not schema:
        return jsonify({'error': 'catalog and schema parameters required'}), 400
    
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        
        tables = list(w.tables.list(catalog_name=catalog, schema_name=schema))
        result = [
            {
                'name': t.name,
                'full_name': t.full_name,
                'table_type': t.table_type.value if t.table_type else None,
                'comment': t.comment,
                'owner': t.owner,
            }
            for t in tables
        ]
        
        # Sort by owner (current user's tables first)
        result = sort_by_owner(result, current_user)
        
        log('info', f"Listed {len(result)} tables in {catalog}.{schema}")
        return jsonify({'tables': result})
    except Exception as e:
        log('error', f"Error listing tables in {catalog}.{schema}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/table-columns')
def get_table_columns():
    """Get columns for a specific table using WorkspaceClient."""
    catalog = request.args.get('catalog')
    schema = request.args.get('schema')
    table = request.args.get('table')
    
    if not catalog or not schema or not table:
        return jsonify({'error': 'catalog, schema, and table parameters required'}), 400
    
    try:
        w = get_workspace_client()
        full_name = f"{catalog}.{schema}.{table}"
        
        # Get table info with columns
        table_info = w.tables.get(full_name=full_name)
        
        columns = []
        if table_info.columns:
            for col in table_info.columns:
                columns.append({
                    'name': col.name,
                    'type_name': col.type_name.value if col.type_name else None,
                    'type_text': col.type_text,
                    'comment': col.comment,
                    'nullable': col.nullable if col.nullable is not None else True,
                })
        
        log('info', f"Retrieved {len(columns)} columns from {full_name}")
        return jsonify({'columns': columns})
    except Exception as e:
        log('error', f"Error getting columns for {catalog}.{schema}.{table}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/functions')
def list_functions():
    """List functions in a schema using WorkspaceClient, sorted by ownership."""
    catalog = request.args.get('catalog')
    schema = request.args.get('schema')
    if not catalog or not schema:
        return jsonify({'error': 'catalog and schema parameters required'}), 400
    
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        
        functions = list(w.functions.list(catalog_name=catalog, schema_name=schema))
        result = [
            {
                'name': f.name,
                'full_name': f.full_name,
                'comment': f.comment,
                'owner': f.owner,
                'input_params': [
                    {'name': p.name, 'type_text': p.type_text}
                    for p in (f.input_params.parameters if f.input_params else [])
                ] if f.input_params else [],
                'return_params': {
                    'type_text': f.return_params.parameters[0].type_text if f.return_params and f.return_params.parameters else None
                } if f.return_params else None,
            }
            for f in functions
        ]
        
        # Sort by owner (current user's functions first)
        result = sort_by_owner(result, current_user)
        
        log('info', f"Listed {len(result)} functions in {catalog}.{schema}")
        return jsonify({'functions': result})
    except Exception as e:
        log('error', f"Error listing functions in {catalog}.{schema}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/volumes')
def list_volumes():
    """List volumes in a schema using WorkspaceClient, sorted by ownership."""
    catalog = request.args.get('catalog')
    schema = request.args.get('schema')
    if not catalog or not schema:
        return jsonify({'error': 'catalog and schema parameters required'}), 400
    
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        
        volumes = list(w.volumes.list(catalog_name=catalog, schema_name=schema))
        result = [
            {
                'name': v.name,
                'full_name': v.full_name,
                'volume_type': v.volume_type.value if v.volume_type else None,
                'comment': v.comment,
                'owner': v.owner,
            }
            for v in volumes
        ]
        
        # Sort by owner (current user's volumes first)
        result = sort_by_owner(result, current_user)
        
        log('info', f"Listed {len(result)} volumes in {catalog}.{schema}")
        return jsonify({'volumes': result})
    except Exception as e:
        log('error', f"Error listing volumes in {catalog}.{schema}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/registered-models')
def list_registered_models():
    """List registered models using WorkspaceClient, sorted by ownership."""
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        
        # List all registered models (Unity Catalog models)
        models = list(w.registered_models.list())
        result = [
            {
                'name': m.name,
                'full_name': m.full_name,
                'comment': m.comment,
                'owner': m.owner,
            }
            for m in models
        ]
        
        # Sort by owner (current user's models first)
        result = sort_by_owner(result, current_user)
        
        log('info', f"Listed {len(result)} registered models")
        return jsonify({'models': result})
    except Exception as e:
        log('error', f"Error listing registered models: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/prompts')
def list_prompts():
    """List MLflow prompts in a catalog.schema using direct REST API.
    
    Query params:
    - catalog: The catalog name (required)
    - schema: The schema name (required)
    
    Returns prompts with their name, description, aliases, and latest version info.
    
    Uses the user's OBO token with direct REST API calls to bypass MLflow SDK scope issues.
    """
    catalog = request.args.get('catalog')
    schema = request.args.get('schema')
    
    if not catalog or not schema:
        return jsonify({'error': 'catalog and schema parameters required'}), 400
    
    try:
        current_user = get_current_user_email()
        log('info', f"Listing prompts in {catalog}.{schema} for user: {current_user}")
        
        result = []
        
        # Get user's token and host
        token, token_source = get_databricks_token_with_source()
        host, host_source = get_databricks_host_with_source()
        
        if not host:
            log('warning', "No Databricks host available")
            return jsonify({'error': 'No Databricks host configured'}), 401
        
        if not token:
            log('warning', "No authentication token available")
            return jsonify({'error': 'No authentication token available'}), 401
        
        log('info', f"Using token from {token_source}, host from {host_source}: {host}")
        
        import requests
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
        
        # Try direct REST API call to MLflow prompts endpoint
        # This uses the user's token which has catalog access permissions
        api_url = f"{host}/api/2.0/mlflow/unity-catalog/prompts/search"
        payload = {
            'filter': f"catalog = '{catalog}' AND schema = '{schema}'",
            'max_results': 100,
        }
        
        log('info', f"Calling REST API: POST {api_url} with user's token")
        
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        
        log('info', f"REST API response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            prompts_data = data.get('prompts', [])
            log('info', f"REST API returned {len(prompts_data)} prompts")
            
            for p in prompts_data:
                prompt_full_name = p.get('name', '')
                short_name = prompt_full_name.split('.')[-1] if '.' in prompt_full_name else prompt_full_name
                
                prompt_info = {
                    'name': short_name,
                    'full_name': prompt_full_name,
                    'description': p.get('description', ''),
                    'tags': p.get('tags', {}),
                    'aliases': [],
                    'latest_version': None,
                    'versions': [],
                }
                
                # Get versions for this prompt
                try:
                    versions_url = f"{host}/api/2.0/mlflow/unity-catalog/prompts/versions/search"
                    versions_payload = {'name': prompt_full_name}
                    versions_response = requests.post(versions_url, headers=headers, json=versions_payload, timeout=30)
                    
                    if versions_response.status_code == 200:
                        versions_data = versions_response.json()
                        versions_list = versions_data.get('prompt_versions', [])
                        
                        all_aliases = set()
                        version_infos = []
                        latest_version = 0
                        
                        for v in versions_list:
                            version_num = int(v.get('version', 0))
                            v_aliases = v.get('aliases', [])
                            all_aliases.update(v_aliases)
                            
                            version_infos.append({
                                'version': str(version_num),
                                'aliases': v_aliases,
                            })
                            
                            if version_num > latest_version:
                                latest_version = version_num
                        
                        prompt_info['aliases'] = sorted(list(all_aliases))
                        prompt_info['latest_version'] = str(latest_version) if latest_version > 0 else None
                        prompt_info['versions'] = sorted(version_infos, key=lambda x: int(x['version']), reverse=True)
                except Exception as ve:
                    log('debug', f"Could not get versions for {prompt_full_name}: {ve}")
                
                result.append(prompt_info)
            
            log('info', f"Found {len(result)} prompts via REST API")
            
        elif response.status_code == 403:
            # Permission denied - log the full error for debugging
            log('error', f"Permission denied (403): {response.text}")
            return jsonify({'error': f'Permission denied to access prompts. Response: {response.text}'}), 403
        else:
            log('error', f"REST API failed with status {response.status_code}: {response.text}")
            return jsonify({'error': f'Failed to search prompts: {response.status_code} - {response.text}'}), response.status_code
        
        # Sort by name alphabetically
        result = sorted(result, key=lambda x: x['name'].lower())
        
        log('info', f"Returning {len(result)} prompts in {catalog}.{schema}")
        return jsonify({'prompts': result})
        
    except Exception as e:
        import traceback
        log('error', f"Error listing prompts in {catalog}.{schema}: {e}")
        log('error', f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/prompt-details')
def get_prompt_details():
    """Get detailed information about a specific prompt including versions, aliases, and template.
    
    Query params:
    - name: The full prompt name (catalog.schema.name) (required)
    
    Returns prompt details including all versions, aliases, tags, and template content.
    
    Uses the user's OBO token with direct REST API calls.
    """
    full_name = request.args.get('name')
    
    if not full_name:
        return jsonify({'error': 'name parameter required'}), 400
    
    try:
        # Get user's token and host
        token, token_source = get_databricks_token_with_source()
        host, host_source = get_databricks_host_with_source()
        
        if not host:
            log('warning', "No Databricks host available")
            return jsonify({'error': 'No Databricks host configured'}), 401
        
        if not token:
            log('warning', "No authentication token available")
            return jsonify({'error': 'No authentication token available'}), 401
        
        log('info', f"Using token from {token_source}, host from {host_source}: {host}")
        log('info', f"Getting details for prompt: {full_name}")
        
        result = {
            'name': full_name.split('.')[-1] if '.' in full_name else full_name,
            'full_name': full_name,
            'versions': [],
            'aliases': [],
            'tags': {},
            'latest_version': None,
            'template': None,
            'description': '',
        }
        
        import requests
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
        
        # Get versions via REST API
        versions_url = f"{host}/api/2.0/mlflow/unity-catalog/prompts/versions/search"
        versions_payload = {'name': full_name}
        
        log('info', f"Calling REST API for versions: POST {versions_url}")
        versions_response = requests.post(versions_url, headers=headers, json=versions_payload, timeout=30)
        
        if versions_response.status_code == 200:
            versions_data = versions_response.json()
            versions_list = versions_data.get('prompt_versions', [])
            
            all_aliases = set()
            latest_version = 0
            latest_template = None
            
            for v in versions_list:
                version_num = int(v.get('version', 0))
                v_aliases = v.get('aliases', [])
                v_tags = v.get('tags', {})
                
                version_info = {
                    'version': str(version_num),
                    'aliases': v_aliases,
                    'tags': v_tags,
                    'description': v.get('description', ''),
                }
                result['versions'].append(version_info)
                
                all_aliases.update(v_aliases)
                
                if version_num > latest_version:
                    latest_version = version_num
                    if v.get('template'):
                        latest_template = v.get('template')
            
            result['versions'].sort(key=lambda x: int(x['version']), reverse=True)
            result['aliases'] = sorted(list(all_aliases))
            result['latest_version'] = str(latest_version) if latest_version > 0 else None
            
            if latest_template:
                result['template'] = latest_template
                
            log('info', f"REST API returned {len(versions_list)} versions")
        else:
            log('warning', f"Could not get versions for {full_name}: {versions_response.status_code} - {versions_response.text}")
        
        # If we don't have a template yet, try to get it
        if not result['template'] and result['latest_version']:
            try:
                prompt_url = f"{host}/api/2.0/mlflow/unity-catalog/prompts/get"
                prompt_payload = {'name': full_name, 'version': result['latest_version']}
                prompt_response = requests.post(prompt_url, headers=headers, json=prompt_payload, timeout=30)
                
                if prompt_response.status_code == 200:
                    prompt_data = prompt_response.json()
                    if prompt_data.get('prompt', {}).get('template'):
                        result['template'] = prompt_data['prompt']['template']
            except Exception as template_err:
                log('debug', f"Could not load template for {full_name}: {template_err}")
        
        log('info', f"Retrieved details for prompt {full_name}: {len(result['versions'])} versions, {len(result['aliases'])} aliases")
        return jsonify(result)
        
    except Exception as e:
        log('error', f"Error getting prompt details for {full_name}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/prompt-template')
def get_prompt_template():
    """Get the template content for a specific prompt version or alias.
    
    Query params:
    - name: The full prompt name (catalog.schema.name) (required)
    - version: The version number (optional, mutually exclusive with alias)
    - alias: The alias name (optional, mutually exclusive with version)
    
    Returns the prompt template content.
    
    Uses the user's OBO token with direct REST API calls.
    """
    full_name = request.args.get('name')
    version = request.args.get('version')
    alias = request.args.get('alias')
    
    if not full_name:
        return jsonify({'error': 'name parameter required'}), 400
    
    try:
        # Get user's token and host
        token, token_source = get_databricks_token_with_source()
        host, host_source = get_databricks_host_with_source()
        
        if not host:
            log('warning', "No Databricks host available")
            return jsonify({'error': 'No Databricks host configured'}), 401
        
        if not token:
            log('warning', "No authentication token available")
            return jsonify({'error': 'No authentication token available'}), 401
        
        log('info', f"Using token from {token_source}, host from {host_source}: {host}")
        
        import requests
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
        
        # Call REST API to get prompt
        prompt_url = f"{host}/api/2.0/mlflow/unity-catalog/prompts/get"
        
        # Construct payload based on version or alias
        if version:
            prompt_payload = {'name': full_name, 'version': version}
        elif alias:
            prompt_payload = {'name': full_name, 'alias': alias}
        else:
            prompt_payload = {'name': full_name}  # Get latest
        
        log('info', f"Calling REST API for template: POST {prompt_url}")
        prompt_response = requests.post(prompt_url, headers=headers, json=prompt_payload, timeout=30)
        
        if prompt_response.status_code == 200:
            prompt_data = prompt_response.json()
            prompt_info = prompt_data.get('prompt', {})
            
            result = {
                'template': prompt_info.get('template', ''),
                'version': prompt_info.get('version', ''),
                'name': full_name,
            }
            
            log('info', f"Retrieved template via REST API for {full_name}")
            return jsonify(result)
        else:
            log('error', f"REST API failed: {prompt_response.status_code} - {prompt_response.text}")
            return jsonify({'error': f'Failed to get prompt template: {prompt_response.text}'}), prompt_response.status_code
        
    except Exception as e:
        log('error', f"Error getting prompt template for {full_name}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/genie-spaces')
def list_genie_spaces():
    """List Genie spaces/rooms using WorkspaceClient or REST API.
    
    Returns all available Genie spaces (with pagination), sorted with:
    1. Spaces owned by the current user first
    2. Remaining spaces sorted alphabetically by title
    """
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        log('info', f"Listing Genie spaces for user: {current_user}")
        
        result = []
        
        # Try SDK method first with pagination
        try:
            if hasattr(w, 'genie') and hasattr(w.genie, 'list_spaces'):
                log('info', "Trying w.genie.list_spaces() with pagination...")
                
                page_token = None
                page_count = 0
                max_pages = 100  # Safety limit
                
                while page_count < max_pages:
                    page_count += 1
                    response = w.genie.list_spaces(page_size=100, page_token=page_token)
                    spaces = response.spaces or []
                    log('info', f"Page {page_count}: genie.list_spaces() returned {len(spaces)} spaces")
                    
                    for s in spaces:
                        # Note: The Genie spaces list API does not return owner information
                        result.append({
                            'space_id': s.space_id,
                            'title': s.title,
                            'description': getattr(s, 'description', None) or '',
                            'warehouse_id': getattr(s, 'warehouse_id', None),
                        })
                    
                    # Check for next page
                    page_token = getattr(response, 'next_page_token', None)
                    if not page_token:
                        break
                
                log('info', f"Total Genie spaces from SDK: {len(result)} (across {page_count} pages)")
            else:
                log('warning', "w.genie.list_spaces() not available, trying REST API...")
                raise AttributeError("SDK method not available")
        except Exception as e:
            log('info', f"SDK method failed ({e}), trying REST API fallback...")
            
            # Fallback: Use REST API directly with pagination
            try:
                import requests
                host = w.config.host
                # Get auth headers from SDK
                headers = w.config.authenticate()
                
                page_token = None
                page_count = 0
                max_pages = 100  # Safety limit
                
                while page_count < max_pages:
                    page_count += 1
                    api_url = f"{host}/api/2.0/genie/spaces?page_size=100"
                    if page_token:
                        api_url += f"&page_token={page_token}"
                    
                    log('info', f"Page {page_count}: Calling REST API: {api_url}")
                    
                    resp = requests.get(api_url, headers=headers, timeout=30)
                    log('info', f"REST API response status: {resp.status_code}")
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        spaces = data.get('spaces', [])
                        log('info', f"Page {page_count}: REST API returned {len(spaces)} spaces")
                        
                        for s in spaces:
                            # Note: The Genie spaces list API does not return owner information
                            result.append({
                                'space_id': s.get('space_id') or s.get('id'),
                                'title': s.get('title') or s.get('name'),
                                'description': s.get('description') or '',
                                'warehouse_id': s.get('warehouse_id'),
                            })
                        
                        # Check for next page
                        page_token = data.get('next_page_token')
                        if not page_token:
                            break
                    else:
                        log('error', f"REST API failed: {resp.status_code} - {resp.text}")
                        break
                
                log('info', f"Total Genie spaces from REST API: {len(result)} (across {page_count} pages)")
            except Exception as rest_err:
                log('error', f"REST API fallback failed: {rest_err}")
                import traceback
                log('error', traceback.format_exc())
        
        # Sort alphabetically by title
        # Note: The Genie spaces API does not return owner information in the list response
        result.sort(key=lambda space: (space.get('title') or '').lower())
        
        log('info', f"Returning {len(result)} Genie spaces (sorted alphabetically)")
        return jsonify({'spaces': result, 'current_user': current_user})
    except Exception as e:
        log('error', f"Error listing Genie spaces: {e}")
        import traceback
        log('error', traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/databases')
def list_databases():
    """List Lakebase/PostgreSQL databases using WorkspaceClient."""
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        log('debug', f"Listing databases for user: {current_user}")
        
        result = []
        
        try:
            # Try to list database instances (Lakebase)
            if hasattr(w, 'database') and hasattr(w.database, 'list_database_instances'):
                instances = list(w.database.list_database_instances())
                result = [
                    {
                        'name': db.name,
                        'state': db.state.value if hasattr(db, 'state') and db.state else None,
                        'creator': getattr(db, 'creator', None),
                        'owner': getattr(db, 'owner', None) or getattr(db, 'creator', None),
                        'read_write_dns': getattr(db, 'read_write_dns', None),
                    }
                    for db in instances
                ]
                log('info', f"Listed {len(result)} database instances via database.list_database_instances()")
        except Exception as e1:
            log('debug', f"database.list_database_instances() failed: {e1}")
            
            try:
                # Try alternative API - list_databases
                if hasattr(w, 'databases') and hasattr(w.databases, 'list'):
                    dbs = list(w.databases.list())
                    result = [
                        {
                            'name': db.name,
                            'state': getattr(db, 'state', None),
                            'creator': getattr(db, 'creator', None),
                            'owner': getattr(db, 'owner', None) or getattr(db, 'creator', None),
                        }
                        for db in dbs
                    ]
                    log('info', f"Listed {len(result)} databases via databases.list()")
            except Exception as e2:
                log('debug', f"databases.list() failed: {e2}")
        
        # Sort by owner (current user's databases first)
        result = sort_by_owner(result, current_user)
        
        return jsonify({'databases': result, 'current_user': current_user})
    except Exception as e:
        log('error', f"Error listing databases: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/connections')
def list_uc_connections():
    """List Unity Catalog connections using WorkspaceClient."""
    try:
        w = get_workspace_client()
        current_user = get_current_user_email()
        log('debug', f"Listing UC connections for user: {current_user}")
        
        result = []
        try:
            connections = list(w.connections.list())
            result = [
                {
                    'name': c.name,
                    'connection_type': c.connection_type.value if hasattr(c, 'connection_type') and c.connection_type else None,
                    'owner': getattr(c, 'owner', None),
                    'comment': getattr(c, 'comment', None),
                    'full_name': getattr(c, 'full_name', None),
                }
                for c in connections
            ]
            log('info', f"Listed {len(result)} UC connections")
        except Exception as e:
            log('debug', f"connections.list() failed: {e}")
        
        # Sort by owner (current user's connections first)
        result = sort_by_owner(result, current_user)
        
        return jsonify({'connections': result, 'current_user': current_user})
    except Exception as e:
        log('error', f"Error listing UC connections: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/serving-endpoints')
def list_serving_endpoints():
    """List serving endpoints using WorkspaceClient."""
    try:
        w = get_workspace_client()
        endpoints = list(w.serving_endpoints.list())
        result = [
            {
                'name': e.name,
                'state': {
                    'ready': e.state.ready.value if e.state and e.state.ready else None,
                    'config_update': e.state.config_update.value if e.state and e.state.config_update else None,
                } if e.state else None,
                'creator': e.creator,
            }
            for e in endpoints
        ]
        log('info', f"Listed {len(result)} serving endpoints")
        return jsonify({'endpoints': result})
    except Exception as e:
        log('error', f"Error listing serving endpoints: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/sql-warehouses')
def list_sql_warehouses():
    """List SQL warehouses using WorkspaceClient."""
    try:
        w = get_workspace_client()
        warehouses = list(w.warehouses.list())
        result = [
            {
                'id': wh.id,
                'name': wh.name,
                'state': wh.state.value if wh.state else None,
                'cluster_size': wh.cluster_size,
                'num_clusters': wh.num_clusters,
            }
            for wh in warehouses
        ]
        
        # Sort warehouses: RUNNING first, then STARTING/STOPPING, then STOPPED, then others
        state_priority = {
            'RUNNING': 0,
            'STARTING': 1,
            'STOPPING': 2,
            'STOPPED': 3,
            'DELETED': 4,
            'DELETING': 5,
        }
        result.sort(key=lambda x: (state_priority.get(x.get('state'), 99), x.get('name', '')))
        
        log('info', f"Listed {len(result)} SQL warehouses")
        return jsonify({'warehouses': result})
    except Exception as e:
        log('error', f"Error listing SQL warehouses: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/vector-search-endpoints')
def list_vector_search_endpoints():
    """List vector search endpoints using WorkspaceClient."""
    try:
        w = get_workspace_client()
        # Vector search API might not be available
        try:
            endpoints = list(w.vector_search_endpoints.list_endpoints())
            result = [
                {
                    'name': e.name,
                    'endpoint_type': e.endpoint_type.value if e.endpoint_type else None,
                    'endpoint_status': {
                        'state': e.endpoint_status.state.value if e.endpoint_status and e.endpoint_status.state else None,
                    } if e.endpoint_status else None,
                }
                for e in endpoints
            ]
            log('info', f"Listed {len(result)} vector search endpoints")
            return jsonify({'endpoints': result})
        except AttributeError:
            log('warning', "Vector search API not available in this SDK version")
            return jsonify({'endpoints': [], 'warning': 'Vector search API not available'})
    except Exception as e:
        log('error', f"Error listing vector search endpoints: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/uc/vector-search-indexes')
def list_vector_search_indexes():
    """List vector search indexes using WorkspaceClient with full details."""
    endpoint = request.args.get('endpoint')
    if not endpoint:
        return jsonify({'error': 'endpoint parameter required'}), 400
    
    try:
        w = get_workspace_client()
        try:
            indexes = list(w.vector_search_indexes.list_indexes(endpoint_name=endpoint))
            result = []
            for idx in indexes:
                index_info = {
                    'name': idx.name,
                    'endpoint_name': idx.endpoint_name,
                    'index_type': idx.index_type.value if idx.index_type else None,
                    'primary_key': idx.primary_key,
                    'status': getattr(idx, 'status', None),
                }
                
                # Extract source table info from delta_sync_index_spec
                if idx.delta_sync_index_spec:
                    spec = idx.delta_sync_index_spec
                    source_table = getattr(spec, 'source_table', None)
                    
                    index_info['delta_sync_index_spec'] = {
                        'source_table': source_table,
                        'pipeline_type': spec.pipeline_type.value if spec.pipeline_type else None,
                    }
                    
                    # Extract embedding source columns
                    if spec.embedding_source_columns:
                        index_info['delta_sync_index_spec']['embedding_source_columns'] = [
                            {
                                'name': col.name,
                                'embedding_model_endpoint_name': getattr(col, 'embedding_model_endpoint_name', None),
                            }
                            for col in spec.embedding_source_columns
                        ]
                    
                    # Extract columns to sync
                    if getattr(spec, 'columns_to_sync', None):
                        index_info['delta_sync_index_spec']['columns_to_sync'] = spec.columns_to_sync
                
                # Extract info from direct_access_index_spec if available
                if idx.direct_access_index_spec:
                    spec = idx.direct_access_index_spec
                    index_info['direct_access_index_spec'] = {
                        'embedding_source_columns': [
                            {
                                'name': col.name,
                                'embedding_model_endpoint_name': getattr(col, 'embedding_model_endpoint_name', None),
                            }
                            for col in (spec.embedding_source_columns or [])
                        ] if spec.embedding_source_columns else None,
                        'schema_json': getattr(spec, 'schema_json', None),
                    }
                
                result.append(index_info)
            
            log('info', f"Listed {len(result)} vector search indexes for endpoint {endpoint}")
            return jsonify({'vector_indexes': result})
        except AttributeError as e:
            log('warning', f"Vector search indexes API not available in this SDK version: {e}")
            return jsonify({'vector_indexes': [], 'warning': 'Vector search indexes API not available'})
    except Exception as e:
        log('error', f"Error listing vector search indexes for {endpoint}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/verify')
def verify_auth():
    """
    Verify authentication by making a test API call or using forwarded headers.
    
    If an Authorization header is provided, it will test that specific token.
    Otherwise, it uses OBO auth or auto-detected credentials.
    """
    log('debug', "=== AUTH VERIFY REQUEST ===")
    
    # Check if a manual token is being tested (from Authorization header)
    auth_header = request.headers.get('Authorization', '')
    manual_host = request.headers.get('X-Databricks-Host')
    
    if auth_header.startswith('Bearer '):
        # Testing a specific manual token
        token = auth_header[7:]
        token_source = 'manual'
        host = normalize_host(manual_host) if manual_host else None
        host_source = 'header' if manual_host else None
        log('info', f"Verifying MANUAL token (length: {len(token)}, host: {host})")
        
        if not host:
            # Try to get host from other sources
            host, host_source = get_databricks_host_with_source()
        
        if not host:
            return jsonify({
                'authenticated': False,
                'error': 'No Databricks host provided',
                'help': 'Include X-Databricks-Host header with the request',
            }), 400
        
        # Test the manual token directly
        try:
            resp = http_requests.get(
                f"{host}/api/2.0/sql/warehouses",
                headers={'Authorization': f'Bearer {token}'},
                timeout=10,
            )
            
            log('debug', f"Manual token test response: {resp.status_code}")
            
            if resp.ok:
                # Token works, try to get user info
                user_data = None
                try:
                    user_resp = http_requests.get(
                        f"{host}/api/2.0/preview/scim/v2/Me",
                        headers={'Authorization': f'Bearer {token}'},
                        timeout=10,
                    )
                    if user_resp.ok:
                        user_data = user_resp.json()
                        log('debug', f"SCIM response: {user_data}")
                except Exception as e:
                    log('warning', f"SCIM call failed: {e}")
                
                return jsonify({
                    'authenticated': True,
                    'token_source': token_source,
                    'host_source': host_source,
                    'host': host,
                    'user': {
                        'userName': user_data.get('userName') if user_data else 'authenticated_user',
                        'displayName': user_data.get('displayName') if user_data else 'Authenticated User',
                        'emails': user_data.get('emails', []) if user_data else [],
                    },
                })
            else:
                try:
                    error_data = resp.json()
                except Exception:
                    error_data = {'message': resp.text[:200]}
                
                error_msg = error_data.get('message', '') or error_data.get('error', '') or resp.text[:200]
                log('warning', f"Manual token verification failed: {resp.status_code} - {error_msg}")
                
                return jsonify({
                    'authenticated': False,
                    'error': f"Token validation failed: {error_msg}",
                    'status_code': resp.status_code,
                    'token_source': token_source,
                }), resp.status_code
                
        except Exception as e:
            log('error', f"Manual token verification error: {e}")
            return jsonify({
                'authenticated': False,
                'error': str(e),
                'token_source': token_source,
            }), 500
    
    # No manual token provided - use auto-detection
    token, token_source = get_databricks_token_with_source()
    host, host_source = get_databricks_host_with_source()
    
    log('debug', f"Auto-detect auth: token_source={token_source}, host_source={host_source}")
    
    # Check for Databricks App forwarded user info
    # When running in a Databricks App with OBO auth, these headers contain user info
    forwarded_email = request.headers.get('X-Forwarded-Email')
    forwarded_username = request.headers.get('X-Forwarded-Preferred-Username')
    forwarded_user_id = request.headers.get('X-Forwarded-User')
    
    # If we have OBO auth with forwarded headers, we're authenticated
    if token_source == 'obo' and (forwarded_email or forwarded_username):
        log('info', f"OBO auth verified via headers: email={forwarded_email}, username={forwarded_username}")
        return jsonify({
            'authenticated': True,
            'token_source': token_source,
            'host_source': host_source,
            'host': host,
            'user': {
                'userName': forwarded_email or forwarded_username,
                'displayName': forwarded_username or forwarded_email,
                'emails': [{'value': forwarded_email}] if forwarded_email else [],
            },
            'auth_method': 'obo_headers',
        })
    
    if not token:
        return jsonify({
            'authenticated': False,
            'error': 'No authentication token available',
            'token_source': None,
            'help': 'The app needs either: (1) X-Forwarded-Access-Token from Databricks App, '
                   '(2) Manual PAT configuration, or (3) DATABRICKS_TOKEN environment variable.',
        }), 401
    
    if not host:
        return jsonify({
            'authenticated': False,
            'error': 'No Databricks host configured',
            'host_source': None,
        }), 400
    
    # For manual tokens or SDK auth, try to call an API to verify
    # Use the SQL warehouses list endpoint which has the 'sql' scope
    try:
        resp = http_requests.get(
            f"{host}/api/2.0/sql/warehouses",
            headers={'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        
        if resp.ok:
            # Token works for SQL APIs, now try to get user info
            # Try SCIM /Me but don't fail if it doesn't work
            user_data = None
            try:
                user_resp = http_requests.get(
                    f"{host}/api/2.0/preview/scim/v2/Me",
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=10,
                )
                if user_resp.ok:
                    user_data = user_resp.json()
            except Exception:
                pass  # SCIM might not be available, that's OK
            
            return jsonify({
                'authenticated': True,
                'token_source': token_source,
                'host_source': host_source,
                'host': host,
                'user': {
                    'userName': user_data.get('userName') if user_data else 'Unknown',
                    'displayName': user_data.get('displayName') if user_data else 'Authenticated User',
                    'emails': user_data.get('emails', []) if user_data else [],
                } if user_data else {
                    'userName': 'authenticated_user',
                    'displayName': 'Authenticated User',
                    'emails': [],
                },
            })
        else:
            # Try to parse error response
            try:
                error_data = resp.json()
            except Exception:
                error_data = {'message': resp.text}
            
            error_msg = error_data.get('message', '') or error_data.get('error', '') or resp.text
            
            # Check for scope errors
            if 'scope' in error_msg.lower():
                return jsonify({
                    'authenticated': False,
                    'error': error_msg,
                    'token_source': token_source,
                    'host_source': host_source,
                    'scope_error': True,
                    'required_scopes': ['sql'],
                    'configured_scopes': OAUTH_SCOPES,
                    'help': 'The OAuth token does not have the required scopes. '
                           'If using Databricks App with user authorization, the user may need to '
                           're-authorize the app. Try: (1) Sign out and sign back in, or '
                           '(2) Use a Personal Access Token instead.',
                }), 403
            
            return jsonify({
                'authenticated': False,
                'error': error_msg,
                'status_code': resp.status_code,
                'token_source': token_source,
                'host_source': host_source,
            }), resp.status_code
            
    except Exception as e:
        return jsonify({
            'authenticated': False,
            'error': str(e),
            'token_source': token_source,
            'host_source': host_source,
        }), 500


@app.route('/api/debug')
def debug_info():
    """Debug endpoint to check headers and config."""
    # Get all forwarded headers (safe to show names, not values)
    forwarded_headers = {
        k: ('***' if 'token' in k.lower() or 'secret' in k.lower() else v[:50] + '...' if len(str(v)) > 50 else v)
        for k, v in request.headers 
        if k.lower().startswith('x-forwarded') or k.lower().startswith('x-real')
    }
    
    token, source = get_databricks_token_with_source()
    host, host_source = get_databricks_host_with_source()
    
    return jsonify({
        'status': 'ok',
        'auth': {
            'token_source': source,
            'has_token': bool(token),
            'token_length': len(token) if token else 0,
            'host': host,
            'host_source': host_source,
        },
        'databricks_app_context': {
            'has_forwarded_token': bool(request.headers.get('X-Forwarded-Access-Token')),
            'has_forwarded_email': bool(request.headers.get('X-Forwarded-Email')),
            'forwarded_email': request.headers.get('X-Forwarded-Email'),
            'forwarded_user': request.headers.get('X-Forwarded-User'),
        },
        'forwarded_headers': forwarded_headers,
        'manual_auth': {
            'has_auth_header': bool(request.headers.get('Authorization')),
            'has_oauth_session': 'access_token' in session,
        },
        'environment': {
            'DATABRICKS_HOST': os.environ.get('DATABRICKS_HOST', 'not set'),
            'DATABRICKS_TOKEN': 'set' if os.environ.get('DATABRICKS_TOKEN') else 'not set',
            'DATABRICKS_CLIENT_ID': 'set' if os.environ.get('DATABRICKS_CLIENT_ID') else 'not set',
        },
        'configured_scopes': OAUTH_SCOPES,
    })


# =============================================================================
# Static File Serving
# =============================================================================

@app.route('/')
def index():
    """Serve the React frontend."""
    return send_from_directory(STATIC_FOLDER, 'index.html')


@app.route('/<path:path>')
def serve_static(path: str):
    """Serve static files or fall back to index.html for SPA routing."""
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    file_path = os.path.join(STATIC_FOLDER, path)
    if os.path.isfile(file_path):
        return send_from_directory(STATIC_FOLDER, path)
    
    # SPA fallback - serve index.html for client-side routing
    return send_from_directory(STATIC_FOLDER, 'index.html')


# =============================================================================
# Version Info
# =============================================================================

@app.route('/api/version')
def get_version():
    """Get the dao-ai library version."""
    # First check for DAO_AI_VERSION environment variable (set in app.yaml)
    dao_ai_version = os.environ.get('DAO_AI_VERSION')
    
    # If not set, try to get from installed package
    if not dao_ai_version:
        try:
            import importlib.metadata
            # Try both package name formats
            try:
                dao_ai_version = importlib.metadata.version('dao-ai')
            except importlib.metadata.PackageNotFoundError:
                try:
                    dao_ai_version = importlib.metadata.version('dao_ai')
                except importlib.metadata.PackageNotFoundError:
                    pass
        except Exception as e:
            log('warning', f"Could not get dao-ai version: {e}")
    
    if not dao_ai_version:
        dao_ai_version = 'unknown'
    
    return jsonify({
        'dao_ai': dao_ai_version,
        'app': 'dao-ai-builder',
    })


# =============================================================================
# AI Prompt Assistant
# =============================================================================

@app.route('/api/ai/generate-prompt', methods=['POST'])
def generate_prompt():
    """Generate an optimized prompt using Claude for GenAI agent applications.
    
    Request body:
    - context: Description of what the agent should do
    - agent_name: Name of the agent (optional)
    - agent_description: Description of the agent (optional)
    - tools: List of tools available to the agent (optional)
    - existing_prompt: Existing prompt to improve (optional)
    - template_parameters: List of template variables to include (optional)
    
    Returns:
    - prompt: Generated optimized prompt
    """
    try:
        data = request.get_json()
        context = data.get('context', '')
        agent_name = data.get('agent_name', '')
        agent_description = data.get('agent_description', '')
        tools = data.get('tools', [])
        existing_prompt = data.get('existing_prompt', '')
        template_parameters = data.get('template_parameters', [])
        
        if not context and not existing_prompt:
            return jsonify({'error': 'Either context or existing_prompt is required'}), 400
        
        # Use the app's service principal credentials for the serving endpoint
        # The serving endpoint is configured as an app resource with CAN_QUERY permission
        log('info', "Generating prompt using Claude with app service principal")
        
        # Build template parameters instruction
        template_params_instruction = ""
        if template_parameters:
            params_formatted = ", ".join([f"{{{p}}}" for p in template_parameters])
            template_params_instruction = f"\n7. IMPORTANT: Include these template variables in a User Information section at the start of the prompt: {params_formatted}"
        else:
            template_params_instruction = "\n7. Use template variables like {user_id}, {store_num}, {context} for dynamic information"
        
        # Build the system message for prompt generation
        system_message = f"""You are an expert prompt engineer specializing in creating highly effective system prompts for AI agents. Your task is to generate optimized prompts for GenAI agent applications that follow best practices.

When creating prompts, follow these guidelines:
1. Be specific and clear about the agent's role and responsibilities
2. Include relevant context about the domain and use case
3. Define the agent's capabilities and limitations
4. Provide clear instructions for tool usage when tools are available
5. Include guidelines for response format and tone
6. Add safety and guardrail instructions where appropriate{template_params_instruction}
8. Structure the prompt with clear sections (role, capabilities, guidelines, etc.)
9. Make the prompt concise but comprehensive
10. Focus on actionable instructions rather than vague guidance

Output ONLY the prompt text, without any additional explanation or markdown formatting."""

        # Build the user message
        user_parts = []
        
        if existing_prompt:
            user_parts.append(f"Please improve and optimize this existing prompt:\n\n{existing_prompt}")
        else:
            user_parts.append(f"Please create an optimized system prompt for the following agent:")
        
        if agent_name:
            user_parts.append(f"\nAgent Name: {agent_name}")
        
        if agent_description:
            user_parts.append(f"\nAgent Description: {agent_description}")
        
        if context:
            user_parts.append(f"\nContext/Requirements: {context}")
        
        if tools:
            tools_str = ", ".join(tools) if isinstance(tools, list) else str(tools)
            user_parts.append(f"\nAvailable Tools: {tools_str}")
            user_parts.append("\nInclude clear instructions for when and how to use these tools.")
        
        if template_parameters:
            params_list = ", ".join([f"{{{p}}}" for p in template_parameters])
            user_parts.append(f"\nTemplate Parameters to include: {params_list}")
            user_parts.append("Include a '### User Information' section at the beginning that displays these parameters.")
        
        user_message = "\n".join(user_parts)
        
        # Call the Databricks serving endpoint using the SDK
        # This uses the app's service principal credentials automatically
        try:
            from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
            
            w = get_workspace_client()
            
            messages = [
                ChatMessage(role=ChatMessageRole.SYSTEM, content=system_message),
                ChatMessage(role=ChatMessageRole.USER, content=user_message)
            ]
            
            log('info', "Calling Claude endpoint via SDK serving_endpoints.query()")
            
            response = w.serving_endpoints.query(
                name="databricks-claude-sonnet-4",
                messages=messages,
                max_tokens=2000,
                temperature=0.7
            )
            
            # Extract the generated prompt from the response
            generated_prompt = ''
            if response.choices and len(response.choices) > 0:
                generated_prompt = response.choices[0].message.content
            
            if not generated_prompt:
                log('error', f"No content in response: {response}")
                return jsonify({'error': 'No response generated'}), 500
            
            log('info', f"Successfully generated prompt ({len(generated_prompt)} chars)")
            return jsonify({'prompt': generated_prompt.strip()})
            
        except Exception as sdk_error:
            log('error', f"SDK serving endpoint query failed: {sdk_error}")
            return jsonify({'error': f'Failed to generate prompt: {str(sdk_error)}'}), 500
            
    except Exception as e:
        import traceback
        log('error', f"Error generating prompt: {e}")
        log('error', f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/ai/generate-guardrail-prompt', methods=['POST'])
def generate_guardrail_prompt():
    """Generate an optimized guardrail evaluation prompt using Claude.
    
    Request body:
    - context: Description of what the guardrail should evaluate
    - guardrail_name: Name of the guardrail (optional)
    - evaluation_criteria: List of criteria to evaluate (optional)
    - existing_prompt: Existing prompt to improve (optional)
    
    Returns:
    - prompt: Generated optimized guardrail prompt
    """
    try:
        data = request.get_json()
        context = data.get('context', '')
        guardrail_name = data.get('guardrail_name', '')
        evaluation_criteria = data.get('evaluation_criteria', [])
        existing_prompt = data.get('existing_prompt', '')
        
        if not context and not existing_prompt and not evaluation_criteria:
            return jsonify({'error': 'Either context, evaluation_criteria, or existing_prompt is required'}), 400
        
        # Use the app's service principal credentials for the serving endpoint
        log('info', "Generating guardrail prompt using Claude with app service principal")
        
        # Build criteria instruction
        criteria_instruction = ""
        if evaluation_criteria:
            criteria_list = "\n".join([f"- {c.replace('_', ' ').title()}" for c in evaluation_criteria])
            criteria_instruction = f"\n\nThe guardrail should specifically evaluate these criteria:\n{criteria_list}"
        
        # Build the system message for guardrail prompt generation
        system_message = f"""You are an expert prompt engineer specializing in creating guardrail evaluation prompts for AI agents. Your task is to generate optimized guardrail prompts that effectively evaluate AI responses.

When creating guardrail prompts, follow these guidelines:
1. Clearly define the role as an expert judge evaluating AI responses
2. Include specific, measurable evaluation criteria
3. Provide clear pass/fail conditions for each criterion
4. Include instructions for the judge to output structured feedback
5. Use {{inputs}} placeholder for the user's original query/conversation
6. Use {{outputs}} placeholder for the AI's response being evaluated
7. Make the evaluation criteria objective and actionable
8. Include instructions to provide constructive feedback when the response fails
9. Structure the output to include both a pass/fail decision and detailed reasoning

Output ONLY the prompt text, without any additional explanation or markdown formatting."""

        # Build the user message
        user_parts = []
        
        if existing_prompt:
            user_parts.append(f"Please improve and optimize this existing guardrail evaluation prompt:\n\n{existing_prompt}")
        else:
            user_parts.append("Please create an optimized guardrail evaluation prompt.")
        
        if guardrail_name:
            user_parts.append(f"\nGuardrail Name: {guardrail_name}")
        
        if context:
            user_parts.append(f"\nContext/Requirements: {context}")
        
        if evaluation_criteria:
            criteria_str = ", ".join([c.replace('_', ' ').title() for c in evaluation_criteria])
            user_parts.append(f"\nEvaluation Criteria to include: {criteria_str}")
            user_parts.append("\nMake sure each of these criteria has clear pass/fail conditions.")
        
        user_parts.append("\nThe prompt should use {inputs} for the conversation context and {outputs} for the AI response being evaluated.")
        
        user_message = "\n".join(user_parts)
        
        # Call the Databricks serving endpoint using the SDK
        from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
        
        w = get_workspace_client()
        
        messages = [
            ChatMessage(role=ChatMessageRole.SYSTEM, content=system_message),
            ChatMessage(role=ChatMessageRole.USER, content=user_message)
        ]
        
        log('info', "Calling Claude endpoint for guardrail prompt via SDK serving_endpoints.query()")
        
        response = w.serving_endpoints.query(
            name="databricks-claude-sonnet-4",
            messages=messages,
            max_tokens=2000,
            temperature=0.7
        )
        
        # Extract the generated prompt from the response
        generated_prompt = ''
        if response.choices and len(response.choices) > 0:
            generated_prompt = response.choices[0].message.content
        
        if not generated_prompt:
            log('error', f"No content in response: {response}")
            return jsonify({'error': 'No response generated'}), 500
        
        log('info', f"Successfully generated guardrail prompt ({len(generated_prompt)} chars)")
        return jsonify({'prompt': generated_prompt.strip()})
            
    except Exception as e:
        import traceback
        log('error', f"Error generating guardrail prompt: {e}")
        log('error', f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/ai/generate-handoff-prompt', methods=['POST'])
def generate_handoff_prompt():
    """Generate an optimized handoff prompt using Claude.
    
    A handoff prompt describes when an agent should be called in a multi-agent system.
    It's used by supervisors/orchestrators to decide routing.
    
    Request body:
    - agent_name: Name of the agent
    - agent_description: Description of the agent (optional)
    - system_prompt: The agent's system prompt to base the handoff on
    - existing_handoff: Existing handoff prompt to improve (optional)
    - other_agents: List of other agent names in the system (optional)
    
    Returns:
    - prompt: Generated optimized handoff prompt
    """
    try:
        data = request.get_json() or {}
        agent_name = data.get('agent_name', '')
        agent_description = data.get('agent_description', '')
        system_prompt = data.get('system_prompt', '')
        existing_handoff = data.get('existing_handoff', '')
        other_agents = data.get('other_agents', [])
        
        if not system_prompt and not existing_handoff and not agent_description:
            return jsonify({'error': 'Either system_prompt, agent_description, or existing_handoff is required'}), 400
        
        log('info', "Generating handoff prompt using Claude with app service principal")
        
        # Build the system message for handoff prompt generation
        system_message = """You are an expert at designing multi-agent AI systems. Your task is to generate concise handoff prompts that describe when a specific agent should be called.

A handoff prompt is used by a supervisor or orchestrator agent to decide which specialized agent should handle a user's request. The handoff prompt should:

1. Be concise and action-oriented (1-3 sentences max)
2. Clearly describe the TYPE of requests or tasks this agent handles
3. Include specific keywords or topics that should trigger routing to this agent
4. Differentiate this agent's responsibilities from other agents in the system
5. Focus on WHEN to call this agent, not HOW the agent works internally

Good handoff prompts are specific and decisive:
- "Route to this agent for product searches, inventory lookups, and finding items by name, category, or SKU."
- "Call this agent when the user needs help with order status, returns, refunds, or shipping issues."
- "Use this agent for technical troubleshooting, installation help, and product compatibility questions."

Avoid vague descriptions like "handles general questions" or "helps with various tasks."

Output ONLY the handoff prompt text, without any additional explanation or formatting."""

        # Build the user message
        user_parts = []
        
        if existing_handoff:
            user_parts.append(f"Please improve this existing handoff prompt:\n\n{existing_handoff}")
        else:
            user_parts.append("Please create a handoff prompt for this agent.")
        
        if agent_name:
            user_parts.append(f"\nAgent Name: {agent_name}")
        
        if agent_description:
            user_parts.append(f"\nAgent Description: {agent_description}")
        
        if system_prompt:
            # Truncate very long system prompts
            truncated_prompt = system_prompt[:2000] + "..." if len(system_prompt) > 2000 else system_prompt
            user_parts.append(f"\nAgent's System Prompt:\n{truncated_prompt}")
        
        if other_agents:
            agents_list = ", ".join(other_agents)
            user_parts.append(f"\nOther agents in the system: {agents_list}")
            user_parts.append("\nMake sure the handoff prompt differentiates this agent from the others.")
        
        user_message = "\n".join(user_parts)
        
        # Call the Databricks serving endpoint using the SDK
        from databricks.sdk.service.serving import ChatMessage, ChatMessageRole
        
        w = get_workspace_client()
        
        messages = [
            ChatMessage(role=ChatMessageRole.SYSTEM, content=system_message),
            ChatMessage(role=ChatMessageRole.USER, content=user_message)
        ]
        
        log('info', "Calling Claude endpoint for handoff prompt via SDK serving_endpoints.query()")
        
        response = w.serving_endpoints.query(
            name="databricks-claude-sonnet-4",
            messages=messages,
            max_tokens=500,  # Handoff prompts should be concise
            temperature=0.7
        )
        
        # Extract the generated prompt from the response
        generated_prompt = ''
        if response.choices and len(response.choices) > 0:
            generated_prompt = response.choices[0].message.content
        
        if not generated_prompt:
            log('error', f"No content in response: {response}")
            return jsonify({'error': 'No response generated'}), 500
        
        log('info', f"Successfully generated handoff prompt ({len(generated_prompt)} chars)")
        return jsonify({'prompt': generated_prompt.strip()})
            
    except Exception as e:
        import traceback
        log('error', f"Error generating handoff prompt: {e}")
        log('error', f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == '__main__':
    # Local development mode
    from dotenv import load_dotenv
    
    # Load .env file
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
    
    # Databricks Apps use port 8000 by default
    port = int(os.environ.get('PORT', 8000))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    print(f"Starting DAO AI Builder on port {port}")
    if os.environ.get('DATABRICKS_HOST'):
        print(f"DATABRICKS_HOST: {os.environ.get('DATABRICKS_HOST')}")
    if os.environ.get('DATABRICKS_TOKEN'):
        print("DATABRICKS_TOKEN: [set]")
    if OAUTH_CLIENT_ID:
        print("OAuth configured")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
