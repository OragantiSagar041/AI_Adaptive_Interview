import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import psutil
import platform
import sys
import os
import subprocess
import threading
import time

# Determine OS
OS_TYPE = platform.system()

if OS_TYPE == "Windows":
    import wmi

# --- CRITICAL FIX FOR PYINSTALLER --noconsole ---
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")
# ------------------------------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Expanded Security Process Lists (AI, IDEs, Macros, Remote Control)
if OS_TYPE == "Windows":
    CRITICAL_PROCESSES = ['spacedeskConsole.exe', 'AnyDesk.exe', 'TeamViewer.exe', 'ChatGPT.exe', 'Cursor.exe', 'AutoHotkey.exe', 'copilot.exe']
    WARNING_PROCESSES = ['obs64.exe', 'obs32.exe', 'Discord.exe', 'Zoom.exe', 'Teams.exe']
    SPACEDESK_PROC = 'spacedeskService.exe'
else:
    # Mac/Linux process names
    CRITICAL_PROCESSES = ['AnyDesk', 'TeamViewer', 'ChatGPT', 'Cursor', 'AutoHotkey', 'copilot']
    WARNING_PROCESSES = ['obs', 'Discord', 'zoom.us', 'Teams']
    SPACEDESK_PROC = 'spacedeskService'

# Global Security Flags
strict_enforcement_failed = False
vm_detected = False
virtual_media_detected = False

# Windows specific flag to hide console popups for background processes
NO_WINDOW_FLAG = 0x08000000 if OS_TYPE == "Windows" else 0

# 2. Virtual Machine Detection
def check_vm():
    global strict_enforcement_failed, vm_detected
    try:
        vm_keywords = ['vmware', 'virtualbox', 'qemu', 'parallels', 'hyper-v']
        output = ""
        if OS_TYPE == "Windows":
            import pythoncom
            pythoncom.CoInitialize()
            c = wmi.WMI()
            for system in c.Win32_ComputerSystem():
                output += f"{system.Model} {system.Manufacturer} ".lower()
        elif OS_TYPE == "Darwin":
            output = subprocess.check_output(['system_profiler', 'SPHardwareDataType'], timeout=5).decode().lower()
        else:
            try:
                output = subprocess.check_output(['systemd-detect-virt'], timeout=5).decode().lower()
            except:
                if os.path.exists('/sys/class/dmi/id/product_name'):
                    with open('/sys/class/dmi/id/product_name', 'r') as f:
                        output = f.read().lower()
        
        for kw in vm_keywords:
            if kw in output:
                vm_detected = True
                return
    except Exception:
        strict_enforcement_failed = True

# 3. Virtual Camera & Audio Detection
def check_virtual_media():
    global strict_enforcement_failed, virtual_media_detected
    try:
        media_keywords = ['obs virtual camera', 'manycam', 'voicemeeter', 'virtual audio cable', 'blackhole']
        output = ""
        if OS_TYPE == "Windows":
            import pythoncom
            pythoncom.CoInitialize()
            c = wmi.WMI()
            for pnp in c.Win32_PnPEntity():
                if pnp.Caption:
                    output += pnp.Caption.lower() + " "
        elif OS_TYPE == "Darwin":
            output = subprocess.check_output(['system_profiler', 'SPCameraDataType', 'SPAudioDataType'], timeout=8).decode().lower()
        else:
            output = subprocess.check_output(['lsusb'], timeout=5).decode().lower()
            
        for kw in media_keywords:
            if kw in output:
                virtual_media_detected = True
                return
    except Exception:
        strict_enforcement_failed = True

# 4. Clipboard Wiping (Anti-Macro/Pasting)
def wipe_clipboard_loop():
    global strict_enforcement_failed
    while True:
        try:
            if OS_TYPE == "Windows":
                subprocess.run(['clip'], input=b'', check=True, creationflags=NO_WINDOW_FLAG)
            elif OS_TYPE == "Darwin":
                subprocess.run(['pbcopy'], input=b'', check=True)
            else: # Linux
                try:
                    subprocess.run(['xclip', '-selection', 'clipboard'], input=b'', check=True, stderr=subprocess.DEVNULL)
                except:
                    try:
                        subprocess.run(['xsel', '--clipboard', '--input'], input=b'', check=True, stderr=subprocess.DEVNULL)
                    except:
                        try:
                            subprocess.run(['wl-copy'], input=b'', check=True, stderr=subprocess.DEVNULL)
                        except:
                            strict_enforcement_failed = True
        except Exception:
            strict_enforcement_failed = True
        
        time.sleep(2) # Wipe clipboard every 2 seconds continuously

