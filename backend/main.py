"""
Minimal Flask backend for DAO AI Builder.

This backend serves three purposes:
1. Serve the static React frontend
2. Provide authentication token (from header or environment variable)
3. Proxy Databricks API calls (to avoid CORS issues)

Token resolution order:
1. X-Forwarded-Access-Token header (Databricks App with user auth)
2. DATABRICKS_TOKEN environment variable (from .env or system env)

Host resolution:
- Frontend uses window.location.origin when in Databricks App
- Falls back to DATABRICKS_HOST env var for local development

Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_obo
"""
import os
from pathlib import Path

# Load .env file if it exists (python-dotenv)
from dotenv import load_dotenv

# Look for .env in backend dir, then project root
env_paths = [
    Path(__file__).parent / '.env',
    Path(__file__).parent.parent / '.env',
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        break

import requests
from flask import Flask, send_from_directory, jsonify, request, Response

app = Flask(__name__, static_folder='static')

# Static folder path
STATIC_FOLDER = os.environ.get('STATIC_FOLDER', 'static')
if not os.path.isabs(STATIC_FOLDER):
    STATIC_FOLDER = os.path.join(os.path.dirname(__file__), STATIC_FOLDER)


@app.route('/api/auth/token')
def get_auth_token():
    """
    Get authentication token and host for Databricks API calls.
    
    Token resolution order:
    1. X-Forwarded-Access-Token header (on-behalf-of user auth in Databricks Apps)
    2. DATABRICKS_TOKEN environment variable (from .env or system env)
    
    Host:
    - DATABRICKS_HOST environment variable (for local development)
    - Frontend will use window.location.origin when in Databricks App
    
    Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_obo
    """
    # Try to get token from forwarded header first (Databricks App with user auth)
    token = request.headers.get('X-Forwarded-Access-Token')
    source = 'header' if token else None
    
    # Fallback to environment variable
    if not token:
        token = os.environ.get('DATABRICKS_TOKEN')
        source = 'env' if token else None
    
    # Get host from environment (for local dev)
    host = os.environ.get('DATABRICKS_HOST')
    
    # Get user info from headers if available
    email = request.headers.get('X-Forwarded-Email')
    user = request.headers.get('X-Forwarded-User')
    
    return jsonify({
        'token': token,
        'host': host,
        'email': email,
        'user': user,
        'source': source,
    })


@app.route('/api/databricks/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def proxy_databricks(path: str):
    """
    Proxy requests to Databricks API to avoid CORS issues.
    
    Frontend calls: /api/databricks/api/2.1/unity-catalog/catalogs
    This proxies to: https://<host>/api/2.1/unity-catalog/catalogs
    """
    # Get token from header or env
    token = request.headers.get('X-Forwarded-Access-Token')
    if not token:
        token = os.environ.get('DATABRICKS_TOKEN')
    
    if not token:
        return jsonify({'error': 'No authentication token available'}), 401
    
    # Get host from request header or env
    host = request.headers.get('X-Databricks-Host')
    if not host:
        host = os.environ.get('DATABRICKS_HOST')
    
    if not host:
        return jsonify({'error': 'No Databricks host configured'}), 400
    
    # Build the target URL
    host = host.rstrip('/')
    target_url = f"{host}/{path}"
    
    # Forward query parameters
    if request.query_string:
        target_url += f"?{request.query_string.decode('utf-8')}"
    
    # Prepare headers
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    
    try:
        # Forward the request
        resp = requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            json=request.get_json(silent=True) if request.is_json else None,
            timeout=30,
        )
        
        # Return the response
        return Response(
            resp.content,
            status=resp.status_code,
            content_type=resp.headers.get('Content-Type', 'application/json'),
        )
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Failed to connect to Databricks: {str(e)}'}), 502


@app.route('/')
def index():
    return send_from_directory(STATIC_FOLDER, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    file_path = os.path.join(STATIC_FOLDER, path)
    if os.path.isfile(file_path):
        return send_from_directory(STATIC_FOLDER, path)
    return send_from_directory(STATIC_FOLDER, 'index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    print(f"Starting server on port {port}")
    if os.environ.get('DATABRICKS_HOST'):
        print(f"DATABRICKS_HOST: {os.environ.get('DATABRICKS_HOST')}")
    if os.environ.get('DATABRICKS_TOKEN'):
        print("DATABRICKS_TOKEN: [set]")
    app.run(host='0.0.0.0', port=port, debug=debug)
