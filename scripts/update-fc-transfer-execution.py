"""Compatibility entry: apply the current user-confirmed monthly transfer status."""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('update-fc-transfer-status.py')), run_name='__main__')