def background_monitor():
    check_vm() # VM only needs to be checked once at startup
    while True:
        check_virtual_media()
        time.sleep(10) # Media checked every 10s to prevent CPU spiking

# Start the continuous background security checks
threading.Thread(target=background_monitor, daemon=True).start()
threading.Thread(target=wipe_clipboard_loop, daemon=True).start()

def get_flagged_processes():
    flagged = []
    for proc in psutil.process_iter(['name']):
        try:
            pname = proc.info['name']
            if not pname:
                continue
            
            if pname in CRITICAL_PROCESSES:
                flagged.append({
                    "name": pname,
                    "category": "Screen Mirroring / Remote Desktop / AI Tool",
                    "severity": "CRITICAL"
                })
            elif pname in WARNING_PROCESSES:
                flagged.append({
                    "name": pname,
                    "category": "Recording / Screen Share",
                    "severity": "WARNING"
                })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return flagged

def check_spacedesk():
    actively_streaming = False
    virtual_display_attached = False
    
    if OS_TYPE != "Windows":
        return actively_streaming, virtual_display_attached

    try:
        for conn in psutil.net_connections(kind='tcp'):
            if conn.status == 'ESTABLISHED' and conn.pid:
                try:
                    proc = psutil.Process(conn.pid)
                    if proc.name() == SPACEDESK_PROC:
                        if conn.raddr and conn.raddr.ip not in ('127.0.0.1', '::1'):
                            actively_streaming = True
                            virtual_display_attached = True
                            break
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
    except psutil.AccessDenied:
        pass

    return actively_streaming, virtual_display_attached

def get_active_monitors():
    if OS_TYPE == "Windows":
        try:
            import pythoncom
            pythoncom.CoInitialize()
            c = wmi.WMI()
            monitors = c.Win32_DesktopMonitor()
            count = len([m for m in monitors if m.Availability == 3 or m.ScreenHeight is not None])
            return count if count > 0 else 1
        except:
            strict_enforcement_failed = True
            return 1
    elif OS_TYPE == "Darwin": # macOS
        try:
            output = subprocess.check_output(['system_profiler', 'SPDisplaysDataType']).decode('utf-8')
            return output.count('Resolution:') or 1
        except:
            strict_enforcement_failed = True
            return 1
    else:
        return 1

@app.get("/status")
def get_status():
    flagged = get_flagged_processes()
    sd_streaming, sd_attached = check_spacedesk()
    monitor_count = get_active_monitors()
    
    # 5. The Strict Enforcement Trigger
    is_critical = (
        len([p for p in flagged if p['severity'] == 'CRITICAL']) > 0 
        or sd_streaming 
        or vm_detected
        or virtual_media_detected
        or strict_enforcement_failed
    )
    
    platforms = list(set([p['name'].replace('.exe', '') for p in flagged]))
    if sd_streaming and 'SpaceDesk' not in platforms:
        platforms.append('SpaceDesk')
        
    if vm_detected:
        platforms.append('Virtual_Machine')
    if virtual_media_detected:
        platforms.append('Virtual_Camera_Audio')
    if strict_enforcement_failed:
        platforms.append('Security_Enforcement_Failure')
        
    return {
        "overall_severity": "CRITICAL" if is_critical else "CLEAN",
        "detected_platforms": platforms,
        "network": { "active_streams": [] },
        "display": { 
            "virtual_displays_active": sd_attached, 
            "active_monitors": monitor_count 
        },
        "spacedesk": { 
            "actively_streaming": sd_streaming, 
            "virtual_display_attached": sd_attached 
        },
        "session": { "is_remote_session": False },
        "processes": { "flagged_processes": flagged }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=28253)
