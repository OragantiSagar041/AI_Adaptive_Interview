import http.server
import ssl
import os

# Change to the directory with your files
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Set up the server
server_address = ('0.0.0.0', 3000)
# Use ThreadingHTTPServer to handle multiple requests concurrently
httpd = http.server.ThreadingHTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Add SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving HTTPS on port {server_address[1]}...")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped by user.")
    httpd.server_close()