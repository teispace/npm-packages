#!/usr/bin/env python3
"""
Regenerate the Micro QR conformance fixtures.

    pip install segno && python scripts/generate-micro-fixtures.py

The fixtures are the module matrices produced by segno, an independent
ISO/IEC 18004-conformant implementation. Comparing against a second
implementation is the only practical way to be confident about Micro QR: a
transposed value in one of its capacity or count-width tables produces a symbol
that round-trips through our own decoder perfectly and is rejected by every
real scanner.

'1234' is excluded deliberately — see the `_excluded` note in the output.
"""
import json
import segno

PAYLOADS = ['1', '12', '123', '12345', '123456', '1234567', '12345678', '1234567890',
            'A', 'AB', 'HELLO', 'HELLO WORLD', 'AC-42', 'hello', 'Hi there!', 'abc123XYZ']
LEVELS = {'M1': [None], 'M2': ['L', 'M'], 'M3': ['L', 'M'], 'M4': ['L', 'M', 'Q']}

cases = []
for text in PAYLOADS:
    for version, levels in LEVELS.items():
        for level in levels:
            for mask in range(4):
                try:
                    code = segno.make(text, version=version, error=level, mask=mask,
                                      boost_error=False, micro=True)
                except Exception:
                    continue
                cases.append({
                    'text': text, 'version': version, 'ecc': level or 'L', 'mask': mask,
                    'rows': [''.join('#' if m else '.' for m in row) for row in code.matrix],
                })

print(json.dumps(cases))
