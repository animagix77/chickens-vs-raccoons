#!/usr/bin/env python3
# assemble the single self-contained file from parts/
import io, os
D = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(D, 'parts')

ORDER = ['02_core.js','02b_quad.js','02c_units.js','03_world.js','07_sky.js',
         '04_sim.js','05_view.js','06_ui.js','06b_tale.js']

shell = open(os.path.join(P,'01_shell.html'), encoding='utf-8').read()

# three.min.js sits at the root in a working copy and under src/ in the repo,
# so look in both rather than making a fresh clone fail on its first build.
THREE = next((p for p in (os.path.join(D,'three.min.js'),
                          os.path.join(D,'src','three.min.js')) if os.path.exists(p)), None)
if THREE is None:
    raise SystemExit('three.min.js not found — looked in ./ and ./src/')
three = open(THREE, encoding='utf-8').read()

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
