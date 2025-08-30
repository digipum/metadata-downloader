#!/usr/bin/env python3
"""
Native Messaging host that receives JSON messages with:
  { "type": "tag", "file": "/path/to/file.ext", "xmp": { "XMP-dc:creator": "...", ... } }

It runs `exiftool` to write provided XMP tags into the file.

Native messaging protocol: messages are framed with 4-byte little-endian length followed by UTF-8 JSON.
"""
import sys, json, struct, subprocess, shlex

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    message_length = struct.unpack('<I', raw_length)[0]
    data = sys.stdin.buffer.read(message_length)
    if len(data) != message_length:
        return None
    return json.loads(data.decode('utf-8'))

def send_message(msg):
    data = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()

def exiftool_present():
    try:
        subprocess.run(["exiftool", "-ver"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception:
        return False

def run_exiftool(file_path, xmp):
    # Build args like: exiftool -overwrite_original -XMP-dc:creator="..." ... file
    args = ["exiftool", "-overwrite_original"]
    for k, v in (xmp or {}).items():
        if v is None:
            continue
        s = str(v).strip()
        if s == "":
            continue
        # exiftool expects proper tag names
        args.append(f"-{k}={s}")
    args.append(file_path)
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr

def handle_tag(msg):
    file_path = msg.get('file')
    xmp = msg.get('xmp')
    if not file_path:
        return {"ok": False, "error": "Missing file path"}
    if not exiftool_present():
        return {"ok": False, "error": "exiftool not found in PATH"}
    code, out, err = run_exiftool(file_path, xmp)
    return {"ok": code == 0, "code": code, "stdout": out, "stderr": err}

def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        try:
            t = msg.get('type')
            if t == 'tag':
                resp = handle_tag(msg)
            else:
                resp = {"ok": False, "error": f"Unknown type: {t}"}
        except Exception as e:
            resp = {"ok": False, "error": str(e)}
        send_message(resp)

if __name__ == '__main__':
    main()

