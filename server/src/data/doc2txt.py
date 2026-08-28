"""Extract plain text from legacy OLE .doc (Word 97-2003) files.

Reads the FIB from the WordDocument stream to find the piece table in the
table stream, then walks the pieces. This is the documented layout, so it is
far more reliable than scraping printable strings out of the binary.
"""
import sys, struct, olefile

def extract(path):
    ole = olefile.OleFileIO(path)
    doc = ole.openstream('WordDocument').read()

    # FIB: flags at 0x0A tell us which table stream is live.
    flags = struct.unpack_from('<H', doc, 0x0A)[0]
    table_name = '1Table' if (flags & 0x0200) else '0Table'
    if not ole.exists(table_name):
        table_name = '0Table' if table_name == '1Table' else '1Table'
    table = ole.openstream(table_name).read()

    fcMin = struct.unpack_from('<L', doc, 0x18)[0]
    fcClx, lcbClx = struct.unpack_from('<LL', doc, 0x01A2)
    clx = table[fcClx:fcClx + lcbClx]

    # Skip any Prc entries (0x01) to reach the Pcdt (0x02).
    i = 0
    while i < len(clx) and clx[i] == 0x01:
        cb = struct.unpack_from('<h', clx, i + 1)[0]
        i += 3 + cb
    if i >= len(clx) or clx[i] != 0x02:
        raise ValueError('no piece table found')
    lcbPlcfpcd = struct.unpack_from('<L', clx, i + 1)[0]
    plc = clx[i + 5:i + 5 + lcbPlcfpcd]

    n = (len(plc) - 4) // 12          # CPs are 4 bytes, PCDs 8
    cps = [struct.unpack_from('<L', plc, k * 4)[0] for k in range(n + 1)]
    pcd_base = (n + 1) * 4

    out = []
    for k in range(n):
        fc = struct.unpack_from('<L', plc, pcd_base + k * 8 + 2)[0]
        compressed = bool(fc & 0x40000000)
        fc &= 0x3FFFFFFF
        length = cps[k + 1] - cps[k]
        if compressed:
            raw = doc[fc // 2: fc // 2 + length]
            out.append(raw.decode('cp1252', errors='replace'))
        else:
            raw = doc[fc: fc + length * 2]
            out.append(raw.decode('utf-16-le', errors='replace'))
    ole.close()

    text = ''.join(out)
    # Word uses \r for paragraph marks; \x07 ends table cells/rows.
    text = text.replace('\r', '\n').replace('\x07', '\n').replace('\x0b', '\n')
    text = text.replace('\x13', '').replace('\x14', '').replace('\x15', '')
    text = ''.join(ch for ch in text if ch == '\n' or ch == '\t' or ch >= ' ')
    lines = [ln.strip() for ln in text.split('\n')]
    return '\n'.join(ln for ln in lines if ln)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(extract(sys.argv[1]))
