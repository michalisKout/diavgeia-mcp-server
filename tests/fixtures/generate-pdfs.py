"""Generate small synthetic, nonpersonal Unicode PDFs (Pillow is needed only to regenerate the raster scan fixtures)."""
from pathlib import Path
import zlib
from PIL import Image, ImageDraw, ImageFont
font_paths=['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
font_path=next(path for path in font_paths if Path(path).exists())
scan=Image.new('L',(1000,100),255)
ImageDraw.Draw(scan).text((10,20),'Συνθετική σαρωμένη σελίδα εκπαιδευτικών.',font=ImageFont.truetype(font_path,28),fill=0)
scan_data=zlib.compress(scan.tobytes())

def pdf(name, pages):
    objects = []
    def add(s):
        objects.append(s if isinstance(s,bytes) else s.encode('ascii'))
        return len(objects)
    def stream(s, attributes=''):
        raw=s if isinstance(s,bytes) else s.encode('ascii')
        return f'<< /Length {len(raw)} {attributes} >>\nstream\n'.encode()+raw+b'\nendstream'
    add('<< /Type /Catalog /Pages 2 0 R >>')
    add('')
    cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Synthetic def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
    add(stream(cmap))
    add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 /FontDescriptor 6 0 R >>')
    add('<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 3 0 R >>')
    add('<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 /FontBBox [-200 -200 1200 1200] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>')
    image_id=add(stream(scan_data,'/Type /XObject /Subtype /Image /Width 1000 /Height 100 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode'))
    page_ids=[]
    for text in pages:
        content = 'BT /F1 10 Tf 40 800 Td 12 TL\n' + '\n'.join(f'<{line.encode("utf-16-be").hex()}> Tj T*' for line in (text or '').split('\n')) + '\nET'
        if text is None:
            content='q 500 0 0 50 40 700 cm /Scan Do Q'
        content_id=add(stream(content))
        page_ids.append(add(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> /XObject << /Scan {image_id} 0 R >> >> /Contents {content_id} 0 R >>'))
    objects[1]=f'<< /Type /Pages /Count {len(page_ids)} /Kids [{" ".join(f"{i} 0 R" for i in page_ids)}] >>'.encode()
    data=b'%PDF-1.4\n'; offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(data)); data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(data)
    data+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()
    data+=b''.join(f'{x:010d} 00000 n \n'.encode() for x in offsets[1:])
    data+=f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    Path(__file__).with_name(name).write_bytes(data)

quote='Οι εκπαιδευτικοί υποβάλλουν αίτηση έως την Παρασκευή.'
filler='Συνθετικό κείμενο δοκιμής χωρίς προσωπικά δεδομένα.'
pdf('multipage-greek.pdf', ['Πρώτη σελίδα συνθετικής απόφασης.', 'Δεύτερη σελίδα συνθετικής απόφασης.', '\n'.join([filler]*26+[quote])])
pdf('mixed-scan.pdf', ['Κείμενο πρώτης σελίδας.', None, quote])
pdf('unreadable.pdf', [None, ''])
