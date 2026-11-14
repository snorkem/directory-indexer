"""
Script Generators
Generates helper scripts for running the directory indexer viewer
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from ..config.settings import ServerConfig


def generate_server_script(output_dir: str, html_filename: str, port: int = ServerConfig.DEFAULT_PORT) -> str:
    """
    Generate a simple Python HTTP server script for viewing the database mode files.

    Args:
        output_dir: Directory where the server script will be created
        html_filename: Name of the HTML file to serve
        port: Port number for the server (default from ServerConfig)

    Returns:
        Path to the generated server script
    """
    # URL-encoded so names with spaces, quotes, braces or "#" are safe in code and URLs
    html_url_path = quote(html_filename)

    server_script = f'''#!/usr/bin/env python3
"""
Simple HTTP Server for Directory Index Viewer
Serves the HTML file and database to this computer only (localhost)

Usage:
    python serve.py [port]

Default port: {port}
"""
import http.server
import socketserver
import socket
import os
import sys
from pathlib import Path

# Port configuration
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else {port}

# If using default port, check availability and find next available port
if len(sys.argv) <= 1:
    def is_port_available(port):
        """Check if a port is available for binding."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return True
        except OSError:
            return False

    original_port = PORT
    while not is_port_available(PORT):
        PORT += 1
        if PORT > 65535:  # Max valid port number
            print(f"Error: Could not find available port starting from {{original_port}}")
            sys.exit(1)

    if PORT != original_port:
        print(f"Note: Default port {{original_port}} was in use, using port {{PORT}} instead")

class ViewerRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler for the viewer (same-origin, so no CORS headers)"""

    def end_headers(self):
        # Prevent caching for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Customize log format
        sys.stderr.write("[%s] %s\\n" % (self.log_date_time_string(), format % args))

if __name__ == "__main__":
    # Change to script directory
    os.chdir(Path(__file__).resolve().parent)

    Handler = ViewerRequestHandler

    try:
        with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
            # Output port for launcher scripts to parse (flush immediately)
            print(f"ACTUAL_PORT={{PORT}}", flush=True)
            # Our own process ID, so launchers can stop exactly this server
            print(f"SERVER_PID={{os.getpid()}}", flush=True)
            print("=" * 60)
            print("Directory Index Viewer Server")
            print("=" * 60)
            print(f"Serving at http://localhost:{{PORT}}")
            print(f"\\nOpen in browser: http://localhost:{{PORT}}/{html_url_path}")
            print("\\nPress Ctrl+C to stop the server")
            print("=" * 60)
            sys.stdout.flush()
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\\n\\nServer stopped.")
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"Error: Port {{PORT}} is already in use.")
            print(f"Try a different port: python serve.py <port_number>")
            sys.exit(1)
        else:
            raise
'''

    server_path = Path(output_dir) / 'serve.py'
    server_path.write_text(server_script)

    # Make executable on Unix-like systems
    try:
        server_path.chmod(0o755)
    except (NotImplementedError, OSError):
        pass  # Windows doesn't support chmod or filesystem doesn't support permissions

    return str(server_path)


def generate_launcher_scripts(
    macos_dir: str,
    windows_dir: str,
    linux_dir: str,
    html_filename: str,
    port: int = ServerConfig.DEFAULT_PORT
) -> tuple:
    """
    Generate cross-platform launcher scripts for macOS, Windows, and Linux.

    Args:
        macos_dir: Directory where macOS .command script will be created
        windows_dir: Directory where Windows .bat script will be created
        linux_dir: Directory where Linux .sh script will be created
        html_filename: Name of the HTML file to open
        port: Port number for the server (default from ServerConfig)

    Returns:
        Tuple of (macos_script_path, windows_script_path, linux_script_path)
    """
    # URL-encoded so names with spaces, quotes, "&" or "#" open the right page;
    # batch files also need "%" doubled so %20 isn't read as an argument
    html_url_path = quote(html_filename)
    bat_url_path = html_url_path.replace('%', '%%')

    # macOS .command script (zsh) - navigates to ../data/
    macos_script = f'''#!/bin/zsh
# Directory Index Viewer Launcher (macOS)
# Double-click this file to start the server and open the viewer

# Get the directory where this script is located and navigate to data folder
SCRIPT_DIR="${{0:a:h}}"
cd "$SCRIPT_DIR/../data"

echo "============================================================"
echo "Starting Directory Index Viewer"
echo "============================================================"
echo ""
echo "Working directory: $(pwd)"
echo ""

# Create temporary log file using mktemp for better cleanup
LOG_FILE=$(mktemp /tmp/serve_output.XXXXXX)

# Start the Python server in background and capture output
# Note: Not passing port argument to allow auto-port detection
python3 serve.py > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Server starting..."
echo ""

# Wait for server to start and output port (polling with timeout)
ACTUAL_PORT=""
MAX_ATTEMPTS=20  # 20 attempts * 0.5s = 10 seconds max wait
ATTEMPT=0

while [ -z "$ACTUAL_PORT" ] && [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    sleep 0.5
    ACTUAL_PORT=$(grep -m 1 "^ACTUAL_PORT=" "$LOG_FILE" 2>/dev/null | cut -d= -f2)
    ATTEMPT=$((ATTEMPT + 1))
done

if [ -z "$ACTUAL_PORT" ]; then
    echo "Warning: Could not detect server port, using default {port}"
    ACTUAL_PORT={port}
fi

echo "Server started on http://localhost:$ACTUAL_PORT"
echo ""

# Open in default browser
echo "Opening browser..."
open "http://localhost:$ACTUAL_PORT/{html_url_path}"
echo ""
echo "Server is running. Close this window to stop the server."
echo "============================================================"
echo ""

# Tail server output in background
tail -f "$LOG_FILE" &
TAIL_PID=$!

# Cleanup function
cleanup() {{
    echo "\\nStopping server..."
    kill $SERVER_PID 2>/dev/null
    kill $TAIL_PID 2>/dev/null
    rm -f "$LOG_FILE"
}}

# Set up trap for cleanup
trap cleanup EXIT INT TERM

# Wait for user to close terminal (keeps server running)
wait $SERVER_PID
'''

    # Windows .bat script - navigates to ..\data\
    windows_script = f'''@echo off
REM Directory Index Viewer Launcher (Windows)
REM Double-click this file to start the server and open the viewer

REM Get the directory where this script is located and navigate to data folder
cd /d "%~dp0..\\data"

echo ============================================================
echo Starting Directory Index Viewer
echo ============================================================
echo.
echo Working directory: %CD%
echo.

REM Set temporary log file
set "LOG_FILE=%TEMP%\\serve_output_%RANDOM%.log"

REM Start the Python server in background and capture output
REM Note: Not passing port argument to allow auto-port detection
start /b cmd /c "python serve.py > "%LOG_FILE%" 2>&1"

echo Server starting...
echo.

REM Wait for server to start and output its port and process ID
timeout /t 3 /nobreak >nul

REM Extract the actual port from server output
set ACTUAL_PORT=
for /f "tokens=2 delims==" %%i in ('findstr /b "ACTUAL_PORT=" "%LOG_FILE%" 2^>nul') do set ACTUAL_PORT=%%i

REM Process ID the server reported for itself (used to stop exactly this server)
set SERVER_PID=
for /f "tokens=2 delims==" %%i in ('findstr /b "SERVER_PID=" "%LOG_FILE%" 2^>nul') do set SERVER_PID=%%i

REM If port not found, use default
if "%ACTUAL_PORT%"=="" (
    echo Warning: Could not detect server port, using default {port}
    set ACTUAL_PORT={port}
)

echo Server started on http://localhost:%ACTUAL_PORT%
echo.

REM Open in default browser
echo Opening browser...
start "" "http://localhost:%ACTUAL_PORT%/{bat_url_path}"

echo.
echo Server is running. Press any key to stop the server.
echo ============================================================
echo.

REM Keep window open and wait
pause >nul

REM Cleanup
echo.
echo Stopping server...

if "%SERVER_PID%"=="" (
    echo Could not determine the server process. Close this window to stop the server.
    pause >nul
) else (
    taskkill /f /pid %SERVER_PID% >nul 2>&1
)

del /f /q "%LOG_FILE%" >nul 2>&1
'''

    # Linux .sh script (bash) - navigates to ../data/
    linux_script = f'''#!/bin/bash
# Directory Index Viewer Launcher (Linux)
# Run this file to start the server and open the viewer

SCRIPT_DIR="$( cd "$( dirname "${{BASH_SOURCE[0]}}" )" && pwd )"
cd "$SCRIPT_DIR/../data"

echo "Starting Directory Index Viewer"
echo "============================================================"
echo ""
echo "Working directory: $(pwd)"
echo ""

# Create temporary log file using mktemp for better cleanup
LOG_FILE=$(mktemp /tmp/serve_output.XXXXXX)

# Start the Python server in background and capture output
# Note: Not passing port argument to allow auto-port detection
python3 serve.py > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Server starting..."
echo ""

# Wait for server to start and output port (polling with timeout)
ACTUAL_PORT=""
MAX_WAIT=30
ELAPSED=0

while [ -z "$ACTUAL_PORT" ] && [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 0.5
    ELAPSED=$((ELAPSED + 1))

    # Extract actual port from server output
    if [ -f "$LOG_FILE" ]; then
        ACTUAL_PORT=$(grep -o "ACTUAL_PORT=[0-9]*" "$LOG_FILE" | cut -d= -f2)
    fi
done

if [ -z "$ACTUAL_PORT" ]; then
    echo "Warning: Could not detect server port, defaulting to {port}"
    ACTUAL_PORT={port}
else
    echo "Server started on http://localhost:$ACTUAL_PORT"
    echo ""
fi

echo "Opening browser..."
echo ""

# Open browser (xdg-open is standard on Linux)
xdg-open "http://localhost:$ACTUAL_PORT/{html_url_path}" 2>/dev/null

echo ""
echo "Server is running at http://localhost:$ACTUAL_PORT"
echo "Browser opened to: http://localhost:$ACTUAL_PORT/{html_url_path}"
echo ""
echo "Press Ctrl+C to stop the server"
echo "============================================================"

# Cleanup function
cleanup() {{
    echo ""
    echo "Shutting down server..."

    # Kill the server process
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
    fi


    # Clean up log file
    rm -f "$LOG_FILE"

    echo "Server stopped."
    exit 0
}}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Wait for server process
wait $SERVER_PID
'''

    # Write macOS script
    macos_path = Path(macos_dir) / 'start-viewer.command'
    macos_path.write_text(macos_script)

    # Make macOS script executable
    try:
        macos_path.chmod(0o755)
    except (NotImplementedError, OSError):
        pass

    # Write Windows script
    windows_path = Path(windows_dir) / 'start-viewer.bat'
    windows_path.write_text(windows_script)

    # Write Linux script
    linux_path = Path(linux_dir) / 'start-viewer.sh'
    linux_path.write_text(linux_script)

    # Make Linux script executable
    try:
        linux_path.chmod(0o755)
    except (NotImplementedError, OSError):
        pass

    return str(macos_path), str(windows_path), str(linux_path)
