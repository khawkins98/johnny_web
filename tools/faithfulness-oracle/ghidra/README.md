# Ghidra helpers

Headless Ghidra scripts used to read `SCRANTIC.SCR` (the original Win16 program) during the render-fidelity work (#53, #54). They produce the decompilation and listings that `docs/scrantic-re-findings.md` cites by address.

The scripts contain only addresses and logic. **Their output is derived from the proprietary binary and must never be committed.** It goes to `scratchpad/maintainer/ghidra/` by default (gitignored); see "Maintainer assets" in [../METHODOLOGY.md](../METHODOLOGY.md).

| Script | What it writes |
| --- | --- |
| `ExportDecompiled.java` | C decompilation of every function, one file (`decompiled.c`). |
| `DumpTtmHandlers.java` | The seg-1058 TTM opcode jump tables, a disassembly of the handler region, data-segment initial values for the gating globals, and a byte scan for direct references to them. Ghidra's decompiler does not recover these handlers, so this is how the TTM op semantics were read. |
| `DumpCatalogue.java` | The 79 scene-catalogue records at `1068:1756` as raw bytes plus the two trailing words. |
| `DumpDataVals.java` | A few data-segment initial values and strings. |

## Running

Needs Ghidra (tested with 12.1.2 from Homebrew) and JDK 21, plus the imported game data in `public/data/`.

```sh
# once: create the project, analyse, and export decompiled.c
tools/faithfulness-oracle/ghidra/run-ghidra.sh import

# read-only passes over the analysed project
tools/faithfulness-oracle/ghidra/run-ghidra.sh DumpTtmHandlers.java
tools/faithfulness-oracle/ghidra/run-ghidra.sh DumpCatalogue.java
```

`run-ghidra.sh` lists its environment overrides (`GHIDRA_HEADLESS`, `JAVA_HOME`, `GHIDRA_PROJ`, `GHIDRA_OUT`, `SCRANTIC_SCR`) at the top. The project goes in `scratchpad/ghidra/proj` and the output in `scratchpad/maintainer/ghidra/`. A full import and decompile takes a few minutes; the read-only passes take seconds.
