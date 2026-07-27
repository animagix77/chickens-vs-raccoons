#!/usr/bin/env python3
# assemble the single self-contained file from parts/
import io, os
D = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(D, 'parts')

ORDER = ['02_core.js','02b_quad.js','02c_units.js','03_world.js','07_sky.js',
         '04_sim.js','05_view.js','06_ui.js']

shell = open(os.path.join(P,'01_shell.html'), encoding='utf-8').read()
three = open(os.path.join(D,'three.min.js'), encoding='utf-8').read()

CDN = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
assert CDN in shell, 'cdn tag not found in shell'
shell = shell.replace(CDN, '<script>' + three + '</script>')

assert shell.rstrip().endswith('<script>'), 'shell must end with an opening script tag'

out = io.StringIO()
out.write(shell)
out.write('\n')
for f in ORDER:
    out.write('\n' + open(os.path.join(P,f), encoding='utf-8').read() + '\n')
out.write('\nPOST_READY=true; postResize();\n')
out.write('\n</script>\n</body>\n</html>\n')

dst = os.path.join(D, 'chickens-vs-raccoons.html')
open(dst,'w',encoding='utf-8').write(out.getvalue())
print('wrote', dst, round(os.path.getsize(dst)/1024), 'KB')
