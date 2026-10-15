"""
Formatting utilities for Directory Indexer.

This module provides utilities for formatting file sizes and mapping file extensions to icons.
"""

from datetime import datetime, timedelta

_EPOCH = datetime(1970, 1, 1)


def format_timestamp(timestamp: float) -> str:
    """Format a Unix timestamp as local time ("YYYY-MM-DD HH:MM:SS").

    Windows can't convert times before 1970 to local time, so those (and any
    other time the platform rejects) are shown in UTC instead of aborting.
    """
    try:
        moment = datetime.fromtimestamp(timestamp)
    except (OSError, OverflowError, ValueError):
        try:
            moment = _EPOCH + timedelta(seconds=timestamp)
        except OverflowError:
            return 'Unknown'
    return moment.strftime('%Y-%m-%d %H:%M:%S')


class SizeFormatter:
    """Handles file size formatting."""

    @staticmethod
    def format_size(size_bytes: int) -> str:
        """Convert bytes to human-readable format.

        Args:
            size_bytes: File size in bytes

        Returns:
            Human-readable string (e.g., "1.50 MB")
        """
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} PB"


class IconMapper:
    """Maps file extensions to emoji icons."""

    # Icon mapping dictionary
    _ICON_MAP = {
        # Documents
        '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.txt': '📝', '.rtf': '📝',
        '.md': '📝', '.odt': '📝',
        # Spreadsheets
        '.xls': '📊', '.xlsx': '📊', '.csv': '📊', '.ods': '📊',
        # Presentations
        '.ppt': '📊', '.pptx': '📊', '.key': '📊', '.odp': '📊',
        # Images
        '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️',
        '.bmp': '🖼️', '.svg': '🖼️', '.webp': '🖼️', '.ico': '🖼️',
        '.heic': '🖼️', '.raw': '🖼️', '.tiff': '🖼️', '.tif': '🖼️',
        # Videos
        '.mp4': '🎬', '.avi': '🎬', '.mov': '🎬', '.mkv': '🎬',
        '.wmv': '🎬', '.flv': '🎬', '.webm': '🎬', '.m4v': '🎬',
        '.mxf': '🎬', '.r3d': '🎬',
        # Audio
        '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.aac': '🎵',
        '.ogg': '🎵', '.m4a': '🎵', '.wma': '🎵',
        # Archives
        '.zip': '📦', '.rar': '📦', '.7z': '📦', '.tar': '📦',
        '.gz': '📦', '.bz2': '📦', '.xz': '📦',
        # Code
        '.py': '💻', '.js': '💻', '.html': '💻', '.css': '💻',
        '.java': '💻', '.cpp': '💻', '.c': '💻', '.h': '💻',
        '.php': '💻', '.rb': '💻', '.go': '💻', '.rs': '💻',
        '.swift': '💻', '.kt': '💻', '.ts': '💻', '.jsx': '💻',
        '.tsx': '💻', '.vue': '💻', '.json': '💻', '.xml': '💻',
        '.yaml': '💻', '.yml': '💻', '.sh': '💻', '.bat': '💻',
        # Executables & Installers
        '.exe': '⚙️', '.app': '⚙️', '.dmg': '⚙️', '.pkg': '⚙️',
        '.deb': '⚙️', '.rpm': '⚙️',
        # Databases
        '.db': '🗄️', '.sqlite': '🗄️', '.sql': '🗄️',
        # Fonts
        '.ttf': '🔤', '.otf': '🔤', '.woff': '🔤', '.woff2': '🔤',
    }

    @staticmethod
    def get_icon(extension: str) -> str:
        """Get icon for file extension.

        Args:
            extension: File extension (e.g., '.txt')

        Returns:
            Emoji icon for the file type
        """
        return IconMapper._ICON_MAP.get(extension.lower(), '📎')
