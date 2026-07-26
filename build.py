import re
import os
import base64
from datetime import datetime

SRC_FILE = "主脚本源码.js"
OUT_FILE = "dist/ypx_tool.js"

def bump_version(content):
    pattern = r'(var\s+VERSION\s*=\s*["\'])(\d+\.\d+\.\d+)(["\'])'
    m = re.search(pattern, content)
    if not m:
        raise Exception("源码中未找到 VERSION 标记")
    
    old_ver = m.group(2)
    a, b, c = old_ver.split('.')
    new_ver = f"{a}.{b}.{int(c)+1}"
    
    content = re.sub(pattern, f'{m.group(1)}{new_ver}{m.group(3)}', content, count=1)
    print(f"版本号: {old_ver} -> {new_ver}")
    return content, new_ver

def encrypt(js_code, version):
    lines = []
    for line in js_code.split('\n'):
        s = line.strip()
        if s and not s.startswith('//'):
            lines.append(line)
    minified = '\n'.join(lines)
    
    b64 = base64.b64encode(minified.encode('utf-8')).decode('utf-8')
    
    shell = f'''// YPX Game Tool - Encrypted
// 版本: {version}
// 构建时间: {datetime.now().strftime("%Y-%m-%d %H:%M")}
var _0xb64 = "{b64}";
var _0xbytes = android.util.Base64.decode(_0xb64, android.util.Base64.DEFAULT);
var _0xcode = new java.lang.String(_0xbytes, "UTF-8");
eval(_0xcode);
'''
    return shell

def main():
    with open(SRC_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content, new_ver = bump_version(content)
    
    with open(SRC_FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    
    encrypted = encrypt(content, new_ver)
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(encrypted)
    
    print(f"加密完成: {OUT_FILE}")

if __name__ == "__main__":
    main()
