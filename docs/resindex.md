# RESOURCE.MAP format

This partial specification matches `src/dgds/resource.mjs`. Multi-volume maps
are described by the format, although Johnny Castaway uses one resource volume.

All integers are little-endian.

## Header (6 bytes)

| Offset | Type | Meaning                    |
| -----: | ---- | -------------------------- |
|      0 | `u8` | unknown                    |
|      1 | `u8` | unknown                    |
|      2 | `u8` | unknown                    |
|      3 | `u8` | unknown                    |
|      4 | `u8` | number of resource volumes |
|      5 | `u8` | unknown                    |

## Resource volume

For each volume:

| Size | Type  | Meaning                           |
| ---: | ----- | --------------------------------- |
|   12 | ASCII | null-terminated resource filename |
|    1 | `u8`  | unknown                           |
|    2 | `u16` | number of entries                 |

The volume header is followed by one 8-byte map record per entry:

| Size | Type  | Meaning                             |
| ---: | ----- | ----------------------------------- |
|    2 | `u16` | uncompressed entry size             |
|    2 | `u16` | unknown                             |
|    4 | `u32` | entry offset in the resource volume |

## Entry in `RESOURCE.001`

At the mapped offset:

|     Size | Type  | Meaning                        |
| -------: | ----- | ------------------------------ |
|       12 | ASCII | null-terminated entry filename |
|        1 | `u8`  | unknown                        |
|        4 | `u32` | compressed payload size        |
| variable | bytes | compressed payload             |

The entry extension selects the ADS, TTM, BMP, SCR, or PAL loader. The payload's
internal block header identifies its compression algorithm.

## History and attribution

- 2018-11-09: initial draft by Alexandre Fontoura (`xesf`)
- 2026-07-18: corrected field widths and aligned the description with the
  current parser

Earlier references include Johnny Castaway tooling by Hans Milling (`nivs1978`)
and the DGDS engine in ScummVM.
