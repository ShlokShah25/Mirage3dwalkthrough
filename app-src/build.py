# Builds the website version of the app into site/public/app.html
import re
import os
d=os.path.dirname(os.path.abspath(__file__))+'/'
ui=open(d+'p1_ui.html').read()
order=['p0_site.js','p2_engine.js','cat.js','cat2.js','plants.js','cat3.js','p2c_world.js','p3a_app.js','p3b_trace.js','p3g_planfix.js','p3i_furnish.js','p3c_gen.js','p3d_consumer.js','p3e_guide.js','p3f_presenter.js','p3h_brief.js','p4_plan.js','p4b_boot.js','p5_site.js']
js='\n'.join(open(d+f).read() for f in order)
sample=open(d+'sample_site.json').read().replace('</','<\\/')
imp='{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/","three/examples/jsm/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/","three-mesh-bvh":"https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.6/src/index.js","three-gpu-pathtracer":"https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/src/index.js"}}'
cut=ui.index('<style>')
head, rest = ui[:cut], ui[cut:]
cut2=rest.index('</style>')+len('</style>')
style, bodyhtml = rest[:cut2], rest[cut2:]
meta='<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="Upload your floor plan and walk through your home, designed and furnished in 3D, before it exists.">\n<meta name="theme-color" content="#0A0B0C">\n'
html='<!doctype html>\n<html lang="en">\n<head>\n'+meta+head+style+'\n</head>\n<body>\n'+bodyhtml+'\n<script type="application/json" id="sample-data">'+sample+'</script>\n<script type="importmap">\n'+imp+'\n</script>\n<script type="module">\n'+js+'\n</script>\n</body>\n</html>\n'
open(d+'../public/app.html','w').write(html)
print('app.html', len(html))
