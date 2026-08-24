#!/usr/bin/env python3
"""
Regenerate the rMQR conformance fixtures.

    pip install rmqrcode && python scripts/generate-rmqr-fixtures.py > __tests__/fixtures/rmqr.json

Fixtures come from `rmqrcode` (MIT), an independent implementation of
ISO/IEC 23941. Two categories are excluded deliberately, both because the
reference is wrong there rather than because we are:

1. Versions whose Reed-Solomon blocks differ in size. rmqrcode's interleaver
   uses `break` where the standard skips an exhausted block and continues, so
   it silently drops data codewords - one of 73 for R13x99-M, four of 76 for
   R17x139-H - and those symbols cannot decode.

2. R17x43-M, where its table lists a 60-codeword block against that version's
   own total of 61. Its H blocks sum to 61, the module count gives
   61*8 + 1 = 489, and 60 - 39 = 21 error correction codewords has no generator
   polynomial in its own table (which is why rmqrcode raises KeyError: 21 on
   that version). We use 61, giving 22.

The layout is shared across all 32 sizes, so the versions that remain still
exercise every width, height and alignment-column arrangement.
"""
import json

from rmqrcode import ErrorCorrectionLevel, rMQR
from rmqrcode.encoder import AlphanumericEncoder, ByteEncoder, NumericEncoder
from rmqrcode.format.rmqr_versions import rMQRVersions

PAYLOADS = ['A', '12345', 'HELLO', 'HELLO WORLD 123', 'hello world', 'SERIAL-4417']
ALNUM = set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:')


def encoder_for(text):
    if text.isdigit():
        return NumericEncoder
    if all(c in ALNUM for c in text):
        return AlphanumericEncoder
    return ByteEncoder


def uniform_blocks(version, level):
    groups = rMQRVersions[version]['blocks'][level]
    sizes = [g['k'] for g in groups for _ in range(g['num'])]
    return len(set(sizes)) == 1


cases = []
for text in PAYLOADS:
    for version in rMQRVersions:
        for name, level in (('M', ErrorCorrectionLevel.M), ('H', ErrorCorrectionLevel.H)):
            if not uniform_blocks(version, level):
                continue
            try:
                code = rMQR(version, level, with_quiet_zone=False)
                code.add_segment(text, encoder_class=encoder_for(text))
                code.make()
                grid = [row[2:-2] for row in code.to_list()[2:-2]]
            except Exception:
                continue
            cases.append({
                'text': text, 'version': version, 'ecc': name,
                'rows': [''.join('#' if m else '.' for m in row) for row in grid],
            })

print(json.dumps({'cases': cases}, indent=None))
