"""
sync_flow.py

Watch a local JSON file (default: `agent_flow.json`) and automatically
push updates to the backend `/admin/agent-flow` endpoint so Omnidimension
is kept in sync when you edit the local conversation flow.

Usage:
    python sync_flow.py --file agent_flow.json --backend http://localhost:8000

This is a lightweight polling watcher (no extra dependencies).
"""
import argparse
import json
import os
import time
from typing import Any

import requests


def load_flow(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def push_flow(backend_url: str, flow: Any, timeout: int = 10) -> bool:
    url = backend_url.rstrip('/') + '/admin/agent-flow'
    try:
        resp = requests.put(url, json={'flow': flow}, timeout=timeout)
        resp.raise_for_status()
        print(f"[sync_flow] Successfully pushed flow ({len(flow)} sections)")
        return True
    except Exception as e:
        print(f"[sync_flow] Failed to push flow: {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', '-f', default='agent_flow.json', help='Path to local flow JSON file')
    parser.add_argument('--backend', '-b', default='http://localhost:8000', help='Backend base URL')
    parser.add_argument('--interval', '-i', type=float, default=2.0, help='Polling interval seconds')
    args = parser.parse_args()

    path = os.path.abspath(args.file)
    if not os.path.exists(path):
        print(f"Flow file not found: {path}")
        return

    last_mtime = None
    last_flow = None

    print(f"Watching {path} — pushing to {args.backend}/admin/agent-flow")

    try:
        while True:
            try:
                mtime = os.path.getmtime(path)
            except FileNotFoundError:
                print(f"Flow file deleted: {path}")
                time.sleep(args.interval)
                continue

            if last_mtime is None or mtime != last_mtime:
                try:
                    flow = load_flow(path)
                except Exception as e:
                    print(f"[sync_flow] Failed to read flow file: {e}")
                    time.sleep(args.interval)
                    continue

                # naive compare to avoid unnecessary PUTs
                if flow != last_flow:
                    push_flow(args.backend, flow)
                    last_flow = flow
                last_mtime = mtime

            time.sleep(args.interval)
    except KeyboardInterrupt:
        print('\nExiting sync_flow watcher.')


if __name__ == '__main__':
    main()
