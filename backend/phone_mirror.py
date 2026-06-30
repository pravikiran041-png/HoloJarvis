import subprocess

# Global scrcpy process handle
scrcpy_process = None


def start_mirror() -> dict:
    """Start scrcpy phone mirroring in a separate window."""
    global scrcpy_process

    # Check if already running
    if scrcpy_process is not None and scrcpy_process.poll() is None:
        return {"success": True, "status": "mirror already running"}

    try:
        scrcpy_process = subprocess.Popen([
            "scrcpy",
            "--window-title=JarvisPhoneMirror",
            "--window-width=360",
            "--window-height=780",
            "--always-on-top",
            "--no-audio",
            "--turn-screen-off"
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"success": True, "status": "mirror started"}
    except FileNotFoundError:
        return {"success": False, "error": "scrcpy not found. Install via: brew install scrcpy"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def stop_mirror() -> dict:
    """Stop the scrcpy phone mirroring process."""
    global scrcpy_process

    if scrcpy_process is not None:
        try:
            scrcpy_process.terminate()
            scrcpy_process.wait(timeout=5)
        except Exception:
            try:
                scrcpy_process.kill()
            except Exception:
                pass
        scrcpy_process = None
        return {"success": True, "status": "mirror stopped"}
    return {"success": True, "status": "mirror was not running"}
