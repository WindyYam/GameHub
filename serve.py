import http.server
import socketserver
import os
import json
import threading
import ssl
import mimetypes

PORT = 8443  # Standard HTTPS port
# Add correct MIME types before starting server
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.tsx')
mimetypes.add_type('application/javascript', '.ts')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('application/wasm', '.wasm')

class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Handle requests in a separate thread."""
    allow_reuse_address = True

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.ts': 'application/javascript',
        '.tsx': 'application/javascript',
        '.css': 'text/css',
        '.wasm': 'application/wasm',
    }

    def do_GET(self):
        clean_path = self.path.split('?', 1)[0]
        if clean_path == '/api/games':
            self.handle_games_api()
        else:
            super().do_GET()
    
    def handle_games_api(self):
        """Handles the /api/games endpoint."""
        games_dir = os.path.join(os.getcwd(), 'games')
        games = []
        
        if os.path.exists(games_dir):
            for game_id, game_folder in enumerate(sorted(os.listdir(games_dir))):
                game_path = f'games/{game_folder}/index.html'
                if os.path.exists(os.path.join(games_dir, game_folder, 'index.html')):
                    games.append({'id': game_id, 'path': game_path})
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(games).encode('utf-8'))

def run_server():
    os.chdir(os.path.dirname(__file__))
    
    try:
        with ThreadedHTTPServer(("", PORT), CustomHandler) as httpd:
            # Add SSL context
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
            
            print(f"Secure server started at https://127.0.0.1:{PORT}")
            print("Press Ctrl+C to stop the server")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down the server...")
        httpd.shutdown()
        httpd.server_close()
        print("Server stopped successfully")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    run_server()