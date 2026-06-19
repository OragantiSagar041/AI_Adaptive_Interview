import http.server
import ssl
import os

# Change to the dist directory with your compiled files
base_dir = os.path.dirname(os.path.abspath(__file__))
dist_dir = os.path.join(base_dir, "dist")

# Ensure build exists
if not os.path.exists(dist_dir):
    os.makedirs(dist_dir, exist_ok=True)

os.chdir(dist_dir)

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Serves files with no-cache headers so the browser always gets the latest version."""
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

# Set up the server
server_address = ('0.0.0.0', 3000)
# Use ThreadingHTTPServer to handle multiple requests concurrently
httpd = http.server.ThreadingHTTPServer(server_address, NoCacheHTTPRequestHandler)

# Add SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
certfile_path = os.path.join(base_dir, 'cert.pem')
keyfile_path = os.path.join(base_dir, 'key.pem')

context.load_cert_chain(certfile=certfile_path, keyfile=keyfile_path)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving React build on HTTPS at https://localhost:{server_address[1]} (no-cache mode)...")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped by user.")
    httpd.server_close()
