# Builds Forge (the 3D model maker) into public/forge.html and public/forge-worker.js
import os
d = os.path.dirname(os.path.abspath(__file__)) + '/'
read = lambda f: open(d + f).read()


def body(f):
    # a source file without its closing "export { ... }" line, so files can be joined into one script
    s = read(f)
    i = s.rfind('\nexport {')
    return s if i < 0 else s[:i] + '\n'


ui = read('ui.html')
cut = ui.index('<style>')
head, rest = ui[:cut], ui[cut:]
cut2 = rest.index('</style>') + len('</style>')
style, html = rest[:cut2], rest[cut2:]
imp = '{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}'
js = "import * as THREE from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n" + body('export.js') + read('prompts.js') + read('app.js')
meta = ('<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="description" content="Describe a part and its sizes. Forge builds an exact 3D model you can print, and exports STL, 3MF, STEP, OBJ, GLB and more.">\n'
        '<meta name="theme-color" content="#F6F8F9">\n')
page = ('<!doctype html>\n<html lang="en">\n<head>\n' + meta + head + style + '\n</head>\n<body>\n' + html +
        '\n<script type="importmap">\n' + imp + '\n</script>\n<script type="module">\n' + js + '\n</script>\n</body>\n</html>\n')
open(d + '../public/forge.html', 'w').write(page)
worker = body('kernel.js') + read('worker.js')
open(d + '../public/forge-worker.js', 'w').write(worker)
print('forge.html', len(page), 'forge-worker.js', len(worker))
