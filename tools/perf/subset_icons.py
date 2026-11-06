"""Cuts an icon font that works with ligatures (Material Icons: the text "chevron_right" is drawn as
the icon) down to the icons the site uses: the other ligatures are dropped, then the glyphs nothing
reaches any more. The home hero only uses chevron_left and chevron_right: 128 kB -> under 1 kB.
Needs fontTools and brotli (pip install fonttools brotli), only to regenerate the file.
Usage: python3 tools/perf/subset_icons.py <full-font.woff2> <out.woff2> <icon name> …
  e.g. python3 tools/perf/subset_icons.py MaterialIcons-Regular.woff2 \
         assets/fonts/material-icons/material-icons.woff2 chevron_left chevron_right
The full font: https://github.com/google/material-design-icons (font/MaterialIcons-Regular.ttf)."""
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

source, target, *names = sys.argv[1:]
font = TTFont(source)
char_of = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
icons = []
for lookup in font['GSUB'].table.LookupList.Lookup:
    for table in lookup.SubTable:
        table = getattr(table, 'ExtSubTable', table)
        for first, ligatures in list(getattr(table, 'ligatures', {}).items()):
            kept = [ligature for ligature in ligatures
                    if ''.join(char_of.get(glyph, '?') for glyph in [first] + ligature.Component) in names]
            icons += [ligature.LigGlyph for ligature in kept]
            if kept:
                table.ligatures[first] = kept
            else:
                del table.ligatures[first]
if len(icons) != len(names):
    sys.exit(f'{len(icons)} of {len(names)} icons found in {source}')

options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']  # Material Icons puts its ligatures under 'rlig'
options.name_IDs = ['*']
subsetter = subset.Subsetter(options)
subsetter.populate(text=''.join(sorted(set(''.join(names)))), glyphs=icons)
subsetter.subset(font)
font.save(target)
print(target, 'icons:', ', '.join(names))
